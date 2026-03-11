/**
 * AlliGo - Live Ingestion Runner
 *
 * Connects the Brave Search pipeline to the database
 * Run with: bun run src/ingestion/ingest-live.ts
 */

import {
  discoverIncidents,
  type IngestedIncident,
} from "./brave_search";
import {
  insertClaim,
  getAllClaims,
} from "../api/db";
import {
  AgentClaim,
  ClaimType,
  ClaimCategory,
  ClaimSource,
  Resolution,
  calculateSeverity,
} from "../schema/claim";

/**
 * Map incident to claim category
 */
function mapCategory(incident: IngestedIncident): ClaimCategory {
  const text = `${incident.title} ${incident.description}`.toLowerCase();

  if (
    text.includes("trade") ||
    text.includes("arbitrage") ||
    text.includes("portfolio") ||
    text.includes("invest")
  ) {
    return ClaimCategory.TRADING;
  }

  if (
    text.includes("hack") ||
    text.includes("drain") ||
    text.includes("exploit") ||
    text.includes("security") ||
    text.includes("ransomware") ||
    text.includes("deepfake")
  ) {
    return ClaimCategory.SECURITY;
  }

  if (
    text.includes("transfer") ||
    text.includes("bridge") ||
    text.includes("execution") ||
    text.includes("failed")
  ) {
    return ClaimCategory.EXECUTION;
  }

  if (
    text.includes("fraud") ||
    text.includes("scam") ||
    text.includes("fake")
  ) {
    return ClaimCategory.FRAUD;
  }

  return ClaimCategory.OTHER;
}

/**
 * Map incident to claim type
 */
function mapType(incident: IngestedIncident): ClaimType {
  const text = `${incident.title} ${incident.description}`.toLowerCase();

  if (text.includes("fraud") || text.includes("scam") || text.includes("fake")) {
    return ClaimType.FRAUD;
  }

  if (
    text.includes("hack") ||
    text.includes("exploit") ||
    text.includes("breach") ||
    text.includes("security")
  ) {
    return ClaimType.SECURITY;
  }

  if (text.includes("error") || text.includes("mistake") || text.includes("bug")) {
    return ClaimType.ERROR;
  }

  if (text.includes("loss") || text.includes("lost")) {
    return ClaimType.LOSS;
  }

  return ClaimType.UNKNOWN;
}

/**
 * Convert ingested incident to claim
 */
function incidentToClaim(incident: IngestedIncident): Partial<AgentClaim> {
  return {
    agentId: incident.extractedData?.agentName?.toLowerCase().replace(/\s+/g, "_") || "unknown_agent",
    agentName: incident.extractedData?.agentName || "Unknown Agent",
    claimType: mapType(incident),
    category: mapCategory(incident),
    amountLost: incident.extractedData?.amountLost || 0,
    chain: incident.extractedData?.chain,
    platform: incident.extractedData?.platform,
    title: incident.title,
    description: incident.description,
    source: ClaimSource.SCRAPED,
    resolution: Resolution.PENDING,
    verified: false,
    // Store URL as evidence
    evidence: [incident.url],
  };
}

/**
 * Check if incident already exists (by URL similarity)
 */
function isDuplicate(incident: IngestedIncident, existing: AgentClaim[]): boolean {
  const incidentUrl = new URL(incident.url).hostname + new URL(incident.url).pathname;
  
  for (const claim of existing) {
    if (claim.evidence?.some(e => e.includes(incidentUrl.slice(0, 50)))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Run ingestion and add to database
 */
async function runIngestion(): Promise<{ added: number; skipped: number }> {
  console.log("=".repeat(50));
  console.log("ALLIGO - Live Ingestion Runner");
  console.log("=".repeat(50));
  console.log();

  // Get existing claims
  const existing = getAllClaims(1000);
  console.log(`Existing claims: ${existing.length}`);

  // Discover new incidents
  const incidents = await discoverIncidents();
  console.log(`Discovered: ${incidents.length} potential incidents`);

  // Filter out duplicates
  const newIncidents = incidents.filter((i) => !isDuplicate(i, existing));
  console.log(`New incidents: ${newIncidents.length}`);
  console.log(`Duplicates skipped: ${incidents.length - newIncidents.length}`);
  console.log();

  // Add to database
  for (const incident of newIncidents) {
    const partial = incidentToClaim(incident);
    const claim: AgentClaim = {
      id: `clm_ingested_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId: partial.agentId || "unknown",
      agentName: partial.agentName,
      claimType: partial.claimType || ClaimType.UNKNOWN,
      category: partial.category || ClaimCategory.OTHER,
      severity: calculateSeverity(partial),
      amountLost: partial.amountLost || 0,
      chain: partial.chain,
      platform: partial.platform,
      title: partial.title || "Untitled",
      description: partial.description || "",
      timestamp: Date.now(),
      reportedAt: Date.now(),
      source: ClaimSource.SCRAPED,
      resolution: Resolution.PENDING,
      verified: false,
      evidence: partial.evidence,
    };

    insertClaim(claim);
    console.log(`Added: ${claim.title.slice(0, 60)}... ($${(claim.amountLost / 1000000).toFixed(1)}M)`);
  }

  console.log();
  console.log("=".repeat(50));
  console.log(`Ingestion complete: ${newIncidents.length} new claims added`);
  console.log("=".repeat(50));

  return {
    added: newIncidents.length,
    skipped: incidents.length - newIncidents.length,
  };
}

// Run if executed directly
if (import.meta.main) {
  runIngestion().catch(console.error);
}

export { runIngestion };
