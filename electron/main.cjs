const { app, BrowserWindow, ipcMain, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater, checkForUpdates } = require('./updateService.cjs');
const SplashScreen = require('./splash.cjs');
const { createAppMenu } = require('./menu.cjs');
const LlamaSwapService = require('./llamaSwapService.cjs');

// Configure the main process logger
log.transports.file.level = 'info';
log.info('Application starting...');

// Global variables
let mainWindow;
let splash;
let dockerSetup;
let llamaSwapService;

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

  // Add handler for restarting interpreter container
  ipcMain.handle('restartInterpreterContainer', async () => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        throw new Error('Docker setup not initialized');
      }
      
      log.info('Restarting interpreter container...');
      
      // Check if container exists
      try {
        // Stop and remove the interpreter container
        const container = await dockerSetup.docker.getContainer('clara_interpreter');
        log.info('Stopping interpreter container...');
        await container.stop();
        log.info('Removing interpreter container...');
        await container.remove();
      } catch (containerError) {
        log.error('Error handling existing container:', containerError);
        // Continue even if container doesn't exist or can't be stopped/removed
      }
      
      // Start a new container
      log.info('Starting new interpreter container...');
      await dockerSetup.startContainer(dockerSetup.containers.interpreter);
      log.info('Interpreter container restarted successfully');
      return { success: true };
    } catch (error) {
      log.error('Error restarting interpreter container:', error);
      return { success: false, error: error.message };
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
      
      const success = await llamaSwapService.start();
      return { success, status: llamaSwapService.getStatus() };
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
      
      const success = await llamaSwapService.restart();
      return { success, status: llamaSwapService.getStatus() };
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
}

