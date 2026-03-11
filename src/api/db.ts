/**
 * AlliGo - Database Layer
 * SQLite for MVP, designed to scale to PostgreSQL
 */

import { Database } from "bun:sqlite";
import {
  AgentClaim,
  ClaimType,
  ClaimCategory,
  Resolution,
  ClaimSource,
} from "../schema/claim";

// Initialize database
const db = new Database(":memory:", { create: true });

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    agentName TEXT,
    developer TEXT,
    developerContact TEXT,
    
    claimType TEXT NOT NULL,
    category TEXT NOT NULL,
    severityScore INTEGER DEFAULT 1,
    severityLevel TEXT DEFAULT 'low',
    
    amountLost REAL NOT NULL,
    assetType TEXT,
    assetAmount REAL,
    recoveredAmount REAL,
    
    chain TEXT,
    txHash TEXT,
    contractAddress TEXT,
    counterparty TEXT,
    
    timestamp INTEGER NOT NULL,
    reportedAt INTEGER NOT NULL,
    resolvedAt INTEGER,
    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rootCause TEXT,
    
    resolution TEXT DEFAULT 'pending',
    resolutionNotes TEXT,
    
    source TEXT DEFAULT 'self_reported',
    verified INTEGER DEFAULT 0,
    evidence TEXT,
    
    tags TEXT,
    platform TEXT,
    agentVersion TEXT,
    
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_claims_agentId ON claims(agentId)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_claims_timestamp ON claims(timestamp)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claimType)`);

// ==================== CLAIMS ====================

export function insertClaim(claim: AgentClaim): void {
  const stmt = db.prepare(`
    INSERT INTO claims (
      id, agentId, agentName, developer, developerContact,
      claimType, category, severityScore, severityLevel,
      amountLost, assetType, assetAmount, recoveredAmount,
      chain, txHash, contractAddress, counterparty,
      timestamp, reportedAt, resolvedAt,
      title, description, rootCause,
      resolution, resolutionNotes,
      source, verified, evidence,
      tags, platform, agentVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    claim.id,
    claim.agentId,
    claim.agentName || null,
    claim.developer || null,
    claim.developerContact || null,
    claim.claimType,
    claim.category,
    claim.severity?.score || 1,
    claim.severity?.level || "low",
    claim.amountLost,
    claim.assetType || null,
    claim.assetAmount || null,
    claim.recoveredAmount || null,
    claim.chain || null,
    claim.txHash || null,
    claim.contractAddress || null,
    claim.counterparty || null,
    claim.timestamp,
    claim.reportedAt,
    claim.resolvedAt || null,
    claim.title,
    claim.description,
    claim.rootCause || null,
    claim.resolution,
    claim.resolutionNotes || null,
    claim.source,
    claim.verified ? 1 : 0,
    claim.evidence ? JSON.stringify(claim.evidence) : null,
    claim.tags ? JSON.stringify(claim.tags) : null,
    claim.platform || null,
    claim.agentVersion || null
  );
}

export function getClaimById(id: string): AgentClaim | null {
  const stmt = db.prepare("SELECT * FROM claims WHERE id = ?");
  const row = stmt.get(id) as any;
  return row ? rowToClaim(row) : null;
}

export function getClaimsByAgent(agentId: string): AgentClaim[] {
  const stmt = db.prepare("SELECT * FROM claims WHERE agentId = ? ORDER BY timestamp DESC");
  const rows = stmt.all(agentId) as any[];
  return rows.map(rowToClaim);
}

export function getAllClaims(limit = 100, offset = 0): AgentClaim[] {
  const stmt = db.prepare("SELECT * FROM claims ORDER BY timestamp DESC LIMIT ? OFFSET ?");
  const rows = stmt.all(limit, offset) as any[];
  return rows.map(rowToClaim);
}

export function countClaims(): number {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM claims");
  const result = stmt.get() as { count: number };
  return result.count;
}

// ==================== HELPERS ====================

function rowToClaim(row: any): AgentClaim {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName || undefined,
    developer: row.developer || undefined,
    developerContact: row.developerContact || undefined,
    claimType: row.claimType as ClaimType,
    category: row.category as ClaimCategory,
    severity: {
      score: row.severityScore,
      level: row.severityLevel,
      factors: [],
    },
    amountLost: row.amountLost,
    assetType: row.assetType || undefined,
    assetAmount: row.assetAmount || undefined,
    recoveredAmount: row.recoveredAmount || undefined,
    chain: row.chain || undefined,
    txHash: row.txHash || undefined,
    contractAddress: row.contractAddress || undefined,
    counterparty: row.counterparty || undefined,
    timestamp: row.timestamp,
    reportedAt: row.reportedAt,
    resolvedAt: row.resolvedAt || undefined,
    title: row.title,
    description: row.description,
    rootCause: row.rootCause || undefined,
    resolution: row.resolution as Resolution,
    resolutionNotes: row.resolutionNotes || undefined,
    source: row.source as ClaimSource,
    verified: row.verified === 1,
    evidence: row.evidence ? JSON.parse(row.evidence) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    platform: row.platform || undefined,
    agentVersion: row.agentVersion || undefined,
  };
}

export { db };
