import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Loader2, Bot, Trash2, Settings, ChevronDown, Wand2, Scissors, Copy, CheckCircle, AlertCircle, Zap, Brain, Target, Sparkles, RotateCcw, History, Clock, AlertTriangle, User, ArrowDown, ChevronUp } from 'lucide-react';
import { LiteProjectFile } from '../LumaUILite';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import LumaUILiteAPIClient, { ChatMessage as LiteChatMessage } from './services/LumaUILiteAPIClient';
import LumaUILiteTools, { createLumaUILiteTools } from './services/LumaUILiteTools';
import { useProviders } from '../../contexts/ProvidersContext';
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

// AI Parameters interface
interface AIParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

// Props interface
interface ResponsiveChatWindowProps {
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

// Scroll to bottom hook
const useScrollToBottom = (messages: Message[], isLoading: boolean) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end'
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const threshold = 100; // pixels from bottom
      const isNear = scrollTop + clientHeight >= scrollHeight - threshold;
      
      setIsNearBottom(isNear);
      setShowScrollButton(!isNear && scrollHeight > clientHeight * 1.5);
    }
  }, []);

  // Auto-scroll when new messages arrive, but only if user is near bottom
  useEffect(() => {
    if (isNearBottom) {
      const timer = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timer);
    }
  }, [messages, isLoading, isNearBottom, scrollToBottom]);

  // Auto-scroll when loading starts
  useEffect(() => {
    if (isLoading && isNearBottom) {
      scrollToBottom();
    }
  }, [isLoading, isNearBottom, scrollToBottom]);

  return {
    messagesEndRef,
    containerRef,
    scrollToBottom,
    handleScroll,
    showScrollButton,
    isNearBottom
  };
};

