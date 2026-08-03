/**
 * Edit Service
 * 
 * Handles network element editing operations
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { ValidationError, SessionError } from '../utils/errors.js';
import { SDK_EVENTS, API_ENDPOINTS } from '../types/index.js';

// Valid element types
export const ELEMENT_TYPES = {
  BUS: 'bus',
  LOAD: 'load',
  GENERATOR: 'generator',
  ACLINE: 'acline',
  TRANSFORMER: 'transformer',
  FIXSHUNT: 'fixshunt',
  SWSHUNT: 'swshunt',
};

// Valid actions
export const EDIT_ACTIONS = {
  ADD: 'add',
  MODIFY: 'modify',
  DELETE: 'delete',
};

export class EditService extends EventEmitter {
  constructor(httpClient, sessionManager) {
    super();
    this.http = httpClient;
    this.session = sessionManager;
  }

  /**
   * Edit a network element
   */
  async editElement(elementType, action, options = {}) {
    console.log(`[XFlow:EditService] 🚀 editElement called:`, {
      elementType,
      action,
      options: {
        ...options,
        data: options.data ? '[data present]' : undefined,
        identifier: options.identifier
      }
    });
    
    // Validate element type
    const validTypes = Object.values(ELEMENT_TYPES);
    if (!validTypes.includes(elementType)) {
      console.error(`[XFlow:EditService] ❌ Invalid element type: ${elementType}`);
      throw new ValidationError(
        `Invalid element type: ${elementType}. Valid types: ${validTypes.join(', ')}`
      );
    }

    // Validate action
    const validActions = Object.values(EDIT_ACTIONS);
    if (!validActions.includes(action)) {
      console.error(`[XFlow:EditService] ❌ Invalid action: ${action}`);
      throw new ValidationError(
        `Invalid action: ${action}. Valid actions: ${validActions.join(', ')}`
      );
    }

    // Get session ID
    const sessionId = options.sessionId || this.session.getSessionId();
    console.log(`[XFlow:EditService] 📋 Session ID:`, sessionId);
    if (!sessionId) {
      console.error(`[XFlow:EditService] ❌ No session ID found`);
      throw new SessionError('No session ID. Create a session first.');
    }

    // Validate required fields
    if (action === EDIT_ACTIONS.ADD && !options.data) {
      console.error(`[XFlow:EditService] ❌ Missing data for add action`);
      throw new ValidationError('data is required for add action');
    }

    if (action === EDIT_ACTIONS.MODIFY && (!options.identifier || !options.data)) {
      console.error(`[XFlow:EditService] ❌ Missing identifier or data for modify:`, {
        hasIdentifier: !!options.identifier,
        hasData: !!options.data,
        identifier: options.identifier,
        data: options.data
      });
      throw new ValidationError('identifier and data are required for modify action');
    }

    if (action === EDIT_ACTIONS.DELETE && !options.identifier) {
      console.error(`[XFlow:EditService] ❌ Missing identifier for delete action`);
      throw new ValidationError('identifier is required for delete action');
    }

    console.log(`[XFlow:EditService] ✅ Validation passed, proceeding to HTTP request`);
    console.log(`[XFlow:EditService] ℹ️ Editing ${elementType}: ${action}`);
    this.emit(SDK_EVENTS.EDIT_START, { elementType, action, sessionId });

    try {
      // Prepare request
      const requestData = {
        session_id: sessionId,
        element_type: elementType,
        action: action,
      };

      // Add optional fields
      if (options.data) {
        requestData.data = options.data;
      }

      if (options.identifier) {
        requestData.identifier = options.identifier;
      }

      // Send request
      console.log(`[XFlow:EditService] 📤 Sending ${action} request to API:`, {
        endpoint: API_ENDPOINTS.SESSION_EDIT,
        requestData: requestData
      });
      
      const result = await this.http.post(API_ENDPOINTS.SESSION_EDIT, requestData);

      console.log(`[XFlow:EditService] ✅ Edit complete: ${elementType} ${action}`, {
        result: result
      });
      this.emit(SDK_EVENTS.EDIT_COMPLETE, {
        elementType,
        action,
        result,
      });

      return result;
    } catch (error) {
      console.error('[XFlow:EditService] ❌ Edit failed:', {
        elementType,
        action,
        error: error.message,
        errorDetails: error
      });
      this.emit(SDK_EVENTS.EDIT_ERROR, { elementType, action, error });
      
      if (error instanceof ValidationError || error instanceof SessionError) {
        throw error;
      }
      throw new ValidationError(error.message, { originalError: error, elementType, action });
    }
  }

  /**
   * Add a network element
   */
  async addElement(elementType, data, options = {}) {
    return this.editElement(elementType, EDIT_ACTIONS.ADD, {
      ...options,
      data,
    });
  }

  /**
   * Modify a network element
   */
  async modifyElement(elementType, identifier, data, options = {}) {
    return this.editElement(elementType, EDIT_ACTIONS.MODIFY, {
      ...options,
      identifier,
      data,
    });
  }

  /**
   * Delete a network element
   */
  async deleteElement(elementType, identifier, options = {}) {
    return this.editElement(elementType, EDIT_ACTIONS.DELETE, {
      ...options,
      identifier,
    });
  }

  /**
   * Add a bus
   */
  async addBus(busData, options = {}) {
    return this.addElement(ELEMENT_TYPES.BUS, busData, options);
  }

  /**
   * Modify a bus
   */
  async modifyBus(identifier, busData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.BUS, identifier, busData, options);
  }

  /**
   * Delete a bus
   */
  async deleteBus(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.BUS, identifier, options);
  }

  /**
   * Add a load
   */
  async addLoad(loadData, options = {}) {
    return this.addElement(ELEMENT_TYPES.LOAD, loadData, options);
  }

  /**
   * Modify a load
   */
  async modifyLoad(identifier, loadData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.LOAD, identifier, loadData, options);
  }

  /**
   * Delete a load
   */
  async deleteLoad(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.LOAD, identifier, options);
  }

  /**
   * Add a generator
   */
  async addGenerator(generatorData, options = {}) {
    return this.addElement(ELEMENT_TYPES.GENERATOR, generatorData, options);
  }

  /**
   * Modify a generator
   */
  async modifyGenerator(identifier, generatorData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.GENERATOR, identifier, generatorData, options);
  }

  /**
   * Delete a generator
   */
  async deleteGenerator(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.GENERATOR, identifier, options);
  }

  /**
   * Add an AC line
   */
  async addAcline(aclineData, options = {}) {
    return this.addElement(ELEMENT_TYPES.ACLINE, aclineData, options);
  }

  /**
   * Modify an AC line
   */
  async modifyAcline(identifier, aclineData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.ACLINE, identifier, aclineData, options);
  }

  /**
   * Delete an AC line
   */
  async deleteAcline(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.ACLINE, identifier, options);
  }

  /**
   * Add a transformer
   */
  async addTransformer(transformerData, options = {}) {
    return this.addElement(ELEMENT_TYPES.TRANSFORMER, transformerData, options);
  }

  /**
   * Modify a transformer
   */
  async modifyTransformer(identifier, transformerData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.TRANSFORMER, identifier, transformerData, options);
  }

  /**
   * Delete a transformer
   */
  async deleteTransformer(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.TRANSFORMER, identifier, options);
  }

  /**
   * Add a fixed shunt
   */
  async addFixshunt(fixshuntData, options = {}) {
    return this.addElement(ELEMENT_TYPES.FIXSHUNT, fixshuntData, options);
  }

  /**
   * Modify a fixed shunt
   */
  async modifyFixshunt(identifier, fixshuntData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.FIXSHUNT, identifier, fixshuntData, options);
  }

  /**
   * Delete a fixed shunt
   */
  async deleteFixshunt(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.FIXSHUNT, identifier, options);
  }

  /**
   * Add a switched shunt
   */
  async addSwshunt(swshuntData, options = {}) {
    return this.addElement(ELEMENT_TYPES.SWSHUNT, swshuntData, options);
  }

  /**
   * Modify a switched shunt
   */
  async modifySwshunt(identifier, swshuntData, options = {}) {
    return this.modifyElement(ELEMENT_TYPES.SWSHUNT, identifier, swshuntData, options);
  }

  /**
   * Delete a switched shunt
   */
  async deleteSwshunt(identifier, options = {}) {
    return this.deleteElement(ELEMENT_TYPES.SWSHUNT, identifier, options);
  }
}
