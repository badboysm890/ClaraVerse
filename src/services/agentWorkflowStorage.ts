import { indexedDBService } from './indexedDB';
import { AgentFlow, FlowNode, Connection } from '../types/agent/types';

// Storage interfaces
export interface StoredAgentFlow extends Omit<AgentFlow, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
  metadata: {
    size: number;
    nodeCount: number;
    connectionCount: number;
    lastModifiedBy?: string;
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
    executionCount: number;
    lastExecutedAt?: string;
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  flow: AgentFlow;
  thumbnail?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  downloads: number;
  rating: number;
}

export interface ImportedWorkflow {
  flow: AgentFlow;
  metadata: {
    importedAt: string;
    originalFormat: string;
    sourceVersion: string;
    migrated: boolean;
    customNodes?: any[];
  };
}

export interface ExportFormat {
  format: 'angela-native' | 'json' | 'n8n-compatible';
  data: any;
  metadata: {
    exportedAt: string;
    exportedBy: string;
    platform: string;
    version: string;
    checksum: string;
  };
}

export interface WorkflowSearchOptions {
  query?: string;
  tags?: string[];
  category?: string;
  isStarred?: boolean;
  isArchived?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'executionCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Production-grade storage service for agent workflows
 * Provides comprehensive CRUD operations, versioning, and data integrity
 */
export class AgentWorkflowStorage {
  private readonly WORKFLOWS_STORE = 'agent_workflows';
  private readonly TEMPLATES_STORE = 'workflow_templates';
  private readonly VERSIONS_STORE = 'workflow_versions';
  private readonly METADATA_STORE = 'workflow_metadata';
  
  private readonly CURRENT_VERSION = '1.0.0';
  private readonly MAX_WORKFLOWS = 1000; // Prevent storage abuse
  private readonly MAX_WORKFLOW_SIZE = 50 * 1024 * 1024; // 50MB max
  
  constructor() {
    this.initializeStores();
  }

  /**
   * Initialize IndexedDB stores if they don't exist
   */
  private async initializeStores(): Promise<void> {
    try {
      // The stores will be created automatically by indexedDB service
      // We just need to ensure they exist
      await indexedDBService.getAll(this.WORKFLOWS_STORE);
    } catch (error) {
      console.warn('IndexedDB stores will be created on first use');
    }
  }

  /**
   * Generate checksum for data integrity
   */
  private generateChecksum(data: any): string {
    const str = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Validate workflow data
   */
  private validateWorkflow(flow: AgentFlow): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!flow.id) errors.push('Workflow ID is required');
    if (!flow.name || flow.name.trim().length === 0) errors.push('Workflow name is required');
    if (!flow.version) errors.push('Workflow version is required');
    if (!Array.isArray(flow.nodes)) errors.push('Nodes must be an array');
    if (!Array.isArray(flow.connections)) errors.push('Connections must be an array');

    // Validate nodes
    flow.nodes?.forEach((node, index) => {
      if (!node.id) errors.push(`Node ${index} is missing ID`);
      if (!node.type) errors.push(`Node ${index} is missing type`);
      if (!node.position) errors.push(`Node ${index} is missing position`);
    });

    // Validate connections
    flow.connections?.forEach((connection, index) => {
      if (!connection.id) errors.push(`Connection ${index} is missing ID`);
      if (!connection.sourceNodeId) errors.push(`Connection ${index} is missing source node ID`);
      if (!connection.targetNodeId) errors.push(`Connection ${index} is missing target node ID`);
    });

