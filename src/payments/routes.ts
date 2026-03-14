/**
 * AlliGo - Payment Routes
 * API endpoints for payment processing
 */

import {
  getStripe,
  isStripeConfigured,
  createCustomer,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  handleWebhookEvent,
  getSubscriptionStatus,
  hasActiveProSubscription,
} from "./stripe";
import {
  getSubscriptionByUserId,
  getOrCreateSubscription,
  type SubscriptionRecord,
} from "./db";
import { PLANS, type PlanTier } from "./plans";
import { config } from "../config";

// Security headers for responses
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
};

/**
 * JSON response helper
 */
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Error response helper
 */
function error(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

/**
 * Get authenticated user ID from request
 * In a real app, this would validate the auth token
 */
function getUserId(req: Request): string | null {
  // Check Authorization header
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    // In production, validate JWT here
    return auth.slice(7);
  }
  
  // Check for test header
  const testUserId = req.headers.get("X-User-Id");
  if (testUserId) {
    return testUserId;
  }
  
  // Check query param for webhook callbacks
  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  if (userIdParam) {
    return userIdParam;
  }
  
  return null;
}

/**
 * POST /api/payments/create-checkout-session
 * Create a Stripe checkout session for Pro subscription
 */
export async function handleCreateCheckoutSession(req: Request): Promise<Response> {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return error("Payment processing is not configured", 503);
    }
    
    // Get user ID
    const userId = getUserId(req);
    if (!userId) {
      return error("Unauthorized - user ID required", 401);
    }
    
    // Parse request body
    let body: { email?: string; name?: string; tier?: "pro" } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }
    
    const email = body.email;
    if (!email) {
      return error("Email is required", 400);
    }
    
    // Get or create local subscription record
    const subscription = getOrCreateSubscription(userId);
    
    // Get or create Stripe customer
    let customerId = subscription.stripeCustomerId;
    
    if (!customerId) {
      customerId = await createCustomer(email, body.name, userId);
    }
    
    // Create checkout session
    const tier = body.tier || "pro";
    const session = await createCheckoutSession(customerId, userId, tier);
    
    return json({
      success: true,
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (err: any) {
    console.error("Error creating checkout session:", err);
    return error(err.message || "Failed to create checkout session", 500);
  }
}

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 */
export async function handleWebhook(req: Request): Promise<Response> {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return error("Payment processing is not configured", 503);
    }
    
    // Get raw body
    const payload = await req.text();
    
    // Get signature from header
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return error("Missing stripe-signature header", 400);
    }
    
    // Verify webhook signature
    let event: any;
    try {
      event = verifyWebhookSignature(payload, signature);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return error("Invalid signature", 400);
    }
    
    // Handle the event
    const result = await handleWebhookEvent(event);
    
    console.log(`Webhook ${event.type}: ${result.action}`);
    
    return json({
      success: true,
      received: true,
      handled: result.handled,
      action: result.action,
    });
  } catch (err: any) {
    console.error("Error handling webhook:", err);
    return error(err.message || "Webhook processing failed", 500);
  }
}

/**
 * GET /api/payments/subscription
 * Get current subscription for authenticated user
 */
export async function handleGetSubscription(req: Request): Promise<Response> {
  try {
    // Get user ID
    const userId = getUserId(req);
    if (!userId) {
      return error("Unauthorized - user ID required", 401);
    }
    
    // Get subscription from database
    const subscription = getSubscriptionByUserId(userId);
    
    if (!subscription) {
      return json({
        success: true,
        subscription: null,
        tier: "free",
        plan: PLANS.free,
        isActive: false,
      });
    }
    
    // Check if Pro is active
    const isActive = hasActiveProSubscription(subscription);
    
    return json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        tier: subscription.tier,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: PLANS[subscription.tier],
      isActive,
    });
  } catch (err: any) {
    console.error("Error getting subscription:", err);
    return error(err.message || "Failed to get subscription", 500);
  }
}

/**
 * POST /api/payments/portal
 * Create a customer portal session
 */
export async function handleCreatePortalSession(req: Request): Promise<Response> {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return error("Payment processing is not configured", 503);
    }
    
    // Get user ID
    const userId = getUserId(req);
    if (!userId) {
      return error("Unauthorized - user ID required", 401);
    }
    
    // Get subscription
    const subscription = getSubscriptionByUserId(userId);
    
    if (!subscription?.stripeCustomerId) {
      return error("No active subscription found", 404);
    }
    
    // Create portal session
    const portalUrl = await createPortalSession(subscription.stripeCustomerId);
    
    return json({
      success: true,
      url: portalUrl,
    });
  } catch (err: any) {
    console.error("Error creating portal session:", err);
    return error(err.message || "Failed to create portal session", 500);
  }
}

/**
 * GET /api/payments/success
 * Success redirect after checkout
 */
export function handleCheckoutSuccess(req: Request): Response {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");
  
  // Return HTML success page
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - AlliGo</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { opacity: 0.9; margin-bottom: 1.5rem; }
    a {
      display: inline-block;
      padding: 12px 24px;
      background: white;
      color: #764ba2;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎉 Payment Successful!</h1>
    <p>Your Pro subscription is now active. You can access all Pro features.</p>
    <p>Session ID: ${sessionId || 'N/A'}</p>
    <a href="/">Return to Dashboard</a>
  </div>
</body>
</html>
  `;
  
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * GET /api/payments/cancel
 * Cancel redirect from checkout
 */
export function handleCheckoutCancel(): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Cancelled - AlliGo</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { opacity: 0.9; margin-bottom: 1.5rem; }
    a {
      display: inline-block;
      padding: 12px 24px;
      background: white;
      color: #764ba2;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Payment Cancelled</h1>
    <p>Your payment was cancelled. No charges were made.</p>
    <a href="/">Return to Dashboard</a>
    <a href="/api/payments/create-checkout-session">Try Again</a>
  </div>
</body>
</html>
  `;
  
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * GET /api/payments/plans
 * Get available plans
 */
export function handleGetPlans(): Response {
  return json({
    success: true,
    plans: Object.entries(PLANS).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      price: plan.price,
      priceId: plan.priceId,
      requestsPerDay: plan.requestsPerDay,
      features: plan.features,
    })),
  });
}

/**
 * Payment routes router
 */
export async function handlePaymentRoutes(
  path: string,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/payments/create-checkout-session
  if (path === "/api/payments/create-checkout-session" && method === "POST") {
    return handleCreateCheckoutSession(req);
  }
  
  // POST /api/payments/webhook
  if (path === "/api/payments/webhook" && method === "POST") {
    return handleWebhook(req);
  }
  
  // GET /api/payments/subscription
  if (path === "/api/payments/subscription" && method === "GET") {
    return handleGetSubscription(req);
  }
  
  // POST /api/payments/portal
  if (path === "/api/payments/portal" && method === "POST") {
    return handleCreatePortalSession(req);
  }
  
  // GET /api/payments/success
  if (path === "/api/payments/success" && method === "GET") {
    return handleCheckoutSuccess(req);
  }
  
  // GET /api/payments/cancel
  if (path === "/api/payments/cancel" && method === "GET") {
    return handleCheckoutCancel();
  }
  
  // GET /api/payments/plans
  if (path === "/api/payments/plans" && method === "GET") {
    return handleGetPlans();
  }
  
  // Not a payment route
  return null;
}
