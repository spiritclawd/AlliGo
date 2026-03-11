/**
 * Allimolt - Data Ingestion Pipeline
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
  count = 10
): Promise<BraveSearchResult[]> {
  if (!BRAVE_API_KEY) {
    console.warn("Brave API key not configured. Set BRAVE_API_KEY environment variable.");
    return [];
  }

  try {
    const url = new URL(BRAVE_API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`Brave API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (!data.web || !data.web.results) {
      return [];
    }

    return data.web.results.map((result: any) => ({
      title: result.title || "",
      url: result.url || "",
      description: result.description || "",
      page_age: result.page_age,
      language: result.language,
    }));
  } catch (error) {
    console.error("Brave search error:", error);
    return [];
  }
}

/**
 * Run all configured searches and return aggregated results
 */
export async function ingestIncidents(): Promise<IngestedIncident[]> {
  const allIncidents: IngestedIncident[] = [];

  console.log("Starting incident ingestion...");

  for (const query of INCIDENT_QUERIES) {
    console.log(`Searching: ${query}`);
    const results = await searchBrave(query, 10);

    for (const result of results) {
      // Skip duplicates
      if (allIncidents.some((i) => i.url === result.url)) {
        continue;
      }

      allIncidents.push({
        source: "brave",
        title: result.title,
        url: result.url,
        description: result.description,
        date: result.page_age || new Date().toISOString(),
        extractedData: extractIncidentData(result),
      });
    }

    // Rate limiting: wait 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`Ingested ${allIncidents.length} unique incidents`);
  return allIncidents;
}

/**
 * Extract structured data from search result
 */
function extractIncidentData(result: BraveSearchResult): IngestedIncident["extractedData"] {
  const text = `${result.title} ${result.description}`.toLowerCase();
  const extracted: IngestedIncident["extractedData"] = {};

  // Extract dollar amounts
  const amountPatterns = [
    /\$([\d,]+(?:\.\d+)?)\s*(?:million|m\b)/gi,
    /\$([\d,]+(?:\.\d+)?)\s*(?:thousand|k\b)/gi,
    /\$([\d,]+(?:\.\d+)?)/g,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = parseFloat(match[0].replace(/[$,]/g, "").replace(/million|m/i, "000000").replace(/thousand|k/i, "000"));
      if (amount > 0) {
        extracted.amountLost = amount;
        break;
      }
    }
  }

  // Extract chain names
  const chains = ["ethereum", "bitcoin", "solana", "polygon", "arbitrum", "base", "avalanche"];
  for (const chain of chains) {
    if (text.includes(chain)) {
      extracted.chain = chain;
      break;
    }
  }

  // Extract asset types
  const assets = ["eth", "btc", "usdc", "usdt", "sol", "btc"];
  for (const asset of assets) {
    if (text.includes(asset)) {
      extracted.assetType = asset.toUpperCase();
      break;
    }
  }

  // Extract platform names
  const platforms = ["opensea", "uniswap", "hyperliquid", "polymarket", "binance", "coinbase"];
  for (const platform of platforms) {
    if (text.includes(platform)) {
      extracted.platform = platform;
      break;
    }
  }

  // Extract agent names (common AI agent projects)
  const agentPatterns = [
    { pattern: /eliza\s*(agent|trading)?/i, name: "Eliza Agent" },
    { pattern: /ai16z/i, name: "ai16z" },
    { pattern: /lobstar\s*wilde/i, name: "Lobstar Wilde" },
    { pattern: /clank/i, name: "Clank" },
    { pattern: /zerebro/i, name: "Zerebro" },
    { pattern: /virtuals/i, name: "Virtuals" },
  ];

  for (const { pattern, name } of agentPatterns) {
    if (pattern.test(text)) {
      extracted.agentName = name;
      break;
    }
  }

  return extracted;
}

/**
 * Convert ingested incident to claim format
 */
export function incidentToClaim(incident: IngestedIncident): {
  agentId: string;
  title: string;
  description: string;
  amountLost: number;
  chain?: string;
  assetType?: string;
  platform?: string;
  source: string;
  sourceUrl: string;
} {
  const data = incident.extractedData || {};

  return {
    agentId: data.agentName?.toLowerCase().replace(/\s+/g, "_") || "unknown_agent",
    title: incident.title,
    description: incident.description,
    amountLost: data.amountLost || 0,
    chain: data.chain,
    assetType: data.assetType,
    platform: data.platform,
    source: "brave_search",
    sourceUrl: incident.url,
  };
}

/**
 * Fetch content from Cloudflare robots.txt endpoint
 * for additional bot/AI agent incident data
 */
export async function fetchCloudflareRobots(domain: string): Promise<string | null> {
  const url = `https://developers.cloudflare.com/browser-rendering/reference/robots-txt/${domain}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Cloudflare robots.txt fetch error for ${domain}:`, error);
    return null;
  }
}
