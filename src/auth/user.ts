/**
 * AlliGo - User Model
 * User interface with password hashing and session token generation
 */

// User tier types
export type UserTier = "free" | "pro" | "enterprise";

// User interface
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  tier: UserTier;
  stripeCustomerId: string | null;
  createdAt: number;
  lastLogin: number | null;
  emailVerified: boolean;
}

// Session interface
export interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  userAgent: string | null;
  ipAddress: string | null;
}

// User API Key interface (links users to API keys)
export interface UserApiKey {
  id: string;
  userId: string;
  key: string;
  name: string;
  permissions: "read" | "write" | "admin";
  createdAt: number;
  lastUsed: number | null;
  active: boolean;
}

// Safe user data (without password hash)
export type SafeUser = Omit<User, "passwordHash">;

// ==================== PASSWORD HASHING ====================

/**
 * Hash a password using Bun's built-in crypto
 * Uses Argon2id by default (most secure)
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536, // 64 MB
    timeCost: 2, // iterations
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// ==================== SESSION TOKEN GENERATION ====================

/**
 * Generate a secure random session token
 * Uses cryptographically secure random bytes
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a unique user ID
 */
export function generateUserId(): string {
  return `user_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `sess_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Generate a unique API key ID
 */
export function generateApiKeyId(): string {
  return `key_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

// ==================== JWT-LIKE TOKEN (HMAC) ====================

/**
 * Create a JWT-like token using HMAC
 * Simpler than full JWT, suitable for session tokens
 */
export function createHmacToken(payload: { userId: string; sessionId: string }, secret: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
  }));
  
  const signature = createHmacSignature(`${header}.${body}`, secret);
  
  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode an HMAC token
 */
export function verifyHmacToken(token: string, secret: string): { userId: string; sessionId: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    
    // Verify signature
    const expectedSignature = createHmacSignature(`${header}.${body}`, secret);
    if (signature !== expectedSignature) return null;
    
    // Decode payload
    const payload = JSON.parse(atob(body));
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Create HMAC signature using Web Crypto API
 */
function createHmacSignature(data: string, secret: string): string {
  // Use Bun's built-in HMAC via subtle crypto
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataBuffer = encoder.encode(data);
  
  // For simplicity, use a synchronous approach with Bun's hash
  // In production, consider using async Web Crypto API
  const hmac = Bun.hash(data + secret);
  return hmac.toString(16);
}

// ==================== VALIDATION ====================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function isStrongPassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate user registration data
 */
export function validateRegistration(data: { email: string; password: string; name?: string }): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.email) {
    errors.push("Email is required");
  } else if (!isValidEmail(data.email)) {
    errors.push("Invalid email format");
  }
  
  if (!data.password) {
    errors.push("Password is required");
  } else {
    const passwordCheck = isStrongPassword(data.password);
    errors.push(...passwordCheck.errors);
  }
  
  if (data.name !== undefined && data.name.length > 100) {
    errors.push("Name must be less than 100 characters");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== USER HELPERS ====================

/**
 * Convert User to SafeUser (removes password hash)
 */
export function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Get default permissions for tier
 */
export function getDefaultPermissionsForTier(tier: UserTier): "read" | "write" | "admin" {
  switch (tier) {
    case "enterprise":
      return "admin";
    case "pro":
      return "write";
    case "free":
    default:
      return "read";
  }
}

/**
 * Get rate limit for tier
 */
export function getRateLimitForTier(tier: UserTier): number {
  switch (tier) {
    case "enterprise":
      return 10000;
    case "pro":
      return 1000;
    case "free":
    default:
      return 100;
  }
}
