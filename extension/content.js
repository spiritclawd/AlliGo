// AlliGo Browser Extension - Content Script
// Highlights AI agents with risk indicators on Twitter/X

(async function() {
  'use strict';
  
  const API_BASE = 'http://localhost:3399/api';
  const BADGE_CLASS = 'alligo-risk-badge';
  
  // Known AI agent patterns on Twitter
  const AGENT_PATTERNS = [
    /\b(@?\w*eliza\w*)\b/gi,
    /\b(@?\w*agent\w*)\b/gi,
    /\b(@?\w*bot\w*)\b/gi,
    /\b(@?\w*ai\w*)\b/gi,
    /\b(lobstar\w*)\b/gi,
    /\b(ai16z)\b/gi,
    /\b(virtuals)\b/gi,
    /\b(zerebro)\b/gi,
    /\b(clank\w*)\b/gi
  ];
  
  // Cache for agent scores
  const scoreCache = new Map();
  
  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 4px;
      vertical-align: middle;
      cursor: pointer;
      text-decoration: none !important;
    }
    
    .${BADGE_CLASS}-A { background: #22c55e20; color: #22c55e; border: 1px solid #22c55e40; }
    .${BADGE_CLASS}-B { background: #3b82f620; color: #3b82f6; border: 1px solid #3b82f640; }
    .${BADGE_CLASS}-C { background: #eab30820; color: #eab308; border: 1px solid #eab30840; }
    .${BADGE_CLASS}-D { background: #f9731620; color: #f97316; border: 1px solid #f9731640; }
    .${BADGE_CLASS}-F { background: #ef444420; color: #ef4444; border: 1px solid #ef444440; }
    .${BADGE_CLASS}-NR { background: #6b728020; color: #9ca3af; border: 1px solid #6b728040; }
    
    .${BADGE_CLASS}:hover {
      opacity: 0.8;
    }
    
    .alligo-tooltip {
      position: absolute;
      background: #1a1a24;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px;
      z-index: 99999;
      max-width: 280px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      color: #e5e5e5;
    }
    
    .alligo-tooltip-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .alligo-tooltip-grade {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    
    .alligo-tooltip-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #333;
    }
    
    .alligo-tooltip-stat {
      text-align: center;
    }
    
    .alligo-tooltip-value {
      font-weight: 700;
      font-size: 14px;
    }
    
    .alligo-tooltip-label {
      font-size: 10px;
      color: #888;
    }
  `;
  document.head.appendChild(styles);
  
  // Fetch agent score
  async function getAgentScore(agentId) {
    // Check cache
    const cached = scoreCache.get(agentId);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.data;
    }
    
    try {
      const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/score`, {
        headers: {
          'Authorization': 'Bearer alligo_read_dev_key'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        scoreCache.set(agentId, { data, timestamp: Date.now() });
        return data;
      }
    } catch (error) {
      console.debug('AlliGo: Could not fetch score for', agentId);
    }
    
    return null;
  }
  
  // Create badge element
  function createBadge(agentId, grade, score) {
    const badge = document.createElement('span');
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}-${grade}`;
    badge.textContent = `🛡️ ${grade}`;
    badge.title = `AlliGo Risk Grade: ${grade}`;
    badge.dataset.agentId = agentId;
    
    // Click to show details
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTooltip(badge, agentId, score);
    });
    
    return badge;
  }
  
  // Show tooltip with details
  function showTooltip(badge, agentId, score) {
    // Remove existing tooltips
    document.querySelectorAll('.alligo-tooltip').forEach(t => t.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'alligo-tooltip';
    
    const grade = score.grade || 'NR';
    const gradeColors = {
      'A': '#22c55e', 'B': '#3b82f6', 'C': '#eab308', 
      'D': '#f97316', 'F': '#ef4444', 'NR': '#6b7280'
    };
    
    tooltip.innerHTML = `
      <div class="alligo-tooltip-header">
        <div class="alligo-tooltip-grade" style="background: ${gradeColors[grade]}; color: white;">
          ${grade}
        </div>
        <div>
          <div style="font-weight: 600;">${agentId}</div>
          <div style="font-size: 11px; color: #888;">AlliGo Risk Score</div>
        </div>
      </div>
      <div style="color: #888; font-size: 11px;">${score.summary || 'No claims found'}</div>
      <div class="alligo-tooltip-stats">
        <div class="alligo-tooltip-stat">
          <div class="alligo-tooltip-value">${score.riskScore || 50}</div>
          <div class="alligo-tooltip-label">Risk</div>
        </div>
        <div class="alligo-tooltip-stat">
          <div class="alligo-tooltip-value">${score.totalClaims || 0}</div>
          <div class="alligo-tooltip-label">Claims</div>
        </div>
        <div class="alligo-tooltip-stat">
          <div class="alligo-tooltip-value" style="color: #ef4444;">$${formatNumber(score.totalValueLost || 0)}</div>
          <div class="alligo-tooltip-label">Lost</div>
        </div>
      </div>
    `;
    
    // Position tooltip
    const rect = badge.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 8) + 'px';
    
    document.body.appendChild(tooltip);
    
    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closeTooltip(e) {
        if (!tooltip.contains(e.target) && e.target !== badge) {
          tooltip.remove();
          document.removeEventListener('click', closeTooltip);
        }
      });
    }, 100);
  }
  
  // Format number helper
  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }
  
  // Process tweets for agent mentions
  function processTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    
    tweets.forEach(async tweet => {
      // Skip if already processed
      if (tweet.dataset.alligoProcessed) return;
      tweet.dataset.alligoProcessed = 'true';
      
      const text = tweet.textContent;
      
      // Find potential agent IDs
      for (const pattern of AGENT_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of matches) {
            const agentId = match.toLowerCase().replace('@', '');
            
            // Skip if already has badge
            if (tweet.querySelector(`[data-agent-id="${agentId}"]`)) continue;
            
            // Fetch score
            const score = await getAgentScore(agentId);
            if (score && score.grade) {
              // Add badge to username area
              const usernameArea = tweet.querySelector('[data-testid="User-Name"]');
              if (usernameArea) {
                const badge = createBadge(agentId, score.grade, score);
                usernameArea.appendChild(badge);
              }
            }
          }
        }
      }
    });
  }
  
  // Watch for new tweets
  const observer = new MutationObserver(() => {
    processTweets();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initial scan
  setTimeout(processTweets, 1000);
  
})();
