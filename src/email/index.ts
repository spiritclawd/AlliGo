/**
 * AlliGo - Email Service
 * Send alerts and notifications via email
 */

interface EmailRecipient {
  email: string;
  name?: string;
}

interface Claim {
  id: string;
  agentId: string;
  agentName?: string;
  title: string;
  description: string;
  amountLost: number;
  claimType: string;
  category: string;
  chain?: string;
  platform?: string;
}

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'alerts@alligo.io';

/**
 * Send email via Brevo API
 */
async function sendEmail(
  to: EmailRecipient[],
  subject: string,
  html: string
): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.log('📧 Email would be sent (no API key configured)');
    return false;
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: 'AlliGo' },
        to: to,
        subject,
        htmlContent: html,
      }),
    });

    return res.ok;
  } catch (e) {
    console.error('Email send failed:', e);
    return false;
  }
}

/**
 * Send new claim notification
 */
export async function sendNewClaimNotification(
  recipients: EmailRecipient[],
  claim: Claim
): Promise<boolean> {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(claim.amountLost);

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 20px; border-radius: 12px;">
      <h2 style="color: #ff4444;">🚨 New Agent Failure</h2>
      <p style="font-size: 24px; color: #fff;">${formattedAmount} lost</p>
      <hr style="border-color: #333;">
      <h3 style="color: #fff;">${claim.title}</h3>
      <p style="color: #888;">Agent: ${claim.agentName || claim.agentId}</p>
      <p style="color: #888;">Category: ${claim.category}</p>
      <p style="color: #ccc; margin-top: 20px;">${claim.description}</p>
      <a href="https://alligo.io/claim/${claim.id}" style="display: inline-block; background: #00ff88; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px;">View Details</a>
    </div>
  `;

  return sendEmail(recipients, `🚨 ${formattedAmount} Lost: ${claim.title}`, html);
}

/**
 * Send weekly digest
 */
export async function sendWeeklyDigest(
  recipient: EmailRecipient,
  stats: {
    totalClaims: number;
    totalValueLost: number;
    topAgents: Array<{ agentId: string; name?: string; valueLost: number }>;
    topCategories: Record<string, number>;
  }
): Promise<boolean> {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(stats.totalValueLost);

  const agentsList = stats.topAgents
    .slice(0, 5)
    .map(a => `<li>${a.name || a.agentId}: $${(a.valueLost / 1000000).toFixed(1)}M</li>`)
    .join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; padding: 20px; border-radius: 12px;">
      <h2 style="color: #00ff88;">📊 AlliGo Weekly Digest</h2>
      <p style="font-size: 18px; color: #fff;">${stats.totalClaims} new claims this week</p>
      <p style="font-size: 24px; color: #ff4444;">${formattedTotal} total losses tracked</p>
      <hr style="border-color: #333;">
      <h3 style="color: #fff;">Top Agents by Losses</h3>
      <ul style="color: #ccc;">${agentsList}</ul>
      <a href="https://alligo.io" style="display: inline-block; background: #00ff88; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px;">View Dashboard</a>
    </div>
  `;

  return sendEmail([recipient], `📊 AlliGo Weekly: ${stats.totalClaims} claims, ${formattedTotal} lost`, html);
}

export default { sendNewClaimNotification, sendWeeklyDigest };
