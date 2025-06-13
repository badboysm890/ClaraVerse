const { BrowserWindow, app, screen } = require('electron');
const path = require('path');
const fs = require('fs');

class SplashScreen {
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
      show: false
    });

    // Show window when ready to prevent flash
    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    // Log any errors
    this.window.webContents.on('crashed', (e) => {
      console.error('Splash screen crashed:', e);
    });

    this.window.webContents.on('did-fail-load', (event, code, description) => {
      console.error('Failed to load splash:', code, description);
    });

    const htmlPath = isDev 
      ? path.join(__dirname, 'splash.html')
      : path.join(app.getAppPath(), 'electron', 'splash.html');

    console.log('Loading splash from:', htmlPath);
    this.window.loadFile(htmlPath);
  }

  setStatus(message, type = 'info') {
    if (!this.window) return;
    
    const data = {
      message: message,
      type: type,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[Splash] Setting status:`, data);
    this.window.webContents.send('status', data);
  }

  close() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }
}

module.exports = SplashScreen;