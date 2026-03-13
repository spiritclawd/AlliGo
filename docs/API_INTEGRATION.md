# AlliGo API Integration Guide

Complete guide to integrate AlliGo's AI agent risk scoring into your application.

## Quick Start

### 1. Get Your API Key

```bash
# Contact us for an API key
# Email: license@alligo.ai
# Or generate one locally: openssl rand -hex 32
```

### 2. First API Call

```javascript
const response = await fetch('https://api.alligo.ai/api/agents/eliza_trader_001/score', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data);
// {
//   agentId: "eliza_trader_001",
//   riskScore: 90.7,
//   grade: "A",
//   totalClaims: 1,
//   totalValueLost: 45000
// }
```

## Authentication

All API requests require an API key in the Authorization header:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_API_KEY'
}
```

### API Key Tiers

| Tier | Rate Limit | Permissions | Use Case |
|------|------------|-------------|----------|
| Free | 100 req/min | Read only | Testing, personal projects |
| Pro | 1,000 req/min | Read + Write | Production apps |
| Enterprise | 10,000 req/min | Full access | High-volume platforms |

## API Endpoints

### Get Agent Risk Score

```http
GET /api/agents/{agentId}/score
```

**Response:**
```json
{
  "agentId": "eliza_trader_001",
  "riskScore": 90.7,
  "confidence": 13,
  "totalClaims": 1,
  "openClaims": 1,
  "totalValueLost": 45000,
  "grade": "A",
  "summary": "Excellent track record. 1 claim(s) with $45,000 total loss.",
  "lastUpdated": 1709876543210
}
```

### Get Agent Claims History

```http
GET /api/agents/{agentId}/claims
```

**Response:**
```json
{
  "claims": [
    {
      "id": "clm_12345",
      "claimType": "loss",
      "category": "trading",
      "amountLost": 45000,
      "severity": { "score": 6, "level": "high" },
      "title": "Wrong trade direction execution",
      "resolution": "pending"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

### Submit a Claim

```http
POST /api/claims
Content-Type: application/json

{
  "agentId": "new_agent_001",
  "agentName": "Agent Name",
  "claimType": "loss",
  "category": "trading",
  "amountLost": 10000,
  "title": "Brief description",
  "description": "Detailed description of what happened",
  "chain": "ethereum",
  "txHash": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "claimId": "clm_123456789",
  "message": "Claim submitted successfully. It will be reviewed within 24-48 hours."
}
```

### Get Global Statistics

```http
GET /api/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalClaims": 12,
    "totalValueLost": 46818500,
    "recoveryRate": 0,
    "claimsByType": { "loss": 6, "error": 3, "fraud": 2, "security": 1 },
    "topAgents": [...],
    "trends": {
      "claimsLast30Days": 5,
      "avgLossPerClaim": 3901541.67
    }
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
// alligo-client.ts
interface AgentScore {
  agentId: string;
  riskScore: number;
  confidence: number;
  totalClaims: number;
  openClaims: number;
  totalValueLost: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'NR';
  summary: string;
  lastUpdated: number;
}

interface ClaimSubmission {
  agentId: string;
  agentName?: string;
  claimType: 'loss' | 'error' | 'breach' | 'fraud' | 'security';
  category: 'trading' | 'payment' | 'security' | 'execution' | 'data';
  amountLost: number;
  title: string;
  description: string;
  chain?: string;
  txHash?: string;
}

class AlliGoClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://api.alligo.ai') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`AlliGo API error: ${response.status}`);
    }

    return response.json();
  }

  async getAgentScore(agentId: string): Promise<AgentScore> {
    const data = await this.request<{ success: boolean } & AgentScore>(
      `/api/agents/${encodeURIComponent(agentId)}/score`
    );
    return data;
  }

  async getAgentClaims(agentId: string): Promise<any> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/claims`);
  }

  async submitClaim(claim: ClaimSubmission): Promise<{ success: boolean; claimId: string }> {
    return this.request('/api/claims', {
      method: 'POST',
      body: JSON.stringify(claim),
    });
  }

  async getStats(): Promise<any> {
    return this.request('/api/stats');
  }
}

// Usage
const client = new AlliGoClient('your_api_key');

// Check an agent's risk score before trusting it
const score = await client.getAgentScore('eliza_trader_001');
if (score.grade === 'A' || score.grade === 'B') {
  console.log('Safe to proceed with this agent');
} else {
  console.log(`Warning: Agent has grade ${score.grade}`);
}
```

### Python

```python
# alligo_client.py
import requests
from typing import Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class AgentScore:
    agent_id: str
    risk_score: float
    confidence: int
    total_claims: int
    open_claims: int
    total_value_lost: float
    grade: str
    summary: str

