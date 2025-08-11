const { app, BrowserWindow, ipcMain, dialog, systemPreferences, Menu, shell, protocol, globalShortcut, Tray, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const fsSync = require('fs');
const log = require('electron-log');
const https = require('https');
const http = require('http');
// const { pipeline } = require('stream/promises');
// const crypto = require('crypto');
// const { spawn } = require('child_process');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater, checkForUpdates, getUpdateInfo, checkLlamacppUpdates, updateLlamacppBinaries } = require('./updateService.cjs');
// const SplashScreen = require('./splash.cjs');
// const LoadingScreen = require('./loadingScreen.cjs');
const FeatureSelectionScreen = require('./featureSelection.cjs');
const { createAppMenu } = require('./menu.cjs');
const LlamaSwapService = require('./llamaSwapService.cjs');
const MCPService = require('./mcpService.cjs');
const WatchdogService = require('./watchdogService.cjs');
const ComfyUIModelService = require('./comfyUIModelService.cjs');
const PlatformManager = require('./platformManager.cjs');
const { platformUpdateService } = require('./updateService.cjs');
const { debugPaths, logDebugInfo } = require('./debug-paths.cjs');
const IPCLogger = require('./ipcLogger.cjs');
const WidgetService = require('./widgetService.cjs');

// NEW: Enhanced service management system (Backward compatible)
const CentralServiceManager = require('./centralServiceManager.cjs');
const ServiceConfigurationManager = require('./serviceConfiguration.cjs');
const { getPlatformCompatibility, getCompatibleServices } = require('./serviceDefinitions.cjs');

// Network Service Manager to prevent UI refreshes during crashes
const NetworkServiceManager = require('./networkServiceManager.cjs');

// Global helper functions for container configuration
// These functions can be called from anywhere and will create container configs if needed

// Helper function to get or create ComfyUI configuration
const getComfyUIConfig = () => {
  if (!dockerSetup) {
    throw new Error('Docker setup not initialized');
  }

  // Check if ComfyUI is supported on this platform
  if (process.platform !== 'win32') {
    throw new Error(`ComfyUI is not supported on ${process.platform}. It requires Windows with NVIDIA GPU support.`);
  }

  // Get ComfyUI configuration
  let comfyuiConfig = dockerSetup.containers.comfyui;
  
  // If ComfyUI config is not available (was filtered out during setup), create it
  if (!comfyuiConfig) {
    log.info('ComfyUI configuration not found in enabled containers, creating configuration...');
    comfyuiConfig = {
      name: 'clara_comfyui',
      image: dockerSetup.getArchSpecificImage('clara17verse/clara-comfyui', 'with-custom-nodes'),
      port: 8188,
      internalPort: 8188,
      healthCheck: dockerSetup.isComfyUIRunning.bind(dockerSetup),
      volumes: dockerSetup.getComfyUIVolumes(),
      environment: [
        'NVIDIA_VISIBLE_DEVICES=all',
        'CUDA_VISIBLE_DEVICES=0',
        'PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:2048,expandable_segments:True',
        'CUDA_LAUNCH_BLOCKING=0',
        'TORCH_CUDNN_V8_API_ENABLED=1',
        'CUDA_MODULE_LOADING=LAZY',
        'XFORMERS_MORE_DETAILS=0',
        'COMFYUI_FORCE_FP16=1',
        'COMFYUI_DISABLE_XFORMERS_WARNING=1',
        'COMFYUI_HIGHVRAM=1',
        'COMFYUI_DISABLE_MODEL_OFFLOAD=1',
        'COMFYUI_VRAM_USAGE=gpu-only'
      ],
      runtime: 'nvidia',
      restartPolicy: 'unless-stopped'
    };
    
    // Add the ComfyUI config back to the containers object
    dockerSetup.containers.comfyui = comfyuiConfig;
  }

  return comfyuiConfig;
};

// Helper function to get or create N8N configuration
const getN8NConfig = () => {
  if (!dockerSetup) {
    throw new Error('Docker setup not initialized');
  }

  // Get N8N configuration
  let n8nConfig = dockerSetup.containers.n8n;
  
  // If N8N config is not available (was filtered out during setup), create it
  if (!n8nConfig) {
    log.info('N8N configuration not found in enabled containers, creating configuration...');
    n8nConfig = {
      name: 'clara_n8n',
      image: dockerSetup.getArchSpecificImage('n8nio/n8n', 'latest'),
      port: 5678,
      internalPort: 5678,
      healthCheck: dockerSetup.checkN8NHealth.bind(dockerSetup),
      volumes: [
        `${require('path').join(require('os').homedir(), '.clara', 'n8n')}:/home/node/.n8n`
      ]
    };
    
    // Add the N8N config back to the containers object
    dockerSetup.containers.n8n = n8nConfig;
  }

  return n8nConfig;
};

// Helper function to get or create Python backend configuration
const getPythonConfig = () => {
  if (!dockerSetup) {
    throw new Error('Docker setup not initialized');
  }

  // Get Python configuration
  let pythonConfig = dockerSetup.containers.python;
  
  // If Python config is not available (was filtered out during setup), create it
  if (!pythonConfig) {
    log.info('Python backend configuration not found in enabled containers, creating configuration...');
    pythonConfig = {
      name: 'clara_python',
      image: dockerSetup.getArchSpecificImage('clara17verse/clara-backend', 'latest'),
      port: 5001,
      internalPort: 5000,
      healthCheck: dockerSetup.isPythonRunning.bind(dockerSetup),
      volumes: [
        // Mount the python_backend_data folder as the clara user's home directory
        `${dockerSetup.pythonBackendDataPath}:/home/clara`,
        // Keep backward compatibility for existing data paths
        'clara_python_models:/app/models'
      ],
      volumeNames: ['clara_python_models']
    };
    
    // Add the Python config back to the containers object
    dockerSetup.containers.python = pythonConfig;
  }

  return pythonConfig;
};

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

// Initialize IPC Logger
let ipcLogger;

// Wrap ipcMain.handle to log all IPC calls
const originalHandle = ipcMain.handle;
ipcMain.handle = function(channel, handler) {
  return originalHandle.call(this, channel, async (event, ...args) => {
    if (ipcLogger) {
      ipcLogger.logIPC(channel, args, 'incoming');
    }
    
    try {
      const result = await handler(event, ...args);
      if (ipcLogger) {
        ipcLogger.logIPC(channel, result, 'outgoing');
      }
      return result;
    } catch (error) {
      if (ipcLogger) {
        ipcLogger.logError(channel, error, 'outgoing');
      }
      throw error;
    }
  });
};

// Wrap ipcMain.on to log all IPC calls
const originalOn = ipcMain.on;
ipcMain.on = function(channel, handler) {
  return originalOn.call(this, channel, (event, ...args) => {
    if (ipcLogger) {
      ipcLogger.logIPC(channel, args, 'incoming');
    }
    
    try {
      const result = handler(event, ...args);
      return result;
    } catch (error) {
      if (ipcLogger) {
        ipcLogger.logError(channel, error, 'outgoing');
      }
      throw error;
    }
  });
};

// Initialize IPC Logger after app is ready
app.whenReady().then(() => {
  ipcLogger = new IPCLogger();
  ipcLogger.logSystem('Application started');
  
  // Initialize Network Service Manager to prevent UI refreshes during crashes
  networkServiceManager = new NetworkServiceManager();
  log.info('🛡️ Network Service Manager initialized');
});

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
let widgetService;

// NEW: Enhanced service management (Coexists with existing services)
let serviceConfigManager;
let centralServiceManager;

// Network Service Manager to prevent UI refreshes
let networkServiceManager;

// Track active downloads for stop functionality
const activeDownloads = new Map();

// Add tray-related variables at the top level
let tray = null;
let isQuitting = false;

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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.generateConfig();
      return { success: true, ...result };
    } catch (error) {
      log.error('Error regenerating llama-swap config:', error);
      return { success: false, error: error.message };
    }
  });

  // Download official llama-swap binary
  ipcMain.handle('download-official-llama-swap', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.downloadOfficialLlamaSwap();
      return { success: true, ...result };
    } catch (error) {
      log.error('Error downloading official llama-swap:', error);
      return { success: false, error: error.message };
    }
  });

  // Check for llama-swap updates
  ipcMain.handle('check-llama-swap-updates', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.checkForLlamaSwapUpdates();
      return { success: true, ...result };
    } catch (error) {
      log.error('Error checking llama-swap updates:', error);
      return { success: false, error: error.message };
    }
  });

  // Update llama-swap to latest version
  ipcMain.handle('update-llama-swap', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.updateLlamaSwap();
      return { success: true, ...result };
    } catch (error) {
      log.error('Error updating llama-swap:', error);
      return { success: false, error: error.message };
    }
  });

  // Get llama-swap version
  ipcMain.handle('get-llama-swap-version', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const version = await llamaSwapService.getLlamaSwapVersion();
      return { success: true, version };
    } catch (error) {
      log.error('Error getting llama-swap version:', error);
      return { success: false, error: error.message };
    }
  });

  // Run llama optimizer
  ipcMain.handle('run-llama-optimizer', async (event, preset) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.runLlamaOptimizer(preset);
      return result;
    } catch (error) {
      log.error('Error running llama optimizer:', error);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.loadPerformanceSettings();
      return result;
    } catch (error) {
      log.error('Error loading performance settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Create user consent file for watchdog service
  ipcMain.handle('createUserConsentFile', async (event, consentData) => {
    try {
      const userDataPath = app.getPath('userData');
      const consentFile = path.join(userDataPath, 'user-service-consent.json');
      
      // Ensure the consent data has all required fields
      const consentFileData = {
        hasConsented: consentData.hasConsented || false,
        services: consentData.services || {},
        timestamp: consentData.timestamp || new Date().toISOString(),
        onboardingVersion: consentData.onboardingVersion || '1.0'
      };
      
      fsSync.writeFileSync(consentFile, JSON.stringify(consentFileData, null, 2), 'utf8');
      log.info('User consent file created successfully:', consentFile);
      
      return { success: true, filePath: consentFile };
    } catch (error) {
      log.error('Error creating user consent file:', error);
      return { success: false, error: error.message };
    }
  });

  // Custom model path handlers
  ipcMain.handle('set-custom-model-path', async (event, customPath) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
      
      // Recursive function to scan directories for .gguf files
      async function scanDirectoryRecursive(dirPath, maxDepth = 10, currentDepth = 0) {
        // Prevent infinite recursion in case of symlinks or very deep folder structures
        if (currentDepth >= maxDepth) {
          log.warn(`Maximum depth (${maxDepth}) reached while scanning ${dirPath}`);
          return;
        }

        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          // First pass: collect all .gguf files and subdirectories in current directory
          const ggufFiles = [];
          const subdirectories = [];
          
          for (const entry of entries) {
            const fullPath = pathModule.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
              subdirectories.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.gguf')) {
              ggufFiles.push({ name: entry.name, path: fullPath });
            }
          }
          
          // Process multi-part models in current directory
          const processedFiles = new Set();
          const multiPartGroups = new Map();
          
          // Group multi-part files
          ggufFiles.forEach(file => {
            // Pattern: filename-00001-of-00002.gguf
            const multiPartMatch = file.name.match(/^(.+)-(\d+)-of-(\d+)\.gguf$/);
            if (multiPartMatch) {
              const [, baseName, partNum, totalParts] = multiPartMatch;
              const key = `${baseName}-${totalParts}`;
              
              if (!multiPartGroups.has(key)) {
                multiPartGroups.set(key, {
                  baseName,
                  totalParts: parseInt(totalParts),
                  parts: new Map()
                });
              }
              
              multiPartGroups.get(key).parts.set(parseInt(partNum), file);
            }
          });
          
          // Validate and add complete multi-part models
          for (const [key, group] of multiPartGroups) {
            const { baseName, totalParts, parts } = group;
            
            // Check if all parts are present
            let allPartsPresent = true;
            for (let i = 1; i <= totalParts; i++) {
              if (!parts.has(i)) {
                allPartsPresent = false;
                log.warn(`Multi-part model ${baseName} is incomplete: missing part ${i} of ${totalParts}`);
                break;
              }
            }
            
            if (allPartsPresent) {
              // Add only the first part as the model entry
              const firstPart = parts.get(1);
              try {
                const stats = await fs.stat(firstPart.path);
                
                // Calculate relative path from the root scan directory for better organization
                const relativePath = pathModule.relative(path, firstPart.path);
                const folderHint = pathModule.dirname(relativePath) === '.' ? '' : `(${pathModule.dirname(relativePath)})`;
                
                models.push({
                  name: firstPart.name.replace('.gguf', ''),
                  file: firstPart.name,
                  path: firstPart.path,
                  relativePath: relativePath,
                  folderHint: folderHint,
                  size: stats.size,
                  source: 'custom',
                  lastModified: stats.mtime,
                  isMultiPart: true,
                  totalParts: totalParts
                });
                
                // Mark all parts as processed
                for (const part of parts.values()) {
                  processedFiles.add(part.name);
                }
                
                log.info(`Added complete multi-part model: ${baseName} (${totalParts} parts)`);
              } catch (error) {
                log.warn(`Error reading stats for multi-part model ${firstPart.path}:`, error);
              }
            } else {
              // Mark incomplete multi-part files as processed (so they won't be added as single files)
              for (const part of parts.values()) {
                processedFiles.add(part.name);
              }
            }
          }
          
          // Add single-part .gguf files that aren't part of multi-part models
          for (const file of ggufFiles) {
            if (!processedFiles.has(file.name)) {
              try {
                const stats = await fs.stat(file.path);
                
                // Calculate relative path from the root scan directory for better organization
                const relativePath = pathModule.relative(path, file.path);
                const folderHint = pathModule.dirname(relativePath) === '.' ? '' : `(${pathModule.dirname(relativePath)})`;
                
                models.push({
                  name: file.name.replace('.gguf', ''),
                  file: file.name,
                  path: file.path,
                  relativePath: relativePath,
                  folderHint: folderHint,
                  size: stats.size,
                  source: 'custom',
                  lastModified: stats.mtime,
                  isMultiPart: false
                });
              } catch (error) {
                log.warn(`Error reading stats for ${file.path}:`, error);
              }
            }
          }
          
          // Recursively scan subdirectories
          for (const subdirPath of subdirectories) {
            await scanDirectoryRecursive(subdirPath, maxDepth, currentDepth + 1);
          }
          
        } catch (error) {
          // Log but don't fail completely if we can't read a specific directory
          log.warn(`Error reading directory ${dirPath}:`, error);
        }
      }
      
      try {
        // Check if the path exists and is accessible
        if (await fs.access(path).then(() => true).catch(() => false)) {
          await scanDirectoryRecursive(path);
        } else {
          return { success: false, error: 'Directory is not accessible' };
        }
      } catch (error) {
        log.warn(`Error scanning models in ${path}:`, error);
        return { success: false, error: error.message };
      }

      // Sort models by folder structure and then by name for better organization
      models.sort((a, b) => {
        const folderCompare = (a.folderHint || '').localeCompare(b.folderHint || '');
        if (folderCompare !== 0) return folderCompare;
        return a.file.localeCompare(b.file);
      });

      return { success: true, models };
    } catch (error) {
      log.error('Error scanning custom path models:', error);
      return { success: false, error: error.message };
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

  // Get model embedding information with mmproj compatibility
  ipcMain.handle('get-model-embedding-info', async (event, modelPath) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const embeddingInfo = await llamaSwapService.getModelEmbeddingInfo(modelPath);
      return { success: true, ...embeddingInfo };
    } catch (error) {
      log.error('Error getting model embedding info:', error);
      return { success: false, error: error.message };
    }
  });

  // Search Hugging Face for compatible mmproj files
  ipcMain.handle('search-huggingface-mmproj', async (event, modelName, embeddingSize) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const results = await llamaSwapService.searchHuggingFaceForMmproj(modelName, embeddingSize);
      return { success: true, results };
    } catch (error) {
      log.error('Error searching Hugging Face for mmproj files:', error);
      return { success: false, error: error.message, results: [] };
    }
  });

  // Save mmproj mappings to backend storage
  ipcMain.handle('save-mmproj-mappings', async (event, mappings) => {
    try {
      log.info('🔍 save-mmproj-mappings handler called with mappings:', mappings);
      
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      log.info('🔍 Calling llamaSwapService.saveMmprojMappings...');
      const result = await llamaSwapService.saveMmprojMappings(mappings);
      log.info('🔍 LlamaSwapService save result:', result);
      
      return { success: true, result };
    } catch (error) {
      log.error('❌ Error saving mmproj mappings:', error);
      return { success: false, error: error.message };
    }
  });

  // Load mmproj mappings from backend storage
  ipcMain.handle('load-mmproj-mappings', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const mappings = await llamaSwapService.loadMmprojMappings();
      return { success: true, mappings };
    } catch (error) {
      log.error('Error loading mmproj mappings:', error);
      return { success: false, error: error.message, mappings: {} };
    }
  });

  // Get available mmproj files from the file system
  ipcMain.handle('get-available-mmproj-files', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.getAvailableMmprojFiles();
      return result;
    } catch (error) {
      log.error('Error getting available mmproj files:', error);
      return { success: false, error: error.message, mmprojFiles: [] };
    }
  });

  // Restart llamaSwap service to apply configuration changes (e.g., mmproj mappings)
  ipcMain.handle('restart-llamaswap', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      // Stop the current service
      await llamaSwapService.stop();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Regenerate config with updated mmproj mappings
      try {
        const configResult = await llamaSwapService.generateConfig();
        log.info('Config regenerated successfully:', configResult);
      } catch (configError) {
        log.warn('Config regeneration had issues:', configError.message);
      }
      
      // Start the service again
      const result = await llamaSwapService.start();
      return { 
        success: result.success, 
        message: result.message || 'Service restarted successfully',
        error: result.error 
      };
    } catch (error) {
      log.error('Error restarting llamaSwap service:', error);
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

  // NEW: Configuration override IPC handlers
  
  // Get available GPU backends/engines
  ipcMain.handle('get-available-backends', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = llamaSwapService.getAvailableBackends();
      return result;
    } catch (error) {
      log.error('Error getting available backends:', error);
      return { success: false, error: error.message, backends: [] };
    }
  });

  // Set/override backend/engine selection
  ipcMain.handle('set-backend-override', async (event, backendId) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.setBackendOverride(backendId);
      return result;
    } catch (error) {
      log.error('Error setting backend override:', error);
      return { success: false, error: error.message };
    }
  });

  // Get current backend override setting
  ipcMain.handle('get-backend-override', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.getBackendOverride();
      return result;
    } catch (error) {
      log.error('Error getting backend override:', error);
      return { success: false, error: error.message, backendId: null, isOverridden: false };
    }
  });

  // Get current configuration as JSON (converted from YAML)
  ipcMain.handle('get-config-as-json', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.getConfigAsJson();
      return result;
    } catch (error) {
      log.error('Error getting config as JSON:', error);
      return { success: false, error: error.message, config: null };
    }
  });

  // Force reconfigure the service with current settings and overrides
  ipcMain.handle('force-reconfigure', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.forceReconfigure();
      return result;
    } catch (error) {
      log.error('Error during force reconfiguration:', error);
      return { success: false, error: error.message };
    }
  });

  // Get comprehensive configuration information for UI
  ipcMain.handle('get-configuration-info', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.getConfigurationInfo();
      return result;
    } catch (error) {
      log.error('Error getting configuration info:', error);
      return { success: false, error: error.message };
    }
  });

  // Save configuration from JSON (converted to YAML)
  ipcMain.handle('save-config-from-json', async (event, jsonConfig) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.saveConfigFromJson(jsonConfig);
      return result;
    } catch (error) {
      log.error('Error saving config from JSON:', error);
      return { success: false, error: error.message };
    }
  });

  // Save configuration and restart service
  ipcMain.handle('save-config-and-restart', async (event, jsonConfig) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.saveConfigAndRestart(jsonConfig);
      return result;
    } catch (error) {
      log.error('Error saving config and restarting:', error);
      return { success: false, error: error.message };
    }
  });

  // Regenerate configuration
  ipcMain.handle('regenerate-config', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.regenerateConfig();
      return result;
    } catch (error) {
      log.error('Error regenerating config:', error);
      return { success: false, error: error.message };
    }
  });

  // Get model configurations with native context sizes
  ipcMain.handle('get-model-configurations', async () => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.getModelConfigurations();
      return result;
    } catch (error) {
      log.error('Error getting model configurations:', error);
      return { success: false, error: error.message };
    }
  });

  // Save configuration for a specific model
  ipcMain.handle('save-model-configuration', async (event, modelName, modelConfig) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.saveModelConfiguration(modelName, modelConfig);
      return result;
    } catch (error) {
      log.error('Error saving model configuration:', error);
      return { success: false, error: error.message };
    }
  });

  // Save configurations for all models
  ipcMain.handle('save-all-model-configurations', async (event, modelConfigs) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.saveAllModelConfigurations(modelConfigs);
      return result;
    } catch (error) {
      log.error('Error saving all model configurations:', error);
      return { success: false, error: error.message };
    }
  });

  // Load individual model configurations from persistent storage
  ipcMain.handle('load-individual-model-configurations', async (event) => {
    try {
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      const result = await llamaSwapService.loadIndividualModelConfigurations();
      return result;
    } catch (error) {
      log.error('Error loading individual model configurations:', error);
      return { success: false, error: error.message };
    }
  });

  // Legacy alias for restart-llamaswap (for backward compatibility)
  ipcMain.handle('restart-llamaswap-with-overrides', async () => {
    try {
      log.info('🔄 Starting service restart with backend overrides...');
      
      if (!llamaSwapService) {
        llamaSwapService = new LlamaSwapService(ipcLogger);
      }
      
      // Check current backend override
      const currentOverride = await llamaSwapService.getBackendOverride();
      if (currentOverride.success && currentOverride.backendId) {
        log.info(`🎯 Backend override detected: ${currentOverride.backendId}`);
      } else {
        log.info('🎯 No backend override - using auto-detection');
      }
      
      // Stop the current service
      log.info('🛑 Stopping current service...');
      await llamaSwapService.stop();
      log.info('✅ Service stopped successfully');
      
      // Wait a moment for cleanup
      log.info('⏳ Waiting for cleanup...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force reconfigure to apply any overrides
      try {
        log.info('🔧 Regenerating configuration with backend overrides...');
        const configResult = await llamaSwapService.forceReconfigure();
        log.info('✅ Configuration updated with overrides:', configResult);
      } catch (configError) {
        log.warn('⚠️ Config regeneration had issues:', configError.message);
      }
      
      // Start the service again
      log.info('🚀 Starting service with new configuration...');
      const result = await llamaSwapService.start();
      
      if (result.success) {
        log.info('✅ Service restarted successfully with backend overrides!');
      } else {
        log.error('❌ Service restart failed:', result.error);
      }
      
      return { 
        success: result.success, 
        message: result.message || 'Service restarted with overrides successfully',
        error: result.error 
      };
    } catch (error) {
      log.error('❌ Error restarting llamaSwap service with overrides:', error);
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
    return downloadSingleFileWithRename(modelId, fileName, fileName, modelsDir);
  }

  async function downloadSingleFileWithRename(modelId, sourceFileName, targetFileName, modelsDir) {
    const fs = require('fs');
    const https = require('https');
    const http = require('http');
    const path = require('path');
    
    const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${sourceFileName}`;
    const filePath = path.join(modelsDir, targetFileName);
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'File already exists' };
    }
    
    log.info(`Starting download: ${downloadUrl} -> ${filePath}`);
    
    return new Promise((resolve) => {
      const protocol = downloadUrl.startsWith('https:') ? https : http;
      const file = fs.createWriteStream(filePath);
      let stopped = false;
      
      // Store download info for stop functionality (use target filename for tracking)
      const downloadInfo = {
        request: null,
        file,
        filePath,
        stopped: false
      };
      activeDownloads.set(targetFileName, downloadInfo);
      
      const cleanup = () => {
        activeDownloads.delete(targetFileName);
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
                
                // Send progress update to renderer (use targetFileName for UI tracking)
                if (mainWindow) {
                  mainWindow.webContents.send('download-progress', {
                    fileName: targetFileName,
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
                  activeDownloads.delete(targetFileName);
                  log.info(`Download completed: ${filePath}`);
                  
                  // Send final progress update (use targetFileName for UI tracking)
                  if (mainWindow) {
                    mainWindow.webContents.send('download-progress', {
                      fileName: targetFileName,
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
            
            // Send progress update to renderer (use targetFileName for UI tracking)
            if (mainWindow) {
              mainWindow.webContents.send('download-progress', {
                fileName: targetFileName,
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
              activeDownloads.delete(targetFileName);
              log.info(`Download completed: ${filePath}`);
              
              // Send final progress update (use targetFileName for UI tracking)
              if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                  fileName: targetFileName,
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
  ipcMain.handle('search-huggingface-models', async (_event, { query, limit = 20, sort = 'lastModified' }) => {
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
      
      // Support different sorting options for truly latest models
      const sortOptions = {
        'lastModified': 'lastModified',
        'createdAt': 'createdAt', 
        'trending': 'downloads',      // Map trending to downloads since HF API doesn't support trending
        'downloads': 'downloads',
        'likes': 'likes'
      };
      
      const sortParam = sortOptions[sort] || 'lastModified';
      const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=${limit}&sort=${sortParam}&full=true`;
      
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
        createdAt: model.createdAt || null,
        lastModified: model.lastModified || null,
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

      // Check if this is a vision model by name patterns
      const isVision = isVisionModelByName(fileName);
      
      // Find required mmproj files from the repository
      const mmprojFiles = allFiles.filter(file => 
        file.rfilename.toLowerCase().includes('mmproj') ||
        file.rfilename.toLowerCase().includes('mm-proj') ||
        file.rfilename.toLowerCase().includes('projection')
      );
      
      log.info(`🔍 Vision detection - isVision: ${isVision}, mmproj files found: ${mmprojFiles.length}`);
      if (mmprojFiles.length > 0) {
        log.info(`📁 Available mmproj files:`, mmprojFiles.map(f => f.rfilename));
      }
      
      const filesToDownload = [fileName];
      
      // Download mmproj files if they exist (regardless of main model name detection)
      // This ensures we don't miss vision capabilities due to naming variations
      if (mmprojFiles.length > 0) {
        // Always download all mmproj files when available
        mmprojFiles.forEach(mmprojFile => {
          filesToDownload.push(mmprojFile.rfilename);
          log.info(`👁️ Adding mmproj file to download queue: ${mmprojFile.rfilename}`);
        });
        
        log.info(`🎯 Total files to download: ${filesToDownload.length} (1 model + ${mmprojFiles.length} mmproj)`);
      } else if (isVision) {
        log.warn(`⚠️ Vision model detected by name but no mmproj files found in repository`);
      }
      
      // Download all required files
      const results = [];
      for (const file of filesToDownload) {
        try {
          // Download file with its original name (no renaming needed)
          log.info(`📥 Starting download: ${file}`);
          
          // Send download start notification
          if (mainWindow) {
            mainWindow.webContents.send('download-started', {
              fileName: file,
              modelId,
              isVisionFile: file.toLowerCase().includes('mmproj')
            });
          }
          
          const result = await downloadSingleFile(modelId, file, modelsDir);
          results.push({ file, success: result.success, error: result.error });
          
          // Send download completion notification
          if (mainWindow) {
            mainWindow.webContents.send('download-completed', {
              fileName: file,
              modelId,
              success: result.success,
              error: result.error,
              isVisionFile: file.toLowerCase().includes('mmproj')
            });
          }
          
          log.info(`📥 Download ${result.success ? 'completed' : 'failed'}: ${file}${result.error ? ` (${result.error})` : ''}`);
        } catch (error) {
          log.error('Error in download loop for file:', file, error);
          results.push({ file, success: false, error: error.message });
          
          // Send download error notification
          if (mainWindow) {
            mainWindow.webContents.send('download-completed', {
              fileName: file,
              modelId,
              success: false,
              error: error.message,
              isVisionFile: file.toLowerCase().includes('mmproj')
            });
          }
        }
      }
      
      // Check if main model downloaded successfully (it should still have original fileName)
      const mainResult = results.find(r => r.file === fileName);
      log.info(`Main result check: looking for ${fileName} in results:`, results.map(r => r.file));
      log.info(`Main result found:`, mainResult);
      
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
      
      const returnValue = { 
        success: mainResult?.success || false, 
        results,
        downloadedFiles: results.filter(r => r.success).map(r => r.file)
      };
      
      log.info(`Returning from download-model-with-dependencies:`, returnValue);
      return returnValue;
      
    } catch (error) {
      log.error('Error downloading model with dependencies:', error);
      log.error('Error stack:', error.stack);
      return { success: false, error: error.message || 'Unknown error occurred' };
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

  // Download model from Hugging Face with custom save name
  ipcMain.handle('download-huggingface-model-with-custom-name', async (_event, { modelId, fileName, customSaveName, downloadPath }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Use custom download path if provided, otherwise use default
      const modelsDir = downloadPath || path.join(os.homedir(), '.clara', 'llama-models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      log.info(`🎯 Starting custom name download: ${fileName} → ${customSaveName}`);
      
      // Use the existing downloadSingleFileWithRename function
      const result = await downloadSingleFileWithRename(modelId, fileName, customSaveName, modelsDir);
      
      if (result.success) {
        log.info(`✅ Custom name download completed: ${customSaveName}`);
        
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
      
      return result;
    } catch (error) {
      log.error('Error downloading model with custom name:', error);
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
        llamaSwapService = new LlamaSwapService(ipcLogger);
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
      
      // Security check - ensure file is in a valid model directory
      const defaultModelsDir = path.join(os.homedir(), '.clara', 'llama-models');
      const normalizedPath = path.resolve(filePath);
      const normalizedDefaultDir = path.resolve(defaultModelsDir);
      
      let isValidPath = normalizedPath.startsWith(normalizedDefaultDir);
      
      // Also check custom model paths if LlamaSwapService is available
      if (!isValidPath && llamaSwapService) {
        const customPaths = llamaSwapService.getCustomModelPaths();
        for (const customPath of customPaths) {
          if (customPath) {
            const normalizedCustomDir = path.resolve(customPath);
            if (normalizedPath.startsWith(normalizedCustomDir)) {
              isValidPath = true;
              break;
            }
          }
        }
      }
      
      if (!isValidPath) {
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
  // Helper function to ensure MCP service is initialized
  function ensureMCPService() {
    if (!mcpService) {
      log.info('MCP service not initialized, creating new instance...');
      mcpService = new MCPService();
    }
    return mcpService;
  }

  // Helper function to ensure Service Config Manager is initialized
  function ensureServiceConfigManager() {
    if (!serviceConfigManager) {
      log.info('Service config manager not initialized, creating new instance...');
      try {
        serviceConfigManager = new ServiceConfigurationManager();
        if (!centralServiceManager) {
          centralServiceManager = new CentralServiceManager(serviceConfigManager);
          
          const { SERVICE_DEFINITIONS } = require('./serviceDefinitions.cjs');
          Object.keys(SERVICE_DEFINITIONS).forEach(serviceName => {
            const serviceDefinition = SERVICE_DEFINITIONS[serviceName];
            centralServiceManager.registerService(serviceName, serviceDefinition);
          });
        }
      } catch (error) {
        log.warn('Failed to initialize service config manager:', error);
        return null;
      }
    }
    return serviceConfigManager;
  }

  // Get all MCP servers
  ipcMain.handle('mcp-get-servers', async () => {
    try {
      const service = ensureMCPService();
      return service.getAllServers();
    } catch (error) {
      log.error('Error getting MCP servers:', error);
      return [];
    }
  });

  // Add MCP server
  ipcMain.handle('mcp-add-server', async (event, serverConfig) => {
    try {
      const service = ensureMCPService();
      return await service.addServer(serverConfig);
    } catch (error) {
      log.error('Error adding MCP server:', error);
      throw error;
    }
  });

  // Remove MCP server
  ipcMain.handle('mcp-remove-server', async (event, name) => {
    try {
      const service = ensureMCPService();
      return await service.removeServer(name);
    } catch (error) {
      log.error('Error removing MCP server:', error);
      throw error;
    }
  });

  // Update MCP server
  ipcMain.handle('mcp-update-server', async (event, name, updates) => {
    try {
      const service = ensureMCPService();
      return await service.updateServer(name, updates);
    } catch (error) {
      log.error('Error updating MCP server:', error);
      throw error;
    }
  });

  // Start MCP server
  ipcMain.handle('mcp-start-server', async (event, name) => {
    try {
      const service = ensureMCPService();
      const serverInfo = await service.startServer(name);
      
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
      const service = ensureMCPService();
      return await service.stopServer(name);
    } catch (error) {
      log.error('Error stopping MCP server:', error);
      throw error;
    }
  });

  // Restart MCP server
  ipcMain.handle('mcp-restart-server', async (event, name) => {
    try {
      const service = ensureMCPService();
      const serverInfo = await service.restartServer(name);
      
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
      const service = ensureMCPService();
      return service.getServerStatus(name);
    } catch (error) {
      log.error('Error getting MCP server status:', error);
      return null;
    }
  });

  // Test MCP server
  ipcMain.handle('mcp-test-server', async (event, name) => {
    try {
      const service = ensureMCPService();
      return await service.testServer(name);
    } catch (error) {
      log.error('Error testing MCP server:', error);
      return { success: false, error: error.message };
    }
  });

  // Get MCP server templates
  ipcMain.handle('mcp-get-templates', async () => {
    try {
      const service = ensureMCPService();
      return service.getServerTemplates();
    } catch (error) {
      log.error('Error getting MCP templates:', error);
      return [];
    }
  });

  // Start all enabled MCP servers
  ipcMain.handle('mcp-start-all-enabled', async () => {
    try {
      const service = ensureMCPService();
      return await service.startAllEnabledServers();
    } catch (error) {
      log.error('Error starting all enabled MCP servers:', error);
      throw error;
    }
  });

  // Stop all MCP servers
  ipcMain.handle('mcp-stop-all', async () => {
    try {
      const service = ensureMCPService();
      return await service.stopAllServers();
    } catch (error) {
      log.error('Error stopping all MCP servers:', error);
      throw error;
    }
  });

  // Import from Claude Desktop config
  ipcMain.handle('mcp-import-claude-config', async (event, configPath) => {
    try {
      const service = ensureMCPService();
      return await service.importFromClaudeConfig(configPath);
    } catch (error) {
      log.error('Error importing Claude config:', error);
      throw error;
    }
  });

  // Start previously running servers
  ipcMain.handle('mcp-start-previously-running', async () => {
    try {
      const service = ensureMCPService();
      return await service.startPreviouslyRunningServers();
    } catch (error) {
      log.error('Error starting previously running MCP servers:', error);
      throw error;
    }
  });

  // Save current running state
  ipcMain.handle('mcp-save-running-state', async () => {
    try {
      const service = ensureMCPService();
      service.saveRunningState();
      return true;
    } catch (error) {
      log.error('Error saving MCP server running state:', error);
      throw error;
    }
  });

  // Execute MCP tool call
  ipcMain.handle('mcp-execute-tool', async (event, toolCall) => {
    try {
      const service = ensureMCPService();
      return await service.executeToolCall(toolCall);
    } catch (error) {
      log.error('Error executing MCP tool call:', error);
      throw error;
    }
  });

  // Diagnose Node.js installation
  ipcMain.handle('mcp-diagnose-node', async () => {
    try {
      const service = ensureMCPService();
      return await service.diagnoseNodeInstallation();
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

// NEW: Register service configuration IPC handlers (Backward compatible)
function registerServiceConfigurationHandlers() {
  console.log('[main] Registering service configuration IPC handlers...');
  
  // Get platform compatibility information
  ipcMain.handle('service-config:get-platform-compatibility', async () => {
    try {
      return getPlatformCompatibility();
    } catch (error) {
      log.error('Error getting platform compatibility:', error);
      return {};
    }
  });
  
  // Get all service configurations
  ipcMain.handle('service-config:get-all-configs', async () => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.getConfigSummary !== 'function') {
        return {};
      }
      return serviceConfigManager.getConfigSummary();
    } catch (error) {
      log.error('Error getting service configurations:', error);
      return {};
    }
  });
  
  // Set service configuration (mode and URL)
  ipcMain.handle('service-config:set-config', async (event, serviceName, mode, url = null) => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.setServiceConfig !== 'function') {
        throw new Error('Service configuration manager not initialized or setServiceConfig method not available');
      }
      
      serviceConfigManager.setServiceConfig(serviceName, mode, url);
      log.info(`Service ${serviceName} configured: mode=${mode}${url ? `, url=${url}` : ''}`);
      
      return { success: true };
    } catch (error) {
      log.error(`Error setting service configuration for ${serviceName}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Alias for onboarding compatibility
  ipcMain.handle('service-config:set-manual-url', async (event, serviceName, url) => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.setServiceConfig !== 'function') {
        throw new Error('Service configuration manager not initialized or setServiceConfig method not available');
      }
      
      serviceConfigManager.setServiceConfig(serviceName, 'manual', url);
      log.info(`Service ${serviceName} configured with manual URL: ${url}`);
      
      return { success: true };
    } catch (error) {
      log.error(`Error setting manual URL for ${serviceName}:`, error);
      return { success: false, error: error.message };
    }
  });
  
  // Test manual service connectivity
  ipcMain.handle('service-config:test-manual-service', async (event, serviceName, url, healthEndpoint = '/') => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.testManualService !== 'function') {
        throw new Error('Service configuration manager not initialized or testManualService method not available');
      }
      
      const result = await serviceConfigManager.testManualService(serviceName, url, healthEndpoint);
      return result;
    } catch (error) {
      log.error(`Error testing manual service ${serviceName}:`, error);
      return { 
        success: false, 
        error: error.message, 
        timestamp: Date.now() 
      };
    }
  });
  
  // Get supported deployment modes for a service
  ipcMain.handle('service-config:get-supported-modes', async (event, serviceName) => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.getSupportedModes !== 'function') {
        return ['docker']; // Default fallback
      }
      
      return serviceConfigManager.getSupportedModes(serviceName);
    } catch (error) {
      log.error(`Error getting supported modes for ${serviceName}:`, error);
      return ['docker'];
    }
  });
  
  // Reset service configuration to defaults
  ipcMain.handle('service-config:reset-config', async (event, serviceName) => {
    try {
      if (!serviceConfigManager || typeof serviceConfigManager.removeServiceConfig !== 'function') {
        throw new Error('Service configuration manager not initialized or removeServiceConfig method not available');
      }
      
      serviceConfigManager.removeServiceConfig(serviceName);
      log.info(`Service ${serviceName} configuration reset to defaults`);
      
      return { success: true };
    } catch (error) {
      log.error(`Error resetting service configuration for ${serviceName}:`, error);
      return { success: false, error: error.message };
    }
  });
  
  // Get enhanced service status (includes deployment mode info)
  let lastLoggedServiceStatus = '';
  ipcMain.handle('service-config:get-enhanced-status', async () => {
    try {
      if (!centralServiceManager) {
        log.warn('⚠️  Central service manager not available, returning empty status');
        return {};
      }
      
      const status = centralServiceManager.getServicesStatus();
      
      // Only log if meaningful status has changed (exclude dynamic fields like uptime, lastHealthCheck)
      const stableStatus = {};
      for (const [serviceName, serviceStatus] of Object.entries(status)) {
        stableStatus[serviceName] = {
          state: serviceStatus.state,
          deploymentMode: serviceStatus.deploymentMode,
          restartAttempts: serviceStatus.restartAttempts,
          serviceUrl: serviceStatus.serviceUrl,
          isManual: serviceStatus.isManual,
          canRestart: serviceStatus.canRestart,
          supportedModes: serviceStatus.supportedModes,
          lastError: serviceStatus.lastError
        };
      }
      
      const stableStatusString = JSON.stringify(stableStatus);
      if (stableStatusString !== lastLoggedServiceStatus) {
        log.info('📊 Enhanced service status changed:', stableStatus);
        lastLoggedServiceStatus = stableStatusString;
      }
      
      return status;
    } catch (error) {
      log.error('Error getting enhanced service status:', error);
      return {};
    }
  });
  
  console.log('[main] Service configuration IPC handlers registered successfully');
}

// Register widget service IPC handlers
function registerWidgetServiceHandlers() {
  // Initialize widget service
  ipcMain.handle('widget-service:init', async () => {
    try {
      if (!widgetService) {
        widgetService = new WidgetService();
        log.info('Widget service initialized');
      }
      return { success: true };
    } catch (error) {
      log.error('Error initializing widget service:', error);
      return { success: false, error: error.message };
    }
  });

  // Register a widget as active
  ipcMain.handle('widget-service:register-widget', async (event, widgetType) => {
    try {
      if (!widgetService) {
        widgetService = new WidgetService();
      }
      
      widgetService.registerWidget(widgetType);
      const status = await widgetService.getStatus();
      return { success: true, status };
    } catch (error) {
      log.error('Error registering widget:', error);
      return { success: false, error: error.message };
    }
  });

  // Unregister a widget
  ipcMain.handle('widget-service:unregister-widget', async (event, widgetType) => {
    try {
      if (!widgetService) {
        return { success: true, status: { running: false, activeWidgets: [] } };
      }
      
      widgetService.unregisterWidget(widgetType);
      const status = await widgetService.getStatus();
      return { success: true, status };
    } catch (error) {
      log.error('Error unregistering widget:', error);
      return { success: false, error: error.message };
    }
  });

  // Get widget service status
  ipcMain.handle('widget-service:get-status', async () => {
    try {
      if (!widgetService) {
        return { 
          success: true, 
          status: { 
            running: false, 
            port: 8765, 
            activeWidgets: [], 
            shouldRun: false 
          } 
        };
      }
      
      const status = await widgetService.getStatus();
      return { success: true, status };
    } catch (error) {
      log.error('Error getting widget service status:', error);
      return { success: false, error: error.message };
    }
  });

  // Start widget service manually
  ipcMain.handle('widget-service:start', async () => {
    try {
      if (!widgetService) {
        widgetService = new WidgetService();
      }
      
      const result = await widgetService.startService();
      return result;
    } catch (error) {
      log.error('Error starting widget service:', error);
      return { success: false, error: error.message };
    }
  });

  // Stop widget service manually
  ipcMain.handle('widget-service:stop', async () => {
    try {
      if (!widgetService) {
        return { success: true, message: 'Service not running' };
      }
      
      const result = await widgetService.stopService();
      return result;
    } catch (error) {
      log.error('Error stopping widget service:', error);
      return { success: false, error: error.message };
    }
  });

  // Restart widget service
  ipcMain.handle('widget-service:restart', async () => {
    try {
      if (!widgetService) {
        widgetService = new WidgetService();
      }
      
      const result = await widgetService.restartService();
      return result;
    } catch (error) {
      log.error('Error restarting widget service:', error);
      return { success: false, error: error.message };
    }
  });

  // Manage service based on active widgets
  ipcMain.handle('widget-service:manage', async () => {
    try {
      if (!widgetService) {
        widgetService = new WidgetService();
      }
      
      const result = await widgetService.manageService();
      return { success: true, status: result };
    } catch (error) {
      log.error('Error managing widget service:', error);
      return { success: false, error: error.message };
    }
  });

  // Get service health status
  ipcMain.handle('widget-service:health', async () => {
    try {
      if (!widgetService) {
        return { success: true, healthy: false };
      }
      
      const healthy = await widgetService.isServiceRunning();
      return { success: true, healthy };
    } catch (error) {
      log.error('Error checking widget service health:', error);
      return { success: false, error: error.message, healthy: false };
    }
  });

  log.info('Widget service IPC handlers registered');
}

// Register N8N specific IPC handlers
function registerN8NHandlers() {
  // Check Docker status
  ipcMain.handle('n8n:check-docker-status', async () => {
    try {
      if (!dockerSetup) {
        return { dockerRunning: false, error: 'Docker setup not initialized' };
      }
      
      const dockerRunning = await dockerSetup.isDockerRunning();
      return { dockerRunning };
    } catch (error) {
      log.error('Error checking Docker status:', error);
      return { dockerRunning: false, error: error.message };
    }
  });

  // Check N8N service status
  ipcMain.handle('n8n:check-service-status', async () => {
    try {
      if (!dockerSetup) {
        return { running: false, error: 'Docker setup not initialized' };
      }

      // Check service configuration mode
      let n8nRunning = false;
      let serviceUrl = 'http://localhost:5678';
      
      if (serviceConfigManager && typeof serviceConfigManager.getServiceMode === 'function') {
        try {
          const n8nMode = serviceConfigManager.getServiceMode('n8n');
          if (n8nMode === 'manual' && typeof serviceConfigManager.getServiceUrl === 'function') {
            const n8nUrl = serviceConfigManager.getServiceUrl('n8n');
            if (n8nUrl) {
              serviceUrl = n8nUrl;
              try {
                const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
                const healthCheck = createManualHealthCheck(n8nUrl, '/');
                n8nRunning = await healthCheck();
              } catch (error) {
                log.debug(`N8N manual health check failed: ${error.message}`);
                n8nRunning = false;
              }
            }
          } else {
            const healthResult = await dockerSetup.checkN8NHealth();
            n8nRunning = healthResult.success;
            if (dockerSetup.ports && dockerSetup.ports.n8n) {
              serviceUrl = `http://localhost:${dockerSetup.ports.n8n}`;
            }
          }
        } catch (configError) {
          log.warn('Error getting N8N service config, using default mode:', configError.message);
          const healthResult = await dockerSetup.checkN8NHealth();
          n8nRunning = healthResult.success;
          if (dockerSetup.ports && dockerSetup.ports.n8n) {
            serviceUrl = `http://localhost:${dockerSetup.ports.n8n}`;
          }
        }
      } else {
        const healthResult = await dockerSetup.checkN8NHealth();
        n8nRunning = healthResult.success;
        if (dockerSetup.ports && dockerSetup.ports.n8n) {
          serviceUrl = `http://localhost:${dockerSetup.ports.n8n}`;
        }
      }

      return { running: n8nRunning, serviceUrl };
    } catch (error) {
      log.error('Error checking N8N service status:', error);
      return { running: false, error: error.message };
    }
  });

  // Start N8N container
  ipcMain.handle('n8n:start-container', async () => {
    try {
      if (!dockerSetup) {
        return { success: false, error: 'Docker setup not initialized' };
      }

      const dockerRunning = await dockerSetup.isDockerRunning();
      if (!dockerRunning) {
        return { success: false, error: 'Docker is not running' };
      }

      // Start the N8N container
      log.info('Starting N8N container...');
      
      // Get N8N configuration (creates it if needed)
      const n8nConfig = getN8NConfig();
      
      await dockerSetup.startContainer(n8nConfig);
      
      // Wait for the service to be healthy with timeout
      const maxAttempts = 30; // 30 seconds timeout
      let attempts = 0;
      let healthResult = { success: false };
      
      while (attempts < maxAttempts && !healthResult.success) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        healthResult = await dockerSetup.checkN8NHealth();
        attempts++;
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('n8n:startup-progress', {
            message: `Starting N8N... (${attempts}/${maxAttempts})`,
            progress: Math.round((attempts / maxAttempts) * 100)
          });
        }
      }

      if (healthResult.success) {
        const serviceUrl = dockerSetup.ports && dockerSetup.ports.n8n 
          ? `http://localhost:${dockerSetup.ports.n8n}` 
          : 'http://localhost:5678';
          
        log.info('N8N container started successfully');
        return { success: true, serviceUrl };
      } else {
        log.warn('N8N container started but health check failed');
        return { success: false, error: 'N8N started but is not responding to health checks' };
      }
    } catch (error) {
      log.error('Error starting N8N container:', error);
      return { success: false, error: error.message };
    }
  });

  log.info('N8N IPC handlers registered');
}

// Register ComfyUI specific IPC handlers
function registerComfyUIHandlers() {
  // Check Docker status
  ipcMain.handle('comfyui:check-docker-status', async () => {
    try {
      if (!dockerSetup) {
        return { dockerRunning: false, error: 'Docker setup not initialized' };
      }
      
      const dockerRunning = await dockerSetup.isDockerRunning();
      return { dockerRunning };
    } catch (error) {
      log.error('Error checking Docker status:', error);
      return { dockerRunning: false, error: error.message };
    }
  });

  // Check ComfyUI service status
  ipcMain.handle('comfyui:check-service-status', async () => {
    try {
      if (!dockerSetup) {
        return { running: false, error: 'Docker setup not initialized' };
      }

      // Check service configuration mode
      let comfyuiRunning = false;
      let serviceUrl = 'http://localhost:8188';
      
      if (serviceConfigManager && typeof serviceConfigManager.getServiceMode === 'function') {
        try {
          const comfyuiMode = serviceConfigManager.getServiceMode('comfyui');
          if (comfyuiMode === 'manual' && typeof serviceConfigManager.getServiceUrl === 'function') {
            const comfyuiUrl = serviceConfigManager.getServiceUrl('comfyui');
            if (comfyuiUrl) {
              serviceUrl = comfyuiUrl;
              try {
                const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
                const healthCheck = createManualHealthCheck(comfyuiUrl, '/');
                comfyuiRunning = await healthCheck();
              } catch (error) {
                log.debug(`ComfyUI manual health check failed: ${error.message}`);
                comfyuiRunning = false;
              }
            }
          } else {
            const healthResult = await dockerSetup.isComfyUIRunning();
            comfyuiRunning = healthResult;
            if (dockerSetup.ports && dockerSetup.ports.comfyui) {
              serviceUrl = `http://localhost:${dockerSetup.ports.comfyui}`;
            }
          }
        } catch (configError) {
          log.warn('Error getting ComfyUI service config, using default mode:', configError.message);
          const healthResult = await dockerSetup.isComfyUIRunning();
          comfyuiRunning = healthResult;
          if (dockerSetup.ports && dockerSetup.ports.comfyui) {
            serviceUrl = `http://localhost:${dockerSetup.ports.comfyui}`;
          }
        }
      } else {
        const healthResult = await dockerSetup.isComfyUIRunning();
        comfyuiRunning = healthResult;
        if (dockerSetup.ports && dockerSetup.ports.comfyui) {
          serviceUrl = `http://localhost:${dockerSetup.ports.comfyui}`;
        }
      }

      return { running: comfyuiRunning, serviceUrl };
    } catch (error) {
      log.error('Error checking ComfyUI service status:', error);
      return { running: false, error: error.message };
    }
  });

  // Start ComfyUI container
  ipcMain.handle('comfyui:start-container', async () => {
    try {
      if (!dockerSetup) {
        return { success: false, error: 'Docker setup not initialized' };
      }

      const dockerRunning = await dockerSetup.isDockerRunning();
      if (!dockerRunning) {
        return { success: false, error: 'Docker is not running' };
      }

      // Get ComfyUI configuration (creates it if needed)
      const comfyuiConfig = getComfyUIConfig();

      // Start the ComfyUI container
      log.info('Starting ComfyUI container...');
      await dockerSetup.startContainer(comfyuiConfig);
      
      // Wait for the service to be healthy with timeout (ComfyUI takes longer)
      const maxAttempts = 60; // 60 seconds timeout
      let attempts = 0;
      let healthResult = { success: false };
      
      while (attempts < maxAttempts && !healthResult.success) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        healthResult = { success: await dockerSetup.isComfyUIRunning() };
        attempts++;
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('comfyui:startup-progress', {
            message: `Starting ComfyUI... (${attempts}/${maxAttempts})`,
            progress: Math.round((attempts / maxAttempts) * 100)
          });
        }
      }

      if (healthResult.success) {
        const serviceUrl = dockerSetup.ports && dockerSetup.ports.comfyui 
          ? `http://localhost:${dockerSetup.ports.comfyui}` 
          : 'http://localhost:8188';
          
        log.info('ComfyUI container started successfully');
        return { success: true, serviceUrl };
      } else {
        log.warn('ComfyUI container started but health check failed');
        return { success: false, error: 'ComfyUI started but is not responding to health checks' };
      }
    } catch (error) {
      log.error('Error starting ComfyUI container:', error);
      return { success: false, error: error.message };
    }
  });

  log.info('ComfyUI IPC handlers registered');
}

