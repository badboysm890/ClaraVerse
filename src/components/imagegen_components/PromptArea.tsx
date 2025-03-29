import React, { useRef, useState, useEffect } from 'react';
import { Settings, RefreshCw, Wand2, ImagePlus, X, Sparkles, ChevronDown } from 'lucide-react';

// Define missing constant
const LAST_USED_LLM_KEY = 'clara-ollama-last-used-llm';

interface ModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: string[];
  onSelect: (model: string) => void;
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({ isOpen, onClose, models, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">Select LLM Model</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Choose an LLM model to enhance your prompts. This setting will be saved for future use.
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {models.map((model) => (
            <button
              key={model}
              onClick={() => onSelect(model)}
              className="w-full text-left px-4 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {model}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

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
  availableModels?: string[];
  onModelSelect?: (model: string) => void;
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
  onModelSelect,
  clearImage = false,
  onImageClear,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [enhancementFeedback, setEnhancementFeedback] = useState<string | null>(null);
  
  // Get the current selected model name from localStorage
  const currentLLMModel = localStorage.getItem(LAST_USED_LLM_KEY) || '';

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
      setEnhancementFeedback("LLM not connected. Please check your API settings.");
      setTimeout(() => setEnhancementFeedback(null), 3000);
      return;
    }
    
    const savedModel = localStorage.getItem(LAST_USED_LLM_KEY);
    if (!savedModel) {
      setShowModelSelection(true);
      return;
    }
    
    setEnhancementFeedback(`Enhancing with ${savedModel}...`);
    
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
        
        {/* Enhancement model indicator and selector */}
        {isLLMConnected && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Enhancement Model:</span>
              <button 
                onClick={() => setShowModelSelection(true)}
                className="flex items-center gap-1 px-2 py-1 text-sm rounded-lg bg-sakura-50 dark:bg-sakura-900/30 text-sakura-600 dark:text-sakura-300 hover:bg-sakura-100 dark:hover:bg-sakura-800/50 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>{currentLLMModel || "Select Model"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            
            {enhancementFeedback && (
              <div className={`text-sm px-3 py-1 rounded-full transition-opacity duration-300 ${
                enhancementFeedback.includes('failed') || enhancementFeedback.includes('not connected')
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
                {isLLMConnected && (
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

      <ModelSelectionModal
        isOpen={showModelSelection}
        onClose={() => setShowModelSelection(false)}
        models={availableModels}
        onSelect={(model) => {
          onModelSelect?.(model);
          setShowModelSelection(false);
          setEnhancementFeedback(`Using ${model} for prompt enhancement`);
          setTimeout(() => setEnhancementFeedback(null), 3000);
        }}
      />
    </div>
  );
};

export default PromptArea;
