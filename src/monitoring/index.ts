/**
 * AlliGo - Production Monitoring & Hardening
 * 
 * Provides:
 * - Audit log rotation (daily files, max 10MB, compress older)
 * - Error monitoring (capture unhandled exceptions)
 * - Alerting stubs (console.warn for high error rate, cache miss spike)
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, createReadStream, createWriteStream } from "fs";
import { join } from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream";

// ==================== CONFIGURATION ====================

const LOGS_DIR = join(process.cwd(), "logs");
const AUDIT_DIR = join(LOGS_DIR, "audit");
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 30; // Keep 30 days

// Error tracking for alerting
const errorWindow: { timestamp: number; error: string }[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_THRESHOLD = 0.05; // 5% error rate

// Cache miss tracking
const cacheMissWindow: { timestamp: number }[] = [];
const CACHE_MISS_THRESHOLD = 0.5; // 50% miss rate

// ==================== AUDIT LOG ROTATION ====================

interface AuditEntry {
  timestamp: number;
  method: string;
  path: string;
  client_ip_hash: string;
  api_key_hash: string;
  input_size: number;
  response_code: number;
  duration_ms: number;
  error?: string;
}

let currentAuditFile: string | null = null;
let currentAuditSize = 0;

/**
 * Initialize audit logging system
 */
export function initAuditLogging(): void {
  // Ensure directories exist
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }
  
  // Set up daily rotation check
  rotateAuditFile();
  
  // Clean up old files
  cleanupOldAuditFiles();
  
  console.log("📝 Audit logging initialized");
}

/**
 * Get current audit file path
 */
function getAuditFilePath(): string {
  const date = new Date().toISOString().split("T")[0];
  return join(AUDIT_DIR, `audit_${date}.jsonl`);
}

/**
 * Rotate audit file if needed (daily)
 */
function rotateAuditFile(): void {
  const newFile = getAuditFilePath();
  
  if (currentAuditFile !== newFile) {
    // Compress previous file if it exists and is large
    if (currentAuditFile && existsSync(currentAuditFile)) {
      const stats = statSync(currentAuditFile);
      if (stats.size > 1024 * 1024) { // Compress if > 1MB
        compressFile(currentAuditFile);
      }
    }
    
    currentAuditFile = newFile;
    currentAuditSize = existsSync(newFile) ? statSync(newFile).size : 0;
  }
}

/**
 * Compress a log file
 */
function compressFile(filePath: string): void {
  const gzipPath = `${filePath}.gz`;
  
  try {
    pipeline(
      createReadStream(filePath),
      createGzip(),
      createWriteStream(gzipPath),
      (err) => {
        if (err) {
          console.error(`Failed to compress ${filePath}:`, err);
        } else {
          // Remove original after successful compression
          unlinkSync(filePath);
          console.log(`📦 Compressed audit log: ${filePath}`);
        }
      }
    );
  } catch (e) {
    console.error(`Error compressing ${filePath}:`, e);
  }
}

/**
 * Clean up audit files older than MAX_LOG_FILES days
 */
function cleanupOldAuditFiles(): void {
  try {
    const files = readdirSync(AUDIT_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_FILES * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = join(AUDIT_DIR, file);
      const stats = statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        unlinkSync(filePath);
        console.log(`🗑️ Deleted old audit log: ${file}`);
      }
    }
  } catch (e) {
    console.error("Error cleaning up audit files:", e);
  }
}

/**
 * Write audit entry
 */
export function logAuditEntry(entry: AuditEntry): void {
  rotateAuditFile();
  
  // Check if we need to rotate due to size
  if (currentAuditSize > MAX_LOG_SIZE && currentAuditFile) {
    compressFile(currentAuditFile);
    currentAuditFile = getAuditFilePath();
    currentAuditSize = 0;
  }
  
  const line = JSON.stringify(entry) + "\n";
  
  try {
    writeFileSync(currentAuditFile, line, { flag: "a" });
    currentAuditSize += Buffer.byteLength(line);
  } catch (e) {
    console.error("Failed to write audit entry:", e);
  }
}

// ==================== ERROR MONITORING ====================

interface ErrorContext {
  timestamp: number;
  error: Error;
  context?: Record<string, any>;
  stackTrace?: string;
}

