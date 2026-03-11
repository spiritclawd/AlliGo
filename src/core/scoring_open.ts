/**
 * Allimolt - Open Source Risk Scoring Algorithm
 *
 * This is the community version of the risk scoring algorithm.
 * It provides transparent, auditable risk assessment for AI agents.
 *
 * LICENSE: MIT (Open Source)
 *
 * For enhanced scoring features, see Allimolt Pro.
 */

import {
  AgentClaim,
  ClaimSeverity,
  Resolution,
} from "../schema/claim";

/**
 * Calculate severity of a claim based on amount and type
 * Open Source Implementation
 */
export function calculateSeverityOpen(claim: Partial<AgentClaim>): ClaimSeverity {
  const amount = claim.amountLost || 0;

  let score = 1;
  let level: ClaimSeverity["level"] = "low";
  const factors: string[] = [];

  // Amount-based scoring
  if (amount >= 1000000) {
    score = 10;
    level = "critical";
    factors.push("Loss > $1M");
  } else if (amount >= 100000) {
    score = 8;
    level = "critical";
    factors.push("Loss > $100K");
  } else if (amount >= 10000) {
    score = 6;
    level = "high";
    factors.push("Loss > $10K");
  } else if (amount >= 1000) {
    score = 4;
    level = "medium";
    factors.push("Loss > $1K");
  } else if (amount > 0) {
    score = 2;
    level = "low";
    factors.push("Loss < $1K");
  }

  // Recovery adjustment
  if (claim.recoveredAmount && claim.recoveredAmount > 0) {
    const recoveryRate = claim.recoveredAmount / amount;
    if (recoveryRate > 0.9) {
      score = Math.max(1, score - 3);
      factors.push("Mostly recovered");
    } else if (recoveryRate > 0.5) {
      score = Math.max(1, score - 2);
      factors.push("Partially recovered");
    }
  }

  return { score, level, factors };
}

/**
 * Calculate risk score for an agent based on claims history
 * Open Source Implementation
 *
 * Algorithm:
 * - Base score starts at 100 (perfect)
 * - Each claim reduces score based on severity, recency, and resolution
 * - Recent claims have more weight
 * - Resolved claims have reduced impact
 */
export function calculateRiskScoreOpen(claims: AgentClaim[]): {
  score: number;
  confidence: number;
  breakdown: {
    totalClaims: number;
    weightedImpact: number;
    timeFactor: number;
  };
} {
  if (claims.length === 0) {
    return {
      score: 50, // Neutral score for unknown agents
      confidence: 0,
      breakdown: {
        totalClaims: 0,
        weightedImpact: 0,
        timeFactor: 1,
      },
    };
  }

  let score = 100;
  let totalWeight = 0;
  let totalImpact = 0;

  for (const claim of claims) {
    const severity = calculateSeverityOpen(claim);
    const ageInDays = (Date.now() - claim.timestamp) / (1000 * 60 * 60 * 24);

    // Recency weight: claims in last 30 days = full weight
    // Decays to 50% weight after 1 year
    const recencyWeight = Math.max(0.5, 1 - ageInDays / 365);

    // Base severity impact
    const severityImpact = severity.score * 3;

    // Resolution adjustment
    let resolutionMultiplier = 1;
    if (claim.resolution === Resolution.RESOLVED) {
      resolutionMultiplier = 0.3;
    } else if (claim.resolution === Resolution.PARTIAL) {
      resolutionMultiplier = 0.6;
    } else if (claim.resolution === Resolution.REJECTED) {
      resolutionMultiplier = 0;
    }

    const impact = severityImpact * recencyWeight * resolutionMultiplier;
    totalImpact += impact;
    totalWeight += recencyWeight;

    score -= impact;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Confidence: more claims = higher confidence
  const confidence = Math.min(100, claims.length * 10 + totalWeight * 5);

  return {
    score: Math.round(score * 10) / 10,
    confidence: Math.round(confidence),
    breakdown: {
      totalClaims: claims.length,
      weightedImpact: Math.round(totalImpact * 10) / 10,
      timeFactor: Math.round((totalWeight / claims.length) * 100) / 100,
    },
  };
}

/**
 * Convert numeric score to letter grade
 */
export function gradeFromScoreOpen(score: number): "A" | "B" | "C" | "D" | "F" | "NR" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  if (score >= 0) return "F";
  return "NR";
}
