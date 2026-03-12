// AlliGo Browser Extension - Background Service Worker

const API_BASE = 'http://localhost:3399/api';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookupAgent') {
    lookupAgent(request.agentId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getApiKey') {
    chrome.storage.local.get(['alligoApiKey'], (result) => {
      sendResponse({ apiKey: result.alligoApiKey || '' });
    });
    return true;
  }
});

// Lookup agent risk score
async function lookupAgent(agentId) {
  const stored = await chrome.storage.local.get(['alligoApiKey']);
  const apiKey = stored.alligoApiKey || 'alligo_read_dev_key';
  
  const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/score`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

// Context menu for selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'alligo-check-agent',
    title: 'Check risk with AlliGo',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'alligo-check-agent') {
    const selectedText = info.selectionText.trim();
    if (selectedText) {
      // Open popup with the selected agent ID
      chrome.action.openPopup();
      
      // Store for popup to retrieve
      chrome.storage.local.set({ pendingAgentId: selectedText });
    }
  }
});

// Badge for risk level
async function updateBadge(agentId) {
  try {
    const score = await lookupAgent(agentId);
    const grade = score.grade;
    
    // Set badge color based on grade
    const colors = {
      'A': '#22c55e',
      'B': '#3b82f6', 
      'C': '#eab308',
      'D': '#f97316',
      'F': '#ef4444',
      'NR': '#6b7280'
    };
    
    chrome.action.setBadgeText({ text: grade });
    chrome.action.setBadgeBackgroundColor({ color: colors[grade] || colors['NR'] });
  } catch (error) {
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  }
}
