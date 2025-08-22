import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { 
  AgentFlow, 
  FlowNode, 
  Connection, 
  CanvasState, 
  NodeDefinition,
  FlowTemplate,
  ExecutionLog,
  FlowVariable,
  FlowSettings,
  UIDefinition
} from '../../types/agent/types';
import { simpleNodeDefinitions } from '../../services/agents/simpleNodeDefinitions';
import { agentWorkflowStorage, ImportedWorkflow } from '../../services/agentWorkflowStorage';
import { customNodeManager } from '../../components/AgentBuilder/NodeCreator/CustomNodeManager';
import { FlowExecutor } from '../../shared/FlowEngine';

interface AgentBuilderContextType {
  // Current Flow State
  currentFlow: AgentFlow | null;
  nodes: FlowNode[];
  connections: Connection[];
  
  // Canvas State
  canvas: CanvasState;
  
  // Node Library
  nodeDefinitions: NodeDefinition[];
  customNodes: NodeDefinition[];
  
  // Templates
  templates: FlowTemplate[];
  
  // Execution State
  executionResults: Record<string, any>;
  nodeExecutionStates: Record<string, { status: 'idle' | 'executing' | 'success' | 'error'; error?: string }>;
  
  // Execution Logs
  executionLogs: ExecutionLog[];
  isExecutionLogOpen: boolean;
  
  // Flow Management
  createNewFlow: (name: string, description?: string, icon?: string) => AgentFlow;
  loadFlow: (flow: AgentFlow) => void;
  saveFlow: () => Promise<void>;
  exportFlow: (format: string) => Promise<any>;
  importFlow: (data: any) => Promise<AgentFlow>;
  
  // Node Management
  addNode: (type: string, position: { x: number; y: number }) => FlowNode;
  updateNode: (nodeId: string, updates: Partial<FlowNode>) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => FlowNode;
  
  // Connection Management
  addConnection: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => Connection;
  updateConnection: (connectionId: string, updates: Partial<Connection>) => void;
  deleteConnection: (connectionId: string) => void;
  
