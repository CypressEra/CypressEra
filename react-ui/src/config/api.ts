/**
 * API Configuration
 * 
 * This module provides a centralized way to access the API base URL
 * which is injected at runtime via the EJS template (server.js).
 * 
 * The API_BASE_URL is set at runtime, allowing different configurations
 * for development, staging, and production environments without rebuilding.
 */

// Get the API base URL from the window object (injected by server.js)
// Falls back to localhost:8080 if not set
export const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8080';

// WebSocket base URL (derived from API_BASE_URL or configurable via env)
export const WS_BASE_URL = (() => {
  const apiUrl = API_BASE_URL;
  // Convert http/https to ws/wss
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace('https://', 'wss://');
  }
  if (apiUrl.startsWith('http://')) {
    return apiUrl.replace('http://', 'ws://');
  }
  // Default fallback
  return 'ws://localhost:8080';
})();

// API request timeout (ms)
export const API_TIMEOUT = 30000;

// WebSocket configuration
export const WS_CONFIG = {
  // Heartbeat interval in milliseconds (default: 5 seconds)
  heartbeatInterval: parseInt(process.env.REACT_APP_WS_HEARTBEAT_INTERVAL || '5000', 10),
  // Maximum reconnection attempts (0 = unlimited)
  maxReconnectAttempts: parseInt(process.env.REACT_APP_WS_MAX_RECONNECT_ATTEMPTS || '10', 10),
  // Initial reconnection delay in milliseconds
  initialReconnectDelay: parseInt(process.env.REACT_APP_WS_INITIAL_RECONNECT_DELAY || '1000', 10),
  // Maximum reconnection delay in milliseconds
  maxReconnectDelay: parseInt(process.env.REACT_APP_WS_MAX_RECONNECT_DELAY || '30000', 10),
  // Enable/disable WebSocket (can be overridden via env)
  enabled: process.env.REACT_APP_WS_ENABLED !== 'false',
};

/**
 * Simple API client with common HTTP methods
 */
export const apiClient = {
  /**
   * Performs a GET request
   * @param endpoint - API endpoint (e.g., '/api/users')
   * @param options - Additional fetch options
   */
  get: async (endpoint: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
    return response.json();
  },

  /**
   * Performs a POST request
   * @param endpoint - API endpoint (e.g., '/api/users')
   * @param data - Data to send in the request body
   * @param options - Additional fetch options
   * 
   * Uses text/plain content-type to avoid CORS preflight (OPTIONS) requests
   */
  post: async (endpoint: string, data: any, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...options?.headers,
      },
      body: JSON.stringify(data),
      ...options,
    });
    return response.json();
  },

  /**
   * Performs a PUT request
   * @param endpoint - API endpoint (e.g., '/api/users/1')
   * @param data - Data to send in the request body
   * @param options - Additional fetch options
   */
  put: async (endpoint: string, data: any, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify(data),
      ...options,
    });
    return response.json();
  },

  /**
   * Performs a DELETE request
   * @param endpoint - API endpoint (e.g., '/api/users/1')
   * @param options - Additional fetch options
   */
  delete: async (endpoint: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
    return response.json();
  },
};

/**
 * Example usage:
 * 
 * import { apiClient, API_BASE_URL } from './config/api';
 * 
 * // Using the apiClient
 * const users = await apiClient.get('/api/users');
 * const newUser = await apiClient.post('/api/users', { name: 'John' });
 * 
 * // Direct fetch with API_BASE_URL
 * fetch(`${API_BASE_URL}/api/custom-endpoint`)
 *   .then(res => res.json())
 *   .then(data => console.log(data));
 */