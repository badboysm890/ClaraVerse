const { app, BrowserWindow, ipcMain, dialog, systemPreferences, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsSync = require('fs');
const log = require('electron-log');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const { spawn } = require('child_process');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater, checkForUpdates, getUpdateInfo, checkLlamacppUpdates, updateLlamacppBinaries } = require('./updateService.cjs');
const SplashScreen = require('./splash.cjs');
const LoadingScreen = require('./loadingScreen.cjs');
const { createAppMenu } = require('./menu.cjs');
const LlamaSwapService = require('./llamaSwapService.cjs');
const MCPService = require('./mcpService.cjs');
const WatchdogService = require('./watchdogService.cjs');
const ComfyUIModelService = require('./comfyUIModelService.cjs');
const { platformUpdateService } = require('./updateService.cjs');
const { debugPaths, logDebugInfo } = require('./debug-paths.cjs');
const SetupConfigService = require('./setupConfigService.cjs');

/**
 * Helper function to show dialogs properly during startup when loading screen is active
 * Temporarily disables alwaysOnTop to allow dialogs to appear above loading screen
 */
async function showStartupDialog(loadingScreen, dialogType, title, message, buttons = ['OK']) {
  // Temporarily disable alwaysOnTop for loading screen
  if (loadingScreen) {
    loadingScreen.setAlwaysOnTop(false);
  }
  
  try {
    // Show dialog with proper window options
    const result = await dialog.showMessageBox(loadingScreen ? loadingScreen.window : null, {
      type: dialogType,
      title: title,
      message: message,
      buttons: buttons,
      alwaysOnTop: true,
      modal: true
    });
    return result;
  } finally {
    // Re-enable alwaysOnTop for loading screen
    if (loadingScreen) {
      loadingScreen.setAlwaysOnTop(true);
    }
  }
}

// Configure the main process logger
log.transports.file.level = 'info';
log.info('Application starting...');

// macOS Security Configuration - Prevent unnecessary firewall prompts
if (process.platform === 'darwin') {
  // Request network permissions early if needed
  try {
    const hasNetworkAccess = systemPreferences.getMediaAccessStatus('microphone') === 'granted';
    if (!hasNetworkAccess) {
      log.info('Preparing network access permissions for local AI services...');
    }
  } catch (error) {
    log.warn('Could not check network permissions:', error);
  }
}

// Global variables
let mainWindow;
let splash;
let loadingScreen;
let dockerSetup;
let llamaSwapService;
let mcpService;
let watchdogService;
let updateService;
let comfyUIModelService;
let setupConfigService; // Added for brand configuration

// Track active downloads for stop functionality
const activeDownloads = new Map();

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Register Docker container management IPC handlers
function registerDockerContainerHandlers() {
  // Get all containers
  ipcMain.handle('get-containers', async () => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        log.error('Docker setup not initialized');
        return [];
      }
      
      const docker = dockerSetup.docker;
      const containers = await docker.listContainers({ all: true });
      
      return containers.map((container) => {
        const ports = container.Ports.map((p) => 
          p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : `${p.PrivatePort}`
        );
        
        return {
          id: container.Id,
          name: container.Names[0].replace(/^\//, ''),
          image: container.Image,
          status: container.Status,
          state: container.State === 'running' ? 'running' : 
                 container.State === 'exited' ? 'stopped' : container.State,
          ports: ports,
          created: new Date(container.Created * 1000).toLocaleString()
        };
      });
    } catch (error) {
      log.error('Error listing containers:', error);
      return [];
    }
  });

  // Container actions (start, stop, restart, remove)
  ipcMain.handle('container-action', async (_event, { containerId, action }) => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        log.error('Docker setup not initialized');
        throw new Error('Docker setup not initialized');
      }
      
      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);
      
      switch (action) {
        case 'start':
          await container.start();
          break;
        case 'stop':
          await container.stop();
          break;
        case 'restart':
          await container.restart();
          break;
        case 'remove':
          await container.remove({ force: true });
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      return { success: true };
    } catch (error) {
      log.error(`Error performing action ${action} on container:`, error);
      return { success: false, error: error.message };
    }
  });

  // Create new container
  ipcMain.handle('create-container', async (_event, containerConfig) => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        log.error('Docker setup not initialized');
        throw new Error('Docker setup not initialized');
      }
      
      const docker = dockerSetup.docker;
      
      // Format ports for Docker API
      const portBindings = {};
      const exposedPorts = {};
      
      containerConfig.ports.forEach((port) => {
        const containerPort = `${port.container}/tcp`;
        exposedPorts[containerPort] = {};
        portBindings[containerPort] = [{ HostPort: port.host.toString() }];
      });
      
      // Format volumes for Docker API
      const binds = containerConfig.volumes.map((volume) => 
        `${volume.host}:${volume.container}`
      );
      
      // Format environment variables
      const env = Object.entries(containerConfig.env || {}).map(([key, value]) => `${key}=${value}`);
      
      // Create container
      const container = await docker.createContainer({
        Image: containerConfig.image,
        name: containerConfig.name,
        ExposedPorts: exposedPorts,
        Env: env,
        HostConfig: {
          PortBindings: portBindings,
          Binds: binds,
          NetworkMode: 'clara_network'
        }
      });
      
      // Start the container
      await container.start();
      
      return { success: true, id: container.id };
    } catch (error) {
      log.error('Error creating container:', error);
      return { success: false, error: error.message };
    }
  });

  // Get container stats
  ipcMain.handle('get-container-stats', async (_event, containerId) => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        log.error('Docker setup not initialized');
        throw new Error('Docker setup not initialized');
      }
      
      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);
      
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemCpuDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuCount = stats.cpu_stats.online_cpus || 1;
      const cpuPercent = (cpuDelta / systemCpuDelta) * cpuCount * 100;
      
      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 1;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;
      
      // Format network I/O
      let networkRx = 0;
      let networkTx = 0;
      
      if (stats.networks) {
        Object.keys(stats.networks).forEach(iface => {
          networkRx += stats.networks[iface].rx_bytes || 0;
          networkTx += stats.networks[iface].tx_bytes || 0;
        });
      }
      
      return {
        cpu: `${cpuPercent.toFixed(2)}%`,
        memory: `${formatBytes(memoryUsage)} / ${formatBytes(memoryLimit)} (${memoryPercent.toFixed(2)}%)`,
        network: `↓ ${formatBytes(networkRx)} / ↑ ${formatBytes(networkTx)}`
      };
    } catch (error) {
      log.error('Error getting container stats:', error);
      return { cpu: 'N/A', memory: 'N/A', network: 'N/A' };
    }
  });

  // Get container logs
  ipcMain.handle('get-container-logs', async (_event, containerId) => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        log.error('Docker setup not initialized');
        throw new Error('Docker setup not initialized');
      }
      
      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);
      
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        follow: false
      });
      
      return logs.toString();
    } catch (error) {
      log.error('Error getting container logs:', error);
      return '';
    }
  });
}

