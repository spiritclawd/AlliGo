/**
 * Allimolt - API Key & Subscription Management
 * 
 * API Key authentication with tiered access
 */

import { Database } from "bun:sqlite";

// Initialize API database
const apiDb = new Database(":memory:", { create: true });

// Create tables
apiDb.run(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    tier TEXT DEFAULT 'free',
    requests_per_day INTEGER DEFAULT 100,
    requests_used INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER,
    active INTEGER DEFAULT 1
  )
`);

apiDb.run(`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    ip_address TEXT,
    user_agent TEXT
  )
`);

// Subscription tiers
export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    requestsPerDay: 100,
    features: ["Basic risk scores", "Public claims", "Rate limited"],
  },
  developer: {
    name: "Developer",
    price: 49,
    requestsPerDay: 10000,
    features: ["Full API access", "Webhooks", "Priority support", "Historical data"],
  },
  platform: {
    name: "Platform",
    price: 499,
    requestsPerDay: 100000,
    features: ["All Developer features", "Real-time alerts", "Custom integrations", "SLA"],
  },
  enterprise: {
    name: "Enterprise",
    price: null, // Custom pricing
    requestsPerDay: -1, // Unlimited
    features: ["All Platform features", "On-premise option", "Dedicated support", "Custom SLA"],
  },
} as const;

export type TierName = keyof typeof TIERS;

// Generate API key
export function generateApiKey(): string {
  const prefix = "alm"; // Allimolt prefix
  const random = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${random}`;
}

// Hash API key for storage
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create new API key
export async function createApiKey(
  name: string,
  email: string | null,
  tier: TierName = "free"
): Promise<{ key: string; id: string }> {
  const id = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const key = generateApiKey();
  const keyHash = await hashKey(key);
  const tierConfig = TIERS[tier];

  apiDb.run(`
    INSERT INTO api_keys (id, key_hash, name, email, tier, requests_per_day)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, keyHash, name, email, tier, tierConfig.requestsPerDay]);

  return { key, id };
}

// Validate API key and check rate limits
export async function validateApiKey(
  key: string
): Promise<{ valid: boolean; tier: TierName; remaining: number; reason?: string }> {
  const keyHash = await hashKey(key);
  
  const row = apiDb.query(`
    SELECT id, tier, requests_per_day, requests_used, active
    FROM api_keys
    WHERE key_hash = ?
  `).get(keyHash) as any;

  if (!row) {
    return { valid: false, tier: "free", remaining: 0, reason: "Invalid API key" };
  }

  if (!row.active) {
    return { valid: false, tier: row.tier, remaining: 0, reason: "API key revoked" };
  }

  const tierConfig = TIERS[row.tier as TierName];
  
  // Unlimited requests for enterprise
  if (tierConfig.requestsPerDay === -1) {
    return { valid: true, tier: row.tier, remaining: -1 };
  }

  const remaining = tierConfig.requestsPerDay - row.requests_used;
  
  if (remaining <= 0) {
    return { 
      valid: false, 
      tier: row.tier, 
      remaining: 0, 
      reason: "Rate limit exceeded. Upgrade your plan at allimolt.io/pricing" 
    };
  }

  // Increment usage
  apiDb.run(`UPDATE api_keys SET requests_used = requests_used + 1 WHERE id = ?`, [row.id]);

  return { valid: true, tier: row.tier, remaining: remaining - 1 };
}

// Reset daily usage (call from cron)
export function resetDailyUsage(): void {
  apiDb.run(`UPDATE api_keys SET requests_used = 0`);
}

// Get API key info
export function getApiKeyInfo(keyId: string): any {
  return apiDb.query(`SELECT id, name, email, tier, requests_per_day, requests_used, created_at FROM api_keys WHERE id = ?`).get(keyId);
}

// List all API keys (admin)
export function listApiKeys(): any[] {
  return apiDb.query(`SELECT id, name, email, tier, requests_per_day, requests_used, active, created_at FROM api_keys`).all();
}

// Revoke API key
export function revokeApiKey(keyId: string): boolean {
  const result = apiDb.run(`UPDATE api_keys SET active = 0 WHERE id = ?`, [keyId]);
  return result.changes > 0;
}

// Log API usage
export function logUsage(keyId: string, endpoint: string, ip: string | null, userAgent: string | null): void {
  apiDb.run(`
    INSERT INTO usage_logs (key_id, endpoint, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `, [keyId, endpoint, ip, userAgent]);
}

// Get usage statistics
export function getUsageStats(keyId: string): { total: number; endpoints: Record<string, number> } {
  const logs = apiDb.query(`SELECT endpoint FROM usage_logs WHERE key_id = ?`).all(keyId) as any[];
  
  const endpoints: Record<string, number> = {};
  for (const log of logs) {
    endpoints[log.endpoint] = (endpoints[log.endpoint] || 0) + 1;
  }

  return { total: logs.length, endpoints };
}

// Seed demo API keys
async function seedDemoKeys() {
  await createApiKey("Demo Key", "demo@allimolt.io", "free");
  await createApiKey("Developer Demo", "dev@example.com", "developer");
  console.log("Seeded demo API keys");
}

seedDemoKeys();

export { apiDb };
