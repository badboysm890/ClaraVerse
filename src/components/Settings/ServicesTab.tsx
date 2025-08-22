import React, { useEffect, useState, useRef } from 'react';
import { Server, Wrench, AlertCircle, ExternalLink, Play, Square, RefreshCw, Image, Zap } from 'lucide-react';

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

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  created: string;
}

interface LlamaSwapStatus {
  isRunning: boolean;
  port: number | null;
  pid?: number;
  apiUrl: string | null;
}

interface ServiceStatus {
  running: boolean;
  serviceUrl?: string;
  error?: string;
}

interface LlamaSwapModel {
  id: string;
  object: string;
  created: number;
}

const ServicesTab: React.FC = () => {
  const [dockerServices, setDockerServices] = useState<DockerServicesStatus>({
    dockerAvailable: false,
    n8nAvailable: false,
    pythonAvailable: false
  });

  // Llama-swap state
  const [llamaSwapStatus, setLlamaSwapStatus] = useState<LlamaSwapStatus>({
    isRunning: false,
    port: null,
    apiUrl: null
  });
  const [llamaSwapModels, setLlamaSwapModels] = useState<LlamaSwapModel[]>([]);
  const [llamaSwapLoading, setLlamaSwapLoading] = useState(false);
  
  // N8N and ComfyUI service status
  const [n8nStatus, setN8nStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:5678'
  });
  const [comfyuiStatus, setComfyuiStatus] = useState<ServiceStatus>({
    running: false,
    serviceUrl: 'http://localhost:8188'
  });
  const [n8nLoading, setN8nLoading] = useState(false);
  const [comfyuiLoading, setComfyuiLoading] = useState(false);
  
  const [dockerServiceLoading, setDockerServiceLoading] = useState<{ [key: string]: boolean }>({});
  const expectedServiceStatesRef = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const checkDockerServices = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.checkDockerServices) {
          const status = await electron.checkDockerServices();
          
          // Before updating, check if we need to clear any loading states
          setDockerServiceLoading(prev => {
            const newLoading = { ...prev };
            
            // Check n8n service state changes
            if (expectedServiceStatesRef.current['n8n'] !== undefined) {
              if (status.n8nAvailable === expectedServiceStatesRef.current['n8n']) {
                // Expected state reached, clear all n8n loading states
                delete newLoading['n8n-start'];
                delete newLoading['n8n-stop'];
                delete newLoading['n8n-restart'];
              }
            }
            
            // Check python service state changes
            if (expectedServiceStatesRef.current['python'] !== undefined) {
              if (status.pythonAvailable === expectedServiceStatesRef.current['python']) {
                // Expected state reached, clear all python loading states
                delete newLoading['python-start'];
                delete newLoading['python-stop'];
                delete newLoading['python-restart'];
              }
            }
            
            return newLoading;
          });
          
          // Clear expected states once they're reached
          expectedServiceStatesRef.current = { ...expectedServiceStatesRef.current };
          if (expectedServiceStatesRef.current['n8n'] !== undefined && status.n8nAvailable === expectedServiceStatesRef.current['n8n']) {
            delete expectedServiceStatesRef.current['n8n'];
          }
          if (expectedServiceStatesRef.current['python'] !== undefined && status.pythonAvailable === expectedServiceStatesRef.current['python']) {
            delete expectedServiceStatesRef.current['python'];
          }
          
          setDockerServices(status);
        }
      } catch (error) {
        console.error('Failed to check Docker services:', error);
        setDockerServices({
          dockerAvailable: false,
          n8nAvailable: false,
          pythonAvailable: false,
          message: 'Failed to check Docker services'
        });
      }
    };

    checkDockerServices();
    const interval = setInterval(checkDockerServices, 60000); // Reduced from 30s to minimize API calls
    
    // Also fetch llama-swap status
    fetchLlamaSwapStatus();
    
    // Fetch N8N and ComfyUI service status
    fetchN8nStatus();
    fetchComfyuiStatus();
    
    return () => clearInterval(interval);
  }, []);

  // N8N service management functions
  const fetchN8nStatus = async () => {
    try {
      const result = await (window as any).electronAPI.invoke('n8n:check-service-status');
      console.log('N8N Service Status:', result);
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

  const fetchComfyuiStatus = async () => {
    try {
      const result = await (window as any).electronAPI.invoke('comfyui:check-service-status');
      console.log('ComfyUI Service Status:', result);
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

  const handleN8nAction = async (action: 'start' | 'stop' | 'restart') => {
    setN8nLoading(true);
    try {
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('n8n:start-container');
      } else if (action === 'stop' && (window as any).electronAPI) {
        // For stop, we'll use docker service control as fallback
        await handleDockerServiceAction('n8n', 'stop');
        result = { success: true };
      } else if (action === 'restart' && (window as any).electronAPI) {
        // For restart, use docker service control
        await handleDockerServiceAction('n8n', 'restart');
        result = { success: true };
      }
      
      if (result?.success) {
        // Wait a moment for service to start/stop
        setTimeout(() => {
          fetchN8nStatus();
        }, 2000);
      } else {
        console.error('N8N action failed:', result?.error);
      }
    } catch (error) {
      console.error('Error performing N8N action:', error);
    } finally {
      setN8nLoading(false);
    }
  };

  const handleComfyuiAction = async (action: 'start' | 'stop' | 'restart') => {
    setComfyuiLoading(true);
    try {
      let result;
      if (action === 'start' && (window as any).electronAPI) {
        // Use both container start and comfyui-start for better compatibility
        result = await (window as any).electronAPI.invoke('comfyui-start');
        // ComfyUI takes longer to start, so wait more and check status multiple times
        if (result?.success) {
          // Check status after 5 seconds, then again after 15 seconds
          setTimeout(() => {
            fetchComfyuiStatus();
          }, 5000);
          setTimeout(() => {
            fetchComfyuiStatus();
          }, 15000);
        }
      } else if (action === 'stop' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-stop');
      } else if (action === 'restart' && (window as any).electronAPI) {
        result = await (window as any).electronAPI.invoke('comfyui-restart');
        // ComfyUI restart takes longer, check status multiple times
        if (result?.success) {
          setTimeout(() => {
            fetchComfyuiStatus();
          }, 8000);
          setTimeout(() => {
            fetchComfyuiStatus();
          }, 20000);
        }
      }
      
      if (result?.success) {
        console.log(`ComfyUI ${action} initiated successfully`);
      } else {
        console.error('ComfyUI action failed:', result?.error);
      }
    } catch (error) {
      console.error('Error performing ComfyUI action:', error);
    } finally {
      setComfyuiLoading(false);
    }
  };

  // Llama-swap service management functions
  const fetchLlamaSwapStatus = async () => {
    try {
      const llamaSwap = (window as any).llamaSwap;
      if (llamaSwap?.getStatusWithHealth) {
        const status = await llamaSwap.getStatusWithHealth();
        console.log('LLM Service Status (with health check):', status);
        setLlamaSwapStatus(status);
        
        // If running, fetch models
        if (status.isRunning && llamaSwap?.getModels) {
          const models = await llamaSwap.getModels();
          setLlamaSwapModels(models);
        }
      } else if (llamaSwap?.getStatus) {
        // Fallback to basic status
        const status = await llamaSwap.getStatus();
        console.log('LLM Service Status (basic):', status);
        setLlamaSwapStatus(status);
        
        // If running, fetch models
        if (status.isRunning && llamaSwap?.getModels) {
          const models = await llamaSwap.getModels();
          setLlamaSwapModels(models);
        }
      }
    } catch (error) {
      console.error('Error fetching llama-swap status:', error);
    }
  };

  const handleLlamaSwapAction = async (action: 'start' | 'stop' | 'restart') => {
    setLlamaSwapLoading(true);
    try {
      const llamaSwap = (window as any).llamaSwap;
      let result;
      if (action === 'start' && llamaSwap?.start) {
        result = await llamaSwap.start();
      } else if (action === 'stop' && llamaSwap?.stop) {
        result = await llamaSwap.stop();
      } else if (action === 'restart' && llamaSwap?.restart) {
        result = await llamaSwap.restart();
      }
      
      if (result?.success) {
        await fetchLlamaSwapStatus();
      } else {
        console.error('Llama-swap action failed:', result?.error);
      }
    } catch (error) {
      console.error('Error performing llama-swap action:', error);
    } finally {
      setLlamaSwapLoading(false);
    }
  };

  const regenerateLlamaSwapConfig = async () => {
    setLlamaSwapLoading(true);
    try {
      const llamaSwap = (window as any).llamaSwap;
      if (llamaSwap?.regenerateConfig) {
        const result = await llamaSwap.regenerateConfig();
        if (result.success) {
          console.log(`Config regenerated with ${result.models} models`);
          await fetchLlamaSwapStatus();
        }
      }
    } catch (error) {
      console.error('Error regenerating llama-swap config:', error);
    } finally {
      setLlamaSwapLoading(false);
    }
  };

  // Docker service control functions with better error handling
  const handleDockerServiceAction = async (service: string, action: 'start' | 'stop' | 'restart') => {
    const loadingKey = `${service}-${action}`;
    setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      console.log(`Attempting to ${action} ${service} service...`);
      const electronAPI = (window as any).electronAPI;
      
      if (!electronAPI) {
        console.error('electronAPI not available');
        alert(`❌ Docker service control not available. electronAPI not found.`);
        return;
      }

      // Get all containers to find the specific service container
      const containers = await electronAPI.getContainers();
      console.log('Available containers:', containers);
      
      // Map service names to container names
      const containerNameMap: { [key: string]: string } = {
        'python': 'angela_python',
        'n8n': 'angela_n8n'
      };
      
      const containerName = containerNameMap[service];
      if (!containerName) {
        console.error(`Unknown service: ${service}`);
        alert(`❌ Unknown service: ${service}`);
        return;
      }
      
      // Find the container by name
      const container = containers.find((c: Container) => c.name === containerName || c.name === `/${containerName}`);
      if (!container) {
        console.error(`Container not found for service ${service} (looking for ${containerName})`);
        alert(`❌ Container not found for service ${service}. Make sure Docker is running and containers are created.`);
        return;
      }
      
      console.log(`Found container for ${service}:`, container);
      console.log(`Calling containerAction(${container.id}, ${action})...`);
      
      // Perform the action
      const result = await electronAPI.containerAction(container.id, action);
      console.log(`${action} ${service} result:`, result);
      
      if (result.success) {
        console.log(`Successfully ${action}ed ${service} service`);
        
        // Set expected service state based on action
        let expectedState: boolean;
        if (action === 'start') {
          expectedState = true; // Expect service to be running
        } else if (action === 'stop') {
          expectedState = false; // Expect service to be stopped
        } else { // restart
          expectedState = true; // Expect service to be running after restart
        }
        
        expectedServiceStatesRef.current = { ...expectedServiceStatesRef.current, [service]: expectedState };
        
        // Force an immediate status check
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
        console.error(`Failed to ${action} ${service}:`, result.error);
        alert(`❌ Failed to ${action} ${service}: ${result.error || 'Unknown error'}`);
        // Clear loading immediately on failure
        setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: false }));
        return;
      }
      
    } catch (error) {
      console.error(`Failed to ${action} ${service}:`, error);
      alert(`❌ Failed to ${action} ${service}: ${error}`);
      // Clear loading immediately on error
      setDockerServiceLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
    // Note: We don't clear loading in finally anymore - let useEffect handle it when state changes
  };

  return (
    <div className="space-y-6">
      {/* Docker Services Status */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Server className="w-6 h-6 text-blue-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Local Services
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Monitor and control your local development services
            </p>
          </div>
        </div>

        {/* Docker Services Status */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${dockerServices.dockerAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
            Docker Services
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Docker Status */}
            <div className={`p-4 rounded-lg border ${dockerServices.dockerAvailable 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dockerServices.dockerAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <h4 className="font-medium text-gray-900 dark:text-white">Docker</h4>
              </div>
              <p className={`text-sm ${dockerServices.dockerAvailable 
                ? 'text-green-700 dark:text-green-300' 
                : 'text-red-700 dark:text-red-300'
              }`}>
                {dockerServices.dockerAvailable ? 'Available' : 'Not Available'}
              </p>
            </div>

            {/* N8N Status */}
            <div className={`p-4 rounded-lg border ${dockerServices.n8nAvailable 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dockerServices.n8nAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <h4 className="font-medium text-gray-900 dark:text-white">n8n Workflows</h4>
              </div>
              <p className={`text-sm ${dockerServices.n8nAvailable 
                ? 'text-green-700 dark:text-green-300' 
                : 'text-gray-600 dark:text-gray-400'
              }`}>
                {dockerServices.n8nAvailable ? 'Running' : 'Stopped'}
              </p>
              {dockerServices.ports?.n8n && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Port: {dockerServices.ports.n8n}
                </p>
              )}
            </div>

            {/* Python API Status */}
            <div className={`p-4 rounded-lg border ${dockerServices.pythonAvailable 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dockerServices.pythonAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <h4 className="font-medium text-gray-900 dark:text-white">Python API</h4>
              </div>
              <p className={`text-sm ${dockerServices.pythonAvailable 
                ? 'text-green-700 dark:text-green-300' 
                : 'text-gray-600 dark:text-gray-400'
              }`}>
                {dockerServices.pythonAvailable ? 'Running' : 'Stopped'}
              </p>
              {dockerServices.ports?.python && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Port: {dockerServices.ports.python}
                </p>
              )}
            </div>
          </div>

          {dockerServices.message && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {dockerServices.message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Service Actions */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wrench className="w-6 h-6 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Docker Service Controls
          </h3>
        </div>
        
        {!dockerServices.dockerAvailable ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h4 className="font-medium text-red-800 dark:text-red-200">
                Docker Not Available
              </h4>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              Docker is not installed or not running. Please install Docker Desktop to manage angela's services.
            </p>
            <button
              onClick={() => window.open('https://docs.docker.com/desktop/', '_blank')}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Install Docker Desktop
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Docker Service Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* n8n Workflow Service */}
              <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dockerServices.n8nAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      n8n Workflows
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Automation and workflow engine
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    dockerServices.n8nAvailable 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {dockerServices.n8nAvailable ? 'Running' : 'Stopped'}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  {dockerServices.n8nAvailable ? (
                    <>
                      <button
                        onClick={() => handleDockerServiceAction('n8n', 'stop')}
                        disabled={dockerServiceLoading['n8n-stop']}
                        className="px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        {dockerServiceLoading['n8n-stop'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {dockerServiceLoading['n8n-stop'] ? 'Stopping...' : 'Stop'}
                      </button>
                      <button
                        onClick={() => handleDockerServiceAction('n8n', 'restart')}
                        disabled={dockerServiceLoading['n8n-restart']}
                        className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        {dockerServiceLoading['n8n-restart'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {dockerServiceLoading['n8n-restart'] ? 'Restarting...' : 'Restart'}
                      </button>
                      {dockerServices.ports?.n8n && (
                        <button
                          onClick={() => window.open(`http://localhost:${dockerServices.ports!.n8n}`, '_blank')}
                          className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleDockerServiceAction('n8n', 'start')}
                      disabled={dockerServiceLoading['n8n-start']}
                      className="px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {dockerServiceLoading['n8n-start'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {dockerServiceLoading['n8n-start'] ? 'Starting...' : 'Start'}
                    </button>
                  )}
                </div>
              </div>

              {/* Python API Service */}
              <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dockerServices.pythonAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      Python API
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Custom Python processing API
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    dockerServices.pythonAvailable 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {dockerServices.pythonAvailable ? 'Running' : 'Stopped'}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  {dockerServices.pythonAvailable ? (
                    <>
                      <button
                        onClick={() => handleDockerServiceAction('python', 'stop')}
                        disabled={dockerServiceLoading['python-stop']}
                        className="px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        {dockerServiceLoading['python-stop'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {dockerServiceLoading['python-stop'] ? 'Stopping...' : 'Stop'}
                      </button>
                      <button
                        onClick={() => handleDockerServiceAction('python', 'restart')}
                        disabled={dockerServiceLoading['python-restart']}
                        className="px-3 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        {dockerServiceLoading['python-restart'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {dockerServiceLoading['python-restart'] ? 'Restarting...' : 'Restart'}
                      </button>
                      {dockerServices.ports?.python && (
                        <button
                          onClick={() => window.open(`http://localhost:${dockerServices.ports!.python}/docs`, '_blank')}
                          className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          API Docs
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleDockerServiceAction('python', 'start')}
                      disabled={dockerServiceLoading['python-start']}
                      className="px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {dockerServiceLoading['python-start'] && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {dockerServiceLoading['python-start'] ? 'Starting...' : 'Start'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

             {/* LLM Service (Llama-swap) */}
             <div className="glassmorphic rounded-xl p-6">
         <div className="flex items-center gap-3 mb-6">
           <Server className="w-6 h-6 text-purple-500" />
           <div>
             <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
               LLM Service (Llama-swap)
             </h3>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Local AI model inference service for angela
             </p>
           </div>
         </div>

         {/* Service Status */}
         <div className="mb-6">
           <div className="flex justify-between items-center mb-4">
             <h4 className="font-medium text-gray-900 dark:text-white">Service Status</h4>
             <div className="flex gap-2">
               {llamaSwapStatus.isRunning ? (
                 <>
                   <button
                     onClick={() => handleLlamaSwapAction('stop')}
                     disabled={llamaSwapLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     {llamaSwapLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                     {llamaSwapLoading ? 'Stopping...' : 'Stop'}
                   </button>
                   <button
                     onClick={() => handleLlamaSwapAction('restart')}
                     disabled={llamaSwapLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     <RefreshCw className={`w-3 h-3 ${llamaSwapLoading ? 'animate-spin' : ''}`} />
                     {llamaSwapLoading ? 'Restarting...' : 'Restart'}
                   </button>
                   <button 
                     onClick={() => window.open('https://github.com/mostlygeek/llama-swap', '_blank')} 
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                   >
                     <ExternalLink className="w-3 h-3" />
                     Docs
                   </button>
                 </>
               ) : (
                 <>
                   <button
                     onClick={() => handleLlamaSwapAction('start')}
                     disabled={llamaSwapLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     {llamaSwapLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                     {llamaSwapLoading ? 'Starting...' : 'Start'}
                   </button>
                   <button 
                     onClick={() => window.open('https://github.com/mostlygeek/llama-swap', '_blank')} 
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                   >
                     <ExternalLink className="w-3 h-3" />
                     Docs
                   </button>
                 </>
               )}
               <button
                 onClick={regenerateLlamaSwapConfig}
                 disabled={llamaSwapLoading}
                 className="hidden items-center gap-1 px-3 py-1.5 rounded text-sm bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                 <RefreshCw className={`w-3 h-3 ${llamaSwapLoading ? 'animate-spin' : ''}`} />
                 {llamaSwapLoading ? 'Regenerating...' : 'Regenerate Config'}
               </button>
             </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
               <h5 className="text-purple-500 dark:text-purple-400 mb-2">Status</h5>
               <div className="flex items-center gap-2">
                 <div className={`w-3 h-3 rounded-full ${llamaSwapStatus.isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className="text-gray-800 dark:text-gray-100">
                   {llamaSwapStatus.isRunning ? 'Running' : 'Stopped'}
                 </span>
               </div>
             </div>
             <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
               <h5 className="text-purple-500 dark:text-purple-400 mb-2">Port</h5>
               <p className="text-gray-800 dark:text-gray-100">{llamaSwapStatus.port || 'N/A'}</p>
             </div>
             <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
               <h5 className="text-purple-500 dark:text-purple-400 mb-2">API URL</h5>
               <p className="text-gray-800 dark:text-gray-100 font-mono text-sm">
                 {llamaSwapStatus.apiUrl || 'N/A'}
               </p>
             </div>
           </div>

           {/* Available Models */}
           <div className="mt-6">
             <div className="flex justify-between items-center mb-4">
               <h5 className="font-medium text-gray-900 dark:text-white">Available Models</h5>
               <button
                 onClick={fetchLlamaSwapStatus}
                 disabled={llamaSwapLoading}
                 className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                 <RefreshCw className={`w-3 h-3 ${llamaSwapLoading ? 'animate-spin' : ''}`} />
                 {llamaSwapLoading ? 'Refreshing...' : 'Refresh'}
               </button>
             </div>

             {llamaSwapModels.length > 0 ? (
               <div className="overflow-x-auto">
                 <table className="min-w-full">
                   <thead className="bg-purple-50 dark:bg-gray-800/80">
                     <tr>
                       <th className="px-4 py-2 text-left text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wider">Model ID</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wider">Object</th>
                       <th className="px-4 py-2 text-left text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wider">Created</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-purple-100 dark:divide-purple-800/30">
                     {llamaSwapModels.map((model, index) => (
                       <tr key={index} className="hover:bg-purple-50 dark:hover:bg-gray-700/60 transition-colors">
                         <td className="px-4 py-2 text-gray-800 dark:text-gray-200 font-mono text-sm">{model.id}</td>
                         <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{model.object}</td>
                         <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                           {model.created ? new Date(model.created * 1000).toLocaleString() : 'N/A'}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : (
               <div className="text-center py-8">
                 <p className="text-gray-500 dark:text-gray-400">
                   {llamaSwapStatus.isRunning ? 'No models available' : 'Service not running'}
                 </p>
               </div>
             )}
           </div>
         </div>
       </div>

       {/* AI Services (N8N and ComfyUI) */}
       <div className="glassmorphic rounded-xl p-6">
         <div className="flex items-center gap-3 mb-6">
           <Server className="w-6 h-6 text-emerald-500" />
           <div>
             <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
               AI Services
             </h3>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               N8N workflows and ComfyUI image generation services
             </p>
           </div>
           <button
             onClick={() => {
               fetchN8nStatus();
               fetchComfyuiStatus();
             }}
             className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
           >
             <RefreshCw className="w-3 h-3" />
             Refresh
           </button>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {/* N8N Workflow Service */}
           <div className="bg-white/50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
             <div className="flex items-center gap-3 mb-4">
               <Zap className="w-6 h-6 text-blue-500" />
               <div>
                 <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                   N8N Workflows
                 </h4>
                 <p className="text-sm text-gray-600 dark:text-gray-400">
                   Visual workflow automation platform
                 </p>
               </div>
             </div>

             {/* Status Grid */}
             <div className="grid grid-cols-2 gap-4 mb-4">
               <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                 <h5 className="text-blue-500 dark:text-blue-400 mb-1 text-sm">Status</h5>
                 <div className="flex items-center gap-2">
                   <div className={`w-3 h-3 rounded-full ${
                     n8nLoading 
                       ? 'bg-yellow-500 animate-pulse' 
                       : n8nStatus.running 
                         ? 'bg-green-500' 
                         : 'bg-red-500'
                   }`}></div>
                   <span className="text-gray-800 dark:text-gray-100 text-sm">
                     {n8nLoading 
                       ? 'Starting...' 
                       : n8nStatus.running 
                         ? 'Running' 
                         : 'Stopped'}
                   </span>
                 </div>
               </div>
               <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                 <h5 className="text-blue-500 dark:text-blue-400 mb-1 text-sm">Service URL</h5>
                 <p className="text-gray-800 dark:text-gray-100 font-mono text-xs">
                   {n8nStatus.serviceUrl || 'N/A'}
                 </p>
               </div>
             </div>

             {/* Control Buttons */}
             <div className="flex gap-2">
               {n8nStatus.running ? (
                 <>
                   <button
                     onClick={() => handleN8nAction('stop')}
                     disabled={n8nLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     {n8nLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                     {n8nLoading ? 'Stopping...' : 'Stop'}
                   </button>
                   <button
                     onClick={() => handleN8nAction('restart')}
                     disabled={n8nLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     <RefreshCw className={`w-3 h-3 ${n8nLoading ? 'animate-spin' : ''}`} />
                     {n8nLoading ? 'Restarting...' : 'Restart'}
                   </button>
                   <button
                     onClick={() => window.open(n8nStatus.serviceUrl || 'http://localhost:5678', '_blank')}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                   >
                     <ExternalLink className="w-3 h-3" />
                     Open
                   </button>
                 </>
               ) : (
                 <button
                   onClick={() => handleN8nAction('start')}
                   disabled={n8nLoading}
                   className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                   {n8nLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                   {n8nLoading ? 'Starting...' : 'Start'}
                 </button>
               )}
             </div>

             {n8nStatus.error && (
               <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                 {n8nStatus.error}
               </div>
             )}
           </div>

           {/* ComfyUI Image Generation Service */}
           <div className="bg-white/50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
             <div className="flex items-center gap-3 mb-4">
               <Image className="w-6 h-6 text-purple-500" />
               <div>
                 <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                   ComfyUI Image Generation
                 </h4>
                 <p className="text-sm text-gray-600 dark:text-gray-400">
                   AI image generation with Stable Diffusion
                 </p>
               </div>
             </div>

             {/* Status Grid */}
             <div className="grid grid-cols-2 gap-4 mb-4">
               <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                 <h5 className="text-purple-500 dark:text-purple-400 mb-1 text-sm">Status</h5>
                 <div className="flex items-center gap-2">
                   <div className={`w-3 h-3 rounded-full ${
                     comfyuiLoading 
                       ? 'bg-yellow-500 animate-pulse' 
                       : comfyuiStatus.running 
                         ? 'bg-green-500' 
                         : 'bg-red-500'
                   }`}></div>
                   <span className="text-gray-800 dark:text-gray-100 text-sm">
                     {comfyuiLoading 
                       ? 'Starting...' 
                       : comfyuiStatus.running 
                         ? 'Running' 
                         : 'Stopped'}
                   </span>
                 </div>
                 {comfyuiLoading && (
                   <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                     ComfyUI may take 30-60 seconds to fully start
                   </p>
                 )}
               </div>
               <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                 <h5 className="text-purple-500 dark:text-purple-400 mb-1 text-sm">Service URL</h5>
                 <p className="text-gray-800 dark:text-gray-100 font-mono text-xs">
                   {comfyuiStatus.serviceUrl || 'N/A'}
                 </p>
               </div>
             </div>

             {/* Control Buttons */}
             <div className="flex gap-2">
               {comfyuiStatus.running ? (
                 <>
                   <button
                     onClick={() => handleComfyuiAction('stop')}
                     disabled={comfyuiLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     {comfyuiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                     {comfyuiLoading ? 'Stopping...' : 'Stop'}
                   </button>
                   <button
                     onClick={() => handleComfyuiAction('restart')}
                     disabled={comfyuiLoading}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                     <RefreshCw className={`w-3 h-3 ${comfyuiLoading ? 'animate-spin' : ''}`} />
                     {comfyuiLoading ? 'Restarting...' : 'Restart'}
                   </button>
                   <button
                     onClick={() => window.open(comfyuiStatus.serviceUrl || 'http://localhost:8188', '_blank')}
                     className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-purple-500 text-white hover:bg-purple-600 transition-colors"
                   >
                     <ExternalLink className="w-3 h-3" />
                     Open
                   </button>
                 </>
               ) : (
                 <button
                   onClick={() => handleComfyuiAction('start')}
                   disabled={comfyuiLoading}
                   className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                   {comfyuiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                   {comfyuiLoading ? 'Starting...' : 'Start'}
                 </button>
               )}
             </div>

             {comfyuiStatus.error && (
               <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                 {comfyuiStatus.error}
               </div>
             )}
           </div>
         </div>
       </div>
    </div>
  );
};

export default ServicesTab; 