// Register llama-swap service IPC handlers
function registerLlamaSwapHandlers() {
  // Start llama-swap service
  ipcMain.handle('start-llama-swap', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.start();
      return { 
        success: result.success, 
        message: result.message,
        error: result.error,
        warning: result.warning,
        diagnostics: result.diagnostics,
        status: llamaSwapService.getStatus() 
      };
    } catch (error) {
      log.error('Error starting llama-swap service:', error);
      return { success: false, error: error.message };
    }
  });

  // Stop llama-swap service
  ipcMain.handle('stop-llama-swap', async () => {
    try {
      if (llamaSwapService) {
        await llamaSwapService.stop();
      }
      return { success: true };
    } catch (error) {
      log.error('Error stopping llama-swap service:', error);
      return { success: false, error: error.message };
    }
  });

  // Restart llama-swap service
  ipcMain.handle('restart-llama-swap', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.restart();
      return { 
        success: result.success || true, // restart returns boolean for now
        message: result.message || 'Service restarted',
        status: llamaSwapService.getStatus() 
      };
    } catch (error) {
      log.error('Error restarting llama-swap service:', error);
      return { success: false, error: error.message };
    }
  });

  // Get llama-swap service status
  ipcMain.handle('get-llama-swap-status', async () => {
    try {
      if (!llamaSwapService) {
        return { isRunning: false, port: null, apiUrl: null };
      }
      
      return llamaSwapService.getStatus();
    } catch (error) {
      log.error('Error getting llama-swap status:', error);
      return { isRunning: false, port: null, apiUrl: null, error: error.message };
    }
  });

  // Get llama-swap service status with health check
  ipcMain.handle('get-llama-swap-status-with-health', async () => {
    try {
      if (!llamaSwapService) {
        return { isRunning: false, port: null, apiUrl: null };
      }
      
      return await llamaSwapService.getStatusWithHealthCheck();
    } catch (error) {
      log.error('Error getting llama-swap status with health check:', error);
      return { isRunning: false, port: null, apiUrl: null, error: error.message };
    }
  });

  // Get available models from llama-swap
  ipcMain.handle('get-llama-swap-models', async () => {
    try {
      if (!llamaSwapService) {
        return [];
      }
      
      return await llamaSwapService.getModels();
    } catch (error) {
      log.error('Error getting llama-swap models:', error);
      return [];
    }
  });

  // Get llama-swap API URL
  ipcMain.handle('get-llama-swap-api-url', async () => {
    try {
      if (llamaSwapService && llamaSwapService.isRunning) {
        return llamaSwapService.getApiUrl();
      }
      return null;
    } catch (error) {
      log.error('Error getting llama-swap API URL:', error);
      return null;
    }
  });

  // Regenerate config (useful when new models are added)
  ipcMain.handle('regenerate-llama-swap-config', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.generateConfig();
      return { success: true, ...result };
    } catch (error) {
      log.error('Error regenerating llama-swap config:', error);
      return { success: false, error: error.message };
    }
  });

  // Debug binary paths (useful for troubleshooting production builds)
  ipcMain.handle('debug-binary-paths', async () => {
    try {
      const debugInfo = debugPaths();
      logDebugInfo(); // Also log to electron-log
      return { success: true, debugInfo };
    } catch (error) {
      log.error('Error debugging binary paths:', error);
      return { success: false, error: error.message };
    }
  });

  // Get GPU diagnostics information
  ipcMain.handle('get-gpu-diagnostics', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const diagnostics = await llamaSwapService.getGPUDiagnostics();
      return { success: true, ...diagnostics };
    } catch (error) {
      log.error('Error getting GPU diagnostics:', error);
      return { success: false, error: error.message };
    }
  });

  // Get performance settings
  ipcMain.handle('get-performance-settings', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.getPerformanceSettings();
      return result;
    } catch (error) {
      log.error('Error getting performance settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Save performance settings
  ipcMain.handle('save-performance-settings', async (event, settings) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.savePerformanceSettings(settings);
      return result;
    } catch (error) {
      log.error('Error saving performance settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Load performance settings
  ipcMain.handle('load-performance-settings', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const result = await llamaSwapService.loadPerformanceSettings();
      return result;
    } catch (error) {
      log.error('Error loading performance settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Custom model path handlers
  ipcMain.handle('set-custom-model-path', async (event, customPath) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      // Save to file-based storage for persistence across app restarts
      try {
        const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
        let settings = {};
        
        // Load existing settings if file exists
        if (fsSync.existsSync(settingsPath)) {
          try {
            settings = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
          } catch (parseError) {
            log.warn('Could not parse existing settings file, creating new one:', parseError.message);
            settings = {};
          }
        }
        
        // Update custom model path
        if (customPath) {
          settings.customModelPath = customPath;
          log.info('Saving custom model path to settings:', customPath);
        } else {
          delete settings.customModelPath;
          log.info('Removing custom model path from settings');
        }
        
        // Save updated settings
        fsSync.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      } catch (settingsError) {
        log.warn('Could not save custom model path to settings:', settingsError.message);
        // Continue anyway - the in-memory setting will still work for this session
      }
      
      // Set the custom path in llama-swap service
      if (customPath) {
        llamaSwapService.setCustomModelPaths([customPath]);
      } else {
        // Clear custom paths when path is null/empty
        llamaSwapService.setCustomModelPaths([]);
      }
      
      // Regenerate config to include/exclude models
      await llamaSwapService.generateConfig();
      
      return { success: true };
    } catch (error) {
      log.error('Error setting custom model path:', error);
      return { success: false, error: error.message };
    }
  });
  // Watchdog service handlers
  ipcMain.handle('watchdog-get-services-status', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      return { success: true, services: watchdogService.getServicesStatus() };
    } catch (error) {
      log.error('Error getting watchdog services status:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('watchdog-get-overall-health', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      return { success: true, health: watchdogService.getOverallHealth() };
    } catch (error) {
      log.error('Error getting overall health:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('watchdog-perform-manual-health-check', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      const status = await watchdogService.performManualHealthCheck();
      return { success: true, services: status };
    } catch (error) {
      log.error('Error performing manual health check:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('watchdog-update-config', async (event, newConfig) => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      watchdogService.updateConfig(newConfig);
      return { success: true };
    } catch (error) {
      log.error('Error updating watchdog config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-custom-model-paths', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      let paths = llamaSwapService.getCustomModelPaths();
      
      // If no paths in service, try to load from file storage
      if (paths.length === 0) {
        try {
          const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
          if (fsSync.existsSync(settingsPath)) {
            const settings = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
            if (settings.customModelPath) {
              // Validate that the path still exists before returning it
              if (fsSync.existsSync(settings.customModelPath)) {
                paths = [settings.customModelPath];
                // Also set it in the service for consistency
                llamaSwapService.setCustomModelPaths(paths);
              } else {
                log.warn('Custom model path from settings no longer exists:', settings.customModelPath);
              }
            }
          }
        } catch (fileError) {
          log.warn('Could not read custom model path from file storage:', fileError.message);
        }
      }
      
      return paths;
    } catch (error) {
      log.error('Error getting custom model paths:', error);
      return [];
    }
  });

  ipcMain.handle('scan-custom-path-models', async (event, path) => {
    try {
      if (!path) {
        return { success: false, error: 'No path provided' };
      }

      // Create a temporary service instance to scan the specific path
      const fs = require('fs').promises;
      const pathModule = require('path');
      
      const models = [];
      
      try {
        if (await fs.access(path).then(() => true).catch(() => false)) {
          const files = await fs.readdir(path);
          const ggufFiles = files.filter(file => file.endsWith('.gguf'));
          
          for (const file of ggufFiles) {
            const fullPath = pathModule.join(path, file);
            try {
              const stats = await fs.stat(fullPath);
              
              models.push({
                name: file.replace('.gguf', ''),
                file: file,
                path: fullPath,
                size: stats.size,
                source: 'custom',
                lastModified: stats.mtime
              });
            } catch (error) {
              log.warn(`Error reading stats for ${file}:`, error);
            }
          }
        }
      } catch (error) {
        log.warn(`Error scanning models in ${path}:`, error);
        return { success: false, error: error.message };
      }

      return { success: true, models };
    } catch (error) {
      log.error('Error scanning custom path models:', error);
    }
  });

  ipcMain.handle('watchdog-reset-failure-counts', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      watchdogService.resetFailureCounts();
      return { success: true };
    } catch (error) {
      log.error('Error resetting failure counts:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('watchdog-start', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      watchdogService.start();
      return { success: true };
    } catch (error) {
      log.error('Error starting watchdog:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('watchdog-stop', async () => {
    try {
      if (!watchdogService) {
        return { success: false, error: 'Watchdog service not initialized' };
      }
      
      watchdogService.stop();
      return { success: true };
    } catch (error) {
      log.error('Error stopping watchdog:', error);
      return { success: false, error: error.message };
    }
  });
}

function registerModelManagerHandlers() {
  // Helper functions for vision model detection
  function isVisionModel(model) {
    const visionKeywords = ['vl', 'vision', 'multimodal', 'mm', 'clip', 'siglip'];
    const modelText = `${model.modelId} ${model.description || ''}`.toLowerCase();
    return visionKeywords.some(keyword => modelText.includes(keyword));
  }

  function findRequiredMmprojFiles(siblings) {
    return siblings.filter(file => 
      file.rfilename.toLowerCase().includes('mmproj') ||
      file.rfilename.toLowerCase().includes('mm-proj') ||
      file.rfilename.toLowerCase().includes('projection')
    );
  }

  function isVisionModelByName(fileName) {
    const visionKeywords = ['vl', 'vision', 'multimodal', 'mm', 'clip', 'siglip'];
    return visionKeywords.some(keyword => fileName.toLowerCase().includes(keyword));
  }

  function findBestMmprojMatch(modelFileName, mmprojFiles) {
    const modelBaseName = modelFileName
      .replace('.gguf', '')
      .replace(/-(q4_k_m|q4_k_s|q8_0|f16|instruct).*$/i, '')
      .toLowerCase();
    
    // Look for exact matches first
    for (const mmproj of mmprojFiles) {
      const mmprojBaseName = mmproj.rfilename
        .replace(/-(mmproj|mm-proj|projection).*$/i, '')
        .toLowerCase();
      
      if (modelBaseName.includes(mmprojBaseName) || mmprojBaseName.includes(modelBaseName)) {
        return mmproj;
      }
    }
    
    // If no exact match, return the first available mmproj file
    return mmprojFiles[0];
  }

  async function downloadSingleFile(modelId, fileName, modelsDir) {
    const fs = require('fs');
    const https = require('https');
    const http = require('http');
    const path = require('path');
    
    const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${fileName}`;
    const filePath = path.join(modelsDir, fileName);
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'File already exists' };
    }
    
    log.info(`Starting download: ${downloadUrl} -> ${filePath}`);
    
    return new Promise((resolve) => {
      const protocol = downloadUrl.startsWith('https:') ? https : http;
      const file = fs.createWriteStream(filePath);
      let stopped = false;
      
      // Store download info for stop functionality
      const downloadInfo = {
        request: null,
        file,
        filePath,
        stopped: false
      };
      activeDownloads.set(fileName, downloadInfo);
      
      const cleanup = () => {
        activeDownloads.delete(fileName);
        if (file && !file.destroyed) {
          file.close();
        }
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (cleanupError) {
            log.warn('Error cleaning up file:', cleanupError);
          }
        }
      };
      
      const request = protocol.get(downloadUrl, (response) => {
        downloadInfo.request = request;
        
        if (downloadInfo.stopped) {
          cleanup();
          resolve({ success: false, error: 'Download stopped by user' });
          return;
        }
        
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            const redirectProtocol = redirectUrl.startsWith('https:') ? https : http;
            const redirectRequest = redirectProtocol.get(redirectUrl, (redirectResponse) => {
              downloadInfo.request = redirectRequest;
              
              if (downloadInfo.stopped) {
                cleanup();
                resolve({ success: false, error: 'Download stopped by user' });
                return;
              }
              
              if (redirectResponse.statusCode !== 200) {
                cleanup();
                resolve({ success: false, error: `HTTP ${redirectResponse.statusCode}` });
                return;
              }
              
              const totalSize = parseInt(redirectResponse.headers['content-length'] || '0');
              let downloadedSize = 0;
              
              redirectResponse.pipe(file);
              
              redirectResponse.on('data', (chunk) => {
                if (downloadInfo.stopped) {
                  redirectResponse.destroy();
                  cleanup();
                  resolve({ success: false, error: 'Download stopped by user' });
                  return;
                }
                
                downloadedSize += chunk.length;
                const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
                
                // Send progress update to renderer
                if (mainWindow) {
                  mainWindow.webContents.send('download-progress', {
                    fileName,
                    progress: Math.round(progress),
                    downloadedSize,
                    totalSize
                  });
                }
              });
              
              file.on('finish', () => {
                if (downloadInfo.stopped) {
                  cleanup();
                  resolve({ success: false, error: 'Download stopped by user' });
                  return;
                }
                
                file.close(() => {
                  activeDownloads.delete(fileName);
                  log.info(`Download completed: ${filePath}`);
                  
                  // Send final progress update
                  if (mainWindow) {
                    mainWindow.webContents.send('download-progress', {
                      fileName,
                      progress: 100,
                      downloadedSize: totalSize,
                      totalSize
                    });
                  }
                  
                  resolve({ success: true, filePath });
                });
              });
              
              file.on('error', (error) => {
                cleanup();
                resolve({ success: false, error: error.message });
              });
            });
            
            redirectRequest.on('error', (error) => {
              cleanup();
              resolve({ success: false, error: error.message });
            });
          } else {
            cleanup();
            resolve({ success: false, error: 'Redirect without location header' });
          }
        } else if (response.statusCode !== 200) {
          cleanup();
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
        } else {
          const totalSize = parseInt(response.headers['content-length'] || '0');
          let downloadedSize = 0;
          
          response.pipe(file);
          
          response.on('data', (chunk) => {
            if (downloadInfo.stopped) {
              response.destroy();
              cleanup();
              resolve({ success: false, error: 'Download stopped by user' });
              return;
            }
            
            downloadedSize += chunk.length;
            const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
            
            // Send progress update to renderer
            if (mainWindow) {
              mainWindow.webContents.send('download-progress', {
                fileName,
                progress: Math.round(progress),
                downloadedSize,
                totalSize
              });
            }
          });
          
          file.on('finish', () => {
            if (downloadInfo.stopped) {
              cleanup();
              resolve({ success: false, error: 'Download stopped by user' });
              return;
            }
            
            file.close(() => {
              activeDownloads.delete(fileName);
              log.info(`Download completed: ${filePath}`);
              
              // Send final progress update
              if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                  fileName,
                  progress: 100,
                  downloadedSize: totalSize,
                  totalSize
                });
              }
              
              resolve({ success: true, filePath });
            });
          });
          
          file.on('error', (error) => {
            cleanup();
            resolve({ success: false, error: error.message });
          });
        }
      });
      
      downloadInfo.request = request;
      
      request.on('error', (error) => {
        cleanup();
        resolve({ success: false, error: error.message });
      });
    });
  }

  // Search models from Hugging Face
  ipcMain.handle('search-huggingface-models', async (_event, { query, limit = 20 }) => {
    try {
      // Use Node.js built-in fetch if available (Node 18+), otherwise try node-fetch
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        // Fallback for older Node versions or import issues
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }
      
      const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=${limit}&sort=likes&full=true`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.status}`);
      }
      
      const models = await response.json();
      
      // Filter and format models for GGUF files
      const ggufModels = models.filter(model => 
        model.tags && model.tags.includes('gguf') || 
        model.modelId.toLowerCase().includes('gguf') ||
        (model.siblings && model.siblings.some(file => file.rfilename.endsWith('.gguf')))
      ).map(model => ({
        id: model.modelId || model.id,
        name: model.modelId || model.id,
        downloads: model.downloads || 0,
        likes: model.likes || 0,
        tags: model.tags || [],
        description: model.description || '',
        author: model.author || model.modelId?.split('/')[0] || '',
        // Include ALL files, not just .gguf
        files: model.siblings || [],
        // Add flags for vision models and required mmproj files
        isVisionModel: isVisionModel(model),
        requiredMmprojFiles: findRequiredMmprojFiles(model.siblings || [])
      }));
      
      return { success: true, models: ggufModels };
    } catch (error) {
      log.error('Error searching HuggingFace models:', error);
      return { success: false, error: error.message, models: [] };
    }
  });

  // Enhanced download with dependencies
  ipcMain.handle('download-model-with-dependencies', async (_event, { modelId, fileName, allFiles, downloadPath }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Use custom download path if provided, otherwise use default
      const modelsDir = downloadPath || path.join(os.homedir(), '.clara', 'llama-models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      // Check if this is a vision model
      const isVision = isVisionModelByName(fileName);
      
      // Find required mmproj files
      const mmprojFiles = allFiles.filter(file => 
        file.rfilename.toLowerCase().includes('mmproj') ||
        file.rfilename.toLowerCase().includes('mm-proj') ||
        file.rfilename.toLowerCase().includes('projection')
      );
      
      const filesToDownload = [fileName];
      
      // If it's a vision model and mmproj files exist, add them
      if (isVision && mmprojFiles.length > 0) {
        // Find the best matching mmproj file
        const matchingMmproj = findBestMmprojMatch(fileName, mmprojFiles);
        if (matchingMmproj) {
          filesToDownload.push(matchingMmproj.rfilename);
          log.info(`Vision model detected, will also download: ${matchingMmproj.rfilename}`);
        }
      }
      
      // Download all required files
      const results = [];
      for (const file of filesToDownload) {
        try {
          const result = await downloadSingleFile(modelId, file, modelsDir);
          results.push({ file, success: result.success, error: result.error });
        } catch (error) {
          results.push({ file, success: false, error: error.message });
        }
      }
      
      // Check if main model downloaded successfully
      const mainResult = results.find(r => r.file === fileName);
      if (mainResult?.success) {
        // Restart llama-swap service to load new models
        try {
          if (llamaSwapService && llamaSwapService.getStatus().isRunning) {
            log.info('Restarting llama-swap service to load new models...');
            await llamaSwapService.restart();
            log.info('llama-swap service restarted successfully');
          }
        } catch (restartError) {
          log.warn('Failed to restart llama-swap service after download:', restartError);
        }
      }
      
      return { 
        success: mainResult?.success || false, 
        results,
        downloadedFiles: results.filter(r => r.success).map(r => r.file)
      };
      
    } catch (error) {
      log.error('Error downloading model with dependencies:', error);
      return { success: false, error: error.message };
    }
  });

  // Download model from Hugging Face
  ipcMain.handle('download-huggingface-model', async (_event, { modelId, fileName, downloadPath }) => {
    try {
      const fs = require('fs');
      const https = require('https');
      const http = require('http');
      const path = require('path');
      const os = require('os');
      
      // Use custom download path if provided, otherwise use default
      const modelsDir = downloadPath || path.join(os.homedir(), '.clara', 'llama-models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${fileName}`;
      const filePath = path.join(modelsDir, fileName);
      
      // Check if file already exists
      if (fs.existsSync(filePath)) {
        return { success: false, error: 'File already exists' };
      }
      
      log.info(`Starting download: ${downloadUrl} -> ${filePath}`);
      
      return new Promise((resolve) => {
        const protocol = downloadUrl.startsWith('https:') ? https : http;
        const file = fs.createWriteStream(filePath);
        let request;
        let stopped = false;
        
        // Store download info for stop functionality
        const downloadInfo = {
          request: null,
          file,
          filePath,
          stopped: false
        };
        activeDownloads.set(fileName, downloadInfo);
        
        const cleanup = () => {
          activeDownloads.delete(fileName);
          if (file && !file.destroyed) {
            file.close();
          }
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (cleanupError) {
              log.warn('Error cleaning up file:', cleanupError);
            }
          }
        };
        
        request = protocol.get(downloadUrl, (response) => {
          downloadInfo.request = request;
          
          if (downloadInfo.stopped) {
            cleanup();
            resolve({ success: false, error: 'Download stopped by user' });
            return;
          }
          
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirect
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              const redirectProtocol = redirectUrl.startsWith('https:') ? https : http;
              const redirectRequest = redirectProtocol.get(redirectUrl, (redirectResponse) => {
                downloadInfo.request = redirectRequest;
                
                if (downloadInfo.stopped) {
                  cleanup();
                  resolve({ success: false, error: 'Download stopped by user' });
                  return;
                }
                
                if (redirectResponse.statusCode !== 200) {
                  cleanup();
                  resolve({ success: false, error: `HTTP ${redirectResponse.statusCode}` });
                  return;
                }
                
                const totalSize = parseInt(redirectResponse.headers['content-length'] || '0');
                let downloadedSize = 0;
                
                redirectResponse.pipe(file);
                
                redirectResponse.on('data', (chunk) => {
                  if (downloadInfo.stopped) {
                    redirectResponse.destroy();
                    cleanup();
                    resolve({ success: false, error: 'Download stopped by user' });
                    return;
                  }
                  
                  downloadedSize += chunk.length;
                  const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
                  
                  // Send progress update to renderer
                  if (mainWindow) {
                    mainWindow.webContents.send('download-progress', {
                      fileName,
                      progress: Math.round(progress),
                      downloadedSize,
                      totalSize
                    });
                  }
                });
                
                file.on('finish', () => {
                  if (downloadInfo.stopped) {
                    cleanup();
                    resolve({ success: false, error: 'Download stopped by user' });
                    return;
                  }
                  
                  file.close(async () => {
                    activeDownloads.delete(fileName);
                    log.info(`Download completed: ${filePath}`);
                    
                    // Restart llama-swap service to load new models
                    try {
                      if (llamaSwapService && llamaSwapService.getStatus().isRunning) {
                        log.info('Restarting llama-swap service to load new models...');
                        await llamaSwapService.restart();
                        log.info('llama-swap service restarted successfully');
                      }
                    } catch (restartError) {
                      log.warn('Failed to restart llama-swap service after download:', restartError);
                    }
                    
                    resolve({ success: true, filePath });
                  });
                });
              });
              
              redirectRequest.on('error', (error) => {
                cleanup();
                resolve({ success: false, error: error.message });
              });
            } else {
              cleanup();
              resolve({ success: false, error: 'Redirect without location header' });
            }
          } else if (response.statusCode !== 200) {
            cleanup();
            resolve({ success: false, error: `HTTP ${response.statusCode}` });
          } else {
            const totalSize = parseInt(response.headers['content-length'] || '0');
            let downloadedSize = 0;
            
            response.pipe(file);
            
            response.on('data', (chunk) => {
              if (downloadInfo.stopped) {
                response.destroy();
                cleanup();
                resolve({ success: false, error: 'Download stopped by user' });
                return;
              }
              
              downloadedSize += chunk.length;
              const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
              
              // Send progress update to renderer
              if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                  fileName,
                  progress: Math.round(progress),
                  downloadedSize,
                  totalSize
                });
              }
            });
            
            file.on('finish', () => {
              if (downloadInfo.stopped) {
                cleanup();
                resolve({ success: false, error: 'Download stopped by user' });
                return;
              }
              
              file.close(async () => {
                activeDownloads.delete(fileName);
                log.info(`Download completed: ${filePath}`);
                
                // Restart llama-swap service to load new models
                try {
                  if (llamaSwapService && llamaSwapService.getStatus().isRunning) {
                    log.info('Restarting llama-swap service to load new models...');
                    await llamaSwapService.restart();
                    log.info('llama-swap service restarted successfully');
                  }
                } catch (restartError) {
                  log.warn('Failed to restart llama-swap service after download:', restartError);
                }
                
                resolve({ success: true, filePath });
              });
            });
          }
        });
        
        downloadInfo.request = request;
        
        request.on('error', (error) => {
          cleanup();
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      log.error('Error downloading model:', error);
      return { success: false, error: error.message };
    }
  });

  // Stop download
  ipcMain.handle('stop-download', async (_event, { fileName }) => {
    try {
      const downloadInfo = activeDownloads.get(fileName);
      
      if (!downloadInfo) {
        return { success: false, error: 'Download not found or already completed' };
      }
      
      downloadInfo.stopped = true;
      
      // Destroy the request if it exists
      if (downloadInfo.request) {
        downloadInfo.request.destroy();
      }
      
      // Close and cleanup the file
      if (downloadInfo.file && !downloadInfo.file.destroyed) {
        downloadInfo.file.close();
      }
      
      // Remove partial file
      if (downloadInfo.filePath && require('fs').existsSync(downloadInfo.filePath)) {
        try {
          require('fs').unlinkSync(downloadInfo.filePath);
          log.info(`Removed partial download: ${downloadInfo.filePath}`);
        } catch (cleanupError) {
          log.warn('Error removing partial download:', cleanupError);
        }
      }
      
      activeDownloads.delete(fileName);
      log.info(`Download stopped: ${fileName}`);
      
      return { success: true };
    } catch (error) {
      log.error('Error stopping download:', error);
      return { success: false, error: error.message };
    }
  });

  // Get local models
  ipcMain.handle('get-local-models', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService();
      }
      
      const models = await llamaSwapService.scanModels();
      return { success: true, models };
    } catch (error) {
      log.error('Error getting local models:', error);
      return { success: false, error: error.message, models: [] };
    }
  });

  // Delete local model
  ipcMain.handle('delete-local-model', async (_event, { filePath }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Security check - ensure file is in the correct directory
      const modelsDir = path.join(os.homedir(), '.clara', 'llama-models');
      const normalizedPath = path.resolve(filePath);
      const normalizedModelsDir = path.resolve(modelsDir);
      
      if (!normalizedPath.startsWith(normalizedModelsDir)) {
        throw new Error('Invalid file path - security violation');
      }
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log.info(`Deleted model: ${filePath}`);
        
        // Restart llama-swap service to reload models after deletion
        try {
          if (llamaSwapService && llamaSwapService.getStatus().isRunning) {
            log.info('Restarting llama-swap service to reload models after deletion...');
            await llamaSwapService.restart();
            log.info('llama-swap service restarted successfully after model deletion');
          }
        } catch (restartError) {
          log.warn('Failed to restart llama-swap service after model deletion:', restartError);
        }
        
        return { success: true };
      } else {
        return { success: false, error: 'File not found' };
      }
    } catch (error) {
      log.error('Error deleting model:', error);
      return { success: false, error: error.message };
    }
  });
}

