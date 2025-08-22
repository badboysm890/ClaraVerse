import { CustomNodeDefinition } from '../../../types/agent/types';

export interface CustomNodeExecutionContext {
  log: (...args: any[]) => void;
  fetch?: (url: string, options?: RequestInit) => Promise<Response>;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (id: number) => void;
}

export class CustomNodeManager {
  private customNodes: Map<string, CustomNodeDefinition> = new Map();
  private nodeComponents: Map<string, React.ComponentType> = new Map();
  private executionResults: Map<string, any> = new Map();

  constructor() {
    this.loadStoredNodes();
  }

  /**
   * Register a custom node definition
   */
  registerCustomNode(nodeDefinition: CustomNodeDefinition): void {
    try {
      this.validateNode(nodeDefinition);
      this.customNodes.set(nodeDefinition.type, nodeDefinition);
      
      // Store in localStorage for persistence
      this.saveToStorage();
      
      console.log(`Custom node registered: ${nodeDefinition.name}`);
    } catch (error) {
      console.error('Failed to register custom node:', error);
      throw error;
    }
  }

  /**
   * Unregister a custom node
   */
  unregisterCustomNode(nodeType: string): boolean {
    const removed = this.customNodes.delete(nodeType);
    if (removed) {
      this.nodeComponents.delete(nodeType);
      this.saveToStorage();
    }
    return removed;
  }

  /**
   * Get all registered custom nodes
   */
  getCustomNodes(): CustomNodeDefinition[] {
    return Array.from(this.customNodes.values());
  }

  /**
   * Get a specific custom node definition
   */
  getCustomNode(nodeType: string): CustomNodeDefinition | undefined {
    return this.customNodes.get(nodeType);
  }

  /**
   * Check if a node type is a custom node
   */
  isCustomNode(nodeType: string): boolean {
    return this.customNodes.has(nodeType);
  }

  /**
   * Execute a custom node
   */
  async executeCustomNode(
    nodeType: string,
    inputs: Record<string, any>,
    properties: Record<string, any>,
    context?: Partial<CustomNodeExecutionContext>
  ): Promise<any> {
    const nodeDefinition = this.customNodes.get(nodeType);
    if (!nodeDefinition) {
      throw new Error(`Custom node not found: ${nodeType}`);
    }

    try {
      // Create execution context
      const executionContext: CustomNodeExecutionContext = {
        log: context?.log || ((...args) => console.log(`[${nodeDefinition.name}]`, ...args)),
        fetch: context?.fetch,
        setTimeout: context?.setTimeout || setTimeout,
        clearTimeout: context?.clearTimeout || clearTimeout
      };

      // Map input/output IDs to names for easier access
      const mappedInputs = this.mapPortsToNames(inputs, nodeDefinition.inputs);
      const mappedProperties = this.mapPropertiesToNames(properties, nodeDefinition.properties);

      // Execute the code in a sandboxed environment
      const result = await this.sandboxedExecution(
        nodeDefinition.executionCode,
        mappedInputs,
        mappedProperties,
        executionContext
      );

      // Map result back to port IDs
      const mappedResult = this.mapNamesToPortIds(result, nodeDefinition.outputs);

      return mappedResult;
    } catch (error) {
      console.error(`Custom node execution failed (${nodeType}):`, error);
      throw error;
    }
  }

