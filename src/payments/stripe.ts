/**
 * AlliGo - Stripe Integration
 * Payment processing and subscription management
 */

import { config } from "../config";
import type { PlanTier } from "./plans";
import {
  activateSubscription,
  updateSubscriptionStatus,
  updateSubscriptionTier,
  downgradeToFree,
  markForCancellation,
  reactivateSubscription,
  getSubscriptionByCustomerId,
  getSubscriptionByStripeId,
  type SubscriptionRecord,
} from "./db";

// Lazy-loaded Stripe client
let stripe: any = null;
let stripeModule: any = null;

/**
 * Check if Stripe package is available
 */
async function loadStripe(): Promise<boolean> {
  if (stripeModule) return true;
  try {
    stripeModule = await import("stripe");
    return true;
  } catch {
    console.warn("Stripe package not installed. Payment features will be disabled.");
    return false;
  }
}

/**
 * Get or initialize Stripe client
 */
export async function getStripe(): Promise<any> {
  if (!stripe) {
    if (!config.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    
    const available = await loadStripe();
    if (!available) {
      throw new Error("Stripe package not installed. Run: bun add stripe");
    }
    
    stripe = new stripeModule.default(config.stripeSecretKey, {
      apiVersion: "2024-11-20.acacia",
    });
  }
  
  return stripe;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!config.stripeSecretKey;
}

/**
 * Create a Stripe customer
 */
export async function createCustomer(
  email: string,
  name?: string,
  userId?: string
): Promise<string> {
  const client = await getStripe();
  
  const customer = await client.customers.create({
    email,
    name,
    metadata: {
      source: "alligo",
      userId: userId || "",
    },
  });
  
  return customer.id;
}

/**
 * Create a checkout session for Pro subscription ($99/month)
 */
export async function createCheckoutSession(
  customerId: string,
  userId: string,
  tier: "pro" = "pro"
): Promise<{ sessionId: string; url: string }> {
  const client = await getStripe();
  
  // Get the price ID for the plan
  const priceId = config.stripeProPriceId;
  
  if (!priceId) {
    throw new Error(`Price ID not configured for tier: ${tier}`);
  }
  
  const successUrl = `${config.stripeBaseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${config.stripeBaseUrl}/api/payments/cancel`;
  
  const session = await client.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
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
      userId,
    },
    subscription_data: {
      metadata: {
        tier,
        userId,
      },
    },
  });
  
  return {
    sessionId: session.id,
    url: session.url!,
  };
}

/**
 * Create a customer portal session
 */
