import React, { useState, useEffect } from 'react';
import { Brain, Zap, Download, Trash2, RefreshCw, Server, HardDrive, Eye, Search, FolderOpen } from 'lucide-react';
import GPUDiagnostics from '../GPUDiagnostics';

interface LocalModel {
  name: string;
  size?: number;
  modified_at?: string;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

const LocalModelsTab: React.FC = () => {
  const [activeModelTab, setActiveModelTab] = useState<'models' | 'gpu-diagnostics'>('models');
  const [angelaModels, setangelaModels] = useState<LocalModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<LocalModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const ModelTabItem = ({ id, label, isActive }: { id: typeof activeModelTab, label: string, isActive: boolean }) => (
    <button
      onClick={() => setActiveModelTab(id)}
      className={`px-4 py-2 rounded-lg transition-colors font-medium ${isActive
          ? 'bg-sakura-500 text-white'
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
        }`}
    >
      {label}
    </button>
  );

  // Load angela Core models
  const loadangelaModels = async () => {
    try {
      // Check if we're in Docker mode or have angela Core service
      const response = await fetch('http://localhost:8000/api/models/local');
      if (response.ok) {
        const data = await response.json();
        setangelaModels(data.models || []);
      }
    } catch (error) {
      console.log('angela Core not available:', error);
      setangelaModels([]);
    }
  };

  // Load Ollama models
  const loadOllamaModels = async () => {
    try {
      // Try localhost first
      let response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        // Try Docker internal host
        response = await fetch('http://host.docker.internal:11434/api/tags');
      }
      
      if (response.ok) {
        const data = await response.json();
        setOllamaModels(data.models || []);
      }
    } catch (error) {
      console.log('Ollama not available:', error);
      setOllamaModels([]);
    }
  };

  // Load all models
  const loadAllModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadangelaModels(), loadOllamaModels()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllModels();
  }, []);

  // Format file size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  // Filter models based on search
  const filteredangelaModels = angelaModels.filter(model =>
    model.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOllamaModels = ollamaModels.filter(model =>
    model.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Model Manager Header with Sub-tabs */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-sakura-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Local Models
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage your locally installed AI models and hardware acceleration
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 -mb-6 pb-4">
          <ModelTabItem
            id="models"
            label="Models"
            isActive={activeModelTab === 'models'}
          />
          <ModelTabItem
            id="gpu-diagnostics"
            label="Hardware Acceleration"
            isActive={activeModelTab === 'gpu-diagnostics'}
          />
        </div>
      </div>

      {/* Model Tab Content */}
      {activeModelTab === 'models' && (
        <div className="space-y-6">
          {/* Search and Controls */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={loadAllModels}
                disabled={isLoading}
                className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* angela Core Models */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center shadow-md">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  angela Core Models
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Models managed by angela's native llama.cpp service
                </p>
              </div>
            </div>

            {filteredangelaModels.length > 0 ? (
              <div className="space-y-3">
                {filteredangelaModels.map((model, index) => (
                  <div
                    key={`angela-${index}`}
                    className="flex items-center justify-between p-4 bg-white/50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center shadow-md">
                        <HardDrive className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {model.name}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>Size: {formatSize(model.size)}</span>
                          <span>Modified: {formatDate(model.modified_at)}</span>
                          {model.details?.parameter_size && (
                            <span>Parameters: {model.details.parameter_size}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-600 dark:text-gray-300 hover:text-sakura-500 hover:bg-sakura-100 dark:hover:bg-gray-600 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No angela Core models found</p>
                <p className="text-sm">Models will appear here when angela Core service is running</p>
              </div>
            )}
          </div>

          {/* Ollama Models */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-md">
                <Server className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Ollama Models
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Models managed by Ollama service
                </p>
              </div>
            </div>

            {filteredOllamaModels.length > 0 ? (
              <div className="space-y-3">
                {filteredOllamaModels.map((model, index) => (
                  <div
                    key={`ollama-${index}`}
                    className="flex items-center justify-between p-4 bg-white/50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-md">
                        <Server className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {model.name}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>Size: {formatSize(model.size)}</span>
                          <span>Modified: {formatDate(model.modified_at)}</span>
                          {model.details?.family && (
                            <span>Family: {model.details.family}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-600 dark:text-gray-300 hover:text-blue-500 hover:bg-blue-100 dark:hover:bg-gray-600 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No Ollama models found</p>
                <p className="text-sm">Install Ollama and pull models to see them here</p>
                <a
                  href="https://ollama.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Install Ollama
                </a>
              </div>
            )}
          </div>

          {/* Model Statistics */}
          <div className="glassmorphic rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Model Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg p-4 text-white">
                <div className="flex items-center gap-3">
                  <Brain className="w-8 h-8" />
                  <div>
                    <div className="text-2xl font-bold">{angelaModels.length}</div>
                    <div className="text-sm opacity-90">angela Core Models</div>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg p-4 text-white">
                <div className="flex items-center gap-3">
                  <Server className="w-8 h-8" />
                  <div>
                    <div className="text-2xl font-bold">{ollamaModels.length}</div>
                    <div className="text-sm opacity-90">Ollama Models</div>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg p-4 text-white">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-8 h-8" />
                  <div>
                    <div className="text-2xl font-bold">{angelaModels.length + ollamaModels.length}</div>
                    <div className="text-sm opacity-90">Total Models</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPU Diagnostics Tab Content */}
      {activeModelTab === 'gpu-diagnostics' && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-6 h-6 text-amber-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Hardware Acceleration
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Monitor GPU detection and optimize performance for faster inference
              </p>
            </div>
          </div>

          <GPUDiagnostics />
        </div>
      )}
    </div>
  );
};

export default LocalModelsTab; 
