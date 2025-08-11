import { useState, useEffect } from 'react';
import { Home, Bot, Settings, HelpCircle, ImageIcon, Network, BrainCircuit, Download, X, Zap, Code2, BookOpen } from 'lucide-react';
import logo from '../assets/logo.png';

// interface HuggingFaceModel {
//   id: string;
//   name: string;
//   downloads: number;
//   likes: number;
//   tags: string[];
//   description: string;
//   author: string;
//   files: Array<{ rfilename: string; size?: number }>;
// }

// interface LocalModel {
//   name: string;
//   file: string;
//   path: string;
//   size: number;
//   source: string;
//   lastModified: Date;
// }

interface SidebarProps {
  activePage: string;
  onPageChange: (page: string) => void;
  alphaFeaturesEnabled?: boolean;
}

interface DownloadProgress {
  fileName: string;
  progress: number;
  downloadedSize: number;
  totalSize: number;
}

// Add interface for enhanced service status (matching Settings.tsx)
interface EnhancedServiceStatus {
  [serviceName: string]: {
    state: 'running' | 'stopped' | 'starting' | 'error';
    deploymentMode: 'docker' | 'manual' | 'native';
    restartAttempts: number;
    lastHealthCheck: number | null;
    uptime: number;
    serviceUrl: string | null;
    isManual: boolean;
    canRestart: boolean;
    supportedModes: string[];
  };
}

// Add interface for feature configuration
interface FeatureConfig {
  comfyUI: boolean;
  n8n: boolean;
  ragAndTts: boolean;
  claraCore: boolean;
}

interface MenuItem {
  icon: any;
  label: string;
  id: string;
  disabled?: boolean;
}

