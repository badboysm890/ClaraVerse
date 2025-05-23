import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Play, 
  Square, 
  RefreshCw, 
  Plus, 
  Activity, 
  Trash2, 
  Info, 
  BarChart,
  ArrowLeft
} from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { db } from '../db';

// Define the electronAPI interface to fix TypeScript errors
declare global {
  interface Window {
    electronAPI?: {
      getContainers: () => Promise<ContainerInfo[]>;
      containerAction: (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<{ success: boolean; error?: string }>;
      createContainer: (containerConfig: any) => Promise<{ success: boolean; id?: string; error?: string }>;
      getContainerStats: (containerId: string) => Promise<{ cpu: string; memory: string; network: string }>;
      getContainerLogs: (containerId: string) => Promise<string>;
    };
    llamaSwap?: {
      start: () => Promise<{ success: boolean; status: any; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      restart: () => Promise<{ success: boolean; status: any; error?: string }>;
      getStatus: () => Promise<{ isRunning: boolean; port: number; pid?: number; apiUrl: string }>;
      getModels: () => Promise<any[]>;
      getApiUrl: () => Promise<string | null>;
      regenerateConfig: () => Promise<{ success: boolean; models: number; error?: string }>;
    };
  }
}

interface ServerProps {
  onPageChange?: (page: string) => void;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'stopped' | 'restarting' | 'error';
  ports: string[];
  created: string;
  stats?: {
    cpu: string;
    memory: string;
    network: string;
  };
}

interface FormData {
  name: string;
  image: string;
  ports: Array<{ host: string; container: string }>;
  volumes: Array<{ host: string; container: string }>;
  envVars: Array<{ key: string; value: string }>;
}

interface QuickInstallData {
  name: string;
  hostPort: string;
  template: string;
  customImage: string;
  customContainerPort: string;
}

// Add common container templates
const containerTemplates = [
  {
    id: 'custom',
    name: 'Custom Container',
    image: '',
    defaultPort: '',
    description: 'Use your own image and port'
  },
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    image: 'nginx:latest',
    defaultPort: '80',
    description: 'Popular web server and reverse proxy'
  },
  {
    id: 'mongodb',
    name: 'MongoDB Database',
    image: 'mongo:latest',
    defaultPort: '27017',
    description: 'NoSQL database'
  },
  {
    id: 'redis',
    name: 'Redis',
    image: 'redis:latest',
    defaultPort: '6379',
    description: 'In-memory data store'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    image: 'postgres:latest',
    defaultPort: '5432',
    description: 'SQL database'
  },
  {
    id: 'mysql',
    name: 'MySQL',
    image: 'mysql:latest',
    defaultPort: '3306',
    description: 'SQL database'
  }
];

const Servers: React.FC<ServerProps> = ({ onPageChange }) => {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'stats' | 'logs' | 'create' | 'llama-swap'>('list');
  const [apiAvailable, setApiAvailable] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  
  // Add form state at the top level
  const [formData, setFormData] = useState<FormData>({
    name: '',
    image: '',
    ports: [{ host: '', container: '' }],
    volumes: [{ host: '', container: '' }],
    envVars: [{ key: '', value: '' }]
  });
  const [quickInstallData, setQuickInstallData] = useState<QuickInstallData>({
    name: '',
    hostPort: '',
    template: '',
    customImage: '',
    customContainerPort: ''
  });
  const [createMode, setCreateMode] = useState<'quick' | 'advanced'>('quick');

  // Llama-swap state
  const [llamaSwapStatus, setLlamaSwapStatus] = useState<{
    isRunning: boolean;
    port: number | null;
    pid?: number;
    apiUrl: string | null;
  }>({
    isRunning: false,
    port: null,
    apiUrl: null
  });
  const [llamaSwapModels, setLlamaSwapModels] = useState<any[]>([]);
  const [llamaSwapLoading, setLlamaSwapLoading] = useState(false);

  // Debug function to check what APIs are available
  const checkApiAvailability = () => {
    try {
      const info = {
        electronAPIExists: !!window.electronAPI,
        getContainersExists: !!(window.electronAPI && typeof window.electronAPI.getContainers === 'function'),
        containerActionExists: !!(window.electronAPI && typeof window.electronAPI.containerAction === 'function'),
        createContainerExists: !!(window.electronAPI && typeof window.electronAPI.createContainer === 'function'),
        getContainerStatsExists: !!(window.electronAPI && typeof window.electronAPI.getContainerStats === 'function'),
        getContainerLogsExists: !!(window.electronAPI && typeof window.electronAPI.getContainerLogs === 'function'),
      };
      
      console.log('Docker API Availability:', info);
      setDebugInfo(JSON.stringify(info, null, 2));
      
      // Check if the essential functions are available
      const isAvailable = info.getContainersExists && info.containerActionExists;
      setApiAvailable(isAvailable);
      return isAvailable;
    } catch (err) {
      console.error('Error checking API availability:', err);
      setApiAvailable(false);
      return false;
    }
  };

  useEffect(() => {
    // Check if Docker API is available
    const apiWorks = checkApiAvailability();
    
    if (!apiWorks) {
      setError('Docker API functions not found. This may be caused by a preload script issue.');
      setLoading(false);
      return;
    }
    
    // Call to electron API to get containers
    fetchContainers();
    
    // Load wallpaper from IndexedDB
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
    
    // Fetch llama-swap status
    fetchLlamaSwapStatus();
  }, []);

  const fetchContainers = async () => {
    if (!window.electronAPI?.getContainers) {
      setApiAvailable(false);
      setError('Docker container API not available');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.getContainers();
      setContainers(result);
      setError(null);
    } catch (err) {
      console.error('Container fetch error:', err);
      setError('Failed to fetch containers. Please make sure Docker is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    if (!window.electronAPI?.containerAction) {
      setError('Docker container action API not available');
      return;
    }

    try {
      setLoading(true);
      await window.electronAPI.containerAction(containerId, action);
      await fetchContainers(); // Refresh the list
    } catch (err) {
      setError(`Failed to ${action} container`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContainer = async (containerConfig: any) => {
    if (!window.electronAPI?.createContainer) {
      setError('Docker create container API not available');
      return;
    }

    try {
      setLoading(true);
      await window.electronAPI.createContainer(containerConfig);
      setView('list');
      await fetchContainers(); // Refresh the list
    } catch (err) {
      setError('Failed to create container');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getContainerStats = async (containerId: string) => {
    if (!window.electronAPI?.getContainerStats) {
      setError('Docker container stats API not available');
      return;
    }

    try {
      const stats = await window.electronAPI.getContainerStats(containerId);
      setContainers(prevContainers => 
        prevContainers.map(container => 
          container.id === containerId ? { ...container, stats } : container
        )
      );
    } catch (err) {
      console.error('Failed to get container stats:', err);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handlePortChange = (index: number, field: 'host' | 'container', value: string) => {
    const newPorts = [...formData.ports];
    newPorts[index][field] = value;
    setFormData({ ...formData, ports: newPorts });
  };

  const handleVolumeChange = (index: number, field: 'host' | 'container', value: string) => {
    const newVolumes = [...formData.volumes];
    newVolumes[index][field] = value;
    setFormData({ ...formData, volumes: newVolumes });
  };

  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...formData.envVars];
    newEnvVars[index][field] = value;
    setFormData({ ...formData, envVars: newEnvVars });
  };

  const addPort = () => {
    setFormData({
      ...formData,
      ports: [...formData.ports, { host: '', container: '' }]
    });
  };

  const addVolume = () => {
    setFormData({
      ...formData,
      volumes: [...formData.volumes, { host: '', container: '' }]
    });
  };

  const addEnvVar = () => {
    setFormData({
      ...formData,
      envVars: [...formData.envVars, { key: '', value: '' }]
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Process form data into container config
    const containerConfig = {
      name: formData.name,
      image: formData.image,
      ports: formData.ports.filter(p => p.host && p.container),
      volumes: formData.volumes.filter(v => v.host && v.container),
      env: formData.envVars.filter(e => e.key).reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>)
    };
    handleCreateContainer(containerConfig);
  };

  const handleQuickInstall = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTemplate = containerTemplates.find(t => t.id === quickInstallData.template);
    if (!selectedTemplate) return;

    const containerConfig = {
      name: quickInstallData.name,
      image: selectedTemplate.id === 'custom' ? quickInstallData.customImage : selectedTemplate.image,
      ports: [{
        host: quickInstallData.hostPort,
        container: selectedTemplate.id === 'custom' ? quickInstallData.customContainerPort : selectedTemplate.defaultPort
      }],
      volumes: [],
      env: {}
    };

    handleCreateContainer(containerConfig);
  };

  const renderContainerList = () => {
    if (!apiAvailable) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-sakura-500 dark:text-sakura-400 text-center">
            {error || 'Docker API is not available. Check console for details.'}
          </div>
          <div className="glassmorphic p-4 rounded-lg whitespace-pre overflow-auto max-w-full max-h-64 text-xs font-mono">
            {debugInfo}
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                checkApiAvailability();
                fetchContainers();
              }} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Retry API Check
            </button>
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-400 text-white hover:bg-sakura-500 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Reload App
            </button>
          </div>
        </div>
      );
    }

    if (loading && containers.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-sakura-500" />
        </div>
      );
    }

    if (error && containers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-sakura-500 dark:text-sakura-400">{error}</div>
          <div className="flex gap-4">
            <button 
              onClick={fetchContainers} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button
              onClick={() => {
                checkApiAvailability();
                fetchContainers();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-400 text-white hover:bg-sakura-500 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Check API & Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Containers</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setView('llama-swap')} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              <Activity className="w-4 h-4" /> LLM Service
            </button>
            <button 
              onClick={() => setView('create')} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 transition-colors"
              disabled={!apiAvailable}
            >
              <Plus className="w-4 h-4" /> New Container
            </button>
            <button 
              onClick={fetchContainers} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
              disabled={!apiAvailable}
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto rounded-lg glassmorphic">
          <table className="min-w-full">
            <thead className="bg-sakura-50 dark:bg-gray-800/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Image</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Ports</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sakura-100 dark:divide-sakura-800/30">
              {containers.map((container) => (
                <tr key={container.id} className="hover:bg-sakura-50 dark:hover:bg-gray-700/60 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Server className="w-5 h-5 mr-2 text-sakura-500 dark:text-sakura-400" />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{container.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">{container.image}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${container.state === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                        container.state === 'stopped' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}
                    >
                      {container.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">{container.ports.join(', ')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex space-x-2">
                      {container.state !== 'running' && (
                        <button 
                          onClick={() => handleContainerAction(container.id, 'start')}
                          className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                          title="Start"
                          disabled={!apiAvailable}
                        >
                          <Play className="w-5 h-5" />
                        </button>
                      )}
                      {container.state === 'running' && (
                        <button 
                          onClick={() => handleContainerAction(container.id, 'stop')}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Stop"
                          disabled={!apiAvailable}
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleContainerAction(container.id, 'restart')}
                        className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 transition-colors"
                        title="Restart"
                        disabled={!apiAvailable}
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedContainer(container.id);
                          getContainerStats(container.id);
                          setView('stats');
                        }}
                        className="text-sakura-600 hover:text-sakura-900 dark:text-sakura-400 dark:hover:text-sakura-300 transition-colors"
                        title="Stats"
                        disabled={!apiAvailable}
                      >
                        <BarChart className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleContainerAction(container.id, 'remove')}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                        title="Remove"
                        disabled={!apiAvailable}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {containers.length === 0 && !loading && !error && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No containers found. Click "New Container" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderContainerStats = () => {
    if (!apiAvailable) {
      return (
        <div className="mt-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Container Stats</h2>
            <button 
              onClick={() => setView('list')} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to list
            </button>
          </div>
          
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-sakura-500 dark:text-sakura-400">
              Docker API is not available. This feature requires the desktop application.
            </div>
          </div>
        </div>
      );
    }
    
    if (!selectedContainer) return null;
    
    const container = containers.find(c => c.id === selectedContainer);
    if (!container) return null;

    return (
      <div className="mt-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Container Stats: {container.name}</h2>
          <button 
            onClick={() => setView('list')} 
            className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to list
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glassmorphic p-4 rounded-lg">
            <h3 className="text-sakura-500 dark:text-sakura-400 mb-2">CPU Usage</h3>
            <p className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{container.stats?.cpu || 'N/A'}</p>
          </div>
          <div className="glassmorphic p-4 rounded-lg">
            <h3 className="text-sakura-500 dark:text-sakura-400 mb-2">Memory Usage</h3>
            <p className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{container.stats?.memory || 'N/A'}</p>
          </div>
          <div className="glassmorphic p-4 rounded-lg">
            <h3 className="text-sakura-500 dark:text-sakura-400 mb-2">Network I/O</h3>
            <p className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{container.stats?.network || 'N/A'}</p>
          </div>
        </div>
        
        <div className="glassmorphic p-4 rounded-lg">
          <h3 className="text-sakura-500 dark:text-sakura-400 mb-2">Container Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-sakura-500 dark:text-sakura-400">ID</p>
              <p className="font-mono text-gray-700 dark:text-gray-300">{container.id}</p>
            </div>
            <div>
              <p className="text-sm text-sakura-500 dark:text-sakura-400">Image</p>
              <p className="text-gray-700 dark:text-gray-300">{container.image}</p>
            </div>
            <div>
              <p className="text-sm text-sakura-500 dark:text-sakura-400">Created</p>
              <p className="text-gray-700 dark:text-gray-300">{container.created}</p>
            </div>
            <div>
              <p className="text-sm text-sakura-500 dark:text-sakura-400">Status</p>
              <p className="text-gray-700 dark:text-gray-300">{container.status}</p>
            </div>
            <div>
              <p className="text-sm text-sakura-500 dark:text-sakura-400">Ports</p>
              <p className="text-gray-700 dark:text-gray-300">{container.ports.join(', ')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuickInstallForm = () => {
    const isCustomTemplate = quickInstallData.template === 'custom';
    const selectedTemplate = containerTemplates.find(t => t.id === quickInstallData.template);

    return (
      <form onSubmit={handleQuickInstall} className="glassmorphic p-6 rounded-lg">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Select Container Type
            </label>
            <select
              value={quickInstallData.template}
              onChange={(e) => setQuickInstallData({ 
                ...quickInstallData, 
                template: e.target.value,
                customImage: '',
                customContainerPort: ''
              })}
              className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
              required
            >
              <option value="">Select a template</option>
              {containerTemplates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Container Name
            </label>
            <input
              type="text"
              value={quickInstallData.name}
              onChange={(e) => setQuickInstallData({ ...quickInstallData, name: e.target.value })}
              className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
              placeholder="my-container"
              required
            />
          </div>

          {isCustomTemplate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Container Image
              </label>
              <input
                type="text"
                value={quickInstallData.customImage}
                onChange={(e) => setQuickInstallData({ ...quickInstallData, customImage: e.target.value })}
                className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                placeholder="e.g., ubuntu:latest"
                required={isCustomTemplate}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Host Port
              </label>
              <input
                type="text"
                value={quickInstallData.hostPort}
                onChange={(e) => setQuickInstallData({ ...quickInstallData, hostPort: e.target.value })}
                className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                placeholder="e.g., 8080"
                required
              />
            </div>

            {isCustomTemplate ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Container Port
                </label>
                <input
                  type="text"
                  value={quickInstallData.customContainerPort}
                  onChange={(e) => setQuickInstallData({ ...quickInstallData, customContainerPort: e.target.value })}
                  className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                  placeholder="e.g., 80"
                  required={isCustomTemplate}
                />
              </div>
            ) : (
              quickInstallData.template && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Container Port (Auto)
                  </label>
                  <div className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400">
                    {selectedTemplate?.defaultPort}
                  </div>
                </div>
              )
            )}
          </div>

          <div className="flex justify-end">
            <button 
              type="submit"
              className="px-6 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:ring-offset-2 transition-colors"
            >
              Create Container
            </button>
          </div>
        </div>
      </form>
    );
  };

  const renderCreateContainer = () => {
    if (!apiAvailable) {
      return (
        <div className="mt-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Create Container</h2>
            <button 
              onClick={() => setView('list')} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to list
            </button>
          </div>
          
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-sakura-500 dark:text-sakura-400">
              Docker API is not available. This feature requires the desktop application.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Create Container</h2>
          <button 
            onClick={() => setView('list')} 
            className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        </div>

        <div className="mb-6">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setCreateMode('quick')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                createMode === 'quick'
                  ? 'bg-sakura-500 text-white'
                  : 'glassmorphic text-gray-700 dark:text-gray-200'
              }`}
            >
              Quick Install
            </button>
            <button
              onClick={() => setCreateMode('advanced')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                createMode === 'advanced'
                  ? 'bg-sakura-500 text-white'
                  : 'glassmorphic text-gray-700 dark:text-gray-200'
              }`}
            >
              Advanced
            </button>
          </div>

          {createMode === 'quick' ? renderQuickInstallForm() : (
            <form onSubmit={handleSubmit} className="glassmorphic p-6 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Container Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                    placeholder="my-container"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Image
                  </label>
                  <input
                    type="text"
                    name="image"
                    value={formData.image}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                    placeholder="nginx:latest"
                    required
                  />
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Port Mapping
                  </label>
                  <button 
                    type="button" 
                    onClick={addPort}
                    className="text-sakura-500 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {formData.ports.map((port, index) => (
                  <div key={index} className="flex gap-4 mb-2">
                    <input
                      type="text"
                      value={port.host}
                      onChange={(e) => handlePortChange(index, 'host', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Host Port (e.g. 8080)"
                    />
                    <span className="flex items-center text-gray-700 dark:text-gray-300">:</span>
                    <input
                      type="text"
                      value={port.container}
                      onChange={(e) => handlePortChange(index, 'container', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Container Port (e.g. 80)"
                    />
                  </div>
                ))}
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Volumes
                  </label>
                  <button 
                    type="button" 
                    onClick={addVolume}
                    className="text-sakura-500 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {formData.volumes.map((volume, index) => (
                  <div key={index} className="flex gap-4 mb-2">
                    <input
                      type="text"
                      value={volume.host}
                      onChange={(e) => handleVolumeChange(index, 'host', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Host Path"
                    />
                    <span className="flex items-center text-gray-700 dark:text-gray-300">:</span>
                    <input
                      type="text"
                      value={volume.container}
                      onChange={(e) => handleVolumeChange(index, 'container', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Container Path"
                    />
                  </div>
                ))}
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Environment Variables
                  </label>
                  <button 
                    type="button" 
                    onClick={addEnvVar}
                    className="text-sakura-500 hover:text-sakura-600 dark:hover:text-sakura-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {formData.envVars.map((env, index) => (
                  <div key={index} className="flex gap-4 mb-2">
                    <input
                      type="text"
                      value={env.key}
                      onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Key (e.g. PORT)"
                    />
                    <span className="flex items-center text-gray-700 dark:text-gray-300">=</span>
                    <input
                      type="text"
                      value={env.value}
                      onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                      className="w-full px-4 py-2 border border-sakura-200 dark:border-sakura-700 rounded-lg focus:ring-sakura-500 focus:border-sakura-500 bg-white/50 dark:bg-gray-800/50 dark:text-white"
                      placeholder="Value"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:ring-offset-2 transition-colors"
                >
                  Create Container
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  };

  const renderLlamaSwap = () => {
    return (
      <div className="mt-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">LLM Service (Llama-swap)</h2>
          <button 
            onClick={() => setView('list')} 
            className="flex items-center gap-2 px-4 py-2 rounded-lg glassmorphic text-gray-700 hover:bg-sakura-50 dark:text-gray-200 dark:hover:bg-sakura-100/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to containers
          </button>
        </div>

        {/* Service Status */}
        <div className="glassmorphic p-6 rounded-lg mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Service Status</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleLlamaSwapAction('start')}
                disabled={llamaSwapStatus.isRunning || llamaSwapLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" /> Start
              </button>
              <button
                onClick={() => handleLlamaSwapAction('stop')}
                disabled={!llamaSwapStatus.isRunning || llamaSwapLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Square className="w-4 h-4" /> Stop
              </button>
              <button
                onClick={() => handleLlamaSwapAction('restart')}
                disabled={llamaSwapLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Restart
              </button>
              <button
                onClick={regenerateLlamaSwapConfig}
                disabled={llamaSwapLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate Config
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              <h4 className="text-sakura-500 dark:text-sakura-400 mb-2">Status</h4>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${llamaSwapStatus.isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-800 dark:text-gray-100">
                  {llamaSwapStatus.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              <h4 className="text-sakura-500 dark:text-sakura-400 mb-2">Port</h4>
              <p className="text-gray-800 dark:text-gray-100">{llamaSwapStatus.port || 'N/A'}</p>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              <h4 className="text-sakura-500 dark:text-sakura-400 mb-2">API URL</h4>
              <p className="text-gray-800 dark:text-gray-100 font-mono text-sm">
                {llamaSwapStatus.apiUrl || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Available Models */}
        <div className="glassmorphic p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Available Models</h3>
            <button
              onClick={fetchLlamaSwapStatus}
              disabled={llamaSwapLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {llamaSwapModels.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-sakura-50 dark:bg-gray-800/80">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Model ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Object</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-sakura-700 dark:text-sakura-300 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sakura-100 dark:divide-sakura-800/30">
                  {llamaSwapModels.map((model, index) => (
                    <tr key={index} className="hover:bg-sakura-50 dark:hover:bg-gray-700/60 transition-colors">
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
    );
  };

  // Llama-swap service management functions
  const fetchLlamaSwapStatus = async () => {
    try {
      if (window.llamaSwap?.getStatus) {
        const status = await window.llamaSwap.getStatus();
        setLlamaSwapStatus(status);
        
        // If running, fetch models
        if (status.isRunning && window.llamaSwap?.getModels) {
          const models = await window.llamaSwap.getModels();
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
      let result;
      if (action === 'start' && window.llamaSwap?.start) {
        result = await window.llamaSwap.start();
      } else if (action === 'stop' && window.llamaSwap?.stop) {
        result = await window.llamaSwap.stop();
      } else if (action === 'restart' && window.llamaSwap?.restart) {
        result = await window.llamaSwap.restart();
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
      if (window.llamaSwap?.regenerateConfig) {
        const result = await window.llamaSwap.regenerateConfig();
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

  return (
    <>
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}
      <div className="flex h-screen relative z-10">
        <Sidebar activePage="servers" onPageChange={onPageChange ?? (() => {})} />
        
        <div className="flex-1 flex flex-col">
          <Topbar userName="User" onPageChange={onPageChange ?? (() => {})} />
          
          <main className="flex-1 p-6 overflow-auto">
            <header className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Container & LLM Service Management</h1>
              <div className="flex justify-between items-center">
                <p className="text-gray-600 dark:text-gray-300">
                  {!apiAvailable 
                    ? "Docker API is unavailable. This feature requires Docker and proper API configuration." 
                    : "Manage your Docker containers and LLM services from one place"}
                </p>
                <button
                  onClick={checkApiAvailability}
                  className="text-sm text-sakura-500 hover:text-sakura-700 dark:text-sakura-400 dark:hover:text-sakura-300 transition-colors"
                  title="Check API Status"
                >
                  Check API
                </button>
              </div>
            </header>

            {error && (
              <div className="mb-4 p-3 bg-sakura-50 text-sakura-700 dark:bg-sakura-900/50 dark:text-sakura-300 rounded-lg">
                <strong>Error:</strong> {error}
              </div>
            )}

            {!apiAvailable && !loading && (
              <div className="mb-4 p-4 border border-sakura-300 bg-sakura-50/50 dark:bg-sakura-900/30 dark:border-sakura-700 rounded-lg glassmorphic">
                <h3 className="text-lg font-semibold text-sakura-800 dark:text-sakura-400 mb-2">Docker API Connection Issue</h3>
                <p className="mb-2 text-sakura-700 dark:text-sakura-300">
                  The application is having trouble connecting to the Docker API. This could be due to:
                </p>
                <ul className="list-disc list-inside mb-3 text-sakura-700 dark:text-sakura-300">
                  <li>Docker is not running</li>
                  <li>The Electron preload script is not correctly configured</li>
                  <li>You don't have permission to access the Docker socket</li>
                  <li>The Docker API is not exposed</li>
                </ul>
                <div className="mt-3">
                  <strong className="text-sakura-800 dark:text-sakura-400">Debug Info:</strong>
                  <pre className="mt-1 p-3 bg-sakura-100/70 dark:bg-sakura-900/50 rounded-lg overflow-auto text-xs">{debugInfo || 'No debug info available'}</pre>
                </div>
              </div>
            )}

            {view === 'list' && renderContainerList()}
            {view === 'stats' && renderContainerStats()}
            {view === 'create' && renderCreateContainer()}
            {view === 'llama-swap' && renderLlamaSwap()}
          </main>
        </div>
      </div>
    </>
  );
};

export default Servers; 