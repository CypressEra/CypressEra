/**
 * Session Manager
 * 
 * Manages session state and persistence
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { SDK_EVENTS } from '../types/index.js';

export class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessionId = null;
    this.sessionData = {};
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId) {
    const oldSessionId = this.sessionId;
    this.sessionId = sessionId;
    
    console.log('[XFlow:Session] ℹ️ Session changed:', sessionId);
    this.emit(SDK_EVENTS.SESSION_CHANGED, {
      sessionId,
      oldSessionId,
    });
  }

  /**
   * Clear session
   */
  clearSession() {
    this.sessionId = null;
    this.sessionData = {};
    
    console.log('[XFlow:Session] ℹ️ Session cleared');
    this.emit(SDK_EVENTS.SESSION_CLEARED);
  }

  /**
   * Check if session exists
   */
  hasSession() {
    return this.sessionId !== null;
  }

  /**
   * Store session data
   */
  setData(key, value) {
    this.sessionData[key] = value;
  }

  /**
   * Get session data
   */
  getData(key) {
    return this.sessionData[key];
  }

  /**
   * Clear session data
   */
  clearData() {
    this.sessionData = {};
  }

  /**
   * Get all session data
   */
  getAllData() {
    return { ...this.sessionData };
  }

  /**
   * Save session to localStorage (optional)
   */
  saveToLocalStorage(key = 'xflow_session') {
    try {
      const data = {
        sessionId: this.sessionId,
        sessionData: this.sessionData,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log('[XFlow:Session] 🔍 Session saved to localStorage');
    } catch (error) {
      console.warn('[XFlow:Session] ⚠️ Failed to save session to localStorage:', error);
    }
  }

  /**
   * Load session from localStorage (optional)
   */
  loadFromLocalStorage(key = 'xflow_session') {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        this.sessionId = parsed.sessionId;
        this.sessionData = parsed.sessionData || {};
        console.log('[XFlow:Session] 🔍 Session loaded from localStorage');
        return true;
      }
    } catch (error) {
      console.warn('[XFlow:Session] ⚠️ Failed to load session from localStorage:', error);
    }
    return false;
  }

  /**
   * Clear localStorage
   */
  clearLocalStorage(key = 'xflow_session') {
    try {
      localStorage.removeItem(key);
      console.log('[XFlow:Session] 🔍 Session cleared from localStorage');
    } catch (error) {
      console.warn('[XFlow:Session] ⚠️ Failed to clear localStorage:', error);
    }
  }
}