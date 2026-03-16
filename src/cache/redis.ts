/**
 * AlliGo - Redis Cache Layer
 * Caches forensics results for quick lookups
 * Falls back gracefully if Redis is unavailable
 */

import Redis from "ioredis";

// Cache configuration
const REDIS_URL = process.env.REDIS_URL;
const CACHE_TTL = 300; // 5 minutes in seconds
const CACHE_PREFIX = "alligo:";

// Singleton Redis connection
let redis: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection
 * Returns true if connected, false if unavailable
 */
export async function initRedis(): Promise<boolean> {
  if (!REDIS_URL) {
    console.log("[Cache] REDIS_URL not configured - caching disabled");
    return false;
  }
  
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryDelayOnFailover: 1000,
      lazyConnect: true,
    });
    
    // Test connection
    await redis.ping();
    redisAvailable = true;
    console.log("[Cache] ✅ Redis connected successfully");
    
    // Handle connection events
    redis.on("error", (err) => {
      console.error("[Cache] Redis error:", err.message);
      redisAvailable = false;
    });
    
    redis.on("connect", () => {
      console.log("[Cache] Redis reconnected");
      redisAvailable = true;
    });
    
    return true;
  } catch (error: any) {
    console.warn("[Cache] ⚠️ Redis connection failed - caching disabled:", error.message);
    redisAvailable = false;
    return false;
  }
}

/**
 * Get cached result
 * Returns null if cache miss or Redis unavailable
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redisAvailable || !redis) {
    return null;
  }
  
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const cached = await redis.get(fullKey);
    
    if (cached) {
      console.log(`[Cache] HIT: ${key}`);
      return JSON.parse(cached) as T;
    }
    
    console.log(`[Cache] MISS: ${key}`);
    return null;
  } catch (error: any) {
    console.error(`[Cache] Get error for ${key}:`, error.message);
    return null;
  }
}

/**
 * Set cached result
 * Silently fails if Redis unavailable
 */
export async function setCached<T>(key: string, value: T, ttl: number = CACHE_TTL): Promise<boolean> {
  if (!redisAvailable || !redis) {
    return false;
  }
  
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    await redis.setex(fullKey, ttl, JSON.stringify(value));
    console.log(`[Cache] SET: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error: any) {
    console.error(`[Cache] Set error for ${key}:`, error.message);
    return false;
  }
}

/**
 * Delete cached result
 */
export async function deleteCached(key: string): Promise<boolean> {
  if (!redisAvailable || !redis) {
    return false;
  }
  
  try {
    const fullKey = `${CACHE_PREFIX}${key}`;
    await redis.del(fullKey);
    console.log(`[Cache] DELETE: ${key}`);
    return true;
  } catch (error: any) {
    console.error(`[Cache] Delete error for ${key}:`, error.message);
    return false;
  }
}

/**
 * Delete all cached results matching pattern
 */
export async function deletePattern(pattern: string): Promise<number> {
  if (!redisAvailable || !redis) {
    return 0;
  }
  
  try {
    const fullPattern = `${CACHE_PREFIX}${pattern}`;
    const keys = await redis.keys(fullPattern);
    
    if (keys.length === 0) {
      return 0;
    }
    
    await redis.del(...keys);
    console.log(`[Cache] DELETE PATTERN: ${pattern} (${keys.length} keys)`);
    return keys.length;
  } catch (error: any) {
    console.error(`[Cache] Delete pattern error for ${pattern}:`, error.message);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  available: boolean;
  connected: boolean;
  keyCount: number;
  memoryUsage?: string;
  hitRate?: number;
  missRate?: number;
  hits?: number;
  misses?: number;
}> {
  if (!redis) {
    return { available: false, connected: false, keyCount: 0 };
  }
  
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    const info = await redis.info("memory");
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    
    // Get hit/miss stats from Redis INFO
    const statsInfo = await redis.info("stats");
    const hitsMatch = statsInfo.match(/keyspace_hits:(\d+)/);
    const missesMatch = statsInfo.match(/keyspace_misses:(\d+)/);
    
    const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
    const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;
    const missRate = total > 0 ? misses / total : 0;
    
    return {
      available: redisAvailable,
      connected: redis?.status === "ready",
      keyCount: keys.length,
      memoryUsage: memoryMatch?.[1],
      hitRate: Math.round(hitRate * 1000) / 1000,
      missRate: Math.round(missRate * 1000) / 1000,
      hits,
      misses,
    };
  } catch (error: any) {
    return { 
      available: false, 
      connected: false, 
      keyCount: 0,
    };
  }
}

/**
 * Cache wrapper for async functions
 * Automatically caches results and returns cached on subsequent calls
 */
export function withCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyGenerator: (...args: Parameters<T>) => string,
  ttl: number = CACHE_TTL
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args);
    
    // Try cache first
    const cached = await getCached<ReturnType<T>>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function
    const result = await fn(...args);
    
    // Cache result (non-blocking)
    setCached(key, result, ttl).catch(() => {});
    
    return result;
  }) as T;
}

// Export status check
export function isCacheAvailable(): boolean {
  return redisAvailable;
}

// Graceful shutdown
export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    console.log("[Cache] Redis connection closed");
  }
}

export default {
  initRedis,
  getCached,
  setCached,
  deleteCached,
  deletePattern,
  getCacheStats,
  withCache,
  isCacheAvailable,
  closeCache,
};
