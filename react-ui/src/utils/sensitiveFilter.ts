/**
 * Sensitive Information Filter
 * 
 * Filters sensitive data from objects and strings before logging.
 * Handles:
 * - JWT tokens
 * - Passwords, secrets, API keys
 * - Nested objects
 * - Custom field patterns
 */

// Default sensitive field names
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'api_key',
  'apiKey',
  'api_secret',
  'apiSecret',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'token',
  'auth_token',
  'authToken',
  'authorization',
  'private_key',
  'privateKey',
  'private-key',
  'client_secret',
  'clientSecret',
  'client-secret',
  'credentials',
  'session_id',
  'sessionId',
];

// JWT pattern (header.payload.signature)
const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Bearer token pattern
const BEARER_PATTERN = /^Bearer\s+eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Redaction placeholder
const REDACTED = '[REDACTED]';

// Configuration
export interface SensitiveFilterConfig {
  // Additional sensitive field names
  additionalFields?: string[];
  // Custom patterns to redact
  customPatterns?: RegExp[];
  // Whether to redact JWTs
  redactJWTs?: boolean;
  // Custom redaction placeholder
  redactionPlaceholder?: string;
}

/**
 * Create a sensitive filter with configuration
 */
export function createSensitiveFilter(config: SensitiveFilterConfig = {}) {
  const {
    additionalFields = [],
    customPatterns = [],
    redactJWTs = true,
    redactionPlaceholder = REDACTED,
  } = config;

  // Combine default and additional sensitive fields
  const sensitiveFields = new Set([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...additionalFields,
  ]);

  // Check if a field name is sensitive
  function isSensitiveField(fieldName: string): boolean {
    const lowerName = fieldName.toLowerCase();
    
    // Check exact match
    if (sensitiveFields.has(fieldName) || sensitiveFields.has(lowerName)) {
      return true;
    }

    // Check partial match (e.g., "user_password" contains "password")
    const fieldsArray = Array.from(sensitiveFields);
    for (let i = 0; i < fieldsArray.length; i++) {
      const field = fieldsArray[i];
      if (lowerName.includes(field.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  // Check if a string is a JWT
  function isJWT(value: string): boolean {
    return JWT_PATTERN.test(value.trim());
  }

  // Check if a string is a Bearer token
  function isBearerToken(value: string): boolean {
    return BEARER_PATTERN.test(value.trim());
  }

  // Filter a string value
  function filterString(value: string): string {
    if (redactJWTs) {
      if (isJWT(value)) {
        return redactionPlaceholder;
      }
      if (isBearerToken(value)) {
        return `Bearer ${redactionPlaceholder}`;
      }
    }

    // Apply custom patterns
    for (const pattern of customPatterns) {
      if (pattern.test(value)) {
        return redactionPlaceholder;
      }
    }

    return value;
  }

  // Filter an array
  function filterArray(arr: unknown[]): unknown[] {
    return arr.map(item => filterValue(item));
  }

  // Filter an object
  function filterObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveField(key)) {
        result[key] = redactionPlaceholder;
      } else {
        result[key] = filterValue(value);
      }
    }

    return result;
  }

  // Filter any value
  function filterValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return filterString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return filterArray(value);
    }

    if (typeof value === 'object') {
      return filterObject(value as Record<string, unknown>);
    }

    return value;
  }

  return {
    filter: filterValue,
    filterString,
    filterObject,
    filterArray,
    isSensitiveField,
    isJWT,
    isBearerToken,
  };
}

// Default filter instance
const defaultFilter = createSensitiveFilter();

/**
 * Filter sensitive information from any value
 */
export function filterSensitive<T>(value: T, config?: SensitiveFilterConfig): T {
  if (config) {
    const filter = createSensitiveFilter(config);
    return filter.filter(value) as T;
  }
  return defaultFilter.filter(value) as T;
}

/**
 * Filter sensitive information from a string
 */
export function filterSensitiveString(value: string, config?: SensitiveFilterConfig): string {
  if (config) {
    const filter = createSensitiveFilter(config);
    return filter.filterString(value);
  }
  return defaultFilter.filterString(value);
}

/**
 * Filter sensitive information from an object
 */
export function filterSensitiveObject<T extends Record<string, unknown>>(
  obj: T,
  config?: SensitiveFilterConfig
): T {
  if (config) {
    const filter = createSensitiveFilter(config);
    return filter.filterObject(obj) as T;
  }
  return defaultFilter.filterObject(obj) as T;
}

/**
 * Check if a field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  return defaultFilter.isSensitiveField(fieldName);
}

/**
 * Check if a string is a JWT
 */
export function isJWT(value: string): boolean {
  return defaultFilter.isJWT(value);
}

/**
 * Check if a string is a Bearer token
 */
export function isBearerToken(value: string): boolean {
  return defaultFilter.isBearerToken(value);
}

export default {
  filterSensitive,
  filterSensitiveString,
  filterSensitiveObject,
  isSensitiveField,
  isJWT,
  isBearerToken,
  createSensitiveFilter,
};
