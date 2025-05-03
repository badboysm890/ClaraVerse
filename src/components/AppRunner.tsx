import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Play, Loader, Check, ImageIcon, Send,
  Activity, FileText, Code, MessageSquare, Database, Globe,
  Sparkles, Zap, User, Settings, BarChart2 as Chart, Search, Bot, Brain,
  Command, Book, Layout, Compass, Download, RotateCw, AlertCircle, Edit
} from 'lucide-react';
import { Node, Edge } from 'reactflow';
import ReactMarkdown from 'react-markdown';

import { appStore } from '../services/AppStore';
import { executeFlow, generateExecutionPlan } from '../ExecutionEngine';
import { useTheme } from '../hooks/useTheme';
import { OllamaProvider } from '../context/OllamaContext';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { Buffer } from 'buffer';

// Create an icon mapping for dynamic access
const iconMap: Record<string, React.ElementType> = {
  Activity,
  FileText,
  Code,
  Image: ImageIcon,
  MessageSquare,
  Database,
  Globe,
  Sparkles,
  Zap,
  User,
  Settings,
  Chart,
  Search,
  Bot,
  Brain,
  Command,
  Book,
  Layout,
  Compass,
};

// Add this helper function at the top level
const arrayBufferToDataUrl = (buffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(buffer);
  const base64 = Buffer.from(uint8Array).toString('base64');
  return `data:image/png;base64,${base64}`;
};

// Update props interface to include onPageChange
interface AppRunnerProps {
  appId: string;
  onBack: () => void;
  isEmbedded?: boolean;
  nodes?: Node[];
  edges?: Edge[];
  onPageChange?: (page: string) => void;  // Add this line
  onSaveRequest?: () => Promise<void>;  // Add this line
}

interface InputState {
  [nodeId: string]: string | File | ArrayBuffer | null;
}

interface ChatMessage {
  id: string;
  content: any;
  type: 'user' | 'ai';
  timestamp: number;
  isImage?: boolean;
}

interface NodeData {
  label?: string;
  config?: {
    placeholder?: string;
    isRequired?: boolean;
    description?: string;
    text?: string;
    imageBuffer?: ArrayBuffer;
  };
  runtimeImage?: string;
}

interface AppNode extends Node {
  type: string;
  data: NodeData;
  id: string;
}

interface ChatContext {
  userInput: string;
  botOutput: string;
}

