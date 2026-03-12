/**
 * AlliGo - Webhook System
 * Notify partners of new claims in real-time
 */

import { createHmac } from 'crypto';

interface WebhookEndpoint {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: number;
  lastTriggered?: number;
  failureCount: number;
}

interface WebhookPayload {
  event: string;
  timestamp: number;
  data: any;
  signature: string;
}

// In-memory store (would be database in production)
const webhooks = new Map<string, WebhookEndpoint>();

/**
 * Register a new webhook endpoint
 */
export function registerWebhook(
  userId: string,
  url: string,
  events: string[],
  secret?: string
): WebhookEndpoint {
  const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const webhookSecret = secret || generateSecret();
  
  const webhook: WebhookEndpoint = {
    id,
    userId,
    url,
    secret: webhookSecret,
    events,
    active: true,
    createdAt: Date.now(),
    failureCount: 0,
  };
  
  webhooks.set(id, webhook);
  return webhook;
}

/**
 * List webhooks for a user
 */
export function listWebhooks(userId: string): WebhookEndpoint[] {
  return Array.from(webhooks.values()).filter(w => w.userId === userId);
}

/**
 * Delete a webhook
 */
export function deleteWebhook(webhookId: string, userId: string): boolean {
  const webhook = webhooks.get(webhookId);
  if (webhook && webhook.userId === userId) {
    webhooks.delete(webhookId);
    return true;
  }
  return false;
}

/**
 * Generate webhook secret
 */
function generateSecret(): string {
  return `whsec_${Math.random().toString(36).substr(2, 32)}`;
}

/**
 * Generate signature for payload
 */
function generateSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(event: string, data: any): Promise<void> {
  const relevantWebhooks = Array.from(webhooks.values())
    .filter(w => w.active && w.events.includes(event));
  
  if (relevantWebhooks.length === 0) {
    return;
  }
  
  const payload: Omit<WebhookPayload, 'signature'> = {
    event,
    timestamp: Date.now(),
    data,
  };
  
  const payloadStr = JSON.stringify(payload);
  
  await Promise.allSettled(
    relevantWebhooks.map(async (webhook) => {
      const signature = generateSignature(payloadStr, webhook.secret);
      
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AlliGo-Signature': signature,
            'X-AlliGo-Event': event,
            'User-Agent': 'AlliGo-Webhook/1.0',
          },
          body: JSON.stringify({ ...payload, signature }),
        });
        
        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}`);
        }
        
        webhook.lastTriggered = Date.now();
        webhook.failureCount = 0;
        
        console.log(`✅ Webhook ${webhook.id} triggered successfully`);
      } catch (error) {
        webhook.failureCount++;
        
        if (webhook.failureCount >= 5) {
          webhook.active = false;
          console.warn(`⚠️ Webhook ${webhook.id} disabled after 5 failures`);
        }
        
        console.error(`❌ Webhook ${webhook.id} failed:`, error);
      }
    })
  );
}

/**
 * Verify webhook signature (for receiving end)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return signature === expectedSignature;
}

/**
 * Trigger claim created webhook
 */
export async function triggerClaimCreated(claim: any): Promise<void> {
  await triggerWebhooks('claim.created', {
    id: claim.id,
    agentId: claim.agentId,
    agentName: claim.agentName,
    title: claim.title,
    amountLost: claim.amountLost,
    category: claim.category,
    claimType: claim.claimType,
    chain: claim.chain,
    platform: claim.platform,
    timestamp: claim.timestamp,
  });
}

/**
 * Trigger claim verified webhook
 */
export async function triggerClaimVerified(claim: any): Promise<void> {
  await triggerWebhooks('claim.verified', {
    id: claim.id,
    agentId: claim.agentId,
    verified: true,
    verifiedAt: Date.now(),
  });
}

export { webhooks };
