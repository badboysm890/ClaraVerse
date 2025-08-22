/**
 * Custom Node Manager - Handles registration and execution of custom nodes
 */

export class CustomNodeManager {
  constructor(logger, enableSandbox = true) {
    this.logger = logger;
    this.enableSandbox = enableSandbox;
    this.customNodes = new Map();
    this.executionCache = new Map();
  }

  /**
   * Register multiple custom nodes
   * @param {Array} nodeDefinitions - Array of custom node definitions
   */
  async registerNodes(nodeDefinitions) {
    for (const nodeDefinition of nodeDefinitions) {
      await this.registerNode(nodeDefinition);
    }
  }

  /**
   * Register a single custom node
   * @param {Object} nodeDefinition - Custom node definition
   */
  async registerNode(nodeDefinition) {
    const { type, name, executionCode } = nodeDefinition;

    if (!type || !name || !executionCode) {
      throw new Error('Custom node must have type, name, and executionCode');
    }

    this.logger.info(`Registering custom node: ${name} (${type})`);

    try {
      // Validate and prepare execution code
      const executor = this.prepareExecutor(executionCode, nodeDefinition);
      
      // Store the node definition and executor
      this.customNodes.set(type, {
        definition: nodeDefinition,
        executor: executor,
        registeredAt: new Date().toISOString()
      });

      this.logger.info(`Successfully registered custom node: ${type}`);

    } catch (error) {
      this.logger.error(`Failed to register custom node ${type}: ${error.message}`);
      throw new Error(`Custom node registration failed: ${error.message}`);
    }
  }

  /**
   * Execute a custom node
   * @param {string} nodeType - Type of the custom node
   * @param {Object} inputs - Input values
   * @param {Object} properties - Node properties
   * @returns {Promise<any>} Execution result
   */
  async executeNode(nodeType, inputs = {}, properties = {}) {
    if (!this.hasNode(nodeType)) {
      throw new Error(`Custom node type '${nodeType}' is not registered`);
    }

    const nodeInfo = this.customNodes.get(nodeType);
    const { definition, executor } = nodeInfo;

    this.logger.debug(`Executing custom node: ${definition.name} (${nodeType})`, { inputs, properties });

    try {
      // Create execution context
      const context = this.createExecutionContext(definition.name);

      // Map inputs according to node definition
      const mappedInputs = this.mapInputs(inputs, definition.inputs || []);

      // Map properties according to node definition
      const mappedProperties = this.mapProperties(properties, definition.properties || []);

      // Execute the custom node
      const result = await executor(mappedInputs, mappedProperties, context);

      // Validate and map outputs
      const mappedResult = this.mapOutputs(result, definition.outputs || []);

      this.logger.debug(`Custom node execution completed: ${definition.name}`, { result: mappedResult });
      return mappedResult;

    } catch (error) {
      this.logger.error(`Custom node execution failed: ${definition.name}`, { error: error.message });
      throw new Error(`Custom node '${definition.name}' execution failed: ${error.message}`);
    }
  }

  /**
   * Prepare executor function from execution code
   * @param {string} executionCode - JavaScript code for the node
   * @param {Object} nodeDefinition - Node definition for validation
   * @returns {Function} Prepared executor function
   */
  prepareExecutor(executionCode, nodeDefinition) {
    try {
      // Extract the execute function from the code
      let cleanCode = executionCode.trim();
      
      // If the code doesn't start with 'async function execute', wrap it
      if (!cleanCode.startsWith('async function execute')) {
        // Look for just the function body
        if (cleanCode.includes('async function execute')) {
          // Code contains the full function
        } else {
          // Assume it's just the function body, wrap it
          cleanCode = `async function execute(inputs, properties, context) {\n${cleanCode}\n}`;
        }
      }

      // Create a safe execution environment
      if (this.enableSandbox) {
        return this.createSandboxedExecutor(cleanCode, nodeDefinition);
      } else {
        return this.createDirectExecutor(cleanCode, nodeDefinition);
      }

    } catch (error) {
      throw new Error(`Failed to prepare executor: ${error.message}`);
    }
  }

