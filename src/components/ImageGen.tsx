import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Client, BasePipe, EfficientPipe, } from '@stable-canvas/comfyui-client';
import Sidebar from './Sidebar';
import ImageGenHeader from './ImageGenHeader';
import { db } from '../db';
import ComfyUIManager from './ComfyUIManager';
import ImageModelManager from './ImageModelManager';
import { angelaApiService } from '../services/angelaApiService';
import { angelaModel, angelaProvider } from '../types/angela_assistant_types';
import ComfyUIStartupModal from './ComfyUIStartupModal';

import PromptArea from './imagegen_components/PromptArea';
import GeneratedGallery from './imagegen_components/GeneratedGallery';
import SettingsDrawer, { Resolution } from './imagegen_components/SettingsDrawer';
import LoadingOverlay from './imagegen_components/LoadingOverlay';
import InitialLoadingOverlay from './imagegen_components/InitialLoadingOverlay';
import { Buffer } from 'buffer';

// Add TypeScript deangelation for webview
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>;
    }
  }
}

// Custom hook to get ComfyUI service configuration
const useComfyUIServiceConfig = () => {
  const [comfyuiUrl, setComfyuiUrl] = useState<string>('http://localhost:8188');
  const [comfyuiMode, setComfyuiMode] = useState<string>('docker');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadServiceConfig = async () => {
      try {
        console.log('🔍 Loading ComfyUI service configuration...');
        
        // Check if electronAPI is available
        if (!(window as any).electronAPI) {
          console.error('❌ electronAPI not available');
          return;
        }
        
        // Get service configurations and status
        console.log('📡 Calling service-config:get-all-configs...');
        const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
        console.log('📡 Calling service-config:get-enhanced-status...');
        const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
        
        console.log('✅ Service API calls completed');

        const comfyuiConfig = configs?.comfyui || { mode: 'docker', url: null };
        const comfyuiStatus = status?.comfyui || {};

        // Set the mode from the actual deployment mode in status, fallback to config mode
        const actualMode = comfyuiStatus.deploymentMode || comfyuiConfig.mode || 'docker';
        setComfyuiMode(actualMode);

        let finalUrl = 'http://localhost:8188'; // Default fallback

        if (comfyuiConfig.mode === 'manual' && comfyuiConfig.url) {
          // Use manual configuration URL
          finalUrl = comfyuiConfig.url;
        } else if (comfyuiStatus.serviceUrl) {
          // Use auto-detected URL from service status
          finalUrl = comfyuiStatus.serviceUrl;
        } else {
          // Fallback: try to get from old API config
          const apiConfig = await db.getAPIConfig();
          if (apiConfig?.comfyui_base_url) {
            finalUrl = apiConfig.comfyui_base_url.startsWith('http') 
              ? apiConfig.comfyui_base_url 
              : `http://${apiConfig.comfyui_base_url}`;
          }
        }

        console.log('🎨 ComfyUI Service Config DEBUG:', {
          configs: configs,
          status: status,
          comfyuiConfig: comfyuiConfig,
          comfyuiStatus: comfyuiStatus,
          configMode: comfyuiConfig.mode,
          deploymentMode: comfyuiStatus.deploymentMode,
          actualMode: actualMode,
          configUrl: comfyuiConfig.url,
          statusUrl: comfyuiStatus.serviceUrl,
          finalUrl
        });

        setComfyuiUrl(finalUrl);
      } catch (error) {
        console.error('Failed to load ComfyUI service config:', error);
        // Keep default URL and mode
      } finally {
        setLoading(false);
      }
    };

    loadServiceConfig();

    // Refresh configuration every 30 seconds
    const interval = setInterval(loadServiceConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  return { comfyuiUrl, comfyuiMode, loading };
};

// ComfyUI WebView Component
const ComfyUIWebView: React.FC<{
  onLoad: () => void;
  onError: () => void;
  comfyUIKey: number;
  comfyuiUrl: string;
}> = ({ onLoad, onError, comfyUIKey, comfyuiUrl }) => {
  const webviewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Check if we're in Electron environment
  useEffect(() => {
    const checkElectron = () => {
      const isElectronEnv = !!(window as any).electronAPI || 
                           typeof (window as any).require !== 'undefined' ||
                           navigator.userAgent.toLowerCase().indexOf('electron') > -1;
      setIsElectron(isElectronEnv);
      
      // If not in Electron, use iframe fallback immediately
      if (!isElectronEnv) {
        console.log('Not in Electron environment, using iframe fallback');
        setUseIframeFallback(true);
      }
    };
    
    checkElectron();
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || useIframeFallback || !isElectron) return;

    const handleDomReady = () => {
      console.log('ComfyUI WebView DOM ready');
      onLoad();
    };

    const handleDidFailLoad = (event: any) => {
      console.error('ComfyUI WebView failed to load:', event);
      setUseIframeFallback(true);
      onError();
    };

    const handleDidFinishLoad = () => {
      console.log('ComfyUI WebView finished loading');
      onLoad();
    };

    // Add event listeners with minimal interference
    try {
      webview.addEventListener('dom-ready', handleDomReady);
      webview.addEventListener('did-fail-load', handleDidFailLoad);
      webview.addEventListener('did-finish-load', handleDidFinishLoad);
    } catch (error) {
      console.error('Failed to add webview event listeners:', error);
      setUseIframeFallback(true);
      onError();
    }

    return () => {
      // Cleanup event listeners
      if (webview) {
        try {
          webview.removeEventListener('dom-ready', handleDomReady);
          webview.removeEventListener('did-fail-load', handleDidFailLoad);
          webview.removeEventListener('did-finish-load', handleDidFinishLoad);
        } catch (error) {
          console.error('Failed to remove webview event listeners:', error);
        }
      }
    };
  }, [onLoad, onError, useIframeFallback, isElectron]);

  // Always use iframe fallback if not in Electron or if webview failed
  if (!isElectron || useIframeFallback) {
    return (
      <div className="w-full h-full relative">
        <iframe
          ref={iframeRef}
          key={`comfyui-iframe-${comfyUIKey}`}
          src={comfyuiUrl}
          className="w-full h-full border-0"
          title="ComfyUI Interface"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          style={{ 
            width: '100%', 
            height: '100%',
            border: 'none',
            outline: 'none'
          }}
          onLoad={() => {
            console.log('ComfyUI iframe loaded');
            onLoad();
          }}
          onError={() => {
            console.error('ComfyUI iframe failed to load');
            onError();
          }}
        />
        {!isElectron && (
          <div className="absolute top-2 left-2 bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs z-10">
            Running in browser mode
          </div>
        )}
      </div>
    );
  }

  return (
    <webview
      ref={webviewRef}
      key={`comfyui-webview-${comfyUIKey}`}
      src={comfyuiUrl}
      className="w-full h-full border-0"
      allowpopups={true}
      webpreferences="nodeIntegration=false,contextIsolation=true,webSecurity=false,allowRunningInsecureContent=true"
      partition="persist:comfyui"
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex',
        border: 'none',
        outline: 'none'
      }}
    />
  );
};

// Resolutions constant
const RESOLUTIONS: Resolution[] = [
  { label: 'Square (1:1)', width: 512, height: 512 },
  { label: 'Portrait (2:3)', width: 832, height: 1216 },
  { label: 'Landscape (3:2)', width: 1216, height: 832 },
  { label: 'Wide (16:9)', width: 1280, height: 720 },
  { label: 'Mobile', width: 720, height: 1280 },
  { label: '4K', width: 3840, height: 2160 },
  { label: '2K', width: 2560, height: 1440 },
  { label: 'Custom', width: 0, height: 0 },
];

interface ModelConfig {
  denoise: number;
  steps: number;
  guidanceScale: number;
  sampler: string;
  scheduler: string;
  negativeTags: string[];
}

const MODEL_CONFIGS_KEY = 'angela-ollama-model-configs';

