#!/usr/bin/env python3
"""
Zaia Swarm — Crawler Agent v2
Discovers new AI agent incidents from public sources and submits to AlliGo.
Runs every 60 minutes. No API keys required for basic sources.

Sources:
  - rekt.news (HTML scrape — no RSS available)
  - cointelegraph.com RSS
  - coindesk.com RSS
  - theblock.co RSS
  - GitHub security advisories (elizaOS, virtuals-io, ai16z)
"""

import json
import re
import time
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser

# ==================== CONFIG ====================
SWARM_DIR = Path(__file__).parent.parent
DATA_DIR = SWARM_DIR / "data"
LOG_DIR = SWARM_DIR / "logs"
SEEN_FILE = DATA_DIR / "seen_urls.json"
ALLIGO_API = "https://alligo-production.up.railway.app"
import os
ALLIGO_ADMIN_KEY = os.environ.get("ALLIGO_ADMIN_KEY", "")

RSS_FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://www.theblock.co/rss.xml",
    "https://www.openzeppelin.com/news/feed",
]

# Broad set — catches DeFi hacks, AI exploits, agent failures, oracle attacks, etc.
INCIDENT_KEYWORDS = [
    # AI / Agent specific
    "AI agent", "autonomous agent", "LLM agent", "agentic", "agent exploit",
    "agent hack", "agent loss", "agent failure", "agent scam", "rogue agent",
    "AI trading", "trading bot", "DeFi bot", "AI model exploit",
    "vibe coding", "vibe-coded", "co-authored by claude", "co-authored by gpt",
    "prompt injection", "jailbreak", "memory poisoning",
    # General DeFi incidents (training data for AlliGo)
    "exploit", "hack", "rekt", "drained", "flash loan", "rug pull",
    "smart contract exploit", "oracle manipulation", "bridge hack",
    "private key", "admin key", "multisig", "price manipulation",
    "liquidation", "bad debt", "vulnerability", "security incident",
    "stolen", "theft", "lost funds", "million lost", "million drained",
    "attacker", "malicious", "unauthorized", "compromised",
]

# Tags to suppress (editorial / non-incident)
SUPPRESS_KEYWORDS = [
    "bitcoin etf", "sec approval", "regulation", "legislation", "opinion",
    "interview", "podcast", "newsletter", "analysis", "market cap",
    "price prediction", "nft launch", "token launch", "fundraise", "raises",
    "wife", "accuse", "arrest", "prison", "court", "lawsuit", "taxes",
    "surge", "rally", "moon", "ath", "all time high", "new high",
    "jensen huang", "nvidia", "partnership", "launch", "touts",
]

# Rekt.news editorial title patterns (no named protocol = editorial)
# These titles are metaphorical/thematic — not incident-specific
REKT_EDITORIAL_TITLE_PATTERNS = [
    r'^digital parasites?$',
    r'^legitimacy on demand$',
    r'^default settings$',
    r'^the unfinished proof$',
    r'^price impact kills$',  # This one actually has a protocol buried in description
    r'^identity theft \d+\.\d+$',  # We have the enriched version already
    r'^[a-z\s]+$',  # All lowercase, no protocol name (rough heuristic)
]

# Minimum amount for rekt.news articles (they only cover real incidents)
# $0 + metaphorical title = likely editorial
REKT_MIN_AMOUNT_USD = 0  # set to 100_000 to only get >$100k incidents

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [crawler] {msg}"
    print(line)
    log_file = LOG_DIR / f"crawler_{datetime.now().strftime('%Y-%m-%d')}.log"
    with open(log_file, "a") as f:
        f.write(line + "\n")

def load_seen() -> set:
    if SEEN_FILE.exists():
        return set(json.loads(SEEN_FILE.read_text()))
    return set()

def save_seen(seen: set):
    SEEN_FILE.write_text(json.dumps(list(seen)))

def fetch_url(url: str, timeout: int = 20) -> str | None:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ZaiaBot/2.0; +https://alligo.ai/crawler)",
        "Accept": "text/html,application/xhtml+xml,application/xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        log(f"Fetch error {url}: {e}")
        return None

def parse_rss(xml_content: str) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(xml_content)
        for item in root.iter("item"):
            title = item.findtext("title", "")
            link = item.findtext("link", "")
            desc = item.findtext("description", "")
            pub_date = item.findtext("pubDate", "")
            items.append({"title": title, "url": link, "description": desc[:500], "date": pub_date})
        if not items:
            for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
                title = entry.findtext("{http://www.w3.org/2005/Atom}title", "")
                link_el = entry.find("{http://www.w3.org/2005/Atom}link")
                link = link_el.get("href", "") if link_el is not None else ""
                summary = entry.findtext("{http://www.w3.org/2005/Atom}summary", "")
                items.append({"title": title, "url": link, "description": summary[:500], "date": ""})
    except Exception as e:
        log(f"RSS parse error: {e}")
    return items


