/**
 * Service Authentication Utilities
 * 
 * Provides JWT token generation for service-to-service authentication
 * between MCP-Server and API-Server.
 */

import crypto from 'crypto';

// Token cache to avoid regenerating tokens unnecessarily
interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

// Service claims interface
interface ServiceClaims {
  service: string;
  permissions: string[];
  user_id?: string;
  iat: number;
  exp: number;
}

/**
 * Base64URL encode (without padding)
 */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Create HMAC-SHA256 signature
 */
function createSignature(data: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generate a service token for API-Server authentication
 * 
 * @param service - Service name (e.g., 'agent-server')
 * @param permissions - Array of permissions
 * @param userId - Optional user ID for headless mode
 * @param secret - Service authentication secret
 * @param expirySeconds - Token expiry time in seconds (default: 3600 = 1 hour)
 * @returns JWT token string
 */
export function generateServiceToken(
  service: string,
  permissions: string[],
  userId: string | undefined,
  secret: string,
  expirySeconds: number = 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  
  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  
  // JWT Payload
  const payload: ServiceClaims = {
    service,
    permissions,
    iat: now,
    exp: now + expirySeconds,
  };
  
  // Add user_id if provided (for headless mode)
  if (userId) {
    payload.user_id = userId;
  }
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  // Create signature
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);
  
  // Combine into JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Get or generate a cached service token
 * 
 * Automatically refreshes the token before expiry (with 5 minute buffer)
 * 
 * @param service - Service name
 * @param permissions - Array of permissions
 * @param userId - Optional user ID
 * @param secret - Service authentication secret
 * @returns JWT token string
 */
export function getCachedServiceToken(
  service: string,
  permissions: string[],
  userId: string | undefined,
  secret: string
): string {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  
  // Check if we have a valid cached token
  if (tokenCache && tokenCache.expiresAt > now + bufferMs) {
    return tokenCache.token;
  }
  
  // Generate new token
  const expirySeconds = 3600; // 1 hour
  const token = generateServiceToken(service, permissions, userId, secret);
  
  // Cache the token
  tokenCache = {
    token,
    expiresAt: now + expirySeconds * 1000,
  };
  
  return token;
}

/**
 * Clear the token cache (useful for testing or when secret changes)
 */
export function clearTokenCache(): void {
  tokenCache = null;
}

/**
 * Verify a service token (for testing purposes)
 * 
 * @param token - JWT token to verify
 * @param secret - Service authentication secret
 * @returns Decoded claims or null if invalid
 */
export function verifyServiceToken(token: string, secret: string): ServiceClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);
    if (signature !== expectedSignature) {
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(
      Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    
    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

export default {
  generateServiceToken,
  getCachedServiceToken,
  clearTokenCache,
  verifyServiceToken,
};
