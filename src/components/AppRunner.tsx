import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Play, Loader, Check, ImageIcon, Send,
  Activity, FileText, Code, MessageSquare, Database, Globe,
  Sparkles, Zap, User, Settings, BarChart2 as Chart, Search, Bot, Brain,
  Command, Book, Layout, Compass, Download, Edit
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
          (node: Node) =>
            node.type === 'textInputNode' || node.type === 'imageInputNode'
        );

        const initialInputs = inputNodes.reduce((acc: InputState, node: Node) => {
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

  // Analyze app structure to categorize nodes
  const { inputNodes, outputNodes, processingNodes } = useMemo(() => {
    if (!appData) {
      return {
        inputNodes: [],
        outputNodes: [],
        processingNodes: [],
      };
    }

    const inputs = appData.nodes.filter(
      (node: Node) =>
        node.type === 'textInputNode' || node.type === 'imageInputNode'
    );
    const outputs = appData.nodes.filter(
      (node: Node) =>
        node.type === 'textOutputNode' || 
        node.type === 'markdownOutputNode' ||
        node.type === 'imageOutputNode'  // Add this line
    );
    const processing = appData.nodes.filter(
      (node: Node) => !inputs.includes(node) && !outputs.includes(node)
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
      const node = inputNodes.find((n: Node) => n.id === nodeId);
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
          nodes: prevAppData.nodes.map((node: Node) => {
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
        setInputState((prev) => ({
          ...prev,
          [inputNodes[0].id]: simpleInputValue,
        }));
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
      appDataClone.nodes = appDataClone.nodes.map((node: Node) => {
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
            const originalNode = appData.nodes.find(n => n.id === node.id);
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
        const node = appData.nodes.find((n) => n.id === nodeId);
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
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Send a message to start
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            {appData?.description ||
              'Enter your information and run the app to get started.'}
          </p>
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
                className={`max-w-[85%] p-3 rounded-xl shadow-md relative text-sm leading-relaxed
                  ${isUserMessage ? 'rounded-tr-none ml-auto' : 'rounded-tl-none mr-auto'}
                  ${
                    isUserMessage
                      ? isDark
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-500 text-white'
                      : isDark
                      ? 'bg-gray-700 text-gray-100'
                      : 'bg-white text-gray-800'
                  }
                `}
              >
                {isImageContent ? (
                  <div>
                    <img 
                      src={message.content} 
                      alt="Generated" 
                      className="max-w-full rounded"
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
                      className="mt-2 px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Download
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
                      ? 'text-blue-200 dark:text-blue-100'
                      : 'text-gray-500 dark:text-gray-400'
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
              className={`max-w-[85%] p-3 rounded-xl rounded-tl-none flex items-center gap-2 shadow-md text-sm
                ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-white text-gray-500'}
              `}
            >
              <Loader className="w-4 h-4 animate-spin" />
              <div>Processing...</div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && !isRunning && (
          <div className="flex justify-start w-full">
            <div className="max-w-[85%] p-3 rounded-xl bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-md text-sm">
              {error}
            </div>
          </div>
        )}

        {/* Success indicator */}
        {isSuccess && !isRunning && (
          <div className="flex justify-center my-4">
            <div className="px-4 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center space-x-2 shadow-sm text-sm">
              <Check className="w-4 h-4" />
              <span>Completed</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render text & image inputs
  const renderInputSection = () => {
    if (isSimpleApp) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <textarea
              className="flex-1 p-2.5 border rounded-lg focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 resize-none min-h-[40px] max-h-[120px] text-sm"
              placeholder={
                inputNodes[0]?.data?.config?.placeholder || 'Ask something...'
              }
              value={simpleInputValue}
              onChange={handleSimpleInputChange}
              onKeyDown={handleKeyDown}
            />
            <button
              disabled={isRunning || simpleInputValue.trim() === ''}
              onClick={runApp}
              className={`h-[40px] w-[40px] flex items-center justify-center rounded-lg shadow-sm transition-colors
                ${
                  isRunning || simpleInputValue.trim() === ''
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:opacity-90'
                }
              `}
              style={{
                backgroundColor:
                  isRunning || simpleInputValue.trim() === ''
                    ? undefined
                    : appData?.color || '#3B82F6',
              }}
            >
              {isRunning ? (
                <Loader className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      );
    }

    // If both text and image inputs, consider a horizontal layout
    const hasImageInput = inputNodes.some((node) => node.type === 'imageInputNode');
    const hasTextInput = inputNodes.some((node) => node.type === 'textInputNode');
    const useHorizontalLayout = hasImageInput && hasTextInput;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-lg">
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
            {inputNodes.map((node: Node) => {
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
                      className="w-full p-2.5 text-sm border rounded-lg focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
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
                          flex flex-col items-center justify-center w-full border border-dashed rounded-lg cursor-pointer
                          hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200
                          bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600
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
                                className="w-full h-full object-cover rounded"
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
                                className="w-full h-full object-cover rounded"
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
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm shadow-sm transition-colors
                ${!hasTextInput ? 'w-full max-w-[200px]' : ''}
                ${
                  isRunning || !isFormComplete
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:opacity-90'
                }
              `}
            >
              {isRunning ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
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
          <div className="flex-1 overflow-hidden flex flex-col" style={gradientStyle}>
            {/* Header / Info Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 m-4 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: appData?.color || '#3B82F6' }}
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
                  className="fixed bottom-24 right-6 p-2 rounded-full shadow-lg z-10
                  opacity-90 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: appData?.color || '#3B82F6' }}
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