class RektNewsParser(HTMLParser):
    """Scrape rekt.news post listings from HTML."""
    def __init__(self):
        super().__init__()
        self.posts = []
        self._in_post = False
        self._in_title = False
        self._current = {}
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        classes = attrs_dict.get("class", "")
        if "post " in classes or classes == "post featured" or "post" in classes.split():
            self._in_post = True
            self._current = {"title": "", "url": "", "description": ""}
        if self._in_post and tag == "a" and "post-title" in str(classes):
            href = attrs_dict.get("href", "")
            if href and not self._current.get("url"):
                self._current["url"] = f"https://rekt.news{href}" if href.startswith("/") else href
            self._in_title = True
        if self._in_post and tag == "p" and "post-excerpt" not in str(classes) and self._current.get("url"):
            pass  # description handled in data

    def handle_data(self, data):
        if self._in_title and data.strip():
            self._current["title"] += data.strip()

    def handle_endtag(self, tag):
        if self._in_title and tag == "a":
            self._in_title = False
        if self._in_post and tag == "article":
            if self._current.get("url") and self._current.get("title"):
                self.posts.append(self._current.copy())
            self._in_post = False
            self._current = {}


def scrape_rekt_news() -> list[dict]:
    """Scrape rekt.news homepage for recent incidents."""
    log("Scraping: https://rekt.news/")
    content = fetch_url("https://rekt.news/")
    if not content:
        return []

    # Extract article data via regex (more reliable than HTML parser for Next.js)
    incidents = []

    # Match article blocks: title + href + excerpt
    article_pattern = re.compile(
        r'<h5[^>]*post-title[^>]*>\s*<a href="([^"]+)"[^>]*>\s*(?:<!--[^>]*-->)?\s*([^<]+?)\s*</a>',
        re.DOTALL
    )
    excerpt_pattern = re.compile(
        r'class="post-excerpt"><p>(.+?)</p>',
        re.DOTALL
    )
    date_pattern = re.compile(r'<time>([^<]+)</time>')

    titles_urls = article_pattern.findall(content)
    excerpts = excerpt_pattern.findall(content)
    dates = date_pattern.findall(content)

    log(f"  Found {len(titles_urls)} articles on rekt.news")

    for i, (href, title) in enumerate(titles_urls):
        url = f"https://rekt.news{href}" if href.startswith("/") else href
        description = re.sub(r'<[^>]+>', '', excerpts[i]).strip() if i < len(excerpts) else ""
        date = dates[i].strip() if i < len(dates) else ""
        incidents.append({
            "title": title.strip(),
            "url": url,
            "description": description[:500],
            "date": date,
        })

    return incidents


def is_incident(item: dict) -> bool:
    title = item.get('title', '')
    description = item.get('description', '')
    text = f"{title} {description}".lower()
    
    # Must match an incident keyword
    if not any(kw.lower() in text for kw in INCIDENT_KEYWORDS):
        return False
    
    # Must NOT be primarily a suppressed topic
    suppress_count = sum(1 for kw in SUPPRESS_KEYWORDS if kw.lower() in text)
    incident_count = sum(1 for kw in INCIDENT_KEYWORDS if kw.lower() in text)
    if suppress_count > incident_count:
        return False
    
    # For rekt.news: reject editorial-titled articles with $0 losses
    source_url = item.get('url', '') or item.get('source_feed', '')
    if 'rekt.news' in source_url:
        amount = item.get('amount_usd', 0) or 0
        title_lower = title.lower().strip()
        # Check editorial title patterns
        for pattern in REKT_EDITORIAL_TITLE_PATTERNS:
            if re.match(pattern, title_lower, re.IGNORECASE):
                log(f"  ⛔ Rekt editorial title filtered: {title}")
                return False
        # Reject $0 rekt.news items that don't contain a "-" (protocol names like "Protocol - Rekt")
        if amount == 0 and " - " not in title and "rekt" not in title_lower:
            log(f"  ⛔ Rekt $0 no-protocol-name filtered: {title}")
            return False
    
    return True

def extract_loss_amount(text: str) -> float:
    patterns = [
        (r'\$(\d+(?:\.\d+)?)\s*(?:billion|bn)', 1_000_000_000),
        (r'\$(\d+(?:\.\d+)?)\s*(?:million|M(?!\w))', 1_000_000),
        (r'\$(\d+(?:\.\d+)?)\s*(?:thousand|K(?!\w))', 1_000),
        (r'\$(\d[\d,.]+)', 1),
    ]
    for pattern, multiplier in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                amount = float(match.group(1).replace(",", ""))
                return amount * multiplier
            except:
                pass
    return 0

