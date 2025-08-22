import React, { useState, useEffect } from 'react';
import { X, BookOpen, AlertCircle, Bot, ChevronDown } from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';
import { angelaApiService } from '../../services/angelaApiService';
import { angelaModel } from '../../types/angela_assistant_types';
import { ProviderConfig } from '../../services/angelaNotebookService';

interface CreateNotebookModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, llmProvider: ProviderConfig, embeddingProvider: ProviderConfig) => Promise<void>;
}

const CreateNotebookModal: React.FC<CreateNotebookModalProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; description?: string; providers?: string; api?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Provider selection state
  const { providers } = useProviders();
  const [models, setModels] = useState<angelaModel[]>([]);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState<string>('');
  const [selectedLLMModel, setSelectedLLMModel] = useState<string>('');
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState<string>('');
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Load models and set default providers
  useEffect(() => {
    const loadModelsAndDefaults = async () => {
      setIsLoadingModels(true);
      try {
        // Load all models
        const allModels = await angelaApiService.getModels();
        setModels(allModels);

        // Set default providers (use primary provider if available)
        const enabledProviders = providers.filter(p => p.isEnabled);
        const primaryProvider = providers.find(p => p.isPrimary && p.isEnabled) || enabledProviders[0];
        
        if (primaryProvider) {
          setSelectedLLMProvider(primaryProvider.id);
          setSelectedEmbeddingProvider(primaryProvider.id);
          
          // Set default models for the primary provider
          const providerModels = allModels.filter(m => m.provider === primaryProvider.id);
          
          // Find a good text/multimodal model for LLM
          const llmModel = providerModels.find(m => 
            m.type === 'text' || m.type === 'multimodal'
          );
          if (llmModel) setSelectedLLMModel(llmModel.id);
          
          // Find an embedding model, or fallback to text model
          const embeddingModel = providerModels.find(m => m.type === 'embedding') || 
                                 providerModels.find(m => m.type === 'text');
          if (embeddingModel) setSelectedEmbeddingModel(embeddingModel.id);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };

    if (providers.length > 0) {
      loadModelsAndDefaults();
    }
  }, [providers]);

  const validateForm = () => {
    const newErrors: { name?: string; description?: string; providers?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    
    if (description.trim().length > 200) {
      newErrors.description = 'Description must be less than 200 characters';
    }

    if (!selectedLLMProvider || !selectedLLMModel) {
      newErrors.providers = 'Please select an LLM provider and model';
    }

    if (!selectedEmbeddingProvider || !selectedEmbeddingModel) {
      newErrors.providers = 'Please select an embedding provider and model';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Helper function to transform URLs for Docker container access
  const transformUrlForDocker = (url: string): string => {
    if (!url) return url;
    
    try {
      const urlObj = new URL(url);
      
      // Replace localhost with host.docker.internal for Docker container access
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        urlObj.hostname = 'host.docker.internal';
      }
      
      // Remove /v1 suffix if port is 11434 (Ollama default port)
      if (urlObj.port === '11434' && urlObj.pathname.endsWith('/v1')) {
        urlObj.pathname = urlObj.pathname.replace(/\/v1$/, '');
      }
      
      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      console.warn('Failed to parse URL for Docker transformation:', url, error);
      return url;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setErrors({}); // Clear any previous API errors
    
    try {
      const llmProvider = providers.find(p => p.id === selectedLLMProvider);
      console.log('llmProvider', llmProvider);
      const embeddingProvider = providers.find(p => p.id === selectedEmbeddingProvider);
      const llmModel = models.find(m => m.id === selectedLLMModel);
      const embeddingModel = models.find(m => m.id === selectedEmbeddingModel);

      if (!llmProvider || !embeddingProvider || !llmModel || !embeddingModel) {
        throw new Error('Selected providers or models not found');
      }

      const llmProviderConfig: ProviderConfig = {
        name: llmProvider.name,
        type: llmProvider.type as 'openai' | 'openai_compatible' | 'ollama',
        baseUrl: llmProvider.baseUrl ? transformUrlForDocker(llmProvider.baseUrl) : llmProvider.baseUrl,
        apiKey: llmProvider.apiKey,
        model: llmModel.name
      };

      const embeddingProviderConfig: ProviderConfig = {
        name: embeddingProvider.name,
        type: embeddingProvider.type as 'openai' | 'openai_compatible' | 'ollama',
        baseUrl: embeddingProvider.baseUrl ? transformUrlForDocker(embeddingProvider.baseUrl) : embeddingProvider.baseUrl,
        apiKey: embeddingProvider.apiKey,
        model: embeddingModel.name
      };

      await onCreate(name.trim(), description.trim(), llmProviderConfig, embeddingProviderConfig);
      onClose();
    } catch (error) {
      console.error('Error creating notebook:', error);
      setErrors({ api: error instanceof Error ? error.message : 'Failed to create notebook' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Filter models by provider and type
  const getLLMModels = (providerId: string) => {
    return models.filter(m => 
      m.provider === providerId && 
      (m.type === 'text' || m.type === 'multimodal')
    );
  };

  const getEmbeddingModels = (providerId: string) => {
    return models.filter(m => 
      m.provider === providerId && 
      (m.type === 'embedding' || m.type === 'text')
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-black rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-sakura-50 dark:bg-sakura-900/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sakura-500 rounded-lg text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create New Notebook
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* API Error */}
          {errors.api && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">{errors.api}</span>
              </div>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label htmlFor="notebook-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="notebook-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: undefined }));
                }
              }}
              placeholder="Enter notebook name..."
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors ${
                errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              autoFocus
            />
            {errors.name && (
              <div className="flex items-center gap-1 mt-1 text-sm text-red-600">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </div>
            )}
          </div>

          {/* Description Field */}
          <div>
            <label htmlFor="notebook-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              id="notebook-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors(prev => ({ ...prev, description: undefined }));
                }
              }}
              placeholder="Describe what this notebook will contain..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors resize-none ${
                errors.description ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.description ? (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  {errors.description}
                </div>
              ) : (
                <div></div>
              )}
              <span className={`text-xs ${
                description.length > 180 ? 'text-red-500' : 'text-gray-500'
              }`}>
                {description.length}/200
              </span>
            </div>
          </div>

          {/* Provider Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Configuration
            </h3>

            {/* LLM Provider Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  LLM Provider <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedLLMProvider}
                    onChange={(e) => {
                      setSelectedLLMProvider(e.target.value);
                      setSelectedLLMModel(''); // Reset model selection
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none"
                  >
                    <option value="">Select Provider</option>
                    {providers.filter(p => p.isEnabled).map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  LLM Model <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedLLMModel}
                    onChange={(e) => {
                      setSelectedLLMModel(e.target.value);
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    disabled={!selectedLLMProvider || isLoadingModels}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none disabled:opacity-50"
                  >
                    <option value="">Select Model</option>
                    {selectedLLMProvider && getLLMModels(selectedLLMProvider).map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Embedding Provider Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Embedding Provider <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedEmbeddingProvider}
                    onChange={(e) => {
                      setSelectedEmbeddingProvider(e.target.value);
                      setSelectedEmbeddingModel(''); // Reset model selection
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none"
                  >
                    <option value="">Select Provider</option>
                    {providers.filter(p => p.isEnabled).map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Embedding Model <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedEmbeddingModel}
                    onChange={(e) => {
                      setSelectedEmbeddingModel(e.target.value);
                      if (errors.providers) {
                        setErrors(prev => ({ ...prev, providers: undefined }));
                      }
                    }}
                    disabled={!selectedEmbeddingProvider || isLoadingModels}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors appearance-none disabled:opacity-50"
                  >
                    <option value="">Select Model</option>
                    {selectedEmbeddingProvider && getEmbeddingModels(selectedEmbeddingProvider).map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Provider Errors */}
            {errors.providers && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-3 h-3" />
                {errors.providers}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || isLoadingModels}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                'Create Notebook'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNotebookModal; 