// Register Python Backend specific IPC handlers
function registerPythonBackendHandlers() {
  // Check Docker status
  ipcMain.handle('check-docker-status', async () => {
    try {
      if (!dockerSetup) {
        return { isRunning: false, error: 'Docker setup not initialized' };
      }
      
      const isRunning = await dockerSetup.isDockerRunning();
      return { isRunning };
    } catch (error) {
      log.error('Error checking Docker status:', error);
      return { isRunning: false, error: error.message };
    }
  });

  // Check Python backend service status
  ipcMain.handle('check-python-status', async () => {
    try {
      if (!dockerSetup) {
        return { isHealthy: false, serviceUrl: null, mode: 'docker', error: 'Docker setup not initialized' };
      }

      // Get service configuration to determine mode (with fallback if service config manager is not available)
      let config = null;
      let mode = 'docker'; // Default mode
      
      if (serviceConfigManager && typeof serviceConfigManager.getServiceConfig === 'function') {
        try {
          config = await serviceConfigManager.getServiceConfig('notebooks');
          mode = config?.deploymentMode || 'docker';
        } catch (configError) {
          log.warn('Error getting service config, using default mode:', configError.message);
        }
      } else {
        log.warn('Service config manager not available or getServiceConfig method not found, using default mode');
      }
      
      let serviceUrl = null;

      if (mode === 'docker') {
        // Check if Docker is running first
        const dockerRunning = await dockerSetup.isDockerRunning();
        if (dockerRunning) {
          const healthResult = await dockerSetup.isPythonRunning();
          if (dockerSetup.ports && dockerSetup.ports.python) {
            serviceUrl = `http://localhost:${dockerSetup.ports.python}`;
          }
          return { isHealthy: healthResult, serviceUrl, mode };
        } else {
          return { isHealthy: false, serviceUrl: null, mode, error: 'Docker is not running' };
        }
      } else {
        // Manual mode - check configured URL
        const manualUrl = config?.manualUrl;
        if (manualUrl) {
          serviceUrl = manualUrl;
          // For manual mode, we can try to ping the URL
          const healthResult = await dockerSetup.isPythonRunning();
          return { isHealthy: healthResult, serviceUrl, mode };
        } else {
          return { isHealthy: false, serviceUrl: null, mode, error: 'No manual URL configured' };
        }
      }
    } catch (error) {
      log.error('Error checking Python backend status:', error);
      return { isHealthy: false, serviceUrl: null, mode: 'docker', error: error.message };
    }
  });

  // Start Python backend container
  ipcMain.handle('start-python-container', async () => {
    try {
      if (!dockerSetup) {
        return { success: false, error: 'Docker setup not initialized' };
      }

      const dockerRunning = await dockerSetup.isDockerRunning();
      if (!dockerRunning) {
        return { success: false, error: 'Docker is not running. Please start Docker first.' };
      }

      // Get Python container configuration (creates it if needed)
      const pythonConfig = getPythonConfig();

      log.info('Starting Python backend container...');
      await dockerSetup.startContainer(pythonConfig);

      // Wait for the container to be healthy with timeout
      const maxAttempts = 30; // 60 seconds max
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const isHealthy = await dockerSetup.isPythonRunning();
        
        if (isHealthy) {
          log.info('Python backend container started and is healthy');
          return { success: true };
        }
        
        attempts++;
      }

      return { success: false, error: 'Python backend started but is not responding to health checks' };
    } catch (error) {
      log.error('Error starting Python backend container:', error);
      return { success: false, error: error.message };
    }
  });

  log.info('Python Backend IPC handlers registered');
}

