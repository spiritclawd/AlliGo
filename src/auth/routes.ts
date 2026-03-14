/**
 * AlliGo - Auth Routes
 * Authentication and API key management endpoints
 */

import {
  hashPassword,
  verifyPassword,
  validateRegistration,
  toSafeUser,
  getRateLimitForTier,
} from "./user";
import {
  createUser,
  getUserByEmail,
  updateUser,
  createSession,
  getSessionByToken,
  deleteSession,
  deleteAllUserSessions,
  getSessionsByUserId,
  createApiKey,
  getApiKeysByUserId,
  revokeApiKey,
  deleteApiKey,
} from "./db";
import {
  requireAuth,
  rateLimitAuth,
  getClientId,
  getUserAgent,
  getAuthToken,
  handleCorsPreflight,
  AUTH_CORS_HEADERS,
  type AuthContext,
} from "./middleware";

// ==================== RESPONSE HELPERS ====================

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...AUTH_CORS_HEADERS,
    },
  });
}

function success(data: any): Response {
  return json({ success: true, ...data });
}

function error(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

function unauthorized(message = "Authentication required"): Response {
  return json({ success: false, error: message }, 401);
}

// ==================== ROUTE HANDLERS ====================

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function handleRegister(req: Request): Promise<Response> {
  // Rate limit
  const rateLimitResponse = rateLimitAuth(req);
  if (rateLimitResponse) return rateLimitResponse;
  
  try {
    const body = await req.json();
    const { email, password, name } = body;
    
    // Validate input
    const validation = validateRegistration({ email, password, name });
    if (!validation.valid) {
      return error(validation.errors.join("; "), 400);
    }
    
    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return error("Email already registered", 409);
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user
    const user = createUser(email, passwordHash, name);
    
    // Create session
    const userAgent = getUserAgent(req);
    const clientId = getClientId(req);
    const session = createSession(user.id, userAgent, clientId);
    
    // Update last login
    updateUser(user.id, { lastLogin: Date.now() });
    
    return success({
      message: "Registration successful",
      user: toSafeUser(user),
      token: session.token,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  } catch (e: any) {
    console.error("Registration error:", e);
    return error("Registration failed. Please try again.", 500);
  }
}

/**
 * POST /api/auth/login
 * Login with email/password
 */
export async function handleLogin(req: Request): Promise<Response> {
  // Rate limit
  const rateLimitResponse = rateLimitAuth(req);
  if (rateLimitResponse) return rateLimitResponse;
  
  try {
    const body = await req.json();
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      return error("Email and password are required", 400);
    }
    
    // Find user
    const user = getUserByEmail(email);
    if (!user) {
      return error("Invalid email or password", 401);
    }
    
    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return error("Invalid email or password", 401);
    }
    
    // Create session
    const userAgent = getUserAgent(req);
    const clientId = getClientId(req);
    const session = createSession(user.id, userAgent, clientId);
    
    // Update last login
    updateUser(user.id, { lastLogin: Date.now() });
    
    return success({
      message: "Login successful",
      user: toSafeUser(user),
      token: session.token,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  } catch (e: any) {
    console.error("Login error:", e);
    return error("Login failed. Please try again.", 500);
  }
}

/**
 * POST /api/auth/logout
 * Logout current session
 */
export async function handleLogout(req: Request): Promise<Response> {
  const token = getAuthToken(req);
  
  if (token) {
    deleteSession(token);
  }
  
  return success({ message: "Logged out successfully" });
}

/**
 * POST /api/auth/logout-all
 * Logout all sessions
 */
export async function handleLogoutAll(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const userId = authResult.context!.user.id;
  const count = deleteAllUserSessions(userId);
  
  return success({
    message: "Logged out from all sessions",
    sessionsTerminated: count,
  });
}

/**
 * GET /api/auth/me
 * Get current user info
 */
export async function handleGetCurrentUser(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const context = authResult.context!;
  
  // Get user's sessions
  const sessions = getSessionsByUserId(context.user.id).map(s => ({
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
  }));
  
  return success({
    user: context.user,
    sessions,
    currentSession: context.session,
  });
}

/**
 * GET /api/auth/sessions
 * List all active sessions
 */
export async function handleListSessions(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const sessions = getSessionsByUserId(authResult.context!.user.id);
  
  return success({
    sessions: sessions.map(s => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
    })),
  });
}

/**
 * POST /api/auth/api-keys
 * Generate new API key
 */
export async function handleCreateApiKey(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const context = authResult.context!;
  
  try {
    const body = await req.json();
    const { name, permissions = "read" } = body;
    
    if (!name || typeof name !== "string" || name.length > 100) {
      return error("API key name is required (max 100 characters)", 400);
    }
    
    // Validate permissions
    const validPermissions = ["read", "write", "admin"];
    if (!validPermissions.includes(permissions)) {
      return error(`Invalid permissions. Must be one of: ${validPermissions.join(", ")}`, 400);
    }
    
    // Check if user tier allows creating API keys with these permissions
    if (permissions === "admin" && context.user.tier !== "enterprise") {
      return error("Admin permissions require enterprise tier", 403);
    }
    if (permissions === "write" && context.user.tier === "free") {
      return error("Write permissions require pro or enterprise tier", 403);
    }
    
    // Create API key
    const apiKey = createApiKey(context.user.id, name, permissions);
    
    return success({
      message: "API key created successfully",
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Only show full key on creation
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (e: any) {
    console.error("Create API key error:", e);
    return error("Failed to create API key", 500);
  }
}

/**
 * GET /api/auth/api-keys
 * List user's API keys
 */
export async function handleListApiKeys(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const apiKeys = getApiKeysByUserId(authResult.context!.user.id);
  
  // Mask the keys for security
  const maskedKeys = apiKeys.map(k => ({
    id: k.id,
    name: k.name,
    key: k.key.substring(0, 15) + "..." + k.key.substring(k.key.length - 4),
    permissions: k.permissions,
    createdAt: k.createdAt,
    lastUsed: k.lastUsed,
    active: k.active,
  }));
  
  return success({
    apiKeys: maskedKeys,
  });
}

/**
 * DELETE /api/auth/api-keys/:id
 * Revoke an API key
 */
export async function handleRevokeApiKey(req: Request, keyId: string): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const userId = authResult.context!.user.id;
  const deleted = deleteApiKey(keyId, userId);
  
  if (!deleted) {
    return error("API key not found", 404);
  }
  
  return success({ message: "API key revoked successfully" });
}

/**
 * PUT /api/auth/profile
 * Update user profile
 */
export async function handleUpdateProfile(req: Request): Promise<Response> {
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const userId = authResult.context!.user.id;
  
  try {
    const body = await req.json();
    const { name, email } = body;
    
    const updates: { name?: string; email?: string } = {};
    
    if (name !== undefined) {
      if (typeof name !== "string" || name.length > 100) {
        return error("Name must be a string (max 100 characters)", 400);
      }
      updates.name = name;
    }
    
    if (email !== undefined) {
      if (typeof email !== "string" || !email.includes("@")) {
        return error("Invalid email format", 400);
      }
      // Check if email is already taken
      const existingUser = getUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return error("Email already in use", 409);
      }
      updates.email = email.toLowerCase();
    }
    
    if (Object.keys(updates).length === 0) {
      return error("No valid updates provided", 400);
    }
    
    updateUser(userId, updates);
    
    // Get updated user
    const { getUserById } = await import("./db");
    const user = getUserById(userId);
    
    return success({
      message: "Profile updated successfully",
      user: user ? toSafeUser(user) : null,
    });
  } catch (e: any) {
    console.error("Update profile error:", e);
    return error("Failed to update profile", 500);
  }
}

/**
 * POST /api/auth/change-password
 * Change user password
 */
export async function handleChangePassword(req: Request): Promise<Response> {
  // Rate limit
  const rateLimitResponse = rateLimitAuth(req);
  if (rateLimitResponse) return rateLimitResponse;
  
  // Require auth
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    return authResult.response!;
  }
  
  const userId = authResult.context!.user.id;
  
  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;
    
    if (!currentPassword || !newPassword) {
      return error("Current password and new password are required", 400);
    }
    
    // Get user with password hash
    const { getUserById } = await import("./db");
    const user = getUserById(userId);
    if (!user) {
      return error("User not found", 404);
    }
    
    // Verify current password
    const validPassword = await verifyPassword(currentPassword, user.passwordHash);
    if (!validPassword) {
      return error("Current password is incorrect", 401);
    }
    
    // Validate new password
    const { isStrongPassword } = await import("./user");
    const passwordCheck = isStrongPassword(newPassword);
    if (!passwordCheck.valid) {
      return error(passwordCheck.errors.join("; "), 400);
    }
    
    // Hash and update password
    const newPasswordHash = await hashPassword(newPassword);
    updateUser(userId, { passwordHash: newPasswordHash });
    
    return success({ message: "Password changed successfully" });
  } catch (e: any) {
    console.error("Change password error:", e);
    return error("Failed to change password", 500);
  }
}

