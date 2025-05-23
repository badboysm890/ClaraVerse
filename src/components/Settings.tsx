import { useEffect, useState, useRef } from 'react';
import { Save, User, Globe, Server, Key, Lock, Image, Settings as SettingsIcon, Download, Search, Trash2, HardDrive, Cloud } from 'lucide-react';
import { db, type PersonalInfo, type APIConfig } from '../db';
import { useTheme, ThemeMode } from '../hooks/useTheme';

// Define types for model management
interface HuggingFaceModel {
  id: string;
  name: string;
  downloads: number;
  likes: number;
  tags: string[];
  description: string;
  author: string;
  files: Array<{ rfilename: string; size?: number }>;
}

interface LocalModel {
  name: string;
  file: string;
  path: string;
  size: number;
  source: string;
  lastModified: Date;
}

interface DownloadProgress {
  fileName: string;
  progress: number;
  downloadedSize: number;
  totalSize: number;
}

// Define the interface for the window object
declare global {
  interface Window {
    modelManager?: {
      searchHuggingFaceModels: (query: string, limit?: number) => Promise<{ success: boolean; models: HuggingFaceModel[]; error?: string }>;
      downloadModel: (modelId: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      getLocalModels: () => Promise<{ success: boolean; models: LocalModel[]; error?: string }>;
      deleteLocalModel: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void;
      stopDownload: (fileName: string) => Promise<{ success: boolean; error?: string }>;
    };
    llamaSwap?: {
      regenerateConfig: () => Promise<{ success: boolean; models: number; error?: string }>;
    };
  }
}

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'personal' | 'api' | 'preferences' | 'models'>('personal');
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    name: '',
    email: '',
    avatar_url: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme_preference: 'system'
  });

  const [apiConfig, setApiConfig] = useState<APIConfig>({
    ollama_base_url: '',
    comfyui_base_url: '',
    openai_api_key: '',
    openai_base_url: '',
    api_type: 'ollama'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showApiKey, setShowApiKey] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Model manager state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HuggingFaceModel[]>([]);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ [fileName: string]: DownloadProgress }>({});
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const { setTheme } = useTheme();
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const savedPersonalInfo = await db.getPersonalInfo();
      const savedApiConfig = await db.getAPIConfig();

      if (savedPersonalInfo) {
        setPersonalInfo(savedPersonalInfo);
        setTheme(savedPersonalInfo.theme_preference as ThemeMode);
      }
      
      if (savedApiConfig) {
        setApiConfig({
          ...savedApiConfig,
          openai_base_url: savedApiConfig.openai_base_url || 'https://api.openai.com/v1',
        });
      }
    };

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load wallpaper from IndexedDB on mount
  useEffect(() => {
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
  }, []);

  // Load local models on mount and set up download progress listener
  useEffect(() => {
    const loadLocalModels = async () => {
      if (window.modelManager?.getLocalModels) {
        try {
          const result = await window.modelManager.getLocalModels();
          if (result.success) {
            setLocalModels(result.models);
          }
        } catch (error) {
          console.error('Error loading local models:', error);
        }
      }
    };

    loadLocalModels();

    // Set up download progress listener
    let unsubscribe: (() => void) | undefined;
    if (window.modelManager?.onDownloadProgress) {
      unsubscribe = window.modelManager.onDownloadProgress((data: DownloadProgress) => {
        setDownloadProgress(prev => ({
          ...prev,
          [data.fileName]: data
        }));
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Auto-save effect for personalInfo and apiConfig
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setIsSaving(true);
    setSaveStatus('idle');
    saveTimeout.current = setTimeout(async () => {
      try {
        await db.updatePersonalInfo(personalInfo);
        await db.updateAPIConfig(apiConfig);
        setSaveStatus('success');
        // Hide success message after 2 seconds
        setTimeout(() => {
          setSaveStatus('idle');
          setIsSaving(false);
        }, 2000);
      } catch {
        setSaveStatus('error');
        // Hide error message after 3 seconds
        setTimeout(() => {
          setSaveStatus('idle');
          setIsSaving(false);
        }, 3000);
      }
    }, 600); // debounce 600ms
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [personalInfo, apiConfig]);

  // When theme_preference changes, update the theme immediately
  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as ThemeMode;
    setPersonalInfo(prev => ({ ...prev, theme_preference: value }));
    setTheme(value);
  };

  // Handle setting wallpaper
  const handleSetWallpaper = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          // Convert file to base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64String = e.target?.result as string;
            // Store in IndexedDB
            await db.setWallpaper(base64String);
            // Update state
            setWallpaperUrl(base64String);
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Error setting wallpaper:', error);
        }
      }
    };
    input.click();
  };

  // Handle clearing wallpaper
  const handleClearWallpaper = async () => {
    try {
      await db.setWallpaper('');
      setWallpaperUrl(null);
    } catch (error) {
      console.error('Error clearing wallpaper:', error);
    }
  };

  // Timezone options helper
  let timezoneOptions: string[] = [];
  try {
    // @ts-expect-error - Intl.supportedValuesOf may not be available in all environments
    timezoneOptions = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    timezoneOptions = [];
  }
  if (!timezoneOptions.length) {
    timezoneOptions = [
      'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata',
      'Europe/Paris', 'Europe/Berlin', 'America/Los_Angeles', 'Australia/Sydney'
    ];
  }

  // Tab component
  const TabItem = ({ id, label, icon, isActive }: { id: typeof activeTab, label: string, icon: React.ReactNode, isActive: boolean }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${
        isActive 
          ? 'bg-sakura-500 text-white' 
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  // Model management functions
  const searchModels = async () => {
    if (!searchQuery.trim() || !window.modelManager?.searchHuggingFaceModels) return;
    
    setIsSearching(true);
    try {
      const result = await window.modelManager.searchHuggingFaceModels(searchQuery, 20);
      if (result.success) {
        setSearchResults(result.models);
      } else {
        console.error('Search failed:', result.error);
      }
    } catch (error) {
      console.error('Error searching models:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const downloadModel = async (modelId: string, fileName: string) => {
    if (!window.modelManager?.downloadModel) return;
    
    setDownloading(prev => new Set([...prev, fileName]));
    try {
      const result = await window.modelManager.downloadModel(modelId, fileName);
      if (result.success) {
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
        
        // Regenerate llama-swap config
        if (window.llamaSwap?.regenerateConfig) {
          await window.llamaSwap.regenerateConfig();
        }
      } else {
        console.error('Download failed:', result.error);
      }
    } catch (error) {
      console.error('Error downloading model:', error);
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
      
      // Clean up progress
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[fileName];
        return newProgress;
      });
    }
  };

  const deleteLocalModel = async (filePath: string) => {
    if (!window.modelManager?.deleteLocalModel) return;
    
    try {
      // Add to deleting set
      setDeleting(prev => new Set([...prev, filePath]));
      
      const result = await window.modelManager.deleteLocalModel(filePath);
      if (result.success) {
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
        
        // Regenerate llama-swap config
        if (window.llamaSwap?.regenerateConfig) {
          await window.llamaSwap.regenerateConfig();
        }
      } else {
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Error deleting model:', error);
    } finally {
      // Remove from deleting set
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
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
      
      <div className="flex max-w-6xl mx-auto gap-6 relative z-10 h-full">
        {/* Sidebar with tabs */}
        <div className="w-64 shrink-0">
          <div className="glassmorphic rounded-xl p-4 space-y-2 sticky top-4">
            <h2 className="flex items-center gap-2 px-4 py-3 text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 mb-2">
              <SettingsIcon className="w-5 h-5 text-sakura-500" />
              Settings
            </h2>
            
            <TabItem 
              id="personal" 
              label="Personal Information" 
              icon={<User className="w-5 h-5" />} 
              isActive={activeTab === 'personal'} 
            />
            
            <TabItem 
              id="api" 
              label="API Configuration" 
              icon={<Globe className="w-5 h-5" />} 
              isActive={activeTab === 'api'} 
            />
            
            <TabItem 
              id="preferences" 
              label="Preferences" 
              icon={<SettingsIcon className="w-5 h-5" />} 
              isActive={activeTab === 'preferences'} 
            />
            
            <TabItem 
              id="models" 
              label="Model Manager" 
              icon={<HardDrive className="w-5 h-5" />} 
              isActive={activeTab === 'models'} 
            />
            
            {/* Save Status - Only visible when saving/saved/error */}
            {(isSaving || saveStatus !== 'idle') && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white transition-colors w-full ${
                  saveStatus === 'success'
                  ? 'bg-green-500'
                  : saveStatus === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-400'
                }`}>
                  <Save className="w-4 h-4" />
                  {saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error!' : 'Saving...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 space-y-6 py-2 max-w-4xl">
          {/* Personal Information Tab */}
          {activeTab === 'personal' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-6 h-6 text-sakura-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Personal Information
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={personalInfo.name}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={personalInfo.email}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={personalInfo.avatar_url}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, avatar_url: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Wallpaper
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSetWallpaper}
                      className="px-4 py-2 bg-sakura-500 text-white rounded-lg flex items-center gap-2"
                    >
                      <Image className="w-4 h-4" />
                      {wallpaperUrl ? 'Change Wallpaper' : 'Set Wallpaper'}
                    </button>
                    {wallpaperUrl && (
                      <button
                        onClick={handleClearWallpaper}
                        className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-lg"
                      >
                        Clear Wallpaper
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API Configuration Tab */}
          {activeTab === 'api' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Globe className="w-6 h-6 text-sakura-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  API Configuration
                </h2>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    API Type
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setApiConfig(prev => ({ ...prev, api_type: 'ollama' }))}
                      className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                        apiConfig.api_type === 'ollama'
                          ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-500/10'
                          : 'border-gray-200 hover:border-sakura-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <h3 className="font-medium text-gray-900 dark:text-white">Ollama</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Local AI models</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setApiConfig(prev => ({ ...prev, api_type: 'openai' }))}
                      className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                        apiConfig.api_type === 'openai'
                          ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-500/10'
                          : 'border-gray-200 hover:border-sakura-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <h3 className="font-medium text-gray-900 dark:text-white">OpenAI-like API</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Compatible with OpenAI API format</p>
                      </div>
                    </button>
                  </div>
                </div>

                {apiConfig.api_type === 'ollama' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Ollama Base URL
                    </label>
                    <input
                      type="url"
                      value={apiConfig.ollama_base_url}
                      onChange={(e) => setApiConfig(prev => ({ ...prev, ollama_base_url: e.target.value }))}
                      className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      placeholder="http://localhost:11434"
                    />
                  </div>
                )}

                {apiConfig.api_type === 'openai' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API Base URL <span className="text-xs text-gray-500 dark:text-gray-400">(Optional - uses OpenAI if blank)</span>
                      </label>
                      <input
                        type="url"
                        value={apiConfig.openai_base_url}
                        onChange={(e) => setApiConfig(prev => ({ ...prev, openai_base_url: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                        placeholder="https://api.openai.com/v1 or your custom endpoint"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API Key <span className="text-xs text-gray-500 dark:text-gray-400">(Optional for some API providers)</span>
                      </label>
                      <input
                        type="password"
                        value={apiConfig.openai_api_key}
                        onChange={(e) => setApiConfig(prev => ({ ...prev, openai_api_key: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                        placeholder="sk-..."
                      />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ComfyUI Base URL
                  </label>
                  <input
                    type="url"
                    value={apiConfig.comfyui_base_url}
                    onChange={(e) => setApiConfig(prev => ({ ...prev, comfyui_base_url: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="http://localhost:8188"
                  />
                </div>

                {/* n8n Configuration Section */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Server className="w-5 h-5 text-sakura-500" />
                    n8n Configuration
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        n8n Base URL
                      </label>
                      <input
                        type="url"
                        value={apiConfig.n8n_base_url || ''}
                        onChange={(e) => setApiConfig(prev => ({ ...prev, n8n_base_url: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                        placeholder="http://localhost:5678"
                      />
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The URL where your n8n instance is running</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        n8n API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={apiConfig.n8n_api_key || ''}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, n8n_api_key: e.target.value }))}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                          placeholder="Your n8n API key"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        >
                          {showApiKey ? (
                            <Lock className="h-4 w-4 text-gray-500" />
                          ) : (
                            <Key className="h-4 w-4 text-gray-500" />
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">API key for authenticating with your n8n instance</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <SettingsIcon className="w-6 h-6 text-sakura-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Preferences
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Theme
                  </label>
                  <select
                    value={personalInfo.theme_preference}
                    onChange={handleThemeChange}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={personalInfo.timezone}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  >
                    {timezoneOptions.map((tz: string) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Model Manager Tab */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <HardDrive className="w-6 h-6 text-sakura-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Model Manager
                  </h2>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Download and manage GGUF models from Hugging Face for local AI inference.
                </p>
              </div>

              {/* Search Section */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Search className="w-5 h-5 text-sakura-500" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Search Hugging Face Models
                  </h3>
                </div>
                
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchModels()}
                    placeholder="Search for GGUF models (e.g., 'llama', 'mistral', 'qwen')"
                    className="flex-1 px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  />
                  <button
                    onClick={searchModels}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-6 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white">Search Results</h4>
                    <div className="grid gap-3 max-h-96 overflow-y-auto">
                      {searchResults.map((model) => (
                        <div key={model.id} className="bg-white/30 dark:bg-gray-800/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 dark:text-white">{model.name}</h5>
                              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">by {model.author}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{model.description}</p>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                <div>↓ {model.downloads.toLocaleString()}</div>
                                <div>♥ {model.likes.toLocaleString()}</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Available Files */}
                          {model.files.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <h6 className="text-sm font-medium text-gray-800 dark:text-gray-200">Available Files:</h6>
                              <div className="space-y-1">
                                {model.files.map((file) => (
                                  <div key={file.rfilename} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{file.rfilename}</span>
                                    <div className="flex items-center gap-2">
                                      {file.size && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          {formatFileSize(file.size)}
                                        </span>
                                      )}
                                      {downloading.has(file.rfilename) ? (
                                        <div className="flex items-center gap-2">
                                          <div className="w-4 h-4 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin"></div>
                                          {downloadProgress[file.rfilename] && (
                                            <span className="text-xs text-sakura-600 dark:text-sakura-400">
                                              {downloadProgress[file.rfilename].progress}%
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => downloadModel(model.id, file.rfilename)}
                                          className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors flex items-center gap-1"
                                        >
                                          <Download className="w-3 h-3" />
                                          Download
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Tags */}
                          {model.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {model.tags.slice(0, 5).map((tag) => (
                                <span key={tag} className="px-2 py-1 bg-sakura-100 dark:bg-sakura-800 text-sakura-700 dark:text-sakura-300 text-xs rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Local Models Section */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <HardDrive className="w-5 h-5 text-sakura-500" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Local Models
                  </h3>
                </div>
                
                {localModels.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid gap-3">
                      {localModels.map((model) => (
                        <div key={model.path} className="bg-white/30 dark:bg-gray-800/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 dark:text-white">{model.name}</h5>
                              <p className="text-sm text-gray-600 dark:text-gray-300 font-mono">{model.file}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>Size: {formatFileSize(model.size)}</span>
                                <span>Source: {model.source}</span>
                                <span>Modified: {new Date(model.lastModified).toLocaleDateString()}</span>
                              </div>
                            </div>
                            {deleting.has(model.path) ? (
                              <div className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-xs rounded opacity-50 cursor-not-allowed">
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Deleting...
                              </div>
                            ) : (
                              <button
                                onClick={() => deleteLocalModel(model.path)}
                                disabled={deleting.has(model.path)}
                                className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Cloud className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No local models found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Search and download models from Hugging Face above
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Settings;