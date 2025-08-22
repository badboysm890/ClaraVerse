const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { isServiceModeSupported, getSupportedDeploymentModes, createManualHealthCheck } = require('./serviceDefinitions.cjs');

/**
 * Service Configuration Manager
 * Handles user preferences for deployment modes and manual service URLs
 * Provides persistent storage and validation
 */
class ServiceConfigurationManager {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'service-config.json');
    this.config = this.loadConfig();
    this.platform = require('os').platform();
    
    log.info('🔧 Service Configuration Manager initialized');
  }

  /**
   * Load configuration from disk
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Validate loaded config
        return this.validateConfig(config);
      }
    } catch (error) {
      log.warn('Failed to load service configuration, using defaults:', error.message);
    }
    
    // Return default configuration
    return {
      version: '1.0.0',
      platform: this.platform,
      services: {},
      lastModified: Date.now()
    };
  }

  /**
   * Save configuration to disk
   */
  saveConfig() {
    try {
      this.config.lastModified = Date.now();
      this.config.platform = this.platform;
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      log.info('✅ Service configuration saved');
    } catch (error) {
      log.error('❌ Failed to save service configuration:', error);
      throw error;
    }
  }

  /**
   * Validate configuration structure and remove invalid entries
   */
  validateConfig(config) {
    const validatedConfig = {
      version: config.version || '1.0.0',
      platform: this.platform,
      services: {},
      lastModified: config.lastModified || Date.now()
    };

    if (config.services && typeof config.services === 'object') {
      Object.keys(config.services).forEach(serviceName => {
        const serviceConfig = config.services[serviceName];
        
        // Validate service configuration
        if (this.isValidServiceConfig(serviceName, serviceConfig)) {
          validatedConfig.services[serviceName] = serviceConfig;
        } else {
          log.warn(`Invalid configuration for service ${serviceName}, removing`);
        }
      });
    }

    return validatedConfig;
  }

  /**
   * Check if service configuration is valid
   */
  isValidServiceConfig(serviceName, serviceConfig) {
    if (!serviceConfig || typeof serviceConfig !== 'object') {
      return false;
    }

    const { mode, url } = serviceConfig;

    // Check if mode is supported on current platform
    if (!isServiceModeSupported(serviceName, mode, this.platform)) {
      return false;
    }

    // Check URL requirement for manual mode
    if (mode === 'manual' && (!url || typeof url !== 'string')) {
      return false;
    }

    return true;
  }

  /**
   * Get deployment mode for a service
   */
  getServiceMode(serviceName) {
    const serviceConfig = this.config.services[serviceName];
    if (serviceConfig && serviceConfig.mode) {
      // Verify mode is still supported on current platform
      if (isServiceModeSupported(serviceName, serviceConfig.mode, this.platform)) {
        return serviceConfig.mode;
      }
    }
    
    // Return default mode (prefer docker if available)
    const supportedModes = getSupportedDeploymentModes(serviceName, this.platform);
    return supportedModes.includes('docker') ? 'docker' : supportedModes[0] || 'docker';
  }

  /**
   * Get service URL for manual deployment
   */
  getServiceUrl(serviceName) {
    const serviceConfig = this.config.services[serviceName];
    return serviceConfig?.url || null;
  }

  /**
   * Set service configuration (mode and URL)
   */
  setServiceConfig(serviceName, mode, url = null) {
    // Validate mode is supported
    if (!isServiceModeSupported(serviceName, mode, this.platform)) {
      throw new Error(`Deployment mode '${mode}' is not supported for service '${serviceName}' on platform '${this.platform}'`);
    }

    // Validate URL for manual mode
    if (mode === 'manual') {
      if (!url || typeof url !== 'string') {
        throw new Error(`URL is required for manual deployment mode of service '${serviceName}'`);
      }
      
      // Basic URL validation
      try {
        new URL(url);
      } catch (error) {
        throw new Error(`Invalid URL format for service '${serviceName}': ${url}`);
      }
    }

    // Initialize services object if needed
    if (!this.config.services) {
      this.config.services = {};
    }

    // Set configuration
    this.config.services[serviceName] = { mode, url };
    
    // Save immediately
    this.saveConfig();
    
    log.info(`📝 Service ${serviceName} configured: mode=${mode}${url ? `, url=${url}` : ''}`);
  }

  /**
   * Remove service configuration (revert to defaults)
   */
  removeServiceConfig(serviceName) {
    if (this.config.services && this.config.services[serviceName]) {
      delete this.config.services[serviceName];
      this.saveConfig();
      log.info(`🗑️ Service ${serviceName} configuration removed (reverted to defaults)`);
    }
  }

  /**
   * Get all service configurations
   */
  getAllServiceConfigs() {
    return { ...this.config.services };
  }

  /**
   * Test connectivity to a manual service
   */
  async testManualService(serviceName, url, healthEndpoint = '/') {
    try {
      const healthCheck = createManualHealthCheck(url, healthEndpoint);
      const isHealthy = await healthCheck();
      
      return {
        success: isHealthy,
        url: url,
        endpoint: healthEndpoint,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        url: url,
        endpoint: healthEndpoint,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get supported deployment modes for a service
   */
  getSupportedModes(serviceName) {
    return getSupportedDeploymentModes(serviceName, this.platform);
  }

  /**
   * Check if service can use Docker deployment on current platform
   */
  canUseDocker(serviceName) {
    return isServiceModeSupported(serviceName, 'docker', this.platform);
  }

  /**
   * Check if service can use manual deployment on current platform  
   */
  canUseManual(serviceName) {
    return isServiceModeSupported(serviceName, 'manual', this.platform);
  }

  /**
   * Get platform-specific service information
   */
  getPlatformInfo(serviceName = null) {
    const { getPlatformCompatibility } = require('./serviceDefinitions.cjs');
    const compatibility = getPlatformCompatibility(this.platform);
    
    if (serviceName) {
      return compatibility[serviceName] || null;
    }
    
    return compatibility;
  }

  /**
   * Reset all configurations to defaults
   */
  resetToDefaults() {
    this.config = {
      version: '1.0.0',
      platform: this.platform,
      services: {},
      lastModified: Date.now()
    };
    
    this.saveConfig();
    log.info('🔄 Service configuration reset to defaults');
  }

  /**
   * Export configuration for backup
   */
  exportConfig() {
    return {
      ...this.config,
      exportedAt: Date.now(),
      exportedPlatform: this.platform
    };
  }

  /**
   * Import configuration from backup
   */
  importConfig(configData) {
    try {
      // Validate imported configuration
      const validatedConfig = this.validateConfig(configData);
      
      // Warn if platform mismatch
      if (configData.exportedPlatform && configData.exportedPlatform !== this.platform) {
        log.warn(`Platform mismatch: configuration exported from ${configData.exportedPlatform}, importing to ${this.platform}`);
      }
      
      this.config = validatedConfig;
      this.saveConfig();
      
      log.info('📥 Service configuration imported successfully');
      return true;
    } catch (error) {
      log.error('❌ Failed to import service configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration summary for UI display
   */
  getConfigSummary() {
    const { SERVICE_DEFINITIONS } = require('./serviceDefinitions.cjs');
    const summary = {};
    
    Object.keys(SERVICE_DEFINITIONS).forEach(serviceName => {
      const service = SERVICE_DEFINITIONS[serviceName];
      const platformInfo = this.getPlatformInfo(serviceName);
      const currentMode = this.getServiceMode(serviceName);
      const currentUrl = this.getServiceUrl(serviceName);
      
      summary[serviceName] = {
        name: service.name,
        critical: service.critical,
        currentMode: currentMode,
        currentUrl: currentUrl,
        supportedModes: platformInfo?.supportedModes || [],
        dockerSupported: platformInfo?.dockerSupported || false,
        manualSupported: platformInfo?.manualSupported || false,
        manualConfig: platformInfo?.manualConfig || null,
        configured: !!this.config.services[serviceName]
      };
    });
    
    return summary;
  }
}

module.exports = ServiceConfigurationManager; 
