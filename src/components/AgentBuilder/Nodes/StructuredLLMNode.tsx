import { memo, useState, useEffect, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { FileJson, Brain, Settings, Check, AlertCircle, RefreshCw } from 'lucide-react';
import BaseNode from './BaseNode';

const StructuredLLMNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [apiBaseUrl, setApiBaseUrl] = useState(data.apiBaseUrl || 'http://localhost:8091/v1');
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [model, setModel] = useState(data.model || '');
  const [temperature, setTemperature] = useState(data.temperature || 0.7);
  const [maxTokens, setMaxTokens] = useState(data.maxTokens || 1000);
  const [showConfig, setShowConfig] = useState(false);
  const [isValidConfig, setIsValidConfig] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  const handleApiBaseUrlChange = (value: string) => {
    setApiBaseUrl(value);
    updateConfig({ apiBaseUrl: value });
    validateConfig(apiKey, value);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    updateConfig({ apiKey: value });
    validateConfig(value, apiBaseUrl);
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    updateConfig({ model: value });
  };

  const handleTemperatureChange = (value: number) => {
    setTemperature(value);
    updateConfig({ temperature: value });
  };

  const handleMaxTokensChange = (value: number) => {
    setMaxTokens(value);
    updateConfig({ maxTokens: value });
  };

  const updateConfig = (updates: any) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, ...updates } });
    }
  };

  const validateConfig = (_key: string, url: string) => {
    // Only require base URL - API key is optional for some APIs
    const isValid = url.trim().length > 0;
    setIsValidConfig(isValid);
  };

  const loadModelsFromAPI = useCallback(async () => {
    if (!apiBaseUrl) {
      setModelLoadError('API Base URL is required');
      return;
    }

    setIsLoadingModels(true);
    setModelLoadError(null);

    try {
      // Prepare headers - only add Authorization if API key is provided
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${apiBaseUrl}/models`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error('Authentication failed - API key may be required or invalid');
        } else if (response.status === 403) {
          throw new Error('Access forbidden - check API key permissions');
        } else {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
      }

      const responseData = await response.json();
      
      if (responseData.data && Array.isArray(responseData.data)) {
        // Extract all model IDs - show everything available
        const apiModels = responseData.data
          .map((model: any) => model.id)
          .filter((id: string) => id && typeof id === 'string')
          .sort();
        
        // Use ALL available models from API
        if (apiModels.length > 0) {
          setAvailableModels(apiModels);
          
          // Set the first model as default if no model is currently selected
          if (!model || !apiModels.includes(model)) {
            const firstModel = apiModels[0];
            setModel(firstModel);
            updateConfig({ model: firstModel });
          }
        } else {
          // No models found from API
          setAvailableModels([]);
          setModelLoadError('No models found from API.');
        }
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelLoadError(error instanceof Error ? error.message : 'Failed to load models');
      // Don't fall back to default models - show no models loaded
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [apiBaseUrl, apiKey, model]);

  // Auto-load models on component mount if using default localhost URL
  useEffect(() => {
    if (apiBaseUrl === 'http://localhost:8091/v1' && availableModels.length === 0) {
      loadModelsFromAPI();
    }
  }, [apiBaseUrl, availableModels.length, loadModelsFromAPI]);

  const handleSaveAndLoadModels = async () => {
    // Save current config first
    updateConfig({ 
      apiBaseUrl, 
      apiKey, 
      model, 
      temperature, 
      maxTokens 
    });
    
    // Then load models
    await loadModelsFromAPI();
  };

  // Prepare models for display - don't show defaults when no models loaded
  const modelsToShow = availableModels.length > 0 
    ? availableModels.map(modelId => ({ label: modelId, value: modelId }))
    : [];

  return (
    <BaseNode
      {...props}
      title="Structured LLM"
      category="ai"
      icon={
        <div className="flex items-center gap-1">
          <FileJson className="w-4 h-4" />
          <Brain className="w-3 h-3" />
        </div>
      }
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-4">
        {/* API Configuration Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Configuration
            </span>
            {isValidConfig && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                <span>Ready</span>
              </div>
            )}
            {!isValidConfig && (
              <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3" />
                <span>Missing Base URL</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Configuration Panel */}
        {showConfig && (
          <div className="space-y-3 p-3 bg-gray-50/50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            {/* API Base URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => handleApiBaseUrlChange(e.target.value)}
                placeholder="http://localhost:8091/v1 or https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-... (optional for local APIs)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            {/* Model Selection with Refresh Button */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model
                </label>
                <div className="flex items-center gap-2">
                  {availableModels.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="w-3 h-3" />
                      <span>{availableModels.length} loaded</span>
                    </div>
                  )}
                  <button
                    onClick={handleSaveAndLoadModels}
                    disabled={!isValidConfig || isLoadingModels}
                    className="p-1.5 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Load available models from API"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <select
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              >
                {modelsToShow.length === 0 ? (
                  <option value={model || ""}>
                    {model || "No models loaded - configure API to load models"}
                  </option>
                ) : (
                  modelsToShow.map((modelOption) => (
                    <option key={modelOption.value} value={modelOption.value}>
                      {modelOption.label}
                    </option>
                  ))
                )}
              </select>
              
              {/* Model loading status and errors */}
              {isLoadingModels && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Loading available models...
                </p>
              )}
              
              {modelLoadError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {modelLoadError}
                </p>
              )}
              
              {availableModels.length === 0 && !isLoadingModels && !modelLoadError && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  No models loaded. Configure API and click refresh to load available models.
                </p>
              )}
              
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Works with any OpenAI-compatible API. Auto-detects structured output support and falls back to prompt-based JSON generation for maximum compatibility.
              </p>
            </div>

            {/* Temperature & Max Tokens */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temperature
                </label>
                <div className="space-y-1">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    {temperature}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => handleMaxTokensChange(parseInt(e.target.value) || 1000)}
                  min="1"
                  max="4000"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Feature Information */}
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-2">
            <FileJson className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">
                Universal Structured JSON Output
              </h4>
              <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                Works with any OpenAI-compatible API (OpenAI, Ollama, local models). Auto-detects structured output support and intelligently falls back to prompt-based JSON generation for maximum compatibility.
              </p>
            </div>
          </div>
        </div>

        {/* Input/Output Display */}
        <div className="space-y-3">
          {/* Inputs */}
          {data.inputs && data.inputs.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Inputs
              </h5>
              {data.inputs.map((input: any, index: number) => (
                <div
                  key={input.id}
                  className="text-xs text-gray-600 dark:text-gray-400 mb-1"
                  style={{ marginTop: index === 0 ? 0 : '4px' }}
                >
                  <span className="font-medium">{input.name}</span>
                  <span className="text-gray-400 ml-1">({input.dataType})</span>
                  {input.required && <span className="text-red-500 ml-1">*</span>}
                </div>
              ))}
            </div>
          )}

          {/* Outputs */}
          {data.outputs && data.outputs.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Outputs
              </h5>
              {data.outputs.map((output: any, index: number) => (
                <div
                  key={output.id}
                  className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right"
                  style={{ marginTop: index === 0 ? 0 : '4px' }}
                >
                  <span className="font-medium">{output.name}</span>
                  <span className="text-gray-400 ml-1">({output.dataType})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

StructuredLLMNode.displayName = 'StructuredLLMNode';

export default StructuredLLMNode; 
