import React, { useState, useEffect, useRef } from 'react';
import AssistantSidebar from './AssistantSidebar';
import { AssistantHeader, ChatInput, ChatWindow, } from './assistant_components';
import InterpreterChat from './assistant_components/InterpreterChat';
import { useInterpreter } from '../contexts/InterpreterContext';
import { useProviders } from '../contexts/ProvidersContext';

import ImageWarning from './assistant_components/ImageWarning';

import { db } from '../db';
import { AssistantAPIClient } from '../utils';
import type { Chat, Tool } from '../db';
import {
  TemporaryDocument,
  MAX_TEMP_COLLECTIONS,
  getNextTempCollectionName,
  cleanupAllTempCollections
} from './assistantLibrary/tempDocs';
import {
  searchDocuments
} from './assistantLibrary/ragSearch';
import {
  ModelConfig,
  ModelSelectionConfig,
  ApiModelConfig,
  checkModelImageSupport,
  findImageSupportedModel,
  getAppropriateModel
} from './assistantLibrary/modelSelection';
import {
  formatToolForOpenAI,
  executeToolImplementation
} from './assistantLibrary/toolUtils';
import AssistantModals from './AssistantModals';
import { useAssistantChat } from './hooks/useAssistantChat';

// Define model interface based on the API response structure
interface Model {
  name: string;
  id: string;
  digest?: string;
  size?: number;
  modified_at?: string;
}

interface UploadedImage {
  id: string;
  base64: string;
  preview: string;
}

