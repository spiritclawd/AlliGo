/**
 * AlliGo - Telegram Bot
 * Broadcast alerts to Telegram channel
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

interface ClaimData {
  id: string;
  agentId: string;
  agentName?: string;
  title: string;
  amountLost: number;
  claimType: string;
  category: string;
  chain?: string;
  platform?: string;
  description: string;
  verified?: boolean;
}

/**
 * Send a message to Telegram
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disableNotification?: boolean;
  }
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.log('Telegram not configured, skipping message');
    return { success: false, error: 'Telegram not configured' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text,
        parse_mode: options?.parseMode || 'HTML',
        disable_notification: options?.disableNotification || false,
      }),
    });

    const result = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!result.ok) {
      console.error('Telegram API error:', result.description);
      return { success: false, error: result.description };
    }

    return { success: true, messageId: result.result?.message_id };
  } catch (error) {
    console.error('Telegram send error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Format a claim for Telegram
 */
export function formatClaimMessage(claim: ClaimData): string {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(claim.amountLost);

  const categoryEmoji = getCategoryEmoji(claim.category);
  const chainEmoji = claim.chain ? getChainEmoji(claim.chain) : '';
  const verifiedBadge = claim.verified ? ' ✅' : '';

  return `${categoryEmoji} <b>NEW AGENT FAILURE</b>${verifiedBadge}

<b>${escapeHtml(claim.title)}</b>

💸 <b>Amount Lost:</b> ${formattedAmount}
🤖 <b>Agent:</b> ${escapeHtml(claim.agentName || claim.agentId)}
📁 <b>Category:</b> ${claim.category}
${claim.chain ? `⛓️ <b>Chain:</b> ${chainEmoji} ${claim.chain}\n` : ''}${claim.platform ? `Platform: ${claim.platform}\n` : ''}
<i>${escapeHtml(claim.description.substring(0, 200))}${claim.description.length > 200 ? '...' : ''}</i>

📊 <a href="https://alligo.io/agent/${encodeURIComponent(claim.agentId)}">View Full Report</a>

#AIAgents #${claim.category} #RiskAlert`;
}

/**
 * Format daily stats for Telegram
 */
export function formatStatsMessage(stats: {
  totalClaims: number;
  totalValueLost: number;
  claimsToday: number;
  valueLostToday: number;
  topCategory: string;
  topChain: string;
}): string {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(stats.totalValueLost);

  const formattedToday = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(stats.valueLostToday);

  return `📊 <b>ALLIGO DAILY DIGEST</b>

📈 <b>Total Tracked:</b>
• ${stats.totalClaims} agent failures
• ${formattedTotal} in losses

📅 <b>Today:</b>
• ${stats.claimsToday} new claims
• ${formattedToday} lost

🏆 <b>Top Category:</b> ${stats.topCategory}
⛓️ <b>Top Chain:</b> ${stats.topChain}

🛡️ <a href="https://alligo.io">Protect Your Agents</a>

#AIAgents #DailyStats`;
}

/**
 * Send claim alert to Telegram
 */
export async function sendClaimAlert(claim: ClaimData): Promise<{ success: boolean; messageId?: number }> {
  const message = formatClaimMessage(claim);
  return sendTelegramMessage(message);
}

/**
 * Send daily stats to Telegram
 */
export async function sendDailyStats(stats: {
  totalClaims: number;
  totalValueLost: number;
  claimsToday: number;
  valueLostToday: number;
  topCategory: string;
  topChain: string;
}): Promise<{ success: boolean; messageId?: number }> {
  const message = formatStatsMessage(stats);
  return sendTelegramMessage(message);
}

/**
 * Send leaderboard update
 */
export async function sendLeaderboardUpdate(agents: Array<{
  agentId: string;
  agentName?: string;
  claims: number;
  valueLost: number;
}>): Promise<{ success: boolean; messageId?: number }> {
  const top5 = agents.slice(0, 5);

  const lines = top5.map((agent, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(agent.valueLost);
    return `${medal} <b>${escapeHtml(agent.agentName || agent.agentId)}</b>\n   ${agent.claims} claims • ${formatted} lost`;
  });

  const message = `🏆 <b>HALL OF SHAME - TOP 5</b>

${lines.join('\n\n')}

📊 <a href="https://alligo.io/agents">View Full Leaderboard</a>

#AIAgents #HallOfShame`;

  return sendTelegramMessage(message);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get emoji for claim category
 */
function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    trading: '📉',
    security: '🔓',
    execution: '⚠️',
    payment: '💸',
    governance: '🗳️',
    other: '🚨',
  };
  return emojis[category.toLowerCase()] || '🚨';
}

/**
 * Get emoji for blockchain
 */
function getChainEmoji(chain: string): string {
  const emojis: Record<string, string> = {
    ethereum: '⟠',
    solana: '◎',
    bitcoin: '₿',
    polygon: '⬡',
    arbitrum: '🔷',
    bsc: '🟡',
    base: '🔵',
    multi: '🌐',
    traditional: '🏦',
  };
  return emojis[chain.toLowerCase()] || '⛓️';
}

/**
 * Test Telegram bot configuration
 */
export async function testTelegramConnection(): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }
  if (!TELEGRAM_CHANNEL_ID) {
    return { success: false, error: 'TELEGRAM_CHANNEL_ID not set' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;

  try {
    const response = await fetch(url);
    const result = await response.json() as { ok: boolean; result?: { username: string }; description?: string };

    if (!result.ok) {
      return { success: false, error: result.description };
    }

    // Send test message
    const testResult = await sendTelegramMessage(
      `🛡️ <b>AlliGo Bot Connected!</b>\n\nAgent risk monitoring is now active.\n\n<i>Connected at ${new Date().toISOString()}</i>`,
      { disableNotification: true }
    );

    return { success: testResult.success, error: testResult.error };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export default {
  sendTelegramMessage,
  sendClaimAlert,
  sendDailyStats,
  sendLeaderboardUpdate,
  testTelegramConnection,
  formatClaimMessage,
  formatStatsMessage,
};
