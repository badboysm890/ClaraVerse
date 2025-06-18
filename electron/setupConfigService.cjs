const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { app } = require('electron');

class SetupConfigService {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'clara-setup.yaml');
    console.log('🔧 SetupConfigService constructor - configPath:', this.configPath);
    
    this.defaultConfig = {
      version: '1.0.0',
      firstTimeSetup: true,
      setupCompleted: false,
      setupDate: null,
      services: {
        comfyui: {
          enabled: false,
          autoStart: false,
          configured: false
        },
        n8n: {
          enabled: false,
          autoStart: false,
          configured: false
        },
        tts: {
          enabled: false,
          autoStart: false,
          configured: false
        }
      },
      docker: {
        available: false,
        checked: false,
        installPrompted: false
      },
      preferences: {
        skipSetupOnStartup: false,
        autoStartServices: true,
        showProgressDetails: true
      },
      activeBrandId: 'studentlyai' // Default brand ID
    };
    
    console.log('🔧 SetupConfigService constructor - loading config...');
    this.config = this.loadConfig();
    console.log('🔧 SetupConfigService constructor - config loaded:', { 
      firstTimeSetup: this.config.firstTimeSetup, 
      setupCompleted: this.config.setupCompleted 
    });
    
    console.log('🔧 SetupConfigService constructor - ensuring config exists...');
    this.ensureConfigExists();
    console.log('🔧 SetupConfigService constructor - final config:', { 
      firstTimeSetup: this.config.firstTimeSetup, 
      setupCompleted: this.config.setupCompleted 
    });
  }

  /**
   * Ensure configuration file exists with default values
   */
  ensureConfigExists() {
    console.log('🔧 ensureConfigExists - checking if file exists:', this.configPath);
    console.log('🔧 ensureConfigExists - file exists:', fs.existsSync(this.configPath));
    
    if (!fs.existsSync(this.configPath)) {
      console.log('🔧 ensureConfigExists - Creating initial setup configuration file');
      this.config = { ...this.defaultConfig };
      console.log('🔧 ensureConfigExists - config before save:', { 
        firstTimeSetup: this.config.firstTimeSetup, 
        setupCompleted: this.config.setupCompleted 
      });
      this.saveConfig();
    } else {
      console.log('🔧 ensureConfigExists - File already exists, not creating');
    }
  }

  /**
   * Load configuration from YAML file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = yaml.parse(configData);
        
        // Merge with defaults to ensure all properties exist
        return this.mergeWithDefaults(config);
      }
      return { ...this.defaultConfig };
    } catch (error) {
      console.error('Error loading setup config:', error);
      return { ...this.defaultConfig };
    }
  }

  /**
   * Save the current configuration to the YAML file
   */
  saveConfig() {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const yamlContent = yaml.stringify(this.config);
      fs.writeFileSync(this.configPath, yamlContent, 'utf8');
      console.log(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw error;
    }
  }

  /**
   * Merge loaded config with defaults to ensure all properties exist
   */
  mergeWithDefaults(config) {
    const merged = JSON.parse(JSON.stringify(this.defaultConfig));
    
    if (config) {
      // Deep merge function
      const deepMerge = (target, source) => {
        for (const key in source) {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      };
      
      deepMerge(merged, config);
    }
    
    return merged;
  }

  /**
   * Get the current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if this is the first time setup
   */
  isFirstTimeSetup() {
    const result = this.config.firstTimeSetup && !this.config.setupCompleted;
    console.log('🔧 isFirstTimeSetup check:', { 
      firstTimeSetup: this.config.firstTimeSetup, 
      setupCompleted: this.config.setupCompleted,
      result: result
    });
    return result;
  }

  /**
   * Mark the first-time setup as completed
   */
  markSetupCompleted() {
    this.config.firstTimeSetup = false;
    this.config.setupCompleted = true;
    this.config.setupDate = new Date().toISOString();
    this.saveConfig();
    return true;
  }

  /**
   * Update Docker availability status
   */
  updateDockerStatus(available, checked = true) {
    this.config.docker.available = available;
    this.config.docker.checked = checked;
    this.saveConfig();
    return true;
  }

  /**
   * Get service configuration
   */
  getServiceConfig(serviceName) {
    return this.config.services[serviceName] || {};
  }

  /**
   * Update service configuration
   */
  updateServiceConfig(serviceName, serviceConfig) {
    if (this.config.services[serviceName]) {
      this.config.services[serviceName] = {
        ...this.config.services[serviceName],
        ...serviceConfig
      };
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * Get list of services that should auto-start
   */
  getAutoStartServices() {
    const autoStartServices = [];
    for (const [serviceName, config] of Object.entries(this.config.services)) {
      if (config.enabled && config.autoStart) {
        autoStartServices.push(serviceName);
      }
    }
    return autoStartServices;
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig() {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
    return true;
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences) {
    this.config.preferences = {
      ...this.config.preferences,
      ...preferences
    };
    this.saveConfig();
    return true;
  }

  /**
   * Get user preferences
   */
  getPreferences() {
    return this.config.preferences;
  }

  /**
   * Check if Docker is available
   */
  isDockerAvailable() {
    return this.config.docker.available;
  }

  /**
   * Check if Docker status has been checked
   */
  isDockerChecked() {
    return this.config.docker.checked;
  }

  /**
   * Get the active brand ID
   */
  getActiveBrandId() {
    return this.config.activeBrandId || this.defaultConfig.activeBrandId;
  }

  /**
   * Set the active brand ID
   */
  setActiveBrandId(brandId) {
    this.config.activeBrandId = brandId;
    this.saveConfig();
    return true;
  }
}

module.exports = SetupConfigService; 