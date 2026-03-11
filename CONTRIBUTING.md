# Contributing to Allimolt

Thank you for your interest in contributing to Allimolt - The Credit Bureau for AI Agents.

## Ways to Contribute

### 1. Submit Real Agent Failure Reports
The most valuable contribution is real data. If you know of an AI agent failure:

```bash
curl -X POST http://localhost:3399/api/claims \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_identifier",
    "agentName": "Agent Name",
    "claimType": "loss",
    "category": "trading",
    "amountLost": 5000,
    "title": "Brief description",
    "description": "Detailed description of what happened",
    "chain": "ethereum",
    "platform": "Platform name"
  }'
```

### 2. Improve Risk Scoring Algorithm
The risk scoring is in `src/schema/claim.ts`. We welcome:
- Better severity calculations
- More accurate confidence scoring
- Category-specific adjustments

### 3. Add Data Sources
Help us aggregate agent failures from:
- News articles
- Social media reports
- Blockchain forensics
- Bug bounty programs

### 4. Build Integrations
- Browser extension for agent risk scores
- Dashboard widgets
- API clients in other languages
- Insurance platform integrations

## Development Setup

```bash
# Clone the repo
git clone https://github.com/karlostoteles/allimolt.git
cd allimolt

# Install dependencies (none required for core)
bun install

# Run the API server
bun run dev

# Run tests
bun test
```

## Project Structure

```
allimolt/
├── src/
│   ├── api/
│   │   ├── server.ts      # API server + routes
│   │   └── db.ts          # Database layer
│   ├── schema/
│   │   └── claim.ts       # Data types + risk scoring
│   └── utils/             # Utilities
├── public/
│   └── index.html         # Web dashboard
├── docs/
│   ├── CONCEPT.md         # Project vision + audit
│   └── openapi.yaml       # API specification
├── tests/
│   └── api.test.ts        # Unit tests
└── README.md
```

## Code Style

- TypeScript with strict mode
- Double quotes for strings
- 2-space indentation
- JSDoc comments for public functions
- Descriptive variable names

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Commit with clear message
6. Push and open PR

## Data Quality Guidelines

When submitting claims:

- **Be accurate**: Only submit verified incidents
- **Be specific**: Include as much detail as possible
- **Be honest**: Don't exaggerate or fabricate claims
- **Provide evidence**: Links, tx hashes, screenshots when possible

## Ethical Guidelines

- Don't submit claims against competitors for competitive reasons
- Don't use Allimolt data for harassment or doxxing
- Respect privacy of individual developers when possible
- Focus on agents, not people

## Questions?

Open an issue or reach out to the maintainers.

---

Built with ❤️ for the agent ecosystem.
