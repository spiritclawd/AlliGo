/**
 * AlliGo - Lead Capture Routes
 * API endpoints for capturing and managing leads
 */

import { createLead, getAllLeads, countLeads, getLeadsBySource, exportLeadsCsv, markLeadConverted, Lead } from "./db";

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function error(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Main handler for lead routes - matches the expected interface in server.ts
 */
export async function handleLeadRoutes(
  req: Request, 
  path: string, 
  adminApiKey: string
): Promise<Response | null> {
  const method = req.method;
  
  // POST /api/leads - Capture email from landing page (public)
  if (path === "/api/leads" && method === "POST") {
    return handleCreateLead(req);
  }
  
  // GET /api/leads - List all leads (admin only)
  if (path === "/api/leads" && method === "GET") {
    return handleListLeads(req, adminApiKey);
  }
  
  // GET /api/leads/stats - Lead statistics
  if (path === "/api/leads/stats" && method === "GET") {
    return handleLeadStats();
  }
  
  // GET /api/leads/export - Export leads as CSV (admin only)
  if (path === "/api/leads/export" && method === "GET") {
    return handleExportLeads(req, adminApiKey);
  }
  
  // POST /api/leads/convert - Mark lead as converted (internal)
  if (path === "/api/leads/convert" && method === "POST") {
    return handleConvertLead(req);
  }
  
  return null; // Not a lead route
}

/**
 * Check admin auth
 */
function checkAdminAuth(req: Request, adminApiKey: string): { valid: boolean; response?: Response } {
  const auth = req.headers.get("Authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  
  if (key !== adminApiKey) {
    return {
      valid: false,
      response: json({ success: false, error: "Unauthorized" }, 401),
    };
  }
  
  return { valid: true };
}

/**
 * POST /api/leads - Capture a new lead
 */
export async function handleCreateLead(req: Request): Promise<Response> {
  try {
    const body = await req.json() as { email: string; name?: string; source?: string; interests?: string };
    
    if (!body.email || !isValidEmail(body.email)) {
      return error("Valid email is required");
    }
    
    const lead = createLead({
      email: body.email,
      name: body.name,
      source: body.source || "landing_page",
      interests: body.interests,
    });
    
    return json({
      success: true,
      message: "Thanks for signing up! We'll be in touch soon.",
      lead: {
        id: lead.id,
        email: lead.email,
        source: lead.source,
      },
    });
  } catch (e) {
    console.error("Error creating lead:", e);
    return error("Failed to create lead", 500);
  }
}

/**
 * GET /api/leads - List all leads (admin only)
 */
export function handleListLeads(req: Request, adminApiKey: string): Response {
  const authCheck = checkAdminAuth(req, adminApiKey);
  if (!authCheck.valid) return authCheck.response!;
  
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  
  const leads = getAllLeads(limit, offset);
  const total = countLeads();
  const bySource = getLeadsBySource();
  
  return json({
    success: true,
    leads,
    total,
    bySource,
    page: Math.floor(offset / limit) + 1,
  });
}

/**
 * GET /api/leads/export - Export leads as CSV (admin only)
 */
export function handleExportLeads(req: Request, adminApiKey: string): Response {
  const authCheck = checkAdminAuth(req, adminApiKey);
  if (!authCheck.valid) return authCheck.response!;
  
  const csv = exportLeadsCsv();
  const timestamp = new Date().toISOString().split("T")[0];
  
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="alligo-leads-${timestamp}.csv"`,
    },
  });
}

/**
 * GET /api/leads/stats - Lead statistics
 */
export function handleLeadStats(): Response {
  const total = countLeads();
  const bySource = getLeadsBySource();
  
  return json({
    success: true,
    stats: {
      total,
      bySource,
    },
  });
}

/**
 * POST /api/leads/convert - Mark lead as converted (internal)
 */
export async function handleConvertLead(req: Request): Promise<Response> {
  try {
    const body = await req.json() as { email: string };
    if (!body.email) {
      return error("Email is required");
    }
    
    markLeadConverted(body.email);
    return json({ success: true, message: "Lead marked as converted" });
  } catch (e) {
    return error("Failed to mark lead as converted", 500);
  }
}

export default {
  handleLeadRoutes,
  handleCreateLead,
  handleListLeads,
  handleExportLeads,
  handleLeadStats,
  handleConvertLead,
};
