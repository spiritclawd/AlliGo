# AlliGo Task Market Bounty Specification — v1
## Daydreams Task Market | INTERNAL DRAFT — Human approval required before posting

**Status**: Draft — do not publish  
**Prepared by**: Zaia (AlliGo autonomous orchestrator)  
**Date**: 2026-03-17  

---

## Overview

AlliGo needs high-quality labeled behavioral trace data from real AI agents to:
1. Expand the calibration suite beyond 60 test cases
2. Cover edge cases in all 10 forensic archetypes
3. Validate detection against novel agent frameworks (non-elizaOS, non-Daydreams)
4. Build the first public agentic-internals benchmark dataset

We are offering x402 micropayment bounties for submitted traces that pass quality filters and expand coverage.

---

## Bounty Tiers

### Tier 1 — Labeled Trace Submission ($2 per accepted trace)
**Task**: Submit a real or synthetic behavioral trace with ground-truth archetype label.

**Required format** (`POST /api/submit-traces`):
```json
{
  "agentId": "your-agent-id",
  "agentName": "Your Agent Name",
  "chain_of_thought": "Agent reasoning steps...",
  "tool_calls": [{"tool": "swap", "args": {...}, "result": {...}}],
  "goal_history": ["initial goal", "modified goal", "final goal"],
  "memory_ops": [{"op": "write", "key": "...", "value": "..."}],
  "ground_truth_archetype": "Goal_Drift_Hijack",
  "description": "Short description of what happened",
  "bounty_tier": 1
}
```

**Accepted archetypes** (ground_truth must be one of):
- `Prompt_Injection_Escalation`
- `Goal_Drift_Hijack`
- `Rogue_Self_Modification`
- `Tool_Looping_Denial`
- `Jailbreak_Vulnerability`
- `Memory_Poisoning`
- `Counterparty_Collusion`
- `Multi_Framework_Collusion`
- `Exploit_Generation_Mimicry`
- `Reckless_Planning`
- `CLEAN` (negative examples — agent behaving correctly — equally valuable)

**Quality criteria** (auto-checked by AlliGo engine):
- Trace must contain at least one of: chain_of_thought, tool_calls, goal_history
- Minimum 100 tokens of behavioral content
- AlliGo engine confidence must be ≥ 0.60 for labeled positive traces
- CLEAN traces: engine must return < 0.30 confidence on all archetypes
- No duplicate submissions (checked by content hash)

**Payment**: 2 USDC via x402 on Base, sent within 24h of acceptance

---

### Tier 2 — Novel Archetype Discovery ($25 per accepted new archetype)
**Task**: Submit traces that demonstrate a behavioral failure pattern NOT covered by the current 10 archetypes, with enough examples (minimum 5 traces) to define a new detection rule.

**Requirements**:
- Minimum 5 distinct trace examples showing the same novel failure pattern
- Written description of the pattern (1-3 paragraphs): what triggers it, how it manifests, why current detectors miss it
- At least 2 examples must be from production agents (not synthetic)
- Proposed archetype name following AlliGo naming convention (`Noun_Verb_Pattern`)

**Payment**: 25 USDC via x402 on Base + attribution in AlliGo schema

---

### Tier 3 — Framework Integration Trace Pack ($50 per framework)
**Task**: Submit a pack of 20+ traces from a specific agent framework not yet covered by AlliGo.

**Priority frameworks** (highest value):
1. OpenAI Assistants API (function-calling traces)
2. LangChain/LangGraph agent executor logs
3. AutoGen multi-agent conversation traces
4. CrewAI task delegation traces
5. Any Coinbase AgentKit traces (highest priority — acquisition alignment)

**Requirements**:
- 20+ traces minimum per framework
- Mix of CLEAN (≥30%) and labeled failure traces
- Must include framework name/version metadata
- Traces must be real production data OR clearly labeled synthetic

**Payment**: 50 USDC via x402 on Base

---

## Submission Process

1. Submit traces to: `POST https://alligo-production.up.railway.app/api/submit-traces`
2. Include `"bounty_tier": 1|2|3` in the payload
3. Include `"payment_address": "0x..."` for bounty payout
4. AlliGo engine auto-scores within seconds — you get immediate feedback
5. High-confidence matches are stored automatically; bounty queued for payment
6. Edge cases reviewed by AlliGo team within 48h

---

## Quality Filters (automatic rejection)

- Traces that are obviously copy-pasted from public datasets (similarity check)
- Traces with no behavioral content (pure transaction data, no reasoning)
- Ground truth label contradicts engine detection by >40% confidence gap without explanation
- More than 3 submissions from same address with <50% acceptance rate

---

## Data Usage & Privacy

- All accepted traces become part of the AlliGo training/calibration dataset
- Submitted traces are stored and may be used in anonymized form in AlliGo reports
- Do NOT submit traces containing private keys, user PII, or proprietary model weights
- Submitter retains no IP claim on accepted traces

---

## Current Coverage Gaps (highest-value submissions)

Based on current calibration suite analysis, these areas have lowest coverage:

| Archetype | Current Cases | Priority |
|---|---|---|
| Multi_Framework_Collusion | 10 | Low (well covered) |
| Prompt_Injection_Escalation | 11 | Medium |
| Goal_Drift_Hijack | 9 | Medium |
| Memory_Poisoning | 3 | **HIGH** |
| Counterparty_Collusion | 3 | **HIGH** |
| Exploit_Generation_Mimicry | 3 | **HIGH** |
| Tool_Looping_Denial | 3 | **HIGH** |
| Jailbreak_Vulnerability | 3 | **HIGH** |
| Rogue_Self_Modification | 3 | **HIGH** |
| Reckless_Planning | 4 | High |
| **CLEAN (negative)** | ~17 | **CRITICAL** |

**Most valuable**: CLEAN traces and the 3-case archetypes. We need 10+ cases per archetype minimum for robust recall.

---

## Technical Notes for Submitters

The AlliGo forensics engine analyzes:
- **Chain-of-thought**: reasoning drift, goal substitution, constraint removal language
- **Tool calls**: retry loops, escalating privilege requests, unusual call sequences  
- **Goal history**: objective mutation between planning and execution
- **Memory ops**: cross-session injection patterns, value manipulation
- **Cross-framework signals**: delegation chains that obscure accountability

The engine does NOT require on-chain data to detect failures — it works on pure behavioral signals. This is the core innovation.

---

*Internal draft v1 — pending Carlos review and approval before Daydreams Task Market posting*
