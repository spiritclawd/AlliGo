/**
 * AlliGo - Stripe Integration
 * Subscription and payment handling
 */

import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

// Pricing tiers
export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: {
      apiCalls: 100,
      agentLookups: 50,
      claimsSubmitted: 5,
      badges: true,
      emailAlerts: false,
      webhooks: false,
      prioritySupport: false,
    },
  },
  pro: {
    name: 'Pro',
    price: 49,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: {
      apiCalls: 10000,
      agentLookups: 5000,
      claimsSubmitted: 100,
      badges: true,
      emailAlerts: true,
      webhooks: true,
      prioritySupport: false,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 299,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: {
      apiCalls: 100000,
      agentLookups: 50000,
      claimsSubmitted: 1000,
      badges: true,
      emailAlerts: true,
      webhooks: true,
      prioritySupport: true,
    },
  },
};

export interface Subscription {
  id: string;
  customerId: string;
  tier: keyof typeof TIERS;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

/**
 * Create a Stripe customer
 */
export async function createCustomer(email: string, name?: string): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      source: 'alligo',
    },
  });
  return customer.id;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  customerId: string,
  tier: 'pro' | 'enterprise',
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const priceId = TIERS[tier].priceId;
  
  if (!priceId) {
    throw new Error(`Price ID not configured for tier: ${tier}`);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      tier,
    },
  });

  return session.url!;
}

/**
 * Create a billing portal session
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Get subscription by customer ID
 */
export async function getSubscription(customerId: string): Promise<Subscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    return null;
  }

  const sub = subscriptions.data[0];
  const tier = (sub.metadata.tier as keyof typeof TIERS) || 'free';

  return {
    id: sub.id,
    customerId: sub.customer as string,
    tier,
    status: sub.status as Subscription['status'],
    currentPeriodStart: sub.current_period_start * 1000,
    currentPeriodEnd: sub.current_period_end * 1000,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Reactivate subscription
 */
export async function reactivateSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Handle webhook event
 */
export async function handleWebhookEvent(
  payload: string,
  signature: string
): Promise<{ type: string; data: any } | null> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      return {
        type: 'subscription.created',
        data: {
          customerId: session.customer,
          tier: session.metadata?.tier || 'pro',
          subscriptionId: session.subscription,
        },
      };
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      return {
        type: 'subscription.updated',
        data: {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
          status: subscription.status,
        },
      };
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      return {
        type: 'subscription.canceled',
        data: {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      };
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      return {
        type: 'payment.failed',
        data: {
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Check if customer has active subscription
 */
export async function hasActiveSubscription(customerId: string): Promise<boolean> {
  const subscription = await getSubscription(customerId);
  return subscription?.status === 'active';
}

/**
 * Get tier features for a customer
 */
export async function getTierFeatures(customerId: string): Promise<typeof TIERS.free.features> {
  const subscription = await getSubscription(customerId);
  
  if (!subscription || subscription.status !== 'active') {
    return TIERS.free.features;
  }

  return TIERS[subscription.tier].features;
}

export { stripe };
