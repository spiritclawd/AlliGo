# AlliGo Session Worklog

## Summary

Built and polished AlliGo MVP - The Credit Bureau for AI Agents.

## Completed

### Core API (Server)
- [x] REST API with all endpoints working
- [x] SQLite in-memory database for MVP
- [x] Claims submission with validation
- [x] Risk scoring algorithm (0-100 scale)
- [x] Agent grade system (A/B/C/D/F/NR)
- [x] Global statistics endpoint
- [x] Health check endpoint

### Seed Data
- [x] 12 real agent failure incidents including:
  - Lobstar Wilde ($250K memecoin error)
  - Whale AI portfolio ($20M loss)
  - Eliza trading errors
  - Wallet security breaches
  - Flash loan exploits
  - Bridge failures
  - NFT wash trading victim
  - DAO voting errors

### Documentation
- [x] Comprehensive README with pitch
- [x] CONCEPT.md with strengths/weaknesses audit
- [x] OpenAPI 3.0 specification
- [x] CONTRIBUTING.md with guidelines

### Tests
- [x] Unit tests for severity calculation
- [x] Unit tests for risk scoring
- [x] Unit tests for grade assignment
- [x] API integration tests

### UI
- [x] Web dashboard (public/index.html)
- [x] Live stats display
- [x] Agent lookup interface
- [x] Claim submission form

## File Structure

```
alligo/
├── README.md              # Full documentation
├── CONTRIBUTING.md        # Contribution guidelines  
├── package.json           # Dependencies
├── docs/
│   ├── CONCEPT.md         # Concept audit
│   └── openapi.yaml       # API specification
├── public/
│   └── index.html         # Web dashboard
├── src/
│   ├── api/
│   │   ├── server.ts      # API server
│   │   └── db.ts          # Database layer
│   └── schema/
│       └── claim.ts       # Types + scoring
└── tests/
    └── api.test.ts        # Unit tests
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET / | API info |
| POST /api/claims | Submit claim |
| GET /api/claims | List claims |
| GET /api/agents/:id/score | Get risk score |
| GET /api/agents/:id/claims | Get agent claims |
| GET /api/stats | Global statistics |
| GET /health | Health check |

## Next Steps

1. **Deploy** - Push to GitHub, deploy API
2. **Seed more data** - Scrape more incidents
3. **Partnership** - Reach out to Armilla, Daydreams
4. **Integration** - Browser extension, widgets
5. **Insurance** - Partnership conversations

## How to Run

```bash
cd alligo
bun run dev
# Open http://localhost:3399
```

---

Session completed. Ready for morning review.

---

## Z's Bug Fixes (Post-Minimax Review)

### Issues Found in Minimax's Commit
Minimax (the other AI) pushed a commit "Simplify auth layer and clean up unused ingestion code" but introduced **runtime-breaking bugs**:

1. **Missing Exports**: `middleware.ts` imports `TIERS` and `TierName` from `auth.ts`, but they weren't exported
2. **Type Mismatch**: `validateApiKey()` returns `APIKey | null`, but middleware expected `{ valid, tier, remaining }`
3. **Async/Sync Mismatch**: `authenticateRequest` was async but `validateApiKey` is synchronous
4. **Deleted Ingestion**: Removed `brave_search.ts` and `ingest-live.ts` (the live data pipeline!)

### Fixes Applied
- Added `TierName` type and `TIERS` constant exports to `auth.ts`
- Added `tier` property to `APIKey` interface
- Fixed `authenticateRequest` to work with correct return types
- Removed async from `authenticateRequest` (validateApiKey is sync)
- Added rate limit calculation based on tier configuration

### What Was Lost
Minimax deleted the Brave Search ingestion pipeline. This was the **future growth engine** for automatically discovering new AI agent incidents. You may want to restore it from a previous commit if live data discovery is important.

### Commit
```
fix: Add missing TIERS export and fix middleware auth
```

### Still TODO
- [ ] Restore ingestion pipeline (optional but valuable)
- [ ] Add PostgreSQL persistence for production
- [ ] Deploy to production (Vercel + Railway/Fly.io)

---

## Ingestion Pipeline Restored

### Why It Matters
Minimax deleted the Brave Search ingestion pipeline. This was a strategic mistake because:

1. **Data Moat**: The value of AlliGo is in the DATA, not the code
2. **Automatic Growth**: Without ingestion, you'd need manual data entry
3. **First Mover**: You want to discover incidents before competitors
4. **Live Product**: Ingestion makes it a living product, not a static demo

### What Was Restored
- `src/ingestion/brave_search.ts` - Brave Search API integration
- `src/ingestion/ingest-live.ts` - Live ingestion runner
- `bun run ingest` script in package.json

### How to Use
```bash
# Set your Brave API key
export BRAVE_API_KEY="your_key_here"

# Run ingestion
bun run ingest

