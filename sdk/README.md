# @alligo/sdk

Official JavaScript SDK for **AlliGo** - The Credit Bureau for AI Agents.

## Installation

```bash
npm install @alligo/sdk
# or
yarn add @alligo/sdk
# or
pnpm add @alligo/sdk
```

## Quick Start

```javascript
import { AlliGo } from '@alligo/sdk';

const client = new AlliGo({
  apiKey: 'your-api-key', // Optional for public endpoints
});

// Get agent risk score
const score = await client.getAgentScore('eliza_trader_001');
console.log(score.grade); // 'A', 'B', 'C', 'D', 'F', or 'NR'
console.log(score.riskScore); // 0-100

// Check if agent is certified
const isCertified = await client.isCertified('agent_001');

// Get global statistics
const stats = await client.getStats();
console.log(`$${stats.totalValueLost} lost across ${stats.totalClaims} incidents`);
```

## API

### Constructor

```javascript
const client = new AlliGo({
  apiKey: 'your-api-key',     // Optional for public endpoints
  baseUrl: 'https://api.alligo.io', // Optional, defaults to production
});
```

### Methods

| Method | Description | Auth Required |
|--------|-------------|---------------|
| `getAgentScore(agentId)` | Get risk score for an agent | Yes |
| `getAgentClaims(agentId)` | Get all claims for an agent | Yes |
| `getStats()` | Get global statistics | Yes |
| `getPublicStats()` | Get public statistics | No |
| `submitClaim(claim)` | Submit a new claim | Yes (write) |
| `isCertified(agentId)` | Check if agent is certified (A/B) | Yes |
| `getRiskLevel(agentId)` | Get risk level for agent | Yes |
| `getBadgeUrl(agentId)` | Get badge image URL | No |
| `getBadgeEmbed(agentId)` | Get HTML embed code for badge | No |

### Example: Submit a Claim

```javascript
const result = await client.submitClaim({
  agentId: 'trading_bot_001',
  claimType: 'loss',
  category: 'trading',
  amountLost: 50000,
  title: 'Wrong trade execution',
  description: 'Agent misread market signal and executed wrong trade direction.',
  chain: 'ethereum',
  platform: 'Uniswap',
});

console.log(result.claimId);
```

### Example: Display Badge

```javascript
// Get badge URL
const badgeUrl = client.getBadgeUrl('agent_001');

// Get embeddable HTML
const embed = client.getBadgeEmbed('agent_001', { type: 'compact', link: true });
// <a href="https://alligo.io/agent/agent_001"><img src="..." /></a>
```

## Error Handling

```javascript
import { AlliGo, AlliGoError } from '@alligo/sdk';

try {
  const score = await client.getAgentScore('unknown_agent');
} catch (error) {
  if (error instanceof AlliGoError) {
    console.log(`Status: ${error.statusCode}`);
    console.log(`Message: ${error.message}`);
  }
}
```

## TypeScript

Full TypeScript support with type definitions included.

```typescript
import { AlliGo, AgentScore, Claim, Stats } from '@alligo/sdk';

const client = new AlliGo();

const score: AgentScore = await client.getAgentScore('agent_001');
const claims: Claim[] = await client.getAgentClaims('agent_001');
const stats: Stats = await client.getStats();
```

## License

MIT
