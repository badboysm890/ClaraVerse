import { memo, useState, useEffect, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Brain, Eye, RefreshCw, Check, AlertCircle } from 'lucide-react';
import BaseNode from './BaseNode';

const LLMNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [apiBaseUrl, setApiBaseUrl] = useState(data.apiBaseUrl || 'http://localhost:8091/v1');
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [model, setModel] = useState(data.model || '');
  const [temperature, setTemperature] = useState(data.temperature || 0.7);
  const [maxTokens, setMaxTokens] = useState(data.maxTokens || 1000);
  const [showConfig, setShowConfig] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [isConfigSaved, setIsConfigSaved] = useState(false);

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
        // Extract model IDs and sort them
        const apiModels = responseData.data
          .map((model: any) => model.id)
          .filter((id: string) => id && typeof id === 'string')
          .sort();
        
        if (apiModels.length > 0) {
          setAvailableModels(apiModels);
          setIsConfigSaved(true);
          
          // Set the first model as default if no model is currently selected
          if (!model || !apiModels.includes(model)) {
            const firstModel = apiModels[0];
            setModel(firstModel);
            if (data.onUpdate) {
              data.onUpdate({ data: { ...data, model: firstModel } });
            }
          }
        } else {
          throw new Error('No models found in API response');
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
  }, [apiBaseUrl, apiKey, model, data]);

  // Auto-load models on component mount if using default localhost URL
  useEffect(() => {
    if (apiBaseUrl === 'http://localhost:8091/v1' && availableModels.length === 0) {
      loadModelsFromAPI();
    }
  }, [apiBaseUrl, availableModels.length, loadModelsFromAPI]);

  const handleApiBaseUrlChange = (value: string) => {
    setApiBaseUrl(value);
    setIsConfigSaved(false);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, apiBaseUrl: value } });
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setIsConfigSaved(false);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, apiKey: value } });
    }
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, model: value } });
    }
  };

  const handleTemperatureChange = (value: number) => {
    setTemperature(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, temperature: value } });
    }
  };

  const handleMaxTokensChange = (value: number) => {
    setMaxTokens(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, maxTokens: value } });
    }
  };

  const handleSaveAndLoadModels = async () => {
    // Save current config first
    if (data.onUpdate) {
      data.onUpdate({ 
        data: { 
          ...data, 
          apiBaseUrl, 
          apiKey, 
          model, 
          temperature, 
          maxTokens 
        } 
      });
    }
    
    // Then load models
    await loadModelsFromAPI();
  };

  const modelsToShow = availableModels.length > 0 ? availableModels : [];
  const isVisionModel = model.includes('vision') || model.includes('gpt-4');

  return (
    <BaseNode
      {...props}
      title="LLM Chat"
      category="ai"
      icon={
        <div className="flex items-center gap-1">
          <Brain className="w-4 h-4" />
          {isVisionModel && <Eye className="w-3 h-3" />}
        </div>
      }
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-4">
        {/* Model Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Model
            </label>
            {availableModels.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                <span>{availableModels.length} loaded</span>
              </div>
            )}
          </div>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 transition-all"
          >
            {modelsToShow.length === 0 ? (
              <option value={model || ""}>
                {model || "No models loaded - configure API to load models"}
              </option>
            ) : (
              modelsToShow.map((modelOption) => (
                <option key={modelOption} value={modelOption}>
                  {modelOption}
                </option>
              ))
            )}
          </select>
          {availableModels.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              No models loaded. Configure API and click "Save & Load Models" to load available models.
            </p>
          )}
        </div>

        {/* Temperature & Max Tokens */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="text-xs text-center text-gray-500 dark:text-gray-400 font-mono">
                {temperature}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Tokens
            </label>
            <input
              type="number"
              min="1"
              max="4000"
              value={maxTokens}
              onChange={(e) => handleMaxTokensChange(parseInt(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 transition-all"
            />
          </div>
        </div>

        {/* API Configuration Toggle */}
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full px-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg transition-colors font-medium"
        >
          {showConfig ? '🔒 Hide' : '⚙️ Show'} API Configuration
        </button>

        {/* API Configuration */}
        {showConfig && (
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Base URL
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => handleApiBaseUrlChange(e.target.value)}
                placeholder="http://localhost:8091/v1 or https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-... (optional for local APIs)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-transparent transition-all"
              />
            </div>
            
            {/* Save & Load Models Button */}
            <div className="pt-2">
              <button
                onClick={handleSaveAndLoadModels}
                disabled={!apiBaseUrl || isLoadingModels}
                className="w-full px-3 py-2.5 text-sm bg-sakura-500 hover:bg-sakura-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                {isLoadingModels ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading Models...
                  </>
                ) : isConfigSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved & Models Loaded
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Save & Load Models
                  </>
                )}
              </button>
              
              {/* Error Display */}
              {modelLoadError && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700 dark:text-red-300">
                    <strong>Error loading models:</strong>
                    <br />
                    {modelLoadError}
                  </div>
                </div>
              )}
              
              {/* Success Message */}
              {isConfigSaved && !modelLoadError && availableModels.length > 0 && (
                <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-green-700 dark:text-green-300">
                    Successfully loaded {availableModels.length} models from API
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-3 h-3 rounded-full ${apiKey ? 'bg-green-400 animate-pulse' : 'bg-blue-400'}`}></div>
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              {apiKey ? '✓ API with Auth' : 'ℹ No Auth (Local/Public API)'}
            </span>
          </div>
          {isVisionModel && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
              <Eye className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Vision Enabled</span>
            </div>
          )}
        </div>

        {/* Output Labels */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            {data.outputs.map((output: any, index: number) => (
              <div
                key={output.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right"
                style={{ marginTop: index === 0 ? 0 : '8px' }}
              >
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

LLMNode.displayName = 'LLMNode';

export default LLMNode; 