const Sidebar = ({ activePage = 'dashboard', onPageChange, alphaFeaturesEnabled = false }: SidebarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgress>>({});
  const [claraBackgroundActivity, setClaraBackgroundActivity] = useState(false);
  const [enhancedServiceStatus, setEnhancedServiceStatus] = useState<EnhancedServiceStatus>({});
  const [featureConfig, setFeatureConfig] = useState<FeatureConfig>({
    comfyUI: true,
    n8n: true,
    ragAndTts: true,
    claraCore: true
  });

  // Load feature configuration on mount
  useEffect(() => {
    const loadFeatureConfig = async () => {
      try {
        if ((window as any).featureConfig?.getFeatureConfig) {
          const config = await (window as any).featureConfig.getFeatureConfig();
          console.log('🔍 Sidebar - Feature config:', config);
          if (config) {
            setFeatureConfig(config);
          }
        }
      } catch (error) {
        console.error('Failed to load feature configuration:', error);
      }
    };

    loadFeatureConfig();

    // Listen for feature configuration updates
    const handleFeatureConfigUpdate = () => {
      console.log('🔄 Sidebar - Feature config update event received, reloading...');
      loadFeatureConfig();
    };

    window.addEventListener('feature-config-updated', handleFeatureConfigUpdate);
    return () => window.removeEventListener('feature-config-updated', handleFeatureConfigUpdate);
  }, []);

  // Listen for Clara background activity changes
  useEffect(() => {
    const handleClaraActivity = (event: CustomEvent) => {
      setClaraBackgroundActivity(event.detail.active);
    };

    window.addEventListener('clara-background-activity', handleClaraActivity as EventListener);
    return () => window.removeEventListener('clara-background-activity', handleClaraActivity as EventListener);
  }, []);

  // Listen for real-time service status changes
  useEffect(() => {
    const handleServiceStatusUpdate = (event: any) => {
      const { serviceName, status, error } = event.detail || {};
      
      if (serviceName && status) {
        console.log(`🔍 Sidebar - Real-time status update: ${serviceName} -> ${status}`, error ? `Error: ${error}` : '');
        
        setEnhancedServiceStatus(prev => ({
          ...prev,
          [serviceName]: {
            ...prev[serviceName],
            state: status === 'running' ? 'running' : 
                   status === 'starting' ? 'starting' :
                   status === 'error' || error ? 'error' : 'stopped',
            lastHealthCheck: Date.now()
          }
        }));
      }
    };

    // Listen for background service status events
    window.addEventListener('background-service-status', handleServiceStatusUpdate);
    window.addEventListener('service-status-update', handleServiceStatusUpdate);
    
    return () => {
      window.removeEventListener('background-service-status', handleServiceStatusUpdate);
      window.removeEventListener('service-status-update', handleServiceStatusUpdate);
    };
  }, []);

  // Enhanced service status monitoring with watchdog integration
  useEffect(() => {
    const loadServiceStatus = async () => {
      try {
        if ((window as any).electronAPI?.invoke) {
          // First get enhanced status from service config
          const enhancedStatus = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
          
          // Then get real-time status from watchdog service
          const watchdogResult = await (window as any).electronAPI.invoke('watchdog-get-services-status');
          
          if (watchdogResult?.success && watchdogResult?.services) {
            // Merge watchdog status with enhanced status for complete picture
            const mergedStatus = { ...enhancedStatus };
            
            Object.entries(watchdogResult.services).forEach(([serviceName, watchdogData]: [string, any]) => {
              if (mergedStatus[serviceName]) {
                mergedStatus[serviceName] = {
                  ...mergedStatus[serviceName],
                  state: watchdogData.isHealthy ? 'running' : 'stopped',
                  lastHealthCheck: watchdogData.lastCheck || Date.now(),
                  uptime: watchdogData.uptime || 0
                };
              }
            });
            
            console.log('🔍 Sidebar - Merged service status (enhanced + watchdog):', mergedStatus);
            console.log('🔍 Sidebar - LlamaSwap specific status:', mergedStatus.llamaswap);
            setEnhancedServiceStatus(mergedStatus);
          } else {
            // Fallback to enhanced status only
            console.log('🔍 Sidebar - Enhanced service status only:', enhancedStatus);
            setEnhancedServiceStatus(enhancedStatus || {});
          }
        }
      } catch (error) {
        console.error('Failed to load service status:', error);
        setEnhancedServiceStatus({});
      }
    };

    loadServiceStatus();
    
    // Set up periodic health checking every 30 seconds
    const healthCheckInterval = setInterval(() => {
      console.log('🔄 Sidebar - Periodic health check refresh');
      loadServiceStatus();
    }, 30000);

    // Also attempt direct health checks for critical services
    const performDirectHealthChecks = async () => {
      const servicesToCheck = [
        { name: 'comfyui', url: 'http://localhost:8188/' },
        { name: 'n8n', url: 'http://localhost:5678/' },
        { name: 'python-backend', url: 'http://localhost:5001/health' }
      ];

      for (const service of servicesToCheck) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(service.url, { 
            method: 'GET',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            console.log(`✅ Direct health check: ${service.name} is responding (${response.status})`);
            // Update the status to reflect the service is actually running
            setEnhancedServiceStatus(prev => ({
              ...prev,
              [service.name]: {
                ...prev[service.name],
                state: 'running',
                lastHealthCheck: Date.now()
              }
            }));
          }
        } catch (error) {
          console.log(`❌ Direct health check: ${service.name} is not responding:`, error);
        }
      }
    };

    // Run direct health checks initially and then every 60 seconds
    performDirectHealthChecks();
    const directHealthCheckInterval = setInterval(performDirectHealthChecks, 60000);

    return () => {
      clearInterval(healthCheckInterval);
      clearInterval(directHealthCheckInterval);
    };
  }, []);

  // Listen for download progress updates
  useEffect(() => {
    if (window.modelManager?.onDownloadProgress) {
      const unsubscribe = window.modelManager.onDownloadProgress((progress: DownloadProgress) => {
        setActiveDownloads(prev => ({
          ...prev,
          [progress.fileName]: progress
        }));
        
        // Remove completed downloads after 3 seconds
        if (progress.progress >= 100) {
          setTimeout(() => {
            setActiveDownloads(prev => {
              const updated = { ...prev };
              delete updated[progress.fileName];
              return updated;
            });
          }, 3000);
        }
      });
      
      return unsubscribe;
    }
  }, []);

  const stopDownload = async (fileName: string) => {
    if (window.modelManager?.stopDownload) {
      try {
        await window.modelManager.stopDownload(fileName);
        // Remove from active downloads
        setActiveDownloads(prev => {
          const updated = { ...prev };
          delete updated[fileName];
          return updated;
        });
      } catch (error) {
        console.error('Error stopping download:', error);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate average progress for the circular indicator
  const downloadCount = Object.keys(activeDownloads).length;
  const averageProgress = downloadCount > 0 
    ? Object.values(activeDownloads).reduce((sum, download) => sum + download.progress, 0) / downloadCount 
    : 0;

  // SVG Circle component for progress indicator
  const CircularProgress = ({ progress, size = 32 }: { progress: number; size?: number }) => {
    const radius = (size - 4) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 absolute inset-0" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="transparent"
            className="text-gray-300 dark:text-gray-600"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="text-sakura-500 transition-all duration-300 ease-in-out"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {downloadCount}
          </span>
        </div>
      </div>
    );
  };

  // Enhanced helper function to check if service is responding
  const isServiceResponding = (serviceName: string): boolean => {
    const serviceStatus = enhancedServiceStatus[serviceName];
    
    // Check multiple indicators of service health
    const isStateRunning = serviceStatus?.state === 'running';
    const hasRecentHealthCheck = serviceStatus?.lastHealthCheck && 
      (Date.now() - serviceStatus.lastHealthCheck < 120000); // Within last 2 minutes (more lenient)
    
    // For debugging, show what we're checking
    // if (serviceName === 'comfyui' || serviceName === 'n8n') {
    //   console.log(`🔍 Service ${serviceName} health check:`, {
    //     state: serviceStatus?.state,
    //     lastHealthCheck: serviceStatus?.lastHealthCheck,
    //     timeSinceLastCheck: serviceStatus?.lastHealthCheck ? Date.now() - serviceStatus.lastHealthCheck : 'never',
    //     hasRecentHealthCheck: Boolean(hasRecentHealthCheck),
    //     isStateRunning,
    //     shouldShow: isStateRunning || Boolean(hasRecentHealthCheck)
    //   });
    // }
    
    // Service is considered responding if either:
    // 1. State is explicitly 'running', OR
    // 2. We have a recent successful health check (within 2 minutes)
    return isStateRunning || Boolean(hasRecentHealthCheck);
  };

  const mainMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', id: 'dashboard' },
    { icon: Bot, label: 'Chat', id: 'clara' },
    { icon: BrainCircuit, label: 'Agents', id: 'agents' },
    { icon: BookOpen, label: 'Notebooks', id: 'notebooks' },
    ...(alphaFeaturesEnabled ? [{ icon: Zap, label: 'Lumaui (Alpha)', id: 'lumaui' }] : []),
    { icon: Code2, label: 'LumaUI (Beta)', id: 'lumaui-lite' },
    // Show Image Gen if ComfyUI feature is enabled OR if ComfyUI service is running
    ...(featureConfig.comfyUI || isServiceResponding('comfyui') ? [{
      icon: ImageIcon, 
      label: 'Image Gen', 
      id: 'image-gen'
    }] : []),
    // Show n8n if feature is enabled OR if n8n service is running
    ...(featureConfig.n8n || isServiceResponding('n8n') ? [{
      icon: Network, 
      label: 'Workflows', 
      id: 'n8n'
    }] : [])
  ];

  // Enhanced debug logging for service visibility
  // console.log('🔍 Sidebar Service Debug:', {
  //   'featureConfig': featureConfig,
  //   'enhancedServiceStatus': enhancedServiceStatus,
  //   'comfyui enabled': featureConfig.comfyUI,
  //   'comfyui responding': isServiceResponding('comfyui'),
  //   'comfyui should show': featureConfig.comfyUI || isServiceResponding('comfyui'),
  //   'n8n enabled': featureConfig.n8n,
  //   'n8n responding': isServiceResponding('n8n'),
  //   'n8n should show': featureConfig.n8n || isServiceResponding('n8n'),
  //   'final menu items': mainMenuItems.map(item => ({ id: item.id, label: item.label }))
  // });

  const bottomMenuItems: MenuItem[] = [
    { icon: Settings, label: 'Settings', id: 'settings' },
    { icon: HelpCircle, label: 'Help', id: 'help' },
  ];

  return (
    <div
      className={`glassmorphic h-full flex flex-col gap-6 transition-all duration-300 ease-in-out z-[10000] ${
        isExpanded ? 'w-64' : 'w-20'
      }`}
      style={{ minWidth: isExpanded ? '16rem' : '5rem', maxWidth: isExpanded ? '16rem' : '5rem' }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={`flex items-center py-4 ${
        isExpanded ? 'px-4 justify-start gap-3' : 'justify-center'
      }`}>
        <button
          onClick={() => onPageChange('dashboard')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <img src={logo} alt="Clara Logo" className="w-8 h-8 flex-shrink-0" />
          <h1 
            className={`text-2xl font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
            }`}
          >
            Clara
          </h1>
        </button>
      </div>

      <nav className="flex-1 flex flex-col justify-between">
        <ul className="space-y-2 px-2">
          {mainMenuItems.map((item) => (
            <li key={item.id}>
              <button 
                onClick={() => onPageChange(item.id)}
                data-page={item.id}
                className={`w-full flex items-center rounded-lg transition-colors h-10 relative ${
                  isExpanded ? 'px-4 justify-start gap-3' : 'justify-center px-0'
                } ${
                  activePage === item.id
                    ? 'bg-sakura-100 text-sakura-500 dark:bg-sakura-100/10'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-sakura-50 hover:text-sakura-500 dark:hover:bg-sakura-100/10'
                }`}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {/* Background activity indicator for Clara */}
                  {item.id === 'clara' && claraBackgroundActivity && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  )}
                  {/* Simple ping indicators for n8n and image-gen when responding */}
                  {(item.id === 'n8n' || item.id === 'image-gen') && isServiceResponding(item.id === 'n8n' ? 'n8n' : 'comfyui') && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
                  )}
                </div>
                <span 
                  className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                    isExpanded ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0'
                  }`}
                >
                  {item.label}
                  {/* Background activity text indicator when expanded */}
                  {item.id === 'clara' && claraBackgroundActivity && isExpanded && (
                    <span className="ml-2 text-xs text-green-500 font-medium">●</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        
        <div className="flex flex-col">
          {/* Download Progress Indicator - positioned above bottom menu */}
          {downloadCount > 0 && (
            <div className="px-2 mb-4">
              {isExpanded ? (
                // Expanded view - full details with individual file progress
                <div className="glassmorphic p-3 rounded-lg max-h-64 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <Download className="w-4 h-4 text-sakura-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Downloading {downloadCount} file{downloadCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.values(activeDownloads).map((download) => (
                      <div key={download.fileName} className="bg-white/20 dark:bg-gray-800/20 rounded p-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1 mr-2">
                            {download.fileName}
                          </div>
                          <button
                            onClick={() => stopDownload(download.fileName)}
                            className="text-red-500 hover:text-red-700 transition-colors"
                            title="Stop download"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1">
                          <div 
                            className="bg-sakura-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${download.progress}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                          <span>{download.progress.toFixed(1)}%</span>
                          <span>
                            {formatFileSize(download.downloadedSize)} / {formatFileSize(download.totalSize)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Collapsed view - circular progress with file count
                <div className="glassmorphic p-2 rounded-lg flex items-center justify-center">
                  <CircularProgress progress={averageProgress} size={32} />
                </div>
              )}
            </div>
          )}

          <ul className="space-y-2 px-2 mb-4">
            {bottomMenuItems.map((item) => (
              <li key={item.id}>
                <button 
                  onClick={() => onPageChange(item.id)}
                  data-page={item.id}
                  className={`w-full flex items-center rounded-lg transition-colors h-10 ${
                    isExpanded ? 'px-4 justify-start gap-3' : 'justify-center px-0'
                  } ${
                    activePage === item.id
                      ? 'bg-sakura-100 text-sakura-500 dark:bg-sakura-100/10'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-sakura-50 hover:text-sakura-500 dark:hover:bg-sakura-100/10'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span 
                    className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                      isExpanded ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;