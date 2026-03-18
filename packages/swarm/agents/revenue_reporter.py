#!/usr/bin/env python3
"""
Zaia Swarm — Revenue Reporter Agent
Fetches /api/revenue (admin), formats a daily revenue report, posts to Telegram.

Schedule: every 24 hours
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

SWARM_DIR = Path(__file__).parent.parent
LOG_DIR = SWARM_DIR / "logs"
LOG_FILE = LOG_DIR / f"revenue_reporter_{datetime.now().strftime('%Y-%m-%d')}.log"

ALLIGO_API = "https://alligo-production.up.railway.app"
TELEGRAM_API = "https://api.telegram.org"


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [revenue_reporter] {msg}"
    print(line, flush=True)
    LOG_FILE.parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def http_get(url: str, headers: dict | None = None, timeout: int = 15) -> dict | None:
    try:
        h = {"Accept": "application/json", "User-Agent": "AlliGo-Swarm/1.0"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ GET failed {url}: {e}")
        return None


def http_post(url: str, payload: dict, headers: dict | None = None) -> dict | None:
    try:
        data = json.dumps(payload).encode()
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, headers=h, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ POST failed {url}: {e}")
        return None


def send_telegram(bot_token: str, channel_id: str, text: str) -> bool:
    url = f"{TELEGRAM_API}/bot{bot_token}/sendMessage"
    result = http_post(url, {"chat_id": channel_id, "text": text, "parse_mode": "Markdown"})
    return bool(result and result.get("ok"))


def format_usdc(amount: float) -> str:
    if amount >= 1000:
        return f"${amount:,.0f}"
    elif amount > 0:
        return f"${amount:.2f}"
    return "$0.00"


def main():
    log("💰 Revenue Reporter starting")

    admin_key = os.environ.get("ALLIGO_ADMIN_KEY", "")
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    telegram_channel = os.environ.get("TELEGRAM_CHANNEL_ID", "-1003655064149")

    if not admin_key:
        log("❌ No ALLIGO_ADMIN_KEY — cannot fetch revenue data")
        sys.exit(1)

    # Fetch revenue data
    revenue_data = http_get(
        f"{ALLIGO_API}/api/revenue",
        headers={"Authorization": f"Bearer {admin_key}"}
    )

    if not revenue_data:
        log("❌ Failed to fetch revenue data")
        sys.exit(1)

    # Parse data
    rev = revenue_data.get("revenue", {})
    keys = revenue_data.get("api_keys", {})
    forensics = revenue_data.get("forensics", {})

    total_usdc = rev.get("total_usdc", 0)
    unlocks = rev.get("unlocks_count", 0)
    breakdown = rev.get("breakdown", {})

    total_keys = keys.get("total", 0)
    pro_keys = keys.get("pro", 0)
    free_keys = keys.get("free", 0)

    total_claims = forensics.get("total_claims", 0)
    total_preds = forensics.get("total_predictions", 0)
    confirmed_preds = forensics.get("confirmed_predictions", 0)
    accuracy = forensics.get("prediction_accuracy", 0)

    # Also fetch public claims count for context
    claims_data = http_get(f"{ALLIGO_API}/api/public/claims?limit=5")
    top_claims = claims_data.get("claims", []) if claims_data else []
    top_risk = top_claims[0] if top_claims else None

    # Format breakdown
    breakdown_lines = []
    for tier, count in (breakdown or {}).items():
        breakdown_lines.append(f"  • {tier}: {count} payment(s)")
    breakdown_str = "\n".join(breakdown_lines) if breakdown_lines else "  • No breakdown available"

    # Top risk agent
    top_risk_line = ""
    if top_risk:
        val = top_risk.get("totalValueAtRisk", 0)
        if val >= 1_000_000:
            val_str = f"${val/1_000_000:.1f}M"
        elif val >= 1_000:
            val_str = f"${val/1_000:.0f}K"
        else:
            val_str = f"${val:,}"
        top_risk_line = f"\n🔴 *Top Risk:* {top_risk.get('agentName', 'Unknown')} — {val_str}"

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%MUTC")

    report = (
        f"📊 *AlliGo Daily Revenue Report*\n"
        f"_{now_str}_\n"
        f"━━━━━━━━━━━━━━━━\n\n"
        f"💵 *Revenue*\n"
        f"  Total USDC: *{format_usdc(total_usdc)}*\n"
        f"  x402 Unlocks: {unlocks}\n"
        f"{breakdown_str}\n\n"
        f"🔑 *API Keys*\n"
        f"  Total: {total_keys} | Pro: {pro_keys} | Free: {free_keys}\n\n"
        f"🧠 *Forensics Engine*\n"
        f"  Claims: {total_claims} | Predictions: {total_preds}\n"
        f"  Confirmed: {confirmed_preds} | Accuracy: {accuracy}%"
        f"{top_risk_line}\n\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"_AlliGo — The Credit Bureau for AI Agents_"
    )

    log(f"📊 Revenue: {format_usdc(total_usdc)} | Unlocks: {unlocks} | Pro keys: {pro_keys} | Accuracy: {accuracy}%")

    if bot_token:
        ok = send_telegram(bot_token, telegram_channel, report)
        if ok:
            log("✅ Revenue report sent to Telegram")
        else:
            log("⚠️ Failed to send to Telegram")
    else:
        log("⚠️ No TELEGRAM_BOT_TOKEN — printing report only")
        print(report)


if __name__ == "__main__":
    main()
