const { BrowserWindow, app, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

class FeatureSelectionScreen {
  constructor() {
    this.window = null;
    this.configPath = path.join(app.getPath('userData'), 'angela-features.yaml');
    
    // Default feature configuration
    this.defaultConfig = {
      version: '1.0.0',
      firstTimeSetup: true,
      selectedFeatures: {
        comfyUI: true,
        n8n: true,
        ragAndTts: true,
        angelaCore: true // Always enabled
      },
      setupTimestamp: null
    };
  }

  /**
   * Check if this is the first time launch
   */
  isFirstTimeLaunch() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return true;
      }
      
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(configContent);
      
      return config?.firstTimeSetup === true;
    } catch (error) {
      console.error('Error checking first time launch:', error);
      return true; // Default to first time if we can't read config
    }
  }

  /**
   * Load existing feature configuration
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.defaultConfig;
      }
      
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(configContent);
      
      // Merge with defaults to ensure all properties exist
      return {
        ...this.defaultConfig,
        ...config,
        selectedFeatures: {
          ...this.defaultConfig.selectedFeatures,
          ...config.selectedFeatures
        }
      };
    } catch (error) {
      console.error('Error loading feature config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Save feature configuration to YAML file
   */
  saveConfig(config) {
    try {
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
      
      fs.writeFileSync(this.configPath, yamlContent, 'utf8');
      console.log('✅ Feature configuration saved to:', this.configPath);
      return true;
    } catch (error) {
      console.error('❌ Error saving feature configuration:', error);
      return false;
    }
  }

  /**
   * Create and show the feature selection window
   */
  async show() {
    return new Promise((resolve, reject) => {
      try {
        const isDev = process.env.NODE_ENV === 'development';
        
        // Get primary display dimensions
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        
        this.window = new BrowserWindow({
          width: Math.max(600, Math.min(900, width * 0.8)),
          height: Math.max(500, Math.min(700, height * 0.85)),
          minWidth: 500,
          minHeight: 450,
          center: true,
          frame: false,
          transparent: false,
          resizable: true,
          alwaysOnTop: true,
          show: false,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
          },
          skipTaskbar: false
        });

        // Load current configuration
        const currentConfig = this.loadConfig();

        // Handle window events
        this.window.once('ready-to-show', () => {
          this.window.show();
          // Send current configuration to renderer
          this.window.webContents.send('load-config', currentConfig);
        });

        // Track if we're closing intentionally
        let intentionalClose = false;
        
        this.window.on('closed', () => {
          this.window = null;
          // Only reject if the window was closed without completing selection
          if (!intentionalClose) {
            reject(new Error('Feature selection window was closed'));
          }
        });

        // Handle feature selection completion
        ipcMain.once('feature-selection-complete', (event, selectedFeatures) => {
          console.log('Received feature-selection-complete event:', selectedFeatures);
          try {
            // Create final configuration
            const finalConfig = {
              ...currentConfig,
              firstTimeSetup: false,
              selectedFeatures: {
                angelaCore: true, // Always enabled
                ...selectedFeatures
              },
              setupTimestamp: new Date().toISOString()
            };

            // Save configuration
            const saved = this.saveConfig(finalConfig);
            if (saved) {
              console.log('✅ Feature selection completed:', finalConfig.selectedFeatures);
              
              // Mark as intentional close
              intentionalClose = true;
              
              // Resolve the promise first
              resolve(finalConfig.selectedFeatures);
              
              // Then close the window after a small delay
              setTimeout(() => {
                console.log('Closing feature selection window after successful save...');
                if (this.window && !this.window.isDestroyed()) {
                  this.window.destroy(); // Use destroy instead of close to force it
                }
              }, 100);
            } else {
              console.error('Failed to save feature configuration');
              intentionalClose = true;
              reject(new Error('Failed to save feature configuration'));
              
              // Close window after rejection
              setTimeout(() => {
                if (this.window && !this.window.isDestroyed()) {
                  this.window.destroy();
                }
              }, 100);
            }
          } catch (error) {
            console.error('Error handling feature selection:', error);
            intentionalClose = true;
            reject(error);
            
            // Close window after error
            setTimeout(() => {
              if (this.window && !this.window.isDestroyed()) {
                this.window.destroy();
              }
            }, 100);
          }
        });

        // Handle window close request
        ipcMain.once('close-feature-selection', () => {
          console.log('Received close-feature-selection request');
          intentionalClose = true;
          reject(new Error('Feature selection was cancelled'));
          
          // Force close the window
          setTimeout(() => {
            if (this.window && !this.window.isDestroyed()) {
              this.window.destroy();
            }
          }, 100);
        });

        // Load the HTML file
        const htmlPath = isDev 
          ? path.join(__dirname, 'featureSelection.html')
          : path.join(app.getAppPath(), 'electron', 'featureSelection.html');

        console.log('Loading feature selection from:', htmlPath);
        this.window.loadFile(htmlPath);

      } catch (error) {
        console.error('Error creating feature selection window:', error);
        reject(error);
      }
    });
  }

  /**
   * Close the feature selection window
   */
  close() {
    console.log('Attempting to close feature selection window...');
    if (this.window && !this.window.isDestroyed()) {
      // Remove IPC listeners
      ipcMain.removeAllListeners('feature-selection-complete');
      ipcMain.removeAllListeners('close-feature-selection');
      
      try {
        this.window.close();
        console.log('Feature selection window closed successfully');
      } catch (error) {
        console.error('Error closing feature selection window:', error);
      }
      this.window = null;
    } else {
      console.log('Feature selection window already closed or destroyed');
    }
  }

  /**
   * Get the current feature configuration (for use by main process)
   */
  static getCurrentConfig() {
    const configPath = path.join(app.getPath('userData'), 'angela-features.yaml');
    
    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }
      
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      
      return config?.selectedFeatures || null;
    } catch (error) {
      console.error('Error loading current feature config:', error);
      return null;
    }
  }
}

module.exports = FeatureSelectionScreen; 
