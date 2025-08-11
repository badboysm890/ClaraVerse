import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Cpu, 
  Zap, 
  Monitor, 
  BarChart3, 
  Save, 
  RefreshCw, 
  Code, 
  Eye, 
  EyeOff, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  CheckCircle, 
  Play, 
  Info,
  Wrench,
  Gauge,
  Download,
  Upload,
  Database
} from 'lucide-react';
import { parseJsonConfiguration, ParsedModelConfig, updateCommandLineParameter, cleanCommandLine, getModelMaxContextSize, estimateModelTotalLayers } from '../utils/commandLineParser';
import LLaMAOptimizerPanel from './LLaMAOptimizerPanel';

interface Backend {
  id: string;
  name: string;
  description: string;
  folder: string;
  requiresGPU: boolean;
  gpuType: string;
  isAvailable: boolean;
  binaryPath?: string;
}

interface BackendOverride {
  backendId: string | null;
  isOverridden: boolean;
  timestamp?: string;
}

interface ModelConfig {
  name: string;
  path: string;
  port: number;
  isEmbedding: boolean;
  nativeContextSize?: number;
  configuredContextSize?: number;
  gpuLayers?: number;
  estimatedTotalLayers?: number;
  modelSizeGB?: number;
  batchSize?: number;
  ubatchSize?: number;
  threads?: number;
  flashAttention?: boolean;
  continuousBatching?: boolean;
  cacheTypeK?: 'f16' | 'f32' | 'q8_0' | 'q4_0';
  cacheTypeV?: 'f16' | 'f32' | 'q8_0' | 'q4_0';
  memoryLock?: boolean;
  noMmap?: boolean;
  ttl?: number;
  status: 'available' | 'running' | 'error';
}

interface ConfigurationInfo {
  availableBackends: Backend[];
  currentBackendOverride: BackendOverride | null;
  configuration: any;
  configPath: string;
  performanceSettings: any;
  platform: string;
  architecture: string;
  serviceStatus: {
    isRunning: boolean;
    port: number;
    pid?: number;
  };
  models?: ModelConfig[];
  gpuInfo?: {
    hasGPU: boolean;
    gpuMemoryMB: number;
    gpuMemoryGB: number;
    gpuType: string;
    systemMemoryGB: number;
    platform: string;
  };
}

