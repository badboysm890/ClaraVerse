import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Image, Settings, Loader2, Zap, AlertCircle, CheckCircle, WifiOff } from 'lucide-react';
import { Client, BasePipe } from '@stable-canvas/comfyui-client';
// import { angelaMessage, angelaFileAttachment } from '../../types/angela_assistant_types';
import { db } from '../../db';

// Resolution options for image generation
interface Resolution {
  label: string;
  width: number;
  height: number;
}

const RESOLUTIONS: Resolution[] = [
  { label: 'Square (1:1)', width: 512, height: 512 },
  { label: 'Portrait (2:3)', width: 832, height: 1216 },
  { label: 'Landscape (3:2)', width: 1216, height: 832 },
  { label: 'Wide (16:9)', width: 1280, height: 720 },
  { label: 'Mobile', width: 720, height: 1280 },
  { label: 'Custom', width: 0, height: 0 },
];

// Image generation settings
interface ImageGenSettings {
  model: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  resolution: Resolution;
  customWidth: number;
  customHeight: number;
  sampler: string;
  scheduler: string;
  denoise: number;
}

// Connection status type
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Props for the ChatImageGenWidget
interface ChatImageGenWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated: (imageDataUrl: string, prompt: string, settings: ImageGenSettings) => void;
  initialPrompt?: string;
  availableModels: string[];
}

// Custom hook for ComfyUI service configuration
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
        const configs = await (window as any).electronAPI.invoke('service-config:get-all-configs');
        const status = await (window as any).electronAPI.invoke('service-config:get-enhanced-status');
        
        const comfyuiConfig = configs?.comfyui || { mode: 'docker', url: null };
        const comfyuiStatus = status?.comfyui || {};

        // Set the mode from the actual deployment mode in status, fallback to config mode
        const actualMode = comfyuiStatus.deploymentMode || comfyuiConfig.mode || 'docker';
        setComfyuiMode(actualMode);

        let finalUrl = 'http://localhost:8188'; // Default fallback

        if (comfyuiConfig.mode === 'manual' && comfyuiConfig.url) {
          finalUrl = comfyuiConfig.url;
        } else if (comfyuiStatus.serviceUrl) {
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

        setComfyuiUrl(finalUrl);
      } catch (error) {
        console.error('Failed to load ComfyUI service config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadServiceConfig();
  }, []);

  return { comfyuiUrl, comfyuiMode, loading };
};

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Wait for client connection
const waitForClientConnection = async (client: Client): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket connection timeout - failed to connect after 15 seconds"));
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

// Tooltip component
const Tooltip: React.FC<{
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ children, content, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2';
      case 'bottom':
        return 'top-full left-1/2 transform -translate-x-1/2 mt-2';
      case 'left':
        return 'right-full top-1/2 transform -translate-y-1/2 mr-2';
      case 'right':
        return 'left-full top-1/2 transform -translate-y-1/2 ml-2';
      default:
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2';
    }
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div className={`absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap ${getPositionClasses()}`}>
          {content}
          <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45" 
               style={{
                 [position === 'top' ? 'top' : position === 'bottom' ? 'bottom' : position === 'left' ? 'left' : 'right']: position === 'top' ? '100%' : position === 'bottom' ? '-4px' : '50%',
                 [position === 'top' || position === 'bottom' ? 'left' : 'top']: position === 'top' || position === 'bottom' ? '50%' : '50%',
                 transform: position === 'top' || position === 'bottom' ? 'translateX(-50%) rotate(45deg)' : 'translateY(-50%) rotate(45deg)'
               }}
          />
        </div>
      )}
    </div>
  );
};

