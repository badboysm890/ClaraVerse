import React, { useRef, useState, useEffect } from 'react';
import { Settings, RefreshCw, Wand2, ImagePlus, X, Sparkles } from 'lucide-react';

// Import angela types
import { angelaModel, angelaProvider } from '../../types/angela_assistant_types';

// Define missing constant
const LAST_USED_LLM_KEY = 'angela-ollama-last-used-llm';



interface PromptAreaProps {
  prompt: string;
  setPrompt: (value: string) => void;
  mustSelectModel: boolean;
  isGenerating: boolean;
  handleSettingsClick: () => void;
  handleGenerate: () => void;
  showSettings: boolean;
  handleImageUpload?: (buffer: ArrayBuffer) => void;
  onEnhancePrompt?: (prompt: string, imageData?: { preview: string; buffer: ArrayBuffer; base64: string }) => Promise<string>;
  isEnhancing?: boolean;
  isLLMConnected?: boolean;
  availableModels?: angelaModel[];
  providers?: angelaProvider[];
  onModelSelect?: (modelId: string) => void;
  clearImage?: boolean;
  onImageClear?: () => void;
}

const PromptArea: React.FC<PromptAreaProps> = ({
  prompt,
  setPrompt,
  mustSelectModel,
  isGenerating,
  handleSettingsClick,
  handleGenerate,
  showSettings,
  handleImageUpload,
  onEnhancePrompt,
  isEnhancing = false,
  isLLMConnected = false,
  availableModels = [],
  providers = [],
  onModelSelect,
  clearImage = false,
  onImageClear,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [enhancementFeedback, setEnhancementFeedback] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  
  // Get the current selected model name from localStorage and find the model object
  const currentLLMModelId = localStorage.getItem(LAST_USED_LLM_KEY) || '';
  const currentModel = availableModels.find(m => m.id === currentLLMModelId);
  const currentProvider = currentModel ? providers.find(p => p.id === currentModel.provider) : null;
  
  // Initialize selected provider based on current model
  useEffect(() => {
    if (currentModel && currentProvider && !selectedProviderId) {
      setSelectedProviderId(currentProvider.id);
    }
  }, [currentModel, currentProvider, selectedProviderId]);
  
  // Get models for the selected provider
  const getModelsForProvider = (providerId: string) => {
    return availableModels.filter(model => model.provider === providerId);
  };
  
  // Get available providers that have models
  const getAvailableProviders = () => {
    const providerIds = [...new Set(availableModels.map(model => model.provider))];
    return providers.filter(provider => providerIds.includes(provider.id));
  };
  
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    // Clear model selection when provider changes
    const modelsForProvider = getModelsForProvider(providerId);
    if (modelsForProvider.length > 0) {
      // Auto-select first model if available
      const firstModel = modelsForProvider[0];
      onModelSelect?.(firstModel.id);
    }
  };
  
  const handleModelChange = (modelId: string) => {
    onModelSelect?.(modelId);
    const selectedModel = availableModels.find(m => m.id === modelId);
    const provider = selectedModel ? providers.find(p => p.id === selectedModel.provider) : null;
    
    if (selectedModel && provider) {
      setEnhancementFeedback(`Now using ${selectedModel.name} via ${provider.name} for prompt enhancement`);
      setTimeout(() => setEnhancementFeedback(null), 3000);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);

      // Convert file to base64 using FileReader
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const buffer = await file.arrayBuffer();
        setImageBuffer(buffer);
        console.log('Uploaded image buffer:', buffer);
        handleImageUpload?.(buffer);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error reading file:', err);
    }
  };

  const clearImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setImageBuffer(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageClear?.();
  };

  const handleEnhanceClick = () => {
    if (!isLLMConnected) {
      setEnhancementFeedback("No AI providers connected. Please check your settings.");
      setTimeout(() => setEnhancementFeedback(null), 3000);
      return;
    }

    if (availableModels.length === 0) {
      setEnhancementFeedback("No enhancement models available. Please configure your AI providers.");
      setTimeout(() => setEnhancementFeedback(null), 3000);
      return;
    }
    
    const savedModelId = localStorage.getItem(LAST_USED_LLM_KEY);
    const savedModel = savedModelId ? availableModels.find(m => m.id === savedModelId) : null;
    
    if (!savedModel) {
      setShowModelSelection(true);
      return;
    }
    
    const provider = providers.find(p => p.id === savedModel.provider);
    setEnhancementFeedback(`Enhancing with ${savedModel.name} via ${provider?.name || 'Unknown Provider'}...`);
    
    // Prepare image data if available
    const prepareImageData = async () => {
      if (!imagePreview || !imageBuffer) return null;
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64WithPrefix = event.target?.result as string;
          resolve(base64WithPrefix.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });
      
      return {
        preview: imagePreview,
        buffer: imageBuffer,
        base64: base64
      };
    };

    // Handle the three cases
    const enhance = async () => {
      try {
        const imageData = await prepareImageData();
        
        // Case 1: Image only
        if (imageData && !prompt.trim()) {
          await onEnhancePrompt?.("", imageData);
        }
        // Case 2: Text only
        else if (!imageData && prompt.trim()) {
          await onEnhancePrompt?.(prompt);
        }
        // Case 3: Both image and text
        else if (imageData && prompt.trim()) {
          await onEnhancePrompt?.(prompt, imageData);
        }
        
        setEnhancementFeedback("Prompt enhanced successfully!");
      } catch (err) {
        setEnhancementFeedback(`Enhancement failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setTimeout(() => setEnhancementFeedback(null), 3000);
      }
    };

    enhance();
  };

  // Add effect to clear image when clearImage prop changes
  useEffect(() => {
    if (clearImage) {
      clearImagePreview();
    }
  }, [clearImage]);

  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="space-y-4">
        {mustSelectModel && (
          <div className="bg-red-100 text-red-800 p-2 rounded">
            <strong>Please select a model from the side panel first.</strong>
          </div>
        )}
        
        {/* Enhancement provider and model selectors */}
        {isLLMConnected && availableModels.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sakura-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Enhancement:</span>
              </div>
              
              {/* Provider Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 dark:text-gray-400">Provider:</label>
                <select
                  value={selectedProviderId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-sakura-300 dark:focus:border-sakura-500 transition-colors min-w-[120px]"
                >
                  <option value="">Select Provider</option>
                  {getAvailableProviders().map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Model Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 dark:text-gray-400">Model:</label>
                <select
                  value={currentLLMModelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={!selectedProviderId}
                  className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-sakura-300 dark:focus:border-sakura-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[150px]"
                >
                  <option value="">Select Model</option>
                  {selectedProviderId && getModelsForProvider(selectedProviderId).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.supportsVision ? '👁️' : ''} ({model.type})
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Model capabilities indicator */}
              {currentModel && (
                <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  {currentModel.supportsVision && <span title="Vision Support">👁️</span>}
                  {currentModel.supportsCode && <span title="Code Support" className="text-blue-500">💻</span>}
                  {currentModel.supportsTools && <span title="Tools Support" className="text-green-500">🔧</span>}
                </div>
              )}
            </div>
            
            {/* Enhancement feedback */}
            {enhancementFeedback && (
              <div className={`text-sm px-3 py-2 rounded-lg transition-opacity duration-300 ${
                enhancementFeedback.includes('failed') || enhancementFeedback.includes('not connected') || enhancementFeedback.includes('No ')
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : enhancementFeedback.includes('success')
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {enhancementFeedback}
              </div>
            )}
          </div>
        )}
        
        {/* Show message when no models are available */}
        {isLLMConnected && availableModels.length === 0 && (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">
                No enhancement models available. Please configure AI providers in Settings.
              </span>
            </div>
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Describe your image
          </label>
          <div className="relative flex gap-4">
            {imagePreview && (
              <div className="flex-shrink-0 relative group">
                <img
                  src={imagePreview}
                  alt="Upload preview"
                  className="w-[100px] h-[100px] object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                />
                <button
                  onClick={clearImagePreview}
                  className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex-grow relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A serene landscape with mountains and a lake at sunset..."
                className={`w-full px-4 py-3 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100 min-h-[100px] transition-all duration-300 ${isEnhancing ? 'border-sakura-400 dark:border-sakura-500 shadow-[0_0_0_1px_rgba(244,143,177,0.3)]' : ''}`}
              />
              <div className="absolute right-2 top-2 flex flex-col gap-2">
                {!imagePreview && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group relative"
                    title="Upload image"
                  >
                    <ImagePlus className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      Upload image
                    </span>
                  </button>
                )}
                {isLLMConnected && availableModels.length > 0 && (
                  <button
                    onClick={handleEnhanceClick}
                    disabled={isEnhancing}
                    className={`p-2 rounded-lg transition-colors group relative ${
                      isEnhancing 
                        ? 'bg-sakura-100 dark:bg-sakura-900/30' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="Enhance prompt with AI"
                  >
                    <Sparkles className={`w-5 h-5 text-sakura-500 ${isEnhancing ? 'animate-pulse' : ''}`} />
                    <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {isEnhancing ? 'Enhancing...' : 'Enhance prompt'}
                    </span>
                  </button>
                )}
              </div>
              
              {/* Enhancement progress indicator */}
              {isEnhancing && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center">
                  <div className="bg-sakura-100 dark:bg-sakura-900/30 text-sakura-600 dark:text-sakura-300 text-sm px-3 py-1 rounded-full flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Enhancing your prompt with AI...</span>
                  </div>
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <button
            onClick={handleSettingsClick}
            className="p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 cursor-pointer transition-colors"
          >
            <Settings
              className={`w-6 h-6 text-gray-600 dark:text-gray-400 transition-transform duration-300 ${
                showSettings ? 'rotate-180' : ''
              }`}
            />
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>


    </div>
  );
};

export default PromptArea;
