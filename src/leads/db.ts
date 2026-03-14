/**
 * AlliGo - Lead Capture Database
 * Store and manage leads from landing page
 */

import { Database } from "bun:sqlite";

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || "./data/alligo.db";
    db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    initTables();
  }
  return db;
}

function initTables() {
  getDb().run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      source TEXT DEFAULT 'landing_page',
      interests TEXT,
      createdAt INTEGER NOT NULL,
      notified INTEGER DEFAULT 0,
      converted INTEGER DEFAULT 0
    )
  `);
  
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(createdAt)`);
}

export interface Lead {
  id: number;
  email: string;
  name?: string;
  source: string;
  interests?: string;
  createdAt: number;
  notified: boolean;
  converted: boolean;
}

export interface CreateLeadInput {
  email: string;
  name?: string;
  source?: string;
  interests?: string;
}

/**
 * Create a new lead
 */
export function createLead(input: CreateLeadInput): Lead {
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO leads (email, name, source, interests, createdAt)
    VALUES ($email, $name, $source, $interests, $createdAt)
    ON CONFLICT(email) DO UPDATE SET
      name = COALESCE($name, name),
      interests = COALESCE($interests, interests)
    RETURNING *
  `);
  
  return stmt.get({
    $email: input.email.toLowerCase().trim(),
    $name: input.name || null,
    $source: input.source || "landing_page",
    $interests: input.interests || null,
    $createdAt: now,
  }) as Lead;
}

/**
 * Get lead by email
 */
export function getLeadByEmail(email: string): Lead | null {
  const stmt = getDb().prepare(`SELECT * FROM leads WHERE email = $email`);
  return stmt.get({ $email: email.toLowerCase().trim() }) as Lead | null;
}

/**
 * Get lead by ID
 */
export function getLeadById(id: number): Lead | null {
  const stmt = getDb().prepare(`SELECT * FROM leads WHERE id = $id`);
  return stmt.get({ $id: id }) as Lead | null;
}

/**
 * Get all leads with pagination
 */
export function getAllLeads(limit = 100, offset = 0): Lead[] {
  const stmt = getDb().prepare(`
    SELECT * FROM leads 
    ORDER BY createdAt DESC 
    LIMIT $limit OFFSET $offset
  `);
  return stmt.all({ $limit: limit, $offset: offset }) as Lead[];
}

/**
 * Count total leads
 */
export function countLeads(): number {
  const stmt = getDb().prepare(`SELECT COUNT(*) as count FROM leads`);
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Get leads by source
 */
export function getLeadsBySource(): Record<string, number> {
  const stmt = getDb().prepare(`
    SELECT source, COUNT(*) as count 
    FROM leads 
    GROUP BY source
  `);
  const results = stmt.all() as { source: string; count: number }[];
  return results.reduce((acc, r) => {
    acc[r.source] = r.count;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Mark lead as notified
 */
export function markLeadNotified(id: number): void {
  getDb().run(`UPDATE leads SET notified = 1 WHERE id = $id`, { $id: id });
}

/**
 * Mark lead as converted (paid)
 */
export function markLeadConverted(email: string): void {
  getDb().run(`UPDATE leads SET converted = 1 WHERE email = $email`, { 
    $email: email.toLowerCase().trim() 
  });
}

/**
 * Export leads as CSV
 */
export function exportLeadsCsv(): string {
  const leads = getAllLeads(10000);
  const headers = ["id", "email", "name", "source", "interests", "createdAt", "notified", "converted"];
  const rows = leads.map(l => [
    l.id,
    l.email,
    l.name || "",
    l.source,
    l.interests || "",
    new Date(l.createdAt).toISOString(),
    l.notified ? "yes" : "no",
    l.converted ? "yes" : "no",
  ]);
  
  return [
    headers.join(","),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
}

/**
 * Get leads created in last N days
 */
export function getRecentLeads(days: number = 7): Lead[] {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const stmt = getDb().prepare(`
    SELECT * FROM leads 
    WHERE createdAt >= $cutoff 
    ORDER BY createdAt DESC
  `);
  return stmt.all({ $cutoff: cutoff }) as Lead[];
}

/**
 * Delete lead
 */
export function deleteLead(id: number): boolean {
  const result = getDb().run(`DELETE FROM leads WHERE id = $id`, { $id: id });
  return result.changes > 0;
}

export default {
  createLead,
  getLeadByEmail,
  getLeadById,
  getAllLeads,
  countLeads,
  getLeadsBySource,
  markLeadNotified,
  markLeadConverted,
  exportLeadsCsv,
  getRecentLeads,
  deleteLead,
};
