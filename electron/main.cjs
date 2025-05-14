const { app, BrowserWindow, ipcMain, dialog, systemPreferences, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater, checkForUpdates } = require('./updateService.cjs');
const SplashScreen = require('./splash.cjs');

// Configure the main process logger
log.transports.file.level = 'info';
log.info('Application starting...');

// Global variables
let mainWindow;
let splash;
let dockerSetup;

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

async function initializeApp() {
  try {
    // Show splash screen
    splash = new SplashScreen();
    splash.setStatus('Starting Clara...', 'info');
    
    // Initialize Docker setup
    dockerSetup = new DockerSetup();
    
    // Register Docker container management IPC handlers
    registerDockerContainerHandlers();
    
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
    
    // Auto-update initialization removed - updates only triggered manually via menu
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Do not remove this code
// Create application menu
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: async () => {
            log.info('Manual update check initiated from menu');
            try {
              // Initialize auto-updater before checking
              setupAutoUpdater(mainWindow);
              await checkForUpdates();
            } catch (error) {
              log.error('Manual update check failed:', error);
            }
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    
    // File menu
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Clara',
          click: async () => {
            dialog.showMessageBox({
              title: 'About Clara',
              message: `Clara ${app.getVersion()}`,
              detail: 'Your AI-powered digital assistant.',
              buttons: ['OK']
            });
          }
        },
        // Add Check for Updates here too for non-Mac platforms
        ...(isMac ? [] : [
          {
            label: 'Check for Updates',
            click: async () => {
              log.info('Manual update check initiated from menu');
              try {
                // Initialize auto-updater before checking
                setupAutoUpdater(mainWindow);
                await checkForUpdates();
              } catch (error) {
                log.error('Manual update check failed:', error);
              }
            }
          }
        ])
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Initialize app when ready
app.whenReady().then(initializeApp);

// Also create the application menu when the app is ready
app.whenReady().then(createAppMenu);

// Register standalone handlers
app.whenReady().then(() => {
  // Add explicit restart handler outside the Docker container handlers function
  ipcMain.handle('restartInterpreterContainer', async () => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        throw new Error('Docker setup not initialized');
      }
      
      log.info('Restarting interpreter container (standalone handler)...');
      
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
});

// Quit when all windows are closed
app.on('window-all-closed', async () => {
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

// IPC handler for manual update checking
ipcMain.handle('check-for-updates', async () => {
  log.info('Manual update check initiated from renderer');
  try {
    // Initialize auto-updater before checking
    if (mainWindow) {
      setupAutoUpdater(mainWindow);
    } else {
      log.error('Cannot check for updates: mainWindow is null');
      return { success: false, error: 'Application window not available' };
    }
    await checkForUpdates();
    return { success: true };
  } catch (error) {
    log.error('Manual update check failed:', error);
    return { success: false, error: error.message };
  }
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

ipcMain.handle('getWorkflowsPath', async () => {
  return path.join(app.getPath('home'), '.clara', 'workflows');
});