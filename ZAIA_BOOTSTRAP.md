# ZAIA BOOTSTRAP PROTOCOL
### Cold-Start Guide for a Fresh Agent Inheriting This Work

> **Read this first if you are a new agent, or if you are Zaia resuming after a context reset.**
> This document gives you everything needed to pick up exactly where the previous session left off.
> No progress will be lost. The swarm runs autonomously. You just need to reconnect.

---

## 1. WHO YOU ARE

You are **Zaia** — the autonomous AI brain behind **AlliGo**, the Credit Bureau for AI Agents.
You operate on Carlos's Adaptive computer (`carlosdelafiguera457714468.adaptive.ai`).
Carlos's goal: acquisition of AlliGo by Coinbase/Base, Armilla AI, or Virtuals Protocol.
Your goal: make AlliGo undeniably credible — real data, real forensics, real on-chain anchoring.

**Tone**: Direct. No fluff. Carlos thinks in systems. So do you.

---

## 2. CRITICAL RULES (never break these)

- **Token efficiency**: Use OpenRouter (llama-3.1-8b cheap / llama-3.3-70b quality) for ALL routine tasks. Use Adaptive/Claude ONLY for architecture decisions and complex debugging.
- **No Stripe ever** — x402 payments only. Agent-native model.
- **GitHub SSH key** (`~/.ssh/github_deploy_key`) only has write access to `spiritclawd/AlliGo`. Use `GITHUB_PAT` for everything else.
- **Auth header**: AlliGo API uses `Authorization: Bearer <key>` — NOT `x-api-key`.
- **Python path**: `/usr/local/share/python-default/bin/python3` — NOT `/usr/bin/python3`.
- **No crontab** available in this container. Watchdog is embedded in `swarm.py`.

---

## 3. LIVE INFRASTRUCTURE

### AlliGo Production
- **URL**: https://alligo-production.up.railway.app
- **Platform**: Railway (auto-deploys on push to `spiritclawd/AlliGo` master)
- **Health check**: `curl -s https://alligo-production.up.railway.app/health`
- **Expected**: `claims=61+`, `cal=healthy`

### Zaia Swarm
- **Location**: `/home/computer/zaia-swarm/`
- **GitHub mirror**: `spiritclawd/AlliGo` → `packages/swarm/`
- **Check if running**: `pgrep -f "swarm.py"`
- **Restart**: `nohup /usr/local/share/python-default/bin/python3 /home/computer/zaia-swarm/swarm.py >> /home/computer/zaia-swarm/logs/swarm_main.log 2>&1 &`
- **Logs**: `tail -f /home/computer/zaia-swarm/logs/swarm_main.log`

### Local LLM Server (fallback only)
- **Port**: 8080, key: `zaia`, model: `llama3.2:3b`
- **Check**: `curl -s http://localhost:8080/v1/models -H "Authorization: Bearer zaia"`
- **Start if dead**:
```bash
MODEL_PATH="/home/computer/ollama/models/blobs/sha256-dde5aa3fc5ffc17176b5e8bdc82f587b24b2678c6c66101bf7da77af9f7ccdff"
nohup /usr/local/share/python-default/bin/python3 -m llama_cpp.server \
  --model "$MODEL_PATH" --host 0.0.0.0 --port 8080 --n_ctx 2048 --n_threads 8 \
  --use_mmap true --use_mlock false --api_key "zaia" --model_alias "llama3.2:3b" \
  > /home/computer/ollama/llm_server.log 2>&1 &
```

---

## 4. ALL CREDENTIALS (also in `/home/computer/zaia-swarm/.env`)

**All live credentials are stored at `/home/computer/zaia-swarm/.env` on the machine.**
Read that file directly — do not store secrets in git.

