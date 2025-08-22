/**
 * Execution Details Modal Component
 * 
 * Displays detailed execution history for autonomous agent messages,
 * including all steps, tool calls, results, and timing information.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Clock, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Wrench, 
  ChevronDown, 
  ChevronUp,
  Code,
  Terminal,
  Database,
  Globe,
  FileText,
  Search,
  Brain,
  Zap,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Target,
  TrendingUp
} from 'lucide-react';

// Types for execution history
interface ExecutionStep {
  stepNumber: number;
  timestamp: Date;
  assistantMessage: {
    role: string;
    content: string;
    tool_calls?: any[];
  };
  toolCalls?: any[];
  toolResults?: any[];
  progressSummary: string;
  verificationLoop?: number;
}

interface ExecutionHistory {
  executionId: string;
  originalQuery: string;
  steps: ExecutionStep[];
  startTime: Date;
  endTime?: Date;
  finalStatus?: string;
  finalConfidence?: number;
}

interface ExecutionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string;
  messageId: string;
}

/**
 * Get tool icon based on tool name
 */
const getToolIcon = (toolName: string): React.ReactNode => {
  const name = toolName.toLowerCase();
  
  if (name.includes('file') || name.includes('read') || name.includes('write')) {
    return <FileText className="w-4 h-4" />;
  } else if (name.includes('terminal') || name.includes('command') || name.includes('bash')) {
    return <Terminal className="w-4 h-4" />;
  } else if (name.includes('database') || name.includes('sql')) {
    return <Database className="w-4 h-4" />;
  } else if (name.includes('web') || name.includes('url') || name.includes('http')) {
    return <Globe className="w-4 h-4" />;
  } else if (name.includes('search') || name.includes('find')) {
    return <Search className="w-4 h-4" />;
  } else if (name.includes('code') || name.includes('python') || name.includes('javascript')) {
    return <Code className="w-4 h-4" />;
  } else {
    return <Wrench className="w-4 h-4" />;
  }
};

/**
 * Format tool name for display
 */