const getOptimalConfig = (modelName: string): ModelConfig => {
  const baseNegative = ['nsfw', '(worst quality, low quality, normal quality:2)'];
  
  if (modelName.toLowerCase().includes('flux')) {
    return {
      denoise: 1.0,
      steps: 20,
      guidanceScale: 1.0,
      sampler: 'euler',
      scheduler: 'normal',
      negativeTags: baseNegative,
    };
  } else if (modelName.toLowerCase().includes('sdxl') || modelName.toLowerCase().includes('xl')) {
    return {
      denoise: 1.0,
      steps: 22,
      guidanceScale: 8.0,
      sampler: 'euler',
      scheduler: 'normal',
      negativeTags: baseNegative,
    };
  } else if (modelName.toLowerCase().includes('1.5') || modelName.toLowerCase().includes('sd1.5')) {
    return {
      denoise: 1.0,
      steps: 22,
      guidanceScale: 5.0,
      sampler: 'dpmpp_2m_sde_gpu',
      scheduler: 'karras',
      negativeTags: baseNegative,
    };
  }
  return {
    denoise: 1,
    steps: 15,
    guidanceScale: 7.5,
    sampler: 'euler',
    scheduler: 'normal',
    negativeTags: baseNegative,
  };
};

const saveModelConfig = (modelName: string, config: ModelConfig) => {
  const storedConfigs = JSON.parse(localStorage.getItem(MODEL_CONFIGS_KEY) || '{}');
  storedConfigs[modelName] = config;
  localStorage.setItem(MODEL_CONFIGS_KEY, JSON.stringify(storedConfigs));
};