interface AssistantProps {
  onPageChange: (page: string) => void;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const Assistant: React.FC<AssistantProps> = ({ onPageChange }) => {
  const { isInterpreterMode } = useInterpreter();
  const { primaryProvider, loading: providersLoading } = useProviders();
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    // Get stored model for the primary provider
    const providerId = localStorage.getItem('primary_provider_id');
    return providerId ? localStorage.getItem(`selected_model_${providerId}`) || '' : '';
  });
  const [activeAutoModel, setActiveAutoModel] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [isStreaming, setIsStreaming] = useState(() => {
    const stored = localStorage.getItem('assistant_streaming');
    return stored === null ? true : stored === 'true';
  });
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [showImageWarning, setShowImageWarning] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [pythonPort, setPythonPort] = useState<number | null>(null);
  const [temporaryDocs, setTemporaryDocs] = useState<TemporaryDocument[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [useAllTools, setUseAllTools] = useState(false);
  const [useStructuredToolCalling, setUseStructuredToolCalling] = useState(() => {
    // Get stored preference or default to false
    return localStorage.getItem('use_structured_tool_calling') === 'true';
  });
  // const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Check if onboarding has been completed
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    // Only show if onboarding has never been completed
    return !onboardingCompleted;
  });
  const [modelSelectionConfig, setModelSelectionConfig] = useState<ApiModelConfig>(() => {
    const providerId = primaryProvider?.id;
    const storedConfig = localStorage.getItem(`model_selection_config_${providerId}`);
    
    if (storedConfig) {
      return JSON.parse(storedConfig);
    }
    
    // Default config now sets mode to 'auto'
    return {
      type: 'openai', // All providers are OpenAI-compatible now
      mode: 'auto',
      visionModel: '',
      toolModel: '',
      ragModel: ''
    };
  });

  // Initialize or get temporary collection names from localStorage
  const [tempCollectionNames] = useState(() => {
    const stored = localStorage.getItem('temp_collection_names');
    if (stored) {
      return JSON.parse(stored);
    }
    // Create array of fixed collection names
    const names = Array.from({ length: MAX_TEMP_COLLECTIONS }, (_, i) => `temp_collection_${i + 1}`);
    localStorage.setItem('temp_collection_names', JSON.stringify(names));
    return names;
  });

  // Track current collection index
  useEffect(() => {
    return () => {
      if (temporaryDocs.length > 0) {
        cleanupAllTempCollections(tempCollectionNames, pythonPort);
      }
    };
  }, []);

  const getPythonPort = async () => {
    try {
      if (window.electron && window.electron.getPythonPort) {
        return await window.electron.getPythonPort();
      }
      return null;
    } catch (error) {
      console.error('Could not get Python port:', error);
      return null;
    }
  };

  useEffect(() => {
    getPythonPort().then(port => {
      setPythonPort(port);
    });
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    if (!chatContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  const handleNavigateHome = () => {
    onPageChange('dashboard');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: UploadedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_IMAGE_SIZE) {
        console.error(`Image ${file.name} exceeds 10MB limit`);
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newImages.push({
          id: crypto.randomUUID(),
          base64: base64.split(',')[1], // Remove data URL prefix
          preview: base64
        });
      } catch {
        console.error(`Failed to process image ${file.name}`);
      }
    }

    setImages(prev => [...prev, ...newImages]);

    // Just show the warning if images are being used
    if (newImages.length > 0) {
      setShowImageWarning(true);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleTemporaryDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!pythonPort || !activeChat) return;

    const files = event.target.files;
    if (!files) return;

    // Get next collection name
    const tempCollectionName = getNextTempCollectionName(tempCollectionNames);
    const timestamp = Date.now();
    const uploadedDocs: TemporaryDocument[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('collection_name', tempCollectionName);
        formData.append('metadata', JSON.stringify({
          source: 'temporary_upload',
          chat_id: activeChat,
          timestamp: timestamp
        }));

        const response = await fetch(`http://0.0.0.0:${pythonPort}/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

        uploadedDocs.push({
          id: crypto.randomUUID(),
          name: file.name,
          collection: tempCollectionName,
          timestamp: timestamp
        });
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    if (uploadedDocs.length > 0) {
      setTemporaryDocs(prev => [...prev, ...uploadedDocs]);
      setRagEnabled(true);
    }
  };

  const removeTemporaryDoc = async (docId: string) => {
    setTemporaryDocs(prev => prev.filter(d => d.id !== docId));
  };

  const [client, setClient] = useState<AssistantAPIClient | null>(null);

  const getAppropriateModelForContent = () => {
    // Determine which auto-selected model to show based on content
    if (images.length > 0 && modelSelectionConfig.visionModel) {
      setActiveAutoModel(modelSelectionConfig.visionModel);
      return modelSelectionConfig.visionModel;
    } else if (modelSelectionConfig.toolModel) {
      // Use toolModel for both tool use and normal text
      setActiveAutoModel(modelSelectionConfig.toolModel);
      return modelSelectionConfig.toolModel;
    } else if (ragEnabled && modelSelectionConfig.ragModel) {
      setActiveAutoModel(modelSelectionConfig.ragModel);
      return modelSelectionConfig.ragModel;
    } else if (modelSelectionConfig.mode === 'auto') {
      // Default to the first auto model that's set
      const firstModel = modelSelectionConfig.visionModel || 
                         modelSelectionConfig.toolModel || 
                         modelSelectionConfig.ragModel;
      setActiveAutoModel(firstModel || '');
      return firstModel || selectedModel;
    }
    return selectedModel;
  };

  // Update active model whenever content changes that would affect model selection
  useEffect(() => {
    if (modelSelectionConfig.mode === 'auto') {
      getAppropriateModelForContent();
    }
  }, [images.length, useAllTools, selectedTool, ragEnabled, modelSelectionConfig]);

  // Move this up before any useEffect that uses assistantChat
  const assistantChat = useAssistantChat({
    client,
    selectedModel,
    db,
    modelSelectionConfig,
    tools,
    useAllTools,
    selectedTool,
    images,
    setImages,
    ragEnabled,
    temporaryDocs,
    pythonPort,
    setSelectedModel,
    setChats,
    activeChat,
    setActiveChat,
    scrollToBottom,
    executeToolImplementation,
    formatToolForOpenAI,
    getAppropriateModel,
    checkModelImageSupport,
    findImageSupportedModel,
    searchDocuments,
    useStructuredToolCalling,
    isStreaming,
  });

  // Modified handleSend to use the appropriate model
  const originalHandleSend = assistantChat.handleSend;
  
  const modifiedHandleSend = async () => {
    if (modelSelectionConfig.mode === 'auto') {
      // Update the active model before sending message
      const appropriateModel = getAppropriateModelForContent();
      if (appropriateModel && appropriateModel !== selectedModel) {
        setSelectedModel(appropriateModel);
      }
    }
    
    // Call the original handler
    await originalHandleSend();
  };

  // Override the handleSend function
  assistantChat.handleSend = modifiedHandleSend;

  useEffect(() => {
    return () => {
      temporaryDocs.forEach(doc => {
        removeTemporaryDoc(doc.id).catch(console.error);
      });
    };
  }, [activeChat]);

  useEffect(() => {
    if (activeChat) {
      // No need to cleanup here, temp docs should persist across chat changes
    }
  }, [activeChat]);

  useEffect(() => {
    // Check for pending chat query from search bar
    const pendingQuery = localStorage.getItem('pending_chat_query');
    if (pendingQuery) {
      // Clear the pending query
      localStorage.removeItem('pending_chat_query');
      // Set the input
      assistantChat.setInput(pendingQuery);
      // Create a new chat and send the message
      handleNewChat(pendingQuery);
    }
  }, []); // Run only once on component mount

  useEffect(() => {
    const loadChatMessages = async () => {
      if (activeChat) {
        try {
          const chatMessages = await db.getChatMessages(activeChat);
          assistantChat.setMessages(chatMessages);
        } catch (error) {
          console.error('Error loading chat messages:', error);
        }
      }
    };

    if (activeChat) {
      loadChatMessages();
    }
  }, [activeChat]);

  useEffect(() => {
    if (assistantChat.messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [assistantChat.messages]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener('scroll', handleScroll);
      return () => chatContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Load initial chat data
  useEffect(() => {
    const loadInitialChat = async () => {
      const recentChats = await db.getRecentChats();
      setChats(recentChats);

      if (recentChats.length > 0) {
        // Load the most recent chat
        const latestChat = recentChats[0];
        setActiveChat(latestChat.id);
        const chatMessages = await db.getChatMessages(latestChat.id);
        assistantChat.setMessages(chatMessages);
      } else {
        // Create a new chat if none exist
        handleNewChat();
      }
    };
    loadInitialChat();
  }, []);

  // Load tools on component mount
  useEffect(() => {
    const loadTools = async () => {
      try {
        const availableTools = await db.getAllTools();
        setTools(availableTools.filter(tool => tool.isEnabled));
      } catch (error) {
        console.error('Error loading tools:', error);
      }
    };
    loadTools();
  }, []);

  const getMostUsedModel = async (availableModels: Model[]): Promise<string | null> => {
    try {
      // Get model usage statistics from the database
      const modelUsage = await db.getModelUsage();

      if (!modelUsage || Object.keys(modelUsage).length === 0) {
        return null;
      }

      // Filter to only include currently available models
      const availableModelNames = availableModels.map(model => model.name);
      const validUsageEntries = Object.entries(modelUsage)
        .filter(([modelName]) => {
          return availableModelNames.includes(modelName);
        });

      if (validUsageEntries.length === 0) {
        return null;
      }

      // Find the model with the highest usage
      const mostUsed = validUsageEntries.reduce((max, current) => {
        return (current[1] > max[1]) ? current : max;
      });

      return mostUsed[0];
    } catch (error) {
      console.error('Error getting most used model:', error);
      return null;
    }
  };

  useEffect(() => {
    const initializeProvider = async () => {
      if (!primaryProvider || providersLoading) {
        setConnectionStatus('disconnected');
        return;
      }

      try {
        const newClient = new AssistantAPIClient(primaryProvider.baseUrl || '', {
          apiKey: primaryProvider.apiKey || ''
        });
        setClient(newClient);

        // Load saved model selection config for current provider
        const savedModelSelectionConfig = localStorage.getItem(`model_selection_config_${primaryProvider.id}`);
        if (savedModelSelectionConfig) {
          const parsedConfig = JSON.parse(savedModelSelectionConfig);
          setModelSelectionConfig(parsedConfig);
          
          if (parsedConfig.mode === 'auto') {
            const modelConfig: ModelConfig = {
              visionModel: parsedConfig.visionModel,
              toolModel: parsedConfig.toolModel,
              ragModel: parsedConfig.ragModel
            };
            newClient.setModelConfig(modelConfig);
          }
        } else {
          // If no config exists for this provider, create default
          const defaultConfig: ApiModelConfig = {
            type: 'openai',
            mode: 'manual',
            visionModel: '',
            toolModel: '',
            ragModel: ''
          };
          setModelSelectionConfig(defaultConfig);
          localStorage.setItem(`model_selection_config_${primaryProvider.id}`, JSON.stringify(defaultConfig));
          setShowModelConfig(true);
        }

        // Test connection and get model list
        const modelList = await newClient.listModels();
        setModels(modelList);

        // If no model is selected, try to select one automatically
        if (!selectedModel) {
          // First try to get the most used model for the current provider
          const mostUsed = await getMostUsedModel(modelList);
          if (mostUsed) {
            handleModelSelect(mostUsed);
          } else {
            // If no most used model, select the first available model
            const defaultModel = modelList[0]?.name;
            if (defaultModel) {
              handleModelSelect(defaultModel);
            }
          }
        }

        // Update selected model based on provider
        const storedModel = localStorage.getItem(`selected_model_${primaryProvider.id}`);
        
        if (storedModel && modelList.some(m => m.name === storedModel)) {
          setSelectedModel(storedModel);
        } else if (modelList.length > 0) {
          // If stored model not found in current list, select first available
          handleModelSelect(modelList[0].name);
        }

        setConnectionStatus('connected');
      } catch (err) {
        console.error('Failed to connect to provider:', err);
        setConnectionStatus('disconnected');
      }
    };

    initializeProvider();
  }, [primaryProvider, providersLoading]);

  const handleModelSelect = (modelName: string) => {
    setSelectedModel(modelName);
    // Store model selection based on provider ID
    if (primaryProvider?.id) {
      localStorage.setItem(`selected_model_${primaryProvider.id}`, modelName);
    }
  };

  const handleModelConfigSave = (config: ModelSelectionConfig) => {
    if (!primaryProvider?.id) return;
    
    const fullConfig: ApiModelConfig = {
      ...config,
      type: 'openai' // All providers are OpenAI-compatible
    };

    setModelSelectionConfig(fullConfig);
    localStorage.setItem(`model_selection_config_${primaryProvider.id}`, JSON.stringify(fullConfig));
    
    // Mark onboarding as completed
    localStorage.setItem('onboarding_completed', 'true');
    setShowOnboarding(false);
    
    // If auto mode, set the model config for the client
    if (config.mode === 'auto' && client) {
      const modelConfig: ModelConfig = {
        visionModel: config.visionModel,
        toolModel: config.toolModel,
        ragModel: config.ragModel
      };
      client.setModelConfig(modelConfig);
    }
  };

  const handleNewChat = async (initialMessage?: string) => {
    // Create chat with a temporary name - it will be updated after first message
    const chatId = await db.createChat(initialMessage?.slice(0, 50) || 'New Chat');
    setActiveChat(chatId);

    const welcomeMessage = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      content: "Hello! How can I help you today?",
      role: 'assistant' as const,
      timestamp: Date.now(),
      tokens: 0
    };

    await db.addMessage(
      chatId,
      welcomeMessage.content,
      welcomeMessage.role,
      welcomeMessage.tokens || 0
    );

    assistantChat.setMessages([welcomeMessage]);
    const updatedChats = await db.getRecentChats();
    setChats(updatedChats);

    if (initialMessage) {
      assistantChat.setInput(initialMessage);
      setTimeout(() => assistantChat.handleSend(), 100);
    }
  };

  const handleStopStreaming = () => {
    if (!client || !assistantChat.isProcessing) return;

    try {
      // Abort the current stream
      client.abortStream();

      // Update the UI to show that streaming has stopped
      setIsStreaming(false);
    } catch (error) {
      console.warn('Error stopping stream:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      assistantChat.handleSend();
    }
  };

  const handleToggleStructuredToolCalling = () => {
    const newValue = !useStructuredToolCalling;
    setUseStructuredToolCalling(newValue);
    localStorage.setItem('use_structured_tool_calling', newValue.toString());
  };

  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  const [showModelConfig, setShowModelConfig] = useState(false);

  return (
    <div className="relative flex h-screen bg-gradient-to-br from-white to-sakura-100 dark:from-gray-900 dark:to-sakura-100/10">
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="absolute top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}
      {/* Only show sidebar when not in interpreter mode */}
      {!isInterpreterMode && (
        <AssistantSidebar
          activeChat={activeChat}
          onChatSelect={setActiveChat}
          chats={chats}
          onOpenSettings={() => setShowSettings(true)}
          onNavigateHome={handleNavigateHome}
        />
      )}

      <div className={`flex-1 flex flex-col ${isInterpreterMode ? 'pl-0' : ''}`}>
        {!isInterpreterMode ? (
          <>
            <AssistantHeader
              connectionStatus={connectionStatus}
              onPageChange={onPageChange}
              onNavigateHome={handleNavigateHome}
              onOpenSettings={() => setShowSettings(true)}
              onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
              onOpenTools={() => setShowToolModal(true)}
            />

            <ChatWindow
              messages={assistantChat.messages}
              showScrollButton={showScrollButton}
              scrollToBottom={scrollToBottom}
              messagesEndRef={messagesEndRef}
              chatContainerRef={chatContainerRef}
              onNewChat={() => handleNewChat()}
              isStreaming={assistantChat.isProcessing}
              showTokens={!assistantChat.isProcessing}
              onRetryMessage={assistantChat.handleRetryMessage}
              onEditMessage={assistantChat.handleEditMessage}
              onSendEdit={assistantChat.handleSendEdit}
            />
          </>
        ) : (
          // Interpreter mode - completely different layout
          <div className="flex-1 flex flex-col h-full">
            <InterpreterChat />
          </div>
        )}

        <ChatInput
          input={assistantChat.input}
          setInput={assistantChat.setInput}
          handleSend={assistantChat.handleSend}
          handleKeyDown={handleKeyDown}
          isDisabled={!client || !selectedModel || (assistantChat.isProcessing && !assistantChat.input.trim())}
          isProcessing={assistantChat.isProcessing}
          onNewChat={() => handleNewChat()}
          onImageUpload={handleImageUpload}
          images={images}
          onRemoveImage={removeImage}
          handleStopStreaming={handleStopStreaming}
          ragEnabled={ragEnabled}
          onToggleRag={setRagEnabled}
          onTemporaryDocUpload={handleTemporaryDocUpload}
          temporaryDocs={temporaryDocs}
          onRemoveTemporaryDoc={removeTemporaryDoc}
          tools={tools}
          onToolSelect={setSelectedTool}
          useAllTools={useAllTools}
          onUseAllToolsChange={setUseAllTools}
          models={models}
          onModelConfigSave={handleModelConfigSave}
          modelConfig={modelSelectionConfig}
          onModelSelect={handleModelSelect}
          useStructuredToolCalling={useStructuredToolCalling}
          onToggleStructuredToolCalling={handleToggleStructuredToolCalling}
          selectedModel={selectedModel}
          activeAutoModel={activeAutoModel}
        />

        {showImageWarning && images.length > 0 && (
          <div className="px-6">
            <div className="max-w-3xl mx-auto">
              <ImageWarning onClose={() => setShowImageWarning(false)} />
            </div>
          </div>
        )}

        <AssistantModals
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          isStreaming={isStreaming}
          setIsStreaming={setIsStreaming}
          showPullModal={showPullModal}
          setShowPullModal={setShowPullModal}
          showKnowledgeBase={showKnowledgeBase}
          setShowKnowledgeBase={setShowKnowledgeBase}
          showToolModal={showToolModal}
          setShowToolModal={setShowToolModal}
          client={client}
          selectedModel={selectedModel}
          models={models}
          showModelConfig={showModelConfig}
          setShowModelConfig={setShowModelConfig}
          handleModelConfigSave={handleModelConfigSave}
          modelSelectionConfig={modelSelectionConfig}
          showOnboarding={showOnboarding}
          setShowOnboarding={setShowOnboarding}
        />
      </div>
    </div>
  );
};

export default Assistant;