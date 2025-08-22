import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Plus, Code, Eye, Save, Play, Settings, Type, Hash, 
  Braces, Upload, Download, Palette, Zap, Box, ArrowRight,
  ArrowLeft, Check, AlertCircle, Info, Trash2, Copy, Move,
  ChevronDown, ChevronRight, Monitor, Smartphone, Tablet, 
  Wand2, Brain, Sparkles, Loader2
} from 'lucide-react';
import { CustomNodeDefinition, NodePort, NodePropertyDefinition } from '../../../types/agent/types';
import Monaco from '@monaco-editor/react';
import { useProviders } from '../../../contexts/ProvidersContext';
import { angelaProviderService } from '../../../services/angelaProviderService';

interface NodeCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeDefinition: CustomNodeDefinition) => void;
  editingNode?: CustomNodeDefinition | null;
}

interface NodeCreatorState {
  // Mode selection
  creationMode: 'auto' | 'manual' | null;
  
  // Auto mode state
  aiPrompt: string;
  selectedProvider: string;
  selectedModel: string;
  isGenerating: boolean;
  generationStatus: string;
  generationError: string | null;
  isGenerated: boolean;
  
  // Basic info
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  
  // Interface
  inputs: NodePort[];
  outputs: NodePort[];
  properties: NodePropertyDefinition[];
  
  // Code
  executionCode: string;
  
  // Style
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  
  // Validation
  errors: Record<string, string>;
}

const CATEGORIES = [
  'basic', 'input', 'output', 'data', 'logic', 'ai', 'media', 'text', 'math', 'custom'
];

const DATA_TYPES = [
  'string', 'number', 'boolean', 'object', 'array', 'any', 'file', 'image', 'json'
];

const PROPERTY_TYPES = [
  'string', 'number', 'boolean', 'select', 'multiselect', 'json', 'code', 'color', 'textarea'
];

const COMMON_ICONS = [
  '🔧', '⚡', '🎯', '📊', '🧠', '🔄', '📝', '🔍', '🎨', '📱',
  '💾', '🌐', '🔐', '📈', '🎵', '📷', '🗂️', '⚙️', '🚀', '💡'
];

// Structured output schema for node generation
const NODE_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Node name (e.g., 'Text Processor', 'Math Calculator')"
    },
    description: {
      type: "string", 
      description: "Brief description of what the node does"
    },
    category: {
      type: "string",
      enum: CATEGORIES,
      description: "Node category"
    },
    icon: {
      type: "string",
      description: "Single emoji icon for the node"
    },
    inputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Input port name" },
          dataType: { type: "string", enum: DATA_TYPES, description: "Data type" },
          required: { type: "boolean", description: "Whether input is required" },
          description: { type: "string", description: "Input description" }
        },
        required: ["name", "dataType", "required"]
      }
    },
    outputs: {
      type: "array", 
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Output port name" },
          dataType: { type: "string", enum: DATA_TYPES, description: "Data type" },
          description: { type: "string", description: "Output description" }
        },
        required: ["name", "dataType"]
      }
    },
    properties: {
      type: "array",
      items: {
        type: "object", 
        properties: {
          name: { type: "string", description: "Property name" },
          type: { type: "string", enum: PROPERTY_TYPES, description: "Property type" },
          required: { type: "boolean", description: "Whether property is required" },
          defaultValue: { description: "Default value for the property" },
          description: { type: "string", description: "Property description" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Options for select/multiselect types"
          }
        },
        required: ["name", "type", "required"]
      }
    },
    executionCode: {
      type: "string",
      description: "JavaScript execution function code"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Tags for categorization"
    }
  },
  required: ["name", "description", "category", "icon", "inputs", "outputs", "executionCode"]
};

type StepType = 'mode' | 'auto' | 'basic' | 'interface' | 'code' | 'style' | 'preview';

