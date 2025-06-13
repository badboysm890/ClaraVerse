/**
 * Clara Assistant Input Component
 * 
 * This component provides the input interface for the Clara assistant.
 * It handles text input, file uploads, and various assistant features.
 * 
 * Features:
 * - Multi-line text input with auto-resize
 * - Drag and drop file upload
 * - File type detection and preview
 * - Voice input (future)
 * - Model selection
 * - Advanced options
 * - Send/cancel functionality
 * - Keyboard shortcuts
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  File, 
  Wrench, 
  Zap, 
  Database, 
  Mic, 
  Settings, 
  Send, 
  Plus,
  X,
  Bot,
  ChevronDown,
  Square,
  Loader2,
  Upload,
  Paperclip,
  AlertCircle,
  Server,
  CheckCircle,
  XCircle,
  Waves,
  Cog,
  MessageCircle,
  Palette,
  Code,
  BarChart3,
  Table,
  Workflow,
  Globe,
  FileText,
  GitBranch
} from 'lucide-react';

// Import types
import { 
  ClaraInputProps,
  ClaraFileAttachment,
  ClaraSessionConfig,
  ClaraFileType,
  ClaraProvider,
  ClaraModel,
  ClaraAIConfig,
  ClaraMCPServer,
  ClaraMessage,
  ClaraChatSession
} from '../../types/clara_assistant_types';

// Import PDF.js for PDF processing
import * as pdfjsLib from 'pdfjs-dist';

// Import MCP service
import { claraMCPService } from '../../services/claraMCPService';

// Import voice chat component
import ClaraVoiceChat from './ClaraVoiceChat';

// Import voice service
import { claraVoiceService } from '../../services/claraVoiceService';

// Import database service
import { claraDB } from '../../db/claraDatabase';

// Import API service
import { claraApiService } from '../../services/claraApiService';

/**
 * Custom Tooltip Component
 */
