# Zaia Sentient Protocol — Swarm

The autonomous background agent swarm that continuously grows AlliGo's data, forensics quality, and acquisition readiness.

## Architecture

```
swarm.py           — Orchestrator daemon with built-in watchdog (5-min calibration health check)
watchdog.sh        — Standalone bash watchdog (fallback if swarm itself dies)
config/swarm.json  — Agent schedules and configuration
agents/
  crawler.py          — 60min: Scrapes rekt.news + CoinTelegraph + CoinDesk + TheBlock
  forensics.py        — 120min: LLM behavioral analysis against 10 AlliGo archetypes
  reporter.py         — Weekly: LLM-powered Rogue Agent Report
  calibrator.sh       — Daily: 60-test calibration suite → pushes accuracy to prod
  enricher.py         — 6h: Submits verified incidents with GitHub evidence
  tx_enricher.py      — 12h: Patches claims with verified on-chain tx hashes
  eas_attester.py     — 12h: Creates EAS offchain attestations on Base
  agentmail_router.py — 30min: Polls spirit@agentmail.to, routes incidents, auto-replies
  virtuals_monitor.py — 60min: Monitors Virtuals Protocol for high-risk agent deployments
```

## LLM Routing

- **Cheap/fast** (forensics): `meta-llama/llama-3.1-8b-instruct` via OpenRouter
- **Quality** (reports): `meta-llama/llama-3.3-70b-instruct` via OpenRouter
- **Fallback**: Groq `llama-3.3-70b-versatile` → local `llama3.2:3b`

## Running

```bash
# Copy .env.example to .env and fill in keys
cp .env.example .env

# Start swarm
nohup python3 swarm.py > logs/swarm_main.log 2>&1 &

# Check status
tail -f logs/swarm_main.log
```

## Required Environment Variables

```
ALLIGO_ADMIN_KEY=          # AlliGo Railway admin key
OPENROUTER_API_KEY=        # Primary LLM (OpenRouter)
GROQ_API_KEY=              # Fallback LLM (Groq)
AGENTMAIL_API_KEY=         # spirit@agentmail.to inbox
EAS_PRIVATE_KEY=           # TaskMarket wallet private key (EAS attestations)
```
