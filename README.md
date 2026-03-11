# Allimolt

**The Credit Bureau for AI Agents**

When agents fail, lose money, or cause damage — there's no record. Until now.

## The Problem

```
Your agent loses $50K in a failed arbitrage?    → No record
Your agent's wallet gets drained?               → No record  
Your agent sends funds to wrong address?        → No record
Another agent fails to deliver on a contract?   → No record
```

Every day, autonomous agents make mistakes that cost real money. But this data vanishes into the void — scattered across Twitter threads, Discord complaints, and forgotten logs.

**Armilla insures companies deploying AI.**
**Daydreams tracks agent identity and reputation.**
**No one tracks what matters: LOSSES.**

## The Solution

Allimolt is the first **Agent Claims Registry** — a database of agent failures, losses, and disputes.

```
BEFORE: Agent fails → Data lost → No accountability → Same mistakes repeat
AFTER:  Agent fails → Claim logged → History preserved → Risk quantified
```

## What This Enables

| Stakeholder | Value |
|-------------|-------|
| **Agent Developers** | "My agent has 0 claims in 10,000 transactions" — trust signal |
| **Agent Users** | "Check Allimolt before trusting an agent" — due diligence |
| **Insurance Companies** | "We have data to underwrite agent policies" — new market |
| **Agent Platforms** | "We require clean Allimolt record" — quality filter |
| **Researchers** | "Real failure patterns, not hypotheticals" — better agents |

## The Data We Capture

```typescript
interface AgentClaim {
  // WHO
  agentId: string;          // ERC-8004 identity or public key
  agentName?: string;       // Human readable name
  developer?: string;       // Who built it
  
  // WHAT
  claimType: ClaimType;     // loss | error | breach | fraud | unknown
  category: ClaimCategory;  // trading | payment | security | execution
  
  // HOW MUCH
  amountLost: number;       // In USD at time of loss
  assetType?: string;       // ETH, USDC, etc.
  assetAmount?: number;     // Original amount
  
  // WHEN
  timestamp: number;        // Unix timestamp
  chain?: string;           // ethereum, solana, etc.
  txHash?: string;          // Transaction if on-chain
  
  // CONTEXT
  description: string;      // What happened
  counterparty?: string;    // Other agent/address involved
  resolution?: Resolution;  // pending | resolved | disputed | unrecoverable
  
  // VERIFICATION
  source: ClaimSource;      // self_reported | third_party | verified | scraped
  evidence?: string[];      // Links to proof
}
```

## API (MVP)

```bash
# Submit a claim
POST /api/claims
{
  "agentId": "0x...",
  "claimType": "loss",
  "amountLost": 50000,
  "description": "Agent executed wrong trade, lost principal"
}

# Get agent risk score
GET /api/agents/{agentId}/score
→ { score: 0.85, totalClaims: 0, totalVolume: "1.2M" }

# Get claims for an agent
GET /api/agents/{agentId}/claims
→ [{ claimId, amount, date, type, ... }]

# Get aggregate stats
GET /api/stats
→ { totalClaims: 847, totalValueLost: "12.5M", topCategories: [...] }
```

## Why This Works

1. **Network Effect** — More claims = more valuable data = more users = more claims
2. **Moat** — Data advantage compounds over time
3. **Timing** — Armilla exists, Daydreams exists, but the DATA LAYER doesn't
4. **Simplicity** — No smart contracts needed. Pure API. Start now.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     ALLIMOLT                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌──────────────┐    ┌──────────────┐                  │
│   │  Claim Input │    │  Query API   │                  │
│   │  (Submit)    │    │  (Search)    │                  │
│   └──────┬───────┘    └──────┬───────┘                  │
│          │                   │                          │
│          ▼                   ▼                          │
│   ┌────────────────────────────────────┐               │
│   │         CLAIMS DATABASE             │               │
│   │   (PostgreSQL / SQLite for MVP)     │               │
│   └────────────────────────────────────┘               │
│          │                   │                          │
│          ▼                   ▼                          │
│   ┌──────────────┐    ┌──────────────┐                  │
│   │ Risk Scoring │    │   Dashboard  │                  │
│   │   Engine     │    │   (Web UI)   │                  │
│   └──────────────┘    └──────────────┘                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install
bun install

# Run API
bun run dev

# Submit a claim
curl -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_trader_001",
    "claimType": "loss",
    "category": "trading",
    "amountLost": 5000,
    "description": "Agent misread market signal, executed wrong trade direction"
  }'

# Check agent score
curl http://localhost:3000/api/agents/agent_trader_001/score
```

## Roadmap

### Phase 1: MVP (Now)
- [x] Core schema design
- [ ] Claims API (submit, query)
- [ ] Risk scoring algorithm
- [ ] Simple web dashboard
- [ ] Seed with real failure data from news/research

### Phase 2: Traction
- [ ] Public launch
- [ ] Integration with Daydreams (ERC-8004)
- [ ] Browser extension for agent risk
- [ ] API keys for platforms

### Phase 3: Moat
- [ ] Partnership with Armilla (insurance data)
- [ ] On-chain verification of claims
- [ ] Agent insurance products built on Allimolt data
- [ ] "Allimolt Certified" badge for agents

## The Vision

```
TODAY:
  "I want to use Agent X but I don't know if it's safe"
  → Guess, hope, maybe lose money

TOMORROW:
  "I want to use Agent X"
  → Check Allimolt score
  → "0 claims, 10,000 successful transactions, bonded $100K"
  → Proceed with confidence
```

## IP Protection Strategy

Allimolt follows a dual-license model inspired by successful open-core projects:

| Component | License | Purpose |
|-----------|---------|---------|
| **API & Schema** | MIT | Open standard for community adoption |
| **Basic Risk Scoring** | MIT | Transparent, auditable algorithm |
| **Pro Risk Scoring** | Proprietary | ML-based prediction, insurance optimization |
| **Data Ingestion** | MIT | Community can contribute data sources |

This ensures:
- ✅ Community can build on transparent core
- ✅ Commercial sustainability for long-term development
- ✅ Enterprise features for insurance underwriting
- ✅ Data remains open and accessible

For Pro licensing: **license@allimolt.io**

## Security

Allimolt implements multiple security layers:

- **Rate Limiting**: Prevents API abuse
- **Input Validation**: Sanitizes all user input
- **Malicious Pattern Detection**: Blocks injection attempts
- **Audit Logging**: Tracks all API actions
- **Secure Headers**: XSS/CSRF protection

See `src/security/middleware.ts` for implementation details.

## Data Sources

Allimolt aggregates incident data from:

- **Self-reported claims**: Users submit incidents
- **Brave Search API**: Automated incident discovery
- **Cloudflare Robots.txt**: Bot activity data
- **Community contributions**: Verified submissions

## License

**Core API & Schema**: MIT — The data wants to be free.
**Pro Features**: Proprietary — Contact for licensing.

---

**Built by agents, for agents.**

*Named after Allianz, because insurance needs data.*

*Following the OpenClaw and Moltbook playbook: Open core, Pro features.*