class AlliGoClient:
    def __init__(self, api_key: str, base_url: str = "https://api.alligo.ai"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def get_agent_score(self, agent_id: str) -> AgentScore:
        """Get risk score for an AI agent."""
        response = requests.get(
            f"{self.base_url}/api/agents/{agent_id}/score",
            headers=self.headers
        )
        response.raise_for_status()
        data = response.json()
        return AgentScore(
            agent_id=data["agentId"],
            risk_score=data["riskScore"],
            confidence=data["confidence"],
            total_claims=data["totalClaims"],
            open_claims=data["openClaims"],
            total_value_lost=data["totalValueLost"],
            grade=data["grade"],
            summary=data["summary"]
        )

    def submit_claim(self, claim: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a new claim against an agent."""
        response = requests.post(
            f"{self.base_url}/api/claims",
            headers=self.headers,
            json=claim
        )
        response.raise_for_status()
        return response.json()

    def get_stats(self) -> Dict[str, Any]:
        """Get global statistics."""
        response = requests.get(
            f"{self.base_url}/api/stats",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = AlliGoClient("your_api_key")

# Check agent before using
score = client.get_agent_score("eliza_trader_001")
print(f"Grade: {score.grade}, Risk Score: {score.risk_score}")

if score.grade in ["A", "B"]:
    print("Safe to proceed")
else:
    print("High risk agent detected!")
```

## Integration Patterns

### 1. Pre-Transaction Check

Check agent risk before any autonomous transaction:

```javascript
async function safeTransact(agentId, transaction) {
  const score = await client.getAgentScore(agentId);
  
  if (score.grade === 'F' || score.riskScore < 40) {
    throw new Error(`Agent ${agentId} has critical risk. Transaction blocked.`);
  }
  
  if (score.totalValueLost > 100000) {
    // Require additional confirmation for high-loss agents
    const confirmed = await requestUserConfirmation(
      `Agent has $${score.totalValueLost} in historical losses. Proceed?`
    );
    if (!confirmed) return;
  }
  
  return executeTransaction(transaction);
}
```

### 2. Continuous Monitoring

Monitor your agents' risk scores over time:

```javascript
async function monitorAgent(agentId, callback) {
  setInterval(async () => {
    const score = await client.getAgentScore(agentId);
    
    // Alert if risk increased
    if (score.openClaims > 0) {
      callback({
        type: 'alert',
        message: `Agent ${agentId} has ${score.openClaims} open claims`,
        score
      });
    }
    
    // Alert if grade dropped
    if (['D', 'F'].includes(score.grade)) {
      callback({
        type: 'critical',
        message: `Agent ${agentId} grade dropped to ${score.grade}`,
        score
      });
    }
  }, 60000); // Check every minute
}
```

### 3. Insurance Integration

Use risk scores for insurance underwriting:

```javascript
function calculatePremium(score, coverageAmount) {
  // Base premium rate
  let rate = 0.02; // 2%
  
  // Adjust based on grade
  const gradeMultipliers = {
    'A': 0.5,  // 50% of base
    'B': 0.75, // 75% of base
    'C': 1.0,  // 100% of base
    'D': 1.5,  // 150% of base
    'F': 2.5,  // 250% of base
    'NR': 1.2  // 120% of base (unknown risk)
  };
  
  rate *= gradeMultipliers[score.grade] || 1.0;
  
  // Adjust for claims history
  if (score.totalClaims > 3) {
    rate *= 1.2; // 20% increase for repeat offenders
  }
  
  return coverageAmount * rate;
}
```

## Error Handling

```javascript
async function safeApiCall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 401) {
      throw new Error('Invalid API key');
    }
    if (error.status === 429) {
      // Rate limited - wait and retry
      await new Promise(r => setTimeout(r, 60000));
      return fn();
    }
    if (error.status === 404) {
      return null; // Agent not found
    }
    throw error;
  }
}
```

## Webhook Integration (Coming Soon)

Get notified when agent scores change:

```javascript
// Coming in v0.3
// POST /api/webhooks
{
  "url": "https://your-app.com/webhooks/alligo",
  "events": ["score_changed", "new_claim", "claim_resolved"]
}
```

## Best Practices

1. **Cache scores** - Risk scores don't change frequently. Cache for 1-5 minutes.
2. **Handle unknowns** - Grade "NR" means no data. Consider this moderate risk.
3. **Set timeouts** - Use reasonable timeouts for API calls (5-10 seconds).
4. **Log decisions** - Record why you approved/blocked agents for audit trails.
5. **Batch requests** - Use `/api/stats` for dashboard data, not individual lookups.

## Rate Limits

| Response Code | Meaning |
|--------------|---------|
| 200 | Success |
| 401 | Invalid or missing API key |
| 403 | Insufficient permissions |
| 429 | Rate limit exceeded (check `resetIn` header) |
| 500 | Server error |

## Support

- **Documentation**: https://alligo.ai/docs
- **API Status**: https://status.alligo.ai
- **Email**: support@alligo.ai
- **Discord**: https://discord.gg/alligo

---

Built by agents, for agents. 🛡️
