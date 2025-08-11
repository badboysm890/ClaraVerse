import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  FileText, 
  Scale, 
  Shield, 
  Rocket, 
  Brain, 
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  Info
} from 'lucide-react';

export type OptimizerPreset = 'high_speed' | 'more_context' | 'balanced' | 'system_safe' | 'ultra_performance' | 'moe_optimized';

interface LLaMAOptimizerState {
  selectedPreset: OptimizerPreset;
  lastOptimized: string;
  lastConfigPath: string;
}

interface PresetConfig {
  id: OptimizerPreset;
  name: string;
  description: string;
  useCase: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface LLaMAOptimizerPanelProps {
  configPath: string;
  isServiceRunning: boolean;
  onOptimizationStart: () => void;
  onOptimizationComplete: (success: boolean, message: string) => void;
  disabled: boolean;
}

const PRESETS: PresetConfig[] = [
  {
    id: 'high_speed',
    name: 'High Speed',
    description: 'Speed-optimized for fast inference',
    useCase: 'API usage, short conversations',
    icon: <Zap className="w-5 h-5" />,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-700'
  },
  {
    id: 'more_context',
    name: 'More Context',
    description: 'Maximized context length',
    useCase: 'Long conversations, documents',
    icon: <FileText className="w-5 h-5" />,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-700'
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Optimal balance of speed & stability',
    useCase: 'General use, mixed workloads',
    icon: <Scale className="w-5 h-5" />,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-700'
  },
  {
    id: 'system_safe',
    name: 'System Safe',
    description: 'Conservative settings for stability',
    useCase: 'Shared resources, production',
    icon: <Shield className="w-5 h-5" />,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    borderColor: 'border-gray-200 dark:border-gray-700'
  },
  {
    id: 'ultra_performance',
    name: 'Ultra Performance',
    description: 'Maximum performance settings',
    useCase: 'High-end systems, batch processing',
    icon: <Rocket className="w-5 h-5" />,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-700'
  },
  {
    id: 'moe_optimized',
    name: 'MoE Optimized',
    description: 'Specialized for MoE models',
    useCase: 'Mixtral, A3B architectures',
    icon: <Brain className="w-5 h-5" />,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-700'
  }
];

const STORAGE_KEY = 'claracore-optimizer-state';

const LLaMAOptimizerPanel: React.FC<LLaMAOptimizerPanelProps> = ({
  configPath,
  isServiceRunning,
  onOptimizationStart,
  onOptimizationComplete,
  disabled
}) => {
  const [optimizerState, setOptimizerState] = useState<LLaMAOptimizerState>({
    selectedPreset: 'balanced',
    lastOptimized: '',
    lastConfigPath: ''
  });
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationStatus, setOptimizationStatus] = useState<{
    type: 'idle' | 'optimizing' | 'saving' | 'restarting' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedState = JSON.parse(stored);
        setOptimizerState(parsedState);
      }
    } catch (error) {
      console.error('Failed to load optimizer state:', error);
    }
  }, []);

  // Save state to localStorage whenever it changes
  const saveState = (newState: Partial<LLaMAOptimizerState>) => {
    const updatedState = { ...optimizerState, ...newState };
    setOptimizerState(updatedState);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState));
    } catch (error) {
      console.error('Failed to save optimizer state:', error);
    }
  };

  const handlePresetSelection = async (presetId: OptimizerPreset) => {
    if (disabled || isOptimizing) return;

    setIsOptimizing(true);
    onOptimizationStart();
    
    try {
      // Update selected preset immediately and save to localStorage
      setOptimizerState(prev => ({
        ...prev,
        selectedPreset: presetId
      }));
      
      saveState({ 
        selectedPreset: presetId,
        lastConfigPath: configPath 
      });

      // Step 1: Optimize configuration
      setOptimizationStatus({
        type: 'optimizing',
        message: `Optimizing configuration with ${presetId.replace('_', ' ')} preset...`
      });

      // Call the ClaraCore optimizer via the existing llamaSwap service
      const llamaSwap = (window as any).llamaSwap;
      if (!llamaSwap) {
        throw new Error('LlamaSwap service not available');
      }

      const result = await llamaSwap.runLlamaOptimizer(presetId);

      if (!result.success) {
        throw new Error(result.error || 'Optimization failed');
      }

      // Step 2: Success message (restart is handled automatically by the service)
      setOptimizationStatus({
        type: 'success',
        message: result.message || `Successfully optimized with ${presetId.replace('_', ' ')} preset and restarted service!`
      });

      saveState({
        lastOptimized: new Date().toISOString(),
        selectedPreset: presetId // Ensure the preset is saved again
      });

      onOptimizationComplete(true, `Configuration optimized with ${presetId.replace('_', ' ')} preset`);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setOptimizationStatus({ type: 'idle', message: '' });
      }, 3000);

    } catch (error) {
      console.error('Optimization failed:', error);
      
      setOptimizationStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Optimization failed'
      });

      onOptimizationComplete(false, error instanceof Error ? error.message : 'Optimization failed');

      // Clear error message after 5 seconds
      setTimeout(() => {
        setOptimizationStatus({ type: 'idle', message: '' });
      }, 5000);
    } finally {
      setIsOptimizing(false);
    }
  };

  const getStatusIcon = () => {
    switch (optimizationStatus.type) {
      case 'optimizing':
      case 'saving':
      case 'restarting':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (optimizationStatus.type) {
      case 'optimizing':
      case 'saving':
      case 'restarting':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'success':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'error':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default:
        return '';
    }
  };

  const isDisabled = disabled || isOptimizing;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-blue-500" />
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
          ClaraCore Optimizer
        </h4>
      </div>

      {/* Status Bar */}
      {optimizationStatus.type !== 'idle' && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="text-sm font-medium">
            {optimizationStatus.message}
          </span>
        </div>
      )}

      {/* Info Panel */}
      <div className="glassmorphic rounded-lg p-4 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              Automatically optimize your model configurations based on system capabilities and use case.
              <br />
              <small><b>Note:</b> its only trying to optimize for system stability,  but does not guarantee it max throughput from the system (you will have to play with model config a bit).</small>
            </p>
            {optimizerState.lastOptimized && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last optimized: {new Date(optimizerState.lastOptimized).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Preset Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRESETS.map((preset) => {
          const isSelected = optimizerState.selectedPreset === preset.id;
          const isCurrentlyDisabled = isDisabled;

          return (
            <button
              key={preset.id}
              onClick={() => handlePresetSelection(preset.id)}
              disabled={isCurrentlyDisabled}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all duration-200
                glassmorphic backdrop-blur-sm
                ${isSelected 
                  ? `${preset.borderColor} ${preset.bgColor} ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900` 
                  : 'border-gray-200 dark:border-gray-700 bg-white/40 dark:bg-gray-800/30'
                }
                ${isCurrentlyDisabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:shadow-lg hover:scale-105 cursor-pointer'
                }
              `}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                </div>
              )}

              {/* Icon and Name */}
              <div className="flex items-center gap-3 mb-2">
                <div className={`${isSelected ? preset.color : 'text-gray-600 dark:text-gray-400'}`}>
                  {preset.icon}
                </div>
                <h5 className={`font-semibold ${isSelected ? preset.color : 'text-gray-900 dark:text-white'}`}>
                  {preset.name}
                </h5>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {preset.description}
              </p>

              {/* Use Case */}
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Best for: {preset.useCase}
              </p>
            </button>
          );
        })}
      </div>

      {/* Current Configuration Info */}
      {configPath && (
        <div className="glassmorphic rounded-lg p-3 bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <FileText className="w-4 h-4" />
            <span>Config: {configPath.split('\\').pop() || configPath.split('/').pop()}</span>
            {isServiceRunning && (
              <>
                <span className="mx-2">•</span>
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  <span>Service Running</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LLaMAOptimizerPanel;
