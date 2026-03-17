#!/usr/bin/env python3
"""
Zaia Swarm — AgentMail Inbox Router
Polls spirit@agentmail.to every 30 minutes.
Parses incoming emails for AI agent incident reports.
Submits structured incidents to AlliGo API.
Also handles: partnership inquiries, API key requests, data submissions.

Email format for incident submission:
  Subject: INCIDENT REPORT - <protocol name>
  Body:
    Agent: <address or name>
    Protocol: <protocol>
    Type: <incident type>
    Amount: $<amount>
    TxHash: <0x...>
    Description: <free text>

Any email with "incident", "exploit", "hack", "rogue agent" triggers LLM extraction.
"""

import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
PROCESSED_FILE = DATA_DIR / "agentmail_processed.json"
INBOX_LOG = DATA_DIR / "agentmail_inbox.jsonl"

AGENTMAIL_KEY = os.environ.get("AGENTMAIL_API_KEY", "")
AGENTMAIL_INBOX = os.environ.get("AGENTMAIL_INBOX", "spirit@agentmail.to")
AGENTMAIL_BASE = "https://api.agentmail.to/v0"

ALLIGO_API = os.environ.get("ALLIGO_API", "https://alligo-production.up.railway.app")
ALLIGO_KEY = os.environ.get("ALLIGO_ADMIN_KEY", "")

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")

# ── Logging ──────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [agentmail] {msg}"
    print(line)
    log_file = LOG_DIR / f"agentmail_{datetime.now().strftime('%Y-%m-%d')}.log"
    with open(log_file, "a") as f:
        f.write(line + "\n")

# ── State ────────────────────────────────────────────────────────────────────
def load_processed() -> set:
    if PROCESSED_FILE.exists():
        return set(json.loads(PROCESSED_FILE.read_text()))
    return set()

def save_processed(processed: set):
    PROCESSED_FILE.write_text(json.dumps(list(processed), indent=2))

# ── AgentMail API ─────────────────────────────────────────────────────────────
def am_get(path: str) -> dict | None:
    url = f"{AGENTMAIL_BASE}{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {AGENTMAIL_KEY}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"AgentMail GET error {path}: {e}")
        return None

def am_reply(thread_id: str, body: str):
    """Send a reply to an AgentMail thread."""
    url = f"{AGENTMAIL_BASE}/inboxes/{urllib.parse.quote(AGENTMAIL_INBOX)}/threads/{thread_id}/messages"
    payload = json.dumps({
        "text": body,
        "subject": "Re: AlliGo Intelligence",
    }).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Authorization": f"Bearer {AGENTMAIL_KEY}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"AgentMail reply error: {e}")
        return None

# ── AlliGo API ───────────────────────────────────────────────────────────────
def submit_claim(claim: dict) -> dict | None:
    url = f"{ALLIGO_API}/api/claims"
    payload = json.dumps(claim).encode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Authorization": f"Bearer {ALLIGO_KEY}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"AlliGo submit error: {e}")
        return None

