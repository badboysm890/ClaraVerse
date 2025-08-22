import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Trash2, Settings, ChevronDown, Zap, Server, Globe } from 'lucide-react';
import { useProviders } from '../contexts/ProvidersContext';
import { LumaUIAPIClient, ChatMessage as LumaChatMessage } from './lumaui_components/services/lumaUIApiClient';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Model {
  id: string;
  name: string;
}

interface ChatWindowProps {
  selectedFile?: string | null;
  fileContent?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ selectedFile, fileContent }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m your AI coding assistant for LumaUI. I can help you with:\n\n• Code review and suggestions\n• Debugging issues\n• Explaining code functionality\n• Best practices\n• Framework-specific questions\n• Project scaffolding guidance\n\nHow can I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [apiClient, setApiClient] = useState<LumaUIAPIClient | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const { providers, primaryProvider, loading: providersLoading } = useProviders();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with primary provider
  useEffect(() => {
    if (primaryProvider && !selectedProvider) {
      setSelectedProvider(primaryProvider.id);
    }
  }, [primaryProvider, selectedProvider]);

  // Load models when provider changes
  useEffect(() => {
    const loadModels = async () => {
      if (!selectedProvider) {
        console.log('[ChatWindow] No provider selected');
        return;
      }
      
      const provider = providers.find(p => p.id === selectedProvider);
      if (!provider) {
        console.log('[ChatWindow] Provider not found:', selectedProvider);
        return;
      }

      console.log('[ChatWindow] Loading models for provider:', provider.name);
      setIsLoadingModels(true);
      try {
        // Create API client for this provider
        const client = new LumaUIAPIClient(provider.baseUrl || '', {
          apiKey: provider.apiKey || '',
          providerId: provider.id
        });
        setApiClient(client);
        console.log('[ChatWindow] API client created for:', provider.name);

        // Test connection and load models
        const isConnected = await client.checkConnection();
        console.log('[ChatWindow] Connection test result:', isConnected);
        if (isConnected) {
          const models = await client.listModels();
          const modelList: Model[] = models.map(m => ({
            id: m.id,
            name: m.name || m.id
          }));
          setAvailableModels(modelList);
          console.log('[ChatWindow] Models loaded:', modelList.length);
          
          // Auto-select first model if none selected
          if (modelList.length > 0 && !selectedModel) {
            setSelectedModel(modelList[0].id);
            console.log('[ChatWindow] Auto-selected model:', modelList[0].id);
          }
        } else {
          console.warn('Failed to connect to provider:', provider.name);
          setAvailableModels([]);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        setAvailableModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, [selectedProvider, providers]);

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'openai':
        return Zap;
      case 'ollama':
        return Server;
      case 'angelas-pocket':
        return Bot;
      default:
        return Globe;
    }
  };

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'openai':
        return 'text-green-500';
      case 'ollama':
        return 'text-blue-500';
      case 'angelas-pocket':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !apiClient || !selectedModel) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Prepare context with file content if available
      let contextualContent = inputMessage;
      if (selectedFile && fileContent) {
        contextualContent = `File: ${selectedFile}\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nQuestion: ${inputMessage}`;
      }

      // Prepare messages for API
      const apiMessages: LumaChatMessage[] = [
        {
          role: 'system',
          content: 'You are an AI coding assistant for LumaUI, a dynamic project scaffolding and development environment. You help users with code review, debugging, best practices, and project development guidance. When analyzing code, provide specific, actionable suggestions.'
        },
        ...messages.slice(1).map(msg => ({
          role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content
        })),
        {
          role: 'user',
          content: contextualContent
        }
      ];

      // Send to API
      const response = await apiClient.sendChat(selectedModel, apiMessages, {
        temperature: 0.7,
        max_tokens: 2000
      });

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
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error occurred'}. Please check your provider settings or try a different model.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: '1',
        type: 'assistant',
        content: 'Chat cleared! How can I help you with your LumaUI project?',
        timestamp: new Date()
      }
    ]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const selectedProviderObj = providers.find(p => p.id === selectedProvider);
  
  // Check if AI is configured (for warnings and status)
  const isAIConfigured = selectedProvider && selectedModel && apiClient;
  
  // Check if user can actually send a message (includes typed content)
  const canSendMessage = !isLoading && inputMessage.trim() && isAIConfigured;

  // Debug logging
  useEffect(() => {
    console.log('[ChatWindow] Configuration status:', {
      selectedProvider,
      selectedModel,
      hasApiClient: !!apiClient,
      isAIConfigured,
      providersCount: providers.length,
      availableModelsCount: availableModels.length
    });
  }, [selectedProvider, selectedModel, apiClient, isAIConfigured, providers.length, availableModels.length]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            LumaUI Assistant
          </span>
          <div className={`w-2 h-2 rounded-full ${isAIConfigured ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="AI Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AI Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            {/* Provider Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                AI Provider
              </label>
              <div className="relative">
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  disabled={providersLoading}
                  className="w-full text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-8"
                >
                  <option value="">Select Provider...</option>
                  {providers.filter(p => p.isEnabled).map(provider => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} {provider.isPrimary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>
              {selectedProviderObj && (
                <div className="flex items-center gap-1 mt-1">
                  {React.createElement(getProviderIcon(selectedProviderObj.type), {
                    className: `w-3 h-3 ${getProviderColor(selectedProviderObj.type)}`
                  })}
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {selectedProviderObj.baseUrl}
                  </span>
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoadingModels || !selectedProvider}
                  className="w-full text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-8"
                >
                  <option value="">
                    {isLoadingModels ? 'Loading models...' : 'Select Model...'}
                  </option>
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>
              {availableModels.length === 0 && selectedProvider && !isLoadingModels && (
                <div className="text-xs text-red-500 mt-1">
                  No models available. Check provider connection.
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Status: {isAIConfigured ? 'Ready' : 'Not configured'}
              </span>
              {!isAIConfigured && (
                <span className="text-amber-500">
                  Select provider & model
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'assistant' && (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-3 h-3 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.type === 'user'
                    ? 'text-blue-100'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>
            {message.type === 'user' && (
              <div className="w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Context Info */}
      {selectedFile && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800">
          <div className="text-xs text-blue-600 dark:text-blue-400">
            📁 Context: {selectedFile}
          </div>
        </div>
      )}

      {/* Configuration Warning */}
      {!isAIConfigured && !isLoading && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
          <div className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Please configure AI provider and model in settings above to start chatting
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isAIConfigured ? "Ask me anything about your code..." : "Configure AI settings first..."}
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            disabled={isLoading || !isAIConfigured}
          />
          <button
            onClick={handleSendMessage}
            disabled={!canSendMessage}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {isAIConfigured ? 'Press Enter to send, Shift+Enter for new line' : 'AI assistant is not configured'}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow; 
