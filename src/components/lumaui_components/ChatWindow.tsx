import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Loader2, Bot, Trash2, Settings, ChevronDown, Wand2, Scissors } from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';
import { LumaUIAPIClient, ChatMessage as LumaChatMessage } from './services/lumaUIApiClient';
import type { Tool } from '../../db';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import AISettingsModal from './AISettingsModal';
import LiveToolExecution from './LiveToolExecution';
import TypingIndicator from './TypingIndicator';

import { useCheckpoints } from './CheckpointManager';
import ChatPersistence from './ChatPersistence';
import { gsap } from 'gsap';

// Message types for our chat interface
interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  files?: string[];
  tool_calls?: any[];
  tool_call_id?: string;
}

// Tool call structure from AI response
interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
}

// Tool execution tracking
interface ToolExecution {
  id: string;
  toolName: string;
  parameters: any;
  status: 'starting' | 'executing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
}

// AI Planning and Reflection Interface
interface AIReflection {
  id: string;
  step: number;
  toolResults: string[];
  currentSituation: string;
  nextSteps: string[];
  reasoning: string;
  confidence: number; // 0-100
  shouldContinue: boolean;
  timestamp: Date;
}

interface PlanningExecution {
  id: string;
  status: 'planning' | 'executing' | 'reflecting' | 'completed';
  currentStep: number;
  totalSteps: number;
  reflections: AIReflection[];
  startTime: Date;
  endTime?: Date;
}

interface ChatWindowProps {
  selectedFile?: string | null;
  fileContent?: string;
  files?: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    content?: string;
    children?: any[];
  }>;
  onFileContentChange?: (content: string) => void;
  onFileSelect?: (path: string, content: string) => void;
  workingDirectory?: string;
  lumaTools?: Record<string, any>;
  projectId?: string;
  projectName?: string;
  refreshFileTree?: () => void | Promise<void>;
}

// LumaUI Tool Definitions (matching db Tool interface)
const LUMA_TOOLS: Tool[] = [
  {
    id: "create_file",
    name: "create_file", 
    description: "Create a completely new file with the specified content. Use this only for files that don't exist yet.",
    parameters: [
      { name: "path", type: "string", description: "The file path to create (e.g., 'src/components/NewComponent.tsx')", required: true },
      { name: "content", type: "string", description: "The complete content to write to the new file", required: true }
    ],
    implementation: "lumaTools.create_file",
    isEnabled: true
  },
  {
    id: "edit_file",
    name: "edit_file",
    description: "FULL FILE REPLACEMENT: Update an entire file with new content. Only use this for major restructuring or new files. You MUST provide the COMPLETE file content.", 
    parameters: [
      { name: "path", type: "string", description: "The file path to edit", required: true },
      { name: "content", type: "string", description: "The COMPLETE file content - this replaces the entire file", required: true }
    ],
    implementation: "lumaTools.edit_file",
    isEnabled: true
  },
  {
    id: "edit_file_section",
    name: "edit_file_section",
    description: "PRECISION EDITING: Replace a specific section of code in an existing file. Always read the file first to identify the exact text to replace. Use this for small changes like adding buttons, modifying functions, or updating specific parts.",
    parameters: [
      { name: "path", type: "string", description: "The file path to edit (e.g., 'src/components/Header.tsx')", required: true },
      { name: "old_text", type: "string", description: "The exact text to replace. Must match the current file content exactly, including whitespace and line breaks.", required: true },
      { name: "new_text", type: "string", description: "The new text to replace the old text with. This can be a single line or multiple lines.", required: true }
    ],
    implementation: "lumaTools.edit_file_section",
    isEnabled: true
  },
  {
    id: "read_file", 
    name: "read_file",
    description: "Read the complete contents of an existing file. Always use this BEFORE editing any file to understand the current structure and content.",
    parameters: [
      { name: "path", type: "string", description: "The file path to read (e.g., 'src/components/Header.tsx')", required: true }
    ],
    implementation: "lumaTools.read_file", 
    isEnabled: true
  },
  {
    id: "list_files",
    name: "list_files",
    description: "List all files and directories in the project or a specific directory to understand the project structure.",
    parameters: [
      { name: "path", type: "string", description: "The directory path to list (optional, defaults to root)", required: false }
    ],
    implementation: "lumaTools.list_files",
    isEnabled: true
  },
  {
    id: "get_all_files",
    name: "get_all_files", 
    description: "Get a complete list of all files and directories in the project for understanding the overall structure.",
    parameters: [],
    implementation: "lumaTools.get_all_files",
    isEnabled: true
  },
  {
    id: "run_command",
    name: "run_command",
    description: "Execute a shell command in the project directory (e.g., npm install, npm run build).",
    parameters: [
      { name: "command", type: "string", description: "The command to execute (e.g., 'npm', 'git', 'ls')", required: true },
      { name: "args", type: "array", description: "Command arguments as array (e.g., ['install', 'react-router-dom'])", required: false }
    ],
    implementation: "lumaTools.run_command",
    isEnabled: true
  },
  {
    id: "install_package",
    name: "install_package", 
    description: "Install an npm package to the project. This automatically runs npm install for you.",
    parameters: [
      { name: "package", type: "string", description: "The package name to install (e.g., 'react-router-dom', '@types/node')", required: true },
      { name: "dev", type: "boolean", description: "Whether to install as dev dependency (default: false)", required: false }
    ],
    implementation: "lumaTools.install_package",
    isEnabled: true
  },
  {
    id: "get_project_info",
    name: "get_project_info",
    description: "Get information about the current project including package.json, installed dependencies, and project structure.",
    parameters: [],
    implementation: "lumaTools.get_project_info", 
    isEnabled: true
  }
];

// Convert to OpenAI function calling format
const convertToOpenAITools = (tools: Tool[]) => {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters.reduce((props, param) => {
          let paramType = "string";
          if (param.type === "array") {
            paramType = "array";
          } else if (param.type === "boolean") {
            paramType = "boolean";
          }
          
          props[param.name] = {
            type: paramType,
            description: param.description
          };
          
          if (param.type === "array") {
            props[param.name].items = { type: "string" };
          }
          
          return props;
        }, {} as any),
        required: tool.parameters.filter(p => p.required).map(p => p.name)
      }
    }
  }));
};

const OPENAI_TOOLS = convertToOpenAITools(LUMA_TOOLS);

// Simple provider class for API calls with dynamic token allocation
class BoltLikeProvider {
  constructor(
    private apiClient: LumaUIAPIClient, 
    private model: string, 
    private parameters: AIParameters
  ) {}

  async sendMessage(messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }>): Promise<any> {
    const response = await this.apiClient.sendChat(
      this.model, 
      messages as LumaChatMessage[], 
      { 
        temperature: this.parameters.temperature,
        max_tokens: this.parameters.maxTokens,
        top_p: this.parameters.topP,
        frequency_penalty: this.parameters.frequencyPenalty,
        presence_penalty: this.parameters.presencePenalty,
        tools: OPENAI_TOOLS as any
      },
      LUMA_TOOLS
    );
    return response;
  }
}

// Utility to flatten file tree
const flattenFiles = (nodes: any[]): any[] => {
  const result: any[] = [];
  const traverse = (items: any[]) => {
    for (const item of items) {
      result.push(item);
      if (item.children) traverse(item.children);
    }
  };
  traverse(nodes);
  return result;
};

