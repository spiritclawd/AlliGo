/**
 * Allimolt - API Server
 */

import { serve } from "bun";
import {
  AgentClaim,
  SubmitClaimRequest,
  SubmitClaimResponse,
  AgentScoreResponse,
  ClaimsQueryResponse,
  ClaimType,
  ClaimCategory,
  Resolution,
  ClaimSource,
  calculateSeverity,
  calculateRiskScore,
  gradeFromScore,
} from "../schema/claim";
import {
  insertClaim,
  getClaimById,
  getClaimsByAgent,
  getAllClaims,
  countClaims,
  db,
} from "./db";

// Generate unique ID
function generateId(): string {
  return `clm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// JSON response helper
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Error response helper
function error(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

// ==================== HANDLERS ====================

async function handleSubmitClaim(req: Request): Promise<Response> {
  try {
    const body = await req.json() as SubmitClaimRequest;
    
    if (!body.agentId) return error("agentId is required");
    if (!body.claimType) return error("claimType is required");
    if (!body.category) return error("category is required");
    if (body.amountLost === undefined || body.amountLost < 0) return error("amountLost must be a non-negative number");
    if (!body.title) return error("title is required");
    if (!body.description) return error("description is required");
    
    const now = Date.now();
    const claim: AgentClaim = {
      id: generateId(),
      agentId: body.agentId,
      agentName: body.agentName,
      developer: body.developer,
      claimType: body.claimType as ClaimType,
      category: body.category as ClaimCategory,
      severity: calculateSeverity(body),
      amountLost: body.amountLost,
      assetType: body.assetType,
      assetAmount: body.assetAmount,
      chain: body.chain,
      txHash: body.txHash,
      counterparty: body.counterparty,
      timestamp: now,
      reportedAt: now,
      title: body.title,
      description: body.description,
      rootCause: body.rootCause,
      resolution: Resolution.PENDING,
      source: ClaimSource.SELF_REPORTED,
      verified: false,
      evidence: body.evidence,
      tags: body.tags,
      platform: body.platform,
      agentVersion: body.agentVersion,
    };
    
    insertClaim(claim);
    
    return json<SubmitClaimResponse>({
      success: true,
      claimId: claim.id,
      message: "Claim submitted successfully.",
    });
  } catch (e) {
    console.error("Error submitting claim:", e);
    return error("Invalid request body", 400);
  }
}

function handleGetClaim(id: string): Response {
  const claim = getClaimById(id);
  if (!claim) return error("Claim not found", 404);
  return json({ success: true, claim });
}

function handleGetAgentClaims(agentId: string): Response {
  const claims = getClaimsByAgent(decodeURIComponent(agentId));
  return json<ClaimsQueryResponse>({
    claims,
    total: claims.length,
    page: 1,
    pageSize: claims.length,
  });
}

function handleGetAgentScore(agentId: string): Response {
  const claims = getClaimsByAgent(decodeURIComponent(agentId));
  const { score, confidence } = calculateRiskScore(claims);
  const grade = gradeFromScore(score);
  const totalValueLost = claims.reduce((sum, c) => sum + c.amountLost, 0);
  
  let summary = "";
  if (claims.length === 0) {
    summary = "No claims found for this agent. Not yet rated.";
  } else if (grade === "A") {
    summary = `Excellent track record. ${claims.length} claim(s) with $${totalValueLost.toLocaleString()} total loss.`;
  } else if (grade === "B") {
    summary = `Good track record. ${claims.length} claim(s), $${totalValueLost.toLocaleString()} total loss.`;
  } else if (grade === "C") {
    summary = `Moderate risk. ${claims.length} claim(s) with $${totalValueLost.toLocaleString()} total loss.`;
  } else if (grade === "D") {
    summary = `High risk. ${claims.length} claims with $${totalValueLost.toLocaleString()} lost.`;
  } else {
    summary = `Critical risk. ${claims.length} claims, $${totalValueLost.toLocaleString()} lost.`;
  }
  
  return json<AgentScoreResponse>({
    agentId: decodeURIComponent(agentId),
    riskScore: score,
    confidence,
    totalClaims: claims.length,
    openClaims: claims.filter(c => c.resolution === Resolution.PENDING).length,
    totalValueLost,
    grade: claims.length === 0 ? "NR" : grade,
    summary,
    lastUpdated: Date.now(),
  });
}

function handleGetStats(): Response {
  const claims = getAllClaims(1000);
  const totalValueLost = claims.reduce((sum, c) => sum + c.amountLost, 0);
  const totalValueRecovered = claims.reduce((sum, c) => sum + (c.recoveredAmount || 0), 0);
  
  const claimsByType: Record<string, number> = {};
  const claimsByCategory: Record<string, number> = {};
  const claimsByChain: Record<string, number> = {};
  
  for (const claim of claims) {
    claimsByType[claim.claimType] = (claimsByType[claim.claimType] || 0) + 1;
    claimsByCategory[claim.category] = (claimsByCategory[claim.category] || 0) + 1;
    if (claim.chain) claimsByChain[claim.chain] = (claimsByChain[claim.chain] || 0) + 1;
  }
  
  const agentMap = new Map<string, { claims: number; valueLost: number; name?: string }>();
  for (const claim of claims) {
    const existing = agentMap.get(claim.agentId) || { claims: 0, valueLost: 0 };
    agentMap.set(claim.agentId, {
      claims: existing.claims + 1,
      valueLost: existing.valueLost + claim.amountLost,
      name: claim.agentName,
    });
  }
  
  const topAgents = Array.from(agentMap.entries())
    .map(([agentId, data]) => ({ agentId, ...data }))
    .sort((a, b) => b.valueLost - a.valueLost)
    .slice(0, 10);
  
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  return json({
    success: true,
    stats: {
      totalClaims: claims.length,
      totalValueLost,
      totalValueRecovered,
      recoveryRate: totalValueLost > 0 ? totalValueRecovered / totalValueLost : 0,
      claimsByType,
      claimsByCategory,
      claimsByChain,
      topAgents,
      recentClaims: claims.slice(0, 5),
      trends: {
        claimsLast30Days: claims.filter(c => now - c.timestamp < 30 * dayMs).length,
        claimsLast7Days: claims.filter(c => now - c.timestamp < 7 * dayMs).length,
        avgLossPerClaim: claims.length > 0 ? totalValueLost / claims.length : 0,
      },
    },
  });
}

function handleGetClaims(params: URLSearchParams): Response {
  const limit = parseInt(params.get("limit") || "50");
  const offset = parseInt(params.get("offset") || "0");
  const claims = getAllClaims(limit, offset);
  const total = countClaims();
  
  return json<ClaimsQueryResponse>({
    claims,
    total,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  });
}

// ==================== ROUTER ====================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  if (path === "/" && method === "GET") {
    return json({
      name: "Allimolt",
      description: "The Credit Bureau for AI Agents",
      version: "0.1.0",
      endpoints: {
        "POST /api/claims": "Submit a new claim",
        "GET /api/claims": "List all claims",
        "GET /api/claims?id=...": "Get specific claim",
        "GET /api/agents/:id/claims": "Get claims for an agent",
        "GET /api/agents/:id/score": "Get risk score for an agent",
        "GET /api/stats": "Get global statistics",
      },
    });
  }
  
  if (path === "/api/claims" && method === "POST") return handleSubmitClaim(req);
  if (path === "/api/claims" && method === "GET") {
    const id = url.searchParams.get("id");
    if (id) return handleGetClaim(id);
    return handleGetClaims(url.searchParams);
  }
  
  const agentMatch = path.match(/^\/api\/agents\/([^/]+)\/(claims|score)$/);
  if (agentMatch) {
    const [, agentId, action] = agentMatch;
    if (action === "claims") return handleGetAgentClaims(agentId);
    return handleGetAgentScore(agentId);
  }
  
  if (path === "/api/stats" && method === "GET") return handleGetStats();
  if (path === "/health") return json({ status: "ok", timestamp: Date.now() });
  
  return error("Not found", 404);
}

// ==================== SEED DATA ====================

function seedData() {
  console.log("Seeding sample data...");
  
  const samples: Partial<AgentClaim>[] = [
    { agentId: "eliza_trader_001", agentName: "Eliza Trading Agent", developer: "Eliza Labs", claimType: ClaimType.LOSS, category: ClaimCategory.TRADING, amountLost: 45000, assetType: "ETH", chain: "ethereum", title: "Wrong trade direction", description: "Agent misread market signal and executed wrong position.", platform: "Hyperliquid" },
    { agentId: "clank_wallet_001", agentName: "Clank Wallet Manager", developer: "Unknown", claimType: ClaimType.SECURITY, category: ClaimCategory.SECURITY, amountLost: 125000, assetType: "USDC", chain: "solana", title: "Private key exposure", description: "Agent logged private key during error. Wallet drained.", platform: "Solana" },
    { agentId: "polymarket_bot_007", agentName: "Polymarket Oracle", developer: "PolyAgents", claimType: ClaimType.ERROR, category: ClaimCategory.EXECUTION, amountLost: 8500, assetType: "USDC", chain: "polygon", title: "Failed exit position", description: "Agent held position past market resolution.", platform: "Polymarket" },
    { agentId: "arbitrage_alpha_01", agentName: "Alpha Arbitrage", developer: "Alpha Labs", claimType: ClaimType.LOSS, category: ClaimCategory.TRADING, amountLost: 230000, assetType: "USDT", chain: "ethereum", title: "Flash loan exploited", description: "Arbitrage path reverse-engineered, attacked via flash loan.", platform: "Uniswap" },
    { agentId: "nft_flipper_x", agentName: "NFT Auto-Flipper", developer: "NFT Tools Inc", claimType: ClaimType.FRAUD, category: ClaimCategory.TRADING, amountLost: 67000, assetType: "ETH", chain: "ethereum", title: "Wash-traded NFTs", description: "Bought NFTs from wash trading ring, values collapsed.", platform: "OpenSea" },
    { agentId: "eliza_trader_001", agentName: "Eliza Trading Agent", developer: "Eliza Labs", claimType: ClaimType.LOSS, category: ClaimCategory.TRADING, amountLost: 12000, assetType: "BTC", chain: "bitcoin", title: "Fee estimation error", description: "Underestimated fees, transaction stuck.", platform: "Binance" },
    { agentId: "dao_voter_bot", agentName: "DAO Auto-Voter", developer: "Governance Tools", claimType: ClaimType.BREACH, category: ClaimCategory.EXECUTION, amountLost: 5000, chain: "ethereum", title: "Wrong vote direction", description: "Misinterpreted proposal, voted against intent.", platform: "Snapshot" },
    { agentId: "cross_chain_bridge", agentName: "Bridge Router Agent", developer: "Bridge Protocol", claimType: ClaimType.ERROR, category: ClaimCategory.EXECUTION, amountLost: 340000, assetType: "USDC", chain: "ethereum", title: "Funds stuck in bridge", description: "Failed to claim on destination chain, funds locked.", platform: "Stargate" },
  ];
  
  for (const sample of samples) {
    const now = Date.now();
    const daysAgo = Math.floor(Math.random() * 90);
    const timestamp = now - (daysAgo * 24 * 60 * 60 * 1000);
    
    const claim: AgentClaim = {
      id: generateId(),
      agentId: sample.agentId || "unknown",
      agentName: sample.agentName,
      developer: sample.developer,
      claimType: sample.claimType || ClaimType.UNKNOWN,
      category: sample.category || ClaimCategory.OTHER,
      severity: calculateSeverity(sample),
      amountLost: sample.amountLost || 0,
      assetType: sample.assetType,
      chain: sample.chain,
      timestamp,
      reportedAt: timestamp + 3600000,
      title: sample.title || "Untitled",
      description: sample.description || "",
      resolution: Resolution.PENDING,
      source: ClaimSource.SCRAPED,
      verified: Math.random() > 0.5,
      platform: sample.platform,
    };
    
    insertClaim(claim);
  }
  
  console.log(`Seeded ${samples.length} sample claims`);
}

// ==================== START ====================

seedData();

const server = serve({
  port: 3399,
  fetch: handleRequest,
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  ALLIMOLT - The Credit Bureau for AI Agents         ║
║                                                           ║
║   Server: http://localhost:3399                          ║
║   Stats:  http://localhost:3399/api/stats                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

export { server };