// Register MCP service IPC handlers
function registerMCPHandlers() {
  // Get all MCP servers
  ipcMain.handle('mcp-get-servers', async () => {
    try {
      if (!mcpService) {
        return [];
      }
      return mcpService.getAllServers();
    } catch (error) {
      log.error('Error getting MCP servers:', error);
      return [];
    }
  });

  // Add MCP server
  ipcMain.handle('mcp-add-server', async (event, serverConfig) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.addServer(serverConfig);
    } catch (error) {
      log.error('Error adding MCP server:', error);
      throw error;
    }
  });

  // Remove MCP server
  ipcMain.handle('mcp-remove-server', async (event, name) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.removeServer(name);
    } catch (error) {
      log.error('Error removing MCP server:', error);
      throw error;
    }
  });

  // Update MCP server
  ipcMain.handle('mcp-update-server', async (event, name, updates) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.updateServer(name, updates);
    } catch (error) {
      log.error('Error updating MCP server:', error);
      throw error;
    }
  });

  // Start MCP server
  ipcMain.handle('mcp-start-server', async (event, name) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      const serverInfo = await mcpService.startServer(name);
      
      // Return only serializable data, excluding the process object
      return {
        name: serverInfo.name,
        config: serverInfo.config,
        startedAt: serverInfo.startedAt,
        status: serverInfo.status,
        pid: serverInfo.process?.pid
      };
    } catch (error) {
      log.error('Error starting MCP server:', error);
      throw error;
    }
  });

  // Stop MCP server
  ipcMain.handle('mcp-stop-server', async (event, name) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.stopServer(name);
    } catch (error) {
      log.error('Error stopping MCP server:', error);
      throw error;
    }
  });

  // Restart MCP server
  ipcMain.handle('mcp-restart-server', async (event, name) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      const serverInfo = await mcpService.restartServer(name);
      
      // Return only serializable data, excluding the process object
      return {
        name: serverInfo.name,
        config: serverInfo.config,
        startedAt: serverInfo.startedAt,
        status: serverInfo.status,
        pid: serverInfo.process?.pid
      };
    } catch (error) {
      log.error('Error restarting MCP server:', error);
      throw error;
    }
  });

  // Get MCP server status
  ipcMain.handle('mcp-get-server-status', async (event, name) => {
    try {
      if (!mcpService) {
        return null;
      }
      return mcpService.getServerStatus(name);
    } catch (error) {
      log.error('Error getting MCP server status:', error);
      return null;
    }
  });

  // Test MCP server
  ipcMain.handle('mcp-test-server', async (event, name) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.testServer(name);
    } catch (error) {
      log.error('Error testing MCP server:', error);
      return { success: false, error: error.message };
    }
  });

  // Get MCP server templates
  ipcMain.handle('mcp-get-templates', async () => {
    try {
      if (!mcpService) {
        return [];
      }
      return mcpService.getServerTemplates();
    } catch (error) {
      log.error('Error getting MCP templates:', error);
      return [];
    }
  });

  // Start all enabled MCP servers
  ipcMain.handle('mcp-start-all-enabled', async () => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.startAllEnabledServers();
    } catch (error) {
      log.error('Error starting all enabled MCP servers:', error);
      throw error;
    }
  });

  // Stop all MCP servers
  ipcMain.handle('mcp-stop-all', async () => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.stopAllServers();
    } catch (error) {
      log.error('Error stopping all MCP servers:', error);
      throw error;
    }
  });

  // Import from Claude Desktop config
  ipcMain.handle('mcp-import-claude-config', async (event, configPath) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.importFromClaudeConfig(configPath);
    } catch (error) {
      log.error('Error importing Claude config:', error);
      throw error;
    }
  });

  // Start previously running servers
  ipcMain.handle('mcp-start-previously-running', async () => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.startPreviouslyRunningServers();
    } catch (error) {
      log.error('Error starting previously running MCP servers:', error);
      throw error;
    }
  });

  // Save current running state
  ipcMain.handle('mcp-save-running-state', async () => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      mcpService.saveRunningState();
      return true;
    } catch (error) {
      log.error('Error saving MCP server running state:', error);
      throw error;
    }
  });

  // Execute MCP tool call
  ipcMain.handle('mcp-execute-tool', async (event, toolCall) => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.executeToolCall(toolCall);
    } catch (error) {
      log.error('Error executing MCP tool call:', error);
      throw error;
    }
  });

  // Diagnose Node.js installation
  ipcMain.handle('mcp-diagnose-node', async () => {
    try {
      if (!mcpService) {
        throw new Error('MCP service not initialized');
      }
      return await mcpService.diagnoseNodeInstallation();
    } catch (error) {
      log.error('Error diagnosing Node.js installation:', error);
      return {
        nodeAvailable: false,
        npmAvailable: false,
        npxAvailable: false,
        suggestions: ['Error occurred while diagnosing Node.js installation: ' + error.message]
      };
    }
  });
}