// Message bubble component
const MessageBubble: React.FC<{
  message: Message;
  checkpoint?: LumaUILiteCheckpoint;
  onCopy: (text: string) => void;
}> = ({ message, checkpoint, onCopy }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  
  const shouldTruncate = message.content.length > 2000;
  const displayContent = shouldTruncate && !isExpanded 
    ? message.content.substring(0, 2000) + '...'
    : message.content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCopy(message.content);
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="group relative">
      <div className={`flex items-start gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
          message.type === 'user' ? 'bg-gray-600' : 'bg-sakura-500'
        }`}>
          {message.type === 'user' ? 
            <User className="w-4 h-4 text-white" /> : 
            <Bot className="w-4 h-4 text-white" />
          }
        </div>

        {/* Message Content */}
        <div className={`relative flex-1 min-w-0 max-w-[85%] px-4 py-3 rounded-2xl ${
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

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={`absolute top-2 ${message.type === 'user' ? 'left-2' : 'right-2'} p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
              message.type === 'user' 
                ? 'hover:bg-white/20 text-white/70 hover:text-white' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
            title="Copy message"
          >
            <Copy className="w-3 h-3" />
          </button>

          {/* Copy Toast */}
          {showCopyToast && (
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded shadow-lg">
              Copied!
            </div>
          )}
          
          {/* Message Content */}
          <div className={`prose prose-sm max-w-none ${
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
                  <ul className={`list-disc list-inside mb-2 space-y-1 ${
                    message.type === 'user' 
                      ? 'text-white' 
                      : 'text-gray-900 dark:text-gray-100'
                  }`} {...props} />
                ),
                ol: ({...props}: any) => (
                  <ol className={`list-decimal list-inside mb-2 space-y-1 ${
                    message.type === 'user' 
                      ? 'text-white' 
                      : 'text-gray-900 dark:text-gray-100'
                  }`} {...props} />
                ),
                li: ({...props}: any) => (
                  <li className={`break-words ${
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
                    <div className="my-3 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-800 px-3 py-2 text-xs">
                        <span className="text-gray-300">{match[1]}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(String(children))}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={match[1]}
                        PreTag="div"
                        className="text-sm !m-0"
                        wrapLongLines={true}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
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
              {displayContent}
            </ReactMarkdown>
          </div>

          {/* Expand/Collapse Button */}
          {shouldTruncate && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`mt-2 flex items-center gap-1 text-xs ${
                message.type === 'user' 
                  ? 'text-white/80 hover:text-white' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show more ({Math.round((message.content.length - 2000) / 1000)}k more characters)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Loading indicator component
const LoadingMessage: React.FC<{ currentTask?: string }> = ({ currentTask }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-sakura-500">
      <Bot className="w-4 h-4 text-white" />
    </div>
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
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
);

// Main responsive chat window component
const ResponsiveChatWindow: React.FC<ResponsiveChatWindowProps> = ({
  projectFiles,
  onUpdateFile,
  onCreateFile,
  onDeleteFile,
  onProjectUpdate,
  selectedFile,
  onFileSelect,
  projectId,
  projectName,
  showAISettingsModal,
  onShowAISettingsModal,
  onCloseAISettingsModal,
  onAISettingsChange
}) => {
  // Get providers from context
  const { providers, loading: providersLoading } = useProviders();
  
  // Default welcome message
  const defaultMessages: Message[] = [
    {
      id: '1',
      type: 'assistant',
      content: '🎨 **Welcome to LumaUI-lite Design Studio!**\n\nI\'m your expert UI/UX designer and frontend developer. I specialize in creating stunning, modern web applications with the latest design trends and popular libraries!\n\n✨ **What I can create:**\n🎯 **Beautiful UI Components** with glassmorphism & animations\n🌈 **Modern Design Systems** with Tailwind CSS & custom styling\n📱 **Responsive Layouts** that work perfectly on all devices\n🚀 **Interactive Elements** with smooth animations & micro-interactions\n💫 **Popular Libraries** like Alpine.js, AOS, Swiper, Chart.js, GSAP\n\n**Design Examples:**\n- "Create a stunning hero section with animated background"\n- "Build a glassmorphic navigation with smooth scroll"\n- "Design a modern contact form with floating labels"\n- "Add a testimonial carousel with Swiper.js"\n- "Create an animated pricing section with hover effects"\n- "Build a dark mode toggle with smooth transitions"\n\n**I always use popular libraries like:**\n• Tailwind CSS for styling\n• Font Awesome for icons\n• Alpine.js for interactivity\n• AOS for scroll animations\n• Google Fonts for typography\n\nTell me what amazing UI you want to create! 🚀',
      timestamp: new Date()
    }
  ];

  // State management
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState('');
  const [isAutoMode, setIsAutoMode] = useState(false);
  
  // Provider state
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [apiClient, setApiClient] = useState<LumaUILiteAPIClient | null>(null);
  
  // AI parameters
  const [parameters, setParameters] = useState<AIParameters>({
    temperature: 0.7,
    maxTokens: 32000,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxIterations: 15
  });

  // Custom system prompt
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');

  // Checkpoint management
  const { 
    createCheckpoint, 
    revertToCheckpoint, 
    clearCheckpoints, 
    getCheckpointByMessageId, 
    checkpoints, 
    setCurrentProject, 
    loadProjectData 
  } = useLumaUILiteCheckpoints();

  // Scroll management
  const {
    messagesEndRef,
    containerRef,
    scrollToBottom,
    handleScroll,
    showScrollButton,
    isNearBottom
  } = useScrollToBottom(messages, isLoading);

  // Input reference
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Initialize with first available provider
  useEffect(() => {
    if (providers.length > 0 && !selectedProviderId) {
      const firstProvider = providers[0];
      setSelectedProviderId(firstProvider.id);
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

  // Expose AI settings to parent
  useEffect(() => {
    if (onAISettingsChange) {
      onAISettingsChange({
        selectedProviderId,
        selectedModel,
        parameters,
        availableModels,
        customSystemPrompt,
        handleProviderChange: setSelectedProviderId,
        handleModelChange: setSelectedModel,
        handleParametersChange: setParameters,
        handleSystemPromptChange: setCustomSystemPrompt
      });
    }
  }, [selectedProviderId, selectedModel, parameters, availableModels, customSystemPrompt, onAISettingsChange]);

  // Handle message sending
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !apiClient || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setCurrentTask('AI is processing your request...');

    try {
      // Build conversation history
      const conversationHistory: LiteChatMessage[] = [
        {
          role: 'system',
          content: customSystemPrompt || `You are an expert UI/UX designer and frontend developer. You specialize in creating modern, beautiful web applications using the latest design trends and popular libraries. Always provide complete, working code examples.`
        },
        ...messages.slice(1).map(msg => ({
          role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content
        })),
        {
          role: 'user',
          content: userMessage.content
        }
      ];

      const response = await apiClient.sendChat(
        selectedModel,
        conversationHistory,
        {
          temperature: parameters.temperature,
          max_tokens: parameters.maxTokens,
          top_p: parameters.topP,
          frequency_penalty: parameters.frequencyPenalty,
          presence_penalty: parameters.presencePenalty
        }
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.message?.content || 'Sorry, I couldn\'t generate a response.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error occurred'}. Please check your AI settings and try again.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentTask('');
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Clear chat
  const clearChat = async () => {
    if (confirm('Are you sure you want to clear the chat? This will also delete all checkpoints.')) {
      setMessages(defaultMessages);
      clearCheckpoints();
      if (projectId) {
        ChatPersistence.clearChatData(projectId);
      }
    }
  };

  // Copy message content
  const handleCopyMessage = (content: string) => {
    // Parent can handle this if needed
  };

  // Get checkpoint for message
  const getCheckpointForMessage = (messageId: string) => {
    return getCheckpointByMessageId ? getCheckpointByMessageId(messageId) : undefined;
  };

  // Format time
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
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
        </div>
      </div>

      {/* Messages Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-gray-900 relative"
        style={{ height: 0 }} // This forces the flex-1 to work properly
      >
        <div className="p-4 space-y-4 min-h-full">
          {messages.map((message) => {
            const checkpoint = getCheckpointForMessage(message.id);
            return (
              <MessageBubble
                key={message.id}
                message={message}
                checkpoint={checkpoint}
                onCopy={handleCopyMessage}
              />
            );
          })}
          
          {/* Loading State */}
          {isLoading && (
            <LoadingMessage currentTask={currentTask} />
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 right-4 w-10 h-10 bg-sakura-500 text-white rounded-full shadow-lg hover:bg-sakura-600 transition-colors flex items-center justify-center z-10"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
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
      </div>
    </div>
  );
};

export default ResponsiveChatWindow; 