  /**
   * Create a sandboxed executor (safer but limited)
   * @param {string} code - Execution code
   * @param {Object} nodeDefinition - Node definition
   * @returns {Function} Sandboxed executor
   */
  createSandboxedExecutor(code, nodeDefinition) {
    // Create a restricted global context
    const sandbox = {
      // Allow basic JavaScript features
      console: {
        log: (...args) => this.logger.debug(`[${nodeDefinition.name}]`, ...args),
        warn: (...args) => this.logger.warn(`[${nodeDefinition.name}]`, ...args),
        error: (...args) => this.logger.error(`[${nodeDefinition.name}]`, ...args),
      },
      JSON: JSON,
      Math: Math,
      Date: Date,
      Number: Number,
      String: String,
      Boolean: Boolean,
      Array: Array,
      Object: Object,
      Promise: Promise,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      // Add common utilities
      btoa: typeof btoa !== 'undefined' ? btoa : undefined,
      atob: typeof atob !== 'undefined' ? atob : undefined,
    };

    // Use Function constructor to create executor in restricted context
    const executorFunction = new Function(
      'sandbox', 
      'inputs', 
      'properties', 
      'context',
      `
      with (sandbox) {
        ${code}
        return execute(inputs, properties, context);
      }
      `
    );

    return async (inputs, properties, context) => {
      return await executorFunction(sandbox, inputs, properties, context);
    };
  }

  /**
   * Create a direct executor (faster but less secure)
   * @param {string} code - Execution code
   * @param {Object} nodeDefinition - Node definition
   * @returns {Function} Direct executor
   */
  createDirectExecutor(code, nodeDefinition) {
    // Create executor function directly
    const executorFunction = new Function(
      'inputs', 
      'properties', 
      'context',
      `
      ${code}
      return execute(inputs, properties, context);
      `
    );

    return async (inputs, properties, context) => {
      return await executorFunction(inputs, properties, context);
    };
  }

  /**
   * Create execution context for custom nodes
   * @param {string} nodeName - Name of the node
   * @returns {Object} Execution context
   */
  createExecutionContext(nodeName) {
    return {
      log: (...args) => {
        this.logger.info(`[${nodeName}]`, ...args);
      },
      warn: (...args) => {
        this.logger.warn(`[${nodeName}]`, ...args);
      },
      error: (...args) => {
        this.logger.error(`[${nodeName}]`, ...args);
      },
      debug: (...args) => {
        this.logger.debug(`[${nodeName}]`, ...args);
      },
      nodeName: nodeName,
      timestamp: Date.now(),
    };
  }

  /**
   * Map input values according to node definition
   * @param {Object} inputs - Raw input values
   * @param {Array} inputDefinitions - Node input definitions
   * @returns {Object} Mapped inputs
   */
  mapInputs(inputs, inputDefinitions) {
    const mapped = {};

    // If no input definitions, return inputs as-is
    if (!inputDefinitions || inputDefinitions.length === 0) {
      return inputs;
    }

    // Map each defined input
    for (const inputDef of inputDefinitions) {
      const { id, name, dataType, defaultValue } = inputDef;
      
      // Try to find value by ID first (for exported flows), then by name
      let value = inputs[id] || inputs[name];

      // Use default if no value provided
      if (value === undefined && defaultValue !== undefined) {
        value = defaultValue;
      }

      // Type conversion
      if (value !== undefined && dataType) {
        value = this.convertDataType(value, dataType);
      }

      // Add both name and lowercase name for compatibility
      mapped[name] = value;
      if (name) {
        mapped[name.toLowerCase()] = value;
      }
    }

    return mapped;
  }

  /**
   * Map property values according to node definition
   * @param {Object} properties - Raw property values
   * @param {Array} propertyDefinitions - Node property definitions
   * @returns {Object} Mapped properties
   */
  mapProperties(properties, propertyDefinitions) {
    const mapped = {};

    // If no property definitions, return properties as-is
    if (!propertyDefinitions || propertyDefinitions.length === 0) {
      return properties;
    }

    // Map each defined property
    for (const propDef of propertyDefinitions) {
      const { name, defaultValue } = propDef;
      let value = properties[name];

      // Use default if no value provided
      if (value === undefined && defaultValue !== undefined) {
        value = defaultValue;
      }

      mapped[name] = value;
    }

    return mapped;
  }