// Register handlers for various app functions
function registerHandlers() {
  console.log('[main] Registering IPC handlers...');
  registerLlamaSwapHandlers();
  registerDockerContainerHandlers();
  registerModelManagerHandlers();
  registerMCPHandlers();

  // Instantiate SetupConfigService if not already done
  if (!setupConfigService) {
    setupConfigService = new SetupConfigService();
  }

  // IPC handler for get-active-brand-id
  ipcMain.handle('get-active-brand-id', async () => {
    try {
      return setupConfigService.getActiveBrandId();
    } catch (error) {
      log.error('Error getting active brand ID:', error);
      return null; // Or a default brand ID
    }
  });

  // IPC handler for set-active-brand-id
  ipcMain.on('set-active-brand-id', (event, brandId) => {
    try {
      setupConfigService.setActiveBrandId(brandId);
    } catch (error) {
      log.error('Error setting active brand ID:', error);
    }
  });
  
  // Add dialog handler for folder picker
  ipcMain.handle('show-open-dialog', async (_event, options) => {
    console.log('[main] show-open-dialog handler called with options:', options);
    try {
      return await dialog.showOpenDialog(options);
    } catch (error) {
      log.error('Error showing open dialog:', error);
      return { canceled: true, filePaths: [] };
    }
  });
  console.log('[main] show-open-dialog handler registered successfully');

  // App info handlers
  ipcMain.handle('get-app-path', () => app.getPath('userData'));
  ipcMain.handle('getWorkflowsPath', () => {
    return path.join(app.getAppPath(), 'workflows', 'n8n_workflows_full.json');
  });

  // Update handlers
  ipcMain.handle('check-for-updates', () => {
    return checkForUpdates();
  });

  ipcMain.handle('get-update-info', () => {
    return getUpdateInfo();
  });

  ipcMain.handle('check-llamacpp-updates', () => {
    return checkLlamacppUpdates();
  });

  ipcMain.handle('update-llamacpp-binaries', () => {
    return updateLlamacppBinaries();
  });

  // Permissions handler
  ipcMain.handle('request-microphone-permission', async () => {
    if (process.platform === 'darwin') {
      const status = await systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'not-determined') {
        return await systemPreferences.askForMediaAccess('microphone');
      }
      return status === 'granted';
    }
    return true;
  });

  // Service info handlers
  ipcMain.handle('get-service-ports', () => {
    if (dockerSetup && dockerSetup.ports) {
      return dockerSetup.ports;
    }
    return null;
  });

  ipcMain.handle('get-python-port', () => {
    if (dockerSetup && dockerSetup.ports && dockerSetup.ports.python) {
      return dockerSetup.ports.python;
    }
    return null;
  });

  ipcMain.handle('check-python-backend', async () => {
    try {
      if (!dockerSetup || !dockerSetup.ports || !dockerSetup.ports.python) {
        return { status: 'error', message: 'Python backend not configured' };
      }

      const isRunning = await dockerSetup.isPythonRunning();
      if (!isRunning) {
        return { status: 'error', message: 'Python backend container not running' };
      }

      return {
        status: 'running',
        port: dockerSetup.ports.python
      };
    } catch (error) {
      log.error('Error checking Python backend:', error);
      return { status: 'error', message: error.message };
    }
  });

  ipcMain.handle('check-docker-services', async () => {
    try {
      if (!dockerSetup) {
        return { 
          dockerAvailable: false, 
          n8nAvailable: false,
          pythonAvailable: false,
          comfyuiAvailable: false,
          message: 'Docker setup not initialized' 
        };
      }

      const dockerRunning = await dockerSetup.isDockerRunning();
      if (!dockerRunning) {
        return { 
          dockerAvailable: false, 
          n8nAvailable: false,
          pythonAvailable: false,
          comfyuiAvailable: false,
          message: 'Docker is not running' 
        };
      }

      const n8nRunning = await dockerSetup.checkN8NHealth().then(result => result.success).catch(() => false);
      const pythonRunning = await dockerSetup.isPythonRunning().catch(() => false);
      const comfyuiRunning = await dockerSetup.isComfyUIRunning().catch(() => false);

      return {
        dockerAvailable: true,
        n8nAvailable: n8nRunning,
        pythonAvailable: pythonRunning,
        comfyuiAvailable: comfyuiRunning,
        ports: dockerSetup.ports
      };
    } catch (error) {
      log.error('Error checking Docker services:', error);
      return { 
        dockerAvailable: false, 
        n8nAvailable: false,
        pythonAvailable: false,
        comfyuiAvailable: false,
        message: error.message 
      };
    }
  });

  // Check for container updates
  ipcMain.handle('docker-check-updates', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      return await dockerSetup.checkForUpdates((status) => {
        log.info('Update check:', status);
      });
    } catch (error) {
      log.error('Error checking for updates:', error);
      throw error;
    }
  });

  // ComfyUI specific handlers
  ipcMain.handle('comfyui-status', async () => {
    try {
      if (!dockerSetup) {
        return { running: false, error: 'Docker not initialized' };
      }
      
      const isRunning = await dockerSetup.isComfyUIRunning();
      return {
        running: isRunning,
        port: dockerSetup.ports.comfyui || 8188,
        containerName: 'clara_comfyui'
      };
    } catch (error) {
      log.error('Error checking ComfyUI status:', error);
      return { running: false, error: error.message };
    }
  });

  ipcMain.handle('comfyui-start', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      await dockerSetup.startContainer(dockerSetup.containers.comfyui);
      return { success: true };
    } catch (error) {
      log.error('Error starting ComfyUI:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('comfyui-stop', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      const container = await dockerSetup.docker.getContainer('clara_comfyui');
      await container.stop();
      return { success: true };
    } catch (error) {
      log.error('Error stopping ComfyUI:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('comfyui-restart', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      const container = await dockerSetup.docker.getContainer('clara_comfyui');
      await container.restart();
      return { success: true };
    } catch (error) {
      log.error('Error restarting ComfyUI:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('comfyui-logs', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      const container = await dockerSetup.docker.getContainer('clara_comfyui');
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100
      });
      return { success: true, logs: logs.toString() };
    } catch (error) {
      log.error('Error getting ComfyUI logs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('comfyui-optimize', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      log.info('Manual ComfyUI optimization requested');
      await dockerSetup.optimizeComfyUIContainer();
      return { success: true, message: 'ComfyUI optimization completed' };
    } catch (error) {
      log.error('Error optimizing ComfyUI:', error);
      return { success: false, error: error.message };
    }
  });

  // System information handlers
  ipcMain.handle('get-system-info', async () => {
    try {
      const os = require('os');
      return {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        hostname: os.hostname(),
        release: os.release(),
        type: os.type()
      };
    } catch (error) {
      log.error('Error getting system info:', error);
      return { error: error.message };
    }
  });

  // ComfyUI consent management
  ipcMain.handle('save-comfyui-consent', async (event, hasConsented) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const userDataPath = app.getPath('userData');
      const consentFile = path.join(userDataPath, 'comfyui-consent.json');
      
      const consentData = {
        hasConsented,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      fs.writeFileSync(consentFile, JSON.stringify(consentData, null, 2));
      log.info(`ComfyUI consent saved: ${hasConsented}`);
      
      // Update watchdog service if it's running
      if (watchdogService) {
        watchdogService.setComfyUIMonitoring(hasConsented);
      }
    } catch (error) {
      log.error('Error saving ComfyUI consent:', error);
      throw error;
    }
  });

  ipcMain.handle('get-comfyui-consent', async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const userDataPath = app.getPath('userData');
      const consentFile = path.join(userDataPath, 'comfyui-consent.json');
      
      if (fs.existsSync(consentFile)) {
        const consentData = JSON.parse(fs.readFileSync(consentFile, 'utf8'));
        return consentData;
      }
      
      return null;
    } catch (error) {
      log.error('Error reading ComfyUI consent:', error);
      return null;
    }
  });

  // Direct GPU information handler
  ipcMain.handle('get-gpu-info', async () => {
    try {
      const { spawn, spawnSync } = require('child_process');
      const os = require('os');
      
      let hasNvidiaGPU = false;
      let gpuName = '';
      let isAMD = false;
      let gpuMemoryMB = 0;
      
      // Try nvidia-smi first (most reliable for NVIDIA GPUs)
      try {
        const nvidiaSmi = spawnSync('nvidia-smi', [
          '--query-gpu=name,memory.total',
          '--format=csv,noheader,nounits'
        ], { encoding: 'utf8', timeout: 5000 });

        if (nvidiaSmi.status === 0 && nvidiaSmi.stdout) {
          const lines = nvidiaSmi.stdout.trim().split('\n');
          if (lines.length > 0 && lines[0].trim()) {
            const parts = lines[0].split(',');
            if (parts.length >= 2) {
              gpuName = parts[0].trim();
              gpuMemoryMB = parseInt(parts[1].trim()) || 0;
              hasNvidiaGPU = true;
              
              log.info(`NVIDIA GPU detected via nvidia-smi: ${gpuName} (${gpuMemoryMB}MB)`);
            }
          }
        }
      } catch (error) {
        log.debug('nvidia-smi not available or failed:', error.message);
      }

      // If nvidia-smi failed, try WMIC on Windows
      if (!hasNvidiaGPU && os.platform() === 'win32') {
        try {
          const wmic = spawnSync('wmic', [
            'path', 'win32_VideoController', 
            'get', 'name,AdapterRAM', 
            '/format:csv'
          ], { encoding: 'utf8', timeout: 10000 });

          if (wmic.status === 0 && wmic.stdout) {
            const lines = wmic.stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
            
            for (const line of lines) {
              const parts = line.split(',');
              if (parts.length >= 3) {
                const ramStr = parts[1]?.trim();
                const nameStr = parts[2]?.trim();

                if (nameStr && ramStr && !isNaN(parseInt(ramStr))) {
                  const ramBytes = parseInt(ramStr);
                  const ramMB = Math.round(ramBytes / (1024 * 1024));
                  
                  // Check if this is a better GPU than what we found
                  if (ramMB > gpuMemoryMB) {
                    gpuName = nameStr;
                    gpuMemoryMB = ramMB;
                    
                    const lowerName = nameStr.toLowerCase();
                    hasNvidiaGPU = lowerName.includes('nvidia') || 
                                  lowerName.includes('geforce') || 
                                  lowerName.includes('rtx') || 
                                  lowerName.includes('gtx');
                    isAMD = lowerName.includes('amd') || lowerName.includes('radeon');
                    
                    log.info(`GPU detected via WMIC: ${gpuName} (${gpuMemoryMB}MB)`);
                  }
                }
              }
            }
          }
        } catch (error) {
          log.debug('WMIC GPU detection failed:', error.message);
        }
      }

      // Try PowerShell as another fallback on Windows
      if (!hasNvidiaGPU && !gpuName && os.platform() === 'win32') {
        try {
          const powershell = spawnSync('powershell', [
            '-Command',
            'Get-WmiObject -Class Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json'
          ], { encoding: 'utf8', timeout: 10000 });

          if (powershell.status === 0 && powershell.stdout) {
            const gpuData = JSON.parse(powershell.stdout);
            const gpus = Array.isArray(gpuData) ? gpuData : [gpuData];
            
            for (const gpu of gpus) {
              if (gpu.Name && gpu.AdapterRAM) {
                const ramMB = Math.round(gpu.AdapterRAM / (1024 * 1024));
                
                if (ramMB > gpuMemoryMB) {
                  gpuName = gpu.Name;
                  gpuMemoryMB = ramMB;
                  
                  const lowerName = gpu.Name.toLowerCase();
                  hasNvidiaGPU = lowerName.includes('nvidia') || 
                                lowerName.includes('geforce') || 
                                lowerName.includes('rtx') || 
                                lowerName.includes('gtx');
                  isAMD = lowerName.includes('amd') || lowerName.includes('radeon');
                  
                  log.info(`GPU detected via PowerShell: ${gpuName} (${gpuMemoryMB}MB)`);
                }
              }
            }
          }
        } catch (error) {
          log.debug('PowerShell GPU detection failed:', error.message);
        }
      }

      return {
        success: true,
        gpuInfo: {
          hasNvidiaGPU,
          gpuName,
          isAMD,
          gpuMemoryMB,
          gpuMemoryGB: Math.round(gpuMemoryMB / 1024 * 10) / 10,
          platform: os.platform()
        }
      };
    } catch (error) {
      log.error('Error getting GPU info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get watchdog service status including ComfyUI
  ipcMain.handle('get-services-status', async () => {
    try {
      if (!watchdogService) {
        return { error: 'Watchdog service not initialized' };
      }
      
      return {
        services: watchdogService.getServicesStatus(),
        overallHealth: watchdogService.getOverallHealth()
      };
    } catch (error) {
      log.error('Error getting services status:', error);
      return { error: error.message };
    }
  });

  // Update containers
  ipcMain.handle('docker-update-containers', async (event, containerNames) => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      return await dockerSetup.updateContainers(containerNames, (status, type = 'info') => {
        log.info('Container update:', status);
        // Send progress updates to the renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('docker-update-progress', { status, type });
        }
      });
    } catch (error) {
      log.error('Error updating containers:', error);
      throw error;
    }
  });

  // Get system architecture info
  ipcMain.handle('docker-get-system-info', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      return {
        architecture: dockerSetup.systemArch,
        platform: process.platform,
        arch: process.arch
      };
    } catch (error) {
      log.error('Error getting system info:', error);
      throw error;
    }
  });

  // Enhanced Docker detection
  ipcMain.handle('docker-detect-installations', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      const installations = await dockerSetup.detectDockerInstallations();
      return installations.map(install => ({
        type: install.type,
        method: install.method,
        priority: install.priority,
        path: install.path,
        host: install.host,
        port: install.port,
        contextName: install.contextName,
        machineName: install.machineName,
        isPodman: install.isPodman || false,
        isNamedPipe: install.isNamedPipe || false
      }));
    } catch (error) {
      log.error('Error detecting Docker installations:', error);
      throw error;
    }
  });

  // Get Docker detection report
  ipcMain.handle('docker-get-detection-report', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      return await dockerSetup.getDockerDetectionReport();
    } catch (error) {
      log.error('Error getting Docker detection report:', error);
      throw error;
    }
  });

  // Test all Docker installations
  ipcMain.handle('docker-test-all-installations', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker not initialized');
      }
      
      return await dockerSetup.testAllDockerInstallations();
    } catch (error) {
      log.error('Error testing Docker installations:', error);
      throw error;
    }
  });

  // Event handlers
  ipcMain.on('backend-status', (event, status) => {
    if (mainWindow) {
      mainWindow.webContents.send('backend-status', status);
    }
  });

  ipcMain.on('python-status', (event, status) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-status', status);
    }
  });


  // Handle loading screen completion
  ipcMain.on('loading-complete', () => {
    log.info('Loading screen fade-out complete');
    if (loadingScreen) {
      loadingScreen.close();
      loadingScreen = null;
    }
  });

  // Handle React app ready signal
  ipcMain.on('react-app-ready', () => {
    log.info('React app fully initialized and ready');
    if (loadingScreen && loadingScreen.isValid()) {
      loadingScreen.notifyMainWindowReady();
    }
  });

  // Handle app close request
  ipcMain.on('app-close', async () => {
    log.info('App close requested from renderer');
    
    try {
      // Stop watchdog service first
      if (watchdogService) {
        log.info('Stopping watchdog service...');
        watchdogService.stop();
      }

      // Save MCP server running state before stopping
      if (mcpService) {
        log.info('Saving MCP server running state...');
        mcpService.saveRunningState();
      }
      
      // Stop llama-swap service
      if (llamaSwapService) {
        log.info('Stopping llama-swap service...');
        await llamaSwapService.stop();
      }
      
      // Stop all MCP servers
      if (mcpService) {
        log.info('Stopping all MCP servers...');
        await mcpService.stopAllServers();
      }
      
      // Stop Docker containers
      if (dockerSetup) {
        log.info('Stopping Docker containers...');
        await dockerSetup.stop();
      }

      log.info('All services stopped, quitting app...');
      app.quit();
    } catch (error) {
      log.error('Error during app cleanup:', error);
      // Still quit even if cleanup fails
      app.quit();
    }
  });

  // Window management handlers
  ipcMain.handle('get-fullscreen-startup-preference', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const settingsPath = path.join(userDataPath, 'settings.json');
      
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return settings.fullscreen_startup !== false; // Default to true if not set
      }
      return true; // Default to fullscreen
    } catch (error) {
      log.error('Error reading fullscreen startup preference:', error);
      return true; // Default to fullscreen on error
    }
  });

  ipcMain.handle('set-fullscreen-startup-preference', async (event, enabled) => {
    try {
      const userDataPath = app.getPath('userData');
      const settingsPath = path.join(userDataPath, 'settings.json');
      
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      
      settings.fullscreen_startup = enabled;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      
      log.info(`Fullscreen startup preference set to: ${enabled}`);
      return true;
    } catch (error) {
      log.error('Error saving fullscreen startup preference:', error);
      return false;
    }
  });

  ipcMain.handle('toggle-fullscreen', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const isFullscreen = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!isFullscreen);
      log.info(`Window fullscreen toggled to: ${!isFullscreen}`);
      return !isFullscreen;
    }
    return false;
  });

  ipcMain.handle('get-fullscreen-status', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isFullScreen();
    }
    return false;
  });

  // Generic Docker service control handlers
  ipcMain.handle('start-docker-service', async (event, serviceName) => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker setup not initialized');
      }

      switch (serviceName) {
        case 'n8n':
          await dockerSetup.startContainer(dockerSetup.containers.n8n);
          break;
        case 'python':
          await dockerSetup.startContainer(dockerSetup.containers.python);
          break;
        case 'comfyui':
          await dockerSetup.startContainer(dockerSetup.containers.comfyui);
          break;
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }

      return { success: true };
    } catch (error) {
      log.error(`Error starting ${serviceName} service:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-docker-service', async (event, serviceName) => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker setup not initialized');
      }

      const containerName = `clara_${serviceName}`;
      const container = await dockerSetup.docker.getContainer(containerName);
      await container.stop();

      return { success: true };
    } catch (error) {
      log.error(`Error stopping ${serviceName} service:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('restart-docker-service', async (event, serviceName) => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker setup not initialized');
      }

      const containerName = `clara_${serviceName}`;
      const container = await dockerSetup.docker.getContainer(containerName);
      await container.restart();

      return { success: true };
    } catch (error) {
      log.error(`Error restarting ${serviceName} service:`, error);
      return { success: false, error: error.message };
    }
  });
}