  // Canvas Management
  updateCanvas: (updates: Partial<CanvasState>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToScreen: () => void;
  
  // Selection Management
  selectNodes: (nodeIds: string[]) => void;
  selectConnections: (connectionIds: string[]) => void;
  clearSelection: () => void;
  
  // Node Library Management
  registerNodeDefinition: (definition: NodeDefinition) => void;
  unregisterNodeDefinition: (nodeType: string) => void;
  getNodeDefinition: (nodeType: string) => NodeDefinition | undefined;
  syncCustomNodes: () => void;
  
  // Validation
  validateFlow: () => { isValid: boolean; errors: string[] };
  
  // Execution
  executeFlow: () => Promise<void>;
  stopExecution: () => void;
  clearExecutionResults: () => void;
  
  // Execution Logs
  addExecutionLog: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  clearExecutionLogs: () => void;
  toggleExecutionLog: () => void;
  
  // State
  isExecuting: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  
  // Draft State Management (optional - for advanced use cases)
  saveDraftState?: () => void;
  clearDraftState?: () => void;
}

const AgentBuilderContext = createContext<AgentBuilderContextType | undefined>(undefined);

export const useAgentBuilder = () => {
  const context = useContext(AgentBuilderContext);
  if (context === undefined) {
    throw new Error('useAgentBuilder must be used within an AgentBuilderProvider');
  }
  return context;
};

interface AgentBuilderProviderProps {
  children: ReactNode;
}

export const AgentBuilderProvider: React.FC<AgentBuilderProviderProps> = ({ children }) => {
  // State
  const [currentFlow, setCurrentFlow] = useState<AgentFlow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [canvas, setCanvas] = useState<CanvasState>({
    viewport: { x: 0, y: 0, zoom: 1 },
    selection: { nodeIds: [], connectionIds: [] }
  });
  const [nodeDefinitions, setNodeDefinitions] = useState<NodeDefinition[]>([]);
  const [customNodes, setCustomNodes] = useState<NodeDefinition[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const [nodeExecutionStates, setNodeExecutionStates] = useState<Record<string, { status: 'idle' | 'executing' | 'success' | 'error'; error?: string }>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isExecutionLogOpen, setIsExecutionLogOpen] = useState(false);

  // Initialize default node definitions
  useEffect(() => {
    setNodeDefinitions(simpleNodeDefinitions);
  }, []);

  // Sync custom nodes from CustomNodeManager
  const syncCustomNodes = useCallback(() => {
    const customNodesFromManager = customNodeManager.getCustomNodes();
    setCustomNodes(customNodesFromManager);
  }, []);

  // Initialize and sync custom nodes
  useEffect(() => {
    syncCustomNodes();
  }, [syncCustomNodes]);

  // Helper to generate unique IDs
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Helper to clean node data by removing non-serializable functions
  const cleanNodeData = (data: any): any => {
    if (!data || typeof data !== 'object') return data;
    return Object.fromEntries(
      Object.entries(data).filter(([key, value]) => typeof value !== 'function')
    );
  };

  // Auto-save and state persistence functionality
  const DRAFT_STATE_KEY = 'angela-verse-draft-state';
  const AUTO_SAVE_INTERVAL = 5000; // 5 seconds

  // Create a serializable state snapshot
  const createStateSnapshot = useCallback(() => {
    return {
      currentFlow,
      nodes: nodes.map(node => ({ ...node, data: cleanNodeData(node.data) })),
      connections,
      canvas,
      executionResults,
      nodeExecutionStates,
      executionLogs,
      isExecutionLogOpen,
      hasUnsavedChanges,
      lastSaved: lastSaved?.toISOString() || null,
      timestamp: new Date().toISOString()
    };
  }, [currentFlow, nodes, connections, canvas, executionResults, nodeExecutionStates, executionLogs, isExecutionLogOpen, hasUnsavedChanges, lastSaved]);

  // Save current state to localStorage
  const saveDraftState = useCallback(() => {
    try {
      const snapshot = createStateSnapshot();
      const serializedState = JSON.stringify(snapshot);
      localStorage.setItem(DRAFT_STATE_KEY, serializedState);
      console.log('Draft state saved automatically', {
        currentFlow: snapshot.currentFlow?.name || 'none',
        nodes: snapshot.nodes.length,
        connections: snapshot.connections.length,
        sizeBytes: serializedState.length,
        timestamp: snapshot.timestamp
      });
    } catch (error) {
      console.warn('Failed to save draft state:', error);
    }
  }, [createStateSnapshot]);

  // Restore state from localStorage
  const restoreDraftState = useCallback(() => {
    try {
      const savedState = localStorage.getItem(DRAFT_STATE_KEY);
      if (!savedState) {
        console.log('No draft state found to restore');
        return false;
      }

      const snapshot = JSON.parse(savedState);
      console.log('Attempting to restore draft state:', snapshot);
      
      // Check if the saved state is recent (within 24 hours)
      const savedTime = new Date(snapshot.timestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - savedTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        console.log('Draft state is too old (>24 hours), removing it');
        localStorage.removeItem(DRAFT_STATE_KEY);
        return false;
      }

      // Restore state with logging
      if (snapshot.currentFlow) {
        console.log('Restoring current flow:', snapshot.currentFlow.name);
        setCurrentFlow(snapshot.currentFlow);
      }
      if (snapshot.nodes) {
        console.log('Restoring nodes:', snapshot.nodes.length);
        setNodes(snapshot.nodes);
      }
      if (snapshot.connections) {
        console.log('Restoring connections:', snapshot.connections.length);
        setConnections(snapshot.connections);
      }
      if (snapshot.canvas) {
        console.log('Restoring canvas state');
        setCanvas(snapshot.canvas);
      }
      if (snapshot.executionResults) {
        setExecutionResults(snapshot.executionResults);
      }
      if (snapshot.nodeExecutionStates) {
        setNodeExecutionStates(snapshot.nodeExecutionStates);
      }
      if (snapshot.executionLogs) {
        setExecutionLogs(snapshot.executionLogs);
      }
      if (typeof snapshot.isExecutionLogOpen === 'boolean') {
        setIsExecutionLogOpen(snapshot.isExecutionLogOpen);
      }
      if (typeof snapshot.hasUnsavedChanges === 'boolean') {
        setHasUnsavedChanges(snapshot.hasUnsavedChanges);
      }
      if (snapshot.lastSaved) {
        setLastSaved(new Date(snapshot.lastSaved));
      }

      console.log('Draft state restored successfully');
      return true;
    } catch (error) {
      console.warn('Failed to restore draft state:', error);
      localStorage.removeItem(DRAFT_STATE_KEY);
      return false;
    }
  }, [
    setCurrentFlow, 
    setNodes, 
    setConnections, 
    setCanvas, 
    setExecutionResults, 
    setNodeExecutionStates, 
    setExecutionLogs, 
    setIsExecutionLogOpen, 
    setHasUnsavedChanges, 
    setLastSaved
  ]);

  // Clear draft state
  const clearDraftState = useCallback(() => {
    localStorage.removeItem(DRAFT_STATE_KEY);
  }, []);

  // Check for draft state on mount
  useEffect(() => {
    const restored = restoreDraftState();
    if (restored) {
      console.log('Previous session restored');
    }
  }, [restoreDraftState]);

  // Auto-save functionality
  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-save if there are meaningful changes
      if (nodes.length > 0 || connections.length > 0 || currentFlow) {
        console.log('Auto-saving draft state...', {
          nodes: nodes.length,
          connections: connections.length,
          hasFlow: !!currentFlow,
          hasUnsavedChanges
        });
        saveDraftState();
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [saveDraftState, nodes.length, connections.length, currentFlow, hasUnsavedChanges]);

  // Save on beforeunload (when user navigates away or closes browser)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (nodes.length > 0 || connections.length > 0 || currentFlow) {
        saveDraftState();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveDraftState, nodes.length, connections.length, currentFlow]);

  // Save when visibility changes (user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (nodes.length > 0 || connections.length > 0 || currentFlow)) {
        saveDraftState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveDraftState, nodes.length, connections.length, currentFlow]);

  // Execution Logs
  const addExecutionLog = useCallback((log: Omit<ExecutionLog, 'id' | 'timestamp'>) => {
    const newLog: ExecutionLog = {
      ...log,
      id: generateId(),
      timestamp: new Date().toISOString()
    };
    setExecutionLogs(prev => [...prev, newLog]);
  }, []);

  const clearExecutionLogs = useCallback(() => {
    setExecutionLogs([]);
  }, []);

  const toggleExecutionLog = useCallback(() => {
    setIsExecutionLogOpen(prev => !prev);
  }, []);

  // Flow Management
  const createNewFlow = useCallback((name: string, description?: string, icon?: string): AgentFlow => {
    const newFlow: AgentFlow = {
      id: generateId(),
      name,
      description,
      icon,
      nodes: [],
      connections: [],
      variables: [],
      settings: {
        name,
        description,
        version: '1.0.0'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    setCurrentFlow(newFlow);
    setNodes([]);
    setConnections([]);
    setHasUnsavedChanges(false);
    
    // Clear draft state since we're starting fresh
    clearDraftState();
    
    return newFlow;
  }, [clearDraftState]);

  const loadFlow = useCallback((flow: AgentFlow) => {
    setCurrentFlow(flow);
    setNodes(flow.nodes);
    setConnections(flow.connections);
    setHasUnsavedChanges(false);
    setLastSaved(new Date(flow.updatedAt));
    
    // Clear draft state since we're loading a saved workflow
    clearDraftState();
  }, [clearDraftState]);

  const saveFlow = useCallback(async () => {
    if (!currentFlow) return;
    
    // Clean node data to remove non-serializable functions
    const cleanNodes = nodes.map(node => ({
      ...node,
      data: cleanNodeData(node.data)
    }));
    
    const updatedFlow: AgentFlow = {
      ...currentFlow,
      nodes: cleanNodes,
      connections,
      updatedAt: new Date().toISOString()
    };
    
    try {
      const result = await agentWorkflowStorage.saveWorkflow(updatedFlow);
      if (result.success) {
        console.log('Workflow saved successfully:', result.id);
        setCurrentFlow(updatedFlow);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        
        // Clear draft state since workflow is now saved
        clearDraftState();
      } else {
        console.error('Failed to save workflow:', result.errors);
        throw new Error(result.errors?.join(', ') || 'Unknown error');
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      throw error;
    }
  }, [currentFlow, nodes, connections, clearDraftState]);

  // Helper function to generate JavaScript code from a flow
  const generateFlowCode = (flow: AgentFlow, flowNodes: FlowNode[], flowConnections: Connection[], customNodeTypes: Set<string>): string => {
    const className = flow.name.replace(/[^a-zA-Z0-9]/g, '') + 'Flow';
    const customNodeDefinitions: any[] = [];
    
    // Include custom node definitions with their execution code
    for (const nodeType of Array.from(customNodeTypes)) {
      const customNode = customNodeManager.getCustomNode(nodeType);
      if (customNode) {
        customNodeDefinitions.push({
          id: customNode.id,
          type: customNode.type,
          name: customNode.name,
          description: customNode.description,
          icon: customNode.icon,
          category: customNode.category,
          inputs: customNode.inputs,
          outputs: customNode.outputs,
          properties: customNode.properties,
          executionCode: customNode.executionCode,
          metadata: customNode.metadata
        });
      }
    }

    const flowData = {
      format: 'angela-sdk',
      version: '1.0.0',
      flow: {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        nodes: flowNodes.map(node => cleanNodeData(node)),
        connections: flowConnections.map(conn => ({
          id: conn.id,
          sourceNodeId: conn.sourceNodeId,
          sourcePortId: conn.sourcePortId,
          targetNodeId: conn.targetNodeId,
          targetPortId: conn.targetPortId
        })),
        customNodes: customNodeDefinitions
      },
      metadata: {
        createdAt: new Date().toISOString(),
        exportedAt: new Date().toISOString(),
        exportedFrom: 'angela Agent Studio',
        hasCustomNodes: customNodeDefinitions.length > 0
      }
    };

    return `/**
 * Generated by angela Agent Studio
 * Flow: ${flow.name}
 * Description: ${flow.description || 'AI workflow generated from angela Agent Studio'}
 * Generated at: ${new Date().toISOString()}
 */

import { angelaFlowRunner } from 'angela-flow-sdk';

export class ${className} {
  constructor(options = {}) {
    this.runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'info',
      ...options
    });
    
    this.flowData = ${JSON.stringify(flowData, null, 2)};
    
    this.registerCustomNodes();
  }

  registerCustomNodes() {
    // Register all custom nodes used in this flow
    if (this.flowData.flow.customNodes) {
      this.flowData.flow.customNodes.forEach(node => {
        this.runner.registerCustomNode(node);
      });
    }
  }

  async execute(inputs = {}) {
    return await this.runner.executeFlow(this.flowData, inputs);
  }

  async executeBatch(inputSets, options = {}) {
    const { concurrency = 3, onProgress } = options;
    const results = [];
    
    for (let i = 0; i < inputSets.length; i += concurrency) {
      const batch = inputSets.slice(i, i + concurrency);
      const batchPromises = batch.map(inputs => this.execute(inputs));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress({
          completed: Math.min(i + concurrency, inputSets.length),
          total: inputSets.length,
          results: results
        });
      }
    }
    
    return results;
  }

  async executeWithCallback(inputs = {}, onNodeComplete = null) {
    return await this.runner.executeFlow(this.flowData, inputs, {
      onNodeComplete: onNodeComplete
    });
  }

  getFlowInfo() {
    return {
      name: this.flowData.flow.name,
      description: this.flowData.flow.description,
      nodeCount: this.flowData.flow.nodes.length,
      connectionCount: this.flowData.flow.connections.length,
      customNodeCount: this.flowData.flow.customNodes?.length || 0,
      hasCustomNodes: this.flowData.metadata.hasCustomNodes
    };
  }

  validate() {
    return this.runner.validateFlow(this.flowData);
  }
}

// Export for direct use
export const ${flow.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}Flow = new ${className}();
export default ${className};

// Usage Examples:
/*
// Basic usage
import { ${className} } from './${flow.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_flow.js';

const flow = new ${className}();
const result = await flow.execute({ input: "Hello World" });
console.log(result);

// Batch processing
const inputSets = [
  { input: "Hello" },
  { input: "World" },
  { input: "angela" }
];

const results = await flow.executeBatch(inputSets, {
  concurrency: 2,
  onProgress: (progress) => {
    console.log(\`Progress: \${progress.completed}/\${progress.total}\`);
  }
});

// With node completion callbacks
const result = await flow.executeWithCallback(
  { input: "Hello" },
  (nodeId, nodeName, result) => {
    console.log(\`Node \${nodeName} completed with result:\`, result);
  }
);
*/`;
  };

  const exportFlow = async (format: string = 'angela-native') => {
    if (!currentFlow) {
      throw new Error('No flow to export');
    }

    try {
      let exportData: any;
      let filename: string;
      let mimeType: string;

      // Get all custom node types used in the flow
      const customNodeTypes = new Set<string>();
      nodes.forEach(node => {
        if (customNodeManager.isCustomNode(node.type)) {
          customNodeTypes.add(node.type);
        }
      });

      // Include custom node definitions with their execution code for ALL formats
      const customNodeDefinitions: any[] = [];
      for (const nodeType of Array.from(customNodeTypes)) {
        const customNode = customNodeManager.getCustomNode(nodeType);
        if (customNode) {
          customNodeDefinitions.push({
            id: customNode.id,
            type: customNode.type,
            name: customNode.name,
            description: customNode.description,
            category: customNode.category,
            icon: customNode.icon,
            inputs: customNode.inputs,
            outputs: customNode.outputs,
            properties: customNode.properties,
            executionCode: customNode.executionCode,
            metadata: customNode.metadata
          });
        }
      }

      if (format === 'angela-sdk') {
        exportData = {
          format: 'angela-sdk',
          version: '1.0.0',
          flow: {
            id: currentFlow.id,
            name: currentFlow.name,
            description: currentFlow.description,
            nodes: nodes.map(node => cleanNodeData(node)),
            connections: connections.map(conn => ({
              id: conn.id,
              sourceNodeId: conn.sourceNodeId,
              sourcePortId: conn.sourcePortId,
              targetNodeId: conn.targetNodeId,
              targetPortId: conn.targetPortId
            })),
            variables: currentFlow.variables || [],
            settings: currentFlow.settings,
            createdAt: currentFlow.createdAt,
            updatedAt: currentFlow.updatedAt,
            version: currentFlow.version
          },
          customNodes: customNodeDefinitions,
          metadata: {
            exportedAt: new Date().toISOString(),
            exportedBy: 'angela Agent Studio',
            hasCustomNodes: customNodeDefinitions.length > 0
          }
        };
        
        filename = `${currentFlow.name.replace(/[^a-zA-Z0-9]/g, '_')}_flow_sdk.json`;
        mimeType = 'application/json';
      } else if (format === 'sdk-code') {
        // Generate ready-to-use JavaScript/TypeScript code
        exportData = generateFlowCode(currentFlow, nodes, connections, customNodeTypes);
        filename = `${currentFlow.name.replace(/[^a-zA-Z0-9]/g, '_')}_flow.js`;
        mimeType = 'text/javascript';
      } else {
        // angela-native format (default) - now includes custom nodes
        exportData = {
          format: 'angela-native',
          version: '1.0.0',
          flow: {
            id: currentFlow.id,
            name: currentFlow.name,
            description: currentFlow.description,
            nodes: nodes.map(node => cleanNodeData(node)),
            connections: connections.map(conn => ({
              id: conn.id,
              sourceNodeId: conn.sourceNodeId,
              sourcePortId: conn.sourcePortId,
              targetNodeId: conn.targetNodeId,
              targetPortId: conn.targetPortId
            })),
            variables: currentFlow.variables || [],
            settings: currentFlow.settings,
            createdAt: currentFlow.createdAt,
            updatedAt: currentFlow.updatedAt,
            version: currentFlow.version
          },
          customNodes: customNodeDefinitions,
          metadata: {
            exportedAt: new Date().toISOString(),
            exportedBy: 'angela Agent Studio',
            hasCustomNodes: customNodeDefinitions.length > 0
          }
        };
        
        filename = `${currentFlow.name.replace(/[^a-zA-Z0-9]/g, '_')}_flow.json`;
        mimeType = 'application/json';
      }

      // Create and download file
      const blob = new Blob(
        [format === 'sdk-code' ? exportData : JSON.stringify(exportData, null, 2)], 
        { type: mimeType }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Log success
      addExecutionLog({
        level: 'success',
        message: `Flow exported successfully as ${format} format`,
        data: { 
          filename, 
          nodeCount: nodes.length, 
          customNodeCount: customNodeDefinitions.length 
        }
      });

      return exportData;
    } catch (error) {
      addExecutionLog({
        level: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }
  };

  const importFlow = useCallback(async (data: any, sourceFormat?: string): Promise<AgentFlow> => {
    try {
      const importedResult = await agentWorkflowStorage.importWorkflow(data, sourceFormat);
      if (!importedResult) {
        throw new Error('Failed to import workflow');
      }
      
      const { flow, metadata } = importedResult;
      
      // Handle custom nodes if they were included in the import
      if (metadata.customNodes && Array.isArray(metadata.customNodes)) {
        const importedCustomNodes = metadata.customNodes;
        let registeredCount = 0;
        let skippedCount = 0;
        
        for (const customNodeDef of importedCustomNodes) {
          try {
            // Check if custom node already exists
            const existingNode = customNodeManager.getCustomNode(customNodeDef.type);
            if (existingNode) {
              console.log(`Custom node "${customNodeDef.name}" already exists, skipping...`);
              skippedCount++;
              continue;
            }
            
            // Register the custom node
            customNodeManager.registerCustomNode(customNodeDef);
            registeredCount++;
            console.log(`Registered custom node: ${customNodeDef.name}`);
          } catch (error) {
            console.error(`Failed to register custom node "${customNodeDef.name}":`, error);
            skippedCount++;
          }
        }
        
        // Update custom nodes state and sync
        setCustomNodes(customNodeManager.getCustomNodes());
        syncCustomNodes();
        
        addExecutionLog({
          level: 'info',
          message: `Custom nodes processed: ${registeredCount} registered, ${skippedCount} skipped`,
          data: {
            registered: registeredCount,
            skipped: skippedCount,
            total: importedCustomNodes.length
          }
        });
      }
      
      // Load the imported workflow
      loadFlow(flow);
      
      // Show success message with migration info
      if (metadata.migrated) {
        addExecutionLog({
          level: 'success',
          message: `Workflow imported and migrated from ${metadata.originalFormat}`,
          data: { originalFormat: metadata.originalFormat }
        });
      } else {
        addExecutionLog({
          level: 'success',
          message: 'Workflow imported successfully',
          data: { format: metadata.originalFormat }
        });
      }
      
      return flow;
    } catch (error) {
      addExecutionLog({
        level: 'error',
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }
  }, [loadFlow, syncCustomNodes, addExecutionLog]);

  // Node Management
  const addNode = useCallback((type: string, position: { x: number; y: number }): FlowNode => {
    const definition = nodeDefinitions.find(def => def.type === type) || 
                     customNodes.find(def => def.type === type);
    
    if (!definition) {
      throw new Error(`Node definition not found for type: ${type}`);
    }

    const newNode: FlowNode = {
      id: generateId(),
      type,
      name: definition.name,
      position,
      data: {},
      inputs: definition.inputs.map(input => ({
        id: input.id,
        name: input.name,
        type: 'input',
        dataType: input.dataType,
        required: input.required,
        multiple: input.multiple,
        description: input.description
      })),
      outputs: definition.outputs.map(output => ({
        id: output.id,
        name: output.name,
        type: 'output',
        dataType: output.dataType,
        required: output.required,
        multiple: output.multiple,
        description: output.description
      })),
      metadata: definition.metadata
    };

    setNodes(prev => [...prev, newNode]);
    setHasUnsavedChanges(true);
    return newNode;
  }, [nodeDefinitions, customNodes]);

  const updateNode = useCallback((nodeId: string, updates: Partial<FlowNode>) => {
    // Clean updates to remove any functions that can't be serialized
    const cleanUpdates = { ...updates };
    if (cleanUpdates.data) {
      cleanUpdates.data = cleanNodeData(cleanUpdates.data);
    }
    
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, ...cleanUpdates } : node
    ));
    setHasUnsavedChanges(true);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(prev => prev.filter(conn => 
      conn.sourceNodeId !== nodeId && conn.targetNodeId !== nodeId
    ));
    setHasUnsavedChanges(true);
  }, []);

  const duplicateNode = useCallback((nodeId: string): FlowNode => {
    const originalNode = nodes.find(node => node.id === nodeId);
    if (!originalNode) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const duplicatedNode: FlowNode = {
      ...originalNode,
      id: generateId(),
      name: `${originalNode.name} (Copy)`,
      position: {
        x: originalNode.position.x + 50,
        y: originalNode.position.y + 50
      },
      inputs: originalNode.inputs.map(input => ({
        ...input,
        // Keep the same logical ID for port consistency
      })),
      outputs: originalNode.outputs.map(output => ({
        ...output,
        // Keep the same logical ID for port consistency
      }))
    };

    setNodes(prev => [...prev, duplicatedNode]);
    setHasUnsavedChanges(true);
    return duplicatedNode;
  }, [nodes]);

  // Connection Management
  const addConnection = useCallback((
    sourceNodeId: string, 
    sourcePortId: string, 
    targetNodeId: string, 
    targetPortId: string
  ): Connection => {
    const newConnection: Connection = {
      id: generateId(),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId
    };

    setConnections(prev => [...prev, newConnection]);
    setHasUnsavedChanges(true);
    return newConnection;
  }, []);

  const updateConnection = useCallback((connectionId: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(conn => 
      conn.id === connectionId ? { ...conn, ...updates } : conn
    ));
    setHasUnsavedChanges(true);
  }, []);

  const deleteConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.filter(conn => conn.id !== connectionId));
    setHasUnsavedChanges(true);
  }, []);

  // Canvas Management
  const updateCanvas = useCallback((updates: Partial<CanvasState>) => {
    setCanvas(prev => ({ ...prev, ...updates }));
  }, []);

  const zoomIn = useCallback(() => {
    setCanvas(prev => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        zoom: Math.min(prev.viewport.zoom * 1.2, 3)
      }
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setCanvas(prev => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        zoom: Math.max(prev.viewport.zoom / 1.2, 0.1)
      }
    }));
  }, []);

  const resetZoom = useCallback(() => {
    setCanvas(prev => ({
      ...prev,
      viewport: { ...prev.viewport, zoom: 1 }
    }));
  }, []);

  const fitToScreen = useCallback(() => {
    // TODO: Implement fit to screen logic based on node positions
    console.log('Fit to screen not implemented yet');
  }, []);

  // Selection Management
  const selectNodes = useCallback((nodeIds: string[]) => {
    setCanvas(prev => ({
      ...prev,
      selection: { ...prev.selection, nodeIds }
    }));
  }, []);

  const selectConnections = useCallback((connectionIds: string[]) => {
    setCanvas(prev => ({
      ...prev,
      selection: { ...prev.selection, connectionIds }
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setCanvas(prev => ({
      ...prev,
      selection: { nodeIds: [], connectionIds: [] }
    }));
  }, []);

  // Node Library Management
  const registerNodeDefinition = useCallback((definition: NodeDefinition) => {
    setNodeDefinitions(prev => {
      const existing = prev.findIndex(def => def.type === definition.type);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = definition;
        return updated;
      }
      return [...prev, definition];
    });
  }, []);

  const unregisterNodeDefinition = useCallback((nodeType: string) => {
    setNodeDefinitions(prev => prev.filter(def => def.type !== nodeType));
  }, []);

  const getNodeDefinition = useCallback((nodeType: string): NodeDefinition | undefined => {
    return nodeDefinitions.find(def => def.type === nodeType) || 
           customNodes.find(def => def.type === nodeType);
  }, [nodeDefinitions, customNodes]);

  // Validation
  const validateFlow = useCallback(() => {
    const errors: string[] = [];
    
    // Check for disconnected nodes
    const connectedNodeIds = new Set([
      ...connections.map(c => c.sourceNodeId),
      ...connections.map(c => c.targetNodeId)
    ]);
    
    const disconnectedNodes = nodes.filter(node => !connectedNodeIds.has(node.id));
    if (disconnectedNodes.length > 0) {
      errors.push(`${disconnectedNodes.length} nodes are not connected`);
    }
    
    // TODO: Add more validation rules
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, [nodes, connections]);

  // Execution
  const executeFlow = useCallback(async () => {
    if (!currentFlow || nodes.length === 0) {
      addExecutionLog({
        level: 'warning',
        message: 'No flow or nodes to execute'
      });
      return;
    }
    
    setIsExecuting(true);
    setExecutionResults({});
    
    // Reset node states
    const initialStates: Record<string, { status: 'idle' | 'executing' | 'success' | 'error'; error?: string }> = {};
    nodes.forEach(node => {
      initialStates[node.id] = { status: 'idle' };
    });
    setNodeExecutionStates(initialStates);
    
    try {
      // Create shared flow executor
      const executor = new FlowExecutor({
        enableLogging: true,
        onExecutionLog: (log) => {
          // Convert shared engine logs to our format and add them
          addExecutionLog({
            level: log.level,
            message: log.message,
            nodeId: log.nodeId,
            nodeName: log.nodeName,
            duration: log.duration,
            data: log.data
          });
          
          // Update node execution states based on logs
          if (log.nodeId) {
            if (log.message.includes('Executing:')) {
              setNodeExecutionStates(prev => ({
                ...prev,
                [log.nodeId!]: { status: 'executing' }
              }));
            } else if (log.message.includes('completed successfully')) {
              setNodeExecutionStates(prev => ({
                ...prev,
                [log.nodeId!]: { status: 'success', error: undefined }
              }));
            } else if (log.message.includes('failed:')) {
              setNodeExecutionStates(prev => ({
                ...prev,
                [log.nodeId!]: { status: 'error', error: log.data?.error || 'Unknown error' }
              }));
            }
          }
        }
      });
      
      // Get custom nodes from the custom node manager
      const customNodes = customNodeManager.getCustomNodes().map(node => ({
        type: node.type,
        name: node.name,
        description: node.description,
        category: node.category,
        inputs: node.inputs,
        outputs: node.outputs,
        properties: node.properties,
        executionCode: node.executionCode || node.executionHandler,
        metadata: node.metadata
      }));
      
      // Execute using shared engine
      const results = await executor.executeFlow(nodes, connections, {}, customNodes);
      
      // Results are now node-id-based from the FlowExecutor, so we can use them directly
      setExecutionResults(results);
      
    } catch (error) {
      addExecutionLog({
        level: 'error',
        message: `💥 Flow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      // Always reset execution state, regardless of success or failure
      setIsExecuting(false);
    }
  }, [currentFlow, nodes, connections, addExecutionLog]);

  const stopExecution = useCallback(() => {
    setIsExecuting(false);
  }, []);

  const clearExecutionResults = useCallback(() => {
    setExecutionResults({});
  }, []);

  return (
    <AgentBuilderContext.Provider
      value={{
        currentFlow,
        nodes,
        connections,
        canvas,
        nodeDefinitions,
        customNodes,
        templates,
        executionResults,
        nodeExecutionStates,
        executionLogs,
        isExecutionLogOpen,
        isExecuting,
        hasUnsavedChanges,
        lastSaved,
        addExecutionLog,
        clearExecutionLogs,
        toggleExecutionLog,
        executeFlow,
        stopExecution,
        addNode,
        updateNode,
        deleteNode,
        duplicateNode,
        addConnection,
        updateConnection,
        deleteConnection,
        updateCanvas,
        zoomIn,
        zoomOut,
        resetZoom,
        fitToScreen,
        selectNodes,
        selectConnections,
        clearSelection,
        registerNodeDefinition,
        unregisterNodeDefinition,
        getNodeDefinition,
        syncCustomNodes,
        validateFlow,
        createNewFlow,
        loadFlow,
        saveFlow,
        exportFlow,
        importFlow,
        saveDraftState,
        clearDraftState,
        clearExecutionResults
      }}
    >
      {children}
    </AgentBuilderContext.Provider>
  );
};