function registerModelManagerHandlers() {
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
      
      const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=${limit}&sort=downloads&full=true`;
      
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
        files: model.siblings ? model.siblings.filter(file => file.rfilename.endsWith('.gguf')) : []
      }));
      
      return { success: true, models: ggufModels };
    } catch (error) {
      log.error('Error searching HuggingFace models:', error);
      return { success: false, error: error.message, models: [] };
    }
  });

  // Download model from Hugging Face
  ipcMain.handle('download-huggingface-model', async (_event, { modelId, fileName }) => {
    try {
      const fs = require('fs');
      const https = require('https');
      const http = require('http');
      const path = require('path');
      const os = require('os');
      
      // Ensure models directory exists
      const modelsDir = path.join(os.homedir(), '.clara', 'llama-models');
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

// Register handlers for various app functions
function registerHandlers() {
  registerLlamaSwapHandlers();
  registerDockerContainerHandlers();
  registerModelManagerHandlers();
}

async function initializeApp() {
  try {
    // Show splash screen
    splash = new SplashScreen();
    splash.setStatus('Starting Clara...', 'info');
    
    // Register handlers for various app functions
    registerHandlers();
    
    // Initialize Docker setup
    dockerSetup = new DockerSetup();
    
    // Setup Docker environment
    splash.setStatus('Setting up Docker environment...', 'info');
    const success = await dockerSetup.setup((status, type = 'info') => {
      splash.setStatus(status, type);
      
      if (type === 'error') {
        dialog.showErrorBox('Setup Error', status);
      }
    });

    if (!success) {
      splash.setStatus('Docker setup incomplete. Please start Docker Desktop and restart the application.', 'error');
      dialog.showMessageBox(null, {
        type: 'info',
        title: 'Docker Setup',
        message: 'Please start Docker Desktop and restart the application.',
        buttons: ['OK']
      });
      app.quit();
      return;
    }

    // Initialize llama-swap service
    splash.setStatus('Initializing LLM service...', 'info');
    try {
      llamaSwapService = new LlamaSwapService();
      // Start llama-swap service
      const llamaSwapSuccess = await llamaSwapService.start();
      if (llamaSwapSuccess) {
        splash.setStatus('LLM service started successfully', 'success');
        log.info('Llama-swap service started successfully');
      } else {
        splash.setStatus('LLM service failed to start (will be available for manual start)', 'warning');
        log.warn('Llama-swap service failed to start during initialization');
      }
    } catch (llamaSwapError) {
      splash.setStatus('LLM service initialization failed (will be available for manual start)', 'warning');
      log.error('Error initializing llama-swap service:', llamaSwapError);
    }

    // Docker setup successful, create the main window immediately
    log.info('Docker setup successful. Creating main window...');
    splash.setStatus('Starting main application...', 'success');
    createMainWindow();

    // Close splash screen after a short delay (allowing main window to start loading)
    setTimeout(() => {
      splash?.close();
      splash = null; // Release reference
    }, 2000); // Adjust delay if needed
    
  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    splash?.setStatus(`Error: ${error.message}`, 'error');
    
    if (error.message.includes('Docker is not running')) {
      const downloadLink = error.message.split('\n')[1];
      let options;
      if (process.platform === 'linux') {
        options = {
          type: 'info',
          title: 'Docker Required',
          message: 'Docker Engine is required but not installed.',
          detail: 'Please install Docker Engine by following the instructions at the provided link, then restart Clara.',
          buttons: ['Open Docker Docs', 'Close'],
          defaultId: 0,
          cancelId: 1
        };
      } else {
        options = {
          type: 'info',
          title: 'Docker Required',
          message: 'Docker Desktop is required but not installed.',
          detail: 'Please download and install Docker Desktop, then restart Clara.',
          buttons: ['Download Docker Desktop', 'Close'],
          defaultId: 0,
          cancelId: 1
        };
      }
      dialog.showMessageBox(null, options).then(({ response }) => {
        if (response === 0) {
          require('electron').shell.openExternal(downloadLink);
        }
        splash?.close();
        app.quit();
      });
    } else {
      dialog.showErrorBox('Setup Error', error.message);
      // Keep splash open on error for a bit before quitting
      setTimeout(() => {
        splash?.close();
        app.quit();
      }, 4000);
    }
  }
}

function createMainWindow() {
  if (mainWindow) return;
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    },
    show: false,
    backgroundColor: '#f5f5f5'
  });

  // Create and set the application menu
  createAppMenu(mainWindow);

  // Set security policies for webview, using the dynamic n8n port
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const n8nPort = dockerSetup?.ports?.n8n; // Get the determined n8n port
    
    // Allow if the n8n port is determined and the URL matches
    if (n8nPort && url.startsWith(`http://localhost:${n8nPort}`)) { 
      callback(true);
    } else {
      log.warn(`Blocked permission request for URL: ${url} (n8n port: ${n8nPort})`);
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

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Initialize auto-updater when window is ready
    if (process.env.NODE_ENV !== 'development') {
      setupAutoUpdater(mainWindow);
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
  // Stop llama-swap service
  if (llamaSwapService) {
    try {
      log.info('Stopping llama-swap service...');
      await llamaSwapService.stop();
    } catch (error) {
      log.error('Error stopping llama-swap service:', error);
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Handle IPC messages
ipcMain.handle('get-app-path', () => app.getPath('userData'));
ipcMain.handle('getWorkflowsPath', () => {
  return path.join(app.getAppPath(), 'workflows', 'n8n_workflows_full.json');
});

// Add handler for checking updates
ipcMain.handle('check-for-updates', () => {
  return checkForUpdates();
});

// Handle microphone permission request
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

// IPC handler to get service ports
ipcMain.handle('get-service-ports', () => {
  if (dockerSetup && dockerSetup.ports) {
    return dockerSetup.ports;
  }
  return null; // Or throw an error if setup isn't complete
});

// IPC handler to get Python port specifically
ipcMain.handle('get-python-port', () => {
  if (dockerSetup && dockerSetup.ports && dockerSetup.ports.python) {
    return dockerSetup.ports.python;
  }
  return null;
});

// IPC handler to check Python backend status
ipcMain.handle('check-python-backend', async () => {
  try {
    if (!dockerSetup || !dockerSetup.ports || !dockerSetup.ports.python) {
      return { status: 'error', message: 'Python backend not configured' };
    }

    // Check if Python container is running
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

// Handle backend status updates
ipcMain.on('backend-status', (event, status) => {
  if (mainWindow) {
    mainWindow.webContents.send('backend-status', status);
  }
});

// Handle Python status updates
ipcMain.on('python-status', (event, status) => {
  if (mainWindow) {
    mainWindow.webContents.send('python-status', status);
  }
});