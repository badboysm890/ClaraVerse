const { contextBridge, ipcRenderer, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

// Function to safely get app version
function getAppVersion() {
  try {
    // Read from package.json
    const packagePath = path.join(__dirname, '../package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version || 'unknown';
    }
  } catch (error) {
    console.error('Failed to get app version:', error);
  }
  return 'unknown';
}

// Valid channels for IPC communication
const validChannels = [
  'app-ready',
  'app-close',
  'update-available',
  'update-downloaded',
  'update-download-progress',
  'update-download-completed',
  'update-download-error',
  'download-progress',
  'llama-progress-update',
  'llama-progress-complete',
  'watchdog-service-restored',
  'watchdog-service-failed',
  'watchdog-service-restarted',
  'docker-update-progress',
  'comfyui-model-download-progress',
  'comfyui-model-download-complete',
  'model-download-progress',
  'trigger-new-chat',
  'hide-to-tray',
  'show-from-tray',
  'app-initialization-state',
  'service-status-update',
  'service-init-progress'
];

// Add explicit logging for debugging
console.log('Preload script initializing...');

contextBridge.exposeInMainWorld('electron', {
  // System Info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAppVersion: () => app.getVersion(),
  getElectronVersion: () => process.versions.electron,
  getPlatform: () => process.platform,
  isDev: process.env.NODE_ENV === 'development',
  
  // Permissions
  requestMicrophonePermission: () => ipcRenderer.invoke('request-microphone-permission'),
  
  // Service Info
  getServicePorts: () => ipcRenderer.invoke('get-service-ports'),
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
  checkPythonBackend: () => ipcRenderer.invoke('check-python-backend'),
  checkDockerServices: () => ipcRenderer.invoke('check-docker-services'),
  getPythonBackendInfo: () => ipcRenderer.invoke('get-python-backend-info'),
  startDockerService: (serviceName) => ipcRenderer.invoke('start-docker-service', serviceName),
  stopDockerService: (serviceName) => ipcRenderer.invoke('stop-docker-service', serviceName),
  restartDockerService: (serviceName) => ipcRenderer.invoke('restart-docker-service', serviceName),

  // Docker Container Updates
  checkDockerUpdates: () => ipcRenderer.invoke('docker-check-updates'),
  updateDockerContainers: (containerNames) => ipcRenderer.invoke('docker-update-containers', containerNames),
  getSystemInfo: () => ipcRenderer.invoke('docker-get-system-info'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  startInAppDownload: (updateInfo) => ipcRenderer.invoke('start-in-app-download', updateInfo),
  
  // IPC Event Listeners for updates
  on: (channel, callback) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  removeAllListeners: (channel) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  
  // Llama.cpp Binary Updates
  checkLlamacppUpdates: () => ipcRenderer.invoke('check-llamacpp-updates'),
  updateLlamacppBinaries: () => ipcRenderer.invoke('update-llamacpp-binaries'),
  
  // Clipboard
  clipboard: {
    writeText: (text) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
  },
  
  // IPC Communication
  send: (channel, data) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  sendReactReady: () => {
    ipcRenderer.send('react-app-ready');
  },
  receive: (channel, callback) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  removeListener: (channel, callback) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  removeAllListeners: (channel) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  getWorkflowsPath: () => ipcRenderer.invoke('get-workflows-path'),
  dialog: {
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
  },
  
  // Add tray functionality
  hideToTray: () => ipcRenderer.send('hide-to-tray'),
  showFromTray: () => ipcRenderer.send('show-from-tray'),
  
  // Update startup settings to use the new handle-based IPC
  setStartupSettings: (settings) => ipcRenderer.invoke('set-startup-settings', settings),
  getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
  
  // Fast startup APIs for dashboard
  getInitializationState: () => ipcRenderer.invoke('get-initialization-state'),
  saveFeatureSelection: (features) => ipcRenderer.invoke('save-feature-selection', features),
  initializeService: (serviceName) => ipcRenderer.invoke('initialize-service', serviceName),
});

// Add Docker container management API
contextBridge.exposeInMainWorld('electronAPI', {
  getContainers: () => ipcRenderer.invoke('get-containers'),
  containerAction: (containerId, action) => 
    ipcRenderer.invoke('container-action', { containerId, action }),
  createContainer: (containerConfig) => 
    ipcRenderer.invoke('create-container', containerConfig),
  getContainerStats: (containerId) => 
    ipcRenderer.invoke('get-container-stats', containerId),
  getContainerLogs: (containerId) => 
    ipcRenderer.invoke('get-container-logs', containerId),
  pullImage: (image) => ipcRenderer.invoke('pull-image', image),
  createNetwork: (networkConfig) => ipcRenderer.invoke('create-network', networkConfig),
  listNetworks: () => ipcRenderer.invoke('list-networks'),
  removeNetwork: (networkId) => ipcRenderer.invoke('remove-network', networkId),
  getImages: () => ipcRenderer.invoke('get-images'),
  removeImage: (imageId) => ipcRenderer.invoke('remove-image', imageId),
  pruneContainers: () => ipcRenderer.invoke('prune-containers'),
  pruneImages: () => ipcRenderer.invoke('prune-images'),
  getDockerInfo: () => ipcRenderer.invoke('get-docker-info'),
  getDockerVersion: () => ipcRenderer.invoke('get-docker-version'),
  
  // ComfyUI specific API
  comfyuiStatus: () => ipcRenderer.invoke('comfyui-status'),
  comfyuiStart: () => ipcRenderer.invoke('comfyui-start'),
  comfyuiStop: () => ipcRenderer.invoke('comfyui-stop'),
  comfyuiRestart: () => ipcRenderer.invoke('comfyui-restart'),
  comfyuiLogs: () => ipcRenderer.invoke('comfyui-logs'),
  comfyuiOptimize: () => ipcRenderer.invoke('comfyui-optimize'),
  
  // System information methods
  getPlatform: () => process.platform,
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  saveComfyUIConsent: (hasConsented) => ipcRenderer.invoke('save-comfyui-consent', hasConsented),
  getComfyUIConsent: () => ipcRenderer.invoke('get-comfyui-consent'),
  createUserConsentFile: (consentData) => ipcRenderer.invoke('createUserConsentFile', consentData),
  getGPUInfo: () => ipcRenderer.invoke('get-gpu-info'),
  
  // Services status API
  getServicesStatus: () => ipcRenderer.invoke('get-services-status'),
  
  // Watchdog service API
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(event, ...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Add llama-swap service API
contextBridge.exposeInMainWorld('llamaSwap', {
  start: () => ipcRenderer.invoke('start-llama-swap'),
  stop: () => ipcRenderer.invoke('stop-llama-swap'),
  restart: () => ipcRenderer.invoke('restart-llama-swap'),
  getStatus: () => ipcRenderer.invoke('get-llama-swap-status'),
  getStatusWithHealth: () => ipcRenderer.invoke('get-llama-swap-status-with-health'),
  getModels: () => ipcRenderer.invoke('get-llama-swap-models'),
  getApiUrl: () => ipcRenderer.invoke('get-llama-swap-api-url'),
  regenerateConfig: () => ipcRenderer.invoke('regenerate-llama-swap-config'),
  debugBinaryPaths: () => ipcRenderer.invoke('debug-binary-paths'),
  getGPUDiagnostics: () => ipcRenderer.invoke('get-gpu-diagnostics'),
  getPerformanceSettings: () => ipcRenderer.invoke('get-performance-settings'),
  savePerformanceSettings: (settings) => ipcRenderer.invoke('save-performance-settings', settings),
  loadPerformanceSettings: () => ipcRenderer.invoke('load-performance-settings'),
  setCustomModelPath: (path) => ipcRenderer.invoke('set-custom-model-path', path),
  getCustomModelPaths: () => ipcRenderer.invoke('get-custom-model-paths'),
  scanCustomPathModels: (path) => ipcRenderer.invoke('scan-custom-path-models', path),
  getModelEmbeddingInfo: (modelPath) => ipcRenderer.invoke('get-model-embedding-info', modelPath),
  searchHuggingFaceMmproj: (modelName, embeddingSize) => ipcRenderer.invoke('search-huggingface-mmproj', modelName, embeddingSize),

  // Official llama-swap binary management
  downloadOfficialBinary: () => ipcRenderer.invoke('download-official-llama-swap'),
  checkForUpdates: () => ipcRenderer.invoke('check-llama-swap-updates'),
  updateToLatest: () => ipcRenderer.invoke('update-llama-swap'),
  getVersion: () => ipcRenderer.invoke('get-llama-swap-version'),

  // NEW: Configuration override API methods
  getAvailableBackends: () => ipcRenderer.invoke('get-available-backends'),
  setBackendOverride: (backendId) => ipcRenderer.invoke('set-backend-override', backendId),
  getBackendOverride: () => ipcRenderer.invoke('get-backend-override'),
  getConfigAsJson: () => ipcRenderer.invoke('get-config-as-json'),
  forceReconfigure: () => ipcRenderer.invoke('force-reconfigure'),
  getConfigurationInfo: () => ipcRenderer.invoke('get-configuration-info'),
  restartWithOverrides: () => ipcRenderer.invoke('restart-llamaswap-with-overrides'),
  
  // NEW: Configuration saving and management
  saveConfigFromJson: (jsonConfig) => ipcRenderer.invoke('save-config-from-json', jsonConfig),
  
  // NEW: LLaMA Optimizer
  runLlamaOptimizer: (preset) => ipcRenderer.invoke('run-llama-optimizer', preset),
  saveConfigAndRestart: (jsonConfig) => ipcRenderer.invoke('save-config-and-restart', jsonConfig),
  regenerateConfig: () => ipcRenderer.invoke('regenerate-config'),
  
  // NEW: Model configuration management
  getModelConfigurations: () => ipcRenderer.invoke('get-model-configurations'),
  saveModelConfiguration: (modelName, modelConfig) => ipcRenderer.invoke('save-model-configuration', modelName, modelConfig),
  saveAllModelConfigurations: (modelConfigs) => ipcRenderer.invoke('save-all-model-configurations', modelConfigs)
});

// Add model management API
contextBridge.exposeInMainWorld('modelManager', {
  searchHuggingFaceModels: (query, limit, sort) => ipcRenderer.invoke('search-huggingface-models', { query, limit, sort }),
  downloadModel: (modelId, fileName, downloadPath) => ipcRenderer.invoke('download-huggingface-model', { modelId, fileName, downloadPath }),
  downloadModelWithCustomName: (modelId, fileName, customSaveName, downloadPath) => ipcRenderer.invoke('download-huggingface-model-with-custom-name', { modelId, fileName, customSaveName, downloadPath }),
  downloadModelWithDependencies: (modelId, fileName, allFiles, downloadPath) => ipcRenderer.invoke('download-model-with-dependencies', { modelId, fileName, allFiles, downloadPath }),
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  deleteLocalModel: (filePath) => ipcRenderer.invoke('delete-local-model', { filePath }),
  stopDownload: (fileName) => ipcRenderer.invoke('stop-download', { fileName }),
  
  // LlamaSwap service restart for applying mmproj configuration changes
  restartLlamaSwap: () => ipcRenderer.invoke('restart-llamaswap'),
  
  // Mmproj mapping persistence
  saveMmprojMappings: (mappings) => ipcRenderer.invoke('save-mmproj-mappings', mappings),
  loadMmprojMappings: () => ipcRenderer.invoke('load-mmproj-mappings'),
  getAvailableMmprojFiles: () => ipcRenderer.invoke('get-available-mmproj-files'),
  
  // Listen for download progress updates
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },

  // Model Manager APIs
  searchCivitAI: (query, types, sort, apiKey, nsfw) => ipcRenderer.invoke('model-manager:search-civitai', { query, types, sort, apiKey, nsfw }),
  searchHuggingFace: (query, modelType, author) => ipcRenderer.invoke('model-manager:search-huggingface', { query, modelType, author }),
  downloadModelFile: (url, filename, modelType, source) => ipcRenderer.invoke('model-manager:download-model', { url, filename, modelType, source }),
  getLocalModelFiles: () => ipcRenderer.invoke('model-manager:get-local-models'),
  deleteLocalModelFile: (modelType, filename) => ipcRenderer.invoke('model-manager:delete-local-model', { modelType, filename }),
  saveApiKeys: (keys) => ipcRenderer.invoke('model-manager:save-api-keys', keys),
  getApiKeys: () => ipcRenderer.invoke('model-manager:get-api-keys'),
  
  // ComfyUI Model Manager APIs (Host-based)
  comfyuiDownloadModel: (url, filename, modelType, source, apiKey) => 
    ipcRenderer.invoke('comfyui-model-manager:download-model', { url, filename, modelType, source, apiKey }),
  comfyuiGetLocalModels: () => ipcRenderer.invoke('comfyui-model-manager:get-local-models'),
  comfyuiDeleteModel: (modelType, filename) => ipcRenderer.invoke('comfyui-model-manager:delete-model', { modelType, filename }),
  comfyuiGetModelsDir: () => ipcRenderer.invoke('comfyui-model-manager:get-models-dir'),

  // ComfyUI Internal Model Manager APIs (Container-based)
  comfyuiInternalListModels: (category) => ipcRenderer.invoke('comfyui-internal:list-models', category),
  comfyuiInternalGetStorageInfo: () => ipcRenderer.invoke('comfyui-internal:get-storage-info'),
  comfyuiInternalDownloadModel: (url, filename, category) => 
    ipcRenderer.invoke('comfyui-internal:download-model', { url, filename, category }),
  comfyuiInternalRemoveModel: (filename, category) => 
    ipcRenderer.invoke('comfyui-internal:remove-model', { filename, category }),
  comfyuiInternalGetStatus: () => ipcRenderer.invoke('comfyui-internal:get-status'),
  comfyuiInternalSearchModels: (query, source, category) => 
    ipcRenderer.invoke('comfyui-internal:search-models', { query, source, category }),
  comfyuiInternalBackupModels: (category, backupPath) => 
    ipcRenderer.invoke('comfyui-internal:backup-models', { category, backupPath }),
  
  // ComfyUI Download Progress Events (Host-based)
  onComfyUIDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-model-download-progress', subscription);
    return () => ipcRenderer.removeListener('comfyui-model-download-progress', subscription);
  },
  onComfyUIDownloadComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-model-download-complete', subscription);
    return () => ipcRenderer.removeListener('comfyui-model-download-complete', subscription);
  },

  // ComfyUI Internal Download Progress Events (Container-based)
  onComfyUIInternalDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-download-progress', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-download-progress', subscription);
  },
  onComfyUIInternalDownloadStart: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-download-start', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-download-start', subscription);
  },
  onComfyUIInternalDownloadComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-download-complete', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-download-complete', subscription);
  },
  onComfyUIInternalDownloadError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-download-error', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-download-error', subscription);
  },
  onComfyUIInternalInstallStart: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-install-start', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-install-start', subscription);
  },
  onComfyUIInternalInstallComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-install-complete', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-install-complete', subscription);
  },
  onComfyUIInternalInstallError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-internal-install-error', subscription);
    return () => ipcRenderer.removeListener('comfyui-internal-install-error', subscription);
  },

  // ==============================================
  // Enhanced Local Model Management APIs
  // ==============================================
  
  // Local persistent model management
  comfyuiLocalListModels: (category) => ipcRenderer.invoke('comfyui-local:list-models', category),
  comfyuiLocalDownloadModel: (url, filename, category, apiKey, source) => 
    ipcRenderer.invoke('comfyui-local:download-model', { url, filename, category, apiKey, source }),
  comfyuiLocalDeleteModel: (filename, category) => 
    ipcRenderer.invoke('comfyui-local:delete-model', { filename, category }),
  comfyuiLocalImportModel: (externalPath, filename, category) => 
    ipcRenderer.invoke('comfyui-local:import-model', { externalPath, filename, category }),
  comfyuiLocalGetStorageInfo: () => ipcRenderer.invoke('comfyui-local:get-storage-info'),

  // Local model management events
  onComfyUILocalDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-local-download-progress', subscription);
    return () => ipcRenderer.removeListener('comfyui-local-download-progress', subscription);
  },
  onComfyUILocalDownloadComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-local-download-complete', subscription);
    return () => ipcRenderer.removeListener('comfyui-local-download-complete', subscription);
  },
  onComfyUILocalDownloadError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('comfyui-local-download-error', subscription);
    return () => ipcRenderer.removeListener('comfyui-local-download-error', subscription);
  },
  onModelDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('model-download-progress', subscription);
    return () => ipcRenderer.removeListener('model-download-progress', subscription);
  }
});

