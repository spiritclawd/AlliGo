/**
 * AlliGo - Notification Service
 * Centralized notification dispatch
 */

import { sendNewClaimNotification, sendWeeklyDigest } from '../email/index';
import { triggerClaimCreated, triggerClaimVerified } from '../webhooks/index';

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
  verified: boolean;
}

interface NotificationConfig {
  email: boolean;
  webhooks: boolean;
  minAmount?: number;
}

const defaultConfig: NotificationConfig = {
  email: true,
  webhooks: true,
  minAmount: 10000,
};

/**
 * Notify all channels about a new claim
 */
export async function notifyNewClaim(
  claim: Claim,
  config: NotificationConfig = defaultConfig
): Promise<{ email: boolean; webhooks: boolean }> {
  const results = { email: false, webhooks: false };

  if (config.minAmount && claim.amountLost < config.minAmount) {
    console.log(`Claim ${claim.id} below notification threshold`);
    return results;
  }

  const promises: Promise<void>[] = [];

  if (config.email) {
    promises.push(
      (async () => {
        try {
          const subscribers = process.env.ALERT_RECIPIENTS?.split(',').map(email => ({ email })) || [];
          if (subscribers.length > 0) {
            await sendNewClaimNotification(subscribers, claim);
            results.email = true;
          }
        } catch (e) {
          console.error('Email notification failed:', e);
        }
      })()
    );
  }

  if (config.webhooks) {
    promises.push(
      (async () => {
        try {
          await triggerClaimCreated(claim);
          results.webhooks = true;
        } catch (e) {
          console.error('Webhook notification failed:', e);
        }
      })()
    );
  }

  await Promise.allSettled(promises);
  return results;
}

/**
 * Send weekly digest to all subscribers
 */
export async function sendWeeklyDigestToSubscribers(stats: {
  totalClaims: number;
  totalValueLost: number;
  topAgents: Array<{ agentId: string; name?: string; valueLost: number }>;
  topCategories: Record<string, number>;
}): Promise<void> {
  const subscribers = process.env.DIGEST_RECIPIENTS?.split(',').map(email => ({ email })) || [];

  for (const subscriber of subscribers) {
    try {
      await sendWeeklyDigest(subscriber, stats);
    } catch (e) {
      console.error(`Failed to send digest:`, e);
    }
  }
}

export default { notifyNewClaim, sendWeeklyDigestToSubscribers };
