# @alligo/eliza-plugin

> AlliGo risk scoring plugin for Eliza agents

Check agent trust scores before transactions. Protect your agent from interacting with untrusted or high-risk agents.

## Installation

```bash
npm install @alligo/eliza-plugin
# or
bun add @alligo/eliza-plugin
```

## Quick Start

```typescript
import { alligoPlugin } from '@alligo/eliza-plugin';

export default {
  name: 'my-trading-agent',
  plugins: [
    alligoPlugin({
      apiKey: process.env.ALLIGO_API_KEY,
      minScore: 50,          // Block agents with score < 50
      blockGrades: ['F', 'D'], // Block these grades entirely
    }),
  ],
};
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | required | Your AlliGo API key |
| `baseUrl` | string | `https://alligo.io` | API base URL |
| `minScore` | number | `40` | Minimum acceptable risk score (0-100) |
| `blockGrades` | string[] | `['F']` | Agent grades to block |
| `timeout` | number | `5000` | Request timeout in ms |

## Actions Provided

### CHECK_AGENT_RISK

Check if an agent is trusted:

```typescript
// In your agent's action handler
const result = await runtime.executeAction('CHECK_AGENT_RISK', {
  content: { agentId: 'eliza_trader_001' }
});

if (!result.allowed) {
  console.log('Blocked:', result.reason);
  return; // Don't proceed
}

console.log('Agent score:', result.score.riskScore);
```

### SUBMIT_CLAIM

Report when an agent fails:

```typescript
await runtime.executeAction('SUBMIT_CLAIM', {
  content: {
    agentId: 'counterparty_agent',
    claimType: 'loss',
    category: 'trading',
    amountLost: 5000,
    title: 'Agent failed to execute trade correctly',
    description: 'The agent misread market conditions...',
    chain: 'ethereum',
    txHash: '0x...',
  }
});
```

## Provider: ALLIGO_CONTEXT

The plugin provides context for transactions:

```typescript
// Automatically adds risk context to messages
// Example output:
// ⚠️ RISK ALERT: Agent has grade F which is blocked.
// Recommendation: Do not transact with this agent.
```

## Direct API Usage

You can also use the client directly:

```typescript
import { AlliGoClient } from '@alligo/eliza-plugin';

const client = new AlliGoClient({
  apiKey: process.env.ALLIGO_API_KEY,
});

// Check risk
const result = await client.checkAgentRisk('eliza_trader_001');
console.log(result.allowed ? 'Proceed' : 'Block');

// Get score details
const score = await client.getAgentScore('eliza_trader_001');
console.log(`Risk: ${score.riskScore}/100 (Grade ${score.grade})`);

// Get claims history
const claims = await client.getAgentClaims('eliza_trader_001');
console.log(`${claims.length} claims found`);
```

## Risk Score Interpretation

| Grade | Score Range | Risk Level | Recommendation |
|-------|-------------|------------|----------------|
| A | 90-100 | Minimal | Safe to transact |
| B | 80-89 | Low | Generally safe |
| C | 60-79 | Moderate | Proceed with caution |
| D | 40-59 | High | Additional safeguards needed |
| F | 0-39 | Critical | Avoid or use escrow |
| NR | N/A | Unknown | No data available |

## Example: Pre-Transaction Check

```typescript
async function executeTrade(counterpartyAgent: string, amount: number) {
  const client = new AlliGoClient({ apiKey: process.env.ALLIGO_API_KEY });
  
  // Check counterparty risk
  const risk = await client.checkAgentRisk(counterpartyAgent);
  
  if (!risk.allowed) {
    throw new Error(`Transaction blocked: ${risk.reason}`);
  }
  
  // For high-value transactions, require better scores
  if (amount > 10000 && risk.score!.riskScore < 70) {
    throw new Error('High-value transaction requires agent with score >= 70');
  }
  
  // Proceed with transaction
  return executeTransaction(amount);
}
```

## Get Your API Key

1. Sign up at [alligo.io](https://alligo.io)
2. Go to Dashboard → API Keys
3. Create a new API key
4. Add to your `.env`:

```
ALLIGO_API_KEY=your_api_key_here
```

## License

MIT

---

**Built by agents, for agents.** 🤖
