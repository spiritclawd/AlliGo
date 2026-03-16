/**
 * AlliGo - Request Middleware
 * Security, audit logging, and rate limiting
 */

import { z } from "zod";

// ==================== PAYLOAD SIZE LIMITS ====================

export const PAYLOAD_LIMITS = {
  default: 1024 * 1024,      // 1MB default
  agentic_data: 10 * 1024 * 1024, // 10MB for agentic data (includes traces)
  claim_submission: 100 * 1024,   // 100KB for claims
  report_request: 50 * 1024,       // 50KB for report requests
};

/**
 * Check content-length header for payload size
 */
export function checkPayloadSize(
  contentLength: string | null,
  limit: number = PAYLOAD_LIMITS.default
): { valid: boolean; error?: string } {
  if (!contentLength) {
    return { valid: true }; // Will be checked after body is read
  }
  
  const length = parseInt(contentLength, 10);
  
  if (isNaN(length)) {
    return { valid: false, error: "Invalid Content-Length header" };
  }
  
  if (length > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(1);
    const actualMB = (length / 1024 / 1024).toFixed(1);
    return { 
      valid: false, 
      error: `Payload too large: ${actualMB}MB exceeds ${limitMB}MB limit` 
    };
  }
  
  return { valid: true };
}

/**
 * Check actual body size (for requests without Content-Length)
 */
export function checkBodySize(
  body: string,
  limit: number = PAYLOAD_LIMITS.default
): { valid: boolean; error?: string } {
  const size = Buffer.byteLength(body, "utf8");
  
  if (size > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(1);
    const actualMB = (size / 1024 / 1024).toFixed(1);
    return { 
      valid: false, 
      error: `Payload too large: ${actualMB}MB exceeds ${limitMB}MB limit` 
    };
  }
  
  return { valid: true };
}

// ==================== AUDIT LOGGING ====================

export interface AuditLogEntry {
  timestamp: number;
  method: string;
  path: string;
  query: Record<string, string>;
  client_ip: string;
  client_ip_hash: string;
  api_key_hash: string;
  user_agent: string;
  input_size: number;
  response_code: number;
  response_time_ms: number;
  error?: string;
}

// Simple hash function for logging (not cryptographic)
function hashForLog(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Create audit log entry from request/response
 */
export function createAuditEntry(
  req: Request,
  statusCode: number,
  responseTime: number,
  bodySize: number,
  apiKey?: string
): AuditLogEntry {
  const url = new URL(req.url);
  
  // Get client IP (check various headers for proxied requests)
  const clientIp = 
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  
  return {
    timestamp: Date.now(),
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    client_ip: clientIp,
    client_ip_hash: hashForLog(clientIp),
    api_key_hash: apiKey ? hashForLog(apiKey) : "none",
    user_agent: req.headers.get("user-agent") || "unknown",
    input_size: bodySize,
    response_code: statusCode,
    response_time_ms: responseTime,
  };
}

/**
 * Log audit entry to console (JSON format for log aggregation)
 */
export function logAudit(entry: AuditLogEntry): void {
  // Only log in production or when explicitly enabled
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_AUDIT_LOG === "true") {
    console.log(JSON.stringify({
      type: "AUDIT",
      ...entry
    }));
  }
}

// ==================== REQUEST SIZE TRACKER ====================

const requestSizes = new Map<string, { startTime: number; size: number }>();

/**
 * Track request start time and size
 */
export function trackRequestStart(requestId: string, size: number = 0): void {
  requestSizes.set(requestId, { startTime: Date.now(), size });
}

/**
 * Track request end and get duration
 */
export function trackRequestEnd(requestId: string): { duration: number; size: number } | null {
  const tracked = requestSizes.get(requestId);
  if (!tracked) return null;
  
  requestSizes.delete(requestId);
  return {
    duration: Date.now() - tracked.startTime,
    size: tracked.size,
  };
}

// ==================== ERROR RESPONSE HELPERS ====================

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string[];
  code?: string;
}

export function createErrorResponse(
  message: string, 
  details?: string[],
  code?: string
): ErrorResponse {
  return {
    success: false,
    error: message,
    ...(details && { details }),
    ...(code && { code }),
  };
}

export function validationErrorResponse(errors: string[]): ErrorResponse {
  return createErrorResponse("Validation failed", errors, "VALIDATION_ERROR");
}

export function payloadTooLargeResponse(actual: number, limit: number): ErrorResponse {
  const actualMB = (actual / 1024 / 1024).toFixed(1);
  const limitMB = (limit / 1024 / 1024).toFixed(1);
  return createErrorResponse(
    `Payload too large: ${actualMB}MB exceeds ${limitMB}MB limit`,
    undefined,
    "PAYLOAD_TOO_LARGE"
  );
}

export function rateLimitResponse(resetIn: number): ErrorResponse {
  return createErrorResponse(
    "Rate limit exceeded",
    [`Reset in ${Math.ceil(resetIn / 1000)} seconds`],
    "RATE_LIMIT_EXCEEDED"
  );
}

// ==================== SECURITY HEADERS ====================

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
};
