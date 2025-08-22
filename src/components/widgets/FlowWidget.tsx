import React, { useState, useEffect } from 'react';
import { Play, Square, RotateCcw, Settings, Trash2, Workflow, Upload, AlertCircle, CheckCircle, Loader2, RefreshCw, Terminal, XCircle } from 'lucide-react';
import { FlowExecutor } from '../../shared/FlowEngine/FlowExecutor';
import { FlowNode, Connection, ExecutionLog } from '../../types/agent/types';
import { customNodeManager } from '../AgentBuilder/NodeCreator/CustomNodeManager';

interface FlowWidgetProps {
  id: string;
  name: string;
  flowData: any;
  onRemove: (id: string) => void;
  className?: string;
}

interface FlowInput {
  id: string;
  label: string;
  type: string;
  value: any;
  required?: boolean;
}

interface FlowOutput {
  id: string;
  label: string;
  value: any;
  type?: string;
}

const FlowWidget: React.FC<FlowWidgetProps> = ({ id, name, flowData, onRemove, className = '' }) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<FlowInput[]>([]);
  const [outputs, setOutputs] = useState<FlowOutput[]>([]);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Parse flow data to extract inputs and outputs
  useEffect(() => {
    console.log('FlowWidget: Analyzing flow data:', flowData);
    
    if (flowData && flowData.nodes) {
      console.log('FlowWidget: Found nodes:', flowData.nodes);
      
      // Much more flexible input detection
      const inputNodes = flowData.nodes.filter((node: any) => {
        const isInputType = node.type === 'input' || 
                           node.type === 'image-input' || 
                           node.type === 'pdf-input' ||
                           node.type === 'text-input' ||
                           node.type === 'number-input' ||
                           node.type === 'file-input';
        
        const hasInputInLabel = node.data?.label && 
                               node.data.label.toLowerCase().includes('input');
        
        const hasInputType = node.data?.inputType || 
                            node.data?.type === 'input' ||
                            node.data?.nodeType === 'input';
        
        const isInputNode = isInputType || hasInputInLabel || hasInputType;
        
        console.log(`FlowWidget: Node ${node.id} (${node.type}):`, {
          isInputType,
          hasInputInLabel,
          hasInputType,
          isInputNode,
          nodeData: node.data
        });
        
        return isInputNode;
      });

      console.log('FlowWidget: Found input nodes:', inputNodes);

      const parsedInputs: FlowInput[] = inputNodes.map((node: any, index: number) => {
        let inputType = 'text';
        let label = node.data?.label || node.data?.name || `Input ${index + 1}`;
        
        // Determine input type based on node type or data
        if (node.type === 'image-input' || node.type === 'file-input' || node.data?.inputType === 'file') {
          inputType = 'file';
        } else if (node.type === 'pdf-input') {
          inputType = 'file';
        } else if (node.type === 'number-input' || node.data?.inputType === 'number' || node.data?.dataType === 'number') {
          inputType = 'number';
        } else if (node.data?.inputType === 'textarea' || node.data?.multiline) {
          inputType = 'textarea';
        } else if (node.data?.inputType) {
          inputType = node.data.inputType;
        } else if (node.data?.type && node.data.type !== 'input') {
          inputType = node.data.type;
        }

        const parsedInput = {
          id: node.id || `input-${index}`,
          label,
          type: inputType,
          value: inputType === 'file' ? null : '',
          required: node.data?.required !== false
        };
        
        console.log('FlowWidget: Parsed input:', parsedInput);
        return parsedInput;
      });

      console.log('FlowWidget: Final parsed inputs:', parsedInputs);
      setInputs(parsedInputs);
    } else {
      console.log('FlowWidget: No flow data or nodes found');
      setInputs([]);
    }
  }, [flowData]);

  // Handle input value changes
  const handleInputChange = (inputId: string, value: any) => {
    setInputs(prev => prev.map(input => 
      input.id === inputId ? { ...input, value } : input
    ));
  };

  // Handle file upload
  const handleFileUpload = (inputId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      handleInputChange(inputId, {
        name: file.name,
        size: file.size,
        type: file.type,
        data: result
      });
    };
    reader.readAsDataURL(file);
  };

  // Real flow execution using Agent Studio's FlowExecutor
  const executeFlow = async () => {
    setIsExecuting(true);
    setExecutionStatus('running');
    setExecutionError(null);
    setExecutionLogs([]);
    
    try {
      // Prepare input values for execution
      const executionInputs: Record<string, any> = {};
      inputs.forEach(input => {
        if (input.type === 'file' && input.value) {
          // For file inputs, use the file data
          executionInputs[input.id] = input.value.data;
        } else {
          executionInputs[input.id] = input.value;
        }
      });

      console.log('FlowWidget: Executing with inputs:', executionInputs);

      // Create FlowExecutor instance
      const executor = new FlowExecutor({
        enableLogging: true,
        onExecutionLog: (log) => {
          setExecutionLogs(prev => [...prev, log]);
        }
      });

      // Normalize flow data structure
      let nodes: FlowNode[] = [];
      let connections: Connection[] = [];

      if (flowData.nodes) {
        // Convert flow nodes to FlowNode format
        nodes = flowData.nodes.map((node: any) => ({
          id: node.id,
          type: node.type,
          name: node.data?.label || node.data?.name || node.type,
          position: node.position || { x: 0, y: 0 },
          data: node.data || {},
          inputs: node.inputs || [],
          outputs: node.outputs || [],
          metadata: node.metadata || {}
        }));

        // Set input node values
        nodes.forEach(node => {
          if (inputs.find(input => input.id === node.id)) {
            const inputValue = executionInputs[node.id];
            node.data = { ...node.data, value: inputValue };
            console.log(`FlowWidget: Set input value for node ${node.id}:`, inputValue);
          }
        });
      }

      if (flowData.connections) {
        connections = flowData.connections;
      } else if (flowData.edges) {
        // Convert edges to connections
        connections = flowData.edges.map((edge: any) => ({
          id: edge.id,
          sourceNodeId: edge.source,
          sourcePortId: edge.sourceHandle || 'output',
          targetNodeId: edge.target,
          targetPortId: edge.targetHandle || 'input'
        }));
      }

      console.log('FlowWidget: Normalized nodes:', nodes);
      console.log('FlowWidget: Normalized connections:', connections);

      // Get custom nodes from the flow data or manager
      const customNodes = flowData.customNodes || customNodeManager.getCustomNodes();

      // Execute the flow
      const results = await executor.executeFlow(nodes, connections, executionInputs, customNodes);

      console.log('FlowWidget: Execution results:', results);

      // Process results into outputs
      const processedOutputs: FlowOutput[] = [];

      // Find output nodes and LLM nodes to display results
      const outputNodes = nodes.filter(node => 
        node.type === 'output' || 
        node.type === 'llm' || 
        node.type === 'structured-llm' ||
        node.type === 'api-request'
      );

      for (const outputNode of outputNodes) {
        const result = results[outputNode.id];
        if (result !== undefined) {
          let outputValue = result;
          let outputType = 'text';

          // Handle different result types
          if (typeof result === 'object' && result !== null) {
            if (result.output !== undefined) {
              outputValue = result.output;
            }
            if (typeof outputValue === 'object') {
              outputType = 'json';
            }
          }

          processedOutputs.push({
            id: outputNode.id,
            label: outputNode.name,
            value: outputValue,
            type: outputType
          });
        }
      }

      // If no specific output nodes, show all non-input results
      if (processedOutputs.length === 0) {
        Object.entries(results).forEach(([nodeId, result]) => {
          const node = nodes.find(n => n.id === nodeId);
          if (node && node.type !== 'input') {
            let outputValue = result;
            let outputType = 'text';

            if (typeof result === 'object' && result !== null) {
              if (result.output !== undefined) {
                outputValue = result.output;
              }
              if (typeof outputValue === 'object') {
                outputType = 'json';
              }
            }

            processedOutputs.push({
              id: nodeId,
              label: node.name,
              value: outputValue,
              type: outputType
            });
          }
        });
      }

      console.log('FlowWidget: Processed outputs:', processedOutputs);
      setOutputs(processedOutputs);
      setExecutionStatus('success');
      setHasExecuted(true);

    } catch (error) {
      console.error('FlowWidget: Execution error:', error);
      setExecutionError(error instanceof Error ? error.message : 'Flow execution failed');
      setExecutionStatus('error');
      setExecutionLogs(prev => [...prev, {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Flow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset flow
  const resetFlow = () => {
    setOutputs([]);
    setHasExecuted(false);
    setExecutionStatus('idle');
    setExecutionError(null);
    setExecutionLogs([]);
    setShowLogs(false);
    // Reset input values
    setInputs(prev => prev.map(input => ({
      ...input,
      value: input.type === 'file' ? null : ''
    })));
  };

  // Check if flow can be executed
  const canExecute = inputs.length > 0 && inputs.every(input => 
    !input.required || (input.value !== null && input.value !== '')
  );

  // Render input field based on type
  const renderInputField = (input: FlowInput) => {
    const baseClassName = "w-full px-3 py-2 border border-gray-300/50 dark:border-gray-600/50 rounded-lg bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 dark:focus:border-purple-400 placeholder-gray-500 dark:placeholder-gray-400 transition-all";
    
    switch (input.type) {
      case 'file':
        return (
          <div>
            <input
              type="file"
              accept={input.id.includes('image') ? 'image/*' : input.id.includes('pdf') ? '.pdf' : '*/*'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(input.id, file);
              }}
              className="hidden"
              id={`file-${input.id}`}
            />
            <label
              htmlFor={`file-${input.id}`}
              className={`${baseClassName} cursor-pointer flex items-center justify-center gap-2 hover:bg-white/80 dark:hover:bg-gray-600/80 transition-all`}
            >
              <Upload className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              <span className="text-gray-700 dark:text-gray-300">
                {input.value ? input.value.name : 'Choose file...'}
              </span>
            </label>
          </div>
        );
      
      case 'number':
        return (
          <input
            type="number"
            value={input.value || ''}
            onChange={(e) => handleInputChange(input.id, e.target.value)}
            className={baseClassName}
            placeholder="Enter a number"
          />
        );
      
      case 'textarea':
        return (
          <textarea
            value={input.value || ''}
            onChange={(e) => handleInputChange(input.id, e.target.value)}
            className={`${baseClassName} min-h-[80px] resize-none`}
            placeholder="Enter your text here..."
            rows={3}
          />
        );
      
      default:
        return (
          <input
            type="text"
            value={input.value || ''}
            onChange={(e) => handleInputChange(input.id, e.target.value)}
            className={baseClassName}
            placeholder="Enter text..."
          />
        );
    }
  };

  // Render output value based on type
  const renderOutputValue = (output: FlowOutput) => {
    if (output.type === 'json' && typeof output.value === 'object') {
      return (
        <pre className="bg-gray-50/80 dark:bg-gray-800/60 backdrop-blur-sm p-3 rounded-lg text-sm overflow-x-auto border border-gray-200/30 dark:border-gray-600/30 text-gray-800 dark:text-gray-200">
          {JSON.stringify(output.value, null, 2)}
        </pre>
      );
    }
    
    return (
      <div className="bg-gray-50/80 dark:bg-gray-800/60 backdrop-blur-sm p-3 rounded-lg border border-gray-200/30 dark:border-gray-600/30">
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {String(output.value)}
        </p>
      </div>
    );
  };

  return (
    <div className={`glassmorphic rounded-2xl h-full flex flex-col group relative ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200/20 dark:border-gray-700/20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-100/50 dark:bg-purple-500/20 rounded-lg backdrop-blur-sm">
            <Workflow className="w-4 h-4 text-purple-500" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{name}</h3>
        </div>
        <div className="flex items-center gap-2">
          {executionLogs.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`p-1 rounded transition-colors relative ${
                showLogs 
                  ? 'text-purple-500 bg-purple-100/50 dark:bg-purple-900/30'
                  : 'text-gray-400 hover:text-purple-500 dark:hover:text-purple-400'
              }`}
              title="Toggle execution logs"
            >
              <Terminal className="w-4 h-4" />
              {executionLogs.length > 0 && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-medium">{executionLogs.length > 9 ? '9+' : executionLogs.length}</span>
                </div>
              )}
            </button>
          )}
          {executionStatus === 'success' && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          {executionStatus === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
        </div>
      </div>
      
      <button
        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4" />
      </button>

      {/* Execution Logs Panel */}
      {showLogs && executionLogs.length > 0 && (
        <div className="border-b border-gray-200/20 dark:border-gray-700/20 bg-gray-50/30 dark:bg-gray-900/20 backdrop-blur-sm">
          <div className="px-4 py-2 border-b border-gray-200/20 dark:border-gray-700/20">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Execution Logs ({executionLogs.length})
              </h4>
              <button
                onClick={() => setExecutionLogs([])}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto p-3 space-y-2">
            {executionLogs.map((log) => (
              <div
                key={log.id}
                className={`text-xs p-2 rounded border backdrop-blur-sm ${
                  log.level === 'error'
                    ? 'bg-red-50/80 dark:bg-red-900/20 border-red-200/50 dark:border-red-800/30 text-red-700 dark:text-red-300'
                    : log.level === 'warning'
                    ? 'bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200/50 dark:border-yellow-800/30 text-yellow-700 dark:text-yellow-300'
                    : log.level === 'success'
                    ? 'bg-green-50/80 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/30 text-green-700 dark:text-green-300'
                    : 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/30 text-blue-700 dark:text-blue-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs opacity-75 flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1 min-w-0">{log.message}</span>
                  {log.duration && (
                    <span className="text-xs opacity-75 flex-shrink-0">
                      {log.duration}ms
                    </span>
                  )}
                </div>
                {log.data && (
                  <details className="mt-1 opacity-75">
                    <summary className="cursor-pointer hover:opacity-100">Details</summary>
                    <pre className="mt-1 text-xs overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {inputs.length === 0 ? (
          <div className="text-center py-8">
            <div className="p-4 bg-purple-100/50 dark:bg-purple-500/20 rounded-2xl w-fit mx-auto mb-3 backdrop-blur-sm">
              <Workflow className="w-8 h-8 text-purple-500 mx-auto" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              No inputs detected in this flow
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Make sure your flow has input nodes (input, image-input, pdf-input, etc.)
            </p>
            {/* Debug info */}
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                Debug: Show flow data
              </summary>
              <pre className="mt-2 text-xs bg-gray-100/50 dark:bg-gray-900/30 backdrop-blur-sm p-2 rounded overflow-x-auto max-h-40 text-gray-700 dark:text-gray-300 border border-gray-200/30 dark:border-gray-700/30">
                {JSON.stringify(flowData, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Indicator */}
            {(isExecuting || hasExecuted) && (
              <div className={`flex items-center gap-2 p-3 rounded-xl border backdrop-blur-sm ${
                isExecuting
                  ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/30'
                  : executionStatus === 'success'
                  ? 'bg-green-50/80 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/30'
                  : 'bg-red-50/80 dark:bg-red-900/20 border-red-200/50 dark:border-red-800/30'
              }`}>
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Executing flow with Agent Studio engine...
                    </span>
                  </>
                ) : executionStatus === 'success' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">
                      Flow executed successfully with real AI responses
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">
                      Flow execution failed
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Inputs Section */}
            {!hasExecuted && (
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  {/* <span>Flow Inputs</span> */}
                  <span className="text-xs bg-blue-100/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {inputs.length} inputs
                  </span>
                </h4>
                <div className="space-y-4">
                  {inputs.map((input) => (
                    <div key={input.id} className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm p-3 rounded-xl border border-gray-200/30 dark:border-gray-700/30">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {input.label}
                        {input.required && <span className="text-red-500 ml-1">*</span>}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({input.type})</span>
                      </label>
                      {renderInputField(input)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outputs Section */}
            {hasExecuted && outputs.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span>Flow Outputs</span>
                  <span className="text-xs bg-green-100/50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {outputs.length} outputs
                  </span>
                  <span className="text-xs bg-purple-100/50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    Real Results
                  </span>
                </h4>
                <div className="space-y-4">
                  {outputs.map((output) => (
                    <div key={output.id} className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm p-3 rounded-xl border border-gray-200/30 dark:border-gray-700/30">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {output.label}
                      </label>
                      {renderOutputValue(output)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {executionError && (
              <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/30 rounded-xl p-3 backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
                      Execution Error
                    </h4>
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {executionError}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {inputs.length > 0 && (
        <div className="p-4 border-t border-gray-200/20 dark:border-gray-700/20 bg-gradient-to-t from-white/80 to-transparent dark:from-gray-800/80 backdrop-blur-sm">
          <div className="flex gap-2">
            {!hasExecuted ? (
              <button
                onClick={executeFlow}
                disabled={!canExecute || isExecuting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  canExecute && !isExecuting
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                    : 'bg-gray-300/50 dark:bg-gray-600/50 text-gray-500 dark:text-gray-400 cursor-not-allowed backdrop-blur-sm'
                }`}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Executing with AI...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Send
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={resetFlow}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
            {executionLogs.length > 0 && !showLogs && (
              <button
                onClick={() => setShowLogs(true)}
                className="px-3 py-3 bg-gray-200/50 dark:bg-gray-600/50 hover:bg-gray-300/50 dark:hover:bg-gray-500/50 text-gray-700 dark:text-gray-300 rounded-xl transition-colors backdrop-blur-sm"
                title="Show execution logs"
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}
          </div>
          {!canExecute && !isExecuting && !hasExecuted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Please fill in all required fields to run the flow
            </p>
          )}
          {!isExecuting && !hasExecuted && (
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 text-center font-medium">
              {/* 🧠 Powered by Agent Studio - Real AI execution with Ollama */}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default FlowWidget; 
