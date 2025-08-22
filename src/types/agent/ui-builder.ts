export interface UIComponent {
  id: string;
  type: 'input' | 'output' | 'display' | 'button' | 'container';
  subType: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  properties: Record<string, any>;
  nodeId?: string; // Reference to agent node
  style: Record<string, any>;
}

export interface UIComponentTemplate {
  id: string;
  name: string;
  icon: string;
  subType: string;
  defaultProps: Record<string, any>;
}

export interface AgentUI {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  components: UIComponent[];
  layout: {
    width: number;
    height: number;
    responsive: boolean;
  };
  theme: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    borderColor: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UIComponentBinding {
  componentId: string;
  nodeId: string;
  bindingType: 'input' | 'output';
  fieldPath?: string; // For complex objects
}

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export interface UIBuilderState {
  components: UIComponent[];
  selectedComponent: UIComponent | null;
  previewMode: boolean;
  deviceMode: DeviceMode;
} 