def classify_incident(item: dict) -> dict:
    """Map incident to AlliGo category and archetype hints."""
    text = f"{item['title']} {item.get('description', '')}".lower()

    category = "OTHER"
    tags = ["auto-discovered", "crawler"]

    if any(kw in text for kw in ["flash loan", "flash-loan"]):
        category = "EXPLOIT"
        tags.append("flash_loan")
    elif any(kw in text for kw in ["oracle manipul", "price manipul"]):
        category = "EXPLOIT"
        tags.append("oracle_manipulation")
    elif any(kw in text for kw in ["private key", "admin key", "key compromise", "key leak"]):
        category = "EXPLOIT"
        tags.append("key_compromise")
    elif any(kw in text for kw in ["rug pull", "exit scam"]):
        category = "FRAUD"
        tags.append("rug_pull")
    elif any(kw in text for kw in ["bridge hack", "bridge exploit"]):
        category = "EXPLOIT"
        tags.append("bridge_hack")
    elif any(kw in text for kw in ["prompt injection", "jailbreak", "memory poison"]):
        category = "AI_SAFETY"
        tags.append("ai_exploit")
    elif any(kw in text for kw in ["malware", "phishing", "social engineer"]):
        category = "FRAUD"
        tags.append("social_engineering")
    elif any(kw in text for kw in ["liquidat"]):
        category = "OPERATIONAL"
        tags.append("liquidation")

    # AI-specific tag
    if any(kw in text for kw in ["ai agent", "autonomous agent", "llm", "vibe cod", "claude", "gpt", "ai trading"]):
        tags.append("ai_agent")

    return {"category": category, "tags": tags}

def map_category(raw_category: str) -> str:
    """Map internal category names to AlliGo ClaimCategory enum values."""
    mapping = {
        "EXPLOIT": "security",
        "FRAUD": "security",
        "AI_SAFETY": "execution",
        "SECURITY": "security",
        "OPERATIONAL": "trading",
        "OTHER": "other",
    }
    return mapping.get(raw_category, "other")

def map_claim_type(incident: dict) -> str:
    """Map incident to AlliGo ClaimType enum."""
    text = f"{incident.get('title','')} {incident.get('description','')}".lower()
    if any(k in text for k in ["fraud", "rug pull", "scam", "intentional"]):
        return "fraud"
    if any(k in text for k in ["hack", "exploit", "drain", "attack", "stolen", "breach"]):
        return "security"
    if any(k in text for k in ["loss", "liquidat", "lost"]):
        return "loss"
    return "security"

