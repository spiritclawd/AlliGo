/**
 * AlliGo - Automated Ingestion Scheduler
 * Runs daily to discover new AI agent failures
 */

import { searchIncidents, Incident } from "../ingestion/brave_search";
import { insertClaim, isDatabaseEmpty } from "../api/db";
import { calculateSeverity } from "../schema/claim";
import { sendClaimAlert } from "../telegram/bot";

// Claim types
enum ClaimType {
  LOSS = "loss",
  ERROR = "error",
  SECURITY = "security",
  FRAUD = "fraud",
  UNKNOWN = "unknown",
}

enum ClaimCategory {
  TRADING = "trading",
  SECURITY = "security",
  EXECUTION = "execution",
  PAYMENT = "payment",
  GOVERNANCE = "governance",
  OTHER = "other",
}

enum ClaimSource {
  SELF_REPORTED = "self_reported",
  SCRAPED = "scraped",
  VERIFIED = "verified",
  PARTNER = "partner",
}

enum Resolution {
  PENDING = "pending",
  RESOLVED = "resolved",
  PARTIAL = "partial",
  REJECTED = "rejected",
}

interface SchedulerConfig {
  intervalMs: number;
  notifyOnNew: boolean;
  dryRun: boolean;
}

const defaultConfig: SchedulerConfig = {
  intervalMs: 24 * 60 * 60 * 1000, // 24 hours
  notifyOnNew: true,
  dryRun: false,
};

let schedulerInterval: Timer | null = null;
let lastRun: number | null = null;
let isRunning = false;

/**
 * Generate a unique claim ID
 */
function generateId(): string {
  return `clm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Map incident category to claim category
 */
function mapCategory(category: string): ClaimCategory {
  const mapping: Record<string, ClaimCategory> = {
    trading: ClaimCategory.TRADING,
    security: ClaimCategory.SECURITY,
    hack: ClaimCategory.SECURITY,
    exploit: ClaimCategory.SECURITY,
    execution: ClaimCategory.EXECUTION,
    error: ClaimCategory.EXECUTION,
    payment: ClaimCategory.PAYMENT,
    governance: ClaimCategory.GOVERNANCE,
    default: ClaimCategory.OTHER,
  };
  return mapping[category.toLowerCase()] || ClaimCategory.OTHER;
}

/**
 * Map incident type to claim type
 */
function mapClaimType(type: string): ClaimType {
  const mapping: Record<string, ClaimType> = {
    loss: ClaimType.LOSS,
    error: ClaimType.ERROR,
    security: ClaimType.SECURITY,
    hack: ClaimType.SECURITY,
    fraud: ClaimType.FRAUD,
    scam: ClaimType.FRAUD,
    default: ClaimType.UNKNOWN,
  };
  return mapping[type.toLowerCase()] || ClaimType.UNKNOWN;
}

/**
 * Process a single incident into a claim
 */
async function processIncident(incident: Incident, dryRun: boolean): Promise<{
  success: boolean;
  claimId?: string;
  error?: string;
}> {
  try {
    const now = Date.now();
    const claim = {
      id: generateId(),
      agentId: incident.agentId || `unknown_${now}`,
      agentName: incident.agentName,
      developer: incident.developer || "Unknown",
      claimType: mapClaimType(incident.type || "unknown"),
      category: mapCategory(incident.category || "other"),
      severity: calculateSeverity({
        amountLost: incident.amountLost || 0,
        claimType: incident.type || "unknown",
      }),
      amountLost: incident.amountLost || 0,
      assetType: incident.assetType,
      assetAmount: incident.assetAmount,
      chain: incident.chain,
      txHash: incident.txHash,
      counterparty: incident.counterparty,
      timestamp: incident.timestamp || now,
      reportedAt: now,
      title: incident.title || "Untitled Incident",
      description: incident.description || "",
      rootCause: incident.rootCause,
      resolution: Resolution.PENDING,
      source: ClaimSource.SCRAPED,
      verified: false,
      evidence: incident.url ? [incident.url] : [],
      tags: incident.tags || [],
      platform: incident.platform,
    };

    if (dryRun) {
      console.log(`[DRY RUN] Would create claim:`, claim.title);
      return { success: true, claimId: "dry_run" };
    }

    insertClaim(claim);
    console.log(`✅ Created claim ${claim.id}: ${claim.title}`);
    
    return { success: true, claimId: claim.id };
  } catch (error) {
    console.error(`Failed to process incident:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Run a single ingestion cycle
 */
export async function runIngestionCycle(config: Partial<SchedulerConfig> = {}): Promise<{
  incidentsFound: number;
  claimsCreated: number;
  errors: string[];
  duration: number;
}> {
  if (isRunning) {
    console.log("Ingestion already running, skipping...");
    return {
      incidentsFound: 0,
      claimsCreated: 0,
      errors: ["Ingestion already running"],
      duration: 0,
    };
  }

  isRunning = true;
  const startTime = Date.now();
  const errors: string[] = [];
  let incidentsFound = 0;
  let claimsCreated = 0;

  console.log("\n🔄 Starting ingestion cycle...");
  console.log(`   Time: ${new Date().toISOString()}`);

  try {
    // Check if Brave API key is configured
    if (!process.env.BRAVE_API_KEY) {
      console.log("⚠️ No BRAVE_API_KEY configured, skipping search");
      errors.push("BRAVE_API_KEY not configured");
    } else {
      // Search for incidents
      const incidents = await searchIncidents();
      incidentsFound = incidents.length;
      console.log(`   Found ${incidentsFound} potential incidents`);

      // Process each incident
      for (const incident of incidents) {
        const result = await processIncident(incident, config.dryRun || false);
        if (result.success && result.claimId) {
          claimsCreated++;
        } else if (result.error) {
          errors.push(result.error);
        }
      }
    }
  } catch (error) {
    console.error("Ingestion cycle failed:", error);
    errors.push(String(error));
  }

  isRunning = false;
  lastRun = Date.now();
  const duration = Date.now() - startTime;

  console.log(`\n✅ Ingestion complete:`);
  console.log(`   Incidents found: ${incidentsFound}`);
  console.log(`   Claims created: ${claimsCreated}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Duration: ${duration}ms`);

  return {
    incidentsFound,
    claimsCreated,
    errors,
    duration,
  };
}

/**
 * Start the automated scheduler
 */
export function startIngestionScheduler(
  config: Partial<SchedulerConfig> = {}
): void {
  const fullConfig = { ...defaultConfig, ...config };

  if (schedulerInterval) {
    console.log("Scheduler already running");
    return;
  }

  console.log(`\n🚀 Starting ingestion scheduler...`);
  console.log(`   Interval: ${fullConfig.intervalMs / 1000 / 60 / 60} hours`);

  // Run immediately on start
  runIngestionCycle(fullConfig).catch(console.error);

  // Then run on interval
  schedulerInterval = setInterval(() => {
    runIngestionCycle(fullConfig).catch(console.error);
  }, fullConfig.intervalMs);

  console.log(`✅ Scheduler started`);
}

/**
 * Stop the scheduler
 */
export function stopIngestionScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("🛑 Ingestion scheduler stopped");
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  lastRun: number | null;
  isRunning: boolean;
} {
  return {
    running: schedulerInterval !== null,
    lastRun,
    isRunning,
  };
}

export default {
  runIngestionCycle,
  startIngestionScheduler,
  stopIngestionScheduler,
  getSchedulerStatus,
};