async function initializeApp() {
  console.log('🚀 InitializeApp called - starting initialization process');
  try {
    console.log('🔍 About to check first-time setup');
    // Check if this is first time setup
    const SetupConfigService = require('./setupConfigService.cjs');
    console.log('✅ SetupConfigService imported successfully');
    const setupService = new SetupConfigService();
    console.log('✅ SetupConfigService instance created');
    const isFirstTime = setupService.isFirstTimeSetup(); // Remove await - this is synchronous
    
    console.log('🔍 First-time setup check:', { isFirstTime });
    
    if (isFirstTime) {
      console.log('🎯 First-time setup detected - starting splash screen');
      // Use splash screen for first-time setup
      splash = new SplashScreen();
      
      // Wait for setup to complete before continuing
      return new Promise((resolve) => {
        const checkSetupComplete = setInterval(async () => {
          const stillFirstTime = setupService.isFirstTimeSetup(); // Remove await - this is synchronous
          console.log('⏳ Checking setup completion:', { stillFirstTime });
          if (!stillFirstTime) {
            console.log('✅ First-time setup completed');
            clearInterval(checkSetupComplete);
            if (splash) {
              splash.close();
              splash = null;
            }
            // Continue with normal initialization
            await continueNormalInitialization();
            resolve();
          }
        }, 1000);
      });
    } else {
      console.log('📱 Normal startup - skipping first-time setup');
      // Normal initialization without first-time setup
      await continueNormalInitialization();
    }
  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    // Fallback to normal initialization
    await continueNormalInitialization();
  }
}