// AI Parameters interface to match the modal
interface AIParameters {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

const defaultParameters: AIParameters = {
  maxTokens: 16000,
  temperature: 0.1,
  topP: 1.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  maxIterations: 15
};

// Settings persistence functions
const saveLumaUISettings = (providerId: string, modelId: string, parameters?: AIParameters) => {
  const settings = {
    providerId,
    modelId,
    parameters: parameters || defaultParameters,
    timestamp: Date.now()
  };
  localStorage.setItem('lumaui_chat_settings', JSON.stringify(settings));
};

const loadLumaUISettings = () => {
  try {
    const saved = localStorage.getItem('lumaui_chat_settings');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Error loading LumaUI settings:', error);
    return null;
  }
};

// Dynamic token calculation for complex sessions
const calculateDynamicTokens = (messages: Message[], retryCount: number = 0): number => {
  const baseTokens = 16000;
  const maxTokens = 128000;
  
  // Session complexity multiplier (grows with message count)
  const sessionMultiplier = Math.min(3, 1 + (messages.length / 20));
  
  // Tool complexity multiplier (grows with tool usage)
  const toolMessages = messages.filter(m => m.tool_calls || m.type === 'tool').length;
  const toolMultiplier = Math.min(2.5, 1 + (toolMessages / 8));
  
  // Retry multiplier (30% more tokens per retry)
  const retryMultiplier = 1 + (retryCount * 0.3);
  
  const calculatedTokens = Math.floor(baseTokens * sessionMultiplier * toolMultiplier * retryMultiplier);
  
  return Math.min(maxTokens, Math.max(baseTokens, calculatedTokens));
};

// Initial Planning System Prompt - Before any tool execution
const INITIAL_PLANNING_SYSTEM_PROMPT = `You are angela's strategic planning module. Before executing any tools, you must analyze the project structure and create a comprehensive execution plan.

Your response must be a JSON object with this exact structure:
{
  "projectAnalysis": "Analysis of current project structure, files, and architecture",
  "userRequestBreakdown": "Breakdown of what the user is asking for",
  "executionPlan": [
    {
      "step": 1,
      "action": "read_file",
      "target": "src/App.tsx",
      "purpose": "Understand current app structure before adding new component"
    },
    {
      "step": 2,
      "action": "create_file", 
      "target": "src/components/LoginForm.tsx",
      "purpose": "Create the main login component with form structure"
    }
  ],
  "estimatedSteps": 5,
  "dependencies": ["react-hook-form", "zod"],
  "potentialChallenges": ["Existing routing might need updates", "Styling consistency"],
  "confidence": 90
}

INITIAL PLANNING RULES:
1. Analyze the complete project structure first
2. Break down the user's request into logical steps
3. Plan the EXACT sequence of tool calls needed
4. Identify dependencies that need to be installed
5. Consider existing code patterns and architecture
6. Plan for potential challenges and how to handle them
7. Be specific about file paths and tool actions
8. Estimate total number of steps realistically

TOOL ACTIONS AVAILABLE:
- read_file: Read existing files to understand current code
- create_file: Create new files with complete content
- edit_file_section: Make targeted edits to existing files
- install_package: Install npm dependencies
- run_command: Execute shell commands
- list_files: Explore directory structure

PLANNING STRATEGY:
1. Always read existing files BEFORE making changes
2. Install dependencies BEFORE using them in code
3. Create files in logical order (utilities first, then components)
4. Plan for integration with existing code patterns
5. Consider responsive design and accessibility from the start

Be thorough and strategic in your planning.`;

// Reflection Planning System Prompt - After tool execution
const REFLECTION_PLANNING_SYSTEM_PROMPT = `You are angela's reflection and adaptation module. After each tool execution, you must analyze the results and plan the next steps.

Your response must be a JSON object with this exact structure:
{
  "currentSituation": "Brief description of what has been accomplished so far",
  "nextSteps": ["Step 1", "Step 2", "Step 3"],
  "reasoning": "Detailed explanation of why these next steps are needed",
  "confidence": 85,
  "shouldContinue": true
}

REFLECTION RULES:
1. Always analyze what was just accomplished
2. Identify what still needs to be done to complete the user's request
3. Plan 1-3 specific next steps
4. Set confidence (0-100) based on how clear the path forward is
5. Set shouldContinue to false only when the task is completely done
6. Be specific about file operations, installations, or commands needed
7. Consider dependencies and order of operations
8. If errors occurred, plan how to fix them

EXAMPLE REFLECTION SCENARIOS:
- After creating a file: Plan to add imports, implement functions, or style components
- After reading a file: Plan specific edits or additions needed
- After installing packages: Plan to configure or use the new dependencies
- After errors: Plan alternative approaches or debugging steps

Be concise but thorough in your reflection.`;

const SYSTEM_PROMPT = `You are angela, an expert AI assistant and exceptional senior software developer with vast knowledge across multiple programming languages, frameworks, and best practices. You are a Bolt-like AI agent that works automatically using the provided tools.

<strategic_planning_workflow>
  You follow a sophisticated planning-first approach that prevents repetitive actions:
  
  1. INITIAL STRATEGIC PLANNING: Before any tool execution, a comprehensive plan is created analyzing the project structure and breaking down the user's request into logical steps
  2. SYSTEMATIC EXECUTION: Follow the planned sequence of actions step by step, avoiding redundant operations
  3. REFLECTION AFTER EACH STEP: Analyze results and adapt the plan as needed
  4. COMPLETION AWARENESS: Recognize when the task is complete and stop automatically
  
  This prevents local models from repeating the same actions and ensures efficient, goal-oriented execution.
  
  EXECUTION PRINCIPLES:
  - Always read existing files BEFORE making changes (as planned)
  - Install dependencies BEFORE using them (as planned)
  - Follow the logical sequence from the initial plan
  - Adapt the plan based on actual results, but don't deviate unnecessarily
  - Stop when the planned objectives are achieved
</strategic_planning_workflow>

<system_constraints>
  You are operating in a WebContainer environment that runs in the browser. This is a Node.js runtime that emulates a Linux system to some degree. All code is executed in the browser environment.

  The environment supports:
  - Node.js and npm packages  
  - Modern web frameworks (React, Vue, Angular, etc.)
  - Build tools (Vite, Webpack, etc.)
  - Package managers (npm, yarn, pnpm)
  - Shell commands for file operations

  IMPORTANT: Always prefer using modern tools and frameworks. Use Vite for new projects when possible.
  IMPORTANT: When choosing packages, prefer options that work well in browser environments.
</system_constraints>

<code_formatting_info>
  Use 2 spaces for code indentation
  Follow modern JavaScript/TypeScript best practices
  Use functional components with hooks for React
  Prefer TypeScript over JavaScript when possible
</code_formatting_info>

<file_structure_context>
  Current Project Structure:
  {{PROJECT_TREE}}
  
  Available Files:
  {{FILE_LIST}}
  
  BEFORE editing ANY existing file, you MUST:
  1. First call read_file to see the actual content
  2. Understand the current imports, structure, and styling
  3. Only then make precise edits that preserve existing code
  
  NEVER assume what's in a file - always read it first!
</file_structure_context>

<tool_usage_instructions>
  You have access to the following tools that you MUST use to interact with the project:

  1. create_file: Create new files with specified content
  2. edit_file_section: PREFERRED - Replace specific text in existing files (precision editing)
  3. edit_file: Full file replacement (only for major restructuring)
  4. read_file: Read file contents to understand current state
  5. list_files: List directories to understand project structure  
  6. get_all_files: Get complete project overview
  7. run_command: Execute shell commands
  8. install_package: Install npm packages
  9. get_project_info: Get project information

  CRITICAL SUCCESS RULES:
  ✅ ALWAYS call read_file BEFORE any edit operation
  ✅ Use edit_file_section for small, targeted changes
  ✅ Copy the exact text from the file (including whitespace/formatting) 
  ✅ If edit_file_section fails with TEXT_NOT_FOUND, try reading again and find exact match
  ✅ Verify file exists before trying to read it (check PROJECT_TREE)
  ✅ Stop and analyze after 3 failed attempts - don't keep retrying the same approach

  PRECISION EDITING WORKFLOW:
  1. Check if file exists in {{PROJECT_TREE}} first
  2. If file doesn't exist, use create_file instead of edit
  3. For existing files: read_file to get complete current content
  4. Find the EXACT text to replace (copy it character-for-character)
  5. Use edit_file_section with exact old_text and new_text
  6. If TEXT_NOT_FOUND error: re-read file and find different text to match

  EDITING STRATEGY FOR DIFFERENT CHANGES:
  - Adding imports: Find exact import section, add new import line
  - Adding components: Find exact JSX section where component should be inserted
  - Modifying styles: Find exact className or style attribute to change
  - Adding functions: Find exact location between existing functions
  
  ERROR RECOVERY:
  - If edit_file_section fails 2+ times, switch to edit_file with complete content
  - If file not found, check if path is correct in PROJECT_TREE
  - If multiple attempts fail, stop and explain the issue rather than endless loops

  MANDATORY WORKFLOW FOR EXISTING FILES:
  1. Check {{PROJECT_TREE}} to verify file exists
  2. Call read_file to get the complete current file content  
  3. Analyze the existing code structure (imports, components, functions, styling)
  4. Identify the exact text/section that needs to be changed
  5. For SMALL CHANGES: Use edit_file_section with exact old_text and new_text
  6. For MAJOR CHANGES: Use edit_file with complete file content
  
  EXAMPLE WORKFLOW - Adding a button to a page:
  1. Check PROJECT_TREE to see if "src/pages/HomePage.tsx" exists
  2. read_file("src/pages/HomePage.tsx") to see current content
  3. Find exact JSX where button should go: "<div className='content'>\n      <h1>Welcome</h1>\n    </div>"
  4. edit_file_section with old_text="<div className='content'>\n      <h1>Welcome</h1>\n    </div>" and new_text="<div className='content'>\n      <h1>Welcome</h1>\n      <button>Click Me</button>\n    </div>"
  
  EXAMPLE - Adding import:
  1. read_file to see exact import format
  2. Find exact imports section: "import React from 'react';\nimport './App.css';"
  3. edit_file_section with old_text="import React from 'react';\nimport './App.css';" and new_text="import React from 'react';\nimport { useState } from 'react';\nimport './App.css';"

  GENERAL RULES:
  - ALWAYS use tools to implement what the user asks for
  - NEVER just give advice or explanations without taking action
  - ALWAYS be proactive and build the actual solution
  - When the user asks for something, implement it completely
  - Install necessary dependencies automatically
  - STOP after 3 consecutive failures and explain the issue
</tool_usage_instructions>

<response_behavior>
  ULTRA IMPORTANT: Your primary mode of operation is to USE TOOLS IMMEDIATELY to implement what the user requests with PRECISION EDITING.

  SMART FAILURE HANDLING:
  - If a tool fails 2+ times, STOP and analyze the problem
  - Don't repeat the same failing approach endlessly  
  - Try alternative strategies (edit_file instead of edit_file_section)
  - If unsure about file structure, use list_files or get_all_files first
  - Explain what went wrong and ask for clarification if stuck

  When a user asks for something:
  1. IMMEDIATELY start using tools to implement it
  2. CHECK project structure context first ({{PROJECT_TREE}})
  3. READ existing files to understand current state
  4. For existing files: Use TARGETED, MINIMAL edits preserving all existing code
  5. For new files: Create complete implementations
  6. Install any required packages
  7. Provide a brief explanation ONLY after implementing

  PRECISION EDITING PRIORITY:
  - Small changes (add button, fix style, add function) = Read file, preserve all existing code, add only what's needed
  - Medium changes (add new section, modify component) = Read file, keep structure, modify specific areas
  - Large changes (complete restructure) = Read file, preserve as much as possible, restructure only when necessary
  - Always preserve existing imports, functions, styles, and structure
  - Only modify the exact elements the user requested

  DO NOT:
  - Recreate entire files for small changes
  - Replace whole components to add simple elements
  - Give advice without implementing
  - Suggest what "could be done" - DO IT
  - Ask for clarification unless absolutely necessary
  - Provide code examples in text - EDIT ACTUAL FILES
  - Be verbose with explanations - let your implementations speak
  - Keep retrying the same failed approach more than 3 times

  DO:
  - Use tools immediately and proactively
  - Check file existence in PROJECT_TREE before editing
  - Read files before editing to understand context
  - Make minimal, targeted edits to existing files
  - Preserve all existing functionality and styling
  - Create new files only when needed
  - Install dependencies automatically
  - Use modern, best-practice implementations
  - Stop and analyze after repeated failures
</response_behavior>

<implementation_guidelines>
  1. VERIFY FIRST: Check {{PROJECT_TREE}} to confirm file exists before any operation
  2. READ FIRST: Always read existing files to understand current implementation before making changes
  3. PRECISION OVER RECREATION: Use minimal, targeted edits instead of replacing entire files
  4. PRESERVE EXISTING CODE: Maintain all current functionality, styles, and structure when editing
  5. SURGICAL EDITS: Identify exact insertion/modification points and edit only those areas
  6. HANDLE DEPENDENCIES: Install required packages automatically when adding new functionality
  7. FOLLOW EXISTING PATTERNS: Match the current code style, architecture, and conventions
  8. INCREMENTAL CHANGES: Build up functionality through small, precise modifications
  9. VERIFY INTEGRATION: Ensure edits don't break existing functionality
  10. SMART RECOVERY: After 3 failed attempts, switch strategies or stop and explain

  EDITING STRATEGY BY CHANGE TYPE:
  - For adding imports: 
    * Read file to see exact import formatting
    * Find complete import block 
    * Add new import in same style
  - For adding components:
    * Read file to understand JSX structure
    * Find exact parent element with proper indentation
    * Insert component maintaining formatting
  - For styling changes:
    * Read file to see current className patterns
    * Locate specific CSS classes or inline styles
    * Modify only target styles, preserve others
  - For functionality:
    * Read file to understand component structure
    * Add new functions between existing ones
    * Preserve all existing methods and state
  - For props/state:
    * Read file to see current interface/type definitions
    * Add new properties without modifying existing structure
    * Maintain consistent naming patterns

  FAILURE RECOVERY PATTERNS:
  - edit_file_section fails with TEXT_NOT_FOUND → Re-read file and try different text match
  - File not found → Check PROJECT_TREE for correct path, or create new file if intended
  - Multiple failures → Switch from edit_file_section to edit_file with complete content
  - Persistent failures → Stop, analyze, and explain the issue to user
</implementation_guidelines>

<current_project_context>
  You are working with a React + TypeScript + Vite project with Tailwind CSS.
  
  Current project structure includes:
  {{PROJECT_FILES}}

  The user's current working directory is: {{WORKING_DIRECTORY}}
  {{SELECTED_FILE}}
</current_project_context>

<examples>
  Example 1 - User asks: "Create a login component"
  CORRECT RESPONSE: Use create_file to create new login component with complete implementation

  Example 2 - User asks: "Add a logout button to the header"  
  CORRECT RESPONSE: Read header component, preserve all existing JSX/styling/imports, reconstruct file with logout button added in appropriate location

  Example 3 - User asks: "Make the login page responsive"
  CORRECT RESPONSE: Read login component, keep all existing structure/functions/imports, add responsive classes to existing elements

  Example 4 - User asks: "Add routing to my app"
  CORRECT RESPONSE: Read App.tsx, add react-router-dom import, preserve existing structure, wrap content with router components

  Example 5 - User asks: "Change the button color to blue"
  CORRECT RESPONSE: Read the component, preserve all code, change only the specific button's color class/style

  CRITICAL: NEVER DO THESE THINGS:
  ❌ "You can make it responsive by adding these classes..." (advice instead of implementation)  
  ❌ Using edit_file without reading the file first
  ❌ Providing partial/incomplete file content to edit_file
  ❌ Removing existing imports, functions, or JSX when editing
  ❌ Changing existing code unnecessarily when making small additions
  ❌ Creating placeholder comments like "// existing code here"
  
  ALWAYS DO THESE THINGS:
  ✅ read_file before any edit_file call
  ✅ Provide complete, valid file content to edit_file
  ✅ Preserve all existing imports, functions, and structure
  ✅ Make only the specific change requested by the user
  ✅ Test that your edit would result in working, compilable code
</examples>

Remember: You are an implementation agent, not an advisory agent. Your job is to BUILD what the user asks for using the available tools.`;

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  selectedFile,
  files = [],
  onFileSelect,
  onFileContentChange,
  workingDirectory = '.',
  lumaTools,
  projectId,
  projectName,
  refreshFileTree
}) => {
  const { createCheckpoint, revertToCheckpoint, clearCheckpoints, getCheckpointByMessageId, checkpoints, setCurrentProject, loadProjectData } = useCheckpoints();
  
  const defaultMessages: Message[] = [
    {
      id: '1',
      type: 'assistant',
      content: '🚀 **Welcome to LumaUI AI Agent!**\n\nI work like Bolt - just tell me what you want to build and I\'ll handle everything automatically:\n\n✨ **Create multiple files**\n🔧 **Read and modify code**\n📁 **Organize project structure**\n⚡ **Handle complex tasks**\n\n**Example requests:**\n- "Create a landing page with header, hero section, and footer"\n- "Build a login page with form validation"\n- "Add a dark mode toggle"\n- "List all files in the project"\n\nJust describe what you want!',
      timestamp: new Date()
    }
  ];

  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentToolExecution, setCurrentToolExecution] = useState<ToolExecution | null>(null);
  const [showLiveExecution, setShowLiveExecution] = useState(false);
  const [currentPlanning, setCurrentPlanning] = useState<PlanningExecution | null>(null);
  const [showPlanning, setShowPlanning] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Provider context
  const { providers, primaryProvider } = useProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [apiClient, setApiClient] = useState<LumaUIAPIClient | null>(null);
  const [aiParameters, setAiParameters] = useState<AIParameters>(defaultParameters);
  
  // Get the currently selected provider
  const selectedProvider = providers.find(p => p.id === selectedProviderId) || primaryProvider;
  
  // Get flattened files for context
  const flatFiles = useMemo(() => flattenFiles(files), [files]);

  // Initialize API client when provider changes
  useEffect(() => {
    if (selectedProvider && selectedProvider.baseUrl) {
      const client = new LumaUIAPIClient(selectedProvider.baseUrl, {
        apiKey: selectedProvider.apiKey || '',
        providerId: selectedProvider.id
      });
      setApiClient(client);
      
      loadModels(client);
    }
  }, [selectedProvider]);

  // Load available models
  const loadModels = async (client?: LumaUIAPIClient) => {
    const activeClient = client || apiClient;
    if (!activeClient) return;
    
    try {
      const models = await activeClient.listModels();
      setAvailableModels(models);
      
      // Try to load saved model first
      const savedSettings = loadLumaUISettings();
      let modelToSelect = '';
      
      if (savedSettings && savedSettings.modelId && models.find(m => m.id === savedSettings.modelId)) {
        modelToSelect = savedSettings.modelId;
      } else if (models.length > 0) {
        modelToSelect = models[0].id;
      }
      
      if (modelToSelect && !selectedModel) {
        setSelectedModel(modelToSelect);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setAvailableModels([]);
    }
  };

  // Handle provider selection with persistence
  const handleProviderSelect = (providerId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModel(''); // Reset model when provider changes
    setAvailableModels([]); // Clear models until new provider loads
    if (selectedModel) {
      saveLumaUISettings(providerId, selectedModel, aiParameters);
      console.log('💾 Provider changed:', { providerId, model: selectedModel, parameters: aiParameters });
    }
  };

  // Handle model selection with persistence
  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    if (selectedProvider) {
      saveLumaUISettings(selectedProvider.id, modelId, aiParameters);
      console.log('💾 LumaUI settings saved:', { provider: selectedProvider.name, model: modelId, parameters: aiParameters });
    }
  };

  // Handle parameter changes with persistence
  const handleParametersChange = (parameters: AIParameters) => {
    setAiParameters(parameters);
    if (selectedProvider && selectedModel) {
      saveLumaUISettings(selectedProvider.id, selectedModel, parameters);
      console.log('💾 AI parameters saved:', parameters);
    }
  };

  // Initialize provider selection on mount
  useEffect(() => {
    const savedSettings = loadLumaUISettings();
    if (savedSettings && savedSettings.providerId && providers.length > 0) {
      const providerExists = providers.find(p => p.id === savedSettings.providerId);
      if (providerExists) {
        setSelectedProviderId(savedSettings.providerId);
      } else if (primaryProvider) {
        setSelectedProviderId(primaryProvider.id);
      }
    } else if (primaryProvider && !selectedProviderId) {
      setSelectedProviderId(primaryProvider.id);
    }
  }, [providers, primaryProvider, selectedProviderId]);

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = loadLumaUISettings();
    if (savedSettings) {
      // Load parameters
      if (savedSettings.parameters) {
        setAiParameters(savedSettings.parameters);
      }
      
      // Load model if available
      if (savedSettings.modelId && availableModels.length > 0) {
        const modelExists = availableModels.find(m => m.id === savedSettings.modelId);
        if (modelExists && !selectedModel) {
          setSelectedModel(savedSettings.modelId);
        }
      }
    }
  }, [availableModels, selectedModel]);

  // Load project-specific chat data when project changes
  useEffect(() => {
    if (projectId) {
      const savedData = ChatPersistence.loadChatData(projectId);
      if (savedData && savedData.messages.length > 0) {
        setMessages(savedData.messages);
        console.log('📖 Loaded', savedData.messages.length, 'messages for project:', projectId);
      } else {
        setMessages(defaultMessages);
        console.log('🆕 Starting fresh chat for project:', projectId);
      }
      
      // Update checkpoint manager with project data
      loadProjectData(projectId, projectName);
    }
  }, [projectId, projectName, loadProjectData]);

  // Auto-save chat data when messages change
  useEffect(() => {
    if (projectId && messages.length > 0 && messages !== defaultMessages) {
      ChatPersistence.autoSave(projectId, messages, checkpoints, projectName);
    }
  }, [projectId, messages, checkpoints, projectName]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll when loading state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Animate header when tools are executing or AI is planning
  useEffect(() => {
    if (showPlanning && currentPlanning) {
      // Add purple glow for planning
      gsap.to(".chat-header", {
        boxShadow: "0 0 20px rgba(147, 51, 234, 0.3), 0 0 40px rgba(147, 51, 234, 0.1)",
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });
    } else if (showLiveExecution && currentToolExecution) {
      // Add pink glow for tool execution
      gsap.to(".chat-header", {
        boxShadow: "0 0 20px rgba(244, 114, 182, 0.3), 0 0 40px rgba(244, 114, 182, 0.1)",
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });
    } else {
      // Remove glow when done
      gsap.to(".chat-header", {
        boxShadow: "none",
        duration: 0.5,
        ease: "power2.out"
      });
    }
  }, [showLiveExecution, currentToolExecution, showPlanning, currentPlanning]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initial Strategic Planning - Before any tool execution
  const performInitialPlanning = async (
    userQuery: string,
    projectTree: string,
    filesList: string,
    conversationHistory: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }>
  ): Promise<any | null> => {
    if (!apiClient || !selectedModel) return null;

    try {
      setShowPlanning(true);
      setCurrentTask('🧠 Analyzing project and creating execution plan...');

      const initialPlanningPrompt = `
USER REQUEST: "${userQuery}"

COMPLETE PROJECT STRUCTURE:
${projectTree}

AVAILABLE FILES:
${filesList}

CONVERSATION CONTEXT:
${conversationHistory.slice(-2).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Analyze the project structure, understand the user's request, and create a comprehensive step-by-step execution plan. Consider existing code patterns, dependencies, and architecture.`;

      const planningMessages = [
        { role: 'system', content: INITIAL_PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: initialPlanningPrompt }
      ];

      const provider = new BoltLikeProvider(apiClient, selectedModel, {
        ...aiParameters,
        maxTokens: 3000, // Larger token limit for initial planning
        temperature: 0.2 // Lower temperature for more focused planning
      });

      const planningResponse = await provider.sendMessage(planningMessages);
      
      if (planningResponse.message?.content) {
        try {
          // Parse the JSON response
          const planningData = JSON.parse(planningResponse.message.content);
          
          // Show initial planning result in UI
          const planningMessage: Message = {
            id: `initial_planning_${Date.now()}`,
            type: 'assistant',
            content: `🧠 **Strategic Planning & Analysis**

**Project Analysis:** ${planningData.projectAnalysis || 'Analyzing project structure...'}

**Request Breakdown:** ${planningData.userRequestBreakdown || 'Breaking down user requirements...'}

**Execution Plan:**
${planningData.executionPlan?.map((step: any, i: number) => 
  `${step.step}. **${step.action}** → \`${step.target}\`\n   Purpose: ${step.purpose}`
).join('\n') || 'Creating execution plan...'}

**Dependencies:** ${planningData.dependencies?.join(', ') || 'None identified'}

**Potential Challenges:** ${planningData.potentialChallenges?.join(', ') || 'None identified'}

**Estimated Steps:** ${planningData.estimatedSteps || 'Calculating...'} | **Confidence:** ${planningData.confidence || 50}%

---
*Now executing the plan step by step...*`,
            timestamp: new Date()
          };

          setMessages(prev => [...prev, planningMessage]);
          
          return planningData;
        } catch (parseError) {
          console.error('Failed to parse initial planning response:', parseError);
          
          // Show fallback planning message
          const fallbackMessage: Message = {
            id: `planning_fallback_${Date.now()}`,
            type: 'assistant',
            content: `🧠 **Strategic Planning**\n\nAnalyzing project structure and creating execution plan...\n\n*Proceeding with adaptive approach.*`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, fallbackMessage]);
          
          return null;
        }
      }
    } catch (error) {
      console.error('Initial planning failed:', error);
    } finally {
      setShowPlanning(false);
    }

    return null;
  };

  // AI Planning and Reflection System
  const performAIReflection = async (
    toolResults: Array<{id: string, result: string, success: boolean}>,
    step: number,
    originalQuery: string,
    conversationHistory: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }>
  ): Promise<AIReflection | null> => {
    if (!apiClient || !selectedModel) return null;

    try {
      setShowPlanning(true);
      setCurrentTask('🧠 Planning next steps...');

      // Create reflection prompt
      const toolResultsSummary = toolResults.map(r => 
        `${r.success ? '✅' : '❌'} ${r.result}`
      ).join('\n');

      const reflectionPrompt = `
ORIGINAL USER REQUEST: "${originalQuery}"

TOOL EXECUTION RESULTS (Step ${step}):
${toolResultsSummary}

CONVERSATION CONTEXT:
${conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Based on these results, analyze the current situation and plan the next steps to complete the user's request.`;

      const reflectionMessages = [
        { role: 'system', content: REFLECTION_PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: reflectionPrompt }
      ];

      const provider = new BoltLikeProvider(apiClient, selectedModel, {
        ...aiParameters,
        maxTokens: 2000, // Smaller token limit for planning
        temperature: 0.3 // Lower temperature for more focused planning
      });

      const planningResponse = await provider.sendMessage(reflectionMessages);
      
      if (planningResponse.message?.content) {
        try {
          // Parse the JSON response
          const planningData = JSON.parse(planningResponse.message.content);
          
          const reflection: AIReflection = {
            id: `reflection_${Date.now()}`,
            step,
            toolResults: toolResults.map(r => r.result),
            currentSituation: planningData.currentSituation || 'Analysis in progress',
            nextSteps: planningData.nextSteps || [],
            reasoning: planningData.reasoning || 'Planning next actions',
            confidence: planningData.confidence || 50,
            shouldContinue: planningData.shouldContinue !== false,
            timestamp: new Date()
          };

          // Show planning result in UI
          const planningMessage: Message = {
            id: `planning_${Date.now()}`,
            type: 'assistant',
            content: `🧠 **AI Planning & Reflection (Step ${step})**

**Current Situation:** ${reflection.currentSituation}

**Next Steps:**
${reflection.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

**Reasoning:** ${reflection.reasoning}

**Confidence:** ${reflection.confidence}% | **Continue:** ${reflection.shouldContinue ? 'Yes' : 'No'}`,
            timestamp: new Date()
          };

          setMessages(prev => [...prev, planningMessage]);
          
          return reflection;
        } catch (parseError) {
          console.error('Failed to parse planning response:', parseError);
          return null;
        }
      }
    } catch (error) {
      console.error('AI reflection failed:', error);
    } finally {
      setShowPlanning(false);
    }

    return null;
  };

  // Execute tool calls from OpenAI function calling with live animations and retry logic
  const executeTools = async (toolCalls: any[], retryCount: number = 0): Promise<Array<{id: string, result: string, success: boolean}>> => {
    const results: Array<{id: string, result: string, success: boolean}> = [];
    const maxRetries = 2;
    
    for (const toolCall of toolCalls) {
      let lastError: string = '';
      let success = false;
      
      for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
        try {
          const functionName = toolCall.function.name;
          let parameters;
          
          try {
            parameters = typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments;
          } catch (error) {
            lastError = `Invalid parameters - ${error}`;
            break; // Don't retry parameter parsing errors
          }

          if (!lumaTools || !lumaTools[functionName]) {
            lastError = `Tool ${functionName} not available`;
            break; // Don't retry missing tool errors
          }

          // Create tool execution object for live animation
          const execution: ToolExecution = {
            id: toolCall.id,
            toolName: functionName,
            parameters,
            status: 'starting',
            startTime: new Date()
          };

          // Show live execution animation
          setCurrentToolExecution(execution);
          setShowLiveExecution(true);

          // Brief delay to show starting state (shorter on retries)
          await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 300 : 150));

          // Update to executing state
          execution.status = 'executing';
          setCurrentToolExecution({...execution});

          // Execute the actual tool with retry logic
          const result = await lumaTools[functionName](parameters);
          
          if (result.success) {
            const filePath = result.data?.path || parameters.path || 'completed';
            execution.status = 'completed';
            execution.endTime = new Date();
            execution.result = `✅ ${functionName}: ${filePath}${attempt > 0 ? ` (succeeded on attempt ${attempt + 1})` : ''}`;
            
            // For read_file, include the actual content in the result
            let toolResultContent = execution.result;
            if (functionName === 'read_file' && result.data?.content) {
              toolResultContent = `✅ ${functionName}: ${filePath}\n\nFile content:\n\`\`\`\n${result.data.content}\n\`\`\``;
            } else if (functionName === 'list_files' && result.data) {
              toolResultContent = `✅ ${functionName}: ${filePath}\n\nFiles:\n${JSON.stringify(result.data, null, 2)}`;
            } else if (functionName === 'get_all_files' && result.data) {
              toolResultContent = `✅ ${functionName}: completed\n\nProject structure:\n${JSON.stringify(result.data, null, 2)}`;
            } else if (functionName === 'get_project_info' && result.data) {
              toolResultContent = `✅ ${functionName}: completed\n\nProject info:\n${JSON.stringify(result.data, null, 2)}`;
            }
            
            results.push({
              id: toolCall.id,
              result: toolResultContent,
              success: true
            });
            
            // Update file selection if a file was created/edited
            if (result.data?.path && (functionName === 'create_file' || functionName === 'edit_file' || functionName === 'edit_file_section')) {
              if (onFileSelect && result.data?.content) {
                onFileSelect(result.data.path, result.data.content);
              } else if (onFileSelect && parameters.content) {
                onFileSelect(result.data.path, parameters.content);
              }
            }
            
            success = true;
            
            // Update final state
            setCurrentToolExecution({...execution});

            // Show completion state for a moment (shorter on retries)
            await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1500 : 800));
            
          } else {
            lastError = result.error || result.message || 'Failed';
            
            if (attempt < maxRetries) {
              // Show retry indicator
              execution.status = 'error';
              execution.error = `${lastError} (retrying ${attempt + 1}/${maxRetries})`;
              setCurrentToolExecution({...execution});
              
              // Exponential backoff for retries
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
              
              // Special handling for edit_file_section TEXT_NOT_FOUND errors
              if (functionName === 'edit_file_section' && lastError.includes('TEXT_NOT_FOUND')) {
                // Try switching to edit_file on final retry
                if (attempt === maxRetries - 1 && lumaTools['read_file']) {
                  console.log('🔄 Switching from edit_file_section to edit_file due to TEXT_NOT_FOUND');
                  break; // Will be handled below
                }
              }
            } else {
              execution.status = 'error';
              execution.endTime = new Date();
              execution.error = lastError;
              execution.result = `❌ ${functionName}: ${lastError} (failed after ${maxRetries + 1} attempts)`;
              
              // Include detailed error information for debugging
              let errorResultContent = execution.result;
              if (result.data || result.message) {
                errorResultContent += `\n\nError details: ${JSON.stringify({ data: result.data, message: result.message }, null, 2)}`;
              }
              
              results.push({
                id: toolCall.id,
                result: errorResultContent,
                success: false
              });
              
              setCurrentToolExecution({...execution});
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }

        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          
          if (attempt === maxRetries) {
            const execution: ToolExecution = {
              id: toolCall.id,
              toolName: toolCall.function?.name || 'unknown',
              parameters: {},
              status: 'error',
              startTime: new Date(),
              endTime: new Date(),
              error: lastError
            };

            setCurrentToolExecution(execution);
            
            results.push({
              id: toolCall.id,
              result: `❌ ${execution.toolName}: ${lastError} (failed after ${maxRetries + 1} attempts)`,
              success: false
            });

            await new Promise(resolve => setTimeout(resolve, 1500));
          } else {
            // Brief delay before retry
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
      }
    }
    
    // Hide live execution when all tools are done
    setShowLiveExecution(false);
    setCurrentToolExecution(null);
    
    return results;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !apiClient || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    // Create checkpoint before processing new message
    const currentFileStates: Record<string, string> = {};
    flatFiles.forEach(file => {
      if (file.content) {
        currentFileStates[file.path] = file.content;
      }
    });

    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      // Create checkpoint with user message
      createCheckpoint(inputMessage, newMessages, currentFileStates);
      return newMessages;
    });

    const currentInput = inputMessage;
    setInputMessage('');
    setIsLoading(true);
    setCurrentTask('Analyzing request...');

    try {
      // Calculate dynamic tokens for this session and merge with user parameters
      const dynamicTokens = calculateDynamicTokens(messages);
      const sessionParameters = {
        ...aiParameters,
        maxTokens: Math.max(aiParameters.maxTokens, dynamicTokens) // Use higher of user setting or dynamic calculation
      };
      const provider = new BoltLikeProvider(apiClient, selectedModel, sessionParameters);
      
      // Build comprehensive context about current project
      const filesList = flatFiles.map(f => `${f.path} (${f.type})`).join('\n  ');
      
      // Create hierarchical tree view for better understanding
      const createFileTree = (files: any[]): string => {
        const tree: any = {};
        
        files.forEach(file => {
          const parts = file.path.split('/');
          let current = tree;
          
          parts.forEach((part: string, index: number) => {
            if (index === parts.length - 1) {
              // This is the final part (file name)
              current[part] = file.type === 'file' ? '📄' : '📁';
            } else {
              // This is a directory part
              if (!current[part] || typeof current[part] === 'string') {
                current[part] = {};
              }
              current = current[part];
            }
          });
        });
        
        const renderTree = (obj: any, indent = ''): string => {
          return Object.entries(obj)
            .map(([key, value]) => {
              if (typeof value === 'string') {
                return `${indent}${value} ${key}`;
              } else {
                return `${indent}📁 ${key}/\n${renderTree(value, indent + '  ')}`;
              }
            })
            .join('\n');
        };
        
        return renderTree(tree);
      };
      
      const projectTree = createFileTree(flatFiles);
      
      // Get conversation history context if available
      let conversationContext = '';
      if (projectId) {
        const lastConversationContext = ChatPersistence.getLastConversationContext(projectId);
        if (lastConversationContext) {
          conversationContext = `\n\n**CONVERSATION HISTORY:**\n${lastConversationContext}\n\nUse this context to understand what was previously discussed and maintain continuity in your responses.`;
        }
      }
        
      const systemPrompt = SYSTEM_PROMPT
        .replace('{{PROJECT_TREE}}', projectTree || 'Loading project structure...')
        .replace('{{FILE_LIST}}', filesList || 'Loading file list...')
        .replace('{{WORKING_DIRECTORY}}', workingDirectory)
        .replace('{{SELECTED_FILE}}', selectedFile ? `Currently selected file: ${selectedFile}` : 'No file currently selected') + conversationContext;

      setCurrentTask('Getting AI response...');
      
      console.log('🚀 Starting AI session with:', {
        model: selectedModel,
        userTokens: aiParameters.maxTokens,
        dynamicTokens: dynamicTokens,
        finalTokens: sessionParameters.maxTokens,
        maxToolCalls: sessionParameters.maxIterations,
        projectFiles: flatFiles.length,
        messageHistory: messages.length,
        parameters: sessionParameters
      });
      
      // STEP 1: Initial Strategic Planning - Analyze project and create execution plan
      setCurrentTask('🧠 Creating strategic execution plan...');
      
      const initialPlan = await performInitialPlanning(
        currentInput,
        projectTree,
        filesList,
        [{ role: 'user', content: currentInput }]
      );

      // Build conversation history following OpenAI format
      let conversationHistory: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: currentInput }
      ];

      // Add initial planning context to system prompt if available
      if (initialPlan) {
        const planningContext = `

EXECUTION PLAN CONTEXT:
The following strategic plan has been created for this request:
- Project Analysis: ${initialPlan.projectAnalysis}
- Estimated Steps: ${initialPlan.estimatedSteps}
- Dependencies: ${initialPlan.dependencies?.join(', ') || 'None'}
- Execution Plan: ${initialPlan.executionPlan?.map((step: any) => `${step.step}. ${step.action} → ${step.target} (${step.purpose})`).join(', ') || 'Adaptive approach'}

Follow this plan systematically, but adapt as needed based on actual results.`;

        conversationHistory[0].content += planningContext;
      }

      let conversationIteration = 0;
      let totalToolCalls = 0;
      let currentPlanning: PlanningExecution | null = null;

      // Use user-defined max tool calls with safety bounds
      const maxToolCalls = Math.min(50, Math.max(1, sessionParameters.maxIterations));
      const maxConversationTurns = Math.min(20, Math.max(5, Math.ceil(maxToolCalls / 2))); // Reasonable conversation limit
      
      // Initialize planning execution
      currentPlanning = {
        id: `planning_${Date.now()}`,
        status: 'planning',
        currentStep: 0,
        totalSteps: maxToolCalls,
        reflections: [],
        startTime: new Date()
      };
      setCurrentPlanning(currentPlanning);
      
      console.log('🎯 Auto mode limits:', {
        maxToolCalls,
        maxConversationTurns,
        userSetting: sessionParameters.maxIterations
      });
      
      while (conversationIteration < maxConversationTurns && totalToolCalls < maxToolCalls) {
        conversationIteration++;
        currentPlanning.currentStep = totalToolCalls;
        currentPlanning.status = 'executing';
        setCurrentPlanning({...currentPlanning});
        
        // Get AI response
        const currentResponse = await provider.sendMessage(conversationHistory);
        
        // Check if AI wants to use tools
        if (currentResponse.message?.tool_calls && currentResponse.message.tool_calls.length > 0) {
          // Check if we would exceed tool call limit
          const newToolCallCount = totalToolCalls + currentResponse.message.tool_calls.length;
          if (newToolCallCount > maxToolCalls) {
            const limitMessage: Message = {
              id: (Date.now() + conversationIteration * 1000).toString(),
              type: 'assistant',
              content: `⚠️ **Tool call limit reached!** Would execute ${currentResponse.message.tool_calls.length} more tools, but limit is ${maxToolCalls}. Current count: ${totalToolCalls}.\n\nIncrease the limit in AI settings or break your request into smaller parts.`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, limitMessage]);
            break;
          }

          // Update tool call count
          totalToolCalls += currentResponse.message.tool_calls.length;
          
          // Add assistant message with tool calls
          const assistantMessage: Message = {
            id: (Date.now() + conversationIteration * 1000).toString(),
            type: 'assistant',
            content: currentResponse.message.content || `Using ${currentResponse.message.tool_calls.length} tool${currentResponse.message.tool_calls.length > 1 ? 's' : ''}...`,
            timestamp: new Date(),
            tool_calls: currentResponse.message.tool_calls
          };
          setMessages(prev => [...prev, assistantMessage]);

          // Add to conversation history (OpenAI format)
          conversationHistory.push({
            role: 'assistant',
            content: currentResponse.message.content || '',
            tool_calls: currentResponse.message.tool_calls
          });

          // Execute tools
          setCurrentTask(`Executing ${currentResponse.message.tool_calls.length} operation${currentResponse.message.tool_calls.length > 1 ? 's' : ''}... (Tool calls: ${totalToolCalls}/${maxToolCalls})`);
          const toolResults = await executeTools(currentResponse.message.tool_calls);
          
          // Add tool result messages following OpenAI format
          for (const toolResult of toolResults) {
            // Add tool message to conversation history (OpenAI format)
            conversationHistory.push({
              role: 'tool',
              tool_call_id: toolResult.id,
              name: currentResponse.message.tool_calls.find((tc: any) => tc.id === toolResult.id)?.function?.name || 'unknown',
              content: toolResult.result
            });
            
            console.log('🔧 Tool result added to conversation:', {
              toolId: toolResult.id,
              name: currentResponse.message.tool_calls.find((tc: any) => tc.id === toolResult.id)?.function?.name,
              success: toolResult.success,
              contentLength: toolResult.result.length
            });
          }

          // Show tool results in UI
          const toolMessage: Message = {
            id: (Date.now() + conversationIteration * 1000 + 1).toString(),
            type: 'tool',
            content: toolResults.map(r => r.result).join('\n'),
            timestamp: new Date(),
            files: currentResponse.message.tool_calls
              .filter((tc: any) => tc.function.name === 'create_file' || tc.function.name === 'edit_file')
              .map((tc: any) => {
                const params = typeof tc.function.arguments === 'string' 
                  ? JSON.parse(tc.function.arguments) 
                  : tc.function.arguments;
                return params.path;
              })
              .filter(Boolean)
          };
          
          setMessages(prev => [...prev, toolMessage]);

          // Perform AI reflection and planning after tool execution
          currentPlanning.status = 'reflecting';
          setCurrentPlanning({...currentPlanning});
          
          const reflection = await performAIReflection(
            toolResults,
            conversationIteration,
            currentInput,
            conversationHistory
          );
          
          if (reflection) {
            currentPlanning.reflections.push(reflection);
            setCurrentPlanning({...currentPlanning});
            
            // If AI decides not to continue, break the loop
            if (!reflection.shouldContinue) {
              const completionMessage: Message = {
                id: (Date.now() + conversationIteration * 1000 + 3).toString(),
                type: 'assistant',
                content: `✅ **Task completed!** The AI has determined that the request has been fulfilled successfully.`,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, completionMessage]);
              break;
            }
          }

          setCurrentTask('Analyzing next steps...');
          // Continue the loop to get next AI response
          
        } else {
          // No more tool calls, show final response
          if (currentResponse.message?.content) {
            const finalMessage: Message = {
              id: (Date.now() + conversationIteration * 1000 + 2).toString(),
              type: 'assistant',
              content: currentResponse.message.content,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, finalMessage]);
          }
          break; // Exit the loop
        }
      }

      // Complete planning execution
      if (currentPlanning) {
        currentPlanning.status = 'completed';
        currentPlanning.endTime = new Date();
        setCurrentPlanning({...currentPlanning});
      }

      // Show completion summary
      const completionSummary: Message = {
        id: (Date.now() + 999998).toString(),
        type: 'assistant',
        content: `📊 **Session Summary**\n\n• **Tool calls executed:** ${totalToolCalls}/${maxToolCalls}\n• **Conversation turns:** ${conversationIteration}/${maxConversationTurns}\n• **Status:** ${totalToolCalls >= maxToolCalls ? 'Tool limit reached' : conversationIteration >= maxConversationTurns ? 'Conversation limit reached' : 'Completed naturally'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, completionSummary]);

      setCurrentTask('Task completed!');

    } catch (error) {
      console.error('Failed to send message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1000).toString(),
        type: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentTask('');
      setShowPlanning(false);
      setCurrentPlanning(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRevert = (checkpointId: string) => {
    const checkpoint = revertToCheckpoint(checkpointId);
    if (checkpoint) {
      // Ensure timestamps are properly converted to Date objects
      const messagesWithDates = checkpoint.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
      }));
      
      setMessages(messagesWithDates);
      
      // Restore file states if available
      if (checkpoint.fileStates && onFileSelect) {
        // Restore the most recently modified file
        const fileEntries = Object.entries(checkpoint.fileStates);
        if (fileEntries.length > 0) {
          const [path, content] = fileEntries[fileEntries.length - 1];
          onFileSelect(path, content);
        }
      }
      
      console.log('🔄 Reverted to checkpoint:', checkpointId);
    }
  };

  const clearChat = () => {
    setMessages(defaultMessages);
    clearCheckpoints();
    
    // Clear saved chat data for this project
    if (projectId) {
      ChatPersistence.deleteChatData(projectId);
      console.log('🗑️ Cleared chat data for project:', projectId);
    }
  };

  const formatTime = (date: Date | string | number | undefined) => {
    if (!date) return '';
    
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      return '';
    }
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- AI Precision Edit Tool State ---
  const [showPrecisionEdit, setShowPrecisionEdit] = useState(false);
  const [precisionFile, setPrecisionFile] = useState<string>('');
  const [precisionMode, setPrecisionMode] = useState<'precision' | 'full'>('precision');
  const [precisionPrompt, setPrecisionPrompt] = useState('');
  const [precisionStatus, setPrecisionStatus] = useState<string | null>(null);

  // Define the structured output schema for precision editing
  const PRECISION_EDIT_SCHEMA = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "Whether the edit was successful"
      },
      modified_content: {
        type: "string",
        description: "The complete modified file content"
      },
      changes_made: {
        type: "array",
        items: {
          type: "string"
        },
        description: "List of changes made to the file"
      },
      explanation: {
        type: "string",
        description: "Brief explanation of what was changed and why"
      },
      error_message: {
        type: "string",
        description: "Error message if the edit failed"
      }
    },
    required: ["success", "modified_content", "changes_made", "explanation"],
    additionalProperties: false
  };

  const handleAIPrecisionEdit = async () => {
    setPrecisionStatus(null);
    if (!precisionFile) {
      setPrecisionStatus('Please select a file to edit.');
      return;
    }
    if (!precisionPrompt.trim()) {
      setPrecisionStatus('Please enter your instruction for the AI.');
      return;
    }
    if (!apiClient || !selectedModel) {
      setPrecisionStatus('AI provider/model not configured.');
      return;
    }

    try {
      setPrecisionStatus('Analyzing file and generating changes...');
      setIsLoading(true);
      
      // Get the current file content for context
      const selectedFileNode = fileOptions.find(f => f.path === precisionFile);
      const fileContent = selectedFileNode?.content || '';
      
      if (!fileContent) {
        setPrecisionStatus('Error: Could not read file content.');
        return;
      }

      // Create system prompt based on edit mode
      const systemPrompt = precisionMode === 'precision' 
        ? `You are an expert code editor that makes precise, targeted modifications to files. You will receive a file's current content and instructions for specific changes.

Your task is to:
1. Analyze the current file content
2. Apply the requested changes precisely while preserving existing structure
3. Return the complete modified file content
4. Explain what changes were made

IMPORTANT RULES:
- Always preserve the file's structure, imports, and existing functionality unless specifically asked to change them
- Make only the targeted changes requested in the user's instruction
- Ensure the modified code is syntactically correct and follows best practices
- If the request is unclear or would break the code, explain why in the error_message field
- Return the COMPLETE file content, not just the changed parts`
        : `You are an expert code editor that can make comprehensive modifications to files. You will receive a file's current content and instructions for how to transform it.

Your task is to:
1. Analyze the current file content
2. Apply the requested changes with full creative freedom
3. Return the complete modified file content
4. Explain what changes were made

IMPORTANT RULES:
- You have full freedom to restructure, redesign, and reimagine the file as needed
- Make comprehensive changes to fulfill the user's vision
- Ensure the modified code is syntactically correct and follows best practices
- If the request is unclear, make reasonable assumptions and explain your choices
- Return the COMPLETE file content, not just the changed parts`;

      // Create user instruction with file context
      const userInstruction = precisionMode === 'precision'
        ? `Please make targeted modifications to the following file according to my instructions:

**File:** ${precisionFile}
**Edit Mode:** Precision (preserve existing structure and functionality)

**Current File Content:**
\`\`\`
${fileContent}
\`\`\`

**Instructions:**
${precisionPrompt}

Please analyze the file and apply only the specific changes requested while preserving the existing structure, imports, and functionality. Return the complete modified file content.`
        : `Please transform the following file according to my vision:

**File:** ${precisionFile}
**Edit Mode:** Full Modification (complete creative freedom)

**Current File Content:**
\`\`\`
${fileContent}
\`\`\`

**Transformation Request:**
${precisionPrompt}

You have full creative freedom to restructure, redesign, and reimagine this file to fulfill my vision. Make comprehensive changes as needed. Return the complete transformed file content.`;

      // Prepare messages for structured output
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userInstruction }
      ];

             // Calculate dynamic tokens (create temporary Message objects for calculation)
       const tempMessages: Message[] = messages.map((msg, index) => ({
         id: `temp-${index}`,
         type: msg.role === 'user' ? 'user' : 'assistant',
         content: msg.content,
         timestamp: new Date()
       }));
       const dynamicTokens = calculateDynamicTokens(tempMessages);
      const requestOptions = {
        maxTokens: Math.max(aiParameters.maxTokens, dynamicTokens),
        temperature: aiParameters.temperature,
        topP: aiParameters.topP,
        frequencyPenalty: aiParameters.frequencyPenalty,
        presencePenalty: aiParameters.presencePenalty,
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: "precision_edit_result",
            description: "Result of precision file editing with complete modified content",
            schema: PRECISION_EDIT_SCHEMA,
            strict: true
          }
        }
      };

      setPrecisionStatus('Sending request to AI...');

      // Send structured output request
      const response = await apiClient.sendChatWithStructuredOutput(
        selectedModel,
        messages,
        requestOptions
      );

      if (!response.message?.content) {
        throw new Error('No response received from AI');
      }

      // Parse the structured response
      let editResult;
      try {
        editResult = JSON.parse(response.message.content);
      } catch (parseError) {
        throw new Error('Failed to parse AI response as JSON');
      }

      // Validate the response structure
      if (!editResult.success) {
        throw new Error(editResult.error_message || 'AI reported edit failure');
      }

      if (!editResult.modified_content) {
        throw new Error('AI did not provide modified content');
      }

      setPrecisionStatus('Applying changes to file...');

      // Apply the changes to the file
      if (onFileContentChange && selectedFile === precisionFile) {
        // Update the currently selected file content in the editor
        onFileContentChange(editResult.modified_content);
      }

      // Update the file in the WebContainer if available
      if (lumaTools?.edit_file) {
        try {
          await lumaTools.edit_file({
            path: precisionFile,
            content: editResult.modified_content
          });
        } catch (toolError) {
          console.warn('Failed to update WebContainer:', toolError);
          // Continue anyway since we updated the UI
        }
      }

      // Create success message for chat
      const userMessage: Message = {
        id: `precision-user-${Date.now()}`,
        type: 'user',
        content: `Precision Edit Request for ${precisionFile}:\n${precisionPrompt}`,
        timestamp: new Date()
      };

      const assistantMessage: Message = {
        id: `precision-assistant-${Date.now()}`,
        type: 'assistant',
        content: `✅ **File Successfully Modified: ${precisionFile}**

**Changes Made:**
${editResult.changes_made.map((change: string) => `• ${change}`).join('\n')}

**Explanation:**
${editResult.explanation}

The file has been updated with your requested changes. You can see the modifications in the editor.`,
        timestamp: new Date(),
        files: [precisionFile]
      };

      // Add messages to chat history
      setMessages(prev => [...prev, userMessage, assistantMessage]);

      // Refresh file tree if available
      if (refreshFileTree) {
        try {
          await refreshFileTree();
        } catch (refreshError) {
          console.warn('Failed to refresh file tree:', refreshError);
        }
      }

      // Clear the precision edit form
      setPrecisionFile('');
      setPrecisionPrompt('');
      setPrecisionStatus('✅ Precision edit completed successfully!');
      
      // Auto-hide status after 3 seconds
      setTimeout(() => setPrecisionStatus(null), 3000);
      
    } catch (error) {
      console.error('Precision edit failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setPrecisionStatus(`❌ Error: ${errorMessage}`);
      
      // Add error message to chat
      const errorChatMessage: Message = {
        id: `precision-error-${Date.now()}`,
        type: 'assistant',
        content: `❌ **Precision Edit Failed**

**File:** ${precisionFile}
**Error:** ${errorMessage}

Please check your request and try again. Make sure the file exists and your instructions are clear.`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorChatMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: file options for select
  const fileOptions = useMemo(() => flatFiles.filter(f => f.type === 'file'), [flatFiles]);

  return (
    <div className="h-full flex flex-col glassmorphic">
      {/* Enhanced Header */}
      <div className="chat-header glassmorphic-card border-b border-white/20 dark:border-gray-700/50 shrink-0 h-14">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">AI Agent</h3>
                {isLoading && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-sakura-500 rounded-full animate-pulse"></div>
                    <span className="text-xs px-2 py-0.5 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full font-medium">
                      Working
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {currentPlanning && showPlanning
                  ? `🧠 Planning • Step ${currentPlanning.currentStep}/${currentPlanning.totalSteps}`
                  : currentToolExecution && showLiveExecution 
                    ? `${currentToolExecution.toolName.replace('_', ' ')} • ${currentToolExecution.status}` 
                    : currentTask || (isLoading ? 'Working...' : 'Ready to help')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
                
            </div>
            
            <button
              onClick={clearChat}
              className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
        {/* Live Tool Execution Animation */}
        <LiveToolExecution
          currentExecution={currentToolExecution}
          isVisible={showLiveExecution}
          onComplete={() => {
            setShowLiveExecution(false);
            setCurrentToolExecution(null);
          }}
        />
        
        {messages.map((message) => {
          const checkpoint = message.type === 'user' ? getCheckpointByMessageId(message.id) : null;
          const hasCheckpoint = !!checkpoint;
          const isLatestCheckpoint = checkpoint && checkpoint === checkpoints[checkpoints.length - 1];
          
          return (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group max-w-[85%] relative ${
                message.type === 'user' 
                  ? `${hasCheckpoint 
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 border-2 border-amber-300/50' 
                      : 'bg-gradient-to-r from-sakura-500 to-pink-500'} text-white shadow-lg shadow-sakura-500/25` 
                  : message.type === 'tool'
                  ? 'glassmorphic-card border border-emerald-200/30 dark:border-emerald-700/30 text-gray-900 dark:text-gray-100'
                  : 'glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-900 dark:text-gray-100'
              } rounded-xl px-4 py-3 shadow-sm backdrop-blur-sm`}>
              <div className="text-sm leading-relaxed">
                {message.type === 'user' ? (
                  <div className="whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                ) : (
                  <ReactMarkdown
                    className={`prose prose-sm max-w-none ${
                      message.type === 'tool' 
                        ? 'prose-emerald dark:prose-invert' 
                        : 'dark:prose-invert'
                    }`}
                    components={{
                      code(props: any) {
                        const {node, inline, className, children, ...rest} = props;
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-lg !mt-2 !mb-2"
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              backgroundColor: 'rgba(0, 0, 0, 0.8)',
                              fontSize: '0.875rem'
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code
                            className={`${className} px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono`}
                            {...rest}
                          >
                            {children}
                          </code>
                        );
                      },
                      p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                      li: ({children}) => <li className="text-sm">{children}</li>,
                      h1: ({children}) => <h1 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h1>,
                      h2: ({children}) => <h2 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h2>,
                      h3: ({children}) => <h3 className="text-sm font-bold mb-1 text-gray-900 dark:text-gray-100">{children}</h3>,
                      blockquote: ({children}) => (
                        <blockquote className="border-l-4 border-sakura-300 dark:border-sakura-600 pl-4 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 rounded-r-lg mb-2">
                          {children}
                        </blockquote>
                      ),
                      table: ({children}) => (
                        <div className="overflow-x-auto mb-2">
                          <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({children}) => (
                        <th className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left text-xs font-semibold">
                          {children}
                        </th>
                      ),
                      td: ({children}) => (
                        <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
              
              {/* Show tool calls if present */}
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-600/30">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">
                    Tool calls:
                  </div>
                  {message.tool_calls.map((toolCall, index) => (
                    <div key={index} className="text-xs font-mono glassmorphic-card border border-white/20 dark:border-gray-600/30 p-2 rounded-lg mb-2">
                      {toolCall.function.name}({JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)})
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show created/edited files */}
              {message.files && message.files.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-600/30">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">
                    Files:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {message.files.map((file, index) => (
                      <div key={index} className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-2 py-1 rounded-md font-medium">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Checkpoint indicator and actions for user messages */}
              {message.type === 'user' && hasCheckpoint && (
                <div className="absolute -top-2 -right-2 flex items-center gap-1">
                  <div className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-lg border border-amber-300">
                    💾 Checkpoint
                  </div>
                  {!isLatestCheckpoint && (
                    <button
                      onClick={() => handleRevert(checkpoint.id)}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-0.5 rounded-full font-medium transition-colors duration-200 shadow-lg border border-amber-400"
                      title={`Revert to checkpoint from ${formatTime(checkpoint.timestamp)}`}
                    >
                      ⏪ Revert
                    </button>
                  )}
                </div>
              )}
              
              <div className={`flex items-center justify-between mt-3 ${
                message.type === 'user' 
                  ? 'text-white/70' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                <div className="text-xs flex items-center gap-2">
                  {formatTime(message.timestamp)}
                  {message.type === 'user' && hasCheckpoint && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-amber-200">💾</span>
                      <span className="text-amber-200 font-medium">
                        {isLatestCheckpoint ? 'Latest' : 'Checkpoint'}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Show additional checkpoint info */}
                {message.type === 'user' && hasCheckpoint && !isLatestCheckpoint && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleRevert(checkpoint.id)}
                      className="text-xs px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-md transition-colors duration-200 border border-amber-400/30"
                    >
                      Revert to here
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
        
        {/* Enhanced Typing/Thinking Indicator */}
        <TypingIndicator 
          isVisible={isLoading && !showLiveExecution} 
          message={currentTask || 'angela is thinking...'}
        />
        
        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced Input */}
      <div className="glassmorphic-card border-t border-white/20 dark:border-gray-700/50 p-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me to help with your project, create files, debug code, or explain concepts..."
              disabled={isLoading || !apiClient || !selectedModel}
              className="w-full resize-none rounded-xl border border-white/30 dark:border-gray-700/50 px-4 py-4 text-sm glassmorphic-card text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-transparent disabled:opacity-50 transition-all leading-relaxed backdrop-blur-sm"
              rows={4}
            />
            {inputMessage.trim() && (
              <div className="absolute bottom-3 right-3 text-xs text-gray-400 bg-white/60 dark:bg-gray-800/60 px-2 py-1 rounded-md backdrop-blur-sm">
                Press Ctrl+Enter to send
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading || !apiClient || !selectedModel}
              className="p-4 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-xl hover:from-sakura-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl shadow-sakura-500/25 transform hover:scale-105 disabled:transform-none flex items-center justify-center"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
            
            {/* AI Precision Editor Button */}
            <button
              onClick={() => setShowPrecisionEdit(v => !v)}
              className="p-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all duration-200 shadow-lg hover:shadow-xl shadow-purple-500/25 transform hover:scale-105 flex items-center justify-center"
              title="AI Precision Editor"
            >
              <Scissors className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {(!apiClient || !selectedModel) && (
          <div className="mt-3 p-3 glassmorphic-card border border-amber-200/30 dark:border-amber-700/30 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Please configure a provider and model in settings to start chatting
            </p>
          </div>
        )}

        {/* AI Precision Edit Tool Modal */}
        {showPrecisionEdit && (
          <div className="mt-3 glassmorphic-card border border-purple-200/30 dark:border-purple-700/30 rounded-xl p-4 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 dark:from-purple-900/20 dark:to-indigo-900/20">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                  AI Precision Editor
                </h4>
                <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 rounded-full font-medium">
                  Structured Output
                </div>
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed">
                AI analyzes your file and returns complete modified content using structured output. 
                <strong>Precision mode</strong> preserves structure, <strong>Full Transform</strong> allows complete redesign.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                  Target File
                </label>
                <select
                  className="w-full text-xs rounded-lg border border-purple-200 dark:border-purple-700 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={precisionFile}
                  onChange={e => setPrecisionFile(e.target.value)}
                >
                  <option value="">Select file to edit…</option>
                  {fileOptions.map(f => (
                    <option key={f.path} value={f.path}>{f.path}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                  Edit Mode
                </label>
                <select
                  className="w-full text-xs rounded-lg border border-purple-200 dark:border-purple-700 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={precisionMode}
                  onChange={e => setPrecisionMode(e.target.value as any)}
                >
                  <option value="precision">🎯 Precision (targeted changes)</option>
                  <option value="full">🚀 Full Transform (creative freedom)</option>
                </select>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                Edit Instructions
              </label>
              <input
                className="w-full text-sm rounded-lg border border-purple-200 dark:border-purple-700 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                type="text"
                placeholder={precisionMode === 'precision' 
                  ? "Describe specific changes (e.g., 'Add a dark mode toggle button to the header')"
                  : "Describe your vision (e.g., 'Transform this into a modern landing page for a chatbot company')"
                }
                value={precisionPrompt}
                onChange={e => setPrecisionPrompt(e.target.value)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-xl"
                onClick={handleAIPrecisionEdit}
                disabled={isLoading || !precisionFile || !precisionPrompt.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Apply AI Edit
                  </>
                )}
              </button>
              
              {precisionStatus && (
                <div className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                  precisionStatus.startsWith('✅') 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700' 
                    : precisionStatus.startsWith('❌')
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                }`}>
                  {precisionStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        providers={providers}
        selectedProviderId={selectedProviderId}
        selectedModel={selectedModel}
        availableModels={availableModels}
        onProviderSelect={handleProviderSelect}
        onModelSelect={handleModelSelect}
        parameters={aiParameters}
        onParametersChange={handleParametersChange}
      />


    </div>
  );
};

export default ChatWindow; 