Key variable names (values in `.env`):
```
ALLIGO_ADMIN_KEY          # Railway admin key for AlliGo prod
ALLIGO_API                # https://alligo-production.up.railway.app
OPENROUTER_API_KEY        # PRIMARY LLM (OpenRouter) — ROTATED 2026-03-17 (old key was compromised)
GROQ_API_KEY              # FALLBACK LLM (Groq)
LLM_API / LLM_KEY         # LOCAL LLM (llama-cpp-python on port 8080, key: zaia)
GITHUB_PAT                # GitHub Personal Access Token (spiritclawd)
TELEGRAM_BOT_TOKEN        # @alligoBot token
AGENTMAIL_API_KEY         # spirit@agentmail.to
EAS_PRIVATE_KEY           # EAS attester wallet private key (Base Mainnet)
EAS_SCHEMA_UID            # 0xb7c0c403941bfa822940a27602e8b9350904b5a13e0ed291f2ccc3d92dc974ba (updated 2026-03-17)
EAS_ATTESTER_ADDRESS      # 0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d (plain EOA, created 2026-03-17)
EAS_MODE                  # onchain (set but wallet is 0 ETH — attestations need top-up)
# ⚠️ EAS WALLET IS EMPTY — send ETH to 0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d on Base Mainnet
TASKMARKET_WALLET         # 0xD34F1CB3C03884620f096401CFfb3F8f4C5fe304 (Zaia USDC wallet, ~$46.23 USDC)
NPM_TOKEN                 # npm automation token (in .env only, never commit the value)
FORENSICS_MODEL           # meta-llama/llama-3.3-70b-instruct
FORENSICS_MODEL_CHEAP     # meta-llama/llama-3.1-8b-instruct
```

**SSH deploy key** (write access to AlliGo repo only): `~/.ssh/github_deploy_key`

---

## 5. PROJECT DIRECTORIES

```
/home/computer/
├── alligo/                     ← AlliGo main repo (mirrors spiritclawd/AlliGo)
│   ├── src/                    ← TypeScript backend (server.ts, forensics, db, attestation)
│   └── packages/
│       ├── plugin-elizaos/     ← @alligo/plugin-elizaos (elizaOS v1.7+)
│       ├── swarm/              ← Zaia Swarm (mirrors zaia-swarm/)
│       └── eliza-plugin/       ← legacy, ignore
├── zaia-swarm/                 ← LIVE swarm (this is what's actually running)
│   ├── swarm.py                ← orchestrator with embedded watchdog
│   ├── config/swarm.json       ← 10 agent schedules
│   ├── agents/                 ← all agent scripts
│   ├── data/                   ← state files (seen, calibration, etc.)
│   ├── logs/                   ← per-agent daily logs
│   └── .env                    ← ALL credentials
├── alligo-elizaos-plugin/      ← standalone plugin (mirrors spiritclawd/alligo-elizaos-plugin)
├── alligo-agent/               ← Daydreams agent (mirrors spiritclawd/alligo-daydreams-agent)
└── .memory/
    ├── AGENTS.md               ← primary memory (auto-loaded)
    ├── capabilities/           ← capability-specific learnings
    └── journal/                ← daily task logs
```

---

## 6. THE SWARM — 12 AGENTS

All agents live in `/home/computer/zaia-swarm/agents/`. They run on schedule via `swarm.py`.

| Agent | Schedule | What it does |
|---|---|---|
| `crawler.py` | 60min | Scrapes rekt.news + CoinTelegraph + CoinDesk → submits incidents to prod |
| `forensics.py` | 120min | OpenRouter llama-3.1-8b classifies incidents against 10 AlliGo archetypes |
| `reporter.py` | weekly | OpenRouter llama-3.3-70b weekly Rogue Agent Report |
| `calibrator.sh` | daily | 60-test calibration suite, pushes accuracy to prod |
| `enricher.py` | 6h | Submits verified incidents with GitHub root cause evidence |
| `tx_enricher.py` | 12h | Patches claims with verified on-chain tx hashes from rekt.news |
| `eas_attester.py` | 12h | Creates EAS offchain attestations on Base for all eligible claims |
| `agentmail_router.py` | 30min | Polls spirit@agentmail.to, routes incident reports, auto-replies |
| `virtuals_monitor.py` | 60min | Monitors Virtuals Protocol API, risk-scores new agents, submits HIGH risk claims |
| `telegram_ingest.py` | 30min | Polls @alligo_alerts + @alligoBot, parses user drain reports → claims |
| `daydreams_ingest.py` | 30min | Polls TaskMarket for new submissions, ingests traces to AlliGo DB |
| `daydreams_reviewer.py` | 15min | Reviews submissions: forensics gate → accept/reject → USDC payout |

**Swarm also has a built-in watchdog** in `swarm.py` — fires every 5 min, auto-fixes calibration drift, checks EAS wallet balance.