    // Check for circular references
    if (this.hasCircularDependencies(flow.nodes, flow.connections)) {
      errors.push('Workflow contains circular dependencies');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Check for circular dependencies in workflow
   */
  private hasCircularDependencies(nodes: FlowNode[], connections: Connection[]): boolean {
    const adjacencyList: Record<string, string[]> = {};
    
    // Build adjacency list
    nodes.forEach(node => {
      adjacencyList[node.id] = [];
    });
    
    connections.forEach(connection => {
      if (adjacencyList[connection.sourceNodeId]) {
        adjacencyList[connection.sourceNodeId].push(connection.targetNodeId);
      }
    });

    // DFS to detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const neighbor of adjacencyList[nodeId] || []) {
        if (hasCycle(neighbor)) return true;
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of Object.keys(adjacencyList)) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Calculate workflow metadata
   */
  private calculateMetadata(flow: AgentFlow): StoredAgentFlow['metadata'] {
    const size = new Blob([JSON.stringify(flow)]).size;
    
    return {
      size,
      nodeCount: flow.nodes.length,
      connectionCount: flow.connections.length,
      tags: flow.tags || [],
      isStarred: false,
      isArchived: false,
      executionCount: 0,
    };
  }

  /**
   * Save workflow to storage
   */
  async saveWorkflow(flow: AgentFlow): Promise<{ success: boolean; id: string; errors?: string[] }> {
    try {
      // Validate workflow
      const validation = this.validateWorkflow(flow);
      if (!validation.isValid) {
        return { success: false, id: flow.id, errors: validation.errors };
      }

      // Check storage limits
      const workflows = await this.getAllWorkflows();
      if (workflows.length >= this.MAX_WORKFLOWS) {
        return { success: false, id: flow.id, errors: ['Maximum workflow limit reached'] };
      }

      const workflowSize = new Blob([JSON.stringify(flow)]).size;
      if (workflowSize > this.MAX_WORKFLOW_SIZE) {
        return { success: false, id: flow.id, errors: ['Workflow too large'] };
      }

      // Create stored workflow
      const existingStoredWorkflow = await indexedDBService.get<StoredAgentFlow>(this.WORKFLOWS_STORE, flow.id);
      const metadata = existingStoredWorkflow?.metadata || this.calculateMetadata(flow);
      
      const storedFlow: StoredAgentFlow = {
        ...flow,
        createdAt: existingStoredWorkflow?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          ...metadata,
          size: workflowSize,
          nodeCount: flow.nodes.length,
          connectionCount: flow.connections.length,
        }
      };

      // Save to IndexedDB
      await indexedDBService.put(this.WORKFLOWS_STORE, storedFlow);

      // Create version snapshot for history
      await this.createVersionSnapshot(flow.id, storedFlow);

      return { success: true, id: flow.id };
    } catch (error) {
      console.error('Error saving workflow:', error);
      return { 
        success: false, 
        id: flow.id, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      };
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: string): Promise<AgentFlow | null> {
    try {
      const storedFlow = await indexedDBService.get<StoredAgentFlow>(this.WORKFLOWS_STORE, id);
      if (!storedFlow) return null;

      // Convert stored flow back to AgentFlow format
      const { metadata, ...flowData } = storedFlow;
      return {
        ...flowData,
        createdAt: storedFlow.createdAt,
        updatedAt: storedFlow.updatedAt,
        tags: metadata.tags, // Restore tags from metadata
      };
    } catch (error) {
      console.error('Error getting workflow:', error);
      return null;
    }
  }

  /**
   * Get all workflows with optional filtering
   */
  async getAllWorkflows(options: WorkflowSearchOptions = {}): Promise<AgentFlow[]> {
    try {
      const storedFlows = await indexedDBService.getAll<StoredAgentFlow>(this.WORKFLOWS_STORE);
      
      let filteredFlows = storedFlows.filter(flow => {
        if (options.isArchived !== undefined && flow.metadata.isArchived !== options.isArchived) {
          return false;
        }
        if (options.isStarred !== undefined && flow.metadata.isStarred !== options.isStarred) {
          return false;
        }
        if (options.query) {
          const query = options.query.toLowerCase();
          return flow.name.toLowerCase().includes(query) || 
                 flow.description?.toLowerCase().includes(query) ||
                 flow.metadata.tags.some(tag => tag.toLowerCase().includes(query));
        }
        if (options.tags && options.tags.length > 0) {
          return options.tags.some(tag => flow.metadata.tags.includes(tag));
        }
        return true;
      });

      // Sort results
      if (options.sortBy) {
        const sortOrder = options.sortOrder || 'desc';
        filteredFlows.sort((a, b) => {
          let aValue, bValue;
          
          switch (options.sortBy) {
            case 'name':
              aValue = a.name.toLowerCase();
              bValue = b.name.toLowerCase();
              break;
            case 'createdAt':
              aValue = new Date(a.createdAt).getTime();
              bValue = new Date(b.createdAt).getTime();
              break;
            case 'updatedAt':
              aValue = new Date(a.updatedAt).getTime();
              bValue = new Date(b.updatedAt).getTime();
              break;
            case 'executionCount':
              aValue = a.metadata.executionCount;
              bValue = b.metadata.executionCount;
              break;
            default:
              return 0;
          }

          if (sortOrder === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          }
        });
      }

      // Apply pagination
      if (options.offset || options.limit) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : undefined;
        filteredFlows = filteredFlows.slice(start, end);
      }

      return filteredFlows.map(flow => {
        const { metadata, ...flowData } = flow;
        return {
          ...flowData,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
          tags: metadata.tags, // Restore tags from metadata
        };
      });
    } catch (error) {
      console.error('Error getting workflows:', error);
      return [];
    }
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string): Promise<boolean> {
    try {
      await indexedDBService.delete(this.WORKFLOWS_STORE, id);
      
      // Also delete version history
      const versions = await indexedDBService.getAll<any>(this.VERSIONS_STORE);
      const workflowVersions = versions.filter(v => v.workflowId === id);
      
      for (const version of workflowVersions) {
        await indexedDBService.delete(this.VERSIONS_STORE, version.id);
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting workflow:', error);
      return false;
    }
  }

  /**
   * Update workflow metadata
   */
  async updateWorkflowMetadata(id: string, updates: Partial<StoredAgentFlow['metadata']>): Promise<boolean> {
    try {
      const workflow = await indexedDBService.get<StoredAgentFlow>(this.WORKFLOWS_STORE, id);
      if (!workflow) return false;

      const updatedWorkflow = {
        ...workflow,
        metadata: { ...workflow.metadata, ...updates },
        updatedAt: new Date().toISOString()
      };

      await indexedDBService.put(this.WORKFLOWS_STORE, updatedWorkflow);
      return true;
    } catch (error) {
      console.error('Error updating workflow metadata:', error);
      return false;
    }
  }

  /**
   * Export workflow in specified format
   */
  async exportWorkflow(id: string, format: ExportFormat['format'] = 'angela-native'): Promise<ExportFormat | null> {
    try {
      const workflow = await this.getWorkflow(id);
      if (!workflow) return null;

      let exportData: any;

      switch (format) {
        case 'angela-native':
          exportData = workflow;
          break;
        case 'json':
          exportData = JSON.stringify(workflow, null, 2);
          break;
        case 'n8n-compatible':
          exportData = this.convertToN8NFormat(workflow);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      const exportFormat: ExportFormat = {
        format,
        data: exportData,
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: 'angela Agent Builder',
          platform: 'angela',
          version: this.CURRENT_VERSION,
          checksum: this.generateChecksum(exportData)
        }
      };

      return exportFormat;
    } catch (error) {
      console.error('Error exporting workflow:', error);
      return null;
    }
  }

  /**
   * Import workflow from external format
   */
  async importWorkflow(data: any, sourceFormat?: string): Promise<ImportedWorkflow | null> {
    try {
      let flow: AgentFlow;
      let migrated = false;
      let customNodes: any[] = [];

      // Detect format if not specified
      if (!sourceFormat) {
        sourceFormat = this.detectFormat(data);
      }

      switch (sourceFormat) {
        case 'angela-native':
          flow = data;
          break;
        case 'angela-native-nested':
          flow = data.flow;
          // Extract custom nodes if present
          if (data.customNodes && Array.isArray(data.customNodes)) {
            customNodes = data.customNodes;
          }
          break;
        case 'angela-sdk':
          flow = data.flow;
          // Extract custom nodes if present
          if (data.customNodes && Array.isArray(data.customNodes)) {
            customNodes = data.customNodes;
          }
          break;
        case 'n8n':
          flow = this.convertFromN8NFormat(data);
          migrated = true;
          break;
        case 'json':
          flow = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
          break;
        default:
          throw new Error(`Unsupported import format: ${sourceFormat}`);
      }

      // Validate imported workflow
      const validation = this.validateWorkflow(flow);
      if (!validation.isValid) {
        throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
      }

      // Generate new ID to avoid conflicts
      flow.id = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      flow.name = `${flow.name} (Imported)`;

      const importedWorkflow: ImportedWorkflow = {
        flow,
        metadata: {
          importedAt: new Date().toISOString(),
          originalFormat: sourceFormat,
          sourceVersion: data.version || 'unknown',
          migrated,
          customNodes: customNodes.length > 0 ? customNodes : undefined
        } as any
      };

      return importedWorkflow;
    } catch (error) {
      console.error('Error importing workflow:', error);
      return null;
    }
  }

  /**
   * Create version snapshot for workflow history
   */
  private async createVersionSnapshot(workflowId: string, workflow: StoredAgentFlow): Promise<void> {
    try {
      const versions = await indexedDBService.getAll<any>(this.VERSIONS_STORE);
      const workflowVersions = versions.filter(v => v.workflowId === workflowId);
      const versionNumber = workflowVersions.length + 1;

      const snapshot = {
        id: `${workflowId}-v${versionNumber}`,
        workflowId,
        versionNumber,
        workflow: { ...workflow },
        createdAt: new Date().toISOString(),
        checksum: this.generateChecksum(workflow)
      };

      await indexedDBService.put(this.VERSIONS_STORE, snapshot);

      // Keep only last 10 versions to prevent storage bloat
      if (workflowVersions.length >= 10) {
        const oldestVersions = workflowVersions
          .sort((a, b) => a.versionNumber - b.versionNumber)
          .slice(0, workflowVersions.length - 9);
        
        for (const version of oldestVersions) {
          await indexedDBService.delete(this.VERSIONS_STORE, version.id);
        }
      }
    } catch (error) {
      console.error('Error creating version snapshot:', error);
    }
  }

  /**
   * Detect import format from data structure
   */
  private detectFormat(data: any): string {
    if (typeof data === 'string') return 'json';
    
    // Check for new angela-sdk format (with nested flow structure)
    if (data.format === 'angela-sdk' && data.flow) return 'angela-sdk';
    
    // Check for angela-native format (with nested flow structure)
    if (data.format === 'angela-native' && data.flow) return 'angela-native-nested';
    
    // Check for direct flow structure (old format)
    if (data.nodes && data.connections && data.id) return 'angela-native';
    
    // Check for n8n format
    if (data.nodes && Array.isArray(data.nodes) && data.nodes[0]?.type) return 'n8n';
    
    return 'unknown';
  }

  /**
   * Convert angela workflow to n8n format (basic conversion)
   */
  private convertToN8NFormat(workflow: AgentFlow): any {
    // This is a simplified conversion - in production you'd want more sophisticated mapping
    return {
      name: workflow.name,
      nodes: workflow.nodes.map(node => ({
        name: node.name,
        type: this.mapangelaTypeToN8N(node.type),
        position: [node.position.x, node.position.y],
        parameters: node.data || {}
      })),
      connections: this.convertConnectionsToN8N(workflow.connections),
      settings: workflow.settings,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt
    };
  }

  /**
   * Convert n8n workflow to angela format (basic conversion)
   */
  private convertFromN8NFormat(n8nWorkflow: any): AgentFlow {
    return {
      id: `n8n-${Date.now()}`,
      name: n8nWorkflow.name || 'Imported N8N Workflow',
      description: 'Imported from n8n',
      nodes: n8nWorkflow.nodes?.map((node: any) => ({
        id: node.name,
        type: this.mapN8NTypeToCrara(node.type),
        name: node.name,
        position: { x: node.position[0] || 0, y: node.position[1] || 0 },
        data: node.parameters || {},
        inputs: [],
        outputs: [],
        metadata: {}
      })) || [],
      connections: this.convertN8NConnectionsToCrara(n8nWorkflow.connections || []),
      variables: [],
      settings: n8nWorkflow.settings || { name: n8nWorkflow.name, version: '1.0.0' },
      createdAt: n8nWorkflow.createdAt || new Date().toISOString(),
      updatedAt: n8nWorkflow.updatedAt || new Date().toISOString(),
      version: '1.0.0',
      tags: ['imported', 'n8n']
    };
  }

  /**
   * Map angela node types to n8n types
   */
  private mapangelaTypeToN8N(angelaType: string): string {
    const typeMap: Record<string, string> = {
      'input': 'Set',
      'output': 'Set',
      'llm': 'OpenAI',
      'json-parse': 'Code',
      'if-else': 'If'
    };
    return typeMap[angelaType] || 'Code';
  }

  /**
   * Map n8n node types to angela types
   */
  private mapN8NTypeToCrara(n8nType: string): string {
    const typeMap: Record<string, string> = {
      'Set': 'input',
      'OpenAI': 'llm',
      'Code': 'json-parse',
      'If': 'if-else'
    };
    return typeMap[n8nType] || 'input';
  }

  /**
   * Convert angela connections to n8n format
   */
  private convertConnectionsToN8N(connections: Connection[]): any {
    // Simplified conversion - n8n has a different connection structure
    const n8nConnections: any = {};
    
    connections.forEach(conn => {
      if (!n8nConnections[conn.sourceNodeId]) {
        n8nConnections[conn.sourceNodeId] = { main: [[]] };
      }
      n8nConnections[conn.sourceNodeId].main[0].push({
        node: conn.targetNodeId,
        type: 'main',
        index: 0
      });
    });

    return n8nConnections;
  }

  /**
   * Convert n8n connections to angela format
   */
  private convertN8NConnectionsToCrara(n8nConnections: any): Connection[] {
    const connections: Connection[] = [];
    
    Object.entries(n8nConnections).forEach(([sourceNode, connData]: [string, any]) => {
      connData.main[0]?.forEach((conn: any, index: number) => {
        connections.push({
          id: `${sourceNode}-${conn.node}-${index}`,
          sourceNodeId: sourceNode,
          sourcePortId: 'output',
          targetNodeId: conn.node,
          targetPortId: 'input'
        });
      });
    });

    return connections;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalWorkflows: number;
    totalSize: number;
    archivedCount: number;
    starredCount: number;
    averageSize: number;
    oldestWorkflow?: string;
    newestWorkflow?: string;
  }> {
    try {
      const workflows = await indexedDBService.getAll<StoredAgentFlow>(this.WORKFLOWS_STORE);
      
      const totalWorkflows = workflows.length;
      const totalSize = workflows.reduce((sum, flow) => sum + flow.metadata.size, 0);
      const archivedCount = workflows.filter(flow => flow.metadata.isArchived).length;
      const starredCount = workflows.filter(flow => flow.metadata.isStarred).length;
      const averageSize = totalWorkflows > 0 ? totalSize / totalWorkflows : 0;

      const sortedByDate = workflows.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      return {
        totalWorkflows,
        totalSize,
        archivedCount,
        starredCount,
        averageSize,
        oldestWorkflow: sortedByDate[0]?.name,
        newestWorkflow: sortedByDate[sortedByDate.length - 1]?.name
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalWorkflows: 0,
        totalSize: 0,
        archivedCount: 0,
        starredCount: 0,
        averageSize: 0
      };
    }
  }

  /**
   * Clean up old data and optimize storage
   */
  async cleanup(): Promise<{ deletedWorkflows: number; freedSpace: number }> {
    try {
      const workflows = await indexedDBService.getAll<StoredAgentFlow>(this.WORKFLOWS_STORE);
      
      // Delete archived workflows older than 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      
      const toDelete = workflows.filter(flow => 
        flow.metadata.isArchived && 
        new Date(flow.updatedAt) < cutoffDate
      );

      let freedSpace = 0;
      for (const workflow of toDelete) {
        freedSpace += workflow.metadata.size;
        await this.deleteWorkflow(workflow.id);
      }

      return {
        deletedWorkflows: toDelete.length,
        freedSpace
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      return { deletedWorkflows: 0, freedSpace: 0 };
    }
  }
}

// Export singleton instance
export const agentWorkflowStorage = new AgentWorkflowStorage(); 
