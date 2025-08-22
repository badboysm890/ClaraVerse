import React, { useEffect, useState, useRef } from 'react';
import { 
  Server, 
  Bot, 
  Code, 
  Image, 
  Zap, 
  ExternalLink, 
  Play, 
  Square, 
  RefreshCw, 
  AlertCircle,
  HardDrive,
  Save,
  Check,
  X,
  Monitor
} from 'lucide-react';

// Interfaces for service types
interface CoreService {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'running' | 'stopped';
  serviceUrl?: string;
  port?: number | string;
  deployment: string;
  engine?: string;
  autoStart: boolean;
  configurable: boolean;
  statusColor: string;
  actions: string[];
}

interface ConfigurableService {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'running' | 'stopped';
  mode: 'docker' | 'manual';
  serviceUrl?: string;
  manualUrl?: string;
  platformSupport: {
    docker: boolean;
    manual: boolean;
  };
  isLoading?: boolean;
  error?: string;
  actions: string[];
}

// Docker Services Status Interface (reused from existing code)
interface DockerServicesStatus {
  dockerAvailable: boolean;
  n8nAvailable: boolean;
  pythonAvailable: boolean;
  message?: string;
  ports?: {
    python: number;
    n8n: number;
    ollama: number;
  };
}

// Service Status Interface (reused from existing code)
interface ServiceStatus {
  running: boolean;
  serviceUrl?: string;
  error?: string;
}