export async function createPortalSession(
  customerId: string
): Promise<string> {
  const client = await getStripe();
  
  const session = await client.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.stripeBaseUrl}/settings/billing`,
  });
  
  return session.url;
}

/**
 * Get subscription by customer ID from Stripe
 */
export async function getStripeSubscription(
  customerId: string
): Promise<any | null> {
  const client = await getStripe();
  
  const subscriptions = await client.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  
  if (subscriptions.data.length === 0) {
    // Check for trialing or past_due subscriptions
    const allSubscriptions = await client.subscriptions.list({
      customer: customerId,
      limit: 10,
    });
    
    const activeSub = allSubscriptions.data.find(
      (sub: any) => sub.status === "trialing" || sub.status === "past_due"
    );
    
    return activeSub || null;
  }
  
  return subscriptions.data[0];
}

/**
 * Cancel a subscription
 */
export async function cancelStripeSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<void> {
  const client = await getStripe();
  
  if (immediately) {
    await client.subscriptions.cancel(subscriptionId);
  } else {
    await client.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    markForCancellation(subscriptionId);
  }
}

/**
 * Reactivate a subscription (cancel scheduled cancellation)
 */
export async function reactivateStripeSubscription(
  subscriptionId: string
): Promise<void> {
  const client = await getStripe();
  
  await client.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
  
  reactivateSubscription(subscriptionId);
}

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Promise<any> {
  const client = await getStripe();
  
  if (!config.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  
  return client.webhooks.constructEvent(
    payload,
    signature,
    config.stripeWebhookSecret
  );
}

/**
 * Handle webhook event
 */
export async function handleWebhookEvent(
  event: any
): Promise<{ handled: boolean; action: string; data?: any }> {
  const client = await getStripe();
  
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const userId = session.metadata?.userId || "";
      const tier = (session.metadata?.tier as PlanTier) || "pro";
      
      // Get subscription details
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      
      // Update database
      activateSubscription(
        userId,
        subscriptionId,
        customerId,
        tier,
        subscription.current_period_start * 1000,
        subscription.current_period_end * 1000
      );
      
      return {
        handled: true,
        action: "subscription.activated",
        data: { userId, customerId, subscriptionId, tier },
      };
    }
    
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      
      const subscriptionId = subscription.id;
      const customerId = subscription.customer as string;
      const status = subscription.status as any;
      const currentPeriodStart = subscription.current_period_start * 1000;
      const currentPeriodEnd = subscription.current_period_end * 1000;
      
      // Update status in database
      updateSubscriptionStatus(
        subscriptionId,
        status,
        currentPeriodStart,
        currentPeriodEnd
      );
      
      // If canceling at period end, mark in database
      if (subscription.cancel_at_period_end) {
        markForCancellation(subscriptionId);
      } else {
        reactivateSubscription(subscriptionId);
      }
      
      return {
        handled: true,
        action: "subscription.updated",
        data: { subscriptionId, customerId, status },
      };
    }
    
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      
      const subscriptionId = subscription.id;
      const customerId = subscription.customer as string;
      
      // Downgrade to free tier
      downgradeToFree(subscriptionId);
      
      return {
        handled: true,
        action: "subscription.canceled",
        data: { subscriptionId, customerId },
      };
    }
    
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      
      const subscriptionId = invoice.subscription as string;
      const customerId = invoice.customer as string;
      
      if (subscriptionId) {
        // Update status to past_due
        updateSubscriptionStatus(subscriptionId, "past_due");
      }
      
      return {
        handled: true,
        action: "payment.failed",
        data: { subscriptionId, customerId, invoiceId: invoice.id },
      };
    }
    
    case "invoice.paid": {
      const invoice = event.data.object;
      
      const subscriptionId = invoice.subscription as string;
      
      if (subscriptionId) {
        // Update status to active
        updateSubscriptionStatus(subscriptionId, "active");
      }
      
      return {
        handled: true,
        action: "payment.succeeded",
        data: { subscriptionId, invoiceId: invoice.id },
      };
    }
    
    default:
      return {
        handled: false,
        action: `event.ignored:${event.type}`,
      };
  }
}

/**
 * Get current subscription status for a user
 */
export async function getSubscriptionStatus(
  userId: string
): Promise<{
  subscription: SubscriptionRecord | null;
  stripeSubscription: any | null;
  isActive: boolean;
  tier: PlanTier;
}> {
  // Get local subscription record
  const subscription = getSubscriptionByCustomerId(userId);
  
  if (!subscription?.stripeCustomerId) {
    return {
      subscription,
      stripeSubscription: null,
      isActive: false,
      tier: "free",
    };
  }
  
  // Get Stripe subscription
  const stripeSubscription = await getStripeSubscription(subscription.stripeCustomerId);
  
  const isActive = stripeSubscription?.status === "active" || 
                   stripeSubscription?.status === "trialing";
  
  return {
    subscription,
    stripeSubscription,
    isActive,
    tier: subscription.tier,
  };
}

/**
 * Check if user has active Pro subscription
 */
export function hasActiveProSubscription(subscription: SubscriptionRecord | null): boolean {
  if (!subscription) return false;
  
  return (
    subscription.status === "active" && 
    subscription.tier === "pro" &&
    subscription.currentPeriodEnd * 1000 > Date.now()
  );
}
