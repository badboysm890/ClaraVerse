import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Eye, Code, Save, Undo, Redo, Settings, X, Monitor, Smartphone, Tablet, Layout, Send, Bot, User, Copy, FileText, Image, File, Upload, Mic } from 'lucide-react';
import { useAgentBuilder } from '../../../contexts/AgentBuilder/AgentBuilderContext';
import { UIComponent, UIComponentTemplate, DeviceMode } from '../../../types/agent/ui-builder';
import { agentUIStorage } from '../../../services/agentUIStorage';

interface UIBuilderProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface InputValue {
  nodeId: string;
  value: string | File | null;
  type: 'text' | 'file' | 'number';
}

interface AutoModeInterfaceProps {
  currentFlow: any;
  inputNodes: any[];
  outputNodes: any[];
  staticNodes: any[];
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  inputValues: InputValue[];
  setInputValues: React.Dispatch<React.SetStateAction<InputValue[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

// Markdown formatting function from NotebookChat
const formatMessage = (content: string) => {
  return content
    .split('\n')
    .map((line, index) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <h3 key={index} className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2">
            {line.replace('### ', '')}
          </h3>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={index} className="text-xl font-semibold text-gray-900 dark:text-white mt-4 mb-2">
            {line.replace('## ', '')}
          </h2>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={index} className="text-2xl font-bold text-gray-900 dark:text-white mt-4 mb-2">
            {line.replace('# ', '')}
          </h1>
        );
      }
      
      // Bold text
      if (line.includes('**')) {
        const parts = line.split('**');
        return (
          <p key={index} className="mb-2">
            {parts.map((part, partIndex) => 
              partIndex % 2 === 1 ? (
                <strong key={partIndex} className="font-semibold text-gray-900 dark:text-white">
                  {part}
                </strong>
              ) : (
                <span key={partIndex}>{part}</span>
              )
            )}
          </p>
        );
      }
      
      // List items
      if (line.startsWith('- ')) {
        return (
          <li key={index} className="ml-4 mb-1 list-disc">
            {line.replace('- ', '')}
          </li>
        );
      }
      
      // Numbered lists
      if (line.match(/^\d+\. /)) {
        return (
          <li key={index} className="ml-4 mb-1 list-decimal">
            {line.replace(/^\d+\. /, '')}
          </li>
        );
      }
      
      // Empty lines
      if (line.trim() === '') {
        return <br key={index} />;
      }
      
      // Regular paragraphs
      return (
        <p key={index} className="mb-2">
          {line}
        </p>
      );
    });
};

