import { FlowExecutor, ExecutionContext, FlowExecutorOptions } from '../../src/shared/FlowEngine';
import { FlowNode, Connection, ExecutionLog } from '../../src/types/agent/types';

export interface FlowData {
  format: string;
  version: string;
  flow: {
    id: string;
    name: string;
    description?: string;
    nodes: FlowNode[];
    connections: Connection[];
  };
  customNodes?: any[];
  metadata?: any;
}

export interface angelaFlowRunnerOptions extends FlowExecutorOptions {
  // Additional SDK-specific options can be added here
}

export class angelaFlowRunner {
  private executor: FlowExecutor;
  private customNodes: any[] = [];

  constructor(options: angelaFlowRunnerOptions = {}) {
    this.executor = new FlowExecutor(options);
  }

  /**
   * Execute a flow from exported angela Studio data
   */
  async executeFlow(flowData: FlowData, inputs: Record<string, any> = {}): Promise<Record<string, any>> {
    try {
      // Extract flow from Agent Studio format if needed
      const flow = flowData.flow || flowData;
      
      if (!flow.nodes || !Array.isArray(flow.nodes)) {
        throw new Error('Invalid flow: missing nodes array');
      }

      // Merge custom nodes from flow data with registered custom nodes
      const allCustomNodes = [
        ...(flowData.customNodes || []),
        ...this.customNodes
      ];

      // Execute the flow using the shared engine
      return await this.executor.executeFlow(
        flow.nodes,
        flow.connections || [],
        inputs,
        allCustomNodes
      );
    } catch (error) {
      throw new Error(`Flow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register a custom node for use in flows
   */
  registerCustomNode(customNode: any): void {
    this.customNodes.push(customNode);
  }

  /**
   * Execute multiple flows in batch
   */
  async executeBatch(
    flowData: FlowData, 
    inputSets: Record<string, any>[], 
    options: { concurrency?: number; onProgress?: (progress: any) => void } = {}
  ): Promise<any[]> {
    const { concurrency = 3, onProgress } = options;
    const results = [];
    
    for (let i = 0; i < inputSets.length; i += concurrency) {
      const batch = inputSets.slice(i, i + concurrency);
      const batchPromises = batch.map(inputs => this.executeFlow(flowData, inputs));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress({
          completed: Math.min(i + concurrency, inputSets.length),
          total: inputSets.length,
          progress: Math.min(i + concurrency, inputSets.length) / inputSets.length
        });
      }
    }
    
    return results;
  }

  /**
   * Get execution logs from the last flow run
   */
  getLogs(): ExecutionLog[] {
    return this.executor.getLogs();
  }

  /**
   * Clear execution logs
   */
  clearLogs(): void {
    this.executor.clearLogs();
  }

  /**
   * Validate a flow structure without executing it
   */
  validateFlow(flowData: FlowData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const flow = flowData.flow || flowData;
      
      if (!flow.nodes || !Array.isArray(flow.nodes)) {
        errors.push('Missing or invalid nodes array');
      }
      
      if (!flow.connections || !Array.isArray(flow.connections)) {
        errors.push('Missing or invalid connections array');
      }
      
      // Check for circular dependencies
      if (flow.nodes && flow.connections) {
        // Basic validation - could be extended
        const nodeIds = new Set(flow.nodes.map(n => n.id));
        for (const conn of flow.connections) {
          if (!nodeIds.has(conn.sourceNodeId)) {
            errors.push(`Invalid connection: source node ${conn.sourceNodeId} not found`);
          }
          if (!nodeIds.has(conn.targetNodeId)) {
            errors.push(`Invalid connection: target node ${conn.targetNodeId} not found`);
          }
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        isValid: false,
        errors
      };
    }
  }
} 
