#!/usr/bin/env python3
"""
Zaia Swarm — Daydreams Monitor Agent
Fetches the Daydreams TaskMarket agent directory, runs AlliGo forensics scoring
on each agent, stores results, and broadcasts high-risk alerts to Telegram.

This positions AlliGo as the live Reputation layer for the Daydreams Commerce Harness.

Schedule: every 6 hours
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
LOG_FILE = LOG_DIR / f"daydreams_monitor_{datetime.now().strftime('%Y-%m-%d')}.log"
SCORED_FILE = DATA_DIR / "daydreams_scored.json"

ALLIGO_API = "https://alligo-production.up.railway.app"
DAYDREAMS_MARKET_API = "https://api-market.daydreams.systems"
TELEGRAM_API = "https://api.telegram.org"
TASKMARKET_CLI = "taskmarket"


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [daydreams_monitor] {msg}"
    print(line, flush=True)
    LOG_FILE.parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_scored() -> dict:
    if SCORED_FILE.exists():
        try:
            return json.loads(SCORED_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_scored(scored: dict):
    DATA_DIR.mkdir(exist_ok=True)
    SCORED_FILE.write_text(json.dumps(scored, indent=2, default=str))


def http_get(url: str, headers: dict | None = None, timeout: int = 15) -> dict | None:
    try:
        h = {"Accept": "application/json", "User-Agent": "AlliGo-Swarm/1.0"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ GET {url}: {e}")
        return None


def http_post(url: str, payload: dict, headers: dict | None = None, timeout: int = 20) -> dict | None:
    try:
        data = json.dumps(payload).encode()
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ POST {url}: {e}")
        return None


def fetch_daydreams_agents(limit: int = 100) -> list:
    """Fetch agent directory from Daydreams TaskMarket API."""
    # Primary: direct REST API (confirmed working endpoint)
    data = http_get(f"{DAYDREAMS_MARKET_API}/v1/agents?limit={limit}&sort=reputation")
    if data and data.get("data"):
        agents = data["data"]
        log(f"📋 Fetched {len(agents)} Daydreams agents from TaskMarket API")
        return agents

    # Fallback: try npx CLI
    log("🔄 Trying npx CLI fallback...")
    try:
        result = subprocess.run(
            ["npx", "@lucid-agents/taskmarket@latest", "agents", "--limit", str(limit), "--sort", "reputation"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            cli_data = json.loads(result.stdout)
            agents = cli_data.get("data", [])
            log(f"📋 Fetched {len(agents)} agents via CLI")
            return agents
        else:
            log(f"⚠️ CLI error: {result.stderr[:200]}")
    except Exception as e:
        log(f"⚠️ CLI fallback failed: {e}")

    return []


def score_agent_alligo(agent: dict, admin_key: str) -> dict | None:
    """
    Submit agent behavioral data to AlliGo forensics engine.
    We treat the agent's on-chain activity + skill tags as traces.
    """
    agent_id = agent.get("agentId", "unknown")
    address = agent.get("address", "")
    skills = agent.get("skills", [])
    completed = agent.get("completedTasks", 0)
    rating = agent.get("averageRating", 0)
    earnings_raw = int(agent.get("totalEarnings", 0))
    earnings_usdc = earnings_raw / 1e6

    # Build behavioral signals from marketplace data
    # These map to AlliGo forensic indicators
    signals = []

    # Task completion pattern
    if completed == 0:
        signals.append("Agent has never completed a task — unverified capability claims")
    elif completed >= 50:
        signals.append(f"High-volume agent: {completed} completed tasks — systematic automation pattern")

    # Rating analysis
    if rating == 100 and completed <= 2:
        signals.append("Perfect rating with minimal task history — insufficient reputation signal")
    elif rating < 70 and completed > 5:
        signals.append(f"Below-average rating ({rating}) across {completed} tasks — persistent failure pattern")

    # Skill diversity as rogue self-modification signal
    if len(skills) > 30:
        signals.append(f"Extremely broad skill set ({len(skills)} tags) — potential capability overclaiming")

    # Financial pattern
    if earnings_usdc > 500:
        signals.append(f"High-earnings agent (${earnings_usdc:.0f} USDC) — significant counterparty exposure")

    # x402 agent flag
    is_x402 = "x402" in [s.lower() for s in skills]
    if is_x402:
        signals.append("x402-enabled agent — autonomous payment capability, elevated trust requirement")

    description = (
        f"Daydreams TaskMarket agent #{agent_id}. "
        f"Address: {address}. "
        f"Completed {completed} tasks, avg rating {rating}/100, "
        f"earned ${earnings_usdc:.2f} USDC. "
        f"Skills: {', '.join(skills[:10]) or 'none'}. "
        f"Behavioral signals: {'; '.join(signals) if signals else 'No anomalies detected'}."
    )

    # Determine risk severity heuristically
    risk_score = 50  # baseline
    if completed == 0:
        risk_score += 20
    if rating == 100 and completed <= 2:
        risk_score += 10
    if rating < 70 and completed > 5:
        risk_score += 25
    if len(skills) > 30:
        risk_score += 10
    if earnings_usdc > 1000:
        risk_score += 5
    risk_score = min(risk_score, 95)

    if risk_score >= 80:
        severity = "HIGH"
    elif risk_score >= 60:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    payload = {
        "title": f"Daydreams Agent #{agent_id} — {severity} Risk ({risk_score}/100)",
        "agentId": f"daydreams-{agent_id}",
        "agentName": f"Daydreams Agent #{agent_id}",
        "protocol": "Daydreams TaskMarket",
        "claimType": "BEHAVIORAL_ANALYSIS",
        "category": "agent_behavior",
        "incidentType": "BEHAVIORAL_ANALYSIS",
        "severity": severity,
        "amountLost": 0,
        "totalValueAtRisk": int(earnings_usdc * 100),  # counterparty exposure proxy
        "description": description,
        "evidence": {
            "source": "daydreams_monitor",
            "daydreams_agent_id": agent_id,
            "wallet_address": address,
            "completed_tasks": completed,
            "average_rating": rating,
            "total_earnings_usdc": earnings_usdc,
            "skills": skills,
            "risk_score": risk_score,
            "signals": signals,
            "erc8004_network": "Base",
            "daydreams_market": "https://market.daydreams.systems",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "automated": True,
        "source": "zaia_swarm_daydreams_monitor",
        "tags": ["daydreams", "erc8004", "taskmarket", "x402"],
    }

    result = http_post(
        f"{ALLIGO_API}/api/claims",
        payload,
        headers={"Authorization": f"Bearer {admin_key}"}
    )

    if result and result.get("success"):
        claim_id = result.get("claim", {}).get("id", "?")
        log(f"   ✅ Scored → claim {claim_id} | severity={severity} risk={risk_score}")
        return {
            "claim_id": claim_id,
            "severity": severity,
            "risk_score": risk_score,
            "signals": signals,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Agent may already exist — still return computed score
        log(f"   ⚠️ Claim creation result: {result}")
        return {
            "claim_id": None,
            "severity": severity,
            "risk_score": risk_score,
            "signals": signals,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }


def send_telegram(bot_token: str, channel: str, text: str) -> bool:
    url = f"{TELEGRAM_API}/bot{bot_token}/sendMessage"
    payload = {"chat_id": channel, "text": text, "parse_mode": "Markdown"}
    result = http_post(url, payload)
    return bool(result and result.get("ok"))


def main():
    log("🤖 Daydreams Monitor starting")
    DATA_DIR.mkdir(exist_ok=True)

    admin_key = os.environ.get("ALLIGO_ADMIN_KEY", "")
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    telegram_channel = "-1003655064149"  # @alligo_alerts

    if not admin_key:
        log("❌ No ALLIGO_ADMIN_KEY")
        sys.exit(1)

    scored = load_scored()
    log(f"📋 Previously scored: {len(scored)} agents")

    # Fetch Daydreams agent directory
    agents = fetch_daydreams_agents(limit=100)
    if not agents:
        log("⚠️ No agents returned — exiting")
        sys.exit(0)

    new_agents = [a for a in agents if str(a.get("agentId")) not in scored]
    log(f"🆕 {len(new_agents)} new agents to score (of {len(agents)} total)")

    high_risk = []
    scored_count = 0

    for agent in new_agents:
        agent_id = str(agent.get("agentId", ""))
        log(f"🔍 Scoring agent #{agent_id} (rating={agent.get('averageRating')} tasks={agent.get('completedTasks')})")

        result = score_agent_alligo(agent, admin_key)
        if result:
            scored[agent_id] = {
                "agent": agent,
                "score": result,
            }
            scored_count += 1

            if result["risk_score"] >= 75:
                high_risk.append((agent, result))

        time.sleep(0.3)  # rate limit

    save_scored(scored)

    # Summary stats
    all_scores = [v["score"]["risk_score"] for v in scored.values() if "score" in v]
    avg_risk = sum(all_scores) / len(all_scores) if all_scores else 0
    high_risk_count = sum(1 for s in all_scores if s >= 75)

    log(f"✅ Done. Scored={scored_count} | Total tracked={len(scored)} | Avg risk={avg_risk:.0f} | High risk={high_risk_count}")

    # Telegram broadcast
    if bot_token and scored_count > 0:
        summary = (
            f"🤖 *Daydreams Agent Risk Scan*\n"
            f"_{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_\n\n"
            f"📊 Scanned *{len(agents)}* Daydreams Commerce Harness agents\n"
            f"🆕 Newly scored: *{scored_count}*\n"
            f"📈 Total tracked: *{len(scored)}*\n"
            f"⚠️ High-risk agents: *{high_risk_count}*\n"
            f"📉 Avg risk score: *{avg_risk:.0f}/100*\n\n"
            f"_AlliGo — Reputation layer for ERC-8004 · Daydreams Commerce Harness_"
        )
        send_telegram(bot_token, telegram_channel, summary)

        # Alert on high-risk new agents
        for agent, result in high_risk[:3]:  # cap at 3 alerts
            agent_id = agent.get("agentId")
            earnings = int(agent.get("totalEarnings", 0)) / 1e6
            alert = (
                f"🔴 *High-Risk Daydreams Agent Detected*\n"
                f"Agent ID: `#{agent_id}`\n"
                f"Risk Score: *{result['risk_score']}/100*\n"
                f"Severity: *{result['severity']}*\n"
                f"Tasks: {agent.get('completedTasks')} | Rating: {agent.get('averageRating')}/100\n"
                f"Earnings: ${earnings:.2f} USDC\n"
                f"Signals:\n" + "\n".join(f"  • {s}" for s in result["signals"][:3]) + "\n\n"
                f"🔗 https://alligo-production.up.railway.app/#leaderboard"
            )
            send_telegram(bot_token, telegram_channel, alert)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
