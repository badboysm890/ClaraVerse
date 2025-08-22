import React, { memo, ReactNode } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { X, Settings } from 'lucide-react';
import { NodePort } from '../../../types/agent/types';
import { useAgentBuilder } from '../../../contexts/AgentBuilder/AgentBuilderContext';

interface BaseNodeProps extends NodeProps {
  title: string;
  category: string;
  icon?: ReactNode;
  inputs?: NodePort[];
  outputs?: NodePort[];
  children?: ReactNode;
  executing?: boolean;
  error?: string;
  success?: boolean;
}



const BaseNode = memo<BaseNodeProps>(({
  id,
  data,
  selected,
  title,
  category,
  icon,
  inputs = [],
  outputs = [],
  children,
  executing: propExecuting = false,
  error: propError,
  success: propSuccess,
}) => {
  // Debug logging to understand what's being passed
  if (!Array.isArray(inputs)) {
    console.error('BaseNode: inputs is not an array:', { id, inputs, type: typeof inputs });
  }
  if (!Array.isArray(outputs)) {
    console.error('BaseNode: outputs is not an array:', { id, outputs, type: typeof outputs });
  }
  
  // Ensure inputs and outputs are always arrays
  const safeInputs = Array.isArray(inputs) ? inputs : [];
  const safeOutputs = Array.isArray(outputs) ? outputs : [];

  const { nodeExecutionStates } = useAgentBuilder();
  
  // Get execution state from context
  const executionState = nodeExecutionStates[id];
  const isExecuting = executionState?.status === 'executing' || propExecuting;
  const hasError = executionState?.status === 'error' || propError;
  const isSuccess = executionState?.status === 'success' || propSuccess;
  const errorMessage = executionState?.error || propError;

  const handleDelete = () => {
    if (data.onDelete) {
      data.onDelete();
    }
  };

  const handleConfig = () => {
    // TODO: Open node configuration modal
    console.log('Configure node:', id);
  };

  // Get category color
  const getCategoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'basic':
      case 'input': return 'bg-green-500';
      case 'output': return 'bg-red-500';
      case 'data': return 'bg-blue-500';
      case 'logic': return 'bg-purple-500';
      case 'ai': return 'bg-gradient-to-r from-sakura-500 to-pink-500';
      case 'media': return 'bg-pink-500';
      case 'text': return 'bg-blue-500';
      case 'math': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusClass = () => {
    if (isExecuting) return 'ring-2 ring-yellow-400 ring-opacity-75 animate-pulse';
    if (hasError) return 'ring-2 ring-red-400 ring-opacity-75';
    if (isSuccess) return 'ring-2 ring-green-400 ring-opacity-75';
    return '';
  };

  const getStatusIndicator = () => {
    if (isExecuting) return <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />;
    if (hasError) return <div className="w-2 h-2 bg-red-400 rounded-full" />;
    if (isSuccess) return <div className="w-2 h-2 bg-green-400 rounded-full" />;
    return null;
  };

  return (
    <div className={`
      relative bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg
      ${selected ? 'shadow-sakura-400/25' : ''}
      ${getStatusClass()}
      transition-all duration-200
      min-w-[360px] max-w-[580px] w-auto
      hover:shadow-xl
    `}>
      {/* Input Handles */}
      {safeInputs.map((input, index) => (
        <Handle
          key={input.id}
          type="target"
          position={Position.Left}
          id={input.id}
          style={{
            top: `${((index + 1) * 100) / (safeInputs.length + 1)}%`,
            background: '#10b981',
            width: '16px',
            height: '16px',
            left: '-8px',
            zIndex: 1000,
            pointerEvents: 'all',
            cursor: 'crosshair',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
          }}
          className="hover:scale-125 transition-all shadow-lg hover:shadow-xl hover:shadow-green-500/50"
          title={`Input: ${input.name} (${input.dataType})`}
        />
      ))}

      {/* Output Handles */}
      {safeOutputs.map((output, index) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          style={{
            top: `${((index + 1) * 100) / (safeOutputs.length + 1)}%`,
            background: '#6b7280',
            width: '16px',
            height: '16px',
            right: '-8px',
            zIndex: 1000,
            pointerEvents: 'all',
            cursor: 'crosshair',
            boxShadow: '0 2px 8px rgba(107, 114, 128, 0.3)',
          }}
          className="hover:scale-125 transition-all shadow-lg hover:shadow-xl hover:shadow-gray-500/50"
          title={`Output: ${output.name} (${output.dataType})`}
        />
      ))}

      {/* Node Header */}
      <div className={`
        flex items-center justify-between px-4 py-3.5 rounded-t-lg
        ${getCategoryColor(category)} text-white
        cursor-move
        select-none
        relative z-10
      `}>
        <div className="flex items-center gap-2.5">
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <span className="font-semibold text-sm tracking-wide">{title}</span>
          {getStatusIndicator()}
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleConfig}
            className="p-1.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
            title="Configure"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
            title="Delete"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node Content */}
      <div className="px-4 py-3.5 bg-gray-50 dark:bg-gray-700 rounded-b-lg select-none relative z-10">
        {/* Input Labels */}
        {safeInputs.length > 0 && (
          <div className="mb-3.5">
            {safeInputs.map((input, index) => (
              <div
                key={input.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 leading-relaxed"
                style={{ marginTop: index === 0 ? 0 : '6px' }}
              >
                <span className="font-medium">{input.name}</span>
                {input.required && <span className="text-red-500 ml-1">*</span>}
                <span className="text-gray-400 dark:text-gray-500 ml-1.5">({input.dataType})</span>
              </div>
            ))}
          </div>
        )}

        {/* Custom Content */}
        {children}

        {/* Execution Status */}
        {isExecuting && (
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-yellow-700 dark:text-yellow-300 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="font-medium">Executing...</span>
            </div>
          </div>
        )}

        {/* Success Status */}
        {isSuccess && !isExecuting && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-300 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full"></div>
              <span className="font-medium">Completed successfully</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {hasError && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-red-400 rounded-full"></div>
              <span className="font-medium">Error:</span>
              <span className="break-words">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Output Labels */}
        {safeOutputs.length > 0 && (
          <div className="mt-3.5">
            {safeOutputs.map((output, index) => (
              <div
                key={output.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 text-right leading-relaxed"
                style={{ marginTop: index === 0 ? 0 : '6px' }}
              >
                <span className="text-gray-400 dark:text-gray-500 mr-1.5">({output.dataType})</span>
                <span className="font-medium">{output.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

BaseNode.displayName = 'BaseNode';

export default BaseNode; 
