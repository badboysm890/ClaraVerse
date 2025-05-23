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
  'setup-status',
  'backend-status',
  'python-status',
  'update-available',
  'update-downloaded',
  'download-progress',
  'restartInterpreterContainer'
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

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
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
  receive: (channel, func) => {
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    return () => {};
  },
  removeListener: (channel, func) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },
  removeAllListeners: (channel) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  getWorkflowsPath: () => ipcRenderer.invoke('getWorkflowsPath'),
  // Ensure this handler is properly exposed with explicit error handling
  restartInterpreterContainer: async () => {
    console.log('Invoking restartInterpreterContainer from preload...');
    try {
      const result = await ipcRenderer.invoke('restartInterpreterContainer');
      console.log('restartInterpreterContainer result:', result);
      return result;
    } catch (error) {
      console.error('Error in restartInterpreterContainer:', error);
      throw error;
    }
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
    ipcRenderer.invoke('get-container-logs', containerId)
});

// Add llama-swap service API
contextBridge.exposeInMainWorld('llamaSwap', {
  start: () => ipcRenderer.invoke('start-llama-swap'),
  stop: () => ipcRenderer.invoke('stop-llama-swap'),
  restart: () => ipcRenderer.invoke('restart-llama-swap'),
  getStatus: () => ipcRenderer.invoke('get-llama-swap-status'),
  getModels: () => ipcRenderer.invoke('get-llama-swap-models'),
  getApiUrl: () => ipcRenderer.invoke('get-llama-swap-api-url'),
  regenerateConfig: () => ipcRenderer.invoke('regenerate-llama-swap-config'),
  debugBinaryPaths: () => ipcRenderer.invoke('debug-binary-paths')
});

// Add model management API
contextBridge.exposeInMainWorld('modelManager', {
  searchHuggingFaceModels: (query, limit) => ipcRenderer.invoke('search-huggingface-models', { query, limit }),
  downloadModel: (modelId, fileName) => ipcRenderer.invoke('download-huggingface-model', { modelId, fileName }),
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

// Notify main process when preload script has loaded
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('app-ready', 'Preload script has loaded');
});