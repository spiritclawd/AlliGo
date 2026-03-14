/**
 * AlliGo - Auth Module
 * Export all auth-related types and functions
 */

// User model types and functions
export {
  type User,
  type Session,
  type UserApiKey,
  type SafeUser,
  type UserTier,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  generateUserId,
  generateSessionId,
  generateApiKeyId,
  isValidEmail,
  isStrongPassword,
  validateRegistration,
  toSafeUser,
  getDefaultPermissionsForTier,
  getRateLimitForTier,
} from "./user";

// Auth database functions
export {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByStripeCustomerId,
  updateUser,
  deleteUser,
  createSession,
  getSessionByToken,
  getSessionsByUserId,
  deleteSession,
  deleteAllUserSessions,
  cleanupExpiredSessions,
  createApiKey,
  getApiKeyByKey,
  getApiKeysByUserId,
  getApiKeyById,
  revokeApiKey,
  deleteApiKey,
  updateApiKeyLastUsed,
} from "./db";

// Auth middleware functions
export {
  type AuthContext,
  type AuthResult,
  requireAuth,
  optionalAuth,
  rateLimitAuth,
  rateLimitGeneral,
  hasPermission,
  requirePermission,
  checkRateLimit,
  getClientId,
  getUserAgent,
  getAuthToken,
  getApiKeyFromHeaders,
  handleCorsPreflight,
  AUTH_CORS_HEADERS,
} from "./middleware";

// Auth routes
export { handleAuthRoute, AUTH_ROUTES } from "./routes";