async function continueNormalInitialization() {
  try {
    // Show loading screen
    loadingScreen = new LoadingScreen();
    
    // Register handlers for various app functions
    registerHandlers();
    
    // Initialize all services
    llamaSwapService = new LlamaSwapService();
    
    // Load custom model path from file-based storage and set it before starting the service
    try {
      const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
      
      if (fsSync.existsSync(settingsPath)) {
        const settingsData = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
        const customModelPath = settingsData.customModelPath;
        
        if (customModelPath && fsSync.existsSync(customModelPath)) {
          log.info('Loading custom model path from settings:', customModelPath);
          llamaSwapService.setCustomModelPaths([customModelPath]);
        } else if (customModelPath) {
          log.warn('Custom model path from settings no longer exists:', customModelPath);
        }
      }
    } catch (error) {
      log.warn('Could not load custom model path during initialization:', error.message);
      // Continue without custom path - it can be set later by the frontend
    }
    
    // Set up progress callback to forward to renderer
    llamaSwapService.setProgressCallback((progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llama-progress-update', progressData);
      }
    });
    
    // Initialize essential services (non-blocking)
    mcpService = new MCPService();
    updateService = platformUpdateService;
    dockerSetup = new DockerSetup();
    comfyUIModelService = new ComfyUIModelService();
    
    // Create the main window immediately for fast startup
    log.info('Creating main window...');
    loadingScreen.setStatus('Starting main application...', 'success');
    await createMainWindow();
    
    // Initialize services in background after main window is ready
    initializeServicesInBackground();
    
  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    loadingScreen?.setStatus(`Error: ${error.message}`, 'error');
    
    // For critical startup errors, create main window anyway and show error
    await createMainWindow();
    await showStartupDialog(loadingScreen, 'error', 'Startup Error', `Critical error during startup: ${error.message}\n\nSome features may not work properly.`);
  }
}

/**
 * Initialize all services in background after main window is ready
 * This provides fast startup while services initialize progressively
 */
async function initializeServicesInBackground() {
  try {
    log.info('Starting background service initialization...');
    
    // Send initialization status to renderer if main window is ready
    const sendStatus = (service, status, type = 'info') => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('background-service-status', { service, status, type });
      }
      log.info(`[Background] ${service}: ${status}`);
    };

    // Initialize Docker setup in background
    sendStatus('Docker', 'Initializing Docker environment...', 'info');
    
    if (process.env.SKIP_DOCKER_SETUP === 'true') {
      log.info('Skipping Docker setup due to SKIP_DOCKER_SETUP environment variable');
      sendStatus('Docker', 'Docker setup skipped. Some features may be limited.', 'warning');
    } else {
      try {
        const dockerSuccess = await dockerSetup.setup(async (status, type = 'info') => {
          sendStatus('Docker', status, type);
          
          // Only show error dialogs for critical errors that need user attention
          if (type === 'error' && !status.includes('Docker is not running') && !status.includes('not available')) {
            // Don't block startup, just log and notify user through main window
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('background-service-error', { service: 'Docker', error: status });
            }
          }
        }, false);

        if (dockerSuccess) {
          sendStatus('Docker', 'Docker services ready', 'success');
          
          // Signal watchdog service that Docker setup is complete
          if (watchdogService) {
            watchdogService.signalSetupComplete();
          }
        } else {
          sendStatus('Docker', 'Docker not available. Some features may be limited.', 'warning');
        }
      } catch (dockerError) {
        log.error('Docker initialization error:', dockerError);
        sendStatus('Docker', 'Docker initialization failed', 'error');
      }
    }

    // Initialize LlamaSwap service in background
    sendStatus('LLM', 'Initializing LLM service...', 'info');
    try {
      const llamaSwapSuccess = await llamaSwapService.start();
      if (llamaSwapSuccess) {
        sendStatus('LLM', 'LLM service started successfully', 'success');
      } else {
        sendStatus('LLM', 'LLM service failed to start (available for manual start)', 'warning');
      }
    } catch (llamaSwapError) {
      log.error('Error initializing llama-swap service:', llamaSwapError);
      sendStatus('LLM', 'LLM service initialization failed (available for manual start)', 'warning');
    }

    // Initialize MCP service in background
    sendStatus('MCP', 'Initializing MCP service...', 'info');
    try {
      sendStatus('MCP', 'MCP service initialized', 'success');
      
      // Auto-start previously running servers
      sendStatus('MCP', 'Restoring MCP servers...', 'info');
      try {
        const restoreResults = await mcpService.startPreviouslyRunningServers();
        const successCount = restoreResults.filter(r => r.success).length;
        const totalCount = restoreResults.length;
        
        if (totalCount > 0) {
          sendStatus('MCP', `Restored ${successCount}/${totalCount} MCP servers`, successCount === totalCount ? 'success' : 'warning');
        } else {
          sendStatus('MCP', 'No MCP servers to restore', 'info');
        }
      } catch (restoreError) {
        log.error('Error restoring MCP servers:', restoreError);
        sendStatus('MCP', 'Failed to restore some MCP servers', 'warning');
      }
    } catch (mcpError) {
      log.error('Error initializing MCP service:', mcpError);
      sendStatus('MCP', 'MCP service initialization failed', 'warning');
    }

    // Initialize Watchdog service in background
    sendStatus('Watchdog', 'Initializing Watchdog service...', 'info');
    try {
      watchdogService = new WatchdogService(dockerSetup, llamaSwapService, mcpService);
      
      // Set up event listeners for watchdog events
      watchdogService.on('serviceRestored', (serviceKey, service) => {
        log.info(`Watchdog: ${service.name} has been restored`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('watchdog-service-restored', { serviceKey, service: service.name });
        }
      });
      
      watchdogService.on('serviceFailed', (serviceKey, service) => {
        log.error(`Watchdog: ${service.name} has failed after maximum retry attempts`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('watchdog-service-failed', { serviceKey, service: service.name });
        }
      });
      
      watchdogService.on('serviceRestarted', (serviceKey, service) => {
        log.info(`Watchdog: ${service.name} has been restarted successfully`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('watchdog-service-restarted', { serviceKey, service: service.name });
        }
      });
      
      // Start the watchdog monitoring
      watchdogService.start();
      
      sendStatus('Watchdog', 'Watchdog service started successfully', 'success');
    } catch (watchdogError) {
      log.error('Error initializing Watchdog service:', watchdogError);
      sendStatus('Watchdog', 'Watchdog service initialization failed', 'warning');
    }

    // All background services initialized
    log.info('Background service initialization completed');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-services-ready');
    }

  } catch (error) {
    log.error('Error during background service initialization:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-service-error', { 
        service: 'Background Services', 
        error: `Background initialization failed: ${error.message}` 
      });
    }
  }
}

async function createMainWindow() {
  if (mainWindow) return;
  
  // Check fullscreen startup preference
  let shouldStartFullscreen = false;
  let shouldStartMinimized = false;
  
  try {
    const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      // Check both startup.fullscreen and fullscreen_startup for backward compatibility
      shouldStartFullscreen = settings.startup?.startFullscreen ?? settings.fullscreen_startup ?? false;
      shouldStartMinimized = settings.startup?.startMinimized ?? false;
    }
  } catch (error) {
    log.error('Error reading startup preferences:', error);
    shouldStartFullscreen = false; // Default to not fullscreen on error
    shouldStartMinimized = false; // Default to not minimized on error
  }
  
  log.info(`Creating main window with fullscreen: ${shouldStartFullscreen}, minimized: ${shouldStartMinimized}`);
  
  mainWindow = new BrowserWindow({
    fullscreen: shouldStartFullscreen,
    width: shouldStartFullscreen ? undefined : 1200,
    height: shouldStartFullscreen ? undefined : 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    },
    show: false,
    backgroundColor: '#0f0f23', // Dark background to match loading screen
    frame: true
  });

  // Apply minimized state if needed
  if (shouldStartMinimized) {
    mainWindow.minimize();
  }

  // Create and set the application menu
  createAppMenu(mainWindow);

  // Set security policies for webview, using the dynamic n8n port
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const n8nPort = dockerSetup?.ports?.n8n; // Get the determined n8n port
    
    // Allow ALL permissions for the main Clara application (development and production)
    if (url.startsWith('http://localhost:5173') || url.startsWith('file://')) {
      log.info(`Granted '${permission}' permission for Clara app URL: ${url}`);
      callback(true);
      return;
    }
    
    // Allow all permissions for n8n service as well
    if (n8nPort && url.startsWith(`http://localhost:${n8nPort}`)) { 
      log.info(`Granted '${permission}' permission for n8n URL: ${url}`);
      callback(true);
    } else {
      log.warn(`Blocked permission request '${permission}' for URL: ${url} (n8n port: ${n8nPort})`);
      callback(false);
    }
  });

  // Development mode with hot reload
  if (process.env.NODE_ENV === 'development') {
    if (process.env.ELECTRON_HOT_RELOAD === 'true') {
      // Hot reload mode
      const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
      
      log.info('Loading development server with hot reload:', devServerUrl);
      mainWindow.loadURL(devServerUrl).catch(err => {
        log.error('Failed to load dev server:', err);
        // Fallback to local file if dev server fails
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      });

      // Enable hot reload by watching the renderer process
      mainWindow.webContents.on('did-fail-load', () => {
        log.warn('Page failed to load, retrying...');
        setTimeout(() => {
          mainWindow?.webContents.reload();
        }, 1000);
      });
    } else {
      // Development mode without hot reload - use built files
      log.info('Loading development build from dist directory');
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Open DevTools in both development modes
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Wait for DOM content to be fully loaded before showing
  mainWindow.webContents.once('dom-ready', () => {
    log.info('Main window DOM ready, preparing to show...');
    
    // Additional delay to ensure React app is fully rendered
    setTimeout(() => {
      // Check if loading screen is still valid before proceeding
      if (loadingScreen && loadingScreen.isValid()) {
        log.info('Notifying loading screen that main window is ready');
        loadingScreen.notifyMainWindowReady();
        
        // Wait for loading screen fade-out before showing main window
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            log.info('Showing main window');
            mainWindow.show();
          }
          
          // Clean up loading screen
          if (loadingScreen) {
            loadingScreen.close();
            loadingScreen = null;
          }
        }, 1500); // Longer delay to ensure smooth fade out
      } else {
        // If no loading screen, show immediately
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      }
      
      // Initialize auto-updater when window is ready
      // Note: Auto-updates work in both development and production
      setupAutoUpdater(mainWindow);
    }, 2000); // Wait for React to fully initialize
  });

  // Fallback: Show window when ready (in case dom-ready doesn't fire)
  mainWindow.once('ready-to-show', () => {
    log.info('Main window ready-to-show event fired');
    // Only show if not already shown by dom-ready handler
    if (mainWindow && !mainWindow.isVisible()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
          log.info('Fallback: Showing main window via ready-to-show');
          mainWindow.show();
          
          if (loadingScreen) {
            loadingScreen.close();
            loadingScreen = null;
          }
        }
      }, 3000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize app when ready
app.whenReady().then(initializeApp);

// Quit when all windows are closed
app.on('window-all-closed', async () => {
  // Stop watchdog service first
  if (watchdogService) {
    try {
      log.info('Stopping watchdog service...');
      watchdogService.stop();
    } catch (error) {
      log.error('Error stopping watchdog service:', error);
    }
  }

  // Save MCP server running state before stopping
  if (mcpService) {
    try {
      log.info('Saving MCP server running state...');
      mcpService.saveRunningState();
    } catch (error) {
      log.error('Error saving MCP server running state:', error);
    }
  }
  
  // Stop llama-swap service
  if (llamaSwapService) {
    try {
      log.info('Stopping llama-swap service...');
      await llamaSwapService.stop();
    } catch (error) {
      log.error('Error stopping llama-swap service:', error);
    }
  }
  
  // Stop all MCP servers
  if (mcpService) {
    try {
      log.info('Stopping all MCP servers...');
      await mcpService.stopAllServers();
    } catch (error) {
      log.error('Error stopping MCP servers:', error);
    }
  }
  
  // Stop Docker containers
  if (dockerSetup) {
    await dockerSetup.stop();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// Register startup settings handler
ipcMain.on('set-startup-settings', async (event, settings) => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    
    // Read current settings
    let currentSettings = {};
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      currentSettings = JSON.parse(settingsData);
    }
    
    // Update startup settings
    currentSettings.startup = {
      ...currentSettings.startup,
      ...settings
    };
    
    // For backward compatibility, also set fullscreen_startup
    if (settings.startFullscreen !== undefined) {
      currentSettings.fullscreen_startup = settings.startFullscreen;
    }
    
    // Save updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2));
    
    // Apply auto-start setting immediately if provided
    if (settings.autoStart !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: settings.autoStart,
        openAsHidden: settings.startMinimized || false
      });
    }
    
    log.info('Startup settings updated successfully');
  } catch (error) {
    log.error('Error updating startup settings:', error);
  }
});

