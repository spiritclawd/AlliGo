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