const UnifiedServiceManager: React.FC = () => {
  // Core service states (reused from existing ServicesTab)
  const [dockerServices, setDockerServices] = useState<DockerServicesStatus>({
    dockerAvailable: false,
    n8nAvailable: false,
    pythonAvailable: false
  });

  // Configurable service states (reused from existing Settings.tsx)
  const [serviceConfigs, setServiceConfigs] = useState<any>({});
  const [enhancedServiceStatus, setEnhancedServiceStatus] = useState<any>({});
  const [currentPlatform, setCurrentPlatform] = useState<string>('win32');
  
  // N8N and ComfyUI service status (reused from ServicesTab)
  const [n8nStatus, setN8nStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:5678'
  });
  const [comfyuiStatus, setComfyuiStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:8188'
  });

  // Loading states
  const [globalLoading, setGlobalLoading] = useState(false);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [comfyuiLoading, setComfyuiLoading] = useState(false);
  
  // Feature Configuration State
  const [featureConfig, setFeatureConfig] = useState({
    comfyUI: true,
    n8n: true,
    ragAndTts: true,
    angelaCore: true
  });
  const [savingFeatureConfig, setSavingFeatureConfig] = useState(false);

  // Load feature configuration
  const loadFeatureConfig = async () => {
    try {
      if ((window as any).featureConfig?.getFeatureConfig) {
        const config = await (window as any).featureConfig.getFeatureConfig();
        if (config) {
          setFeatureConfig(config);
        }
      }
    } catch (error) {
      console.error('Failed to load feature configuration:', error);
    }
  };

  // Update feature configuration
  const updateFeatureConfig = async (updates: Partial<typeof featureConfig>) => {
    try {
      setSavingFeatureConfig(true);
      const newConfig = { ...featureConfig, ...updates };
      
      // angela Core is always enabled
      newConfig.angelaCore = true;
      
      setFeatureConfig(newConfig);
      
      // Save to electron backend
      if ((window as any).featureConfig?.updateFeatureConfig) {
        const success = await (window as any).featureConfig.updateFeatureConfig(newConfig);
        if (!success) {
          throw new Error('Failed to save feature configuration');
        }
      }
      
      // Dispatch event to notify other components (like Sidebar) about the config change
      const event = new CustomEvent('feature-config-updated', { detail: newConfig });
      window.dispatchEvent(event);
      console.log('🔄 UnifiedServiceManager - Dispatched feature-config-updated event');
      
    } catch (error) {
      console.error('Failed to update feature configuration:', error);
      // Revert on error
      setFeatureConfig(featureConfig);
      alert('❌ Failed to save feature configuration. Please try again.');
    } finally {
      setSavingFeatureConfig(false);
    }
  };
  const [dockerServiceLoading, setDockerServiceLoading] = useState<{ [key: string]: boolean }>({});

  // Manual service configuration states (reused from Settings.tsx)
  const [tempServiceUrls, setTempServiceUrls] = useState<{ [key: string]: string }>({});
  const [savingServiceConfig, setSavingServiceConfig] = useState<{ [key: string]: boolean }>({});
  const [testingServices, setTestingServices] = useState<{ [key: string]: boolean }>({});
  const [serviceTestResults, setServiceTestResults] = useState<{ [key: string]: any }>({});

  const expectedServiceStatesRef = useRef<{ [key: string]: boolean }>({});

  // Platform detection (reused from Settings.tsx)
  useEffect(() => {
    const platform = (window as any).electronAPI?.platform;
    if (platform) {
      if (platform.includes('win')) setCurrentPlatform('win32');
      else if (platform.includes('darwin')) setCurrentPlatform('darwin');
      else setCurrentPlatform('linux');
    } else {
      // Fallback for web environment
      setCurrentPlatform('win32');
    }
  }, []);

  // Load service configurations (reused from Settings.tsx)
  useEffect(() => {
    loadServiceConfigurations();
    loadFeatureConfig(); // Load feature configuration on mount
  }, []);

  // Status checking intervals (reused from ServicesTab)
  useEffect(() => {
    const checkDockerServices = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.checkDockerServices) {
          const status = await electron.checkDockerServices();
          setDockerServices(status);
        }
      } catch (error) {
        console.error('Failed to check Docker services:', error);
      }
    };

    checkDockerServices();
    fetchN8nStatus();
    fetchComfyuiStatus();
    
    const interval = setInterval(() => {
      checkDockerServices();
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // ===== REUSED FUNCTIONS FROM EXISTING CODE =====

  // Load service configurations (from Settings.tsx)
  const loadServiceConfigurations = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
        setServiceConfigs(configs);

        const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
        setEnhancedServiceStatus(status);
      }
    } catch (error) {
      console.error('Failed to load service configurations:', error);
    }
  };

  // Fetch N8N status (from ServicesTab)
  const fetchN8nStatus = async () => {
    try {
      const result = await (window as any).electronAPI.invoke('n8n:check-service-status');
      setN8nStatus({
        running: result.running || false,
        serviceUrl: result.serviceUrl || 'http://localhost:5678',
        error: result.error
      });
    } catch (error) {
      console.error('Error fetching N8N status:', error);
      setN8nStatus({
        running: false,
        serviceUrl: 'http://localhost:5678',
        error: 'Failed to check status'
      });
    }
  };

  // Fetch ComfyUI status (from ServicesTab)
  const fetchComfyuiStatus = async () => {
    try {
      const result = await (window as any).electronAPI.invoke('comfyui:check-service-status');
      setComfyuiStatus({
        running: result.running || false,
        serviceUrl: result.serviceUrl || 'http://localhost:8188',
        error: result.error
      });
    } catch (error) {
      console.error('Error fetching ComfyUI status:', error);
      setComfyuiStatus({
        running: false,
        serviceUrl: 'http://localhost:8188',
        error: 'Failed to check status'
      });
    }
  };

  // Handle N8N actions (from ServicesTab)
  const handleN8nAction = async (action: 'start' | 'stop' | 'restart') => {
    setN8nLoading(true);
    try {
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:start-container');
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:stop-container');
      } else if (action === 'restart' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:restart-container');
      }
      
      if (result?.success) {
        setTimeout(() => fetchN8nStatus(), 3000);
      }
    } catch (error) {
      console.error('Error performing N8N action:', error);
    } finally {
      setN8nLoading(false);
    }
  };

  // Handle ComfyUI actions (from ServicesTab)
  const handleComfyuiAction = async (action: 'start' | 'stop' | 'restart') => {
    setComfyuiLoading(true);
    try {
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-start');
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-stop');
      } else if (action === 'restart' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-restart');
      }
      
      if (result?.success) {
        setTimeout(() => fetchComfyuiStatus(), 5000);
        setTimeout(() => fetchComfyuiStatus(), 15000);
      }
    } catch (error) {
      console.error('Error performing ComfyUI action:', error);
    } finally {
      setComfyuiLoading(false);
    }
  };

  // Handle Docker service actions (from ServicesTab)
  const handleDockerServiceAction = async (service: string, action: 'start' | 'stop' | 'restart') => {
    const loadingKey = `${service}-${action}`;
    setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('electronAPI not available');
        return;
      }

      // Use specific service handlers instead of generic container actions
      // This ensures containers are created if they don't exist
      let result;
      
      if (service === 'python') {
        if (action === 'start') {
          result = await electronAPI.invoke('start-python-container');
        } else {
          // For stop/restart, try to use generic docker service handler
          result = await electronAPI.invoke('stop-docker-service', service);
        }
      } else if (service === 'n8n') {
        if (action === 'start') {
          result = await electronAPI.invoke('n8n:start-container');
        } else if (action === 'stop') {
          result = await electronAPI.invoke('n8n:stop-container');
        } else if (action === 'restart') {
          result = await electronAPI.invoke('n8n:restart-container');
        }
      } else {
        console.error(`Unknown service: ${service}`);
        return;
      }
      
      if (result?.success) {
        let expectedState: boolean;
        if (action === 'start') {
          expectedState = true;
        } else if (action === 'stop') {
          expectedState = false;
        } else {
          expectedState = true;
        }
        
        expectedServiceStatesRef.current = { ...expectedServiceStatesRef.current, [service]: expectedState };
        
        setTimeout(async () => {
          try {
            const electron = (window as any).electron;
            if (electron?.checkDockerServices) {
              const status = await electron.checkDockerServices();
              setDockerServices(status);
            }
          } catch (error) {
            console.error('Error refreshing services after action:', error);
          }
        }, 1000);
      } else {
        console.error(`Failed to ${action} ${service}:`, result?.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`Failed to ${action} ${service}:`, error);
    } finally {
      setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  // Update service config (from Settings.tsx)
  const updateServiceConfig = async (serviceName: string, mode: string, url?: string) => {
    try {
      setSavingServiceConfig(prev => ({ ...prev, [serviceName]: true }));
      
      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('service-config:set-config', serviceName, mode, url);
        // Don't reload configurations immediately - let the local state updates persist
        // await loadServiceConfigurations();
      }
    } catch (error) {
      console.error('Failed to update service config:', error);
      // On error, reload to get the correct state
      await loadServiceConfigurations();
    } finally {
      setSavingServiceConfig(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Save manual service URL (from Settings.tsx)
  const saveManualServiceUrl = async (serviceName: string) => {
    const urlToSave = tempServiceUrls[serviceName] || serviceConfigs[serviceName]?.url || '';
    if (!urlToSave.trim()) {
      return;
    }
    
    // Update local state immediately
    setServiceConfigs((prev: any) => ({
      ...prev,
      [serviceName]: { 
        ...prev[serviceName], 
        mode: 'manual',
        url: urlToSave.trim()
      }
    }));
    
    await updateServiceConfig(serviceName, 'manual', urlToSave.trim());
    
    // Clear temp URL after saving
    setTempServiceUrls(prev => ({ ...prev, [serviceName]: '' }));
    
    // Reload configurations after a delay to ensure backend sync
    setTimeout(() => {
      loadServiceConfigurations();
    }, 1000);
  };

  // Test manual service (from Settings.tsx)
  const testManualService = async (serviceName: string, url: string) => {
    setTestingServices(prev => ({ ...prev, [serviceName]: true }));
    
    try {
      if ((window as any).electronAPI?.invoke) {
        const result = await (window as any).electronAPI.invoke('service-config:test-manual-service', serviceName, url);
        setServiceTestResults(prev => ({ ...prev, [serviceName]: result }));
        
        setTimeout(() => {
          setServiceTestResults(prev => ({ ...prev, [serviceName]: null }));
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to test service:', error);
      setServiceTestResults(prev => ({ 
        ...prev, 
        [serviceName]: { 
          success: false, 
          error: 'Test failed: ' + (error instanceof Error ? error.message : String(error))
        }
      }));
    } finally {
      setTestingServices(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Refresh all services
  const refreshAllServices = async () => {
    setGlobalLoading(true);
    try {
      await Promise.all([
        loadServiceConfigurations(),
        fetchN8nStatus(),
        fetchComfyuiStatus()
      ]);
    } catch (error) {
      console.error('Error refreshing services:', error);
    } finally {
      setGlobalLoading(false);
    }
  };

  // ===== UNIFIED SERVICE DATA =====

  // Core Services
  const coreServices: CoreService[] = [
    {
      id: 'angela-core',
      name: 'angela Core',
      description: 'AI engine with local model management and llama.cpp',
      icon: Bot,
      status: 'running',
      serviceUrl: 'http://localhost:8091',
      port: '8091',
      deployment: 'Native Binary',
      engine: 'llama.cpp',
      autoStart: true,
      configurable: false,
      statusColor: 'emerald',
      actions: ['open']
    },
    {
      id: 'python-backend',
      name: 'Python Backend',
      description: 'RAG, TTS, STT, and document processing services \n (Might take a few minutes to start if its the first time)',
      icon: Code,
      status: enhancedServiceStatus?.['python-backend']?.state === 'running' || dockerServices?.pythonAvailable ? 'running' : 'stopped',
      serviceUrl: enhancedServiceStatus?.['python-backend']?.serviceUrl || 'http://localhost:5001',
      port: '5001',
      deployment: 'Docker Container',
      engine: 'RAG, TTS, STT',
      autoStart: true,
      configurable: false,
      statusColor: 'blue',
      actions: dockerServices?.pythonAvailable ? ['open', 'stop', 'restart'] : ['start']
    }
  ];

  // Configurable Services
  const configurableServices: ConfigurableService[] = [
    {
      id: 'n8n',
      name: 'N8N Workflows',
      description: 'Visual workflow builder and automation platform',
      icon: Zap,
      status: n8nStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs.n8n?.mode || 'docker',
      serviceUrl: n8nStatus.serviceUrl,
      manualUrl: serviceConfigs.n8n?.url,
      platformSupport: {
        docker: true,
        manual: true
      },
      isLoading: n8nLoading,
      error: n8nStatus.error,
      actions: n8nStatus.running ? ['open', 'stop', 'restart'] : ['start']
    },
    {
      id: 'comfyui',
      name: 'ComfyUI Image Generation',
      description: 'AI image generation with Stable Diffusion',
      icon: Image,
      status: comfyuiStatus.running ? 'running' : 'stopped',
      mode: serviceConfigs.comfyui?.mode || 'docker',
      serviceUrl: comfyuiStatus.serviceUrl,
      manualUrl: serviceConfigs.comfyui?.url,
      platformSupport: {
        docker: currentPlatform === 'win32',
        manual: true
      },
      isLoading: comfyuiLoading,
      error: comfyuiStatus.error,
      actions: comfyuiStatus.running ? ['open', 'stop', 'restart'] : ['start']
    }
  ];

  // ===== RENDER COMPONENTS =====

  const renderCoreServiceCard = (service: CoreService) => {
    const isRunning = service.status === 'running';
    const colorClasses = {
      emerald: {
        bg: 'from-emerald-50/50 to-green-50/50 dark:from-emerald-900/20 dark:to-green-900/20',
        border: 'border-emerald-200 dark:border-emerald-700',
        icon: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        status: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
        text: 'text-emerald-700 dark:text-emerald-300'
      },
      blue: {
        bg: 'from-blue-50/50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/20',
        border: 'border-blue-200 dark:border-blue-700',
        icon: 'bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700',
        iconColor: 'text-blue-600 dark:text-blue-400',
        status: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        text: 'text-blue-700 dark:text-blue-300'
      },
      purple: {
        bg: 'from-purple-50/50 to-violet-50/50 dark:from-purple-900/20 dark:to-violet-900/20',
        border: 'border-purple-200 dark:border-purple-700',
        icon: 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-700',
        iconColor: 'text-purple-600 dark:text-purple-400',
        status: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        text: 'text-purple-700 dark:text-purple-300'
      }
    };

    const colors = colorClasses[service.statusColor as keyof typeof colorClasses];
    const isLoading = (service.id === 'python-backend' && Object.values(dockerServiceLoading).some(Boolean));

    return (
      <div key={service.id} className={`p-6 bg-gradient-to-r ${colors.bg} rounded-xl border ${colors.border}`}>
        {/* Service Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 ${colors.icon} border-2 rounded-xl flex items-center justify-center`}>
              <service.icon className={`w-7 h-7 ${colors.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {service.name}
                {service.id === 'angela-core' && (
                  <span className={`px-2 py-1 ${colors.status} text-xs font-medium rounded-full`}>
                    Built-in
                  </span>
                )}
                {service.id === 'python-backend' && (
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                    Critical
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {service.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {isRunning ? 'Running' : 'Stopped'}
            </span>
            {service.id === 'angela-core' && (
              <span className={`px-3 py-1 ${colors.status} text-xs font-medium rounded-full`}>
                Built-in
              </span>
            )}
            {service.id === 'python-backend' && (
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                Docker
              </span>
            )}
          </div>
        </div>

        {/* Status and Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Status: {isRunning ? 'Running' : 'Stopped'}
                {service.serviceUrl && (
                  <span className="ml-2 font-mono text-xs">
                    {service.serviceUrl.replace('http://', '')}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              {service.actions.includes('open') && service.serviceUrl && isRunning && (
                <button
                  onClick={() => window.open(service.serviceUrl, '_blank')}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              )}
              {service.actions.includes('start') && !isRunning && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'start');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {isLoading ? 'Starting...' : 'Start'}
                </button>
              )}
              {service.actions.includes('stop') && isRunning && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'stop');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                  {isLoading ? 'Stopping...' : 'Stop'}
                </button>
              )}
              {service.actions.includes('restart') && (
                <button
                  onClick={() => {
                    if (service.id === 'python-backend') handleDockerServiceAction('python', 'restart');
                  }}
                  disabled={isLoading}
                  className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Restarting...' : 'Restart'}
                </button>
              )}
            </div>
          </div>
          
          {/* Service Details */}
          <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Deployment:</span>
                <span className={`ml-1 font-medium ${colors.text}`}>{service.deployment}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  {service.id === 'python-backend' ? 'Services:' : 'Engine:'}
                </span>
                <span className={`ml-1 font-medium ${colors.text}`}>{service.engine}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Auto-Start:</span>
                <span className={`ml-1 font-medium ${colors.text}`}>
                  {service.autoStart ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Configurable:</span>
                <span className="ml-1 font-medium text-gray-500 dark:text-gray-400">
                  {service.configurable ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConfigurableServiceCard = (service: ConfigurableService) => {
    const config = serviceConfigs[service.id] || { mode: 'docker', url: null };
    const testResult = serviceTestResults[service.id];
    const isRunning = service.status === 'running';
    const isManualOnly = service.id === 'comfyui' && currentPlatform !== 'win32';

    return (
      <div key={service.id} className="p-6 bg-white/50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Service Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-700'
                : 'bg-gray-100 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600'
            }`}>
              <service.icon className={`w-6 h-6 ${isRunning ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {service.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {service.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : service.isLoading 
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              {service.isLoading ? 'Starting...' : (isRunning ? 'Running' : 'Stopped')}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              config.mode === 'docker' 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
            }`}>
              {config.mode === 'docker' ? 'Docker' : 'Manual'}
            </span>
          </div>
        </div>

        {/* Platform Warning for ComfyUI */}
        {isManualOnly && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>Platform Limitation:</strong> ComfyUI Docker mode is only supported on Windows. 
                {currentPlatform === 'darwin' ? ' On macOS, please use manual setup.' : ' On Linux, please use manual setup.'}
              </p>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Deployment Mode
            </label>
            <div className="flex gap-3">
              {/* Docker Mode */}
              <button
                onClick={() => {
                  if (!isManualOnly) {
                    // Immediately update local state for instant UI response
                    setServiceConfigs((prev: any) => ({
                      ...prev,
                      [service.id]: { 
                        ...prev[service.id], 
                        mode: 'docker'
                      }
                    }));
                    
                    // Update backend config
                    updateServiceConfig(service.id, 'docker');
                  }
                }}
                disabled={isManualOnly}
                className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                  config.mode === 'docker'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-md'
                    : isManualOnly
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-gray-700 dark:text-gray-300'
                }`}
              >
                {config.mode === 'docker' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                )}
                <div className="flex items-center gap-2">
                  <HardDrive className={`w-4 h-4 ${config.mode === 'docker' ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                  <span className="font-medium">Docker</span>
                  {config.mode === 'docker' && (
                    <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 text-left">
                  Managed containers with automatic setup
                </p>
              </button>

              {/* Manual Mode */}
              <button
                onClick={() => {
                  // Pre-populate with default URL if none exists
                  const defaultUrl = service.id === 'comfyui' 
                    ? 'http://localhost:8188' 
                    : 'http://localhost:5678';
                  
                  const urlToUse = config.url || defaultUrl;
                  
                  // Immediately update local state for instant UI response
                  setServiceConfigs((prev: any) => ({
                    ...prev,
                    [service.id]: { 
                      ...prev[service.id], 
                      mode: 'manual',
                      url: urlToUse
                    }
                  }));
                  
                  // Set temp URL for editing
                  setTempServiceUrls(prev => ({
                    ...prev,
                    [service.id]: urlToUse
                  }));
                  
                  // Update config with default URL to satisfy backend validation
                  updateServiceConfig(service.id, 'manual', urlToUse);
                }}
                className={`flex-1 p-3 rounded-lg border-2 transition-all relative ${
                  config.mode === 'manual'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 text-gray-700 dark:text-gray-300'
                }`}
              >
                {config.mode === 'manual' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                )}
                <div className="flex items-center gap-2">
                  <ExternalLink className={`w-4 h-4 ${config.mode === 'manual' ? 'text-purple-600 dark:text-purple-400' : ''}`} />
                  <span className="font-medium">Manual</span>
                  {config.mode === 'manual' && (
                    <span className="ml-auto text-xs bg-purple-100 dark:bg-purple-800 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 text-left">
                  External service with custom URL
                </p>
              </button>
            </div>
          </div>

          {/* Manual URL Configuration */}
          {config.mode === 'manual' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Service URL
                {config.url ? (
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-normal">
                    ✓ Saved: <span className="font-mono">{config.url}</span>
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-orange-600 dark:text-orange-400 font-normal">
                    (Required - Enter URL and click Save)
                  </span>
                )}
              </label>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tempServiceUrls[service.id] !== undefined && tempServiceUrls[service.id] !== '' 
                      ? tempServiceUrls[service.id] 
                      : config.url || ''
                    }
                    onChange={(e) => {
                      setTempServiceUrls(prev => ({
                        ...prev,
                        [service.id]: e.target.value
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveManualServiceUrl(service.id);
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-purple-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder={service.id === 'comfyui' 
                      ? 'http://localhost:8188' 
                      : 'http://localhost:5678'
                    }
                  />
                  
                  <button
                    onClick={() => saveManualServiceUrl(service.id)}
                    disabled={savingServiceConfig[service.id] || 
                      !(tempServiceUrls[service.id] !== undefined 
                        ? tempServiceUrls[service.id].trim()
                        : config.url?.trim()
                      )
                    }
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 font-medium ${
                      tempServiceUrls[service.id] && tempServiceUrls[service.id] !== config.url
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {savingServiceConfig[service.id] ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : tempServiceUrls[service.id] && tempServiceUrls[service.id] !== config.url ? (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save URL
                      </>
                    )}
                  </button>
                </div>

                {/* Test Connection Button */}
                <div className="flex gap-2">
                  {(config.url || tempServiceUrls[service.id]) && (
                    <button
                      onClick={() => {
                        const urlToTest = tempServiceUrls[service.id] || config.url;
                        testManualService(service.id, urlToTest);
                      }}
                      disabled={testingServices[service.id]}
                      className={`flex-1 px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 font-medium ${
                        testResult?.success === true
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                          : testResult?.success === false
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                      } disabled:opacity-50`}
                    >
                      {testingServices[service.id] ? (
                        <>
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          Testing Connection...
                        </>
                      ) : testResult?.success === true ? (
                        <>
                          <Check className="w-4 h-4" />
                          Connection Successful
                        </>
                      ) : testResult?.success === false ? (
                        <>
                          <X className="w-4 h-4" />
                          Connection Failed
                        </>
                      ) : (
                        <>
                          <Server className="w-4 h-4" />
                          Test Connection
                        </>
                      )}
                    </button>
                  )}

                  {/* Clear Button */}
                  {(tempServiceUrls[service.id] || config.url) && (
                    <button
                      onClick={async () => {
                        setTempServiceUrls(prev => ({ ...prev, [service.id]: '' }));
                        await updateServiceConfig(service.id, 'manual', '');
                        
                        setServiceTestResults(prev => ({ 
                          ...prev, 
                          [service.id]: { 
                            success: true, 
                            message: 'URL cleared successfully',
                            timestamp: Date.now()
                          }
                        }));
                        
                        setTimeout(() => {
                          setServiceTestResults(prev => ({ ...prev, [service.id]: null }));
                        }, 3000);
                      }}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                      <X className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                </div>

                {/* Test Result Messages */}
                {testResult && (
                  <div className={`p-2 rounded-lg text-sm ${
                    testResult.success === true
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                      : testResult.success === false
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                  }`}>
                    {testResult.success === true ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        <span>{testResult.message || 'Service is accessible and responding correctly!'}</span>
                      </div>
                    ) : testResult.success === false ? (
                      <div className="flex items-center gap-2">
                        <X className="w-4 h-4" />
                        <span>Error: {testResult.error}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* URL Format Help */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p><strong>Expected format:</strong> http://localhost:port or https://your-domain.com</p>
                  <p><strong>Default ports:</strong> ComfyUI (8188), N8N (5678)</p>
                  <p><strong>Tip:</strong> Press Enter to save quickly</p>
                </div>
              </div>
            </div>
          )}

          {/* Service Status and Controls */}
          {config.mode && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    service.isLoading 
                      ? 'bg-yellow-500 animate-pulse' 
                      : isRunning 
                        ? 'bg-green-500' 
                        : 'bg-gray-400'
                  }`}></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Status: {service.isLoading ? 'Starting...' : (isRunning ? 'Running' : 'Stopped')}
                    {(service.serviceUrl || (config.mode === 'manual' && config.url)) && (
                      <span className="ml-2 font-mono text-xs">
                        {service.serviceUrl || config.url}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  {service.actions.includes('open') && service.serviceUrl && isRunning && (
                    <button
                      onClick={() => window.open(service.serviceUrl, '_blank')}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </button>
                  )}
                  {service.actions.includes('start') && !isRunning && (
                    <button
                      onClick={() => {
                        if (service.id === 'n8n') handleN8nAction('start');
                        else if (service.id === 'comfyui') handleComfyuiAction('start');
                      }}
                      disabled={service.isLoading}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {service.isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {service.isLoading ? 'Starting...' : 'Start'}
                    </button>
                  )}
                  {service.actions.includes('stop') && isRunning && (
                    <button
                      onClick={() => {
                        if (service.id === 'n8n') handleN8nAction('stop');
                        else if (service.id === 'comfyui') handleComfyuiAction('stop');
                      }}
                      disabled={service.isLoading}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {service.isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                      {service.isLoading ? 'Stopping...' : 'Stop'}
                    </button>
                  )}
                  {service.actions.includes('restart') && (
                    <button
                      onClick={() => {
                        if (service.id === 'n8n') handleN8nAction('restart');
                        else if (service.id === 'comfyui') handleComfyuiAction('restart');
                      }}
                      disabled={service.isLoading}
                      className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${service.isLoading ? 'animate-spin' : ''}`} />
                      {service.isLoading ? 'Restarting...' : 'Restart'}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Configuration Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Deployment:</span>
                  <span className={`ml-1 font-medium ${
                    config.mode === 'docker' 
                      ? 'text-blue-700 dark:text-blue-300' 
                      : 'text-purple-700 dark:text-purple-300'
                  }`}>
                    {config.mode === 'docker' ? 'Docker Container' : 'Manual Setup'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Service Type:</span>
                  <span className="ml-1 text-gray-700 dark:text-gray-300 font-medium">
                    {service.id === 'comfyui' ? 'Image Generation' : 'Workflow Automation'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">URL Source:</span>
                  <span className="ml-1 text-gray-700 dark:text-gray-300 font-medium">
                    {config.mode === 'docker' ? 'Auto-detected' : (config.url ? `Manual: ${config.url}` : 'Not set')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Configurable:</span>
                  <span className="ml-1 text-green-700 dark:text-green-300 font-medium">Yes</span>
                </div>
              </div>

              {/* Error Display */}
              {service.error && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                  {service.error}
                </div>
              )}

              {/* Loading Message for ComfyUI */}
              {service.id === 'comfyui' && service.isLoading && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-700 dark:text-yellow-300">
                  ComfyUI may take 30-60 seconds to fully start
                </div>
              )}
            </div>
          )}

          {/* Feature Configuration Toggle */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {service.id === 'comfyui' ? '🎨 Enable' : '⚡ Enable'}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {service.id === 'comfyui' 
                    ? 'Show ComfyUI in the sidebar' 
                    : 'Show N8N in the sidebar'
                  }
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={service.id === 'comfyui' ? featureConfig.comfyUI : featureConfig.n8n}
                  onChange={(e) => {
                    if (service.id === 'comfyui') {
                      updateFeatureConfig({ comfyUI: e.target.checked });
                    } else {
                      updateFeatureConfig({ n8n: e.target.checked });
                    }
                  }}
                  disabled={savingFeatureConfig}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
              </label>
            </div>
            
            {savingFeatureConfig && (
              <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-purple-700 dark:text-purple-300">
                    Updating feature configuration...
                  </span>
                </div>
              </div>
            )}
            
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
              <div className="flex items-start gap-2">
                <div className="text-blue-600 dark:text-blue-400 mt-0.5">💡</div>
                <div className="text-blue-700 dark:text-blue-300">
                  <strong>Tip:</strong> Enabling this feature will make {service.id === 'comfyui' ? 'Image Generation' : 'Workflow Automation'} 
                  available in the sidebar and include it in the onboarding flow for new users. 
                  This is useful if you initially skipped this service during setup.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Helper function for platform name
  const getPlatformName = (platform: string) => {
    switch (platform) {
      case 'win32': return 'Windows';
      case 'darwin': return 'macOS';
      case 'linux': return 'Linux';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Service Management
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Monitor and control all angelaVerse services from one place
              </p>
            </div>
          </div>
          <button
            onClick={refreshAllServices}
            disabled={globalLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${globalLoading ? 'animate-spin' : ''}`} />
            {globalLoading ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>

        {/* Platform Info */}
        <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Platform: {getPlatformName(currentPlatform)}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {currentPlatform === 'win32' 
                  ? 'All services support both Docker and Manual deployment modes'
                  : 'ComfyUI requires manual setup on macOS/Linux for optimal performance'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Core Services */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Core Services
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Essential services that power angela's AI capabilities
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {coreServices.map(renderCoreServiceCard)}
        </div>
      </div>

      {/* Configurable Services */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Configurable Services
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Optional services with Docker and Manual deployment options
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {configurableServices.map(renderConfigurableServiceCard)}
        </div>
      </div>
    </div>
  );
};

export default UnifiedServiceManager;
