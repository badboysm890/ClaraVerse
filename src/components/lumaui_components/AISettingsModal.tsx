import React, { useState, useEffect } from 'react';
import { X, Settings, Bot, Zap, Sliders, Brain, Server } from 'lucide-react';

interface AIParameters {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: any[]; // All available providers
  selectedProviderId: string;
  selectedModel: string;
  availableModels: any[];
  onProviderSelect: (providerId: string) => void;
  onModelSelect: (modelId: string) => void;
  parameters?: AIParameters;
  onParametersChange?: (parameters: AIParameters) => void;
}

const defaultParameters: AIParameters = {
  maxTokens: 16000,
  temperature: 0.1,
  topP: 1.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  maxIterations: 15
};

const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  selectedProviderId,
  selectedModel,
  availableModels,
  onProviderSelect,
  onModelSelect,
  parameters = defaultParameters,
  onParametersChange
}) => {
  const [localParameters, setLocalParameters] = useState<AIParameters>(parameters);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setLocalParameters(parameters);
  }, [parameters]);

  const handleParameterChange = (key: keyof AIParameters, value: number) => {
    const updated = { ...localParameters, [key]: value };
    setLocalParameters(updated);
    onParametersChange?.(updated);
  };

  const resetToDefaults = () => {
    setLocalParameters(defaultParameters);
    onParametersChange?.(defaultParameters);
  };

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const enabledProviders = providers.filter(p => p.isEnabled);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      <div className="glassmorphic border border-white/20 dark:border-gray-700/50 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl backdrop-blur-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/40 dark:to-pink-900/40 rounded-xl flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                AI Configuration
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure your AI provider, model, and parameters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 rounded-lg transition-all hover:shadow-md transform hover:scale-105"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Provider Selection Section */}
          <div className="glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                AI Provider
              </h3>
            </div>
            
            {enabledProviders.length > 0 ? (
              <div className="space-y-3">
                <select
                  value={selectedProviderId}
                  onChange={(e) => onProviderSelect(e.target.value)}
                  className="w-full text-sm border border-white/30 dark:border-gray-700/50 rounded-xl px-4 py-3 glassmorphic-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sakura-500 transition-all"
                >
                  {enabledProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.type.toUpperCase()})
                    </option>
                  ))}
                </select>
                
                {selectedProvider && (
                  <div className="p-3 glassmorphic-card border border-green-200/30 dark:border-green-700/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                        {selectedProvider.name} - Connected
                      </p>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {selectedProvider.type.toUpperCase()} • {selectedProvider.baseUrl || 'Default URL'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 glassmorphic-card border border-amber-200/30 dark:border-amber-700/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                      No Providers Available
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Configure AI providers in Settings → AI Services to start chatting
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Model Section */}
          <div className="glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                AI Model
              </h3>
            </div>
            
            <div className="space-y-3">
              <select
                value={selectedModel}
                onChange={(e) => onModelSelect(e.target.value)}
                disabled={!selectedProvider || availableModels.length === 0}
                className="w-full text-sm border border-white/30 dark:border-gray-700/50 rounded-xl px-4 py-3 glassmorphic-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sakura-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {availableModels.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                )}
              </select>
              
              {selectedModel && selectedProvider ? (
                <div className="p-3 glassmorphic-card border border-green-200/30 dark:border-green-700/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                      Ready for conversations
                    </p>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Selected: {availableModels.find(m => m.id === selectedModel)?.name || selectedModel}
                  </p>
                </div>
              ) : (
                <div className="p-3 glassmorphic-card border border-gray-200/30 dark:border-gray-700/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {!selectedProvider ? 'Select a provider first' : 'Select a model to start'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI Parameters Section */}
          <div className="glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  AI Parameters
                </h3>
              </div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs px-2 py-1 glassmorphic-card border border-white/20 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 rounded-md transition-all"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Max Tokens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Max Tokens
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {localParameters.maxTokens.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="128000"
                  step="1000"
                  value={localParameters.maxTokens}
                  onChange={(e) => handleParameterChange('maxTokens', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>1K</span>
                  <span>64K</span>
                  <span>128K</span>
                </div>
              </div>

              {/* Temperature */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Temperature
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {localParameters.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={localParameters.temperature}
                  onChange={(e) => handleParameterChange('temperature', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Focused (0.0)</span>
                  <span>Balanced (1.0)</span>
                  <span>Creative (2.0)</span>
                </div>
              </div>

              {/* Max Iterations */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Max Tool Iterations
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {localParameters.maxIterations}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={localParameters.maxIterations}
                  onChange={(e) => handleParameterChange('maxIterations', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Minimal (1)</span>
                  <span>Balanced (15)</span>
                  <span>Maximum (50)</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Controls how many automatic tool operations the AI can perform in sequence
                </p>
              </div>

              {/* Advanced Parameters */}
              {showAdvanced && (
                <div className="space-y-4 pt-4 border-t border-white/20 dark:border-gray-700/50">
                  {/* Top P */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Top P
                      </label>
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {localParameters.topP.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={localParameters.topP}
                      onChange={(e) => handleParameterChange('topP', parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Controls diversity via nucleus sampling
                    </p>
                  </div>

                  {/* Frequency Penalty */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Frequency Penalty
                      </label>
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {localParameters.frequencyPenalty.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={localParameters.frequencyPenalty}
                      onChange={(e) => handleParameterChange('frequencyPenalty', parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Reduces repetition based on frequency
                    </p>
                  </div>

                  {/* Presence Penalty */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Presence Penalty
                      </label>
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {localParameters.presencePenalty.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={localParameters.presencePenalty}
                      onChange={(e) => handleParameterChange('presencePenalty', parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-700 50 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Encourages talking about new topics
                    </p>
                  </div>
                </div>
              )}

              {/* Reset Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={resetToDefaults}
                  className="text-xs px-3 py-1 glassmorphic-card border border-white/20 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 rounded-md transition-all"
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          </div>

          {/* Auto-save Notice */}
          <div className="p-3 glassmorphic-card border border-sakura-200/30 dark:border-sakura-700/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
              <p className="text-sm text-sakura-700 dark:text-sakura-300 font-medium">
                Settings Auto-saved
              </p>
            </div>
            <p className="text-xs text-sakura-600 dark:text-sakura-400 mt-1">
              Your provider, model, and parameter preferences are automatically saved and will be restored when you return.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/20 dark:border-gray-700/50">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl shadow-sakura-500/25 transition-all duration-200 hover:scale-105"
          >
            Done
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          .slider::-webkit-slider-thumb {
            appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: linear-gradient(135deg, #f472b6, #ec4899);
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(244, 114, 182, 0.3);
            transition: all 0.2s ease;
          }
          
          .slider::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 8px rgba(244, 114, 182, 0.4);
          }
          
          .slider::-moz-range-thumb {
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: linear-gradient(135deg, #f472b6, #ec4899);
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 4px rgba(244, 114, 182, 0.3);
          }
        `
      }} />
    </div>
  );
};

export default AISettingsModal; 
