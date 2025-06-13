const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

class LoadingScreen {
  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    
    // Check fullscreen startup preference
    let shouldStartFullscreen = false;
    try {
      const userDataPath = app.getPath('userData');
      const settingsPath = path.join(userDataPath, 'settings.json');
      
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        shouldStartFullscreen = settings.startup?.startFullscreen ?? settings.fullscreen_startup ?? false;
      }
    } catch (error) {
      console.error('Error reading fullscreen startup preference:', error);
    }
    
    this.window = new BrowserWindow({
      fullscreen: shouldStartFullscreen,
      frame: false,
      transparent: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      skipTaskbar: true,
      resizable: false,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#667eea'
    });

    // Show window when ready to prevent flash
    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    // Log any errors
    this.window.webContents.on('crashed', (e) => {
      console.error('Loading screen crashed:', e);
    });

    this.window.webContents.on('did-fail-load', (event, code, description) => {
      console.error('Failed to load loading screen:', code, description);
    });

    const htmlPath = isDev 
      ? path.join(__dirname, 'loading.html')
      : path.join(app.getAppPath(), 'electron', 'loading.html');

    console.log('Loading screen from:', htmlPath);
    this.window.loadFile(htmlPath);
  }

  setStatus(message, type = 'info') {
    if (!this.window) return;
    
    const data = {
      message: message,
      type: type,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[Loading] Setting status:`, data);
    this.window.webContents.send('status', data);
  }

  // Notify that main window is ready
  notifyMainWindowReady() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('main-window-ready');
    }
  }

  // Hide the loading screen
  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('hide-loading');
    }
  }

  // Close the loading screen
  close() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }

  // Check if window exists and is not destroyed
  isValid() {
    return this.window && !this.window.isDestroyed();
  }
}

module.exports = LoadingScreen; 