const ChatImageGenWidget: React.FC<ChatImageGenWidgetProps> = ({
  isOpen,
  onClose,
  onImageGenerated,
  initialPrompt = '',
  availableModels = []
}) => {
  const { comfyuiUrl, loading: serviceConfigLoading } = useComfyUIServiceConfig();
  const clientRef = useRef<Client | null>(null);
  
  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Image generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ value: number; max: number } | null>(null);
  
  // Settings state
  const [settings, setSettings] = useState<ImageGenSettings>({
    model: availableModels[0] || '',
    prompt: initialPrompt,
    negativePrompt: 'nsfw, (worst quality, low quality, normal quality:2)',
    steps: 20,
    cfg: 7.5,
    resolution: RESOLUTIONS[0],
    customWidth: 1024,
    customHeight: 1024,
    sampler: 'euler',
    scheduler: 'normal',
    denoise: 1.0
  });

  // UI state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Test connection to ComfyUI
  const testConnection = useCallback(async () => {
    if (serviceConfigLoading) return;
    
    setConnectionStatus('connecting');
    setConnectionError(null);
    
    try {
      const url = comfyuiUrl;
      let processedUrl = url;
      if (url.includes('http://') || url.includes('https://')) {
        processedUrl = url.split('//')[1];
      }
      const ssl_type = url.includes('https') ? true : false;
      
      const client = new Client({ api_host: processedUrl, ssl: ssl_type });
      client.connect();
      
      // Wait for connection with timeout
      await waitForClientConnection(client);
      
      // Test if we can get models (this validates the connection works)
      const models = await client.getSDModels();
      console.log('✅ ComfyUI connection successful, found', models.length, 'models');
      
      setConnectionStatus('connected');
      clientRef.current = client;
      
    } catch (error) {
      console.error('❌ ComfyUI connection failed:', error);
      setConnectionStatus('error');
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect to ComfyUI');
    }
  }, [comfyuiUrl, serviceConfigLoading]);

  // Test connection when widget opens
  useEffect(() => {
    if (isOpen && !serviceConfigLoading) {
      testConnection();
    }
  }, [isOpen, serviceConfigLoading, testConnection]);

  // Update initial prompt when it changes
  useEffect(() => {
    if (initialPrompt && isOpen) {
      setSettings(prev => ({ ...prev, prompt: initialPrompt }));
    }
  }, [initialPrompt, isOpen]);

  // Update model when available models change
  useEffect(() => {
    if (availableModels.length > 0 && !settings.model) {
      setSettings(prev => ({ ...prev, model: availableModels[0] }));
    }
  }, [availableModels, settings.model]);

  // Get button disabled state and tooltip message
  const getButtonState = () => {
    if (isGenerating) {
      return { disabled: true, tooltip: 'Generation in progress...' };
    }
    
    if (connectionStatus === 'connecting') {
      return { disabled: true, tooltip: 'Connecting to ComfyUI...' };
    }
    
    if (connectionStatus === 'error' || connectionStatus === 'disconnected') {
      return { disabled: true, tooltip: `ComfyUI connection failed: ${connectionError || 'Service not available'}` };
    }
    
    if (!settings.prompt.trim()) {
      return { disabled: true, tooltip: 'Please enter a prompt to generate an image' };
    }
    
    if (!settings.model) {
      return { disabled: true, tooltip: 'Please select a model for image generation' };
    }
    
    if (availableModels.length === 0) {
      return { disabled: true, tooltip: 'No models available. Please check your ComfyUI installation.' };
    }
    
    return { disabled: false, tooltip: 'Generate image with current settings' };
  };

  // Get connection status icon and color
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting':
        return { icon: Loader2, color: 'text-yellow-500', spin: true, text: 'Connecting...' };
      case 'connected':
        return { icon: CheckCircle, color: 'text-green-500', spin: false, text: 'Connected' };
      case 'error':
        return { icon: AlertCircle, color: 'text-red-500', spin: false, text: 'Connection Error' };
      case 'disconnected':
      default:
        return { icon: WifiOff, color: 'text-gray-500', spin: false, text: 'Disconnected' };
    }
  };

  // Handle image generation
  const handleGenerate = useCallback(async () => {
    if (!settings.prompt.trim() || !settings.model || connectionStatus !== 'connected') return;
    
    setGenerationError(null);
    setIsGenerating(true);
    setProgress({ value: 0, max: 100 });

    try {
      // Use existing client or create new one
      let client = clientRef.current;
      
      if (!client || client.socket?.readyState !== WebSocket.OPEN) {
        const url = comfyuiUrl;
        let processedUrl = url;
        if (url.includes('http://') || url.includes('https://')) {
          processedUrl = url.split('//')[1];
        }
        const ssl_type = url.includes('https') ? true : false;
        client = new Client({ api_host: processedUrl, ssl: ssl_type });
        client.connect();
        clientRef.current = client;
      }

      // Wait for connection
      await waitForClientConnection(client);
      
      // Determine image dimensions
      let width = settings.resolution.width;
      let height = settings.resolution.height;
      if (settings.resolution.label === 'Custom') {
        width = settings.customWidth;
        height = settings.customHeight;
      }

      // Create pipeline
      const pipeline = new BasePipe()
        .with(client)
        .model(settings.model)
        .prompt(settings.prompt)
        .negative(settings.negativePrompt)
        .size(width, height)
        .steps(settings.steps)
        .cfg(settings.cfg)
        .denoise(settings.denoise)
        .sampler(settings.sampler)
        .scheduler(settings.scheduler)
        .seed();

      // Execute pipeline
      setProgress({ value: 50, max: 100 });
      const result = await Promise.race([
        pipeline.save().wait(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Generation timed out")), 5 * 60 * 1000)
        )
      ]) as { images: any[] };

      // Process result
      const base64Images = result.images.map((img) => {
        const base64 = arrayBufferToBase64(img.data);
        const dataUrl = `data:${img.mime};base64,${base64}`;
        console.log('🎨 Generated image data URL:');
        console.log('  - mime type:', img.mime);
        console.log('  - base64 length:', base64.length);
        console.log('  - data URL length:', dataUrl.length);
        console.log('  - data URL starts with:', dataUrl.substring(0, 50));
        return dataUrl;
      });

      if (base64Images.length > 0) {
        console.log('🎨 Calling onImageGenerated with:', {
          imageDataUrl: base64Images[0].substring(0, 50) + '...',
          prompt: settings.prompt,
          settings: settings
        });
        
        // Save to database
        try {
          await db.addStorageItem({
            title: 'Chat Generated Image',
            description: `Prompt: ${settings.prompt}`,
            size: base64Images[0].length,
            type: 'image',
            mime_type: 'image/png',
            data: base64Images[0],
          });
          console.log('🎨 Image saved to database successfully');
        } catch (err) {
          console.error('Error saving image to DB:', err);
        }

        // Call callback with generated image
        onImageGenerated(base64Images[0], settings.prompt, settings);
        
        // Close the widget
        onClose();
      } else {
        console.error('❌ No images generated');
      }

      // Free memory
      client.free({
        free_memory: true,
        unload_models: true
      });

    } catch (error) {
      console.error('Error generating image:', error);
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate image');
      
      // If connection failed, update status
      if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('connection'))) {
        setConnectionStatus('error');
        setConnectionError(error.message);
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [settings, comfyuiUrl, onImageGenerated, onClose, connectionStatus]);

  // Handle settings change
  const handleSettingChange = (key: keyof ImageGenSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Handle resolution change
  const handleResolutionChange = (resolution: Resolution) => {
    setSettings(prev => ({ ...prev, resolution }));
  };

  if (!isOpen) return null;

  const buttonState = getButtonState();
  const connectionDisplay = getConnectionStatusDisplay();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Image className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Generate Image
              </h2>
              <div className="flex items-center space-x-2">
                <connectionDisplay.icon 
                  className={`w-4 h-4 ${connectionDisplay.color} ${connectionDisplay.spin ? 'animate-spin' : ''}`} 
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {connectionDisplay.text}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Retry connection button */}
            {connectionStatus === 'error' && (
              <Tooltip content="Retry connection to ComfyUI">
                <button
                  onClick={testConnection}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Loader2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </Tooltip>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Connection Error Alert */}
          {connectionStatus === 'error' && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  ComfyUI Connection Failed
                </h3>
              </div>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                {connectionError || 'Unable to connect to ComfyUI service. Please check if ComfyUI is running.'}
              </p>
              <button
                onClick={testConnection}
                className="mt-3 px-3 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded text-sm hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model
            </label>
            <select
              value={settings.model}
              onChange={(e) => handleSettingChange('model', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {availableModels.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>
            {availableModels.length === 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                No models found. Please check your ComfyUI installation and ensure models are properly installed.
              </p>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prompt
            </label>
            <textarea
              value={settings.prompt}
              onChange={(e) => handleSettingChange('prompt', e.target.value)}
              placeholder="Describe the image you want to generate..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Resolution
            </label>
            <div className="grid grid-cols-3 gap-2">
              {RESOLUTIONS.map((resolution) => (
                <button
                  key={resolution.label}
                  onClick={() => handleResolutionChange(resolution)}
                  className={`p-2 text-sm rounded-lg border transition-colors ${
                    settings.resolution.label === resolution.label
                      ? 'bg-purple-100 border-purple-500 text-purple-700 dark:bg-purple-900/20 dark:border-purple-400 dark:text-purple-300'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {resolution.label}
                </button>
              ))}
            </div>
            
            {settings.resolution.label === 'Custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Width</label>
                  <input
                    type="number"
                    value={settings.customWidth}
                    onChange={(e) => handleSettingChange('customWidth', parseInt(e.target.value))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Height</label>
                  <input
                    type="number"
                    value={settings.customHeight}
                    onChange={(e) => handleSettingChange('customHeight', parseInt(e.target.value))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quick Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Steps: {settings.steps}
              </label>
              <input
                type="range"
                min="10"
                max="50"
                value={settings.steps}
                onChange={(e) => handleSettingChange('steps', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                CFG: {settings.cfg}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={settings.cfg}
                onChange={(e) => handleSettingChange('cfg', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="flex items-center space-x-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
          >
            <Settings className="w-4 h-4" />
            <span>{showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings</span>
          </button>

          {/* Advanced Settings */}
          {showAdvancedSettings && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Negative Prompt
                </label>
                <textarea
                  value={settings.negativePrompt}
                  onChange={(e) => handleSettingChange('negativePrompt', e.target.value)}
                  placeholder="What you don't want in the image..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Sampler
                  </label>
                  <select
                    value={settings.sampler}
                    onChange={(e) => handleSettingChange('sampler', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="euler">Euler</option>
                    <option value="euler_a">Euler A</option>
                    <option value="dpmpp_2m">DPM++ 2M</option>
                    <option value="dpmpp_2m_karras">DPM++ 2M Karras</option>
                    <option value="dpmpp_sde">DPM++ SDE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Scheduler
                  </label>
                  <select
                    value={settings.scheduler}
                    onChange={(e) => handleSettingChange('scheduler', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="normal">Normal</option>
                    <option value="karras">Karras</option>
                    <option value="exponential">Exponential</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Denoise: {settings.denoise}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={settings.denoise}
                  onChange={(e) => handleSettingChange('denoise', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {generationError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{generationError}</p>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Generating...</span>
                <span>{Math.round((progress.value / progress.max) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.value / progress.max) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <Tooltip content={buttonState.tooltip}>
            <button
              onClick={handleGenerate}
              disabled={buttonState.disabled}
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Generate Image</span>
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ChatImageGenWidget; 