// ==================== ROUTER ====================

/**
 * Handle auth routes
 */
export async function handleAuthRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  
  // Handle CORS preflight
  if (method === "OPTIONS") {
    return handleCorsPreflight();
  }
  
  // Route matching
  if (path === "/api/auth/register" && method === "POST") {
    return handleRegister(req);
  }
  
  if (path === "/api/auth/login" && method === "POST") {
    return handleLogin(req);
  }
  
  if (path === "/api/auth/logout" && method === "POST") {
    return handleLogout(req);
  }
  
  if (path === "/api/auth/logout-all" && method === "POST") {
    return handleLogoutAll(req);
  }
  
  if (path === "/api/auth/me" && method === "GET") {
    return handleGetCurrentUser(req);
  }
  
  if (path === "/api/auth/sessions" && method === "GET") {
    return handleListSessions(req);
  }
  
  if (path === "/api/auth/api-keys" && method === "POST") {
    return handleCreateApiKey(req);
  }
  
  if (path === "/api/auth/api-keys" && method === "GET") {
    return handleListApiKeys(req);
  }
  
  // Handle DELETE /api/auth/api-keys/:id
  const revokeMatch = path.match(/^\/api\/auth\/api-keys\/([^/]+)$/);
  if (revokeMatch && method === "DELETE") {
    return handleRevokeApiKey(req, revokeMatch[1]);
  }
  
  if (path === "/api/auth/profile" && method === "PUT") {
    return handleUpdateProfile(req);
  }
  
  if (path === "/api/auth/change-password" && method === "POST") {
    return handleChangePassword(req);
  }
  
  // Not found
  return error("Auth endpoint not found", 404);
}

// Export route info for API documentation
export const AUTH_ROUTES = {
  "POST /api/auth/register": "Register a new user",
  "POST /api/auth/login": "Login with email/password",
  "POST /api/auth/logout": "Logout current session",
  "POST /api/auth/logout-all": "Logout all sessions (requires auth)",
  "GET /api/auth/me": "Get current user info (requires auth)",
  "GET /api/auth/sessions": "List active sessions (requires auth)",
  "POST /api/auth/api-keys": "Create new API key (requires auth)",
  "GET /api/auth/api-keys": "List user's API keys (requires auth)",
  "DELETE /api/auth/api-keys/:id": "Revoke an API key (requires auth)",
  "PUT /api/auth/profile": "Update user profile (requires auth)",
  "POST /api/auth/change-password": "Change password (requires auth)",
};