const loadModelConfig = (modelName: string): ModelConfig | null => {
  const storedConfigs = JSON.parse(localStorage.getItem(MODEL_CONFIGS_KEY) || '{}');
  return storedConfigs[modelName] || null;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function arrayBufferToUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

interface ImageGenProps {
  onPageChange?: (page: string) => void;
}

const LAST_USED_LLM_KEY = 'angela-ollama-last-used-llm';

interface EnhancePromptSettings {
  selectedModel: string;
  systemPrompt: string;
}

const defaultSystemPrompt = `You are a creative writing assistant specializing in enhancing image generation prompts.
Your task is to expand and improve the given prompt while maintaining its core concept.
Focus on adding descriptive details, artistic style, lighting, and atmosphere.
Keep the enhanced prompt concise and effective.`;

// Add system info interface
interface SystemInfo {
  platform: string;
  arch: string;
  hasNvidiaGPU: boolean;
  gpuName?: string;
  isMac: boolean;
  isAMD: boolean;
  isSupported: boolean;
  warnings: string[];
}

// Add consent modal component
const SystemCompatibilityModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  systemInfo: SystemInfo;
}> = ({ isOpen, onClose, onAccept, systemInfo }) => {
  if (!isOpen) return null;

  const getCompatibilityIcon = () => {
    if (systemInfo.isSupported) {
      return <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>;
    } else {
      return <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>;
    }
  };

  const getCompatibilityMessage = () => {
    if (systemInfo.isSupported) {
      return {
        title: "✅ Your System is Compatible!",
        message: "Your NVIDIA GPU setup is fully supported for optimal image generation performance.",
        color: "text-green-800"
      };
    } else {
      return {
        title: "⚠️ Limited Compatibility",
        message: "Your system may experience reduced performance or compatibility issues.",
        color: "text-yellow-800"
      };
    }
  };

  const compatibility = getCompatibilityMessage();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="text-center">
            {getCompatibilityIcon()}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              ComfyUI System Compatibility
            </h2>
            <p className={`text-lg font-medium ${compatibility.color} dark:text-yellow-300 mb-6`}>
              {compatibility.title}
            </p>
          </div>

          {/* System Information */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Your System Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Platform:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">
                  {systemInfo.platform === 'darwin' ? 'macOS' : 
                   systemInfo.platform === 'win32' ? 'Windows' : 
                   systemInfo.platform === 'linux' ? 'Linux' : systemInfo.platform}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Architecture:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-white">{systemInfo.arch}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">GPU Support:</span>
                <span className={`ml-2 font-medium ${systemInfo.hasNvidiaGPU ? 'text-green-600' : 'text-red-600'}`}>
                  {systemInfo.hasNvidiaGPU ? 'NVIDIA GPU Detected' : 'No NVIDIA GPU'}
                </span>
              </div>
              {systemInfo.gpuName && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">GPU Model:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">{systemInfo.gpuName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Compatibility Warnings */}
          {systemInfo.warnings.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
              <h4 className="text-lg font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                ⚠️ Important Compatibility Notes
              </h4>
              <ul className="space-y-2">
                {systemInfo.warnings.map((warning, index) => (
                  <li key={index} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <h4 className="text-lg font-medium text-blue-800 dark:text-blue-200 mb-2">
              💡 Recommendations
            </h4>
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
              {systemInfo.isSupported ? (
                <>
                  <p>• Your NVIDIA GPU will provide excellent performance</p>
                  <p>• GPU acceleration will be automatically enabled</p>
                  <p>• All ComfyUI features are fully supported</p>
                </>
              ) : (
                <>
                  {systemInfo.isMac && (
                    <>
                      <p>• macOS currently lacks Metal acceleration support in ComfyUI Docker containers</p>
                      <p>• Image generation will be significantly slower on CPU</p>
                      <p>• Consider using cloud-based alternatives for better performance</p>
                    </>
                  )}
                  {systemInfo.isAMD && (
                    <>
                      <p>• AMD GPU support in ComfyUI is experimental and limited</p>
                      <p>• You may experience compatibility issues or crashes</p>
                      <p>• CPU fallback will be used, resulting in slower generation</p>
                    </>
                  )}
                  {!systemInfo.hasNvidiaGPU && !systemInfo.isMac && !systemInfo.isAMD && (
                    <>
                      <p>• CPU-only image generation will be very slow</p>
                      <p>• Large models may not fit in system RAM</p>
                      <p>• Consider upgrading to an NVIDIA GPU for optimal experience</p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              className={`px-6 py-2 rounded-lg font-medium ${
                systemInfo.isSupported
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {systemInfo.isSupported ? 'Start ComfyUI' : 'Continue Anyway'}
            </button>
          </div>

          {/* Disclaimer */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              By continuing, you acknowledge the compatibility information above and understand that 
              performance may vary based on your system configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ImageGen: React.FC<ImageGenProps> = ({ onPageChange }) => {
  // Use ComfyUI service configuration
  const { comfyuiUrl, comfyuiMode, loading: serviceConfigLoading } = useComfyUIServiceConfig();

  // Wait for the client's WebSocket connection to open before proceeding - with timeout
  const waitForClientConnection = async (client: Client): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout - failed to connect after 15 seconds"));
        setLoadingStatus(prev => ({ ...prev, connection: 'timeout' }));
      }, 15000);
      
      if (client.socket && client.socket.readyState === WebSocket.OPEN) {
        clearTimeout(timeout);
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (client.socket && client.socket.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      }
    });
  };

  // (1) Connect to ComfyUI and set up client event listeners
  // UI state variables
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [mustSelectModel, setMustSelectModel] = useState(false);
  const [progress, setProgress] = useState<{ value: number; max: number } | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [currentPipeline, setCurrentPipeline] = useState<BasePipe | EfficientPipe | null>(null);

  // Add new state for system compatibility
  const [showCompatibilityModal, setShowCompatibilityModal] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [userHasConsented, setUserHasConsented] = useState(false);

  // localStorage key for storing selected model
  const LAST_USED_MODEL_KEY = 'angela-ollama-last-used-model';
  const COMFYUI_CONSENT_KEY = 'angela-comfyui-user-consent';

  // Initial loading states
  const [isInitialSetupComplete, setIsInitialSetupComplete] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // ComfyUI startup modal state
  const [showComfyUIStartupModal, setShowComfyUIStartupModal] = useState(false);
  
  type LoadingStatus = {
    sdModels: 'pending' | 'loading' | 'success' | 'error';
    loras: 'pending' | 'loading' | 'success' | 'error';
    vaes: 'pending' | 'loading' | 'success' | 'error';
    systemStats: 'pending' | 'loading' | 'success' | 'error';
    connection: 'connecting' | 'connected' | 'error' | 'timeout';
  };
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>({
    sdModels: 'pending',
    loras: 'pending',
    vaes: 'pending',
    systemStats: 'pending',
    connection: 'connecting',
  });

  // Data from ComfyUI (models, LoRAs, VAEs, system stats)
  const [systemStats, setSystemStats] = useState<any>(null);
  const [sdModels, setSDModels] = useState<string[]>([]);
  const [loras, setLoras] = useState<string[]>([]);
  const [vaes, setVAEs] = useState<string[]>([]);

  // Debug state: WebSocket connection status
  const [wsStatus, setWsStatus] = useState<string>('Not Connected');

  // Reference to the ComfyUI client instance
  const clientRef = useRef<Client | null>(null);
  
  // Track the last used model to optimize memory management
  const lastUsedModelRef = useRef<string | null>(null);

  /*
   * Smart Memory Management Strategy:
   * - Keep models loaded in GPU memory between generations for the same model
   * - Only unload models when switching to a different model
   * - Free general memory after each generation to prevent memory leaks
   * - Unload all models only on component unmount or explicit cleanup
   * This approach reduces model loading times and improves user experience
   */

  // Disconnect any lingering client created in a different page on mount
  useEffect(() => {
    if (clientRef.current) {
      try {
        clientRef.current.close();
        console.log("Disconnected previous client connection on mount");
      } catch (error) {
        console.error("Error disconnecting previous client connection on mount", error);
      }
      clientRef.current = null;
    }
  }, []);

  // Cleanup effect: Free memory and close connections when component unmounts
  useEffect(() => {
    return () => {
      console.log("🧠 ImageGen component unmounting - cleaning up memory");
      if (clientRef.current) {
        try {
          // Free all memory and unload models on component unmount
          clientRef.current.free({
            free_memory: true,
            unload_models: true
          });
          clientRef.current.close();
        } catch (error) {
          console.warn("Error during cleanup:", error);
        }
        clientRef.current = null;
      }
      lastUsedModelRef.current = null;
    };
  }, []);

  // Remove reconnection interval dependency from generation;
  // Instead, handle connection issues in the initial connection effect.
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Settings state variables
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedLora, setSelectedLora] = useState<string>('');
  const [loraStrength, setLoraStrength] = useState<number>(0.75);
  const [selectedVae, setSelectedVae] = useState<string>('');
  const [negativeTags, setNegativeTags] = useState<string[]>([]);
  const [negativeInput, setNegativeInput] = useState('');
  const [steps, setSteps] = useState(50);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [selectedResolution, setSelectedResolution] = useState<Resolution>(RESOLUTIONS[0]);
  const [customWidth, setCustomWidth] = useState<number>(1024);
  const [customHeight, setCustomHeight] = useState<number>(1024);
  
  // Load initial expanded state from localStorage, default to true (expanded)
  const [showSettings, setShowSettings] = useState(() => {
    const saved = localStorage.getItem('angela-imagegen-settings-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // Track if user manually collapsed it - if so, don't auto-expand on hover
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(() => {
    const saved = localStorage.getItem('angela-imagegen-settings-manually-collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });
  
  const [expandedSections, setExpandedSections] = useState({
    model: true,
    lora: false,
    vae: false,
    negative: false,
    resolution: true,
    controlnet: false,
    upscaler: false,
  });

  // Save expanded state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('angela-imagegen-settings-expanded', JSON.stringify(showSettings));
  }, [showSettings]);

  // Save manually collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('angela-imagegen-settings-manually-collapsed', JSON.stringify(isManuallyCollapsed));
  }, [isManuallyCollapsed]);

  // Toggle settings panel - when user manually toggles
  const toggleSettingsPanel = () => {
    const newExpandedState = !showSettings;
    setShowSettings(newExpandedState);
    
    // If user manually collapses, mark as manually collapsed
    // If user manually expands, unmark manual collapse
    setIsManuallyCollapsed(!newExpandedState);
  };

  // Handle mouse enter - only expand if not manually collapsed
  const handleSettingsMouseEnter = () => {
    if (!isManuallyCollapsed) {
      setShowSettings(true);
    }
  };

  // Handle mouse leave - only collapse if it was manually collapsed
  const handleSettingsMouseLeave = () => {
    if (isManuallyCollapsed) {
      setShowSettings(false);
    }
  };

  const [controlNetModels, setControlNetModels] = useState<string[]>([]);
  const [selectedControlNet, setSelectedControlNet] = useState<string>('');
  const [upscaleModels, setUpscaleModels] = useState<string[]>([]);
  const [selectedUpscaler, setSelectedUpscaler] = useState<string>('');

  const edgeRef = useRef<HTMLDivElement>(null);

  const [denoise, setDenoise] = useState<number>(0.7);
  const [sampler, setSampler] = useState<string>("euler");
  const [scheduler, setScheduler] = useState<string>("normal");

  // Add state for storing the uploaded image buffer
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [clearImageFlag, setClearImageFlag] = useState(false);

  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // Add new state variables
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceSettings, setEnhanceSettings] = useState<EnhancePromptSettings>({
    selectedModel: localStorage.getItem(LAST_USED_LLM_KEY) || '',
    systemPrompt: defaultSystemPrompt,
  });
  const [isLLMConnected, setIsLLMConnected] = useState(false);
  const [showComfyUIManager, setShowComfyUIManager] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);

  // Add new state for interface switching
  const [showComfyUIInterface, setShowComfyUIInterface] = useState(false);
  const [comfyUILoadError, setComfyUILoadError] = useState(false);
  const [comfyUILoading, setComfyUILoading] = useState(false);
  const [comfyUIKey, setComfyUIKey] = useState(0); // Add key to prevent unnecessary re-renders

  // Add smart memory management toggle
  const [smartMemoryEnabled, setSmartMemoryEnabled] = useState(() => {
    const saved = localStorage.getItem('angela-smart-memory-enabled');
    return saved !== null ? JSON.parse(saved) : true; // Default to enabled
  });

  // Add new state variables for the provider system
  const [providers, setProviders] = useState<angelaProvider[]>([]);
  const [availableModels, setAvailableModels] = useState<angelaModel[]>([]);

  // Wallpaper state
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Load wallpaper from database
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

  // Connect to ComfyUI and fetch models, loras, vaes, and system stats
  useEffect(() => {
    const connectAndFetch = async () => {
      try {
        setLoadingStatus(prev => ({ ...prev, connection: 'connecting' }));
        // Always use comfyuiUrl from useComfyUIServiceConfig
        let url = comfyuiUrl;
        if (!url) url = 'http://localhost:8188';
        const isHttps = url.startsWith('https://');
        url = url.replace(/^https?:\/\//, '');
        const client = new Client({ api_host: url, ssl: isHttps });
        clientRef.current = client;
        await client.connect();
        setLoadingStatus(prev => ({ ...prev, connection: 'connected' }));
        // Fetch models, loras, vaes
        setLoadingStatus(prev => ({ ...prev, sdModels: 'loading' }));
        const sdModelsResp = await client.getSDModels();
        setSDModels(sdModelsResp);
        setLoadingStatus(prev => ({ ...prev, sdModels: 'success' }));
        setLoadingStatus(prev => ({ ...prev, loras: 'loading' }));
        const lorasResp = await client.getLoRAs();
        setLoras(lorasResp);
        setLoadingStatus(prev => ({ ...prev, loras: 'success' }));
        setLoadingStatus(prev => ({ ...prev, vaes: 'loading' }));
        const vaesResp = await client.getVAEs();
        setVAEs(vaesResp);
        setLoadingStatus(prev => ({ ...prev, vaes: 'success' }));
        setIsInitialSetupComplete(true);
      } catch (err) {
        console.error('Failed to connect to ComfyUI:', err);
        setConnectionError('Failed to connect to ComfyUI WebSocket API.');
        setLoadingStatus(prev => ({ ...prev, connection: 'error', systemStats: 'error', sdModels: 'error', loras: 'error', vaes: 'error' }));
        setIsInitialSetupComplete(true);
        
        // Show the startup modal when connection fails
        setShowComfyUIStartupModal(true);
      }
    };
    if (!serviceConfigLoading) connectAndFetch();
  }, [comfyuiUrl, serviceConfigLoading]);

  // Generation logic: Build and execute the workflow via WebSocket API
  const handleGenerate = async () => {
    setGenerationError(null);
    try {
      if (!selectedModel) {
        // If no model is selected, attempt to use a stored or first available model
        const lastUsedModel = localStorage.getItem(LAST_USED_MODEL_KEY);
        if (lastUsedModel && sdModels.includes(lastUsedModel)) {
          console.log('Using last used model:', lastUsedModel);
          setSelectedModel(lastUsedModel);
        } else if (sdModels.length > 0) {
          console.log('Using first available model:', sdModels[0]);
          setSelectedModel(sdModels[0]);
        } else {
          setMustSelectModel(true);
          setShowSettings(true);
          return;
        }
      }
      setMustSelectModel(false);
      setIsGenerating(true);
      
      // Use existing client; do not reinitialize if already connected
      let client = clientRef.current;
      console.log('handleGenerate - client before check:', client);
      
      if (!client || client.socket?.readyState !== WebSocket.OPEN) {
        console.log('Client not available or not connected, creating new client...');
        if (client) {
          try {
            client.close();
          } catch (e) {
            console.error("Error closing existing client:", e);
          }
        }
        const url = comfyuiUrl;
        let processedUrl = url;
        if (url.includes('http://') || url.includes('https://')) {
          processedUrl = url.split('//')[1];
        }
        const ssl_type = url.includes('https') ? true : false;
        client = new Client({ api_host: processedUrl, ssl: ssl_type });
        client.connect();
        clientRef.current = client;
        console.log('handleGenerate - new client created:', client);
      }
      
      try {
        await waitForClientConnection(client);
        console.log('Client connection is now open.');
      } catch (connErr) {
        console.error("Connection error:", connErr);
        if ((connErr as Error)?.message?.includes('timeout')) {
          setGenerationError(`Connection timeout: ComfyUI is not responding after 15 seconds. Please check if ComfyUI is running correctly.`);
        } else {
          setGenerationError(`Failed to establish WebSocket connection: ${(connErr as Error)?.message}`);
        }
        setIsGenerating(false);
        return;
      }

      let width = selectedResolution.width;
      let height = selectedResolution.height;
      if (selectedResolution.label === 'Custom') {
        width = customWidth;
        height = customHeight;
      }

      // Determine which pipeline to use and set it up
      let pipeline: BasePipe | EfficientPipe;
      
      // Use EfficientPipe if we have ControlNet, LoRA, or uploaded image
      // since these features are only supported in EfficientPipe
      const shouldUseEfficientPipe = imageBuffer || selectedLora || selectedControlNet;

      if (shouldUseEfficientPipe) {
        const pipe = new EfficientPipe();
        pipeline = pipe
          .with(client)
          .model(selectedModel)
          .prompt(prompt)
          .negative(negativeTags.join(', '))
          .size(width, height)
          .steps(steps)
          .cfg(guidanceScale)
          .denoise(denoise)
          .sampler(sampler)
          .scheduler(scheduler)
          .seed();

        // Add ControlNet if both image and controlnet model are selected
        if (selectedControlNet && imageBuffer) {
          console.log('Adding ControlNet to pipeline:', selectedControlNet, imageBuffer);
          
          const imageData = Buffer.from(arrayBufferToUint8Array(imageBuffer));
          pipeline = pipe.cnet(selectedControlNet, imageData);
        }

        // Add input image if provided
        if (imageBuffer) {
          const imageData = arrayBufferToUint8Array(imageBuffer);
          pipeline = pipe.image(Buffer.from(imageData));
        }

        // Add LoRA if selected
        if (selectedLora) {
          pipeline = pipe.lora(selectedLora, { strength: loraStrength });
        }
      } else {
        // Use BasePipe for simple text-to-image generation
        pipeline = new BasePipe()
          .with(client)
          .model(selectedModel)
          .prompt(prompt)
          .negative(negativeTags.join(', '))
          .size(width, height)
          .steps(steps)
          .cfg(guidanceScale)
          .denoise(denoise)
          .sampler(sampler)
          .scheduler(scheduler)
          .seed();
      }

      setCurrentPipeline(pipeline);
      console.log('Pipeline built:', pipeline);

      // Execute pipeline with a 5-minute timeout
      const pipelinePromise = pipeline.save().wait();
      const result = await Promise.race([
        pipelinePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Generation timed out")), 5 * 60 * 1000)
        )
      ]) as { images: any[] };

      console.log('Generated images:', result.images[0].data);
      
      // Smart memory management: Use toggle to determine memory clearing strategy
      if (smartMemoryEnabled) {
        console.log('🧠 Smart memory: Keeping models loaded, minimal memory clearing');
        // Only do minimal memory clearing without affecting models
        // Avoid calling client.free() entirely to prevent any model unloading
        console.log('🧠 Skipping memory clearing to preserve loaded models');
      } else {
        console.log('🧠 Traditional memory: Unloading models after generation');
        // Traditional approach: Free everything
        client.free({
          free_memory: true,
          unload_models: true
        });
      }
      
      // Update the last used model reference for smart memory management
      lastUsedModelRef.current = selectedModel;
      
      const base64Images = result.images.map((img) => {
        const base64 = arrayBufferToBase64(img.data);
        return `data:${img.mime};base64,${base64}`;
      });
      
      base64Images.forEach((dataUrl) => {
        try {
          db.addStorageItem({
            title: 'Generated Image',
            description: `Prompt: ${prompt}`,
            size: dataUrl.length,
            type: 'image',
            mime_type: 'image/png',
            data: dataUrl,
          });
        } catch (err) {
          console.error('Error saving image to DB:', err);
        }
      });

      setGeneratedImages((prev) => [...prev, ...base64Images]);
      
      const currentConfig: ModelConfig = {
        denoise,
        steps,
        guidanceScale,
        sampler,
        scheduler,
        negativeTags,
      };
      saveModelConfig(selectedModel, currentConfig);
    } catch (err) {
      console.error('Error generating image:', err);
      if (!generationError) {
        if ((err as Error)?.message?.includes('timeout')) {
          setGenerationError(`Connection timeout: ComfyUI is not responding. Please check if ComfyUI is running correctly.`);
        } else {
          setGenerationError(`Failed to generate image: ${(err as Error)?.message || 'Unknown error'}`);
        }
      }
    } finally {
      setProgress(null);
      setIsGenerating(false);
      setCurrentPipeline(null);
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
    }
  };

  // Timeout to detect stalled generations (e.g. generation taking too long)
  useEffect(() => {
    if (!isGenerating) return;
    const timeout = setTimeout(() => {
      if (isGenerating && !generationError) {
        console.warn('Generation taking too long - may have stalled');
      }
    }, 60000);
    return () => clearTimeout(timeout);
  }, [isGenerating, generationError]);

  // (2) Notification auto-hide
  useEffect(() => {
    if (!showNotification) return;
    
    const timeout = setTimeout(() => {
      setShowNotification(false);
    }, 3000);
    
    return () => clearTimeout(timeout);
  }, [isGenerating, generationError]);

  const handleSettingsClick = () => {
    toggleSettingsPanel();
  };

  // Function to cancel the current generation with cleanup
  const handleCancelGeneration = useCallback(() => {
    console.log("Cancelling generation...");
    if (currentPipeline && clientRef.current) {
      try {
        // Attempt to interrupt the pipeline (if supported)
        clientRef.current.interrupt();
        
        // Smart memory management: Only free general memory during cancellation, keep model loaded
        clientRef.current.free({
          free_memory: true,
          unload_models: false
        });
      } catch (e) {
        console.error('Failed to interrupt pipeline:', e);
      }
    }
    setIsGenerating(false);
    setProgress(null);
    setGenerationError(null);
    setCurrentPipeline(null);
    if (generationTimeoutRef.current) {
      clearTimeout(generationTimeoutRef.current);
      generationTimeoutRef.current = null;
    }
  }, [currentPipeline]);

  // Function to retry generation
  const handleRetryGeneration = useCallback(() => {
    console.log("Retrying generation...");
    setGenerationError(null);
    setProgress(null);
    if (clientRef.current?.socket?.readyState !== WebSocket.OPEN) {
      console.log("WebSocket not open, attempting to reconnect...");
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch (e) {
          console.error("Error closing existing client:", e);
        }
        clientRef.current = null;
      }
    }
    setTimeout(() => {
      handleGenerate();
    }, 300);
  }, []);

  // Add a function to retry the connection
  const handleRetryConnection = useCallback(() => {
    console.log("Retrying connection...");
    setConnectionError(null);
    setLoadingStatus(prev => ({ ...prev, connection: 'connecting' }));
    
    if (clientRef.current) {
      try {
        // Smart memory management: Free all memory before reconnecting
        clientRef.current.free({
          free_memory: true,
          unload_models: true
        });
        clientRef.current.close();
      } catch (e) {
        console.error("Error cleaning up during reconnection:", e);
      }
      clientRef.current = null;
      lastUsedModelRef.current = null; // Reset model tracking on reconnection
    }
    
    // Re-initialize the connection
    const fetchAndConnectClient = async () => {
      try {
        console.log('Using ComfyUI service URL for retry:', comfyuiUrl);

        let url = comfyuiUrl;
        if (comfyuiUrl.includes('http://') || comfyuiUrl.includes('https://')) {
          url = comfyuiUrl.split('//')[1];
        }
        const ssl_type = comfyuiUrl.includes('https') ? true : false;

        const client = new Client({ api_host: url, ssl: ssl_type });
        clientRef.current = client;
        client.connect();
        console.log('ComfyUI client connected');

        if (client.socket) {
          client.socket.addEventListener('open', (e) => {
            console.log('Debug: WebSocket open:', e);
            setWsStatus('Connected');
            setLoadingStatus(prev => ({ ...prev, connection: 'connected' }));
          });
          client.socket.addEventListener('message', (e) => {
            console.log('Debug: WebSocket message:', e);
          });
          client.socket.addEventListener('close', (e) => {
            console.log('Debug: WebSocket close:', e);
            setWsStatus('Disconnected');
            setLoadingStatus(prev => ({ ...prev, connection: 'error' }));
            setConnectionError('WebSocket connection closed unexpectedly');
          });
          client.socket.addEventListener('error', (e) => {
            console.log('Debug: WebSocket error:', e);
            setWsStatus('Error');
            setLoadingStatus(prev => ({ ...prev, connection: 'error' }));
            setConnectionError('Error establishing WebSocket connection');
          });
        }

        // Try to wait for connection to establish with timeout
        try {
          await waitForClientConnection(client);
          // Continue with model loading if connection successful
          loadModelsAndData(client);
        } catch (connErr) {
          console.error("Connection retry failed:", connErr);
          setLoadingStatus(prev => ({ ...prev, connection: 'timeout' }));
          setConnectionError(`Connection timeout: ComfyUI is not responding after 15 seconds`);
        }
      } catch (error) {
        console.error('Error connecting to ComfyUI client:', error);
        setConnectionError(`Failed to connect to ComfyUI: ${(error as Error)?.message || 'Unknown error'}`);
      }
    };
    
    fetchAndConnectClient();
  }, []);
  
  // Helper function to load models and data
  const loadModelsAndData = async (client: Client) => {
    // Try to load SD Models
    try {
      setLoadingStatus(prev => ({ ...prev, sdModels: 'loading' }));
      const sdModelsResp = await client.getSDModels();
      setSDModels(sdModelsResp);
      setLoadingStatus(prev => ({ ...prev, sdModels: 'success' }));
      
      const lastUsedModel = localStorage.getItem(LAST_USED_MODEL_KEY);
      if (lastUsedModel && sdModelsResp.includes(lastUsedModel)) {
        setSelectedModel(lastUsedModel);
      }
    } catch (err) {
      console.error('Error fetching SD Models:', err);
      setLoadingStatus(prev => ({ ...prev, sdModels: 'error' }));
    }
    
    // Try to load LoRAs, VAEs, and system stats
    try {
      setLoadingStatus(prev => ({ ...prev, loras: 'loading' }));
      const lorasResp = await client.getLoRAs();
      setLoras(lorasResp);
      setLoadingStatus(prev => ({ ...prev, loras: 'success' }));
    } catch (err) {
      console.error('Error fetching LoRAs:', err);
      setLoadingStatus(prev => ({ ...prev, loras: 'error' }));
    }
    try {
      setLoadingStatus(prev => ({ ...prev, vaes: 'loading' }));
      const vaesResp = await client.getVAEs();
      setVAEs(vaesResp);
      setLoadingStatus(prev => ({ ...prev, vaes: 'success' }));
    } catch (err) {
      console.error('Error fetching VAEs:', err);
      setLoadingStatus(prev => ({ ...prev, vaes: 'error' }));
    }
    try {
      setLoadingStatus(prev => ({ ...prev, systemStats: 'loading' }));
      const sysStats = await client.getSystemStats();
      setSystemStats(sysStats);
      setLoadingStatus(prev => ({ ...prev, systemStats: 'success' }));
    } catch (err) {
      console.error('Error fetching system stats:', err);
      setLoadingStatus(prev => ({ ...prev, systemStats: 'error' }));
    }

    // Load Control Net Models
    try {
      const controlNetResp = await client.getCNetModels();
      setControlNetModels(controlNetResp);
      console.log('Control Net Models:', controlNetResp);
    } catch (err) {
      console.error('Error fetching Control Net Models:', err);
    }

    // Load Upscale Models
    try {
      const upscaleResp = await client.getUpscaleModels();
      setUpscaleModels(upscaleResp);
      console.log('Upscale Models:', upscaleResp);
    } catch (err) {
      console.error('Error fetching Upscale Models:', err);
    }

    setIsInitialSetupComplete(true);
  };

  // Handling home navigation
  const handleNavigateHome = useCallback(() => {
    console.log("Navigating back to home/dashboard");
    if (onPageChange) {
      onPageChange('dashboard');
    }
  }, [onPageChange]);

  const handleModelSelection = (model: string) => {
    // Smart memory management: Only unload previous model if toggle is disabled OR if switching to a different model
    if (lastUsedModelRef.current && lastUsedModelRef.current !== model && clientRef.current) {
      if (!smartMemoryEnabled) {
        console.log(`🧠 Traditional memory: Switching from ${lastUsedModelRef.current} to ${model}, unloading previous model`);
        try {
          clientRef.current.free({
            free_memory: true,
            unload_models: true
          });
        } catch (error) {
          console.warn('Failed to unload previous model:', error);
        }
      } else {
        console.log(`🧠 Smart memory: Switching from ${lastUsedModelRef.current} to ${model}, keeping previous model loaded`);
        // With smart memory, we might want to selectively unload only if memory is getting tight
        // For now, we keep all models loaded for maximum performance
      }
    }
    
    setSelectedModel(model);
    
    // Try to load saved config
    const savedConfig = loadModelConfig(model);
    
    if (savedConfig) {
      setDenoise(savedConfig.denoise);
      setSteps(savedConfig.steps);
      setGuidanceScale(savedConfig.guidanceScale);
      setSampler(savedConfig.sampler);
      setScheduler(savedConfig.scheduler);
      setNegativeTags(savedConfig.negativeTags);
      
      setNotificationMessage('Loaded your saved settings for this model');
    } else {
      // Load optimal config
      const optimalConfig = getOptimalConfig(model);
      setDenoise(optimalConfig.denoise);
      setSteps(optimalConfig.steps);
      setGuidanceScale(optimalConfig.guidanceScale);
      setSampler(optimalConfig.sampler);
      setScheduler(optimalConfig.scheduler);
      setNegativeTags(optimalConfig.negativeTags);
      
      setNotificationMessage('angela loaded optimal settings for this model');
    }
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  // Handlers for negative prompt tags
  const handleNegativeTagAdd = () => {
    if (negativeInput.trim()) {
      setNegativeTags([...negativeTags, negativeInput.trim()]);
      setNegativeInput('');
    }
  };
  const handleNegativeTagRemove = (tagToRemove: string) => {
    setNegativeTags(negativeTags.filter((tag) => tag !== tagToRemove));
  };
  const handleNegativeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleNegativeTagAdd();
    }
  };

  // Helpers to delete or download generated images
  const handleDelete = (index: number) => {
    setGeneratedImages((prev) => prev.filter((_, i) => i !== index));
  };
  const handleDownload = (imageDataUrl: string, index: number) => {
    const a = document.createElement('a');
    a.href = imageDataUrl;
    a.download = `generated-${index + 1}.png`;
    a.click();
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleImageUpload = (buffer: ArrayBuffer) => {
    console.log('Received image buffer in ImageGen:', buffer);
    setImageBuffer(buffer);
  };

  // Function to make direct API calls for prompt enhancement
  const makeDirectEnhancementCall = async (
    provider: angelaProvider,
    model: angelaModel,
    prompt: string,
    imageData?: { preview: string; buffer: ArrayBuffer; base64: string }
  ): Promise<string> => {
    console.log(`🔧 Making direct API call to ${provider.name} (${provider.type})`);
    
    try {
      // Prepare the messages array
      const messages = [];
      
      if (imageData) {
        // For vision models, include the image
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageData.base64}`
              }
            }
          ]
        });
      } else {
        // Text-only request
        messages.push({
          role: 'user',
          content: prompt
        });
      }

      // Prepare the request body based on provider type
      let requestBody: any;
      let apiUrl: string;
      let headers: Record<string, string>;

      switch (provider.type) {
        case 'openai':
          apiUrl = `${provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          };
          requestBody = {
            model: model.name,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'text' }
          };
          break;

        case 'ollama':
          apiUrl = `${provider.baseUrl || 'http://localhost:11434'}/api/chat`;
          headers = {
            'Content-Type': 'application/json'
          };
          requestBody = {
            model: model.name,
            messages: messages,
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: 1000
            }
          };
          break;

        case 'openrouter':
          apiUrl = `${provider.baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
            'HTTP-Referer': 'https://angelaverse.app',
            'X-Title': 'angelaVerse ImageGen Enhancement'
          };
          requestBody = {
            model: model.name,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000
          };
          break;

        case 'angelas-pocket':
          // angela's Pocket - OpenAI-compatible API (base URL already includes /v1)
          apiUrl = `${provider.baseUrl || 'http://localhost:8080'}/chat/completions`;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey || 'angela-key'}`
          };
          requestBody = {
            model: model.name,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000
          };
          break;

        case 'custom':
          // For custom providers, assume OpenAI-compatible API
          apiUrl = `${provider.baseUrl}/chat/completions`;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          };
          requestBody = {
            model: model.name,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000
          };
          break;

        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      console.log(`📡 Making request to ${apiUrl}`);
      console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));

            // Make the API call
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseData = await response.json();
      console.log('📥 API response:', responseData);

      // Extract the response based on provider type
      let enhancedText: string;
      
      if (provider.type === 'ollama') {
        enhancedText = responseData.message?.content || responseData.response || '';
      } else {
        // OpenAI-compatible response format
        enhancedText = responseData.choices?.[0]?.message?.content || '';
      }

      if (!enhancedText) {
        throw new Error('No content received from API response');
      }

      return enhancedText.trim();

    } catch (error) {
      console.error(`❌ Direct API call failed for ${provider.name}:`, error);
      
      // Provide helpful error messages for common issues
      if (error instanceof Error && error.message.includes('CORS')) {
        throw new Error(`CORS error: ${provider.name} doesn't allow cross-origin requests. Try using a different provider like OpenAI or Ollama, or configure ${provider.name} to allow CORS headers.`);
      } else if (error instanceof Error && error.message.includes('Failed to fetch')) {
        throw new Error(`Network error: Cannot connect to ${provider.name} at ${provider.baseUrl}. Make sure the service is running and accessible.`);
      }
      
      throw new Error(`Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Add this effect to check LLM connection
  useEffect(() => {
    const checkLLMConnection = async () => {
      try {
        console.log('🔍 Checking LLM connection and loading providers...');
        
        // Load providers
        const loadedProviders = await angelaApiService.getProviders();
        const enabledProviders = loadedProviders.filter(p => p.isEnabled);
        setProviders(enabledProviders);
        
        if (enabledProviders.length === 0) {
          console.warn('⚠️ No enabled providers found');
          setIsLLMConnected(false);
          return;
        }

        // Load models for enhancement
        const models = await fetchLLMModels();
        setAvailableModels(models);
        
        // Test connection to at least one provider
        let hasHealthyProvider = false;
        for (const provider of enabledProviders) {
          try {
            const isHealthy = await angelaApiService.testProvider(provider);
            if (isHealthy) {
              hasHealthyProvider = true;
              console.log(`✅ Provider ${provider.name} is healthy`);
              break;
            }
          } catch (error) {
            console.warn(`⚠️ Provider ${provider.name} test failed:`, error);
          }
        }
        
        setIsLLMConnected(hasHealthyProvider);
        
        // If we have a saved model, make sure it's still available
        const savedModel = localStorage.getItem(LAST_USED_LLM_KEY);
        if (savedModel && !models.find(m => m.id === savedModel)) {
          // Saved model is no longer available, clear it
          localStorage.removeItem(LAST_USED_LLM_KEY);
          setEnhanceSettings(prev => ({ ...prev, selectedModel: '' }));
        }
        
        console.log(`🎯 LLM connection check complete. Connected: ${hasHealthyProvider}`);
      } catch (error) {
        console.error('❌ LLM connection check failed:', error);
        setIsLLMConnected(false);
      }
    };
    
    checkLLMConnection();
  }, []);

  // Add enhance prompt handler
  const handleEnhancePrompt = async (currentPrompt: string, imageData?: { preview: string; buffer: ArrayBuffer; base64: string }): Promise<string> => {
    if (!isLLMConnected || !enhanceSettings.selectedModel) {
      console.warn('⚠️ No LLM connected or no model selected for enhancement');
      return currentPrompt;
    }
    
    setIsEnhancing(true);
    try {
      console.log(`🚀 Enhancing prompt with model: ${enhanceSettings.selectedModel}`);
      
      // Find the model and its provider
      const selectedModel = availableModels.find(m => m.id === enhanceSettings.selectedModel);
      if (!selectedModel) {
        throw new Error('Selected model not found');
      }
      
      const provider = providers.find(p => p.id === selectedModel.provider);
      if (!provider) {
        throw new Error('Provider for selected model not found');
      }
      
      console.log(`📡 Using provider: ${provider.name} (${provider.type})`);
      
      // Prepare the enhancement request
      const enhancementPrompt = imageData 
        ? currentPrompt
          ? `Analyze this image and enhance the following prompt by incorporating visual details from the image: "${currentPrompt}". 
             Include specific details about style, composition, lighting, and important elements from both the image and original prompt.`
          : "Analyze this image and provide a detailed text-to-image generation prompt that would recreate it. Include style, composition, lighting, and important details."
        : enhanceSettings.systemPrompt + `\n\n${currentPrompt}\n\nDon't include the text "Original prompt:" or "Enhanced prompt:" in your response`;

      // Use angela's API service for the enhancement
      const enhancementConfig = {
        provider: provider.id,
        model: selectedModel.name,
        temperature: 0.7,
        maxTokens: 1000
      };
      
      // Create a temporary message for the API
      const enhancementMessage = {
        role: 'user' as const,
        content: enhancementPrompt,
        attachments: imageData ? [{
          type: 'image' as const,
          data: imageData.base64,
          mimeType: 'image/png'
        }] : undefined
      };

      console.log('📤 Sending enhancement request...');
      
      // Make direct API call to the provider
      const enhancedPrompt = await makeDirectEnhancementCall(
        provider,
        selectedModel,
        enhancementPrompt,
        imageData
      );
      
      // Update prompt and notification based on the case
      if (imageData && currentPrompt) {
        // Case 3: Image + Text
        const combinedPrompt = `${currentPrompt}\n\n${enhancedPrompt}`;
        setPrompt(combinedPrompt);
        setNotificationMessage(`Enhanced prompt using image context and original text via ${provider.name}`);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
        return combinedPrompt;
      } else if (imageData) {
        // Case 1: Image only
        setPrompt(enhancedPrompt);
        setNotificationMessage(`Generated prompt from image using ${selectedModel.name} via ${provider.name}`);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
        return enhancedPrompt;
      } else {
        // Case 2: Text only
        if (enhancedPrompt === currentPrompt) {
          setNotificationMessage('No changes needed to your prompt');
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 3000);
          return currentPrompt;
        } else {
          setPrompt(enhancedPrompt);
          setNotificationMessage(`Prompt enhanced with ${selectedModel.name} via ${provider.name}`);
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 3000);
          return enhancedPrompt;
        }
      }
    } catch (error) {
      console.error('❌ Error enhancing prompt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setNotificationMessage(`Failed to enhance prompt: ${errorMessage}`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      return currentPrompt; // Return original prompt on error
    } finally {
      setIsEnhancing(false);
    }
  };

  // Add handler for model selection with provider information
  const handleLLMModelSelect = (modelId: string) => {
    const selectedModel = availableModels.find(m => m.id === modelId);
    if (selectedModel) {
      localStorage.setItem(LAST_USED_LLM_KEY, modelId);
      setEnhanceSettings(prev => ({ ...prev, selectedModel: modelId }));
      
      const provider = providers.find(p => p.id === selectedModel.provider);
      console.log(`🎯 Selected model: ${selectedModel.name} from ${provider?.name || 'Unknown Provider'}`);
    }
  };

  // Add smart memory management toggle handler
  const handleToggleSmartMemory = () => {
    const newValue = !smartMemoryEnabled;
    setSmartMemoryEnabled(newValue);
    localStorage.setItem('angela-smart-memory-enabled', JSON.stringify(newValue));
    
    setNotificationMessage(
      newValue 
        ? '🧠 Smart Memory enabled: Models stay loaded for maximum speed (uses more VRAM)'
        : '💾 Standard Memory enabled: Models unloaded after generation (saves VRAM)'
    );
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 4000);
  };

  // Add a new function to handle explicit image clearing
  const handleImageClear = () => {
    setImageBuffer(null);
    setClearImageFlag(true);
    // Reset the flag after a short delay to allow for future clears
    setTimeout(() => setClearImageFlag(false), 100);
  };

  // Add handler for switching to ComfyUI interface
  const handleSwitchToComfyUI = () => {
    if (!showComfyUIInterface) {
      // Only reset states when switching TO ComfyUI, not when switching back
      setComfyUILoadError(false);
      setComfyUILoading(true);
      // Don't change the key to prevent refresh
    }
    setShowComfyUIInterface(!showComfyUIInterface);
  };

  // Handle iframe load success
  const handleComfyUILoad = () => {
    console.log('ComfyUI interface loaded successfully');
    setComfyUILoading(false);
    setComfyUILoadError(false);
  };

  // Handle iframe load error
  const handleComfyUIError = () => {
    console.error('Failed to load ComfyUI interface - likely due to X-Frame-Options or CORS');
    setComfyUILoading(false);
    setComfyUILoadError(true);
  };

  // Function to open ComfyUI in new tab as fallback
  const openComfyUIInNewTab = () => {
    window.open(comfyuiUrl, '_blank', 'noopener,noreferrer');
  };

  // Function to force refresh ComfyUI iframe (only when needed)
  const refreshComfyUI = () => {
    setComfyUIKey(prev => prev + 1);
    setComfyUILoadError(false);
    setComfyUILoading(true);
  };

  // ComfyUI startup modal handlers
  const handleComfyUIModalClose = () => {
    setShowComfyUIStartupModal(false);
  };

  const handleComfyUIModalSuccess = () => {
    setShowComfyUIStartupModal(false);
    setConnectionError(null);
    
    // Retry connection after successful startup
    setTimeout(() => {
      // Trigger a reconnection by updating the comfyUI key or retrying connection
      const reconnect = async () => {
        try {
          console.log('Retrying ComfyUI connection after successful startup...');
          let url = comfyuiUrl;
          if (!url) url = 'http://localhost:8188';
          const isHttps = url.startsWith('https://');
          url = url.replace(/^https?:\/\//, '');
          const client = new Client({ api_host: url, ssl: isHttps });
          clientRef.current = client;
          await client.connect();
          
          // Fetch data again
          const sdModelsResp = await client.getSDModels();
          setSDModels(sdModelsResp);
          const lorasResp = await client.getLoRAs();
          setLoras(lorasResp);
          const vaesResp = await client.getVAEs();
          setVAEs(vaesResp);
          
          setLoadingStatus({
            sdModels: 'success',
            loras: 'success',
            vaes: 'success',
            systemStats: 'success',
            connection: 'connected'
          });
          setIsInitialSetupComplete(true);
          console.log('ComfyUI reconnection successful');
        } catch (err) {
          console.error('ComfyUI reconnection failed:', err);
          // Don't show modal again immediately to avoid loops
        }
      };
      reconnect();
    }, 2000); // Wait 2 seconds before retrying
  };

  // System compatibility modal handlers
  const handleUserRejection = () => {
    setShowCompatibilityModal(false);
  };

  const handleUserConsent = () => {
    setShowCompatibilityModal(false);
    setUserHasConsented(true);
  };

  // Replace the fetchLLMModels function with provider-based system
  const fetchLLMModels = async (): Promise<angelaModel[]> => {
    try {
      console.log('🔄 Fetching models from all configured providers...');
      
      // Get all enabled providers
      const allProviders = await angelaApiService.getProviders();
      const enabledProviders = allProviders.filter(p => p.isEnabled);
      
      console.log(`📡 Found ${enabledProviders.length} enabled providers:`, 
        enabledProviders.map(p => `${p.name} (${p.type})`));
      
      if (enabledProviders.length === 0) {
        console.warn('⚠️ No enabled providers found');
        return [];
      }

      // Load models from all enabled providers
      let allModels: angelaModel[] = [];
      for (const provider of enabledProviders) {
        try {
          console.log(`📦 Loading models from ${provider.name}...`);
          const providerModels = await angelaApiService.getModels(provider.id);
          allModels = [...allModels, ...providerModels];
          console.log(`✅ Loaded ${providerModels.length} models from ${provider.name}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load models from ${provider.name}:`, error);
        }
      }
      
      // Filter to only include text and multimodal models suitable for enhancement
      const enhancementModels = allModels.filter(model => 
        model.type === 'text' || 
        model.type === 'multimodal' || 
        model.supportsVision ||
        model.name.toLowerCase().includes('gpt') ||
        model.name.toLowerCase().includes('claude') ||
        model.name.toLowerCase().includes('llama') ||
        model.name.toLowerCase().includes('qwen') ||
        model.name.toLowerCase().includes('mistral')
      );
      
      console.log(`🎯 Found ${enhancementModels.length} suitable models for enhancement:`,
        enhancementModels.map(m => `${m.name} (${m.provider})`));
      
      return enhancementModels;
    } catch (error) {
      console.error('❌ Failed to fetch models:', error);
      return [];
    }
  };

  const getComfyApiUrl = async () => {
    const config = await db.getAPIConfig();
    let url = config?.comfyui_base_url || '127.0.0.1:8188';
    if (!url.startsWith('http')) url = 'http://' + url;
    // REMOVED: url = url.replace(/:(\d+)$/, ':8189');
    return url;
  };

  return (
    <div className="flex h-screen relative">
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

      {/* Content with relative z-index */}
      <div className="relative z-10 flex h-screen w-full">
        {!isInitialSetupComplete && (
          <InitialLoadingOverlay 
            loadingStatus={loadingStatus} 
            connectionError={connectionError}
            onNavigateHome={handleNavigateHome}
            onRetry={handleRetryConnection}
          />
        )}
        <Sidebar
          activePage="image-gen"
          onPageChange={onPageChange || (() => {})}
        />
        <div className="flex-1 flex flex-col">
          <ImageGenHeader 
            userName="User" 
            onPageChange={onPageChange} 
            systemStats={systemStats}
            onComfyUIManager={() => setShowComfyUIManager(true)}
            onModelManager={() => setShowModelManager(true)}
            onSwitchToComfyUI={handleSwitchToComfyUI}
            onRefreshComfyUI={refreshComfyUI}
            showComfyUIInterface={showComfyUIInterface}
            comfyuiMode={comfyuiMode}
            smartMemoryEnabled={smartMemoryEnabled}
            onToggleSmartMemory={handleToggleSmartMemory}
          />
          
          {/* Conditional rendering: Show either angela's interface or ComfyUI interface */}
          {showComfyUIInterface ? (
            // ComfyUI Interface
            <div className="flex-1 relative bg-gray-100 dark:bg-gray-900">
              {/* Loading State */}
              {comfyUILoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-20">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading ComfyUI Interface...</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {comfyUILoadError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-20">
                  <div className="text-center max-w-md mx-auto p-6">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Cannot Load ComfyUI Interface
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      ComfyUI cannot be embedded due to security restrictions (X-Frame-Options). 
                      You can open it in a new tab instead.
                    </p>
                    <div className="space-y-3">
                      <button
                        onClick={openComfyUIInNewTab}
                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Open ComfyUI in New Tab
                      </button>
                      <button
                        onClick={handleSwitchToComfyUI}
                        className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Back to angela ImageGen
                      </button>
                    </div>
                  </div>
                </div>
              )}

                           {/* ComfyUI WebView */}
               {!comfyUILoadError && (
                 <ComfyUIWebView
                   onLoad={handleComfyUILoad}
                   onError={handleComfyUIError}
                   comfyUIKey={comfyUIKey}
                   comfyuiUrl={comfyuiUrl}
                 />
               )}


            </div>
          ) : (
            // angela's ImageGen Interface
            <>
              {isGenerating && (
                <LoadingOverlay 
                  progress={progress} 
                  images={generatedImages}
                  error={generationError}
                  onCancel={handleCancelGeneration}
                  onRetry={handleRetryGeneration}
                  onNavigateHome={handleNavigateHome}
                />
              )}
              <div className="flex-1 overflow-hidden flex">
                <div className={`flex-1 flex flex-col transition-all duration-300 ${showSettings ? 'pr-80' : 'pr-0'}`}>
                  {/* Gallery section - takes remaining space */}
                  <div className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${showSettings ? 'max-w-5xl' : 'max-w-7xl'} mx-auto w-full`}>
                    <GeneratedGallery
                      generatedImages={generatedImages}
                      isGenerating={isGenerating}
                      handleDownload={handleDownload}
                      handleDelete={handleDelete}
                    />
                  </div>
                  
                  {/* Prompt area - sticks to bottom */}
                  <div className={`flex-shrink-0 p-6 transition-all duration-300 ${showSettings ? 'max-w-5xl' : 'max-w-7xl'} mx-auto w-full`}>
                    <PromptArea
                      prompt={prompt}
                      setPrompt={setPrompt}
                      mustSelectModel={mustSelectModel}
                      isGenerating={isGenerating}
                      handleSettingsClick={handleSettingsClick}
                      handleGenerate={handleGenerate}
                      showSettings={showSettings}
                      handleImageUpload={handleImageUpload}
                      onEnhancePrompt={handleEnhancePrompt}
                      isEnhancing={isEnhancing}
                      isLLMConnected={isLLMConnected}
                      availableModels={availableModels}
                      onModelSelect={handleLLMModelSelect}
                      clearImage={clearImageFlag}
                      onImageClear={handleImageClear}
                      providers={providers} // Pass providers to PromptArea
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Global UI Elements */}
        {showNotification && (
          <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg transition-opacity duration-300">
            {notificationMessage}
          </div>
        )}
        {showComfyUIManager && (
          <ComfyUIManager onClose={() => setShowComfyUIManager(false)} />
        )}
        {showModelManager && (
          <ImageModelManager onClose={() => setShowModelManager(false)} />
        )}
        {showCompatibilityModal && systemInfo && (
          <SystemCompatibilityModal
            isOpen={showCompatibilityModal}
            onClose={handleUserRejection}
            onAccept={handleUserConsent}
            systemInfo={systemInfo}
          />
        )}
        
        {/* Configuration Sidebar - Vertical Tab - Only show in angela interface mode */}
        {!showComfyUIInterface && (
          <div
            ref={edgeRef}
            className={`fixed right-0 glassmorphic transition-all duration-300 z-[10000] ${
              showSettings ? 'w-80' : 'w-16'
            } border-l border-gray-200/20 dark:border-gray-700/20`}
            style={{ 
              top: '4rem', // Position below the header (64px)
              height: 'calc(100vh - 4rem)', // Full height minus header
              backdropFilter: 'blur(10px)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              minWidth: showSettings ? '20rem' : '4rem', 
              maxWidth: showSettings ? '20rem' : '4rem' 
            }}
            onMouseEnter={handleSettingsMouseEnter}
            onMouseLeave={handleSettingsMouseLeave}
          >
            {showSettings ? (
              // Expanded settings panel with toggle button
              <div className="h-full flex flex-col">
                {/* Header with toggle button */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200/30 dark:border-gray-700/50">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Settings</h3>
                  <button
                    onClick={toggleSettingsPanel}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Collapse settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                
                {/* Settings content */}
                <div className="flex-1 overflow-y-auto">
                  <SettingsDrawer
                    drawerRef={edgeRef}
                    showSettings={showSettings}
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                    sdModels={sdModels}
                    selectedModel={selectedModel}
                setSelectedModel={handleModelSelection}
                loras={loras}
                selectedLora={selectedLora}
                setSelectedLora={setSelectedLora}
                loraStrength={loraStrength}
                setLoraStrength={setLoraStrength}
                vaes={vaes}
                selectedVae={selectedVae}
                setSelectedVae={setSelectedVae}
                negativeTags={negativeTags}
                negativeInput={negativeInput}
                setNegativeInput={setNegativeInput}
                handleNegativeTagAdd={handleNegativeTagAdd}
                handleNegativeTagRemove={handleNegativeTagRemove}
                handleNegativeInputKeyDown={handleNegativeInputKeyDown}
                steps={steps}
                setSteps={setSteps}
                guidanceScale={guidanceScale}
                setGuidanceScale={setGuidanceScale}
                resolutions={RESOLUTIONS}
                selectedResolution={selectedResolution}
                setSelectedResolution={setSelectedResolution}
                customWidth={customWidth}
                setCustomWidth={setCustomWidth}
                customHeight={customHeight}
                setCustomHeight={setCustomHeight}
                controlNetModels={controlNetModels}
                selectedControlNet={selectedControlNet}
                setSelectedControlNet={setSelectedControlNet}
                upscaleModels={upscaleModels}
                selectedUpscaler={selectedUpscaler}
                setSelectedUpscaler={setSelectedUpscaler}
                denoise={denoise}
                setDenoise={setDenoise}
                sampler={sampler}
                setSampler={setSampler}
                scheduler={scheduler}
                setScheduler={setScheduler}
                  />
                </div>
              </div>
            ) : (
              // Collapsed vertical tab with toggle button
              <div className="flex flex-col items-center h-full">
                {/* Toggle button at top */}
                <div className="flex justify-center py-4">
                  <button
                    onClick={toggleSettingsPanel}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Expand settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
                
                {/* Centered content */}
                <div className="flex-1 flex flex-col items-center justify-center p-2">
                  <div 
                    className="writing-mode-vertical text-center cursor-pointer select-none"
                    style={{ 
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      transform: 'rotate(180deg)'
                    }}
                  >
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 tracking-wider uppercase">
                      Configuration
                    </span>
                  </div>
                  <div className="mt-4 space-y-3 flex flex-col items-center">
                    {/* Settings icon */}
                    <div className="w-6 h-6 text-gray-500 dark:text-gray-400">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    {/* Model indicator */}
                    {selectedModel && (
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* ComfyUI Startup Modal */}
        <ComfyUIStartupModal
          isOpen={showComfyUIStartupModal}
          onClose={handleComfyUIModalClose}
          onSuccess={handleComfyUIModalSuccess}
          comfyuiMode={comfyuiMode}
          comfyuiUrl={comfyuiUrl}
        />
      </div>
    </div>
  );
};

export default ImageGen;
