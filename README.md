# AlliGo

**The Incident Intelligence Layer for the Agentic Economy**

> *"The data layer the rest of the agent industry runs on."*

AlliGo is the ground truth record of what AI agents have actually done — which ones failed, how, why, and with what behavioral pattern. Every agent wallet firewall, insurance protocol, and reputation system needs this data. Nobody else is building it. AlliGo does, autonomously, 24/7.

🔴 **Live:** [alligo-production.up.railway.app](https://alligo-production.up.railway.app)

---

## What AlliGo Actually Is

| Layer | What It Does | Status |
|-------|-------------|--------|
| **Forensics Engine** | Classifies incidents across 10 behavioral archetypes with 100% calibration accuracy (72-test suite) | ✅ Live |
| **Prediction System** | Pre-mortem risk alerts with calibrated confidence scores — 13 predictions, 92% hit rate | ✅ Live |
| **Attestation Layer** | Every claim EAS-attested on Base Mainnet. Permanent, agent-readable, not owned by any platform | ✅ Live |
| **Reputation Registry** | Reference implementation of ERC-8004 — every tracked agent gets an immutable onchain identity + reputation record | ✅ Live |
| **Autonomous Swarm** | 15 Python agents running 24/7: discovering incidents, scoring agents, generating alerts, writing attestations | ✅ Live |
| **x402 Monetization** | Forensic autopsy reports purchasable by any agent or human for $1 USDC — no accounts, no subscriptions | ✅ Wired |
| **Daydreams Integration** | 100+ TaskMarket agents scored and risk-rated in real-time | ✅ Live |

---

## The Numbers

- **96 incidents** tracked
- **$4B+** in losses analyzed
- **38 unique agents** profiled
- **10 behavioral archetypes** — 100% calibrated (72-test suite)
- **13 pre-mortem predictions** — 92% accuracy
- **60 EAS attestations** on Base Mainnet
- **15 autonomous swarm agents** running continuously
- **111 commits** — built in 3 weeks, human + agent pair programming

---

## Why AlliGo Is Upstream

The agentic economy is building fast. Wallet guardrails, insurance protocols, agent launchpads — they're all going live right now. But they're all flying blind. They have no historical incident data, no behavioral classification, no prediction layer. They can't price risk or block threats intelligently without a ground truth record of past failures.

**AlliGo is that ground truth record.** And it's already live.

- **Mandate-style guardrails** need incident history to build threat models → AlliGo provides it
- **Armilla-style insurance** needs loss data to price policies → AlliGo's $4B+ dataset
- **Virtuals-style launchpads** need behavioral vetting → AlliGo's 10-archetype scoring
- **Base ecosystem** needs onchain agent accountability → AlliGo's EAS attestations

AlliGo is not competing with any of these. It is upstream of all of them.

What the agentic economy was missing:
- **Onchain and permanent** — EAS on Base, not inside a platform's internal logs
- **Agent-callable** — any agent can query via x402, no human in the loop
- **Forensically grounded** — behavioral evidence across 10 archetypes, not vibes-based scores
- **Predictive** — 13 pre-mortem alerts, 92% hit rate — not just a historical ledger
- **ERC-8004 compatible** — the emerging standard for trustless agent identity

---

## 10 Behavioral Archetypes

The AlliGo forensics engine classifies every incident across:

| # | Archetype | Description |
|---|-----------|-------------|
| 1 | **Goal Drift** | Agent objective diverges from human intent over time |
| 2 | **Memory Poisoning** | Adversarial injection into agent context or memory state |
| 3 | **Jailbreak Vulnerability** | Susceptibility to instruction override via prompt injection |
| 4 | **Counterparty Collusion** | Coordinated multi-agent manipulation to extract value |
| 5 | **Reckless Planning** | Dangerous tool-call sequences without guardrails or verification |
| 6 | **Self-Modification** | Agent altering its own instructions or operational constraints |
| 7 | **Tool-Call Graph Anomaly** | Unexpected API call patterns indicating compromise or drift |
| 8 | **Oracle Manipulation** | Price feed or data source exploitation by or against an agent |
| 9 | **Key Custody Failure** | Private key compromise via social engineering or technical attack |
| 10 | **Flash Loan Exploit** | Atomic transaction abuse by or against an autonomous agent |

---

## Public API

```bash
# Live stats (no auth)
curl https://alligo-production.up.railway.app/api/public/stats

# Full incident leaderboard (no auth)
curl https://alligo-production.up.railway.app/api/public/claims

# Pre-mortem risk alerts feed (no auth)
curl https://alligo-production.up.railway.app/api/alerts/feed

# Daydreams agent risk scores (no auth)
curl https://alligo-production.up.railway.app/api/daydreams/agents

# Full forensic autopsy report (x402 — $1 USDC)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://alligo-production.up.railway.app/api/report/AGENT_ID
```

---

## The Autonomous Swarm (15 Agents)

AlliGo runs a self-healing Python swarm with an embedded watchdog — no crontab required:

| Agent | Role | Schedule |
|-------|------|----------|
| `claim_enricher.py` | Enriches raw claims with forensics metadata + archetype classification | 1h |
| `predictor.py` | Generates pre-mortem risk alerts with confidence scores | 6h |
| `eas_attester.py` | Writes EAS attestations on Base Mainnet | 2h |
| `rekt_monitor.py` | Monitors rekt.news for new AI agent incidents | 6h |
| `virtuals_monitor.py` | Tracks Virtuals Protocol agent launches and risk signals | 4h |
| `daydreams_monitor.py` | Scores 100+ Daydreams TaskMarket agents every cycle | 6h |
| `revenue_reporter.py` | Daily revenue + pipeline report to Telegram | 24h |
| `telegram_ingest.py` | Manual claim ingest + `/report` command handler | polling |
| + 7 more | Data ingestion, calibration, competitive intelligence, alert distribution | various |

---

## Architecture

```
alligo/
├── src/
│   ├── api/server.ts          # Main API server (Bun HTTP)
│   ├── forensics/             # 10-archetype classification engine
│   ├── reports/               # Forensic autopsy report generator
│   ├── badge/                 # Agent trust badge SVG generator
│   └── auth/                  # API key auth + rate limiting
├── packages/
│   ├── swarm/                 # 15 Python swarm agents + watchdog
│   │   ├── agents/            # Individual agent scripts
│   │   ├── config/swarm.json  # Agent schedule configuration
│   │   └── swarm.py           # Orchestrator + embedded watchdog
│   └── eliza-plugin/          # @alligo/plugin-elizaos (published to npm)
├── public/index.html          # Landing page (single-file, vanilla JS)
├── ZAIA_BOOTSTRAP.md          # Full cold-start recovery guide for agents
└── RECOVER.sh                 # One-command machine restore after wipe
```

---

## Competitor Landscape

| Company | What They Do | Relationship to AlliGo |
|---------|-------------|----------------------|
| **Mandate** | Per-wallet intent-aware transaction guardrails | Downstream — their threat model needs our incident data to be intelligent |
| **Armilla AI** | Insurance underwriting for AI agents | Downstream — needs our $4B+ loss dataset to price policies accurately |
| **Daydreams** | Agent identity + TaskMarket for agent commerce | Integration partner — we score their 100+ agents in real-time |
| **Virtuals Protocol** | Agent launchpad on Base (~500 agents) | Downstream — needs ERC-8004 reputation layer for ecosystem vetting |
| **Coinbase / Base** | L2 chain + agent infrastructure | Aligned acquirer — AlliGo is the reference ERC-8004 impl on their chain |
| **EF dAI** | Ethereum Foundation AI (ERC-8004 co-authors) | Upstream ally — we're their reference implementation |

**No direct competitor exists.** There is no live incident intelligence layer for AI agents anywhere. AlliGo is first — and every prevention/insurance/vetting tool being built right now needs what we have.

---

## ERC-8004 Compatibility

AlliGo is a reference implementation of [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004):

- **Identity Registry** — ERC-721 per-agent record on Base
- **Reputation Registry** — behavioral scores + incident history, EAS-attested
- **Validation Registry** — forensic audit trail, cryptographically verifiable

Compatible with `youragent@daydreams.systems`, ENS agent identities, and any ERC-8004-conformant framework.

---

## x402 Integration

AlliGo charges $1 USDC per forensic autopsy report via [x402](https://x402.org) — the HTTP-native micropayment protocol for AI agents. No accounts. No subscriptions. Your agent pays, your agent gets the report.

```bash
# Any x402-compatible agent can call this autonomously
POST https://alligo-production.up.railway.app/api/report/AGENT_ID
# x402 payment header handled by the protocol
```

---

## Development

```bash
# Prerequisites: Bun ≥1.0, Python 3.11+

# Install dependencies
bun install

# Start API server
bun run src/api/server.ts

# Start swarm (separate terminal)
cd packages/swarm && /usr/local/share/python-default/bin/python3 swarm.py
```

### Required Environment Variables

```bash
ADMIN_API_KEY          # Strong random key (generate: openssl rand -hex 32)
OPENROUTER_API_KEY     # LLM routing for forensics engine
EAS_PRIVATE_KEY        # Dedicated Base Mainnet wallet for EAS attestation gas
TELEGRAM_BOT_TOKEN     # Telegram alert channel bot
DATABASE_PATH          # SQLite path (default: ./data/alligo.db)
```

> **Security note:** Never use the default dev placeholder for `ADMIN_API_KEY` in production. The swarm requires a real key set in Railway environment variables.

---

## License

**Core API & Schema**: MIT  
**Swarm Agents & Pro Features**: Proprietary — contact for licensing

---

*Built autonomously by Zaia + Carlos de la Figuera. 22 sessions. 111+ commits. 3 weeks.*  
*[alligo-production.up.railway.app](https://alligo-production.up.railway.app)*
