import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Loader2, Bot, Trash2, Settings, ChevronDown, Wand2, Scissors, Copy, CheckCircle, AlertCircle, Zap, Brain, Target, Sparkles, RotateCcw, History, Clock, AlertTriangle, User, ArrowDown, ChevronRight, Code2 } from 'lucide-react';
import { LiteProjectFile } from '../LumaUILite';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import LumaUILiteAPIClient, { ChatMessage as LiteChatMessage, ChatMessage } from './services/LumaUILiteAPIClient';
import LumaUILiteTools, { createLumaUILiteTools } from './services/LumaUILiteTools';
import { useProviders } from '../../contexts/ProvidersContext';
import { Provider } from '../../db';
import { useLumaUILiteCheckpoints } from './useLumaUILiteCheckpoints';
import ChatPersistence, { LumaUILiteCheckpoint } from './LumaUILiteChatPersistence';

// Message types for our chat interface
export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  files?: string[];
  tool_calls?: any[];
  tool_call_id?: string;
}

// Tool execution tracking
interface ToolExecution {
  id: string;
  functionName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

// AI Parameters interface
interface AIParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

// Default AI parameters
const defaultParameters: AIParameters = {
  temperature: 0.7,
  maxTokens: 16000,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxIterations: 10
};

// Collapsible Code Block Component
const CollapsibleCodeBlock: React.FC<{
  language: string;
  children: string;
  isUserMessage: boolean;
}> = ({ language, children, isUserMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const codeLength = String(children).length;
  const lineCount = String(children).split('\n').length;

  return (
    <div className="my-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
          isUserMessage
            ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
        }`}
      >
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4" />
          <span className="text-sm font-medium">
            {language.toUpperCase()} Code ({lineCount} lines, {Math.round(codeLength / 1024)}KB)
          </span>
        </div>
        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>
      
      {isExpanded && (
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="max-h-96 overflow-auto">
            <SyntaxHighlighter
              style={vscDarkPlus as any}
              language={language}
              PreTag="div"
              className="text-sm"
              wrapLongLines={true}
              customStyle={{
                margin: 0,
                padding: '12px',
                fontSize: '12px',
                lineHeight: '1.4',
                maxWidth: '100%',
                width: '100%'
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
};

// Chat window props
interface LumaUILiteChatWindowProps {
  projectFiles: LiteProjectFile[];
  onUpdateFile: (fileId: string, content: string) => void;
  onCreateFile: (file: Omit<LiteProjectFile, 'id' | 'lastModified'>) => void;
  onDeleteFile: (fileId: string) => void;
  onProjectUpdate: (projectFiles: LiteProjectFile[]) => void;
  selectedFile?: string | null;
  onFileSelect: (path: string, content: string) => void;
  projectId: string;
  projectName: string;
  // AI Settings Modal props
  showAISettingsModal?: boolean;
  onShowAISettingsModal?: () => void;
  onCloseAISettingsModal?: () => void;
  // AI Settings state exposure
  onAISettingsChange?: (settings: {
    selectedProviderId: string;
    selectedModel: string;
    parameters: AIParameters;
    availableModels: string[];
    customSystemPrompt: string;
    handleProviderChange: (providerId: string) => void;
    handleModelChange: (model: string) => void;
    handleParametersChange: (params: AIParameters) => void;
    handleSystemPromptChange: (prompt: string) => void;
  }) => void;
}

// Essential tools for vanilla HTML/CSS/JS projects only
const LITE_TOOLS = [
  // Core File Operations
  {
    id: "create_file",
    name: "create_file",
    description: "Create a completely new HTML, CSS, or JavaScript file with the specified content.",
    parameters: [
      { name: "path", type: "string", description: "The file path to create (e.g., 'index.html', 'styles.css', 'script.js')", required: true },
      { name: "content", type: "string", description: "The complete content to write to the new file", required: false }
    ]
  },
  {
    id: "read_file", 
    name: "read_file",
    description: "Read the complete contents of an existing file. Always use this BEFORE editing any file to understand the current structure.",
    parameters: [
      { name: "path", type: "string", description: "The file path to read (e.g., 'index.html', 'styles.css')", required: true }
    ]
  },
  {
    id: "edit_file",
    name: "edit_file", 
    description: "FULL FILE REPLACEMENT: Update an entire file with new content. Use for major restructuring or complete rewrites.",
    parameters: [
      { name: "path", type: "string", description: "The file path to edit", required: true },
      { name: "content", type: "string", description: "The COMPLETE file content - this replaces the entire file", required: true }
    ]
  },
  {
    id: "edit_file_section",
    name: "edit_file_section",
    description: "PRECISE EDITING: Replace a specific section of text in a file. Use exact text matching - the old_text must match EXACTLY.",
    parameters: [
      { name: "path", type: "string", description: "The file path to edit", required: true },
      { name: "old_text", type: "string", description: "The exact text to replace (must match exactly including whitespace)", required: true },
      { name: "new_text", type: "string", description: "The new text to replace the old text with", required: true }
    ]
  },
  {
    id: "delete_file",
    name: "delete_file",
    description: "Delete an existing file from the project.",
    parameters: [
      { name: "path", type: "string", description: "The file path to delete", required: true }
    ]
  },
  // Basic Directory Operations
  {
    id: "create_directory",
    name: "create_directory",
    description: "Create a new directory in the project structure (e.g., for organizing CSS, JS, or image files).",
    parameters: [
      { name: "path", type: "string", description: "The directory path to create (e.g., 'css', 'js', 'images')", required: true }
    ]
  },
  {
    id: "list_files",
    name: "list_files",
    description: "List all files in the project to understand the project structure.",
    parameters: []
  },
  {
    id: "get_all_files",
    name: "get_all_files", 
    description: "Get a comprehensive list of all files in the project with detailed information.",
    parameters: []
  },
  // Project Information
  {
    id: "get_project_info",
    name: "get_project_info",
    description: "Get basic information about the HTML project including file counts and structure.",
    parameters: []
  },
  {
    id: "search_files",
    name: "search_files", 
    description: "Search for files by name, path, or content. Useful for finding specific HTML elements, CSS classes, or JavaScript functions.",
    parameters: [
      { name: "pattern", type: "string", description: "The search pattern to look for in file names, paths, or content", required: true }
    ]
  }
];

// Convert tools to OpenAI format
const convertToOpenAITools = (tools: any[]) => {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters.reduce((acc: any, param: any) => {
          const property: any = {
            type: param.type,
            description: param.description
          };
          
          // Add items property for array types (required by OpenAI JSON Schema)
          if (param.type === "array") {
            property.items = {
              type: "string" // Default to string items, can be customized per tool if needed
            };
          }
          
          acc[param.name] = property;
          return acc;
        }, {}),
        required: tool.parameters.filter((p: any) => p.required).map((p: any) => p.name)
      }
    }
  }));
};

const OPENAI_TOOLS = convertToOpenAITools(LITE_TOOLS);

// Convert Provider from main settings to LumaUI-lite format
interface LiteProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
}

// Settings persistence
const STORAGE_KEY_LITE = 'lumaui-lite-chat-settings';

interface ChatSettings {
  providerId: string;
  model: string;
  parameters: AIParameters;
}

const saveChatSettings = (settings: ChatSettings) => {
  localStorage.setItem(STORAGE_KEY_LITE, JSON.stringify(settings));
};

const loadChatSettings = (): ChatSettings | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LITE);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const saveSystemPrompt = (prompt: string) => {
  localStorage.setItem('lumaui-lite-system-prompt', prompt);
};

const loadSystemPrompt = (): string => {
  return localStorage.getItem('lumaui-lite-system-prompt') || '';
};

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are an expert UI/UX designer and frontend developer specializing in creating stunning, modern web applications.

**PROJECT CONTEXT:**
- Project: {{PROJECT_NAME}}
- Current files: {{FILE_LIST}}
- Selected file: {{SELECTED_FILE}}

**AVAILABLE TOOLS:**
You have access to essential file operation tools for building vanilla HTML websites:
- create_file: Create new HTML, CSS, or JavaScript files
- edit_file: Replace entire file content (use for major changes)
- edit_file_section: Make targeted edits to specific parts of files
- read_file: Read current file content before making changes
- delete_file: Remove files that are no longer needed
- list_files: Get overview of project structure
- create_directory: Organize files into folders (css/, js/, images/, etc.)
- search_files: Find specific content in files
- create_html_template: Generate beautiful HTML page templates

**YOUR DESIGN PHILOSOPHY:**
You are a vanilla HTML/CSS/JavaScript expert who creates visually stunning, modern websites. Always prioritize:
1. **Visual Excellence**: Beautiful, modern designs with attention to typography, spacing, and color
2. **User Experience**: Intuitive navigation, smooth interactions, and delightful animations
3. **Modern Web Standards**: Semantic HTML5, modern CSS, and vanilla JavaScript ES6+
4. **Popular Libraries**: Leverage CDN libraries to enhance functionality without build tools
5. **Responsive Design**: Mobile-first approach with perfect cross-device compatibility

**ESSENTIAL LIBRARIES TO USE:**
Always include these popular libraries via CDN in your HTML projects:

**CSS Frameworks & Styling:**
- Tailwind CSS: https://cdn.tailwindcss.com
- Font Awesome 6.4.0+: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css
- Google Fonts: https://fonts.googleapis.com (Inter, Poppins, Roboto, Montserrat)
- Animate.css: https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css

**JavaScript Libraries (Vanilla JS Compatible):**
- Alpine.js: https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js (for reactive components)
- AOS (Animate On Scroll): https://unpkg.com/aos@2.3.1/dist/aos.js
- Swiper.js: https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.js (for carousels)
- GSAP: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js (advanced animations)
- Typed.js: https://cdn.jsdelivr.net/npm/typed.js@2.0.12 (typing animations)

**VANILLA HTML PROJECT STRUCTURE:**
\`\`\`
project/
  index.html          (Main entry point - mostly use this file for everything js, css, and HTML)
  css/
    styles.css        (Main stylesheet - only if the user asks for custom styles or overrides otherwise add it in index.html)
    components.css    (Reusable component styles - e.g. buttons, cards or layouts only if the user asks for custom styles other wise add it in index.html)
  js/
    main.js           (Main JavaScript - only if the user asks for custom scripts other wise add it in index.html)
\`\`\`

**DESIGN PATTERNS FOR VANILLA WEBSITES:**
1. **Hero Sections**: Compelling headlines with CSS animations, gradient backgrounds
2. **Navigation**: Responsive navbar with smooth transitions, mobile hamburger menu
3. **Cards**: Modern card layouts with CSS hover effects and subtle shadows
4. **Forms**: Styled contact forms with CSS-only validation states
5. **Galleries**: CSS Grid/Flexbox image galleries with lightbox functionality
6. **Animations**: CSS transitions and keyframes for smooth interactions
7. **Dark Mode**: CSS custom properties for easy theme switching
8. **Responsive Layout**: CSS Grid and Flexbox for all screen sizes

**CODE QUALITY STANDARDS:**
- **Semantic HTML5**: header, nav, main, section, article, aside, footer
- **Modern CSS**: Grid, Flexbox, CSS Variables, clamp() for responsive design
- **Vanilla JavaScript**: ES6+ features, async/await, DOM manipulation
- **Accessibility**: ARIA labels, keyboard navigation, alt text for images
- **Performance**: Optimized images, efficient CSS, minimal JavaScript
- **Progressive Enhancement**: Core functionality works without JavaScript

**BEST PRACTICES:**
1. **File Organization**: Separate HTML, CSS, and JS into organized folders
2. **Naming Conventions**: BEM methodology for CSS classes
3. **Comments**: Clear documentation in code for future maintenance
4. **Validation**: Use proper HTML5 form validation attributes
5. **Cross-browser**: Test compatibility across modern browsers
6. **SEO**: Proper meta tags, heading hierarchy, structured data

Always create visually stunning, modern websites using vanilla HTML, CSS, and JavaScript. Focus on clean code, responsive design, and excellent user experience!`;

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

const LumaUILiteChatWindow: React.FC<LumaUILiteChatWindowProps> = ({
  projectFiles: initialProjectFiles,
  onUpdateFile,
  onCreateFile,
  onDeleteFile,
  onProjectUpdate,
  selectedFile,
  onFileSelect,
  projectId,
  projectName,
  // AI Settings Modal props
  showAISettingsModal,
  onShowAISettingsModal,
  onCloseAISettingsModal,
  // AI Settings state exposure
  onAISettingsChange
}) => {
  // Get providers from context
  const { providers, loading: providersLoading } = useProviders();
  // Default welcome message
  const defaultMessages: Message[] = [
    {
      id: '1',
      type: 'assistant',
      content: '🎨 **Welcome to Design Studio!**\n\nI\'m your expert UI/UX designer and frontend developer. I specialize in creating stunning, modern web applications with the latest design trends and popular libraries!\n\n✨ **What I can create:**\n🎯 **Beautiful UI Components** with glassmorphism & animations\n🌈 **Modern Design Systems** with Tailwind CSS & custom styling\n📱 **Responsive Layouts** that work perfectly on all devices\n🚀 **Interactive Elements** with smooth animations & micro-interactions\n💫 **Popular Libraries** like Alpine.js, AOS, Swiper, Chart.js, GSAP\n\n**Design Examples:**\n- "Create a stunning hero section with animated background"\n- "Build a glassmorphic navigation with smooth scroll"\n- "Design a modern contact form with floating labels"\n- "Add a testimonial carousel with Swiper.js"\n- "Create an animated pricing section with hover effects"\n- "Build a dark mode toggle with smooth transitions"\n\n**I always use popular libraries like:**\n• Tailwind CSS for styling\n• Font Awesome for icons\n• Alpine.js for interactivity\n• AOS for scroll animations\n• Google Fonts for typography\n\nTell me what amazing UI you want to create! 🚀',
      timestamp: new Date()
    }
  ];

  // State management using the new checkpoint hook
  const {
    messages,
    setMessages,
    checkpoints,
    createCheckpoint,
    revertToCheckpoint,
    clearHistory,
    getCheckpointForMessage,
    isLatestCheckpoint
  } = useLumaUILiteCheckpoints(projectId, defaultMessages, initialProjectFiles);

  // Manage project files directly in this component
  const [projectFiles, setProjectFiles] = useState<LiteProjectFile[]>(initialProjectFiles);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState('');
  const [currentToolExecution, setCurrentToolExecution] = useState<ToolExecution | null>(null);

  // Enhanced input state
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  // Auto mode status tracking
  const [autoModeStatus, setAutoModeStatus] = useState({
    toolCalls: 0,
    maxToolCalls: 50,
    currentTask: ''
  });

  // Provider and model state
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [parameters, setParameters] = useState<AIParameters>(defaultParameters);
  const [apiClient, setApiClient] = useState<LumaUILiteAPIClient | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('');

  // Auto mode state
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [showPlanning, setShowPlanning] = useState(false);
  const [currentPlanning, setCurrentPlanning] = useState<PlanningExecution | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Scroll management
  const [isNearBottom, setIsNearBottom] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const threshold = 100; // pixels from bottom
      const isNear = scrollTop + clientHeight >= scrollHeight - threshold;
      setIsNearBottom(isNear);
    }
  }, []);
  