const NodeCreator: React.FC<NodeCreatorProps> = ({
  isOpen,
  onClose,
  onSave,
  editingNode = null
}) => {
  const [currentStep, setCurrentStep] = useState<StepType>('mode');
  const { providers } = useProviders();
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // Generate a unique ID for nodes
  const generateId = () => `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const [state, setState] = useState<NodeCreatorState>({
    creationMode: 'auto',
    aiPrompt: '',
    selectedProvider: '',
    selectedModel: '',
    isGenerating: false,
    generationStatus: '',
    generationError: null,
    isGenerated: false,
    name: '',
    description: '',
    category: 'custom',
    icon: '🔧',
    tags: [],
    inputs: [],
    outputs: [],
    properties: [],
    executionCode: `// Custom Node Execution Function
async function execute(inputs, properties, context) {
  // Access inputs: inputs.inputName
  // Access properties: properties.propertyName
  // Use context.log() for logging
  
  try {
    // Your custom logic here
    const result = inputs.input || 'Hello from custom node!';
    
    context.log('Processing input:', result);
    
    // Return outputs object
    return {
      output: result
    };
  } catch (error) {
    context.log('Error:', error.message);
    throw error;
  }
}`,
    backgroundColor: '#ffffff',
    borderColor: '#6b7280',
    textColor: '#374151',
    errors: {}
  });

  const monacoRef = useRef<any>(null);

  // Load providers and models on mount
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const enabledProviders = providers.filter(p => p.isEnabled);
        if (enabledProviders.length > 0) {
          const primaryProvider = enabledProviders.find(p => p.isPrimary) || enabledProviders[0];
          updateState({ selectedProvider: primaryProvider.id });
          
          // Load models for the primary provider
          const models = await angelaProviderService.getModels(primaryProvider.id);
          setAvailableModels(models);
          
          // Select a default text model
          const textModel = models.find((m: any) => m.type === 'text' || m.type === 'multimodal');
          if (textModel) {
            updateState({ selectedModel: textModel.id });
          }
        }
      } catch (error) {
        console.error('Failed to load providers and models:', error);
      }
    };

    if (isOpen && !editingNode) {
      loadProviders();
    }
  }, [isOpen, providers, editingNode]);

  // Handle provider change
  const handleProviderChange = async (providerId: string) => {
    updateState({ selectedProvider: providerId, selectedModel: '' });
    try {
      const models = await angelaProviderService.getModels(providerId);
      setAvailableModels(models);
      
      // Select first available text model
      const textModel = models.find((m: any) => m.type === 'text' || m.type === 'multimodal');
      if (textModel) {
        updateState({ selectedModel: textModel.id });
      }
    } catch (error) {
      console.error('Failed to load models for provider:', error);
    }
  };

  // Generate node using AI with structured output
  const generateNode = async () => {
    if (!state.aiPrompt.trim() || !state.selectedProvider || !state.selectedModel) {
      updateState({ generationError: 'Please provide a prompt, select a provider, and choose a model.' });
      return;
    }

    updateState({ isGenerating: true, generationError: null });

    try {
      // Create a comprehensive JSON schema for the node definition
      const nodeSchema = {
        name: "CustomNodeDefinition",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Clear, descriptive name for the node (e.g., 'JSON Parser', 'Email Sender')"
            },
            description: {
              type: "string", 
              description: "Detailed explanation of what the node does and its purpose"
            },
            category: {
              type: "string",
              enum: ["basic", "input", "output", "data", "logic", "ai", "media", "text", "math", "custom"],
              description: "Category that best fits this node's functionality"
            },
            icon: {
              type: "string",
              description: "Single emoji that represents the node's function"
            },
            inputs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Input port name (camelCase, no spaces)"
                  },
                  label: {
                    type: "string",
                    description: "Human-readable label for the input"
                  },
                  type: {
                    type: "string",
                    enum: ["string", "number", "boolean", "object", "array"],
                    description: "Data type this input accepts"
                  },
                  description: {
                    type: "string",
                    description: "What this input is used for"
                  },
                  required: {
                    type: "boolean",
                    description: "Whether this input is mandatory"
                  }
                },
                required: ["name", "label", "type", "description", "required"],
                additionalProperties: false
              },
              description: "Array of input ports for the node"
            },
            outputs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Output port name (camelCase, no spaces)"
                  },
                  label: {
                    type: "string",
                    description: "Human-readable label for the output"
                  },
                  type: {
                    type: "string",
                    enum: ["string", "number", "boolean", "object", "array"],
                    description: "Data type this output provides"
                  },
                  description: {
                    type: "string", 
                    description: "What this output contains"
                  }
                },
                required: ["name", "label", "type", "description"],
                additionalProperties: false
              },
              description: "Array of output ports for the node"
            },
            properties: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Property name (camelCase, no spaces)"
                  },
                  label: {
                    type: "string",
                    description: "Human-readable label for the property"
                  },
                  type: {
                    type: "string",
                    enum: ["string", "number", "boolean", "text", "select"],
                    description: "Type of input control for this property"
                  },
                  description: {
                    type: "string",
                    description: "What this property configures"
                  },
                  defaultValue: {
                    type: "string",
                    description: "Default value for this property"
                  }
                },
                required: ["name", "label", "type", "description", "defaultValue"],
                additionalProperties: false
              },
              description: "Array of configurable properties for the node"
            },
            executionCode: {
              type: "string",
              description: "Complete JavaScript function body that implements the node logic. Use 'inputs.inputName' to access inputs, 'properties.propertyName' for properties, and return an object with output names as keys."
            },
            tags: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Relevant tags for searching and organizing this node"
            }
          },
          required: ["name", "description", "category", "icon", "inputs", "outputs", "properties", "executionCode", "tags"],
          additionalProperties: false
        }
      };

      // Create the structured request messages with better prompt engineering
      const messages = [
        {
          role: "system",
          content: `You are an expert at creating custom nodes for a visual programming interface.

IMPORTANT: The execution code MUST follow this exact template:

\`\`\`javascript
async function execute(inputs, properties, context) {
  // Your code here - access inputs and properties by name
  // Example: const input_value = inputs.input_name;
  // Example: const config = properties.property_name;
  
  try {
    // Main logic here
    const result = {};
    
    // Return outputs by name
    // Example: return { output_name: result_value };
    return result;
  } catch (error) {
    context.log('Error:', error.message);
    throw error;
  }
}
\`\`\`

Rules:
1. MUST have an "execute" function that takes (inputs, properties, context)
2. Access inputs by name: inputs.input_name (lowercase, underscores for spaces)
3. Access properties by name: properties.property_name 
4. Return an object with outputs by name: { output_name: value }
5. Use context.log() for logging, not console.log
6. Handle errors with try/catch
7. Make the function async if you need to use await
8. Only use safe JavaScript - no require(), import, eval(), etc.

Generate ONLY valid JSON that matches the schema. No explanations or markdown.`
        },
        {
          role: "user", 
          content: `Create a custom node for: ${state.aiPrompt}

Requirements:
- Name should be clear and descriptive
- Description should explain what the node does
- Choose appropriate category from: basic, input, output, data, logic, ai, media, text, math, custom
- Select a suitable emoji icon
- Define logical inputs and outputs with correct data types
- Add useful configuration properties
- Include complete working JavaScript execution code following the template
- Add relevant tags`
        }
      ];

      // Use the providers from the component's hook call
      const selectedProviderData = providers.find((p: any) => p.id === state.selectedProvider);
      
      if (!selectedProviderData || !selectedProviderData.isEnabled) {
        throw new Error(`Provider ${state.selectedProvider} not found or not enabled`);
      }

      // Use angelaProviderService to make the structured output request
      // First, ensure the provider is set correctly
      const currentProvider = angelaProviderService.getCurrentProvider();
      if (!currentProvider || currentProvider.id !== state.selectedProvider) {
        // Update the provider if needed
        angelaProviderService.updateProvider(selectedProviderData);
      }

      // Create the request body for structured output
      // Extract actual model name from provider:model format if present
      let actualModelId = state.selectedModel;
      if (actualModelId.includes(':')) {
        const parts = actualModelId.split(':');
        actualModelId = parts.slice(1).join(':'); // Everything after the first colon
        console.log(`Extracted model ID: "${state.selectedModel}" -> "${actualModelId}"`);
      }

      const requestBody = {
        model: actualModelId,
        messages: messages,
        temperature: 0.3,
        max_tokens: 2000,
        response_format: {
          type: "json_schema",
          json_schema: nodeSchema
        }
      };

      // Make the request using angelaProviderService's current client
      const client = angelaProviderService.getCurrentClient();
      if (!client) {
        throw new Error('No API client available');
      }

      // Call the private request method through reflection
      const response = await (client as any).request('/chat/completions', 'POST', requestBody);

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('No response content received from API');
      }

      // Parse the structured response
      const generatedNodeData = JSON.parse(response.choices[0].message.content);
      
      // Transform the generated data to match our internal format
      const transformedInputs = generatedNodeData.inputs.map((input: any) => ({
        id: `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: input.name,
        type: 'input' as const,
        dataType: input.type,
        required: input.required,
        description: input.description
      }));

      const transformedOutputs = generatedNodeData.outputs.map((output: any) => ({
        id: `output_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: output.name,
        type: 'output' as const,
        dataType: output.type,
        description: output.description
      }));

      const transformedProperties = generatedNodeData.properties.map((property: any) => ({
        id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: property.name,
        type: property.type,
        required: false,
        defaultValue: property.defaultValue,
        description: property.description,
        options: property.options
      }));
      
      // Apply the generated data to state
      updateState({
        name: generatedNodeData.name,
        description: generatedNodeData.description,
        category: generatedNodeData.category,
        icon: generatedNodeData.icon,
        tags: generatedNodeData.tags || [],
        inputs: transformedInputs,
        outputs: transformedOutputs,
        properties: transformedProperties,
        executionCode: generatedNodeData.executionCode || '',
        isGenerated: true,
        generationStatus: 'Generated successfully! You can review and modify the node before saving.',
        generationError: null
      });

      // Validate the generated execution code
      const codeValidation = validateExecutionCode(generatedNodeData.executionCode || '');
      if (!codeValidation.isValid) {
        updateState({
          generationStatus: `⚠️ Generated successfully, but execution code needs adjustment: ${codeValidation.error}`,
          errors: {
            code: codeValidation.error || 'Generated code needs to be fixed'
          }
        });
      }

      console.log('Node generated successfully:', generatedNodeData);
      
      // Move to basic step to review generated content
      setCurrentStep('basic');
      
    } catch (error) {
      console.error('Node generation failed:', error);
      updateState({ 
        generationError: error instanceof Error ? error.message : 'Failed to generate node',
        generationStatus: '❌ Generation failed'
      });
    } finally {
      updateState({ isGenerating: false });
    }
  };

  // Validate execution code format
  const validateExecutionCode = (code: string): { isValid: boolean; error?: string } => {
    if (!code.trim()) {
      return { isValid: false, error: 'Execution code is required' };
    }

    // Check for execute function
    const hasExecuteFunction = /(?:async\s+)?function\s+execute\s*\(/.test(code) || 
                               /execute\s*[:=]\s*(?:async\s+)?(?:function\s*)?\(/.test(code);
    
    if (!hasExecuteFunction) {
      return { 
        isValid: false, 
        error: 'Code must contain an "execute" function. Use the template: async function execute(inputs, properties, context) { ... }' 
      };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /require\s*\(/, message: 'require() is not allowed for security reasons' },
      { pattern: /import\s+/, message: 'import statements are not allowed' },
      { pattern: /eval\s*\(/, message: 'eval() is not allowed for security reasons' },
      { pattern: /Function\s*\(/, message: 'Function constructor is not allowed' },
      { pattern: /process\./, message: 'process object is not allowed' },
      { pattern: /global\./, message: 'global object is not allowed' },
      { pattern: /window\./, message: 'window object is not allowed' },
      { pattern: /document\./, message: 'document object is not allowed' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        return { isValid: false, error: message };
      }
    }

    return { isValid: true };
  };

  // Generate dynamic execution code with the correct template
  const generateDynamicExecutionCode = (): string => {
    const inputVariables = state.inputs.map(input => {
      const varName = input.name.toLowerCase().replace(/\s+/g, '_');
      return `  const ${varName} = inputs.${varName};`;
    }).join('\n');

    const propertyVariables = state.properties.map(prop => {
      const varName = prop.name.toLowerCase().replace(/\s+/g, '_');
      return `  const ${varName} = properties.${varName};`;
    }).join('\n');

    const outputVariables = state.outputs.map(output => {
      const varName = output.name.toLowerCase().replace(/\s+/g, '_');
      return `    ${varName}: null, // Set your result here`;
    }).join('\n');

    const inputComments = state.inputs.length > 0 ? 
      `  // Available inputs:\n${state.inputs.map(input => `  // - ${input.name} (${input.dataType}): ${input.description || 'No description'}`).join('\n')}\n` : '';
    
    const propertyComments = state.properties.length > 0 ? 
      `  // Available properties:\n${state.properties.map(prop => `  // - ${prop.name} (${prop.type}): ${prop.description || 'No description'}`).join('\n')}\n` : '';

    const outputComments = state.outputs.length > 0 ? 
      `  // Expected outputs:\n${state.outputs.map(output => `  // - ${output.name} (${output.dataType}): ${output.description || 'No description'}`).join('\n')}\n` : '';

    return `async function execute(inputs, properties, context) {
${inputComments}${propertyComments}${outputComments}
  try {
${inputVariables}
${propertyVariables}

    // Your main logic here
    context.log('Processing node...');
    
    // Example processing:
    // const result = processData(input_data, some_property);
    
    // Return outputs by name
    return {
${outputVariables}
    };
  } catch (error) {
    context.log('Error:', error.message);
    throw error;
  }
}`;
  };

  // Update execution code when interface changes
  useEffect(() => {
    if (!editingNode && (state.inputs.length > 0 || state.outputs.length > 0 || state.properties.length > 0)) {
      // Only update if we're not editing an existing node and have some interface defined
      const newCode = generateDynamicExecutionCode();
      if (state.executionCode === '' || state.executionCode.includes('// Custom Node Execution Function')) {
        updateState({ executionCode: newCode });
      }
    }
  }, [state.inputs, state.outputs, state.properties, editingNode]);

  // Load editing node data
  useEffect(() => {
    if (editingNode) {
      setState({
        creationMode: 'manual', // Always use manual mode for editing
        aiPrompt: '',
        selectedProvider: '',
        selectedModel: '',
        isGenerating: false,
        generationStatus: '',
        generationError: null,
        isGenerated: false,
        name: editingNode.name,
        description: editingNode.description,
        category: editingNode.category,
        icon: editingNode.icon,
        tags: editingNode.metadata?.tags || [],
        inputs: editingNode.inputs,
        outputs: editingNode.outputs,
        properties: editingNode.properties,
        executionCode: editingNode.executionCode || '',
        backgroundColor: editingNode.uiConfig?.backgroundColor || '#ffffff',
        borderColor: '#6b7280',
        textColor: '#374151',
        errors: {}
      });
      // Skip mode selection for editing
      setCurrentStep('basic');
    } else {
      // Reset for new node creation
      setCurrentStep('mode');
    }
  }, [editingNode]);

  const updateState = (updates: Partial<NodeCreatorState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const validateCurrentStep = (): boolean => {
    const errors: Record<string, string> = {};
    
    switch (currentStep) {
      case 'mode':
        // No validation needed for mode selection
        break;
      case 'auto':
        if (state.creationMode === 'auto') {
          if (!state.aiPrompt.trim()) errors.aiPrompt = 'Please describe the node you want to create';
          if (!state.selectedProvider) errors.selectedProvider = 'Please select an AI provider';
          if (!state.selectedModel) errors.selectedModel = 'Please select a model';
        }
        break;
      case 'basic':
        if (!state.name.trim()) errors.name = 'Name is required';
        if (!state.description.trim()) errors.description = 'Description is required';
        break;
      case 'interface':
        if (state.inputs.length === 0 && state.outputs.length === 0) {
          errors.interface = 'At least one input or output is required';
        }
        break;
      case 'code':
        if (!state.executionCode.trim()) {
          errors.code = 'Execution code is required';
        } else {
          // Validate execution code format
          const codeValidation = validateExecutionCode(state.executionCode);
          if (!codeValidation.isValid) {
            errors.code = codeValidation.error || 'Invalid execution code format';
          }
        }
        break;
    }
    
    updateState({ errors });
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) return;
    
    const steps = ['mode', 'auto', 'basic', 'interface', 'code', 'style', 'preview'] as const;
    const currentIndex = steps.indexOf(currentStep);
    
    // Skip auto step if manual mode is selected
    if (currentStep === 'mode' && state.creationMode === 'manual') {
      setCurrentStep('basic');
      return;
    }
    
    // Skip to basic step if coming from auto mode with generated data
    if (currentStep === 'auto' && state.name) {
      setCurrentStep('basic');
      return;
    }
    
    // Go to auto step from mode if auto mode is selected
    if (currentStep === 'mode' && state.creationMode === 'auto') {
      setCurrentStep('auto');
      return;
    }
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps = ['mode', 'auto', 'basic', 'interface', 'code', 'style', 'preview'] as const;
    const currentIndex = steps.indexOf(currentStep);
    
    // Handle back navigation properly
    if (currentStep === 'basic' && state.creationMode === 'manual') {
      setCurrentStep('mode');
      return;
    }
    
    if (currentStep === 'basic' && state.creationMode === 'auto') {
      setCurrentStep('auto');
      return;
    }
    
    if (currentStep === 'auto') {
      setCurrentStep('mode');
      return;
    }
    
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const addInput = () => {
    const newInput: NodePort = {
      id: `input_${Date.now()}`,
      name: `Input ${state.inputs.length + 1}`,
      type: 'input',
      dataType: 'string',
      required: false,
      description: ''
    };
    updateState({ inputs: [...state.inputs, newInput] });
  };

  const addOutput = () => {
    const newOutput: NodePort = {
      id: `output_${Date.now()}`,
      name: `Output ${state.outputs.length + 1}`,
      type: 'output',
      dataType: 'string',
      description: ''
    };
    updateState({ outputs: [...state.outputs, newOutput] });
  };

  const addProperty = () => {
    const newProperty: NodePropertyDefinition = {
      id: `prop_${Date.now()}`,
      name: `Property ${state.properties.length + 1}`,
      type: 'string',
      required: false,
      defaultValue: '',
      description: ''
    };
    updateState({ properties: [...state.properties, newProperty] });
  };

  const updateInput = (index: number, updates: Partial<NodePort>) => {
    const newInputs = [...state.inputs];
    newInputs[index] = { ...newInputs[index], ...updates };
    updateState({ inputs: newInputs });
  };

  const updateOutput = (index: number, updates: Partial<NodePort>) => {
    const newOutputs = [...state.outputs];
    newOutputs[index] = { ...newOutputs[index], ...updates };
    updateState({ outputs: newOutputs });
  };

  const updateProperty = (index: number, updates: Partial<NodePropertyDefinition>) => {
    const newProperties = [...state.properties];
    newProperties[index] = { ...newProperties[index], ...updates };
    updateState({ properties: newProperties });
  };

  const removeInput = (index: number) => {
    updateState({ inputs: state.inputs.filter((_, i) => i !== index) });
  };

  const removeOutput = (index: number) => {
    updateState({ outputs: state.outputs.filter((_, i) => i !== index) });
  };

  const removeProperty = (index: number) => {
    updateState({ properties: state.properties.filter((_, i) => i !== index) });
  };

  const handleSave = () => {
    if (!validateCurrentStep()) return;
    
    // Validate execution code format before saving
    const codeValidation = validateExecutionCode(state.executionCode);
    if (!codeValidation.isValid) {
      updateState({ 
        errors: { 
          ...state.errors, 
          code: codeValidation.error || 'Invalid execution code format'
        } 
      });
      setCurrentStep('code'); // Go to code step to show error
      return;
    }

    const nodeDefinition: CustomNodeDefinition = {
      id: editingNode?.id || generateId(),
      name: state.name,
      type: state.name.toLowerCase().replace(/\s+/g, '-'),
      category: state.category,
      description: state.description,
      icon: state.icon,
      version: '1.0.0',
      author: 'User',
      inputs: state.inputs,
      outputs: state.outputs,
      properties: state.properties,
      executionHandler: 'custom-node-handler',
      executionCode: state.executionCode,
      uiConfig: {
        backgroundColor: state.backgroundColor,
        iconUrl: undefined,
        customStyling: ''
      },
      customMetadata: {
        isUserCreated: true,
        createdBy: 'current-user',
        createdAt: editingNode?.customMetadata?.createdAt || new Date().toISOString(),
        sharedWith: editingNode?.customMetadata?.sharedWith || [],
        published: editingNode?.customMetadata?.published || false,
        downloadCount: editingNode?.customMetadata?.downloadCount || 0,
        rating: editingNode?.customMetadata?.rating || 0
      },
      metadata: {
        tags: state.tags,
        documentation: '',
        examples: []
      }
    };
    
    onSave(nodeDefinition);
    onClose();
  };

  // Test the execution code
  const testCode = async () => {
    try {
      // Create mock inputs based on node definition
      const mockInputs: Record<string, any> = {};
      state.inputs.forEach(input => {
        switch (input.dataType) {
          case 'string':
            mockInputs[input.name] = 'test string';
            break;
          case 'number':
            mockInputs[input.name] = 42;
            break;
          case 'boolean':
            mockInputs[input.name] = true;
            break;
          case 'object':
            mockInputs[input.name] = { test: 'value' };
            break;
          case 'array':
            mockInputs[input.name] = ['item1', 'item2'];
            break;
          default:
            mockInputs[input.name] = 'test';
        }
      });

      // Create mock properties
      const mockProperties: Record<string, any> = {};
      state.properties.forEach(prop => {
        mockProperties[prop.name] = prop.defaultValue;
      });

      // Execute the code
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const executor = new AsyncFunction('inputs', 'properties', 'fetch', state.executionCode);
      const result = await executor(mockInputs, mockProperties, fetch);

      updateState({ 
        errors: { ...state.errors, code: '' }
      });
      
      console.log('Test execution result:', result);
      return result;
    } catch (error) {
      updateState({ 
        errors: { ...state.errors, code: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
      });
      console.error('Code test failed:', error);
      throw error;
    }
  };

  if (!isOpen) return null;

  const renderStepIndicator = () => {
    // Filter steps based on creation mode
    const allSteps = [
      { key: 'mode', label: 'Mode', icon: Wand2 },
      { key: 'auto', label: 'Auto', icon: Brain },
      { key: 'basic', label: 'Basic', icon: Info },
      { key: 'interface', label: 'Interface', icon: Box },
      { key: 'code', label: 'Code', icon: Code },
      { key: 'style', label: 'Style', icon: Palette },
      { key: 'preview', label: 'Preview', icon: Eye }
    ];

    // Filter steps based on creation mode
    const steps = state.creationMode === 'manual' 
      ? allSteps.filter(step => step.key !== 'auto')
      : allSteps;

    return (
      <div className="flex items-center justify-center space-x-2 mb-8">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const stepIndex = allSteps.findIndex(s => s.key === step.key);
          const currentStepIndex = allSteps.findIndex(s => s.key === currentStep);
          const isCompleted = currentStepIndex > stepIndex;
          
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-sakura-500 text-white'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-xs mt-1 ${
                  isActive ? 'text-sakura-500 font-medium' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-gray-400" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderBasicStep = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Node Name *
        </label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => updateState({ name: e.target.value })}
          placeholder="My Custom Node"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
        />
        {state.errors.name && (
          <p className="text-red-500 text-xs mt-1">{state.errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Description *
        </label>
        <textarea
          value={state.description}
          onChange={(e) => updateState({ description: e.target.value })}
          placeholder="Describe what this node does..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
        />
        {state.errors.description && (
          <p className="text-red-500 text-xs mt-1">{state.errors.description}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Category
        </label>
        <select
          value={state.category}
          onChange={(e) => updateState({ category: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
        >
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Icon
        </label>
        <div className="grid grid-cols-8 gap-2">
          {COMMON_ICONS.map(icon => (
            <button
              key={icon}
              onClick={() => updateState({ icon })}
              className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                state.icon === icon
                  ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-sakura-300'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tags (comma separated)
        </label>
        <input
          type="text"
          value={state.tags.join(', ')}
          onChange={(e) => updateState({ tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
          placeholder="custom, utility, transform"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
        />
      </div>
    </div>
  );

  const renderInterfaceStep = () => (
    <div className="space-y-8">
      {/* Inputs Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Input Ports
          </h3>
          <button
            onClick={addInput}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Input
          </button>
        </div>
        
        <div className="space-y-3">
          {state.inputs.map((input, index) => (
            <div key={input.id} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={input.name}
                    onChange={(e) => updateInput(index, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                  <select
                    value={input.dataType}
                    onChange={(e) => updateInput(index, { dataType: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  >
                    {DATA_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-5">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={input.description || ''}
                    onChange={(e) => updateInput(index, { description: e.target.value })}
                    placeholder="Describe this input..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <label className="flex items-center text-xs">
                    <input
                      type="checkbox"
                      checked={input.required || false}
                      onChange={(e) => updateInput(index, { required: e.target.checked })}
                      className="mr-1"
                    />
                    Req
                  </label>
                </div>
                <div className="col-span-1">
                  <button
                    onClick={() => removeInput(index)}
                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {state.inputs.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No input ports defined</p>
              <p className="text-xs">Add input ports to receive data from other nodes</p>
            </div>
          )}
        </div>
      </div>

      {/* Outputs Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Output Ports
          </h3>
          <button
            onClick={addOutput}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Output
          </button>
        </div>
        
        <div className="space-y-3">
          {state.outputs.map((output, index) => (
            <div key={output.id} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={output.name}
                    onChange={(e) => updateOutput(index, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                  <select
                    value={output.dataType}
                    onChange={(e) => updateOutput(index, { dataType: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  >
                    {DATA_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={output.description || ''}
                    onChange={(e) => updateOutput(index, { description: e.target.value })}
                    placeholder="Describe this output..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-1">
                  <button
                    onClick={() => removeOutput(index)}
                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {state.outputs.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No output ports defined</p>
              <p className="text-xs">Add output ports to send data to other nodes</p>
            </div>
          )}
        </div>
      </div>

      {/* Properties Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Configuration Properties
          </h3>
          <button
            onClick={addProperty}
            className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </button>
        </div>
        
        <div className="space-y-3">
          {state.properties.map((property, index) => (
            <div key={property.id} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={property.name}
                    onChange={(e) => updateProperty(index, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                  <select
                    value={property.type}
                    onChange={(e) => updateProperty(index, { type: e.target.value as any })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  >
                    {PROPERTY_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Default</label>
                  <input
                    type="text"
                    value={property.defaultValue || ''}
                    onChange={(e) => updateProperty(index, { defaultValue: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={property.description || ''}
                    onChange={(e) => updateProperty(index, { description: e.target.value })}
                    placeholder="Describe this property..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <label className="flex items-center text-xs">
                    <input
                      type="checkbox"
                      checked={property.required || false}
                      onChange={(e) => updateProperty(index, { required: e.target.checked })}
                      className="mr-1"
                    />
                    Req
                  </label>
                </div>
                <div className="col-span-1">
                  <button
                    onClick={() => removeProperty(index)}
                    className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {state.properties.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No configuration properties defined</p>
              <p className="text-xs">Add properties to let users customize the node behavior</p>
            </div>
          )}
        </div>
      </div>

      {state.errors.interface && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300 text-sm">{state.errors.interface}</p>
        </div>
      )}
    </div>
  );

  const renderCodeStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Execution Code
        </h3>
        <div className="flex gap-2">
          <button
            onClick={testCode}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm flex items-center gap-1"
          >
            <Play className="w-4 h-4" />
            Test Code
          </button>
          <button
            onClick={() => updateState({ executionCode: generateDynamicExecutionCode() })}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1"
            title="Generate code template based on your interface"
          >
            <Code className="w-4 h-4" />
            Generate Template
          </button>
        </div>
      </div>
      
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <Monaco
          height="400px"
          defaultLanguage="javascript"
          value={state.executionCode}
          onChange={(value) => updateState({ executionCode: value || '' })}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true
          }}
          onMount={(editor) => {
            monacoRef.current = editor;
          }}
        />
      </div>
      
      {state.errors.code && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300 text-sm">{state.errors.code}</p>
        </div>
      )}
      
      {/* Available Variables */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-600 rounded-lg">
        <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <Code className="w-4 h-4" />
          Available Variables
        </h4>
        
        <div className="space-y-3 text-sm">
          {/* Input Variables */}
          {state.inputs.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Input Variables:</h5>
              <div className="space-y-1 ml-4">
                {state.inputs.map((input) => {
                  const variableName = input.name.toLowerCase().replace(/\s+/g, '_');
                  return (
                    <div key={input.id} className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-mono">
                        inputs.{variableName}
                      </code>
                      <span className="text-gray-600 dark:text-gray-400 text-xs">
                        ({input.dataType}) - {input.description || input.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Property Variables */}
          {state.properties.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Property Variables:</h5>
              <div className="space-y-1 ml-4">
                {state.properties.map((property) => {
                  const variableName = property.name.toLowerCase().replace(/\s+/g, '_');
                  return (
                    <div key={property.id} className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs font-mono">
                        properties.{variableName}
                      </code>
                      <span className="text-gray-600 dark:text-gray-400 text-xs">
                        ({property.type}) - {property.description || property.name}
                        {property.defaultValue && (
                          <span className="ml-1 text-gray-500">
                            (default: {typeof property.defaultValue === 'string' && property.defaultValue.length > 20 
                              ? property.defaultValue.substring(0, 20) + '...' 
                              : String(property.defaultValue)})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Context Methods */}
          <div>
            <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Context Methods:</h5>
            <div className="space-y-1 ml-4">
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-xs font-mono">
                  context.log(...)
                </code>
                <span className="text-gray-600 dark:text-gray-400 text-xs">
                  Log messages for debugging
                </span>
              </div>
            </div>
          </div>
          
          {/* Expected Return Format */}
          {state.outputs.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Expected Return Object:</h5>
              <div className="ml-4">
                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded text-xs font-mono block">
                  return &#123;<br />
                  {state.outputs.map((output, index) => {
                    const variableName = output.name.toLowerCase().replace(/\s+/g, '_');
                    return (
                      <span key={output.id}>
                        &nbsp;&nbsp;{variableName}: value{index < state.outputs.length - 1 ? ',' : ''}<br />
                      </span>
                    );
                  })}
                  &#125;
                </code>
              </div>
            </div>
          )}
          
          {/* No Variables Message */}
          {state.inputs.length === 0 && state.properties.length === 0 && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p>Define inputs and properties in the Interface step to see available variables here.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Code Guidelines:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Use <code>inputs.portName</code> to access input data</li>
          <li>• Use <code>properties.propertyName</code> to access configuration</li>
          <li>• Use <code>context.log()</code> for debugging output</li>
          <li>• Return an object with output port names as keys</li>
          <li>• Throw errors for validation failures</li>
          <li>• Use async/await for asynchronous operations</li>
        </ul>
      </div>
      
      {/* Execution Template Info */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500 rounded-lg text-white flex-shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              Execution Code Requirements
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Must contain an <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">execute</code> function</li>
              <li>• Function signature: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">async function execute(inputs, properties, context)</code></li>
              <li>• Access inputs by name: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">inputs.input_name</code></li>
              <li>• Return an object with outputs: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">return &#123; output_name: value &#125;</code></li>
              <li>• Use <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">context.log()</code> for logging instead of console.log</li>
              <li>• Wrap logic in try/catch for error handling</li>
            </ul>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
              💡 Tip: Use "Generate Template" to create a properly formatted template based on your inputs/outputs
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStyleStep = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
        Visual Customization
      </h3>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Background Color
          </label>
          <input
            type="color"
            value={state.backgroundColor}
            onChange={(e) => updateState({ backgroundColor: e.target.value })}
            className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Border Color
          </label>
          <input
            type="color"
            value={state.borderColor}
            onChange={(e) => updateState({ borderColor: e.target.value })}
            className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Text Color
          </label>
          <input
            type="color"
            value={state.textColor}
            onChange={(e) => updateState({ textColor: e.target.value })}
            className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
          />
        </div>
      </div>
      
      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-3">Preview</h4>
        <div 
          className="w-48 p-4 rounded-lg border-2 mx-auto"
          style={{
            backgroundColor: state.backgroundColor,
            borderColor: state.borderColor,
            color: state.textColor
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{state.icon}</span>
            <span className="font-semibold">{state.name || 'Custom Node'}</span>
          </div>
          <div className="text-xs opacity-75">
            {state.description || 'Node description'}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
        Node Preview
      </h3>
      
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-3">Basic Information</h4>
          <div className="space-y-2 text-sm">
            <div><strong>Name:</strong> {state.name}</div>
            <div><strong>Category:</strong> {state.category}</div>
            <div><strong>Description:</strong> {state.description}</div>
            <div><strong>Tags:</strong> {state.tags.join(', ') || 'None'}</div>
          </div>
        </div>
        
        <div>
          <h4 className="font-medium mb-3">Interface</h4>
          <div className="space-y-2 text-sm">
            <div><strong>Inputs:</strong> {state.inputs.length}</div>
            <div><strong>Outputs:</strong> {state.outputs.length}</div>
            <div><strong>Properties:</strong> {state.properties.length}</div>
            <div><strong>Code Lines:</strong> {state.executionCode.split('\n').length}</div>
          </div>
        </div>
      </div>
      
      <div className="p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="font-medium mb-4">Visual Preview</h4>
        <div className="flex justify-center">
          <div 
            className="relative p-4 rounded-lg border-2 w-80"
            style={{
              backgroundColor: state.backgroundColor,
              borderColor: state.borderColor,
              color: state.textColor
            }}
          >
            {/* Input handles */}
            {state.inputs.map((input, index) => (
              <div
                key={input.id}
                className="absolute left-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"
                style={{
                  top: `${((index + 1) * 100) / (state.inputs.length + 1)}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                title={input.name}
              />
            ))}
            
            {/* Output handles */}
            {state.outputs.map((output, index) => (
              <div
                key={output.id}
                className="absolute right-0 w-3 h-3 bg-gray-500 rounded-full border-2 border-white"
                style={{
                  top: `${((index + 1) * 100) / (state.outputs.length + 1)}%`,
                  transform: 'translate(50%, -50%)'
                }}
                title={output.name}
              />
            ))}
            
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{state.icon}</span>
              <span className="font-semibold">{state.name}</span>
            </div>
            <div className="text-xs opacity-75 mb-3">
              {state.description}
            </div>
            
            {state.properties.length > 0 && (
              <div className="text-xs">
                <div className="font-medium mb-1">Configuration:</div>
                {state.properties.slice(0, 3).map(prop => (
                  <div key={prop.id} className="opacity-75">
                    {prop.name}: {prop.defaultValue || 'Not set'}
                  </div>
                ))}
                {state.properties.length > 3 && (
                  <div className="opacity-50">
                    +{state.properties.length - 3} more...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {editingNode ? 'Edit Node' : 'Create Custom Node'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          {renderStepIndicator()}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 'mode' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  How would you like to create your node?
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose between AI-powered generation or manual creation
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Auto Mode Card */}
                <div
                  onClick={() => updateState({ creationMode: 'auto' })}
                  className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    state.creationMode === 'auto'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg shadow-purple-500/25'
                      : 'border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500'
                  }`}
                >
                  {state.creationMode === 'auto' && (
                    <div className="absolute top-3 right-3">
                      <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg">
                      <Brain className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                        Auto Generation
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Describe what you want and let AI generate the complete node implementation with inputs, outputs, properties, and code.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
                        <Sparkles className="w-4 h-4" />
                        <span>Powered by AI</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Best for: Quick prototyping, exploring ideas, learning
                    </div>
                  </div>
                </div>

                {/* Manual Mode Card */}
                <div
                  onClick={() => updateState({ creationMode: 'manual' })}
                  className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    state.creationMode === 'manual'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/25'
                      : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                  }`}
                >
                  {state.creationMode === 'manual' && (
                    <div className="absolute top-3 right-3">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                      <Code className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                        Manual Creation
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Build your node step-by-step with full control over every aspect of the implementation and behavior.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                        <Settings className="w-4 h-4" />
                        <span>Full control</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Best for: Precise requirements, complex logic, advanced features
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Description */}
              <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-1">
                      {state.creationMode === 'auto' ? 'About Auto Generation' : 'About Manual Creation'}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {state.creationMode === 'auto' 
                        ? 'AI will analyze your description and generate a complete, functional node with appropriate inputs, outputs, configuration properties, and JavaScript execution code. You can review and modify everything after generation.'
                        : 'You\'ll define each aspect of your node manually - from basic information to interface design and code implementation. This gives you complete control over the final result.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {currentStep === 'auto' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Brain className="w-6 h-6 text-purple-500" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  AI Node Generation
                </h3>
              </div>
              
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-1">
                      AI-Powered Node Creation
                    </h4>
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      Describe what you want your node to do, and AI will generate the complete implementation including inputs, outputs, properties, and execution code.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Node Description *
                </label>
                <textarea
                  value={state.aiPrompt}
                  onChange={(e) => updateState({ aiPrompt: e.target.value })}
                  placeholder="Example: Create a node that takes text input and converts it to uppercase, with an option to also remove spaces..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
                  disabled={state.isGenerating}
                />
                {state.errors.aiPrompt && (
                  <p className="text-red-500 text-xs mt-1">{state.errors.aiPrompt}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AI Provider *
                  </label>
                  <select
                    value={state.selectedProvider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
                    disabled={state.isGenerating}
                  >
                    <option value="">Select a provider</option>
                    {providers.filter(p => p.isEnabled).map(provider => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                  {state.errors.selectedProvider && (
                    <p className="text-red-500 text-xs mt-1">{state.errors.selectedProvider}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Model *
                  </label>
                  <select
                    value={state.selectedModel}
                    onChange={(e) => updateState({ selectedModel: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
                    disabled={state.isGenerating || !state.selectedProvider}
                  >
                    <option value="">Select a model</option>
                    {availableModels.filter(m => m.type === 'text' || m.type === 'multimodal').map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  {state.errors.selectedModel && (
                    <p className="text-red-500 text-xs mt-1">{state.errors.selectedModel}</p>
                  )}
                </div>
              </div>

              {/* Generation Error */}
              {state.generationError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                        Generation Failed
                      </h4>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {state.generationError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Generation Button */}
              <div className="flex justify-center">
                <button
                  onClick={generateNode}
                  disabled={state.isGenerating || !state.aiPrompt.trim() || !state.selectedProvider || !state.selectedModel}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center gap-3 font-medium shadow-lg hover:shadow-xl"
                >
                  {state.isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Node...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Node with AI
                    </>
                  )}
                </button>
              </div>

              {/* Tips */}
              <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      Tips for Better Results
                    </h4>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• Be specific about inputs and outputs you need</li>
                      <li>• Mention any configuration options you want</li>
                      <li>• Describe the data processing logic clearly</li>
                      <li>• Include examples of expected behavior</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          {currentStep === 'basic' && renderBasicStep()}
          {currentStep === 'interface' && renderInterfaceStep()}
          {currentStep === 'code' && renderCodeStep()}
          {currentStep === 'style' && renderStyleStep()}
          {currentStep === 'preview' && renderPreviewStep()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={prevStep}
            disabled={currentStep === 'mode'}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>
          
          <div className="flex gap-3">
            {currentStep === 'preview' ? (
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingNode ? 'Update Node' : 'Create Node'}
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeCreator; 
