/**
 * AlliGo - Auth Database Layer
 * SQLite tables for users, sessions, and API keys
 */

import { Database } from "bun:sqlite";
import { config, ensureDatabaseDir } from "../config";
import {
  User,
  Session,
  UserApiKey,
  SafeUser,
  toSafeUser,
  generateUserId,
  generateSessionId,
  generateApiKeyId,
  generateSessionToken,
} from "./user";

// Ensure database directory exists
ensureDatabaseDir();

// Use the same database connection as the main app
// We'll import from api/db.ts to share the connection
import { db } from "../api/db";

// ==================== TABLE CREATION ====================

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at INTEGER NOT NULL,
    last_login INTEGER,
    email_verified INTEGER DEFAULT 0
  )
`);

// Create sessions table
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create user_api_keys table (links users to their API keys)
db.run(`
  CREATE TABLE IF NOT EXISTS user_api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT 'read',
    created_at INTEGER NOT NULL,
    last_used INTEGER,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_user_api_keys_key ON user_api_keys(key)`);

// ==================== USER CRUD ====================

/**
 * Create a new user
 */
export function createUser(
  email: string,
  passwordHash: string,
  name?: string,
  tier: User["tier"] = "free"
): User {
  const id = generateUserId();
  const now = Date.now();
  
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, tier, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, email.toLowerCase(), passwordHash, name || null, tier, now);
  
  return {
    id,
    email: email.toLowerCase(),
    passwordHash,
    name: name || null,
    tier,
    stripeCustomerId: null,
    createdAt: now,
    lastLogin: null,
    emailVerified: false,
  };
}

/**
 * Get user by ID
 */
export function getUserById(id: string): User | null {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  const row = stmt.get(id) as any;
  return row ? rowToUser(row) : null;
}

/**
 * Get user by email
 */
export function getUserByEmail(email: string): User | null {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  const row = stmt.get(email.toLowerCase()) as any;
  return row ? rowToUser(row) : null;
}

/**
 * Get user by Stripe customer ID
 */
export function getUserByStripeCustomerId(stripeCustomerId: string): User | null {
  const stmt = db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?");
  const row = stmt.get(stripeCustomerId) as any;
  return row ? rowToUser(row) : null;
}

/**
 * Update user
 */
export function updateUser(id: string, updates: Partial<Omit<User, "id" | "createdAt">>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email.toLowerCase());
  }
  if (updates.passwordHash !== undefined) {
    fields.push("password_hash = ?");
    values.push(updates.passwordHash);
  }
  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.tier !== undefined) {
    fields.push("tier = ?");
    values.push(updates.tier);
  }
  if (updates.stripeCustomerId !== undefined) {
    fields.push("stripe_customer_id = ?");
    values.push(updates.stripeCustomerId);
  }
  if (updates.lastLogin !== undefined) {
    fields.push("last_login = ?");
    values.push(updates.lastLogin);
  }
  if (updates.emailVerified !== undefined) {
    fields.push("email_verified = ?");
    values.push(updates.emailVerified ? 1 : 0);
  }
  
  if (fields.length === 0) return false;
  
  values.push(id);
  const stmt = db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * Delete user
 */
export function deleteUser(id: string): boolean {
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== SESSION MANAGEMENT ====================

/**
 * Create a new session
 */
export function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string,
  expiresInDays: number = 7
): Session {
  const id = generateSessionId();
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + (expiresInDays * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, created_at, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, token, now, expiresAt, userAgent || null, ipAddress || null);
  
  return {
    id,
    userId,
    token,
    createdAt: now,
    expiresAt,
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
  };
}

/**
 * Get session by token
 */
export function getSessionByToken(token: string): Session | null {
  const stmt = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?");
  const row = stmt.get(token, Date.now()) as any;
  return row ? rowToSession(row) : null;
}

/**
 * Get sessions by user ID
 */
export function getSessionsByUserId(userId: string): Session[] {
  const stmt = db.prepare("SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC");
  const rows = stmt.all(userId, Date.now()) as any[];
  return rows.map(rowToSession);
}

/**
 * Delete session (logout)
 */
export function deleteSession(token: string): boolean {
  const stmt = db.prepare("DELETE FROM sessions WHERE token = ?");
  const result = stmt.run(token);
  return result.changes > 0;
}

/**
 * Delete all sessions for user (logout all)
 */
export function deleteAllUserSessions(userId: string): number {
  const stmt = db.prepare("DELETE FROM sessions WHERE user_id = ?");
  const result = stmt.run(userId);
  return result.changes;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at < ?");
  const result = stmt.run(Date.now());
  return result.changes;
}

// ==================== API KEY MANAGEMENT ====================

/**
 * Generate API key string
 */
function generateApiKeyString(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `alligo_${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Create API key for user
 */
export function createApiKey(
  userId: string,
  name: string,
  permissions: UserApiKey["permissions"] = "read"
): UserApiKey {
  const id = generateApiKeyId();
  const key = generateApiKeyString();
  const now = Date.now();
  
  const stmt = db.prepare(`
    INSERT INTO user_api_keys (id, user_id, key, name, permissions, created_at, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  
  stmt.run(id, userId, key, name, permissions, now);
  
  return {
    id,
    userId,
    key,
    name,
    permissions,
    createdAt: now,
    lastUsed: null,
    active: true,
  };
}

/**
 * Get API key by key string
 */
export function getApiKeyByKey(key: string): UserApiKey | null {
  const stmt = db.prepare("SELECT * FROM user_api_keys WHERE key = ? AND active = 1");
  const row = stmt.get(key) as any;
  if (!row) return null;
  
  // Update last used
  db.prepare("UPDATE user_api_keys SET last_used = ? WHERE id = ?")
    .run(Date.now(), row.id);
  
  return rowToApiKey(row);
}

/**
 * Get API keys by user ID
 */
export function getApiKeysByUserId(userId: string): UserApiKey[] {
  const stmt = db.prepare("SELECT * FROM user_api_keys WHERE user_id = ? ORDER BY created_at DESC");
  const rows = stmt.all(userId) as any[];
  return rows.map(rowToApiKey);
}

/**
 * Get API key by ID
 */
export function getApiKeyById(id: string): UserApiKey | null {
  const stmt = db.prepare("SELECT * FROM user_api_keys WHERE id = ?");
  const row = stmt.get(id) as any;
  return row ? rowToApiKey(row) : null;
}

/**
 * Revoke API key
 */
export function revokeApiKey(id: string, userId: string): boolean {
  const stmt = db.prepare("UPDATE user_api_keys SET active = 0 WHERE id = ? AND user_id = ?");
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

/**
 * Delete API key
 */
export function deleteApiKey(id: string, userId: string): boolean {
  const stmt = db.prepare("DELETE FROM user_api_keys WHERE id = ? AND user_id = ?");
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

/**
 * Update API key last used
 */
export function updateApiKeyLastUsed(key: string): void {
  db.prepare("UPDATE user_api_keys SET last_used = ? WHERE key = ?")
    .run(Date.now(), key);
}

// ==================== HELPER FUNCTIONS ====================

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    tier: row.tier as User["tier"],
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    emailVerified: row.email_verified === 1,
  };
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
  };
}

function rowToApiKey(row: any): UserApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    name: row.name,
    permissions: row.permissions as UserApiKey["permissions"],
    createdAt: row.created_at,
    lastUsed: row.last_used,
    active: row.active === 1,
  };
}

// ==================== EXPORTS ====================

export {
  toSafeUser,
};

export type { SafeUser };
