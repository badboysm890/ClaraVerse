import React, { useState } from 'react';
import { Bot, Image, Plus, Check, X, Edit3, Zap, Router, Server, Globe, Trash2 } from 'lucide-react';
import { APIConfig, Provider } from '../../db';

interface AIServicesTabProps {
  apiConfig: APIConfig;
  setApiConfig: React.Dispatch<React.SetStateAction<APIConfig>>;
  providers: Provider[];
  providersLoading: boolean;
  addProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setPrimaryProvider: (id: string) => Promise<void>;
}

const AIServicesTab: React.FC<AIServicesTabProps> = ({
  apiConfig,
  setApiConfig,
  providers,
  providersLoading,
  addProvider,
  updateProvider,
  deleteProvider,
  setPrimaryProvider
}) => {
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: 'success' | 'error' | null }>({});
  const [newProviderForm, setNewProviderForm] = useState({
    name: '',
    type: 'openai' as Provider['type'],
    baseUrl: '',
    apiKey: '',
    isEnabled: true
  });

  const getProviderIcon = (type: Provider['type']) => {
    switch (type) {
      case 'angelas-pocket':
        return Bot;
      case 'openai':
        return Zap;
      case 'openai_compatible':
        return Router;
      case 'ollama':
        return Server;
      default:
        return Globe;
    }
  };

  const getDefaultProviderConfig = (type: Provider['type']) => {
    switch (type) {
      case 'openai':
        return { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' };
      case 'openai_compatible':
        return { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenAI Compatible' };
      case 'ollama':
        return { baseUrl: 'http://localhost:11434/v1', name: 'Ollama' };
      case 'angelas-pocket':
        return { baseUrl: 'http://localhost:8091/v1', name: "angela's Core" };
      default:
        return { baseUrl: '', name: '' };
    }
  };

  const testOllamaConnection = async (providerId: string, baseUrl: string) => {
    setTestingProvider(providerId);
    setTestResults(prev => ({ ...prev, [providerId]: null }));

    try {
      const testUrl = baseUrl.replace('/v1', '');
      const response = await fetch(`${testUrl}/api/tags`);
      if (response.ok) {
        setTestResults(prev => ({ ...prev, [providerId]: 'success' }));
      } else {
        setTestResults(prev => ({ ...prev, [providerId]: 'error' }));
      }
    } catch (error) {
      setTestResults(prev => ({ ...prev, [providerId]: 'error' }));
      console.error('Ollama connection test failed:', error);
    } finally {
      setTestingProvider(null);
      setTimeout(() => {
        setTestResults(prev => ({ ...prev, [providerId]: null }));
      }, 3000);
    }
  };

  const handleAddProvider = async () => {
    try {
      await addProvider({
        name: newProviderForm.name,
        type: newProviderForm.type,
        baseUrl: newProviderForm.baseUrl,
        apiKey: newProviderForm.apiKey,
        isEnabled: newProviderForm.isEnabled,
        isPrimary: false
      });

      setShowAddProviderModal(false);
      setNewProviderForm({
        name: '',
        type: 'openai',
        baseUrl: '',
        apiKey: '',
        isEnabled: true
      });
    } catch (error) {
      console.error('Error adding provider:', error);
      if (error instanceof Error && error.message.includes("angela's Pocket provider already exists")) {
        alert("⚠️ angela's Pocket provider already exists. Only one instance is allowed.");
      } else {
        alert('❌ Failed to add provider. Please try again.');
      }
    }
  };

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setNewProviderForm({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl || '',
      apiKey: provider.apiKey || '',
      isEnabled: provider.isEnabled
    });
    setShowAddProviderModal(true);
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider) return;

    try {
      await updateProvider(editingProvider.id, {
        name: newProviderForm.name,
        type: newProviderForm.type,
        baseUrl: newProviderForm.baseUrl,
        apiKey: newProviderForm.apiKey,
        isEnabled: newProviderForm.isEnabled
      });

      setShowAddProviderModal(false);
      setEditingProvider(null);
      setNewProviderForm({
        name: '',
        type: 'openai',
        baseUrl: '',
        apiKey: '',
        isEnabled: true
      });
    } catch (error) {
      console.error('Error updating provider:', error);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    try {
      await deleteProvider(providerId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting provider:', error);
    }
  };

  const handleSetPrimary = async (providerId: string, isPrimary: boolean) => {
    try {
      if (isPrimary) {
        await setPrimaryProvider(providerId);
      } else {
        const enabledProviders = providers.filter(p => p.isEnabled && p.id !== providerId);
        if (enabledProviders.length > 0) {
          await setPrimaryProvider(enabledProviders[0].id);
        }
      }
    } catch (error) {
      console.error('Error setting primary provider:', error);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Providers Section */}
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Bot className="w-6 h-6 text-sakura-500" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  AI Services
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect and manage your AI service providers
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingProvider(null);
                  setNewProviderForm({
                    name: '',
                    type: 'openai',
                    baseUrl: '',
                    apiKey: '',
                    isEnabled: true
                  });
                  setShowAddProviderModal(true);
                }}
                className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Service
              </button>
            </div>
          </div>

          {/* Providers List */}
          {providersLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sakura-500"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => {
                const ProviderIcon = getProviderIcon(provider.type);
                return (
                  <div
                    key={provider.id}
                    className={`group relative p-5 rounded-xl border transition-all duration-300 ${provider.isPrimary
                        ? 'border-sakura-200 dark:border-sakura-700 bg-gradient-to-br from-sakura-50/50 to-white/50 dark:from-sakura-900/20 dark:to-gray-800/50 shadow-lg shadow-sakura-100/50 dark:shadow-sakura-900/20'
                        : 'border-gray-200/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/40 hover:border-gray-300/80 dark:hover:border-gray-600/80'
                      } hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-gray-900/20 backdrop-blur-sm`}
                  >
                    {provider.isPrimary && (
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-sakura-400/20 to-sakura-600/20 rounded-xl blur-sm -z-10"></div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`relative w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${provider.isEnabled
                            ? provider.isPrimary
                              ? 'bg-sakura-100/80 dark:bg-sakura-900/40 border-2 border-sakura-200 dark:border-sakura-700'
                              : 'bg-sakura-50/60 dark:bg-sakura-900/20 border border-sakura-200/50 dark:border-sakura-700/50'
                            : 'bg-gray-100/80 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600'
                          }`}>
                          <ProviderIcon className={`w-7 h-7 ${provider.isEnabled
                              ? 'text-sakura-600 dark:text-sakura-400'
                              : 'text-gray-500 dark:text-gray-400'
                            }`} />
                          {provider.isPrimary && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className={`font-semibold transition-colors ${provider.isPrimary
                                ? 'text-gray-900 dark:text-white'
                                : 'text-gray-800 dark:text-gray-200'
                              }`}>
                              {provider.name}
                            </h4>
                            {provider.isPrimary && (
                              <span className="px-2.5 py-1 bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full border border-emerald-200/50 dark:border-emerald-700/50">
                                Default
                              </span>
                            )}
                            {!provider.isEnabled && (
                              <span className="px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono truncate">
                            {provider.baseUrl || 'No URL configured'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 capitalize font-medium">
                            {provider.type.replace('-', ' ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 ml-4">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleSetPrimary(provider.id, !provider.isPrimary)}
                            disabled={!provider.isEnabled}
                            className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sakura-300 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed ${provider.isPrimary
                                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-500/25'
                                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                          >
                            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${provider.isPrimary ? 'translate-x-6' : 'translate-x-0'
                              }`}>
                              {provider.isPrimary && (
                                <Check className="w-3 h-3 text-emerald-500" />
                              )}
                            </div>
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            Default
                          </span>
                        </div>

                        {provider.type === 'ollama' && provider.baseUrl && (
                          <button
                            onClick={() => testOllamaConnection(provider.id, provider.baseUrl!)}
                            disabled={testingProvider === provider.id}
                            className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2 font-medium ${testResults[provider.id] === 'success'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50 shadow-sm'
                                : testResults[provider.id] === 'error'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/50 shadow-sm'
                                  : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700/50'
                              }`}
                          >
                            {testingProvider === provider.id ? (
                              <>
                                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                Testing...
                              </>
                            ) : testResults[provider.id] === 'success' ? (
                              <>
                                <Check className="w-3 h-3" />
                                Connected
                              </>
                            ) : testResults[provider.id] === 'error' ? (
                              <>
                                <X className="w-3 h-3" />
                                Failed
                              </>
                            ) : (
                              <>
                                <Server className="w-3 h-3" />
                                Test
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleEditProvider(provider)}
                          className="p-2.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                          title="Edit provider"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {provider.type !== 'angelas-pocket' && (
                          <button
                            onClick={() => setShowDeleteConfirm(provider.id)}
                            className="p-2.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50/50 dark:hover:bg-red-900/20"
                            title="Delete provider"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Image Generation Section */}
       
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Provider
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete this provider? All associated configurations will be permanently removed.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProvider(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Provider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Provider Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </h3>
              <button
                onClick={() => {
                  setShowAddProviderModal(false);
                  setEditingProvider(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provider Type
                </label>
                <select
                  value={newProviderForm.type}
                  onChange={(e) => {
                    const type = e.target.value as Provider['type'];
                    const defaultConfig = getDefaultProviderConfig(type);
                    setNewProviderForm(prev => ({
                      ...prev,
                      type,
                      name: defaultConfig.name || prev.name,
                      baseUrl: defaultConfig.baseUrl || prev.baseUrl,
                      apiKey: type === 'ollama' ? 'ollama' : prev.apiKey
                    }));
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                >
                  <option value="openai">OpenAI</option>
                  <option value="openai_compatible">OpenAI Compatible</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={newProviderForm.name}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="Enter provider name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={newProviderForm.baseUrl}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={newProviderForm.apiKey}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="Enter API key (optional)"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={newProviderForm.isEnabled}
                  onChange={(e) => setNewProviderForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
                  className="w-4 h-4 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                />
                <label htmlFor="isEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable this provider
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddProviderModal(false);
                  setEditingProvider(null);
                }}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingProvider ? handleUpdateProvider : handleAddProvider}
                disabled={!newProviderForm.name.trim()}
                className="flex-1 px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingProvider ? 'Update' : 'Add'} Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIServicesTab; 
