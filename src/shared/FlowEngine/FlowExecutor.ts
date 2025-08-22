import { FlowNode, Connection, ExecutionLog } from '../../types/agent/types';
import { NodeRegistry } from './NodeRegistry';

export interface ExecutionContext {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  log: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, data?: any) => void;
}

export interface FlowExecutorOptions {
  enableLogging?: boolean;
  logLevel?: 'info' | 'warning' | 'error';
  timeout?: number;
  onExecutionLog?: (log: ExecutionLog) => void;
}

export class FlowExecutor {
  private nodeRegistry: NodeRegistry;
  private options: Required<FlowExecutorOptions>;
  private executionLogs: ExecutionLog[] = [];

  constructor(options: FlowExecutorOptions = {}) {
    this.nodeRegistry = new NodeRegistry();
    this.options = {
      enableLogging: true,
      logLevel: 'info',
      timeout: 30000,
      onExecutionLog: () => {},
      ...options
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addLog(level: 'info' | 'success' | 'warning' | 'error', message: string, data?: any, nodeId?: string, nodeName?: string, duration?: number): void {
    const log: ExecutionLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      nodeId,
      nodeName,
      duration
    };

    this.executionLogs.push(log);
    
    if (this.options.onExecutionLog) {
      this.options.onExecutionLog(log);
    }

    if (this.options.enableLogging) {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }

  async executeFlow(
    nodes: FlowNode[], 
    connections: Connection[], 
    inputs: Record<string, any> = {},
    customNodes: any[] = []
  ): Promise<Record<string, any>> {
    this.executionLogs = [];
    this.addLog('info', '🚀 Starting flow execution');
    
    try {
      // Register custom nodes
      for (const customNode of customNodes) {
        this.nodeRegistry.registerCustomNode(customNode);
      }

      this.addLog('info', `Flow has ${nodes.length} nodes`);
      
      // Validate flow structure
      if (!nodes || !Array.isArray(nodes)) {
        throw new Error('Invalid flow: missing nodes array');
      }
      
      // Create execution context
      const nodeOutputs = new Map<string, any>();
      const executedNodes = new Set<string>();
      
      // Find input nodes and set their values
      const inputNodes = nodes.filter(node => node.type === 'input');
      
      for (const inputNode of inputNodes) {
        const inputValue = inputs[inputNode.name] || inputs[inputNode.id] || inputNode.data?.value;
        nodeOutputs.set(inputNode.id, { output: inputValue });
        executedNodes.add(inputNode.id);
        this.addLog('info', `Input node ${inputNode.name}: ${inputValue}`, undefined, inputNode.id, inputNode.name);
      }
      
      // Execute nodes in dependency order
      const executionOrder = this.getExecutionOrder(nodes, connections);
      this.addLog('info', `📋 Execution order: ${executionOrder.map(n => n.name).join(' → ')}`);
      
      for (const node of executionOrder) {
        if (executedNodes.has(node.id)) continue;
        
        const nodeStartTime = Date.now();
        this.addLog('info', `▶️ Executing: ${node.name} (${node.type})`, undefined, node.id, node.name);
        
        try {
          // Get inputs for this node
          const nodeInputs = this.getNodeInputs(node, connections, nodeOutputs);
          
          // Create execution context
          const context: ExecutionContext = {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            log: (message, data) => this.addLog('info', `[${node.name}] ${message}`, data, node.id, node.name),
            warn: (message, data) => this.addLog('warning', `[${node.name}] ${message}`, data, node.id, node.name),
            error: (message, data) => this.addLog('error', `[${node.name}] ${message}`, data, node.id, node.name)
          };
          
          // Execute the node
          const result = await this.nodeRegistry.executeNode(node, nodeInputs, context);
          
          const nodeEndTime = Date.now();
          const nodeDuration = nodeEndTime - nodeStartTime;
          
          this.addLog('success', `✅ ${node.name} completed successfully`, result, node.id, node.name, nodeDuration);
          
          // Store result
          nodeOutputs.set(node.id, result);
          executedNodes.add(node.id);
          
        } catch (error) {
          const nodeEndTime = Date.now();
          const nodeDuration = nodeEndTime - nodeStartTime;
          
          this.addLog('error', `❌ ${node.name} failed: ${error instanceof Error ? error.message : String(error)}`, 
            { error: error instanceof Error ? error.message : String(error) }, node.id, node.name, nodeDuration);
          
          throw error;
        }
      }
      
      // Collect outputs
      const results: Record<string, any> = {};
      const outputNodes = nodes.filter(node => node.type === 'output');
      
      for (const outputNode of outputNodes) {
        const outputValue = nodeOutputs.get(outputNode.id);
        results[outputNode.id] = outputValue;
      }
      
      this.addLog('success', '🎉 Flow execution completed successfully');
      return results;
      
    } catch (error) {
      this.addLog('error', `💥 Flow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private getExecutionOrder(nodes: FlowNode[], connections: Connection[]): FlowNode[] {
    const inDegree: Record<string, number> = {};
    const adjList: Record<string, string[]> = {};
    
    // Initialize
    nodes.forEach(node => {
      inDegree[node.id] = 0;
      adjList[node.id] = [];
    });
    
    // Build adjacency list and count incoming edges
    connections.forEach(conn => {
      adjList[conn.sourceNodeId].push(conn.targetNodeId);
      inDegree[conn.targetNodeId]++;
    });
    
    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    const result: FlowNode[] = [];
    
    // Start with nodes that have no incoming edges
    Object.keys(inDegree).forEach(nodeId => {
      if (inDegree[nodeId] === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        result.push(node);
      }
      
      adjList[nodeId].forEach(targetId => {
        inDegree[targetId]--;
        if (inDegree[targetId] === 0) {
          queue.push(targetId);
        }
      });
    }
    
    return result;
  }

  private getNodeInputs(node: FlowNode, connections: Connection[], nodeOutputs: Map<string, any>): Record<string, any> {
    const inputs: Record<string, any> = {};
    
    connections.forEach(conn => {
      if (conn.targetNodeId === node.id) {
        const sourceOutput = nodeOutputs.get(conn.sourceNodeId);
        if (sourceOutput !== undefined) {
          // Extract the specific output port value
          let sourceValue = sourceOutput;
          
          // If the source result is an object and we have a specific source port, extract that value
          if (typeof sourceOutput === 'object' && sourceOutput !== null && conn.sourcePortId) {
            if (sourceOutput.hasOwnProperty(conn.sourcePortId)) {
              sourceValue = sourceOutput[conn.sourcePortId];
            }
          }
          
          // Map to input port name
          const targetInput = node.inputs?.find(input => input.id === conn.targetPortId);
          const inputName = targetInput?.name || conn.targetPortId;
          inputs[inputName] = sourceValue;
          
          // Also store with the original port ID for compatibility
          inputs[conn.targetPortId] = sourceValue;
        }
      }
    });
    
    return inputs;
  }

  getLogs(): ExecutionLog[] {
    return this.executionLogs;
  }

  clearLogs(): void {
    this.executionLogs = [];
  }
} 