// Register handlers for various app functions
function registerHandlers() {
  console.log('[main] Registering IPC handlers...');
  registerLlamaSwapHandlers();
  registerDockerContainerHandlers();
  registerModelManagerHandlers();
  registerMCPHandlers();
  registerServiceConfigurationHandlers(); // NEW: Add service configuration handlers
  registerWidgetServiceHandlers(); // NEW: Add widget service handlers
  registerN8NHandlers(); // NEW: Add N8N specific handlers
  registerComfyUIHandlers(); // NEW: Add ComfyUI specific handlers
  registerPythonBackendHandlers(); // NEW: Add Python Backend specific handlers
  
  // Add new chat handler
  ipcMain.handle('new-chat', async () => {
    log.info('New chat requested via IPC');
    return { success: true };
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

  // Developer log handlers
  ipcMain.handle('developer-logs:read', async (event, lines = 1000) => {
    try {
      if (!ipcLogger) {
        return 'IPC Logger not initialized';
      }
      return await ipcLogger.readLogs(lines);
    } catch (error) {
      log.error('Error reading developer logs:', error);
      return `Error reading logs: ${error.message}`;
    }
  });

  ipcMain.handle('developer-logs:get-files', async () => {
    try {
      if (!ipcLogger) {
        return [];
      }
      return await ipcLogger.getLogFiles();
    } catch (error) {
      log.error('Error getting log files:', error);
      return [];
    }
  });

  ipcMain.handle('developer-logs:clear', async () => {
    try {
      if (!ipcLogger) {
        return { success: false, error: 'IPC Logger not initialized' };
      }
      return await ipcLogger.clearLogs();
    } catch (error) {
      log.error('Error clearing logs:', error);
      return { success: false, error: error.message };
    }
  });

  // Fast startup handlers for dashboard
  ipcMain.handle('get-initialization-state', async () => {
    return {
      needsFeatureSelection: global.needsFeatureSelection || false,
      selectedFeatures: global.selectedFeatures || null,
      systemConfig: global.systemConfig || null,
      dockerAvailable: dockerSetup ? await dockerSetup.isDockerRunning() : false,
      servicesStatus: {
        llamaSwap: llamaSwapService ? llamaSwapService.isRunning : false,
        mcp: mcpService ? true : false,
        docker: dockerSetup ? true : false,
        watchdog: watchdogService ? watchdogService.isRunning : false
      }
    };
  });
  
  ipcMain.handle('save-feature-selection', async (event, features) => {
    try {
      const featureSelection = new FeatureSelectionScreen();
      featureSelection.saveConfig(features);
      global.selectedFeatures = features;
      global.needsFeatureSelection = false;
      return { success: true };
    } catch (error) {
      log.error('Error saving feature selection:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('initialize-service', async (event, serviceName) => {
    try {
      const sendUpdate = (status, message) => {
        event.sender.send('service-init-progress', { service: serviceName, status, message });
      };
      
      switch(serviceName) {
        case 'docker':
          if (!dockerSetup) dockerSetup = new DockerSetup();
          const dockerAvailable = await dockerSetup.isDockerRunning();
          if (!dockerAvailable) {
            throw new Error('Docker is not running');
          }
          await dockerSetup.setup(global.selectedFeatures, (status) => {
            sendUpdate('progress', status);
          });
          break;
          
        case 'llamaSwap':
          if (!llamaSwapService) llamaSwapService = new LlamaSwapService(ipcLogger);
          await llamaSwapService.start();
          break;
          
        case 'mcp':
          if (!mcpService) mcpService = new MCPService();
          await mcpService.startAllEnabledServers();
          break;
          
        case 'watchdog':
          if (!watchdogService && dockerSetup?.docker) {
            watchdogService = new WatchdogService(dockerSetup, llamaSwapService, mcpService);
            watchdogService.start();
          }
          break;
      }
      
      return { success: true };
    } catch (error) {
      log.error(`Error initializing service ${serviceName}:`, error);
      return { success: false, error: error.message };
    }
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

  // Enhanced update handlers for in-app downloading
  ipcMain.handle('start-in-app-download', async (event, updateInfo) => {
    try {
      // Import the enhanced update service
      const { enhancedPlatformUpdateService } = require('./updateService.cjs');
      
      if (!enhancedPlatformUpdateService) {
        throw new Error('Enhanced update service not available');
      }

      const result = await enhancedPlatformUpdateService.startInAppDownload(updateInfo);
      
      // If download completed successfully, show completion dialog
      if (result.success && result.filePath) {
        // Send completion event to renderer
        mainWindow.webContents.send('update-download-completed', {
          filePath: result.filePath,
          fileName: result.fileName
        });

        const response = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '✅ Download Complete!',
          message: `Clara ${updateInfo.latestVersion} has been downloaded`,
          detail: `The installer has been saved to:\n${result.filePath}\n\nWould you like to open it now?`,
          buttons: ['Open Installer', 'Open Downloads Folder', 'Later'],
          defaultId: 0
        });

        if (response.response === 0) {
          // Open the installer
          shell.openPath(result.filePath);
        } else if (response.response === 1) {
          // Open downloads folder
          shell.showItemInFolder(result.filePath);
        }
      } else if (!result.success) {
        // Send error event to renderer
        mainWindow.webContents.send('update-download-error', {
          error: result.error
        });
      }
      
      return result;
    } catch (error) {
      log.error('Error starting in-app download:', error);
      
      // Send error event to renderer
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-download-error', {
          error: error.message
        });
      }
      
      return {
        success: false,
        error: error.message
      };
    }
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

      // Check service modes before testing Docker containers
      let n8nRunning = false;
      let comfyuiRunning = false;
      
      if (serviceConfigManager && typeof serviceConfigManager.getServiceMode === 'function') {
        try {
          // N8N health check
          const n8nMode = serviceConfigManager.getServiceMode('n8n');
          if (n8nMode === 'manual' && typeof serviceConfigManager.getServiceUrl === 'function') {
            const n8nUrl = serviceConfigManager.getServiceUrl('n8n');
            if (n8nUrl) {
              try {
                const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
                const healthCheck = createManualHealthCheck(n8nUrl, '/');
                n8nRunning = await healthCheck();
                log.debug(`🔗 N8N manual service health: ${n8nRunning}`);
              } catch (error) {
                log.debug(`N8N manual health check failed: ${error.message}`);
                n8nRunning = false;
              }
            }
          } else {
            n8nRunning = await dockerSetup.checkN8NHealth().then(result => result.success).catch(() => false);
          }
          
          // ComfyUI health check  
          const comfyuiMode = serviceConfigManager.getServiceMode('comfyui');
          if (comfyuiMode === 'manual' && typeof serviceConfigManager.getServiceUrl === 'function') {
            const comfyuiUrl = serviceConfigManager.getServiceUrl('comfyui');
            if (comfyuiUrl) {
              try {
                const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
                const healthCheck = createManualHealthCheck(comfyuiUrl, '/');
                comfyuiRunning = await healthCheck();
                log.debug(`🔗 ComfyUI manual service health: ${comfyuiRunning}`);
              } catch (error) {
                log.debug(`ComfyUI manual health check failed: ${error.message}`);
                comfyuiRunning = false;
              }
            }
          } else {
            comfyuiRunning = await dockerSetup.isComfyUIRunning().catch(() => false);
          }
        } catch (configError) {
          log.warn('Error getting service configs, using Docker fallback:', configError.message);
          // Fallback to Docker checks
          n8nRunning = await dockerSetup.checkN8NHealth().then(result => result.success).catch(() => false);
          comfyuiRunning = await dockerSetup.isComfyUIRunning().catch(() => false);
        }
      } else {
        // Fallback to Docker checks
        n8nRunning = await dockerSetup.checkN8NHealth().then(result => result.success).catch(() => false);
        comfyuiRunning = await dockerSetup.isComfyUIRunning().catch(() => false);
      }
      
      const pythonRunning = await dockerSetup.isPythonRunning().catch(() => false);

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

  // Get Python backend information
  ipcMain.handle('get-python-backend-info', async () => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker setup not initialized');
      }
      
      return dockerSetup.getPythonBackendInfo();
    } catch (error) {
      log.error('Error getting Python backend info:', error);
      return { error: error.message };
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
      // NEW: Check if ComfyUI is configured for manual mode
      if (serviceConfigManager && typeof serviceConfigManager.getServiceMode === 'function') {
        const comfyuiMode = serviceConfigManager.getServiceMode('comfyui');
        if (comfyuiMode === 'manual' && typeof serviceConfigManager.getServiceUrl === 'function') {
          const comfyuiUrl = serviceConfigManager.getServiceUrl('comfyui');
          log.info(`🔗 ComfyUI in manual mode, checking ${comfyuiUrl} instead of Docker`);
          
          if (!comfyuiUrl) {
            return { running: false, error: 'Manual mode but no URL configured', mode: 'manual' };
          }
          
          // Test manual service connectivity
          try {
            const { createManualHealthCheck } = require('./serviceDefinitions.cjs');
            const healthCheck = createManualHealthCheck(comfyuiUrl, '/');
            const isHealthy = await healthCheck();
            
            return {
              running: isHealthy,
              url: comfyuiUrl,
              mode: 'manual',
              containerName: 'manual-service'
            };
          } catch (error) {
            return { running: false, error: `Manual service health check failed: ${error.message}`, mode: 'manual' };
          }
        }
      }
      
      // Fallback to Docker mode
      if (!dockerSetup) {
        return { running: false, error: 'Docker not initialized' };
      }
      
      const isRunning = await dockerSetup.isComfyUIRunning();
      return {
        running: isRunning,
        port: dockerSetup.ports.comfyui || 8188,
        containerName: 'clara_comfyui',
        mode: 'docker'
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
      
      // Get ComfyUI configuration (creates it if needed)
      const comfyuiConfig = getComfyUIConfig();
      
      await dockerSetup.startContainer(comfyuiConfig);
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

  // System resource configuration handlers
  ipcMain.handle('get-system-config', async () => {
    try {
      if (global.systemConfig) {
        log.info('✅ Returning cached system configuration');
        return global.systemConfig;
      }
      
      // If no cached config, try to load from platform manager
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      const config = await platformManager.getSystemConfiguration();
      
      // Cache it globally
      global.systemConfig = config;
      
      return config;
    } catch (error) {
      log.error('❌ Error getting system configuration:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('refresh-system-config', async () => {
    try {
      log.info('🔄 Refreshing system configuration...');
      
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      const config = await platformManager.getSystemConfiguration(true); // Force refresh
      
      // Update global cache
      global.systemConfig = config;
      
      log.info('✅ System configuration refreshed successfully');
      return config;
    } catch (error) {
      log.error('❌ Error refreshing system configuration:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('check-feature-requirements', async (event, featureName) => {
    try {
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      const requirements = await platformManager.checkFeatureRequirements(featureName);
      
      log.info(`🔍 Feature requirements check for '${featureName}':`, requirements);
      return requirements;
    } catch (error) {
      log.error(`❌ Error checking requirements for feature '${featureName}':`, error);
      return { supported: false, reason: error.message };
    }
  });

  ipcMain.handle('get-performance-mode', async () => {
    try {
      if (global.systemConfig) {
        return {
          performanceMode: global.systemConfig.performanceMode,
          enabledFeatures: global.systemConfig.enabledFeatures,
          resourceLimitations: global.systemConfig.resourceLimitations
        };
      }
      
      return { performanceMode: 'unknown', enabledFeatures: {}, resourceLimitations: {} };
    } catch (error) {
      log.error('❌ Error getting performance mode:', error);
      return { error: error.message };
    }
  });

  // OS Compatibility handlers
  ipcMain.handle('get-os-compatibility', async () => {
    try {
      if (global.systemConfig && global.systemConfig.osCompatibility) {
        return global.systemConfig.osCompatibility;
      } else {
        // If not available globally, run fresh validation
        const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
        const osCompatibility = await platformManager.validateOSCompatibility();
        return osCompatibility;
      }
    } catch (error) {
      log.error('Error getting OS compatibility info:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-detailed-os-info', async () => {
    try {
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      const osInfo = await platformManager.getDetailedOSInfo();
      return osInfo;
    } catch (error) {
      log.error('Error getting detailed OS info:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('validate-os-compatibility', async () => {
    try {
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      const compatibility = await platformManager.validateOSCompatibility();
      return compatibility;
    } catch (error) {
      log.error('Error validating OS compatibility:', error);
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

      return { success: true };
    } catch (error) {
      log.error('Error saving ComfyUI consent:', error);
      return { success: false, error: error.message };
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
  ipcMain.on('react-app-ready', async () => {
    log.info('React app fully initialized and ready');
    if (loadingScreen && loadingScreen.isValid()) {
      loadingScreen.notifyMainWindowReady();
    }
    
    // Auto-restore MCP servers when React app is ready (if not already restored)
    if (mcpService && !global.mcpServersRestored) {
      try {
        log.info('React app ready - attempting to restore previously running MCP servers...');
        const restoreResults = await mcpService.startPreviouslyRunningServers();
        const successCount = restoreResults.filter(r => r.success).length;
        const totalCount = restoreResults.length;
        
        if (totalCount > 0) {
          log.info(`MCP restoration on app ready: ${successCount}/${totalCount} servers restored`);
        } else {
          log.info('MCP restoration on app ready: No servers to restore');
        }
        global.mcpServersRestored = true;
      } catch (error) {
        log.error('Error auto-restoring MCP servers on app ready:', error);
      }
    }
  });

  // Handle app close request
  ipcMain.on('app-close', async () => {
    log.info('App close requested from renderer');
    isQuitting = true;
    app.quit();
  });

  // Add IPC handler for tray control
  ipcMain.on('hide-to-tray', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  ipcMain.on('show-from-tray', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
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

  // Docker Desktop startup handler
  ipcMain.handle('start-docker-desktop', async () => {
    try {
      log.info('Received request to start Docker Desktop from onboarding');
      
      // Get Docker path
      const dockerPath = await checkDockerDesktopInstalled();
      if (!dockerPath) {
        return { 
          success: false, 
          error: 'Docker Desktop not found on system' 
        };
      }
      
      // Check if Docker is already running
      const isRunning = dockerSetup ? await dockerSetup.isDockerRunning() : false;
      if (isRunning) {
        return { 
          success: true, 
          message: 'Docker Desktop is already running' 
        };
      }
      
      // Start Docker Desktop
      const startSuccess = await startDockerDesktop(dockerPath);
      
      if (startSuccess) {
        return { 
          success: true, 
          message: 'Docker Desktop startup initiated' 
        };
      } else {
        return { 
          success: false, 
          error: 'Failed to start Docker Desktop' 
        };
      }
    } catch (error) {
      log.error('Error starting Docker Desktop:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error starting Docker Desktop' 
      };
    }
  });

  // Generic Docker service control handlers
  ipcMain.handle('start-docker-service', async (event, serviceName) => {
    try {
      if (!dockerSetup) {
        throw new Error('Docker setup not initialized');
      }

      switch (serviceName) {
        case 'n8n':
          // Get N8N configuration (creates it if needed)
          const n8nConfig = getN8NConfig();
          await dockerSetup.startContainer(n8nConfig);
          break;
        case 'python':
          // Get Python configuration (creates it if needed)
          const pythonConfig = getPythonConfig();
          await dockerSetup.startContainer(pythonConfig);
          break;
        case 'comfyui':
          // Get ComfyUI configuration (creates it if needed)
          const comfyuiConfig = getComfyUIConfig();
          await dockerSetup.startContainer(comfyuiConfig);
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

  // Screen sharing IPC handlers for Electron
  ipcMain.handle('get-desktop-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 300, height: 200 }
      });
      
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      log.error('Error getting desktop sources:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-screen-access-status', async () => {
    try {
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        return { status };
      }
      // On Windows/Linux, screen access is generally available
      return { status: 'granted' };
    } catch (error) {
      log.error('Error checking screen access:', error);
      return { status: 'unknown', error: error.message };
    }
  });

  ipcMain.handle('request-screen-access', async () => {
    try {
      if (process.platform === 'darwin') {
        const granted = await systemPreferences.askForMediaAccess('screen');
        return { granted };
      }
      // On Windows/Linux, screen access is generally available
      return { granted: true };
    } catch (error) {
      log.error('Error requesting screen access:', error);
      return { granted: false, error: error.message };
    }
  });
}

/**
 * Check if Docker Desktop is installed on Windows/macOS/Linux
 */
async function checkDockerDesktopInstalled() {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    if (process.platform === 'win32') {
      // Windows Docker Desktop detection
      const possiblePaths = [
        'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
        'C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe'
      ];
      
      for (const dockerPath of possiblePaths) {
        if (fs.existsSync(dockerPath)) {
          return dockerPath;
        }
      }
      
      // Also check via registry or Windows features
      try {
        await execAsync('docker --version');
        return true; // Docker CLI is available
      } catch (error) {
        // Docker CLI not available
      }
      
      return false;
      
    } else if (process.platform === 'darwin') {
      // macOS Docker Desktop detection
      const dockerAppPath = '/Applications/Docker.app';
      
      // Check if Docker.app exists
      if (fs.existsSync(dockerAppPath)) {
        return dockerAppPath;
      }
      
      // Also check if Docker CLI is available (could be installed via Homebrew or other methods)
      try {
        await execAsync('docker --version');
        return true; // Docker CLI is available
      } catch (error) {
        // Docker CLI not available
      }
      
      return false;
      
    } else if (process.platform === 'linux') {
      // Linux Docker Desktop detection
      const possiblePaths = [
        '/opt/docker-desktop/bin/docker-desktop',
        '/usr/bin/docker-desktop',
        '/usr/local/bin/docker-desktop'
      ];
      
      // Check for Docker Desktop executable
      for (const dockerPath of possiblePaths) {
        if (fs.existsSync(dockerPath)) {
          return dockerPath;
        }
      }
      
      // Check if Docker Desktop is installed via package manager
      try {
        await execAsync('which docker-desktop');
        return 'docker-desktop'; // Docker Desktop is in PATH
      } catch (error) {
        // Docker Desktop not found in PATH
      }
      
      // Check if Docker CLI is available (could be Docker Engine or Docker Desktop)
      try {
        await execAsync('docker --version');
        
        // Try to determine if it's Docker Desktop by checking for desktop-specific features
        try {
          const { stdout } = await execAsync('docker context ls --format json');
          const contexts = stdout.trim().split('\n').map(line => JSON.parse(line));
          const hasDesktopContext = contexts.some(ctx => 
            ctx.Name === 'desktop-linux' || 
            ctx.DockerEndpoint && ctx.DockerEndpoint.includes('desktop')
          );
          
          if (hasDesktopContext) {
            return 'docker-desktop'; // Docker Desktop detected via context
          }
        } catch (contextError) {
          // Context check failed, continue with regular Docker check
        }
        
        return true; // Docker CLI is available (could be Docker Engine)
      } catch (error) {
        // Docker CLI not available
      }
      
      return false;
      
    } else {
      // Other platforms - just check for Docker CLI
      try {
        await execAsync('docker --version');
        return true;
      } catch (error) {
        return false;
      }
    }
    
  } catch (error) {
    log.error('Error checking Docker Desktop installation:', error);
    return false;
  }
}

/**
 * Attempt to start Docker Desktop on Windows/macOS/Linux
 */
async function startDockerDesktop(dockerPath) {
  try {
    const { spawn, exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    if (process.platform === 'win32') {
      // Windows Docker Desktop startup
      if (typeof dockerPath === 'string' && dockerPath.endsWith('.exe')) {
        // Start Docker Desktop executable
        const dockerProcess = spawn(dockerPath, [], { 
          detached: true, 
          stdio: 'ignore' 
        });
        dockerProcess.unref();
        
        log.info('Docker Desktop startup initiated');
        return true;
      } else {
        // Try to start via Windows service or PowerShell
        try {
          await execAsync('Start-Process "Docker Desktop" -WindowStyle Hidden', { shell: 'powershell' });
          log.info('Docker Desktop startup initiated via PowerShell');
          return true;
        } catch (error) {
          log.warn('Failed to start Docker Desktop via PowerShell:', error.message);
          return false;
        }
      }
      
    } else if (process.platform === 'darwin') {
      // macOS Docker Desktop startup
      if (typeof dockerPath === 'string' && dockerPath.endsWith('.app')) {
        // Start Docker.app using 'open' command
        try {
          await execAsync(`open "${dockerPath}"`);
          log.info('Docker Desktop startup initiated via open command');
          return true;
        } catch (error) {
          log.warn('Failed to start Docker Desktop via open command:', error.message);
          return false;
        }
      } else {
        // Try alternative methods to start Docker
        try {
          // Check if Docker is already running first
          try {
            await execAsync('docker info', { timeout: 5000 });
            log.info('Docker is already running');
            return true;
          } catch (checkError) {
            // Docker not running, try to start it
          }
          
          // Try using 'open' with application name
          await execAsync('open -a Docker');
          log.info('Docker Desktop startup initiated via open -a Docker');
          return true;
        } catch (error) {
          try {
            // Try using launchctl (if Docker is set up as a service)
            await execAsync('launchctl load ~/Library/LaunchAgents/com.docker.docker.plist 2>/dev/null || true');
            await execAsync('launchctl start com.docker.docker');
            log.info('Docker Desktop startup initiated via launchctl');
            return true;
          } catch (launchError) {
            log.warn('Failed to start Docker Desktop via launchctl:', launchError.message);
            
            // Final attempt: try to start Docker via Spotlight/Launch Services
            try {
              await execAsync('osascript -e \'tell application "Docker" to activate\'');
              log.info('Docker Desktop startup initiated via AppleScript');
              return true;
            } catch (scriptError) {
              log.warn('All Docker startup methods failed');
              return false;
            }
          }
        }
      }
      
    } else if (process.platform === 'linux') {
      // Linux Docker Desktop startup
      if (typeof dockerPath === 'string' && dockerPath.includes('docker-desktop')) {
        // Start Docker Desktop executable directly
        try {
          if (dockerPath === 'docker-desktop') {
            // Docker Desktop is in PATH
            const dockerProcess = spawn('docker-desktop', [], { 
              detached: true, 
              stdio: 'ignore' 
            });
            dockerProcess.unref();
          } else {
            // Docker Desktop is at specific path
            const dockerProcess = spawn(dockerPath, [], { 
              detached: true, 
              stdio: 'ignore' 
            });
            dockerProcess.unref();
          }
          
          log.info('Docker Desktop startup initiated via executable');
          return true;
        } catch (error) {
          log.warn('Failed to start Docker Desktop via executable:', error.message);
        }
      }
      
      // Try alternative methods to start Docker Desktop on Linux
      try {
        // Check if Docker is already running first
        try {
          await execAsync('docker info', { timeout: 5000 });
          log.info('Docker is already running');
          return true;
        } catch (checkError) {
          // Docker not running, try to start it
        }
        
        // Try to start Docker Desktop via desktop entry
        try {
          await execAsync('gtk-launch docker-desktop || true');
          log.info('Docker Desktop startup initiated via gtk-launch');
          return true;
        } catch (gtkError) {
          // gtk-launch failed, try other methods
        }
        
        // Try to start via XDG desktop entry
        try {
          await execAsync('xdg-open /usr/share/applications/docker-desktop.desktop || true');
          log.info('Docker Desktop startup initiated via xdg-open');
          return true;
        } catch (xdgError) {
          // XDG method failed
        }
        
        // Try to start Docker service as fallback (Docker Engine)
        try {
          await execAsync('sudo systemctl start docker');
          log.info('Docker service startup initiated via systemctl');
          return true;
        } catch (systemctlError) {
          log.warn('Failed to start Docker service via systemctl:', systemctlError.message);
        }
        
        return false;
      } catch (error) {
        log.warn('All Linux Docker startup methods failed:', error.message);
        return false;
      }
      
    } else {
      // Other platforms - try to start docker service
      try {
        await execAsync('sudo systemctl start docker');
        log.info('Docker service startup initiated via systemctl');
        return true;
      } catch (error) {
        log.warn('Failed to start Docker service via systemctl:', error.message);
        return false;
      }
    }
    
  } catch (error) {
    log.error('Error starting Docker Desktop:', error);
    return false;
  }
}

/**
 * Ask user if they want to start Docker Desktop when it's not running
 */
async function askToStartDockerDesktop(loadingScreen) {
  try {
    const dockerPath = await checkDockerDesktopInstalled();
    
    if (!dockerPath) {
      log.info('Docker Desktop not detected on system');
      
      // Show dialog asking user to install Docker Desktop
      const platformName = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
      const downloadUrl = process.platform === 'darwin' 
        ? 'https://docs.docker.com/desktop/install/mac-install/' 
        : process.platform === 'win32'
        ? 'https://docs.docker.com/desktop/install/windows-install/'
        : 'https://docs.docker.com/desktop/install/linux-install/';
      
      const result = await showStartupDialog(
        loadingScreen,
        'info',
        'Docker Desktop Not Installed',
        `Docker Desktop is not installed on your system. Docker Desktop enables advanced features like ComfyUI, n8n workflows, and other AI services.\n\nWould you like to:\n\n• Download Docker Desktop for ${platformName}\n• Continue without Docker (lightweight mode)\n• Cancel startup`,
        ['Download Docker Desktop', 'Continue without Docker', 'Cancel']
      );
      
      if (result.response === 0) { // Download Docker Desktop
        const { shell } = require('electron');
        shell.openExternal(downloadUrl);
        
        await showStartupDialog(
          loadingScreen,
          'info',
          'Docker Installation',
          'Docker Desktop download page has been opened in your browser.\n\nAfter installing Docker Desktop, please restart Clara to enable all features.',
          ['OK']
        );
        
        return false;
      } else if (result.response === 1) { // Continue without Docker
        return false;
      } else { // Cancel
        app.quit();
        return false;
      }
    }
    
    log.info('Docker Desktop is installed but not running');
    
    // Show dialog asking user if they want to start Docker Desktop
    const platformName = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
    const result = await showStartupDialog(
      loadingScreen,
      'question',
      'Docker Desktop Not Running',
      `Docker Desktop is installed but not currently running on ${platformName}. Would you like to start it now?\n\nStarting Docker Desktop will enable advanced features like ComfyUI, n8n workflows, and other AI services.`,
      ['Start Docker Desktop', 'Continue without Docker', 'Cancel']
    );
    
    if (result.response === 0) { // Start Docker Desktop
      loadingScreen?.setStatus('Starting Docker Desktop...', 'info');
      
      const startSuccess = await startDockerDesktop(dockerPath);
      
      if (startSuccess) {
        loadingScreen?.setStatus('Docker Desktop is starting... Please wait...', 'info');
        
        // Wait for Docker Desktop to start (up to 60 seconds)
        let dockerStarted = false;
        const maxWaitTime = 60000; // 60 seconds
        const checkInterval = 2000; // 2 seconds
        const maxAttempts = maxWaitTime / checkInterval;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          try {
            const tempDockerSetup = new DockerSetup();
            const isRunning = await tempDockerSetup.isDockerRunning();
            
            if (isRunning) {
              dockerStarted = true;
              loadingScreen?.setStatus('Docker Desktop started successfully!', 'success');
              log.info('Docker Desktop started successfully');
              break;
            } else {
              loadingScreen?.setStatus(`Waiting for Docker Desktop to start... (${Math.round((attempt + 1) * checkInterval / 1000)}s)`, 'info');
            }
          } catch (error) {
            // Continue waiting
            loadingScreen?.setStatus(`Waiting for Docker Desktop to start... (${Math.round((attempt + 1) * checkInterval / 1000)}s)`, 'info');
          }
        }
        
        if (!dockerStarted) {
          loadingScreen?.setStatus('Docker Desktop is taking longer than expected to start. Continuing without Docker...', 'warning');
          await showStartupDialog(
            loadingScreen,
            'warning',
            'Docker Startup Timeout',
            'Docker Desktop is taking longer than expected to start. The application will continue in lightweight mode.\n\nYou can try restarting the application once Docker Desktop is fully running.',
            ['OK']
          );
          return false;
        }
        
        return dockerStarted;
      } else {
        loadingScreen?.setStatus('Failed to start Docker Desktop. Continuing without Docker...', 'warning');
        await showStartupDialog(
          loadingScreen,
          'warning',
          'Docker Startup Failed',
          'Failed to start Docker Desktop automatically. The application will continue in lightweight mode.\n\nYou can manually start Docker Desktop and restart the application to enable full features.',
          ['OK']
        );
        return false;
      }
      
    } else if (result.response === 1) { // Continue without Docker
      loadingScreen?.setStatus('Continuing without Docker...', 'info');
      log.info('User chose to continue without Docker');
      return false;
      
    } else { // Cancel
      loadingScreen?.setStatus('Startup cancelled by user', 'warning');
      log.info('User cancelled startup');
      app.quit();
      return false;
    }
    
  } catch (error) {
    log.error('Error in askToStartDockerDesktop:', error);
    return false;
  }
}

/**
 * Main initialization function that determines startup flow based on Docker availability
 * and initializes all necessary services
 */
async function initialize() {
  try {
    console.log('🚀 Starting application initialization (fast mode)');
    
    // Check if this is first time launch
    const featureSelection = new FeatureSelectionScreen();
    let selectedFeatures = null;
    
    if (featureSelection.isFirstTimeLaunch()) {
      console.log('🎯 First time launch detected - will show onboarding in main app');
      // DO NOT auto-start any services on first launch - wait for user consent
      selectedFeatures = {
        comfyUI: false,
        n8n: false,
        ragAndTts: false,
        claraCore: true // Only Clara Core is always enabled
      };
      // Mark that we need to show onboarding in the main app
      global.needsFeatureSelection = true;
    } else {
      // Load existing feature configuration (user has completed onboarding)
      selectedFeatures = FeatureSelectionScreen.getCurrentConfig();
      console.log('📋 Loaded existing feature configuration:', selectedFeatures);
      global.needsFeatureSelection = false;
    }
    
    // Store selected features globally for use throughout initialization
    global.selectedFeatures = selectedFeatures;
    
    // Skip loading screen - go directly to main window creation
    console.log('⚡ Fast startup mode - skipping splash screen');
    
    // Register handlers early (needed for IPC communication)
    if (!global.handlersRegistered) {
      registerHandlers();
      global.handlersRegistered = true;
    }
    
    // Create main window immediately for fast startup
    console.log('📱 Creating main window immediately...');
    await createMainWindow();
    
    // Send initial app state to renderer
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app-initialization-state', {
        needsFeatureSelection: global.needsFeatureSelection,
        selectedFeatures: selectedFeatures,
        status: 'initializing'
      });
    });
    
    // Initialize everything else in the background
    initializeInBackground(selectedFeatures);
    
  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    // Create main window even if initialization fails
    if (!mainWindow) {
      await createMainWindow();
    }
    // Send error state to renderer
    mainWindow.webContents.send('app-initialization-state', {
      status: 'error',
      error: error.message
    });
  }
}

/**
 * Background initialization function that runs after main window is shown
 */
async function initializeInBackground(selectedFeatures) {
  try {
    // Send status update
    const sendStatusUpdate = (status, details = {}) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service-status-update', { status, ...details });
      }
    };
    
    // Validate system resources
    sendStatusUpdate('validating', { message: 'Validating system resources...' });
    let systemConfig;
    try {
      const platformManager = new PlatformManager(path.join(__dirname, 'llamacpp-binaries'));
      systemConfig = await platformManager.validateSystemResources();
      
      // Handle critical OS compatibility issues
      if (systemConfig.osCompatibility && !systemConfig.osCompatibility.isSupported) {
        log.error('🚨 Critical OS compatibility issue detected');
        systemConfig.performanceMode = 'core-only';
        systemConfig.enabledFeatures = {
          claraCore: true,
          dockerServices: false,
          comfyUI: false,
          advancedFeatures: false
        };
        sendStatusUpdate('warning', { 
          message: 'OS compatibility issue - Limited functionality',
          osCompatibility: systemConfig.osCompatibility
        });
      }
    } catch (error) {
      log.error('System resource validation failed:', error);
      systemConfig = null;
    }
    
    global.systemConfig = systemConfig;
    
    // Initialize service configuration managers
    sendStatusUpdate('initializing', { message: 'Initializing service configuration...' });
    try {
      serviceConfigManager = new ServiceConfigurationManager();
      centralServiceManager = new CentralServiceManager(serviceConfigManager);
      
      const { SERVICE_DEFINITIONS } = require('./serviceDefinitions.cjs');
      Object.keys(SERVICE_DEFINITIONS).forEach(serviceName => {
        const serviceDefinition = SERVICE_DEFINITIONS[serviceName];
        centralServiceManager.registerService(serviceName, serviceDefinition);
      });
    } catch (error) {
      log.warn('Service configuration managers initialization failed:', error);
    }
    
    // Check Docker availability
    sendStatusUpdate('checking-docker', { message: 'Checking Docker availability...' });
    dockerSetup = new DockerSetup();
    let isDockerAvailable = false;
    
    if (!systemConfig || systemConfig.enabledFeatures.dockerServices !== false) {
      isDockerAvailable = await dockerSetup.isDockerRunning();
    }
    
    // Only initialize services if user has completed onboarding and given consent
    const hasUserConsent = !global.needsFeatureSelection;
    
    if (hasUserConsent) {
      // Check if user has enabled auto-start for services
      let shouldAutoStartServices = false;
      try {
        // Since we can't easily access the frontend db from main process,
        // and the default is false (which is what we want for security),
        // we'll default to false unless explicitly set
        shouldAutoStartServices = false;
        
        // TODO: In the future, we could save startup preferences to a separate file
        // that both frontend and backend can access, or use IPC communication
      } catch (error) {
        log.warn('Could not check auto-start preference, defaulting to false:', error);
        shouldAutoStartServices = false;
      }
      
      if (shouldAutoStartServices) {
        // User has explicitly enabled auto-start - initialize services
        console.log('✅ User consent obtained and auto-start enabled - initializing selected services');
        if (isDockerAvailable) {
          sendStatusUpdate('docker-available', { message: 'Docker detected - Setting up services...' });
          await initializeServicesWithDocker(selectedFeatures, sendStatusUpdate);
        } else {
          sendStatusUpdate('docker-not-available', { message: 'Docker not available - Running in lightweight mode...' });
          await initializeServicesWithoutDocker(selectedFeatures, sendStatusUpdate);
        }
      } else {
        // User has consent but auto-start is disabled - wait for manual service start
        console.log('✅ User consent obtained but auto-start disabled - services available on demand');
        sendStatusUpdate('consent-no-autostart', { 
          message: 'Services available - start them manually when needed',
          dockerAvailable: isDockerAvailable 
        });
      }
    } else {
      // First time launch - wait for user to complete onboarding
      console.log('⏳ First time launch - waiting for user consent before starting services');
      sendStatusUpdate('waiting-for-consent', { 
        message: 'Waiting for user to complete onboarding before starting services...',
        dockerAvailable: isDockerAvailable 
      });
    }
    
    sendStatusUpdate('ready', { message: 'All services initialized' });
    
  } catch (error) {
    log.error('Background initialization error:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('service-status-update', { 
        status: 'error', 
        error: error.message 
      });
    }
  }
}

/**
 * Initialize services with Docker support
 */
async function initializeServicesWithDocker(selectedFeatures, sendStatusUpdate) {
  try {
    // Initialize core services
    llamaSwapService = new LlamaSwapService(ipcLogger);
    updateService = platformUpdateService;
    
    if (selectedFeatures.ragAndTts) {
      mcpService = new MCPService();
    }
    
    // Initialize Docker services
    sendStatusUpdate('docker-initializing', { message: 'Setting up Docker containers...' });
    await dockerSetup.setup(selectedFeatures, (status) => {
      sendStatusUpdate('docker-setup', { message: status });
    });
    
    // Start background services
    sendStatusUpdate('starting-services', { message: 'Starting background services...' });
    await initializeServicesInBackground();
    
    // Initialize watchdog
    watchdogService = new WatchdogService(dockerSetup, llamaSwapService, mcpService);
    watchdogService.start();
    
  } catch (error) {
    log.error('Error initializing services with Docker:', error);
    throw error;
  }
}

/**
 * Initialize services without Docker
 */
async function initializeServicesWithoutDocker(selectedFeatures, sendStatusUpdate) {
  try {
    // Initialize only essential services
    llamaSwapService = new LlamaSwapService(ipcLogger);
    updateService = platformUpdateService;
    
    if (selectedFeatures.ragAndTts) {
      mcpService = new MCPService();
    }
    
    // Start background services
    sendStatusUpdate('starting-services', { message: 'Starting services...' });
    await initializeServicesInBackground();
    
  } catch (error) {
    log.error('Error initializing services without Docker:', error);
    throw error;
  }
}

async function initializeWithDocker() {
  try {
    // Register handlers for various app functions (only if not already registered)
    if (!global.handlersRegistered) {
      registerHandlers();
      global.handlersRegistered = true;
    }
    
    // Get user's feature selections - be conservative during onboarding
    const selectedFeatures = global.selectedFeatures || {
      comfyUI: false,  // Conservative default - only start if explicitly selected
      n8n: false,      // Conservative default - only start if explicitly selected
      ragAndTts: false, // Conservative default - prevent unwanted Python backend downloads
      claraCore: true  // Always enable core functionality
    };
    const systemConfig = global.systemConfig;
    
    // Check system configuration before initializing services
    if (systemConfig && !systemConfig.enabledFeatures.dockerServices) {
      log.warn('🔧 Docker services disabled due to system resource limitations, falling back to lightweight mode');
      return await initializeWithoutDocker();
    }
    
    // Initialize core services (always enabled)
    llamaSwapService = new LlamaSwapService(ipcLogger);
    updateService = platformUpdateService;
    
    // Initialize MCP service only if RAG & TTS is selected
    if (selectedFeatures && selectedFeatures.ragAndTts) {
      log.info('🧠 Initializing MCP service (RAG & TTS enabled)');
      mcpService = new MCPService();
    } else {
      log.info('🧠 MCP service disabled (RAG & TTS not selected)');
    }
    
    // Apply system resource limitations to LlamaSwap service
    if (systemConfig && systemConfig.resourceLimitations) {
      llamaSwapService.applyResourceLimitations(systemConfig.resourceLimitations);
      log.info('🎯 Applied system resource limitations to LlamaSwap service:', systemConfig.resourceLimitations);
    }
    
    // Only initialize ComfyUI if selected by user AND system supports it
    if (selectedFeatures && selectedFeatures.comfyUI && 
        (!systemConfig || systemConfig.enabledFeatures.comfyUI)) {
      log.info('🎨 Initializing ComfyUI service (selected by user)');
      comfyUIModelService = new ComfyUIModelService();
    } else {
      // Always initialize the model service for model downloads, even if ComfyUI isn't enabled
      log.info('🎨 Initializing ComfyUI Model Service for model downloads');
      comfyUIModelService = new ComfyUIModelService();
      
      if (!selectedFeatures?.comfyUI) {
        log.info('🎨 ComfyUI UI disabled (not selected by user) - but model downloads available');
      } else {
        log.info('🎨 ComfyUI UI disabled due to system resource limitations - but model downloads available');
      }
    }
    
    // Load custom model path from file-based storage
    await loadCustomModelPath();
    
    // Set up progress callback to forward to renderer
    llamaSwapService.setProgressCallback((progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llama-progress-update', progressData);
      }
    });
    
    // Setup Docker services with progress updates to splash screen
    loadingScreen.setStatus('Setting up Docker environment...', 'info');
    
    const dockerSuccess = await dockerSetup.setup(selectedFeatures, async (status, type = 'info', progress = null) => {
      loadingScreen.setStatus(status, type, progress);
      
      // Also log to console
      if (progress && progress.percentage) {
        console.log(`[Docker Setup] ${status} (${progress.percentage}%)`);
      } else {
        console.log(`[Docker Setup] ${status}`);
      }
    });

    if (dockerSuccess) {
      loadingScreen.setStatus('Docker services ready - Starting application...', 'success');
    } else {
      loadingScreen.setStatus('Docker setup incomplete - Starting in limited mode...', 'warning');
    }
    
    // Create the main window
    loadingScreen.setStatus('Loading main application...', 'info');
    await createMainWindow();
    
    // Initialize remaining services in background
    initializeServicesInBackground();
    
  } catch (error) {
    log.error(`Docker initialization error: ${error.message}`, error);
    loadingScreen?.setStatus(`Docker setup failed: ${error.message}`, 'error');
    
    // Fallback to lightweight mode
    setTimeout(async () => {
      await initializeWithoutDocker();
    }, 2000);
  }
}

async function initializeWithoutDocker() {
  try {
    // Register handlers for various app functions (only if not already registered)
    if (!global.handlersRegistered) {
      registerHandlers();
      global.handlersRegistered = true;
    }
    
    // Initialize essential services only
    llamaSwapService = new LlamaSwapService(ipcLogger);
    mcpService = new MCPService();
    updateService = platformUpdateService;
    
    // Load custom model path from file-based storage
    await loadCustomModelPath();
    
    // Set up progress callback to forward to renderer
    llamaSwapService.setProgressCallback((progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llama-progress-update', progressData);
      }
    });
    
    loadingScreen.setStatus('Initializing core services...', 'info');
    
    // Create the main window immediately for fast startup
    loadingScreen.setStatus('Starting main application...', 'success');
    await createMainWindow();
    
    // Initialize lightweight services in background
    initializeLightweightServicesInBackground();
    
  } catch (error) {
    log.error(`Lightweight initialization error: ${error.message}`, error);
    loadingScreen?.setStatus(`Error: ${error.message}`, 'error');
    
    // For critical startup errors, create main window anyway and show error
    await createMainWindow();
    await showStartupDialog(loadingScreen, 'error', 'Startup Error', `Critical error during startup: ${error.message}\n\nSome features may not work properly.`);
  }
}

async function loadCustomModelPath() {
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
}

async function continueNormalInitialization() {
  // This function is deprecated - replaced by the new two-type startup flow
  console.warn('continueNormalInitialization is deprecated - using new startup flow');
  await initialize();
}

/**
 * Initialize lightweight services in background when Docker is not available
 * This provides fast startup with limited functionality
 */
async function initializeLightweightServicesInBackground() {
  try {
    log.info('Starting lightweight service initialization...');
    
    // Send initialization status to renderer if main window is ready
    const sendStatus = (service, status, type = 'info') => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('background-service-status', { service, status, type });
      }
      log.info(`[Lightweight] ${service}: ${status}`);
    };

    // Initialize LlamaSwap service
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

    // Initialize MCP service
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
        global.mcpServersRestored = true; // Mark as restored to prevent duplicate restoration
      } catch (restoreError) {
        log.error('Error restoring MCP servers:', restoreError);
        sendStatus('MCP', 'Failed to restore some MCP servers', 'warning');
      }
    } catch (mcpError) {
      log.error('Error initializing MCP service:', mcpError);
      sendStatus('MCP', 'MCP service initialization failed', 'warning');
    }

    // Initialize Watchdog service (lightweight mode)
    sendStatus('Watchdog', 'Initializing Watchdog service...', 'info');
    try {
      watchdogService = new WatchdogService(null, llamaSwapService, mcpService, ipcLogger); // No Docker in lightweight mode
    
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

    // Notify that lightweight initialization is complete
    sendStatus('System', 'Lightweight initialization complete', 'success');
    log.info('Lightweight service initialization completed');
    
  } catch (error) {
    log.error('Error during lightweight service initialization:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-service-error', { 
        service: 'System', 
        error: `Lightweight initialization error: ${error.message}` 
      });
    }
  }
}

/**
 * Initialize all services in background after main window is ready (Docker mode)
 * This provides fast startup while services initialize progressively
 */
async function initializeServicesInBackground() {
  try {
    log.info('Starting remaining services initialization (Docker mode)...');
    
    // Send initialization status to renderer if main window is ready
    const sendStatus = (service, status, type = 'info') => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('background-service-status', { service, status, type });
      }
      log.info(`[Docker Mode] ${service}: ${status}`);
    };

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
      // Initialize MCP service if not already initialized
      if (!mcpService) {
        mcpService = new MCPService();
      }
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
        global.mcpServersRestored = true; // Mark as restored to prevent duplicate restoration
      } catch (restoreError) {
        log.error('Error restoring MCP servers:', restoreError);
        sendStatus('MCP', 'Failed to restore some MCP servers', 'warning');
      }
    } catch (mcpError) {
      log.error('Error initializing MCP service:', mcpError);
      sendStatus('MCP', 'MCP service initialization failed', 'warning');
    }

    // Initialize Watchdog service in background (with Docker support)
    sendStatus('Watchdog', 'Initializing Watchdog service...', 'info');
    try {
      watchdogService = new WatchdogService(dockerSetup, llamaSwapService, mcpService, ipcLogger);
    
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

      // Signal watchdog service that Docker setup is complete
      watchdogService.signalSetupComplete();

      sendStatus('Watchdog', 'Watchdog service started successfully', 'success');
    } catch (watchdogError) {
      log.error('Error initializing Watchdog service:', watchdogError);
      sendStatus('Watchdog', 'Watchdog service initialization failed', 'warning');
    }

    // Notify that Docker mode initialization is complete
    sendStatus('System', 'Docker mode initialization complete', 'success');
    log.info('Docker mode service initialization completed');
    
  } catch (error) {
    log.error('Error during Docker mode service initialization:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-service-error', { 
        service: 'System', 
        error: `Docker mode initialization error: ${error.message}` 
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
      sandbox: false,
      webSecurity: false, // Required for screen sharing in Electron
      experimentalFeatures: true // Enable experimental web features
    },
    show: false,
    backgroundColor: '#0f0f23', // Dark background to match loading screen
    frame: true
  });

  // Apply minimized state if needed
  if (shouldStartMinimized) {
    mainWindow.minimize();
  }

  // Handle window minimize to tray
  mainWindow.on('minimize', (event) => {
    if (process.platform !== 'darwin') {
      // On Windows/Linux, minimize to tray
      event.preventDefault();
      mainWindow.hide();
      
      // Show balloon notification if tray is available
      if (tray && process.platform === 'win32') {
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: 'ClaraVerse',
            content: 'ClaraVerse is still running in the background. Click the tray icon to restore.'
          });
        } catch (error) {
          log.warn('Failed to show balloon notification:', error);
        }
      }
    }
  });

  // Handle window close to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show balloon notification if tray is available
      if (tray && process.platform === 'win32') {
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: 'ClaraVerse',
            content: 'ClaraVerse is still running in the background. Click the tray icon to restore.'
          });
        } catch (error) {
          log.warn('Failed to show balloon notification:', error);
        }
      }
    }
  });

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
    log.info('Main window DOM ready, showing immediately (fast startup mode)');
    
    // Show window immediately for fast startup
    if (mainWindow && !mainWindow.isDestroyed()) {
      log.info('Showing main window (fast startup)');
      mainWindow.show();
    }
    
    // Initialize auto-updater when window is ready
    setupAutoUpdater(mainWindow);
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
app.whenReady().then(async () => {
  await initialize();
  
  // Create system tray
  createTray();
  
  // Register global shortcuts after app is ready
  registerGlobalShortcuts();
  
  log.info('Application initialization complete with global shortcuts registered');
});