// Register startup settings IPC handler
ipcMain.on('set-startup-settings', (event, settings) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
    let currentSettings = {};
    
    // Load existing settings if file exists
    if (fs.existsSync(settingsPath)) {
      currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    
    // Update startup settings
    currentSettings.startup = {
      ...currentSettings.startup,
      ...settings
    };
    
    // Save updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');
    log.info('Startup settings saved:', settings);
  } catch (error) {
    log.error('Error saving startup settings:', error);
  }
});

ipcMain.handle('get-startup-settings', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.startup || {};
    }
    return {};
  } catch (error) {
    log.error('Error reading startup settings:', error);
    return {};
  }
});

// Model Manager IPC handlers
ipcMain.handle('model-manager:search-civitai', async (event, { query, types, sort }) => {
  try {
    const url = new URL('https://civitai.com/api/v1/models');
    url.searchParams.set('limit', '20');
    url.searchParams.set('query', query);
    url.searchParams.set('sort', sort || 'Highest Rated');
    if (types && types.length > 0) {
      url.searchParams.set('types', types.join(','));
    }

    const response = await fetch(url.toString());
    const data = await response.json();
    return data;
  } catch (error) {
    log.error('Error searching CivitAI models:', error);
    throw error;
  }
});

ipcMain.handle('model-manager:search-huggingface', async (event, { query, modelType, author }) => {
  try {
    const url = new URL('https://huggingface.co/api/models');
    url.searchParams.set('limit', '20');
    url.searchParams.set('search', query);
    if (modelType) {
      url.searchParams.set('filter', `library:${modelType}`);
    }
    if (author) {
      url.searchParams.set('author', author);
    }

    const response = await fetch(url.toString());
    const data = await response.json();
    return data;
  } catch (error) {
    log.error('Error searching Hugging Face models:', error);
    throw error;
  }
});

ipcMain.handle('model-manager:download-model', async (event, { url, filename, modelType, source }) => {
  return new Promise((resolve, reject) => {
    try {
      const modelsDir = path.join(app.getPath('userData'), 'models', modelType);
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      const filePath = path.join(modelsDir, filename);
      const file = fs.createWriteStream(filePath);
      const client = url.startsWith('https:') ? https : http;

      // Add headers for different sources
      const headers = {};
      if (source === 'huggingface') {
        // For Hugging Face, we might need auth headers
        headers['User-Agent'] = 'Clara-AI-Assistant/1.0';
      }

      const request = client.get(url, { headers }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length']);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = (downloadedSize / totalSize) * 100;
          event.sender.send('model-download-progress', {
            filename,
            progress: Math.round(progress),
            downloadedSize,
            totalSize
          });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            log.info(`Model downloaded successfully: ${filename}`);
            resolve({ success: true, path: filePath });
          });
        });
      });

      request.on('error', (error) => {
        fs.unlink(filePath, () => {}); // Delete partial file
        reject(error);
      });
    } catch (error) {
      log.error('Error downloading model:', error);
      reject(error);
    }
  });
});

ipcMain.handle('model-manager:get-local-models', async () => {
  try {
    const modelsDir = path.join(app.getPath('userData'), 'models');
    if (!fs.existsSync(modelsDir)) {
      return {};
    }

    const models = {};
    const modelTypes = fs.readdirSync(modelsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const type of modelTypes) {
      const typePath = path.join(modelsDir, type);
      const files = fs.readdirSync(typePath).map(filename => {
        const filePath = path.join(typePath, filename);
        const stats = fs.statSync(filePath);
        return {
          name: filename,
          size: stats.size,
          modified: stats.mtime,
          path: filePath
        };
      });
      models[type] = files;
    }

    return models;
  } catch (error) {
    log.error('Error getting local models:', error);
    return {};
  }
});

ipcMain.handle('model-manager:delete-local-model', async (event, { modelType, filename }) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'models', modelType, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log.info(`Model deleted: ${filename}`);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    log.error('Error deleting model:', error);
    throw error;
  }
});

ipcMain.handle('model-manager:save-api-keys', async (event, keys) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'model-manager-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(keys, null, 2));
    log.info('API keys saved successfully');
    return { success: true };
  } catch (error) {
    log.error('Error saving API keys:', error);
    throw error;
  }
});

ipcMain.handle('model-manager:get-api-keys', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'model-manager-settings.json');
    if (fs.existsSync(settingsPath)) {
      const keys = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return keys;
    }
    return {};
  } catch (error) {
    log.error('Error reading API keys:', error);
    return {};
  }
});

// ComfyUI Model Download Handler - downloads directly to ComfyUI model directories
ipcMain.handle('comfyui-model-manager:download-model', async (event, { url, filename, modelType, source, apiKey }) => {
  return new Promise((resolve, reject) => {
    try {
      // Map model types to ComfyUI directory structure
      const modelTypeMapping = {
        'checkpoint': 'checkpoints',
        'lora': 'loras', 
        'vae': 'vae',
        'controlnet': 'controlnet',
        'upscaler': 'upscale_models',
        'embedding': 'embeddings',
        'textualinversion': 'embeddings', // CivitAI uses this term
        'hypernetwork': 'hypernetworks',
        'style': 'style_models',
        't2i_adapter': 't2i_adapter',
        'clip': 'clip',
        'unet': 'unet'
      };

      const comfyuiDir = modelTypeMapping[modelType] || 'checkpoints';
      
      // Get the ComfyUI models directory - prefer WSL2 path if available
      let comfyuiModelsDir;
      
      try {
        // Try to use WSL2 path for better performance
        const os = require('os');
        if (os.platform() === 'win32') {
          const { execSync } = require('child_process');
          const wslList = execSync('wsl -l -v', { encoding: 'utf8' });
          const distributions = wslList.split('\n')
            .filter(line => line.includes('Running'))
            .map(line => line.trim().split(/\s+/)[0])
            .filter(dist => dist && dist !== 'NAME');
          
          if (distributions.length > 0) {
            const distro = distributions[0];
            let wslUser = 'root';
            try {
              wslUser = execSync(`wsl -d ${distro} whoami`, { encoding: 'utf8' }).trim();
            } catch (error) {
              // Use root as fallback
            }
            
            // Use WSL2 path
            comfyuiModelsDir = `\\\\wsl.localhost\\${distro}\\home\\${wslUser}\\comfyui_models\\${comfyuiDir}`;
            log.info(`Using WSL2 path for model download: ${comfyuiModelsDir}`);
          } else {
            throw new Error('No running WSL2 distributions found');
          }
        } else {
          throw new Error('Not on Windows');
        }
      } catch (error) {
        // Fallback to Windows path
        comfyuiModelsDir = path.join(app.getPath('userData'), 'comfyui_models', comfyuiDir);
        log.info(`Using Windows path for model download: ${comfyuiModelsDir}`);
      }
      
      // Ensure directory exists
      if (!fs.existsSync(comfyuiModelsDir)) {
        fs.mkdirSync(comfyuiModelsDir, { recursive: true });
        log.info(`Created ComfyUI model directory: ${comfyuiModelsDir}`);
      }

      const filePath = path.join(comfyuiModelsDir, filename);
      
      // Check if file already exists
      if (fs.existsSync(filePath)) {
        log.warn(`File already exists: ${filename}`);
        resolve({ success: false, error: 'File already exists', path: filePath });
        return;
      }

      const file = fs.createWriteStream(filePath);
      const client = url.startsWith('https:') ? https : http;

      // Add headers for different sources
      const headers = {
        'User-Agent': 'Clara-AI-Assistant/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      };
      
      if (source === 'civitai') {
        // CivitAI specific headers
        headers['Referer'] = 'https://civitai.com/';
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      } else if (source === 'huggingface' && apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      log.info(`Starting download: ${filename} to ${comfyuiDir} directory`);
      log.info(`Download URL: ${url}`);
      log.info(`File path: ${filePath}`);
      log.info(`Source: ${source}, API Key provided: ${!!apiKey}`);

      // Validate URL
      try {
        new URL(url);
      } catch (urlError) {
        reject(new Error(`Invalid download URL: ${url}`));
        return;
      }

      const makeRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          file.close();
          fs.unlink(filePath, () => {});
          reject(new Error('Too many redirects'));
          return;
        }

        const requestClient = requestUrl.startsWith('https:') ? https : http;
        const request = requestClient.get(requestUrl, { headers }, (response) => {
          // Handle all redirect status codes
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              file.close();
              fs.unlink(filePath, () => {});
              reject(new Error(`Redirect response missing location header`));
              return;
            }
            
            log.info(`Following ${response.statusCode} redirect to: ${redirectUrl}`);
            
            // Handle relative URLs
            let fullRedirectUrl = redirectUrl;
            if (redirectUrl.startsWith('/')) {
              const urlObj = new URL(requestUrl);
              fullRedirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
            } else if (!redirectUrl.startsWith('http')) {
              const urlObj = new URL(requestUrl);
              fullRedirectUrl = `${urlObj.protocol}//${urlObj.host}/${redirectUrl}`;
            }
            
            // Make new request to redirect URL
            makeRequest(fullRedirectUrl, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(filePath, () => {});
            log.error(`Download failed with status ${response.statusCode}: ${response.statusMessage}`);
            log.error(`Response headers:`, response.headers);
            reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
            return;
          }

          log.info(`Download started successfully for ${filename}`);
          log.info(`Content-Length: ${response.headers['content-length'] || 'Unknown'}`);

          handleDownloadResponse(response);
        });

        request.on('error', (error) => {
          file.close();
          fs.unlink(filePath, () => {});
          reject(new Error(`Request failed: ${error.message}`));
        });

        request.setTimeout(30000, () => {
          request.destroy();
          file.close();
          fs.unlink(filePath, () => {});
          reject(new Error('Download timeout'));
        });
      };

      makeRequest(url);

      function handleDownloadResponse(response) {
        const totalSize = parseInt(response.headers['content-length']) || 0;
        let downloadedSize = 0;
        const startTime = Date.now();

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloadedSize / elapsed;
          const remaining = totalSize > 0 ? (totalSize - downloadedSize) / speed : 0;
          
          // Send progress update
          event.sender.send('comfyui-model-download-progress', {
            filename,
            progress: Math.round(progress),
            downloadedSize,
            totalSize,
            speed: formatBytes(speed) + '/s',
            eta: remaining > 0 ? `${Math.round(remaining)}s` : 'Unknown'
          });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            log.info(`ComfyUI model downloaded successfully: ${filename} to ${comfyuiDir}`);
            
            // Send completion event
            event.sender.send('comfyui-model-download-complete', {
              filename,
              modelType: comfyuiDir,
              path: filePath,
              size: fs.statSync(filePath).size
            });
            
            resolve({ 
              success: true, 
              path: filePath, 
              modelType: comfyuiDir,
              size: fs.statSync(filePath).size 
            });
          });
        });

        file.on('error', (error) => {
          fs.unlink(filePath, () => {});
          reject(new Error(`File write error: ${error.message}`));
        });
      }

    } catch (error) {
      log.error('Error downloading ComfyUI model:', error);
      reject(error);
    }
  });
});

