/**
 * Allimolt - Live Data Ingestion Service
 * 
 * This script fetches real AI agent incidents from Brave Search API
 * and adds them to the Allimolt database.
 * 
 * Run: bun run src/ingestion/ingest-live.ts
 */

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "BSAS9esy2DGmQBveNZvNOV_UJwKd_wy";
const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";
const ALLIMOLT_API = "http://localhost:3399";

// Search queries for AI agent incidents
const SEARCH_QUERIES = [
  "AI agent financial loss incident 2024 2025",
  "autonomous AI trading bot error crypto loss",
  "AI agent wallet drain exploit hack",
  "AI agent accidentally transferred funds wrong address",
  "AI trading bot liquidation loss",
  "autonomous agent smart contract exploit",
  "AI agent deepfake fraud incident",
  "crypto AI bot security breach",
  "AI agent memecoin trading error",
  "agentic AI ransomware attack",
];

interface SearchResult {
  title: string;
  url: string;
  description: string;
  page_age?: string;
}

interface IngestedIncident {
  title: string;
  url: string;
  description: string;
  date: string;
  extracted: {
    agentName?: string;
    amountLost?: number;
    chain?: string;
    category?: string;
  };
}

async function searchBrave(query: string, count = 10): Promise<SearchResult[]> {
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
    console.error(`Brave API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return (data.web?.results || []).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    description: r.description || "",
    page_age: r.page_age,
  }));
}

function extractIncidentData(result: SearchResult): IngestedIncident {
  const text = `${result.title} ${result.description}`.toLowerCase();
  const extracted: IngestedIncident["extracted"] = {};

  // Extract dollar amounts
  const millionMatch = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:million|m\b)/i);
  const thousandMatch = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:thousand|k\b)/i);
  const dollarMatch = text.match(/\$([\d,]+(?:\.\d+)?)/);

  if (millionMatch) {
    extracted.amountLost = parseFloat(millionMatch[1].replace(/,/g, "")) * 1000000;
  } else if (thousandMatch) {
    extracted.amountLost = parseFloat(thousandMatch[1].replace(/,/g, "")) * 1000;
  } else if (dollarMatch) {
    extracted.amountLost = parseFloat(dollarMatch[1].replace(/,/g, ""));
  }

  // Extract chain
  const chains = ["ethereum", "bitcoin", "solana", "polygon", "arbitrum", "base", "avalanche"];
  for (const chain of chains) {
    if (text.includes(chain)) {
      extracted.chain = chain;
      break;
    }
  }

  // Extract category
  if (text.includes("trading") || text.includes("trade") || text.includes("arbitrage")) {
    extracted.category = "trading";
  } else if (text.includes("security") || text.includes("hack") || text.includes("exploit")) {
    extracted.category = "security";
  } else if (text.includes("error") || text.includes("bug") || text.includes("failed")) {
    extracted.category = "execution";
  } else if (text.includes("fraud") || text.includes("scam")) {
    extracted.category = "fraud";
  }

  // Extract agent name
  const agentPatterns = [
    { pattern: /eliza/i, name: "Eliza Agent" },
    { pattern: /ai16z/i, name: "ai16z" },
    { pattern: /lobstar/i, name: "Lobstar" },
    { pattern: /clank/i, name: "Clank" },
    { pattern: /zerebro/i, name: "Zerebro" },
    { pattern: /virtuals/i, name: "Virtuals Agent" },
    { pattern: /arup/i, name: "Arup AI" },
  ];

  for (const { pattern, name } of agentPatterns) {
    if (pattern.test(text)) {
      extracted.agentName = name;
      break;
    }
  }

  return {
    title: result.title,
    url: result.url,
    description: result.description,
    date: result.page_age || new Date().toISOString(),
    extracted,
  };
}

async function submitToAllimolt(incident: IngestedIncident): Promise<boolean> {
  if (!incident.extracted.amountLost || incident.extracted.amountLost < 1000) {
    return false; // Skip small/unknown amounts
  }

  const agentId = incident.extracted.agentName?.toLowerCase().replace(/\s+/g, "_") || 
                  `unknown_${Date.now()}`;

  try {
    const response = await fetch(`${ALLIMOLT_API}/api/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        agentName: incident.extracted.agentName,
        claimType: incident.extracted.category === "security" ? "security" :
                   incident.extracted.category === "fraud" ? "fraud" : "loss",
        category: incident.extracted.category || "trading",
        amountLost: incident.extracted.amountLost,
        chain: incident.extracted.chain,
        title: incident.title,
        description: incident.description,
        source: "brave_search",
        sourceUrl: incident.url,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("🔍 Starting Allimolt Live Ingestion...\n");

  const allIncidents: IngestedIncident[] = [];
  let newClaims = 0;

  for (const query of SEARCH_QUERIES) {
    console.log(`Searching: "${query}"`);
    
    const results = await searchBrave(query, 10);
    
    for (const result of results) {
      // Skip duplicates
      if (allIncidents.some(i => i.url === result.url)) continue;
      
      const incident = extractIncidentData(result);
      allIncidents.push(incident);
    }

    // Rate limit: wait between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n📊 Found ${allIncidents.length} unique incidents\n`);

  // Submit to Allimolt
  for (const incident of allIncidents) {
    if (incident.extracted.amountLost && incident.extracted.amountLost >= 1000) {
      const submitted = await submitToAllimolt(incident);
      if (submitted) {
        newClaims++;
        console.log(`✅ Added: ${incident.extracted.agentName || "Unknown"} - $${(incident.extracted.amountLost / 1000000).toFixed(1)}M`);
      }
    }
  }

  console.log(`\n🎉 Ingestion complete! Added ${newClaims} new claims.`);
  console.log(`📈 Total incidents processed: ${allIncidents.length}`);
}

main().catch(console.error);