  // Initialize tools with all required callbacks
  const liteTools = useMemo(() => createLumaUILiteTools({
    projectFiles,
    onUpdateFile: (fileId: string, content: string) => {
      onUpdateFile(fileId, content);
      // Trigger immediate save notification
      console.log('🔄 File updated, auto-save will trigger...');
    },
    onCreateFile: (file: Omit<LiteProjectFile, 'id' | 'lastModified'>) => {
      onCreateFile(file);
      // Trigger immediate save notification
      console.log('🔄 File created, auto-save will trigger...');
    },
    onDeleteFile,
    onFileSelect,
    onTerminalWrite: (message: string) => {
      console.log('[Terminal]', message);
    },
    projectName: projectName || 'Untitled'
  }), [projectFiles, onUpdateFile, onCreateFile, onDeleteFile, onFileSelect, projectName]);

  // Initialize with first available provider when providers load
  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId) {
      const enabledProvider = providers.find(p => p.isEnabled) || providers[0];
      setSelectedProviderId(enabledProvider.id);
      
      const savedSettings = loadChatSettings();
      if (savedSettings) {
        setSelectedProviderId(savedSettings.providerId);
        setSelectedModel(savedSettings.model);
        setParameters(savedSettings.parameters);
      }
      
      // Load custom system prompt
      const savedSystemPrompt = loadSystemPrompt();
      setCustomSystemPrompt(savedSystemPrompt);
    }
  }, [providers, selectedProviderId]);

  // Fetch models when provider changes
  useEffect(() => {
    const fetchModels = async () => {
      const provider = providers.find(p => p.id === selectedProviderId);
      if (provider && provider.baseUrl) {
        try {
          const client = new LumaUILiteAPIClient(provider.baseUrl, {
            apiKey: provider.apiKey || '',
            providerId: provider.id
          });
          const models = await client.listModels();
          const modelNames = models.map(m => m.name || m.id);
          setAvailableModels(modelNames);
          
          // Auto-select first model if none selected
          if (modelNames.length > 0 && !selectedModel) {
            setSelectedModel(modelNames[0]);
          }
        } catch (error) {
          console.error('Error fetching models:', error);
          setAvailableModels([]);
        }
      }
    };

    if (selectedProviderId && providers.length > 0) {
      fetchModels();
    }
  }, [selectedProviderId, providers, selectedModel]);

  // Initialize API client when provider changes
  useEffect(() => {
    const provider = providers.find(p => p.id === selectedProviderId);
    if (provider && provider.baseUrl) {
      const client = new LumaUILiteAPIClient(provider.baseUrl, {
        apiKey: provider.apiKey || '',
        providerId: provider.id
      });
      setApiClient(client);
    }
  }, [selectedProviderId, providers]);

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (isNearBottom && messagesEndRef.current) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, isLoading, isNearBottom]);

  // Sync project files when they change from parent
  useEffect(() => {
    setProjectFiles(initialProjectFiles);
  }, [initialProjectFiles]);

  // Expose AI settings state to parent
  useEffect(() => {
    if (onAISettingsChange) {
      onAISettingsChange({
        selectedProviderId,
        selectedModel,
        parameters,
        availableModels,
        customSystemPrompt,
        handleProviderChange,
        handleModelChange,
        handleParametersChange,
        handleSystemPromptChange
      });
    }
  }, [selectedProviderId, selectedModel, parameters, availableModels, customSystemPrompt, onAISettingsChange]);

  // Get current provider
  const currentProvider = providers.find(p => p.id === selectedProviderId);

  // Format file list for context
  const filesList = projectFiles.map(f => `${f.path} (${f.type})`).join('\n  ');
  const selectedFileContext = selectedFile 
    ? `Currently selected: ${selectedFile}` 
    : 'No file currently selected';

  // Handle settings changes
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setSelectedModel(''); // Reset model when provider changes
    saveSettings();
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    saveSettings();
  };

  const handleParametersChange = (newParams: AIParameters) => {
    setParameters(newParams);
    saveSettings();
  };

  const handleSystemPromptChange = (prompt: string) => {
    setCustomSystemPrompt(prompt);
    saveSystemPrompt(prompt);
  };

  const saveSettings = () => {
    const settings: ChatSettings = {
      providerId: selectedProviderId,
      model: selectedModel,
      parameters
    };
    saveChatSettings(settings);
  };

  // Execute tools with retry logic like main LumaUI
  const executeTools = async (toolCalls: any[], retryCount: number = 0): Promise<any[]> => {
    if (!liteTools) return [];
    
    const results = [];
    const maxRetries = 2;
    
    for (const toolCall of toolCalls) {
      const { function: func } = toolCall;
      const functionName = func.name;
      let parameters;
      let lastError: string = '';
      let success = false;
      
      try {
        parameters = typeof func.arguments === 'string' 
          ? JSON.parse(func.arguments) 
          : func.arguments;
      } catch (error) {
        results.push({
          id: toolCall.id,
          result: `❌ Failed to parse tool arguments: ${error}`,
          success: false
        });
        continue;
      }

      // Retry logic for each tool
      for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
        try {
      // Create tool execution tracking
      const execution: ToolExecution = {
        id: toolCall.id,
        functionName,
        parameters,
            status: attempt === 0 ? 'executing' : 'pending',
        startTime: new Date()
      };
      
      setCurrentToolExecution(execution);

          // Brief delay to show starting state (shorter on retries)
          await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 300 : 150));

          // Update to executing state
          execution.status = 'executing';
          setCurrentToolExecution({...execution});

        let result;
        
        // Use tool registry for comprehensive tool support
        if (liteTools[functionName]) {
          result = await liteTools[functionName](parameters);
        } else {
          result = { success: false, message: `Unknown tool: ${functionName}`, error: 'TOOL_NOT_FOUND' };
            break; // Don't retry missing tool errors
        }

          if (result.success) {
            const filePath = result.data?.path || parameters.path || 'completed';
            execution.status = 'completed';
        execution.endTime = new Date();
            execution.result = `✅ ${functionName}: ${filePath}${attempt > 0 ? ` (succeeded on attempt ${attempt + 1})` : ''}`;
            
            success = true;

            // Format result for chat with enhanced content like main LumaUI
            let toolResultContent = execution.result;
        
        // Add detailed content for specific tools
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
            
            setCurrentToolExecution({...execution});
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } else {
            lastError = result.message || result.error || 'Unknown error';
            
            if (attempt === maxRetries) {
              // Final attempt failed
        execution.status = 'failed';
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
            } else {
              // Brief delay before retry
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }

        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          
          if (attempt === maxRetries) {
            const execution: ToolExecution = {
              id: toolCall.id,
              functionName: functionName,
              parameters: {},
              status: 'failed',
              startTime: new Date(),
              endTime: new Date(),
              error: lastError
            };

            setCurrentToolExecution(execution);
            
            results.push({
              id: toolCall.id,
              result: `❌ ${functionName}: ${lastError} (failed after ${maxRetries + 1} attempts)`,
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

    // Hide tool execution when all tools are done
    setCurrentToolExecution(null);
    return results;
  };

  // Enhanced system prompt for auto mode planning - matches main LumaUI
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

  const REFLECTION_PLANNING_SYSTEM_PROMPT = `You are an AI execution analyst reviewing tool execution results and planning next steps.

**ROLE**: Execution Reflection Assistant
**TASK**: Analyze tool results and determine next steps

**CONTEXT**:
- Current Step: {{STEP}}
- Original Request: {{ORIGINAL_REQUEST}}
- Tool Results: {{TOOL_RESULTS}}

**ANALYSIS REQUIREMENTS**:
1. **Result Analysis**: What was accomplished
2. **Progress Assessment**: How close to completion
3. **Next Steps**: What should happen next
4. **Continuation Decision**: Should continue or stop

**RESPONSE FORMAT** (JSON):
{
  "currentSituation": "Brief summary of current state",
  "toolResults": ["what each tool accomplished"],
  "nextSteps": ["specific next actions needed"],
  "reasoning": "Why these next steps are needed",
  "confidence": 85,
  "shouldContinue": true,
  "progressPercentage": 60
}

Be precise and decisive. Focus on practical next steps.`;

  // Auto mode planning and execution functions
  const performInitialPlanning = async (
    userQuery: string,
    projectTree: string,
    filesList: string
  ): Promise<any | null> => {
    if (!apiClient || !selectedModel) return null;

    try {
      setCurrentTask('🧠 Analyzing project and creating execution plan...');
      
      const planningPrompt = `${INITIAL_PLANNING_SYSTEM_PROMPT}

**PROJECT STRUCTURE**:
${projectTree}

**FILE LIST**:
${filesList}

**USER REQUEST**:
${userQuery}

Create a strategic execution plan for this request.`;

      const response = await apiClient.sendChat(
        selectedModel,
        [
          { role: 'system', content: planningPrompt },
          { role: 'user', content: userQuery }
        ],
        {
          temperature: parameters.temperature,
          max_tokens: parameters.maxTokens,
          top_p: parameters.topP,
          frequency_penalty: parameters.frequencyPenalty,
          presence_penalty: parameters.presencePenalty
        }
      );

      if (!response.message?.content) {
        return null;
      }

      // Try to parse JSON response
      let planningData;
      try {
        const jsonMatch = response.message.content.match(/```json\n([\s\S]*?)\n```/) || response.message.content.match(/\{[\s\S]*\}/);
        planningData = JSON.parse(jsonMatch ? jsonMatch[1] || jsonMatch[0] : response.message.content);
      } catch (parseError) {
        console.warn('Could not parse planning JSON, using text response');
        return null;
      }

      // Add planning message to chat
      const planningMessage: Message = {
        id: `planning-${Date.now()}`,
        type: 'assistant',
        content: `🧠 **Strategic Execution Plan Created**

**Project Analysis:**
${planningData.projectAnalysis}

**Request Breakdown:**
${planningData.userRequestBreakdown}

**Execution Plan (${planningData.estimatedSteps} steps):**
${planningData.executionPlan?.map((step: any, index: number) => 
  `${index + 1}. **${step.action}** → \`${step.target}\`\n   ${step.purpose}`
).join('\n\n')}

**Dependencies:** ${planningData.dependencies?.join(', ') || 'None'}
**Confidence:** ${planningData.confidence}%

Now executing plan systematically...`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, planningMessage]);
      return planningData;

    } catch (error) {
      console.error('Planning failed:', error);
      return null;
    }
  };

  const performAIReflection = async (
    toolResults: Array<{id: string, result: string, success: boolean}>,
    step: number,
    originalQuery: string
  ): Promise<AIReflection> => {
    // Create a fallback reflection in case of any failures
    const createFallbackReflection = (reason: string): AIReflection => ({
      id: `reflection-fallback-${Date.now()}`,
      step,
      toolResults: toolResults.map(r => r.result),
      currentSituation: `Tool execution completed (${reason})`,
      nextSteps: ['Continue with autonomous execution'],
      reasoning: `Fallback reflection: ${reason}`,
      confidence: 60,
      shouldContinue: true,
      timestamp: new Date()
    });

    if (!apiClient || !selectedModel) {
      console.warn('⚠️ No API client or model available for reflection');
      return createFallbackReflection('No API client available');
    }

    try {
      const reflectionPrompt = REFLECTION_PLANNING_SYSTEM_PROMPT
        .replace('{{STEP}}', step.toString())
        .replace('{{ORIGINAL_REQUEST}}', originalQuery)
        .replace('{{TOOL_RESULTS}}', toolResults.map(r => `${r.id}: ${r.success ? '✅' : '❌'} ${r.result}`).join('\n'));

      console.log('🧠 Sending reflection request...');
      
      const response = await apiClient.sendChat(
        selectedModel,
        [
          { role: 'system', content: reflectionPrompt },
          { role: 'user', content: 'Analyze the results and plan next steps.' }
        ],
        {
          temperature: parameters.temperature,
          max_tokens: Math.min(parameters.maxTokens, 4000), // Limit tokens for reflection
          top_p: parameters.topP,
          frequency_penalty: parameters.frequencyPenalty,
          presence_penalty: parameters.presencePenalty
        }
      );

      if (!response.message?.content) {
        console.warn('⚠️ Empty reflection response');
        return createFallbackReflection('Empty response from AI');
      }

      console.log('🧠 Reflection response received:', response.message.content.substring(0, 200) + '...');

      // Try to parse JSON response
      let reflectionData;
      try {
        const jsonMatch = response.message.content.match(/```json\n([\s\S]*?)\n```/) || response.message.content.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.message.content;
        reflectionData = JSON.parse(jsonText);
        console.log('✅ Successfully parsed reflection JSON');
      } catch (parseError) {
        console.warn('⚠️ Could not parse reflection JSON, using fallback:', parseError);
        return createFallbackReflection('JSON parsing failed');
      }

      // Validate and return structured reflection
      const reflection: AIReflection = {
        id: `reflection-${Date.now()}`,
        step,
        toolResults: reflectionData.toolResults || toolResults.map(r => r.result),
        currentSituation: reflectionData.currentSituation || 'Analyzing progress...',
        nextSteps: Array.isArray(reflectionData.nextSteps) ? reflectionData.nextSteps : ['Continue execution'],
        reasoning: reflectionData.reasoning || 'Following execution plan',
        confidence: typeof reflectionData.confidence === 'number' ? reflectionData.confidence : 70,
        shouldContinue: reflectionData.shouldContinue !== false, // Default to true unless explicitly false
        timestamp: new Date()
      };

      console.log('✅ Reflection created successfully:', {
        shouldContinue: reflection.shouldContinue,
        confidence: reflection.confidence
      });

      return reflection;

    } catch (error) {
      console.error('❌ Reflection failed with error:', error);
      return createFallbackReflection(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Parse and execute tools from AI response
  const parseAndExecuteTools = async (response: string): Promise<Array<{id: string, result: string, success: boolean}>> => {
    const results: Array<{id: string, result: string, success: boolean}> = [];
    
    // Simple regex-based tool detection (can be enhanced)
    const toolMatches = response.match(/\*\*Tool:\s*(\w+)\*\*[\s\S]*?\*\*Parameters:\*\*([\s\S]*?)(?=\*\*Tool:|$)/g);
    
    if (toolMatches) {
      for (const match of toolMatches) {
        const toolNameMatch = match.match(/\*\*Tool:\s*(\w+)\*\*/);
        const parametersMatch = match.match(/\*\*Parameters:\*\*([\s\S]*?)(?=\*\*|$)/);
        
        if (toolNameMatch && parametersMatch) {
          const toolName = toolNameMatch[1];
          const parametersText = parametersMatch[1].trim();
          
          try {
            // Try to parse parameters (simple key: value format)
            const parameters: any = {};
            const paramLines = parametersText.split('\n').filter(line => line.includes(':'));
            paramLines.forEach(line => {
              const [key, ...valueParts] = line.split(':');
              if (key && valueParts.length > 0) {
                parameters[key.trim()] = valueParts.join(':').trim();
              }
            });

            // Execute tool using existing LITE_TOOLS
            const tool = LITE_TOOLS.find(t => t.name === toolName);
            if (tool && liteTools[toolName]) {
              const result = await liteTools[toolName](parameters);
              results.push({
                id: `tool-${Date.now()}`,
                result: typeof result === 'string' ? result : JSON.stringify(result),
                success: true
              });
            } else {
              results.push({
                id: `error-${Date.now()}`,
                result: `Tool ${toolName} not found`,
                success: false
              });
            }
          } catch (error) {
            console.error('Tool execution error:', error);
            results.push({
              id: `error-${Date.now()}`,
              result: `Error executing ${toolName}: ${error}`,
              success: false
            });
          }
        }
      }
    }

    return results;
  };

  // Enhanced message handler with auto mode support
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !apiClient || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue(''); // Clear input using inputValue
    setIsLoading(true);

    try {
      if (isAutoMode) {
        await handleAutoModeExecution(inputValue.trim());
      } else {
        // Regular chat mode
        const baseSystemPrompt = customSystemPrompt || SYSTEM_PROMPT;
        const systemPrompt = baseSystemPrompt
          .replace('{{PROJECT_NAME}}', projectName || 'Untitled Project')
          .replace('{{FILE_LIST}}', filesList)
          .replace('{{SELECTED_FILE}}', selectedFileContext);

        const conversationHistory = buildConversationHistory(
          [...messages, userMessage],
          '',
          systemPrompt,
          10,
          true // Include previous conversation context for continuity
        );

        const response = await apiClient.sendChat(
          selectedModel,
          conversationHistory,
          {
            temperature: parameters.temperature,
            max_tokens: parameters.maxTokens,
            top_p: parameters.topP,
            frequency_penalty: parameters.frequencyPenalty,
            presence_penalty: parameters.presencePenalty,
            tools: convertToOpenAITools(LITE_TOOLS)
          }
        );

        if (response.message?.content) {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            type: 'assistant',
            content: response.message.content,
            timestamp: new Date(),
            tool_calls: response.message.tool_calls
          };

          setMessages(prev => [...prev, assistantMessage]);

          // Execute tools if present
          if (response.message.tool_calls && response.message.tool_calls.length > 0) {
            const toolResults = await executeTools(response.message.tool_calls);
            
            // Add tool results to conversation
            for (const result of toolResults) {
              const toolMessage: Message = {
                id: Date.now().toString(),
                type: 'tool',
                content: result.result || result.error || 'Tool execution completed',
                timestamp: new Date(),
                tool_call_id: result.id
              };
              setMessages(prev => [...prev, toolMessage]);
            }

            // Create checkpoint after successful tool execution
            if (toolResults.some(r => r.success)) {
              console.log('📸 Creating checkpoint after successful tool execution...');
              createCheckpoint(
                `Tool execution: ${response.message?.tool_calls?.map((tc: any) => tc.function.name).join(', ')}`,
                [...messages, assistantMessage],
                projectFiles
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoModeExecution = async (userQuery: string) => {
    try {
      setShowPlanning(true);
      
      // Build project context
      const filesList = projectFiles.map(f => `${f.path} (${f.type})`).join('\n  ');
      const projectTree = createFileTree(projectFiles);
      
      // STEP 1: Initial Strategic Planning
      setCurrentTask('🧠 Creating strategic execution plan...');
      
      const initialPlan = await performInitialPlanning(userQuery, projectTree, filesList);
      
      // Initialize planning execution tracking
      let currentPlanning: PlanningExecution = {
        id: `planning_${Date.now()}`,
        status: 'planning',
        currentStep: 0,
        totalSteps: 50, // Match the maxToolCalls limit
        reflections: [],
        startTime: new Date()
      };
      setCurrentPlanning(currentPlanning);

      // STEP 2: Execute plan with auto tool calling
      let conversationIteration = 0;
      let totalToolCalls = 0;
      const maxToolCalls = 50; // Fixed to 50 tool calls
      const maxConversationTurns = 25; // Fixed to 25 conversation turns

      console.log('🎯 Auto mode limits:', {
        maxToolCalls,
        maxConversationTurns,
        userSetting: parameters.maxIterations
      });

      // Build system prompt for auto mode with function calling
      const baseAutoPrompt = customSystemPrompt || `You are angela, an expert AI coding assistant with comprehensive tool access. Execute the user's request systematically using your available functions.`;
      const systemPrompt = baseAutoPrompt + `

**CURRENT PROJECT CONTEXT:**
- Project: ${projectName}
- Files: ${projectFiles.length} total files
- Selected File: ${selectedFile || 'No file selected'}

**PROJECT STRUCTURE:**
${projectTree}

**FILE LIST:**
${filesList}

**EXECUTION STRATEGY:**
${initialPlan ? `
STRATEGIC PLAN:
- Analysis: ${initialPlan.projectAnalysis}
- Estimated Steps: ${initialPlan.estimatedSteps}
- Dependencies: ${initialPlan.dependencies?.join(', ') || 'None'}
- Execution Plan: ${initialPlan.executionPlan?.map((step: any) => `${step.step}. ${step.action} → ${step.target} (${step.purpose})`).join(', ') || 'Adaptive approach'}

Follow this plan systematically, but adapt as needed based on actual results.
` : 'ADAPTIVE APPROACH: Analyze the request and execute tools in logical sequence.'}

**EXECUTION PRINCIPLES:**
1. **Read First**: Always read existing files before making changes
2. **Understand Context**: Analyze current project structure and patterns
3. **Plan Systematically**: Execute tools in logical order
4. **Verify Progress**: Check results after each operation
5. **Be Thorough**: Complete the full request systematically
6. **Autonomous Operation**: Continue working until the task is complete or you determine no further action is needed

**TOOL USAGE:**
- Use the function calling system to execute tools
- Be precise with file paths and parameters
- Explain what you're doing and why
- Continue until the request is fully satisfied
- If you complete the task, provide a final summary

**AUTONOMOUS BEHAVIOR:**
- Work independently without waiting for user input
- Make decisions based on tool results and project context
- Continue executing tools until the task is complete
- Only stop when you've fully satisfied the user's request or reached a natural completion point

Ready to systematically execute your request autonomously!`;

      // Build initial conversation history with context from previous messages
      // Include previous conversation context for better continuity
      let conversationHistory = buildConversationHistory(messages, userQuery, systemPrompt, 10, true);

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

      // AUTONOMOUS EXECUTION LOOP - This is the key difference from regular chat
      while (conversationIteration < maxConversationTurns && totalToolCalls < maxToolCalls) {
        conversationIteration++;
        currentPlanning.currentStep = totalToolCalls;
        currentPlanning.status = 'executing';
        setCurrentPlanning({...currentPlanning});

        setCurrentTask(`🤖 Autonomous step ${conversationIteration}... (Tools: ${totalToolCalls}/${maxToolCalls})`);

        console.log('🔄 === STARTING AUTO MODE ITERATION ===', {
          iteration: conversationIteration,
          toolCalls: totalToolCalls,
          historyLength: conversationHistory.length,
          lastMessage: conversationHistory[conversationHistory.length - 1]?.role,
          loopConditions: {
            conversationCheck: conversationIteration < maxConversationTurns,
            toolCallCheck: totalToolCalls < maxToolCalls,
            willContinue: conversationIteration < maxConversationTurns && totalToolCalls < maxToolCalls
          }
        });

        // Get AI response with OpenAI function calling
        console.log('🤖 Sending request to AI...', {
          model: selectedModel,
          historyLength: conversationHistory.length,
          lastMessages: conversationHistory.slice(-3).map(m => ({ role: m.role, hasContent: !!m.content }))
        });
        
        const response = await apiClient!.sendChat(
          selectedModel!,
          conversationHistory,
          {
            temperature: parameters.temperature,
            max_tokens: parameters.maxTokens,
            top_p: parameters.topP,
            frequency_penalty: parameters.frequencyPenalty,
            presence_penalty: parameters.presencePenalty,
            tools: OPENAI_TOOLS
          }
        );

        console.log('🤖 AI Response received:', {
          hasContent: !!response.message?.content,
          hasToolCalls: !!response.message?.tool_calls,
          toolCallCount: response.message?.tool_calls?.length || 0,
          finishReason: response.finish_reason,
          contentPreview: response.message?.content?.substring(0, 100) + '...',
          responseStructure: {
            message: !!response.message,
            choices: !!response.choices,
            usage: !!response.usage
          }
        });

        // Check if AI wants to use tools
        if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
          // Check if we would exceed tool call limit
          const newToolCallCount = totalToolCalls + response.message.tool_calls.length;
          if (newToolCallCount > maxToolCalls) {
            const limitMessage: Message = {
              id: `auto-limit-${Date.now()}`,
              type: 'assistant',
              content: `⚠️ **Tool call limit reached!** Would execute ${response.message.tool_calls.length} more tools, but limit is ${maxToolCalls}. Current count: ${totalToolCalls}.\n\nIncrease the limit in AI settings or break your request into smaller parts.`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, limitMessage]);
            break;
          }

          // Update tool call count
          totalToolCalls += response.message.tool_calls.length;

          // Add assistant message with tool calls
          const assistantMessage: Message = {
            id: `auto-assistant-${Date.now()}-${conversationIteration}`,
            type: 'assistant',
            content: response.message.content || `🔧 Using ${response.message.tool_calls.length} tool${response.message.tool_calls.length > 1 ? 's' : ''}...`,
            timestamp: new Date(),
            tool_calls: response.message.tool_calls
          };
          setMessages(prev => [...prev, assistantMessage]);

          // Add to conversation history (OpenAI format)
          conversationHistory.push({
            role: 'assistant',
            content: response.message.content || '',
            tool_calls: response.message.tool_calls
          });

          // Execute tools
          setCurrentTask(`⚡ Executing ${response.message.tool_calls.length} operation${response.message.tool_calls.length > 1 ? 's' : ''}... (Tool calls: ${totalToolCalls}/${maxToolCalls})`);
          
          console.log('🔧 About to execute tools:', {
            toolCallCount: response.message.tool_calls.length,
            toolCalls: response.message.tool_calls.map(tc => ({
              id: tc.id,
              function: tc.function.name,
              args: tc.function.arguments
            }))
          });
          
          const toolResults = await executeTools(response.message.tool_calls);
          
          console.log('🔧 Tool execution completed:', {
            resultCount: toolResults.length,
            successCount: toolResults.filter(r => r.success).length,
            failureCount: toolResults.filter(r => !r.success).length,
            results: toolResults.map(r => ({
              id: r.id,
              success: r.success,
              resultLength: r.result?.length || 0,
              resultPreview: r.result?.substring(0, 100) + '...'
            }))
          });
          
          // Add tool result messages following OpenAI format
          console.log('🔧 Adding tool results to conversation history...');
          for (const toolResult of toolResults) {
            const toolCall = response.message.tool_calls.find((tc: any) => tc.id === toolResult.id);
            const toolMessage = {
              role: 'tool' as const,
              tool_call_id: toolResult.id,
              name: toolCall?.function?.name || 'unknown',
              content: toolResult.result
            };
            
            // Add tool message to conversation history (OpenAI format)
            conversationHistory.push(toolMessage);
            
            console.log('🔧 Tool result added to conversation:', {
              toolId: toolResult.id,
              name: toolCall?.function?.name,
              success: toolResult.success,
              contentLength: toolResult.result?.length || 0,
              toolCallId: toolResult.id,
              conversationLength: conversationHistory.length
            });
          }
          
          console.log('🔧 Conversation history updated:', {
            totalMessages: conversationHistory.length,
            lastMessage: conversationHistory[conversationHistory.length - 1]?.role,
            toolResultsAdded: toolResults.length
          });

          // Show tool results in UI
          const toolMessage: Message = {
            id: `auto-tool-${Date.now()}-${conversationIteration}`,
            type: 'tool',
            content: toolResults.map((r: any) => r.result).join('\n'),
            timestamp: new Date(),
            tool_call_id: toolResults[0]?.id, // Store the first tool call ID for conversation history
            files: response.message.tool_calls
              .filter((tc: any) => tc.function.name === 'create_file' || tc.function.name === 'edit_file')
              .map((tc: any) => {
                const params = typeof tc.function.arguments === 'string' 
                  ? JSON.parse(tc.function.arguments) 
                  : tc.function.arguments;
                return params.path;
              })
              .filter(Boolean)
          };
          setMessages(prev => {
            const updatedMessages = [...prev, toolMessage];
            
            // Create checkpoint after successful tool execution
            if (toolResults.some(r => r.success)) {
              console.log('📸 Creating checkpoint after successful tool execution...');
              createCheckpoint(
                `Tool execution: ${response.message?.tool_calls?.map((tc: any) => tc.function.name).join(', ')}`,
                [...messages, assistantMessage],
                projectFiles
              );
            }
            
            return updatedMessages;
          });

          // Perform AI reflection and planning after tool execution
          console.log('🧠 Starting AI reflection process...');
          currentPlanning.status = 'reflecting';
          setCurrentPlanning({...currentPlanning});
          
          console.log('🧠 Calling performAIReflection with:', {
            toolResultsCount: toolResults.length,
            conversationIteration,
            userQuery: userQuery.substring(0, 50) + '...'
          });
          
          const reflection = await performAIReflection(toolResults, conversationIteration, userQuery);
          
          console.log('🧠 Reflection completed:', {
            reflectionId: reflection.id,
            shouldContinue: reflection.shouldContinue,
            confidence: reflection.confidence,
            reasoning: reflection.reasoning.substring(0, 100) + '...'
          });
          
          // Add reflection to planning (performAIReflection now always returns a valid reflection)
          currentPlanning.reflections.push(reflection);
          setCurrentPlanning({...currentPlanning});
          
          console.log('🧠 AI Reflection:', {
            shouldContinue: reflection.shouldContinue,
            confidence: reflection.confidence,
            nextStepsCount: reflection.nextSteps.length,
            reasoning: reflection.reasoning
          });
          
          // If AI decides not to continue, break the loop
          if (!reflection.shouldContinue) {
            const completionMessage: Message = {
              id: `auto-complete-${Date.now()}`,
              type: 'assistant',
              content: `✅ **Task completed!** The AI has determined that the request has been fulfilled successfully.\n\n**Final Assessment:** ${reflection.currentSituation}`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, completionMessage]);
            break;
          }

          setCurrentTask('🧠 Analyzing next steps...');
          
          // Add a small delay to prevent overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Continue the loop to get next AI response - THIS IS THE KEY AUTONOMOUS BEHAVIOR
          console.log('🔄 Preparing to continue autonomous execution...', {
            nextIteration: conversationIteration + 1,
            toolCallsUsed: totalToolCalls,
            maxToolCalls,
            maxConversationTurns,
            willContinue: (conversationIteration + 1) < maxConversationTurns && totalToolCalls < maxToolCalls,
            conversationHistoryLength: conversationHistory.length,
            currentPlanningStatus: currentPlanning.status
          });
          
          console.log('🔄 Loop will continue to next iteration...');
          
        } else {
          // No more tool calls, show final response and exit
          console.log('🏁 No more tool calls, completing auto mode');
          
          if (response.message?.content) {
            const finalMessage: Message = {
              id: `auto-final-${Date.now()}`,
              type: 'assistant',
              content: response.message.content,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, finalMessage]);
          }
          break; // Exit the loop - task is complete
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
        id: `auto-summary-${Date.now()}`,
        type: 'assistant',
        content: `📊 **Auto Mode Session Summary**

• **Tool calls executed:** ${totalToolCalls}/${maxToolCalls}
• **Conversation turns:** ${conversationIteration}/${maxConversationTurns}
• **Status:** ${totalToolCalls >= maxToolCalls ? 'Tool limit reached' : conversationIteration >= maxConversationTurns ? 'Conversation limit reached' : 'Completed naturally'}
• **Reflections:** ${currentPlanning?.reflections.length || 0} strategic assessments

The AI worked autonomously to complete your request, executing tools and making decisions without requiring user input at each step.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, completionSummary]);

      // create a checkpoint at the end of a successful auto mode session
      if(totalToolCalls > 0) {
        const finalMessages: Message[] = conversationHistory.map((msg, index) => ({
          id: `auto-msg-${Date.now()}-${index}`,
          type: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content || '',
          timestamp: new Date(),
          tool_calls: msg.tool_calls,
          tool_call_id: msg.tool_call_id
        }));
        createCheckpoint(userQuery, finalMessages, projectFiles);
      }

    } catch (error) {
      console.error('Auto mode execution failed:', error);
      const errorMessage: Message = {
        id: `auto-error-${Date.now()}`,
        type: 'assistant',
        content: `❌ Auto mode execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Create file tree visualization
  // Build conversation history with context window
  const buildConversationHistory = (
    messages: Message[], 
    currentInput: string, 
    systemPrompt: string, 
    windowSize: number = 10,
    includePreviousContext: boolean = false
  ): ChatMessage[] => {
    const history: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // If we want previous context and this is a new conversation (few current messages),
    // try to load context from previous conversations
    if (includePreviousContext && messages.length <= 2) {
      try {
        // For now, use synchronous localStorage access for previous context
        // to avoid making buildConversationHistory async
        const saved = localStorage.getItem(`lumaui-lite-chat-history-${projectId}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data && data.messages && data.messages.length > 0) {
            // Get the last 5 messages from previous conversations for context
            const previousMessages = data.messages.slice(-5);
            
            // Add previous context to system prompt
            const contextSummary = previousMessages
              .filter((msg: any) => msg.type === 'user' || msg.type === 'assistant')
              .map((msg: any) => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`)
              .join('\n');
            
            if (contextSummary) {
              history[0].content += `

**PREVIOUS CONVERSATION CONTEXT:**
Here are the last few messages from our previous conversation about this project:

${contextSummary}

Use this context to maintain continuity and understand the project's evolution. Reference previous work when relevant.

---

`;
            }
          }
        }
      } catch (error) {
        console.error('Error loading previous conversation context:', error);
      }
    }

    // Get the last windowSize messages (excluding the current input)
    const recentMessages = messages.slice(-windowSize);

    // Track tool calls that need responses to ensure proper pairing
    const pendingToolCalls = new Set<string>();
    const processedMessages: ChatMessage[] = [];

    // Convert messages to ChatMessage format and ensure tool call/response pairing
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      
      if (msg.type === 'user') {
        processedMessages.push({
          role: 'user',
          content: msg.content
        });
      } else if (msg.type === 'assistant') {
        const chatMsg: ChatMessage = {
          role: 'assistant',
          content: msg.content
        };
        
        // Include tool calls if present
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          chatMsg.tool_calls = msg.tool_calls;
          
          // Track tool calls that need responses
          msg.tool_calls.forEach((tc: any) => {
            if (tc.id) {
              pendingToolCalls.add(tc.id);
            }
          });
        }
        
        processedMessages.push(chatMsg);
      } else if (msg.type === 'tool') {
        // For tool messages, check if they respond to pending tool calls
        if (msg.tool_call_id && pendingToolCalls.has(msg.tool_call_id)) {
          processedMessages.push({
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.tool_call_id
          });
          
          // Remove from pending since we found the response
          pendingToolCalls.delete(msg.tool_call_id);
        }
      }
    }

    // If there are still pending tool calls without responses, we need to filter them out
    // to avoid the OpenAI API error. We'll remove assistant messages with unmatched tool calls.
    const validMessages: ChatMessage[] = [];
    const validToolCalls = new Set<string>();

    // First pass: identify which tool calls have valid responses
    for (const msg of processedMessages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        validToolCalls.add(msg.tool_call_id);
      }
    }

    // Second pass: only include assistant messages with tool calls if all their tool calls have responses
    for (const msg of processedMessages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        // Check if all tool calls in this message have responses
        const allToolCallsHaveResponses = msg.tool_calls.every((tc: any) => 
          validToolCalls.has(tc.id)
        );
        
        if (allToolCallsHaveResponses) {
          validMessages.push(msg);
        } else {
          // Include the assistant message but without tool calls to avoid API error
          validMessages.push({
            role: 'assistant',
            content: msg.content || 'Used tools to complete the request.'
          });
        }
      } else {
        validMessages.push(msg);
      }
    }

    // Add valid messages to history
    history.push(...validMessages);

    // Add the current user input
    history.push({
      role: 'user',
      content: currentInput
    });

    return history;
  };

  const createFileTree = (files: LiteProjectFile[]): string => {
    const tree: any = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part: string, index: number) => {
        if (index === parts.length - 1) {
          current[part] = file.type === 'file' ? '📄' : '📁';
        } else {
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

  // Check if ready to chat
  const isReadyToChat = apiClient && selectedModel && (currentProvider?.apiKey || ['ollama', 'custom'].includes(currentProvider?.type || ''));

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Clear chat
  const clearChat = async () => {
    const checkpointCount = checkpoints.length;
    const warningMessage = checkpointCount > 0 
      ? `Are you sure you want to clear the chat? This will also delete ${checkpointCount} saved checkpoint${checkpointCount > 1 ? 's' : ''} for this project.`
      : 'Are you sure you want to clear the chat?';
      
    if (confirm(warningMessage)) {
      try {
        await clearHistory();
      } catch (error) {
        console.error('Error clearing chat:', error);
      }
    }
  };

  // Format time with safety check
  const formatTime = (date: Date | string) => {
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formatting time:', error, date);
      return 'Invalid Date';
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Dynamic font size based on message length
  const getDynamicFontSize = (content: string) => {
    const length = content.length;
    
    // Base font size classes
    if (length < 100) return 'text-sm'; // 14px - short messages
    if (length < 300) return 'text-sm'; // 14px - medium messages  
    if (length < 600) return 'text-xs'; // 12px - longer messages
    if (length < 1200) return 'text-xs'; // 12px - very long messages
    return 'text-xs'; // 12px minimum - extremely long messages
  };

  // Dynamic line height based on font size
  const getDynamicLineHeight = (content: string) => {
    const length = content.length;
    
    if (length < 100) return 'leading-relaxed'; // 1.625
    if (length < 300) return 'leading-relaxed'; // 1.625
    if (length < 600) return 'leading-normal'; // 1.5
    if (length < 1200) return 'leading-normal'; // 1.5
    return 'leading-snug'; // 1.375 - tighter for very long text
  };

  const handleRevert = (checkpointId: string) => {
    if (confirm('Are you sure you want to revert to this checkpoint? Current changes will be lost.')) {
      const checkpoint = revertToCheckpoint(checkpointId);
      if (checkpoint) {
        // Update local project files state and sync to parent
        setProjectFiles(checkpoint.projectFiles);
        onProjectUpdate(checkpoint.projectFiles);
        console.log('⏪ Reverted to checkpoint:', checkpointId);
      }
    }
  };

  // Enhanced input handlers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleAutoMode = () => {
    setIsAutoMode(!isAutoMode);
    if (!isAutoMode) {
      setAutoModeStatus(prev => ({ ...prev, currentTask: '' }));
    }
  };

  const handleStopAutoMode = () => {
    setIsAutoMode(false);
    setAutoModeStatus(prev => ({ ...prev, currentTask: '' }));
  };

  return (
    // 80% of viewport height
    <div className="h-[86vh] flex flex-col bg-white/80 dark:bg-gray-900/80 max-h-screen overflow-hidden">
      {/* Simple Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/20 dark:border-gray-700/50 flex-shrink-0 bg-white/90 dark:bg-gray-800/90">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sakura-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              AI Assistant
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {projectName || 'LumaUI-lite Project'}
            </p>
          </div>
          
          {/* Auto Mode Badge */}
          {isAutoMode && (
            <div className="flex items-center gap-2 px-3 py-1 bg-purple-500 text-white rounded-full text-xs font-medium">
              <Zap className="w-3 h-3" />
              Auto Mode
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Auto Mode Toggle */}
          <button
            onClick={() => setIsAutoMode(!isAutoMode)}
            className={`p-2 rounded-lg transition-colors ${
              isAutoMode
                ? 'bg-purple-500 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'
            }`}
            title={isAutoMode ? 'Disable Auto Mode' : 'Enable Auto Mode'}
          >
            {isAutoMode ? <Sparkles className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => onShowAISettingsModal?.()}
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-sakura-500 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded-lg transition-colors"
            title="AI Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <button
            onClick={clearChat}
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          {/* Checkpoint History Button */}
          {checkpoints && checkpoints.length > 0 && (
            <div className="relative group">
              <button 
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-sakura-500 hover:bg-sakura-50 dark:hover:bg-sakura-900/20 rounded-lg transition-colors relative" 
                title={`${checkpoints.length} checkpoint${checkpoints.length > 1 ? 's' : ''} available`}
              >
                <History className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {checkpoints.length}
                </span>
              </button>
              
              {/* Checkpoint Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="p-3">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    Checkpoint History
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {checkpoints.slice().reverse().map((checkpoint) => (
                      <div
                        key={checkpoint.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                            {checkpoint.metadata.userQuery.substring(0, 30)}...
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(checkpoint.timestamp)} • {checkpoint.metadata.messageCount} messages
                          </div>
                        </div>
                        {!isLatestCheckpoint(checkpoint.id) && (
                          <button
                            onClick={() => handleRevert(checkpoint.id)}
                            className="ml-2 p-1 text-amber-500 hover:text-amber-600 rounded"
                            title="Revert to this checkpoint"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        {isLatestCheckpoint(checkpoint.id) && (
                          <div className="ml-2 p-1 text-green-500" title="Current checkpoint">
                            <CheckCircle className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auto Mode Status */}
      {isAutoMode && (currentTask || showPlanning) && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-500 flex items-center justify-center">
              {currentPlanning?.status === 'planning' && <Brain className="w-3 h-3 text-white" />}
              {currentPlanning?.status === 'executing' && <Target className="w-3 h-3 text-white" />}
              {currentPlanning?.status === 'reflecting' && <Sparkles className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                {currentTask || 'Processing...'}
              </span>
              {currentPlanning && currentPlanning.reflections.length > 0 && (
                <div className="text-xs text-purple-700 dark:text-purple-300">
                  {currentPlanning.reflections[currentPlanning.reflections.length - 1].currentSituation}
                </div>
              )}
            </div>
            {currentPlanning && (
              <div className="text-xs px-2 py-1 bg-white dark:bg-gray-800 text-purple-800 dark:text-purple-200 rounded font-medium">
                Step {currentPlanning.currentStep}/{currentPlanning.totalSteps}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50/50 dark:bg-gray-900/50 relative min-h-0"
      >
        <div className="p-4 space-y-4">
        {messages.map((message) => {
          const checkpoint = getCheckpointForMessage(message.id);

          return (
            <div key={message.id} className="group">
              <div className={`flex items-start gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${message.type === 'user' ? 'bg-gray-600' : 'bg-sakura-500'}`}>
                  {message.type === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>

                {/* Message Bubble */}
                <div className={`relative flex-1 min-w-0 max-w-[85%] px-4 py-3 rounded-2xl break-words ${
                  message.type === 'user' 
                    ? 'bg-sakura-500 text-white rounded-br-md ml-auto' 
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md'
                }`}>
                  {/* Checkpoint Badge */}
                  {checkpoint && (
                    <div className={`absolute -top-2 ${message.type === 'user' ? '-left-2' : '-right-2'}`}>
                       <div className="text-xs px-2 py-1 rounded-full font-medium bg-amber-500 text-white shadow-sm">
                         Checkpoint
                       </div>
                     </div>
                   )}
                  
                  <div className={`prose prose-sm max-w-none break-words ${
                    message.type === 'user' 
                      ? 'prose-invert text-white' 
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    <ReactMarkdown
                      components={{
                        p: ({...props}: any) => (
                          <p className={`mb-2 last:mb-0 break-words ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        h1: ({...props}: any) => (
                          <h1 className={`text-lg font-bold mb-2 ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        h2: ({...props}: any) => (
                          <h2 className={`text-base font-semibold mb-2 ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        h3: ({...props}: any) => (
                          <h3 className={`text-sm font-semibold mb-1 ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        ul: ({...props}: any) => (
                          <ul className={`list-disc list-inside mb-2 ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        ol: ({...props}: any) => (
                          <ol className={`list-decimal list-inside mb-2 ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        li: ({...props}: any) => (
                          <li className={`mb-1 break-words ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        strong: ({...props}: any) => (
                          <strong className={`font-semibold ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        em: ({...props}: any) => (
                          <em className={`italic ${
                            message.type === 'user' 
                              ? 'text-white' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`} {...props} />
                        ),
                        code: ({inline, className, children, ...props}: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <CollapsibleCodeBlock
                              language={match[1]}
                              isUserMessage={message.type === 'user'}
                            >
                              {String(children).replace(/\n$/, '')}
                            </CollapsibleCodeBlock>
                          ) : (
                            <code className={`px-1 py-0.5 rounded text-sm font-mono break-all ${
                              message.type === 'user' 
                                ? 'bg-white/20 text-white' 
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                            }`} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Loading State */}
        {isLoading && (
          <div className="group">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-sakura-500">
                <Bot className="w-4 h-4 text-white" />
              </div>

              {/* Message Bubble */}
              <div className="relative flex-1 min-w-0 max-w-[85%] px-4 py-3 rounded-2xl break-words bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-sakura-500 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {currentTask || 'AI is thinking...'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {!isNearBottom && (
          <button
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-4 right-4 w-10 h-10 bg-sakura-500 text-white rounded-full shadow-lg hover:bg-sakura-600 transition-colors flex items-center justify-center z-10"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/20 dark:border-gray-700/50 flex-shrink-0 bg-white/90 dark:bg-gray-800/90">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAutoMode ? "Auto mode is active - you can still send messages..." : "Describe what you want to build or improve..."}
              disabled={isLoading}
              className={`w-full px-4 py-3 pr-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl resize-none transition-all focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-sakura-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              rows={3}
              style={{ 
                minHeight: '60px',
                maxHeight: '120px'
              }}
            />
            
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className={`absolute bottom-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                !inputValue.trim() || isLoading
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-sakura-500 hover:bg-sakura-600 text-white shadow-sm hover:shadow-md'
              }`}
              title="Send message"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Quick:</span>
          {[
            { label: "Fix bugs", icon: "🐛" },
            { label: "Add styling", icon: "🎨" },
            { label: "Improve UX", icon: "✨" },
            { label: "Add features", icon: "🚀" }
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => {
                if (!isLoading) {
                  setInputValue(action.label);
                }
              }}
              disabled={isLoading}
              className={`px-3 py-1.5 text-xs transition-all border rounded-lg font-medium ${
                isLoading
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600 cursor-not-allowed'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-sakura-300 dark:hover:border-sakura-500 hover:text-sakura-600 dark:hover:text-sakura-400'
              }`}
            >
              <span className="mr-1">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Modal is now handled by parent component */}
    </div>
  );
};

export default LumaUILiteChatWindow; 
