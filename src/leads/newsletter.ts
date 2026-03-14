/**
 * AlliGo - Newsletter Integration
 * Email marketing with Resend or Brevo (Sendinblue)
 */

import { getAllLeads, logEmail, LeadStats } from './db';
import { getWaitlistSummary, getEstimatedWaitTime } from './waitlist';
import { LeadSource } from './db';

// ==================== CONFIGURATION ====================

interface EmailConfig {
  provider: 'resend' | 'brevo' | 'console';
  apiKey?: string;
  fromEmail: string;
  fromName: string;
}

const config: EmailConfig = {
  provider: (process.env.EMAIL_PROVIDER as 'resend' | 'brevo' | 'console') || 'console',
  apiKey: process.env.EMAIL_API_KEY,
  fromEmail: process.env.FROM_EMAIL || 'hello@alligo.io',
  fromName: process.env.FROM_NAME || 'AlliGo',
};

// ==================== EMAIL TEMPLATES ====================

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Welcome email for new signups
 */
export function getWelcomeEmail(email: string, source: LeadSource): EmailTemplate {
  const sourceMessages: Record<LeadSource, string> = {
    landing_page: "Thanks for your interest in AlliGo!",
    pricing_page: "Thanks for checking out our pricing!",
    hero_section: "Welcome to AlliGo!",
    waitlist_pro: "You're on the Pro waitlist!",
    newsletter: "Welcome to the AlliGo newsletter!",
    api_docs: "Thanks for exploring our API!",
    referral: "Welcome! Someone referred you to AlliGo.",
    social: "Welcome from social media!",
    other: "Welcome to AlliGo!",
  };

  return {
    subject: `Welcome to AlliGo - The Credit Bureau for AI Agents`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
  <div style="background: #1a1a1a; border-radius: 12px; padding: 30px; border: 1px solid #333;">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #00ff88; margin: 0;">🛡️ AlliGo</h1>
      <p style="color: #888; margin: 10px 0 0 0;">The Credit Bureau for AI Agents</p>
    </div>
    
    <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 15px 0; color: #fff;">${sourceMessages[source]}</h2>
      <p style="margin: 0; color: #888; line-height: 1.6;">
        You've just joined thousands of developers and platforms using AlliGo to verify AI agent trustworthiness before transactions.
      </p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <h3 style="color: #fff; margin: 0 0 15px 0;">Here's what you can do now:</h3>
      <ul style="color: #888; padding-left: 20px; margin: 0;">
        <li style="margin-bottom: 10px;">
          <a href="https://github.com/spiritclawd/AlliGo" style="color: #00ff88;">⭐ Star us on GitHub</a> - Support the project
        </li>
        <li style="margin-bottom: 10px;">
          <a href="https://t.me/alligo_alerts" style="color: #00ff88;">📢 Join Telegram Alerts</a> - Get notified of new claims
        </li>
        <li style="margin-bottom: 10px;">
          <a href="/api/public/stats" style="color: #00ff88;">📊 View Live Stats</a> - See what we're tracking
        </li>
        <li style="margin-bottom: 10px;">
          <a href="/api" style="color: #00ff88;">📚 Read API Docs</a> - Start integrating
        </li>
      </ul>
    </div>
    
    <div style="background: rgba(0, 255, 136, 0.1); border: 1px solid #00ff88; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 10px 0; color: #00ff88;">🚀 Quick Start</h3>
      <p style="margin: 0; color: #fff; font-family: monospace; font-size: 14px;">
        curl https://api.alligo.io/api/public/agents/eliza_trader_001/score
      </p>
    </div>
    
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #333;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        You received this email because you signed up at alligo.io<br>
        <a href="#" style="color: #888;">Unsubscribe</a> | 
        <a href="/legal/privacy" style="color: #888;">Privacy Policy</a>
      </p>
    </div>
    
  </div>
</body>
</html>
    `,
    text: `
Welcome to AlliGo - The Credit Bureau for AI Agents

${sourceMessages[source]}

You've just joined thousands of developers and platforms using AlliGo to verify AI agent trustworthiness before transactions.

Here's what you can do now:
- Star us on GitHub: https://github.com/spiritclawd/AlliGo
- Join Telegram Alerts: https://t.me/alligo_alerts
- View Live Stats: /api/public/stats
- Read API Docs: /api

Quick Start:
curl https://api.alligo.io/api/public/agents/eliza_trader_001/score

---
You received this email because you signed up at alligo.io
Unsubscribe: [unsubscribe link]
    `.trim(),
  };
}

/**
 * Waitlist confirmation email
 */
export function getWaitlistConfirmationEmail(email: string, position: number): EmailTemplate {
  const waitTime = getEstimatedWaitTime(position);

  return {
    subject: `You're #${position} on the AlliGo Pro Waitlist`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
  <div style="background: #1a1a1a; border-radius: 12px; padding: 30px; border: 1px solid #333;">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #00ff88; margin: 0;">🛡️ AlliGo Pro</h1>
      <p style="color: #888; margin: 10px 0 0 0;">Early Access Waitlist</p>
    </div>
    
    <div style="background: linear-gradient(135deg, rgba(0, 255, 136, 0.1) 0%, #0a0a0a 100%); border: 2px solid #00ff88; border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 20px;">
      <div style="font-size: 14px; color: #888; margin-bottom: 5px;">YOUR POSITION</div>
      <div style="font-size: 48px; font-weight: 800; color: #00ff88;">#${position}</div>
      <div style="font-size: 14px; color: #888; margin-top: 10px;">Estimated wait: ${waitTime}</div>
    </div>
    
    <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 15px 0; color: #fff;">What's included in Pro:</h3>
      <ul style="color: #888; padding-left: 20px; margin: 0;">
        <li style="margin-bottom: 8px;">✅ 10,000 API requests/day</li>
        <li style="margin-bottom: 8px;">✅ Real-time Telegram alerts</li>
        <li style="margin-bottom: 8px;">✅ Webhook notifications</li>
        <li style="margin-bottom: 8px;">✅ Risk score trends</li>
        <li style="margin-bottom: 8px;">✅ Priority support</li>
      </ul>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #888; margin: 0;">
        We're onboarding users in batches. We'll email you when it's your turn to access Pro features.
      </p>
    </div>
    
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #333;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        You received this email because you joined the AlliGo Pro waitlist<br>
        <a href="#" style="color: #888;">Leave waitlist</a> | 
        <a href="/legal/privacy" style="color: #888;">Privacy Policy</a>
      </p>
    </div>
    
  </div>
</body>
</html>
    `,
    text: `
You're #${position} on the AlliGo Pro Waitlist

YOUR POSITION: #${position}
Estimated wait: ${waitTime}

What's included in Pro:
- 10,000 API requests/day
- Real-time Telegram alerts
- Webhook notifications
- Risk score trends
- Priority support

We're onboarding users in batches. We'll email you when it's your turn to access Pro features.

---
You received this email because you joined the AlliGo Pro waitlist
    `.trim(),
  };
}

/**
 * Pro plan availability notification
 */
export function getProAvailabilityEmail(email: string): EmailTemplate {
  return {
    subject: `🎉 You're in! AlliGo Pro is now available for you`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
  <div style="background: #1a1a1a; border-radius: 12px; padding: 30px; border: 1px solid #333;">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #00ff88; margin: 0;">🎉 Congratulations!</h1>
      <p style="color: #888; margin: 10px 0 0 0;">You're off the waitlist</p>
    </div>
    
    <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <p style="margin: 0 0 15px 0; color: #fff; font-size: 18px;">
        Great news! Your spot on the AlliGo Pro waitlist is now open.
      </p>
      <p style="margin: 0; color: #888; line-height: 1.6;">
        You can now access all Pro features including 10,000 API requests/day, 
        real-time Telegram alerts, webhook notifications, and more.
      </p>
    </div>
    
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="/admin" style="display: inline-block; background: #00ff88; color: #0a0a0a; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Activate Pro Access →
      </a>
    </div>
    
    <div style="background: rgba(255, 170, 0, 0.1); border: 1px solid #ffaa00; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; color: #ffaa00; font-size: 14px;">
        ⏰ This invitation expires in 7 days. Activate your access now!
      </p>
    </div>
    
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #333;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        You received this email because you were on the AlliGo Pro waitlist<br>
        <a href="#" style="color: #888;">Unsubscribe</a> | 
        <a href="/legal/privacy" style="color: #888;">Privacy Policy</a>
      </p>
    </div>
    
  </div>
</body>
</html>
    `,
    text: `
Congratulations! You're off the waitlist

Great news! Your spot on the AlliGo Pro waitlist is now open.

You can now access all Pro features including:
- 10,000 API requests/day
- Real-time Telegram alerts
- Webhook notifications
- And more!

Activate your access: /admin

This invitation expires in 7 days. Activate your access now!

---
You received this email because you were on the AlliGo Pro waitlist
    `.trim(),
  };
}

/**
 * Weekly digest email
 */
export function getWeeklyDigestEmail(stats: LeadStats): EmailTemplate {
  const newLeads = stats.recentCount;
  const topSources = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([source, count]) => `${source}: ${count}`)
    .join(', ');

  return {
    subject: `📊 AlliGo Weekly Digest - ${newLeads} new signups this week`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
  <div style="background: #1a1a1a; border-radius: 12px; padding: 30px; border: 1px solid #333;">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #00ff88; margin: 0;">📊 Weekly Digest</h1>
      <p style="color: #888; margin: 10px 0 0 0;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
      <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #00ff88;">${stats.total}</div>
        <div style="font-size: 12px; color: #888;">Total Signups</div>
      </div>
      <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #00ff88;">+${newLeads}</div>
        <div style="font-size: 12px; color: #888;">This Week</div>
      </div>
    </div>
    
    <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 15px 0; color: #fff;">Top Sources</h3>
      <p style="margin: 0; color: #888;">${topSources || 'No data yet'}</p>
    </div>
    
    <div style="background: #0a0a0a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 15px 0; color: #fff;">Waitlist</h3>
      <p style="margin: 0; color: #888;">${stats.waitlistCount} users waiting for Pro access</p>
    </div>
    
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #333;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        You received this email because you signed up at alligo.io<br>
        <a href="#" style="color: #888;">Unsubscribe</a> | 
        <a href="/legal/privacy" style="color: #888;">Privacy Policy</a>
      </p>
    </div>
    
  </div>
</body>
</html>
    `,
    text: `
AlliGo Weekly Digest - ${new Date().toLocaleDateString()}

Stats:
- Total Signups: ${stats.total}
- New This Week: +${newLeads}
- Waitlist: ${stats.waitlistCount} users

Top Sources: ${topSources || 'No data yet'}

---
You received this email because you signed up at alligo.io
    `.trim(),
  };
}

