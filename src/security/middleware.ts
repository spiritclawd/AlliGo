/**
 * Allimolt - Security Layer
 *
 * Provides rate limiting, input validation, and security utilities
 */

// ==================== RATE LIMITING ====================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export const DEFAULT_RATE_LIMITS = {
  claims: { windowMs: 60000, maxRequests: 10 },      // 10 claims per minute
  score: { windowMs: 60000, maxRequests: 100 },      // 100 score queries per minute
  stats: { windowMs: 60000, maxRequests: 60 },       // 60 stats queries per minute
  global: { windowMs: 60000, maxRequests: 200 },     // 200 global requests per minute
};

/**
 * Check if a client is rate limited
 * Returns { allowed: boolean, remaining: number, resetIn: number }
 */
export function checkRateLimit(
  clientId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.global
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(clientId);

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(clientId, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetIn: entry.resetAt - now,
  };
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// ==================== INPUT VALIDATION ====================

const MAX_STRING_LENGTH = 10000;
const MAX_DESCRIPTION_LENGTH = 50000;
const MAX_AMOUNT = 1e15; // 1 quadrillion USD cap

// Patterns that might indicate injection attacks
const SUSPICIOUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
  /javascript:/gi,                                        // JS protocol
  /on\w+\s*=/gi,                                         // Event handlers
  /\$\{.*\}/g,                                           // Template literals
  /union\s+select/gi,                                    // SQL injection
  /;\s*(drop|delete|truncate|update|insert)/gi,         // SQL commands
];

/**
 * Sanitize a string input
 */
export function sanitizeString(input: string, maxLength = MAX_STRING_LENGTH): string {
  if (typeof input !== "string") {
    return "";
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  return sanitized;
}

/**
 * Check for suspicious patterns in input
 */
export function detectMaliciousInput(input: string): {
  isMalicious: boolean;
  detectedPatterns: string[];
} {
  const detectedPatterns: string[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
    }
  }

  return {
    isMalicious: detectedPatterns.length > 0,
    detectedPatterns,
  };
}

/**
 * Validate and sanitize claim submission
 */
export function validateClaimSubmission(data: any): {
  valid: boolean;
  errors: string[];
  sanitized?: any;
} {
  const errors: string[] = [];

  // Required fields
  if (!data.agentId || typeof data.agentId !== "string") {
    errors.push("agentId is required and must be a string");
  }

  if (!data.claimType) {
    errors.push("claimType is required");
  }

  if (!data.category) {
    errors.push("category is required");
  }

  if (typeof data.amountLost !== "number" || data.amountLost < 0) {
    errors.push("amountLost must be a non-negative number");
  }

  if (data.amountLost > MAX_AMOUNT) {
    errors.push(`amountLost exceeds maximum allowed (${MAX_AMOUNT})`);
  }

  if (!data.title || typeof data.title !== "string") {
    errors.push("title is required and must be a string");
  }

  if (!data.description || typeof data.description !== "string") {
    errors.push("description is required and must be a string");
  }

  // Check for malicious input
  if (data.title || data.description) {
    const titleCheck = detectMaliciousInput(data.title || "");
    const descCheck = detectMaliciousInput(data.description || "");

    if (titleCheck.isMalicious || descCheck.isMalicious) {
      errors.push("Input contains potentially malicious content");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Sanitize valid input
  const sanitized = {
    agentId: sanitizeString(data.agentId),
    agentName: data.agentName ? sanitizeString(data.agentName) : undefined,
    developer: data.developer ? sanitizeString(data.developer) : undefined,
    claimType: data.claimType,
    category: data.category,
    amountLost: Math.min(data.amountLost, MAX_AMOUNT),
    assetType: data.assetType ? sanitizeString(data.assetType) : undefined,
    assetAmount: data.assetAmount,
    chain: data.chain ? sanitizeString(data.chain) : undefined,
    txHash: data.txHash ? sanitizeString(data.txHash) : undefined,
    counterparty: data.counterparty ? sanitizeString(data.counterparty) : undefined,
    title: sanitizeString(data.title),
    description: sanitizeString(data.description, MAX_DESCRIPTION_LENGTH),
    rootCause: data.rootCause ? sanitizeString(data.rootCause) : undefined,
    evidence: data.evidence,
    tags: data.tags,
    platform: data.platform ? sanitizeString(data.platform) : undefined,
    agentVersion: data.agentVersion ? sanitizeString(data.agentVersion) : undefined,
  };

  return { valid: true, errors: [], sanitized };
}

/**
 * Validate agent ID format
 */
export function validateAgentId(agentId: string): boolean {
  // Allow alphanumeric, underscore, hyphen, dot
  // Must be 1-100 characters
  const pattern = /^[a-zA-Z0-9_.\-]{1,100}$/;
  return pattern.test(agentId);
}

/**
 * Validate chain name
 */
export function validateChain(chain: string): boolean {
  const validChains = [
    "ethereum", "bitcoin", "solana", "polygon", "arbitrum",
    "optimism", "base", "avalanche", "bsc", "multi", "other"
  ];
  return validChains.includes(chain.toLowerCase());
}

// ==================== SECURITY HEADERS ====================

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

/**
 * Extract client identifier for rate limiting
 */
export function getClientId(request: Request): string {
  // Try various sources of client identification
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a hash of available headers
  const userAgent = request.headers.get("user-agent") || "unknown";
  const acceptLang = request.headers.get("accept-language") || "unknown";
  return `${userAgent.slice(0, 20)}-${acceptLang.slice(0, 10)}`;
}

// ==================== AUDIT LOGGING ====================

interface AuditLogEntry {
  timestamp: number;
  action: string;
  clientId: string;
  ip?: string;
  userAgent?: string;
  path: string;
  method: string;
  success: boolean;
  error?: string;
}

const auditLogs: AuditLogEntry[] = [];
const MAX_AUDIT_LOGS = 10000;

export function logAudit(entry: Omit<AuditLogEntry, "timestamp">): void {
  auditLogs.push({
    ...entry,
    timestamp: Date.now(),
  });

  // Keep logs bounded
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.shift();
  }
}

export function getRecentAuditLogs(count = 100): AuditLogEntry[] {
  return auditLogs.slice(-count);
}