// Get ComfyUI models organized by type
ipcMain.handle('comfyui-model-manager:get-local-models', async () => {
  try {
    const comfyuiModelsDir = path.join(app.getPath('userData'), 'comfyui_models');
    if (!fs.existsSync(comfyuiModelsDir)) {
      return {};
    }

    const models = {};
    const modelDirs = [
      'checkpoints', 'loras', 'vae', 'controlnet', 'upscale_models', 
      'embeddings', 'hypernetworks', 'style_models', 't2i_adapter', 'clip', 'unet'
    ];

    for (const dir of modelDirs) {
      const dirPath = path.join(comfyuiModelsDir, dir);
      if (fs.existsSync(dirPath)) {
        try {
          const files = fs.readdirSync(dirPath)
            .filter(file => {
              // Filter for model files (safetensors, ckpt, pt, pth, bin)
              const ext = path.extname(file).toLowerCase();
              return ['.safetensors', '.ckpt', '.pt', '.pth', '.bin'].includes(ext);
            })
            .map(filename => {
              const filePath = path.join(dirPath, filename);
              const stats = fs.statSync(filePath);
              return {
                name: filename,
                size: stats.size,
                modified: stats.mtime,
                path: filePath,
                type: dir
              };
            });
          models[dir] = files;
        } catch (error) {
          log.warn(`Error reading directory ${dir}:`, error);
          models[dir] = [];
        }
      } else {
        models[dir] = [];
      }
    }

    return models;
  } catch (error) {
    log.error('Error getting ComfyUI local models:', error);
    return {};
  }
});

// Delete ComfyUI model
ipcMain.handle('comfyui-model-manager:delete-model', async (event, { modelType, filename }) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'comfyui_models', modelType, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log.info(`ComfyUI model deleted: ${filename} from ${modelType}`);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    log.error('Error deleting ComfyUI model:', error);
    throw error;
  }
});

// Get ComfyUI models directory info
ipcMain.handle('comfyui-model-manager:get-models-dir', async () => {
  try {
    const comfyuiModelsDir = path.join(app.getPath('userData'), 'comfyui_models');
    return {
      path: comfyuiModelsDir,
      exists: fs.existsSync(comfyuiModelsDir)
    };
  } catch (error) {
    log.error('Error getting ComfyUI models directory:', error);
    return { path: '', exists: false };
  }
});

// ==============================================
// ComfyUI Internal Model Management Service
// ==============================================

// Get models stored inside ComfyUI container
ipcMain.handle('comfyui-internal:list-models', async (event, category = 'checkpoints') => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const models = await comfyUIModelService.listInstalledModels(category);
    return { success: true, models };
  } catch (error) {
    log.error(`Error listing ComfyUI ${category} models:`, error);
    return { success: false, error: error.message, models: [] };
  }
});

// Get ComfyUI container storage information
ipcMain.handle('comfyui-internal:get-storage-info', async () => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const storageInfo = await comfyUIModelService.getStorageInfo();
    return { success: true, storage: storageInfo };
  } catch (error) {
    log.error('Error getting ComfyUI storage info:', error);
    return { success: false, error: error.message, storage: null };
  }
});

// Download and install model to ComfyUI container
ipcMain.handle('comfyui-internal:download-model', async (event, { url, filename, category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    log.info(`Starting ComfyUI model download: ${filename} (${category}) from ${url}`);
    
    // Set up progress forwarding
    const progressHandler = (progressData) => {
      event.sender.send('comfyui-internal-download-progress', progressData);
    };
    
    // Set up event forwarding
    const eventHandlers = {
      'download:start': (data) => event.sender.send('comfyui-internal-download-start', data),
      'download:complete': (data) => event.sender.send('comfyui-internal-download-complete', data),
      'download:error': (data) => event.sender.send('comfyui-internal-download-error', data),
      'install:start': (data) => event.sender.send('comfyui-internal-install-start', data),
      'install:complete': (data) => event.sender.send('comfyui-internal-install-complete', data),
      'install:error': (data) => event.sender.send('comfyui-internal-install-error', data)
    };
    
    // Attach event listeners
    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      comfyUIModelService.on(eventName, handler);
    });
    
    try {
      const result = await comfyUIModelService.downloadAndInstallModel(url, filename, category, progressHandler);
      
      // Clean up event listeners
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        comfyUIModelService.removeListener(eventName, handler);
      });
      
      return result;
    } catch (error) {
      // Clean up event listeners on error
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        comfyUIModelService.removeListener(eventName, handler);
      });
      throw error;
    }
    
  } catch (error) {
    log.error('Error downloading ComfyUI model to container:', error);
    return {
      success: false,
      filename,
      category,
      error: error.message
    };
  }
});

// Remove model from ComfyUI container
ipcMain.handle('comfyui-internal:remove-model', async (event, { filename, category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const result = await comfyUIModelService.removeModel(filename, category);
    log.info(`Removed ComfyUI model: ${filename} from ${category}`);
    return result;
  } catch (error) {
    log.error('Error removing ComfyUI model from container:', error);
    return { success: false, error: error.message };
  }
});

// Get ComfyUI model management status
ipcMain.handle('comfyui-internal:get-status', async () => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const status = await comfyUIModelService.getStatus();
    return { success: true, status };
  } catch (error) {
    log.error('Error getting ComfyUI service status:', error);
    return { success: false, error: error.message, status: null };
  }
});

// Search for models from external repositories
ipcMain.handle('comfyui-internal:search-models', async (event, { query, source = 'huggingface', category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const results = await comfyUIModelService.searchModels(query, source, category);
    return { success: true, results };
  } catch (error) {
    log.error('Error searching ComfyUI models:', error);
    return { success: false, error: error.message, results: null };
  }
});

// Backup models from container to host
ipcMain.handle('comfyui-internal:backup-models', async (event, { category = 'checkpoints', backupPath }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    // Use user data directory if no backup path specified
    if (!backupPath) {
      backupPath = path.join(app.getPath('userData'), 'comfyui_backups');
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }
    }
    
    const result = await comfyUIModelService.backupModels(category, backupPath);
    log.info(`ComfyUI models backed up: ${category} to ${result.backupFile}`);
    return result;
  } catch (error) {
    log.error('Error backing up ComfyUI models:', error);
    return { success: false, error: error.message };
  }
});

// ==============================================
// Enhanced Local Model Management
// ==============================================

// List locally stored persistent models
ipcMain.handle('comfyui-local:list-models', async (event, category = 'checkpoints') => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const models = await comfyUIModelService.listLocalModels(category);
    return { success: true, models };
  } catch (error) {
    log.error(`Error listing local ComfyUI ${category} models:`, error);
    return { success: false, error: error.message, models: [] };
  }
});

// Download model to local storage (persistent)
ipcMain.handle('comfyui-local:download-model', async (event, { url, filename, category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    log.info(`Starting local ComfyUI model download: ${filename} (${category}) from ${url}`);
    
    // Set up progress forwarding - fix the parameter format
    const progressHandler = (progress, downloadedSize, totalSize) => {
      const progressData = {
        filename,
        progress: Math.round(progress),
        downloadedSize,
        totalSize,
        speed: downloadedSize > 0 ? `${(downloadedSize / 1024 / 1024).toFixed(1)} MB/s` : '0 MB/s',
        eta: totalSize > 0 && downloadedSize > 0 ? `${Math.round((totalSize - downloadedSize) / (downloadedSize / 1000))}s` : 'Unknown'
      };
      event.sender.send('comfyui-local-download-progress', progressData);
    };
    
    // Set up event forwarding
    const eventHandlers = {
      'download:start': (data) => event.sender.send('comfyui-local-download-start', data),
      'download:complete': (data) => event.sender.send('comfyui-local-download-complete', data),
      'download:error': (data) => event.sender.send('comfyui-local-download-error', data),
      'download:progress': (data) => {
        // Also handle progress events from the service
        const progressData = {
          filename: data.filename || filename,
          progress: Math.round(data.progress || 0),
          downloadedSize: data.downloadedSize || 0,
          totalSize: data.totalSize || 0,
          speed: data.speed || '0 MB/s',
          eta: data.eta || 'Unknown'
        };
        event.sender.send('comfyui-local-download-progress', progressData);
      }
    };
    
    // Attach event listeners
    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      comfyUIModelService.on(eventName, handler);
    });
    
    try {
      const result = await comfyUIModelService.downloadModel(url, filename, category, progressHandler);
      
      // Clean up event listeners
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        comfyUIModelService.removeListener(eventName, handler);
      });
      
      return { success: true, ...result };
    } catch (error) {
      // Clean up event listeners on error
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        comfyUIModelService.removeListener(eventName, handler);
      });
      throw error;
    }
    
  } catch (error) {
    log.error('Error downloading ComfyUI model to local storage:', error);
    return {
      success: false,
      filename,
      category,
      error: error.message
    };
  }
});

// Delete local persistent model
ipcMain.handle('comfyui-local:delete-model', async (event, { filename, category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const result = await comfyUIModelService.deleteLocalModel(filename, category);
    log.info(`Deleted local ComfyUI model: ${filename} from ${category}`);
    return result;
  } catch (error) {
    log.error('Error deleting local ComfyUI model:', error);
    return { success: false, error: error.message };
  }
});

// Import external model file to persistent storage
ipcMain.handle('comfyui-local:import-model', async (event, { externalPath, filename, category = 'checkpoints' }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const result = await comfyUIModelService.importExternalModel(externalPath, filename, category);
    log.info(`Imported external ComfyUI model: ${filename} to ${category}`);
    return result;
  } catch (error) {
    log.error('Error importing external ComfyUI model:', error);
    return { success: false, error: error.message };
  }
});

// Get enhanced storage information (local + container)
ipcMain.handle('comfyui-local:get-storage-info', async () => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    const storageInfo = await comfyUIModelService.getEnhancedStorageInfo();
    return { success: true, storage: storageInfo };
  } catch (error) {
    log.error('Error getting enhanced ComfyUI storage info:', error);
    return { success: false, error: error.message, storage: null };
  }
});