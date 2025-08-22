/**
 * Flow Validator - Validates flow structure and integrity
 */

export class FlowValidator {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Validate a complete flow
   * @param {Object} flowData - Flow definition to validate
   * @returns {Object} Validation result
   */
  validateFlow(flowData) {
    const errors = [];
    const warnings = [];

    try {
      // Basic structure validation
      this.validateBasicStructure(flowData, errors);
      
      // Node validation
      this.validateNodes(flowData.nodes || [], errors, warnings);
      
      // Connection validation
      this.validateConnections(flowData.nodes || [], flowData.connections || [], errors, warnings);
      
      // Custom node validation
      this.validateCustomNodes(flowData.customNodes || [], errors, warnings);
      
      // Flow logic validation
      this.validateFlowLogic(flowData.nodes || [], flowData.connections || [], errors, warnings);

      const isValid = errors.length === 0;
      
      this.logger.info('Flow validation completed', { 
        isValid, 
        errors: errors.length, 
        warnings: warnings.length 
      });

      return {
        isValid,
        errors,
        warnings,
        summary: this.createValidationSummary(flowData, errors, warnings)
      };

    } catch (error) {
      this.logger.error('Flow validation failed', { error: error.message });
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
        warnings: [],
        summary: null
      };
    }
  }

  /**
   * Validate basic flow structure
   * @param {Object} flowData - Flow data
   * @param {Array} errors - Error collection
   */
  validateBasicStructure(flowData, errors) {
    if (!flowData || typeof flowData !== 'object') {
      errors.push('Flow data must be a valid object');
      return;
    }

    // Required fields
    const requiredFields = ['name', 'nodes'];
    for (const field of requiredFields) {
      if (!flowData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Version check
    if (flowData.version && !this.isVersionSupported(flowData.version)) {
      errors.push(`Unsupported flow version: ${flowData.version}`);
    }

    // Type checks
    if (flowData.nodes && !Array.isArray(flowData.nodes)) {
      errors.push('Nodes must be an array');
    }

    if (flowData.connections && !Array.isArray(flowData.connections)) {
      errors.push('Connections must be an array');
    }

    if (flowData.customNodes && !Array.isArray(flowData.customNodes)) {
      errors.push('Custom nodes must be an array');
    }
  }

  /**
   * Validate individual nodes
   * @param {Array} nodes - Flow nodes
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateNodes(nodes, errors, warnings) {
    if (!Array.isArray(nodes)) {
      return;
    }

    const nodeIds = new Set();
    const nodeNames = new Set();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeContext = `Node ${i + 1}`;

      // Required fields
      if (!node.id) {
        errors.push(`${nodeContext}: Missing required field 'id'`);
        continue;
      }

      if (!node.type) {
        errors.push(`${nodeContext} (${node.id}): Missing required field 'type'`);
        continue;
      }

      if (!node.name) {
        warnings.push(`${nodeContext} (${node.id}): Missing name field`);
      }

      // Duplicate ID check
      if (nodeIds.has(node.id)) {
        errors.push(`${nodeContext}: Duplicate node ID '${node.id}'`);
      } else {
        nodeIds.add(node.id);
      }

      // Duplicate name check
      if (node.name && nodeNames.has(node.name)) {
        warnings.push(`${nodeContext} (${node.id}): Duplicate node name '${node.name}'`);
      } else if (node.name) {
        nodeNames.add(node.name);
      }

      // Node type validation
      this.validateNodeType(node, errors, warnings);

      // Node data validation
      this.validateNodeData(node, errors, warnings);
    }

    // Flow composition checks
    this.validateFlowComposition(nodes, errors, warnings);
  }

  /**
   * Validate node type
   * @param {Object} node - Node to validate
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateNodeType(node, errors, warnings) {
    const supportedBuiltinTypes = [
      'input', 'output', 'llm', 'json-parse', 'if-else', 'image-input'
    ];

    // Check if it's a built-in type or custom type
    if (!supportedBuiltinTypes.includes(node.type) && !node.type.startsWith('custom-')) {
      warnings.push(`Node ${node.id}: Unknown node type '${node.type}'. Assuming custom node.`);
    }

    // Specific validation for built-in types
    switch (node.type) {
      case 'input':
        this.validateInputNode(node, errors, warnings);
        break;
      case 'output':
        this.validateOutputNode(node, errors, warnings);
        break;
      case 'llm':
        this.validateLLMNode(node, errors, warnings);
        break;
      case 'if-else':
        this.validateIfElseNode(node, errors, warnings);
        break;
    }
  }

  /**
   * Validate node data structure
   * @param {Object} node - Node to validate
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateNodeData(node, errors, warnings) {
    if (node.data && typeof node.data !== 'object') {
      errors.push(`Node ${node.id}: Data field must be an object`);
    }

    // Position validation
    if (node.position) {
      if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        warnings.push(`Node ${node.id}: Invalid position coordinates`);
      }
    }
  }

  /**
   * Validate input node
   */
  validateInputNode(node, errors, warnings) {
    const data = node.data || {};
    
    if (data.inputType && !['string', 'number', 'boolean', 'json'].includes(data.inputType)) {
      warnings.push(`Node ${node.id}: Invalid input type '${data.inputType}'`);
    }
  }

  /**
   * Validate output node
   */
  validateOutputNode(node, errors, warnings) {
    // Output nodes should generally have at least one input connection
    // This will be checked in connection validation
  }

  /**
   * Validate LLM node
   */
  validateLLMNode(node, errors, warnings) {
    const data = node.data || {};
    
    if (!data.prompt) {
      warnings.push(`Node ${node.id}: LLM node missing prompt configuration`);
    }
  }

  /**
   * Validate If/Else node
   */
  validateIfElseNode(node, errors, warnings) {
    const data = node.data || {};
    
    // Accept both 'condition' and 'expression' for compatibility with UI exports
    if (!data.condition && !data.expression) {
      errors.push(`Node ${node.id}: If/Else node missing condition or expression`);
    }
  }

  /**
   * Validate flow connections
   * @param {Array} nodes - Flow nodes
   * @param {Array} connections - Flow connections
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateConnections(nodes, connections, errors, warnings) {
    if (!Array.isArray(connections)) {
      return;
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const connectionIds = new Set();

    for (let i = 0; i < connections.length; i++) {
      const connection = connections[i];
      const connContext = `Connection ${i + 1}`;

      // Required fields
      const requiredFields = ['sourceNodeId', 'targetNodeId'];
      for (const field of requiredFields) {
        if (!connection[field]) {
          errors.push(`${connContext}: Missing required field '${field}'`);
          continue;
        }
      }

      // Node existence check
      if (!nodeMap.has(connection.sourceNodeId)) {
        errors.push(`${connContext}: Source node '${connection.sourceNodeId}' not found`);
      }

      if (!nodeMap.has(connection.targetNodeId)) {
        errors.push(`${connContext}: Target node '${connection.targetNodeId}' not found`);
      }

      // Self-connection check
      if (connection.sourceNodeId === connection.targetNodeId) {
        errors.push(`${connContext}: Node cannot connect to itself`);
      }

      // Duplicate connection check
      const connectionKey = `${connection.sourceNodeId}->${connection.targetNodeId}:${connection.sourcePortId || 'default'}->${connection.targetPortId || 'default'}`;
      if (connectionIds.has(connectionKey)) {
        warnings.push(`${connContext}: Duplicate connection detected`);
      } else {
        connectionIds.add(connectionKey);
      }
    }
  }

  /**
   * Validate custom nodes
   * @param {Array} customNodes - Custom node definitions
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateCustomNodes(customNodes, errors, warnings) {
    if (!Array.isArray(customNodes)) {
      return;
    }

    const nodeTypes = new Set();

    for (let i = 0; i < customNodes.length; i++) {
      const customNode = customNodes[i];
      const nodeContext = `Custom Node ${i + 1}`;

      // Required fields
      const requiredFields = ['type', 'name', 'executionCode'];
      for (const field of requiredFields) {
        if (!customNode[field]) {
          errors.push(`${nodeContext}: Missing required field '${field}'`);
        }
      }

      // Duplicate type check
      if (customNode.type && nodeTypes.has(customNode.type)) {
        errors.push(`${nodeContext}: Duplicate custom node type '${customNode.type}'`);
      } else if (customNode.type) {
        nodeTypes.add(customNode.type);
      }

      // Validate execution code
      if (customNode.executionCode) {
        this.validateExecutionCode(customNode.executionCode, customNode.type, errors, warnings);
      }

      // Validate inputs/outputs
      this.validateNodeInterface(customNode, errors, warnings);
    }
  }

  /**
   * Validate custom node execution code
   * @param {string} code - Execution code
   * @param {string} nodeType - Node type
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateExecutionCode(code, nodeType, errors, warnings) {
    if (typeof code !== 'string' || code.trim().length === 0) {
      errors.push(`Custom node ${nodeType}: Execution code cannot be empty`);
      return;
    }

    // Basic syntax validation
    try {
      // Check if code contains async function execute
      if (!code.includes('async function execute') && !code.includes('function execute')) {
        warnings.push(`Custom node ${nodeType}: Code should contain an 'execute' function`);
      }

      // Check for dangerous patterns
      const dangerousPatterns = [
        /require\s*\(/,
        /import\s+/,
        /eval\s*\(/,
        /Function\s*\(/,
        /process\./,
        /global\./,
        /window\./
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
          warnings.push(`Custom node ${nodeType}: Code contains potentially unsafe patterns`);
          break;
        }
      }

    } catch (error) {
      errors.push(`Custom node ${nodeType}: Invalid JavaScript syntax in execution code`);
    }
  }

  /**
   * Validate node interface (inputs/outputs)
   * @param {Object} customNode - Custom node definition
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateNodeInterface(customNode, errors, warnings) {
    const { type, inputs = [], outputs = [] } = customNode;

    // Validate inputs
    if (inputs && Array.isArray(inputs)) {
      const inputNames = new Set();
      for (const input of inputs) {
        if (!input.name) {
          errors.push(`Custom node ${type}: Input missing name field`);
        } else if (inputNames.has(input.name)) {
          errors.push(`Custom node ${type}: Duplicate input name '${input.name}'`);
        } else {
          inputNames.add(input.name);
        }
      }
    }

    // Validate outputs
    if (outputs && Array.isArray(outputs)) {
      const outputNames = new Set();
      for (const output of outputs) {
        if (!output.name) {
          errors.push(`Custom node ${type}: Output missing name field`);
        } else if (outputNames.has(output.name)) {
          errors.push(`Custom node ${type}: Duplicate output name '${output.name}'`);
        } else {
          outputNames.add(output.name);
        }
      }
    }
  }

  /**
   * Validate flow logic and composition
   * @param {Array} nodes - Flow nodes
   * @param {Array} connections - Flow connections
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateFlowLogic(nodes, connections, errors, warnings) {
    // Check for circular dependencies
    this.checkCircularDependencies(nodes, connections, errors);
    
    // Check for isolated nodes
    this.checkIsolatedNodes(nodes, connections, warnings);
    
    // Check flow completeness
    this.checkFlowCompleteness(nodes, warnings);
  }

  /**
   * Check for circular dependencies
   */
  checkCircularDependencies(nodes, connections, errors) {
    const graph = new Map();
    
    // Build adjacency list
    for (const node of nodes) {
      graph.set(node.id, []);
    }
    
    for (const connection of connections) {
      if (graph.has(connection.sourceNodeId) && graph.has(connection.targetNodeId)) {
        graph.get(connection.sourceNodeId).push(connection.targetNodeId);
      }
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (nodeId) => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId) && hasCycle(nodeId)) {
        errors.push('Circular dependency detected in flow connections');
        break;
      }
    }
  }

  /**
   * Check for isolated nodes
   */
  checkIsolatedNodes(nodes, connections, warnings) {
    const connectedNodes = new Set();
    
    for (const connection of connections) {
      connectedNodes.add(connection.sourceNodeId);
      connectedNodes.add(connection.targetNodeId);
    }

    for (const node of nodes) {
      if (!connectedNodes.has(node.id) && node.type !== 'input') {
        warnings.push(`Node '${node.name || node.id}' is not connected to any other nodes`);
      }
    }
  }

  /**
   * Check flow completeness
   */
  checkFlowCompleteness(nodes, warnings) {
    const hasInput = nodes.some(n => n.type === 'input');
    const hasOutput = nodes.some(n => n.type === 'output');

    if (!hasInput) {
      warnings.push('Flow has no input nodes - may be difficult to provide data');
    }

    if (!hasOutput) {
      warnings.push('Flow has no output nodes - results will include all intermediate values');
    }
  }

  /**
   * Check if flow version is supported
   * @param {string} version - Flow version
   * @returns {boolean} True if supported
   */
  isVersionSupported(version) {
    const supportedVersions = ['1.0.0', '1.0'];
    return supportedVersions.includes(version);
  }

  /**
   * Create validation summary
   * @param {Object} flowData - Flow data
   * @param {Array} errors - Validation errors
   * @param {Array} warnings - Validation warnings
   * @returns {Object} Validation summary
   */
  createValidationSummary(flowData, errors, warnings) {
    const nodes = flowData.nodes || [];
    const connections = flowData.connections || [];
    const customNodes = flowData.customNodes || [];

    return {
      flowName: flowData.name,
      version: flowData.version,
      nodeCount: nodes.length,
      connectionCount: connections.length,
      customNodeCount: customNodes.length,
      inputNodes: nodes.filter(n => n.type === 'input').length,
      outputNodes: nodes.filter(n => n.type === 'output').length,
      errorCount: errors.length,
      warningCount: warnings.length,
      validationPassed: errors.length === 0
    };
  }

  /**
   * Validate flow composition (basic checks)
   * @param {Array} nodes - Flow nodes
   * @param {Array} errors - Error collection
   * @param {Array} warnings - Warning collection
   */
  validateFlowComposition(nodes, errors, warnings) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      warnings.push('Flow has no nodes');
      return;
    }

    // Check for at least one input and output node
    const hasInput = nodes.some(node => node.type === 'input');
    const hasOutput = nodes.some(node => node.type === 'output');

    if (!hasInput) {
      warnings.push('Flow has no input nodes - consider adding input sources');
    }

    if (!hasOutput) {
      warnings.push('Flow has no output nodes - consider adding result outputs');
    }
  }
} 
