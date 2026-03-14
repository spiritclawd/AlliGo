/**
 * AlliGo - Auth Middleware
 * requireAuth middleware for protected routes, session token validation, user context injection
 */

import { config } from "../config";
import { getSessionByToken, getUserById, getApiKeyByKey } from "./db";
import { User, SafeUser, toSafeUser, UserApiKey } from "./user";

// ==================== TYPES ====================

export interface AuthContext {
  user: SafeUser;
  session: {
    id: string;
    userId: string;
    createdAt: number;
    expiresAt: number;
  };
  apiKey?: UserApiKey;
}

export interface AuthResult {
  valid: boolean;
  context?: AuthContext;
  error?: string;
  response?: Response;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// ==================== RATE LIMITING ====================

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for a client
 */
export function checkRateLimit(
  clientId: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);
  
  if (!record || record.resetAt < now) {
    // Create new window
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
  
  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetAt - now,
    };
  }
  
  record.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetIn: record.resetAt - now,
  };
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

// ==================== CLIENT IDENTIFICATION ====================

/**
 * Get client ID from request (IP or session-based)
 */
export function getClientId(req: Request): string {
  // Try to get real IP from headers (for proxies)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fallback to connection info
  return "unknown";
}

/**
 * Get user agent from request
 */
export function getUserAgent(req: Request): string | undefined {
  return req.headers.get("user-agent") || undefined;
}

// ==================== AUTH HEADER PARSING ====================

/**
 * Get session token from Authorization header
 */
export function getAuthToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  
  // Also support Token prefix
  if (auth.startsWith("Token ")) {
    return auth.slice(6);
  }
  
  return null;
}

/**
 * Get API key from headers
 */
export function getApiKeyFromHeaders(req: Request): string | null {
  // Check Authorization header first
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    if (token.startsWith("alligo_")) {
      return token;
    }
  }
  
  // Check X-API-Key header
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey?.startsWith("alligo_")) {
    return apiKey;
  }
  
  return null;
}

// ==================== REQUIRE AUTH MIDDLEWARE ====================

/**
 * Require authentication via session token or API key
 * Returns user context if authenticated, error response if not
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  // First check for API key authentication
  const apiKeyString = getApiKeyFromHeaders(req);
  if (apiKeyString) {
    return requireAuthViaApiKey(apiKeyString);
  }
  
  // Then check for session token authentication
  const token = getAuthToken(req);
  if (token) {
    return requireAuthViaSession(token);
  }
  
  return {
    valid: false,
    error: "Authentication required. Provide a valid session token or API key.",
    response: jsonError("Authentication required", 401),
  };
}

/**
 * Authenticate via session token
 */
async function requireAuthViaSession(token: string): Promise<AuthResult> {
  // Get session from database
  const session = getSessionByToken(token);
  if (!session) {
    return {
      valid: false,
      error: "Invalid or expired session",
      response: jsonError("Invalid or expired session", 401),
    };
  }
  
  // Get user
  const user = getUserById(session.userId);
  if (!user) {
    return {
      valid: false,
      error: "User not found",
      response: jsonError("User not found", 401),
    };
  }
  
  return {
    valid: true,
    context: {
      user: toSafeUser(user),
      session: {
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    },
  };
}

/**
 * Authenticate via API key
 */
async function requireAuthViaApiKey(key: string): Promise<AuthResult> {
  // Check if it's the admin API key
  if (key === config.adminApiKey) {
    // Admin has full access
    return {
      valid: true,
      context: {
        user: {
          id: "admin",
          email: "admin@alligo.local",
          name: "Admin",
          tier: "enterprise",
          stripeCustomerId: null,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          emailVerified: true,
        },
        session: {
          id: "admin_session",
          userId: "admin",
          createdAt: Date.now(),
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        },
      },
    };
  }
  
  // Check user API keys
  const apiKey = getApiKeyByKey(key);
  if (!apiKey) {
    return {
      valid: false,
      error: "Invalid API key",
      response: jsonError("Invalid API key", 401),
    };
  }
  
  // Get user
  const user = getUserById(apiKey.userId);
  if (!user) {
    return {
      valid: false,
      error: "User not found",
      response: jsonError("User not found", 401),
    };
  }
  
  return {
    valid: true,
    context: {
      user: toSafeUser(user),
      session: {
        id: `api_key_${apiKey.id}`,
        userId: apiKey.userId,
        createdAt: apiKey.createdAt,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // API keys don't expire
      },
      apiKey,
    },
  };
}

// ==================== OPTIONAL AUTH MIDDLEWARE ====================

/**
 * Optional authentication - returns context if valid, but doesn't require it
 */
export async function optionalAuth(req: Request): Promise<AuthContext | null> {
  const result = await requireAuth(req);
  return result.valid ? result.context! : null;
}

// ==================== RATE LIMIT MIDDLEWARE ====================

/**
 * Rate limit middleware for auth endpoints
 * More restrictive than general rate limits
 */
export function rateLimitAuth(req: Request): Response | null {
  const clientId = getClientId(req);
  const result = checkRateLimit(clientId, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute for auth endpoints
  });
  
  if (!result.allowed) {
    return jsonError(
      `Rate limit exceeded. Try again in ${Math.ceil(result.resetIn / 1000)} seconds.`,
      429,
      {
        "Retry-After": String(Math.ceil(result.resetIn / 1000)),
        "X-RateLimit-Reset": String(result.resetIn),
      }
    );
  }
  
  return null;
}

/**
 * Rate limit middleware for general endpoints
 */
export function rateLimitGeneral(req: Request, maxRequests: number = 100): Response | null {
  const clientId = getClientId(req);
  const result = checkRateLimit(clientId, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests,
  });
  
  if (!result.allowed) {
    return jsonError(
      `Rate limit exceeded. Try again in ${Math.ceil(result.resetIn / 1000)} seconds.`,
      429,
      {
        "Retry-After": String(Math.ceil(result.resetIn / 1000)),
        "X-RateLimit-Reset": String(result.resetIn),
      }
    );
  }
  
  return null;
}

// ==================== PERMISSION CHECKING ====================

/**
 * Check if user has required permission
 */
export function hasPermission(
  context: AuthContext,
  requiredPermission: "read" | "write" | "admin"
): boolean {
  // Admin tier has all permissions
  if (context.user.tier === "enterprise") {
    return true;
  }
  
  // Check API key permissions
  if (context.apiKey) {
    const permLevels = { read: 1, write: 2, admin: 3 };
    return permLevels[context.apiKey.permissions] >= permLevels[requiredPermission];
  }
  
  // Session auth: check tier
  const tierLevels = { free: 1, pro: 2, enterprise: 3 };
  const permissionLevels = { read: 1, write: 2, admin: 3 };
  
  return tierLevels[context.user.tier] >= permissionLevels[requiredPermission];
}

/**
 * Require specific permission
 */
export async function requirePermission(
  req: Request,
  permission: "read" | "write" | "admin"
): Promise<AuthResult> {
  const authResult = await requireAuth(req);
  
  if (!authResult.valid) {
    return authResult;
  }
  
  if (!hasPermission(authResult.context!, permission)) {
    return {
      valid: false,
      error: `Insufficient permissions. Required: ${permission}`,
      response: jsonError(`Insufficient permissions. This action requires ${permission} access.`, 403),
    };
  }
  
  return authResult;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create JSON error response
 */
function jsonError(
  message: string,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}

// ==================== CORS HELPERS ====================

/**
 * CORS headers for auth endpoints
 */
export const AUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

/**
 * Handle CORS preflight for auth endpoints
 */
export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: AUTH_CORS_HEADERS,
  });
}
