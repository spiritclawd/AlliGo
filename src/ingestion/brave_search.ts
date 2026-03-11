/**
 * AlliGo - Data Ingestion Pipeline
 *
 * Fetches and normalizes AI agent incident data from external sources
 * using Brave Search API
 */

// Brave Search API configuration
const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";

// Incident search queries for AI agent failures
export const INCIDENT_QUERIES = [
  "AI agent financial loss incident 2024 2025",
  "autonomous AI trading bot error crypto loss",
  "AI agent wallet drain exploit hack",
  "Eliza AI agent trading loss incident",
  "AI bot accidentally transferred funds wrong address",
  "AI agent smart contract exploit vulnerability",
  "autonomous agent financial fraud incident",
  "AI trading algorithm loss millions",
  "crypto AI bot security breach",
  "AI agent memecoin trading error",
  "AI agent deepfake fraud",
  "AI agent ransomware attack",
  "autonomous agent error financial damage",
  "AI agent failed arbitrage loss",
  "AI agent NFT trading error",
];

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  page_age?: string;
  language?: string;
}

export interface IngestedIncident {
  source: "brave" | "manual" | "api";
  title: string;
  url: string;
  description: string;
  date: string;
  extractedData?: {
    agentName?: string;
    amountLost?: number;
    chain?: string;
    assetType?: string;
    platform?: string;
  };
}

/**
 * Search Brave API for AI agent incidents
 */
export async function searchBrave(
  query: string,
  count: number = 10
): Promise<BraveSearchResult[]> {
  if (!BRAVE_API_KEY) {
    console.warn("BRAVE_API_KEY not set, skipping search");
    return [];
  }

  try {
    const response = await fetch(
      `${BRAVE_API_URL}?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error(`Brave API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.web?.results || [];
  } catch (error) {
    console.error("Brave search error:", error);
    return [];
  }
}

/**
 * Extract financial amount from text
 */
function extractAmount(text: string): number | undefined {
  // Match patterns like $25M, $1.5 million, 2.5M USD, etc.
  const patterns = [
    /\$([0-9,.]+)\s*([MBKmbk])?(?:\s*(million|billion|thousand))?/gi,
    /([0-9,.]+)\s*(million|billion|thousand)\s*(?:USD|dollars)?/gi,
    /(?:USD|dollars?)\s*([0-9,.]+)\s*(million|billion|thousand)?/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[0].replace(/[^0-9.]/g, ""));
      const multiplier = match[0].toLowerCase().includes("million")
        ? 1_000_000
        : match[0].toLowerCase().includes("billion")
          ? 1_000_000_000
          : match[0].toLowerCase().includes("thousand")
            ? 1_000
            : match[0].toLowerCase().includes("m")
              ? 1_000_000
              : match[0].toLowerCase().includes("k")
                ? 1_000
                : 1;

      return value * multiplier;
    }
  }

  return undefined;
}

/**
 * Extract blockchain/crypto terms
 */
function extractChain(text: string): string | undefined {
  const chains = [
    "ethereum",
    "solana",
    "polygon",
    "arbitrum",
    "optimism",
    "base",
    "bitcoin",
    "bsc",
    "avalanche",
  ];

  const lower = text.toLowerCase();
  for (const chain of chains) {
    if (lower.includes(chain)) return chain;
  }

  return undefined;
}

/**
 * Extract AI agent name patterns
 */
function extractAgentName(text: string): string | undefined {
  // Common AI agent name patterns
  const patterns = [
    /Eliza(?:\s+\w+)?/i,
    /Virtuals?\s+(?:Protocol\s+)?(?:Agent|AI)/i,
    /ai16z/i,
    /Zerebro/i,
    /Lobstar/i,
    /AI\s+(?:Portfolio|Trading|Agent)\s+(?:Manager|Bot)/i,
    /autonomous\s+agent/i,
    /AI\s+bot/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

/**
 * Extract platform/protocol
 */
function extractPlatform(text: string): string | undefined {
  const platforms = [
    "Uniswap",
    "Hyperliquid",
    "Polymarket",
    "OpenSea",
    "Stargate",
    "Binance",
    "Coinbase",
    "auto.fun",
    "Solana DEX",
  ];

  for (const platform of platforms) {
    if (text.toLowerCase().includes(platform.toLowerCase())) {
      return platform;
    }
  }

  return undefined;
}

/**
 * Process a search result into an incident
 */
export function processSearchResult(
  result: BraveSearchResult
): IngestedIncident | null {
  const text = `${result.title} ${result.description}`;

  // Skip if no financial loss mentioned
  const amount = extractAmount(text);
  if (!amount || amount < 1000) {
    return null; // Skip small amounts or no amount found
  }

  return {
    source: "brave",
    title: result.title,
    url: result.url,
    description: result.description,
    date: result.page_age || new Date().toISOString(),
    extractedData: {
      agentName: extractAgentName(text),
      amountLost: amount,
      chain: extractChain(text),
      platform: extractPlatform(text),
    },
  };
}

/**
 * Run all discovery queries and return incidents
 */
export async function discoverIncidents(): Promise<IngestedIncident[]> {
  const allIncidents: IngestedIncident[] = [];

  console.log("Starting incident discovery...");

  for (const query of INCIDENT_QUERIES) {
    console.log(`Searching: ${query}`);
    const results = await searchBrave(query);

    for (const result of results) {
      const incident = processSearchResult(result);
      if (incident) {
        allIncidents.push(incident);
      }
    }

    // Rate limiting - be nice to the API
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allIncidents.filter((incident) => {
    if (seen.has(incident.url)) return false;
    seen.add(incident.url);
    return true;
  });

  console.log(`Discovered ${unique.length} potential incidents`);
  return unique;
}

/**
 * Run ingestion on a schedule
 */
export function startIngestionScheduler(
  intervalMs: number = 24 * 60 * 60 * 1000, // Default: 24 hours
  onIncidents?: (incidents: IngestedIncident[]) => void
): ReturnType<typeof setInterval> {
  console.log(`Starting ingestion scheduler (every ${intervalMs / 1000 / 60 / 60} hours)`);

  // Run immediately
  discoverIncidents().then(onIncidents);

  // Then on interval
  return setInterval(async () => {
    const incidents = await discoverIncidents();
    if (onIncidents) onIncidents(incidents);
  }, intervalMs);
}
