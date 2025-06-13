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
  'react-app-ready',
  'app-close',
  'setup-status',
  'backend-status',
  'python-status',
  'update-available',
  'update-downloaded',
  'download-progress',
  'llama-progress-update',
  'llama-progress-complete',
  'watchdog-service-restored',
  'watchdog-service-failed',
  'watchdog-service-restarted',
  'docker-update-progress',
  'set-startup-settings'
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

  // Docker Container Updates
  checkDockerUpdates: () => ipcRenderer.invoke('docker-check-updates'),
  updateDockerContainers: (containerNames) => ipcRenderer.invoke('docker-update-containers', containerNames),
  getSystemInfo: () => ipcRenderer.invoke('docker-get-system-info'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  
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
  }
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
  scanCustomPathModels: (path) => ipcRenderer.invoke('scan-custom-path-models', path)
});

// Add model management API
contextBridge.exposeInMainWorld('modelManager', {
  searchHuggingFaceModels: (query, limit) => ipcRenderer.invoke('search-huggingface-models', { query, limit }),
  downloadModel: (modelId, fileName, downloadPath) => ipcRenderer.invoke('download-huggingface-model', { modelId, fileName, downloadPath }),
  downloadModelWithDependencies: (modelId, fileName, allFiles, downloadPath) => ipcRenderer.invoke('download-model-with-dependencies', { modelId, fileName, allFiles, downloadPath }),
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  deleteLocalModel: (filePath) => ipcRenderer.invoke('delete-local-model', { filePath }),
  stopDownload: (fileName) => ipcRenderer.invoke('stop-download', { fileName }),
  
  // Listen for download progress updates
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
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

// Add startup settings API
contextBridge.exposeInMainWorld('startupSettings', {
  setStartupSettings: (settings) => ipcRenderer.send('set-startup-settings', settings),
  getStartupSettings: () => ipcRenderer.invoke('get-startup-settings')
});

// Notify main process when preload script has loaded
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('app-ready', 'Preload script has loaded');
});