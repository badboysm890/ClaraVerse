import React, { useState, useEffect } from 'react';
import { Monitor, Cpu, Zap, AlertCircle, CheckCircle, RefreshCw, BarChart3, HardDrive, Info } from 'lucide-react';
import BackendConfigurationPanel from './BackendConfigurationPanel';
import { parseJsonConfiguration } from '../utils/commandLineParser';

interface GPUInfo {
  hasGPU: boolean;
  gpuMemoryMB: number;
  gpuMemoryGB: number;
  gpuType: string;
  systemMemoryGB: number;
  platform: string;
}

interface ModelGPUInfo {
  name: string;
  path: string;
  sizeGB: number;
  estimatedLayers: number;
  allocatedLayers: number;
  estimatedParams: string;
}

interface PerformanceSettings {
  flashAttention: boolean;
  autoOptimization: boolean;
  maxContextSize: number;
  aggressiveOptimization: boolean;
  prioritizeSpeed: boolean;
  optimizeFirstToken: boolean;
  threads: number;
  parallelSequences: number;
  optimizeConversations: boolean;
  keepTokens: number;
  defragThreshold: number;
  enableContinuousBatching: boolean;
  conversationMode: string;
  batchSize: number;
  ubatchSize: number;
  gpuLayers: number;
  memoryLock: boolean;
}

// System Diagnostics Tab Component
interface SystemDiagnosticsTabProps {
  gpuInfo: GPUInfo | null;
  modelGPUInfo: ModelGPUInfo[];
  cpuCores: number;
  performanceSettings: PerformanceSettings;
  onRefresh: () => void;
  getGPUTypeIcon: (gpuType: string) => JSX.Element;
  getGPUTypeName: (gpuType: string) => string;
  getPlatformName: (platform: string) => string;
}

const SystemDiagnosticsTab: React.FC<SystemDiagnosticsTabProps> = ({
  gpuInfo,
  modelGPUInfo,
  cpuCores,
  performanceSettings,
  onRefresh,
  getGPUTypeIcon,
  getGPUTypeName,
  getPlatformName
}) => {
  if (!gpuInfo) return null;

  return (
    <div className="space-y-6">
      {/* System Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* GPU Status Card */}
        <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            {gpuInfo.hasGPU ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : (
              <Cpu className="w-6 h-6 text-blue-500" />
            )}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Graphics Power</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Hardware acceleration</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {getGPUTypeIcon(gpuInfo.gpuType)}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getGPUTypeName(gpuInfo.gpuType)}
              </span>
            </div>
            
            <div className={`p-3 rounded-lg text-sm ${
              gpuInfo.hasGPU 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            }`}>
              {gpuInfo.hasGPU ? (
                <span>✨ GPU acceleration enabled</span>
              ) : (
                <span>🧠 CPU processing mode</span>
              )}
            </div>
          </div>
        </div>

        {/* Memory Information Card */}
        <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-6 h-6 text-purple-500" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Memory</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Available resources</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">GPU Memory:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {gpuInfo.gpuMemoryGB.toFixed(1)} GB
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">System RAM:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {gpuInfo.systemMemoryGB} GB
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Platform:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {getPlatformName(gpuInfo.platform)}
              </span>
            </div>
          </div>
        </div>

        {/* CPU Information Card */}
        <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            <Cpu className="w-6 h-6 text-orange-500" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Processor</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">CPU configuration</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">CPU Cores:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {cpuCores}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Optimal Threads:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {Math.max(1, Math.min(8, Math.floor(cpuCores / 2)))}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Global Setting:</span>
              <span className={`font-semibold ${
                performanceSettings.threads === Math.max(1, Math.min(8, Math.floor(cpuCores / 2)))
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-orange-600 dark:text-orange-400'
              }`}>
                {performanceSettings.threads}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Model GPU Allocation */}
      
    </div>
  );
};

