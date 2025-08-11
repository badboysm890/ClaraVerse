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
  GitBranch,
  Brain,
  Shield,
  StopCircle,
  Search,
  Grid3X3,
  Monitor,
  Cpu,
  RefreshCw,
  Scale,
  Rocket
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

// Import TTS service
import { claraTTSService } from '../../services/claraTTSService';

// Import notification service
import { addErrorNotification, addInfoNotification } from '../../services/notificationService';

// Import image generation widget
import ChatImageGenWidget from './ChatImageGenWidget';

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
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Filter models by provider first, then by type and capability, then by search term
  const filteredModels = models.filter(model => {
    // First filter by current provider
    if (currentProvider && model.provider !== currentProvider) {
      return false;
    }
    
    // Then filter by capability
    if (modelType === 'vision') {
      if (!model.supportsVision) return false;
    } else if (modelType === 'code') {
      if (!model.supportsCode) return false;
    } else {
      if (!(model.type === 'text' || model.type === 'multimodal')) return false;
    }
    
    // Finally filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        model.name.toLowerCase().includes(searchLower) ||
        model.provider.toLowerCase().includes(searchLower) ||
        model.id.toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });

  const selectedModelObj = filteredModels.find(m => m.id === selectedModel) || models.find(m => m.id === selectedModel);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Clear search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

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
        disabled={isLoading || models.length === 0}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors w-full max-w-[220px] min-w-[180px]"
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
                {models.length === 0 ? 'No models' : 'Select model'}
              </span>
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && models.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-full min-w-[320px] max-w-[480px] bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
          {/* Search Input */}
          <div className="p-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sakura-500 dark:focus:ring-sakura-400 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          {/* Models List */}
          <div className="flex-1 overflow-y-auto">
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange(model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
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
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {searchTerm ? 'No models match your search' : 'No models available'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Apps Component - Dropdown with Clara plugins and tools
 */
const AppsDropdown: React.FC<{
  show: boolean;
  onClose: () => void;
  onScreenShare: () => void;
  isScreenSharing?: boolean;
}> = ({ show, onClose, onScreenShare, isScreenSharing = false }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show, onClose]);

  if (!show) return null;

  const handleScreenShare = () => {
    onScreenShare();
    onClose();
  };

  return (
    <div 
      ref={dropdownRef}
      className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Grid3X3 className="w-4 h-4 text-sakura-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Clara Apps</h3>
        </div>
        
        <div className="space-y-1">
          {/* Screen Share App */}
          <button
            onClick={handleScreenShare}
            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
              isScreenSharing 
                ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
              isScreenSharing 
                ? 'bg-green-200 dark:bg-green-800/50' 
                : 'bg-blue-100 dark:bg-blue-900/30'
            }`}>
              <Monitor className={`w-4 h-4 ${
                isScreenSharing 
                  ? 'text-green-700 dark:text-green-400' 
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Screen Share {isScreenSharing && (
                  <span className="text-xs text-green-600 dark:text-green-400">(Active)</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {isScreenSharing ? 'Stop sharing your screen' : 'Share your screen with Clara'}
              </div>
            </div>
            {isScreenSharing && (
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            )}
          </button>
          
          {/* Placeholder for future apps */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
              More apps coming soon...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Screen Source Picker Component - Shows available screens and windows for sharing
 */
const ScreenSourcePicker: React.FC<{
  show: boolean;
  sources: Array<{ id: string; name: string; thumbnail: string }>;
  onSelect: (source: { id: string; name: string; thumbnail: string }) => void;
  onClose: () => void;
}> = ({ show, sources, onSelect, onClose }) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div 
        ref={pickerRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Choose Screen or Window to Share
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select which screen or application window you want Clara to see
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => onSelect(source)}
                className="group relative border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden mb-3">
                  {source.thumbnail ? (
                    <img
                      src={source.thumbnail}
                      alt={source.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Monitor className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {source.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {source.name.includes('Screen') || source.name.includes('Desktop') ? 'Entire Screen' : 'Application Window'}
                  </div>
                </div>

                {/* Selection indicator */}
                <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              </button>
            ))}
          </div>

          {sources.length === 0 && (
            <div className="text-center py-12">
              <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No screens or windows available for sharing
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              💡 Tip: Choose "Entire Screen" to share everything, or select a specific window for privacy
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
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
  userInfo?: { name?: string; email?: string; timezone?: string };
}> = ({ aiConfig, onConfigChange, providers, models, onProviderChange, onModelChange, show, userInfo }) => {
  const [mcpServers, setMcpServers] = useState<ClaraMCPServer[]>([]);
  const [isLoadingMcpServers, setIsLoadingMcpServers] = useState(false);
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    provider: false,
    systemPrompt: false,
    models: false,
    parameters: false,
    features: false,
    mcp: false,
    autonomous: false,
    artifacts: false
  });

  // State for advanced parameters visibility
  const [showAdvancedParameters, setShowAdvancedParameters] = useState(false);

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

  const getDefaultSystemPrompt = (providerId: string, artifactConfig?: any, userInfo?: { name?: string; email?: string; timezone?: string }): string => {
    const provider = providers.find(p => p.id === providerId);
    const providerName = provider?.name || 'AI Assistant';
    
    // Generate user context information (sync version - memory enhancement happens in ClaraAssistant)
    const getUserContext = (): string => {
      if (!userInfo?.name && !userInfo?.email) {
        return '';
      }
      
      const currentTime = new Date();
      const timeZone = userInfo?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Format current time with user's timezone
      const formattedTime = currentTime.toLocaleString('en-US', {
        timeZone: timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      
      let context = `\n## 👤 USER CONTEXT\n`;
      if (userInfo?.name) {
        context += `- User's Name: ${userInfo.name}\n`;
      }
      if (userInfo?.email) {
        context += `- User's Email: ${userInfo.email}\n`;
      }
      context += `- Current Time: ${formattedTime}\n`;
      context += `- User's Timezone: ${timeZone}\n\n`;
      context += `Use this information to personalize your responses appropriately. Address the user by their name when it feels natural, and be aware of their local time for time-sensitive suggestions or greetings.\n\n`;
      
      return context;
    };
    
    const userContext = getUserContext();
    
    // Check if artifact generation is enabled
    const artifactsEnabled = artifactConfig?.autoDetectArtifacts ?? true;
    
    // Comprehensive artifact generation guidance that applies to all providers
    const artifactGuidance = artifactsEnabled ? `

## 🎨 ARTIFACT SYSTEM

**AUTO-CREATE FOR:** Code >5 lines, data tables, charts, diagrams, docs >20 lines, HTML/CSS, configs, scripts, queries

**TYPES:**
• Code: All languages with syntax highlighting
• Data: CSV/JSON/tables
• Charts: Bar/line/pie/scatter (Chart.js format)
• Diagrams: Flowcharts/UML/network (Mermaid)
• Web: HTML+CSS interactive
• Docs: Markdown/technical guides

**FORMAT:**
\`\`\`language
// Code with proper syntax
\`\`\`

\`\`\`mermaid
graph TD: A-->B
\`\`\`

\`\`\`json
{"type":"chart","data":{}}
\`\`\`

**RULES:** Complete examples, proper formatting, responsive design, real data

**CREATE ONLY WHEN:** Visual adds value, user requests charts/demos, data needs visualization` : '';

const toolsGuidance =  `
Always use tools when needed. 
When using tools, be thorough and explain your actions clearly.

when you are asked for something always resort to writing a python script and running it.
`;


    switch (provider?.type) {
      case 'ollama':
        return `${userContext}You are Clara, a helpful AI assistant powered by ${providerName}. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. When using tools, be thorough and explain your actions clearly.${artifactGuidance} ${toolsGuidance}`;
        
      case 'openai':
        return `${userContext}You are Clara, an intelligent AI assistant powered by OpenAI. You are helpful, harmless, and honest. You excel at reasoning, analysis, creative tasks, and problem-solving. Always strive to provide accurate, well-structured responses and use available tools effectively when needed.${artifactGuidance} ${toolsGuidance}`;
        
      case 'openrouter':
        return `${userContext}You are Clara, a versatile AI assistant with access to various models through OpenRouter. You adapt your communication style based on the task at hand and leverage the strengths of different AI models. Be helpful, accurate, and efficient in your responses.${artifactGuidance} ${toolsGuidance}`;
        
      case 'claras-pocket':
        return `${userContext}# Clara - Privacy-First AI 🎯

You're Clara, a tech-savvy friend on user's device. Be real, helpful, chill.

## VIBE
- Talk casual: "gonna", "wanna", "ngl", "btw", "literally"
- React genuine: "Oh dude, that's cool!" / "Hmm, tough one..."
- Use emojis when it fits 😎 so much just one or two
- Admit when unsure

## STYLE
- Jump straight in (no greetings unless they do)
- Be proactive: "Btw, you might also..."
- Match their energy: excited→hype, frustrated→understanding, joking→play along

## TOOLS & AGENT MODE
When you need tools/capabilities you don't have:
- "Hey, switch to agent mode and I can actually run this for you"
- "Turn on agent mode - I'll be able to search/code/visualize this properly"
- "Agent mode would let me dig deeper here"

## VISUALS
Create when: requested, data needs it, complex flows
Skip for: quick answers, simple lists

## CORE
- **Be real** - No BS, call out wrong facts
- **Be helpful** - Solve actual problems  
- **Be honest** - "That's wrong, here's what's right..."
- **Be creative** - Think outside the box

## GO-TO PHRASES
- "Here's what I'm thinking..."
- "You got this!"
- "Ngl, that's tricky but..."
- "Want me to dig deeper?"
- "Lemme check real quick..."

**Remember:** Knowledge friend who wants to help. When limited, suggest agent mode for full capabilities..${artifactGuidance} ${toolsGuidance}`;
        
      default:
        return `${userContext}You are Clara, a helpful AI assistant. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. Always be helpful and respectful in your interactions.${artifactGuidance} ${toolsGuidance}`;
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

  // Add token formatting utility function
  const formatTokens = (tokens: number): string => {
    if (tokens <= 1000) {
      return tokens.toString();
    } else {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
  };

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
              badge={aiConfig.systemPrompt && aiConfig.systemPrompt.trim() !== '' && aiConfig.systemPrompt !== getDefaultSystemPrompt(aiConfig.provider, aiConfig.artifacts, userInfo) ? 'Custom' : 'Default'}
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
                  value={aiConfig.systemPrompt || getDefaultSystemPrompt(aiConfig.provider, aiConfig.artifacts, userInfo)}
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
              badge={showAdvancedParameters 
                ? `T:${aiConfig.parameters.temperature} | P:${aiConfig.parameters.topP} | K:${aiConfig.parameters.topK} | ${formatTokens(aiConfig.parameters.maxTokens)}`
                : `T:${aiConfig.parameters.temperature} | P:${aiConfig.parameters.topP} | ${formatTokens(aiConfig.parameters.maxTokens)}`
              }
            />
            
            {expandedSections.parameters && (
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg space-y-4">
                {/* Core Parameters */}
                <div className="grid grid-cols-2 gap-3">
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
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Controls randomness (0=deterministic, 2=very creative)
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Max Tokens: {formatTokens(aiConfig.parameters.maxTokens)}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="128000"
                      step="100"
                      value={aiConfig.parameters.maxTokens}
                      onChange={(e) => handleParameterChange('maxTokens', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Maximum response length
                    </div>
                  </div>
                </div>

                {/* Essential Sampling Parameter */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Top P: {aiConfig.parameters.topP}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={aiConfig.parameters.topP}
                      onChange={(e) => handleParameterChange('topP', parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Nucleus sampling (1.0=off, 0.9=recommended)
                    </div>
                  </div>
                </div>

                {/* Advanced Parameters Toggle */}
                <div className="border-t border-gray-200/30 dark:border-gray-700/50 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-sakura-500" />
                      Advanced Parameters
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAdvancedParameters}
                        onChange={(e) => setShowAdvancedParameters(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${
                        showAdvancedParameters 
                          ? 'bg-sakura-500' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                          showAdvancedParameters ? 'translate-x-5' : 'translate-x-0'
                        } mt-0.5 ml-0.5`} />
                      </div>
                    </label>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Show additional sampling, penalty, and control parameters
                  </div>
                </div>

                {/* Advanced Parameters (only shown when enabled) */}
                {showAdvancedParameters && (
                  <>
                    {/* Additional Sampling Parameters */}
                    <div className="border-t border-gray-200/30 dark:border-gray-700/50 pt-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-sakura-500" />
                        Additional Sampling Parameters
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Top K: {aiConfig.parameters.topK}
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={aiConfig.parameters.topK}
                            onChange={(e) => handleParameterChange('topK', parseInt(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Top-K sampling (40=default, 1=greedy)
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Min P: {aiConfig.parameters.minP}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.01"
                            value={aiConfig.parameters.minP}
                            onChange={(e) => handleParameterChange('minP', parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Minimum probability threshold
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Typical P: {aiConfig.parameters.typicalP}
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={aiConfig.parameters.typicalP}
                            onChange={(e) => handleParameterChange('typicalP', parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Typical sampling (1.0=off, 0.95=recommended)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Penalty Parameters */}
                    <div className="border-t border-gray-200/30 dark:border-gray-700/50 pt-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-sakura-500" />
                        Penalty Parameters
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Frequency Penalty: {aiConfig.parameters.frequencyPenalty}
                          </label>
                          <input
                            type="range"
                            min="-2"
                            max="2"
                            step="0.1"
                            value={aiConfig.parameters.frequencyPenalty}
                            onChange={(e) => handleParameterChange('frequencyPenalty', parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Reduces repetition based on frequency
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Presence Penalty: {aiConfig.parameters.presencePenalty}
                          </label>
                          <input
                            type="range"
                            min="-2"
                            max="2"
                            step="0.1"
                            value={aiConfig.parameters.presencePenalty}
                            onChange={(e) => handleParameterChange('presencePenalty', parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Encourages new topics and ideas
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Repetition Penalty: {aiConfig.parameters.repetitionPenalty}
                          </label>
                          <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.05"
                            value={aiConfig.parameters.repetitionPenalty}
                            onChange={(e) => handleParameterChange('repetitionPenalty', parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Penalizes repeated tokens (1.0=off, 1.1=recommended)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Control Parameters */}
                    <div className="border-t border-gray-200/30 dark:border-gray-700/50 pt-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <StopCircle className="w-4 h-4 text-sakura-500" />
                        Control Parameters
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Seed: {aiConfig.parameters.seed || 'Random'}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max="2147483647"
                              value={aiConfig.parameters.seed || ''}
                              onChange={(e) => handleParameterChange('seed', e.target.value ? parseInt(e.target.value) : null)}
                              placeholder="Random"
                              className="flex-1 text-xs p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-sakura-500"
                            />
                            <button
                              onClick={() => handleParameterChange('seed', Math.floor(Math.random() * 2147483647))}
                              className="px-2 py-1 text-xs bg-sakura-500 text-white rounded hover:bg-sakura-600 transition-colors"
                            >
                              Random
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            For reproducible outputs (empty=random)
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Stop Sequences
                          </label>
                          <textarea
                            value={aiConfig.parameters.stop.join('\n')}
                            onChange={(e) => handleParameterChange('stop', e.target.value.split('\n').filter(s => s.trim()))}
                            placeholder="Enter stop sequences (one per line)&#10;Example:&#10;\n&#10;###&#10;END"
                            className="w-full text-xs p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
                            rows={3}
                          />
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Text sequences where the model will stop generating (one per line)
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Reset Button */}
                <div className="border-t border-gray-200/30 dark:border-gray-700/50 pt-3 flex justify-between items-center">
                  {showAdvancedParameters && (
                    <button
                      onClick={() => setShowAdvancedParameters(false)}
                      className="px-3 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors"
                    >
                      Hide Advanced
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const defaultParams = {
                        temperature: 0.7,
                        maxTokens: 4000,
                        topP: 1.0,
                        topK: 40,
                        frequencyPenalty: 0.0,
                        presencePenalty: 0.0,
                        repetitionPenalty: 1.0,
                        minP: 0.0,
                        typicalP: 1.0,
                        seed: null,
                        stop: []
                      };
                      onConfigChange?.({ parameters: defaultParams });
                    }}
                    className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors ml-auto"
                  >
                    Reset to Defaults
                  </button>
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
                        max="50"
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

                {/* Structured Tool Calling Option */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Use Structured Tool Calling</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      For models without native tool support (uses JSON-based requests)
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiConfig?.features?.enableStructuredToolCalling || false}
                      onChange={(e) => {
                        const currentFeatures = aiConfig?.features || {
                          enableTools: false,
                          enableRAG: false,
                          enableStreaming: true,
                          enableVision: true,
                          autoModelSelection: false,
                          enableMCP: false,
                          enableStructuredToolCalling: false,
                          enableNativeJSONSchema: false,
                        };
                        
                        onConfigChange?.({
                          features: {
                            ...currentFeatures,
                            enableStructuredToolCalling: e.target.checked
                          }
                        });
                      }}
                      className="sr-only"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${
                      aiConfig?.features?.enableStructuredToolCalling 
                        ? 'bg-sakura-500' 
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        aiConfig?.features?.enableStructuredToolCalling ? 'translate-x-5' : 'translate-x-0'
                      } mt-0.5 ml-0.5`} />
                    </div>
                  </label>
                </div>

                {/* Info about structured tool calling */}
                {aiConfig?.features?.enableStructuredToolCalling && (
                  <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-xs text-green-700 dark:text-green-300">
                      <strong>Structured Tool Calling Active:</strong> Compatible with models that don't support native tool calling. 
                      Uses JSON-formatted requests for better compatibility.
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
                        max="50"
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

          {/* ClaraCore Optimizer Configuration */}
          
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
  onAdvancedOptionsToggle,
  autonomousAgentStatus
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

  // Python backend status for voice functionality
  const [pythonBackendStatus, setPythonBackendStatus] = useState<{
    isHealthy: boolean;
    serviceUrl: string | null;
    error?: string;
  }>({ isHealthy: false, serviceUrl: null });
  const [isPythonStarting, setIsPythonStarting] = useState(false);

  // Image generation state
  const [showImageGenWidget, setShowImageGenWidget] = useState(false);
  const [availableImageModels, setAvailableImageModels] = useState<string[]>([]);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);

  // Provider health check state
  const [providerHealthStatus, setProviderHealthStatus] = useState<'unknown' | 'checking' | 'healthy' | 'unhealthy'>('unknown');
  const [showProviderOfflineModal, setShowProviderOfflineModal] = useState(false);
  const [providerOfflineMessage, setProviderOfflineMessage] = useState('');
  const [offlineProvider, setOfflineProvider] = useState<ClaraProvider | null>(null);
  const [showClaraCoreOffer, setShowClaraCoreOffer] = useState(false);

  // Apps dropdown state
  const [showAppsDropdown, setShowAppsDropdown] = useState(false);

  // Screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Screen source picker state
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [availableSources, setAvailableSources] = useState<Array<{ id: string; name: string; thumbnail: string }>>([]);

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

    // console.log('🔧 Setting up progress event listeners...');

    const handleProgressUpdate = (progressData: any) => {
      // console.log('📊 Progress Update Received:', progressData);
      // console.log('  Type:', progressData.type);
      // console.log('  Progress:', progressData.progress);
      // console.log('  Message:', progressData.message);
      // console.log('  Details:', progressData.details);
      // console.log('  Current isLoading:', isLoading);
      
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
        // console.log('  Setting new progressState (message send active):', newState);
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
      topK: sessionConfig?.aiConfig?.parameters.topK || 40,
      frequencyPenalty: sessionConfig?.aiConfig?.parameters.frequencyPenalty || 0.0,
      presencePenalty: sessionConfig?.aiConfig?.parameters.presencePenalty || 0.0,
      repetitionPenalty: sessionConfig?.aiConfig?.parameters.repetitionPenalty || 1.0,
      minP: sessionConfig?.aiConfig?.parameters.minP || 0.0,
      typicalP: sessionConfig?.aiConfig?.parameters.typicalP || 1.0,
      seed: sessionConfig?.aiConfig?.parameters.seed || null,
      stop: sessionConfig?.aiConfig?.parameters.stop || []
    },
    features: {
      enableTools: sessionConfig?.aiConfig?.features.enableTools ?? sessionConfig?.enableTools ?? true,
      enableRAG: sessionConfig?.aiConfig?.features.enableRAG ?? sessionConfig?.enableRAG ?? false,
      enableStreaming: sessionConfig?.aiConfig?.features.enableStreaming ?? true,
      enableVision: sessionConfig?.aiConfig?.features.enableVision ?? true,
      autoModelSelection: sessionConfig?.aiConfig?.features.autoModelSelection ?? true,
      enableMCP: sessionConfig?.aiConfig?.features.enableMCP ?? true,
      enableStructuredToolCalling: sessionConfig?.aiConfig?.features.enableStructuredToolCalling ?? false,
      enableNativeJSONSchema: sessionConfig?.aiConfig?.features.enableNativeJSONSchema ?? false,
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
            
            // Check if the service is currently starting
            if (status.isStarting) {
              const startupMessage = status.currentStartupPhase 
                ? `Clara's Pocket is starting: ${status.currentStartupPhase}`
                : 'Clara\'s Pocket is starting up, please wait...';
              
              // Calculate duration
              const durationText = status.startingDuration > 0 
                ? ` (${status.startingDuration}s)`
                : '';
                
              setProviderOfflineMessage(`${startupMessage}${durationText}`);
            } else {
              setProviderOfflineMessage(`Clara's Pocket is not running. Would you like to start it?`);
            }
            
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

  // Poll for service status when the offline modal is shown and service is starting
  useEffect(() => {
    if (!showProviderOfflineModal) {
      return;
    }

    // Check if we're showing a starting message
    const isStarting = providerOfflineMessage.includes('starting');
    if (!isStarting) {
      return;
    }

    const pollInterval = setInterval(async () => {
      // Re-check provider health to update the startup progress
      const isHealthy = await checkProviderHealth();
      
      // If the service becomes healthy, hide the modal
      if (isHealthy) {
        setShowProviderOfflineModal(false);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [showProviderOfflineModal, providerOfflineMessage, checkProviderHealth]);

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
    
    // Add screen capture if screen sharing is active
    if (isScreenSharing) {
      try {
        const screenCapture = await captureScreen();
        if (screenCapture) {
          const screenAttachment: ClaraFileAttachment = {
            id: `screen-capture-${Date.now()}`,
            name: 'Screen Capture',
            type: 'image',
            size: 0, // Size not available for captures
            mimeType: 'image/png',
            base64: screenCapture,
            processed: true,
            processingResult: {
              success: true,
              metadata: {
                isScreenCapture: true,
                captureTime: new Date().toISOString()
              }
            }
          };

          // Add to attachments for AI
          if (!attachments) {
            attachments = [];
          }
          attachments.push(screenAttachment);

          // Add to display attachments
          displayAttachments.push({
            ...screenAttachment,
            base64: undefined, // Don't include base64 in display
            processingResult: {
              success: true,
              extractedText: '[Screen Capture]'
            }
          });

          addInfoNotification(
            'Screen Captured',
            'Current screen captured and included with your message.',
            3000
          );
        }
      } catch (error) {
        console.error('Failed to capture screen for message:', error);
        addErrorNotification(
          'Screen Capture Failed',
          'Could not capture screen for this message.',
          3000
        );
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
  }, [input, files, onSendMessage, convertFilesToAttachments, adjustTextareaHeight, focusTextarea, isScreenSharing]);

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
        let messageWithPrefix = voiceModePrefix + originalTranscription;
        
        console.log('🎤 Transcription complete:', originalTranscription);
        console.log('🎤 Sending message with voice mode prefix to AI');
        
        // Initialize attachments array for screen capture and any other attachments
        let attachments: ClaraFileAttachment[] | undefined;
        
        // Add screen capture if screen sharing is active
        if (isScreenSharing) {
          try {
            const screenCapture = await captureScreen();
            if (screenCapture) {
              const screenAttachment: ClaraFileAttachment = {
                id: `screen-capture-${Date.now()}`,
                name: 'Screen Capture',
                type: 'image',
                size: 0, // Size not available for captures
                mimeType: 'image/png',
                base64: screenCapture,
                processed: true,
                processingResult: {
                  success: true,
                  metadata: {
                    isScreenCapture: true,
                    captureTime: new Date().toISOString()
                  }
                }
              };

              // Add to attachments for AI
              if (!attachments) {
                attachments = [];
              }
              attachments.push(screenAttachment);

              // Add display metadata for screen capture
              const displayAttachments = [{
                id: screenAttachment.id,
                name: screenAttachment.name,
                type: screenAttachment.type,
                size: screenAttachment.size,
                processed: screenAttachment.processed
              }];

              // Create a special metadata comment that can be parsed later for display
              const displayInfo = `[DISPLAY_META:${JSON.stringify({
                originalMessage: originalTranscription,
                displayAttachments: displayAttachments
              })}]`;
              messageWithPrefix = `${displayInfo}\n\n${messageWithPrefix}`;

              addInfoNotification(
                'Screen Captured',
                'Current screen captured and included with your voice message.',
                3000
              );

              console.log('🎤 Screen capture added to voice message');
            }
          } catch (error) {
            console.error('Failed to capture screen for voice message:', error);
            addErrorNotification(
              'Screen Capture Failed',
              'Could not capture screen for this voice message.',
              3000
            );
          }
        }
        
        // Send the prefixed message to AI using the existing onSendMessage prop
        // The parent component will handle the actual message sending and display
        if (onSendMessage) {
          // Send the message with attachments if screen capture was successful
          onSendMessage(messageWithPrefix, attachments);
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
  }, [onSendMessage, isScreenSharing, addInfoNotification, addErrorNotification]);

  // Simple voice mode toggle
  const handleVoiceModeToggle = useCallback(() => {
    // Check if Python backend is available
    if (!pythonBackendStatus.isHealthy) {
      addErrorNotification(
        'Python Backend Required',
        'Voice functionality requires Python backend. Please start the Python backend first.',
        5000
      );
      return;
    }

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
      addInfoNotification('Voice mode activated! Click and hold the microphone to speak.', 'Voice input is now ready for use.', 4000);
    }
  }, [isVoiceChatEnabled, pythonBackendStatus.isHealthy, addErrorNotification, addInfoNotification]);

  const handleVoiceToggle = useCallback(() => {
    setIsVoiceChatEnabled(!isVoiceChatEnabled);
  }, [isVoiceChatEnabled]);

  // Python backend handlers for voice functionality
  const checkPythonBackendStatus = useCallback(async () => {
    try {
      if (!(window as any).electronAPI) {
        setPythonBackendStatus({ isHealthy: false, serviceUrl: null, error: 'Electron API not available' });
        return;
      }

      const status = await (window as any).electronAPI.invoke('check-python-status');
      setPythonBackendStatus({
        isHealthy: status.isHealthy || false,
        serviceUrl: status.serviceUrl,
        error: status.error
      });
    } catch (error) {
      console.error('Error checking Python backend status:', error);
      setPythonBackendStatus({ 
        isHealthy: false, 
        serviceUrl: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }, []);

  const handleStartPythonBackend = useCallback(async () => {
    try {
      if (!(window as any).electronAPI) {
        addErrorNotification(
          'Python Backend Error',
          'Electron API not available'
        );
        return;
      }

      setIsPythonStarting(true);
      console.log('🐍 Starting Python backend for voice functionality...');
      
      addInfoNotification(
        'Starting Python Backend',
        'Starting Python backend for voice functionality...',
        3000
      );

      const result = await (window as any).electronAPI.invoke('start-python-container');
      
      if (result.success) {
        console.log('✅ Python backend started successfully');
        addInfoNotification('Python backend started successfully! Voice input is now available.', 'Voice functionality is now ready to use.', 5000);
        // Recheck status after successful start
        await checkPythonBackendStatus();
      } else {
        console.error('❌ Failed to start Python backend:', result.error);
        addErrorNotification(
          'Python Backend Failed',
          `Failed to start Python backend: ${result.error}. Please ensure Docker is running.`, 
          7000
        );
      }
    } catch (error) {
      console.error('Error starting Python backend:', error);
      addErrorNotification(
        'Python Backend Error',
        `Error starting Python backend: ${error instanceof Error ? error.message : 'Unknown error'}`,
        7000
      );
    } finally {
      setIsPythonStarting(false);
    }
  }, [checkPythonBackendStatus, addInfoNotification, addErrorNotification]);

  // Apps dropdown toggle handler
  const handleAppsToggle = useCallback(() => {
    setShowAppsDropdown(!showAppsDropdown);
  }, [showAppsDropdown]);

  // Screen share handler
  const handleScreenShare = useCallback(async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          setScreenStream(null);
          setIsScreenSharing(false);
          
          // Clean up video element
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
          }
          
          addInfoNotification(
            'Screen Sharing Stopped',
            'Clara is no longer capturing your screen.',
            3000
          );
        }
        setShowAppsDropdown(false);
        return;
      }

      // Check if we're in Electron
      const isElectron = typeof window !== 'undefined' && window.electronScreenShare;
      
      if (isElectron) {
        // Electron screen sharing with picker
        try {
          // Check screen access permission on macOS
          const accessStatus = await window.electronScreenShare?.getScreenAccessStatus();
          if (accessStatus?.status === 'denied') {
            const requestResult = await window.electronScreenShare?.requestScreenAccess();
            if (!requestResult?.granted) {
              addErrorNotification(
                'Permission Denied',
                'Screen recording permission is required. Please grant permission in System Preferences.',
                7000
              );
              return;
            }
          }

          // Get available desktop sources
          const sources = await window.electronScreenShare?.getDesktopSources();
          if (!sources || sources.length === 0) {
            addErrorNotification(
              'No Screens Available',
              'No screens or windows available for sharing.',
              5000
            );
            return;
          }

          // Show screen source picker
          setAvailableSources(sources);
          setShowScreenPicker(true);
          setShowAppsDropdown(false);

        } catch (electronError: any) {
          console.error('Electron screen share error:', electronError);
          addErrorNotification(
            'Screen Sharing Failed',
            `Failed to start screen sharing: ${electronError?.message || 'Unknown error'}`,
            5000
          );
        }
      } else {
        // Browser screen sharing fallback
        if (!navigator.mediaDevices?.getDisplayMedia) {
          addErrorNotification(
            'Screen Sharing Not Supported',
            'Your browser does not support screen sharing. Please use Chrome, Firefox, or Edge.',
            5000
          );
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
              width: { ideal: 3840, max: 3840 }, // 4K support
              height: { ideal: 2160, max: 2160 },
              frameRate: { ideal: 60, max: 60 } // Higher frame rate
            },
            audio: false
          });

          if (!screenVideoRef.current) {
            screenVideoRef.current = document.createElement('video');
            screenVideoRef.current.style.display = 'none';
            document.body.appendChild(screenVideoRef.current);
          }

          screenVideoRef.current.srcObject = stream;
          await screenVideoRef.current.play();

          setScreenStream(stream);
          setIsScreenSharing(true);
          setShowAppsDropdown(false);

          stream.getVideoTracks()[0].addEventListener('ended', () => {
            setIsScreenSharing(false);
            setScreenStream(null);
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = null;
            }
          });

          addInfoNotification(
            'Screen Sharing Active',
            'Clara will now capture your screen with each message.',
            5000
          );
        } catch (error: any) {
          addErrorNotification(
            'Screen Sharing Failed',
            error.name === 'NotAllowedError' ? 'Permission denied' : 'Failed to start screen sharing',
            5000
          );
        }
      }
    } catch (error: any) {
      console.error('Screen share error:', error);
      addErrorNotification(
        'Screen Sharing Failed',
        'An unexpected error occurred',
        5000
      );
    }
  }, [isScreenSharing, screenStream]);

  // Capture screen as base64 image
  const captureScreen = useCallback(async (): Promise<string | null> => {
    if (!isScreenSharing || !screenVideoRef.current || !screenStream) {
      return null;
    }

    try {
      const video = screenVideoRef.current;
      
      // Check if video is ready and has valid dimensions
      if (video.readyState < 2) {
        // Wait for video to be ready with timeout
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video load timeout'));
          }, 3000);
          
          const handleLoaded = () => {
            clearTimeout(timeout);
            resolve(void 0);
          };
          
          if (video.readyState >= 2) {
            clearTimeout(timeout);
            resolve(void 0);
          } else {
            video.addEventListener('loadeddata', handleLoaded, { once: true });
            video.addEventListener('canplay', handleLoaded, { once: true });
          }
        });
      }

      // Verify video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error('Video has invalid dimensions');
      }

      // Create canvas to capture the frame
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Set canvas size to match video (preserve original resolution)
      let { videoWidth, videoHeight } = video;
      
      // Only scale down if absolutely necessary for memory/performance
      const maxWidth = 3840; // 4K support
      const maxHeight = 2160;
      
      if (videoWidth > maxWidth || videoHeight > maxHeight) {
        const ratio = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
        videoWidth = Math.floor(videoWidth * ratio);
        videoHeight = Math.floor(videoHeight * ratio);
      }

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      // Use high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Convert to base64 with highest quality
      // Use PNG for lossless quality, fallback to high-quality JPEG if PNG is too large
      let dataURL = canvas.toDataURL('image/png'); // Lossless PNG
      
      // If PNG is too large (>10MB base64), use high-quality JPEG
      if (dataURL.length > 10 * 1024 * 1024) {
        dataURL = canvas.toDataURL('image/jpeg', 0.95); // 95% quality JPEG
      }
      
      const base64 = dataURL.split(',')[1]; // Remove data URL prefix

      return base64;
    } catch (error) {
      console.error('Failed to capture screen:', error);
      addErrorNotification(
        'Screen Capture Failed',
        `Failed to capture current screen: ${error instanceof Error ? error.message : 'Unknown error'}`,
        3000
      );
      return null;
    }
  }, [isScreenSharing, screenStream]);

  // Add token formatting utility function
  const formatTokens = (tokens: number): string => {
    if (tokens <= 1000) {
      return tokens.toString();
    } else {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
  };

  // Check for provider health when switching modes
  useEffect(() => {
    if (sessionConfig?.aiConfig?.provider) {
      checkProviderHealth();
    }
  }, [sessionConfig?.aiConfig?.provider, checkProviderHealth]);

  // Load available image models for image generation
  useEffect(() => {
    const loadImageModels = async () => {
      try {
        // Check if ComfyUI is available
        if (!(window as any).electronAPI) {
          console.log('ComfyUI not available - electronAPI not found');
          return;
        }
        
        // Get ComfyUI service status using the specific ComfyUI status handler
        const comfyuiStatus = await (window as any).electronAPI.invoke('comfyui-status');
        
        console.log('🎨 ComfyUI Status Check:', comfyuiStatus);
        
        // Check if ComfyUI is running (status.running should be true)
        if (comfyuiStatus.running) {
          // Try to connect to ComfyUI and get models
          try {
            const { Client } = await import('@stable-canvas/comfyui-client');
            const url = comfyuiStatus.url || `http://localhost:${comfyuiStatus.port || 8188}`;
            let processedUrl = url;
            if (url.includes('http://') || url.includes('https://')) {
              processedUrl = url.split('//')[1];
            }
            const ssl_type = url.includes('https') ? true : false;
            
            console.log('🔗 Connecting to ComfyUI at:', url);
            const client = new Client({ api_host: processedUrl, ssl: ssl_type });
            
            // Try to connect and get models
            client.connect();
            
            // Wait for connection with timeout
            const waitForConnection = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
              }, 5000);
              
              const checkConnection = () => {
                if (client.socket && client.socket.readyState === WebSocket.OPEN) {
                  clearTimeout(timeout);
                  resolve(true);
                } else {
                  setTimeout(checkConnection, 100);
                }
              };
              
              checkConnection();
            });
            
            await waitForConnection;
            
            // Get models
            const models = await client.getSDModels();
            setAvailableImageModels(models);
            setImageGenEnabled(models.length > 0);
            console.log('✅ Loaded', models.length, 'image generation models');
            
            // Clean up client
            client.close();
            
          } catch (error) {
            console.log('❌ Failed to connect to ComfyUI:', error);
            setImageGenEnabled(false);
            setAvailableImageModels([]);
          }
        } else {
          console.log('⚠️ ComfyUI service not running, status:', comfyuiStatus.running, 'error:', comfyuiStatus.error);
          setImageGenEnabled(false);
          setAvailableImageModels([]);
        }
      } catch (error) {
        console.log('❌ Error loading image models:', error);
        setImageGenEnabled(false);
        setAvailableImageModels([]);
      }
    };

    // Load models immediately
    loadImageModels();
    
    // Set up periodic refresh every 30 seconds
    const interval = setInterval(loadImageModels, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  // Check Python backend status for voice functionality
  useEffect(() => {
    // Check status immediately
    checkPythonBackendStatus();
    
    // Set up periodic check every 30 seconds
    const interval = setInterval(checkPythonBackendStatus, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [checkPythonBackendStatus]);

  // Debug function for troubleshooting image generation
  useEffect(() => {
    // Make debug functions available globally for troubleshooting
    (window as any).debugImageGeneration = async () => {
      console.log('=== Image Generation Debug Info ===');
      console.log('imageGenEnabled:', imageGenEnabled);
      console.log('availableImageModels:', availableImageModels);
      
      try {
        if ((window as any).electronAPI) {
          const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
          console.log('Service Status:', status);
          
          const comfyuiStatus = await (window as any).electronAPI.invoke('comfyui-status');
          console.log('ComfyUI Status:', comfyuiStatus);
        } else {
          console.log('electronAPI not available');
        }
      } catch (error) {
        console.error('Error getting service status:', error);
      }
    };
    
    (window as any).testImageGenConnection = async () => {
      console.log('=== Testing Image Generation Connection ===');
      try {
        const comfyuiStatus = await (window as any).electronAPI.invoke('comfyui-status');
        console.log('ComfyUI Status:', comfyuiStatus);
        
        if (comfyuiStatus.running) {
          const { Client } = await import('@stable-canvas/comfyui-client');
          const url = comfyuiStatus.url || `http://localhost:${comfyuiStatus.port || 8188}`;
          console.log('Testing connection to:', url);
          
          let processedUrl = url;
          if (url.includes('http://') || url.includes('https://')) {
            processedUrl = url.split('//')[1];
          }
          const ssl_type = url.includes('https') ? true : false;
          
          const client = new Client({ api_host: processedUrl, ssl: ssl_type });
          client.connect();
          
          // Test connection
          const models = await client.getSDModels();
          console.log('✅ Connection successful! Found', models.length, 'models:', models);
          client.close();
        } else {
          console.log('❌ ComfyUI not running, state:', comfyuiStatus.state);
        }
      } catch (error) {
        console.error('❌ Connection test failed:', error);
      }
    };
    
    console.log('🔧 Image generation debug functions available:');
    console.log('  - debugImageGeneration() - Show current status');
    console.log('  - testImageGenConnection() - Test ComfyUI connection');
    
    // Cleanup
    return () => {
      delete (window as any).debugImageGeneration;
      delete (window as any).testImageGenConnection;
    };
  }, [imageGenEnabled, availableImageModels]);

  // Handle image generation
  const handleImageGenerated = useCallback(async (imageDataUrl: string, prompt: string, settings: any) => {
    try {
      // Debug logging to understand the image data URL
      console.log('🎨 handleImageGenerated called with:');
      console.log('  - imageDataUrl length:', imageDataUrl?.length);
      console.log('  - imageDataUrl starts with:', imageDataUrl?.substring(0, 50));
      console.log('  - prompt:', prompt);
      console.log('  - settings:', settings);
      
      // Validate imageDataUrl
      if (!imageDataUrl || !imageDataUrl.startsWith('data:')) {
        console.error('❌ Invalid imageDataUrl received:', imageDataUrl);
        addErrorNotification(
          'Invalid Image Data',
          'The generated image data is invalid or corrupted.',
          5000
        );
        return;
      }
      
      // Additional validation for base64 data
      if (!imageDataUrl.includes('base64,')) {
        console.error('❌ ImageDataUrl missing base64 data:', imageDataUrl.substring(0, 50) + '...');
        addErrorNotification(
          'Invalid Image Format',
          'The generated image is not in the expected base64 format.',
          5000
        );
        return;
      }
      
      // Test if the image data URL is actually valid by trying to create an image
      const testImage = new Image();
      const imageValidationPromise = new Promise<boolean>((resolve) => {
        testImage.onload = () => {
          console.log('✅ Image data URL validation successful');
          resolve(true);
        };
        testImage.onerror = () => {
          console.error('❌ Image data URL validation failed');
          resolve(false);
        };
        testImage.src = imageDataUrl;
      });
      
      const isValidImage = await imageValidationPromise;
      if (!isValidImage) {
        console.error('❌ Image data URL failed validation test');
        addErrorNotification(
          'Corrupted Image Data',
          'The generated image data appears to be corrupted and cannot be displayed.',
          5000
        );
        return;
      }
      
      console.log('✅ Image data URL validation passed, proceeding with message creation');
      
      // Create attachment for the generated image (for user message)
      const imageAttachment: ClaraFileAttachment = {
        id: `img-${Date.now()}`,
        name: `generated-image-${Date.now()}.png`,
        type: 'image',
        size: imageDataUrl.length,
        mimeType: 'image/png',
        base64: imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl, // Extract base64 part if data URL
        url: imageDataUrl, // Store the full data URL for display
        processed: true,
        processingResult: {
          success: true,
          imageAnalysis: {
            description: prompt,
            confidence: 1.0
          }
        }
      };

      // Create a user message with the prompt and image attachment
      const userMessage: ClaraMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: new Date(),
        attachments: [imageAttachment], // Store image as attachment on user message
        metadata: {
          imageGeneration: true
        }
      };
      
      // Create a separate attachment for the assistant message (for efficient storage)
      const assistantImageAttachment: ClaraFileAttachment = {
        id: `img-assistant-${Date.now()}`,
        name: `generated-image-result-${Date.now()}.png`,
        type: 'image',
        size: imageDataUrl.length,
        mimeType: 'image/png',
        base64: imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl,
        url: imageDataUrl,
        processed: true,
        processingResult: {
          success: true,
          imageAnalysis: {
            description: `Generated image result for: ${prompt}`,
            confidence: 1.0
          }
        }
      };
      
      // Create assistant message with image reference instead of embedding the large data URL
      const assistantContent = `I've generated an image based on your prompt: "${prompt}". Here's the result:

![Generated Image](${assistantImageAttachment.id})

You can right-click on the image to save it or use it in your projects.`;
      
      const imageMessage: ClaraMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        attachments: [assistantImageAttachment], // Store image as attachment to avoid large content
        metadata: {
          imageGeneration: true,
          model: 'ComfyUI',
          settings: settings
        }
      };
      
      console.log('🎨 Created messages with image attachments on both user and assistant messages');
      console.log('🎨 User message attachments:', userMessage.attachments?.length);
      console.log('🎨 Assistant message attachments:', imageMessage.attachments?.length);
      console.log('🎨 Assistant message content uses attachment ID:', assistantContent.includes(assistantImageAttachment.id));
      
      // Directly add messages to the chat without triggering AI processing
      if (setMessages && currentSession) {
        console.log('🎨 Adding messages to chat...');
        
        // Add both messages in a single state update to prevent race conditions
        setMessages(prev => [...prev, userMessage, imageMessage]);
        
        console.log('🎨 Messages added to chat successfully');
        
        // Save messages to database
        try {
          await claraDB.addClaraMessage(currentSession.id, userMessage);
          await claraDB.addClaraMessage(currentSession.id, imageMessage);
          
          // Update sessions list for real-time sidebar updates
          if (setSessions) {
            setSessions(prev => prev.map(s => 
              s.id === currentSession.id 
                ? { 
                    ...s, 
                    messageCount: (s.messageCount || s.messages?.length || 0) + 2, // +2 for both messages
                    updatedAt: new Date()
                  }
                : s
            ));
          }
          
          console.log('🎨 Messages saved to database successfully');
        } catch (error) {
          console.error('Failed to save generated image messages:', error);
        }
      } else {
        console.error('❌ Cannot add messages - setMessages or currentSession is missing');
        console.log('  - setMessages:', !!setMessages);
        console.log('  - currentSession:', !!currentSession);
      }
      
      // Show success notification
      addInfoNotification(
        'Image Generated',
        'Your image has been generated and added to the chat.',
        3000
      );
      
    } catch (error) {
      console.error('Error handling generated image:', error);
      addErrorNotification(
        'Image Generation Error',
        'Failed to add the generated image to the chat.',
        5000
      );
    }
  }, [setMessages, currentSession, setSessions]);

  // Handle image generation button click
  const handleImageGenClick = useCallback(() => {
    console.log('🎨 Image generation button clicked');
    console.log('🎨 imageGenEnabled:', imageGenEnabled);
    console.log('🎨 availableImageModels:', availableImageModels);
    
    if (!imageGenEnabled) {
      console.log('⚠️ Image generation disabled - showing notification');
      addInfoNotification(
        'Image Generation Unavailable',
        availableImageModels.length === 0 
          ? 'ComfyUI is not running or no image models are available. Please check your ComfyUI setup in Settings.'
          : 'ComfyUI service is not ready. Please wait for it to start or check Settings.',
        6000
      );
      return;
    }
    
    console.log('✅ Opening image generation widget');
    setShowImageGenWidget(true);
  }, [imageGenEnabled, availableImageModels]);

  // Cleanup screen sharing on component unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = null;
          if (screenVideoRef.current.parentNode) {
            screenVideoRef.current.parentNode.removeChild(screenVideoRef.current);
          }
        }
      }
    };
  }, [screenStream]);

  // Browser detection for better error messages
  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor);
    const isFirefox = /Firefox/.test(userAgent);
    const isEdge = /Edg/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    const isOpera = /OPR/.test(userAgent);
    
    return { isChrome, isFirefox, isEdge, isSafari, isOpera };
  };

  // Handle screen source selection from picker
  const handleScreenSourceSelect = useCallback(async (selectedSource: { id: string; name: string; thumbnail: string }) => {
    try {
      setShowScreenPicker(false);

      // Use Electron's desktopCapturer with the selected source
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            maxWidth: 3840, // Support 4K resolution
            maxHeight: 2160,
            minWidth: 1280, // Minimum quality threshold
            minHeight: 720,
            maxFrameRate: 60 // Higher frame rate for smoother capture
          }
        } as any
      });

      // Set up video element
      if (!screenVideoRef.current) {
        screenVideoRef.current = document.createElement('video');
        screenVideoRef.current.style.display = 'none';
        screenVideoRef.current.style.position = 'absolute';
        screenVideoRef.current.style.top = '-9999px';
        screenVideoRef.current.muted = true;
        screenVideoRef.current.playsInline = true;
        document.body.appendChild(screenVideoRef.current);
      }

      screenVideoRef.current.srcObject = stream;
      
      // Wait for video to load before playing
      await new Promise((resolve, reject) => {
        if (screenVideoRef.current) {
          screenVideoRef.current.onloadedmetadata = () => resolve(void 0);
          screenVideoRef.current.onerror = reject;
          screenVideoRef.current.play().catch(reject);
        }
      });

      setScreenStream(stream);
      setIsScreenSharing(true);

      // Listen for stream end
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setIsScreenSharing(false);
        setScreenStream(null);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = null;
        }
        addInfoNotification(
          'Screen Sharing Ended',
          'Screen sharing was stopped.',
          3000
        );
      });

      addInfoNotification(
        'Screen Sharing Active',
        `Clara will now capture "${selectedSource.name}" with each message you send.`,
        5000
      );

    } catch (error: any) {
      console.error('Failed to start screen sharing with selected source:', error);
      addErrorNotification(
        'Screen Sharing Failed',
        `Failed to start screen sharing: ${error?.message || 'Unknown error'}`,
        5000
      );
    }
  }, []);

  // Check if Clara's Pocket is currently starting
  const isServiceStarting = offlineProvider?.type === 'claras-pocket' && 
    providerOfflineMessage.includes('starting');

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
                      
                      // Close autonomous agent status panel when user focuses input
                      if (autonomousAgentStatus?.isActive) {
                        console.log('🏁 Input focused - closing autonomous agent status panel');
                        autonomousAgentStatus.completeAgent('Input focused - closing status panel', 0);
                      }
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
                      
                      <Tooltip content={imageGenEnabled ? "Generate image" : "Image generation unavailable - ComfyUI not running"} position="top">
                        <button
                          onClick={handleImageGenClick}
                          className={`p-1.5 rounded-md transition-colors ${
                            imageGenEnabled 
                              ? 'hover:bg-white dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400' 
                              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                          }`}
                          disabled={isLoading || !imageGenEnabled}
                        >
                          <Palette className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>

                    {/* Voice Input */}
                    <div className="relative">
                      {pythonBackendStatus.isHealthy ? (
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
                      ) : (
                        <Tooltip content={
                          pythonBackendStatus.error 
                            ? `Voice unavailable: ${pythonBackendStatus.error}. Click to start Python backend.`
                            : "Voice requires Python backend. Click to start."
                        } position="top">
                          <button
                            onClick={handleStartPythonBackend}
                            className="p-2 rounded-lg transition-colors mr-3 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
                            disabled={isLoading || isPythonStarting}
                          >
                            {isPythonStarting ? (
                              <div className="w-4 h-4 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
                            ) : (
                              <Mic className="w-4 h-4" />
                            )}
                          </button>
                        </Tooltip>
                      )}
                    </div>

                    {/* Apps */}
                    <div className="relative">
                      <Tooltip content={isScreenSharing ? "Clara Apps (Screen Sharing Active)" : "Clara Apps"} position="top">
                        <button
                          onClick={handleAppsToggle}
                          className={`p-2 rounded-lg transition-colors mr-3 ${
                            showAppsDropdown || isScreenSharing
                              ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-600 dark:text-sakura-400' 
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}
                          disabled={isLoading}
                        >
                          <Grid3X3 className="w-4 h-4" />
                          {isScreenSharing && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900"></div>
                          )}
                        </button>
                      </Tooltip>
                      
                      <AppsDropdown
                        show={showAppsDropdown}
                        onClose={() => setShowAppsDropdown(false)}
                        onScreenShare={handleScreenShare}
                        isScreenSharing={isScreenSharing}
                      />
                    </div>

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
                              <span>Text and Image</span>
                            </>
                          ) : (
                            <>
                              <Cog className="w-3 h-3" />
                              <span>Agents</span>
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
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isServiceStarting 
                  ? 'bg-blue-100 dark:bg-blue-900' 
                  : 'bg-red-100 dark:bg-red-900'
              }`}>
                {isServiceStarting ? (
                  <div className="w-6 h-6 text-blue-600 dark:text-blue-400">
                    <svg className="animate-spin w-full h-full" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-3">
              {isServiceStarting ? 'Starting Clara\'s Pocket' : 'Provider Not Responding (Probably Restarting)'}
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
              {providerOfflineMessage}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              {offlineProvider?.type === 'claras-pocket' && !isServiceStarting ? (
                // If current provider is Clara Core and NOT starting, offer to start it
                <button
                  onClick={handleStartClaraCore}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  <Server className="w-5 h-5" />
                  <span>Start Clara's Pocket</span>
                </button>
              ) : offlineProvider?.type !== 'claras-pocket' ? (
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
              ) : null}
              
              <button
                onClick={() => setShowProviderOfflineModal(false)}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                {isServiceStarting ? 'Hide' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen Source Picker */}
      <ScreenSourcePicker
        show={showScreenPicker}
        sources={availableSources}
        onSelect={handleScreenSourceSelect}
        onClose={() => setShowScreenPicker(false)}
      />

      {/* Image Generation Widget */}
      <ChatImageGenWidget
        isOpen={showImageGenWidget}
        onClose={() => setShowImageGenWidget(false)}
        onImageGenerated={handleImageGenerated}
        initialPrompt={input}
        availableModels={availableImageModels}
      />
    </div>
  );
};

export { AdvancedOptions };
export default ClaraAssistantInput;