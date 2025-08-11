import React, { useEffect, useState, useRef } from 'react';
import { Save, User, Globe, Server, Image, Settings as SettingsIcon, Trash2, HardDrive, Plus, Check, X, Edit3, Zap, Router, Bot, Download, RotateCcw, AlertCircle, ExternalLink, Brain, Puzzle, Power, Palette, Type, Search, Clock } from 'lucide-react';
import { db, type PersonalInfo, type APIConfig, type Provider } from '../db';
import { useTheme, ThemeMode } from '../hooks/useTheme';
import { useProviders } from '../contexts/ProvidersContext';
import MCPSettings from './MCPSettings';
import ModelManager from './ModelManager';
import ToolBelt from './ToolBelt';
import UnifiedServiceManager from './Settings/UnifiedServiceManager';
import GPUDiagnostics from './GPUDiagnostics';
import { 
  DEFAULT_UI_PREFERENCES, 
  FONT_SCALE_OPTIONS, 
  FONT_WEIGHT_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  LETTER_SPACING_OPTIONS,
  ACCENT_COLOR_OPTIONS, 
  FONT_PRESETS,
  BUILTIN_WALLPAPERS,
  applyUIPreferences,
  detectSystemFonts
} from '../utils/uiPreferences';
import { 
  createGradientWallpaper,
  processWallpaper,
  type ImageEffects
} from '../utils/imageProcessing';
import { indexedDBService } from '../services/indexedDB';
import { GalleryImage } from '../types';

// Type for llama.cpp update info
interface LlamacppUpdateInfo {
  hasUpdate: boolean;
  error?: string;
  currentVersion: string;
  latestVersion?: string;
  platform: string;
  downloadSize?: string;
  releaseUrl?: string;
  publishedAt?: string;
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

// Add interface for startup configuration
interface StartupConfig {
  autoStart: boolean;
  startMinimized: boolean;
  startFullscreen: boolean;
  checkForUpdates: boolean;
  restoreLastSession: boolean;
  checkFrequency?: string;
  notifyOnAvailable?: boolean;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
  };
  betaChannel?: boolean;
}

