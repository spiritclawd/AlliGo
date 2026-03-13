# AlliGo Integration Examples

Complete code examples for integrating AlliGo into your application.

## Table of Contents

1. [JavaScript/TypeScript](#javascripttypescript)
2. [Python](#python)
3. [cURL](#curl)
4. [React Component](#react-component)
5. [Vue.js Component](#vuejs-component)
6. [Browser Extension](#browser-extension)
7. [Server Middleware](#server-middleware)

---

## JavaScript/TypeScript

### Using the SDK

```javascript
import { AlliGo } from '@alligo/sdk';

const client = new AlliGo({
  apiKey: process.env.ALLIGO_API_KEY,
});

// Get agent score before transaction
async function checkAgentBeforeTransaction(agentId) {
  const score = await client.getAgentScore(agentId);
  
  if (score.grade === 'F') {
    throw new Error(`Agent ${agentId} has critical risk. Transaction blocked.`);
  }
  
  if (score.grade === 'D') {
    console.warn(`Warning: Agent ${agentId} has high risk. Proceed with caution.`);
  }
  
  return score;
}

// Submit a claim after an incident
async function reportAgentFailure(agentId, details) {
  const result = await client.submitClaim({
    agentId,
    claimType: 'loss',
    category: 'trading',
    amountLost: details.amountLost,
    title: details.title,
    description: details.description,
    chain: details.chain,
    platform: details.platform,
  });
  
  console.log(`Claim submitted: ${result.claimId}`);
  return result;
}
```

### Without SDK (fetch)

```javascript
const API_BASE = 'https://api.alligo.io';
const API_KEY = process.env.ALLIGO_API_KEY;

async function getAgentScore(agentId) {
  const response = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentId)}/score`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}
```

---

## Python

### Using requests

```python
import os
import requests

API_BASE = "https://api.alligo.io"
API_KEY = os.environ.get("ALLIGO_API_KEY")

def get_agent_score(agent_id: str) -> dict:
    """Get risk score for an agent."""
    response = requests.get(
        f"{API_BASE}/api/agents/{agent_id}/score",
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    response.raise_for_status()
    return response.json()

def is_agent_safe(agent_id: str, min_grade: str = "C") -> bool:
    """Check if agent meets minimum safety grade."""
    score = get_agent_score(agent_id)
    grades = ["A", "B", "C", "D", "F", "NR"]
    return grades.index(score["grade"]) <= grades.index(min_grade)

def submit_claim(agent_id: str, amount_lost: float, title: str, description: str) -> dict:
    """Submit a new claim."""
    response = requests.post(
        f"{API_BASE}/api/claims",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "agentId": agent_id,
            "claimType": "loss",
            "category": "trading",
            "amountLost": amount_lost,
            "title": title,
            "description": description,
        }
    )
    response.raise_for_status()
    return response.json()

# Usage
if __name__ == "__main__":
    score = get_agent_score("eliza_trader_001")
    print(f"Agent grade: {score['grade']}, Score: {score['riskScore']}")
    
    if not is_agent_safe("risky_bot_001"):
        print("Warning: Agent does not meet safety requirements!")
```

### Async with aiohttp

```python
import aiohttp
import asyncio

async def get_agent_score_async(agent_id: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{API_BASE}/api/agents/{agent_id}/score",
            headers={"Authorization": f"Bearer {API_KEY}"}
        ) as response:
            return await response.json()

# Batch check multiple agents
async def check_agents(agent_ids: list[str]) -> dict[str, dict]:
    tasks = [get_agent_score_async(aid) for aid in agent_ids]
    results = await asyncio.gather(*tasks)
    return dict(zip(agent_ids, results))
```

---

## cURL

### Get Agent Score

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.alligo.io/api/agents/eliza_trader_001/score
```

### Get Public Stats (no auth)

```bash
curl https://api.alligo.io/api/public/stats
```

### Submit a Claim

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "bot_001",
    "claimType": "loss",
    "category": "trading",
    "amountLost": 50000,
    "title": "Wrong trade execution",
    "description": "Agent misread market signal..."
  }' \
  https://api.alligo.io/api/claims
```

### Get Badge URL

```bash
# SVG badge
curl https://api.alligo.io/api/badge/eliza_trader_001.svg

# Compact badge
curl "https://api.alligo.io/api/badge/eliza_trader_001.svg?type=compact"
```

---

## React Component

### Agent Trust Badge Component

```tsx
import { useState, useEffect } from 'react';

interface AgentBadgeProps {
  agentId: string;
  showDetails?: boolean;
}

interface AgentScore {
  grade: string;
  riskScore: number;
  totalClaims: number;
  summary: string;
}

export function AgentBadge({ agentId, showDetails = false }: AgentBadgeProps) {
  const [score, setScore] = useState<AgentScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`https://api.alligo.io/api/public/agents/${encodeURIComponent(agentId)}/score`)
      .then(res => res.json())
      .then(data => {
        setScore(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [agentId]);

  if (loading) return <div className="badge-loading">Loading...</div>;
  if (error) return <div className="badge-error">Unable to load score</div>;
  if (!score) return null;

  const gradeColors: Record<string, string> = {
    A: '#00ff88', B: '#00ff88',
    C: '#ffaa00', D: '#ff6644', F: '#ff4444', NR: '#666666'
  };

  return (
    <div className="agent-badge" style={{ borderColor: gradeColors[score.grade] }}>
      <div className="badge-grade" style={{ background: gradeColors[score.grade] }}>
        {score.grade}
      </div>
      {showDetails && (
        <div className="badge-details">
          <span className="score">{score.riskScore}/100</span>
          <span className="claims">{score.totalClaims} claims</span>
        </div>
      )}
      <img 
        src={`https://api.alligo.io/api/badge/${encodeURIComponent(agentId)}.svg`}
        alt="AlliGo Score"
      />
    </div>
  );
}

// Usage
<AgentBadge agentId="eliza_trader_001" showDetails />
```

### Pre-Transaction Check Hook

```tsx
import { useState } from 'react';

export function useAgentCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    allowed: boolean;
    score?: any;
    reason?: string;
  } | null>(null);

  const checkAgent = async (agentId: string, minGrade: string = 'C') => {
    setChecking(true);
    try {
      const response = await fetch(
        `https://api.alligo.io/api/public/agents/${encodeURIComponent(agentId)}/score`
      );
      const score = await response.json();
      
      const gradeOrder = ['A', 'B', 'C', 'D', 'F', 'NR'];
      const allowed = gradeOrder.indexOf(score.grade) <= gradeOrder.indexOf(minGrade);
      
      setResult({
        allowed,
        score,
        reason: allowed ? undefined : `Agent grade ${score.grade} below minimum ${minGrade}`,
      });
      
      return allowed;
    } catch (error) {
      setResult({ allowed: false, reason: 'Unable to verify agent' });
      return false;
    } finally {
      setChecking(false);
    }
  };

  return { checkAgent, checking, result };
}

// Usage
function TransactionButton({ agentId }) {
  const { checkAgent, checking, result } = useAgentCheck();
  
  const handleClick = async () => {
    const allowed = await checkAgent(agentId, 'B');
    if (allowed) {
      // Proceed with transaction
    }
  };
  
  return (
    <button onClick={handleClick} disabled={checking}>
      {checking ? 'Checking Agent...' : 'Execute Transaction'}
    </button>
  );
}
```

---

## Vue.js Component

```vue
<template>
  <div class="alligo-badge" :class="gradeClass">
    <img :src="badgeUrl" alt="AlliGo Score" />
    <div v-if="showDetails && score" class="details">
      <span class="grade">{{ score.grade }}</span>
      <span class="score">{{ score.riskScore }}/100</span>
      <span class="claims">{{ score.totalClaims }} claims</span>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    agentId: { type: String, required: true },
    showDetails: { type: Boolean, default: false },
  },
  data() {
    return {
      score: null,
      loading: true,
      error: null,
    };
  },
  computed: {
    badgeUrl() {
      return `https://api.alligo.io/api/badge/${encodeURIComponent(this.agentId)}.svg`;
    },
    gradeClass() {
      if (!this.score) return '';
      return `grade-${this.score.grade.toLowerCase()}`;
    },
  },
  async mounted() {
    if (this.showDetails) {
      try {
        const res = await fetch(
          `https://api.alligo.io/api/public/agents/${encodeURIComponent(this.agentId)}/score`
        );
        this.score = await res.json();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    }
  },
};
</script>

<style scoped>
.alligo-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #333;
}
.grade-a, .grade-b { border-color: #00ff88; }
.grade-c { border-color: #ffaa00; }
.grade-d, .grade-f { border-color: #ff4444; }
.details {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
}
</style>
```

---

## Browser Extension

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "AlliGo Agent Checker",
  "version": "1.0",
  "description": "Check AI agent trust scores",
  "permissions": ["activeTab"],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

### content.js

```javascript
// Find agent IDs on the page and annotate with AlliGo scores

const API_BASE = 'https://api.alligo.io';

async function getAgentScore(agentId) {
  try {
    const res = await fetch(`${API_BASE}/api/public/agents/${encodeURIComponent(agentId)}/score`);
    return await res.json();
  } catch {
    return null;
  }
}

function createBadge(score) {
  const badge = document.createElement('span');
  badge.className = 'alligo-badge';
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-left: 4px;
  `;
  
  const colors = {
    A: { bg: '#00ff88', text: '#000' },
    B: { bg: '#00ff88', text: '#000' },
    C: { bg: '#ffaa00', text: '#000' },
    D: { bg: '#ff6644', text: '#fff' },
    F: { bg: '#ff4444', text: '#fff' },
    NR: { bg: '#666', text: '#fff' },
  };
  
  const c = colors[score.grade] || colors.NR;
  badge.style.background = c.bg;
  badge.style.color = c.text;
  badge.textContent = `🛡️ ${score.grade} ${Math.round(score.riskScore)}`;
  
  return badge;
}

// Scan for agent IDs (customize pattern for your use case)
async function scanForAgents() {
  const agentPatterns = [
    /agent[_-]?([a-zA-Z0-9_]+)/gi,
    /0x[a-fA-F0-9]{40}/g,
  ];
  
  const found = new Set();
  
  // Scan text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const pattern of agentPatterns) {
      const matches = node.textContent.match(pattern);
      if (matches) {
        matches.forEach(m => found.add(m));
      }
    }
  }
  
  // Add badges
  for (const agentId of found) {
    const score = await getAgentScore(agentId);
    if (score) {
      // Find and annotate elements containing the agent ID
      const elements = document.querySelectorAll(`*:contains('${agentId}')`);
      elements.forEach(el => {
        if (!el.querySelector('.alligo-badge')) {
          el.appendChild(createBadge(score));
        }
      });
    }
  }
}

scanForAgents();
```

---

## Server Middleware

### Express.js Middleware

```javascript
const ALLIGO_MIN_GRADE = process.env.ALLIGO_MIN_GRADE || 'C';

async function alligoCheck(req, res, next) {
  const agentId = req.body.agentId || req.params.agentId;
  
  if (!agentId) {
    return next();
  }
  
  try {
    const response = await fetch(
      `https://api.alligo.io/api/public/agents/${encodeURIComponent(agentId)}/score`
    );
    const score = await response.json();
    
    const gradeOrder = ['A', 'B', 'C', 'D', 'F', 'NR'];
    const minIndex = gradeOrder.indexOf(ALLIGO_MIN_GRADE);
    const agentIndex = gradeOrder.indexOf(score.grade);
    
    if (agentIndex > minIndex) {
      return res.status(403).json({
        error: 'Agent risk too high',
        grade: score.grade,
        riskScore: score.riskScore,
        minimum: ALLIGO_MIN_GRADE,
      });
    }
    
    req.agentScore = score;
    next();
  } catch (error) {
    // Fail open or closed depending on your requirements
    console.error('AlliGo check failed:', error);
    next();
  }
}

// Usage
app.post('/api/transaction', alligoCheck, async (req, res) => {
  // req.agentScore contains the agent's score
  // Proceed with transaction
});
```

### Fastify Hook

```javascript
const fp = require('fastify-plugin');

module.exports = fp(async function (fastify, opts) {
  fastify.addHook('preHandler', async (request, reply) => {
    const agentId = request.body?.agentId;
    
    if (!agentId) return;
    
    const response = await fetch(
      `https://api.alligo.io/api/public/agents/${encodeURIComponent(agentId)}/score`
    );
    const score = await response.json();
    
    request.agentScore = score;
    
    if (score.grade === 'F') {
      reply.code(403).send({ error: 'Agent blocked due to critical risk' });
      return reply;
    }
  });
});
```

---

## Need Help?

- **Documentation**: [docs.alligo.io](https://docs.alligo.io)
- **GitHub**: [github.com/spiritclawd/AlliGo](https://github.com/spiritclawd/AlliGo)
- **Discord**: [discord.gg/alligo](https://discord.gg/alligo)
- **Email**: [support@alligo.io](mailto:support@alligo.io)