  /**
   * Validate a custom node definition
   */
  private validateNode(nodeDefinition: CustomNodeDefinition): void {
    if (!nodeDefinition.name || !nodeDefinition.type) {
      throw new Error('Node name and type are required');
    }

    if (!nodeDefinition.executionCode) {
      throw new Error('Execution code is required');
    }

    // Basic security check - prevent dangerous patterns
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\./,
      /global\./,
      /window\./,
      /document\./,
      /__dirname/,
      /__filename/,
      /fs\./,
      /path\./,
      /child_process/,
      /cluster/,
      /os\./
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(nodeDefinition.executionCode)) {
        throw new Error(`Potentially dangerous code pattern detected: ${pattern.source}`);
      }
    }

    // Validate that execute function exists
    if (!nodeDefinition.executionCode.includes('async function execute') && 
        !nodeDefinition.executionCode.includes('function execute')) {
      throw new Error('Execution code must contain an "execute" function');
    }
  }

  /**
   * Execute code in a sandboxed environment
   */
  private async sandboxedExecution(
    code: string,
    inputs: Record<string, any>,
    properties: Record<string, any>,
    context: CustomNodeExecutionContext
  ): Promise<any> {
    try {
      // Create a restricted execution environment
      const restrictedGlobals = {
        // Allow basic JavaScript features
        Object, Array, String, Number, Boolean, Date, Math, JSON,
        Promise, setTimeout: context.setTimeout, clearTimeout: context.clearTimeout,
        
        // Provide controlled context
        console: {
          log: context.log,
          warn: context.log,
          error: context.log
        },
        
        // Controlled fetch if available
        ...(context.fetch && { fetch: context.fetch })
      };

      // Create the execution function with restricted scope
      const executionFunction = new Function(
        'inputs', 'properties', 'context',
        ...Object.keys(restrictedGlobals),
        `
        "use strict";
        ${code}
        return execute(inputs, properties, context);
        `
      );

      // Execute with timeout
      const timeoutMs = 30000; // 30 second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs);
      });

      const executionPromise = executionFunction(
        inputs,
        properties,
        context,
        ...Object.values(restrictedGlobals)
      );

      const result = await Promise.race([executionPromise, timeoutPromise]);
      return result;
    } catch (error) {
      throw new Error(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Map port IDs to names for easier access in execution code
   */
  private mapPortsToNames(data: Record<string, any>, ports: any[]): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const port of ports) {
      if (data[port.id] !== undefined) {
        mapped[port.name.toLowerCase().replace(/\s+/g, '_')] = data[port.id];
      }
    }
    return mapped;
  }

  /**
   * Map property IDs to names for easier access in execution code
   */
  private mapPropertiesToNames(data: Record<string, any>, properties: any[]): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const property of properties) {
      if (data[property.id] !== undefined) {
        mapped[property.name.toLowerCase().replace(/\s+/g, '_')] = data[property.id];
      } else if (property.defaultValue !== undefined) {
        mapped[property.name.toLowerCase().replace(/\s+/g, '_')] = property.defaultValue;
      }
    }
    return mapped;
  }

  /**
   * Map result names back to port IDs
   */
  private mapNamesToPortIds(result: Record<string, any>, ports: any[]): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const port of ports) {
      const nameKey = port.name.toLowerCase().replace(/\s+/g, '_');
      if (result[nameKey] !== undefined) {
        mapped[port.id] = result[nameKey];
      }
    }
    return mapped;
  }

  /**
   * Save custom nodes to localStorage
   */
  private saveToStorage(): void {
    try {
      const nodes = Array.from(this.customNodes.values());
      localStorage.setItem('custom_nodes', JSON.stringify(nodes));
    } catch (error) {
      console.warn('Failed to save custom nodes to storage:', error);
    }
  }

  /**
   * Load custom nodes from localStorage
   */
  private loadStoredNodes(): void {
    try {
      const stored = localStorage.getItem('custom_nodes');
      if (stored) {
        const nodes: CustomNodeDefinition[] = JSON.parse(stored);
        for (const node of nodes) {
          this.customNodes.set(node.type, node);
        }
        console.log(`Loaded ${nodes.length} custom nodes from storage`);
      }
    } catch (error) {
      console.warn('Failed to load custom nodes from storage:', error);
    }
  }

  /**
   * Export custom nodes for sharing
   */
  exportCustomNodes(nodeTypes?: string[]): string {
    const nodesToExport = nodeTypes 
      ? nodeTypes.map(type => this.customNodes.get(type)).filter(Boolean)
      : Array.from(this.customNodes.values());

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      nodes: nodesToExport
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import custom nodes from export data
   */
  importCustomNodes(exportData: string): { imported: number; errors: string[] } {
    try {
      const data = JSON.parse(exportData);
      const errors: string[] = [];
      let imported = 0;

      if (!data.nodes || !Array.isArray(data.nodes)) {
        throw new Error('Invalid export format');
      }

      for (const node of data.nodes) {
        try {
          this.registerCustomNode(node);
          imported++;
        } catch (error) {
          errors.push(`Failed to import ${node.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { imported, errors };
    } catch (error) {
      throw new Error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get usage statistics for custom nodes
   */
  getUsageStats(): Record<string, number> {
    // This would be enhanced with actual usage tracking
    const stats: Record<string, number> = {};
    for (const [type, node] of this.customNodes) {
      stats[type] = node.customMetadata.downloadCount || 0;
    }
    return stats;
  }

  /**
   * Clear all custom nodes
   */
  clearAllCustomNodes(): void {
    this.customNodes.clear();
    this.nodeComponents.clear();
    localStorage.removeItem('custom_nodes');
  }
}

// Global instance
export const customNodeManager = new CustomNodeManager(); 
