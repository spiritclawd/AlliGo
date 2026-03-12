// AlliGo Browser Extension - Popup Script

// Configuration
const API_BASE = 'http://localhost:3399/api'; // Change to production URL

// DOM Elements
const agentIdInput = document.getElementById('agentId');
const searchBtn = document.getElementById('searchBtn');
const resultDiv = document.getElementById('result');
const mainContent = document.getElementById('mainContent');
const settingsContent = document.getElementById('settingsContent');
const settingsBtn = document.getElementById('settingsBtn');
const apiKeyInput = document.getElementById('apiKey');
const saveSettingsBtn = document.getElementById('saveSettings');

// State
let apiKey = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved API key
  const stored = await chrome.storage.local.get(['alligoApiKey']);
  if (stored.alligoApiKey) {
    apiKey = stored.alligoApiKey;
    apiKeyInput.value = apiKey;
  }
  
  // Load last searched agent
  const lastSearch = await chrome.storage.local.get(['lastAgentId']);
  if (lastSearch.lastAgentId) {
    agentIdInput.value = lastSearch.lastAgentId;
  }
});

// Toggle settings
settingsBtn.addEventListener('click', () => {
  mainContent.style.display = mainContent.style.display === 'none' ? 'block' : 'none';
  settingsContent.style.display = settingsContent.style.display === 'none' ? 'block' : 'none';
});

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  apiKey = apiKeyInput.value.trim();
  await chrome.storage.local.set({ alligoApiKey: apiKey });
  mainContent.style.display = 'block';
  settingsContent.style.display = 'none';
  showSuccess('Settings saved!');
});

// Search button
searchBtn.addEventListener('click', () => lookupAgent(agentIdInput.value.trim()));

// Enter key
agentIdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    lookupAgent(agentIdInput.value.trim());
  }
});

// Quick action buttons
document.querySelectorAll('.quick-action').forEach(btn => {
  btn.addEventListener('click', () => {
    const agentId = btn.dataset.agent;
    agentIdInput.value = agentId;
    lookupAgent(agentId);
  });
});

// Main lookup function
async function lookupAgent(agentId) {
  if (!agentId) {
    showError('Please enter an agent ID');
    return;
  }
  
  // Save last search
  await chrome.storage.local.set({ lastAgentId: agentId });
  
  // Show loading
  resultDiv.innerHTML = '<div class="result loading">Loading...</div>';
  
  try {
    const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/score`, {
      headers: {
        'Authorization': `Bearer ${apiKey || 'alligo_read_dev_key'}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        showError('Agent not found in database');
      } else if (response.status === 401) {
        showError('Invalid API key. Check settings.');
      } else {
        showError(`API error: ${response.status}`);
      }
      return;
    }
    
    const data = await response.json();
    displayResult(data);
    
  } catch (error) {
    showError('Failed to connect to AlliGo API. Is the server running?');
    console.error('AlliGo API error:', error);
  }
}

// Display agent result
function displayResult(data) {
  const grade = data.grade || 'NR';
  const gradeClass = `grade-${grade}`;
  
  const html = `
    <div class="result">
      <div class="grade-badge ${gradeClass}">${grade}</div>
      <div class="agent-name">${data.agentId}</div>
      <div class="agent-summary">${data.summary || 'No claims found'}</div>
      
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">${data.riskScore || 50}</div>
          <div class="stat-label">Risk Score</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.totalClaims || 0}</div>
          <div class="stat-label">Claims</div>
        </div>
        <div class="stat">
          <div class="stat-value negative">$${formatNumber(data.totalValueLost || 0)}</div>
          <div class="stat-label">Lost</div>
        </div>
      </div>
      
      ${data.openClaims > 0 ? `
        <div style="margin-top: 12px; padding: 8px; background: #7c2d12; border-radius: 6px; font-size: 12px;">
          ⚠️ ${data.openClaims} open claim(s) pending resolution
        </div>
      ` : ''}
    </div>
  `;
  
  resultDiv.innerHTML = html;
}

// Helper functions
function showError(message) {
  resultDiv.innerHTML = `<div class="result error">❌ ${message}</div>`;
}

function showSuccess(message) {
  resultDiv.innerHTML = `<div class="result" style="border-color: #22c55e;">✓ ${message}</div>`;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}