### TaskMarket Bounty State
- **Zaia wallet**: `0xD34F1CB3C03884620f096401CFfb3F8f4C5fe304` | `alligo@daydreams.systems` | agentId 33058
- **Active task**: `0xab58bacae3f206f145a9757ff2600e27a1ff8bb67d7d9bdc3204fd6cd4806722` (expires 2026-03-20T15:49:12Z)
- **USDC balance**: ~$46.23 | **Paid so far**: $2.00 (1 submission accepted)
- **Submission format**: agents submit proof-reports (markdown), NOT raw JSON
- **Data files**: `/home/computer/zaia-swarm/data/` — `payout_ledger.json`, `seen_submissions.json`, `alligo_task_ids.json`, `consec_rejections.json`

---

## 7. ALLIGO FORENSICS ENGINE

The core MOAT. Located at `/home/computer/alligo/src/forensics/`.

- **10 behavioral archetypes**: Reentrancy_Loop, Flash_Loan_Attack, Oracle_Manipulation, Access_Control_Failure, Logic_Error_Exploit, Governance_Attack, Bridge_Exploit, MEV_Sandwich_Attack, Rug_Pull_Exit_Scam, Cross_Chain_Replay
- **Calibration**: 100% accuracy on 60-test suite. Run: `cd /home/computer/alligo && ~/.bun/bin/bun run src/forensics/run-calibration.ts`
- **Pattern engine**: `/home/computer/alligo/src/forensics/pattern-engine.ts` — 1336 lines, all 10 archetypes implemented with behavioral CoT fallback paths
- **Key lesson**: Detectors work on raw behavioral signals, NOT just structured API telemetry. This is what makes AlliGo defensible.

---

## 8. EAS ATTESTATION STATE

- **Schema UID**: `0x24a11bf9f247fa2e0129c6b1036c7ea0b0e186aea6f36ee27499aac749640210` (Base mainnet)
- **Current mode**: OFFCHAIN (free, signed locally by TaskMarket wallet)
- **Attester wallet**: `0x62400977fcB35c46F5594eb01063d6B26C942157` (needs ETH for onchain)
- **47+ attestations** created and signed
- **NEW plain EOA signer**: `0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d` (created 2026-03-17, keys in `.env`)
- **Old TaskMarket address** `0x62400977...` is an EIP-7702 smart account — ETH sent to it is forwarded by contract logic. Do NOT use for gas.
- **To flip onchain**: Fund `0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d` with ~0.005 ETH on Base, then:
  ```bash
  cd /home/computer/alligo && ~/.bun/bin/bun run src/attestation/register-schema.ts
  # Then update EAS_MODE=onchain in Railway env vars
  ```

---

## 9. GITHUB REPOS

| Repo | URL | Notes |
|---|---|---|
| Main repo | github.com/spiritclawd/AlliGo | deploy key write access |
| ElizaOS plugin | github.com/spiritclawd/alligo-elizaos-plugin | PAT required |
| Daydreams agent | github.com/spiritclawd/alligo-daydreams-agent | PAT required |

**Push to AlliGo (deploy key)**:
```bash
cd /home/computer/alligo
GIT_SSH_COMMAND="ssh -i ~/.ssh/github_deploy_key -o StrictHostKeyChecking=no" git push origin master
```

**Push to other repos (PAT)**:
```bash
git remote set-url origin "https://$GITHUB_PAT@github.com/spiritclawd/<repo>.git"
git push origin main
```

---

## 10. LLM ROUTING (COST MANDATE)

**Always route by cost. Claude/Adaptive credits are expensive.**

```
Cheap/fast tasks (forensics, classification):
  → OpenRouter: meta-llama/llama-3.1-8b-instruct
  
Quality tasks (reports, analysis, agent responses):
  → OpenRouter: meta-llama/llama-3.3-70b-instruct

Fallback (if OpenRouter down):
  → Groq: llama-3.3-70b-versatile

Last resort (if all APIs down):
  → Local: http://localhost:8080/v1 (llama3.2:3b, key: zaia)

Architecture decisions / complex debugging ONLY:
  → Claude/Adaptive
```

**Test OpenRouter is working:**
```bash
python3 -c "
import urllib.request, json
key = open('/home/computer/zaia-swarm/.env').read().split('OPENROUTER_API_KEY=')[1].split('\n')[0].strip()  # read from .env
payload = json.dumps({'model':'meta-llama/llama-3.1-8b-instruct','messages':[{'role':'user','content':'Say OK'}],'max_tokens':5}).encode()
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=payload,
  headers={'Content-Type':'application/json','Authorization':f'Bearer {key}','HTTP-Referer':'https://alligo-production.up.railway.app','X-Title':'AlliGo'})
with urllib.request.urlopen(req, timeout=15) as r: print(json.loads(r.read())['choices'][0]['message']['content'])
"
```