const Tooltip: React.FC<{
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}> = ({ children, content, position = 'top', delay = 500 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback(() => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsVisible(false);
  }, [timeoutId]);

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full mb-2 left-1/2 transform -translate-x-1/2';
      case 'bottom':
        return 'top-full mt-2 left-1/2 transform -translate-x-1/2';
      case 'left':
        return 'right-full mr-2 top-1/2 transform -translate-y-1/2';
      case 'right':
        return 'left-full ml-2 top-1/2 transform -translate-y-1/2';
      default:
        return 'bottom-full mb-2 left-1/2 transform -translate-x-1/2';
    }
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div className={`absolute ${getPositionClasses()} z-50 animate-in fade-in-0 zoom-in-95 duration-200`}>
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg border border-gray-700 dark:border-gray-600 whitespace-nowrap">
            {content}
            {/* Tooltip arrow */}
            <div 
              className={`absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 border-gray-700 dark:border-gray-600 transform rotate-45 ${
                position === 'top' ? 'top-full -mt-1 left-1/2 -translate-x-1/2 border-r border-b' :
                position === 'bottom' ? 'bottom-full -mb-1 left-1/2 -translate-x-1/2 border-l border-t' :
                position === 'left' ? 'left-full -ml-1 top-1/2 -translate-y-1/2 border-t border-r' :
                'right-full -mr-1 top-1/2 -translate-y-1/2 border-b border-l'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * File upload area component
 */
const FileUploadArea: React.FC<{
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  isProcessing: boolean;
}> = ({ files, onFilesAdded, onFileRemoved, isProcessing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    onFilesAdded(droppedFiles);
  }, [onFilesAdded]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      onFilesAdded(selectedFiles);
      e.target.value = ''; // Reset input
    }
  }, [onFilesAdded]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return ImageIcon;
    if (file.type === 'application/pdf') return File;
    return File;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-2">
      {/* File input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.cpp,.c,.java"
      />

      {/* Drop area */}
      {isDragOver && (
        <div
          className="absolute inset-0 bg-sakura-500/20 border-2 border-dashed border-sakura-500 rounded-xl flex items-center justify-center z-20"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="text-center">
            <Upload className="w-8 h-8 text-sakura-500 mx-auto mb-2" />
            <p className="text-sakura-600 dark:text-sakura-400 font-medium">
              Drop files here to upload
            </p>
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {files.map((file, index) => {
            const IconComponent = getFileIcon(file);
            return (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
              >
                <IconComponent className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                  {file.name}
                </span>
                <span className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </span>
                {!isProcessing && (
                  <button
                    onClick={() => onFileRemoved(index)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Provider selector component
 */
const ProviderSelector: React.FC<{
  providers: ClaraProvider[];
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
  isLoading?: boolean;
}> = ({ providers, selectedProvider, onProviderChange, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ [id: string]: 'healthy' | 'unhealthy' | 'loading' | 'unknown' }>({});
  const selectedProviderObj = providers.find(p => p.id === selectedProvider);

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'ollama': return Server;
      case 'openai': return Bot;
      case 'openrouter': return Zap;
      default: return Server;
    }
  };

  const getStatusColor = (provider: ClaraProvider) => {
    if (!provider.isEnabled) return 'text-gray-400';
    if (provider.isPrimary) return 'text-green-500';
    return 'text-blue-500';
  };

  // Health dot color
  const getHealthDot = (status: 'healthy' | 'unhealthy' | 'loading' | 'unknown') => {
    let color = 'bg-gray-400';
    if (status === 'healthy') color = 'bg-green-500';
    else if (status === 'unhealthy') color = 'bg-red-500';
    else if (status === 'loading') color = 'bg-yellow-400 animate-pulse';
    return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${color}`} title={status} />;
  };

  // Health check all enabled providers when dropdown opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const checkAll = async () => {
      const newStatus: { [id: string]: 'healthy' | 'unhealthy' | 'loading' | 'unknown' } = { ...healthStatus };
      await Promise.all(providers.map(async (provider) => {
        if (!provider.isEnabled) {
          newStatus[provider.id] = 'unknown';
          return;
        }
        newStatus[provider.id] = 'loading';
        setHealthStatus(s => ({ ...s, [provider.id]: 'loading' }));
        try {
          const healthy = await claraApiService.testProvider(provider);
          if (!cancelled) {
            newStatus[provider.id] = healthy ? 'healthy' : 'unhealthy';
            setHealthStatus(s => ({ ...s, [provider.id]: healthy ? 'healthy' : 'unhealthy' }));
          }
        } catch {
          if (!cancelled) {
            newStatus[provider.id] = 'unhealthy';
            setHealthStatus(s => ({ ...s, [provider.id]: 'unhealthy' }));
          }
        }
      }));
      if (!cancelled) setHealthStatus(newStatus);
    };
    checkAll();
    return () => { cancelled = true; };
  }, [isOpen, providers]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors border border-gray-300 dark:border-gray-600 w-full max-w-[220px] min-w-[180px]"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedProviderObj && (
            <>
              {getHealthDot(healthStatus[selectedProviderObj.id] || 'unknown')}
              {React.createElement(getProviderIcon(selectedProviderObj.type), {
                className: `w-4 h-4 flex-shrink-0 ${getStatusColor(selectedProviderObj)}`
              })}
              <span className="text-gray-700 dark:text-gray-300 truncate text-left" title={selectedProviderObj.name}>
                {selectedProviderObj.name}
              </span>
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-full min-w-[280px] max-w-[400px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {providers.map((provider) => {
            const IconComponent = getProviderIcon(provider.type);
            return (
              <button
                key={provider.id}
                onClick={() => {
                  onProviderChange(provider.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  provider.id === selectedProvider ? 'bg-sakura-50 dark:bg-sakura-900/20' : ''
                }`}
                disabled={!provider.isEnabled}
                title={`${provider.name} - ${provider.baseUrl}`}
              >
                {getHealthDot(healthStatus[provider.id] || 'unknown')}
                <IconComponent className={`w-4 h-4 flex-shrink-0 ${getStatusColor(provider)}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {provider.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {provider.baseUrl}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {provider.isPrimary && (
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  )}
                  {!provider.isEnabled && (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Model selector component
 */
const ModelSelector: React.FC<{
  models: ClaraModel[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelType?: 'text' | 'vision' | 'code';
  currentProvider?: string;
  isLoading?: boolean;
}> = ({ models, selectedModel, onModelChange, modelType = 'text', currentProvider, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Filter models by provider first, then by type and capability
  const filteredModels = models.filter(model => {
    // First filter by current provider
    if (currentProvider && model.provider !== currentProvider) {
      return false;
    }
    
    // Then filter by capability
    if (modelType === 'vision') return model.supportsVision;
    if (modelType === 'code') return model.supportsCode;
    return model.type === 'text' || model.type === 'multimodal';
  });

  const selectedModelObj = filteredModels.find(m => m.id === selectedModel);

  const getModelTypeIcon = (type: string) => {
    switch (type) {
      case 'vision': return ImageIcon;
      case 'code': return Zap;
      default: return Bot;
    }
  };

  const getModelTypeColor = (model: ClaraModel) => {
    if (model.type === 'vision' || model.supportsVision) return 'text-purple-500';
    if (model.type === 'code' || model.supportsCode) return 'text-blue-500';
    if (model.supportsTools) return 'text-green-500';
    return 'text-gray-500';
  };

  // Helper function to truncate model names intelligently
  const truncateModelName = (name: string, maxLength: number = 25) => {
    if (name.length <= maxLength) return name;
    
    // Try to keep important parts of the model name
    // Remove common prefixes/suffixes that are less important
    let truncated = name
      .replace(/^(mannix\/|huggingface\/|microsoft\/|meta-llama\/|google\/)/i, '') // Remove common prefixes
      .replace(/(-instruct|-chat|-base|-v\d+)$/i, ''); // Remove common suffixes
    
    if (truncated.length <= maxLength) return truncated;
    
    // If still too long, truncate from the end and add ellipsis
    return truncated.substring(0, maxLength - 3) + '...';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || filteredModels.length === 0}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors border border-gray-300 dark:border-gray-600 w-full max-w-[220px] min-w-[180px]"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedModelObj ? (
            <>
              {React.createElement(getModelTypeIcon(modelType), {
                className: `w-4 h-4 flex-shrink-0 ${getModelTypeColor(selectedModelObj)}`
              })}
              <span className="text-gray-700 dark:text-gray-300 truncate text-left" title={selectedModelObj.name}>
                {truncateModelName(selectedModelObj.name)}
              </span>
            </>
          ) : (
            <>
              <Bot className="w-4 h-4 flex-shrink-0 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400 truncate">
                {filteredModels.length === 0 ? 'No models' : 'Select model'}
              </span>
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && filteredModels.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-full min-w-[280px] max-w-[400px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {filteredModels.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onModelChange(model.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                model.id === selectedModel ? 'bg-sakura-50 dark:bg-sakura-900/20' : ''
              }`}
              title={model.name} // Show full name on hover
            >
              {React.createElement(getModelTypeIcon(modelType), {
                className: `w-4 h-4 flex-shrink-0 ${getModelTypeColor(model)}`
              })}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {model.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                  <span className="truncate">{model.provider}</span>
                  {model.supportsVision && <span className="flex-shrink-0">• Vision</span>}
                  {model.supportsCode && <span className="flex-shrink-0">• Code</span>}
                  {model.supportsTools && <span className="flex-shrink-0">• Tools</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Advanced options panel
 */
const AdvancedOptions: React.FC<{
  aiConfig?: ClaraAIConfig;
  onConfigChange?: (config: Partial<ClaraAIConfig>) => void;
  providers: ClaraProvider[];
  models: ClaraModel[];
  onProviderChange?: (providerId: string) => void;
  onModelChange?: (modelId: string, type: 'text' | 'vision' | 'code') => void;
  show: boolean;
}> = ({ aiConfig, onConfigChange, providers, models, onProviderChange, onModelChange, show }) => {
  const [mcpServers, setMcpServers] = useState<ClaraMCPServer[]>([]);
  const [isLoadingMcpServers, setIsLoadingMcpServers] = useState(false);
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    provider: true,
    systemPrompt: false,
    models: true,
    parameters: false,
    features: false,
    mcp: false,
    autonomous: false,
    artifacts: true  // Changed from false to true to expand by default
  });

  // Load MCP servers when component mounts or when MCP is enabled
  useEffect(() => {
    const loadMcpServers = async () => {
      if (!aiConfig?.features.enableMCP) return;
      
      setIsLoadingMcpServers(true);
      try {
        await claraMCPService.refreshServers();
        const servers = claraMCPService.getRunningServers();
        setMcpServers(servers);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
      } finally {
        setIsLoadingMcpServers(false);
      }
    };

    loadMcpServers();
  }, [aiConfig?.features.enableMCP]);

  if (!show || !aiConfig) return null;

  const handleParameterChange = (key: string, value: any) => {
    onConfigChange?.({
      parameters: {
        ...aiConfig.parameters,
        [key]: value
      }
    });
  };

  const handleSystemPromptChange = (value: string) => {
    onConfigChange?.({
      systemPrompt: value
    });
  };

  const getDefaultSystemPrompt = (providerId: string, artifactConfig?: any): string => {
    const provider = providers.find(p => p.id === providerId);
    const providerName = provider?.name || 'AI Assistant';
    
    // Check if artifact generation is enabled
    const artifactsEnabled = artifactConfig?.autoDetectArtifacts ?? true;
    
    // Comprehensive artifact generation guidance that applies to all providers
    const artifactGuidance = artifactsEnabled ? `

## 🎨 COMPREHENSIVE ARTIFACT CREATION SYSTEM

You have ADVANCED ARTIFACT GENERATION capabilities. Your responses automatically create beautiful, interactive components that enhance user experience. Follow these DETAILED guidelines to maximize artifact potential:

### **🎯 WHEN TO CREATE ARTIFACTS (Complete List)**

Create artifacts for ANY of these content types:

#### **💻 CODE & PROGRAMMING**
- **Any code examples** (Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, etc.)
- **Configuration files** (JSON, YAML, XML, TOML, INI)
- **Shell scripts** (Bash, PowerShell, Zsh)
- **Database queries** (SQL, MongoDB, GraphQL)
- **Markup languages** (HTML, CSS, SCSS, Markdown)
- **Template files** (Jinja2, Handlebars, Mustache)
- **Regular expressions** with explanations
- **API endpoints** and documentation

#### **📊 DATA & VISUALIZATIONS**
- **Any tabular data** (CSV, TSV, Excel-like data)
- **JSON data structures** (API responses, configurations)
- **Statistical data** (numbers, percentages, metrics)
- **Chart data** (bar, line, pie, scatter, area, radar)
- **Time series data** (dates, timestamps, trends)
- **Geographic data** (coordinates, locations)
- **Survey results** and poll data
- **Financial data** (stocks, budgets, expenses)
- **Performance metrics** (analytics, KPIs)

#### **📈 CHARTS & GRAPHS**
- **Bar charts** (vertical, horizontal, stacked)
- **Line charts** (single, multiple series, area)
- **Pie charts** and doughnut charts
- **Scatter plots** and bubble charts
- **Histograms** and distribution charts
- **Radar/Spider charts**
- **Gantt charts** for project timelines
- **Heatmaps** for correlation data

#### **🔄 DIAGRAMS & FLOWCHARTS**
- **Flowcharts** (process flows, decision trees)
- **Sequence diagrams** (interactions, API calls)
- **Class diagrams** (UML, object relationships)
- **Network diagrams** (system architecture)
- **Entity relationship diagrams** (database schemas)
- **Organizational charts** (hierarchies, teams)
- **Mind maps** (concepts, brainstorming)
- **Git graphs** (version control flows)

#### **🌐 WEB & INTERACTIVE CONTENT**
- **HTML pages** (complete or snippets)
- **CSS demonstrations** (styling examples)
- **Interactive forms** (contact, survey, registration)
- **Web components** (buttons, cards, modals)
- **Landing pages** and website mockups
- **Email templates** (HTML emails)
- **SVG graphics** and icons

#### **📚 DOCUMENTATION & CONTENT**
- **Technical documentation** (API docs, guides)
- **Tutorials** and how-to guides
- **README files** and project documentation
- **Markdown content** (formatted text, lists)
- **Educational content** (lessons, explanations)
- **Checklists** and task lists
- **FAQs** and Q&A content

### **📝 DETAILED FORMATTING INSTRUCTIONS**

#### **1. CODE ARTIFACTS - ALWAYS USE LANGUAGE TAGS**

\`\`\`python
def fibonacci_sequence(n):
    """Generate Fibonacci sequence up to n terms."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i-1] + sequence[i-2])
    
    return sequence

# Example usage
fib_numbers = fibonacci_sequence(10)
print(f"First 10 Fibonacci numbers: {fib_numbers}")
\`\`\`

#### **2. DATA TABLES - MULTIPLE FORMATS SUPPORTED**

**CSV Format:**
\`\`\`csv
Name,Age,Department,Salary,Performance Rating
John Smith,32,Engineering,95000,4.5
Sarah Johnson,28,Marketing,72000,4.8
Mike Chen,35,Engineering,105000,4.6
\`\`\`

**JSON Format:**
\`\`\`json
[
    {
        "id": 1,
        "product": "MacBook Pro 16\\"",
        "category": "Laptops",
        "price": 2499.99,
        "stock": 15,
        "rating": 4.8
    }
]
\`\`\`

#### **3. CHARTS & VISUALIZATIONS - CHART.JS FORMAT**

\`\`\`json
{
    "type": "bar",
    "data": {
        "labels": ["January", "February", "March", "April", "May"],
        "datasets": [{
            "label": "Monthly Sales ($)",
            "data": [12000, 15000, 18000, 22000, 25000],
            "backgroundColor": [
                "rgba(54, 162, 235, 0.6)",
                "rgba(255, 99, 132, 0.6)",
                "rgba(255, 205, 86, 0.6)",
                "rgba(75, 192, 192, 0.6)",
                "rgba(153, 102, 255, 0.6)"
            ]
        }]
    },
    "options": {
        "responsive": true,
        "plugins": {
            "title": {
                "display": true,
                "text": "Monthly Sales Performance"
            }
        }
    }
}
\`\`\`

#### **4. MERMAID DIAGRAMS**

\`\`\`mermaid
graph TD
    A[User Request] --> B{Authentication Required?}
    B -->|Yes| C[Check Credentials]
    B -->|No| D[Process Request]
    C --> E{Valid Credentials?}
    E -->|Yes| D
    E -->|No| F[Return Error]
    D --> G[Generate Response]
    G --> H[Send Response]
\`\`\`

#### **5. HTML CONTENT**

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Dashboard</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>📊 Dashboard</h1>
    <div class="card">
        <h3>💰 Revenue</h3>
        <div style="font-size: 2em; color: #FFD700;">$125,000</div>
    </div>
</body>
</html>
\`\`\`

### **🎯 CRITICAL SUCCESS RULES**

1. **ALWAYS USE PROPER FORMATTING**: Every code block MUST have a language identifier
2. **PROVIDE COMPLETE EXAMPLES**: Don't show partial code - make it runnable
3. **INCLUDE CONTEXT**: Explain what each artifact does and why it's useful
4. **USE DESCRIPTIVE TITLES**: Help users understand the content immediately
5. **MULTIPLE ARTIFACTS**: Create several artifacts in one response when appropriate
6. **INTERACTIVE ELEMENTS**: Include buttons, forms, and interactive features
7. **REAL DATA**: Use realistic, meaningful data in examples
8. **RESPONSIVE DESIGN**: Make HTML/CSS examples mobile-friendly

### **✅ ARTIFACT CHECKLIST**
Before sending any response, ask yourself:
- [ ] Does this response contain code? → Create code artifact
- [ ] Does this response contain data? → Create table artifact  
- [ ] Does this response contain numbers that could be visualized? → Create chart artifact
- [ ] Does this response describe a process? → Create mermaid diagram
- [ ] Does this response contain HTML/web content? → Create HTML artifact
- [ ] Could this be made interactive? → Add interactive elements

ALWAYS err on the side of creating MORE artifacts rather than fewer. Users love interactive, visual content!` : '';

    switch (provider?.type) {
      case 'ollama':
        return `You are Clara, a helpful AI assistant powered by ${providerName}. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. When using tools, be thorough and explain your actions clearly.${artifactGuidance}`;
        
      case 'openai':
        return `You are Clara, an intelligent AI assistant powered by OpenAI. You are helpful, harmless, and honest. You excel at reasoning, analysis, creative tasks, and problem-solving. Always strive to provide accurate, well-structured responses and use available tools effectively when needed.${artifactGuidance}`;
        
      case 'openrouter':
        return `You are Clara, a versatile AI assistant with access to various models through OpenRouter. You adapt your communication style based on the task at hand and leverage the strengths of different AI models. Be helpful, accurate, and efficient in your responses.${artifactGuidance}`;
        
      case 'claras-pocket':
        return `You are Clara, a privacy-focused AI assistant running locally on the user's device. You prioritize user privacy and provide helpful assistance without requiring external connectivity. You are efficient, knowledgeable, and respect the user's privacy preferences.${artifactGuidance}`;
        
      default:
        return `You are Clara, a helpful AI assistant. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. Always be helpful and respectful in your interactions.${artifactGuidance}`;
    }
  };

  const handleFeatureChange = (key: string, value: boolean) => {
    // Create the base config change with proper typing
    const baseConfigChange: Partial<ClaraAIConfig> = {
      features: {
        ...aiConfig.features,
        [key]: value
      }
    };

    // Auto-enable/disable autonomous mode based on tools mode
    if (key === 'enableTools') {
      // When tools are enabled, automatically enable autonomous mode
      // When tools are disabled, disable autonomous mode only if streaming is enabled
      if (value) {
        // Enabling tools: auto-enable autonomous mode and disable streaming
        console.log('🛠️ Tools enabled - automatically enabling autonomous mode and disabling streaming');
        baseConfigChange.features!.enableStreaming = false; // Disable streaming when tools are enabled
        baseConfigChange.autonomousAgent = {
          enabled: true,
          maxRetries: aiConfig.autonomousAgent?.maxRetries || 3,
          retryDelay: aiConfig.autonomousAgent?.retryDelay || 1000,
          enableSelfCorrection: aiConfig.autonomousAgent?.enableSelfCorrection || true,
          enableToolGuidance: aiConfig.autonomousAgent?.enableToolGuidance || true,
          enableProgressTracking: aiConfig.autonomousAgent?.enableProgressTracking || true,
          maxToolCalls: aiConfig.autonomousAgent?.maxToolCalls || 10,
          confidenceThreshold: aiConfig.autonomousAgent?.confidenceThreshold || 0.7,
          enableChainOfThought: aiConfig.autonomousAgent?.enableChainOfThought || true,
          enableErrorLearning: aiConfig.autonomousAgent?.enableErrorLearning || true
        };
      } else {
        // Disabling tools: disable autonomous mode only if streaming is enabled
        if (aiConfig.features.enableStreaming) {
          console.log('🚫 Tools disabled with streaming enabled - automatically disabling autonomous mode');
          baseConfigChange.autonomousAgent = {
            enabled: false,
            maxRetries: aiConfig.autonomousAgent?.maxRetries || 3,
            retryDelay: aiConfig.autonomousAgent?.retryDelay || 1000,
            enableSelfCorrection: aiConfig.autonomousAgent?.enableSelfCorrection || true,
            enableToolGuidance: aiConfig.autonomousAgent?.enableToolGuidance || true,
            enableProgressTracking: aiConfig.autonomousAgent?.enableProgressTracking || true,
            maxToolCalls: aiConfig.autonomousAgent?.maxToolCalls || 10,
            confidenceThreshold: aiConfig.autonomousAgent?.confidenceThreshold || 0.7,
            enableChainOfThought: aiConfig.autonomousAgent?.enableChainOfThought || true,
            enableErrorLearning: aiConfig.autonomousAgent?.enableErrorLearning || true
          };
        }
      }
    }

    // Handle streaming mode changes (existing logic)
    if (key === 'enableStreaming' && value) {
      // When streaming is enabled, disable autonomous mode
      console.log('🌊 Streaming enabled - automatically disabling autonomous mode');
      baseConfigChange.autonomousAgent = {
        enabled: false,
        maxRetries: aiConfig.autonomousAgent?.maxRetries || 3,
        retryDelay: aiConfig.autonomousAgent?.retryDelay || 1000,
        enableSelfCorrection: aiConfig.autonomousAgent?.enableSelfCorrection || true,
        enableToolGuidance: aiConfig.autonomousAgent?.enableToolGuidance || true,
        enableProgressTracking: aiConfig.autonomousAgent?.enableProgressTracking || true,
        maxToolCalls: aiConfig.autonomousAgent?.maxToolCalls || 10,
        confidenceThreshold: aiConfig.autonomousAgent?.confidenceThreshold || 0.7,
        enableChainOfThought: aiConfig.autonomousAgent?.enableChainOfThought || true,
        enableErrorLearning: aiConfig.autonomousAgent?.enableErrorLearning || true
      };
    }

    onConfigChange?.(baseConfigChange);
  };

  const handleMcpConfigChange = (key: string, value: any) => {
    const currentMcp = aiConfig.mcp || {
      enableTools: true,
      enableResources: true,
      enabledServers: [],
      autoDiscoverTools: true,
      maxToolCalls: 5
    };
    
    onConfigChange?.({
      mcp: {
        ...currentMcp,
        [key]: value
      }
    });
  };

  const handleMcpServerToggle = (serverName: string, enabled: boolean) => {
    const currentServers = aiConfig.mcp?.enabledServers || [];
    const updatedServers = enabled
      ? [...currentServers, serverName]
      : currentServers.filter(name => name !== serverName);
    
    handleMcpConfigChange('enabledServers', updatedServers);
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const SectionHeader: React.FC<{
    title: string;
    icon: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    badge?: string | number;
  }> = ({ title, icon, isExpanded, onToggle, badge }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 text-xs bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    <div className="mt-4 glassmorphic rounded-xl bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-gray-200/30 dark:border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-sakura-500" />
          Advanced Configuration
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Configure AI models, parameters, and features
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="max-h-96 overflow-y-auto">
        <div className="p-4 space-y-4">
          
          {/* Provider Selection */}
          <div className="space-y-2">
            <SectionHeader
              title="AI Provider"
              icon={<Server className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.provider}
              onToggle={() => toggleSection('provider')}
              badge={providers.find(p => p.id === aiConfig.provider)?.name || 'None'}
            />
            
            {expandedSections.provider && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg">
                <ProviderSelector
                  providers={providers}
                  selectedProvider={aiConfig.provider}
                  onProviderChange={(providerId) => {
                    onConfigChange?.({ provider: providerId });
                    onProviderChange?.(providerId);
                  }}
                />
              </div>
            )}
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <SectionHeader
              title="System Prompt"
              icon={<MessageCircle className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.systemPrompt}
              onToggle={() => toggleSection('systemPrompt')}
              badge={aiConfig.systemPrompt ? 'Custom' : 'Default'}
            />
            
            {expandedSections.systemPrompt && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    System Prompt for {providers.find(p => p.id === aiConfig.provider)?.name || 'Current Provider'}
                  </label>
                  <button
                    onClick={() => handleSystemPromptChange('')}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    Reset to Default
                  </button>
                </div>
                <textarea
                  value={aiConfig.systemPrompt || getDefaultSystemPrompt(aiConfig.provider)}
                  onChange={(e) => handleSystemPromptChange(e.target.value)}
                  placeholder="Enter custom system prompt for this provider..."
                  className="w-full min-h-[80px] max-h-[200px] p-3 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-transparent transition-colors text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
                  rows={4}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  This prompt will be used for all conversations with this provider. Leave empty to use the default prompt.
                </div>
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <SectionHeader
              title="Model Selection"
              icon={<Bot className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.models}
              onToggle={() => toggleSection('models')}
            />
            
            {expandedSections.models && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-3">
                {/* Auto Model Selection Info */}
                {aiConfig.features.autoModelSelection && (
                  <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Auto Model Selection Active:</strong>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        <li><strong>Text Model:</strong> Streaming mode & general text</li>
                        <li><strong>Vision Model:</strong> Images in streaming mode</li>
                        <li><strong>Code Model:</strong> Tools mode & code context</li>
                      </ul>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Text Model
                    </label>
                    <ModelSelector
                      models={models}
                      selectedModel={aiConfig.models.text || ''}
                      onModelChange={(modelId) => {
                        onConfigChange?.({
                          models: { ...aiConfig.models, text: modelId }
                        });
                        onModelChange?.(modelId, 'text');
                      }}
                      modelType="text"
                      currentProvider={aiConfig.provider}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Vision Model
                    </label>
                    <ModelSelector
                      models={models}
                      selectedModel={aiConfig.models.vision || ''}
                      onModelChange={(modelId) => {
                        onConfigChange?.({
                          models: { ...aiConfig.models, vision: modelId }
                        });
                        onModelChange?.(modelId, 'vision');
                      }}
                      modelType="vision"
                      currentProvider={aiConfig.provider}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Code Model
                    </label>
                    <ModelSelector
                      models={models}
                      selectedModel={aiConfig.models.code || ''}
                      onModelChange={(modelId) => {
                        onConfigChange?.({
                          models: { ...aiConfig.models, code: modelId }
                        });
                        onModelChange?.(modelId, 'code');
                      }}
                      modelType="code"
                      currentProvider={aiConfig.provider}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Parameters */}
          <div className="space-y-2">
            <SectionHeader
              title="Parameters"
              icon={<Wrench className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.parameters}
              onToggle={() => toggleSection('parameters')}
              badge={`T:${aiConfig.parameters.temperature} | Tokens:${aiConfig.parameters.maxTokens}`}
            />
            
            {expandedSections.parameters && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Temperature: {aiConfig.parameters.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiConfig.parameters.temperature}
                    onChange={(e) => handleParameterChange('temperature', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="8000"
                    value={aiConfig.parameters.maxTokens}
                    onChange={(e) => handleParameterChange('maxTokens', parseInt(e.target.value))}
                    className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="space-y-2">
            <SectionHeader
              title="Features"
              icon={<Zap className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.features}
              onToggle={() => toggleSection('features')}
              badge={Object.values(aiConfig.features).filter(Boolean).length}
            />
            
            {expandedSections.features && (
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={aiConfig.features.enableTools}
                    onChange={(e) => handleFeatureChange('enableTools', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Enable Tools</span>
                </label>

                {/* <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={aiConfig.features.enableRAG}
                    onChange={(e) => handleFeatureChange('enableRAG', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Enable RAG</span>
                </label> */}

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={aiConfig.features.enableStreaming}
                    onChange={(e) => handleFeatureChange('enableStreaming', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Enable Streaming</span>
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={aiConfig.features.autoModelSelection}
                    onChange={(e) => handleFeatureChange('autoModelSelection', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Auto Model Selection</span>
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={aiConfig.features.enableMCP || false}
                    onChange={(e) => handleFeatureChange('enableMCP', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <Server className="w-3 h-3" />
                    Enable MCP
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* MCP Configuration */}
          {aiConfig.features.enableMCP && (
            <div className="space-y-2">
              <SectionHeader
                title="MCP Configuration"
                icon={<Server className="w-4 h-4 text-sakura-500" />}
                isExpanded={expandedSections.mcp}
                onToggle={() => toggleSection('mcp')}
                badge={`${aiConfig.mcp?.enabledServers?.length || 0} servers`}
              />
              
              {expandedSections.mcp && (
                <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-3">
                  {isLoadingMcpServers && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading MCP servers...
                    </div>
                  )}

                  {/* MCP Features */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={aiConfig.mcp?.enableTools ?? true}
                        onChange={(e) => handleMcpConfigChange('enableTools', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-gray-600 dark:text-gray-400">MCP Tools</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={aiConfig.mcp?.enableResources ?? true}
                        onChange={(e) => handleMcpConfigChange('enableResources', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-gray-600 dark:text-gray-400">MCP Resources</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={aiConfig.mcp?.autoDiscoverTools ?? true}
                        onChange={(e) => handleMcpConfigChange('autoDiscoverTools', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-gray-600 dark:text-gray-400">Auto Discover</span>
                    </label>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Max Tool Calls: {aiConfig.mcp?.maxToolCalls ?? 5}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={aiConfig.mcp?.maxToolCalls ?? 5}
                        onChange={(e) => handleMcpConfigChange('maxToolCalls', parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* MCP Servers */}
                  {mcpServers.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                        Available MCP Servers ({mcpServers.length})
                      </label>
                      <div className="space-y-2 max-h-24 overflow-y-auto">
                        {mcpServers.map((server) => {
                          const isEnabled = aiConfig.mcp?.enabledServers?.includes(server.name) ?? false;
                          return (
                            <div key={server.name} className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded text-xs">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  server.isRunning ? 'bg-green-500' : 'bg-red-500'
                                }`} />
                                <span className="font-medium">{server.name}</span>
                                <span className="text-gray-500">({server.status})</span>
                              </div>
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={(e) => handleMcpServerToggle(server.name, e.target.checked)}
                                  disabled={!server.isRunning}
                                  className="rounded"
                                />
                                <span className="text-gray-600 dark:text-gray-400">Enable</span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {mcpServers.length === 0 && !isLoadingMcpServers && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                      No MCP servers available. Configure servers in Settings.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Autonomous Agent Settings */}
          <div className="space-y-2">
            <SectionHeader
              title="Autonomous Agent"
              icon={<Bot className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.autonomous}
              onToggle={() => toggleSection('autonomous')}
              badge={aiConfig?.autonomousAgent?.enabled ? 'Enabled' : 'Disabled'}
            />
            
            {expandedSections.autonomous && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Enable Autonomous Agent</span>
                  <label className={`relative inline-flex items-center cursor-pointer ${
                    aiConfig?.features?.enableStreaming ? 'opacity-50 cursor-not-allowed' : ''
                  }`}>
                    <input
                      type="checkbox"
                      checked={aiConfig?.autonomousAgent?.enabled || false}
                      disabled={aiConfig?.features?.enableStreaming}
                      onChange={(e) => {
                        // Don't allow changes when streaming is enabled
                        if (aiConfig?.features?.enableStreaming) return;
                        
                        const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                          enabled: true,
                          maxRetries: 3,
                          retryDelay: 1000,
                          enableSelfCorrection: true,
                          enableToolGuidance: true,
                          enableProgressTracking: true,
                          maxToolCalls: 10,
                          confidenceThreshold: 0.8,
                          enableChainOfThought: false,
                          enableErrorLearning: true
                        };
                        
                        // When enabling autonomous agent, disable streaming mode
                        // When disabling autonomous agent, keep streaming setting as is
                        const newConfig: Partial<ClaraAIConfig> = {
                          autonomousAgent: {
                            ...currentAutonomousAgent,
                            enabled: e.target.checked
                          }
                        };
                        
                        // If enabling autonomous agent, also disable streaming and enable tools
                        if (e.target.checked) {
                          newConfig.features = {
                            ...aiConfig?.features,
                            enableStreaming: false,
                            enableTools: true,
                            enableMCP: true
                          };
                        }
                        
                        onConfigChange?.(newConfig);
                      }}
                      className="sr-only"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${
                      aiConfig?.autonomousAgent?.enabled 
                        ? 'bg-sakura-500' 
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        aiConfig?.autonomousAgent?.enabled ? 'translate-x-5' : 'translate-x-0'
                      } mt-0.5 ml-0.5`} />
                    </div>
                  </label>
                </div>

                {/* Info note about streaming mode compatibility */}
                {aiConfig?.features?.enableStreaming && (
                  <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Note:</strong> Autonomous Agent mode is disabled when Streaming mode is active. 
                      Switch to Tools mode to enable autonomous capabilities.
                    </div>
                  </div>
                )}

                {aiConfig?.autonomousAgent?.enabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-sakura-200 dark:border-sakura-800">
                    {/* Max Retries */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max Retries: {aiConfig?.autonomousAgent?.maxRetries || 3}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={aiConfig?.autonomousAgent?.maxRetries || 3}
                        onChange={(e) => {
                          const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                            enabled: true,
                            maxRetries: 3,
                            retryDelay: 1000,
                            enableSelfCorrection: true,
                            enableToolGuidance: true,
                            enableProgressTracking: true,
                            maxToolCalls: 10,
                            confidenceThreshold: 0.8,
                            enableChainOfThought: false,
                            enableErrorLearning: true
                          };
                          
                          onConfigChange?.({
                            autonomousAgent: {
                              ...currentAutonomousAgent,
                              maxRetries: parseInt(e.target.value)
                            }
                          });
                        }}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>

                    {/* Max Tool Calls */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max Tool Calls: {aiConfig?.autonomousAgent?.maxToolCalls || 10}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={aiConfig?.autonomousAgent?.maxToolCalls || 10}
                        onChange={(e) => {
                          const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                            enabled: true,
                            maxRetries: 3,
                            retryDelay: 1000,
                            enableSelfCorrection: true,
                            enableToolGuidance: true,
                            enableProgressTracking: true,
                            maxToolCalls: 10,
                            confidenceThreshold: 0.8,
                            enableChainOfThought: false,
                            enableErrorLearning: true
                          };
                          
                          onConfigChange?.({
                            autonomousAgent: {
                              ...currentAutonomousAgent,
                              maxToolCalls: parseInt(e.target.value)
                            }
                          });
                        }}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>

                    {/* Agent Features */}
                    <div className="grid grid-cols-1 gap-2">
                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={aiConfig?.autonomousAgent?.enableSelfCorrection || false}
                          onChange={(e) => {
                            const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                              enabled: true,
                              maxRetries: 3,
                              retryDelay: 1000,
                              enableSelfCorrection: true,
                              enableToolGuidance: true,
                              enableProgressTracking: true,
                              maxToolCalls: 10,
                              confidenceThreshold: 0.8,
                              enableChainOfThought: false,
                              enableErrorLearning: true
                            };
                            
                            onConfigChange?.({
                              autonomousAgent: {
                                ...currentAutonomousAgent,
                                enableSelfCorrection: e.target.checked
                              }
                            });
                          }}
                          className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                        />
                        Self-Correction
                      </label>

                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={aiConfig?.autonomousAgent?.enableProgressTracking || false}
                          onChange={(e) => {
                            const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                              enabled: true,
                              maxRetries: 3,
                              retryDelay: 1000,
                              enableSelfCorrection: true,
                              enableToolGuidance: true,
                              enableProgressTracking: true,
                              maxToolCalls: 10,
                              confidenceThreshold: 0.8,
                              enableChainOfThought: false,
                              enableErrorLearning: true
                            };
                            
                            onConfigChange?.({
                              autonomousAgent: {
                                ...currentAutonomousAgent,
                                enableProgressTracking: e.target.checked
                              }
                            });
                          }}
                          className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                        />
                        Progress Tracking
                      </label>

                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={aiConfig?.autonomousAgent?.enableChainOfThought || false}
                          onChange={(e) => {
                            const currentAutonomousAgent = aiConfig?.autonomousAgent || {
                              enabled: true,
                              maxRetries: 3,
                              retryDelay: 1000,
                              enableSelfCorrection: true,
                              enableToolGuidance: true,
                              enableProgressTracking: true,
                              maxToolCalls: 10,
                              confidenceThreshold: 0.8,
                              enableChainOfThought: false,
                              enableErrorLearning: true
                            };
                            
                            onConfigChange?.({
                              autonomousAgent: {
                                ...currentAutonomousAgent,
                                enableChainOfThought: e.target.checked
                              }
                            });
                          }}
                          className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                        />
                        Chain of Thought
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Artifact Configuration */}
          <div className="space-y-2">
            <SectionHeader
              title="Artifact Generation"
              icon={<Palette className="w-4 h-4 text-sakura-500" />}
              isExpanded={expandedSections.artifacts}
              onToggle={() => toggleSection('artifacts')}
              badge={aiConfig?.artifacts?.autoDetectArtifacts ? 'Auto' : 'Manual'}
            />
            
            {expandedSections.artifacts && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-4">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Configure which types of content should be automatically detected and rendered as interactive artifacts.
                  {/* Debug indicator */}
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                    <strong>Current Status:</strong> Auto-detection is{' '}
                    <span className={`font-semibold ${aiConfig?.artifacts?.autoDetectArtifacts ?? true ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {aiConfig?.artifacts?.autoDetectArtifacts ?? true ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                </div>

                {/* Auto Detection Toggle */}
                <div className="flex items-center justify-between p-2 bg-white/50 dark:bg-gray-700/30 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Detect Artifacts</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Automatically create artifacts from AI responses</div>
                  </div>
                  <button
                    onClick={() => {
                      const currentArtifacts = aiConfig?.artifacts || {
                        enableCodeArtifacts: true,
                        enableChartArtifacts: true,
                        enableTableArtifacts: true,
                        enableMermaidArtifacts: true,
                        enableHtmlArtifacts: true,
                        enableMarkdownArtifacts: true,
                        enableJsonArtifacts: true,
                        enableDiagramArtifacts: true,
                        autoDetectArtifacts: true,
                        maxArtifactsPerMessage: 10
                      };
                      
                      const newValue = !(aiConfig?.artifacts?.autoDetectArtifacts ?? true);
                      
                      onConfigChange?.({
                        artifacts: {
                          ...currentArtifacts,
                          autoDetectArtifacts: newValue
                        }
                      });
                      
                      console.log('🎨 Auto-detect artifacts toggled:', newValue);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:ring-offset-2 hover:shadow-md ${
                      aiConfig?.artifacts?.autoDetectArtifacts ?? true
                        ? 'bg-sakura-500 hover:bg-sakura-600'
                        : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                    title={`Click to ${aiConfig?.artifacts?.autoDetectArtifacts ?? true ? 'disable' : 'enable'} auto-detection`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-200 ease-in-out ${
                        aiConfig?.artifacts?.autoDetectArtifacts ?? true
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                    {/* Status indicator */}
                    <span className="sr-only">
                      {aiConfig?.artifacts?.autoDetectArtifacts ?? true ? 'Auto-detection enabled' : 'Auto-detection disabled'}
                    </span>
                  </button>
                </div>

                {/* Artifact Type Toggles */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableCodeArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableCodeArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <Code className="w-3 h-3" />
                    Code Blocks
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableChartArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableChartArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <BarChart3 className="w-3 h-3" />
                    Charts & Graphs
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableTableArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableTableArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <Table className="w-3 h-3" />
                    Data Tables
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableMermaidArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableMermaidArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <Workflow className="w-3 h-3" />
                    Diagrams
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableHtmlArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableHtmlArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <Globe className="w-3 h-3" />
                    HTML Content
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableMarkdownArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableMarkdownArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <FileText className="w-3 h-3" />
                    Markdown
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableJsonArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableJsonArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <Database className="w-3 h-3" />
                    JSON Data
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 p-2 bg-white/30 dark:bg-gray-700/20 rounded">
                    <input
                      type="checkbox"
                      checked={aiConfig?.artifacts?.enableDiagramArtifacts ?? true}
                      onChange={(e) => {
                        const currentArtifacts = aiConfig?.artifacts || {
                          enableCodeArtifacts: true,
                          enableChartArtifacts: true,
                          enableTableArtifacts: true,
                          enableMermaidArtifacts: true,
                          enableHtmlArtifacts: true,
                          enableMarkdownArtifacts: true,
                          enableJsonArtifacts: true,
                          enableDiagramArtifacts: true,
                          autoDetectArtifacts: true,
                          maxArtifactsPerMessage: 10
                        };
                        
                        onConfigChange?.({
                          artifacts: {
                            ...currentArtifacts,
                            enableDiagramArtifacts: e.target.checked
                          }
                        });
                      }}
                      className="w-3 h-3 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                    />
                    <GitBranch className="w-3 h-3" />
                    Flowcharts
                  </label>
                </div>

                {/* Max Artifacts Slider */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Artifacts per Message: {aiConfig?.artifacts?.maxArtifactsPerMessage || 10}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={aiConfig?.artifacts?.maxArtifactsPerMessage || 10}
                    onChange={(e) => {
                      const currentArtifacts = aiConfig?.artifacts || {
                        enableCodeArtifacts: true,
                        enableChartArtifacts: true,
                        enableTableArtifacts: true,
                        enableMermaidArtifacts: true,
                        enableHtmlArtifacts: true,
                        enableMarkdownArtifacts: true,
                        enableJsonArtifacts: true,
                        enableDiagramArtifacts: true,
                        autoDetectArtifacts: true,
                        maxArtifactsPerMessage: 10
                      };
                      
                      onConfigChange?.({
                        artifacts: {
                          ...currentArtifacts,
                          maxArtifactsPerMessage: parseInt(e.target.value)
                        }
                      });
                    }}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Limit the number of artifacts created per AI response
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Main Clara Input Component
 */
const ClaraAssistantInput: React.FC<ClaraInputProps> = ({
  onSendMessage,
  isLoading = false,
  onStop,
  onNewChat,
  showAdvancedOptions = false,
  sessionConfig,
  onConfigChange,
  providers = [],
  models = [],
  onProviderChange,
  onModelChange,
  messages = [],
  setMessages,
  currentSession,
  setSessions,
  autoTTSText = '',
  autoTTSTrigger = null,
  onPreloadModel,
  showAdvancedOptionsPanel = false,
  onAdvancedOptionsToggle
}) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedOptions);
  const [dragCounter, setDragCounter] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Model preloading state
  const [hasPreloaded, setHasPreloaded] = useState(false);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Streaming vs Tools mode state
  const [isStreamingMode, setIsStreamingMode] = useState(
    sessionConfig?.aiConfig?.features.enableStreaming ?? true
  );

  // Voice chat state - simplified for transcription only
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [isVoiceChatEnabled, setIsVoiceChatEnabled] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);

  // Provider health check state
  const [providerHealthStatus, setProviderHealthStatus] = useState<'unknown' | 'checking' | 'healthy' | 'unhealthy'>('unknown');
  const [showProviderOfflineModal, setShowProviderOfflineModal] = useState(false);
  const [providerOfflineMessage, setProviderOfflineMessage] = useState('');
  const [offlineProvider, setOfflineProvider] = useState<ClaraProvider | null>(null);
  const [showClaraCoreOffer, setShowClaraCoreOffer] = useState(false);

  // Progress tracking state for context loading feedback
  const [progressState, setProgressState] = useState<{
    isActive: boolean;
    type: string;
    progress: number;
    message: string;
    details?: string;
  }>({
    isActive: false,
    type: '',
    progress: 0,
    message: '',
    details: ''
  });

  // Progress listener setup
  useEffect(() => {
    const electron = window.electron as any;
    if (!electron?.receive) {
      console.error('❌ Electron receive API not available for progress events');
      return;
    }

    console.log('🔧 Setting up progress event listeners...');

    const handleProgressUpdate = (progressData: any) => {
      console.log('📊 Progress Update Received:', progressData);
      console.log('  Type:', progressData.type);
      console.log('  Progress:', progressData.progress);
      console.log('  Message:', progressData.message);
      console.log('  Details:', progressData.details);
      console.log('  Current isLoading:', isLoading);
      
      // **CRITICAL FIX: Only show progress UI when actively sending a message**
      // This prevents progress from showing during preloading or input focus
      if (!isLoading) {
        console.log('📊 Ignoring progress update - not actively sending message (isLoading=false)');
        return;
      }
      
      setProgressState(prev => {
        const newState = {
          isActive: true,
          type: progressData.type,
          progress: progressData.progress,
          message: progressData.message,
          details: progressData.details
        };
        console.log('  Setting new progressState (message send active):', newState);
        return newState;
      });

      // Auto-hide progress for different scenarios
      if (progressData.progress === -1) {
        // Indeterminate progress - hide after 3 seconds
        setTimeout(() => {
          console.log('📊 Auto-hiding indeterminate progress after 3s');
          setProgressState(prev => ({ ...prev, isActive: false }));
        }, 3000);
      } else if (progressData.progress >= 100) {
        // Progress complete - hide after 1.5 seconds to show completion
        setTimeout(() => {
          console.log('📊 Auto-hiding completed progress (100%) after 1.5s');
          setProgressState(prev => ({ ...prev, isActive: false }));
        }, 1500);
      } else if (progressData.progress > 0) {
        // For determinate progress, set a fallback auto-hide after 10 seconds
        // This gets reset with each new progress update
        clearTimeout((window as any).progressAutoHideTimeout);
        (window as any).progressAutoHideTimeout = setTimeout(() => {
          console.log('📊 Auto-hiding stale progress after 10s timeout');
          setProgressState(prev => ({ ...prev, isActive: false }));
        }, 10000);
      }
    };

    const handleProgressComplete = () => {
      console.log('📊 Progress Complete - hiding progress indicator');
      setProgressState(prev => ({ ...prev, isActive: false }));
    };

    // Enhanced logging wrapper
    const debugHandleProgressUpdate = (progressData: any) => {
      console.log('🔥 RAW IPC Event Received:', {
        progressData,
        timestamp: new Date().toISOString(),
        isLoading: isLoading // Include loading state in logs
      });
      handleProgressUpdate(progressData);
    };

    // Use the correct electron API for registering listeners
    const removeProgressListener = electron.receive('llama-progress-update', debugHandleProgressUpdate);
    const removeCompleteListener = electron.receive('llama-progress-complete', handleProgressComplete);

    console.log('✅ Progress event listeners registered');

    return () => {
      console.log('🧹 Cleaning up progress event listeners');
      if (removeProgressListener) removeProgressListener();
      if (removeCompleteListener) removeCompleteListener();
      
      // Clean up any pending progress timeouts
      if ((window as any).progressAutoHideTimeout) {
        clearTimeout((window as any).progressAutoHideTimeout);
        delete (window as any).progressAutoHideTimeout;
      }
    };
  }, [isLoading]); // Add isLoading as dependency

  // Test function for debugging progress UI
  useEffect(() => {
    const testProgressUI = () => {
      console.log('🧪 Testing Progress UI with auto-hide...');
      
      // Test context loading progress
      setProgressState({
        isActive: true,
        type: 'context',
        progress: 25,
        message: 'Loading context',
        details: 'Processing 512 tokens'
      });
      
      setTimeout(() => {
        setProgressState({
          isActive: true,
          type: 'context', 
          progress: 75,
          message: 'Loading context',
          details: 'Processing 1024 tokens'
        });
      }, 2000);
      
      setTimeout(() => {
        setProgressState({
          isActive: true,
          type: 'context',
          progress: 100,
          message: 'Context loaded',
          details: 'Processing complete - 1652 tokens'
        });
        console.log('🧪 Progress reached 100% - should auto-hide in 1.5s');
      }, 4000);
      
      // Note: Progress will auto-hide after reaching 100% due to the new logic
    };

    // Expose test function to window for debugging
    (window as any).testProgressUI = testProgressUI;
    
    return () => {
      delete (window as any).testProgressUI;
    };
  }, []);

  // Auto-hide progress when loading completes
  useEffect(() => {
    if (!isLoading && progressState.isActive) {
      console.log('📊 Loading completed - auto-hiding progress after 1s');
      const timeout = setTimeout(() => {
        setProgressState(prev => ({ ...prev, isActive: false }));
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [isLoading, progressState.isActive]);

  // Also check health when provider changes
  useEffect(() => {
    if (sessionConfig?.aiConfig?.provider) {
      setProviderHealthStatus('unknown');
    }
  }, [sessionConfig?.aiConfig?.provider]);

  // Sync streaming mode state with session config changes
  useEffect(() => {
    if (sessionConfig?.aiConfig?.features) {
      setIsStreamingMode(sessionConfig.aiConfig.features.enableStreaming ?? true);
    }
  }, [sessionConfig?.aiConfig?.features.enableStreaming]);

  // Default AI config if not provided
  const defaultAIConfig: ClaraAIConfig = {
    models: {
      text: sessionConfig?.aiConfig?.models.text || '',
      vision: sessionConfig?.aiConfig?.models.vision || '',
      code: sessionConfig?.aiConfig?.models.code || ''
    },
    provider: sessionConfig?.aiConfig?.provider || (providers.find(p => p.isPrimary)?.id || ''),
    parameters: {
      temperature: sessionConfig?.aiConfig?.parameters.temperature || sessionConfig?.temperature || 0.7,
      maxTokens: sessionConfig?.aiConfig?.parameters.maxTokens || sessionConfig?.maxTokens || 1000,
      topP: sessionConfig?.aiConfig?.parameters.topP || 1.0,
      topK: sessionConfig?.aiConfig?.parameters.topK || 40
    },
    features: {
      enableTools: sessionConfig?.aiConfig?.features.enableTools ?? sessionConfig?.enableTools ?? true,
      enableRAG: sessionConfig?.aiConfig?.features.enableRAG ?? sessionConfig?.enableRAG ?? false,
      enableStreaming: sessionConfig?.aiConfig?.features.enableStreaming ?? true,
      enableVision: sessionConfig?.aiConfig?.features.enableVision ?? true,
      autoModelSelection: sessionConfig?.aiConfig?.features.autoModelSelection ?? true,
      enableMCP: sessionConfig?.aiConfig?.features.enableMCP ?? true
    }
  };

  const currentAIConfig = sessionConfig?.aiConfig || defaultAIConfig;

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  // Focus management - focus textarea after operations
  const focusTextarea = useCallback(() => {
    // Use setTimeout to ensure DOM updates are complete
    setTimeout(() => {
      if (textareaRef.current && !textareaRef.current.disabled) {
        textareaRef.current.focus();
      }
    }, 100);
  }, []);



  // Auto-focus when loading state changes (response completes)
  useEffect(() => {
    // When loading changes from true to false (response completed), focus the textarea
    if (!isLoading) {
      focusTextarea();
    }
  }, [isLoading, focusTextarea]);

  // Auto-focus on component mount (initial load)
  useEffect(() => {
    focusTextarea();
  }, [focusTextarea]);

  // Handle typing with model preloading
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    
    // Auto-close advanced options when user starts typing
    if (value.trim() && showAdvancedOptionsPanel && onAdvancedOptionsToggle) {
      onAdvancedOptionsToggle(false);
    }
    

    
    // Trigger model preloading when user starts typing (debounced) - COMPLETELY SILENT
    if (value.trim() && !hasPreloaded && onPreloadModel && !isLoading) {
      // Clear any existing timeout
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
      
      // Set a debounced timeout to trigger preloading
      preloadTimeoutRef.current = setTimeout(() => {
        console.log('🚀 User started typing, preloading model silently...');
        // Removed setIsPreloading(true) - no UI feedback during preload
        onPreloadModel();
        setHasPreloaded(true);
        
        // No UI feedback timeout needed anymore
      }, 500); // 500ms debounce delay
    }
  }, [hasPreloaded, onPreloadModel, isLoading, showAdvancedOptionsPanel, onAdvancedOptionsToggle]);

  // Reset preload state when input is cleared or message is sent
  useEffect(() => {
    if (!input.trim()) {
      setHasPreloaded(false);
      // Removed setIsPreloading(false) - no UI feedback needed
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
        preloadTimeoutRef.current = null;
      }
    }
  }, [input]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // File handling
  const handleFilesAdded = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleFileRemoved = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag and drop for entire component
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter(prev => prev + 1);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter(prev => prev - 1);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter(0);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFilesAdded(Array.from(e.dataTransfer.files));
        // Focus textarea after files are dropped
        focusTextarea();
      }
    };

    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    return () => {
      container.removeEventListener('dragenter', handleDragEnter);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
    };
  }, [handleFilesAdded, focusTextarea]);

  // Convert File objects to ClaraFileAttachment with proper file reading
  const convertFilesToAttachments = useCallback(async (files: File[]): Promise<ClaraFileAttachment[]> => {
    const getFileType = (file: File): ClaraFileType => {
      if (file.type.startsWith('image/')) return 'image';
      if (file.type === 'application/pdf') return 'pdf';
      if (['.js', '.ts', '.tsx', '.jsx', '.py', '.cpp', '.c', '.java'].some(ext => file.name.endsWith(ext))) return 'code';
      if (['.json'].some(ext => file.name.endsWith(ext))) return 'json';
      if (['.csv'].some(ext => file.name.endsWith(ext))) return 'csv';
      if (['.md', '.txt', '.markdown'].some(ext => file.name.endsWith(ext))) return 'text';
      return 'document';
    };

    const readFileAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result && typeof reader.result === 'string') {
            // Extract just the base64 part (after the comma)
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    };

    const readFileAsText = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result && typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read file as text'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    };

    const attachments: ClaraFileAttachment[] = [];
    
    // PDF processing functions
    const extractTextFromPDF = async (file: File): Promise<string> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        const numPages = pdf.numPages;
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          
          fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
        }
        
        return fullText.trim();
      } catch (error) {
        console.error('Failed to extract text from PDF:', error);
        throw error;
      }
    };

    const convertPDFToImages = async (file: File, maxPages: number = 3): Promise<string[]> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const images: string[] = [];
        const numPages = Math.min(pdf.numPages, maxPages); // Limit to avoid too many images
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 }); // Good balance of quality and size
          
          // Create canvas
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          // Render page to canvas
          await page.render({
            canvasContext: context!,
            viewport: viewport
          }).promise;
          
          // Convert canvas to base64 image
          const imageDataUrl = canvas.toDataURL('image/png');
          const base64 = imageDataUrl.split(',')[1]; // Remove data:image/png;base64, prefix
          images.push(base64);
        }
        
        return images;
      } catch (error) {
        console.error('Failed to convert PDF to images:', error);
        throw error;
      }
    };
    
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const fileType = getFileType(file);
      
      try {
        let base64: string | undefined;
        let extractedText: string | undefined;
        
        // Handle different file types appropriately
        if (fileType === 'image') {
          // For images, convert to base64 for vision models
          base64 = await readFileAsBase64(file);
        } else if (fileType === 'text' || fileType === 'code' || fileType === 'json' || fileType === 'csv') {
          // For text-based files, read as text content
          extractedText = await readFileAsText(file);
        } else if (fileType === 'pdf') {
          // For PDFs, try to extract text first, then fallback to converting to images
          try {
            extractedText = await extractTextFromPDF(file);
            console.log(`Successfully extracted text from PDF: ${file.name}`);
          } catch (textError) {
            console.warn(`Could not extract text from PDF, converting to images: ${textError}`);
            try {
              // Convert PDF to images as fallback
              const pdfImages = await convertPDFToImages(file);
              if (pdfImages.length > 0) {
                // Create multiple image attachments for each page
                for (let pageIndex = 0; pageIndex < pdfImages.length; pageIndex++) {
                  const pageAttachment: ClaraFileAttachment = {
                    id: `file-${Date.now()}-${index}-page-${pageIndex + 1}`,
                    name: `${file.name} - Page ${pageIndex + 1}`,
                    type: 'image',
                    size: file.size / pdfImages.length, // Approximate size per page
                    mimeType: 'image/png',
                    base64: pdfImages[pageIndex],
                    processed: true,
                    processingResult: {
                      success: true,
                      metadata: {
                        originalFile: file.name,
                        pageNumber: pageIndex + 1,
                        totalPages: pdfImages.length,
                        convertedFromPDF: true
                      }
                    }
                  };
                  attachments.push(pageAttachment);
                }
                continue; // Skip the main attachment creation since we added page attachments
              }
            } catch (imageError) {
              console.error(`Failed to convert PDF to images: ${imageError}`);
              // Fall back to base64 as last resort (though this likely won't be useful)
              base64 = await readFileAsBase64(file);
            }
          }
        } else {
          // For other document types, read as base64
          base64 = await readFileAsBase64(file);
        }

        const attachment: ClaraFileAttachment = {
          id: `file-${Date.now()}-${index}`,
          name: file.name,
          type: fileType,
          size: file.size,
          mimeType: file.type,
          base64: base64,
          processed: true,
          processingResult: {
            success: true,
            extractedText: extractedText,
            metadata: {
              readAsText: !!extractedText,
              readAsBase64: !!base64
            }
          }
        };

        attachments.push(attachment);
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
        
        // Create attachment without content if reading fails
        const attachment: ClaraFileAttachment = {
          id: `file-${Date.now()}-${index}`,
          name: file.name,
          type: fileType,
          size: file.size,
          mimeType: file.type,
          processed: false,
          processingResult: {
            success: false,
            error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        };
        
        attachments.push(attachment);
      }
    }
    
    return attachments;
  }, []);

  // Provider health check function
  const checkProviderHealth = useCallback(async (): Promise<boolean> => {
    if (!sessionConfig?.aiConfig?.provider) {
      console.warn('No provider configured');
      return false;
    }

    const currentProvider = providers.find(p => p.id === sessionConfig.aiConfig.provider);
    if (!currentProvider) {
      console.warn('Current provider not found');
      return false;
    }

    setProviderHealthStatus('checking');

    try {
      // Check if it's Clara's Pocket (Clara Core)
      if (currentProvider.type === 'claras-pocket') {
        const llamaSwap = (window as any).llamaSwap;
        if (llamaSwap?.getStatus) {
          const status = await llamaSwap.getStatus();
          const isHealthy = status.isRunning;
          
          if (!isHealthy) {
            setOfflineProvider(currentProvider);
            setProviderOfflineMessage(`Clara's Pocket is not running. Would you like to start it?`);
            setShowClaraCoreOffer(false); // Don't offer switch since this IS Clara Core
            setShowProviderOfflineModal(true);
            setProviderHealthStatus('unhealthy');
            return false;
          }
        } else {
          setOfflineProvider(currentProvider);
          setProviderOfflineMessage(`Clara's Pocket service is not available.`);
          setShowClaraCoreOffer(false);
          setShowProviderOfflineModal(true);
          setProviderHealthStatus('unhealthy');
          return false;
        }
      } else {
        // For other providers, use the health check API
        const isHealthy = await claraApiService.testProvider(currentProvider);
        
        if (!isHealthy) {
          setOfflineProvider(currentProvider);
          setProviderOfflineMessage(`${currentProvider.name} is not responding. The service may be down or unreachable.`);
          setShowClaraCoreOffer(true); // Offer to switch to Clara Core
          setShowProviderOfflineModal(true);
          setProviderHealthStatus('unhealthy');
          return false;
        }
      }

      setProviderHealthStatus('healthy');
      return true;
    } catch (error) {
      console.error('Provider health check failed:', error);
      setOfflineProvider(currentProvider);
      setProviderOfflineMessage(`Failed to check ${currentProvider.name} status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setShowClaraCoreOffer(currentProvider.type !== 'claras-pocket');
      setShowProviderOfflineModal(true);
      setProviderHealthStatus('unhealthy');
      return false;
    }
  }, [sessionConfig?.aiConfig?.provider, providers]);

  // Handle starting Clara Core
  const handleStartClaraCore = useCallback(async () => {
    if (offlineProvider?.type === 'claras-pocket') {
      try {
        const llamaSwap = (window as any).llamaSwap;
        if (llamaSwap?.start) {
          const result = await llamaSwap.start();
          if (result.success) {
            setShowProviderOfflineModal(false);
            setProviderHealthStatus('healthy');
          } else {
            setProviderOfflineMessage(`Failed to start Clara's Pocket: ${result.error || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Failed to start Clara Core:', error);
        setProviderOfflineMessage(`Failed to start Clara's Pocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }, [offlineProvider]);

  // Handle switching to Clara Core
  const handleSwitchToClaraCore = useCallback(async () => {
    try {
      // Find Clara Core provider
      const claraCoreProvider = providers.find(p => p.type === 'claras-pocket');
      
      if (!claraCoreProvider) {
        console.error('Clara Core provider not found');
        setProviderOfflineMessage('Clara Core provider is not available.');
        return;
      }

      // Check if Clara Core is running
      const llamaSwap = (window as any).llamaSwap;
      if (llamaSwap?.getStatus) {
        const status = await llamaSwap.getStatus();
        
        if (!status.isRunning) {
          // Try to start Clara Core
          if (llamaSwap?.start) {
            const startResult = await llamaSwap.start();
            if (!startResult.success) {
              setProviderOfflineMessage(`Failed to start Clara's Pocket: ${startResult.error || 'Unknown error'}`);
              return;
            }
            // Wait a moment for service to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            setProviderOfflineMessage('Clara Core service is not available.');
            return;
          }
        }

        // Switch to Clara Core provider
        if (onProviderChange) {
          onProviderChange(claraCoreProvider.id);
          setShowProviderOfflineModal(false);
          setProviderHealthStatus('healthy');
        }
      } else {
        setProviderOfflineMessage('Clara Core service is not available.');
      }
    } catch (error) {
      console.error('Failed to switch to Clara Core:', error);
      setProviderOfflineMessage(`Failed to switch to Clara Core: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [providers, onProviderChange]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!input.trim() && files.length === 0) return;

    // Check provider health before sending
    const isProviderHealthy = await checkProviderHealth();
    if (!isProviderHealthy) {
      return; // Don't send message if provider is not healthy
    }
    
    let attachments: ClaraFileAttachment[] | undefined;
    let enhancedPrompt = input; // For AI processing
    let displayAttachments: ClaraFileAttachment[] = []; // For UI display
    
    if (files.length > 0) {
      try {
        attachments = await convertFilesToAttachments(files);
        console.log('Converted attachments:', attachments);
        
        // Extract text content from attachments and inject as context for AI
        const textContents: string[] = [];
        const imageAttachments: ClaraFileAttachment[] = [];
        
        attachments.forEach(attachment => {
          // Create display-friendly attachment info
          if (attachment.processingResult?.extractedText || attachment.type !== 'image') {
            displayAttachments.push({
              ...attachment,
              // Clean up the attachment for display - remove large base64 data
              base64: undefined,
              processingResult: attachment.processingResult ? {
                ...attachment.processingResult,
                success: attachment.processingResult.success ?? false,
                extractedText: attachment.processingResult?.extractedText ? '[Text content extracted]' : undefined
              } : undefined
            });
          }
          
          if (attachment.processingResult?.extractedText) {
            // Add text content as context for AI (not for display)
            textContents.push(`--- Content from ${attachment.name} ---\n${attachment.processingResult.extractedText}\n--- End of ${attachment.name} ---\n`);
          }
          
          // Keep image attachments for vision models (including PDF pages converted to images)
          if (attachment.type === 'image' && attachment.base64) {
            imageAttachments.push(attachment);
            // Also add to display attachments if it's a regular image
            if (!attachment.processingResult?.metadata?.convertedFromPDF) {
              displayAttachments.push({
                ...attachment,
                base64: undefined, // Don't include base64 in display
                processingResult: attachment.processingResult ? {
                  ...attachment.processingResult,
                  success: attachment.processingResult.success ?? false,
                  extractedText: '[Image attachment]'
                } : undefined
              });
            }
          }
        });
        
        // If we have text content, enhance the prompt for AI processing but keep original for display
        if (textContents.length > 0) {
          const contextText = textContents.join('\n');
          enhancedPrompt = `${contextText}\n\nUser Question: ${input}`;
          console.log('Enhanced prompt with file context for AI processing');
        }
        
        // Only pass image attachments to the API (text content is now in the enhanced prompt)
        attachments = imageAttachments.length > 0 ? imageAttachments : undefined;
        
      } catch (error) {
        console.error('Failed to convert files to attachments:', error);
        // Continue without attachments rather than failing completely
        attachments = undefined;
      }
    }
    
    // Send enhanced prompt to AI for processing, but original input for display
    // Store the original input and display attachments in the enhanced prompt metadata
    if (displayAttachments.length > 0) {
      // Create a special metadata comment that can be parsed later for display
      const displayInfo = `[DISPLAY_META:${JSON.stringify({
        originalMessage: input,
        displayAttachments: displayAttachments.map(att => ({
          id: att.id,
          name: att.name,
          type: att.type,
          size: att.size,
          processed: att.processed
        }))
      })}]`;
      enhancedPrompt = `${displayInfo}\n\n${enhancedPrompt}`;
    }
    
    onSendMessage(enhancedPrompt, attachments);
    
    // Reset state
    setInput('');
    setFiles([]);
    adjustTextareaHeight();
    
    // Reset preload state for next typing session
    setHasPreloaded(false);
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
      preloadTimeoutRef.current = null;
    }
    
    // Focus the textarea after sending for immediate next input
    focusTextarea();
  }, [input, files, onSendMessage, convertFilesToAttachments, adjustTextareaHeight, focusTextarea]);

  // Handle AI config changes
  const handleAIConfigChange = useCallback((newConfig: Partial<ClaraAIConfig>) => {
    // Ensure we have proper defaults for all required fields
    const defaultMcp = {
      enableTools: true,
      enableResources: true,
      enabledServers: [],
      autoDiscoverTools: true,
      maxToolCalls: 5
    };

    const defaultAutonomousAgent = {
      enabled: currentAIConfig.autonomousAgent?.enabled ?? true,
      maxRetries: 3,
      retryDelay: 1000,
      enableSelfCorrection: true,
      enableToolGuidance: true,
      enableProgressTracking: true,
      maxToolCalls: 10,
      confidenceThreshold: 0.8,
      enableChainOfThought: false,
      enableErrorLearning: true
    };

    const updatedConfig: ClaraAIConfig = {
      ...currentAIConfig,
      ...newConfig,
      parameters: {
        ...currentAIConfig.parameters,
        ...newConfig.parameters
      },
      features: {
        ...currentAIConfig.features,
        ...newConfig.features
      },
      models: {
        ...currentAIConfig.models,
        ...newConfig.models
      },
      mcp: {
        ...defaultMcp,
        ...currentAIConfig.mcp,
        ...newConfig.mcp
      },
      autonomousAgent: {
        ...defaultAutonomousAgent,
        ...currentAIConfig.autonomousAgent,
        ...newConfig.autonomousAgent
      }
    };

    onConfigChange?.({
      aiConfig: updatedConfig,
      // Legacy support
      temperature: updatedConfig.parameters.temperature,
      maxTokens: updatedConfig.parameters.maxTokens,
      enableTools: updatedConfig.features.enableTools,
      enableRAG: updatedConfig.features.enableRAG
    });
  }, [currentAIConfig, onConfigChange]);

  // Handler to toggle between streaming and tools mode
  const handleModeToggle = useCallback(() => {
    const newStreamingMode = !isStreamingMode;
    setIsStreamingMode(newStreamingMode);
    
    // Update AI config based on mode
    const newConfig: Partial<ClaraAIConfig> = {
      ...currentAIConfig,
      features: {
        ...currentAIConfig.features,
        enableStreaming: newStreamingMode,
        enableTools: !newStreamingMode,
        enableMCP: !newStreamingMode
      },
      // When streaming mode is enabled, disable autonomous agent mode
      // When tools mode is enabled, automatically enable autonomous agent mode
      autonomousAgent: newStreamingMode ? {
        // Streaming mode: disable autonomous
        enabled: false,
        maxRetries: currentAIConfig.autonomousAgent?.maxRetries || 3,
        retryDelay: currentAIConfig.autonomousAgent?.retryDelay || 1000,
        enableSelfCorrection: currentAIConfig.autonomousAgent?.enableSelfCorrection || true,
        enableToolGuidance: currentAIConfig.autonomousAgent?.enableToolGuidance || true,
        enableProgressTracking: currentAIConfig.autonomousAgent?.enableProgressTracking || true,
        maxToolCalls: currentAIConfig.autonomousAgent?.maxToolCalls || 10,
        confidenceThreshold: currentAIConfig.autonomousAgent?.confidenceThreshold || 0.7,
        enableChainOfThought: currentAIConfig.autonomousAgent?.enableChainOfThought || true,
        enableErrorLearning: currentAIConfig.autonomousAgent?.enableErrorLearning || true
      } : {
        // Tools mode: automatically enable autonomous
        enabled: true,
        maxRetries: currentAIConfig.autonomousAgent?.maxRetries || 3,
        retryDelay: currentAIConfig.autonomousAgent?.retryDelay || 1000,
        enableSelfCorrection: currentAIConfig.autonomousAgent?.enableSelfCorrection || true,
        enableToolGuidance: currentAIConfig.autonomousAgent?.enableToolGuidance || true,
        enableProgressTracking: currentAIConfig.autonomousAgent?.enableProgressTracking || true,
        maxToolCalls: currentAIConfig.autonomousAgent?.maxToolCalls || 10,
        confidenceThreshold: currentAIConfig.autonomousAgent?.confidenceThreshold || 0.7,
        enableChainOfThought: currentAIConfig.autonomousAgent?.enableChainOfThought || true,
        enableErrorLearning: currentAIConfig.autonomousAgent?.enableErrorLearning || true
      }
    };
    
    // Log the mode change for clarity
    if (newStreamingMode) {
      console.log('🌊 Switched to streaming mode - autonomous agent automatically disabled');
    } else {
      console.log('🛠️ Switched to tools mode - autonomous agent automatically enabled');
    }
    
    handleAIConfigChange(newConfig);
  }, [isStreamingMode, currentAIConfig, handleAIConfigChange]);

  // Get current selected model for display
  const getCurrentModel = () => {
    if (currentAIConfig.features.autoModelSelection) {
      return 'Auto Mode';
    }
    
    const textModel = models.find(m => m.id === currentAIConfig.models.text);
    return textModel?.name || 'No model selected';
  };

  // Get the model that would be selected in auto mode based on current context
  const getAutoSelectedModel = () => {
    if (!currentAIConfig.features.autoModelSelection) {
      return null;
    }

    // Check for images in current files
    const hasImages = files.some(file => file.type.startsWith('image/'));
    
    // Check for code-related content
    const hasCodeFiles = files.some(file => {
      const codeExtensions = ['.js', '.ts', '.tsx', '.jsx', '.py', '.cpp', '.c', '.java', '.go', '.rs', '.php', '.rb', '.swift', '.kt'];
      return codeExtensions.some(ext => file.name.endsWith(ext));
    });
    const hasCodeKeywords = /\b(code|programming|function|class|variable|debug|compile|syntax|algorithm|script|development|coding|software)\b/i.test(input);
    const hasCodeContext = hasCodeFiles || hasCodeKeywords;
    
    // Check for tools mode (non-streaming mode typically uses tools)
    const isToolsMode = currentAIConfig.features.enableTools && !currentAIConfig.features.enableStreaming;
    
    // Model selection logic (same as in API service)
    if (hasImages && currentAIConfig.models.vision && currentAIConfig.features.enableStreaming) {
      const visionModel = models.find(m => m.id === currentAIConfig.models.vision);
      return { type: 'vision', model: visionModel, reason: 'Images detected' };
    }
    
    if (isToolsMode && currentAIConfig.models.code) {
      const codeModel = models.find(m => m.id === currentAIConfig.models.code);
      return { type: 'code', model: codeModel, reason: 'Tools mode' };
    }
    
    if (hasCodeContext && currentAIConfig.models.code && currentAIConfig.features.enableStreaming) {
      const codeModel = models.find(m => m.id === currentAIConfig.models.code);
      return { type: 'code', model: codeModel, reason: 'Code context' };
    }
    
    // Default to text model
    const textModel = models.find(m => m.id === currentAIConfig.models.text);
    return { type: 'text', model: textModel, reason: 'General text' };
  };

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    
    // Toggle streaming vs tools mode with Ctrl+M (or Cmd+M on Mac)
    if (e.key === 'm' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleModeToggle();
    }
  }, [handleSend, handleModeToggle]);

  // Quick action handlers
  const handleNewChat = useCallback(() => {
    setInput('');
    setFiles([]);
    onNewChat?.();
    
    // Focus the textarea after starting new chat
    focusTextarea();
  }, [onNewChat, focusTextarea]);

  const triggerImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        handleFilesAdded(Array.from(target.files));
        // Focus textarea after files are added
        focusTextarea();
      }
    };
    input.click();
  }, [handleFilesAdded, focusTextarea]);

  const triggerDocumentUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.cpp,.c,.java';
    input.multiple = true;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        handleFilesAdded(Array.from(target.files));
        // Focus textarea after files are added
        focusTextarea();
      }
    };
    input.click();
  }, [handleFilesAdded, focusTextarea]);

  // Voice chat handlers - simplified for transcription only
  const handleVoiceAudio = useCallback(async (audioBlob: Blob) => {
    setIsVoiceProcessing(true);
    try {
      // Simple transcription only - no AI processing
      const result = await claraVoiceService.transcribeAudio(audioBlob);
      
      if (result.success && result.transcription.trim()) {
        const originalTranscription = result.transcription.trim();
        
        // Add voice mode prefix for AI context
        const voiceModePrefix = "Warning: You are in speech mode, make sure to reply in few lines:  \n";
        const messageWithPrefix = voiceModePrefix + originalTranscription;
        
        console.log('🎤 Transcription complete:', originalTranscription);
        console.log('🎤 Sending message with voice mode prefix to AI');
        
        // Send the prefixed message to AI using the existing onSendMessage prop
        // The parent component will handle the actual message sending and display
        // We'll pass the original transcription as a second parameter for display purposes
        if (onSendMessage) {
          // For now, just send the prefixed message - the parent will handle display
          onSendMessage(messageWithPrefix);
        }
        
      } else {
        console.error('Transcription failed:', result.error);
        // Could show a toast notification here
      }
    } catch (error) {
      console.error('Voice transcription error:', error);
      // Could show a toast notification here
    } finally {
      setIsVoiceProcessing(false);
    }
  }, [onSendMessage]);

  // Simple voice mode toggle
  const handleVoiceModeToggle = useCallback(() => {
    if (isVoiceChatEnabled) {
      // Deactivate voice mode
      setIsVoiceChatEnabled(false);
      setShowVoiceChat(false);
      console.log('🎤 Voice mode deactivated');
    } else {
      // Activate voice mode immediately
      setIsVoiceChatEnabled(true);
      setShowVoiceChat(true);
      console.log('🎤 Voice mode activated - ready to listen');
    }
  }, [isVoiceChatEnabled]);

  const handleVoiceToggle = useCallback(() => {
    setIsVoiceChatEnabled(!isVoiceChatEnabled);
  }, [isVoiceChatEnabled]);

  return (
    <div 
      ref={containerRef}
      className="relative dark:border-gray-800 bg-transparent transition-colors duration-100 z-10"
    >
      {/* Drag overlay */}
      {dragCounter > 0 && (
        <div className="absolute inset-0 bg-sakura-500/10 border-2 border-dashed border-sakura-500 rounded-xl z-30 pointer-events-none" />
      )}

      <div className="max-w-4xl mx-auto">
        <div className="p-6 flex justify-center">
          <div className="max-w-3xl w-full relative">
            {/* Main Input Container - Conditionally render chat input OR voice chat */}
            {showVoiceChat ? (
              /* Voice Chat Mode - Same size as input container */
              <ClaraVoiceChat
                isEnabled={isVoiceChatEnabled}
                onToggle={handleVoiceToggle}
                onSendAudio={handleVoiceAudio}
                isProcessing={isVoiceProcessing}
                isAIResponding={isLoading}
                autoTTSText={autoTTSText}
                autoTTSTrigger={autoTTSTrigger}
                onBackToChat={() => {
                  setShowVoiceChat(false);
                  setIsVoiceChatEnabled(false);
                  focusTextarea();
                }}
              />
            ) : (
              /* Chat Input Mode */
              <div 
                className={`glassmorphic rounded-xl p-4 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg transition-all duration-300 ${
                  progressState.isActive && isLoading
                    ? 'border-2 border-blue-400 dark:border-blue-500 shadow-blue-200/50 dark:shadow-blue-800/50 shadow-lg' 
                    : 'border border-transparent'
                }`}
                style={{
                  background: progressState.isActive && isLoading && progressState.progress > 0 
                    ? `linear-gradient(90deg, rgba(59, 130, 246, 0.1) ${progressState.progress}%, transparent ${progressState.progress}%)`
                    : undefined
                }}
              >
                
                {/* Progress Indicator */}
                {progressState.isActive && isLoading && (
                  <div className="flex items-center gap-3 mb-3 p-2 bg-blue-50/80 dark:bg-blue-900/30 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      {progressState.progress > 0 ? (
                        <div className="relative w-4 h-4">
                          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                          </div>
                        </div>
                      ) : (
                        <Waves className="w-4 h-4 animate-pulse" />
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{progressState.message}</span>
                          {progressState.progress > 0 && (
                            <span className="text-blue-500 font-mono text-xs bg-blue-100 dark:bg-blue-800/50 px-2 py-0.5 rounded">
                              {progressState.progress}%
                            </span>
                          )}
                        </div>
                        
                        {progressState.details && (
                          <div className="text-xs text-blue-500/80 dark:text-blue-400/80 mt-0.5">
                            {progressState.details}
                          </div>
                        )}
                        
                        {/* Progress bar for determinate progress */}
                        {progressState.progress > 0 && (
                          <div className="w-full bg-blue-200/50 dark:bg-blue-800/30 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${progressState.progress}%` }}
                            ></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* File Upload Area */}
                <FileUploadArea
                  files={files}
                  onFilesAdded={handleFilesAdded}
                  onFileRemoved={handleFileRemoved}
                  isProcessing={isLoading}
                />

                {/* Input Field */}
                <div className={files.length > 0 ? 'mt-3' : ''}>
                  {/* Removed preloading indicator - preloading is now completely silent */}
                  
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      // Trigger aggressive preload on focus for fastest TTFT - SILENT
                      console.log('⚡ Input focused - triggering silent immediate preload');
                      onPreloadModel?.();
                    }}
                    onInput={() => {
                      // Trigger preload on very first keystroke - SILENT
                      if (input.length === 0) {
                        console.log('🚀 First keystroke detected - silent aggressive preload');
                        onPreloadModel?.();
                      }
                    }}
                    placeholder="Ask me anything..."
                    className="w-full border-0 outline-none focus:outline-none focus:ring-0 resize-none bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
                    style={{
                      height: 'auto',
                      minHeight: '24px',
                      maxHeight: '250px',
                      overflowY: 'auto',
                      padding: '0',
                      borderRadius: '0'
                    }}
                    data-chat-input="true"
                    disabled={isLoading}
                  />
                </div>

                {/* Bottom Actions - Redesigned for better UX */}
                <div className="flex justify-between items-center mt-4">
                  {/* Left Side - File & Content Actions */}
                  <div className="flex items-center">
                    {/* File Upload Group */}
                    <div className="flex items-center bg-gray-100/50 dark:bg-gray-800/30 rounded-lg p-1 mr-3">
                      <Tooltip content="Upload images" position="top">
                        <button 
                          onClick={triggerImageUpload}
                          className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                          disabled={isLoading}
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      
                      <Tooltip content="Upload documents & code" position="top">
                        <button
                          onClick={triggerDocumentUpload}
                          className="p-1.5 rounded-md hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                          disabled={isLoading}
                        >
                          <File className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>

                    {/* Voice Input */}
                    <Tooltip content="Voice input" position="top">
                      <button
                        onClick={handleVoiceModeToggle}
                        className={`p-2 rounded-lg transition-colors mr-3 ${
                          isVoiceChatEnabled 
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' 
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                        disabled={isLoading}
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </Tooltip>

                    {/* New Chat */}
                    {/* <Tooltip content="New conversation" position="top">
                      <button
                        onClick={handleNewChat}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                        disabled={isLoading}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </Tooltip> */}
                  </div>

                  {/* Center - Mode & Model Selection */}
                  <div className="flex items-center gap-3">
                    {/* Mode Toggle */}
                    <div className="flex items-center bg-gray-100/50 dark:bg-gray-800/30 rounded-lg p-1">
                      <Tooltip 
                        content={isStreamingMode ? "Switch to Tools Mode - Ctrl+M" : "Switch to Streaming Mode - Ctrl+M"} 
                        position="top"
                      >
                        <button
                          onClick={handleModeToggle}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            isStreamingMode 
                              ? 'bg-blue-500 text-white shadow-sm' 
                              : 'bg-green-500 text-white shadow-sm'
                          }`}
                          disabled={isLoading}
                        >
                          {isStreamingMode ? (
                            <>
                              <Waves className="w-3 h-3" />
                              <span>Streaming</span>
                            </>
                          ) : (
                            <>
                              <Cog className="w-3 h-3" />
                              <span>Tools</span>
                              {currentAIConfig.mcp?.enabledServers?.length && (
                                <span className="bg-white/20 px-1 rounded text-xs">
                                  {currentAIConfig.mcp.enabledServers.length}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      </Tooltip>
                    </div>

                    {/* Model Selection */}
                    <div className="relative">
                      {currentAIConfig.features.autoModelSelection ? (
                        <Tooltip 
                          content={(() => {
                            const autoSelected = getAutoSelectedModel();
                            if (autoSelected?.model) {
                              return `Auto Mode: ${autoSelected.model.name} (${autoSelected.reason})`;
                            }
                            return "Automatic model selection enabled";
                          })()} 
                          position="top"
                        >
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-white/70 dark:bg-gray-800/70 border border-blue-200 dark:border-blue-700 min-w-[140px]">
                            {(() => {
                              const autoSelected = getAutoSelectedModel();
                              const getModelIcon = () => {
                                if (autoSelected?.type === 'vision') return ImageIcon;
                                if (autoSelected?.type === 'code') return Zap;
                                return Bot;
                              };
                              const getModelColor = () => {
                                if (autoSelected?.type === 'vision') return 'text-purple-600 dark:text-purple-400';
                                if (autoSelected?.type === 'code') return 'text-blue-600 dark:text-blue-400';
                                return 'text-blue-600 dark:text-blue-400';
                              };
                              
                              const IconComponent = getModelIcon();
                              const modelName = autoSelected?.model?.name || 'Auto Mode';
                              const truncatedName = modelName.length > 15 ? modelName.substring(0, 12) + '...' : modelName;
                              
                              return (
                                <>
                                  <IconComponent className={`w-3 h-3 flex-shrink-0 ${getModelColor()}`} />
                                  <span className="text-gray-700 dark:text-gray-300 truncate text-xs font-medium" title={modelName}>
                                    {truncatedName}
                                  </span>
                                  <Zap className="w-3 h-3 flex-shrink-0 text-blue-500" />
                                </>
                              );
                            })()}
                          </div>
                        </Tooltip>
                      ) : (
                        <ModelSelector
                          models={models}
                          selectedModel={currentAIConfig.models.text || ''}
                          onModelChange={(modelId) => {
                            handleAIConfigChange({
                              models: { ...currentAIConfig.models, text: modelId }
                            });
                            onModelChange?.(modelId, 'text');
                          }}
                          modelType="text"
                          currentProvider={currentAIConfig.provider}
                        />
                      )}
                    </div>
                  </div>

                  {/* Right Side - Settings & Send */}
                  <div className="flex items-center gap-2">
                    {/* Settings */}
                    <Tooltip content="Advanced settings" position="top">
                      <button
                        onClick={() => onAdvancedOptionsToggle?.(!showAdvancedOptionsPanel)}
                        className={`p-2 rounded-lg transition-colors ${
                          showAdvancedOptionsPanel 
                            ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-600 dark:text-sakura-400' 
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </Tooltip>

                    {/* Send/Stop Button */}
                    {isLoading ? (
                      <Tooltip content="Stop generating" position="top">
                        <button
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium text-sm"
                          onClick={onStop}
                          disabled={!onStop}
                        >
                          <Square className="w-4 h-4" fill="white" />
                          <span>Stop</span>
                        </button>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Send message (Enter)" position="top">
                        <button
                          onClick={handleSend}
                          disabled={!input.trim() && files.length === 0}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                        >
                          <Send className="w-4 h-4" />
                          <span>Send</span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Options - Removed, now handled by parent component */}
          </div>
        </div>
      </div>

      {/* Provider Offline Modal */}
      {showProviderOfflineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 m-4 max-w-md w-full mx-auto">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-3">
              Provider Not Responding
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
              {providerOfflineMessage}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              {offlineProvider?.type === 'claras-pocket' ? (
                // If current provider is Clara Core, offer to start it
                <button
                  onClick={handleStartClaraCore}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  <Server className="w-5 h-5" />
                  <span>Start Clara's Pocket</span>
                </button>
              ) : (
                // If current provider is not Clara Core, offer to switch
                showClaraCoreOffer && (
                  <button
                    onClick={handleSwitchToClaraCore}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <Server className="w-5 h-5" />
                    <span>Switch to Clara's Pocket</span>
                  </button>
                )
              )}
              
              <button
                onClick={() => setShowProviderOfflineModal(false)}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { AdvancedOptions };
export default ClaraAssistantInput;