const Settings = () => {
  // Main category tabs
  const [activeMainTab, setActiveMainTab] = useState<'interface' | 'ai-models' | 'system' | 'profile'>('ai-models');
  
  // Sub-tabs for each main category
  const [activeInterfaceTab, setActiveInterfaceTab] = useState<'appearance' | 'ui-preferences'>('appearance');
  const [activeAITab, setActiveAITab] = useState<'api' | 'models' | 'mcp'>('api');
  const [activeSystemTab, setActiveSystemTab] = useState<'services' | 'toolbelt' | 'updates'>('services');
  
  // Keep legacy activeTab for backward compatibility during transition
  const [activeTab, setActiveTab] = useState<'personal' | 'api' | 'preferences' | 'models' | 'mcp' | 'toolbelt' | 'updates' | 'sdk-demo' | 'servers' >('api');
  const [activeModelTab, setActiveModelTab] = useState<'models' | 'gpu-diagnostics'>('models');

  // Function to get the effective active tab based on new structure
  const getEffectiveActiveTab = (): typeof activeTab => {
    if (activeMainTab === 'profile') return 'personal';
    if (activeMainTab === 'interface') {
      if (activeInterfaceTab === 'appearance' || activeInterfaceTab === 'ui-preferences') {
        return 'preferences';
      }
    }
    if (activeMainTab === 'ai-models') {
      return activeAITab as 'api' | 'models' | 'mcp';
    }
    if (activeMainTab === 'system') {
      if (activeSystemTab === 'services') return 'servers';
      return activeSystemTab as 'toolbelt' | 'updates';
    }
    return 'api'; // default
  };

  // Get current effective tab
  const effectiveActiveTab = getEffectiveActiveTab();
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    name: '',
    email: '',
    avatar_url: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme_preference: 'system',
    startup_settings: {
      autoStart: false,
      startMinimized: false,
      startFullscreen: false,
      checkForUpdates: true,
      restoreLastSession: true
    },
    ui_preferences: DEFAULT_UI_PREFERENCES
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
  // const [showApiKey, setShowApiKey] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<Date | null>(null);
  
  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<{
    isDownloading: boolean;
    percent: number;
    transferred: string;
    total: string;
    fileName: string;
  } | null>(null);

  // Add llama.cpp binary update state
  const [llamacppUpdateInfo, setLlamacppUpdateInfo] = useState<LlamacppUpdateInfo | null>(null);
  const [checkingLlamacppUpdates, setCheckingLlamacppUpdates] = useState(false);
  const [updatingLlamacppBinaries, setUpdatingLlamacppBinaries] = useState(false);
  const [lastLlamacppUpdateCheck, setLastLlamacppUpdateCheck] = useState<Date | null>(null);

  // Add Docker services status state
  const [dockerServices, setDockerServices] = useState<DockerServicesStatus>({
    dockerAvailable: false,
    n8nAvailable: false,
    pythonAvailable: false,
    comfyuiAvailable: false
  });

  // Add Python backend info state
  const [pythonBackendInfo, setPythonBackendInfo] = useState<any>(null);

  // Add startup configuration state
  const [startupConfig, setStartupConfig] = useState<StartupConfig>({
    autoStart: false,
    startMinimized: false,
    startFullscreen: false,
    checkForUpdates: true,
    restoreLastSession: true
  });

  // Add feature configuration state
  const [featureConfig, setFeatureConfig] = useState({
    comfyUI: true,
    n8n: true,
    ragAndTts: true,
    claraCore: true
  });
  const [featureConfigLoaded, setFeatureConfigLoaded] = useState(false);
  const [savingFeatureConfig, setSavingFeatureConfig] = useState(false);

  // Available system fonts state
  const [availableFonts, setAvailableFonts] = useState<{ value: string; label: string; description: string; category: string }[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);

  // Wallpaper gallery and processing state
  const [showBuiltinGallery, setShowBuiltinGallery] = useState(false);
  const [showYourCreations, setShowYourCreations] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [gallerySearchQuery, setGallerySearchQuery] = useState('');
  const [isLoadingGalleryImages, setIsLoadingGalleryImages] = useState(false);

  // Type for update info to fix TypeScript errors
  interface UpdateInfo {
    hasUpdate: boolean;
    error?: string;
    currentVersion: string;
    latestVersion?: string;
    platform: string;
    isOTASupported: boolean;
    releaseUrl?: string;
    downloadUrl?: string;
    releaseNotes?: string;
    releaseNotesFormatted?: string;
    publishedAt?: string;
    assetSize?: string;
    downloadEstimate?: string;
    hasBreakingChanges?: boolean;
  }

  const { setTheme } = useTheme();
  const { providers, addProvider, updateProvider, deleteProvider, setPrimaryProvider, loading: providersLoading } = useProviders();
  // const { theme } = useTheme();
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Add provider modal state
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: 'success' | 'error' | null }>({});
  const [newProviderForm, setNewProviderForm] = useState({
    name: '',
    type: 'openai' as Provider['type'],
    baseUrl: '',
    apiKey: '',
    isEnabled: true
  });

  // Add enhanced service status state
  const [enhancedServiceStatus, setEnhancedServiceStatus] = useState<any>({});
  const [serviceConfigs, setServiceConfigs] = useState<any>({});
  const [platformCompatibility, setPlatformCompatibility] = useState<any>({});
  const [loadingServiceConfigs, setLoadingServiceConfigs] = useState(false);
  const [testingServices, setTestingServices] = useState<{ [key: string]: boolean }>({});
  const [serviceTestResults, setServiceTestResults] = useState<{ [key: string]: any }>({});
  const [savingServiceConfig, setSavingServiceConfig] = useState<{ [key: string]: boolean }>({});
  const [tempServiceUrls, setTempServiceUrls] = useState<{ [key: string]: string }>({});

  // Current platform detection
  const [currentPlatform, setCurrentPlatform] = useState<string>('');

  useEffect(() => {
    const loadSettings = async () => {
      const savedPersonalInfo = await db.getPersonalInfo();
      const savedApiConfig = await db.getAPIConfig();

      if (savedPersonalInfo) {
        // Merge with default UI preferences if they don't exist
        const mergedPersonalInfo = {
          ...savedPersonalInfo,
          ui_preferences: {
            ...DEFAULT_UI_PREFERENCES,
            ...savedPersonalInfo.ui_preferences
          }
        };
        setPersonalInfo(mergedPersonalInfo);
        setTheme(savedPersonalInfo.theme_preference as ThemeMode);
        
        // Apply UI preferences
        applyUIPreferences(mergedPersonalInfo);
      }

      if (savedApiConfig) {
        setApiConfig({
          ...savedApiConfig,
          openai_base_url: savedApiConfig.openai_base_url || 'https://api.openai.com/v1',
        });
      }

      // Load startup configuration
      await loadStartupConfig();

      // Load feature configuration
      await loadFeatureConfig();
    };

    // Listen for download progress updates from main process
    const handleDownloadProgress = (_event: any, progress: any) => {
      setDownloadProgress({
        isDownloading: true,
        percent: progress.percent || 0,
        transferred: progress.transferred || '0 B',
        total: progress.total || 'Unknown',
        fileName: progress.fileName || 'Clara Update'
      });
    };

    const handleDownloadCompleted = () => {
      setDownloadProgress(null);
    };

    const handleDownloadError = () => {
      setDownloadProgress(null);
    };

    // Set up IPC listeners for download progress
    if ((window as any).electronAPI?.on) {
      (window as any).electronAPI.on('update-download-progress', handleDownloadProgress);
      (window as any).electronAPI.on('update-download-completed', handleDownloadCompleted);
      (window as any).electronAPI.on('update-download-error', handleDownloadError);
    }

    loadSettings();

    // Cleanup listeners on unmount
    return () => {
      if ((window as any).electronAPI?.removeAllListeners) {
        (window as any).electronAPI.removeAllListeners('update-download-progress');
        (window as any).electronAPI.removeAllListeners('update-download-completed');
        (window as any).electronAPI.removeAllListeners('update-download-error');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load startup configuration from personal info
  const loadStartupConfig = async () => {
    try {
      const personalInfo = await db.getPersonalInfo();
      if (personalInfo?.startup_settings) {
        setStartupConfig(personalInfo.startup_settings);
      }
    } catch (error) {
      console.error('Failed to load startup configuration:', error);
    }
  };

  // Load feature configuration
  const loadFeatureConfig = async () => {
    try {
      if ((window as any).featureConfig?.getFeatureConfig) {
        const config = await (window as any).featureConfig.getFeatureConfig();
        if (config) {
          setFeatureConfig(config);
        }
      }
      setFeatureConfigLoaded(true);
    } catch (error) {
      console.error('Failed to load feature configuration:', error);
      setFeatureConfigLoaded(true);
    }
  };

  // Update startup configuration
  const updateStartupConfig = async (updates: Partial<StartupConfig>) => {
    try {
      const newConfig = { ...startupConfig, ...updates };
      setStartupConfig(newConfig);
      
      // Update personal info with new startup settings (for database persistence)
      const currentPersonalInfo = await db.getPersonalInfo();
      const updatedPersonalInfo = {
        ...currentPersonalInfo,
        name: currentPersonalInfo?.name || '',
        email: currentPersonalInfo?.email || '',
        avatar_url: currentPersonalInfo?.avatar_url || '',
        timezone: currentPersonalInfo?.timezone || 'UTC',
        theme_preference: currentPersonalInfo?.theme_preference || 'system' as const,
        startup_settings: newConfig
      };
      
      await db.updatePersonalInfo(updatedPersonalInfo);
      
      // Also update the electron main process settings
      if ((window as any).electron?.setStartupSettings) {
        const result = await (window as any).electron.setStartupSettings(newConfig);
        if (!result.success) {
          throw new Error(result.error || 'Failed to update startup settings in electron');
        }
      }
      
    } catch (error) {
      console.error('Failed to update startup configuration:', error);
      // Revert on error
      setStartupConfig(startupConfig);
    }
  };

  // Update feature configuration
  const updateFeatureConfig = async (updates: Partial<typeof featureConfig>) => {
    try {
      setSavingFeatureConfig(true);
      const newConfig = { ...featureConfig, ...updates };
      
      // Clara Core is always enabled
      newConfig.claraCore = true;
      
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
      console.log('🔄 Settings - Dispatched feature-config-updated event');
      
    } catch (error) {
      console.error('Failed to update feature configuration:', error);
      // Revert on error
      setFeatureConfig(featureConfig);
      alert('❌ Failed to save feature configuration. Please try again.');
    } finally {
      setSavingFeatureConfig(false);
    }
  };

  // Reset first-time setup
  const resetFirstTimeSetup = async () => {
    try {
      // For now, just show a message - this would need to be implemented in electron
      alert('✅ First-time setup reset functionality will be implemented in a future update.');
    } catch (error) {
      console.error('Failed to reset first-time setup:', error);
      alert('❌ Failed to reset first-time setup. Please try again.');
    }
  };

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

  // Check for updates when updates tab is first opened
  useEffect(() => {
    if (effectiveActiveTab === 'updates' && !updateInfo && !checkingUpdates) {
      checkForUpdates();
    }
  }, [effectiveActiveTab, updateInfo, checkingUpdates]);

  // Auto-check for llama.cpp updates when updates tab is opened
  useEffect(() => {
    if (effectiveActiveTab === 'updates' && !llamacppUpdateInfo && !checkingLlamacppUpdates) {
      // Small delay to avoid overwhelming the UI
      setTimeout(() => {
        checkForLlamacppUpdates();
      }, 500);
    }
  }, [effectiveActiveTab, llamacppUpdateInfo, checkingLlamacppUpdates]);

  // Add auto-detection when API tab is opened
  useEffect(() => {
    if (effectiveActiveTab === 'api' && !providersLoading) {
      // Only auto-detect if no providers exist or only Clara's Core exists
      const nonCoreProviders = providers.filter(p => p.type !== 'claras-pocket');
      if (nonCoreProviders.length === 0) {
        autoDetectOllamaProvider();
      }
    }
  }, [activeTab, providersLoading, providers]);

  // Check URL parameters on mount to set initial tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['personal', 'api', 'preferences', 'models', 'mcp', 'toolbelt', 'updates', 'sdk-demo', 'servers'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, []);

  // Check Docker services status
  useEffect(() => {
    const checkDockerServices = async () => {
      try {
        if ((window.electron as any)?.checkDockerServices) {
          const status = await (window.electron as any).checkDockerServices();
          setDockerServices(status);
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

  // Load Python backend information
  useEffect(() => {
    const loadPythonBackendInfo = async () => {
      try {
        if ((window.electron as any)?.getPythonBackendInfo) {
          const info = await (window.electron as any).getPythonBackendInfo();
          setPythonBackendInfo(info);
        }
      } catch (error) {
        console.error('Failed to load Python backend info:', error);
      }
    };

    if (effectiveActiveTab === 'servers') {
      loadPythonBackendInfo();
    }
  }, [effectiveActiveTab]);

  // Load available system fonts
  useEffect(() => {
    const loadFonts = async () => {
      try {
        setFontsLoading(true);
        const fonts = await detectSystemFonts();
        setAvailableFonts(fonts);
      } catch (error) {
        console.error('Failed to detect system fonts:', error);
        // Fall back to a basic set of fonts if detection fails
        setAvailableFonts([
          { value: 'system-ui', label: 'System Default', description: 'Your system\'s default font', category: 'System' },
          { value: 'Arial, sans-serif', label: 'Arial', description: 'Classic sans-serif', category: 'Classic' },
          { value: 'Georgia, serif', label: 'Georgia', description: 'Readable serif font', category: 'Classic' },
          { value: 'Monaco, Consolas, monospace', label: 'Monaco', description: 'Code editor font', category: 'Code' },
        ]);
      } finally {
        setFontsLoading(false);
      }
    };

    loadFonts();
  }, []);

  // Update checking functionality - Enhanced with bulletproof error handling
  const checkForUpdates = async () => {
    const electron = window.electron as any;

    // Validate electron availability
    if (!electron) {
      console.error('Electron API not available');
      setUpdateInfo({
        error: 'Application API not available. Please restart the application.',
        hasUpdate: false,
        currentVersion: '1.0.0',
        platform: 'unknown',
        isOTASupported: false
      });
      setCheckingUpdates(false);
      return;
    }

    if (!electron.getUpdateInfo) {
      console.error('Update functionality not available');
      setUpdateInfo({
        error: 'Update functionality is not available in this version.',
        hasUpdate: false,
        currentVersion: '1.0.0',
        platform: 'unknown',
        isOTASupported: false
      });
      setCheckingUpdates(false);
      return;
    }

    // Prevent concurrent checks
    if (checkingUpdates) {
      console.warn('Update check already in progress');
      return;
    }

    setCheckingUpdates(true);
    setUpdateInfo(null); // Clear previous results

    try {
      console.log('Starting update check...');
      const info = await electron.getUpdateInfo();

      // Validate response structure
      if (!info || typeof info !== 'object') {
        throw new Error('Invalid update information received');
      }

      // Ensure required fields exist
      const safeInfo = {
        hasUpdate: Boolean(info.hasUpdate),
        currentVersion: info.currentVersion || '1.0.0',
        latestVersion: info.latestVersion || info.currentVersion || '1.0.0',
        platform: info.platform || 'unknown',
        isOTASupported: Boolean(info.isOTASupported),
        releaseUrl: info.releaseUrl || '',
        downloadUrl: info.downloadUrl || '',
        releaseNotes: info.releaseNotes || 'No release notes available.',
        publishedAt: info.publishedAt || null,
        error: info.error || null
      };

      setUpdateInfo(safeInfo);
      setLastUpdateCheck(new Date());

      console.log('Update check completed successfully:', {
        hasUpdate: safeInfo.hasUpdate,
        currentVersion: safeInfo.currentVersion,
        latestVersion: safeInfo.latestVersion,
        error: safeInfo.error
      });

    } catch (error) {
      console.error('Error checking for updates:', error);

      // Create safe error response
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred while checking for updates';

      const errorInfo: UpdateInfo = {
        hasUpdate: false,
        error: errorMessage,
        currentVersion: '1.0.0',
        platform: 'unknown',
        isOTASupported: false
      };

      setUpdateInfo(errorInfo);
      setLastUpdateCheck(new Date());

      // Log additional context for debugging
      console.error('Update check error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleManualUpdateCheck = async () => {
    const electron = window.electron as any;

    // Validate electron availability
    if (!electron) {
      console.error('Electron API not available');
      return;
    }

    if (!electron.checkForUpdates) {
      console.error('Manual update check not available');
      return;
    }

    // Prevent concurrent manual checks
    if (checkingUpdates) {
      console.warn('Update check already in progress');
      return;
    }

    try {
      console.log('Starting manual update check...');

      // Call the manual update check (may show dialogs)
      await electron.checkForUpdates();

      console.log('Manual update check initiated successfully');

      // Refresh update info after manual check with delay
      setTimeout(() => {
        if (!checkingUpdates) { // Only refresh if not already checking
          checkForUpdates();
        }
      }, 1500);

    } catch (error) {
      console.error('Error during manual update check:', error);

      // Show user-friendly error
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to check for updates manually';

      setUpdateInfo((prev: UpdateInfo | null) => ({
        hasUpdate: false,
        error: errorMessage,
        currentVersion: prev?.currentVersion || '1.0.0',
        platform: prev?.platform || 'unknown',
        isOTASupported: prev?.isOTASupported || false
      }));
    }
  };

  const openReleaseNotes = () => {
    if (updateInfo?.releaseUrl) {
      window.open(updateInfo.releaseUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadUpdate = async () => {
    if (!updateInfo?.downloadUrl) {
      return;
    }

    try {
      // Check if this is a manual platform (Windows/Linux)
      if (updateInfo.platform !== 'darwin') {
        // Start download progress tracking
        setDownloadProgress({
          isDownloading: true,
          percent: 0,
          transferred: '0 B',
          total: updateInfo.assetSize || 'Unknown',
          fileName: `Clara-${updateInfo.latestVersion}-${updateInfo.platform}.${updateInfo.platform === 'win32' ? 'exe' : 'AppImage'}`
        });

        // Start in-app download for manual platforms
        const result = await (window as any).electronAPI?.startInAppDownload?.(updateInfo);
        
        if (result?.success) {
          // Download completed successfully
          setDownloadProgress(null);
          console.log('In-app download completed successfully');
        } else {
          // Download failed, reset progress and fallback to browser
          setDownloadProgress(null);
          console.warn('In-app download failed, falling back to browser:', result?.error);
          window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        // For macOS, use OTA update system
        await (window as any).electronAPI?.checkForUpdates?.();
      }
    } catch (error) {
      console.error('Error starting download:', error);
      // Reset progress and fallback to browser download
      setDownloadProgress(null);
      window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getPlatformName = (platform: string) => {
    if (!platform || typeof platform !== 'string') {
      return 'Unknown Platform';
    }

    switch (platform.toLowerCase()) {
      case 'darwin': return 'macOS';
      case 'win32': return 'Windows';
      case 'linux': return 'Linux';
      default: return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
  };

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
        
        // Apply UI preferences whenever personal info changes
        applyUIPreferences(personalInfo);
        
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

  // Handle UI preference changes
  const handleUIPreferenceChange = (updates: Partial<PersonalInfo['ui_preferences']>) => {
    const newPersonalInfo = {
      ...personalInfo,
      ui_preferences: {
        ...DEFAULT_UI_PREFERENCES,
        ...personalInfo.ui_preferences,
        ...updates
      }
    };
    setPersonalInfo(newPersonalInfo);
    
    // Apply changes immediately
    applyUIPreferences(newPersonalInfo);
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

  // Handle built-in wallpaper selection
  const handleBuiltinWallpaperSelect = async (wallpaper: any) => {
    try {
      console.log(`🎨 Processing built-in wallpaper: ${wallpaper.name || 'Unknown'}`);
      
      let processedUrl = wallpaper.url;
      
      // If it's a gradient, create gradient wallpaper
      if (wallpaper.category === 'Gradients' && wallpaper.preview) {
        console.log('🌈 Creating gradient wallpaper...');
        processedUrl = createGradientWallpaper(wallpaper.preview);
      }
      
      // Apply current effects if any
      const effects: ImageEffects = {
        opacity: personalInfo.ui_preferences?.wallpaper_opacity || 0.1,
        blur: personalInfo.ui_preferences?.wallpaper_blur || 1,
        brightness: personalInfo.ui_preferences?.wallpaper_brightness || 1,
        contrast: personalInfo.ui_preferences?.wallpaper_contrast || 1,
        saturate: personalInfo.ui_preferences?.wallpaper_saturate || 1
      };
      
      console.log('🎨 Applying effects:', effects);
      const finalUrl = await processWallpaper({ imageUrl: processedUrl, effects });
      
      // Store processed wallpaper
      await db.setWallpaper(finalUrl);
      setWallpaperUrl(finalUrl);
      setShowBuiltinGallery(false);
      
      console.log('✅ Successfully applied built-in wallpaper');
      
    } catch (error) {
      console.error('💥 Error setting built-in wallpaper:', error);
      
      // Try without effects as fallback
      try {
        console.log('🔄 Trying without effects...');
        let fallbackUrl = wallpaper.url;
        
        if (wallpaper.category === 'Gradients' && wallpaper.preview) {
          fallbackUrl = createGradientWallpaper(wallpaper.preview);
        }
        
        await db.setWallpaper(fallbackUrl);
        setWallpaperUrl(fallbackUrl);
        setShowBuiltinGallery(false);
        console.log('✅ Applied built-in wallpaper without effects');
      } catch (fallbackError) {
        console.error('💥 Complete wallpaper application failed:', fallbackError);
        alert('Failed to apply wallpaper. Please try a different one.');
      }
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

  // Tab component - Main category tabs
  const MainTabItem = ({ id, label, icon, isActive }: { 
    id: 'interface' | 'ai-models' | 'system' | 'profile', 
    label: string, 
    icon: React.ReactNode, 
    isActive: boolean 
  }) => (
    <button
      onClick={() => setActiveMainTab(id)}
      className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${isActive
          ? 'bg-sakura-500 text-white'
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
        }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  // Sub-tab components
  const SubTabItem = ({ 
    id, 
    label, 
    isActive, 
    onClick 
  }: { 
    id: string, 
    label: string, 
    isActive: boolean,
    onClick: () => void
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${isActive
          ? 'bg-sakura-100 text-sakura-700 dark:bg-sakura-900/30 dark:text-sakura-300'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
    >
      {label}
    </button>
  );

  // Legacy tab component (keeping for backward compatibility during transition)
  const TabItem = ({ id, label, icon, isActive }: { id: typeof activeTab, label: string, icon: React.ReactNode, isActive: boolean }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${isActive
          ? 'bg-sakura-500 text-white'
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
        }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  // Model sub-tab component
  const ModelTabItem = ({ id, label, isActive }: { id: typeof activeModelTab, label: string, isActive: boolean }) => (
    <button
      onClick={() => setActiveModelTab(id)}
      className={`px-4 py-2 rounded-lg transition-colors font-medium ${isActive
          ? 'bg-sakura-500 text-white'
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
        }`}
    >
      {label}
    </button>
  );

  // Provider management functions
  const handleAddProvider = async () => {
    try {
      await addProvider({
        name: newProviderForm.name,
        type: newProviderForm.type,
        baseUrl: newProviderForm.baseUrl,
        apiKey: newProviderForm.apiKey,
        isEnabled: newProviderForm.isEnabled,
        isPrimary: false
      });

      setShowAddProviderModal(false);
      setNewProviderForm({
        name: '',
        type: 'openai',
        baseUrl: '',
        apiKey: '',
        isEnabled: true
      });
    } catch (error) {
      console.error('Error adding provider:', error);
      if (error instanceof Error && error.message.includes("Clara's Pocket provider already exists")) {
        alert("⚠️ Clara's Pocket provider already exists. Only one instance is allowed.");
      } else {
        alert('❌ Failed to add provider. Please try again.');
      }
    }
  };

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setNewProviderForm({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl || '',
      apiKey: provider.apiKey || '',
      isEnabled: provider.isEnabled
    });
    setShowAddProviderModal(true);
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider) return;

    try {
      await updateProvider(editingProvider.id, {
        name: newProviderForm.name,
        type: newProviderForm.type,
        baseUrl: newProviderForm.baseUrl,
        apiKey: newProviderForm.apiKey,
        isEnabled: newProviderForm.isEnabled
      });

      setShowAddProviderModal(false);
      setEditingProvider(null);
      setNewProviderForm({
        name: '',
        type: 'openai',
        baseUrl: '',
        apiKey: '',
        isEnabled: true
      });
    } catch (error) {
      console.error('Error updating provider:', error);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    try {
      await deleteProvider(providerId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting provider:', error);
    }
  };

  const testOllamaConnection = async (providerId: string, baseUrl: string) => {
    setTestingProvider(providerId);
    setTestResults(prev => ({ ...prev, [providerId]: null }));

    try {
      // Remove /v1 from baseUrl for the tags endpoint since Ollama's tags endpoint is at /api/tags, not /v1/api/tags
      const testUrl = baseUrl.replace('/v1', '');
      const response = await fetch(`${testUrl}/api/tags`);
      if (response.ok) {
        setTestResults(prev => ({ ...prev, [providerId]: 'success' }));
      } else {
        setTestResults(prev => ({ ...prev, [providerId]: 'error' }));
      }
    } catch (error) {
      setTestResults(prev => ({ ...prev, [providerId]: 'error' }));
      console.error('Ollama connection test failed:', error);
    } finally {
      setTestingProvider(null);

      // Clear test results after 3 seconds
      setTimeout(() => {
        setTestResults(prev => ({ ...prev, [providerId]: null }));
      }, 3000);
    }
  };

  const handleSetPrimary = async (providerId: string, isPrimary: boolean) => {
    try {
      if (isPrimary) {
        await setPrimaryProvider(providerId);
      } else {
        // If unchecking primary, we need to ensure at least one provider remains primary
        const enabledProviders = providers.filter(p => p.isEnabled && p.id !== providerId);
        if (enabledProviders.length > 0) {
          await setPrimaryProvider(enabledProviders[0].id);
        }
      }
    } catch (error) {
      console.error('Error setting primary provider:', error);
    }
  };

  const getProviderIcon = (type: Provider['type']) => {
    switch (type) {
      case 'claras-pocket':
        return Bot;
      case 'openai':
        return Zap;
      case 'openrouter':
        return Router;
      case 'ollama':
        return Server;
      default:
        return Globe;
    }
  };

  const getDefaultProviderConfig = (type: Provider['type']) => {
    switch (type) {
      case 'openai':
        return { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' };
      case 'openrouter':
        return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
      case 'ollama':
        return { baseUrl: 'http://localhost:11434/v1', name: 'Ollama' };
      case 'claras-pocket':
        return { baseUrl: 'http://localhost:8091/v1', name: "Clara's Core" };
      default:
        return { baseUrl: '', name: '' };
    }
  };

  // Auto-detect Ollama installation
  const detectOllamaInstallation = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  // Auto-detect Ollama installation
  const autoDetectOllamaProvider = async () => {
    try {
      // Check if Ollama provider already exists
      const ollamaExists = providers.some(p => p.type === 'ollama');
      if (ollamaExists) {
        return; // Don't add duplicate
      }

      const isRunning = await detectOllamaInstallation();
      if (isRunning) {
        console.log('Auto-detected Ollama installation, adding provider...');
        await addProvider({
          name: 'Ollama (Local)',
          type: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'ollama',
          isEnabled: true,
          isPrimary: false
        });
      }
    } catch (error) {
      console.log('Auto-detection error:', error);
    }
  };

  // Llama.cpp binary update functions
  const checkForLlamacppUpdates = async () => {
    const electron = window.electron as any;

    if (!electron?.checkLlamacppUpdates) {
      console.error('Llama.cpp update functionality not available');
      setLlamacppUpdateInfo({
        error: 'Llama.cpp update functionality is not available in this version.',
        hasUpdate: false,
        currentVersion: 'Unknown',
        platform: 'unknown'
      });
      setCheckingLlamacppUpdates(false);
      return;
    }

    if (checkingLlamacppUpdates) {
      console.warn('Llama.cpp update check already in progress');
      return;
    }

    setCheckingLlamacppUpdates(true);
    setLlamacppUpdateInfo(null);

    try {
      console.log('Starting llama.cpp binary update check...');
      const info = await electron.checkLlamacppUpdates();

      const safeInfo = {
        hasUpdate: Boolean(info.hasUpdate),
        currentVersion: info.currentVersion || 'Unknown',
        latestVersion: info.latestVersion || info.currentVersion || 'Unknown',
        platform: info.platform || 'unknown',
        downloadSize: info.downloadSize || 'Unknown size',
        releaseUrl: info.releaseUrl || '',
        publishedAt: info.publishedAt || null,
        error: info.error || null
      };

      setLlamacppUpdateInfo(safeInfo);
      setLastLlamacppUpdateCheck(new Date());

      console.log('Llama.cpp update check completed:', {
        hasUpdate: safeInfo.hasUpdate,
        currentVersion: safeInfo.currentVersion,
        latestVersion: safeInfo.latestVersion,
        error: safeInfo.error
      });

    } catch (error) {
      console.error('Error checking for llama.cpp updates:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred while checking for llama.cpp updates';

      setLlamacppUpdateInfo({
        hasUpdate: false,
        error: errorMessage,
        currentVersion: 'Unknown',
        platform: 'unknown'
      });
      setLastLlamacppUpdateCheck(new Date());
    } finally {
      setCheckingLlamacppUpdates(false);
    }
  };

  const updateLlamacppBinaries = async () => {
    const electron = window.electron as any;

    if (!electron?.updateLlamacppBinaries) {
      console.error('Llama.cpp binary update functionality not available');
      return;
    }

    if (updatingLlamacppBinaries) {
      console.warn('Llama.cpp binary update already in progress');
      return;
    }

    setUpdatingLlamacppBinaries(true);

    try {
      console.log('Starting llama.cpp binary update...');
      const result = await electron.updateLlamacppBinaries();

      if (result.success) {
        // Refresh update info
        await checkForLlamacppUpdates();
        
        // Show success message
        console.log('Official Llama.cpp Binaries Updated:', result.message || `Successfully updated official binaries to version ${result.version}. Clara's custom binaries were preserved.`);
      } else {
        console.error('Binary update failed:', result.error);
      }

    } catch (error) {
      console.error('Error updating llama.cpp binaries:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to update llama.cpp binaries';

      setLlamacppUpdateInfo(prev => prev ? {
        ...prev,
        error: errorMessage
      } : null);
    } finally {
      setUpdatingLlamacppBinaries(false);
    }
  };

  useEffect(() => {
    // Detect current platform
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) setCurrentPlatform('darwin');
    else if (platform.includes('win')) setCurrentPlatform('win32'); 
    else setCurrentPlatform('linux');
  }, []);

  // Load service configurations when Services tab is opened
  useEffect(() => {
    if (effectiveActiveTab === 'servers') {
      loadServiceConfigurations();
    }
  }, [effectiveActiveTab]);

  // Load service configurations
  const loadServiceConfigurations = async () => {
    setLoadingServiceConfigs(true);
    try {
      // Load platform compatibility
      if ((window as any).electronAPI?.invoke) {
        const compatibility = await (window as any).electronAPI.invoke('service-config:get-platform-compatibility');
        setPlatformCompatibility(compatibility);

        // Load current service configurations
        const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
        setServiceConfigs(configs);

                                // Load enhanced service status
                        const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
                        console.log('🔍 Enhanced service status received by UI:', status);
                        setEnhancedServiceStatus(status);

                        // Clear temp URLs to show the saved URLs properly
                        setTempServiceUrls({});
      }
    } catch (error) {
      console.error('Failed to load service configurations:', error);
    } finally {
      setLoadingServiceConfigs(false);
    }
  };

  // Update service configuration
  const updateServiceConfig = async (serviceName: string, mode: string, url?: string) => {
    setSavingServiceConfig(prev => ({ ...prev, [serviceName]: true }));
    try {
      const result = await (window as any).electronAPI.invoke('service-config:set-config', serviceName, mode, url);
      if (result.success) {
        // Reload configurations
        await loadServiceConfigurations();
        console.log(`✅ ${serviceName} configured as ${mode}${url ? ` with URL: ${url}` : ''}`);
        
        // Clear temp URL since it's now saved
        setTempServiceUrls(prev => ({ ...prev, [serviceName]: '' }));
        
        // Show success feedback
        setServiceTestResults(prev => ({ 
          ...prev, 
          [serviceName]: { 
            success: true, 
            message: 'Configuration saved successfully!',
            timestamp: Date.now()
          }
        }));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setServiceTestResults(prev => ({ ...prev, [serviceName]: null }));
        }, 3000);
      } else {
        console.error(`Failed to configure ${serviceName}:`, result.error);
        setServiceTestResults(prev => ({ 
          ...prev, 
          [serviceName]: { 
            success: false, 
            error: result.error || 'Failed to save configuration',
            timestamp: Date.now()
          }
        }));
      }
    } catch (error) {
      console.error(`Error configuring ${serviceName}:`, error);
      setServiceTestResults(prev => ({ 
        ...prev, 
        [serviceName]: { 
          success: false, 
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        }
      }));
    } finally {
      setSavingServiceConfig(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Save manual service URL
  const saveManualServiceUrl = async (serviceName: string) => {
    let url = tempServiceUrls[serviceName] || serviceConfigs[serviceName]?.url || '';
    if (!url.trim()) {
      setServiceTestResults(prev => ({ 
        ...prev, 
        [serviceName]: { 
          success: false, 
          error: 'Please enter a valid URL',
          timestamp: Date.now()
        }
      }));
      return;
    }
    
    // Auto-detect and fix protocol for HTTPS URLs
    url = url.trim();
    if (url.includes('login.badboysm890.in') && !url.startsWith('https://')) {
      // This domain requires HTTPS
      url = url.replace(/^http:\/\//, 'https://');
      if (!url.startsWith('https://')) {
        url = 'https://' + url;
      }
      console.log(`🔒 Auto-corrected URL to use HTTPS: ${url}`);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Add http:// for localhost and other URLs without protocol
      url = 'http://' + url;
    }
    
    // Save the configuration
    await updateServiceConfig(serviceName, 'manual', url);
    
    // Clear temp URL after successful save so saved URL shows in input
    setTimeout(() => {
      setTempServiceUrls(prev => ({ ...prev, [serviceName]: '' }));
    }, 500);
  };

  // Test manual service connectivity
  const testManualService = async (serviceName: string, inputUrl: string) => {
    setTestingServices(prev => ({ ...prev, [serviceName]: true }));
    setServiceTestResults(prev => ({ ...prev, [serviceName]: null }));

    // Apply the same URL correction logic as save function
    let url = inputUrl.trim();
    if (url.includes('login.badboysm890.in') && !url.startsWith('https://')) {
      // This domain requires HTTPS
      url = url.replace(/^http:\/\//, 'https://');
      if (!url.startsWith('https://')) {
        url = 'https://' + url;
      }
      console.log(`🔒 Auto-corrected URL for test to use HTTPS: ${url}`);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Add http:// for localhost and other URLs without protocol
      url = 'http://' + url;
    }

    try {
      const result = await (window as any).electronAPI.invoke('service-config:test-manual-service', serviceName, url);
      setServiceTestResults(prev => ({ ...prev, [serviceName]: result }));
      
      // Auto-save URL if test is successful
      if (result.success) {
        console.log(`✅ ${serviceName} connection test successful, auto-saving corrected URL: ${url}`);
        await updateServiceConfig(serviceName, 'manual', url);
        
        // Clear temp URL since it's now saved
        setTempServiceUrls(prev => ({ ...prev, [serviceName]: '' }));
        
        // Show success message with auto-save info
        setServiceTestResults(prev => ({ 
          ...prev, 
          [serviceName]: { 
            ...result,
            message: 'Connection successful! Configuration auto-saved.',
            timestamp: Date.now()
          }
        }));
      }
      
      // Clear result after 5 seconds
      setTimeout(() => {
        setServiceTestResults(prev => ({ ...prev, [serviceName]: null }));
      }, 5000);
    } catch (error) {
      console.error(`Failed to test ${serviceName}:`, error);
      setServiceTestResults(prev => ({ 
        ...prev, 
        [serviceName]: { 
          success: false, 
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        }
      }));
    } finally {
      setTestingServices(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  // Reset service configuration to defaults
  const resetServiceConfig = async (serviceName: string) => {
    try {
      const result = await (window as any).electronAPI.invoke('service-config:reset-config', serviceName);
      if (result.success) {
        await loadServiceConfigurations();
        console.log(`✅ ${serviceName} configuration reset to defaults`);
      }
    } catch (error) {
      console.error(`Failed to reset ${serviceName} configuration:`, error);
    }
  };

  // Load gallery images for wallpaper selection
  const loadGalleryImages = async () => {
    setIsLoadingGalleryImages(true);
    try {
      // Use the same fallback method as the Gallery component
      let storedItems;
      try {
        storedItems = await indexedDBService.getAll('storage');
      } catch (error) {
        console.error('IndexedDB retrieval failed, falling back to localStorage', error);
        const data = localStorage.getItem('clara_db_storage');
        storedItems = data ? JSON.parse(data) : [];
      }
      
      const imageItems = storedItems.filter((item: any) => item.type === 'image');
      const galleryImages: GalleryImage[] = imageItems.map((item: any, idx: number) => {
        let finalPrompt = item.description ?? '';
        if (finalPrompt.startsWith('Prompt:')) {
          finalPrompt = finalPrompt.replace(/^Prompt:\s*/, '');
        }
        return {
          id: item.id ?? `img-${idx}`,
          url: item.data,
          prompt: finalPrompt,
          createdAt: item.timestamp || new Date().toISOString(),
          likes: item.likes ?? 0,
          views: item.views ?? 0,
          model: item.model || 'SD-Model',
          resolution: item.resolution || '1024x1024'
        };
      });
      
      // Sort by newest first and take only 10 recent images initially
      galleryImages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setGalleryImages(galleryImages);
    } catch (error) {
      console.error('Error loading gallery images:', error);
    } finally {
      setIsLoadingGalleryImages(false);
    }
  };

  // Handle setting a gallery image as wallpaper
  const handleGalleryImageWallpaper = async (image: GalleryImage) => {
    try {
      await db.setWallpaper(image.url);
      setWallpaperUrl(image.url);
      setShowYourCreations(false);
      console.log('✅ Set gallery image as wallpaper');
    } catch (error) {
      console.error('Error setting gallery image as wallpaper:', error);
      alert('Failed to set image as wallpaper. Please try again.');
    }
  };

  // Load gallery images when "Your Creations" is first opened
  useEffect(() => {
    if (showYourCreations && galleryImages.length === 0) {
      loadGalleryImages();
    }
  }, [showYourCreations]);

  // Filter gallery images based on search query
  const filteredGalleryImages = galleryImages.filter(image => 
    image.prompt.toLowerCase().includes(gallerySearchQuery.toLowerCase()) ||
    image.model.toLowerCase().includes(gallerySearchQuery.toLowerCase())
  ).slice(0, 10); // Show only 10 images

  // Handle setting avatar image
  const handleSetAvatar = () => {
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
            // Update personal info with the new avatar
            const updatedInfo = { ...personalInfo, avatar_url: base64String };
            setPersonalInfo(updatedInfo);
            // Save to database
            await db.updatePersonalInfo(updatedInfo);
            console.log('✅ Avatar uploaded successfully');
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Error setting avatar:', error);
          alert('Failed to upload avatar. Please try again.');
        }
      }
    };
    input.click();
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
            opacity: 0.15, // Subtle background opacity for readability
            pointerEvents: 'none'
          }}
        />
      )}

      <div className="p-6 flex max-w-7xl mx-auto gap-6 relative z-10 h-[calc(100vh-3rem)]">
        {/* Sidebar with tabs */}
        <div className="w-64 shrink-0">
          <div className="glassmorphic rounded-xl p-4 space-y-4 sticky top-4">
            <h2 className="flex items-center gap-2 px-4 py-3 text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 mb-2">
              <SettingsIcon className="w-5 h-5 text-sakura-500" />
              Settings
            </h2>

            {/* Main Category Tabs */}
            <div className="space-y-2">
              <MainTabItem
                id="interface"
                label="Interface"
                icon={<Palette className="w-5 h-5" />}
                isActive={activeMainTab === 'interface'}
              />

              <MainTabItem
                id="ai-models"
                label="AI & Models"
                icon={<Bot className="w-5 h-5" />}
                isActive={activeMainTab === 'ai-models'}
              />

              <MainTabItem
                id="system"
                label="System"
                icon={<Server className="w-5 h-5" />}
                isActive={activeMainTab === 'system'}
              />

              <MainTabItem
                id="profile"
                label="Profile"
                icon={<User className="w-5 h-5" />}
                isActive={activeMainTab === 'profile'}
              />
            </div>

            {/* Sub-tabs based on active main tab */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              {activeMainTab === 'interface' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 mb-2">
                    Interface
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <SubTabItem
                      id="appearance"
                      label="Appearance"
                      isActive={activeInterfaceTab === 'appearance'}
                      onClick={() => setActiveInterfaceTab('appearance')}
                    />
                    <SubTabItem
                      id="ui-preferences"
                      label="Customize"
                      isActive={activeInterfaceTab === 'ui-preferences'}
                      onClick={() => setActiveInterfaceTab('ui-preferences')}
                    />
                  </div>
                </div>
              )}

              {activeMainTab === 'ai-models' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 mb-2">
                    AI & Models
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <SubTabItem
                      id="api"
                      label="AI Services"
                      isActive={activeAITab === 'api'}
                      onClick={() => setActiveAITab('api')}
                    />
                    <SubTabItem
                      id="models"
                      label="Local Models"
                      isActive={activeAITab === 'models'}
                      onClick={() => setActiveAITab('models')}
                    />
                    <SubTabItem
                      id="mcp"
                      label="MCP Servers"
                      isActive={activeAITab === 'mcp'}
                      onClick={() => setActiveAITab('mcp')}
                    />
                  </div>
                </div>
              )}

              {activeMainTab === 'system' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 mb-2">
                    System
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <SubTabItem
                      id="services"
                      label="Services"
                      isActive={activeSystemTab === 'services'}
                      onClick={() => setActiveSystemTab('services')}
                    />
                    <SubTabItem
                      id="toolbelt"
                      label="Tools"
                      isActive={activeSystemTab === 'toolbelt'}
                      onClick={() => setActiveSystemTab('toolbelt')}
                    />
                    <SubTabItem
                      id="updates"
                      label="Updates"
                      isActive={activeSystemTab === 'updates'}
                      onClick={() => setActiveSystemTab('updates')}
                    />
                  </div>
                </div>
              )}

              {activeMainTab === 'profile' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 mb-2">
                    Profile
                  </p>
                  <div className="text-sm text-gray-600 dark:text-gray-400 px-3">
                    Personal information and account settings
                  </div>
                </div>
              )}
            </div>

            {/* Save Status - Only visible when saving/saved/error */}
            {(isSaving || saveStatus !== 'idle') && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white transition-colors w-full ${saveStatus === 'success'
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
        <div className={`flex-1 space-y-6 py-2 pb-6 overflow-y-auto overflow-x-hidden ${effectiveActiveTab === 'models' ? '' : 'max-w-4xl'
          }`}>
          {/* Profile Tab */}
          {effectiveActiveTab === 'personal' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-6 h-6 text-sakura-500" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Profile
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Avatar
                  </label>
                  
                  {/* Avatar Preview */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-gray-200 dark:border-gray-600">
                      {personalInfo.avatar_url ? (
                        <img
                          src={personalInfo.avatar_url}
                          alt="Avatar preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If image fails to load, show fallback
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      {!personalInfo.avatar_url && (
                        <User className="w-8 h-8 text-gray-400" />
                      )}
                      {personalInfo.avatar_url && (
                        <User className="w-8 h-8 text-gray-400 hidden" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={handleSetAvatar}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                        >
                          Upload Image
                        </button>
                        {personalInfo.avatar_url && (
                          <button
                            onClick={() => setPersonalInfo(prev => ({ ...prev, avatar_url: '' }))}
                            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Upload an image or enter a URL below
                      </p>
                    </div>
                  </div>
                  
                  {/* Avatar URL Input */}
                  <input
                    type="url"
                    value={personalInfo.avatar_url}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, avatar_url: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="Or enter avatar URL: https://example.com/avatar.jpg"
                  />
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

          {/* AI Services Tab */}
          {effectiveActiveTab === 'api' && (
            <div className="space-y-6">
              {/* Providers Section */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Bot className="w-6 h-6 text-sakura-500" />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        AI Services
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Connect and manage your AI service providers
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingProvider(null);
                        setNewProviderForm({
                          name: '',
                          type: 'openai',
                          baseUrl: '',
                          apiKey: '',
                          isEnabled: true
                        });
                        setShowAddProviderModal(true);
                      }}
                      className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Service
                    </button>
                  </div>
                </div>

                {/* Providers List */}
                {providersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sakura-500"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {providers.map((provider) => {
                      const ProviderIcon = getProviderIcon(provider.type);
                      return (
                        <div
                          key={provider.id}
                          className={`group relative p-5 rounded-xl border transition-all duration-300 ${provider.isPrimary
                              ? 'border-sakura-200 dark:border-sakura-700 bg-gradient-to-br from-sakura-50/50 to-white/50 dark:from-sakura-900/20 dark:to-gray-800/50 shadow-lg shadow-sakura-100/50 dark:shadow-sakura-900/20'
                              : 'border-gray-200/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/40 hover:border-gray-300/80 dark:hover:border-gray-600/80'
                            } hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-gray-900/20 backdrop-blur-sm`}
                        >
                          {/* Primary indicator - subtle glow */}
                          {provider.isPrimary && (
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-sakura-400/20 to-sakura-600/20 rounded-xl blur-sm -z-10"></div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className={`relative w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${provider.isEnabled
                                  ? provider.isPrimary
                                    ? 'bg-sakura-100/80 dark:bg-sakura-900/40 border-2 border-sakura-200 dark:border-sakura-700'
                                    : 'bg-sakura-50/60 dark:bg-sakura-900/20 border border-sakura-200/50 dark:border-sakura-700/50'
                                  : 'bg-gray-100/80 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600'
                                }`}>
                                <ProviderIcon className={`w-7 h-7 ${provider.isEnabled
                                    ? 'text-sakura-600 dark:text-sakura-400'
                                    : 'text-gray-500 dark:text-gray-400'
                                  }`} />
                                {provider.isPrimary && (
                                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className={`font-semibold transition-colors ${provider.isPrimary
                                      ? 'text-gray-900 dark:text-white'
                                      : 'text-gray-800 dark:text-gray-200'
                                    }`}>
                                    {provider.name}
                                  </h4>
                                  {provider.isPrimary && (
                                    <span className="px-2.5 py-1 bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full border border-emerald-200/50 dark:border-emerald-700/50">
                                      Default
                                    </span>
                                  )}
                                  {!provider.isEnabled && (
                                    <span className="px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono truncate">
                                  {provider.baseUrl || 'No URL configured'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 capitalize font-medium">
                                  {provider.type.replace('-', ' ')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 ml-4">
                              {/* Elegant Default Toggle */}
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => handleSetPrimary(provider.id, !provider.isPrimary)}
                                  disabled={!provider.isEnabled}
                                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sakura-300 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed ${provider.isPrimary
                                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-500/25'
                                      : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                                    }`}
                                >
                                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${provider.isPrimary ? 'translate-x-6' : 'translate-x-0'
                                    }`}>
                                    {provider.isPrimary && (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    )}
                                  </div>
                                </button>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                  Default
                                </span>
                              </div>

                              {/* Test Button for Ollama */}
                              {provider.type === 'ollama' && provider.baseUrl && (
                                <button
                                  onClick={() => testOllamaConnection(provider.id, provider.baseUrl!)}
                                  disabled={testingProvider === provider.id}
                                  className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2 font-medium ${testResults[provider.id] === 'success'
                                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50 shadow-sm'
                                      : testResults[provider.id] === 'error'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/50 shadow-sm'
                                        : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700/50'
                                    }`}
                                >
                                  {testingProvider === provider.id ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                      Testing...
                                    </>
                                  ) : testResults[provider.id] === 'success' ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      Connected
                                    </>
                                  ) : testResults[provider.id] === 'error' ? (
                                    <>
                                      <X className="w-3 h-3" />
                                      Failed
                                    </>
                                  ) : (
                                    <>
                                      <Server className="w-3 h-3" />
                                      Test
                                    </>
                                  )}
                                </button>
                              )}

                              <button
                                onClick={() => handleEditProvider(provider)}
                                className="p-2.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                                title="Edit provider"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {provider.type !== 'claras-pocket' && (
                                <button
                                  onClick={() => setShowDeleteConfirm(provider.id)}
                                  className="p-2.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50/50 dark:hover:bg-red-900/20"
                                  title="Delete provider"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Image Generation Section */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Image className="w-6 h-6 text-sakura-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Image Generation
                  </h2>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ComfyUI Server URL
                  </label>
                  <input
                    type="url"
                    value={apiConfig.comfyui_base_url}
                    onChange={(e) => setApiConfig(prev => ({ ...prev, comfyui_base_url: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="http://localhost:8188"
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Connect to your ComfyUI instance for AI image generation
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Interface Preferences Tab - split into appearance and customization */}
          {effectiveActiveTab === 'preferences' && (
            <div className="space-y-6">
              {/* Show Appearance settings when appearance sub-tab is active */}
              {(activeMainTab !== 'interface' || activeInterfaceTab === 'appearance') && (
                <div className="glassmorphic rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <SettingsIcon className="w-6 h-6 text-sakura-500" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {activeMainTab === 'interface' ? 'Appearance' : 'General Settings'}
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

              {/* Show UI Customization when either not in interface mode, or ui-preferences sub-tab is active */}
              {(activeMainTab !== 'interface' || activeInterfaceTab === 'ui-preferences') && (
                <div className="glassmorphic rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Type className="w-6 h-6 text-purple-500" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {activeMainTab === 'interface' ? 'UI Customization' : 'UI Preferences'}
                    </h2>
                  </div>

                  <div className="space-y-6">
                  {/* Font Size Scaling */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Font Size
                    </label>
                    <div className="space-y-2">
                      <select
                        value={personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale}
                        onChange={(e) => handleUIPreferenceChange({ font_scale: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      >
                        {FONT_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {FONT_SCALE_OPTIONS.find(opt => opt.value === (personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale))?.description}
                      </p>
                    </div>
                  </div>

                  {/* Advanced Typography Controls */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Font Weight */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Font Weight
                      </label>
                      <select
                        value={personalInfo.ui_preferences?.font_weight || DEFAULT_UI_PREFERENCES.font_weight}
                        onChange={(e) => handleUIPreferenceChange({ font_weight: e.target.value as any })}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      >
                        {FONT_WEIGHT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Line Height */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Line Height
                      </label>
                      <select
                        value={personalInfo.ui_preferences?.line_height || DEFAULT_UI_PREFERENCES.line_height}
                        onChange={(e) => handleUIPreferenceChange({ line_height: e.target.value as any })}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      >
                        {LINE_HEIGHT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Letter Spacing */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Letter Spacing
                      </label>
                      <select
                        value={personalInfo.ui_preferences?.letter_spacing || DEFAULT_UI_PREFERENCES.letter_spacing}
                        onChange={(e) => handleUIPreferenceChange({ letter_spacing: e.target.value as any })}
                        className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      >
                        {LETTER_SPACING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Accent Color
                    </label>
                    <div className="space-y-3">
                      {/* Color Picker Grid */}
                      <div className="grid grid-cols-4 gap-3">
                        {ACCENT_COLOR_OPTIONS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => handleUIPreferenceChange({ accent_color: color.value })}
                            className={`group relative p-3 rounded-lg border transition-all ${
                              (personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color) === color.value
                                ? 'border-gray-400 dark:border-gray-500 ring-2 ring-offset-2 ring-gray-300 dark:ring-gray-600'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <div
                              className="w-8 h-8 rounded-full mx-auto mb-2 shadow-md"
                              style={{ backgroundColor: color.value }}
                            />
                            <div className="text-center">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {color.label}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {color.description}
                              </p>
                            </div>
                            {(personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color) === color.value && (
                              <div className="absolute top-1 right-1">
                                <Check className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Custom Color Input */}
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Custom Color
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color}
                            onChange={(e) => handleUIPreferenceChange({ accent_color: e.target.value })}
                            className="w-12 h-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (/^#[0-9A-Fa-f]{6}$/.test(value) || value === '') {
                                handleUIPreferenceChange({ accent_color: value });
                              }
                            }}
                            placeholder="#ec4899"
                            className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Enter a hex color code (e.g., #ec4899) to use a custom accent color
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Interface Presets */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Interface Presets
                      </label>
                      <button
                        onClick={() => alert('🎨 Custom theme creation coming soon! Save your perfect combination of colors, fonts, and styling.')}
                        className="text-xs px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        + Create Custom
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Complete visual themes inspired by popular AI interfaces • Hover to preview
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {FONT_PRESETS.map((preset) => {
                        const isActive = (personalInfo.ui_preferences?.font_family === preset.settings.font_family &&
                          personalInfo.ui_preferences?.accent_color === (preset.settings as any).accent_color);
                        
                        return (
                        <button
                          key={preset.id}
                          onClick={() => handleUIPreferenceChange(preset.settings)}
                          onMouseEnter={() => {
                            // Show preview tooltip on hover
                            const tooltip = document.getElementById(`preset-tooltip-${preset.id}`);
                            if (tooltip) tooltip.style.display = 'block';
                          }}
                          onMouseLeave={() => {
                            const tooltip = document.getElementById(`preset-tooltip-${preset.id}`);
                            if (tooltip) tooltip.style.display = 'none';
                          }}
                          className={`group relative p-4 rounded-xl border transition-all hover:shadow-lg bg-white/50 dark:bg-gray-800/50 text-left transform hover:scale-[1.02] ${
                            isActive 
                              ? 'border-sakura-300 dark:border-sakura-600 bg-sakura-50/50 dark:bg-sakura-900/20 shadow-md' 
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon and Color Preview */}
                            <div className="flex-shrink-0">
                              <div className="text-xl mb-2">{preset.icon}</div>
                              <div className="flex gap-1">
                                <div 
                                  className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm"
                                  style={{ backgroundColor: (preset.settings as any).accent_color }}
                                />
                                {/* Accessibility indicator */}
                                {preset.id === 'accessibility' && (
                                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                    <span className="text-white text-xs">A</span>
                                  </div>
                                )}
                                {/* Reading optimized indicator */}
                                {preset.id === 'readwise' && (
                                  <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                                    <span className="text-white text-xs">👁</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div 
                                  className="text-sm font-semibold text-gray-900 dark:text-white"
                                  style={{ 
                                    fontFamily: preset.settings.font_family,
                                    fontWeight: (preset.settings as any).font_weight === 'light' ? '300' : 
                                               (preset.settings as any).font_weight === 'normal' ? '400' :
                                               (preset.settings as any).font_weight === 'medium' ? '500' : 
                                               (preset.settings as any).font_weight === 'semibold' ? '600' : '400'
                                  }}
                                >
                                  {preset.name}
                                </div>
                                {/* Active indicator */}
                                {isActive && (
                                  <div className="flex items-center gap-1">
                                    <Check className="w-4 h-4 text-sakura-500 flex-shrink-0" />
                                    <span className="text-xs text-sakura-600 dark:text-sakura-400 font-medium">Active</span>
                                  </div>
                                )}
                              </div>
                              
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                {preset.description}
                              </p>
                              
                              {/* Typography Preview */}
                              <div 
                                className="text-xs text-gray-600 dark:text-gray-300 mb-2"
                                style={{ 
                                  fontFamily: preset.settings.font_family,
                                  fontSize: `${preset.settings.font_scale * 12}px`,
                                  lineHeight: (preset.settings as any).line_height === 'tight' ? '1.25' :
                                             (preset.settings as any).line_height === 'normal' ? '1.5' :
                                             (preset.settings as any).line_height === 'relaxed' ? '1.75' :
                                             (preset.settings as any).line_height === 'loose' ? '2.0' : '1.5',
                                  letterSpacing: (preset.settings as any).letter_spacing === 'tight' ? '-0.025em' :
                                                (preset.settings as any).letter_spacing === 'normal' ? '0' :
                                                (preset.settings as any).letter_spacing === 'wide' ? '0.025em' : '0',
                                  fontWeight: (preset.settings as any).font_weight === 'light' ? '300' : 
                                             (preset.settings as any).font_weight === 'normal' ? '400' :
                                             (preset.settings as any).font_weight === 'medium' ? '500' : 
                                             (preset.settings as any).font_weight === 'semibold' ? '600' : '400'
                                }}
                              >
                                How are you today? This is a sample of the interface with this preset applied.
                              </div>
                              
                              {/* Settings Summary with badges */}
                              <div className="flex items-center gap-2 text-xs">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400">
                                  {Math.round(preset.settings.font_scale * 100)}%
                                </span>
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400 capitalize">
                                  {(preset.settings as any).font_weight}
                                </span>
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-400 capitalize">
                                  {(preset.settings as any).line_height} spacing
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Hover tooltip with more details */}
                          <div 
                            id={`preset-tooltip-${preset.id}`}
                            className="absolute -top-2 -right-2 bg-black dark:bg-white text-white dark:text-black text-xs px-2 py-1 rounded shadow-lg z-50 hidden pointer-events-none"
                          >
                            Click to apply theme
                          </div>
                        </button>
                        );
                      })}
                    </div>
                    
                    {/* Theme Recommendations */}
                    <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-600 dark:text-purple-400">✨</span>
                        <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                          Smart Recommendations
                        </h4>
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
                        <p>• <strong>For long reading:</strong> Try "Reading Optimized" with serif fonts and comfortable spacing</p>
                        <p>• <strong>For accessibility:</strong> "High Readability" offers maximum contrast and larger text</p>
                        <p>• <strong>For developers:</strong> "GitHub Copilot" provides a familiar coding environment feel</p>
                        <p>• <strong>For focus:</strong> "Minimal Clean" reduces visual distractions</p>
                      </div>
                    </div>
                  </div>

                  {/* Font Family Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Font Family
                    </label>
                    <div className="space-y-2">
                      {fontsLoading ? (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700">
                          <div className="animate-spin w-4 h-4 border-2 border-sakura-500 border-t-transparent rounded-full"></div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">Loading fonts...</span>
                        </div>
                      ) : (
                        <>
                          {/* Categorized Font Selection */}
                          {['AI Interface', 'Professional', 'Reading', 'Code', 'Classic', 'System', 'Web Fonts'].map((category) => {
                            const categoryFonts = availableFonts.filter(font => font.category === category);
                            if (categoryFonts.length === 0) return null;
                            
                            return (
                              <div key={category} className="mb-4">
                                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                                  {category}
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                  {categoryFonts.map((font) => (
                                    <button
                                      key={font.value}
                                      onClick={() => handleUIPreferenceChange({ font_family: font.value })}
                                      className={`group text-left p-3 rounded-lg border transition-all ${
                                        (personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family) === font.value
                                          ? 'border-sakura-300 dark:border-sakura-600 bg-sakura-50 dark:bg-sakura-900/20'
                                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div 
                                            className="font-medium text-gray-900 dark:text-white mb-1"
                                            style={{ fontFamily: font.value }}
                                          >
                                            {font.label}
                                          </div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {font.description}
                                          </div>
                                          <div 
                                            className="text-sm text-gray-600 dark:text-gray-300 mt-2"
                                            style={{ fontFamily: font.value }}
                                          >
                                            The quick brown fox jumps over the lazy dog
                                          </div>
                                        </div>
                                        {(personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family) === font.value && (
                                          <Check className="w-4 h-4 text-sakura-500 ml-2 flex-shrink-0" />
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {!fontsLoading && availableFonts.find(font => font.value === (personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family))?.description}
                      </p>
                    </div>
                  </div>

                  {/* Enhanced Preview Section */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Live Typography Preview
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // Toggle between sample texts
                            const samples = [
                              "The quick brown fox jumps over the lazy dog.",
                              "Hello! How can I assist you today?",
                              "This is a longer sample text to demonstrate how your typography settings affect readability in extended conversations with Clara.",
                              "Code: function greet() { return 'Hello World'; }"
                            ];
                            const current = document.querySelector('[data-preview-text]')?.textContent || '';
                            const currentIndex = samples.indexOf(current);
                            const nextIndex = (currentIndex + 1) % samples.length;
                            const previewEl = document.querySelector('[data-preview-text]');
                            if (previewEl) previewEl.textContent = samples[nextIndex];
                          }}
                          className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          Change Sample
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Contrast: <span className="font-mono">4.8:1</span> ✅
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-6 h-6 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-700"
                          style={{ backgroundColor: personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color }}
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          This is your accent color • Used for buttons, links, and highlights
                        </span>
                      </div>
                      <div 
                        style={{ 
                          fontFamily: personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family,
                          fontSize: `${((personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale) * 16)}px`,
                          fontWeight: personalInfo.ui_preferences?.font_weight === 'light' ? '300' : 
                                     personalInfo.ui_preferences?.font_weight === 'normal' ? '400' :
                                     personalInfo.ui_preferences?.font_weight === 'medium' ? '500' : 
                                     personalInfo.ui_preferences?.font_weight === 'semibold' ? '600' : '400',
                          lineHeight: personalInfo.ui_preferences?.line_height === 'tight' ? '1.25' :
                                     personalInfo.ui_preferences?.line_height === 'normal' ? '1.5' :
                                     personalInfo.ui_preferences?.line_height === 'relaxed' ? '1.75' : 
                                     personalInfo.ui_preferences?.line_height === 'loose' ? '2.0' : '1.5',
                          letterSpacing: personalInfo.ui_preferences?.letter_spacing === 'tight' ? '-0.025em' :
                                        personalInfo.ui_preferences?.letter_spacing === 'normal' ? '0' :
                                        personalInfo.ui_preferences?.letter_spacing === 'wide' ? '0.025em' : '0'
                        }}
                        className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center text-white text-sm font-semibold">
                            C
                          </div>
                          <div>
                            <p className="text-gray-800 dark:text-gray-200 font-semibold text-sm">Clara</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">AI Assistant</p>
                          </div>
                        </div>
                        <p className="text-gray-800 dark:text-gray-200 font-medium mb-2">
                          Sample Conversation Preview
                        </p>
                        <p 
                          className="text-gray-600 dark:text-gray-400 mb-3"
                          data-preview-text
                        >
                          The quick brown fox jumps over the lazy dog. This preview demonstrates how your typography settings affect readability and visual appeal in conversations with Clara.
                        </p>
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-800 rounded p-2">
                          <div className="flex justify-between">
                            <span>Font:</span>
                            <span className="font-mono">"{availableFonts.find(f => f.value === (personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family))?.label || 'System Default'}"</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Size:</span>
                            <span className="font-mono">{Math.round((personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale) * 100)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Weight:</span>
                            <span className="font-mono">{FONT_WEIGHT_OPTIONS.find(w => w.value === (personalInfo.ui_preferences?.font_weight || DEFAULT_UI_PREFERENCES.font_weight))?.label || 'Normal'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Line Height:</span>
                            <span className="font-mono">{LINE_HEIGHT_OPTIONS.find(l => l.value === (personalInfo.ui_preferences?.line_height || DEFAULT_UI_PREFERENCES.line_height))?.label || 'Normal'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Letter Spacing:</span>
                            <span className="font-mono">{LETTER_SPACING_OPTIONS.find(s => s.value === (personalInfo.ui_preferences?.letter_spacing || DEFAULT_UI_PREFERENCES.letter_spacing))?.label || 'Normal'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-all hover:shadow-md transform hover:scale-105"
                          style={{ 
                            backgroundColor: personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color,
                            fontFamily: personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family,
                            fontSize: `${((personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale) * 14)}px`,
                            fontWeight: personalInfo.ui_preferences?.font_weight === 'light' ? '300' : 
                                       personalInfo.ui_preferences?.font_weight === 'normal' ? '400' :
                                       personalInfo.ui_preferences?.font_weight === 'medium' ? '500' : 
                                       personalInfo.ui_preferences?.font_weight === 'semibold' ? '600' : '400',
                          }}
                        >
                          Primary Button
                        </button>
                        <button 
                          className="px-4 py-2 border rounded-lg text-sm font-medium transition-all hover:shadow-md transform hover:scale-105"
                          style={{ 
                            borderColor: personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color,
                            color: personalInfo.ui_preferences?.accent_color || DEFAULT_UI_PREFERENCES.accent_color,
                            fontFamily: personalInfo.ui_preferences?.font_family || DEFAULT_UI_PREFERENCES.font_family,
                            fontSize: `${((personalInfo.ui_preferences?.font_scale || DEFAULT_UI_PREFERENCES.font_scale) * 14)}px`,
                            fontWeight: personalInfo.ui_preferences?.font_weight === 'light' ? '300' : 
                                       personalInfo.ui_preferences?.font_weight === 'normal' ? '400' :
                                       personalInfo.ui_preferences?.font_weight === 'medium' ? '500' : 
                                       personalInfo.ui_preferences?.font_weight === 'semibold' ? '600' : '400',
                          }}
                        >
                          Secondary Button
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Show Enhanced Wallpaper section when either not in interface mode, or appearance sub-tab is active */}
              {(activeMainTab !== 'interface' || activeInterfaceTab === 'appearance') && (
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Image className="w-6 h-6 text-purple-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Background & Wallpaper
                  </h2>
                </div>

                <div className="space-y-6">
                  {/* Current Wallpaper Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Current Background
                    </label>
                    <div className="relative h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden">
                      {wallpaperUrl ? (
                        <div 
                          className="w-full h-full bg-cover bg-center relative"
                          style={{
                            backgroundImage: `url(${wallpaperUrl})`,
                            opacity: 1.0, // Full opacity for clear visibility
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        >
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                              Current Wallpaper Preview
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                          <div className="text-center">
                            <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No wallpaper set</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Wallpaper Source Options */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Choose Background Source
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <button
                        onClick={handleSetWallpaper}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-600 transition-colors text-center"
                      >
                        <div className="w-8 h-8 mx-auto mb-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                          <Image className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Upload Image</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">From your device</p>
                      </button>
                      
                      <button
                        onClick={() => {
                          setShowBuiltinGallery(!showBuiltinGallery);
                          setShowYourCreations(false);
                        }}
                        className={`p-4 border rounded-lg transition-colors text-center ${
                          showBuiltinGallery 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                            : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                        }`}
                      >
                        <div className="w-8 h-8 mx-auto mb-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <span className="text-sm">🎨</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Gallery</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Built-in collection</p>
                      </button>

                      <button
                        onClick={() => {
                          setShowYourCreations(!showYourCreations);
                          setShowBuiltinGallery(false);
                        }}
                        className={`p-4 border rounded-lg transition-colors text-center ${
                          showYourCreations 
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                            : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                        }`}
                      >
                        <div className="w-8 h-8 mx-auto mb-2 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                          <Palette className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Your Creations</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">AI generated images</p>
                      </button>
                    </div>
                  </div>

                  {/* Built-in Gallery */}
                  {showBuiltinGallery && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        🎨 Built-in Gallery
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {BUILTIN_WALLPAPERS.map((wallpaper) => (
                          <div
                            key={wallpaper.id}
                            className="relative group cursor-pointer"
                            onClick={() => handleBuiltinWallpaperSelect(wallpaper)}
                          >
                            <div 
                              className="aspect-video rounded-lg border-2 border-gray-200 dark:border-gray-600 overflow-hidden hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                              style={{
                                background: wallpaper.category === 'Gradients' 
                                  ? wallpaper.preview 
                                  : `url(${wallpaper.url})`,
                                backgroundSize: wallpaper.category === 'Gradients' ? 'auto' : 'cover',
                                backgroundPosition: wallpaper.category === 'Gradients' ? 'center' : 'center'
                              }}
                            >
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium bg-black/50 px-2 py-1 rounded">
                                  Select
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 truncate">
                              {wallpaper.name}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Your Creations Gallery */}
                  {showYourCreations && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          🎨 Your Creations
                        </h4>
                        <button
                          onClick={loadGalleryImages}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                        >
                          Refresh
                        </button>
                      </div>
                      
                      {/* Search Bar */}
                      <div className="relative mb-4">
                        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search your images..."
                          value={gallerySearchQuery}
                          onChange={(e) => setGallerySearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 text-sm"
                        />
                      </div>

                      {/* Loading State */}
                      {isLoadingGalleryImages ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400 rounded-full animate-spin"></div>
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading your creations...</span>
                        </div>
                      ) : filteredGalleryImages.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                            <Palette size={24} className="text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {gallerySearchQuery ? 'No matching images found' : 'No AI creations found'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            {gallerySearchQuery ? 'Try different search terms' : 'Generate some images first to use them as wallpapers'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {filteredGalleryImages.map((image) => (
                            <div
                              key={image.id}
                              className="relative group cursor-pointer"
                              onClick={() => handleGalleryImageWallpaper(image)}
                            >
                              <div className="aspect-video rounded-lg border-2 border-gray-200 dark:border-gray-600 overflow-hidden hover:border-green-400 dark:hover:border-green-500 transition-colors">
                                <img
                                  src={image.url}
                                  alt={image.prompt}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium bg-black/50 px-2 py-1 rounded">
                                    Select
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 truncate" title={image.prompt}>
                                {image.prompt.length > 20 ? `${image.prompt.substring(0, 20)}...` : image.prompt}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {galleryImages.length > 10 && !gallerySearchQuery && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-3">
                          Showing 10 most recent images. Use search to find older ones.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Clear Wallpaper and Actions */}
                  {wallpaperUrl && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                      <div className="flex gap-3">
                        <button
                          onClick={handleClearWallpaper}
                          className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm"
                        >
                          Remove Wallpaper
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status and Tips */}
                  <div className="space-y-3">
                    {wallpaperUrl && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 dark:text-green-400">✅</span>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            <strong>Wallpaper Active</strong> - Your background is applied with current settings
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                        💡 Wallpaper Tips
                      </h5>
                      <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Upload your own images or choose from built-in gradients</li>
                        <li>• High-contrast images work best as backgrounds</li>
                        <li>• The wallpaper appears subtly behind the interface for readability</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Show Feature Configuration when not in interface mode */}
              {activeMainTab !== 'interface' && (
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Puzzle className="w-6 h-6 text-purple-500" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Feature Configuration
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Enable or disable features to optimize performance and resource usage
                    </p>
                  </div>
                </div>

                {featureConfigLoaded ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          🤖 Clara Core
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Core AI assistant functionality (Always enabled)
                        </p>
                      </div>
                      <div className="relative w-11 h-6 bg-green-500 rounded-full">
                        <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full shadow-md flex items-center justify-center">
                          <Check className="w-3 h-3 text-green-500" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          🎨 ComfyUI - Image Generation
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          AI image generation with Stable Diffusion
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureConfig.comfyUI}
                          onChange={(e) => updateFeatureConfig({ comfyUI: e.target.checked })}
                          disabled={savingFeatureConfig}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          ⚡ N8N - Workflow Automation
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Visual workflow builder and automation
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureConfig.n8n}
                          onChange={(e) => updateFeatureConfig({ n8n: e.target.checked })}
                          disabled={savingFeatureConfig}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          🧠 RAG & TTS - Advanced AI
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Document analysis and text-to-speech capabilities
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureConfig.ragAndTts}
                          onChange={(e) => updateFeatureConfig({ ragAndTts: e.target.checked })}
                          disabled={savingFeatureConfig}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {savingFeatureConfig && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm text-purple-700 dark:text-purple-300">
                            Saving feature configuration...
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-amber-700 dark:text-amber-300">
                          <strong>Note:</strong> Changes will take effect after restarting the application. 
                          Disabled features won't be loaded during startup, saving system resources.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={async () => {
                          try {
                            if ((window as any).featureConfig?.resetFeatureConfig) {
                              const success = await (window as any).featureConfig.resetFeatureConfig();
                              if (success) {
                                // Reset to defaults
                                setFeatureConfig({
                                  comfyUI: true,
                                  n8n: true,
                                  ragAndTts: true,
                                  claraCore: true
                                });
                                alert('✅ Feature configuration reset to defaults. The feature selection screen will appear on next startup.');
                              } else {
                                alert('❌ No feature configuration found to reset.');
                              }
                            }
                          } catch (error) {
                            console.error('Failed to reset feature configuration:', error);
                            alert('❌ Failed to reset feature configuration.');
                          }
                        }}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to First-Time Setup
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                  </div>
                )}
              </div>
              )}

              {/* Show Startup Options when not in interface mode */}
              {activeMainTab !== 'interface' && (
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Power className="w-6 h-6 text-blue-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Startup Options
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Auto Start Application
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Start ClaraVerse automatically when system boots
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startupConfig.autoStart}
                        onChange={(e) => updateStartupConfig({ autoStart: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Start Minimized
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Start the application in system tray
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startupConfig.startMinimized}
                        onChange={(e) => updateStartupConfig({ startMinimized: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Start Fullscreen
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Launch application in fullscreen mode
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startupConfig.startFullscreen}
                        onChange={(e) => updateStartupConfig({ startFullscreen: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Check for Updates
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Automatically check for application updates
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startupConfig.checkForUpdates}
                        onChange={(e) => updateStartupConfig({ checkForUpdates: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Restore Last Session
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Restore previous session on startup
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={startupConfig.restoreLastSession}
                        onChange={(e) => updateStartupConfig({ restoreLastSession: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          {/* Local Models Tab */}
          {effectiveActiveTab === 'models' && (
            <div className="space-y-6">
              {/* Model Manager Header with Sub-tabs */}
              <div className="glassmorphic rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Brain className="w-6 h-6 text-sakura-500" />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Local Models
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Manage your locally installed AI models and hardware acceleration
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 -mb-6 pb-4">
                  <ModelTabItem
                    id="models"
                    label="Models"
                    isActive={activeModelTab === 'models'}
                  />
                  <ModelTabItem
                    id="gpu-diagnostics"
                    label="Advanced Settings"
                    isActive={activeModelTab === 'gpu-diagnostics'}
                  />
                </div>
              </div>

              {/* Model Tab Content */}
              {activeModelTab === 'models' && (
                <ModelManager />
              )}

              {/* GPU Diagnostics Tab Content */}
              {activeModelTab === 'gpu-diagnostics' && (
                <div className="glassmorphic rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Zap className="w-6 h-6 text-amber-500" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Hardware Acceleration
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Monitor GPU detection and optimize performance for faster inference
                      </p>
                    </div>
                  </div>

                  <GPUDiagnostics />
                </div>
              )}
            </div>
          )}

          {/* Extensions Tab */}
          {effectiveActiveTab === 'mcp' && (
            <MCPSettings />
          )}

          {/* Tools Tab */}
          {effectiveActiveTab === 'toolbelt' && (
            <ToolBelt />
          )}

          {/* Services Tab */}
          {effectiveActiveTab === 'servers' && (
            <UnifiedServiceManager />
          )}

          {/* SDK Code Export Demo Tab */}
          {activeTab === 'sdk-demo' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Zap className="w-6 h-6 text-purple-500" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Export as Code
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Generate ready-to-use JavaScript code from your flows
                  </p>
                </div>
              </div>

              {/* Feature Overview */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-3">
                  🚀 Export Your Flows as JavaScript Code
                </h3>
                <p className="text-purple-700 dark:text-purple-300 mb-4">
                  Transform your Clara flows into ready-to-use JavaScript modules that can be directly integrated into any application using the Clara Flow SDK.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">✨ What You Get</h4>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      <li>• Complete JavaScript class</li>
                      <li>• Embedded flow definition</li>
                      <li>• Custom node implementations</li>
                      <li>• Ready-to-use methods</li>
                      <li>• TypeScript-friendly</li>
                    </ul>
                  </div>

                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">🎯 Use Cases</h4>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      <li>• Embed in web applications</li>
                      <li>• Server-side processing</li>
                      <li>• Microservices integration</li>
                      <li>• Batch processing scripts</li>
                      <li>• Custom workflow engines</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Usage Example */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  📝 Generated Code Example
                </h3>
                <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                  <pre className="text-green-400">
                    {`// Generated by Clara Agent Studio
import { ClaraFlowRunner } from 'clara-flow-sdk';

export class MyAwesomeFlow {
  constructor(options = {}) {
    this.runner = new ClaraFlowRunner({
      enableLogging: true,
      logLevel: 'info',
      ...options
    });
    
    this.flowData = {
      // Complete flow definition embedded here
      nodes: [...],
      connections: [...],
      customNodes: [...]
    };
    
    this.registerCustomNodes();
  }

  async execute(inputs = {}) {
    return await this.runner.executeFlow(this.flowData, inputs);
  }

  async executeBatch(inputSets, options = {}) {
    // Batch processing with concurrency control
    const results = [];
    for (const inputs of inputSets) {
      results.push(await this.execute(inputs));
    }
    return results;
  }
}

// Export for direct use
export const myAwesomeFlow = new MyAwesomeFlow();
export default MyAwesomeFlow;`}
                  </pre>
                </div>
              </div>

              {/* How to Use */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  🛠️ How to Export as Code
                </h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                    <li><strong>1.</strong> Create your flow in Agent Studio</li>
                    <li><strong>2.</strong> Click the Export dropdown in the toolbar</li>
                    <li><strong>3.</strong> Select "Export as Code" (JavaScript)</li>
                    <li><strong>4.</strong> Save the generated .js file</li>
                    <li><strong>5.</strong> Install the SDK: <code className="bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded">npm install clara-flow-sdk</code></li>
                    <li><strong>6.</strong> Import and use in your application!</li>
                  </ol>
                </div>
              </div>

              {/* Integration Examples */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Node.js Server</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                    <pre className="text-yellow-400">
                      {`import { myFlow } from './my-flow.js';

app.post('/process', async (req, res) => {
  const result = await myFlow.execute({
    input: req.body.message
  });
  res.json(result);
});`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">React Component</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                    <pre className="text-cyan-400">
                      {`import { myFlow } from './my-flow.js';

const ProcessButton = () => {
  const handleClick = async () => {
    const result = await myFlow.execute({
      userInput: "Hello World"
    });
    console.log(result);
  };
  
  return <button onClick={handleClick}>
    Process
  </button>;
};`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Benefits */}
              <div className="mt-6 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  ✅ Why Export as Code?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-green-800 dark:text-green-200">
                  <div>
                    <strong>🚀 Zero Dependencies</strong><br />
                    Everything embedded in the generated code
                  </div>
                  <div>
                    <strong>⚡ High Performance</strong><br />
                    No JSON parsing or flow loading overhead
                  </div>
                  <div>
                    <strong>🔧 Easy Integration</strong><br />
                    Drop into any JavaScript project
                  </div>
                </div>
              </div>

              {/* View Integration Examples */}
              <div className="mt-6">
                <button
                  onClick={() => window.open('/settings?tab=sdk-demo', '_blank')}
                  className="flex items-center gap-2 text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  View integration examples
                </button>
              </div>
            </div>
          )}

          {/* Updates Tab */}
          {effectiveActiveTab === 'updates' && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Download className="w-6 h-6 text-sakura-500" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Updates & Notifications
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Keep Clara up to date with smart, automated checking and beautiful notifications
                  </p>
                </div>
              </div>

              {/* Update Preferences Section */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <SettingsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                    🎯 Smart Update Preferences
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Auto Check Settings */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={startupConfig.checkForUpdates}
                          onChange={(e) => updateStartupConfig({ checkForUpdates: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            🔄 Automatic Checking
                          </span>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Check for updates automatically in the background
                          </p>
                        </div>
                      </label>
                    </div>

                    {startupConfig.checkForUpdates && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            📅 Check Frequency
                          </label>
                          <select 
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={startupConfig.checkFrequency || 'daily'}
                            onChange={(e) => updateStartupConfig({ checkFrequency: e.target.value })}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="manual">Manual Only</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={startupConfig.notifyOnAvailable || true}
                              onChange={(e) => updateStartupConfig({ notifyOnAvailable: e.target.checked })}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                🔔 Smart Notifications
                              </span>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Get beautiful, non-intrusive update notifications
                              </p>
                            </div>
                          </label>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Quiet Hours */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={startupConfig.quietHours?.enabled || false}
                          onChange={(e) => updateStartupConfig({ 
                            quietHours: { 
                              enabled: e.target.checked,
                              start: startupConfig.quietHours?.start || '22:00',
                              end: startupConfig.quietHours?.end || '08:00'
                            } 
                          })}
                          className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            🌙 Quiet Hours
                          </span>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            No update checks during specified hours
                          </p>
                        </div>
                      </label>
                    </div>

                    {startupConfig.quietHours?.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            From
                          </label>
                          <input
                            type="time"
                            value={startupConfig.quietHours?.start || '22:00'}
                            onChange={(e) => updateStartupConfig({ 
                              quietHours: { 
                                enabled: startupConfig.quietHours?.enabled || false,
                                start: e.target.value,
                                end: startupConfig.quietHours?.end || '08:00'
                              } 
                            })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            To
                          </label>
                          <input
                            type="time"
                            value={startupConfig.quietHours?.end || '08:00'}
                            onChange={(e) => updateStartupConfig({ 
                              quietHours: { 
                                enabled: startupConfig.quietHours?.enabled || false,
                                start: startupConfig.quietHours?.start || '22:00',
                                end: e.target.value
                              } 
                            })}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={startupConfig.betaChannel || false}
                          onChange={(e) => updateStartupConfig({ betaChannel: e.target.checked })}
                          className="w-4 h-4 text-orange-600 bg-gray-100 border-gray-300 rounded focus:ring-orange-500 dark:focus:ring-orange-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            🧪 Beta Channel
                          </span>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Get pre-release versions with cutting-edge features
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Last Check Info */}
                {lastUpdateCheck && (
                  <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      Last automatic check: {lastUpdateCheck.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Current Version Info */}
              <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                      Current Version
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Clara {updateInfo?.currentVersion || '1.0.0'} on {updateInfo ? getPlatformName(updateInfo.platform) : 'Unknown Platform'}
                    </p>
                  </div>
                  <button
                    onClick={handleManualUpdateCheck}
                    disabled={checkingUpdates}
                    className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 transform hover:scale-105 disabled:hover:scale-100"
                  >
                    {checkingUpdates ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Checking...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        Check Now
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Update Status */}
              {updateInfo && (
                <div className="space-y-4">
                  {updateInfo.error ? (
                    <div className="bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <div>
                          <h4 className="font-medium text-red-900 dark:text-red-100">
                            Update Check Failed
                          </h4>
                          <p className="text-sm text-red-700 dark:text-red-300">
                            {updateInfo.error}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : updateInfo.hasUpdate ? (
                    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-full flex items-center justify-center shadow-lg">
                          <Download className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2 text-lg">
                            🎉 Clara {updateInfo.latestVersion || 'Unknown'} is Available!
                          </h4>

                          {/* Platform-specific messaging */}
                          {updateInfo.isOTASupported ? (
                            <div className="space-y-4">
                              <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3 flex items-center gap-2">
                                  <span className="text-lg">🍎</span>
                                  <strong>Automatic updates supported!</strong> Your macOS installation allows secure, signed updates that install automatically.
                                </p>
                                <div className="flex gap-3">
                                  <button
                                    onClick={handleManualUpdateCheck}
                                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-lg hover:from-emerald-600 hover:to-blue-600 transition-all duration-200 flex items-center gap-2 shadow-lg transform hover:scale-105"
                                  >
                                    <Download className="w-4 h-4" />
                                    Download & Install Automatically
                                  </button>
                                  {updateInfo.releaseUrl && (
                                    <button
                                      onClick={openReleaseNotes}
                                      className="px-4 py-2 bg-white/80 dark:bg-gray-700/80 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 flex items-center gap-2 border border-emerald-200 dark:border-emerald-600"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      View Release Notes
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3 flex items-center gap-2">
                                  <span className="text-lg">🔒</span>
                                  <strong>Secure manual installation</strong> On {getPlatformName(updateInfo.platform)}, updates are installed manually to ensure your system's security.
                                </p>
                                
                                {updateInfo.assetSize && (
                                  <div className="mb-3 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded px-3 py-1 inline-flex items-center gap-2">
                                    <HardDrive className="w-3 h-3" />
                                    Download size: {updateInfo.assetSize}
                                    {updateInfo.downloadEstimate && ` (${updateInfo.downloadEstimate})`}
                                  </div>
                                )}
                                
                                <div className="flex gap-3">
                                  <button
                                    onClick={downloadUpdate}
                                    disabled={downloadProgress?.isDownloading}
                                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-lg hover:from-emerald-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shadow-lg transform hover:scale-105 disabled:hover:scale-100"
                                  >
                                    {downloadProgress?.isDownloading ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Downloading {downloadProgress.percent}%
                                      </>
                                    ) : (
                                      <>
                                        <ExternalLink className="w-4 h-4" />
                                        Download Now
                                      </>
                                    )}
                                  </button>
                                  {updateInfo.releaseUrl && (
                                    <button
                                      onClick={openReleaseNotes}
                                      className="px-4 py-2 bg-white/80 dark:bg-gray-700/80 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 flex items-center gap-2 border border-emerald-200 dark:border-emerald-600"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      Release Notes
                                    </button>
                                  )}
                                </div>
                                
                                {/* Download Progress Bar */}
                                {downloadProgress?.isDownloading && (
                                  <div className="mt-4 bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                        Downloading {downloadProgress.fileName}
                                      </span>
                                      <span className="text-sm text-emerald-600 dark:text-emerald-400">
                                        {downloadProgress.transferred} / {downloadProgress.total}
                                      </span>
                                    </div>
                                    <div className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-full h-2">
                                      <div 
                                        className="bg-gradient-to-r from-emerald-500 to-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${downloadProgress.percent}%` }}
                                      ></div>
                                    </div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 text-center">
                                      {downloadProgress.percent}% complete
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {updateInfo.releaseNotesFormatted && updateInfo.releaseNotesFormatted !== 'No release notes available.' && (
                            <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
                              <h5 className="font-medium text-emerald-900 dark:text-emerald-100 mb-3 flex items-center gap-2">
                                <span className="text-lg">✨</span>
                                What's New:
                              </h5>
                              <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                                <pre className="whitespace-pre-wrap font-sans">
                                  {updateInfo.releaseNotesFormatted.length > 600
                                    ? updateInfo.releaseNotesFormatted.substring(0, 600) + '...\n\nClick "Release Notes" for full details.'
                                    : updateInfo.releaseNotesFormatted}
                                </pre>
                              </div>
                              
                              {updateInfo.hasBreakingChanges && (
                                <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                                  <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-sm font-medium">This update contains breaking changes</span>
                                  </div>
                                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                                    Please review the release notes carefully before updating.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {updateInfo.publishedAt && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 flex items-center gap-2">
                              <Clock className="w-3 h-3" />
                              Released {new Date(updateInfo.publishedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
                            <span className="text-lg">✅</span>
                            You're Up to Date!
                          </h4>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Clara {updateInfo.currentVersion || 'Unknown'} is the latest version. You're all set!
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {lastUpdateCheck && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-2">
                      <Clock className="w-3 h-3" />
                      Last checked: {lastUpdateCheck.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Update Information */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  How Clara Updates Work
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-gradient-to-br from-sakura-50 to-pink-50 dark:from-sakura-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-sakura-200 dark:border-sakura-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🍎</span>
                      <strong className="text-sakura-900 dark:text-sakura-100">macOS</strong>
                    </div>
                    <p className="text-sakura-700 dark:text-sakura-300">
                      Automatic over-the-air (OTA) updates with code signing verification for maximum security.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🪟</span>
                      <strong className="text-blue-900 dark:text-blue-100">Windows & Linux</strong>
                    </div>
                    <p className="text-blue-700 dark:text-blue-300">
                      Secure manual updates ensure system integrity. Downloads point to official GitHub releases.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📝</span>
                      <strong className="text-green-900 dark:text-green-100">Release Notes</strong>
                    </div>
                    <p className="text-green-700 dark:text-green-300">
                      Detailed information about new features, improvements, and bug fixes with smart categorization.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Provider
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete this provider? All associated configurations will be permanently removed.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProvider(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Provider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Provider Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </h3>
              <button
                onClick={() => {
                  setShowAddProviderModal(false);
                  setEditingProvider(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provider Type
                </label>
                <select
                  value={newProviderForm.type}
                  onChange={(e) => {
                    const type = e.target.value as Provider['type'];
                    const defaultConfig = getDefaultProviderConfig(type);
                    setNewProviderForm(prev => ({
                      ...prev,
                      type,
                      name: defaultConfig.name || prev.name,
                      baseUrl: defaultConfig.baseUrl || prev.baseUrl,
                      apiKey: type === 'ollama' ? 'ollama' : prev.apiKey
                    }));
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                >
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={newProviderForm.name}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="Enter provider name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={newProviderForm.baseUrl}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={newProviderForm.apiKey}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="Enter API key (optional)"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={newProviderForm.isEnabled}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
                  className="w-4 h-4 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                />
                <label htmlFor="isEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable this provider
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddProviderModal(false);
                  setEditingProvider(null);
                }}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingProvider ? handleUpdateProvider : handleAddProvider}
                disabled={!newProviderForm.name.trim()}
                className="flex-1 px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingProvider ? 'Update' : 'Add'} Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;