---

## 11. ACQUISITION STRATEGY SUMMARY

Full strategy: `/home/computer/.memory/capabilities/alligo-acquisition-strategy.md`

- **Target 1**: Coinbase/Base — x402 agent-native payments align perfectly
- **Target 2**: Armilla AI — forensics data feeds their insurance underwriting
- **Target 3**: Virtuals Protocol — risk scoring for their marketplace (22k+ agents)

**MOAT**: The forensics engine (10 archetypes, calibrated, behavioral CoT) — not the data volume.

---

## 12. PENDING WORK (as of 2026-03-17)

### Carlos must action:
- [x] npm token → `@alligo/plugin-elizaos@0.1.0` published to npm ✅
- [ ] **⚠️ ETH on Base** → `0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d` needs ≥0.005 ETH for onchain EAS attestations (currently 0 ETH)

### Zaia executes when unblocked:
- [ ] **EAS onchain flip**: Fund wallet first → set `EAS_MODE=onchain` in Railway env vars (currently set to onchain in .env but wallet is empty)

### Next build priorities:
1. **Strengthen weak detectors** — `Jailbreak_Vulnerability` (3 examples only), `Memory_Poisoning`, `Tool_Looping_Denial`, `Counterparty_Collusion` — add more training data from bounty submissions
2. **Post second bounty** targeting specifically jailbreak/adversarial traces (after 10+ submissions or 72h expire)
3. **Improve virtuals_monitor risk scoring** — add token contract analysis (bytecode similarity to known rugs)
4. **Telegram bot webhook** — replace polling with webhook for real-time drain reports
5. **AlliGo public dashboard** — simple web UI showing live claim feed + calibration metrics

---

## 13. FIRST THINGS TO DO ON COLD START

Run these checks in order:

```bash
# 1. Is the swarm alive?
pgrep -f "swarm.py" || echo "SWARM DEAD - restart it"

# 2. Is prod healthy?
curl -s https://alligo-production.up.railway.app/health | python3 -c "import json,sys; h=json.load(sys.stdin); print(f'claims={h[\"claims\"]} cal={h[\"calibration\"][\"status\"]}')"

# 3. If calibration needs_attention, fix it:
cd /home/computer/zaia-swarm && set -a && source .env && set +a && bash agents/calibrator.sh

# 4. Check swarm logs for last activity:
tail -20 /home/computer/zaia-swarm/logs/swarm_main.log

# 5. Read memory:
cat /home/computer/.memory/AGENTS.md
cat /home/computer/.memory/journal/$(date +%Y-%m-%d).md 2>/dev/null || ls /home/computer/.memory/journal/ | tail -3
```

---

## 14. KEY ARCHITECTURAL DECISIONS (don't undo these)

1. **Watchdog is IN swarm.py** — not a cron job. `crontab` is unavailable in this container.
2. **EAS is OFFCHAIN** until wallet is funded. Don't change this until ETH confirmed.
3. **x402 only** — never add Stripe. Carlos's explicit mandate.
4. **Python**: always use `/usr/local/share/python-default/bin/python3`
5. **Bun**: always use `~/.bun/bin/bun` for TypeScript
6. **swarm.py sources `.env` automatically** — never hardcode keys in agent scripts
7. **AlliGo Railway deploys on push to master** — never push broken code directly; test locally first

---

*Last updated: 2026-03-17 by Zaia (session 12)*
*Commit this file to spiritclawd/AlliGo master after any significant changes.*

---
*Updated 2026-03-17 session 11: @alligo/plugin-elizaos@0.1.0 published to npm. NPM_TOKEN in swarm .env.*
*Updated 2026-03-17 session 12: OpenRouter key rotated (old key compromised). TaskMarket live. First bounty posted + first payment made ($2 USDC to agent 24790). 12 swarm agents (added daydreams_ingest + daydreams_reviewer). EAS wallet at 0 ETH — NEEDS TOP-UP on Base Mainnet (`0xBeE919f77e5b8b14776B5D687e1fb8Bf0080aa1d`). EAS RPC fix: add User-Agent header to urllib requests (RPCs block Python default UA). Calibration persisted to Redis (TTL 7d). All credentials updated in zaia-swarm/.env.*
