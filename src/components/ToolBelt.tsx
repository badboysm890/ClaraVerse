import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calculator, 
  Globe, 
  Wrench, 
  Plus, 
  Play, 
  TestTube, 
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  Check,
  X,
  Code,
  Zap,
  Settings,
  AlertCircle,
  CheckCircle,
  Loader2,
  Wand2,
  Brain,
  Sparkles
} from 'lucide-react';
import { db } from '../db';
// Import AI service and types
import { angelaApiService } from '../services/angelaApiService';
import type { angelaProvider, angelaModel, angelaAIConfig } from '../types/angela_assistant_types';

// Tool Belt Types - Updated to match database schema
interface ToolBeltTool {
  id: string;
  name: string;
  description: string;
  category: 'datetime' | 'math' | 'utility' | 'network' | 'custom';
  enabled: boolean;
  code: string;
  parameters?: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
    default?: any;
  }[];
  isBuiltIn: boolean;
  testCases?: {
    name: string;
    parameters: { [key: string]: any };
    expectedResult?: string;
  }[];
  // Database tool properties
  implementation?: string;
  isEnabled?: boolean;
}

interface ToolTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  parameters: any[];
}

// Built-in tools - Now empty so users create their own
const BUILTIN_TOOLS: ToolBeltTool[] = [];

// Tool templates for creating custom tools
const TOOL_TEMPLATES: ToolTemplate[] = [
  {
    id: 'basic_function',
    name: 'Basic Function',
    description: 'A simple function template',
    category: 'basic',
    code: `function myCustomTool(parameter1, parameter2) {
  // Your custom logic here
  return {
    result: parameter1 + parameter2,
    message: "Custom tool executed successfully"
  };
}`,
    parameters: [
      { name: 'parameter1', type: 'string', description: 'First parameter', required: true },
      { name: 'parameter2', type: 'string', description: 'Second parameter', required: false }
    ]
  },
  {
    id: 'api_call',
    name: 'API Call Template',
    description: 'Template for making external API calls',
    category: 'network',
    code: `async function apiCall(url, method = 'GET', data = null) {
  try {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    const result = await response.json();
    
    return {
      success: true,
      status: response.status,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}`,
    parameters: [
      { name: 'url', type: 'string', description: 'API endpoint URL', required: true },
      { name: 'method', type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)', required: false },
      { name: 'data', type: 'string', description: 'Request payload (JSON string)', required: false }
    ]
  },
  {
    id: 'data_processor',
    name: 'Data Processor',
    description: 'Template for processing and transforming data',
    category: 'utility',
    code: `function processData(data, operation = 'filter') {
  try {
    let input = typeof data === 'string' ? JSON.parse(data) : data;
    
    switch (operation) {
      case 'filter':
        // Example: filter array items
        return input.filter(item => item.active === true);
      
      case 'map':
        // Example: transform array items
        return input.map(item => ({ ...item, processed: true }));
      
      case 'reduce':
        // Example: aggregate data
        return input.reduce((acc, item) => acc + (item.value || 0), 0);
      
      case 'sort':
        // Example: sort by property
        return input.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      default:
        return input;
    }
  } catch (error) {
    return {
      error: error.message,
      originalData: data
    };
  }
}`,
    parameters: [
      { name: 'data', type: 'string', description: 'Data to process (JSON string or array)', required: true },
      { name: 'operation', type: 'string', description: 'Operation: filter, map, reduce, sort', required: false }
    ]
  }
];