const AppRunner: React.FC<AppRunnerProps> = ({ appId, onBack, isEmbedded = false, nodes: propNodes, edges: propEdges, onPageChange, onSaveRequest }) => {
  const { isDark } = useTheme();
  const [appData, setAppData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [inputState, setInputState] = useState<InputState>({});
  const [outputState, setOutputState] = useState<{ [nodeId: string]: any }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [simpleInputValue, setSimpleInputValue] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activePage, setActivePage] = useState('apps');
  const [messageHistory, setMessageHistory] = useState<ChatMessage[]>([]);
  const [chainEnabled, setChainEnabled] = useState(false);
  const [showChainWarning, setShowChainWarning] = useState(false);

  // Refs for scrolling
  const outputSectionRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dynamically generate a background gradient for the container
  const gradientStyle = useMemo(() => {
    const color = appData?.color || '#3B82F6';
    return {
      background: `linear-gradient(135deg, ${color}10, ${
        isDark ? '#1f293780' : '#f9fafb80'
      })`,
    };
  }, [appData?.color, isDark]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageHistory]);

  // Update useEffect to properly set appData for embedded mode
  useEffect(() => {
    if (isEmbedded && propNodes && propEdges) {
      const embeddedAppData = {
        nodes: propNodes,
        edges: propEdges,
        color: '#3B82F6', // Default color
      };
      setAppData(embeddedAppData);
      setIsLoading(false);

      // Initialize input states
      const inputNodes = propNodes.filter(
        (node: Node) => node.type === 'textInputNode' || node.type === 'imageInputNode'
      );
      const initialInputs = inputNodes.reduce((acc: InputState, node: Node) => {
        acc[node.id] = '';
        return acc;
      }, {});
      setInputState(initialInputs);
    } else {
      loadApp(appId);
    }
  }, [isEmbedded, propNodes, propEdges, appId]);

  const loadApp = async (appId: string) => {
    try {
      setIsLoading(true);
      const app = await appStore.getApp(appId);
      if (app) {
        setAppData(app);

        // Initialize input state for text/image input nodes
        const inputNodes = app.nodes.filter(
          (node: AppNode) =>
            node.type === 'textInputNode' || node.type === 'imageInputNode'
        );

        const initialInputs = inputNodes.reduce((acc: InputState, node: AppNode) => {
          acc[node.id] = '';
          return acc;
        }, {});

        setInputState(initialInputs);
      } else {
        setError('App not found');
      }
    } catch (err) {
      setError('Failed to load app');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Update the type annotations for the node parameters
  const { inputNodes, outputNodes, processingNodes } = useMemo(() => {
    if (!appData) {
      return {
        inputNodes: [] as AppNode[],
        outputNodes: [] as AppNode[],
        processingNodes: [] as AppNode[],
      };
    }

    const inputs = (appData.nodes as AppNode[]).filter(
      (node) => node.type === 'textInputNode' || node.type === 'imageInputNode'
    );
    const outputs = (appData.nodes as AppNode[]).filter(
      (node) => 
        node.type === 'textOutputNode' || 
        node.type === 'markdownOutputNode' ||
        node.type === 'imageOutputNode'
    );
    const processing = (appData.nodes as AppNode[]).filter(
      (node) => !inputs.includes(node) && !outputs.includes(node)
    );

    return {
      inputNodes: inputs,
      outputNodes: outputs,
      processingNodes: processing,
    };
  }, [appData]);

  // Determine if this is a "simple" app (one text input, one or more outputs)
  const isSimpleApp = useMemo(() => {
    return (
      inputNodes.length === 1 &&
      outputNodes.length >= 1 &&
      inputNodes[0].type === 'textInputNode'
    );
  }, [inputNodes, outputNodes]);

  // Update isFormComplete check to handle ArrayBuffer inputs
  const isFormComplete = useMemo(() => {
    if (!inputNodes.length) return true;
    return Object.entries(inputState).every(([nodeId, value]) => {
      const node = inputNodes.find((n: AppNode) => n.id === nodeId);
      if (!node) return true;
      if (node.type === 'textInputNode') {
        return typeof value === 'string' && value.trim() !== '';
      }
      if (node.type === 'imageInputNode') {
        return value instanceof ArrayBuffer || 
               value instanceof File || 
               (typeof value === 'string' && value.startsWith('data:image'));
      }
      return true;
    });
  }, [inputState, inputNodes]);

  // Show/hide "scroll to top" button
  useEffect(() => {
    const handleScroll = () => {
      if (outputSectionRef.current) {
        setShowScrollTop(outputSectionRef.current.scrollTop > 300);
      }
    };
    const outputSection = outputSectionRef.current;
    outputSection?.addEventListener('scroll', handleScroll);

    return () => outputSection?.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    outputSectionRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle input changes for text or image
  const handleInputChange = (nodeId: string, value: string | File | null) => {
    setInputState((prev) => ({
      ...prev,
      [nodeId]: value,
    }));
  };

  const handleImageUpload = (nodeId: string, file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const arrayBuffer = event.target.result as ArrayBuffer;
        setInputState(prev => ({
          ...prev,
          [nodeId]: arrayBuffer
        }));

        // Convert ArrayBuffer to DataURL for preview
        const previewUrl = arrayBufferToDataUrl(arrayBuffer);

        setAppData((prevAppData: any) => ({
          ...prevAppData,
          nodes: prevAppData.nodes.map((node: AppNode) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  runtimeImage: previewUrl,  // Use converted DataURL for preview
                  config: {
                    ...node.data.config,
                    imageBuffer: arrayBuffer
                  }
                }
              };
            }
            return node;
          })
        }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // For simple chat-like apps
  const handleSimpleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setSimpleInputValue(e.target.value);

    if (inputNodes.length === 1) {
      handleInputChange(inputNodes[0].id, e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning && simpleInputValue.trim() !== '') {
        runApp();
      }
    }
  };

  // Get the previous chat context
  const getPreviousContext = (): ChatContext | null => {
    if (messageHistory.length < 2) return null;
    
    // Get the last user message and bot response
    const lastMessages = messageHistory.slice(-2);
    const userMessage = lastMessages.find(m => m.type === 'user');
    const botMessage = lastMessages.find(m => m.type === 'ai');
    
    if (!userMessage || !botMessage) return null;
    
    return {
      userInput: userMessage.content,
      botOutput: botMessage.content
    };
  };

  // Format the input with context
  const formatInputWithContext = (currentInput: string): string => {
    const context = getPreviousContext();
    if (!context) return currentInput;
    
    return `Previous Chat:

User input: "${context.userInput}"
Bot's output: "${context.botOutput}"

Current request: ${currentInput}`;
  };

  // Main "Run App" function
  const runApp = async () => {
    setIsRunning(true);
    setError(null);
    setIsSuccess(false);

    try {
      // If embedded and no appId, try to save first
      if (isEmbedded && !appId && onSaveRequest) {
        await onSaveRequest();
      }

      // Gather user inputs
      const userInputs: any[] = [];

      // For a single text input app
      if (isSimpleApp && inputNodes.length === 1) {
        const formattedInput = chainEnabled ? formatInputWithContext(simpleInputValue) : simpleInputValue;
        setInputState((prev) => ({
          ...prev,
          [inputNodes[0].id]: formattedInput,
        }));
        // Only add the original input to message history
        userInputs.push(simpleInputValue);
      } else {
        // Collect all non-empty inputs
        inputNodes.forEach((node) => {
          const inputVal = inputState[node.id];
          if (inputVal) {
            if (node.type === 'imageInputNode' && inputVal instanceof File) {
              userInputs.push(`[Image: ${inputVal.name}]`);
            } else if (typeof inputVal === 'string' && inputVal.trim() !== '') {
              userInputs.push(inputVal);
            }
          }
        });
      }

      // Add user message to chat history
      setMessageHistory((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          content: userInputs.length === 1 ? userInputs[0] : userInputs.join('\n'),
          type: 'user',
          timestamp: Date.now(),
          isImage: inputNodes.some(
            (node) => node.type === 'imageInputNode' && inputState[node.id] instanceof File
          ),
        },
      ]);

      // Clone app data to inject runtime inputs
      const appDataClone = JSON.parse(JSON.stringify(appData));

      // Update input node configs
      appDataClone.nodes = appDataClone.nodes.map((node: AppNode) => {
        if (inputState[node.id] !== undefined) {
          if (node.type === 'textInputNode') {
            return {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  text: inputState[node.id],
                },
              },
            };
          } else if (node.type === 'imageInputNode') {
            // For image nodes, use the stored buffer from the node's config
            const originalNode = appData.nodes.find((n: AppNode) => n.id === node.id);
            return {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  imageBuffer: originalNode?.data?.config?.imageBuffer
                }
              }
            };
          }
        }
        return node;
      });

      // Update app store temporarily
      await appStore.tempUpdateAppNodes(appId, appDataClone.nodes);

      // Generate execution plan & run
      const plan = generateExecutionPlan(appDataClone.nodes, appDataClone.edges);

      // Callback to capture node outputs
      const updateNodeOutput = (nodeId: string, output: any) => {
        setOutputState((prev) => ({ ...prev, [nodeId]: output }));

        // Find the node to determine its type
        const node = appData.nodes.find((n: AppNode) => n.id === nodeId);
        if (node) {
          // Only add to message history if it's an output node
          if (node.type === 'imageOutputNode' || node.type === 'textOutputNode' || node.type === 'markdownOutputNode') {
            const isImage = node.type === 'imageOutputNode' || 
                          (typeof output === 'string' && output.startsWith('data:image'));
            console.log(`Adding output to message history for ${node.type}:`, { nodeId, output });
            setMessageHistory((prev) => [
              ...prev,
              {
                id: `ai-${Date.now()}-${nodeId}`,
                content: output,
                type: 'ai',
                timestamp: Date.now(),
                isImage
              },
            ]);
          }
        }
      };

      // Execute the flow
      await executeFlow(plan, updateNodeOutput);
      setIsSuccess(true);

      // Clear input if it's a simple app
      if (isSimpleApp) {
        setSimpleInputValue('');
      }
    } catch (err) {
      console.error('Error running app:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred while running the app';
      setError(errorMessage);

      setMessageHistory((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          content: errorMessage,
          type: 'ai',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Helper to format output for Markdown
  const formatOutputForMarkdown = (output: any): string => {
    if (typeof output === 'string') return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  };

  // Modified renderOutputs function
  const renderOutputs = () => {
    if (messageHistory.length === 0 && !isRunning) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md text-sm leading-relaxed">
              {appData?.description ||
                'Enter your information and run the app to get started.'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 flex flex-col">
        {messageHistory.map((message) => {
          const isUserMessage = message.type === 'user';
          const isImageContent = typeof message.content === 'string' && 
            (message.content.startsWith('data:image') || message.isImage);
          
          return (
            <div
              key={message.id}
              className={`flex ${
                isUserMessage ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] p-4 rounded-2xl shadow-sm relative text-sm leading-relaxed
                  ${isUserMessage ? 'rounded-tr-md ml-auto' : 'rounded-tl-md mr-auto'}
                  ${
                    isUserMessage
                      ? isDark
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/20'
                        : 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-800 shadow-blue-100/50 border border-blue-100'
                      : isDark
                      ? 'bg-gray-800/80 text-gray-100 border border-gray-700/50'
                      : 'bg-white text-gray-800 border border-gray-100'
                  }
                `}
              >
                {isImageContent ? (
                  <div>
                    <img 
                      src={message.content} 
                      alt="Generated" 
                      className="max-w-full rounded-xl shadow-sm"
                      style={{ maxHeight: '512px' }}
                    />
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = message.content;
                        link.download = `generated-${Date.now()}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className={`mt-3 px-4 py-1.5 text-xs rounded-full flex items-center gap-1.5 transition-colors
                        ${isUserMessage 
                          ? isDark
                            ? 'bg-white/20 hover:bg-white/30 text-white'
                            : 'bg-blue-200/50 hover:bg-blue-200/70 text-blue-800'
                          : isDark
                            ? 'bg-gray-700/50 hover:bg-gray-700/70 text-gray-200'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                    >
                      <Download className="w-3 h-3" />
                      Download Image
                    </button>
                  </div>
                ) : isUserMessage ? (
                  <div className="whitespace-pre-wrap">
                    {message.content ? message.content : "Input Received"}
                  </div>
                ) : (
                  <div className="prose-sm dark:prose-invert max-w-none text-current">
                    <ReactMarkdown>{formatOutputForMarkdown(message.content)}</ReactMarkdown>
                  </div>
                )}
                <div
                  className={`text-xs mt-2 text-right opacity-80 ${
                    isUserMessage
                      ? isDark
                        ? 'text-blue-50'
                        : 'text-blue-500'
                      : isDark
                        ? 'text-gray-400'
                        : 'text-gray-500'
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading indicator for in-progress responses */}
        {isRunning && (
          <div className="flex justify-start w-full">
            <div
              className={`max-w-[85%] p-4 rounded-2xl flex items-center gap-3 shadow-sm text-sm
                ${isDark ? 'bg-gray-800/80 text-gray-300 border border-gray-700/50' : 'bg-white text-gray-600 border border-gray-100'}
              `}
            >
              <div className="w-5 h-5 relative">
                <div className="absolute inset-0 rounded-full border-2 border-current border-r-transparent animate-spin" />
              </div>
              <div>Processing your request...</div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && !isRunning && (
          <div className="flex justify-start w-full">
            <div className="max-w-[85%] p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-sm text-sm border border-red-100 dark:border-red-800/30">
              {error}
            </div>
          </div>
        )}

        {/* Success indicator */}
        {isSuccess && !isRunning && (
          <div className="flex justify-center my-4">
            <div className="px-4 py-2 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center space-x-2 shadow-sm text-sm border border-green-100 dark:border-green-800/30">
              <Check className="w-4 h-4" />
              <span>Completed successfully</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render text & image inputs
  const renderInputSection = () => {
    if (isSimpleApp) {
      // Check if any input node is an image type
      const hasImageInput = inputNodes.some(node => node.type === 'imageInputNode');
      const previousContext = getPreviousContext();
      const canEnableChain = !hasImageInput && previousContext !== null;

      return (
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
          <div className="bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-2xl p-3 shadow-lg backdrop-blur-xl relative">
            {showChainWarning && (
              <div className="absolute bottom-full mb-2 left-0 right-0 p-3 bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm text-yellow-800 dark:text-yellow-200 backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Chain Mode Enabled</p>
                    <p className="text-xs opacity-80">This will include previous chat context in your request. For complex apps, this might lead to unexpected behavior or reduced performance.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <textarea
                className="flex-1 p-3 border rounded-xl focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 
                bg-white/50 dark:bg-gray-800/50 text-gray-900 dark:text-white 
                border-gray-200/50 dark:border-gray-700/50 resize-none min-h-[44px] max-h-[120px] 
                text-sm transition-all backdrop-blur-sm"
                placeholder={
                  inputNodes[0]?.data?.config?.placeholder || 'Ask something...'
                }
                value={simpleInputValue}
                onChange={handleSimpleInputChange}
                onKeyDown={handleKeyDown}
              />
              {canEnableChain && (
                <button
                  onClick={() => {
                    setChainEnabled(!chainEnabled);
                    setShowChainWarning(!showChainWarning);
                  }}
                  className={`h-[44px] w-[44px] flex items-center justify-center rounded-xl shadow-sm transition-all
                    border border-gray-200/50 dark:border-gray-700/50
                    ${
                      chainEnabled
                        ? isDark
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-pink-50 text-pink-400'
                        : 'bg-white/50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500'
                    }
                    hover:bg-opacity-90 hover:shadow-md active:scale-95
                  `}
                  title={chainEnabled ? 'Disable chain mode' : 'Enable chain mode'}
                >
                  <RotateCw className={`w-5 h-5 transition-transform ${chainEnabled ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                disabled={isRunning || simpleInputValue.trim() === ''}
                onClick={runApp}
                className={`h-[44px] w-[44px] flex items-center justify-center rounded-xl shadow-sm transition-all
                  ${
                    isRunning || simpleInputValue.trim() === ''
                      ? 'bg-gray-400/50 cursor-not-allowed backdrop-blur-sm'
                      : isDark
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 hover:opacity-90 hover:shadow-md active:scale-95'
                        : 'bg-white hover:bg-gray-50 border border-gray-200/50 hover:shadow-md active:scale-95'
                  }
                `}
              >
                {isRunning ? (
                  <div className="w-5 h-5 relative">
                    <div className={`absolute inset-0 rounded-full border-2 border-r-transparent animate-spin ${
                      isDark ? 'border-white' : 'border-gray-400'
                    }`} />
                  </div>
                ) : (
                  <Send className={`w-5 h-5 ${isDark ? 'text-white' : 'text-pink-400'}`} />
                )}
              </button>
            </div>
            {chainEnabled && previousContext && (
              <div className="mt-2 p-2 bg-gray-50/50 dark:bg-gray-900/50 rounded-lg border border-gray-200/50 dark:border-gray-700/50 text-xs">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Previous context:</div>
                <div className="text-gray-700 dark:text-gray-300">
                  <div className="mb-1">User: {previousContext.userInput}</div>
                  <div>Assistant: {previousContext.botOutput}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // If both text and image inputs, consider a horizontal layout
    const hasImageInput = inputNodes.some((node: AppNode) => node.type === 'imageInputNode');
    const hasTextInput = inputNodes.some((node: AppNode) => node.type === 'textInputNode');
    const useHorizontalLayout = hasImageInput && hasTextInput;

    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
        <div className="bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-2xl p-4 shadow-lg backdrop-blur-xl relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runApp();
            }}
          >
            <div
              className={`grid gap-4 ${
                useHorizontalLayout ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-1'
              }`}
            >
              {inputNodes.map((node: AppNode) => {
                if (node.type === 'textInputNode') {
                  return (
                    <div
                      key={node.id}
                      className={useHorizontalLayout ? 'md:col-span-5' : ''}
                    >
                      {node.data.label && (
                        <label className="block mb-1 text-sm font-medium text-gray-900 dark:text-white">
                          {node.data.label}
                          {node.data.config?.isRequired && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                      )}
                      <textarea
                        className="w-full p-3 text-sm border rounded-xl focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 
                        bg-white/50 dark:bg-gray-800/50 text-gray-900 dark:text-white 
                        border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm transition-all"
                        style={{ minHeight: useHorizontalLayout ? '120px' : '80px' }}
                        placeholder={node.data.config?.placeholder || 'Enter text...'}
                        value={(inputState[node.id] as string) || ''}
                        onChange={(e) => handleInputChange(node.id, e.target.value)}
                      />
                      {node.data.config?.description && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {node.data.config.description}
                        </p>
                      )}
                    </div>
                  );
                }
                if (node.type === 'imageInputNode') {
                  return (
                    <div
                      key={node.id}
                      className={useHorizontalLayout ? 'md:col-span-2' : ''}
                    >
                      {node.data.label && (
                        <label className="block mb-1 text-sm font-medium text-gray-900 dark:text-white">
                          {node.data.label}
                          {node.data.config?.isRequired && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                      )}
                      <div className="flex justify-center w-full h-full">
                        <label
                          className={`
                            flex flex-col items-center justify-center w-full border border-dashed rounded-xl cursor-pointer
                            hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-200
                            bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm
                            ${
                              useHorizontalLayout
                                ? 'h-[120px]'
                                : 'h-16'
                            }
                          `}
                        >
                          {inputState[node.id] instanceof File ? (
                            <div
                              className={`flex items-center justify-center p-2 w-full h-full ${
                                useHorizontalLayout
                                  ? 'flex-col'
                                  : 'flex-row'
                              }`}
                            >
                              <div
                                className={`shrink-0 ${
                                  useHorizontalLayout
                                    ? 'w-16 h-16 mb-2'
                                    : 'w-10 h-10 mr-3'
                                }`}
                              >
                                <img
                                  src={URL.createObjectURL(
                                    inputState[node.id] as File
                                  )}
                                  alt="Preview"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              </div>
                              <div className="text-left">
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
                                  {(inputState[node.id] as File).name}
                                </p>
                                <p className="text-xs text-blue-500 dark:text-blue-400 font-medium mt-1">
                                  Click to replace
                                </p>
                              </div>
                            </div>
                          ) : node.data.runtimeImage ? (
                            <div
                              className={`flex items-center justify-center p-2 w-full h-full ${
                                useHorizontalLayout
                                  ? 'flex-col'
                                  : 'flex-row'
                              }`}
                            >
                              <div
                                className={`shrink-0 ${
                                  useHorizontalLayout
                                    ? 'w-16 h-16 mb-2'
                                    : 'w-10 h-10 mr-3'
                                }`}
                              >
                                <img
                                  src={node.data.runtimeImage}
                                  alt="Preview"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              </div>
                              <div className="text-left">
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Image selected
                                </p>
                                <p className="text-xs text-blue-500 dark:text-blue-400 font-medium mt-1">
                                  Click to replace
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`flex flex-col items-center justify-center p-2 ${
                                useHorizontalLayout ? 'py-4' : ''
                              }`}
                            >
                              <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                Click to upload an image
                              </p>
                            </div>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleImageUpload(node.id, e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                      </div>
                      {node.data.config?.description && !useHorizontalLayout && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {node.data.config.description}
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            <div className={`${!hasTextInput ? 'flex justify-center' : 'flex justify-end'} mt-4`}>
              <button
                type="submit"
                disabled={isRunning || !isFormComplete}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm shadow-sm transition-all
                  ${!hasTextInput ? 'w-full max-w-[200px]' : ''}
                  ${
                    isRunning || !isFormComplete
                      ? 'bg-gray-400/50 text-white cursor-not-allowed backdrop-blur-sm'
                      : isDark
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:opacity-90 hover:shadow-md active:scale-95'
                        : 'bg-white text-pink-400 border border-gray-200/50 hover:bg-gray-50 hover:shadow-md active:scale-95'
                  }
                `}
              >
                {isRunning ? (
                  <>
                    <div className="w-4 h-4 relative">
                      <div className={`absolute inset-0 rounded-full border-2 border-r-transparent animate-spin ${
                        isDark ? 'border-white' : 'border-gray-400'
                      }`} />
                    </div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{!hasTextInput ? 'Generate' : 'Send'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Loading screen
  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar activePage={activePage} onPageChange={onBack} />
        <div className="flex-1 flex flex-col">
          <Topbar userName={appData?.name || 'App Runner'} />
          <div
            className="flex-1 flex items-center justify-center"
            style={gradientStyle}
          >
            <div className="flex flex-col items-center">
              <div
                className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2"
                style={{ borderColor: appData?.color || '#3B82F6' }}
              />
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Loading app...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error screen for app load issues
  if (error && !appData) {
    return (
      <div className="flex h-screen">
        <Sidebar activePage={activePage} onPageChange={onBack} />
        <div className="flex-1 flex flex-col">
          <Topbar userName="App Error" />
          <div
            className="flex-1 flex items-center justify-center"
            style={gradientStyle}
          >
            <div className="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-8 rounded-xl shadow-md">
              <div className="flex justify-center">
                <div className="bg-red-100 dark:bg-red-900/20 p-2 rounded-full">
                  <svg
                    className="w-8 h-8 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                {error}
              </h2>
              <button
                onClick={onBack}
                className="mt-6 px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors"
                style={{ backgroundColor: appData?.color || '#3B82F6' }}
              >
                Back to Apps
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main UI
  if (isEmbedded) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <div className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
          <div className="container mx-auto">
            {renderOutputs()}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="container mx-auto">
            {renderInputSection()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <OllamaProvider>
      <div className="flex h-screen">
        <Sidebar activePage={activePage} onPageChange={onBack} />
        <div className="flex-1 flex flex-col">
          <Topbar userName={appData?.name || 'App Runner'} />
          <div className="flex-1 overflow-hidden flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
            {/* Header / Info Section */}
            <div className="bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 m-4 p-4 rounded-2xl flex items-center justify-between shadow-sm backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br"
                  style={{ 
                    background: `linear-gradient(135deg, ${appData?.color || '#3B82F6'}, ${appData?.color || '#3B82F6'}dd)`
                  }}
                >
                  {appData?.icon &&
                    React.createElement(iconMap[appData.icon] || Activity, {
                      className: 'w-6 h-6 text-white',
                    })}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {appData?.name}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1">
                    {appData?.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (onPageChange) {
                      localStorage.setItem('current_app_id', appId);
                      onPageChange('app-creator');
                    }
                  }}
                  
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-700 dark:text-gray-300
                    hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
                >
                  <Edit className="w-5 h-5" />
                  <span>Edit App</span>
                </button>
                
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-700 dark:text-gray-300
                    hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back to Apps</span>
                </button>
              </div>
            </div>

            {/* Main Output Section */}
            <div
              ref={outputSectionRef}
              className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth"
            >
              <div className="container mx-auto max-w-4xl">
                {renderOutputs()}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll-to-top button */}
              {showScrollTop && (
                <button
                  onClick={scrollToTop}
                  className="fixed bottom-24 right-6 p-3 rounded-xl shadow-lg z-10
                  opacity-90 hover:opacity-100 transition-all hover:shadow-md active:scale-95"
                  style={{ 
                    background: `linear-gradient(135deg, ${appData?.color || '#3B82F6'}, ${appData?.color || '#3B82F6'}dd)`
                  }}
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Input Section */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"></div>
              <div className="container mx-auto max-w-4xl">
                {renderInputSection()}
              </div>
            </div>
          </div>
        </div>
    </OllamaProvider>
  );
};

export default AppRunner;
