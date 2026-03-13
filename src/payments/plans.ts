/**
 * AlliGo - Plans Configuration
 * Subscription tiers and pricing
 */

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanConfig {
  name: string;
  price: number | null;
  priceId: string | null;
  requestsPerDay: number;
  features: {
    apiCalls: number;
    agentLookups: number;
    claimsSubmitted: number;
    badges: boolean;
    emailAlerts: boolean;
    webhooks: boolean;
    prioritySupport: boolean;
    exportData: boolean;
    customIntegrations: boolean;
  };
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null,
    requestsPerDay: 100,
    features: {
      apiCalls: 100,
      agentLookups: 50,
      claimsSubmitted: 5,
      badges: true,
      emailAlerts: false,
      webhooks: false,
      prioritySupport: false,
      exportData: false,
      customIntegrations: false,
    },
  },
  pro: {
    name: 'Pro',
    price: 99,
    priceId: 'price_pro_monthly',
    requestsPerDay: 10000,
    features: {
      apiCalls: 10000,
      agentLookups: 5000,
      claimsSubmitted: 100,
      badges: true,
      emailAlerts: true,
      webhooks: true,
      prioritySupport: false,
      exportData: true,
      customIntegrations: false,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: null,
    priceId: null,
    requestsPerDay: Infinity,
    features: {
      apiCalls: 100000,
      agentLookups: 50000,
      claimsSubmitted: 1000,
      badges: true,
      emailAlerts: true,
      webhooks: true,
      prioritySupport: true,
      exportData: true,
      customIntegrations: true,
    },
  },
};

/**
 * Get plan by tier
 */
export function getPlan(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

/**
 * Get plan by Stripe price ID
 */
export function getPlanByPriceId(priceId: string): PlanConfig | null {
  for (const [tier, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) {
      return { ...plan, tier } as PlanConfig & { tier: PlanTier };
    }
  }
  return null;
}

/**
 * Check if user can perform action based on their plan
 */
export function canPerformAction(
  tier: PlanTier,
  action: keyof PlanConfig['features'],
  currentUsage?: number
): boolean {
  const plan = PLANS[tier];
  const limit = plan.features[action];
  
  if (typeof limit === 'boolean') {
    return limit;
  }
  
  if (limit === Infinity) {
    return true;
  }
  
  if (currentUsage !== undefined) {
    return currentUsage < limit;
  }
  
  return true;
}

/**
 * Get remaining requests for the day
 */
export function getRemainingRequests(tier: PlanTier, usedToday: number): number {
  const plan = PLANS[tier];
  if (plan.requestsPerDay === Infinity) {
    return Infinity;
  }
  return Math.max(0, plan.requestsPerDay - usedToday);
}

export default PLANS;
