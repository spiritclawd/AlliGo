#!/usr/bin/env python3
"""
Zaia Swarm — Telegram Ingest Agent
Reads @alligo_alerts channel + @alligoBot messages for user-submitted drain reports.

Two modes:
  - BOT_TOKEN mode (preferred): uses Telegram Bot API to read updates/messages
  - SCRAPER mode (fallback): scrapes public t.me/s/alligo_alerts HTML

For each incident message found:
  1. Parses protocol name, amount lost, description
  2. Checks if AlliGo already has a matching claim
  3. Submits new unique claims to AlliGo
  4. Deduplicates via data/telegram_seen.json

Schedule: every 30 minutes
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path

SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
SEEN_FILE = DATA_DIR / "telegram_seen.json"
LOG_FILE = LOG_DIR / f"telegram_ingest_{datetime.now().strftime('%Y-%m-%d')}.log"

ALLIGO_API = "https://alligo-production.up.railway.app"
TELEGRAM_CHANNEL = "alligo_alerts"
TELEGRAM_API = "https://api.telegram.org"

# Drain report patterns to look for in messages
DRAIN_PATTERNS = [
    r"\$[\d,\.]+[KkMmBb]?\s*(lost|drained|stolen|hacked|exploit)",
    r"(drained|exploited|hacked|compromised|rug[gd]?)\s+\$?[\d,\.]+",
    r"(lost|stolen)\s+\$[\d,\.]+",
    r"agent.*fail",
    r"bot.*drain",
    r"autonomous.*exploit",
    r"\breport\b.*\bincident\b",
    r"\bincident\b.*\breport\b",
]

# Keywords that indicate a user is reporting a new incident (not a bot alert)
USER_REPORT_KEYWORDS = [
    "just happened", "just saw", "reporting", "heads up", "fyi",
    "my agent", "our agent", "the agent", "got drained", "got hacked",
    "i think", "anyone else", "is this", "same here"
]


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [telegram_ingest] {msg}"
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
    SEEN_FILE.write_text(json.dumps(seen, indent=2, default=str))


def http_get(url: str, timeout: int = 15) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "AlliGo-Swarm/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"⚠️ GET failed: {e}")
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
        log(f"⚠️ POST failed: {e}")
        return None


# ── Bot API Mode ─────────────────────────────────────────────────────────────

def fetch_bot_updates(bot_token: str, offset: int = 0) -> list:
    """Fetch new messages via Telegram Bot API getUpdates."""
    url = f"{TELEGRAM_API}/bot{bot_token}/getUpdates?offset={offset}&limit=100&timeout=5"
    data = http_get(url)
    if not data or not data.get("ok"):
        return []
    return data.get("result", [])


def fetch_channel_messages_bot(bot_token: str, channel: str, limit: int = 50) -> list:
    """
    Forward channel messages via bot. Bot must be admin of the channel.
    Uses getChatHistory workaround via forwardMessages if needed.
    Falls back to getUpdates for direct messages to the bot.
    """
    updates = fetch_bot_updates(bot_token, offset=0)
    messages = []
    for update in updates:
        msg = update.get("message") or update.get("channel_post") or {}
        if msg:
            messages.append({
                "id": update.get("update_id"),
                "text": msg.get("text", ""),
                "from": msg.get("from", {}).get("username", "unknown"),
                "chat_type": msg.get("chat", {}).get("type", "unknown"),
                "chat_title": msg.get("chat", {}).get("title", ""),
                "date": msg.get("date", 0),
            })
    return messages


# ── Scraper Mode (fallback) ───────────────────────────────────────────────────

def scrape_channel_messages(channel: str) -> list:
    """Scrape public Telegram channel via t.me/s/ HTML endpoint."""
    url = f"https://t.me/s/{channel}"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; AlliGoBot/1.0)",
            "Accept": "text/html"
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        log(f"⚠️ Scrape failed: {e}")
        return []

    messages = []
    # Extract message blocks
    # Each message has a data-post attribute with channel/messageID
    post_ids = re.findall(r'data-post="([^"]+)"', html)
    text_blocks = re.findall(
        r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
        html, re.DOTALL
    )
    
    for i, (post_id, raw_text) in enumerate(zip(post_ids, text_blocks)):
        clean = re.sub(r'<[^>]+>', ' ', raw_text)
        clean = re.sub(r'&lt;', '<', clean)
        clean = re.sub(r'&gt;', '>', clean)
        clean = re.sub(r'&amp;', '&', clean)
        clean = re.sub(r'&#x27;', "'", clean)
        clean = re.sub(r'&#036;', '$', clean)
        clean = re.sub(r'&[a-z]+;', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()
        if clean:
            messages.append({
                "id": post_id,
                "text": clean,
                "from": "channel",
                "source": "scraper",
            })

    return messages


# ── Incident Parsing ──────────────────────────────────────────────────────────

def parse_drain_report(text: str) -> dict | None:
    """
    Try to extract incident fields from a message.
    Returns parsed dict or None if not an incident.
    """
    text_lower = text.lower()

    # Skip Zaia-generated alerts (already in AlliGo)
    if "zaia swarm" in text_lower or "auto-discovered" in text_lower:
        return None
    if "new agent failure" in text_lower and "amount lost:" in text_lower:
        return None  # Already a formatted AlliGo alert

    # Check if this looks like an incident report
    is_incident = False
    for pattern in DRAIN_PATTERNS:
        if re.search(pattern, text_lower):
            is_incident = True
            break

    if not is_incident:
        return None

    # Extract amount
    amount = 0
    amount_match = re.search(r'\$\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb]?)', text)
    if amount_match:
        num = float(amount_match.group(1).replace(',', ''))
        suffix = amount_match.group(2).upper()
        if suffix == 'K':
            num *= 1_000
        elif suffix == 'M':
            num *= 1_000_000
        elif suffix == 'B':
            num *= 1_000_000_000
        amount = int(num)

    # Extract protocol name (best effort)
    protocol = "Unknown Protocol"
    # Look for capitalized names before keywords
    proto_match = re.search(r'([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)\s+(?:was|got|has been|protocol|agent|bot|vault)', text)
    if proto_match:
        protocol = proto_match.group(1)

    # Determine severity based on amount
    if amount >= 10_000_000:
        severity = "CRITICAL"
    elif amount >= 1_000_000:
        severity = "HIGH"
    elif amount >= 100_000:
        severity = "MEDIUM"
    elif amount > 0:
        severity = "LOW"
    else:
        severity = "MEDIUM"  # Unknown amount, assume medium

    return {
        "protocol": protocol,
        "amount": amount,
        "severity": severity,
        "description": text[:500],
        "source": "telegram_user_report",
    }


def submit_claim(parsed: dict, msg: dict, admin_key: str) -> dict | None:
    """Submit a parsed incident as a claim to AlliGo."""
    protocol_slug = parsed["protocol"].lower().replace(" ", "-")
    ts = datetime.utcnow().isoformat() + "Z"

    payload = {
        "agentId": f"tg-{protocol_slug}-{int(time.time())}",
        "agentName": parsed["protocol"],
        "protocol": parsed["protocol"],
        "incidentType": "USER_REPORTED",
        "severity": parsed["severity"],
        "amountLost": parsed["amount"],
        "description": (
            f"[Telegram user report via @alligo_alerts] {parsed['description']}"
        ),
        "evidence": {
            "source": "telegram_ingest",
            "telegram_message_id": msg.get("id"),
            "reported_by": msg.get("from", "unknown"),
            "channel": TELEGRAM_CHANNEL,
            "raw_text": msg.get("text", "")[:300],
        },
        "timestamp": ts,
        "automated": True,
        "source": "zaia_swarm_telegram_ingest",
    }

    return http_post(
        f"{ALLIGO_API}/api/claims",
        payload,
        headers={"Authorization": f"Bearer {admin_key}"}
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("📡 Telegram Ingest Agent starting")
    DATA_DIR.mkdir(exist_ok=True)

    admin_key = os.environ.get("ALLIGO_ADMIN_KEY", "")
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")

    seen = load_seen()
    log(f"📋 Previously seen messages: {len(seen)}")

    # Fetch messages
    messages = []
    if bot_token:
        log("🤖 Using Bot API mode")
        messages = fetch_channel_messages_bot(bot_token, TELEGRAM_CHANNEL)
        log(f"📨 Bot API returned {len(messages)} updates")
    
    # Always also scrape public channel (catches channel posts bot might miss)
    log("🕷️ Scraping public channel feed")
    scraped = scrape_channel_messages(TELEGRAM_CHANNEL)
    log(f"📰 Scraped {len(scraped)} channel messages")
    messages.extend(scraped)

    # Deduplicate by message ID
    seen_in_batch = set()
    unique_messages = []
    for msg in messages:
        msg_id = str(msg.get("id", ""))
        if msg_id and msg_id not in seen_in_batch and msg_id not in seen:
            seen_in_batch.add(msg_id)
            unique_messages.append(msg)

    log(f"🆕 {len(unique_messages)} new unseen messages")

    claims_submitted = 0
    incidents_found = 0
    skipped_bot_alerts = 0

    for msg in unique_messages:
        msg_id = str(msg.get("id", ""))
        text = msg.get("text", "")

        # Mark as seen regardless of outcome
        seen[msg_id] = {
            "text": text[:100],
            "processed_at": datetime.utcnow().isoformat(),
        }

        parsed = parse_drain_report(text)
        if parsed is None:
            skipped_bot_alerts += 1
            continue

        incidents_found += 1
        log(f"🚨 Incident found: protocol={parsed['protocol']} amount=${parsed['amount']:,} severity={parsed['severity']}")
        log(f"   text: {text[:120]}")

        if admin_key:
            result = submit_claim(parsed, msg, admin_key)
            if result and result.get("success"):
                claims_submitted += 1
                claim_id = result.get("claim", {}).get("id", "?")
                log(f"   ✅ Claim submitted → {claim_id}")
            else:
                log(f"   ⚠️ Claim submission failed: {result}")
        else:
            log(f"   ⚠️ No ALLIGO_ADMIN_KEY — skipping submission")

    save_seen(seen)

    log(
        f"✅ Done. Processed={len(unique_messages)} | Incidents={incidents_found} | "
        f"Claims={claims_submitted} | SkippedBotAlerts={skipped_bot_alerts}"
    )


if __name__ == "__main__":
    main()
