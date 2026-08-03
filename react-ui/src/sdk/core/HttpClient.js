/**
 * HTTP Client
 * 
 * Handles all HTTP communication with the backend
 */

import { NetworkError } from '../utils/errors.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { attemptWithRefresh } from '../../auth/fetchWithRefresh';

export class HttpClient {
  constructor(baseURL, config = {}) {
    this.baseURL = baseURL;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.accessToken = config.accessToken || null;
  }

  /**
   * Set base URL
   */
  setBaseURL(url) {
    this.baseURL = url;
    console.log('[XFlow:HTTP] 🔍 Base URL updated:', url);
  }

  /**
   * Set bearer token for authenticated requests
   */
  setAccessToken(token) {
    this.accessToken = token || null;
  }

  /**
   * Generic request method.
   *
   * Routes through attemptWithRefresh so a 401 silently triggers a refresh
   * + one retry. The original `xflow:auth:required` event is dispatched only
   * when refresh itself fails (no refresh token, or refresh 401'd).
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const method = options.method || 'GET';

    console.log(`[XFlow:HTTP] 🔍 ${method} ${endpoint}`);

    const buildConfig = (accessToken) => {
      const config = {
        ...options,
        headers: {
          ...options.headers,
        },
      };
      if (accessToken && !config.headers?.Authorization && !config.headers?.authorization) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    };

    try {
      const response = await attemptWithRefresh((accessToken) =>
        fetch(url, buildConfig(accessToken || this.accessToken)),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[XFlow:HTTP] ❌ Request failed: ${response.status}`, errorText);
        throw new NetworkError(
          `HTTP ${response.status}: ${errorText || response.statusText}`,
          { status: response.status, url, errorText },
        );
      }

      return response;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      console.error('[XFlow:HTTP] ❌ Network error:', error);
      throw new NetworkError(
        `Network request failed: ${error.message}`,
        { url, originalError: error },
      );
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'GET',
    });
    return response.json();
  }

  /**
   * POST request with JSON body
   * Uses text/plain content-type to avoid CORS preflight (OPTIONS) requests
   */
  async post(endpoint, data, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  /**
   * POST request that returns a Blob (for file downloads)
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body data
   * @param {object} options - Additional fetch options (e.g., headers for cache validation)
   * @returns {Promise<Blob>} The file as a Blob
   */
  async postBlob(endpoint, data, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    return response.blob();
  }

  /**
   * POST request with FormData
   */
  async postFormData(endpoint, formData, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      // Don't set Content-Type for FormData, browser will set it with boundary
    });
    return response.json();
  }

  /**
   * PUT request
   */
  async put(endpoint, data, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      method: 'DELETE',
    });
    return response.json();
  }

  /**
   * Check if URL is reachable
   */
  async ping(endpoint = '/health') {
    try {
      await this.get(endpoint);
      return true;
    } catch {
      return false;
    }
  }
}