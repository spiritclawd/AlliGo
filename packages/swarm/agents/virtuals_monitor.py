#!/usr/bin/env python3
"""
Zaia Swarm — Virtuals Protocol Monitor
Polls api.virtuals.io for newly created agents (UNDERGRAD/SENTIENT).
For each new agent found:
  1. Checks if it matches any AlliGo risk profiles (protocol name, token symbol)
  2. Fetches the AlliGo risk score for the agent (by name/symbol lookup)
  3. If HIGH risk, submits an automatic claim to AlliGo
  4. Stores discovered agents locally to avoid re-processing

Schedule: every 60 minutes
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
SEEN_FILE = DATA_DIR / "virtuals_seen.json"
LOG_FILE = LOG_DIR / f"virtuals_monitor_{datetime.now().strftime('%Y-%m-%d')}.log"
ALLIGO_API = "https://alligo-production.up.railway.app"
VIRTUALS_API = "https://api.virtuals.io/api/virtuals"

# Risk keywords that warrant automatic claim submission
HIGH_RISK_KEYWORDS = [
    "flash loan", "sandwich", "arbitrage exploit", "mev", "rug", 
    "honeypot", "drain", "infinite mint", "backdoor", "selfdestruct",
    "oracle manipulation", "price manipulation", "exit scam"
]

# Known rekt protocols for cross-reference
KNOWN_REKT_PROTOCOLS = {
    "bybit", "moonwell", "wormhole", "euler", "mango", "nomad",
    "ronin", "beanstalk", "badgerdao", "cream", "compound", "aave",
    "sushiswap", "uniswap", "curve", "balancer", "synthetix"
}


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [virtuals_monitor] {msg}"
    print(line, flush=True)
    LOG_FILE.parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_seen() -> dict:
    if SEEN_FILE.exists():
        try:
            return json.loads(SEEN_FILE.read_text())
        except Exception:
            return {}
    return {}


def save_seen(seen: dict):
    DATA_DIR.mkdir(exist_ok=True)
    SEEN_FILE.write_text(json.dumps(seen, indent=2))


def http_get(url: str, timeout: int = 15) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "AlliGo-Monitor/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ GET {url[:60]}... failed: {e}")
        return None


def http_post(url: str, payload: dict, headers: dict = None) -> dict | None:
    try:
        data = json.dumps(payload).encode()
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ POST {url[:60]}... failed: {e}")
        return None


def fetch_new_virtuals_agents(since_hours: int = 2) -> list:
    """Fetch recently created Virtuals agents."""
    cutoff = datetime.utcnow() - timedelta(hours=since_hours)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    
    agents = []
    page = 1
    page_size = 25
    max_pages = 4  # don't over-fetch, cost aware

    while page <= max_pages:
        params = urllib.parse.urlencode({
            "sort[0]": "createdAt:desc",
            "pagination[pageSize]": page_size,
            "pagination[page]": page,
        })
        url = f"{VIRTUALS_API}?{params}"
        data = http_get(url)
        if not data:
            break

        batch = data.get("data", [])
        if not batch:
            break

        new_in_batch = 0
        for agent in batch:
            created_at = agent.get("createdAt", "")
            if created_at < cutoff_str:
                # Sorted desc, so everything after this is older
                return agents
            agents.append(agent)
            new_in_batch += 1

        meta = data.get("meta", {}).get("pagination", {})
        total_pages = meta.get("pageCount", 1)
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.5)  # gentle rate limiting

    return agents


def assess_risk(agent: dict) -> dict:
    """
    Assess risk level for a Virtuals agent based on:
    - Name/description keyword matching
    - Cross-reference with known rekt protocols
    - Status (UNDERGRAD is less vetted than SENTIENT)
    Returns: {risk_level, reasons, score}
    """
    name = (agent.get("name") or "").lower()
    symbol = (agent.get("symbol") or "").lower()
    description = (agent.get("description") or "").lower()
    token_utility = (agent.get("tokenUtility") or "").lower()
    status = agent.get("status", "UNDERGRAD")
    holder_count = agent.get("holderCount", 0)
    is_verified = agent.get("isVerified", False)
    mcap_in_virtual = agent.get("mcapInVirtual", 0)

    reasons = []
    risk_score = 0

    # Check for high-risk keywords in description
    for kw in HIGH_RISK_KEYWORDS:
        if kw in description or kw in token_utility:
            reasons.append(f"risk keyword in description: '{kw}'")
            risk_score += 30

    # Cross-reference with known rekt protocols
    for proto in KNOWN_REKT_PROTOCOLS:
        if proto in name or proto in symbol:
            reasons.append(f"impersonates known rekt protocol: '{proto}'")
            risk_score += 50

    # Suspicious patterns
    if holder_count == 1 and mcap_in_virtual > 0:
        reasons.append("single holder with non-zero mcap (potential rug setup)")
        risk_score += 20

    if not is_verified and status == "UNDERGRAD" and mcap_in_virtual > 10000:
        reasons.append("unverified agent with significant mcap")
        risk_score += 15

    # Check if name contains known exploit patterns
    exploit_patterns = ["fork", "clone", "copy", "v2", "v3", "finance", "protocol"]
    combined = name + " " + symbol
    suspicious_combos = [p for p in exploit_patterns if p in combined]
    if len(suspicious_combos) >= 2:
        reasons.append(f"generic name pattern suggesting clone: {suspicious_combos}")
        risk_score += 10

    # Determine risk level
    if risk_score >= 50:
        risk_level = "HIGH"
    elif risk_score >= 25:
        risk_level = "MEDIUM"
    elif risk_score >= 10:
        risk_level = "LOW"
    else:
        risk_level = "CLEAN"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "reasons": reasons,
        "status": status,
        "holder_count": holder_count,
        "is_verified": is_verified,
        "mcap_in_virtual": mcap_in_virtual,
    }


def check_alligo_score(agent_name: str) -> dict | None:
    """Check if AlliGo already has a score for this agent by name."""
    encoded = urllib.parse.quote(agent_name.lower().replace(" ", "-"))
    url = f"{ALLIGO_API}/api/public/agents/{encoded}/score"
    result = http_get(url)
    if result and result.get("agentId"):
        return result
    return None


def submit_claim_to_alligo(agent: dict, risk: dict, admin_key: str) -> dict | None:
    """Submit a high-risk Virtuals agent as a claim to AlliGo."""
    agent_name = agent.get("name", "Unknown Agent")
    symbol = agent.get("symbol", "???")
    virtual_id = agent.get("id")
    token_address = agent.get("tokenAddress") or agent.get("preToken", "")
    chain = agent.get("chain", "BASE")
    status = agent.get("status", "UNDERGRAD")
    reasons_text = "; ".join(risk["reasons"]) if risk["reasons"] else "Automated risk detection"

    payload = {
        "agentId": f"virtuals-{symbol.lower()}-{virtual_id}",
        "agentName": agent_name,
        "protocol": f"Virtuals Protocol ({symbol})",
        "incidentType": "SUSPICIOUS_DEPLOYMENT",
        "severity": risk["risk_level"],
        "description": (
            f"Automated AlliGo risk detection for Virtuals agent '{agent_name}' "
            f"(${symbol}, status={status}, chain={chain}). "
            f"Risk assessment: {risk['risk_level']} (score={risk['risk_score']}). "
            f"Reasons: {reasons_text}. "
            f"Token: {token_address or 'preToken only'}. "
            f"Holders: {risk['holder_count']}, Verified: {risk['is_verified']}, "
            f"MCap: {risk['mcap_in_virtual']} VIRTUAL tokens."
        ),
        "evidence": {
            "source": "virtuals_monitor",
            "virtual_id": virtual_id,
            "token_address": token_address,
            "chain": chain,
            "risk_reasons": risk["reasons"],
            "risk_score": risk["risk_score"],
            "api_url": f"https://app.virtuals.io/virtuals/{virtual_id}",
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "automated": True,
        "source": "zaia_swarm_virtuals_monitor"
    }

    return http_post(
        f"{ALLIGO_API}/api/claims",
        payload,
        headers={"Authorization": f"Bearer {admin_key}"}
    )


def main():
    log("🤖 Virtuals Protocol Monitor starting")
    DATA_DIR.mkdir(exist_ok=True)

    admin_key = os.environ.get("ALLIGO_ADMIN_KEY", "")
    if not admin_key:
        log("⚠️ ALLIGO_ADMIN_KEY not set — claim submission disabled")

    seen = load_seen()
    log(f"📋 Seen agents: {len(seen)}")

    # Fetch agents created in last 2 hours
    agents = fetch_new_virtuals_agents(since_hours=2)
    log(f"🔍 Fetched {len(agents)} recently created Virtuals agents")

    new_agents = [a for a in agents if str(a.get("id")) not in seen]
    log(f"🆕 {len(new_agents)} new (unseen) agents")

    claims_submitted = 0
    high_risk = 0
    medium_risk = 0
    clean = 0

    for agent in new_agents:
        agent_id = str(agent.get("id"))
        agent_name = agent.get("name", f"unknown-{agent_id}")
        symbol = agent.get("symbol", "???")
        status = agent.get("status", "?")
        chain = agent.get("chain", "?")

        risk = assess_risk(agent)

        log(
            f"  [{risk['risk_level']:6s}] {agent_name} (${symbol}) "
            f"| id={agent_id} | status={status} | chain={chain} "
            f"| score={risk['risk_score']} | holders={risk['holder_count']}"
        )

        if risk["reasons"]:
            log(f"         reasons: {'; '.join(risk['reasons'][:3])}")

        # Mark as seen
        seen[agent_id] = {
            "name": agent_name,
            "symbol": symbol,
            "risk_level": risk["risk_level"],
            "risk_score": risk["risk_score"],
            "first_seen": datetime.utcnow().isoformat(),
            "status": status,
        }

        if risk["risk_level"] == "HIGH":
            high_risk += 1
            # Check if AlliGo already knows about this
            existing = check_alligo_score(agent_name)
            if existing:
                log(f"         ℹ️ AlliGo already has score for {agent_name}")
            elif admin_key:
                result = submit_claim_to_alligo(agent, risk, admin_key)
                if result and result.get("success"):
                    claims_submitted += 1
                    claim_id = result.get("claim", {}).get("id", "?")
                    log(f"         ✅ Claim submitted → {claim_id}")
                else:
                    log(f"         ⚠️ Claim submission failed: {result}")
            else:
                log(f"         ⚠️ HIGH RISK but no admin key — skipping claim submission")
        elif risk["risk_level"] == "MEDIUM":
            medium_risk += 1
        else:
            clean += 1

        time.sleep(0.2)  # gentle pacing

    save_seen(seen)

    log(
        f"✅ Done. Processed={len(new_agents)} | HIGH={high_risk} | MEDIUM={medium_risk} | CLEAN={clean} | Claims={claims_submitted}"
    )
    log(f"📦 Total tracked agents: {len(seen)}")


if __name__ == "__main__":
    main()
