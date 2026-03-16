/**
 * AlliGo - Redis-Based Per-Key Rate Limiting
 * 
 * Enforces rate limits per API key using Redis for distributed tracking.
 * Falls back to in-memory tracking if Redis is unavailable.
 */

import { getCached, setCached } from "../cache/redis";

// Rate limit configuration per tier
export const RATE_LIMITS = {
  free: { requests: 100, windowMs: 60000 },       // 100 req/min
  pro: { requests: 1000, windowMs: 60000 },       // 1000 req/min
  enterprise: { requests: 10000, windowMs: 60000 }, // 10000 req/min
  admin: { requests: 100000, windowMs: 60000 },   // Unlimited for admin
};

// Fallback in-memory store when Redis unavailable
const memoryStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
}

/**
 * Check rate limit for an API key
 * Uses Redis if available, falls back to in-memory
 */
export async function checkPerKeyRateLimit(
  apiKeyHash: string,
  tier: keyof typeof RATE_LIMITS = "free"
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[tier] || RATE_LIMITS.free;
  const key = `ratelimit:${apiKeyHash}`;
  const now = Date.now();
  
  // Try Redis first
  try {
    const cached = await getCached<{ count: number; resetAt: number }>(key);
    
    if (cached && now < cached.resetAt) {
      // Window still active
      if (cached.count >= config.requests) {
        return {
          allowed: false,
          remaining: 0,
          resetIn: cached.resetAt - now,
          limit: config.requests,
        };
      }
      
      // Increment count
      await setCached(key, { count: cached.count + 1, resetAt: cached.resetAt }, Math.ceil((cached.resetAt - now) / 1000));
      
      return {
        allowed: true,
        remaining: config.requests - cached.count - 1,
        resetIn: cached.resetAt - now,
        limit: config.requests,
      };
    }
    
    // New window
    const resetAt = now + config.windowMs;
    await setCached(key, { count: 1, resetAt }, Math.ceil(config.windowMs / 1000));
    
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetIn: config.windowMs,
      limit: config.requests,
    };
  } catch (e) {
    // Fallback to in-memory
    return checkInMemoryRateLimit(apiKeyHash, tier);
  }
}

/**
 * In-memory rate limit fallback
 */
function checkInMemoryRateLimit(
  apiKeyHash: string,
  tier: keyof typeof RATE_LIMITS = "free"
): RateLimitResult {
  const config = RATE_LIMITS[tier] || RATE_LIMITS.free;
  const now = Date.now();
  const entry = memoryStore.get(apiKeyHash);
  
  // Cleanup old entries periodically (1% chance)
  if (Math.random() < 0.01) {
    for (const [k, v] of memoryStore.entries()) {
      if (now > v.resetAt) {
        memoryStore.delete(k);
      }
    }
  }
  
  if (!entry || now > entry.resetAt) {
    // New window
    memoryStore.set(apiKeyHash, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetIn: config.windowMs,
      limit: config.requests,
    };
  }
  
  if (entry.count >= config.requests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetAt - now,
      limit: config.requests,
    };
  }
  
  // Increment
  entry.count++;
  
  return {
    allowed: true,
    remaining: config.requests - entry.count,
    resetIn: entry.resetAt - now,
    limit: config.requests,
  };
}

/**
 * Get current rate limit usage for an API key
 */
export async function getRateLimitUsage(
  apiKeyHash: string,
  tier: keyof typeof RATE_LIMITS = "free"
): Promise<{ used: number; limit: number; resetIn: number }> {
  const config = RATE_LIMITS[tier] || RATE_LIMITS.free;
  const key = `ratelimit:${apiKeyHash}`;
  const now = Date.now();
  
  try {
    const cached = await getCached<{ count: number; resetAt: number }>(key);
    
    if (cached && now < cached.resetAt) {
      return {
        used: cached.count,
        limit: config.requests,
        resetIn: cached.resetAt - now,
      };
    }
    
    return {
      used: 0,
      limit: config.requests,
      resetIn: 0,
    };
  } catch (e) {
    const entry = memoryStore.get(apiKeyHash);
    
    if (entry && now < entry.resetAt) {
      return {
        used: entry.count,
        limit: config.requests,
        resetIn: entry.resetAt - now,
      };
    }
    
    return {
      used: 0,
      limit: config.requests,
      resetIn: 0,
    };
  }
}

export default {
  checkPerKeyRateLimit,
  getRateLimitUsage,
  RATE_LIMITS,
};
