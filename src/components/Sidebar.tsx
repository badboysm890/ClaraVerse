import { useState, useEffect } from 'react';
import { Home, Bot, Settings, HelpCircle, ImageIcon, Network, BrainCircuit, Download, X, Zap, Code2, BookOpen, DollarSign, BarChartBig } from 'lucide-react'; // Added BarChartBig
import logoFallback from '../assets/logo.png'; // Renamed for clarity
import brandService from '../../services/brandService'; // Added

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

// Add interface for Docker services status
interface DockerServicesStatus {
  dockerAvailable: boolean;
  n8nAvailable: boolean;
  pythonAvailable: boolean;
  comfyuiAvailable: boolean;
  message?: string;
  ports?: {
    python: number;
    n8n: number;
    ollama: number;
    comfyui: number;
  };
}

interface MenuItem {
  icon: any;
  label: string;
  id: string;
  disabled?: boolean;
  status?: 'ready' | 'starting';
}

const Sidebar = ({ activePage = 'dashboard', onPageChange, alphaFeaturesEnabled = false }: SidebarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgress>>({});
  const [claraBackgroundActivity, setClaraBackgroundActivity] = useState(false);
  const [dockerServices, setDockerServices] = useState<DockerServicesStatus>({
    dockerAvailable: false,
    n8nAvailable: false,
    pythonAvailable: false,
    comfyuiAvailable: false
  });

  // Updated to use new service methods
  const brandName = brandService.getBrandName() || 'Clara';
  const tagline = brandService.getTagline();
  const logoPath = brandService.getBrandAsset('logoPath') || logoFallback;
  const showAdvancedAnalytics = brandService.getFeatureFlag('enableAdvancedAnalytics');


  // Listen for Clara background activity changes
  useEffect(() => {
    const handleClaraActivity = (event: CustomEvent) => {
      setClaraBackgroundActivity(event.detail.active);
    };

    window.addEventListener('clara-background-activity', handleClaraActivity as EventListener);
    return () => window.removeEventListener('clara-background-activity', handleClaraActivity as EventListener);
  }, []);

  // Check Docker services status
  useEffect(() => {
    const checkDockerServices = async () => {
      try {
        // Check general Docker services
        if ((window.electron as any)?.checkDockerServices) {
          const status = await (window.electron as any).checkDockerServices();
          
          // Check ComfyUI status specifically
          let comfyuiAvailable = false;
          if (window.electronAPI?.getServicesStatus) {
            try {
              const servicesStatus = await window.electronAPI.getServicesStatus();
              if (servicesStatus.services?.comfyui) {
                // Allow both 'healthy' and 'unknown' as available
                comfyuiAvailable = ['healthy', 'unknown'].includes(servicesStatus.services.comfyui.status);
              }
            } catch (error) {
              console.error('Failed to check ComfyUI status:', error);
            }
          }
          
          setDockerServices({
            ...status,
            comfyuiAvailable
          });
        }
      } catch (error) {
        console.error('Failed to check Docker services:', error);
        setDockerServices({
          dockerAvailable: false,
          n8nAvailable: false,
          pythonAvailable: false,
          comfyuiAvailable: false,
          message: 'Failed to check Docker services'
        });
      }
    };

    checkDockerServices();
    // Check periodically every 30 seconds
    const interval = setInterval(checkDockerServices, 30000);
    return () => clearInterval(interval);
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

  const mainMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', id: 'dashboard' },
    // { icon: Bot, label: 'Chat', id: 'assistant' },
    { icon: Bot, label: 'Chat', id: 'clara' },
    { icon: BrainCircuit, label: 'Agents', id: 'agents' },
    { icon: BookOpen, label: 'Notebooks', id: 'notebooks' },
    ...(alphaFeaturesEnabled ? [{ icon: Zap, label: 'Lumaui (Alpha)', id: 'lumaui' }] : []),
    { icon: Code2, label: 'LumaUI (Beta)', id: 'lumaui-lite' },
    { 
      icon: ImageIcon, 
      label: 'Image Gen', 
      id: 'image-gen',
      status: dockerServices.comfyuiAvailable ? 'ready' : 'starting'
    },
    // Conditionally add Advanced Analytics
    ...(showAdvancedAnalytics ? [{ icon: BarChartBig, label: 'Analytics', id: 'advanced-analytics' }] : []),
    // Only show n8n if Docker services are available
    ...(dockerServices.dockerAvailable && dockerServices.n8nAvailable 
      ? [{ icon: Network, label: 'Workflows', id: 'n8n' }] 
      : []),
    { icon: DollarSign, label: 'Pricing', id: 'pricing' },
  ];

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
          <img src={logoPath} alt={`${brandName} Logo`} className="w-8 h-8 flex-shrink-0" />
          <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
            <h1
              className="text-2xl font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap"
            >
              {brandName}
            </h1>
            {tagline && (
              <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
                {tagline}
              </p>
            )}
          </div>
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
                  {/* ComfyUI status indicator */}
                  {item.id === 'image-gen' && item.status === 'starting' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  )}
                  {item.id === 'image-gen' && item.status === 'ready' && (
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
                  {/* ComfyUI status text when expanded */}
                  {item.id === 'image-gen' && isExpanded && (
                    <span className={`ml-2 text-xs font-medium ${
                      item.status === 'ready' ? 'text-green-500' : 'text-yellow-500'
                    }`}>
                      {item.status === 'ready' ? '●' : '○'}
                    </span>
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