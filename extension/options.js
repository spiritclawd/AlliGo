// AlliGo Extension - Options Page Script

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const apiKeyInput = document.getElementById('apiKey');
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const showBadgesCheck = document.getElementById('showBadges');
  const showWarningsCheck = document.getElementById('showWarnings');
  const notificationsCheck = document.getElementById('notifications');
  const minGradeSelect = document.getElementById('minGrade');
  const saveBtn = document.getElementById('saveSettings');
  const testBtn = document.getElementById('testConnection');
  const saveStatus = document.getElementById('saveStatus');
  const apiStatus = document.getElementById('apiStatus');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  // Load saved settings
  const settings = await chrome.storage.local.get([
    'alligoApiKey',
    'alligoApiEndpoint',
    'alligoShowBadges',
    'alligoShowWarnings',
    'alligoNotifications',
    'alligoMinGrade'
  ]);
  
  if (settings.alligoApiKey) apiKeyInput.value = settings.alligoApiKey;
  if (settings.alligoApiEndpoint) apiEndpointInput.value = settings.alligoApiEndpoint;
  if (settings.alligoShowBadges !== undefined) showBadgesCheck.checked = settings.alligoShowBadges;
  if (settings.alligoShowWarnings !== undefined) showWarningsCheck.checked = settings.alligoShowWarnings;
  if (settings.alligoNotifications !== undefined) notificationsCheck.checked = settings.alligoNotifications;
  if (settings.alligoMinGrade) minGradeSelect.value = settings.alligoMinGrade;
  
  // Save settings
  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      alligoApiKey: apiKeyInput.value.trim(),
      alligoApiEndpoint: apiEndpointInput.value.trim() || 'https://api.alligo.ai',
      alligoShowBadges: showBadgesCheck.checked,
      alligoShowWarnings: showWarningsCheck.checked,
      alligoNotifications: notificationsCheck.checked,
      alligoMinGrade: minGradeSelect.value
    };
    
    await chrome.storage.local.set(newSettings);
    
    saveStatus.textContent = '✓ Settings saved successfully';
    saveStatus.className = 'status success';
    saveStatus.style.display = 'block';
    
    setTimeout(() => {
      saveStatus.style.display = 'none';
    }, 3000);
  });
  
  // Test connection
  testBtn.addEventListener('click', async () => {
    const endpoint = apiEndpointInput.value.trim() || 'https://api.alligo.ai';
    const apiKey = apiKeyInput.value.trim();
    
    apiStatus.style.display = 'flex';
    statusDot.className = 'api-status-dot';
    statusText.textContent = 'Testing connection...';
    
    try {
      const response = await fetch(`${endpoint}/health`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      });
      
      if (response.ok) {
        const data = await response.json();
        statusDot.classList.remove('error');
        statusText.textContent = `✓ Connected! ${data.claims || 0} claims in database`;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      statusDot.classList.add('error');
      statusText.textContent = `✗ Connection failed: ${error.message}`;
    }
  });
  
  // Request notification permission
  notificationsCheck.addEventListener('change', async () => {
    if (notificationsCheck.checked) {
      const permission = await chrome.permissions.request({
        permissions: ['notifications']
      });
      
      if (!permission) {
        notificationsCheck.checked = false;
        alert('Notification permission denied');
      }
    }
  });
});