  /**
   * Map output values according to node definition
   * @param {any} result - Raw execution result
   * @param {Array} outputDefinitions - Node output definitions
   * @returns {any} Mapped outputs
   */
  mapOutputs(result, outputDefinitions) {
    // If no output definitions or single output, return result as-is
    if (!outputDefinitions || outputDefinitions.length === 0) {
      return result;
    }

    // If single output definition and result is not an object, wrap it
    if (outputDefinitions.length === 1 && (typeof result !== 'object' || result === null)) {
      return { [outputDefinitions[0].name]: result };
    }

    // If result is an object, map according to definitions
    if (typeof result === 'object' && result !== null) {
      const mapped = {};
      
      for (const outputDef of outputDefinitions) {
        const { id, name, dataType } = outputDef;
        
        // Try multiple ways to find the output value:
        // 1. By exact name
        // 2. By lowercase name (for case-insensitive matching)
        // 3. By ID
        let value = result[name] || 
                   result[name?.toLowerCase()] || 
                   result[id] ||
                   // Try all case variations
                   Object.keys(result).find(key => 
                     key.toLowerCase() === name?.toLowerCase()
                   ) && result[Object.keys(result).find(key => 
                     key.toLowerCase() === name?.toLowerCase()
                   )];

        // Type conversion
        if (value !== undefined && dataType) {
          value = this.convertDataType(value, dataType);
        }

        mapped[name] = value;
      }

      return mapped;
    }

    return result;
  }

  /**
   * Convert value to specified data type
   * @param {any} value - Value to convert
   * @param {string} dataType - Target data type
   * @returns {any} Converted value
   */
  convertDataType(value, dataType) {
    try {
      switch (dataType) {
        case 'string':
          return String(value);
        case 'number':
          return Number(value);
        case 'boolean':
          return Boolean(value);
        case 'json':
        case 'object':
          return typeof value === 'string' ? JSON.parse(value) : value;
        case 'array':
          return Array.isArray(value) ? value : [value];
        default:
          return value;
      }
    } catch (error) {
      this.logger.warn(`Type conversion failed for ${dataType}:`, error.message);
      return value;
    }
  }

  /**
   * Check if a custom node type is registered
   * @param {string} nodeType - Node type to check
   * @returns {boolean} True if registered
   */
  hasNode(nodeType) {
    return this.customNodes.has(nodeType);
  }

  /**
   * Get list of registered custom node types
   * @returns {Array<string>} Registered node types
   */
  getRegisteredNodeTypes() {
    return Array.from(this.customNodes.keys());
  }

  /**
   * Get custom node definition
   * @param {string} nodeType - Node type
   * @returns {Object|null} Node definition or null if not found
   */
  getNodeDefinition(nodeType) {
    const nodeInfo = this.customNodes.get(nodeType);
    return nodeInfo ? nodeInfo.definition : null;
  }

  /**
   * Unregister a custom node
   * @param {string} nodeType - Node type to unregister
   */
  unregisterNode(nodeType) {
    if (this.customNodes.has(nodeType)) {
      this.customNodes.delete(nodeType);
      this.executionCache.delete(nodeType);
      this.logger.info(`Unregistered custom node: ${nodeType}`);
    }
  }

  /**
   * Clear all registered custom nodes
   */
  clear() {
    const nodeCount = this.customNodes.size;
    this.customNodes.clear();
    this.executionCache.clear();
    this.logger.info(`Cleared ${nodeCount} custom nodes`);
  }

  /**
   * Get execution statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      registeredNodes: this.customNodes.size,
      cacheSize: this.executionCache.size,
      sandboxEnabled: this.enableSandbox
    };
  }

  /**
   * Dispose resources and cleanup
   */
  dispose() {
    this.clear();
  }
} 