const formatToolName = (toolName: string): string => {
  return toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Tool Call Display Component
 */
const ToolCallDisplay: React.FC<{
  toolCall: any;
  toolResult?: any;
  stepNumber: number;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ toolCall, toolResult, stepNumber, isExpanded, onToggle }) => {
  const [copied, setCopied] = useState(false);
  
  const toolName = toolCall.function?.name || toolCall.name || 'Unknown Tool';
  const toolArgs = toolCall.function?.arguments || toolCall.arguments || '{}';
  
  let parsedArgs;
  try {
    parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
  } catch (e) {
    parsedArgs = toolArgs;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        tool: toolName,
        arguments: parsedArgs,
        result: toolResult
      }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            {getToolIcon(toolName)}
          </div>
          <div className="text-left">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {formatToolName(toolName)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Step {stepNumber} • {Object.keys(parsedArgs).length} parameters
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {toolResult && (
            <div className="flex items-center space-x-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">Success</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            {/* Tool Arguments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Arguments
                </h5>
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Copy tool data"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              </div>
              <pre className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(parsedArgs, null, 2)}
              </pre>
            </div>
            
            {/* Tool Result */}
            {toolResult && (
              <div>
                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Result
                </h5>
                <pre className="text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg overflow-x-auto border border-green-200 dark:border-green-800">
                  {typeof toolResult === 'string' 
                    ? toolResult 
                    : JSON.stringify(toolResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Execution Step Component
 */
const ExecutionStepDisplay: React.FC<{
  step: ExecutionStep;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ step, isExpanded, onToggle }) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  
  const toggleTool = (toolId: string) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  };

  const formatTime = (timestamp: Date): string => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const toolCalls = step.toolCalls || step.assistantMessage.tool_calls || [];
  const toolResults = step.toolResults || [];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-left">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              Step {step.stepNumber}
              {step.verificationLoop && (
                <span className="ml-2 text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                  Verification Loop {step.verificationLoop}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatTime(step.timestamp)} • {toolCalls.length} tool calls • {step.progressSummary}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      
      {isExpanded && (
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            {/* Assistant Message */}
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Assistant Response
              </h5>
              <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                {step.assistantMessage.content || 'No content'}
              </div>
            </div>
            
            {/* Tool Calls */}
            {toolCalls.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tool Calls ({toolCalls.length})
                </h5>
                <div className="space-y-2">
                  {toolCalls.map((toolCall, index) => (
                    <ToolCallDisplay
                      key={toolCall.id || index}
                      toolCall={toolCall}
                      toolResult={toolResults[index]}
                      stepNumber={step.stepNumber}
                      isExpanded={expandedTools.has(toolCall.id || `${index}`)}
                      onToggle={() => toggleTool(toolCall.id || `${index}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Main Execution Details Modal Component
 */
const ExecutionDetailsModal: React.FC<ExecutionDetailsModalProps> = ({
  isOpen,
  onClose,
  executionId,
  messageId
}) => {
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Load execution history from localStorage
  useEffect(() => {
    if (!isOpen || !executionId) return;
    
    const loadExecutionHistory = () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const stored = localStorage.getItem(`angela_execution_${executionId}`);
        if (stored) {
          const history: ExecutionHistory = JSON.parse(stored);
          
          // Convert timestamp strings back to Date objects
          history.startTime = new Date(history.startTime);
          if (history.endTime) {
            history.endTime = new Date(history.endTime);
          }
          
          if (history.steps) {
            history.steps = history.steps.map(step => ({
              ...step,
              timestamp: new Date(step.timestamp)
            }));
          }
          
          setExecutionHistory(history);
        } else {
          setError('Execution history not found');
        }
      } catch (err) {
        setError('Failed to load execution history');
        console.error('Error loading execution history:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadExecutionHistory();
  }, [isOpen, executionId]);

  // Toggle step expansion
  const toggleStep = (stepNumber: number) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepNumber)) {
        newSet.delete(stepNumber);
      } else {
        newSet.add(stepNumber);
      }
      return newSet;
    });
  };

  // Calculate execution stats
  const stats = useMemo(() => {
    if (!executionHistory) return null;
    
    const totalSteps = executionHistory.steps.length;
    const totalToolCalls = executionHistory.steps.reduce((sum, step) => {
      return sum + (step.toolCalls?.length || step.assistantMessage.tool_calls?.length || 0);
    }, 0);
    
    const duration = executionHistory.endTime && executionHistory.startTime
      ? executionHistory.endTime.getTime() - executionHistory.startTime.getTime()
      : 0;
    
    return {
      totalSteps,
      totalToolCalls,
      duration,
      confidence: executionHistory.finalConfidence || 0
    };
  }, [executionHistory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Execution Details
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {executionId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600 dark:text-gray-400">Loading execution history...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">{error}</p>
              </div>
            </div>
          ) : executionHistory ? (
            <div className="space-y-6">
              {/* Execution Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Execution Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {stats?.totalSteps || 0}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Steps</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {stats?.totalToolCalls || 0}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Tool Calls</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {stats?.duration ? `${(stats.duration / 1000).toFixed(1)}s` : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {stats?.confidence ? `${stats.confidence}%` : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Confidence</div>
                  </div>
                </div>
              </div>

              {/* Original Query */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Original Query
                </h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-gray-800 dark:text-gray-200">
                    {executionHistory.originalQuery}
                  </p>
                </div>
              </div>

              {/* Execution Steps */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Execution Steps ({executionHistory.steps.length})
                </h3>
                <div className="space-y-3">
                  {executionHistory.steps.map((step) => (
                    <ExecutionStepDisplay
                      key={step.stepNumber}
                      step={step}
                      isExpanded={expandedSteps.has(step.stepNumber)}
                      onToggle={() => toggleStep(step.stepNumber)}
                    />
                  ))}
                </div>
              </div>

              {/* Final Status */}
              {executionHistory.finalStatus && (
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Final Status
                  </h3>
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-gray-800 dark:text-gray-200">
                      {executionHistory.finalStatus}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ExecutionDetailsModal; 