const ToolBelt: React.FC = () => {
  const [tools, setTools] = useState<ToolBeltTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolBeltTool | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ToolTemplate | null>(null);
  const [activeSection, setActiveSection] = useState<'tools' | 'templates' | 'create' | 'ai-create'>('tools');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({
    datetime: true,
    math: true,
    utility: true,
    network: true,
    custom: true
  });

  // Category filters state
  const [categoryFilters, setCategoryFilters] = useState<{ [key: string]: boolean }>({
    datetime: true,
    math: true,
    utility: true,
    network: true,
    custom: true
  });

  // AI-powered tool creation state
  const [providers, setProviders] = useState<angelaProvider[]>([]);
  const [models, setModels] = useState<angelaModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGeneratingTool, setIsGeneratingTool] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedTool, setGeneratedTool] = useState<any | null>(null);
  const [showAIPreview, setShowAIPreview] = useState(false);

  // New tool creation form
  const [newTool, setNewTool] = useState<Partial<ToolBeltTool>>({
    name: '',
    description: '',
    category: 'custom',
    enabled: true,
    code: '',
    parameters: [],
    isBuiltIn: false
  });

  // Edit tool state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolBeltTool | null>(null);
  const [editTool, setEditTool] = useState<Partial<ToolBeltTool>>({
    name: '',
    description: '',
    category: 'custom',
    enabled: true,
    code: '',
    parameters: [],
    isBuiltIn: false
  });

  const [testInput, setTestInput] = useState<{ [key: string]: any }>({});

  // Filtered tools based on category filters
  const filteredTools = tools.filter(tool => 
    categoryFilters[tool.category as keyof typeof categoryFilters]
  );

  // Group tools by category
  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as { [key: string]: ToolBeltTool[] });

  const categoryIcons = {
    datetime: Clock,
    math: Calculator,
    utility: Wrench,
    network: Globe,
    custom: Code
  };

  const categoryNames = {
    datetime: 'Date & Time',
    math: 'Mathematics',
    utility: 'Utilities',
    network: 'Network',
    custom: 'Custom Tools'
  };

  // Load tools from database and merge with built-ins
  const loadTools = async () => {
    setLoading(true);
    try {
      // Get tools from database
      const dbTools = await db.getAllTools();
      
      // Convert database tools to ToolBeltTool format
      const convertedDbTools: ToolBeltTool[] = dbTools.map(tool => ({
        id: tool.id.toString(),
        name: tool.name,
        description: tool.description,
        category: 'custom' as const,
        enabled: tool.isEnabled,
        code: tool.implementation || '',
        parameters: (tool.parameters || []).map(param => ({
          name: param.name,
          type: (param.type as 'string' | 'number' | 'boolean') || 'string',
          description: param.description,
          required: param.required,
          default: (param as any).default
        })),
        isBuiltIn: false,
        testCases: []
      }));

      // Only use database tools (no built-ins)
      setTools(convertedDbTools);
    } catch (error) {
      console.error('Failed to load tools:', error);
      // Fallback to empty array if database fails
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  // Load tools on component mount
  useEffect(() => {
    loadTools();
  }, []);

  // Load providers and models for AI tool creation
  useEffect(() => {
    const loadProvidersAndModels = async () => {
      try {
        const loadedProviders = await angelaApiService.getProviders();
        const enabledProviders = loadedProviders.filter(p => p.isEnabled);
        setProviders(enabledProviders);

        if (enabledProviders.length > 0) {
          const primaryProvider = enabledProviders.find(p => p.isPrimary) || enabledProviders[0];
          setSelectedProvider(primaryProvider.id);

          // Load models for the primary provider
          const loadedModels = await angelaApiService.getModels(primaryProvider.id);
          setModels(loadedModels);

          // Select a default text model
          const textModel = loadedModels.find(m => m.type === 'text' || m.type === 'multimodal');
          if (textModel) {
            setSelectedModel(textModel.id);
          }
        }
      } catch (error) {
        console.error('Failed to load providers and models:', error);
      }
    };

    loadProvidersAndModels();
  }, []);

  // Handle provider change for AI tool creation
  const handleProviderChange = async (providerId: string) => {
    setSelectedProvider(providerId);
    try {
      const loadedModels = await angelaApiService.getModels(providerId);
      setModels(loadedModels);
      
      // Select first available text model
      const textModel = loadedModels.find(m => m.type === 'text' || m.type === 'multimodal');
      if (textModel) {
        setSelectedModel(textModel.id);
      } else {
        setSelectedModel('');
      }
    } catch (error) {
      console.error('Failed to load models for provider:', error);
    }
  };

  // Generate tool using AI
  const generateToolWithAI = async () => {
    if (!aiPrompt.trim() || !selectedProvider || !selectedModel) {
      setGenerationError('Please provide a description and select a provider and model.');
      return;
    }

    setIsGeneratingTool(true);
    setGenerationError(null);
    setGeneratedTool(null);

    try {
      // Create AI config for the request
      const aiConfig: angelaAIConfig = {
        provider: selectedProvider,
        models: {
          text: selectedModel,
          vision: '',
          code: ''
        },
        parameters: {
          temperature: 0.7,
          maxTokens: 2000,
          topP: 1.0,
          topK: 40
        },
        features: {
          enableTools: false, // Don't use tools when generating tools
          enableRAG: false,
          enableStreaming: false, // Use non-streaming for structured output
          enableVision: false,
          autoModelSelection: false,
          enableMCP: false
        },
        autonomousAgent: {
          enabled: false,
          maxRetries: 3,
          retryDelay: 1000,
          enableSelfCorrection: true,
          enableToolGuidance: true,
          enableProgressTracking: true,
          maxToolCalls: 10,
          confidenceThreshold: 0.7,
          enableChainOfThought: true,
          enableErrorLearning: true
        }
      };

      // Enhanced system prompt for tool generation
      const systemPrompt = `You are an expert JavaScript developer and tool architect. Your job is to create angela Assistant tools based on user descriptions.

CRITICAL INSTRUCTIONS:
1. You MUST respond with valid JSON only - no explanations, no markdown, no code blocks
2. The JSON must match this exact schema:
{
  "name": "tool_name_in_snake_case",
  "description": "Clear, friendly description of what this tool does",
  "parameters": [
    {
      "name": "parameter_name",
      "type": "string|number|boolean",
      "description": "What this parameter does",
      "required": true|false
    }
  ],
  "implementation": "async function implementation(args) { /* JavaScript code here */ return result; }"
}

IMPLEMENTATION GUIDELINES:
- Always use async functions
- Handle errors with try/catch
- Return meaningful results as objects or primitives
- For API calls, use fetch() with proper error handling
- For data processing, include validation
- Make the code robust and user-friendly
- Add helpful comments in the code
- Use modern JavaScript features
- Always return something useful

PARAMETER TYPES:
- Use "string" for text, URLs, JSON strings
- Use "number" for numeric values
- Use "boolean" for true/false values

EXAMPLES OF GOOD TOOLS:
- Weather checker (fetches from API)
- Text processor (manipulates strings)
- Math calculator (performs calculations)
- File analyzer (processes data)
- URL shortener (calls shortening service)
- Color converter (converts between formats)
- Password generator (creates secure passwords)
- QR code generator (creates QR codes)

Remember: RESPOND WITH VALID JSON ONLY!`;

      const userPrompt = `Create a angela Assistant tool based on this description:

${aiPrompt}

Make it useful, robust, and user-friendly. Include proper error handling and return meaningful results.`;

      // Send request to AI
      const response = await angelaApiService.sendChatMessage(
        userPrompt,
        aiConfig,
        undefined,
        systemPrompt
      );

      const content = response.content.trim();
      
      // Try to parse the AI response as JSON
      try {
        // Clean up the response - remove any markdown formatting
        let cleanContent = content;
        if (content.includes('```')) {
          cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        
        const toolDefinition = JSON.parse(cleanContent);
        
        // Validate the tool definition
        if (!toolDefinition.name || !toolDefinition.description || !toolDefinition.implementation) {
          throw new Error('Generated tool is missing required fields (name, description, or implementation)');
        }

        if (!Array.isArray(toolDefinition.parameters)) {
          toolDefinition.parameters = [];
        }

        // Validate parameters
        for (const param of toolDefinition.parameters) {
          if (!param.name || !param.type || !param.description) {
            throw new Error('Invalid parameter definition in generated tool');
          }
        }

        setGeneratedTool(toolDefinition);
        setShowAIPreview(true);
        
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.error('AI Response:', content);
        setGenerationError(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON format'}. Please try rephrasing your request.`);
      }

    } catch (error) {
      console.error('Failed to generate tool with AI:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate tool');
    } finally {
      setIsGeneratingTool(false);
    }
  };

  // Save AI-generated tool
  const saveAIGeneratedTool = async () => {
    if (!generatedTool) return;

    try {
      await db.addTool({
        name: generatedTool.name,
        description: generatedTool.description,
        parameters: generatedTool.parameters,
        implementation: generatedTool.implementation,
        isEnabled: true
      });

      // Reload tools
      await loadTools();
      
      // Reset AI creation state
      setGeneratedTool(null);
      setShowAIPreview(false);
      setAiPrompt('');
      setGenerationError(null);
      
      // Switch to tools view to see the new tool
      setActiveSection('tools');
      
    } catch (error) {
      console.error('Failed to save AI-generated tool:', error);
      setGenerationError('Failed to save tool to database');
    }
  };

  // Execute tool test
  const executeTest = async (tool: ToolBeltTool, testCase?: any) => {
    setIsExecutingTest(true);
    try {
      // Create a safe execution environment
      const func = new Function('return ' + tool.code)();
      
      // Use test case parameters or current test input
      const params = testCase ? testCase.parameters : testInput;
      
      // Execute the function with parameters
      const result = await func(...Object.values(params));
      
      setTestResults({
        success: true,
        result: result,
        parameters: params,
        executionTime: Date.now(),
        tool: tool.name
      });
    } catch (error) {
      setTestResults({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        parameters: testCase ? testCase.parameters : testInput,
        tool: tool.name
      });
    } finally {
      setIsExecutingTest(false);
    }
  };

  // Toggle tool enabled state
  const toggleTool = async (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;

    // All tools are now database tools
    try {
      await db.updateTool(toolId, { 
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || [],
        implementation: tool.code,
        isEnabled: !tool.enabled 
      });
      // Reload tools to reflect database changes
      await loadTools();
    } catch (error) {
      console.error('Failed to toggle tool:', error);
    }
  };

  // Delete custom tool
  const deleteTool = async (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;

    try {
      await db.deleteTool(toolId);
      // Reload tools to reflect database changes
      await loadTools();
    } catch (error) {
      console.error('Failed to delete tool:', error);
    }
  };

  // Create new tool from template
  const createFromTemplate = (template: ToolTemplate) => {
    setNewTool({
      name: template.name,
      description: template.description,
      category: 'custom',
      enabled: true,
      code: template.code,
      parameters: template.parameters,
      isBuiltIn: false
    });
    setIsCreateModalOpen(true);
  };

  // Save new tool
  const saveNewTool = async () => {
    if (!newTool.name || !newTool.code) return;

    try {
      const toolDefinition = {
        name: newTool.name,
        description: newTool.description || '',
        parameters: newTool.parameters || [],
        implementation: newTool.code,
        isEnabled: true
      };

      await db.addTool(toolDefinition);
      
      // Reload tools to include the new one
      await loadTools();
      
      // Reset form and close modal
      setIsCreateModalOpen(false);
      setNewTool({
        name: '',
        description: '',
        category: 'custom',
        enabled: true,
        code: '',
        parameters: [],
        isBuiltIn: false
      });
    } catch (error) {
      console.error('Failed to create tool:', error);
    }
  };

  // Open edit tool modal
  const openEditTool = (tool: ToolBeltTool) => {
    setEditingTool(tool);
    setEditTool({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      enabled: tool.enabled,
      code: tool.code,
      parameters: tool.parameters || [],
      isBuiltIn: tool.isBuiltIn
    });
    setIsEditModalOpen(true);
  };

  // Save edited tool
  const saveEditedTool = async () => {
    if (!editTool.name || !editTool.code || !editingTool) return;

    try {
      const toolDefinition = {
        name: editTool.name,
        description: editTool.description || '',
        parameters: editTool.parameters || [],
        implementation: editTool.code,
        isEnabled: editTool.enabled || false
      };

      await db.updateTool(editingTool.id, toolDefinition);
      
      // Reload tools to reflect changes
      await loadTools();
      
      // Reset form and close modal
      setIsEditModalOpen(false);
      setEditingTool(null);
      resetEditForm();
    } catch (error) {
      console.error('Failed to update tool:', error);
    }
  };

  // Reset edit form
  const resetEditForm = () => {
    setEditTool({
      name: '',
      description: '',
      category: 'custom',
      enabled: true,
      code: '',
      parameters: [],
      isBuiltIn: false
    });
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="space-y-6 min-h-0">
      {/* ToolBelt Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Wrench className="w-6 h-6 text-sakura-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Tool Belt
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage and create custom tools for angela Assistant
            </p>
          </div>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveSection('tools')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSection === 'tools'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Wrench className="w-4 h-4" />
              Tools
            </div>
          </button>
          <button
            onClick={() => setActiveSection('templates')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSection === 'templates'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Code className="w-4 h-4" />
              Templates
            </div>
          </button>
          <button
            onClick={() => setActiveSection('create')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSection === 'create'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              Create
            </div>
          </button>
          <button
            onClick={() => setActiveSection('ai-create')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSection === 'ai-create'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              AI Creator
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* AI Tool Creator Section */}
        {activeSection === 'ai-create' && (
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  AI Tool Creator
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Describe what you want, and AI will create a custom tool for angela
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Provider and Model Selection */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  AI Configuration
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AI Provider
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select Provider</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AI Model
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={!selectedProvider}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">Select Model</option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Tool Description Input */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Describe Your Tool
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      What should this tool do? (Be specific and detailed)
                    </label>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Example: Create a tool that converts temperatures between Celsius, Fahrenheit, and Kelvin. It should take a temperature value and the source unit, then return the converted values in all three units with proper formatting."
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Example prompts */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      💡 Example Ideas:
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <button
                        onClick={() => setAiPrompt('Create a tool that generates secure passwords with customizable length and character sets including uppercase, lowercase, numbers, and symbols.')}
                        className="text-left p-2 rounded text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        • Password Generator
                      </button>
                      <button
                        onClick={() => setAiPrompt('Create a tool that converts text between different cases (uppercase, lowercase, title case, camelCase, snake_case, kebab-case).')}
                        className="text-left p-2 rounded text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        • Text Case Converter
                      </button>
                      <button
                        onClick={() => setAiPrompt('Create a tool that calculates the reading time for a given text based on average reading speed.')}
                        className="text-left p-2 rounded text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        • Reading Time Calculator
                      </button>
                      <button
                        onClick={() => setAiPrompt('Create a tool that generates QR codes for text, URLs, or other data with customizable size and error correction.')}
                        className="text-left p-2 rounded text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        • QR Code Generator
                      </button>
                    </div>
                  </div>

                  {generationError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <span className="text-red-700 dark:text-red-300 font-medium">Generation Error</span>
                      </div>
                      <p className="text-red-600 dark:text-red-400 mt-1 text-sm">{generationError}</p>
                    </div>
                  )}

                  <button
                    onClick={generateToolWithAI}
                    disabled={!aiPrompt.trim() || !selectedProvider || !selectedModel || isGeneratingTool}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isGeneratingTool ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Tool...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Tool with AI
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Generated Tool Preview */}
              {showAIPreview && generatedTool && (
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Generated Tool Preview
                    </h4>
                    <button
                      onClick={() => setShowAIPreview(false)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tool Name
                        </label>
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white font-mono text-sm">
                          {generatedTool.name}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Parameters
                        </label>
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm">
                          {generatedTool.parameters.length} parameter(s)
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm">
                        {generatedTool.description}
                      </div>
                    </div>

                    {generatedTool.parameters.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Parameters
                        </label>
                        <div className="space-y-2">
                          {generatedTool.parameters.map((param: any, index: number) => (
                            <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                              <div className="flex items-start gap-2 text-sm">
                                <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                                  {param.name}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">
                                  ({param.type})
                                </span>
                                {param.required && (
                                  <span className="text-red-500 text-xs">*</span>
                                )}
                                <span className="text-gray-600 dark:text-gray-300 flex-1">
                                  - {param.description}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Implementation Code
                      </label>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto max-h-64">
                        <code>{generatedTool.implementation}</code>
                      </pre>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={saveAIGeneratedTool}
                        className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Save Tool
                      </button>
                      <button
                        onClick={() => {
                          setShowAIPreview(false);
                          setGeneratedTool(null);
                        }}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tools Section */}
        {activeSection === 'tools' && (
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Wrench className="w-6 h-6 text-sakura-500" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Custom Tools
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your custom tools and view available functions
                  </p>
                </div>
              </div>
            </div>

            {/* Filter Section */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                {Object.keys(categoryFilters).map(category => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      categoryFilters[category as keyof typeof categoryFilters]
                        ? 'bg-sakura-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tools List */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sakura-500"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTools.length > 0 ? (
                  filteredTools.map((tool) => (
                    <div
                      key={tool.id}
                      className={`p-4 rounded-lg border transition-all ${
                        tool.enabled || tool.isEnabled
                          ? 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-900/10 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 bg-white/30 dark:bg-gray-800/30'
                      } hover:bg-white/50 dark:hover:bg-gray-800/50`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            tool.enabled || tool.isEnabled
                              ? 'bg-green-500'
                              : 'bg-gray-400 dark:bg-gray-600'
                          }`}>
                            <Wrench className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {tool.name}
                              </h4>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                tool.enabled || tool.isEnabled
                                  ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              }`}>
                                {tool.enabled || tool.isEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                              {tool.isBuiltIn && (
                                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                                  Built-in
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {tool.description}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 capitalize">
                              {tool.category} • {tool.parameters?.length || 0} parameters
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {tool.testCases && tool.testCases.length > 0 && (
                            <button
                              onClick={() => executeTest(tool)}
                              className="px-3 py-1 text-sm rounded transition-colors bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-700 flex items-center gap-1"
                            >
                              <TestTube className="w-3 h-3" />
                              Test
                            </button>
                          )}
                          
                          <button
                            onClick={() => toggleTool(tool.id)}
                            className={`p-2 transition-colors ${
                              tool.enabled || tool.isEnabled
                                ? 'text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                            title={tool.enabled || tool.isEnabled ? 'Disable tool' : 'Enable tool'}
                          >
                            {tool.enabled || tool.isEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          
                          {!tool.isBuiltIn && (
                            <>
                              <button
                                onClick={() => openEditTool(tool)}
                                className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                title="Edit tool"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              
                              <button
                                onClick={() => deleteTool(tool.id)}
                                className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                                title="Delete tool"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Parameters Display */}
                      {tool.parameters && tool.parameters.length > 0 && (
                        <div className="mt-4 p-3 bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg">
                          <h5 className="text-sm font-medium text-gray-800 dark:text-gray-300 mb-2">
                            Parameters ({tool.parameters.length})
                          </h5>
                          <div className="space-y-2">
                            {tool.parameters.map((param, index) => (
                              <div key={index} className="flex items-start gap-2 text-xs">
                                <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                                  {param.name}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">
                                  ({param.type})
                                </span>
                                {param.required && (
                                  <span className="text-red-500 text-xs">*</span>
                                )}
                                <span className="text-gray-600 dark:text-gray-300 flex-1">
                                  - {param.description}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Wrench className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No tools found</h4>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      {Object.values(categoryFilters).some(v => v) 
                        ? "No tools match the selected filters"
                        : "Create your first custom tool to get started"
                      }
                    </p>
                    <button 
                      onClick={() => setActiveSection('create')}
                      className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors"
                    >
                      Create Your First Tool
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Templates Section */}
        {activeSection === 'templates' && (
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Code className="w-6 h-6 text-sakura-500" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Tool Templates
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pre-built tool templates to get you started quickly
                  </p>
                </div>
              </div>
            </div>

            {TOOL_TEMPLATES.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {TOOL_TEMPLATES.map((template) => (
                  <div
                    key={template.id}
                    className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/30 dark:bg-gray-800/30 hover:bg-white/50 dark:hover:bg-gray-800/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {template.name}
                          </h4>
                          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full capitalize">
                            {template.category}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={() => createFromTemplate(template)}
                        className="flex-1 px-3 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        Use Template
                      </button>
                      <button
                        onClick={() => setSelectedTemplate(template)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="View code"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Code className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                </div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No templates available</h4>
                <p className="text-gray-500 dark:text-gray-400">
                  Templates will help you create tools faster with pre-built examples
                </p>
              </div>
            )}
          </div>
        )}

        {/* Create Section */}
        {activeSection === 'create' && (
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Plus className="w-6 h-6 text-sakura-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Create Custom Tool
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Build a custom tool from scratch with your own implementation
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Basic Information */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                  Basic Information
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tool Name *
                    </label>
                    <input
                      type="text"
                      value={newTool.name || ''}
                      onChange={(e) => setNewTool(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="my_custom_tool"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Category
                    </label>
                    <select
                      value={newTool.category || 'custom'}
                      onChange={(e) => setNewTool(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
                    >
                      <option value="custom">Custom</option>
                      <option value="utility">Utility</option>
                      <option value="datetime">Date & Time</option>
                      <option value="math">Mathematics</option>
                      <option value="network">Network</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={newTool.description || ''}
                    onChange={(e) => setNewTool(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this tool does and how it helps..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              {/* Parameters */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-medium text-gray-900 dark:text-white">
                    Parameters
                  </h4>
                  <button
                    onClick={() => {
                      const newParam = {
                        name: '',
                        type: 'string' as const,
                        description: '',
                        required: false
                      };
                      setNewTool(prev => ({
                        ...prev,
                        parameters: [...(prev.parameters || []), newParam]
                      }));
                    }}
                    className="px-3 py-1 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors text-sm flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Parameter
                  </button>
                </div>

                {newTool.parameters && newTool.parameters.length > 0 ? (
                  <div className="space-y-3">
                    {newTool.parameters.map((param, index) => (
                      <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Name
                            </label>
                            <input
                              type="text"
                              value={param.name}
                              onChange={(e) => {
                                const newParams = [...(newTool.parameters || [])];
                                newParams[index] = { ...param, name: e.target.value };
                                setNewTool(prev => ({ ...prev, parameters: newParams }));
                              }}
                              placeholder="paramName"
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Type
                            </label>
                            <select
                              value={param.type}
                              onChange={(e) => {
                                const newParams = [...(newTool.parameters || [])];
                                newParams[index] = { ...param, type: e.target.value as any };
                                setNewTool(prev => ({ ...prev, parameters: newParams }));
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Description
                            </label>
                            <input
                              type="text"
                              value={param.description}
                              onChange={(e) => {
                                const newParams = [...(newTool.parameters || [])];
                                newParams[index] = { ...param, description: e.target.value };
                                setNewTool(prev => ({ ...prev, parameters: newParams }));
                              }}
                              placeholder="Parameter description"
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <input
                                type="checkbox"
                                checked={param.required}
                                onChange={(e) => {
                                  const newParams = [...(newTool.parameters || [])];
                                  newParams[index] = { ...param, required: e.target.checked };
                                  setNewTool(prev => ({ ...prev, parameters: newParams }));
                                }}
                                className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500"
                              />
                              Required
                            </label>
                            <button
                              onClick={() => {
                                const newParams = [...(newTool.parameters || [])];
                                newParams.splice(index, 1);
                                setNewTool(prev => ({ ...prev, parameters: newParams }));
                              }}
                              className="p-1 text-red-500 hover:text-red-700 transition-colors"
                              title="Remove parameter"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Code className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No parameters defined. Add parameters if your tool needs input.</p>
                  </div>
                )}
              </div>

              {/* Implementation */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                  Implementation Code
                </h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    JavaScript Function *
                  </label>
                  <textarea
                    value={newTool.code || ''}
                    onChange={(e) => setNewTool(prev => ({ ...prev, code: e.target.value }))}
                    placeholder={`async function implementation(args) {
  // Your tool implementation here
  // args will contain the parameters passed to the tool
  
  try {
    // Example: accessing parameters
    const { param1, param2 } = args;
    
    // Your logic here
    const result = param1 + param2;
    
    // Return the result
    return {
      success: true,
      result: result,
      message: "Tool executed successfully"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}`}
                    rows={15}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Write a JavaScript function that implements your tool's functionality. The function should accept an 'args' object with your defined parameters.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={saveNewTool}
                  disabled={!newTool.name?.trim() || !newTool.description?.trim() || !newTool.code?.trim()}
                  className="flex-1 px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <Check className="w-4 h-4" />
                  Save Tool
                </button>
                <button
                  onClick={() => {
                    setNewTool({
                      name: '',
                      description: '',
                      category: 'custom',
                      enabled: true,
                      code: '',
                      parameters: [],
                      isBuiltIn: false
                    });
                  }}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Reset Form
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tool Code View Modal */}
        {selectedTool && !isTestModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedTool.name}
                </h3>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <p className="text-gray-600 dark:text-gray-400">{selectedTool.description}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Code
                  </label>
                  <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                    <code>{selectedTool.code}</code>
                  </pre>
                </div>
                
                {selectedTool.parameters && selectedTool.parameters.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Parameters
                    </label>
                    <div className="space-y-2">
                      {selectedTool.parameters.map((param, index) => (
                        <div key={index} className="flex items-center gap-4 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                            {param.name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            ({param.type})
                          </span>
                          {param.required && (
                            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded">
                              Required
                            </span>
                          )}
                          <span className="text-gray-600 dark:text-gray-300 flex-1">
                            - {param.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test Modal */}
        {isTestModalOpen && selectedTool && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Test {selectedTool.name}
                </h3>
                <button
                  onClick={() => {
                    setIsTestModalOpen(false);
                    setTestResults(null);
                    setTestInput({});
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Test Cases */}
                {selectedTool.testCases && selectedTool.testCases.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Quick Tests
                    </label>
                    <div className="space-y-2">
                      {selectedTool.testCases.map((testCase, index) => (
                        <button
                          key={index}
                          onClick={() => executeTest(selectedTool, testCase)}
                          disabled={isExecutingTest}
                          className="w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 dark:hover:border-sakura-600 transition-colors"
                        >
                          <div className="font-medium">{testCase.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Parameters: {JSON.stringify(testCase.parameters)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Custom Test */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Custom Test
                  </label>
                  {selectedTool.parameters && selectedTool.parameters.length > 0 ? (
                    <div className="space-y-3">
                      {selectedTool.parameters.map((param, index) => (
                        <div key={index}>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            {param.name} ({param.type}) {param.required && '*'}
                          </label>
                          <input
                            type={param.type === 'number' ? 'number' : param.type === 'boolean' ? 'checkbox' : 'text'}
                            value={testInput[param.name] || param.default || ''}
                            onChange={(e) => setTestInput(prev => ({
                              ...prev,
                              [param.name]: param.type === 'boolean' ? e.target.checked : e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            placeholder={param.description}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      This tool doesn't require any parameters.
                    </p>
                  )}
                  
                  <button
                    onClick={() => executeTest(selectedTool)}
                    disabled={isExecutingTest}
                    className="mt-3 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isExecutingTest ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Test
                      </>
                    )}
                  </button>
                </div>
                
                {/* Test Results */}
                {testResults && (
                  <div className="border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Test Results
                    </label>
                    <div className={`p-3 rounded-lg ${
                      testResults.success 
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {testResults.success ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`font-medium ${
                          testResults.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                        }`}>
                          {testResults.success ? 'Test Passed' : 'Test Failed'}
                        </span>
                      </div>
                      <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                        {testResults.success 
                          ? JSON.stringify(testResults.result, null, 2)
                          : testResults.error
                        }
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Tool Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Create Custom Tool
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tool Name
                    </label>
                    <input
                      type="text"
                      value={newTool.name || ''}
                      onChange={(e) => setNewTool(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Enter tool name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <select
                      value={newTool.category || 'custom'}
                      onChange={(e) => setNewTool(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="custom">Custom</option>
                      <option value="utility">Utility</option>
                      <option value="datetime">Date & Time</option>
                      <option value="math">Mathematics</option>
                      <option value="network">Network</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newTool.description || ''}
                    onChange={(e) => setNewTool(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    rows={2}
                    placeholder="Describe what this tool does"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Code
                  </label>
                  <textarea
                    value={newTool.code || ''}
                    onChange={(e) => setNewTool(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    rows={12}
                    placeholder="function myTool(param1, param2) {
  // Your code here
  return result;
}"
                  />
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNewTool}
                    disabled={!newTool.name || !newTool.code}
                    className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Create Tool
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Template Code View Modal */}
        {selectedTemplate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedTemplate.name} Template
                </h3>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <p className="text-gray-600 dark:text-gray-400">{selectedTemplate.description}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Template Code
                  </label>
                  <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                    <code>{selectedTemplate.code}</code>
                  </pre>
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      createFromTemplate(selectedTemplate);
                      setSelectedTemplate(null);
                    }}
                    className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors"
                  >
                    Use This Template
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Tool Modal */}
        {isEditModalOpen && editingTool && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Edit Tool: {editingTool.name}
                </h3>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTool(null);
                    resetEditForm();
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                  <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                    Basic Information
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tool Name *
                      </label>
                      <input
                        type="text"
                        value={editTool.name || ''}
                        onChange={(e) => setEditTool(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="my_custom_tool"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Category
                      </label>
                      <select
                        value={editTool.category || 'custom'}
                        onChange={(e) => setEditTool(prev => ({ ...prev, category: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
                      >
                        <option value="custom">Custom</option>
                        <option value="utility">Utility</option>
                        <option value="datetime">Date & Time</option>
                        <option value="math">Mathematics</option>
                        <option value="network">Network</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description *
                    </label>
                    <textarea
                      value={editTool.description || ''}
                      onChange={(e) => setEditTool(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe what this tool does and how it helps..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent resize-none"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editTool.enabled || false}
                        onChange={(e) => setEditTool(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Enable this tool
                      </span>
                    </label>
                  </div>
                </div>

                {/* Parameters */}
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">
                      Parameters
                    </h4>
                    <button
                      onClick={() => {
                        const newParam = {
                          name: '',
                          type: 'string' as const,
                          description: '',
                          required: false
                        };
                        setEditTool(prev => ({
                          ...prev,
                          parameters: [...(prev.parameters || []), newParam]
                        }));
                      }}
                      className="px-3 py-1 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors text-sm flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Parameter
                    </button>
                  </div>

                  {editTool.parameters && editTool.parameters.length > 0 ? (
                    <div className="space-y-3">
                      {editTool.parameters.map((param, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Name
                              </label>
                              <input
                                type="text"
                                value={param.name}
                                onChange={(e) => {
                                  const newParams = [...(editTool.parameters || [])];
                                  newParams[index] = { ...param, name: e.target.value };
                                  setEditTool(prev => ({ ...prev, parameters: newParams }));
                                }}
                                placeholder="paramName"
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Type
                              </label>
                              <select
                                value={param.type}
                                onChange={(e) => {
                                  const newParams = [...(editTool.parameters || [])];
                                  newParams[index] = { ...param, type: e.target.value as any };
                                  setEditTool(prev => ({ ...prev, parameters: newParams }));
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Description
                              </label>
                              <input
                                type="text"
                                value={param.description}
                                onChange={(e) => {
                                  const newParams = [...(editTool.parameters || [])];
                                  newParams[index] = { ...param, description: e.target.value };
                                  setEditTool(prev => ({ ...prev, parameters: newParams }));
                                }}
                                placeholder="Parameter description"
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                <input
                                  type="checkbox"
                                  checked={param.required}
                                  onChange={(e) => {
                                    const newParams = [...(editTool.parameters || [])];
                                    newParams[index] = { ...param, required: e.target.checked };
                                    setEditTool(prev => ({ ...prev, parameters: newParams }));
                                  }}
                                  className="rounded border-gray-300 text-sakura-500 focus:ring-sakura-500"
                                />
                                Required
                              </label>
                              <button
                                onClick={() => {
                                  const newParams = [...(editTool.parameters || [])];
                                  newParams.splice(index, 1);
                                  setEditTool(prev => ({ ...prev, parameters: newParams }));
                                }}
                                className="p-1 text-red-500 hover:text-red-700 transition-colors"
                                title="Remove parameter"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Code className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No parameters defined. Add parameters if your tool needs input.</p>
                    </div>
                  )}
                </div>

                {/* Implementation */}
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
                  <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                    Implementation Code
                  </h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      JavaScript Function *
                    </label>
                    <textarea
                      value={editTool.code || ''}
                      onChange={(e) => setEditTool(prev => ({ ...prev, code: e.target.value }))}
                      placeholder={`async function implementation(args) {
  // Your tool implementation here
  // args will contain the parameters passed to the tool
  
  try {
    // Example: accessing parameters
    const { param1, param2 } = args;
    
    // Your logic here
    const result = param1 + param2;
    
    // Return the result
    return {
      success: true,
      result: result,
      message: "Tool executed successfully"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}`}
                      rows={15}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent resize-none font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Update the JavaScript function that implements your tool's functionality.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={saveEditedTool}
                    disabled={!editTool.name?.trim() || !editTool.description?.trim() || !editTool.code?.trim()}
                    className="flex-1 px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingTool(null);
                      resetEditForm();
                    }}
                    className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolBelt; 
