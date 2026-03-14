/**
 * AlliGo - Subscription Database Layer
 * Manages subscription records for payment processing
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "../config";
import type { PlanTier } from "./plans";

// Subscription status types
export type SubscriptionStatus = 
  | "active" 
  | "canceled" 
  | "past_due" 
  | "trialing" 
  | "unpaid"
  | "incomplete";

// Subscription record interface
export interface SubscriptionRecord {
  id: string;
  userId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: SubscriptionStatus;
  tier: PlanTier;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  createdAt: number;
  updatedAt: number;
}

// Ensure database directory exists
const dbDir = dirname(config.databasePath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new Database(config.databasePath, { create: true });

// Enable WAL mode for better concurrent performance
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");

// Create subscriptions table
db.run(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    stripeSubscriptionId TEXT,
    stripeCustomerId TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    tier TEXT NOT NULL DEFAULT 'free',
    currentPeriodStart INTEGER,
    currentPeriodEnd INTEGER,
    cancelAtPeriodEnd INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Create indexes for common queries
db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_userId ON subscriptions(userId)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_stripeSubscriptionId ON subscriptions(stripeSubscriptionId)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_stripeCustomerId ON subscriptions(stripeCustomerId)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);

/**
 * Generate a unique subscription ID
 */
function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new subscription for a user
 */
export function createSubscription(
  userId: string,
  tier: PlanTier = "free"
): SubscriptionRecord {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO subscriptions (
      id, userId, status, tier, currentPeriodStart, currentPeriodEnd, 
      cancelAtPeriodEnd, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    userId,
    "active",
    tier,
    now,
    now + 30 * 24 * 60 * 60, // 30 days from now
    0,
    now,
    now
  );
  
  return getSubscriptionByUserId(userId)!;
}

/**
 * Get subscription by user ID
 */
export function getSubscriptionByUserId(userId: string): SubscriptionRecord | null {
  const stmt = db.prepare("SELECT * FROM subscriptions WHERE userId = ?");
  const row = stmt.get(userId) as any;
  
  if (!row) return null;
  
  return rowToSubscription(row);
}

/**
 * Get subscription by Stripe subscription ID
 */
export function getSubscriptionByStripeId(stripeSubscriptionId: string): SubscriptionRecord | null {
  const stmt = db.prepare("SELECT * FROM subscriptions WHERE stripeSubscriptionId = ?");
  const row = stmt.get(stripeSubscriptionId) as any;
  
  if (!row) return null;
  
  return rowToSubscription(row);
}

/**
 * Get subscription by Stripe customer ID
 */
export function getSubscriptionByCustomerId(stripeCustomerId: string): SubscriptionRecord | null {
  const stmt = db.prepare("SELECT * FROM subscriptions WHERE stripeCustomerId = ?");
  const row = stmt.get(stripeCustomerId) as any;
  
  if (!row) return null;
  
  return rowToSubscription(row);
}

/**
 * Update subscription after successful checkout
 */
export function activateSubscription(
  userId: string,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  tier: PlanTier,
  currentPeriodStart: number,
  currentPeriodEnd: number
): SubscriptionRecord | null {
  const now = Math.floor(Date.now() / 1000);
  
  // Check if subscription exists
  let existing = getSubscriptionByUserId(userId);
  
  if (existing) {
    // Update existing subscription
    const stmt = db.prepare(`
      UPDATE subscriptions 
      SET stripeSubscriptionId = ?, stripeCustomerId = ?, status = ?, tier = ?,
          currentPeriodStart = ?, currentPeriodEnd = ?, cancelAtPeriodEnd = ?, updatedAt = ?
      WHERE userId = ?
    `);
    
    stmt.run(
      stripeSubscriptionId,
      stripeCustomerId,
      "active",
      tier,
      Math.floor(currentPeriodStart / 1000),
      Math.floor(currentPeriodEnd / 1000),
      0,
      now,
      userId
    );
  } else {
    // Create new subscription
    const id = generateId();
    const insertStmt = db.prepare(`
      INSERT INTO subscriptions (
        id, userId, stripeSubscriptionId, stripeCustomerId, status, tier,
        currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(
      id,
      userId,
      stripeSubscriptionId,
      stripeCustomerId,
      "active",
      tier,
      Math.floor(currentPeriodStart / 1000),
      Math.floor(currentPeriodEnd / 1000),
      0,
      now,
      now
    );
  }
  
  return getSubscriptionByUserId(userId);
}

/**
 * Update subscription status
 */
export function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: SubscriptionStatus,
  currentPeriodStart?: number,
  currentPeriodEnd?: number
): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  let sql = "UPDATE subscriptions SET status = ?, updatedAt = ?";
  const params: any[] = [status, now];
  
  if (currentPeriodStart !== undefined) {
    sql += ", currentPeriodStart = ?";
    params.push(Math.floor(currentPeriodStart / 1000));
  }
  
  if (currentPeriodEnd !== undefined) {
    sql += ", currentPeriodEnd = ?";
    params.push(Math.floor(currentPeriodEnd / 1000));
  }
  
  sql += " WHERE stripeSubscriptionId = ?";
  params.push(stripeSubscriptionId);
  
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  
  return result.changes > 0;
}

/**
 * Update subscription tier
 */
export function updateSubscriptionTier(
  stripeSubscriptionId: string,
  tier: PlanTier
): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    UPDATE subscriptions SET tier = ?, updatedAt = ? WHERE stripeSubscriptionId = ?
  `);
  
  const result = stmt.run(tier, now, stripeSubscriptionId);
  return result.changes > 0;
}

/**
 * Downgrade subscription to free tier
 */
export function downgradeToFree(stripeSubscriptionId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    UPDATE subscriptions 
    SET tier = 'free', status = 'canceled', stripeSubscriptionId = NULL, updatedAt = ?
    WHERE stripeSubscriptionId = ?
  `);
  
  const result = stmt.run(now, stripeSubscriptionId);
  return result.changes > 0;
}

/**
 * Mark subscription for cancellation at period end
 */
export function markForCancellation(stripeSubscriptionId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    UPDATE subscriptions 
    SET cancelAtPeriodEnd = 1, updatedAt = ? 
    WHERE stripeSubscriptionId = ?
  `);
  
  const result = stmt.run(now, stripeSubscriptionId);
  return result.changes > 0;
}

/**
 * Reactivate subscription (cancel scheduled cancellation)
 */
export function reactivateSubscription(stripeSubscriptionId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    UPDATE subscriptions 
    SET cancelAtPeriodEnd = 0, status = 'active', updatedAt = ? 
    WHERE stripeSubscriptionId = ?
  `);
  
  const result = stmt.run(now, stripeSubscriptionId);
  return result.changes > 0;
}

/**
 * Get or create subscription for a user
 */
export function getOrCreateSubscription(userId: string): SubscriptionRecord {
  let subscription = getSubscriptionByUserId(userId);
  
  if (!subscription) {
    subscription = createSubscription(userId, "free");
  }
  
  return subscription;
}

/**
 * List all active subscriptions
 */
export function listActiveSubscriptions(limit = 100): SubscriptionRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE status = 'active' 
    ORDER BY createdAt DESC 
    LIMIT ?
  `);
  
  const rows = stmt.all(limit) as any[];
  return rows.map(rowToSubscription);
}

/**
 * Convert database row to SubscriptionRecord
 */
function rowToSubscription(row: any): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripeCustomerId: row.stripeCustomerId,
    status: row.status as SubscriptionStatus,
    tier: row.tier as PlanTier,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Close database connection (for graceful shutdown)
 */
export function closeSubscriptionDb(): void {
  db.close();
}

export { db };
