/**
 * AlliGo - Waitlist System
 * Pro plan early access waitlist with position tracking
 */

import { db } from './db';
import { logEmail } from './db';

// Re-export functions from db.ts
export {
  addToWaitlist,
  getWaitlistPosition,
  getWaitlistEntry,
  getAllWaitlist,
  getPendingWaitlist,
  approveWaitlistEntry,
  declineWaitlistEntry,
  markWaitlistNotified,
  countWaitlist,
  countPendingWaitlist,
  exportWaitlistAsCsv,
} from './db';

import {
  addToWaitlist,
  getWaitlistEntry,
  getAllWaitlist,
  approveWaitlistEntry,
  countWaitlist,
  countPendingWaitlist,
  WaitlistEntry,
} from './db';

// ==================== WAITLIST CONFIG ====================

export interface WaitlistConfig {
  maxPositionDisplay: number;  // Show position even if higher
  batchSize: number;           // How many to approve at once
  notificationDelay: number;   // Delay between notifications (ms)
}

const DEFAULT_CONFIG: WaitlistConfig = {
  maxPositionDisplay: 1000,
  batchSize: 10,
  notificationDelay: 1000,
};

// ==================== POSITION TRACKING ====================

/**
 * Get estimated wait time based on position
 */
export function getEstimatedWaitTime(position: number): string {
  if (position <= 10) return "Within the next week";
  if (position <= 50) return "1-2 weeks";
  if (position <= 100) return "2-4 weeks";
  if (position <= 500) return "1-2 months";
  return "2+ months";
}

/**
 * Get position message for display
 */
export function getPositionMessage(position: number): string {
  if (position === 1) {
    return "🎉 You're first in line! We'll reach out soon.";
  }
  if (position <= 10) {
    return `🔥 You're #${position}! Expect an invite within days.`;
  }
  if (position <= 50) {
    return `⏳ Position #${position}. We're onboarding users in batches.`;
  }
  if (position <= 100) {
    return `📍 You're #${position} on the waitlist. We'll email you when it's your turn.`;
  }
  return `📍 Position #${position}. Early access is rolling out gradually.`;
}

// ==================== BATCH OPERATIONS ====================

/**
 * Approve next batch of waitlist entries
 */
export function approveNextBatch(batchSize: number = 10): WaitlistEntry[] {
  const pending = getAllWaitlist(batchSize * 2, 0)
    .filter(e => e.status === 'pending')
    .slice(0, batchSize);
  
  const approved: WaitlistEntry[] = [];
  
  for (const entry of pending) {
    if (approveWaitlistEntry(entry.id)) {
      approved.push(entry);
    }
  }
  
  return approved;
}

/**
 * Get waitlist summary for dashboard
 */
export function getWaitlistSummary(): {
  total: number;
  pending: number;
  approved: number;
  declined: number;
  avgPosition: number;
} {
  const total = countWaitlist();
  const pending = countPendingWaitlist();
  
  // Get counts for other statuses
  const approvedStmt = db.prepare("SELECT COUNT(*) as count FROM waitlist WHERE status = 'approved'");
  const approvedResult = approvedStmt.get() as { count: number };
  
  const declinedStmt = db.prepare("SELECT COUNT(*) as count FROM waitlist WHERE status = 'declined'");
  const declinedResult = declinedStmt.get() as { count: number };
  
  // Calculate average position for pending
  const avgStmt = db.prepare("SELECT AVG(position) as avg FROM waitlist WHERE status = 'pending'");
  const avgResult = avgStmt.get() as { avg: number | null };
  
  return {
    total,
    pending,
    approved: approvedResult.count,
    declined: declinedResult.count,
    avgPosition: avgResult.avg ? Math.round(avgResult.avg) : 0,
  };
}

// ==================== POSITION RECALCULATION ====================

/**
 * Recalculate positions after deletions/approvals
 * Call this periodically to keep positions accurate
 */
export function recalculatePositions(): number {
  const entries = getAllWaitlist(10000, 0);
  let updated = 0;
  
  entries.sort((a, b) => a.position - b.position);
  
  const stmt = db.prepare("UPDATE waitlist SET position = ? WHERE id = ?");
  
  entries.forEach((entry, index) => {
    const newPosition = index + 1;
    if (entry.position !== newPosition) {
      stmt.run(newPosition, entry.id);
      updated++;
    }
  });
  
  return updated;
}

// ==================== REFERRAL BONUS ====================

/**
 * Add referral bonus (move up in position)
 */
export function addReferralBonus(email: string, bonusPositions: number = 5): boolean {
  const entry = getWaitlistEntry(email);
  if (!entry || entry.status !== 'pending') {
    return false;
  }
  
  const newPosition = Math.max(1, entry.position - bonusPositions);
  
  const stmt = db.prepare("UPDATE waitlist SET position = ? WHERE id = ?");
  const result = stmt.run(newPosition, entry.id);
  
  return result.changes > 0;
}

// ==================== WAITLIST METRICS ====================

/**
 * Get waitlist metrics over time
 */
export function getWaitlistMetrics(): {
  dailySignups: { date: string; count: number }[];
  conversionRate: number;
} {
  // Get daily signups for last 30 days
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  
  const stmt = db.prepare(`
    SELECT date(created_at, 'unixepoch') as date, COUNT(*) as count
    FROM waitlist
    WHERE created_at > ?
    GROUP BY date
    ORDER BY date DESC
  `);
  
  const rows = stmt.all(thirtyDaysAgo) as { date: string; count: number }[];
  
  // Calculate conversion rate (approved / total)
  const totalStmt = db.prepare("SELECT COUNT(*) as count FROM waitlist");
  const totalResult = totalStmt.get() as { count: number };
  
  const approvedStmt = db.prepare("SELECT COUNT(*) as count FROM waitlist WHERE status = 'approved'");
  const approvedResult = approvedStmt.get() as { count: number };
  
  const conversionRate = totalResult.count > 0 
    ? Math.round((approvedResult.count / totalResult.count) * 100) 
    : 0;
  
  return {
    dailySignups: rows,
    conversionRate,
  };
}
