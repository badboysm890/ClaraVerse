/**
 * angela Flow SDK v2.0 - Modern AI Workflow Execution Engine
 * Zero-config SDK for running angela AI agent workflows
 */

// Core execution engine
class angelaFlowRunner {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 30000,
      enableLogging: options.enableLogging !== false,
      logLevel: options.logLevel || 'info',
      maxRetries: options.maxRetries || 3,
      ...options
    };

    this.executionLogs = [];
    this.customNodes = new Map();
    this.isExecuting = false;
    
    if (this.config.enableLogging) {
      this.log('angela Flow SDK v2.0 initialized');
    }
  }

  /**
   * Execute a workflow with inputs
   * @param {Object} flowData - Exported workflow from angela Studio
   * @param {Object} inputs - Input values for the workflow
   * @returns {Promise<Object>} Execution results
   */
  async execute(flowData, inputs = {}) {
    if (this.isExecuting) {
      throw new Error('Another workflow is already executing');
    }

    this.isExecuting = true;
    const startTime = Date.now();
    
    try {
      this.log('🚀 Starting workflow execution');
      
      // Normalize flow data format
      const flow = this.normalizeFlow(flowData);
      
      // Register custom nodes if present
      this.registerCustomNodes(flow.customNodes || []);
      
      // Validate workflow
      this.validateFlow(flow);
      
      // Execute workflow
      const results = await this.executeWorkflow(flow, inputs);
      
      const duration = Date.now() - startTime;
      this.log(`✅ Workflow completed successfully in ${duration}ms`);
      
      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`❌ Workflow failed after ${duration}ms: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Register a custom node type
   * @param {Object} nodeDefinition - Custom node definition
   */
  registerCustomNode(nodeDefinition) {
    if (!nodeDefinition.type || !nodeDefinition.executionCode) {
      throw new Error('Custom node must have type and executionCode');
    }
    
    this.customNodes.set(nodeDefinition.type, nodeDefinition);
    this.log(`📦 Registered custom node: ${nodeDefinition.type}`);
  }

  /**
   * Get execution logs
   * @returns {Array} Array of log entries
   */
  getLogs() {
    return [...this.executionLogs];
  }

  /**
   * Clear execution logs
   */
  clearLogs() {
    this.executionLogs = [];
  }

  /**
   * Get required inputs for a workflow (what the developer needs to provide)
   * @param {Object} flowData - Workflow JSON
   * @returns {Array} Array of required input descriptions
   */
  getRequiredInputs(flowData) {
    try {
      const flow = this.normalizeFlow(flowData);
      const inputNodes = flow.nodes.filter(node => node.type === 'input');
      
      return inputNodes.map(node => ({
        id: node.id,
        name: node.name || node.data?.label || node.id,
        description: node.data?.description || `Input for ${node.name || node.id}`,
        type: node.data?.type || 'text',
        required: !node.data?.value && !node.data?.defaultValue, // Required if no default
        defaultValue: node.data?.value || node.data?.defaultValue,
        example: this.getInputExample(node.data?.type || 'text')
      }));
    } catch (error) {
      throw new Error(`Failed to analyze workflow inputs: ${error.message}`);
    }
  }

  /**
   * Get example value for input type
   * @private
   */
  getInputExample(type) {
    const examples = {
      'text': 'Hello world',
      'number': 42,
      'json': '{"key": "value"}',
      'boolean': true,
      'email': 'user@example.com',
      'url': 'https://example.com'
    };
    return examples[type] || 'Sample input';
  }

  /**
   * Simple execution - automatically prompt for missing inputs
   * @param {Object} flowData - Workflow JSON  
   * @param {Object} inputs - Optional inputs (if not provided, will prompt)
   * @returns {Promise<any>} Execution result
   */
  async run(flowData, inputs = {}) {
    // Get required inputs
    const requiredInputs = this.getRequiredInputs(flowData);
    
    // Check if we have all required inputs
    const missingInputs = requiredInputs.filter(input => 
      input.required && !(input.id in inputs) && !(input.name in inputs)
    );

    if (missingInputs.length > 0 && typeof process !== 'undefined' && process.stdin && typeof window === 'undefined') {
      // We're in Node.js and have missing inputs - prompt for them
      this.log('🔍 Missing required inputs, prompting user...');
      
      try {
        const readline = await import('readline');
        
        for (const input of missingInputs) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const prompt = `${input.name} (${input.type})${input.defaultValue ? ` [${input.defaultValue}]` : ''}: `;
          const answer = await new Promise(resolve => rl.question(prompt, resolve));
          rl.close();

          if (answer.trim() || !input.defaultValue) {
            inputs[input.id] = answer.trim() || input.defaultValue;
          } else {
            inputs[input.id] = input.defaultValue;
          }
        }
      } catch (error) {
        // Fallback if readline import fails
        const inputList = missingInputs.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n');
        throw new Error(`Missing required inputs:\n${inputList}\n\nPlease provide these inputs when calling run(workflow, inputs)`);
      }
    } else if (missingInputs.length > 0) {
      // Missing inputs but can't prompt (browser or missing inputs)
      const inputList = missingInputs.map(i => `- ${i.name} (${i.type}): ${i.description}`).join('\n');
      throw new Error(`Missing required inputs:\n${inputList}\n\nPlease provide these inputs when calling run(workflow, inputs)`);
    }

    // Fill in default values for optional inputs
    requiredInputs.forEach(input => {
      if (!input.required && !(input.id in inputs) && !(input.name in inputs) && input.defaultValue !== undefined) {
        inputs[input.id] = input.defaultValue;
      }
    });

    // Execute the workflow
    return this.execute(flowData, inputs);
  }

  /**
   * Get a simple description of what this workflow does
   * @param {Object} flowData - Workflow JSON
   * @returns {Object} Workflow description
   */
  describe(flowData) {
    try {
      const flow = this.normalizeFlow(flowData);
      const inputs = this.getRequiredInputs(flowData);
      const outputNodes = flow.nodes.filter(node => node.type === 'output');
      const aiNodes = flow.nodes.filter(node => 
        node.type === 'llm' || 
        node.type === 'structured-llm' || 
        node.type === 'whisper-transcription'
      );
      const customNodes = flow.nodes.filter(node => 
        this.customNodes.has(node.type) || 
        (flow.customNodes && flow.customNodes.some(cn => cn.type === node.type))
      );

      return {
        name: flow.name || 'Unnamed Workflow',
        description: flow.description || 'No description provided',
        inputs: inputs,
        outputs: outputNodes.map(node => ({
          name: node.name || node.id,
          description: node.data?.description || `Output from ${node.name || node.id}`
        })),
        nodeCount: flow.nodes.length,
        hasAI: aiNodes.length > 0,
        hasCustomNodes: customNodes.length > 0,
        aiModels: aiNodes.map(node => node.data?.model || 'Unknown').filter(Boolean),
        complexity: this.calculateComplexity(flow)
      };
    } catch (error) {
      throw new Error(`Failed to describe workflow: ${error.message}`);
    }
  }

  /**
   * Calculate workflow complexity
   * @private
   */
  calculateComplexity(flow) {
    const nodeCount = flow.nodes.length;
    const connectionCount = flow.connections?.length || 0;
    const hasAI = flow.nodes.some(n => n.type === 'llm' || n.type === 'structured-llm');
    const hasCustomNodes = flow.nodes.some(n => this.customNodes.has(n.type));
    
    if (nodeCount <= 3) return 'Simple';
    if (nodeCount <= 7) return 'Medium';
    if (nodeCount <= 15 || hasAI || hasCustomNodes) return 'Complex';
    return 'Advanced';
  }

  // Private methods
  
  normalizeFlow(flowData) {
    // Handle different export formats from angela Studio
    if (flowData.format && flowData.flow) {
      // SDK export format
      return flowData.flow;
    } else if (flowData.nodes && flowData.connections) {
      // Direct flow format
      return flowData;
    } else {
      throw new Error('Invalid flow format');
    }
  }

  registerCustomNodes(customNodes) {
    if (Array.isArray(customNodes)) {
      customNodes.forEach(node => this.registerCustomNode(node));
    }
  }

  validateFlow(flow) {
    if (!flow.nodes || !Array.isArray(flow.nodes)) {
      throw new Error('Flow must have nodes array');
    }
    
    if (!flow.connections || !Array.isArray(flow.connections)) {
      throw new Error('Flow must have connections array');
    }

    if (flow.nodes.length === 0) {
      throw new Error('Flow must have at least one node');
    }

    this.log(`📋 Flow validated: ${flow.nodes.length} nodes, ${flow.connections.length} connections`);
  }

  async executeWorkflow(flow, inputs) {
    // Get execution order using topological sort
    const executionOrder = this.getExecutionOrder(flow.nodes, flow.connections);
    this.log(`📊 Execution order: ${executionOrder.map(n => n.name || n.type).join(' → ')}`);

    // Initialize node outputs storage
    const nodeOutputs = new Map();
    
    // Set input node values
    const inputNodes = flow.nodes.filter(node => node.type === 'input');
    for (const inputNode of inputNodes) {
      const inputValue = inputs[inputNode.id] || inputs[inputNode.name] || inputNode.data?.value;
      nodeOutputs.set(inputNode.id, { output: inputValue });
      this.log(`📥 Input [${inputNode.name || inputNode.id}]: ${this.truncateValue(inputValue)}`);
    }

    // Execute nodes in order
    for (const node of executionOrder) {
      if (nodeOutputs.has(node.id)) continue; // Skip already executed nodes

      const nodeStartTime = Date.now();
      this.log(`▶️ Executing: ${node.name || node.type} (${node.type})`);

      try {
        // Get inputs for this node
        const nodeInputs = this.getNodeInputs(node, flow.connections, nodeOutputs);
        
        // Execute the node
        const result = await this.executeNode(node, nodeInputs);
        
        // Store result
        nodeOutputs.set(node.id, result);
        
        const nodeDuration = Date.now() - nodeStartTime;
        this.log(`✅ Completed: ${node.name || node.type} (${nodeDuration}ms)`);
        
      } catch (error) {
        const nodeDuration = Date.now() - nodeStartTime;
        this.log(`❌ Failed: ${node.name || node.type} (${nodeDuration}ms) - ${error.message}`, 'error');
        throw new Error(`Node '${node.name || node.type}' failed: ${error.message}`);
      }
    }

    // Collect output node results
    const results = {};
    const outputNodes = flow.nodes.filter(node => node.type === 'output');
    
    for (const outputNode of outputNodes) {
      const outputValue = nodeOutputs.get(outputNode.id);
      results[outputNode.id] = outputValue;
      results[outputNode.name || outputNode.id] = outputValue;
      this.log(`📤 Output [${outputNode.name || outputNode.id}]: ${this.truncateValue(outputValue)}`);
    }

    return results;
  }

  getExecutionOrder(nodes, connections) {
    // Topological sort for dependency-based execution order
    const inDegree = new Map();
    const adjList = new Map();
    
    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }
    
    // Build adjacency list and count incoming edges
    for (const conn of connections) {
      adjList.get(conn.sourceNodeId).push(conn.targetNodeId);
      inDegree.set(conn.targetNodeId, inDegree.get(conn.targetNodeId) + 1);
    }
    
    // Kahn's algorithm
    const queue = [];
    const result = [];
    
    // Start with nodes that have no incoming edges
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    
    while (queue.length > 0) {
      const nodeId = queue.shift();
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        result.push(node);
      }
      
      for (const targetId of adjList.get(nodeId)) {
        inDegree.set(targetId, inDegree.get(targetId) - 1);
        if (inDegree.get(targetId) === 0) {
          queue.push(targetId);
        }
      }
    }
    
    if (result.length !== nodes.length) {
      throw new Error('Circular dependency detected in workflow');
    }
    
    return result;
  }

  getNodeInputs(node, connections, nodeOutputs) {
    const inputs = {};
    
    // Find all connections that target this node
    const incomingConnections = connections.filter(conn => conn.targetNodeId === node.id);
    
    for (const conn of incomingConnections) {
      const sourceOutput = nodeOutputs.get(conn.sourceNodeId);
      if (sourceOutput) {
        // Get the correct output value
        let outputValue;
        if (sourceOutput[conn.sourcePortId]) {
          outputValue = sourceOutput[conn.sourcePortId];
        } else if (sourceOutput.output !== undefined) {
          outputValue = sourceOutput.output;
        } else {
          outputValue = sourceOutput;
        }
        
        // Map to the target port ID directly (this is the most important mapping)
        inputs[conn.targetPortId] = outputValue;
        
        // Also map common variations for backwards compatibility
        if (conn.targetPortId === 'user') {
          inputs.user = outputValue;
          inputs.message = outputValue;
          inputs.input = outputValue;
        }
        if (conn.targetPortId === 'system') {
          inputs.system = outputValue;
        }
        if (conn.targetPortId === 'context') {
          inputs.context = outputValue;
        }
        if (conn.targetPortId === 'text1') {
          inputs.input1 = outputValue;
          inputs.text1 = outputValue;
        }
        if (conn.targetPortId === 'text2') {
          inputs.input2 = outputValue;
          inputs.text2 = outputValue;
        }
        if (conn.targetPortId === 'input') {
          inputs.input = outputValue;
        }
        
        // Map by input port name if available
        const inputPort = node.inputs?.find(input => input.id === conn.targetPortId);
        if (inputPort) {
          const inputName = inputPort.name?.toLowerCase();
          if (inputName) {
            inputs[inputName] = outputValue;
          }
        }
      }
    }
    
    return inputs;
  }

  async executeNode(node, inputs) {
    // Check if it's a custom node
    if (this.customNodes.has(node.type)) {
      return this.executeCustomNode(node, inputs);
    }
    
    // Execute built-in node types
    switch (node.type) {
      case 'input':
        return { output: node.data?.value || '' };
        
      case 'output':
        return { output: inputs.input || Object.values(inputs)[0] };
        
      case 'static-text':
        return { output: node.data?.text || node.data?.value || '' };
        
      case 'combine-text':
        const input1 = inputs.input1 || inputs.text1 || '';
        const input2 = inputs.input2 || inputs.text2 || '';
        const separator = node.data?.separator || ' ';
        return { output: input1 + separator + input2 };
        
      case 'json-parse':
        try {
          const jsonText = inputs.input || inputs.json || '{}';
          const parsed = JSON.parse(jsonText);
          const field = node.data?.field || node.data?.path;
          if (field) {
            // Support dot notation for nested fields
            const value = this.getNestedValue(parsed, field);
            return { output: value };
          }
          return { output: parsed };
        } catch (error) {
          if (node.data?.failOnError !== false) {
            throw new Error(`JSON Parse Error: ${error.message}`);
          }
          return { output: null };
        }
        
      case 'if-else':
        const condition = inputs.condition !== undefined ? inputs.condition : inputs.input;
        const trueValue = node.data?.trueValue || inputs.trueValue || condition;
        const falseValue = node.data?.falseValue || inputs.falseValue || null;
        
        // Evaluate condition
        let result;
        if (node.data?.expression) {
          try {
            // Safe evaluation using Function constructor
            const func = new Function('input', 'condition', `return ${node.data.expression}`);
            result = func(condition, condition);
          } catch (error) {
            this.log(`If-Else expression error: ${error.message}`, 'warn');
            result = Boolean(condition);
          }
        } else {
          result = Boolean(condition);
        }
        
        return {
          output: result ? trueValue : falseValue,
          true: result ? trueValue : undefined,
          false: result ? undefined : falseValue
        };
        
      case 'llm':
        return this.executeLLMNode(node, inputs);
        
      case 'structured-llm':
        return this.executeStructuredLLMNode(node, inputs);
        
      case 'api-request':
        return this.executeAPIRequestNode(node, inputs);
        
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  async executeCustomNode(node, inputs) {
    const nodeDefinition = this.customNodes.get(node.type);
    const properties = node.data || {};
    
    try {
      // Create execution context
      const context = {
        log: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'info', data),
        warn: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'warn', data),
        error: (message, data) => this.log(`[${node.name || node.type}] ${message}`, 'error', data)
      };
      
      // Execute custom node code
      const func = new Function('inputs', 'properties', 'context', `
        ${nodeDefinition.executionCode}
        if (typeof execute === 'function') {
          return execute(inputs, properties, context);
        } else {
          throw new Error('Custom node must define an execute function');
        }
      `);
      
      const result = await func(inputs, properties, context);
      return result || {};
      
    } catch (error) {
      throw new Error(`Custom node execution failed: ${error.message}`);
    }
  }

  async executeLLMNode(node, inputs) {
    // Basic LLM node implementation
    const apiKey = node.data?.apiKey || process.env.OPENAI_API_KEY;
    const model = node.data?.model || 'gpt-3.5-turbo';
    const apiBaseUrl = node.data?.apiBaseUrl || 'https://api.openai.com/v1';
    
    if (!apiKey) {
      throw new Error('LLM node requires API key');
    }
    
    const systemMessage = inputs.system || node.data?.systemMessage || '';
    const userMessage = inputs.user || inputs.input || inputs.message || '';
    
    if (!userMessage) {
      throw new Error('LLM node requires user message');
    }
    
    try {
      const messages = [];
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }
      messages.push({ role: 'user', content: userMessage });
      
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: node.data?.temperature || 0.7,
          max_tokens: node.data?.maxTokens || 1000
        })
      });
      
      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const output = data.choices?.[0]?.message?.content || '';
      
      return {
        output,
        usage: data.usage,
        model: data.model
      };
      
    } catch (error) {
      throw new Error(`LLM execution failed: ${error.message}`);
    }
  }

  async executeStructuredLLMNode(node, inputs) {
    // Similar to LLM but with structured output
    const result = await this.executeLLMNode(node, inputs);
    
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(result.output);
      return {
        output: parsed,
        raw: result.output,
        usage: result.usage,
        model: result.model
      };
    } catch (error) {
      // If parsing fails, return raw output
      return {
        output: result.output,
        usage: result.usage,
        model: result.model
      };
    }
  }

  async executeAPIRequestNode(node, inputs) {
    const url = inputs.url || node.data?.url;
    const method = node.data?.method || 'GET';
    const headers = { ...node.data?.headers, ...inputs.headers };
    const body = inputs.body || node.data?.body;
    
    if (!url) {
      throw new Error('API Request node requires URL');
    }
    
    try {
      const options = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      
      if (body && method.toUpperCase() !== 'GET') {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
    return {
        output: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };
      
    } catch (error) {
      throw new Error(`API Request failed: ${error.message}`);
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  truncateValue(value) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > 100 ? str.substring(0, 100) + '...' : str;
  }

  log(message, level = 'info', data = null) {
    if (!this.config.enableLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.executionLogs.push(logEntry);
    
    if (typeof console !== 'undefined') {
      const logMethod = console[level] || console.log;
      logMethod(`[angela SDK] ${message}`, data || '');
    }
  }
}

// Utility functions for browser usage
const BrowserUtils = {
  // Download flow as JSON file
  downloadFlow(flowData, filename = 'workflow.json') {
    if (typeof document === 'undefined') {
      throw new Error('downloadFlow is only available in browser environment');
    }
    
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Load flow from file input
  async loadFlowFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const flowData = JSON.parse(e.target.result);
          resolve(flowData);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsText(file);
    });
  },

  // Get browser info
  getBrowserInfo() {
    if (typeof navigator === 'undefined') return null;
    
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  },

  // Check if running in browser
  isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }
};

// Export main classes and utilities
export { angelaFlowRunner, BrowserUtils };

// Default export for CommonJS compatibility
export default angelaFlowRunner;
