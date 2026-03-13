/**
 * AlliGo - Twitter/X Bot
 * Auto-post new claims and daily stats
 */

import crypto from 'crypto';

// Twitter API v2 configuration
const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET;
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;

interface Tweet {
  text: string;
  mediaIds?: string[];
}

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
}

/**
 * Generate OAuth 1.0a signature for Twitter API
 */
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const consumerKey = TWITTER_API_KEY!;
  const consumerSecret = TWITTER_API_SECRET!;
  const token = TWITTER_ACCESS_TOKEN!;
  const tokenSecret = TWITTER_ACCESS_SECRET!;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: token,
    oauth_version: '1.0',
  };

  // Combine oauth and query params, sort them
  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
    .join('&');

  // Create signature base string
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  // Generate signature
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  return signature;
}

/**
 * Create OAuth header
 */
function createOAuthHeader(params: Record<string, string>, signature: string): string {
  const consumerKey = TWITTER_API_KEY!;
  const token = TWITTER_ACCESS_TOKEN!;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const oauthParams = [
    `oauth_consumer_key="${encodeURIComponent(consumerKey)}"`,
    `oauth_nonce="${nonce}"`,
    `oauth_signature="${encodeURIComponent(signature)}"`,
    `oauth_signature_method="HMAC-SHA1"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_token="${encodeURIComponent(token)}"`,
    `oauth_version="1.0"`,
  ];

  return `OAuth ${oauthParams.join(', ')}`;
}

/**
 * Post a tweet
 */
export async function postTweet(tweet: Tweet): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  if (!TWITTER_API_KEY || !TWITTER_ACCESS_TOKEN) {
    console.warn('Twitter API credentials not configured, skipping tweet');
    return { success: false, error: 'Twitter API not configured' };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const signature = generateOAuthSignature('POST', url, {});
  const authHeader = createOAuthHeader({}, signature);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: tweet.text,
        ...(tweet.mediaIds && { media: { media_ids: tweet.mediaIds } }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Tweet failed:', error);
      return { success: false, error };
    }

    const result = await response.json();
    return { success: true, tweetId: result.data.id };
  } catch (error) {
    console.error('Tweet error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Format a claim for Twitter
 */
export function formatClaimTweet(claim: ClaimData): string {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(claim.amountLost);

  const emoji = getEmojiForCategory(claim.category);
  const chainEmoji = claim.chain ? getChainEmoji(claim.chain) : '';

  const tweet = `${emoji} NEW AGENT FAILURE

${formattedAmount} lost by ${claim.agentName || claim.agentId}

${claim.title}

${chainEmoji} ${claim.chain || 'Multi-chain'} | ${claim.platform || 'Various'}

📊 Track all agent failures: alligo.io

#AIAgents #Crypto #DeFi`;

  // Ensure tweet is within 280 characters
  if (tweet.length > 280) {
    return tweet.substring(0, 277) + '...';
  }

  return tweet;
}

/**
 * Format a stats summary tweet
 */
export function formatStatsTweet(stats: {
  totalClaims: number;
  totalValueLost: number;
  topCategory: string;
  topChain: string;
}): string {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(stats.totalValueLost);

  return `📊 ALLIGO DAILY STATS

${stats.totalClaims} AI agent failures tracked
${formattedTotal} total losses

Top category: ${stats.topCategory}
Top chain: ${stats.topChain}

🛡️ Protect your agents → alligo.io

#AIAgents #RiskManagement`;
}

/**
 * Post a new claim alert to Twitter
 */
export async function postClaimAlert(claim: ClaimData): Promise<{ success: boolean; tweetId?: string }> {
  const tweetText = formatClaimTweet(claim);
  return postTweet({ text: tweetText });
}

/**
 * Post daily stats summary
 */
export async function postDailyStats(stats: {
  totalClaims: number;
  totalValueLost: number;
  topCategory: string;
  topChain: string;
}): Promise<{ success: boolean; tweetId?: string }> {
  const tweetText = formatStatsTweet(stats);
  return postTweet({ text: tweetText });
}

/**
 * Get emoji for claim category
 */
function getEmojiForCategory(category: string): string {
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
  };
  return emojis[chain.toLowerCase()] || '⛓️';
}

/**
 * Generate a thread for a high-value claim
 */
export async function postClaimThread(claim: ClaimData): Promise<{ success: boolean; tweetIds?: string[] }> {
  if (claim.amountLost < 1000000) {
    // Only thread for claims > $1M
    return postClaimAlert(claim);
  }

  const tweetIds: string[] = [];
  
  // First tweet
  const firstTweet = formatClaimTweet(claim);
  const firstResult = await postTweet({ text: firstTweet });
  
  if (!firstResult.success || !firstResult.tweetId) {
    return { success: false };
  }
  
  tweetIds.push(firstResult.tweetId);

  // Second tweet with details
  const detailsTweet = `🔍 DETAILS:

${claim.description.substring(0, 250)}${claim.description.length > 250 ? '...' : ''}

Agent ID: ${claim.agentId}
Type: ${claim.claimType}
Category: ${claim.category}

Reported to AlliGo 🛡️`;

  // Note: For threads, we'd need to use the reply functionality
  // This is simplified for now
  const secondResult = await postTweet({ text: detailsTweet });
  
  if (secondResult.success && secondResult.tweetId) {
    tweetIds.push(secondResult.tweetId);
  }

  return { success: true, tweetIds };
}

export default {
  postTweet,
  postClaimAlert,
  postDailyStats,
  postClaimThread,
  formatClaimTweet,
  formatStatsTweet,
};