// Add MCP service API
contextBridge.exposeInMainWorld('mcpService', {
  getServers: () => ipcRenderer.invoke('mcp-get-servers'),
  addServer: (serverConfig) => ipcRenderer.invoke('mcp-add-server', serverConfig),
  removeServer: (name) => ipcRenderer.invoke('mcp-remove-server', name),
  updateServer: (name, updates) => ipcRenderer.invoke('mcp-update-server', name, updates),
  startServer: (name) => ipcRenderer.invoke('mcp-start-server', name),
  stopServer: (name) => ipcRenderer.invoke('mcp-stop-server', name),
  restartServer: (name) => ipcRenderer.invoke('mcp-restart-server', name),
  getServerStatus: (name) => ipcRenderer.invoke('mcp-get-server-status', name),
  testServer: (name) => ipcRenderer.invoke('mcp-test-server', name),
  getTemplates: () => ipcRenderer.invoke('mcp-get-templates'),
  startAllEnabled: () => ipcRenderer.invoke('mcp-start-all-enabled'),
  stopAll: () => ipcRenderer.invoke('mcp-stop-all'),
  startPreviouslyRunning: () => ipcRenderer.invoke('mcp-start-previously-running'),
  saveRunningState: () => ipcRenderer.invoke('mcp-save-running-state'),
  importClaudeConfig: (configPath) => ipcRenderer.invoke('mcp-import-claude-config', configPath),
  executeToolCall: (toolCall) => ipcRenderer.invoke('mcp-execute-tool', toolCall),
  diagnoseNode: () => ipcRenderer.invoke('mcp-diagnose-node')
});