const recentErrors: ErrorContext[] = [];
const MAX_ERROR_CONTEXTS = 100;

/**
 * Capture and log unhandled exception
 */
export function captureError(error: Error, context?: Record<string, any>): void {
  const errorContext: ErrorContext = {
    timestamp: Date.now(),
    error,
    context,
    stackTrace: error.stack,
  };
  
  // Add to recent errors
  recentErrors.push(errorContext);
  if (recentErrors.length > MAX_ERROR_CONTEXTS) {
    recentErrors.shift();
  }
  
  // Log to console with full context
  console.error("🚨 CAPTURED ERROR:", {
    message: error.message,
    name: error.name,
    stack: error.stack?.split("\n").slice(0, 5).join("\n"),
    context,
    timestamp: new Date().toISOString(),
  });
  
  // Write to error log
  const errorLogPath = join(LOGS_DIR, "errors.jsonl");
  const logEntry = JSON.stringify({
    timestamp: errorContext.timestamp,
    message: error.message,
    name: error.name,
    stack: error.stack,
    context,
  }) + "\n";
  
  try {
    writeFileSync(errorLogPath, logEntry, { flag: "a" });
  } catch (e) {
    console.error("Failed to write to error log:", e);
  }
  
  // Track for alerting
  errorWindow.push({ timestamp: Date.now(), error: error.message });
  checkErrorRateAlert();
}

/**
 * Check if error rate exceeds threshold and alert
 */
function checkErrorRateAlert(): void {
  const now = Date.now();
  
  // Clean up old errors from window
  while (errorWindow.length > 0 && now - errorWindow[0].timestamp > ERROR_WINDOW_MS) {
    errorWindow.shift();
  }
  
  // Check threshold
  if (errorWindow.length >= 5) { // At least 5 errors in window
    const errorRate = errorWindow.length / 100; // Assume 100 requests baseline
    if (errorRate > ERROR_THRESHOLD) {
      console.warn(`⚠️ HIGH ERROR RATE ALERT: ${errorWindow.length} errors in last 5 minutes (${(errorRate * 100).toFixed(1)}% estimated rate)`);
    }
  }
}

/**
 * Track cache miss for alerting
 */
export function trackCacheMiss(): void {
  const now = Date.now();
  cacheMissWindow.push({ timestamp: now });
  
  // Clean up old entries
  while (cacheMissWindow.length > 0 && now - cacheMissWindow[0].timestamp > ERROR_WINDOW_MS) {
    cacheMissWindow.shift();
  }
  
  // Check threshold
  if (cacheMissWindow.length >= 50) { // At least 50 misses in window
    const missRate = cacheMissWindow.length / 100; // Assume 100 requests
    if (missRate > CACHE_MISS_THRESHOLD) {
      console.warn(`⚠️ CACHE MISS SPIKE ALERT: ${cacheMissWindow.length} cache misses in last 5 minutes (${(missRate * 100).toFixed(1)}% estimated miss rate)`);
    }
  }
}

// ==================== UNHANDLED EXCEPTION HANDLER ====================

/**
 * Set up global error handlers
 */
export function setupErrorHandlers(): void {
  process.on("uncaughtException", (error) => {
    captureError(error, { type: "uncaughtException" });
  });
  
  process.on("unhandledRejection", (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureError(error, { type: "unhandledRejection" });
  });
  
  console.log("🛡️ Error handlers initialized");
}

// ==================== EXPORTS ====================

export function getRecentErrors(count = 10): ErrorContext[] {
  return recentErrors.slice(-count);
}

export function getErrorStats(): { total: number; last5min: number } {
  const now = Date.now();
  const last5min = errorWindow.filter(e => now - e.timestamp < ERROR_WINDOW_MS).length;
  return { total: recentErrors.length, last5min };
}

export function getCacheMissStats(): { last5min: number } {
  const now = Date.now();
  const last5min = cacheMissWindow.filter(e => now - e.timestamp < ERROR_WINDOW_MS).length;
  return { last5min };
}

export default {
  initAuditLogging,
  logAuditEntry,
  captureError,
  setupErrorHandlers,
  trackCacheMiss,
  getRecentErrors,
  getErrorStats,
  getCacheMissStats,
};