const AutoModeInterface: React.FC<AutoModeInterfaceProps> = ({
  currentFlow,
  inputNodes,
  outputNodes,
  staticNodes,
  messages,
  setMessages,
  inputValues,
  setInputValues,
  isLoading,
  setIsLoading
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { executeFlow, updateNode, executionResults, executionLogs, isExecuting } = useAgentBuilder();

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize input values when input nodes change, preserving existing values
  useEffect(() => {
    setInputValues(prevValues => {
      // For each input node, either keep existing value or create new one
      const newValues: InputValue[] = inputNodes.map(node => {
        const existingValue = prevValues.find(iv => iv.nodeId === node.id);
        if (existingValue) {
          // Keep existing value
          return existingValue;
        } else {
          // Create new value for new node
          return {
            nodeId: node.id,
            value: '',
            type: getInputTypeFromNodeType(node.type)
          };
        }
      });
      
      // Only update if something actually changed
      if (JSON.stringify(newValues) !== JSON.stringify(prevValues)) {
        return newValues;
      }
      return prevValues;
    });
  }, [inputNodes]);

  const getInputTypeFromNodeType = (nodeType: string): 'text' | 'file' | 'number' => {
    if (nodeType.includes('file') || nodeType.includes('pdf') || nodeType.includes('image') || nodeType.includes('upload')) {
      return 'file';
    }
    if (nodeType.includes('number') || nodeType.includes('numeric')) {
      return 'number';
    }
    return 'text';
  };

  const handleInputChange = (nodeId: string, value: string | File) => {
    setInputValues(prev => prev.map(input => 
      input.nodeId === nodeId ? { ...input, value } : input
    ));
  };

  const handleRunAgent = async () => {
    // Check if all required inputs are filled
    const emptyInputs = inputValues.filter(input => !input.value);
    if (emptyInputs.length > 0) {
      alert('Please fill in all input fields before running the agent.');
      return;
    }

    // Create user message showing all inputs
    const inputSummary = inputValues.map(input => {
      const node = inputNodes.find(n => n.id === input.nodeId);
      const label = node?.data?.label || node?.type || 'Input';
      
      if (input.type === 'file' && input.value && typeof input.value === 'object' && 'name' in input.value) {
        return `${label}: [File: ${(input.value as File).name}]`;
      }
      return `${label}: ${input.value}`;
    }).join('\n');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: `Running agent with inputs:\n\n${inputSummary}`,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Update input nodes with user values before execution
      for (const inputValue of inputValues) {
        if (inputValue.value) {
          // Convert File to appropriate format for the node
          let nodeValue = inputValue.value;
          
          if (inputValue.type === 'file' && inputValue.value && typeof inputValue.value === 'object' && 'name' in inputValue.value) {
            const file = inputValue.value as File;
            
            // For image files, convert to base64
            if (file.type.startsWith('image/')) {
              nodeValue = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
              });
            }
            // For PDF files, convert to base64
            else if (file.type === 'application/pdf') {
              nodeValue = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
              });
            }
            // For other files, read as text or base64
            else {
              nodeValue = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                
                if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                  reader.readAsText(file);
                } else {
                  reader.readAsDataURL(file);
                }
              });
            }
          }
          
          // Update the input node with the value
          updateNode(inputValue.nodeId, {
            data: {
              ...inputNodes.find(n => n.id === inputValue.nodeId)?.data,
              value: nodeValue,
              inputValue: nodeValue
            }
          });
        }
      }

      // Execute the actual workflow
      await executeFlow();

      // Create assistant message with execution results
      let responseContent = '';

      // Add clean execution results (production-ready output)
      if (Object.keys(executionResults).length > 0) {
        // Find the final output result
        const outputResults = Object.entries(executionResults).filter(([nodeId, result]) => {
          const node = outputNodes.find(n => n.id === nodeId);
          return node && result !== undefined;
        });

        if (outputResults.length > 0) {
          // Show only the final output without technical details
          outputResults.forEach(([nodeId, result]) => {
            // Unwrap { output: value } format that nodes return
            let displayValue = result;
            if (result && typeof result === 'object' && result.output !== undefined) {
              displayValue = result.output;
            }
            
            // Display the result cleanly
            if (displayValue && typeof displayValue === 'object') {
              responseContent += `\`\`\`json\n${JSON.stringify(displayValue, null, 2)}\n\`\`\``;
            } else if (displayValue !== undefined && displayValue !== null) {
              responseContent += displayValue;
            }
          });
        } else {
          // Fallback: show any result without node names or technical details
          const firstResult = Object.values(executionResults)[0];
          let displayValue = firstResult;
          if (firstResult && typeof firstResult === 'object' && firstResult.output !== undefined) {
            displayValue = firstResult.output;
          }
          
          if (displayValue && typeof displayValue === 'object') {
            responseContent += `\`\`\`json\n${JSON.stringify(displayValue, null, 2)}\n\`\`\``;
          } else if (displayValue !== undefined && displayValue !== null) {
            responseContent += displayValue;
          }
        }
              } else {
          responseContent = 'Task completed.';
        }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Agent execution failed:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `I encountered an issue while processing your request. Please try again or check your input values.`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearInputs = () => {
    setInputValues(prev => prev.map(input => ({ ...input, value: '' })));
  };

  const hasAllInputs = inputValues.every(input => input.value !== '' && input.value !== null);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Agent Info Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {currentFlow?.name || 'Agent Interface'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {inputNodes.length} input(s) • {outputNodes.length} output(s){staticNodes.length > 0 && ` • ${staticNodes.length} static value(s)`}
            </p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Input Panel */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agent Inputs</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {inputNodes.length > 0 
                ? `Fill in all ${inputNodes.length} dynamic input(s) to run your agent`
                : 'No dynamic inputs found. Add input nodes to your workflow in Agent Studio.'
              }
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {inputNodes.map((node, index) => {
              const inputValue = inputValues.find(iv => iv.nodeId === node.id);
              const label = node.data?.label || `Input ${index + 1}`;
              
              return (
                <div key={node.id} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                    <span className="ml-1 text-xs text-gray-500">({node.type})</span>
                  </label>
                  
                  {inputValue?.type === 'file' ? (
                    <div className="space-y-2">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleInputChange(node.id, file);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm"
                        accept={node.type.includes('image') ? 'image/*' : node.type.includes('pdf') ? '.pdf' : '*/*'}
                      />
                      {inputValue?.value && typeof inputValue.value === 'object' && 'name' in inputValue.value && 'size' in inputValue.value && (
                        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                          Selected: {(inputValue.value as File).name} ({((inputValue.value as File).size / 1024).toFixed(1)} KB)
                        </div>
                      )}
                    </div>
                  ) : inputValue?.type === 'number' ? (
                    <input
                      type="number"
                      value={inputValue?.value as string || ''}
                      onChange={(e) => handleInputChange(node.id, e.target.value)}
                      placeholder={`Enter ${label.toLowerCase()}...`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  ) : (
                    <textarea
                      value={inputValue?.value as string || ''}
                      onChange={(e) => handleInputChange(node.id, e.target.value)}
                      placeholder={`Enter ${label.toLowerCase()}...`}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 resize-none"
                    />
                  )}
                </div>
              );
            })}

            {inputNodes.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No input nodes found in your workflow.</p>
                <p className="text-xs">Add input nodes in Agent Studio to see them here.</p>
              </div>
            )}

            {/* Static Values Section */}
            {staticNodes.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  Static Values (Fixed)
                </h4>
                <div className="space-y-2">
                  {staticNodes.map((node) => {
                    const label = node.data?.label || node.name || node.type;
                    const value = node.data?.value || node.data?.text || node.data?.customText || 'Set in workflow';
                    const combineMode = node.data?.combineMode;
                    const separator = node.data?.separator;
                    
                    return (
                      <div
                        key={node.id}
                        className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-sm">🔒</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-orange-800 dark:text-orange-200">
                              {label}
                            </div>
                            <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                              Type: {node.type}
                            </div>
                            {value && value !== 'Set in workflow' && (
                              <div className="text-xs text-orange-700 dark:text-orange-300 mt-1 font-mono bg-orange-100 dark:bg-orange-900/30 p-1 rounded truncate">
                                "{value}"
                              </div>
                            )}
                            {combineMode && (
                              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                Mode: {combineMode}{separator && ` • Separator: "${separator}"`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 italic">
                  These values are fixed during workflow creation and cannot be changed here.
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <button
              onClick={handleRunAgent}
              disabled={!hasAllInputs || isLoading || isExecuting}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                hasAllInputs && !isLoading && !isExecuting
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading || isExecuting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                  {isExecuting ? 'Executing Workflow...' : 'Processing Inputs...'}
                </div>
              ) : (
                `Run Agent (${inputValues.filter(iv => iv.value).length}/${inputNodes.length} inputs)`
              )}
            </button>

            <button
              onClick={clearInputs}
              disabled={isLoading || isExecuting}
              className="w-full py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Clear All Inputs
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="w-1/2 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agent Results</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Results will appear here after running your agent
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                    Ready to Process
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Fill in the inputs on the left and click "Run Agent" to see results here.
                  </p>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Available inputs: {inputNodes.map(node => node.data?.label || node.type).join(', ')}
                  </div>
                </div>
              </div>
            )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div className={`max-w-3xl ${message.type === 'user' ? 'order-1' : ''}`}>
              <div
                className={`rounded-lg p-4 ${
                  message.type === 'user'
                    ? 'bg-indigo-500 text-white ml-auto'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className={`prose prose-sm max-w-none break-words ${
                  message.type === 'user' 
                    ? 'prose-invert' 
                    : 'prose-gray dark:prose-invert'
                }`}>
                  {typeof formatMessage(message.content) === 'string' ? (
                    <p className={message.type === 'user' ? 'text-white' : ''}>{message.content}</p>
                  ) : (
                    <div className={message.type === 'user' ? 'text-white' : ''}>
                      {formatMessage(message.content)}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200 dark:border-gray-600 border-opacity-20">
                  <span className={`text-xs ${
                    message.type === 'user' 
                      ? 'text-gray-100' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                  
                  {message.type === 'assistant' && (
                    <button
                      onClick={() => navigator.clipboard.writeText(message.content)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      title="Copy message"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {message.type === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 bg-gray-600 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

const UIBuilder: React.FC<UIBuilderProps> = ({ isOpen, onClose }) => {
  const { currentFlow, nodes } = useAgentBuilder();
  const [components, setComponents] = useState<UIComponent[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<UIComponent | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [uiMode, setUiMode] = useState<'auto' | 'builder'>('auto');
  
  // Auto mode state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValues, setInputValues] = useState<InputValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Get input and output nodes from the current flow (enhanced to capture dynamic input types only)
  const inputNodes = nodes.filter(node => {
    // Only include nodes that are meant for dynamic user input during execution
    // These are SOURCE nodes where users directly provide data
    const isDynamicInputNode = (
      node.type === 'input' || 
      node.type === 'file-upload' ||
      node.type === 'image-input' ||
      node.type === 'pdf-input' ||
      (node.data && node.data.category === 'input' && node.data.isDynamic !== false)
    );
    
    // Exclude processing nodes and static nodes
    const isProcessingOrStaticNode = (
      node.type === 'text' ||
      node.type === 'static-text' ||
      node.type === 'combine-text' ||
      node.type === 'json-parse' ||
      node.type === 'api-request' ||
      node.type === 'llm' ||
      node.type === 'structured-llm' ||
      node.type === 'if-else' ||
      node.type === 'whisper-transcription' || // Processing node, not source input
      (node.data && node.data.isStatic === true)
    );
    
    return isDynamicInputNode && !isProcessingOrStaticNode;
  });
  const outputNodes = nodes.filter(node => 
    node.type === 'output' || 
    node.type.includes('output') ||
    (node.data && (node.data.category === 'output' || node.data.isOutput))
  );

  // Get static nodes for display (nodes with fixed values set during creation)
  const staticNodes = nodes.filter(node => {
    const isStaticNode = (
      node.type === 'text' ||
      node.type === 'static-text' ||
      node.type === 'combine-text' ||
      (node.data && node.data.isStatic === true)
    );
    
    // Only include static nodes that have meaningful display values
    const hasDisplayValue = (
      node.data?.value ||
      node.data?.text ||
      node.data?.customText ||
      node.data?.separator ||
      node.data?.combineMode
    );
    
    return isStaticNode && hasDisplayValue;
  });

  // Helper functions to determine UI component types from workflow nodes
  const getInputTypeFromNode = (node: any): string => {
    const nodeType = node.type.toLowerCase();
    if (nodeType.includes('image') || nodeType.includes('pdf')) return 'file';
    if (nodeType.includes('file')) return 'file';
    return 'text'; // Default to text input
  };

  const getOutputTypeFromNode = (node: any): string => {
    const nodeType = node.type.toLowerCase();
    if (nodeType.includes('image')) return 'image';
    if (nodeType.includes('json')) return 'json';
    return 'text'; // Default to text output
  };

  // Generate UI components based on workflow nodes
  useEffect(() => {
    const generateUIFromWorkflow = async () => {
      if (currentFlow?.id && nodes.length > 0) {
        try {
          // Check if we have existing UI first
          const existingUI = await agentUIStorage.getAgentUI(currentFlow.id);
          if (existingUI) {
            setComponents(existingUI.components);
            return;
          }

          // Generate UI from workflow nodes
          const generatedComponents: UIComponent[] = [];
          let yPosition = 20;

          // Create input components for input nodes
          inputNodes.forEach((node, index) => {
            const component: UIComponent = {
              id: `input-${node.id}`,
              type: 'input',
              subType: getInputTypeFromNode(node),
              position: { x: 20, y: yPosition },
              size: { width: 300, height: 50 },
              properties: {
                label: node.data?.label || `Input ${index + 1}`,
                placeholder: `Enter ${node.data?.label || 'input'}...`,
                nodeId: node.id
              },
              nodeId: node.id,
              style: {
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px'
              }
            };
            generatedComponents.push(component);
            yPosition += 80;
          });

          // Add some spacing between inputs and outputs
          yPosition += 40;

          // Create output components for output nodes
          outputNodes.forEach((node, index) => {
            const component: UIComponent = {
              id: `output-${node.id}`,
              type: 'output',
              subType: getOutputTypeFromNode(node),
              position: { x: 20, y: yPosition },
              size: { width: 300, height: 100 },
              properties: {
                label: node.data?.label || `Output ${index + 1}`,
                content: 'Output will appear here...',
                nodeId: node.id
              },
              nodeId: node.id,
              style: {
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px'
              }
            };
            generatedComponents.push(component);
            yPosition += 120;
          });

          // Add a run button if we have both inputs and outputs
          if (inputNodes.length > 0 && outputNodes.length > 0) {
            const runButton: UIComponent = {
              id: 'run-agent-btn',
              type: 'display',
              subType: 'action',
              position: { x: 20, y: yPosition + 20 },
              size: { width: 150, height: 40 },
              properties: {
                text: 'Run Agent',
                variant: 'primary'
              },
              style: {
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: '8px',
                color: 'white'
              }
            };
            generatedComponents.push(runButton);
          }

          setComponents(generatedComponents);
        } catch (error) {
          console.error('Failed to generate UI from workflow:', error);
        }
      }
    };
    
    if (isOpen && currentFlow) {
      generateUIFromWorkflow();
    }
  }, [currentFlow?.id, nodes, isOpen, inputNodes, outputNodes]);

  const handleComponentSelect = (component: UIComponent) => {
    setSelectedComponent(component);
  };

  const handleComponentUpdate = (componentId: string, updates: Partial<UIComponent>) => {
    setComponents(prev => prev.map(comp => 
      comp.id === componentId ? { ...comp, ...updates } : comp
    ));
    if (selectedComponent?.id === componentId) {
      setSelectedComponent(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleDeleteComponent = (componentId: string) => {
    setComponents(prev => prev.filter(comp => comp.id !== componentId));
    if (selectedComponent?.id === componentId) {
      setSelectedComponent(null);
    }
  };

  const handleSaveUI = async () => {
    if (!currentFlow?.id) {
      console.error('No current flow to save UI for');
      return;
    }

    try {
      const result = await agentUIStorage.saveAgentUI(currentFlow.id, components, {
        name: `${currentFlow.name} UI`,
        description: `UI interface for ${currentFlow.name} agent`
      });

      if (result.success) {
        console.log('UI saved successfully');
      } else {
        console.error('Failed to save UI:', result.errors);
      }
    } catch (error) {
      console.error('Error saving UI:', error);
    }
  };

  const getDeviceWidth = () => {
    switch (deviceMode) {
      case 'mobile': return 375;
      case 'tablet': return 768;
      default: return 1200;
    }
  };

  const renderComponent = (component: UIComponent) => {
    const commonProps = {
      key: component.id,
      style: {
        position: 'absolute' as const,
        left: component.position.x,
        top: component.position.y,
        width: component.size.width,
        height: component.size.height,
        ...component.style,
        cursor: previewMode ? 'default' : 'pointer',
        border: selectedComponent?.id === component.id ? '2px solid #3b82f6' : component.style?.border
      },
      onClick: () => !previewMode && handleComponentSelect(component)
    };

    switch (component.subType) {
      case 'text':
        if (component.type === 'input') {
          return (
            <input 
              {...commonProps}
              type="text"
              placeholder={component.properties.placeholder}
              disabled={!previewMode}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          );
        } else {
          return (
            <div {...commonProps} className="p-2 bg-gray-50 border rounded-md">
              {component.properties.content || 'Output will appear here'}
            </div>
          );
        }

      case 'file':
        return (
          <input 
            {...commonProps}
            type="file"
            accept={component.properties.accept}
            disabled={!previewMode}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
        );

      case 'select':
        return (
          <select 
            {...commonProps}
            disabled={!previewMode}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            {component.properties.options?.map((option: string, idx: number) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'range':
        return (
          <input 
            {...commonProps}
            type="range"
            min={component.properties.min || 0}
            max={component.properties.max || 100}
            defaultValue={component.properties.value || 50}
            disabled={!previewMode}
            className="w-full"
          />
        );

      case 'action':
        return (
          <button 
            {...commonProps}
            disabled={!previewMode}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            {component.properties.text || 'Button'}
          </button>
        );

      case 'image':
        return (
          <img 
            {...commonProps}
            src={component.properties.src || 'https://via.placeholder.com/200x150'}
            alt={component.properties.alt || 'Image'}
            className="object-cover rounded-md"
          />
        );

      case 'json':
        return (
          <pre 
            {...commonProps}
            className="p-2 bg-gray-50 border rounded-md text-xs overflow-auto"
          >
            {JSON.stringify(component.properties.data || {}, null, 2)}
          </pre>
        );

      case 'layout':
        return (
          <div 
            {...commonProps}
            className="border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center"
          >
            <span className="text-gray-500">Container</span>
          </div>
        );

      default:
        return (
          <div {...commonProps}>
            <span className="text-gray-500">Unknown component</span>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 p-[5%]">
      <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Layout className="w-6 h-6 text-indigo-500" />
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                UI Builder
              </h1>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                • {currentFlow?.name || 'Unnamed Agent'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* UI Mode Toggle */}
            <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg">
              <button
                onClick={() => setUiMode('auto')}
                className={`px-3 py-2 rounded-l-lg transition-colors text-sm font-medium ${
                  uiMode === 'auto' 
                    ? 'bg-indigo-500 text-white' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="ChatGPT-style interface"
              >
                Auto Mode
              </button>
              <button
                onClick={() => setUiMode('builder')}
                className={`px-3 py-2 rounded-r-lg transition-colors text-sm font-medium ${
                  uiMode === 'builder' 
                    ? 'bg-indigo-500 text-white' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visual builder interface"
              >
                Builder Mode
              </button>
            </div>

            {/* Device Mode Toggle - Only show in builder mode */}
            {uiMode === 'builder' && (
              <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg">
                <button
                  onClick={() => setDeviceMode('desktop')}
                  className={`p-2 rounded-l-lg transition-colors ${
                    deviceMode === 'desktop' 
                      ? 'bg-indigo-500 text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="Desktop View"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeviceMode('tablet')}
                  className={`p-2 transition-colors ${
                    deviceMode === 'tablet' 
                      ? 'bg-indigo-500 text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="Tablet View"
                >
                  <Tablet className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeviceMode('mobile')}
                  className={`p-2 rounded-r-lg transition-colors ${
                    deviceMode === 'mobile' 
                      ? 'bg-indigo-500 text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="Mobile View"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Preview Toggle - Only show in builder mode */}
            {uiMode === 'builder' && (
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                  previewMode 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Eye className="w-4 h-4" />
                {previewMode ? 'Exit Preview' : 'Preview'}
              </button>
            )}
            
            <button 
              onClick={handleSaveUI}
              disabled={components.length === 0}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
            >
              <Save className="w-4 h-4" />
              Save UI
            </button>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close UI Builder"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Show different interfaces based on mode */}
          {uiMode === 'auto' ? (
            <AutoModeInterface 
              currentFlow={currentFlow}
              inputNodes={inputNodes}
              outputNodes={outputNodes}
              staticNodes={staticNodes}
              messages={messages}
              setMessages={setMessages}
              inputValues={inputValues}
              setInputValues={setInputValues}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          ) : (
            <>
              {/* Workflow Components Sidebar */}
              <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agent Interface</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Generated from your workflow</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Workflow Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    {currentFlow?.name || 'Current Agent'}
                  </h3>
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300 space-y-1">
                  <div>• {inputNodes.length} input node(s)</div>
                  <div>• {outputNodes.length} output node(s)</div>
                  <div>• {components.length} UI component(s)</div>
                </div>
              </div>

              {/* Input Nodes */}
              {inputNodes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Input Nodes
                  </h3>
                  <div className="space-y-2">
                    {inputNodes.map((node) => (
                      <div
                        key={node.id}
                        className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">📥</span>
                          <div>
                            <div className="font-medium text-green-800 dark:text-green-200">
                              {node.data?.label || node.type}
                            </div>
                            <div className="text-xs text-green-600 dark:text-green-400">
                              {node.type} • ID: {node.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output Nodes */}
              {outputNodes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Output Nodes
                  </h3>
                  <div className="space-y-2">
                    {outputNodes.map((node) => (
                      <div
                        key={node.id}
                        className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">📤</span>
                          <div>
                            <div className="font-medium text-blue-800 dark:text-blue-200">
                              {node.data?.label || node.type}
                            </div>
                            <div className="text-xs text-blue-600 dark:text-blue-400">
                              {node.type} • ID: {node.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* UI Instructions */}
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <Layout className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                    How it works
                  </h3>
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-300 space-y-1">
                  <div>• UI is auto-generated from your workflow</div>
                  <div>• Click components to customize them</div>
                  <div>• Use Preview mode to test the interface</div>
                  <div>• Save to create a shareable agent UI</div>
                </div>
              </div>

              {/* No Workflow Warning */}
              {(!currentFlow || nodes.length === 0) && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">⚠️</span>
                    <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                      No Workflow Detected
                    </h3>
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-300">
                    Create a workflow in Agent Studio first, then return to build its UI.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Canvas Area */}
          <div className="flex-1 flex flex-col">
            {/* Canvas */}
            <div className="flex-1 bg-gray-100 dark:bg-gray-900 p-4 overflow-auto">
              <div 
                className="mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg min-h-[600px] relative"
                style={{ width: getDeviceWidth(), maxWidth: '100%' }}
              >
                <div
                  ref={canvasRef}
                  className="relative w-full h-full min-h-[600px] p-4"
                >
                  {(!currentFlow || nodes.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      <div className="text-center max-w-md">
                        <div className="text-4xl mb-4">🤖</div>
                        <p className="text-lg font-medium mb-2">No Agent Workflow Found</p>
                        <p className="text-sm mb-4">
                          Create a workflow in Agent Studio first with input and output nodes. 
                          The UI will be automatically generated based on your agent's structure.
                        </p>
                        <div className="text-xs text-gray-400 space-y-1">
                          <div>1. Go back to Agent Studio</div>
                          <div>2. Add input nodes (text, file, image, etc.)</div>
                          <div>3. Add processing nodes (LLM, API, etc.)</div>
                          <div>4. Add output nodes</div>
                          <div>5. Return here to build the UI</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {components.length === 0 && currentFlow && nodes.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      <div className="text-center">
                        <div className="text-4xl mb-4">⚡</div>
                        <p className="text-lg font-medium">Generating UI...</p>
                        <p className="text-sm">Creating interface based on your agent workflow</p>
                      </div>
                    </div>
                  )}
                  
                  {components.map(renderComponent)}
                </div>
              </div>
            </div>
          </div>

          {/* Properties Panel */}
          {selectedComponent && !previewMode && (
            <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Properties</h3>
                  <button
                    onClick={() => handleDeleteComponent(selectedComponent.id)}
                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedComponent.subType} component
                </p>
              </div>

              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Label */}
                {selectedComponent.properties.label !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      value={selectedComponent.properties.label}
                      onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                        properties: { ...selectedComponent.properties, label: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                )}

                {/* Placeholder */}
                {selectedComponent.properties.placeholder !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Placeholder
                    </label>
                    <input
                      type="text"
                      value={selectedComponent.properties.placeholder}
                      onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                        properties: { ...selectedComponent.properties, placeholder: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                )}

                {/* Content */}
                {selectedComponent.properties.content !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Content
                    </label>
                    <textarea
                      value={selectedComponent.properties.content}
                      onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                        properties: { ...selectedComponent.properties, content: e.target.value }
                      })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                )}

                {/* Button Text */}
                {selectedComponent.properties.text !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Button Text
                    </label>
                    <input
                      type="text"
                      value={selectedComponent.properties.text}
                      onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                        properties: { ...selectedComponent.properties, text: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                )}

                {/* Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Size
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Width</label>
                      <input
                        type="number"
                        value={selectedComponent.size.width}
                        onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                          size: { ...selectedComponent.size, width: parseInt(e.target.value) || 200 }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Height</label>
                      <input
                        type="number"
                        value={selectedComponent.size.height}
                        onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                          size: { ...selectedComponent.size, height: parseInt(e.target.value) || 50 }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Position
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">X</label>
                      <input
                        type="number"
                        value={selectedComponent.position.x}
                        onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                          position: { ...selectedComponent.position, x: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Y</label>
                      <input
                        type="number"
                        value={selectedComponent.position.y}
                        onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                          position: { ...selectedComponent.position, y: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Node Binding */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Bind to Agent Node
                  </label>
                  <select
                    value={selectedComponent.nodeId || ''}
                    onChange={(e) => handleComponentUpdate(selectedComponent.id, {
                      nodeId: e.target.value || undefined
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  >
                    <option value="">Select a node...</option>
                    {selectedComponent.type === 'input' && inputNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.data?.label || node.type} ({node.id.slice(0, 8)})
                      </option>
                    ))}
                    {selectedComponent.type === 'output' && outputNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.data?.label || node.type} ({node.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UIBuilder; 