const GPUDiagnostics: React.FC = () => {
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [modelGPUInfo, setModelGPUInfo] = useState<ModelGPUInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cpuCores, setCpuCores] = useState(4); // Default fallback
  const [activeTab, setActiveTab] = useState<'system' | 'config'>('system');
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({
    flashAttention: true,
    autoOptimization: true,
    maxContextSize: 32768,
    aggressiveOptimization: false,
    prioritizeSpeed: true,
    optimizeFirstToken: false,
    threads: 4,
    parallelSequences: 1,
    optimizeConversations: true,
    keepTokens: 1000,
    defragThreshold: 0.5,
    enableContinuousBatching: true,
    conversationMode: 'balanced',
    batchSize: 256,
    ubatchSize: 256,
    gpuLayers: 50,
    memoryLock: true
  });

  // Helper functions for model estimation
  const estimateModelSizeGB = (modelName: string): number => {
    const name = modelName.toLowerCase();
    if (name.includes('30b') || name.includes('27b')) return 25;
    if (name.includes('7b') || name.includes('8b')) return 7;
    if (name.includes('3b') || name.includes('4b')) return 3;
    if (name.includes('1b') || name.includes('nano')) return 1;
    if (name.includes('embed')) return 0.5;
    return 5; // default
  };

  const estimateLayersFromGpuLayers = (gpuLayers: number): number => {
    // Most models have around 80-120 layers, estimate based on GPU layers
    if (gpuLayers === 0) return 80; // Default for CPU-only
    if (gpuLayers >= 80) return Math.max(80, gpuLayers);
    return Math.max(80, Math.round(gpuLayers * 1.5)); // Estimate total layers
  };

  const estimateParams = (modelName: string): string => {
    const name = modelName.toLowerCase();
    if (name.includes('30b')) return '30B params';
    if (name.includes('27b')) return '27B params';
    if (name.includes('7b') || name.includes('8b')) return '7B params';
    if (name.includes('3b') || name.includes('4b')) return '3B params';
    if (name.includes('1b') || name.includes('nano')) return '1B params';
    if (name.includes('embed')) return 'Embedding';
    return 'Unknown params';
  };

  const fetchGPUDiagnostics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Starting GPU diagnostics fetch...');
      
      // Debug: Check what's available on window
      console.log('window.electron:', window.electron);
      console.log('window.llamaSwap:', (window as any).llamaSwap);
      
      const llamaSwap = (window as any).llamaSwap;
      if (!llamaSwap) {
        throw new Error('LlamaSwap service not available');
      }
      
      console.log('llamaSwap object keys:', Object.keys(llamaSwap));
      
      if (!llamaSwap.getGPUDiagnostics) {
        console.error('getGPUDiagnostics method not found');
        console.log('Available llamaSwap methods:', Object.keys(llamaSwap));
        throw new Error('getGPUDiagnostics method not available');
      }

      console.log('Calling getGPUDiagnostics...');
      // Get GPU information
      const response = await llamaSwap.getGPUDiagnostics();
      console.log('GPU diagnostics response:', response);
      
      if (response.success) {
        setGpuInfo(response.gpuInfo);
        
        // Get actual configuration and parse model info
        try {
          const configResult = await llamaSwap.getConfigurationInfo();
          if (configResult.success && configResult.configuration) {
            const parsedModels = parseJsonConfiguration(configResult.configuration);
            
            // Convert ParsedModelConfig to ModelGPUInfo format for display
            const modelInfoForGPU = parsedModels.map(model => ({
              name: model.name,
              path: model.modelPath || '',
              sizeGB: estimateModelSizeGB(model.name),
              estimatedLayers: estimateLayersFromGpuLayers(model.gpuLayers || 0),
              allocatedLayers: model.gpuLayers || 0,
              estimatedParams: estimateParams(model.name)
            }));
            
            setModelGPUInfo(modelInfoForGPU);
          } else {
            // Fallback to response.modelInfo if configuration parsing fails
            setModelGPUInfo(response.modelInfo || []);
          }
        } catch (configError) {
          console.warn('Failed to parse configuration, using fallback:', configError);
          setModelGPUInfo(response.modelInfo || []);
        }
        
        // Detect CPU cores for thread configuration
        if (navigator.hardwareConcurrency) {
          setCpuCores(navigator.hardwareConcurrency);
        }
      } else {
        throw new Error(response.error || 'Failed to get GPU diagnostics');
      }
    } catch (err) {
      console.error('Error fetching GPU diagnostics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch GPU diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGPUDiagnostics();
    loadPerformanceSettings();
  }, []);

  const loadPerformanceSettings = async () => {
    try {
      const llamaSwap = (window as any).llamaSwap;
      if (llamaSwap?.getPerformanceSettings) {
        const settings = await llamaSwap.getPerformanceSettings();
        if (settings.success) {
          setPerformanceSettings(settings.settings);
        }
      }
    } catch (error) {
      console.error('Error loading performance settings:', error);
    }
  };

  const getGPUTypeIcon = (gpuType: string) => {
    switch (gpuType) {
      case 'apple_silicon':
        return <Monitor className="w-5 h-5 text-blue-500" />;
      case 'nvidia':
        return <Zap className="w-5 h-5 text-green-500" />;
      case 'amd':
        return <BarChart3 className="w-5 h-5 text-red-500" />;
      case 'intel':
        return <Cpu className="w-5 h-5 text-blue-400" />;
      case 'integrated':
        return <HardDrive className="w-5 h-5 text-gray-500" />;
      default:
        return <Monitor className="w-5 h-5 text-gray-400" />;
    }
  };

  const getGPUTypeName = (gpuType: string) => {
    switch (gpuType) {
      case 'apple_silicon':
        return 'Apple Silicon (Unified Memory)';
      case 'nvidia':
        return 'NVIDIA GPU';
      case 'amd':
        return 'AMD GPU';
      case 'intel':
        return 'Intel GPU';
      case 'integrated':
        return 'Integrated Graphics';
      case 'dedicated':
        return 'Dedicated GPU';
      default:
        return 'Unknown GPU';
    }
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case 'darwin':
        return 'macOS';
      case 'win32':
        return 'Windows';
      case 'linux':
        return 'Linux';
      default:
        return platform;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Looking at your computer...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Checking what kind of brain (GPU/CPU) you have!</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
              Oops! Something went wrong
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              We couldn't check your computer's capabilities. This usually means the system is still starting up.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-4 font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded">
              {error}
            </p>
            <button
              onClick={fetchGPUDiagnostics}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gpuInfo) {
    return (
      <div className="text-center py-8">
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
          <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">No Information Available</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We couldn't find information about your computer's capabilities right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Hardware Acceleration Center
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          System diagnostics and individual model configuration 🚀
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'system'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Monitor className="w-4 h-4" />
              System Diagnostics
            </div>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'config'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Cpu className="w-4 h-4" />
              Model Configuration
            </div>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'system' && (
            <SystemDiagnosticsTab 
              gpuInfo={gpuInfo}
              modelGPUInfo={modelGPUInfo}
              cpuCores={cpuCores}
              performanceSettings={performanceSettings}
              onRefresh={fetchGPUDiagnostics}
              getGPUTypeIcon={getGPUTypeIcon}
              getGPUTypeName={getGPUTypeName}
              getPlatformName={getPlatformName}
            />
          )}
          
          {activeTab === 'config' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Individual Model Configuration
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure each model with its own context size, GPU layers, and performance settings
                </p>
              </div>
              <BackendConfigurationPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GPUDiagnostics; 
