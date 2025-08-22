import React, { useState, useEffect } from 'react';
import { X, Settings, Key, Cpu, Sliders, MessageSquare } from 'lucide-react';

// AI Parameters interface
interface AIParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

// Import Provider type from main database
import { Provider } from '../../db';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Provider[];
  selectedProviderId: string;
  selectedModel: string;
  availableModels: string[];
  parameters: AIParameters;
  systemPrompt?: string;
  onProviderSelect: (providerId: string) => void;
  onModelSelect: (model: string) => void;
  onParametersChange: (parameters: AIParameters) => void;
  onSystemPromptChange?: (prompt: string) => void;
}

const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  selectedProviderId,
  selectedModel,
  availableModels,
  parameters,
  systemPrompt,
  onProviderSelect,
  onModelSelect,
  onParametersChange,
  onSystemPromptChange
}) => {
  const [localParameters, setLocalParameters] = useState<AIParameters>(parameters);
  const [localSystemPrompt, setLocalSystemPrompt] = useState<string>(systemPrompt || '');

  // Update local state when props change
  useEffect(() => {
    setLocalParameters(parameters);
  }, [parameters]);

  useEffect(() => {
    setLocalSystemPrompt(systemPrompt || '');
  }, [systemPrompt]);

  // Get current provider
  const currentProvider = providers.find(p => p.id === selectedProviderId);
  const enabledProviders = providers.filter(p => p.isEnabled);

  // Handle save
  const handleSave = () => {
    onParametersChange(localParameters);
    if (onSystemPromptChange) {
      onSystemPromptChange(localSystemPrompt);
    }
    onClose();
  };

  // Handle parameter changes
  const handleParameterChange = (key: keyof AIParameters, value: number) => {
    setLocalParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setLocalParameters({
      temperature: 0.7,
      maxTokens: 16000,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxIterations: 10
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glassmorphic border border-white/30 dark:border-gray-700/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              AI Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-140px)] overflow-y-auto">
          {/* Provider Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-500" />
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                AI Provider
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {enabledProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => onProviderSelect(provider.id)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    selectedProviderId === provider.id
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-800 dark:text-gray-200">
                    {provider.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {provider.type}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => onModelSelect(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* Provider Info */}
          {currentProvider && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-500" />
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Provider Configuration
                </label>
              </div>
              <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <div><strong>Type:</strong> {currentProvider.type}</div>
                  <div><strong>Base URL:</strong> {currentProvider.baseUrl || 'Default'}</div>
                  <div><strong>API Key:</strong> {currentProvider.apiKey ? '••••••••' : 'Not configured'}</div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Provider settings are managed in the main Settings page.
              </p>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-500" />
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  System Prompt
                </label>
              </div>
              <button
                onClick={() => setLocalSystemPrompt('')}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                Use default prompt
              </button>
            </div>
            <div className="space-y-2">
              <textarea
                value={localSystemPrompt}
                onChange={(e) => setLocalSystemPrompt(e.target.value)}
                placeholder="Currently showing the active system prompt. Edit to customize or clear to use default..."
                className="w-full h-32 p-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
                rows={6}
              />
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p className="mb-1">
                  <strong>System Prompt Configuration</strong> - The text above shows your current active system prompt.
                </p>
                <p>
                  • <strong>Edit the text</strong> to customize the AI's behavior and instructions<br/>
                  • <strong>Clear the field</strong> to use the default LumaUI-lite prompt with design guidelines<br/>
                  • <strong>Click "Use default prompt"</strong> to quickly reset to the built-in prompt
                </p>
              </div>
            </div>
          </div>

          {/* AI Parameters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-500" />
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  AI Parameters
                </label>
              </div>
              <button
                onClick={resetToDefaults}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                Reset to defaults
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Temperature */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Temperature
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.temperature}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={localParameters.temperature}
                  onChange={(e) => handleParameterChange('temperature', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Controls randomness (0 = focused, 2 = creative)
                </p>
              </div>

              {/* Max Tokens */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Max Tokens
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.maxTokens}
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="32000"
                  step="1000"
                  value={localParameters.maxTokens}
                  onChange={(e) => handleParameterChange('maxTokens', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Maximum response length
                </p>
              </div>

              {/* Top P */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Top P
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.topP}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={localParameters.topP}
                  onChange={(e) => handleParameterChange('topP', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Nucleus sampling threshold
                </p>
              </div>

              {/* Frequency Penalty */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Frequency Penalty
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.frequencyPenalty}
                  </span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={localParameters.frequencyPenalty}
                  onChange={(e) => handleParameterChange('frequencyPenalty', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Reduce repetition (-2 to 2)
                </p>
              </div>

              {/* Presence Penalty */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Presence Penalty
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.presencePenalty}
                  </span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={localParameters.presencePenalty}
                  onChange={(e) => handleParameterChange('presencePenalty', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Encourage new topics (-2 to 2)
                </p>
              </div>

              {/* Max Iterations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Max Iterations
                  </label>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {localParameters.maxIterations}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={localParameters.maxIterations}
                  onChange={(e) => handleParameterChange('maxIterations', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none slider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Maximum tool operations per request
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Current Configuration
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Provider:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {currentProvider?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Model:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {selectedModel}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">API Key:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {currentProvider?.apiKey ? '•••••••••' : 'Not set'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/20 dark:border-gray-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all text-sm font-semibold shadow-lg hover:shadow-xl"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AISettingsModal; 