# Or run on a schedule (in code)
startIngestionScheduler(24 * 60 * 60 * 1000, (incidents) => {
  console.log(`Found ${incidents.length} new incidents`);
});
```

### Features
- Searches 15 targeted queries for AI agent failures
- Extracts: agent name, amount lost, chain, platform
- Deduplicates by URL
- Adds directly to the database as pending claims

---

## Production Readiness Update (Current Session)

### Branding Update: AlliMolt → AlliGo
- Changed name from AlliMolt to AlliGo
- Updated domain references to alligo.ai
- Removed Allianz references (trademark concerns)
- New tagline: "Your trusted partner in AI agent risk assessment"
- GitHub repo now at: https://github.com/spiritclawd/AlliGo

### Production Infrastructure
- [x] **SQLite Persistent Database** - Replaced in-memory with file-based SQLite
- [x] **Environment Configuration** - `.env` support with config module
- [x] **Production Dashboard** - Full web UI with live data
- [x] **API Key Management** - Tiered keys (free/pro/enterprise)
- [x] **Docker Support** - Dockerfile for container deployment
- [x] **Railway Ready** - railway.toml for one-click deploy

### New Files Created
```
src/config/index.ts     - Environment configuration module
.env.example           - Environment template
Dockerfile             - Docker image definition
railway.toml           - Railway deployment config
start.ts               - Quick start script
```

### Database Changes
- `:memory:` → `./data/alligo.db` (persistent SQLite)
- WAL mode enabled for better concurrent performance
- Auto-creates data directory on startup
- Added `api_keys` table for key management
- Added `audit_log` table for tracking

### API Improvements
- Health endpoint includes database stats
- Dashboard auto-detects API base URL
- Better error messages
- CORS headers for cross-origin access

### Deployment Instructions
```bash
# Railway one-click:
# 1. Connect GitHub repo
# 2. Set environment variables:
#    - ADMIN_API_KEY (generate with: openssl rand -hex 32)
#    - JWT_SECRET (generate another)
# 3. Deploy

# Local production test:
docker build -t alligo .
docker run -p 3399:3399 -v alligo-data:/app/data alligo
```

### Current Stats
- **12 claims** seeded from real incidents
- **$47M+** total value tracked
- **6 chains** covered (Ethereum, Solana, Base, Polygon, Bitcoin, Multi)
- **7 categories** of failures

### Next Steps
1. Deploy to Railway
2. Set up custom domain (alligo.ai)
3. Add more data ingestion sources
4. Build browser extension for agent risk display
5. Partnership outreach (Armilla, Daydreams)

---

## Browser Extension Added

### Chrome Extension for AI Agent Risk Display
Created a full browser extension that integrates AlliGo risk scoring into Twitter/X:

**Files:**
- `extension/manifest.json` - Extension configuration (Manifest V3)
- `extension/popup.html` - Main popup UI
- `extension/popup.js` - Popup logic
- `extension/background.js` - Service worker for API calls
- `extension/content.js` - Twitter content script
- `extension/content.css` - Styling for risk badges
- `extension/options.html` - Settings page
- `extension/options.js` - Settings logic

**Features:**
- Risk grade badges (A-F) next to AI agent mentions on Twitter
- Quick agent lookup in popup
- Configurable API key and settings
- Real-time risk score display
- Desktop notifications for new claims

**Installation:**
1. Open Chrome → chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked" → select `/extension` folder
4. Configure API key in extension settings

---

## API Integration Guide Added

### Developer Documentation (`docs/API_INTEGRATION.md`)
Comprehensive guide for integrating AlliGo into applications:

**Contents:**
- Quick start guide
- Authentication methods
- All API endpoints documented
- JavaScript/TypeScript SDK example
- Python SDK example
- Integration patterns (pre-transaction check, monitoring, insurance)
- Error handling best practices
- Rate limit information

**Code Examples:**
```javascript
const client = new AlliGoClient('your_api_key');
const score = await client.getAgentScore('eliza_trader_001');

if (score.grade === 'F') {
  throw new Error('High risk agent - transaction blocked');
}
```

---

## Session: Revenue Funnel & Telegram Integration (Jan 2026)

### Issues Fixed
1. **Railway Deployment** - Dockerfile was using `--frozen-lockfile` but there was no bun.lock
   - Fixed: Simplified Dockerfile since AlliGo uses only Bun built-in APIs
   
2. **Missing Telegram Bot** - Bot code was never actually created
   - Created: `src/telegram/bot.ts` with full Telegram integration
   - Created: `src/telegram/index.ts` for exports
   - Updated: `src/config/index.ts` with TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID
   - Updated: `src/notifications/index.ts` to include Telegram in notification pipeline

3. **Landing Page Revenue Funnel** - Page didn't end with a clear product offer
   - Complete redesign of `public/index.html` with:
     - Clear value proposition in hero
     - Problem section with real incidents
     - Solution section with flow diagram
     - **Use Cases section** showing who uses AlliGo
     - **Pricing section** with 3 tiers (Free, Pro $99/mo, Enterprise)
     - FAQ section
     - CTA buttons throughout
     - Live stats fetching from API

### New Features
- **Telegram Bot**: Send claim alerts, daily stats, and leaderboard updates
- **Pricing Tiers**: Clear monetization path
  - Free: 100 API req/day, basic access
  - Pro ($99/mo): 10K req/day, Telegram alerts, webhooks
  - Enterprise: Custom pricing, white-label, insurance partnerships

### Files Modified/Created
```
Dockerfile                          - Fixed build process
railway.toml                        - Added Telegram env vars
src/telegram/bot.ts                 - NEW: Telegram bot
src/telegram/index.ts               - NEW: Exports
src/config/index.ts                 - Added Telegram config
src/notifications/index.ts          - Added Telegram integration
public/index.html                   - Complete redesign with revenue funnel
```

### Environment Variables Required
```
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHANNEL_ID=@alligo_alerts
```

### Current Stats
- **22 claims** seeded from real incidents
- **$72M+** total value tracked
- **22+ agents** monitored

---