const BackendConfigurationPanel: React.FC = () => {
  const [configInfo, setConfigInfo] = useState<ConfigurationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBackend, setSelectedBackend] = useState<string>('auto');
  const [actualBackend, setActualBackend] = useState<string>(''); // The backend actually being used
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonConfig, setJsonConfig] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [modelConfigs, setModelConfigs] = useState<ParsedModelConfig[]>([]);
  const [modelMetadata, setModelMetadata] = useState<{[modelName: string]: {nativeContextSize?: number, estimatedLayers?: number}}>({});
  const [selectedModelForConfig, setSelectedModelForConfig] = useState<string | null>(null); // Track model selected for detailed configuration
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    backends: false,
    optimizer: true,
    models: false,
    configuration: false,
    advanced: false
  });
  const [operationStatus, setOperationStatus] = useState<{
    type: 'idle' | 'saving' | 'restarting' | 'reconfiguring' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Test model functionality
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{
    [modelName: string]: {
      success: boolean;
      tokensPerSecond?: number;
      responseTime?: number;
      promptTokensPerSecond?: number;
      completionTokensPerSecond?: number;
      error?: string;
      timestamp: number;
    }
  }>({});

  // Load configuration information
  const loadConfigurationInfo = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      if (!llamaSwap) {
        throw new Error('LlamaSwap service not available');
      }

      const result = await llamaSwap.getConfigurationInfo();
      if (result.success) {
        setConfigInfo(result);
        setSelectedBackend(result.currentBackendOverride?.backendId || 'auto');
        
        // Extract actual backend from service status
        if (result.serviceStatus && result.serviceStatus.currentBackendName) {
          setActualBackend(result.serviceStatus.currentBackendName);
        }
        
        // Load model metadata with native context sizes
        try {
          const modelMetadataResult = await llamaSwap.getModelConfigurations();
          if (modelMetadataResult.success && modelMetadataResult.models) {
            const metadataMap: {[modelName: string]: {nativeContextSize?: number, estimatedLayers?: number}} = {};
            modelMetadataResult.models.forEach((model: any) => {
              metadataMap[model.name] = {
                nativeContextSize: model.nativeContextSize,
                estimatedLayers: estimateModelTotalLayers(model.name, model.sizeGB)
              };
            });
            setModelMetadata(metadataMap);
          }
        } catch (metadataError) {
          console.warn('Could not load model metadata:', metadataError);
          // Continue without metadata - will fall back to estimates
        }
        
        // Load JSON configuration and clean up command lines
        if (result.configuration) {
          // Clean up command lines in the configuration
          const cleanedConfig = { ...result.configuration };
          if (cleanedConfig.models) {
            for (const [, modelData] of Object.entries(cleanedConfig.models)) {
              const data = modelData as any;
              if (data.cmd) {
                data.cmd = cleanCommandLine(data.cmd);
              }
            }
          }
          
          setJsonConfig(JSON.stringify(cleanedConfig, null, 2));
          
          // Parse model configurations from the cleaned JSON config
          const parsedModels = parseJsonConfiguration(cleanedConfig);
          
          // Convert ParsedModelConfig to ModelConfig format for UI
          const uiModelConfigs: ModelConfig[] = parsedModels.map(parsed => ({
            name: parsed.name,
            path: parsed.modelPath || '',
            port: parsed.port || 9999,
            isEmbedding: parsed.isEmbedding || false,
            gpuLayers: parsed.gpuLayers,
            estimatedTotalLayers: parsed.estimatedTotalLayers,
            modelSizeGB: parsed.modelSizeGB,
            batchSize: parsed.batchSize,
            ubatchSize: parsed.ubatchSize,
            threads: parsed.threads,
            contextSize: parsed.contextSize, // This is the USER'S configured context size from saved config
            nativeContextSize: modelMetadata[parsed.name]?.nativeContextSize || undefined, // This is the ACTUAL model's native context size
            configuredContextSize: parsed.contextSize, // This is the USER'S configured context size
            flashAttention: parsed.flashAttention,
            continuousBatching: parsed.continuousBatching,
            cacheTypeK: parsed.cacheTypeK as 'f16' | 'f32' | 'q8_0' | 'q4_0' | undefined,
            cacheTypeV: parsed.cacheTypeV as 'f16' | 'f32' | 'q8_0' | 'q4_0' | undefined,
            memoryLock: parsed.memoryLock,
            noMmap: parsed.noMmap,
            ttl: parsed.ttl,
            status: 'available' as const
          }));
          
          setModelConfigs(uiModelConfigs);
          
          // Initialize selected model for configuration (first model by default)
          if (uiModelConfigs.length > 0 && !selectedModelForConfig) {
            setSelectedModelForConfig(uiModelConfigs[0].name);
          }
        }
      } else {
        throw new Error(result.error || 'Failed to load configuration');
      }
    } catch (err) {
      console.error('Error loading configuration:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigurationInfo();
  }, []);

  // Helper to check if operations are in progress
  const isOperationInProgress = operationStatus.type === 'saving' || operationStatus.type === 'restarting' || operationStatus.type === 'reconfiguring';

  // Handle backend selection change
  const handleBackendChange = async (backendId: string) => {
    setOperationStatus({ type: 'saving', message: 'Updating backend selection...' });
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      const result = await llamaSwap.setBackendOverride(backendId === 'auto' ? null : backendId);
      
      if (result.success) {
        setSelectedBackend(backendId);
        setOperationStatus({ type: 'restarting', message: 'Stopping service...' });
        
        // Update status messages during restart process
        setTimeout(() => {
          setOperationStatus({ type: 'restarting', message: 'Applying backend changes...' });
        }, 1000);
        
        setTimeout(() => {
          setOperationStatus({ type: 'restarting', message: `Starting service with ${backendId === 'auto' ? 'auto-detect' : backendId} backend...` });
        }, 3000);
        
        setTimeout(() => {
          setOperationStatus({ type: 'restarting', message: 'Initializing service... (this may take a moment)' });
        }, 5000);
        
        setTimeout(() => {
          setOperationStatus({ type: 'restarting', message: 'Service startup in progress... (almost ready)' });
        }, 10000);
        
        // Automatically restart the service with the new backend
        const restartResult = await llamaSwap.restartWithOverrides();
        if (restartResult.success) {
          setOperationStatus({ 
            type: 'success', 
            message: `✅ Backend changed to ${backendId === 'auto' ? 'Auto-detect' : backendId} and service restarted!` 
          });
          
          // Reload configuration info to show updated paths and service status
          await loadConfigurationInfo();
          
          setTimeout(() => {
            setOperationStatus({ type: 'idle', message: '' });
          }, 3000);
        } else {
          throw new Error(restartResult.error || 'Failed to restart service with new backend');
        }
      } else {
        throw new Error(result.error || 'Failed to set backend');
      }
    } catch (error) {
      console.error('Error changing backend:', error);
      setOperationStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to change backend' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 5000);
    } finally {
    }
  };

  // Force reconfigure
  const handleReconfigure = async () => {
    setOperationStatus({ type: 'reconfiguring', message: 'Regenerating configuration...' });
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      const result = await llamaSwap.regenerateConfig();
      
      if (result.success) {
        setOperationStatus({ 
          type: 'success', 
          message: `Configuration regenerated with ${result.models} models` 
        });
        
        // Reload configuration info
        await loadConfigurationInfo();
        
        setTimeout(() => {
          setOperationStatus({ type: 'idle', message: '' });
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to reconfigure');
      }
    } catch (error) {
      console.error('Error reconfiguring:', error);
      setOperationStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to reconfigure' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 3000);
    }
  };

  // Restart with overrides
  const handleRestartWithOverrides = async () => {
    setOperationStatus({ type: 'restarting', message: 'Stopping service...' });
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      
      // Update status messages during restart process
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Applying configuration...' });
      }, 1000);
      
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Starting service with new settings...' });
      }, 3000);
      
      const result = await llamaSwap.restartWithOverrides();
      
      if (result.success) {
        setOperationStatus({ type: 'success', message: 'Service restarted successfully!' });
        
        // Reload configuration info
        await loadConfigurationInfo();
        
        setTimeout(() => {
          setOperationStatus({ type: 'idle', message: '' });
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to restart service');
      }
    } catch (error) {
      console.error('Error restarting service:', error);
      setOperationStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to restart service' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 3000);
    } finally {
    }
  };

  // Validate and update JSON configuration
  const handleJsonChange = (value: string) => {
    setJsonConfig(value);
    
    // Check if configuration has changed
    const originalConfig = configInfo?.configuration ? JSON.stringify(configInfo.configuration, null, 2) : '';
    setHasUnsavedChanges(value !== originalConfig);
    
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  // Save YAML configuration from JSON
  const saveConfiguration = async () => {
    if (jsonError) {
      setOperationStatus({ 
        type: 'error', 
        message: 'Cannot save configuration with JSON errors' 
      });
      return;
    }

    setOperationStatus({ type: 'saving', message: 'Saving configuration...' });
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      const result = await llamaSwap.saveConfigFromJson(jsonConfig);
      
      if (result.success) {
        let message = '✅ Configuration saved successfully!';
        
        // Show restart recommendation if needed
        if (result.requiresRestart?.required) {
          message += ` ⚠️ ${result.requiresRestart.recommendation}`;
        }
        
        setOperationStatus({ 
          type: 'success', 
          message 
        });
        setHasUnsavedChanges(false);
        
        // Reload configuration info to reflect changes
        await loadConfigurationInfo();
        
        setTimeout(() => {
          setOperationStatus({ type: 'idle', message: '' });
        }, result.requiresRestart?.required ? 5000 : 2000); // Show longer if restart needed
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      setOperationStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to save configuration' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 5000);
    }
  };

  // Save configuration and restart service
  const saveConfigurationAndRestart = async () => {
    if (jsonError) {
      setOperationStatus({ 
        type: 'error', 
        message: 'Cannot save configuration with JSON errors' 
      });
      return;
    }

    setOperationStatus({ type: 'saving', message: 'Saving configuration...' });
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      
      // Update status messages during the complete restart process
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Configuration saved, unloading all models...' });
      }, 1000);
      
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Completely shutting down LlamaSwap server...' });
      }, 3000);
      
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Cleaning up all processes and resources...' });
      }, 5000);
      
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Starting fresh LlamaSwap server with new configuration...' });
      }, 8000);
      
      setTimeout(() => {
        setOperationStatus({ type: 'restarting', message: 'Initializing service... (this may take a moment)' });
      }, 12000);
      
      const result = await llamaSwap.saveConfigAndRestart(jsonConfig);
      
      if (result.success) {
        setOperationStatus({ 
          type: 'success', 
          message: '✅ Configuration saved and LlamaSwap server completely restarted successfully!' 
        });
        setHasUnsavedChanges(false);
        
        // Reload configuration info to reflect changes
        await loadConfigurationInfo();
        
        setTimeout(() => {
          setOperationStatus({ type: 'idle', message: '' });
        }, 4000);
      } else {
        throw new Error(result.error || 'Failed to save configuration and restart');
      }
    } catch (error) {
      console.error('Error saving configuration and restarting:', error);
      setOperationStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to save configuration and restart' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 5000);
    } finally {
    }
  };

  // Export configuration
  const exportConfiguration = () => {
    if (!configInfo?.configuration) return;
    
    const dataStr = JSON.stringify(configInfo.configuration, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'llama-swap-config.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Test model functionality
  const testModel = async (modelName: string) => {
    if (!configInfo?.serviceStatus?.isRunning) {
      setTestResults(prev => ({
        ...prev,
        [modelName]: {
          success: false,
          error: 'LlamaSwap service is not running. Please start the service first.',
          timestamp: Date.now()
        }
      }));
      return;
    }

    setTestingModel(modelName);
    
    try {
      const llamaSwap = (window as any).llamaSwap;
      const apiUrl = await llamaSwap.getApiUrl();
      
      if (!apiUrl) {
        throw new Error('Could not get API URL from LlamaSwap service');
      }

      const startTime = performance.now();
      
      // Make a simple chat completion request to test the model
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: 'Hi! Please respond with exactly "Hello!" and nothing else.'
            }
          ],
          max_tokens: 10,
          temperature: 0.1,
          stream: false
        })
      });

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from model');
      }

      // Extract detailed performance metrics from timings (preferred) or usage
      let tokensPerSecond = 0;
      let actualResponseTime = responseTime;
      let promptTokensPerSecond = 0;
      let completionTokensPerSecond = 0;
      
      if (data.timings) {
        // Use the more accurate timings from LlamaSwap
        completionTokensPerSecond = data.timings.predicted_per_second || 0;
        promptTokensPerSecond = data.timings.prompt_per_second || 0;
        tokensPerSecond = completionTokensPerSecond; // Main metric for generation speed
        
        // Total processing time from the model
        const totalProcessingTime = (data.timings.prompt_ms || 0) + (data.timings.predicted_ms || 0);
        if (totalProcessingTime > 0) {
          actualResponseTime = totalProcessingTime;
        }
      } else if (data.usage && data.usage.completion_tokens) {
        // Fallback to basic calculation
        const responseTimeSeconds = responseTime / 1000;
        tokensPerSecond = data.usage.completion_tokens / responseTimeSeconds;
      }

      setTestResults(prev => ({
        ...prev,
        [modelName]: {
          success: true,
          tokensPerSecond: tokensPerSecond > 0 ? Math.round(tokensPerSecond * 100) / 100 : undefined,
          responseTime: Math.round(actualResponseTime),
          promptTokensPerSecond: promptTokensPerSecond > 0 ? Math.round(promptTokensPerSecond * 100) / 100 : undefined,
          completionTokensPerSecond: completionTokensPerSecond > 0 ? Math.round(completionTokensPerSecond * 100) / 100 : undefined,
          timestamp: Date.now()
        }
      }));

    } catch (error) {
      console.error('Model test error:', error);
      setTestResults(prev => ({
        ...prev,
        [modelName]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: Date.now()
        }
      }));
    } finally {
      setTestingModel(null);
    }
  };

  // Test all models sequentially
  const testAllModels = async () => {
    if (!configInfo?.serviceStatus?.isRunning || modelConfigs.length === 0) {
      return;
    }

    for (const model of modelConfigs) {
      if (testingModel) break; // Stop if another test is already running
      
      await testModel(model.name);
      
      // Small delay between tests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Clear all test results
  const clearTestResults = () => {
    setTestResults({});
  };

  // Import configuration
  const importConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        JSON.parse(content); // Validate JSON
        setJsonConfig(content);
        setJsonError(null);
      } catch (error) {
        setJsonError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle model selection for detailed configuration
  const handleModelSelection = (modelName: string) => {
    setSelectedModelForConfig(modelName);
  };

  // Handle model configuration changes and sync with JSON
  const updateModelConfig = (modelName: string, field: keyof ParsedModelConfig, value: any) => {
    // Update the parsed model configs
    setModelConfigs(prev => prev.map(model => 
      model.name === modelName 
        ? { ...model, [field]: value }
        : model
    ));
    
    // Also update the JSON configuration immediately
    try {
      const currentConfig = JSON.parse(jsonConfig);
      if (currentConfig.models && currentConfig.models[modelName]) {
        // Update the command line with the new value and clean it up
        const updatedCmd = updateCommandLineParameter(currentConfig.models[modelName].cmd, field, value);
        const cleanedCmd = cleanCommandLine(updatedCmd);
        currentConfig.models[modelName].cmd = cleanedCmd;
        
        // Update the JSON config state
        const updatedJsonConfig = JSON.stringify(currentConfig, null, 2);
        setJsonConfig(updatedJsonConfig);
      }
    } catch (error) {
      console.error('Error updating JSON config:', error);
    }
    
    setHasUnsavedChanges(true);
  };

  // Clean up configuration formatting
  const cleanConfiguration = () => {
    try {
      const currentConfig = JSON.parse(jsonConfig);
      if (currentConfig.models) {
        for (const [, modelData] of Object.entries(currentConfig.models)) {
          const data = modelData as any;
          if (data.cmd) {
            data.cmd = cleanCommandLine(data.cmd);
          }
        }
      }
      
      const cleanedJsonConfig = JSON.stringify(currentConfig, null, 2);
      setJsonConfig(cleanedJsonConfig);
      
      // Re-parse the models with cleaned config
      const parsedModels = parseJsonConfiguration(currentConfig);
      setModelConfigs(parsedModels);
      
      setHasUnsavedChanges(true);
      setOperationStatus({ 
        type: 'success', 
        message: '✅ Configuration formatting cleaned up!' 
      });
      
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 2000);
    } catch (error) {
      setOperationStatus({ 
        type: 'error', 
        message: 'Failed to clean configuration - invalid JSON' 
      });
      setTimeout(() => {
        setOperationStatus({ type: 'idle', message: '' });
      }, 3000);
    }
  };

  // Get backend icon
  const getBackendIcon = (backend: Backend) => {
    switch (backend.gpuType) {
      case 'nvidia':
        return <Zap className="w-5 h-5 text-green-500" />;
      case 'amd':
        return <BarChart3 className="w-5 h-5 text-red-500" />;
      case 'apple':
        return <Monitor className="w-5 h-5 text-blue-500" />;
      case 'any':
        return <Gauge className="w-5 h-5 text-purple-500" />;
      case 'none':
        return <Cpu className="w-5 h-5 text-gray-500" />;
      default:
        return <Settings className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get status color and icon
  const getStatusDisplay = () => {
    switch (operationStatus.type) {
      case 'saving':
      case 'reconfiguring':
      case 'restarting':
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          icon: <RefreshCw className="w-4 h-4 animate-spin" />
        };
      case 'success':
        return {
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          icon: <CheckCircle className="w-4 h-4" />
        };
      case 'error':
        return {
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          icon: <AlertTriangle className="w-4 h-4" />
        };
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="glassmorphic rounded-xl p-6 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Loading Configuration</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fetching backend and configuration data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glassmorphic rounded-xl p-6 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Configuration Error</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{error}</p>
            <button
              onClick={loadConfigurationInfo}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glassmorphic rounded-xl bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Backend Configuration Studio
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Advanced backend selection and configuration management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              configInfo?.serviceStatus.isRunning
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {configInfo?.serviceStatus.isRunning ? 'Running' : 'Stopped'}
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      {operationStatus.type !== 'idle' && (
        <div className="px-6 py-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg ${getStatusDisplay()?.bgColor}`}>
            {getStatusDisplay()?.icon}
            <span className={`text-sm font-medium ${getStatusDisplay()?.color}`}>
              {operationStatus.message}
            </span>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Backend Selection Section */}
        <div className="space-y-4">
          <button
            onClick={() => toggleSection('backends')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Backend Selection</h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({configInfo?.availableBackends.filter(b => b.isAvailable).length} available)
              </span>
            </div>
            {expandedSections.backends ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </button>

          {expandedSections.backends && (
            <div className="space-y-4">
              {/* Current Selection Display */}
              <div className="glassmorphic rounded-lg p-4 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Backend:</span>
                  <div className="flex items-center gap-2">
                    {selectedBackend === 'auto' ? (
                      <Settings className="w-4 h-4 text-blue-500" />
                    ) : (
                      getBackendIcon(configInfo?.availableBackends.find(b => b.id === selectedBackend) || {} as Backend)
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedBackend === 'auto' 
                        ? (actualBackend ? `Auto-detect (${actualBackend})` : 'Auto-detect')
                        : configInfo?.availableBackends.find(b => b.id === selectedBackend)?.name || selectedBackend}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Platform: {configInfo?.platform} ({configInfo?.architecture})
                </p>
              </div>

              {/* Backend Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Auto-detect Option */}
                <button
                  onClick={() => handleBackendChange('auto')}
                  disabled={isOperationInProgress}
                  className={`p-4 glassmorphic rounded-lg text-left transition-all backdrop-blur-sm ${
                    selectedBackend === 'auto'
                      ? 'bg-blue-100/60 dark:bg-blue-900/40 ring-2 ring-blue-400'
                      : 'bg-white/30 dark:bg-gray-800/20 hover:bg-white/50 dark:hover:bg-gray-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Settings className="w-5 h-5 text-blue-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">Auto-detect</span>
                    {selectedBackend === 'auto' && <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically detect and use the best available backend
                  </p>
                </button>

                {/* Available Backends */}
                {configInfo?.availableBackends
                  .filter(backend => backend.isAvailable && backend.id !== 'auto') // Exclude 'auto' from backend list
                  .map((backend) => (
                    <button
                      key={backend.id}
                      onClick={() => handleBackendChange(backend.id)}
                      disabled={isOperationInProgress}
                      className={`p-4 glassmorphic rounded-lg text-left transition-all backdrop-blur-sm ${
                        selectedBackend === backend.id
                          ? 'bg-blue-100/60 dark:bg-blue-900/40 ring-2 ring-blue-400'
                          : 'bg-white/30 dark:bg-gray-800/20 hover:bg-white/50 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        {getBackendIcon(backend)}
                        <span className="font-semibold text-gray-900 dark:text-white">{backend.name}</span>
                        {selectedBackend === backend.id && <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {backend.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded ${
                          backend.requiresGPU 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {backend.requiresGPU ? 'GPU Accelerated' : 'CPU Only'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-500">•</span>
                        <span className="text-gray-500 dark:text-gray-500">{backend.folder}</span>
                      </div>
                    </button>
                  ))}
              </div>

              {/* Unavailable Backends */}
              {configInfo?.availableBackends.some(b => !b.isAvailable && b.id !== 'auto') && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Unavailable Backends:</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {configInfo.availableBackends
                      .filter(backend => !backend.isAvailable && backend.id !== 'auto') // Exclude 'auto' from unavailable list too
                      .map((backend) => (
                        <div
                          key={backend.id}
                          className="p-3 glassmorphic rounded-lg bg-white/20 dark:bg-gray-800/10 backdrop-blur-sm opacity-50"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {getBackendIcon(backend)}
                            <span className="font-medium text-gray-700 dark:text-gray-300">{backend.name}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-500">Binaries not found</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ClaraCore Optimizer Section */}
        <div className="space-y-4">
          <button
            onClick={() => toggleSection('optimizer')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Configuration Optimization</h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                (Auto-optimize based on hardware)
              </span>
            </div>
            {expandedSections.optimizer ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </button>

          {expandedSections.optimizer && (
            <div className="glassmorphic rounded-lg p-6 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
              <LLaMAOptimizerPanel
                configPath={configInfo?.configPath || ''}
                isServiceRunning={configInfo?.serviceStatus?.isRunning || false}
                onOptimizationStart={() => {
                  setOperationStatus({ type: 'saving', message: 'Starting optimization...' });
                }}
                onOptimizationComplete={(success, message) => {
                  if (success) {
                    setOperationStatus({ type: 'success', message });
                    // Reload configuration after successful optimization with longer delay
                    setTimeout(async () => {
                      setOperationStatus({ type: 'saving', message: 'Refreshing configuration data...' });
                      try {
                        // Give the optimizer more time to finish writing the config file
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await loadConfigurationInfo(); // This will refresh both configInfo and jsonConfig
                        setOperationStatus({ type: 'success', message: 'Configuration refreshed successfully!' });
                        setTimeout(() => {
                          setOperationStatus({ type: 'idle', message: '' });
                        }, 2000);
                      } catch (error) {
                        console.error('Failed to refresh configuration after optimization:', error);
                        setOperationStatus({ type: 'error', message: 'Failed to refresh configuration. Please refresh manually.' });
                        setTimeout(() => {
                          setOperationStatus({ type: 'idle', message: '' });
                        }, 5000);
                      }
                    }, 1500);
                  } else {
                    setOperationStatus({ type: 'error', message });
                    setTimeout(() => {
                      setOperationStatus({ type: 'idle', message: '' });
                    }, 5000);
                  }
                }}
                disabled={isOperationInProgress}
              />
            </div>
          )}
        </div>

        {/* Model Configuration Section */}
        <div className="space-y-4">
          <button
            onClick={() => toggleSection('models')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Model Configuration</h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({modelConfigs.length} models)
              </span>
            </div>
            {expandedSections.models ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </button>

          {expandedSections.models && (
            <div className="space-y-6">
              {/* Info Section about the new workflow */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Model Configuration Studio</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Select a model from the sidebar to configure its settings. 
                      Changes are automatically synced with the JSON configuration.
                    </p>
                    <div className="bg-blue-100 dark:bg-blue-800/30 p-3 rounded-lg mb-3">
                      <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">💾 Configuration Persistence</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        When you click "Save & Complete Server Restart", your configuration is permanently saved and the entire LlamaSwap server is 
                        unloaded and restarted. Your saved configuration will be used every time the app starts until you change it again.
                      </p>
                    </div>
                    {selectedModelForConfig && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-blue-700 dark:text-blue-300">Currently configuring:</span>
                        <span className="font-semibold text-blue-900 dark:text-blue-100 bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded">
                          {selectedModelForConfig}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {modelConfigs.length === 0 ? (
                <div className="text-center py-8 glassmorphic rounded-lg bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                  <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">No Models Found</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    No models are currently configured. Try regenerating the configuration.
                  </p>
                  <button
                    onClick={handleReconfigure}
                    disabled={isOperationInProgress}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Scan for Models
                  </button>
                </div>
              ) : (
                <>
                  {/* Sidebar Layout */}
                  <div className="flex gap-6 min-h-[600px]">
                    {/* Models Sidebar */}
                    <div className="w-80 flex-shrink-0">
                      <div className="glassmorphic rounded-xl p-4 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg h-full">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                          <Database className="w-5 h-5 text-blue-500" />
                          Available Models ({modelConfigs.length})
                        </h4>
                        
                        {/* Scrollable Model List */}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                          {modelConfigs.map((model) => (
                            <div
                              key={model.name}
                              className={`p-4 rounded-lg cursor-pointer transition-all duration-200 border-2 ${
                                selectedModelForConfig === model.name
                                  ? 'bg-blue-50/80 dark:bg-blue-900/50 border-blue-400 shadow-md'
                                  : 'bg-white/40 dark:bg-gray-800/30 border-transparent hover:bg-white/60 dark:hover:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                              onClick={() => handleModelSelection(model.name)}
                            >
                              {/* Model Card Header */}
                              <div className="flex items-start gap-3 mb-3">
                                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                                  selectedModelForConfig === model.name 
                                    ? 'bg-blue-500 ring-2 ring-blue-300' 
                                    : 'bg-green-400'
                                }`} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                                      {model.name}
                                    </h5>
                                    {selectedModelForConfig === model.name && (
                                      <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs font-medium rounded">
                                        ACTIVE
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Model Info */}
                                  <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                    <div className="flex items-center justify-between">
                                      <span>Port:</span>
                                      <span className="font-medium">{model.port}</span>
                                    </div>
                                    {model.modelSizeGB && (
                                      <div className="flex items-center justify-between">
                                        {/* <span>Size:</span>
                                        <span className="font-medium">{model.modelSizeGB.toFixed(1)}GB</span> */}
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <span>Context:</span>
                                      <span className="font-medium">{((model.contextSize || 8192) / 1000).toFixed(0)}K</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Model Status Badges */}
                              <div className="flex flex-wrap gap-2">
                                {model.isEmbedding && (
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                    Embedding
                                  </span>
                                )}
                                {!model.isEmbedding && (
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    (model.gpuLayers || 0) === 0 
                                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                      : (model.gpuLayers || 0) >= (model.estimatedTotalLayers || 1)
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  }`}>
                                    {(model.gpuLayers || 0) === 0 
                                      ? 'CPU' 
                                      : (model.gpuLayers || 0) >= (model.estimatedTotalLayers || 1)
                                      ? 'Full GPU'
                                      : `${Math.min(100, Math.round(((model.gpuLayers || 0) / Math.max(1, model.estimatedTotalLayers || 1)) * 100))}% GPU`
                                    }
                                  </span>
                                )}
                                
                                {/* Advanced Feature Indicators */}
                                {model.flashAttention && (
                                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs font-medium flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    Flash
                                  </span>
                                )}
                                {model.continuousBatching && (
                                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                                    Batch
                                  </span>
                                )}
                                {(model.cacheTypeK && model.cacheTypeK !== 'f16') || (model.cacheTypeV && model.cacheTypeV !== 'f16') && (
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                    Q-Cache
                                  </span>
                                )}
                              </div>
                              
                              {/* Test Button */}
                              <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-600/50">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent model selection when clicking test
                                    testModel(model.name);
                                  }}
                                  disabled={testingModel === model.name || !configInfo?.serviceStatus?.isRunning}
                                  className={`w-full px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium ${
                                    testResults[model.name]?.success
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700/50'
                                      : testResults[model.name]?.error
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/50'
                                      : !configInfo?.serviceStatus?.isRunning
                                      ? 'bg-gray-100 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600/50 cursor-not-allowed'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700/50'
                                  } disabled:opacity-50`}
                                >
                                  {testingModel === model.name ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      Testing...
                                    </>
                                  ) : testResults[model.name]?.success ? (
                                    <>
                                      <CheckCircle className="w-4 h-4" />
                                      {testResults[model.name].tokensPerSecond 
                                        ? `${testResults[model.name].tokensPerSecond} t/s` 
                                        : `${testResults[model.name].responseTime}ms`}
                                    </>
                                  ) : testResults[model.name]?.error ? (
                                    <>
                                      <AlertTriangle className="w-4 h-4" />
                                      Error
                                    </>
                                  ) : !configInfo?.serviceStatus?.isRunning ? (
                                    <>
                                      <Play className="w-4 h-4" />
                                      Service Not Running
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4" />
                                      Test Model
                                    </>
                                  )}
                                </button>
                                
                                {/* Test Result Details */}
                                {testResults[model.name] && (
                                  <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50 text-xs">
                                    {testResults[model.name].success ? (
                                      <div className="text-green-700 dark:text-green-300">
                                        <div className="flex justify-between items-center">
                                          <span>✅ Test successful</span>
                                          <span className="text-gray-500">
                                            {new Date(testResults[model.name].timestamp).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        {testResults[model.name].tokensPerSecond && (
                                          <div className="mt-1">
                                            Generation: {testResults[model.name].tokensPerSecond} tokens/second
                                          </div>
                                        )}
                                        {testResults[model.name].promptTokensPerSecond && (
                                          <div>
                                            Prompt processing: {testResults[model.name].promptTokensPerSecond} tokens/second
                                          </div>
                                        )}
                                        <div>Response time: {testResults[model.name].responseTime}ms</div>
                                      </div>
                                    ) : (
                                      <div className="text-red-700 dark:text-red-300">
                                        <div className="flex justify-between items-center">
                                          <span>❌ Test failed</span>
                                          <span className="text-gray-500">
                                            {new Date(testResults[model.name].timestamp).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        <div className="mt-1 break-words">
                                          Error: {testResults[model.name].error}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Main Configuration Area */}
                    <div className="flex-1">
                      {selectedModelForConfig ? (
                        (() => {
                          const selectedModel = modelConfigs.find(m => m.name === selectedModelForConfig);
                          if (!selectedModel) return null;
                          
                          return (
                            <div className="glassmorphic rounded-xl p-6 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg h-full">
                              {/* Configuration Header */}
                              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {selectedModel.name}
                                  </h3>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Configure model parameters and performance settings
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  {selectedModel.isEmbedding && (
                                    <span className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium">
                                      Embedding Model
                                    </span>
                                  )}
                                  <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                                    (selectedModel.gpuLayers || 0) === 0 
                                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                      : (selectedModel.gpuLayers || 0) >= (selectedModel.estimatedTotalLayers || 1)
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  }`}>
                                    {(selectedModel.gpuLayers || 0) === 0 
                                      ? 'CPU Only' 
                                      : (selectedModel.gpuLayers || 0) >= (selectedModel.estimatedTotalLayers || 1)
                                      ? 'Full GPU'
                                      : `${Math.min(100, Math.round(((selectedModel.gpuLayers || 0) / Math.max(1, selectedModel.estimatedTotalLayers || 1)) * 100))}% GPU`
                                    }
                                  </span>
                                </div>
                              </div>

                              {/* Model-Specific Recommendations */}
                              {(() => {
                                const modelName = selectedModel.name.toLowerCase();
                                const isMoE = modelName.includes('mixtral') || modelName.includes('moe') || modelName.includes('mixture');
                                const isLongContext = modelName.includes('32k') || modelName.includes('128k') || modelName.includes('200k');
                                const isLargeModel = (selectedModel.modelSizeGB || 0) > 30;
                                
                                if (isMoE || isLongContext || isLargeModel) {
                                  return (
                                    <div className="mb-6 p-4 glassmorphic rounded-lg bg-yellow-50/50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
                                      <div className="flex items-start gap-3">
                                        <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                          <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                                            🎯 Model-Specific Recommendations
                                          </h4>
                                          <div className="space-y-2">
                                            {isMoE && (
                                              <div className="bg-yellow-100 dark:bg-yellow-800/30 p-2 rounded text-sm text-yellow-800 dark:text-yellow-200">
                                                <strong>Mixture of Experts detected:</strong> Flash Attention and Continuous Batching are critical for optimal performance.
                                              </div>
                                            )}
                                            {isLongContext && (
                                              <div className="bg-blue-100 dark:bg-blue-800/30 p-2 rounded text-sm text-blue-800 dark:text-blue-200">
                                                <strong>Long context model:</strong> Consider KV cache quantization (q8_0) to manage memory usage efficiently.
                                              </div>
                                            )}
                                            {isLargeModel && (
                                              <div className="bg-orange-100 dark:bg-orange-800/30 p-2 rounded text-sm text-orange-800 dark:text-orange-200">
                                                <strong>Large model ({selectedModel.modelSizeGB?.toFixed(1)}GB):</strong> KV cache quantization (q4_0 or q8_0) recommended to reduce VRAM usage.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}

                              {/* Scrollable Configuration Content */}
                              <div className="space-y-6 max-h-[480px] overflow-y-auto pr-2">
                                {/* Context Size Section */}
                                <div className="glassmorphic rounded-lg p-5 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                                  <div className="flex items-center justify-between mb-4">
                                    <div>
                                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Context Window Size</h4>
                                      <p className="text-sm text-gray-600 dark:text-gray-400">How much conversation history the model can remember</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                        {((selectedModel.contextSize || 8192) / 1000).toFixed(0)}K tokens
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Context Size Slider */}
                                  <div className="space-y-4">
                                    <input
                                      type="range"
                                      min="1024"
                                      max={(() => {
                                        const modelMax = getModelMaxContextSize(selectedModel.name, modelMetadata[selectedModel.name]?.nativeContextSize);
                                        return modelMax;
                                      })()}
                                      step="1024"
                                      value={selectedModel.contextSize || 8192}
                                      onChange={(e) => updateModelConfig(selectedModel.name, 'contextSize', parseInt(e.target.value))}
                                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                      disabled={selectedModel.isEmbedding}
                                    />
                                  </div>
                                </div>

                                {/* GPU Acceleration Section always keep the max 999 */}
                                {!selectedModel.isEmbedding && (
                                  <div className="glassmorphic rounded-lg p-5 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                                    <div className="flex items-center justify-between mb-4">
                                      <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">GPU Acceleration</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">How many model layers to run on your GPU</p>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                          {selectedModel.gpuLayers || 0} / {999} layers
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* GPU Layers Slider */}
                                    <div className="space-y-4">
                                      <input
                                        type="range"
                                        min="0"
                                        max={999}
                                        step="1"
                                        value={selectedModel.gpuLayers || 0}
                                        onChange={(e) => updateModelConfig(selectedModel.name, 'gpuLayers', parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Performance Settings Section */}
                                <div className="glassmorphic rounded-lg p-5 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Performance Settings</h4>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Threads */}
                                    <div className="space-y-3">
                                      <label className="block">
                                        <span className="font-medium text-gray-700 dark:text-gray-300 mb-2 block">CPU Threads</span>
                                        <div className="flex items-center gap-3">
                                          <input
                                            type="number"
                                            min="1"
                                            max="32"
                                            value={selectedModel.threads || 4}
                                            onChange={(e) => updateModelConfig(selectedModel.name, 'threads', parseInt(e.target.value))}
                                            className="w-20 px-3 py-2 glassmorphic rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                          />
                                          <input
                                            type="range"
                                            min="1"
                                            max="16"
                                            step="1"
                                            value={selectedModel.threads || 4}
                                            onChange={(e) => updateModelConfig(selectedModel.name, 'threads', parseInt(e.target.value))}
                                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                          />
                                        </div>
                                      </label>
                                    </div>

                                    {/* Batch Size */}
                                    <div className="space-y-3">
                                      <label className="block">
                                        <span className="font-medium text-gray-700 dark:text-gray-300 mb-2 block">Batch Size</span>
                                        <div className="flex items-center gap-3">
                                          <input
                                            type="number"
                                            min="1"
                                            max="2048"
                                            step="32"
                                            value={selectedModel.batchSize || 256}
                                            onChange={(e) => updateModelConfig(selectedModel.name, 'batchSize', parseInt(e.target.value))}
                                            className="w-24 px-3 py-2 glassmorphic rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                          />
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                </div>

                                {/* Advanced Performance Section - Phase 1 Critical Features */}
                                <div className="glassmorphic rounded-lg p-5 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-yellow-500" />
                                    Advanced Performance
                                  </h4>
                                  
                                  {/* Flash Attention */}
                                  <div className="mb-6 p-4 glassmorphic rounded-lg bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <h5 className="font-medium text-green-900 dark:text-green-100 mb-1">Flash Attention</h5>
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                          Significant performance boost for supported models (highly recommended)
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={selectedModel.flashAttention ?? true}
                                          onChange={(e) => updateModelConfig(selectedModel.name, 'flashAttention', e.target.checked)}
                                          className="w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                                        />
                                        <span className="text-sm font-medium text-green-900 dark:text-green-100">
                                          {selectedModel.flashAttention ?? true ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Continuous Batching */}
                                  <div className="mb-6 p-4 glassmorphic rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Continuous Batching</h5>
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                          Process multiple requests in parallel (essential for server workloads)
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={selectedModel.continuousBatching ?? false}
                                          onChange={(e) => updateModelConfig(selectedModel.name, 'continuousBatching', e.target.checked)}
                                          className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                        />
                                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                          {selectedModel.continuousBatching ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* KV Cache Quantization */}
                                  <div className="mb-6 p-4 glassmorphic rounded-lg bg-purple-50/50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700">
                                    <h5 className="font-medium text-purple-900 dark:text-purple-100 mb-3">KV Cache Quantization</h5>
                                    <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                                      Reduce memory usage by quantizing key-value cache (can save 50-75% memory)
                                    </p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">
                                          K Cache Type
                                        </label>
                                        <select
                                          value={selectedModel.cacheTypeK ?? 'f16'}
                                          onChange={(e) => {
                                            updateModelConfig(selectedModel.name, 'cacheTypeK', e.target.value);
                                            // Automatically enable flash attention for quantized cache
                                            if (e.target.value !== 'f16' && e.target.value !== 'f32') {
                                              updateModelConfig(selectedModel.name, 'flashAttention', true);
                                            }
                                          }}
                                          className="w-full px-3 py-2 glassmorphic rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                        >
                                          <option value="f16">f16 (Default - High Quality)</option>
                                          <option value="f32">f32 (Highest Quality)</option>
                                          <option value="q8_0">q8_0 (Good Quality, 50% Memory)</option>
                                          <option value="q4_0">q4_0 (Lower Quality, 75% Memory Savings)</option>
                                        </select>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">
                                          V Cache Type
                                        </label>
                                        <select
                                          value={selectedModel.cacheTypeV ?? 'f16'}
                                          onChange={(e) => {
                                            updateModelConfig(selectedModel.name, 'cacheTypeV', e.target.value);
                                            // Automatically enable flash attention for quantized cache
                                            if (e.target.value !== 'f16' && e.target.value !== 'f32') {
                                              updateModelConfig(selectedModel.name, 'flashAttention', true);
                                            }
                                          }}
                                          className="w-full px-3 py-2 glassmorphic rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                        >
                                          <option value="f16">f16 (Default)</option>
                                          <option value="f32">f32 (Highest Quality)</option>
                                          <option value="q8_0">q8_0 (50% Memory)</option>
                                          <option value="q4_0">q4_0 (75% Memory Savings)</option>
                                        </select>
                                      </div>
                                    </div>
                                    
                                    {/* Warning about flash attention requirement */}
                                    {((selectedModel.cacheTypeK && selectedModel.cacheTypeK !== 'f16' && selectedModel.cacheTypeK !== 'f32') || 
                                      (selectedModel.cacheTypeV && selectedModel.cacheTypeV !== 'f16' && selectedModel.cacheTypeV !== 'f32')) && (
                                      <div className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-800/30 rounded border border-yellow-300 dark:border-yellow-700 text-sm text-yellow-800 dark:text-yellow-200">
                                        <div className="flex items-center gap-2 mb-1">
                                          <AlertTriangle className="w-4 h-4" />
                                          <strong>Flash Attention Required</strong>
                                        </div>
                                        <p className="text-xs">
                                          KV cache quantization requires Flash Attention to be enabled. It has been automatically enabled above.
                                        </p>
                                      </div>
                                    )}
                                    
                                    <div className="mt-3 p-2 bg-purple-100 dark:bg-purple-800/30 rounded text-xs text-purple-700 dark:text-purple-300">
                                      <strong>Memory Impact:</strong> q4_0 can reduce VRAM usage by ~75%, q8_0 by ~50% with minimal quality loss
                                    </div>
                                  </div>

                                  {/* Memory Management */}
                                  <div className="mb-4 p-4 glassmorphic rounded-lg bg-orange-50/50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700">
                                    <h5 className="font-medium text-orange-900 dark:text-orange-100 mb-3">Memory Management</h5>
                                    
                                    <div className="space-y-3">
                                      {/* Memory Lock */}
                                      <div className="flex items-center justify-between p-3 glassmorphic rounded-lg bg-white/30 dark:bg-gray-800/30">
                                        <div>
                                          <h6 className="font-medium text-orange-900 dark:text-orange-100">Memory Lock (mlock)</h6>
                                          <p className="text-sm text-orange-700 dark:text-orange-300">
                                            Prevent model from being swapped to disk (requires sufficient RAM)
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedModel.memoryLock ?? false}
                                            onChange={(e) => updateModelConfig(selectedModel.name, 'memoryLock', e.target.checked)}
                                            className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
                                          />
                                          <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                                            {selectedModel.memoryLock ? 'Enabled' : 'Disabled'}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Disable Memory Mapping */}
                                      <div className="flex items-center justify-between p-3 glassmorphic rounded-lg bg-white/30 dark:bg-gray-800/30">
                                        <div>
                                          <h6 className="font-medium text-orange-900 dark:text-orange-100">Disable Memory Mapping</h6>
                                          <p className="text-sm text-orange-700 dark:text-orange-300">
                                            Use when file system doesn't support mmap well (slower loading)
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedModel.noMmap ?? false}
                                            onChange={(e) => updateModelConfig(selectedModel.name, 'noMmap', e.target.checked)}
                                            className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
                                          />
                                          <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                                            {selectedModel.noMmap ? 'Disabled' : 'Enabled'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Performance Presets */}
                                  <div className="mt-6 p-4 glassmorphic rounded-lg bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700">
                                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Presets</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <button
                                        onClick={() => {
                                          updateModelConfig(selectedModel.name, 'flashAttention', true);
                                          updateModelConfig(selectedModel.name, 'continuousBatching', true);
                                          updateModelConfig(selectedModel.name, 'cacheTypeK', 'f16');
                                          updateModelConfig(selectedModel.name, 'cacheTypeV', 'f16');
                                        }}
                                        className="p-3 text-left glassmorphic rounded-lg bg-green-100/50 dark:bg-green-900/30 hover:bg-green-200/50 dark:hover:bg-green-900/50 transition-colors"
                                      >
                                        <h6 className="font-medium text-green-900 dark:text-green-100">Maximum Performance</h6>
                                        <p className="text-xs text-green-700 dark:text-green-300">Best performance, high memory usage</p>
                                      </button>
                                      
                                      <button
                                        onClick={() => {
                                          updateModelConfig(selectedModel.name, 'flashAttention', true);
                                          updateModelConfig(selectedModel.name, 'continuousBatching', true);
                                          updateModelConfig(selectedModel.name, 'cacheTypeK', 'q8_0');
                                          updateModelConfig(selectedModel.name, 'cacheTypeV', 'q8_0');
                                        }}
                                        className="p-3 text-left glassmorphic rounded-lg bg-blue-100/50 dark:bg-blue-900/30 hover:bg-blue-200/50 dark:hover:bg-blue-900/50 transition-colors"
                                      >
                                        <h6 className="font-medium text-blue-900 dark:text-blue-100">Balanced</h6>
                                        <p className="text-xs text-blue-700 dark:text-blue-300">Good performance with reasonable memory</p>
                                      </button>
                                      
                                      <button
                                        onClick={() => {
                                          updateModelConfig(selectedModel.name, 'flashAttention', true);
                                          updateModelConfig(selectedModel.name, 'continuousBatching', false);
                                          updateModelConfig(selectedModel.name, 'cacheTypeK', 'q4_0');
                                          updateModelConfig(selectedModel.name, 'cacheTypeV', 'q4_0');
                                        }}
                                        className="p-3 text-left glassmorphic rounded-lg bg-orange-100/50 dark:bg-orange-900/30 hover:bg-orange-200/50 dark:hover:bg-orange-900/50 transition-colors"
                                      >
                                        <h6 className="font-medium text-orange-900 dark:text-orange-100">Memory Efficient</h6>
                                        <p className="text-xs text-orange-700 dark:text-orange-300">Minimize memory, slower performance</p>
                                      </button>
                                      
                                      <button
                                        onClick={() => {
                                          updateModelConfig(selectedModel.name, 'flashAttention', false);
                                          updateModelConfig(selectedModel.name, 'continuousBatching', false);
                                          updateModelConfig(selectedModel.name, 'cacheTypeK', 'f16');
                                          updateModelConfig(selectedModel.name, 'cacheTypeV', 'f16');
                                        }}
                                        className="p-3 text-left glassmorphic rounded-lg bg-gray-100/50 dark:bg-gray-700/30 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                      >
                                        <h6 className="font-medium text-gray-900 dark:text-gray-100">Conservative</h6>
                                        <p className="text-xs text-gray-700 dark:text-gray-300">Default settings, maximum compatibility</p>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="glassmorphic rounded-xl p-8 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg h-full flex items-center justify-center">
                          <div className="text-center">
                            <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Select a Model</h3>
                            <p className="text-gray-600 dark:text-gray-400">
                              Choose a model from the sidebar to configure its settings
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Global Actions */}
                  <div className="flex justify-between items-center pt-6 mt-8">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {hasUnsavedChanges && (
                        <span className="text-orange-600 dark:text-orange-400 font-medium flex items-center gap-2">
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          You have unsaved changes
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleReconfigure}
                        disabled={isOperationInProgress}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Rescan Models
                      </button>
                      <button
                        onClick={testAllModels}
                        disabled={!!testingModel || !configInfo?.serviceStatus?.isRunning || modelConfigs.length === 0}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        Test All Models
                      </button>
                      {Object.keys(testResults).length > 0 && (
                        <button
                          onClick={clearTestResults}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition-colors flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Clear Test Results
                        </button>
                      )}
                      <button
                        onClick={saveConfigurationAndRestart}
                        disabled={isOperationInProgress || !hasUnsavedChanges}
                        className="px-6 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Save & Complete Server Restart
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Configuration Section */}
        <div className="space-y-4">
          <button
            onClick={() => toggleSection('configuration')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Configuration Management</h4>
            </div>
            {expandedSections.configuration ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </button>

          {expandedSections.configuration && (
            <div className="space-y-4">
              {/* Configuration Info */}
              <div className="glassmorphic rounded-lg p-4 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Config Path:</span>
                    <p className="text-gray-600 dark:text-gray-400 font-mono text-xs mt-1 break-all">
                      {configInfo?.configPath}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Models Found:</span>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {configInfo?.configuration?.models ? Object.keys(configInfo.configuration.models).length : 0} models
                    </p>
                  </div>
                </div>
              </div>

              {/* JSON Editor Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-gray-500" />
                  <span className="font-medium text-gray-900 dark:text-white">JSON Configuration Editor</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportConfiguration}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                  <label className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      onChange={importConfiguration}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => setShowJsonEditor(!showJsonEditor)}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                  >
                    {showJsonEditor ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showJsonEditor ? 'Hide' : 'Show'} Editor
                  </button>
                </div>
              </div>

              {/* JSON Editor */}
              {showJsonEditor && (
                <div className="space-y-4">
                  {jsonError && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
                      JSON Error: {jsonError}
                    </div>
                  )}
                  <textarea
                    value={jsonConfig}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className="w-full h-64 p-3 glassmorphic rounded-lg bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm text-gray-900 dark:text-white font-mono text-sm resize-vertical focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Configuration JSON will appear here..."
                  />
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span>Lines: {jsonConfig.split('\n').length}</span>
                      <span className="mx-2">•</span>
                      <span>Characters: {jsonConfig.length}</span>
                      {hasUnsavedChanges && (
                        <>
                          <span className="mx-2">•</span>
                          <span className="text-orange-600 dark:text-orange-400 font-medium">Unsaved changes</span>
                        </>
                      )}
                    </div>
                    
                    {/* Save Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={cleanConfiguration}
                        disabled={isOperationInProgress || !!jsonError}
                        className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Clean up command line formatting"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Clean Format
                      </button>
                      <button
                        onClick={saveConfiguration}
                        disabled={isOperationInProgress || !!jsonError || !hasUnsavedChanges}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-3 h-3" />
                        Save YAML
                      </button>
                      <button
                        onClick={saveConfigurationAndRestart}
                        disabled={isOperationInProgress || !!jsonError || !hasUnsavedChanges}
                        className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-sm hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-3 h-3" />
                        Save & Complete Server Restart
                      </button>
                    </div>
                  </div>
                  
                  {/* Configuration Help */}
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Configuration Editing</p>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                          <li>• <strong>Clean Format:</strong> Fixes messy command line formatting in YAML (single-line commands)</li>
                          <li>• <strong>Save YAML:</strong> Saves changes to the configuration file. Manual edits are preserved!</li>
                          <li>• <strong>Save & Complete Server Restart:</strong> Saves changes, unloads models, and completely restarts LlamaSwap to apply configuration</li>
                          <li>• Configuration is automatically backed up before saving</li>
                          <li>• JSON must be valid before saving is allowed</li>
                          <li>• <strong>Important:</strong> Manual edits won't be overwritten by performance settings</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Advanced Operations */}
        <div className="space-y-4">
          <button
            onClick={() => toggleSection('advanced')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Operations</h4>
            </div>
            {expandedSections.advanced ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </button>

          {expandedSections.advanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Force Reconfigure */}
              <button
                onClick={handleReconfigure}
                disabled={isOperationInProgress}
                className="p-4 glassmorphic rounded-lg bg-white/30 dark:bg-gray-800/20 backdrop-blur-sm hover:bg-white/50 dark:hover:bg-gray-800/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Force Reconfigure</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Regenerate configuration with current settings and backend overrides
                </p>
              </button>

              {/* Restart with Overrides */}
              <button
                onClick={handleRestartWithOverrides}
                disabled={isOperationInProgress}
                className="p-4 glassmorphic rounded-lg bg-orange-100/30 dark:bg-orange-900/20 backdrop-blur-sm hover:bg-orange-100/50 dark:hover:bg-orange-900/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Play className="w-5 h-5 text-orange-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Restart Service</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Stop, reconfigure, and restart the service with all current settings
                </p>
              </button>
            </div>
          )}
        </div>

        {/* System Information */}
        <div className="glassmorphic rounded-lg p-4 bg-white/40 dark:bg-gray-800/30 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Configuration Studio Features</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">🎯 Backend Management:</p>
                  <p className="text-gray-600 dark:text-gray-400">Force specific GPU backends (CUDA, ROCm, Vulkan) or use intelligent auto-detection</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">⚡ Live Configuration:</p>
                  <p className="text-gray-600 dark:text-gray-400">Edit YAML configuration as JSON, export/import configs, and apply changes instantly</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">🔄 Smart Restart:</p>
                  <p className="text-gray-600 dark:text-gray-400">Intelligent service restart with configuration validation and rollback protection</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">🛠️ Advanced Control:</p>
                  <p className="text-gray-600 dark:text-gray-400">Professional-grade configuration management with real-time status monitoring</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackendConfigurationPanel; 