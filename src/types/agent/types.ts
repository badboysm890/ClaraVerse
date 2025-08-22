// Core Agent Builder Types

export interface NodePort {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType: string;
  required?: boolean;
  multiple?: boolean;
  description?: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeData {
  [key: string]: any;
}

export interface FlowNode {
  id: string;
  type: string;
  name: string;
  position: NodePosition;
  data: NodeData;
  inputs: NodePort[];
  outputs: NodePort[];
  metadata?: {
    description?: string;
    version?: string;
    author?: string;
    category?: string;
    tags?: string[];
  };
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  metadata?: {
    label?: string;
    color?: string;
  };
}

export interface FlowVariable {
  id: string;
  name: string;
  type: string;
  value: any;
  description?: string;
  scope: 'global' | 'flow' | 'node';
}

export interface FlowSettings {
  name: string;
  description?: string;
  version: string;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffStrategy: 'exponential' | 'linear' | 'fixed';
    delay: number;
  };
  errorHandling?: {
    onError: 'stop' | 'continue' | 'retry';
    fallbackFlow?: string;
  };
}

export interface AgentFlow {
  id: string;
  name: string;
  description?: string;
  icon?: string; // Custom icon (emoji or icon name)
  nodes: FlowNode[];
  connections: Connection[];
  variables: FlowVariable[];
  settings: FlowSettings;
  ui?: UIDefinition;
  createdAt: string;
  updatedAt: string;
  version: string;
  isTemplate?: boolean;
  tags?: string[];
}

// UI Builder Types
export interface UIComponent {
  id: string;
  type: string;
  properties: Record<string, any>;
  children?: UIComponent[];
  bindings?: DataBinding[];
}

export interface DataBinding {
  property: string;
  source: 'node' | 'variable' | 'input';
  sourceId: string;
  sourcePath?: string;
  transform?: string;
}

export interface UIDefinition {
  layout: 'single' | 'multi-page' | 'dashboard';
  pages: UIPage[];
  theme?: UITheme;
  responsive?: boolean;
}

export interface UIPage {
  id: string;
  name: string;
  path: string;
  components: UIComponent[];
  metadata?: {
    title?: string;
    description?: string;
    icon?: string;
  };
}

export interface UITheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: number;
}

// Node Definition Types
export interface NodeDefinition {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  properties: NodePropertyDefinition[];
  executionHandler: string | Function;
  uiHandler?: string | Function;
  metadata?: {
    tags?: string[];
    documentation?: string;
    examples?: any[];
    deprecated?: boolean;
  };
}

export interface NodePortDefinition {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType: string;
  required?: boolean;
  multiple?: boolean;
  description?: string;
  defaultValue?: any;
}

export interface NodePropertyDefinition {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'code';
  required?: boolean;
  defaultValue?: any;
  description?: string;
  options?: Array<{ label: string; value: any }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  };
}

// Custom Node Definition for user-created nodes
export interface CustomNodeDefinition extends NodeDefinition {
  // Execution code as string (sandboxed)
  executionCode: string;
  
  // UI customization options
  uiConfig?: {
    backgroundColor?: string;
    iconUrl?: string;
    customStyling?: string;
  };
  
  // Custom metadata for user-created nodes
  customMetadata: {
    isUserCreated: true;
    createdBy: string;
    createdAt: string;
    sharedWith?: string[]; // User IDs who can access
    published?: boolean; // Available in community marketplace
    downloadCount?: number;
    rating?: number;
  };
}

// Execution Types
export interface ExecutionContext {
  flowId: string;
  executionId: string;
  nodeId: string;
  inputs: Record<string, any>;
  variables: Record<string, any>;
  settings: FlowSettings;
  logger: Logger;
  signal: AbortSignal;
}

export interface ExecutionResult {
  success: boolean;
  outputs?: Record<string, any>;
  error?: Error;
  logs?: LogEntry[];
  metadata?: {
    duration: number;
    memoryUsage?: number;
    retryCount?: number;
  };
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  nodeId?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionLog {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  duration?: number;
  data?: any;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, metadata?: Record<string, any>): void;
}

// Export/Import Types
export interface FlowExport {
  format: 'angela-native' | 'docker' | 'api-server' | 'cloud-function';
  flow: AgentFlow;
  dependencies?: string[];
  configuration?: Record<string, any>;
  metadata?: {
    exportedAt: string;
    exportedBy: string;
    platform: string;
    version: string;
  };
}

export interface DeploymentTarget {
  id: string;
  name: string;
  type: 'local' | 'docker' | 'cloud' | 'api';
  configuration: Record<string, any>;
  status: 'idle' | 'deploying' | 'deployed' | 'failed';
}

// Canvas Types
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasSelection {
  nodeIds: string[];
  connectionIds: string[];
}

export interface CanvasState {
  viewport: CanvasViewport;
  selection: CanvasSelection;
  dragState?: {
    isDragging: boolean;
    dragType: 'node' | 'connection' | 'canvas';
    startPosition: { x: number; y: number };
    currentPosition: { x: number; y: number };
  };
}

// Provider Integration Types
export interface AIProvider {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  capabilities: string[];
  models: AIModel[];
}

export interface AIModel {
  id: string;
  name: string;
  type: 'chat' | 'completion' | 'embedding' | 'image' | 'audio';
  parameters: Record<string, any>;
  limits: {
    maxTokens?: number;
    maxRequests?: number;
    rateLimit?: number;
  };
}

// Template Types
export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  flow: Omit<AgentFlow, 'id' | 'createdAt' | 'updatedAt'>;
  preview?: string;
  author: string;
  downloads: number;
  rating: number;
} 