// Add window management API
contextBridge.exposeInMainWorld('windowManager', {
  getFullscreenStartupPreference: () => ipcRenderer.invoke('get-fullscreen-startup-preference'),
  setFullscreenStartupPreference: (enabled) => ipcRenderer.invoke('set-fullscreen-startup-preference', enabled),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  getFullscreenStatus: () => ipcRenderer.invoke('get-fullscreen-status')
});

// Add feature configuration API
contextBridge.exposeInMainWorld('featureConfig', {
  getFeatureConfig: () => ipcRenderer.invoke('get-feature-config'),
  updateFeatureConfig: (config) => ipcRenderer.invoke('update-feature-config', config),
  resetFeatureConfig: () => ipcRenderer.invoke('reset-feature-config')
});

// Add developer logs API
contextBridge.exposeInMainWorld('developerLogs', {
  readLogs: (lines = 1000) => ipcRenderer.invoke('developer-logs:read', lines),
  getLogFiles: () => ipcRenderer.invoke('developer-logs:get-files'),
  clearLogs: () => ipcRenderer.invoke('developer-logs:clear')
});

// Add screen sharing API for Electron
contextBridge.exposeInMainWorld('electronScreenShare', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  getScreenAccessStatus: () => ipcRenderer.invoke('get-screen-access-status'),
  requestScreenAccess: () => ipcRenderer.invoke('request-screen-access')
});

// Notify main process when preload script has loaded
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('app-ready', 'Preload script has loaded');
});