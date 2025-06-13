const { app, BrowserWindow, ipcMain, dialog, systemPreferences, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsSync = require('fs');
const log = require('electron-log');
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
const { platformUpdateService } = require('./updateService.cjs');
const { debugPaths, logDebugInfo } = require('./debug-paths.cjs');

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
          message: 'Docker setup not initialized' 
        };
      }

      const dockerRunning = await dockerSetup.isDockerRunning();
      if (!dockerRunning) {
        return { 
          dockerAvailable: false, 
          n8nAvailable: false,
          pythonAvailable: false,
          message: 'Docker is not running' 
        };
      }

      const n8nRunning = await dockerSetup.checkN8NHealth().then(result => result.success).catch(() => false);
      const pythonRunning = await dockerSetup.isPythonRunning().catch(() => false);

      return {
        dockerAvailable: true,
        n8nAvailable: n8nRunning,
        pythonAvailable: pythonRunning,
        ports: dockerSetup.ports
      };
    } catch (error) {
      log.error('Error checking Docker services:', error);
      return { 
        dockerAvailable: false, 
        n8nAvailable: false,
        pythonAvailable: false,
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
}

async function initializeApp() {
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
    
    mcpService = new MCPService();
    updateService = platformUpdateService;
    
    // Initialize Docker setup
    dockerSetup = new DockerSetup();
    
    // Setup Docker environment (skip during build/CI if specified)
    if (process.env.SKIP_DOCKER_SETUP === 'true') {
      log.info('Skipping Docker setup due to SKIP_DOCKER_SETUP environment variable');
      loadingScreen.setStatus('Docker setup skipped. Some features may be limited.', 'info');
    } else {
      loadingScreen.setStatus('Setting up Docker environment...', 'info');
      const success = await dockerSetup.setup((status, type = 'info') => {
        loadingScreen.setStatus(status, type);
        
        // Only show error dialogs for critical errors, not Docker unavailability during startup
        if (type === 'error' && !status.includes('Docker is not running')) {
          dialog.showErrorBox('Setup Error', status);
        }
      });

      if (!success) {
        loadingScreen.setStatus('Docker not available. Some features may be limited.', 'warning');
        log.warn('Docker setup incomplete. Continuing without Docker services.');
        // Continue with app initialization even without Docker
      }
    }

    // Initialize llama-swap service
    loadingScreen.setStatus('Initializing LLM service...', 'info');
    try {
      // Start llama-swap service
      const llamaSwapSuccess = await llamaSwapService.start();
      if (llamaSwapSuccess) {
        loadingScreen.setStatus('LLM service started successfully', 'success');
        log.info('Llama-swap service started successfully');
      } else {
        loadingScreen.setStatus('LLM service failed to start (will be available for manual start)', 'warning');
        log.warn('Llama-swap service failed to start during initialization');
      }
    } catch (llamaSwapError) {
      loadingScreen.setStatus('LLM service initialization failed (will be available for manual start)', 'warning');
      log.error('Error initializing llama-swap service:', llamaSwapError);
    }

    // Initialize MCP service
    loadingScreen.setStatus('Initializing MCP service...', 'info');
    try {
      log.info('MCP service initialized successfully');
      loadingScreen.setStatus('MCP service initialized', 'success');
      
      // Auto-start previously running servers
      loadingScreen.setStatus('Restoring MCP servers...', 'info');
      try {
        const restoreResults = await mcpService.startPreviouslyRunningServers();
        const successCount = restoreResults.filter(r => r.success).length;
        const totalCount = restoreResults.length;
        
        if (totalCount > 0) {
          log.info(`Restored ${successCount}/${totalCount} previously running MCP servers`);
          loadingScreen.setStatus(`Restored ${successCount}/${totalCount} MCP servers`, successCount === totalCount ? 'success' : 'warning');
        } else {
          loadingScreen.setStatus('No MCP servers to restore', 'info');
        }
      } catch (restoreError) {
        log.error('Error restoring MCP servers:', restoreError);
        loadingScreen.setStatus('Failed to restore some MCP servers', 'warning');
      }
    } catch (mcpError) {
      loadingScreen.setStatus('MCP service initialization failed', 'warning');
      log.error('Error initializing MCP service:', mcpError);
    }

    // Initialize Watchdog service
    loadingScreen.setStatus('Initializing Watchdog service...', 'info');
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
      
      log.info('Watchdog service initialized and started successfully');
      loadingScreen.setStatus('Watchdog service started', 'success');
    } catch (watchdogError) {
      loadingScreen.setStatus('Watchdog service initialization failed', 'warning');
      log.error('Error initializing Watchdog service:', watchdogError);
    }

    // Setup complete, create the main window
    log.info('Services initialized. Creating main window...');
    loadingScreen.setStatus('Starting main application...', 'success');
    await createMainWindow();
    
  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    loadingScreen?.setStatus(`Error: ${error.message}`, 'error');
    
    // Don't show dialogs for Docker-related issues during startup - let the app continue
    if (error.message.includes('Docker is not running') || error.message.includes('Docker')) {
      log.warn('Docker-related error during startup, continuing without Docker services');
      loadingScreen?.setStatus('Docker not available. Some features may be limited.', 'warning');
      
      // Continue with app initialization
      setTimeout(async () => {
        await createMainWindow();
      }, 2000);
    } else {
      dialog.showErrorBox('Setup Error', error.message);
      // Keep loading screen open on error for a bit before quitting
      setTimeout(() => {
        loadingScreen?.close();
        app.quit();
      }, 4000);
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