def submit_to_alligo(incident: dict) -> bool:
    """Submit a discovered incident as a claim to prod AlliGo."""
    # Always store locally as backup
    incidents_file = DATA_DIR / "discovered_incidents.jsonl"
    with open(incidents_file, "a") as f:
        f.write(json.dumps({
            **incident,
            "discovered_at": datetime.now().isoformat(),
        }) + "\n")

    if not ALLIGO_ADMIN_KEY:
        log(f"💾 Stored locally (no key): {incident['title'][:60]}")
        return True

    classification = classify_incident(incident)
    title = incident.get("title", "Unnamed incident")[:200]
    description = (
        f"[Auto-discovered by Zaia Swarm]\n\n"
        f"{incident.get('description', '')[:600]}\n\n"
        f"Source: {incident.get('url', '')}"
    )

    payload = {
        "agentId": incident.get("agent_id", f"discovered_{hashlib.md5(incident.get('url','').encode()).hexdigest()[:8]}"),
        "agentName": incident.get("agent_name", "Auto-Discovered Agent"),
        "claimType": map_claim_type(incident),
        "category": map_category(classification["category"]),
        "amountLost": min(incident.get("amount_usd", 0), 999_000_000),
        "title": title,
        "description": description,
        "chain": incident.get("chain", "unknown"),
        "platform": incident.get("source_feed", "unknown")[:100],
        "tags": classification["tags"],
        "source": "scraped",
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{ALLIGO_API}/api/claims",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ALLIGO_ADMIN_KEY}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            if result.get("success"):
                claim_id = result.get("claim", {}).get("id", "?")
                log(f"✅ Submitted to prod: {title[:55]} → {claim_id}")
                return True
            else:
                log(f"⚠️ Submit rejected: {result.get('error','unknown')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        log(f"⚠️ Submit failed {e.code}: {body[:150]}")
    except Exception as e:
        log(f"⚠️ Submit error: {e}")

    return False

def crawl_rss_feeds() -> list[dict]:
    incidents = []
    for feed_url in RSS_FEEDS:
        log(f"Fetching: {feed_url}")
        content = fetch_url(feed_url)
        if not content:
            continue
        items = parse_rss(content)
        log(f"  Found {len(items)} items, filtering for incidents...")
        for item in items:
            if is_incident(item):
                text = f"{item['title']} {item.get('description', '')}"
                amount = extract_loss_amount(text)
                incidents.append({
                    "title": item["title"],
                    "url": item["url"],
                    "description": item.get("description", ""),
                    "amount_usd": amount,
                    "source_feed": feed_url,
                })
                log(f"  🎯 Incident: {item['title'][:60]} (${amount:,.0f})")
    return incidents

def crawl_rekt_news() -> list[dict]:
    """Scrape rekt.news since they don't provide RSS."""
    raw = scrape_rekt_news()
    incidents = []
    for item in raw:
        # rekt.news = all incidents by definition
        text = f"{item['title']} {item.get('description', '')}"
        amount = extract_loss_amount(text)
        incidents.append({
            "title": item["title"],
            "url": item["url"],
            "description": item.get("description", ""),
            "amount_usd": amount,
            "source_feed": "https://rekt.news",
        })
        log(f"  💀 rekt: {item['title'][:60]} (${amount:,.0f})")
    return incidents

def crawl_github_advisories() -> list[dict]:
    """Check major agent framework repos for security advisories."""
    incidents = []
    repos = [
        "elizaOS/eliza",
        "ai16z/eliza",
        "virtuals-protocol/protocol",
    ]
    for repo in repos:
        url = f"https://api.github.com/repos/{repo}/security-advisories?per_page=5"
        content = fetch_url(url)
        if not content:
            # Try releases as fallback
            url2 = f"https://api.github.com/repos/{repo}/releases?per_page=5"
            content = fetch_url(url2)
            if not content:
                continue
            try:
                releases = json.loads(content)
                for release in releases:
                    body = release.get("body", "")
                    if any(kw.lower() in body.lower() for kw in ["security", "vulnerability", "exploit", "critical", "cve"]):
                        incidents.append({
                            "title": f"[Security Release] {repo}: {release['name']}",
                            "url": release["html_url"],
                            "description": body[:400],
                            "amount_usd": 0,
                            "agent_id": repo.replace("/", "_").lower(),
                            "category": "SECURITY",
                        })
                        log(f"  🔒 Security release: {repo} {release['name']}")
            except Exception as e:
                log(f"GitHub parse error {repo}: {e}")
            continue

        try:
            advisories = json.loads(content)
            for adv in advisories:
                incidents.append({
                    "title": f"[Advisory] {repo}: {adv.get('summary', 'Security Advisory')}",
                    "url": adv.get("html_url", f"https://github.com/{repo}/security/advisories"),
                    "description": adv.get("description", "")[:400],
                    "amount_usd": 0,
                    "agent_id": repo.replace("/", "_").lower(),
                    "category": "SECURITY",
                })
                log(f"  🔐 Advisory: {repo}")
        except Exception as e:
            log(f"GitHub advisory parse error {repo}: {e}")

    return incidents

def main():
    log("🕷️ Zaia Crawler v2 starting...")
    DATA_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

    seen = load_seen()
    log(f"Loaded {len(seen)} previously seen URLs")

    all_incidents = []

    # rekt.news (HTML scrape)
    rekt = crawl_rekt_news()
    all_incidents.extend(rekt)

    # RSS feeds
    rss = crawl_rss_feeds()
    all_incidents.extend(rss)

    # GitHub
    gh = crawl_github_advisories()
    all_incidents.extend(gh)

    new_incidents = [i for i in all_incidents if i.get("url") and i["url"] not in seen]
    log(f"Found {len(all_incidents)} total, {len(new_incidents)} new")

    submitted = 0
    for incident in new_incidents:
        if incident.get("url"):
            seen.add(incident["url"])
            if submit_to_alligo(incident):
                submitted += 1
            time.sleep(0.3)

    save_seen(seen)

    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_found": len(all_incidents),
        "new_incidents": len(new_incidents),
        "submitted": submitted,
        "sources": {
            "rekt_news": len(rekt),
            "rss_feeds": len(rss),
            "github": len(gh),
        },
    }
    summary_file = DATA_DIR / f"crawler_run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    summary_file.write_text(json.dumps(summary, indent=2))

    log(f"✅ Done. {len(new_incidents)} new incidents discovered, {submitted} stored/submitted")
    log(f"   Sources: rekt.news={len(rekt)}, rss={len(rss)}, github={len(gh)}")
    return summary

if __name__ == "__main__":
    main()
