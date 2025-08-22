import React, { useState, memo } from 'react';
import { Mic, Settings, Eye, EyeOff, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { NodeProps } from 'reactflow';
import BaseNode from './BaseNode';

interface WhisperTranscriptionNodeProps extends NodeProps {
  data: {
    label: string;
    apiKey: string;
    model: string;
    language: string;
    temperature: number;
    prompt: string;
    inputs: any[];
    outputs: any[];
    onUpdate: (updates: any) => void;
    onDelete: () => void;
  };
}

const WhisperTranscriptionNode = memo<WhisperTranscriptionNodeProps>((props) => {
  const { data } = props;
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const apiKey = data.apiKey || '';
  const model = data.model || 'gpt-4o-transcribe';
  const language = data.language || 'auto';
  const temperature = data.temperature || 0;
  const prompt = data.prompt || 'You are a transcription assistant. Transcribe the audio accurately.';

  const handleApiKeyChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, apiKey: value } });
    }
  };

  const handleModelChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, model: value } });
    }
  };

  const handleLanguageChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, language: value } });
    }
  };

  const handleTemperatureChange = (value: number) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, temperature: value } });
    }
  };

  const handlePromptChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, prompt: value } });
    }
  };

  const getLanguageOptions = () => [
    { label: 'Auto-detect', value: 'auto' },
    { label: 'English', value: 'en' },
    { label: 'Spanish', value: 'es' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Italian', value: 'it' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Russian', value: 'ru' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Korean', value: 'ko' },
    { label: 'Chinese', value: 'zh' },
    { label: 'Arabic', value: 'ar' },
    { label: 'Hindi', value: 'hi' },
    { label: 'Dutch', value: 'nl' },
    { label: 'Polish', value: 'pl' }
  ];

  const getConfigurationStatus = () => {
    if (!apiKey) return { status: 'error', message: 'API key required' };
    if (!apiKey.startsWith('sk-')) return { status: 'warning', message: 'Invalid API key format' };
    return { status: 'success', message: 'Configuration complete' };
  };

  const configStatus = getConfigurationStatus();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <BaseNode
      {...props}
      title={data.label || 'Whisper Transcription'}
      category="ai"
      icon={<Mic className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
      executing={isTranscribing}
      error={error}
      success={!!lastResult}
    >
      <div className="space-y-3">
        {/* Configuration Status */}
        <div className={`p-2 rounded border ${
          configStatus.status === 'error' 
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
            : configStatus.status === 'warning'
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        }`}>
          <div className="flex items-center gap-2">
            {configStatus.status === 'error' ? (
              <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
            ) : configStatus.status === 'warning' ? (
              <AlertCircle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
            ) : (
              <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
            )}
            <span className={`text-xs font-medium ${
              configStatus.status === 'error' 
                ? 'text-red-800 dark:text-red-200' 
                : configStatus.status === 'warning'
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-green-800 dark:text-green-200'
            }`}>
              {configStatus.message}
            </span>
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="ml-auto p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded transition-colors"
              title="Toggle configuration"
            >
              <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Configuration Panel */}
        {isConfigOpen && (
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border">
            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                OpenAI API Key *
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-2 py-1 pr-8 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your OpenAI API key for Whisper access
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Whisper Model
              </label>
              <select
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="gpt-4o-transcribe">GPT-4o Transcribe (Recommended)</option>
                <option value="whisper-1">Whisper-1 (Legacy)</option>
              </select>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                OpenAI Whisper model for transcription
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {getLanguageOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Language of the audio (auto-detect recommended)
              </div>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Temperature: {temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Deterministic (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            {/* Transcription Prompt */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transcription Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder="You are a transcription assistant. Transcribe the audio accurately."
                rows={3}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Instructions for the transcription model (works best with gpt-4o-transcribe)
              </div>
            </div>
          </div>
        )}

        {/* Input Information */}
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <Info className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                Binary Audio Input
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                Connect binary audio data from File Upload node. Supports MP3, WAV, FLAC, M4A, OGG, OPUS formats.
              </p>
            </div>
          </div>
        </div>

        {/* Last Result Preview */}
        {lastResult && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Last Transcription
            </label>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded border text-xs">
              <div className="text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                Transcription Complete
              </div>
              <div className="text-gray-800 dark:text-gray-200 mb-2 max-h-20 overflow-y-auto">
                "{lastResult.text?.substring(0, 200)}{lastResult.text?.length > 200 ? '...' : ''}"
              </div>
              {lastResult.metadata && (
                <div className="text-gray-500 dark:text-gray-500 text-xs space-y-0.5">
                  <div>Language: {lastResult.metadata.language || 'Unknown'}</div>
                  <div>Duration: {lastResult.metadata.duration ? `${lastResult.metadata.duration}s` : 'Unknown'}</div>
                  <div>Model: {lastResult.metadata.model}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Processing Status */}
        {isTranscribing && (
          <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-xs text-yellow-800 dark:text-yellow-200">
              <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              Transcribing audio with Whisper...
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <div className="text-xs text-red-800 dark:text-red-200">{error}</div>
          </div>
        )}

        {/* Status Display */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Model: {model} • Language: {language} • Temp: {temperature}
          {prompt && prompt !== 'You are a transcription assistant. Transcribe the audio accurately.' && (
            <div className="mt-1 truncate">Prompt: {prompt.substring(0, 50)}{prompt.length > 50 ? '...' : ''}</div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

WhisperTranscriptionNode.displayName = 'WhisperTranscriptionNode';

export default WhisperTranscriptionNode; 
