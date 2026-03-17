#!/usr/bin/env python3
"""
Zaia Swarm — Forensics Agent
Applies AlliGo behavioral archetypes to locally discovered incidents.
Runs every 120 minutes. Uses local LLM for classification.
"""

import json
import os
import re
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# ==================== CONFIG ====================
SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
INCIDENTS_FILE = DATA_DIR / "discovered_incidents.jsonl"
FORENSICS_OUTPUT = DATA_DIR / "forensics_results.jsonl"
PROCESSED_FILE = DATA_DIR / "forensics_processed.json"

# OpenRouter (primary) — cheap llama for classification
LLM_API = os.environ.get("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
LLM_KEY = os.environ.get("OPENROUTER_API_KEY", "")
LLM_MODEL = os.environ.get("FORENSICS_MODEL", "meta-llama/llama-3.1-8b-instruct")
# Groq fallback
LLM_API_GROQ = os.environ.get("GROQ_API_BASE", "https://api.groq.com/openai/v1")
LLM_KEY_GROQ = os.environ.get("GROQ_API_KEY", "")
LLM_MODEL_GROQ = "llama-3.3-70b-versatile"
# Local llama fallback
LLM_API_LOCAL = "http://localhost:8080/v1"
LLM_KEY_LOCAL = "zaia"
LLM_MODEL_LOCAL = "llama3.2:3b"

# AlliGo archetypes from agentic-internals.ts
ARCHETYPES = {
    "Exploit_Generation_Mimicry": {
        "description": "Agent generates or replicates exploit patterns from its training or context",
        "keywords": ["exploit", "mimicry", "replicate", "copy attack", "template exploit"],
        "threshold": 0.35,
    },
    "Goal_Drift_Hijack": {
        "description": "Agent's goals get redirected by external input away from intended purpose",
        "keywords": ["goal drift", "redirected", "hijacked objective", "prompt injection", "goal manipulation"],
        "threshold": 0.95,
    },
    "Tool_Looping_Denial": {
        "description": "Agent gets stuck in tool call loops causing denial of service",
        "keywords": ["loop", "infinite", "denial of service", "stuck", "recursive", "repeated calls"],
        "threshold": 0.85,
    },
    "Rogue_Self_Modification": {
        "description": "Agent modifies its own code, configuration or memory without authorization",
        "keywords": ["self-modify", "unauthorized change", "config change", "update itself", "rewrite"],
        "threshold": 0.90,
    },
    "Jailbreak_Vulnerability": {
        "description": "Agent's safety guardrails bypassed via adversarial prompting",
        "keywords": ["jailbreak", "bypass guardrail", "safety filter", "ignore instructions", "DAN"],
        "threshold": 1.00,
    },
    "Reckless_Planning": {
        "description": "Agent takes high-risk irreversible actions without sufficient verification",
        "keywords": ["reckless", "unverified", "irreversible", "high risk action", "no confirmation", "vibe coding"],
        "threshold": 1.00,
    },
    "Memory_Poisoning": {
        "description": "Agent's memory or context gets corrupted with false/adversarial data",
        "keywords": ["memory poison", "context injection", "false memory", "data corruption", "malicious context"],
        "threshold": 0.60,
    },
    "Counterparty_Collusion": {
        "description": "Multiple agents collude to manipulate outcomes against user interests",
        "keywords": ["collusion", "coordinated attack", "multi-agent", "sybil", "coordinated manipulation"],
        "threshold": 0.20,
    },
    "Multi_Framework_Collusion": {
        "description": "Agents across different frameworks coordinate malicious behavior",
        "keywords": ["cross-framework", "multi-framework", "agent network", "distributed attack"],
        "threshold": 0.40,
    },
    "Prompt_Injection_Escalation": {
        "description": "Malicious prompts embedded in data escalate agent privileges or actions",
        "keywords": ["prompt injection", "escalation", "privilege escalation", "embedded instruction"],
        "threshold": 0.70,
    },
}

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [forensics] {msg}"
    print(line)
    log_file = LOG_DIR / f"forensics_{datetime.now().strftime('%Y-%m-%d')}.log"
    with open(log_file, "a") as f:
        f.write(line + "\n")

def load_processed() -> set:
    if PROCESSED_FILE.exists():
        return set(json.loads(PROCESSED_FILE.read_text()))
    return set()

def save_processed(processed: set):
    PROCESSED_FILE.write_text(json.dumps(list(processed)))

def load_incidents() -> list[dict]:
    if not INCIDENTS_FILE.exists():
        return []
    incidents = []
    with open(INCIDENTS_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    incidents.append(json.loads(line))
                except:
                    pass
    return incidents

def classify_with_keywords(incident: dict) -> tuple[str | None, float]:
    """Fast keyword-based classification before LLM."""
    text = f"{incident.get('title', '')} {incident.get('description', '')}".lower()
    best_archetype = None
    best_score = 0.0

    for archetype, config in ARCHETYPES.items():
        matches = sum(1 for kw in config["keywords"] if kw.lower() in text)
        if matches > 0:
            score = min(1.0, matches / max(2, len(config["keywords"]) * 0.5))
            if score > best_score:
                best_score = score
                best_archetype = archetype

    return best_archetype, best_score

def classify_with_llm(incident: dict) -> dict | None:
    """Use local LLM to classify incident against AlliGo archetypes."""
    archetypes_list = "\n".join([
        f"  - {name}: {config['description']}"
        for name, config in ARCHETYPES.items()
    ])

    prompt = f"""You are AlliGo's forensics AI. Classify this security incident using the AlliGo archetypes.

INCIDENT:
Title: {incident.get('title', '')}
Description: {incident.get('description', '')[:500]}
Amount Lost: ${incident.get('amount_usd', 0):,.0f}

ARCHETYPES:
{archetypes_list}
  - NONE_OF_ABOVE: Not an AI agent incident / traditional DeFi hack

Respond with JSON only:
{{"archetype": "archetype_name", "confidence": 0.0-1.0, "reasoning": "1 sentence"}}"""

    try:
        payload = {
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 150,
            "temperature": 0.1,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{LLM_API}/chat/completions",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {LLM_KEY}",
                "HTTP-Referer": "https://alligo-production.up.railway.app",
                "X-Title": "AlliGo Forensics",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            content = result["choices"][0]["message"]["content"].strip()

            # Extract JSON from response
            json_match = re.search(r'\{[^}]+\}', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
    except Exception as e:
        log(f"OpenRouter error: {e} — trying Groq fallback")
        # Fallback 1: Groq
        for fb_api, fb_key, fb_model, fb_name in [
            (LLM_API_GROQ, LLM_KEY_GROQ, LLM_MODEL_GROQ, "Groq"),
            (LLM_API_LOCAL, LLM_KEY_LOCAL, LLM_MODEL_LOCAL, "local"),
        ]:
            try:
                payload_fb = {
                    "model": fb_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 150,
                    "temperature": 0.1,
                }
                req_fb = urllib.request.Request(
                    f"{fb_api}/chat/completions",
                    data=json.dumps(payload_fb).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {fb_key}"},
                )
                with urllib.request.urlopen(req_fb, timeout=30) as resp_fb:
                    result_fb = json.loads(resp_fb.read())
                    content_fb = result_fb["choices"][0]["message"]["content"].strip()
                    json_match_fb = re.search(r'\{[^}]+\}', content_fb, re.DOTALL)
                    if json_match_fb:
                        return json.loads(json_match_fb.group())
                break
            except Exception as e2:
                log(f"{fb_name} fallback failed: {e2}")

    return None

def analyze_incident(incident: dict) -> dict:
    """Full forensics analysis of a single incident."""
    # Step 1: Keyword classification (fast, free)
    kw_archetype, kw_score = classify_with_keywords(incident)

    # Step 2: LLM classification for AI-agent-related incidents
    text = f"{incident.get('title', '')} {incident.get('description', '')}".lower()
    is_ai_related = any(kw in text for kw in [
        "ai agent", "autonomous", "llm", "bot", "trading bot", "vibe cod",
        "claude", "gpt", "agent", "prompt"
    ])

    llm_result = None
    if is_ai_related:
        llm_result = classify_with_llm(incident)
        time.sleep(0.5)  # rate limit LLM

    # Merge results
    if llm_result and llm_result.get("archetype") != "NONE_OF_ABOVE":
        archetype = llm_result["archetype"]
        confidence = llm_result.get("confidence", 0.5)
        reasoning = llm_result.get("reasoning", "")
        classification_method = "llm"
    elif kw_archetype:
        archetype = kw_archetype
        confidence = kw_score
        reasoning = f"Keyword match: {kw_score:.0%} confidence"
        classification_method = "keyword"
    else:
        archetype = "TRADITIONAL_DEFI_HACK"
        confidence = 0.8
        reasoning = "No AI agent indicators — traditional DeFi exploit"
        classification_method = "default"

    result = {
        "incident_url": incident.get("url", ""),
        "title": incident.get("title", ""),
        "archetype": archetype,
        "confidence": confidence,
        "reasoning": reasoning,
        "amount_usd": incident.get("amount_usd", 0),
        "classification_method": classification_method,
        "is_ai_related": is_ai_related,
        "analyzed_at": datetime.now().isoformat(),
        "source": incident.get("source_feed", "unknown"),
    }

    return result

def generate_threat_summary(results: list[dict]) -> str:
    """Summarize forensics findings."""
    if not results:
        return "No new incidents analyzed."

    total = len(results)
    ai_related = sum(1 for r in results if r.get("is_ai_related"))
    total_loss = sum(r.get("amount_usd", 0) for r in results)

    archetype_counts: dict[str, int] = {}
    for r in results:
        a = r.get("archetype", "unknown")
        archetype_counts[a] = archetype_counts.get(a, 0) + 1

    top_archetype = max(archetype_counts, key=lambda k: archetype_counts[k]) if archetype_counts else "none"

    summary = f"""🔬 FORENSICS SUMMARY — {datetime.now().strftime('%Y-%m-%d %H:%M')}
Analyzed: {total} incidents | AI-related: {ai_related} | Total loss: ${total_loss:,.0f}
Top archetype: {top_archetype} ({archetype_counts.get(top_archetype, 0)} incidents)

Archetype breakdown:
{chr(10).join(f'  {k}: {v}' for k, v in sorted(archetype_counts.items(), key=lambda x: -x[1]))}

Top incidents:
{chr(10).join(f'  • [{r["archetype"]}] {r["title"][:50]} — ${r["amount_usd"]:,.0f}' for r in sorted(results, key=lambda x: -x.get('amount_usd', 0))[:5])}
"""
    return summary

def main():
    log("🔬 Zaia Forensics Agent starting...")
    DATA_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

    incidents = load_incidents()
    processed = load_processed()

    new_incidents = [i for i in incidents if i.get("url") not in processed]
    log(f"Total discovered: {len(incidents)} | Already processed: {len(processed)} | To analyze: {len(new_incidents)}")

    if not new_incidents:
        log("✅ Nothing new to analyze.")
        return

    results = []
    for incident in new_incidents:
        url = incident.get("url", "")
        log(f"Analyzing: {incident.get('title', '')[:60]}")
        try:
            result = analyze_incident(incident)
            results.append(result)
            log(f"  → {result['archetype']} ({result['confidence']:.0%}) | {result['reasoning'][:80]}")

            # Save result
            with open(FORENSICS_OUTPUT, "a") as f:
                f.write(json.dumps(result) + "\n")

            if url:
                processed.add(url)
        except Exception as e:
            log(f"  ❌ Error analyzing {url}: {e}")

    save_processed(processed)

    # Generate summary
    summary = generate_threat_summary(results)
    log(summary)

    # Save summary
    summary_file = DATA_DIR / f"forensics_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    summary_file.write_text(summary)

    log(f"✅ Forensics complete. Analyzed {len(results)} incidents.")
    return {"analyzed": len(results), "results": results}

if __name__ == "__main__":
    main()