// ==================== EMAIL SENDING ====================

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email via configured provider
 */
async function sendEmail(to: string, template: EmailTemplate): Promise<SendResult> {
  // Console mode - just log the email
  if (config.provider === 'console' || !config.apiKey) {
    console.log(`\n📧 EMAIL [${config.provider}]`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${template.subject}`);
    console.log(`  ---\n${template.text}\n  ---\n`);
    
    logEmail({
      email: to,
      type: template.subject.includes('Welcome') ? 'welcome' : 
            template.subject.includes('waitlist') ? 'waitlist' :
            template.subject.includes('Pro') ? 'pro_approval' : 'digest',
      subject: template.subject,
      status: 'sent',
    });
    
    return { success: true, messageId: `console_${Date.now()}` };
  }
  
  // Resend API
  if (config.provider === 'resend') {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: [to],
          subject: template.subject,
          html: template.html,
          text: template.text,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        logEmail({
          email: to,
          type: 'unknown',
          subject: template.subject,
          status: 'failed',
          error: data.message || 'Unknown error',
        });
        
        return { success: false, error: data.message };
      }
      
      logEmail({
        email: to,
        type: template.subject.includes('Welcome') ? 'welcome' : 
              template.subject.includes('waitlist') ? 'waitlist' :
              template.subject.includes('Pro') ? 'pro_approval' : 'digest',
        subject: template.subject,
        status: 'sent',
      });
      
      return { success: true, messageId: data.id };
      
    } catch (error: any) {
      logEmail({
        email: to,
        type: 'unknown',
        subject: template.subject,
        status: 'failed',
        error: error.message,
      });
      
      return { success: false, error: error.message };
    }
  }
  
  // Brevo (Sendinblue) API
  if (config.provider === 'brevo') {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: config.fromName, email: config.fromEmail },
          to: [{ email: to }],
          subject: template.subject,
          htmlContent: template.html,
          textContent: template.text,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        logEmail({
          email: to,
          type: 'unknown',
          subject: template.subject,
          status: 'failed',
          error: data.message || 'Unknown error',
        });
        
        return { success: false, error: data.message };
      }
      
      logEmail({
        email: to,
        type: template.subject.includes('Welcome') ? 'welcome' : 
              template.subject.includes('waitlist') ? 'waitlist' :
              template.subject.includes('Pro') ? 'pro_approval' : 'digest',
        subject: template.subject,
        status: 'sent',
      });
      
      return { success: true, messageId: data.messageId };
      
    } catch (error: any) {
      logEmail({
        email: to,
        type: 'unknown',
        subject: template.subject,
        status: 'failed',
        error: error.message,
      });
      
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, error: 'Unknown email provider' };
}

// ==================== PUBLIC FUNCTIONS ====================

/**
 * Send welcome email to new lead
 */
export async function sendWelcomeEmail(email: string, source: LeadSource): Promise<SendResult> {
  const template = getWelcomeEmail(email, source);
  return sendEmail(email, template);
}

/**
 * Send waitlist confirmation email
 */
export async function sendWaitlistConfirmation(email: string, position: number): Promise<SendResult> {
  const template = getWaitlistConfirmationEmail(email, position);
  return sendEmail(email, template);
}

/**
 * Send Pro plan availability notification
 */
export async function sendProAvailabilityEmail(email: string): Promise<SendResult> {
  const template = getProAvailabilityEmail(email);
  return sendEmail(email, template);
}

/**
 * Send weekly digest to all leads
 */
export async function sendWeeklyDigest(stats: LeadStats): Promise<{ sent: number; failed: number }> {
  const leads = getAllLeads(10000, 0);
  const template = getWeeklyDigestEmail(stats);
  
  let sent = 0;
  let failed = 0;
  
  // Send in batches of 10 to avoid rate limits
  for (let i = 0; i < leads.length; i += 10) {
    const batch = leads.slice(i, i + 10);
    
    const results = await Promise.all(
      batch.map(lead => sendEmail(lead.email, template))
    );
    
    for (const result of results) {
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
    
    // Small delay between batches
    if (i + 10 < leads.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return { sent, failed };
}
