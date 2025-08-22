import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, RefreshCw, CheckCircle2, XCircle, Copy, CheckCheck, ImagePlus, X, Image as ImageIcon, Database } from 'lucide-react';
import { OllamaClient } from '../utils';
import { db } from '../db';
import ErrorTester from './ErrorTester';
// import DebugProjectStorage from './DebugProjectStorage';

interface UploadedImage {
  id: string;
  base64: string;
  preview: string;
}

const Debug = () => {
  const [activeTab, setActiveTab] = useState<'ollama' | 'storage' | 'errors'>('ollama');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<OllamaClient | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await db.getAPIConfig();
      if (config?.ollama_base_url) {
        setBaseUrl(config.ollama_base_url);
        const newClient = new OllamaClient(config.ollama_base_url);
        setClient(newClient);
        try {
          const modelList = await newClient.listModels();
          setModels(modelList);
          if (modelList.length > 0) {
            setSelectedModel(modelList[0].name);
          }
        } catch (err) {
          setError('Failed to load models. Is Ollama running?');
        }
      }
    };
    loadConfig();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: UploadedImage[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        setError(`Image ${file.name} exceeds 10MB limit`);
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newImages.push({
          id: crypto.randomUUID(),
          base64: base64.split(',')[1], // Remove data URL prefix
          preview: base64
        });
      } catch (err) {
        setError(`Failed to process image ${file.name}`);
      }
    }

    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleTest = async () => {
    if (!client) return;
    
    setLoading(true);
    setError(null);
    setResponse(null);
    setStreamingResponse('');

    try {
      let result;
      if (images.length > 0) {
        // Use image generation endpoint if images are present
        result = await client.generateWithImages(
          selectedModel,
          prompt,
          images.map(img => img.base64)
        );
        setResponse(result);
      } else if (isStreaming) {
        // Use streaming endpoint
        for await (const chunk of client.streamCompletion(selectedModel, prompt)) {
          setStreamingResponse(prev => prev + (chunk.response || ''));
        }
      } else {
        // Use regular completion endpoint
        result = await client.generateCompletion(selectedModel, prompt);
        setResponse(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const refreshModels = async () => {
    if (!client) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const modelList = await client.listModels();
      setModels(modelList);
      if (modelList.length > 0 && !modelList.find(m => m.name === selectedModel)) {
        setSelectedModel(modelList[0].name);
      }
    } catch (err) {
      setError('Failed to refresh models. Is Ollama running?');
    } finally {
      setLoading(false);
    }
  };

  const renderTroubleshooting = () => {
    if (!error) return null;

    const systemdConfig = `[Service]
Environment="OLLAMA_ORIGINS=*"`;

    // Fix the URL constructor error by checking if baseUrl is valid
    let hostname = '';
    try {
      if (baseUrl && baseUrl.includes('://')) {
        hostname = new URL(baseUrl).hostname;
      }
    } catch (e) {
      hostname = 'your-server-name';
    }

    const nginxConfig = `server {
    listen 80;
    server_name ${hostname};
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host localhost:11434;
    }
}`;

    return (
      <div className="mt-8 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Troubleshooting Steps
        </h3>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              1. Configure CORS in Ollama Service
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Edit the Ollama systemd service configuration:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                sudo systemctl edit ollama.service
              </pre>
              <button
                onClick={() => handleCopy("sudo systemctl edit ollama.service", "systemd-cmd")}
                className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                {copied === "systemd-cmd" ? (
                  <CheckCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Add this configuration:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                {systemdConfig}
              </pre>
              <button
                onClick={() => handleCopy(systemdConfig, "systemd-config")}
                className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                {copied === "systemd-config" ? (
                  <CheckCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Then reload and restart the service:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                sudo systemctl daemon-reload{"\n"}sudo systemctl restart ollama
              </pre>
              <button
                onClick={() => handleCopy("sudo systemctl daemon-reload && sudo systemctl restart ollama", "reload-cmd")}
                className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                {copied === "reload-cmd" ? (
                  <CheckCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              2. Configure Nginx (if using)
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Add this configuration to your Nginx server block:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                {nginxConfig}
              </pre>
              <button
                onClick={() => handleCopy(nginxConfig, "nginx-config")}
                className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                {copied === "nginx-config" ? (
                  <CheckCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Then reload Nginx:
            </p>
            <div className="relative">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                sudo nginx -t && sudo systemctl reload nginx
              </pre>
              <button
                onClick={() => handleCopy("sudo nginx -t && sudo systemctl reload nginx", "nginx-reload")}
                className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                {copied === "nginx-reload" ? (
                  <CheckCheck className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Error Testing Panel - Development Only */}
      {import.meta.env.DEV && (
        <ErrorTester />
      )}
      
      {/* Tab Navigation */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Terminal className="w-6 h-6 text-sakura-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Debug Console
          </h2>
        </div>
        
        <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('ollama')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'ollama'
                ? 'bg-white dark:bg-gray-700 text-sakura-600 dark:text-sakura-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Ollama
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'storage'
                ? 'bg-white dark:bg-gray-700 text-sakura-600 dark:text-sakura-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Project Storage
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'errors'
                ? 'bg-white dark:bg-gray-700 text-sakura-600 dark:text-sakura-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <XCircle className="w-4 h-4" />
            Error Testing
          </button>
        </div>

        {activeTab === 'storage' ? (
          <DebugProjectStorage />
        ) : activeTab === 'errors' ? (
          <ErrorTester />
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Ollama Debug Console
            </h3>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                readOnly
                className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Connection Status
              </label>
              <div className="flex items-center gap-2 text-sm">
                {client ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-green-500">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-500">Not Connected</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Available Models
              </label>
              <button
                onClick={refreshModels}
                disabled={loading || !client}
                className="text-sm text-sakura-500 hover:text-sakura-600 disabled:text-gray-400 flex items-center gap-1"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loading || models.length === 0}
              className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
            >
              {models.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Images
            </label>
            <div className="flex flex-wrap gap-4 mb-4">
              {images.map((image) => (
                <div 
                  key={image.id} 
                  className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                >
                  <img 
                    src={image.preview} 
                    alt="Uploaded" 
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(image.id)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-sakura-500 dark:hover:border-sakura-500 transition-colors"
              >
                <ImagePlus className="w-6 h-6 text-gray-400 dark:text-gray-600" />
                <span className="text-xs text-gray-500 dark:text-gray-400">Add Image</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                data-testid="file-upload-input"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isStreaming}
                onChange={(e) => setIsStreaming(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-500"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Stream Response
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Test Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading || !client}
              placeholder="Enter a test prompt..."
              className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100 min-h-[100px]"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleTest}
              disabled={loading || !client || !prompt || !selectedModel}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Test
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {(streamingResponse || response) && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isStreaming ? 'Streaming Response' : 'Response'}
              </h3>
              <pre className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 overflow-auto text-sm text-gray-800 dark:text-gray-200">
                {isStreaming ? streamingResponse : JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          {renderTroubleshooting()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Debug;