// Quit when all windows are closed
app.on('window-all-closed', async () => {
  // If the app is quitting intentionally, proceed with cleanup
  if (isQuitting) {
    // Clean up tray
    if (tray) {
      tray.destroy();
      tray = null;
    }
    
    // Unregister global shortcuts when app is quitting
    globalShortcut.unregisterAll();
    
    // Stop watchdog service first
    if (watchdogService) {
      try {
        log.info('Stopping watchdog service...');
        watchdogService.stop();
      } catch (error) {
        log.error('Error stopping watchdog service:', error);
      }
    }

    // Stop widget service
    if (widgetService) {
      try {
        log.info('Stopping widget service...');
        await widgetService.cleanup();
      } catch (error) {
        log.error('Error stopping widget service:', error);
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
  } else {
    // If not quitting intentionally, keep the app running in the tray
    // On macOS, it's common to keep the app running when all windows are closed
    if (process.platform === 'darwin') {
      // Do nothing - keep app running
    } else {
      // On Windows/Linux, show a notification that the app is running in the tray
      log.info('App minimized to system tray');
    }
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// Register startup settings handler
ipcMain.handle('set-startup-settings', async (event, settings) => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'clara-settings.json');
    
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
    
    log.info('Startup settings updated successfully:', settings);
    return { success: true };
  } catch (error) {
    log.error('Error updating startup settings:', error);
    return { success: false, error: error.message };
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

// Register feature configuration IPC handlers
ipcMain.handle('get-feature-config', async () => {
  try {
    return FeatureSelectionScreen.getCurrentConfig();
  } catch (error) {
    log.error('Error getting feature configuration:', error);
    return null;
  }
});

ipcMain.handle('update-feature-config', async (event, newConfig) => {
  try {
    const FeatureSelectionScreen = require('./featureSelection.cjs');
    const featureSelection = new FeatureSelectionScreen();
    
    // Load current config
    const currentConfig = featureSelection.loadConfig();
    
    // Check if this is completing first-time setup
    const wasFirstTime = currentConfig.firstTimeSetup === true;
    
    // Update with new selections
    const updatedConfig = {
      ...currentConfig,
      selectedFeatures: {
        claraCore: true, // Always enabled
        ...newConfig
      },
      firstTimeSetup: false, // Mark onboarding as complete
      setupTimestamp: new Date().toISOString()
    };
    
    // Save the updated configuration
    const success = featureSelection.saveConfig(updatedConfig);
    
    if (success) {
      // Update global selected features
      global.selectedFeatures = updatedConfig.selectedFeatures;
      global.needsFeatureSelection = false; // User has completed onboarding
      log.info('✅ Feature configuration updated:', updatedConfig.selectedFeatures);
      
      // If this was first-time setup completion, initialize services with user consent
      if (wasFirstTime && newConfig.userConsentGiven) {
        log.info('🎉 User completed onboarding - initializing selected services with consent');
        
        // Send status update to UI
        const sendStatusUpdate = (status, details = {}) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('service-status-update', { status, ...details });
          }
        };
        
        // Initialize services with user's selections
        if (dockerSetup) {
          const isDockerAvailable = await dockerSetup.isDockerRunning();
          
          if (isDockerAvailable) {
            sendStatusUpdate('docker-available', { message: 'Starting selected services with Docker...' });
            await initializeServicesWithDocker(updatedConfig.selectedFeatures, sendStatusUpdate);
          } else {
            sendStatusUpdate('docker-not-available', { message: 'Starting selected services in lightweight mode...' });
            await initializeServicesWithoutDocker(updatedConfig.selectedFeatures, sendStatusUpdate);
          }
          
          sendStatusUpdate('ready', { message: 'All selected services initialized' });
        }
      }
    }
    
    return success;
  } catch (error) {
    log.error('Error updating feature configuration:', error);
    return false;
  }
});

ipcMain.handle('reset-feature-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'clara-features.yaml');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      log.info('Feature configuration reset successfully');
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error resetting feature configuration:', error);
    return false;
  }
});

// Model Manager IPC handlers
ipcMain.handle('model-manager:search-civitai', async (event, { query, types, sort, apiKey, nsfw = false }) => {
  try {
    // Enhanced search with multiple strategies for better results
    const searches = [];
    
    // Strategy 1: Exact query search
    const exactUrl = new URL('https://civitai.com/api/v1/models');
    exactUrl.searchParams.set('limit', '50'); // Increased limit for better results
    exactUrl.searchParams.set('query', query);
    exactUrl.searchParams.set('sort', sort || 'Highest Rated');
    if (types && types.length > 0) {
      exactUrl.searchParams.set('types', types.join(','));
    }
    if (nsfw) {
      exactUrl.searchParams.set('nsfw', 'true');
    }
    
    // Strategy 2: Tag-based search (if query looks like it could be tags)
    const tagUrl = new URL('https://civitai.com/api/v1/models');
    tagUrl.searchParams.set('limit', '30');
    tagUrl.searchParams.set('tag', query);
    tagUrl.searchParams.set('sort', sort || 'Highest Rated');
    if (types && types.length > 0) {
      tagUrl.searchParams.set('types', types.join(','));
    }
    if (nsfw) {
      tagUrl.searchParams.set('nsfw', 'true');
    }
    
    // Strategy 3: Username search (if query looks like a username)
    let usernameUrl = null;
    if (query && !query.includes(' ') && query.length > 2) {
      usernameUrl = new URL('https://civitai.com/api/v1/models');
      usernameUrl.searchParams.set('limit', '20');
      usernameUrl.searchParams.set('username', query);
      usernameUrl.searchParams.set('sort', sort || 'Highest Rated');
      if (types && types.length > 0) {
        usernameUrl.searchParams.set('types', types.join(','));
      }
      if (nsfw) {
        usernameUrl.searchParams.set('nsfw', 'true');
      }
    }

    // Add API key for authenticated requests if available
    const headers = {
      'User-Agent': 'Clara-AI-Assistant/1.0',
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Execute searches in parallel
    const searchPromises = [
      fetch(exactUrl.toString(), { headers }).then(r => r.json()),
      fetch(tagUrl.toString(), { headers }).then(r => r.json()).catch(() => ({ items: [] }))
    ];
    
    if (usernameUrl) {
      searchPromises.push(
        fetch(usernameUrl.toString(), { headers }).then(r => r.json()).catch(() => ({ items: [] }))
      );
    }

    const results = await Promise.all(searchPromises);
    
    // Combine and deduplicate results
    const allItems = [];
    const seenIds = new Set();
    
    results.forEach((result, index) => {
      if (result.items) {
        result.items.forEach(item => {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            // Add relevance score based on search strategy
            item._relevanceScore = index === 0 ? 10 : (index === 1 ? 7 : 5);
            allItems.push(item);
          }
        });
      }
    });
    
    // Enhanced sorting with relevance and popularity
    allItems.sort((a, b) => {
      // Primary sort by relevance score
      if (a._relevanceScore !== b._relevanceScore) {
        return b._relevanceScore - a._relevanceScore;
      }
      
      // Secondary sort by the requested sort order
      if (sort === 'Most Downloaded') {
        return (b.stats?.downloadCount || 0) - (a.stats?.downloadCount || 0);
      } else if (sort === 'Newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else { // Highest Rated
        return (b.stats?.rating || 0) - (a.stats?.rating || 0);
      }
    });

    return {
      items: allItems.slice(0, 60), // Return top 60 results
      metadata: {
        totalItems: allItems.length,
        searchStrategies: results.length,
        hasApiKey: !!apiKey
      }
    };
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
ipcMain.handle('comfyui-internal:download-model', async (event, { url, filename, category = 'checkpoints', apiKey, source }) => {
  try {
    if (!comfyUIModelService) {
      throw new Error('ComfyUI Model Service not initialized');
    }
    
    log.info(`Starting ComfyUI model download: ${filename} (${category}) from ${url}`);
    log.info(`API key provided: ${!!apiKey}, Source: ${source || 'unknown'}`);
    
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
      // Prepare options for download
      const downloadOptions = {
        apiKey,
        source: source || (url.includes('civitai.com') ? 'civitai' : url.includes('huggingface.co') ? 'huggingface' : 'unknown')
      };
      
      const result = await comfyUIModelService.downloadAndInstallModel(url, filename, category, progressHandler, downloadOptions);
      
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
    // Ensure ComfyUI Model Service is initialized
    if (!comfyUIModelService) {
      log.info('🎨 Initializing ComfyUI Model Service for list models request');
      comfyUIModelService = new ComfyUIModelService();
    }
    
    const models = await comfyUIModelService.listLocalModels(category);
    return { success: true, models };
  } catch (error) {
    log.error(`Error listing local ComfyUI ${category} models:`, error);
    return { success: false, error: error.message, models: [] };
  }
});

// Download model to local storage (persistent)
ipcMain.handle('comfyui-local:download-model', async (event, { url, filename, category = 'checkpoints', apiKey, source }) => {
  try {
    // Ensure ComfyUI Model Service is initialized for downloads
    if (!comfyUIModelService) {
      log.info('🎨 Initializing ComfyUI Model Service for download request');
      try {
        comfyUIModelService = new ComfyUIModelService();
        log.info('✅ ComfyUI Model Service initialized successfully');
      } catch (initError) {
        log.error('❌ Failed to initialize ComfyUI Model Service:', initError);
        throw new Error(`Failed to initialize ComfyUI Model Service: ${initError.message}`);
      }
    }
    
    log.info(`Starting local ComfyUI model download: ${filename} (${category}) from ${url}`);
    log.info(`API key provided: ${!!apiKey}, Source: ${source || 'unknown'}`);
    
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
      // Prepare options for download
      const downloadOptions = {
        apiKey,
        source: source || (url.includes('civitai.com') ? 'civitai' : url.includes('huggingface.co') ? 'huggingface' : 'unknown')
      };
      
      const result = await comfyUIModelService.downloadModel(url, filename, category, progressHandler, 0, downloadOptions);
      
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
    log.error('Error details:', {
      filename,
      category,
      url: url.substring(0, 100) + '...',
      error: error.message,
      stack: error.stack
    });
    
    // Send error event to frontend
    event.sender.send('comfyui-local-download-error', {
      filename,
      category,
      error: error.message
    });
    
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
    // Ensure ComfyUI Model Service is initialized
    if (!comfyUIModelService) {
      log.info('🎨 Initializing ComfyUI Model Service for delete model request');
      comfyUIModelService = new ComfyUIModelService();
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
    // Ensure ComfyUI Model Service is initialized
    if (!comfyUIModelService) {
      log.info('🎨 Initializing ComfyUI Model Service for import model request');
      comfyUIModelService = new ComfyUIModelService();
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
    // Ensure ComfyUI Model Service is initialized
    if (!comfyUIModelService) {
      log.info('🎨 Initializing ComfyUI Model Service for storage info request');
      comfyUIModelService = new ComfyUIModelService();
    }
    
    const storageInfo = await comfyUIModelService.getEnhancedStorageInfo();
    return { success: true, storage: storageInfo };
  } catch (error) {
    log.error('Error getting enhanced ComfyUI storage info:', error);
    return { success: false, error: error.message, storage: null };
  }
});

// Find the initializeServicesInBackground function and add central service manager integration
async function initializeServicesInBackground() {
  try {
    log.info('Starting remaining services initialization (Docker mode)...');
    
    // Send initialization status to renderer if main window is ready
    const sendStatus = (service, status, type = 'info') => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('background-service-status', { service, status, type });
      }
      log.info(`[Docker Mode] ${service}: ${status}`);
    };

    // NEW: Start central service manager services first
    if (centralServiceManager) {
      try {
        sendStatus('System', 'Starting service management system...', 'info');
        log.info('🎯 Starting central service manager services...');
        
        // Update service states based on Docker container status
        if (dockerSetup) {
          await updateCentralServiceManagerWithDockerStatus();
        }
        
        // Start manual services through central manager
        await startManualServicesInCentralManager();
        
        sendStatus('System', 'Service management system started', 'success');
      } catch (error) {
        log.error('❌ Error starting central service manager services:', error);
        sendStatus('System', 'Service management system startup failed', 'warning');
      }
    }

    // Initialize LlamaSwap service in background
    sendStatus('LLM', 'Initializing LLM service...', 'info');
    try {
      const llamaSwapSuccess = await llamaSwapService.start();
      if (llamaSwapSuccess) {
        sendStatus('LLM', 'LLM service started successfully', 'success');
        
        // Update central service manager with llamaswap status
        if (centralServiceManager) {
          updateServiceStateInCentralManager('llamaswap', 'running', {
            type: 'native',
            startTime: Date.now(),
            healthCheck: () => llamaSwapService.isRunning()
          });
        }
      } else {
        sendStatus('LLM', 'LLM service failed to start (available for manual start)', 'warning');
        if (centralServiceManager) {
          updateServiceStateInCentralManager('llamaswap', 'error', null);
        }
      }
    } catch (llamaSwapError) {
      log.error('Error initializing llama-swap service:', llamaSwapError);
      sendStatus('LLM', 'LLM service initialization failed (available for manual start)', 'warning');
      if (centralServiceManager) {
        updateServiceStateInCentralManager('llamaswap', 'error', null);
      }
    }

    // Initialize MCP service in background
    sendStatus('MCP', 'Initializing MCP service...', 'info');
    try {
      // Initialize MCP service if not already initialized
      if (!mcpService) {
        mcpService = new MCPService();
      }
      sendStatus('MCP', 'MCP service initialized', 'success');
      
      // Update central service manager with MCP status
      if (centralServiceManager) {
        updateServiceStateInCentralManager('mcp', 'running', {
          type: 'service',
          startTime: Date.now(),
          healthCheck: () => mcpService && Object.keys(mcpService.servers).length > 0
        });
      }
      
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
        global.mcpServersRestored = true; // Mark as restored to prevent duplicate restoration
      } catch (restoreError) {
        log.error('Error restoring MCP servers:', restoreError);
        sendStatus('MCP', 'Failed to restore some MCP servers', 'warning');
      }
    } catch (mcpError) {
      log.error('Error initializing MCP service:', mcpError);
      sendStatus('MCP', 'MCP service initialization failed', 'warning');
      if (centralServiceManager) {
        updateServiceStateInCentralManager('mcp', 'error', null);
      }
    }

    // Initialize Watchdog service in background (with Docker support)
    sendStatus('Watchdog', 'Initializing Watchdog service...', 'info');
    try {
      watchdogService = new WatchdogService(dockerSetup, llamaSwapService, mcpService, ipcLogger);
    
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

      // Signal watchdog service that Docker setup is complete
      watchdogService.signalSetupComplete();

      sendStatus('Watchdog', 'Watchdog service started successfully', 'success');
    } catch (watchdogError) {
      log.error('Error initializing Watchdog service:', watchdogError);
      sendStatus('Watchdog', 'Watchdog service initialization failed', 'warning');
    }

    // Notify that Docker mode initialization is complete
    sendStatus('System', 'Docker mode initialization complete', 'success');
    log.info('Docker mode service initialization completed');
    
  } catch (error) {
    log.error('Error during Docker mode service initialization:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-service-error', { 
        service: 'System', 
        error: `Docker mode initialization error: ${error.message}` 
      });
    }
  }
}

// NEW: Helper function to update central service manager with Docker container status
async function updateCentralServiceManagerWithDockerStatus() {
  if (!dockerSetup || !centralServiceManager) return;

  try {
    log.info('🔄 Updating central service manager with Docker container status...');
    
    // Check Docker daemon status
    const dockerRunning = await dockerSetup.isDockerRunning();
    if (dockerRunning) {
      updateServiceStateInCentralManager('docker', 'running', {
        type: 'docker-daemon',
        startTime: Date.now(),
        healthCheck: () => dockerSetup.isDockerRunning()
      });
    } else {
      updateServiceStateInCentralManager('docker', 'stopped', null);
    }

    // Check individual container status
    const containerServices = ['python-backend', 'n8n', 'comfyui'];
    
    for (const serviceName of containerServices) {
      try {
        const containerName = `clara_${serviceName.replace('-backend', '')}`;
        const container = dockerSetup.docker.getContainer(containerName);
        const containerInfo = await container.inspect();
        
        if (containerInfo.State.Running) {
          const serviceUrl = getServiceUrlFromContainer(serviceName, containerInfo);
          log.info(`🔗 Detected Docker service URL for ${serviceName}: ${serviceUrl}`);
          updateServiceStateInCentralManager(serviceName, 'running', {
            type: 'docker-container',
            containerName: containerName,
            startTime: Date.now(),
            url: serviceUrl,
            healthCheck: () => checkContainerHealth(containerName)
          });
        } else {
          updateServiceStateInCentralManager(serviceName, 'stopped', null);
        }
      } catch (error) {
        // Container not found or error - mark as stopped
        updateServiceStateInCentralManager(serviceName, 'stopped', null);
        log.debug(`Container ${serviceName} not found or not running`);
      }
    }
    
    log.info('✅ Central service manager updated with Docker status');
  } catch (error) {
    log.error('❌ Error updating central service manager with Docker status:', error);
  }
}

// NEW: Helper function to start manual services in central manager
async function startManualServicesInCentralManager() {
  if (!centralServiceManager || !serviceConfigManager) return;

  try {
    log.info('🔄 Starting manual services in central service manager...');
    
    if (serviceConfigManager && typeof serviceConfigManager.getAllServiceConfigs === 'function') {
      const allConfigs = serviceConfigManager.getAllServiceConfigs();
      
      for (const [serviceName, config] of Object.entries(allConfigs)) {
        if (config.mode === 'manual' && config.url) {
          try {
            await centralServiceManager.startService(serviceName);
            log.info(`✅ Manual service ${serviceName} started via central manager`);
          } catch (error) {
            log.error(`❌ Failed to start manual service ${serviceName}:`, error);
          }
        }
      }
    } else {
      log.warn('Service config manager not available, skipping manual services startup');
    }
    
    log.info('✅ Manual services startup completed');
  } catch (error) {
    log.error('❌ Error starting manual services:', error);
  }
}

// NEW: Helper function to update service state in central manager
function updateServiceStateInCentralManager(serviceName, state, instance) {
  if (!centralServiceManager) return;
  
  try {
    const service = centralServiceManager.services.get(serviceName);
    if (service) {
      service.state = state;
      service.instance = instance;
      service.lastHealthCheck = Date.now();
      
      if (instance && instance.url) {
        service.serviceUrl = instance.url;
        log.debug(`🎯 Set serviceUrl for ${serviceName}: ${instance.url}`);
      }
      
      centralServiceManager.serviceStates.set(serviceName, state);
      
      log.debug(`📊 Updated ${serviceName} state to ${state} in central manager`);
    }
  } catch (error) {
    log.error(`❌ Error updating service state for ${serviceName}:`, error);
  }
}

// NEW: Helper function to get service URL from container info
function getServiceUrlFromContainer(serviceName, containerInfo) {
  try {
    const ports = containerInfo.NetworkSettings.Ports;
    
    // Service-specific port mapping
    const servicePortMap = {
      'python-backend': '5001',
      'n8n': '5678', 
      'comfyui': '8188'
    };
    
    const targetPort = servicePortMap[serviceName];
    if (!targetPort) return null;
    
    const portKey = `${targetPort}/tcp`;
    if (ports[portKey] && ports[portKey][0]) {
      const hostPort = ports[portKey][0].HostPort;
      return `http://localhost:${hostPort}`;
    }
    
    return `http://localhost:${targetPort}`;
  } catch (error) {
    log.error(`Error getting service URL for ${serviceName}:`, error);
    return null;
  }
}

// NEW: Helper function to check container health
async function checkContainerHealth(containerName) {
  if (!dockerSetup) return false;
  
  try {
    const container = dockerSetup.docker.getContainer(containerName);
    const containerInfo = await container.inspect();
    return containerInfo.State.Running;
  } catch (error) {
    return false;
  }
}

// Register global shortcuts for quick access
function registerGlobalShortcuts() {
  try {
    // Clear any existing shortcuts to avoid conflicts
    globalShortcut.unregisterAll();
    
    // Define shortcuts based on platform
    const shortcuts = process.platform === 'darwin' 
      ? ['Option+Ctrl+Space'] 
      : ['Ctrl+Alt+Space'];
    
    // Debounce variables to prevent multiple rapid triggers
    let lastTriggerTime = 0;
    const debounceDelay = 500; // 500ms debounce
    
    shortcuts.forEach(shortcut => {
      const ret = globalShortcut.register(shortcut, () => {
        const now = Date.now();
        
        // Check if we're within the debounce period
        if (now - lastTriggerTime < debounceDelay) {
          log.info(`Global shortcut ${shortcut} debounced - too soon after last trigger`);
          return;
        }
        
        lastTriggerTime = now;
        log.info(`Global shortcut ${shortcut} pressed - bringing Clara to foreground`);
        
        // Bring window to foreground
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          
          // Focus and show the window
          mainWindow.focus();
          mainWindow.show();
          
          // Send message to renderer to start new chat
          mainWindow.webContents.send('trigger-new-chat');
        } else {
          log.warn('Main window not available for global shortcut');
        }
      });
      
      if (!ret) {
        log.error(`Failed to register global shortcut: ${shortcut}`);
      } else {
        log.info(`Successfully registered global shortcut: ${shortcut}`);
      }
    });
    
    log.info(`Global shortcuts registered for platform: ${process.platform}`);
  } catch (error) {
    log.error('Error registering global shortcuts:', error);
  }
}

// Add tray creation function
function createTray() {
  if (tray) return;
  
  try {
    // Try to use the actual logo file first
    const possibleLogoPaths = [
      path.join(__dirname, 'assets', 'tray-icon.png'),
      path.join(__dirname, '../public/logo.png'),
      path.join(__dirname, '../src/assets/logo.png'),
      path.join(__dirname, '../assets/icons/logo.png'),
      path.join(__dirname, '../assets/icons/png/logo.png')
    ];
    
    let trayIcon;
    let logoFound = false;
    
    // Try to find and use the actual logo
    for (const logoPath of possibleLogoPaths) {
      if (fs.existsSync(logoPath)) {
        try {
          trayIcon = nativeImage.createFromPath(logoPath);
          
          // Resize for tray - different sizes for different platforms
          if (process.platform === 'darwin') {
            // macOS prefers 16x16 for tray icons
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
            // Set as template image for proper macOS styling
            trayIcon.setTemplateImage(true);
          } else if (process.platform === 'win32') {
            // Windows prefers 16x16 or 32x32
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
          } else {
            // Linux typically uses 22x22 or 24x24
            trayIcon = trayIcon.resize({ width: 22, height: 22 });
          }
          
          logoFound = true;
          log.info(`Using logo from: ${logoPath}`);
          break;
        } catch (error) {
          log.warn(`Failed to load logo from ${logoPath}:`, error);
        }
      }
    }
    
    // Fallback to programmatic icon if logo not found
    if (!logoFound) {
      log.info('Logo file not found, creating programmatic icon');
      const iconSize = process.platform === 'darwin' ? 16 : (process.platform === 'win32' ? 16 : 22);
      
      if (process.platform === 'darwin') {
        // For macOS, create a simple template icon (must be black/transparent for template)
        const canvas = `
          <svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize/2 - 2}" fill="black" stroke="black" stroke-width="1"/>
            <text x="50%" y="50%" text-anchor="middle" dy="0.3em" fill="white" font-size="${iconSize-8}" font-family="Arial" font-weight="bold">C</text>
          </svg>
        `;
        trayIcon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`);
        trayIcon.setTemplateImage(true);
      } else {
        // For Windows/Linux, create a colored icon matching ClaraVerse brand colors
        const canvas = `
          <svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF1B6B;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#3A3A5C;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize/2 - 1}" fill="url(#grad1)" stroke="#FF1B6B" stroke-width="1"/>
            <text x="50%" y="50%" text-anchor="middle" dy="0.3em" fill="white" font-size="${iconSize-8}" font-family="Arial" font-weight="bold">C</text>
          </svg>
        `;
        trayIcon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`);
      }
    }
    
    // Create the tray
    tray = new Tray(trayIcon);
    
    // Set tooltip
    tray.setToolTip('ClaraVerse');
    
    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show ClaraVerse',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Hide ClaraVerse',
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // Handle tray click
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createMainWindow();
      }
    });
    
    // Handle double-click on tray (Windows/Linux)
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      } else {
        createMainWindow();
      }
    });
    
    log.info('System tray created successfully');
  } catch (error) {
    log.error('Error creating system tray:', error);
  }
}