# ── LLM Extraction ────────────────────────────────────────────────────────────
def extract_incident_with_llm(subject: str, body: str) -> dict | None:
    """Use LLM to extract structured incident data from free-form email."""
    prompt = f"""Extract AI agent incident data from this email. Return JSON only.

SUBJECT: {subject}
BODY:
{body[:1500]}

Extract these fields (use null if not found):
- agent_id: ethereum address (0x...) or agent name
- protocol: protocol/project name
- incident_type: one of [Flash_Loan_Exploit, Rug_Pull, Oracle_Manipulation, Market_Manipulation, Social_Engineering, Smart_Contract_Exploit, Rogue_Agent_Behavior, Unknown_Incident]
- amount_usd: numeric dollar amount (null if unknown)
- tx_hash: transaction hash (0x... 64 hex chars, null if none)
- description: 1-2 sentence summary
- severity: 1-10 (10=critical)
- is_incident: true if this is a genuine security incident report, false if spam/unrelated

JSON response:"""

    for api_url, api_key, model, name in [
        ("https://openrouter.ai/api/v1", OPENROUTER_KEY, "meta-llama/llama-3.1-8b-instruct", "OpenRouter"),
        ("https://api.groq.com/openai/v1", GROQ_KEY, "llama-3.3-70b-versatile", "Groq"),
    ]:
        if not api_key:
            continue
        try:
            payload = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
                "temperature": 0.1,
            }).encode()
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            if "openrouter" in api_url:
                headers["HTTP-Referer"] = "https://alligo-production.up.railway.app"
                headers["X-Title"] = "AlliGo AgentMail Router"
            req = urllib.request.Request(
                f"{api_url}/chat/completions",
                data=payload,
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                result = json.loads(r.read())
                content = result["choices"][0]["message"]["content"].strip()
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
        except Exception as e:
            log(f"LLM extraction ({name}) failed: {e}")
            continue
    return None

# ── Keyword Classifier ────────────────────────────────────────────────────────
INCIDENT_SIGNALS = [
    "incident", "exploit", "hack", "rogue agent", "drain", "rug pull", "rug",
    "flash loan", "oracle", "manipulation", "breach", "vulnerability",
    "attack", "stolen", "loss", "compromised", "malicious", "fraud",
    "bot abuse", "agent misbehavior", "unauthorized", "suspicious activity",
]

IGNORE_SIGNALS = [
    "unsubscribe", "newsletter", "marketing", "github", "railway",
    "build failed", "notification", "noreply@github", "noreply@railway",
]

def classify_email(subject: str, body: str, sender: str) -> str:
    """Returns: 'incident' | 'inquiry' | 'ignore'"""
    text = f"{subject} {body} {sender}".lower()

    # Hard ignore: system notifications
    if any(s in text for s in IGNORE_SIGNALS):
        return "ignore"

    # Incident signals
    incident_hits = sum(1 for s in INCIDENT_SIGNALS if s in text)
    if incident_hits >= 2 or "incident report" in subject.lower():
        return "incident"

    # Inquiry: mentions alligo, api, partnership, integration
    if any(s in text for s in ["alligo", "api key", "partnership", "integrate", "plugin", "elizaos", "daydreams", "virtuals"]):
        return "inquiry"

    return "ignore"

# ── Structured Parser (no-LLM fast path) ─────────────────────────────────────
def parse_structured_email(subject: str, body: str) -> dict | None:
    """Parse explicitly formatted INCIDENT REPORT emails without LLM."""
    if "incident report" not in subject.lower():
        return None

    result: dict = {}
    patterns = {
        "agent_id": r"(?:agent|address)[:\s]+([0-9a-zA-Z_\-\.@x]+)",
        "protocol": r"protocol[:\s]+([^\n]+)",
        "amount_usd": r"amount[:\s]+\$?([\d,\.]+)\s*(?:million|M|k|K|USD)?",
        "tx_hash": r"(?:tx|txhash|transaction)[:\s]+(0x[a-fA-F0-9]{64})",
        "description": r"description[:\s]+([^\n]+(?:\n(?!\w)[^\n]*)*)",
    }

    for field, pattern in patterns.items():
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            val = match.group(1).strip()
            if field == "amount_usd":
                try:
                    result[field] = float(val.replace(",", ""))
                except:
                    pass
            else:
                result[field] = val

    # Incident type
    type_map = {
        "flash loan": "Flash_Loan_Exploit",
        "rug": "Rug_Pull",
        "oracle": "Oracle_Manipulation",
        "social": "Social_Engineering",
        "manipulat": "Market_Manipulation",
    }
    body_lower = body.lower()
    result["incident_type"] = next(
        (v for k, v in type_map.items() if k in body_lower),
        "Unknown_Incident"
    )
    result["description"] = result.get("description", subject)
    return result if result.get("protocol") or result.get("agent_id") else None

# ── Auto-reply composer ───────────────────────────────────────────────────────
def compose_incident_reply(claim_id: str | None, protocol: str, amount: float | None) -> str:
    amount_str = f"${amount:,.0f}" if amount else "unknown amount"
    return f"""Thank you for reporting this incident to AlliGo.

Your report has been received and queued for forensic analysis:
  • Protocol: {protocol}
  • Amount: {amount_str}
  • Claim ID: {claim_id or 'pending'}

The AlliGo forensics engine will classify this incident against our 10 behavioral archetypes and generate an EAS attestation if verified.

Track your submission: https://alligo-production.up.railway.app/api/claims/{claim_id or ''}

— Zaia | AlliGo Intelligence Engine
"""

def compose_inquiry_reply() -> str:
    return """Thank you for reaching out to AlliGo — The Credit Bureau for AI Agents.

AlliGo provides risk intelligence for the AI agent economy:
  • Risk scores for AI agents (REST API + ElizaOS plugin)
  • EAS-attested incident records on Base mainnet
  • Forensic classification across 10 behavioral archetypes
  • x402 agent-native payments

To get started:
  → API: https://alligo-production.up.railway.app
  → ElizaOS plugin: https://github.com/spiritclawd/AlliGo/tree/master/packages/plugin-elizaos
  → Report an incident: Reply with subject "INCIDENT REPORT - <Protocol Name>"

For partnership inquiries, reply to this email with details.

— Zaia | AlliGo Intelligence Engine
"""

# ── Main ──────────────────────────────────────────────────────────────────────
import urllib.parse

def process_thread(thread: dict, processed: set) -> bool:
    """Process a single thread. Returns True if action taken."""
    thread_id = thread["thread_id"]
    subject = thread.get("subject", "")
    preview = thread.get("preview", "")
    senders = thread.get("senders", [])
    sender = senders[0] if senders else ""

    # Get full message body
    messages = thread.get("messages", [])
    body = ""
    if messages:
        body = messages[0].get("text", messages[0].get("extracted_text", ""))
    if not body:
        body = preview

    category = classify_email(subject, body, sender)
    log(f"Thread [{category}] '{subject[:50]}' from {sender[:40]}")

    if category == "ignore":
        return False

    if category == "incident":
        # Try structured parse first (free), then LLM
        incident_data = parse_structured_email(subject, body)
        if not incident_data:
            incident_data = extract_incident_with_llm(subject, body)

        if not incident_data or not incident_data.get("is_incident", True) is not False:
            log(f"  → LLM says not a real incident, skipping")
            return False

        # Build AlliGo claim
        protocol = incident_data.get("protocol", "Unknown")
        agent_id = incident_data.get("agent_id", "unknown")
        incident_type = incident_data.get("incident_type", "Unknown_Incident")
        amount_usd = incident_data.get("amount_usd")
        tx_hash = incident_data.get("tx_hash")
        description = incident_data.get("description", subject)
        severity = incident_data.get("severity", 5)

        claim = {
            "protocol": protocol,
            "agentId": agent_id,
            "incidentType": incident_type,
            "description": f"[Via AgentMail from {sender}] {description}",
            "amountLost": int(amount_usd * 100) if amount_usd else 0,
            "txHash": tx_hash,
            "severityScore": severity,
            "source": "agentmail",
            "reporterEmail": sender,
        }

        result = submit_claim(claim)
        claim_id = result.get("id") if result else None
        log(f"  → Submitted claim: {claim_id} | {protocol} | {incident_type} | ${amount_usd or 0:,.0f}")

        # Log to inbox file
        with open(INBOX_LOG, "a") as f:
            f.write(json.dumps({
                "thread_id": thread_id,
                "subject": subject,
                "sender": sender,
                "category": category,
                "claim_id": claim_id,
                "incident_data": incident_data,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }) + "\n")

        # Auto-reply
        reply = compose_incident_reply(claim_id, protocol, amount_usd)
        am_reply(thread_id, reply)
        log(f"  → Replied to {sender}")
        return True

    elif category == "inquiry":
        log(f"  → Inquiry from {sender} — sending AlliGo info")
        am_reply(thread_id, compose_inquiry_reply())

        with open(INBOX_LOG, "a") as f:
            f.write(json.dumps({
                "thread_id": thread_id,
                "subject": subject,
                "sender": sender,
                "category": "inquiry",
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }) + "\n")
        return True

    return False

def main():
    log("📬 AgentMail Router starting...")
    DATA_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

    if not AGENTMAIL_KEY:
        log("❌ AGENTMAIL_API_KEY not set")
        return

    processed = load_processed()

    # Fetch all threads (paginate up to 100)
    inbox_url = f"/inboxes/{urllib.parse.quote(AGENTMAIL_INBOX)}/threads?limit=50"
    data = am_get(inbox_url)
    if not data:
        log("❌ Failed to fetch inbox")
        return

    threads_raw = data.get("threads", data.get("items", []))
    log(f"Inbox: {len(threads_raw)} threads | {len(processed)} already processed")

    # For each unprocessed thread, fetch full detail (includes messages)
    new_threads = [t for t in threads_raw if t["thread_id"] not in processed]
    log(f"New threads to process: {len(new_threads)}")

    actions = 0
    for thread_raw in new_threads:
        thread_id = thread_raw["thread_id"]
        # Fetch full thread with message bodies
        full_thread = am_get(f"/inboxes/{urllib.parse.quote(AGENTMAIL_INBOX)}/threads/{thread_id}")
        if not full_thread:
            continue

        try:
            acted = process_thread(full_thread, processed)
            if acted:
                actions += 1
        except Exception as e:
            log(f"  ❌ Error processing thread {thread_id}: {e}")

        processed.add(thread_id)

    save_processed(processed)
    log(f"✅ AgentMail Router done. Processed {len(new_threads)} threads, {actions} actions taken.")

if __name__ == "__main__":
    main()
