const { EventEmitter } = require('events');
const { Notification } = require('electron');
const log = require('electron-log');

class WatchdogService extends EventEmitter {
  constructor(dockerSetup, llamaSwapService, mcpService, ipcLogger = null) {
    super();
    this.dockerSetup = dockerSetup;
    this.llamaSwapService = llamaSwapService;
    this.mcpService = mcpService;
    this.ipcLogger = ipcLogger;
    
    // Professional logging configuration
    this.logger = this.initializeLogger();
    this.sessionId = this.generateSessionId();
    this.serviceStates = new Map(); // Track service state changes
    
    // Logging configuration for enterprise-grade output
    this.loggingConfig = {
      level: 'INFO', // DEBUG, INFO, WARN, ERROR, FATAL
      logOnlyStateChanges: true,
      enableMetrics: true,
      structuredOutput: true,
      adminFriendly: true
    };
    
    // Service state tracking for change detection
    this.lastKnownStates = new Map();
    this.lastLoggedStates = new Map();
    this.serviceMetrics = new Map();
    
    // Get user's feature selections
    const selectedFeatures = global.selectedFeatures || {
      comfyUI: true,
      n8n: true,
      ragAndTts: true,
      angelaCore: true
    };
    
    // Watchdog configuration
    this.config = {
      checkInterval: 30000, // Check every 30 seconds
      startupDelay: 60000, // Wait 60 seconds before starting health checks after startup
      retryAttempts: 3,
      retryDelay: 10000, // 10 seconds between retries
      notificationTimeout: 5000, // Auto-dismiss notifications after 5 seconds
      maxNotificationAttempts: 3, // Stop showing notifications after this many attempts
      gracePeriod: 30 * 60 * 1000, // 30 minutes grace period after service is confirmed healthy
    };
    
    // Service status tracking - only include selected services
    this.services = {};
    
    // angela Core is always enabled
    this.services.angelasCore = {
      name: "angela's Core",
      status: 'unknown',
      lastCheck: null,
      lastHealthyTime: null, // Track when service was last confirmed healthy
      failureCount: 0,
      isRetrying: false,
      enabled: true,
      healthCheck: () => this.checkangelasCoreHealth(),
      restart: () => this.restartangelasCore()
    };
    
    // Python backend is always enabled (core service)
    this.services.python = {
      name: 'Python Backend Service',
      status: 'unknown',
      lastCheck: null,
      lastHealthyTime: null, // Track when service was last confirmed healthy
      failureCount: 0,
      isRetrying: false,
      enabled: selectedFeatures.ragAndTts, // Only if RAG & TTS is selected
      healthCheck: () => this.checkPythonHealth(),
      restart: () => this.restartPythonService()
    };
    
    // N8N only if selected
    if (selectedFeatures.n8n) {
      this.services.n8n = {
        name: 'n8n Workflow Engine',
        status: 'unknown',
        lastCheck: null,
        lastHealthyTime: null, // Track when service was last confirmed healthy
        failureCount: 0,
        isRetrying: false,
        enabled: true,
        healthCheck: () => this.checkN8nHealth(),
        restart: () => this.restartN8nService()
      };
    }
    
    // ComfyUI only if selected
    if (selectedFeatures.comfyUI) {
      this.services.comfyui = {
        name: 'ComfyUI Image Generation',
        status: 'unknown',
        lastCheck: null,
        lastHealthyTime: null, // Track when service was last confirmed healthy
        failureCount: 0,
        isRetrying: false,
        enabled: true, // Will be updated based on user consent
        healthCheck: () => this.checkComfyUIHealth(),
        restart: () => this.restartComfyUIService()
      };
    }
    
    // Watchdog state
    this.isRunning = false;
    this.isStarting = false;
    this.checkTimer = null;
    this.startupTimer = null;
    this.activeNotifications = new Map();
    
    this.logEvent('WATCHDOG_INIT', 'INFO', 'Watchdog Service initialized', { 
      selectedFeatures, 
      sessionId: this.sessionId,
      servicesCount: Object.keys(this.services).length 
    });
  }

  // Initialize professional logging system
  initializeLogger() {
    const logger = {
      format: (level, operation, message, metadata = {}) => {
        const timestamp = new Date().toISOString();
        const context = {
          timestamp,
          sessionId: this.sessionId,
          component: 'WatchdogService',
          level,
          operation,
          message,
          ...metadata
        };
        
        if (this.loggingConfig.structuredOutput) {
          return JSON.stringify(context);
        } else {
          // Human-readable format for admins
          const metaStr = Object.keys(metadata).length > 0 ? 
            ` | ${JSON.stringify(metadata)}` : '';
          return `[${timestamp}] [WATCHDOG:${level}] [${operation}] ${message}${metaStr}`;
        }
      }
    };
    return logger;
  }

  // Generate unique session ID for tracking
  generateSessionId() {
    return `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Professional logging method
  logEvent(operation, level, message, metadata = {}) {
    const logLevel = this.loggingConfig.level;
    const levelPriority = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
    
    // Only log if meets minimum level
    if (levelPriority[level] < levelPriority[logLevel]) {
      return;
    }

    const formattedLog = this.logger.format(level, operation, message, metadata);
    
    // Route to appropriate log level
    switch (level) {
      case 'DEBUG':
        log.debug(formattedLog);
        break;
      case 'INFO':
        log.info(formattedLog);
        break;
      case 'WARN':
        log.warn(formattedLog);
        break;
      case 'ERROR':
      case 'FATAL':
        log.error(formattedLog);
        break;
    }

    // Send to IPC logger for critical events
    if (this.ipcLogger && (level === 'ERROR' || level === 'FATAL' || level === 'WARN')) {
      this.ipcLogger.logWatchdogEvent(operation, level, { message, ...metadata });
    }
  }

  // Track service state changes with metrics
  trackServiceStateChange(serviceKey, oldState, newState, metadata = {}) {
    const timestamp = Date.now();
    const stateChange = {
      serviceKey,
      oldState,
      newState,
      timestamp,
      ...metadata
    };

    // Update service metrics
    if (!this.serviceMetrics.has(serviceKey)) {
      this.serviceMetrics.set(serviceKey, {
        stateChanges: 0,
        totalDowntime: 0,
        lastHealthyTime: null,
        restartCount: 0
      });
    }

    const metrics = this.serviceMetrics.get(serviceKey);
    metrics.stateChanges++;

    // Calculate downtime if recovering
    if (oldState !== 'healthy' && newState === 'healthy' && metrics.lastHealthyTime) {
      const downtime = timestamp - metrics.lastHealthyTime;
      metrics.totalDowntime += downtime;
    }

    if (newState === 'healthy') {
      metrics.lastHealthyTime = timestamp;
    }

    this.serviceMetrics.set(serviceKey, metrics);
    this.lastKnownStates.set(serviceKey, newState);

    return stateChange;
  }

  // Start the watchdog monitoring
  start() {
    if (this.isRunning) {
      this.logEvent('WATCHDOG_START', 'WARN', 'Attempted to start already running watchdog service');
      return;
    }

    // Check for user consent before starting any service monitoring
    if (!this.checkUserConsent()) {
      this.logEvent('WATCHDOG_START', 'INFO', 'User consent not found, watchdog service will not monitor services');
      return;
    }

    this.isRunning = true;
    this.isStarting = true;
    
    this.logEvent('WATCHDOG_START', 'INFO', 'Starting Watchdog Service', {
      checkInterval: this.config.checkInterval,
      startupDelay: this.config.startupDelay,
      gracePeriod: this.config.gracePeriod
    });
    
    // Set enabled services to "starting" state during startup (after consent checks)
    for (const [serviceKey, service] of Object.entries(this.services)) {
      if (service.enabled) {
        const oldState = service.status;
        service.status = 'starting';
        this.trackServiceStateChange(serviceKey, oldState, 'starting', { reason: 'watchdog_startup' });
      } else {
        // Ensure disabled services remain disabled
        service.status = 'disabled';
      }
    }
    
    // Wait for startup delay before beginning health checks
    this.logEvent('WATCHDOG_STARTUP_DELAY', 'INFO', 'Waiting for startup delay before health checks', {
      delaySeconds: this.config.startupDelay / 1000
    });
    
    this.startupTimer = setTimeout(() => {
      this.isStarting = false;
      this.logEvent('WATCHDOG_HEALTH_CHECKS_BEGIN', 'INFO', 'Startup delay complete, beginning health checks');
      
      // Perform initial health checks
      this.performHealthChecks();
      
      // Schedule regular health checks
      this.checkTimer = setInterval(() => {
        this.performHealthChecks();
      }, this.config.checkInterval);
      
    }, this.config.startupDelay);

    this.emit('started');
    this.logEvent('WATCHDOG_STARTED', 'INFO', 'Watchdog Service started successfully');
  }

  checkUserConsent() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    try {
      const userDataPath = app.getPath('userData');
      const consentFile = path.join(userDataPath, 'user-service-consent.json');
      
      if (fs.existsSync(consentFile)) {
        const consentData = JSON.parse(fs.readFileSync(consentFile, 'utf8'));
        this.logEvent('USER_CONSENT_CHECK', 'INFO', 'User service consent status loaded', {
          hasConsented: consentData.hasConsented,
          servicesConsented: consentData.services,
          onboardingMode: consentData.onboardingMode,
          autoStartServices: consentData.autoStartServices,
          consentDate: consentData.timestamp
        });
        
        // Check if this is from onboarding mode with auto-start disabled
        const isOnboardingMode = consentData.onboardingMode === true;
        const autoStartDisabled = consentData.autoStartServices === false;
        
        if (isOnboardingMode && autoStartDisabled) {
          this.logEvent('ONBOARDING_MODE_DETECTED', 'INFO', 'Onboarding mode with auto-start disabled - only angela Core will be managed');
          
          // In onboarding mode with auto-start disabled:
          // - angela Core is always managed (it's essential)
          // - Other services are disabled for auto-management but user preferences are stored
          for (const [serviceKey, service] of Object.entries(this.services)) {
            if (serviceKey === 'angelasCore') {
              // Always enable angela Core monitoring (using correct service key)
              service.enabled = true;
              this.logEvent('SERVICE_angela_CORE_ENABLED', 'INFO', 'angela Core monitoring enabled - essential service');
            } else {
              // Disable auto-management for other services during onboarding mode
              service.enabled = false;
              service.status = 'disabled';
              this.logEvent('SERVICE_ONBOARDING_DISABLED', 'INFO', `Service ${serviceKey} disabled - onboarding mode with auto-start off`);
            }
          }
          
          return true; // Return true so watchdog runs, but only for angela Core
        }
        
        // Check if user has auto-start enabled for post-onboarding use
        let autoStartEnabled = false;
        try {
          // Since we can't easily access the frontend db from main process,
          // and the default is false (which is what we want for security),
          // we'll default to false unless explicitly set via a dedicated file
          
          // Check if autoStartServices is explicitly set to true (for future use)
          autoStartEnabled = consentData.autoStartServices === true;
        } catch (error) {
          this.logEvent('AUTO_START_CHECK', 'WARN', 'Could not check auto-start preference', {
            error: error.message
          });
        }
        
        if (!autoStartEnabled && !isOnboardingMode) {
          this.logEvent('AUTO_START_DISABLED', 'INFO', 'Auto-start disabled - watchdog will not monitor services');
          // Disable all services if auto-start is disabled
          for (const [serviceKey, service] of Object.entries(this.services)) {
            service.enabled = false;
            service.status = 'disabled';
          }
          return false;
        }
        
        // Only enable services that user has explicitly consented to (for full auto-start mode)
        if (consentData.hasConsented && consentData.services && autoStartEnabled) {
          for (const [serviceKey, service] of Object.entries(this.services)) {
            if (serviceKey === 'angelasCore') {
              // angela Core is always enabled when user has consented
              service.enabled = true;
              this.logEvent('SERVICE_angela_CORE_ENABLED', 'INFO', 'angela Core monitoring enabled - essential service');
            } else if (consentData.services[serviceKey] === true) {
              service.enabled = true;
              this.logEvent('SERVICE_CONSENT_ENABLED', 'INFO', `Service ${serviceKey} enabled by user consent`);
            } else {
              service.enabled = false;
              service.status = 'disabled';
              this.logEvent('SERVICE_CONSENT_DISABLED', 'INFO', `Service ${serviceKey} disabled - no user consent`);
            }
          }
        }
        
        return consentData.hasConsented === true;
      } else {
        this.logEvent('USER_CONSENT_CHECK', 'INFO', 'No user consent file found - only angela Core will be managed');
        
        // Without consent file, only enable angela Core (essential service)
        for (const [serviceKey, service] of Object.entries(this.services)) {
          if (serviceKey === 'angelasCore') {
            service.enabled = true;
            this.logEvent('SERVICE_angela_CORE_ENABLED', 'INFO', 'angela Core monitoring enabled - essential service (no consent file)');
          } else {
            service.enabled = false;
            service.status = 'disabled';
          }
        }
        
        return true; // Return true so watchdog runs for angela Core
      }
    } catch (error) {
      this.logEvent('USER_CONSENT_ERROR', 'ERROR', 'Failed to read user consent status - only angela Core will be managed', {
        error: error.message
      });
      
      // On error, only enable angela Core (essential service)
      for (const [serviceKey, service] of Object.entries(this.services)) {
        if (serviceKey === 'angelasCore') {
          service.enabled = true;
          this.logEvent('SERVICE_angela_CORE_ENABLED', 'INFO', 'angela Core monitoring enabled - essential service (error fallback)');
        } else {
          service.enabled = false;
          service.status = 'disabled';
        }
      }
      
      return true; // Return true so watchdog runs for angela Core
    }
  }

  // Stop the watchdog monitoring
  stop() {
    if (!this.isRunning) {
      this.logEvent('WATCHDOG_STOP', 'WARN', 'Attempted to stop already stopped watchdog service');
      return;
    }

    this.isRunning = false;
    this.isStarting = false;
    
    this.logEvent('WATCHDOG_STOP', 'INFO', 'Stopping Watchdog Service');
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    // Clear any active notifications
    this.activeNotifications.forEach((notification, id) => {
      notification.close();
    });
    this.activeNotifications.clear();

    this.emit('stopped');
    this.logEvent('WATCHDOG_STOPPED', 'INFO', 'Watchdog Service stopped successfully');
  }

  // Check if a service is within its grace period
  isServiceInGracePeriod(service) {
    if (!service.lastHealthyTime) {
      return false; // No grace period if never been healthy
    }
    
    const timeSinceHealthy = Date.now() - service.lastHealthyTime;
    const inGracePeriod = timeSinceHealthy < this.config.gracePeriod;
    
    if (inGracePeriod) {
      // Only log once when grace period starts
      if (!service.gracePeriodLogged) {
        this.logEvent('SERVICE_GRACE_PERIOD', 'DEBUG', `${service.name} is in grace period`, {
          timeRemainingMs: this.config.gracePeriod - timeSinceHealthy,
          timeRemainingMin: Math.round((this.config.gracePeriod - timeSinceHealthy) / 60000)
        });
        service.gracePeriodLogged = true;
      }
    } else {
      service.gracePeriodLogged = false;
    }
    
    return inGracePeriod;
  }

  // Perform health checks on all services
  async performHealthChecks() {
    // Skip health checks during startup phase
    if (this.isStarting) {
      return;
    }

    const timestamp = new Date();
    let healthCheckSummary = {
      totalServices: 0,
      checkedServices: 0,
      healthyServices: 0,
      unhealthyServices: 0,
      skippedServices: 0,
      stateChanges: []
    };

    for (const [serviceKey, service] of Object.entries(this.services)) {
      healthCheckSummary.totalServices++;
      
      // Skip disabled services
      if (!service.enabled) {
        healthCheckSummary.skippedServices++;
        continue;
      }

      // Skip services that are in grace period (recently confirmed healthy)
      if (this.isServiceInGracePeriod(service)) {
        healthCheckSummary.skippedServices++;
        continue;
      }

      healthCheckSummary.checkedServices++;
      const previousStatus = service.status;

      try {
        const isHealthy = await service.healthCheck();
        service.lastCheck = timestamp;

        if (isHealthy) {
          if (service.status !== 'healthy') {
            // Service recovered - important state change
            const stateChange = this.trackServiceStateChange(serviceKey, service.status, 'healthy', {
              reason: 'health_check_recovery',
              failureCount: service.failureCount
            });
            healthCheckSummary.stateChanges.push(stateChange);
            
            service.status = 'healthy';
            service.lastHealthyTime = Date.now();
            service.failureCount = 0;
            service.isRetrying = false;
            
            this.logEvent('SERVICE_RECOVERY', 'INFO', `${service.name} has recovered and is now healthy`, {
              previousStatus,
              downtimeMs: stateChange.downtimeMs || 0,
              failureCount: service.failureCount
            });
            
            this.emit('serviceRestored', serviceKey, service);
            healthCheckSummary.healthyServices++;
          } else {
            // Service was already healthy - just refresh grace period silently
            service.lastHealthyTime = Date.now();
            healthCheckSummary.healthyServices++;
          }
        } else {
          // Service is unhealthy
          const wasHealthy = service.status === 'healthy';
          service.lastHealthyTime = null;
          service.failureCount++;
          
          if (wasHealthy) {
            // New failure - log immediately
            const stateChange = this.trackServiceStateChange(serviceKey, 'healthy', 'degraded', {
              reason: 'health_check_failure',
              failureCount: service.failureCount
            });
            healthCheckSummary.stateChanges.push(stateChange);
            
            this.logEvent('SERVICE_DEGRADED', 'WARN', `${service.name} health check failed - service degraded`, {
              failureCount: service.failureCount,
              maxRetries: this.config.retryAttempts
            });
          } else if (service.failureCount === this.config.retryAttempts && !service.isRetrying) {
            // Critical failure threshold reached
            const stateChange = this.trackServiceStateChange(serviceKey, service.status, 'failed', {
              reason: 'critical_failure',
              failureCount: service.failureCount
            });
            healthCheckSummary.stateChanges.push(stateChange);
            
            service.status = 'failed';
            service.isRetrying = true;
            
            this.logEvent('SERVICE_CRITICAL_FAILURE', 'ERROR', `${service.name} has failed critically - initiating restart`, {
              failureCount: service.failureCount,
              maxRetries: this.config.retryAttempts
            });
            
            // Attempt restart in background
            this.attemptServiceRestart(serviceKey, service);
          } else {
            service.status = 'degraded';
          }
          
          healthCheckSummary.unhealthyServices++;
        }
      } catch (error) {
        // Health check errors are always critical
        const stateChange = this.trackServiceStateChange(serviceKey, service.status, 'error', {
          reason: 'health_check_error',
          error: error.message
        });
        healthCheckSummary.stateChanges.push(stateChange);
        
        service.status = 'error';
        service.lastCheck = timestamp;
        service.lastHealthyTime = null;
        
        this.logEvent('SERVICE_ERROR', 'ERROR', `${service.name} health check encountered an error`, {
          error: error.message,
          previousStatus,
          stack: error.stack
        });
        
        healthCheckSummary.unhealthyServices++;
      }
    }

    // Only log health check summary if there were state changes or if in debug mode
    if (healthCheckSummary.stateChanges.length > 0 || this.loggingConfig.level === 'DEBUG') {
      this.logEvent('HEALTH_CHECK_COMPLETE', 
        healthCheckSummary.stateChanges.length > 0 ? 'INFO' : 'DEBUG',
        'Health check cycle completed', 
        healthCheckSummary
      );
    }
  }

  // Separate restart logic with proper logging
  async attemptServiceRestart(serviceKey, service) {
    this.logEvent('SERVICE_RESTART_ATTEMPT', 'INFO', `Attempting to restart ${service.name}`, {
      failureCount: service.failureCount,
      previousStatus: service.status
    });

    try {
      await service.restart();
      
      // Give service time to start before checking health
      setTimeout(async () => {
        try {
          const restartHealthy = await service.healthCheck();
          if (restartHealthy) {
            const stateChange = this.trackServiceStateChange(serviceKey, 'failed', 'healthy', {
              reason: 'restart_success'
            });
            
            service.status = 'healthy';
            service.lastHealthyTime = Date.now();
            service.failureCount = 0;
            service.isRetrying = false;
            
            this.logEvent('SERVICE_RESTART_SUCCESS', 'INFO', `${service.name} restart completed successfully`, {
              downtimeMs: stateChange.downtimeMs || 0
            });
            
            this.emit('serviceRestarted', serviceKey, service);
            this.showRestartSuccessNotification(service);
          } else {
            service.isRetrying = false;
            service.lastHealthyTime = null;
            
            this.logEvent('SERVICE_RESTART_FAILED', 'ERROR', `${service.name} restart completed but service is still unhealthy`);
            
            this.emit('serviceFailed', serviceKey, service);
            this.showRestartFailureNotification(service);
          }
        } catch (healthCheckError) {
          service.isRetrying = false;
          service.lastHealthyTime = null;
          
          this.logEvent('SERVICE_RESTART_HEALTH_CHECK_ERROR', 'ERROR', `${service.name} restart health check failed`, {
            error: healthCheckError.message
          });
          
          this.emit('serviceFailed', serviceKey, service);
          this.showRestartFailureNotification(service);
        }
      }, this.config.retryDelay);
      
    } catch (restartError) {
      service.isRetrying = false;
      service.lastHealthyTime = null;
      
      this.logEvent('SERVICE_RESTART_ERROR', 'ERROR', `${service.name} restart operation failed`, {
        error: restartError.message,
        stack: restartError.stack
      });
      
      this.emit('serviceFailed', serviceKey, service);
      this.showRestartFailureNotification(service);
    }
  }

  // Individual service health check methods
  async checkangelasCoreHealth() {
    try {
      const status = await this.llamaSwapService.getStatusWithHealthCheck();
      const isHealthy = status.isRunning && status.healthCheck === 'passed';
      
      this.logEvent('SERVICE_HEALTH_CHECK', 'DEBUG', 'angela\'s Core health check completed', {
        isRunning: status.isRunning,
        healthCheck: status.healthCheck,
        isHealthy: isHealthy
      });
      
      return isHealthy;
    } catch (error) {
      this.logEvent('SERVICE_HEALTH_CHECK_ERROR', 'ERROR', 'angela\'s Core health check failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  async checkN8nHealth() {
    try {
      const result = await this.dockerSetup.checkN8NHealth();
      
      this.logEvent('SERVICE_HEALTH_CHECK', 'DEBUG', 'n8n health check completed', {
        success: result.success,
        details: result
      });
      
      return result.success === true;
    } catch (error) {
      this.logEvent('SERVICE_HEALTH_CHECK_ERROR', 'ERROR', 'n8n health check failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  async checkPythonHealth() {
    try {
      const isRunning = await this.dockerSetup.isPythonRunning();
      
      this.logEvent('SERVICE_HEALTH_CHECK', 'DEBUG', 'Python Backend health check completed', {
        isRunning: isRunning
      });
      
      return isRunning;
    } catch (error) {
      this.logEvent('SERVICE_HEALTH_CHECK_ERROR', 'ERROR', 'Python Backend health check failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  async checkComfyUIHealth() {
    try {
      const isRunning = await this.dockerSetup.isComfyUIRunning();
      
      this.logEvent('SERVICE_HEALTH_CHECK', 'DEBUG', 'ComfyUI health check completed', {
        isRunning: isRunning
      });
      
      return isRunning;
    } catch (error) {
      this.logEvent('SERVICE_HEALTH_CHECK_ERROR', 'ERROR', 'ComfyUI health check failed', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  // Individual service restart methods
  async restartangelasCore() {
    this.logEvent('SERVICE_RESTART', 'INFO', 'Initiating angela\'s Core service restart');
    
    try {
      if (this.llamaSwapService.isRunning) {
        await this.llamaSwapService.stop();
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      await this.llamaSwapService.start();
      this.logEvent('SERVICE_RESTART_OPERATION', 'INFO', 'angela\'s Core restart operation completed');
      
    } catch (error) {
      this.logEvent('SERVICE_RESTART_ERROR', 'ERROR', 'angela\'s Core restart operation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async restartN8nService() {
    this.logEvent('SERVICE_RESTART', 'INFO', 'Initiating n8n service restart');
    
    try {
      let n8nConfig = this.dockerSetup.containers.n8n;
      
      // If N8N config is not available, create it
      if (!n8nConfig) {
        this.logEvent('SERVICE_RESTART_WARNING', 'WARN', 'N8N configuration not found, creating default configuration');
        n8nConfig = {
          name: 'angela_n8n',
          image: this.dockerSetup.getArchSpecificImage('n8nio/n8n', 'latest'),
          port: 5678,
          internalPort: 5678,
          healthCheck: this.dockerSetup.checkN8NHealth.bind(this.dockerSetup),
          volumes: [
            `${require('path').join(require('os').homedir(), '.angela', 'n8n')}:/home/node/.n8n`
          ]
        };
        this.dockerSetup.containers.n8n = n8nConfig;
      }
      
      await this.dockerSetup.startContainer(n8nConfig);
      this.logEvent('SERVICE_RESTART_OPERATION', 'INFO', 'n8n restart operation completed');
    } catch (error) {
      this.logEvent('SERVICE_RESTART_ERROR', 'ERROR', 'n8n restart operation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async restartPythonService() {
    this.logEvent('SERVICE_RESTART', 'INFO', 'Initiating Python Backend service restart');
    
    try {
      let pythonConfig = this.dockerSetup.containers.python;
      
      // If Python config is not available, create it
      if (!pythonConfig) {
        this.logEvent('SERVICE_RESTART_WARNING', 'WARN', 'Python configuration not found, creating default configuration');
        pythonConfig = {
          name: 'angela_python',
          image: this.dockerSetup.getArchSpecificImage('angela17verse/angela-backend', 'latest'),
          port: 5001,
          internalPort: 5000,
          healthCheck: this.dockerSetup.isPythonRunning.bind(this.dockerSetup),
          volumes: [
            `${this.dockerSetup.pythonBackendDataPath}:/home/angela`,
            'angela_python_models:/app/models'
          ],
          volumeNames: ['angela_python_models']
        };
        this.dockerSetup.containers.python = pythonConfig;
      }
      
      await this.dockerSetup.startContainer(pythonConfig);
      this.logEvent('SERVICE_RESTART_OPERATION', 'INFO', 'Python Backend restart operation completed');
    } catch (error) {
      this.logEvent('SERVICE_RESTART_ERROR', 'ERROR', 'Python Backend restart operation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async restartComfyUIService() {
    this.logEvent('SERVICE_RESTART', 'INFO', 'Initiating ComfyUI service restart');
    
    try {
      if (this.dockerSetup.containers.comfyui) {
        await this.dockerSetup.startContainer(this.dockerSetup.containers.comfyui);
        this.logEvent('SERVICE_RESTART_OPERATION', 'INFO', 'ComfyUI restart operation completed');
      }
    } catch (error) {
      this.logEvent('SERVICE_RESTART_ERROR', 'ERROR', 'ComfyUI restart operation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Notification methods for restart success/failure
  showRestartSuccessNotification(service) {
    this.logEvent('NOTIFICATION_SENT', 'INFO', `Showing restart success notification for ${service.name}`);
    this.showNotification(
      `${service.name} Restarted`,
      `${service.name} has been successfully restarted and is now healthy.`,
      'success'
    );
  }

  showRestartFailureNotification(service) {
    // Only show failure notifications for the first few attempts to avoid spam
    if (service.failureCount <= this.config.maxNotificationAttempts) {
      this.logEvent('NOTIFICATION_SENT', 'WARN', `Showing restart failure notification for ${service.name}`, {
        failureCount: service.failureCount,
        maxAttempts: this.config.maxNotificationAttempts
      });
      this.showNotification(
        `${service.name} Restart Failed`,
        `Failed to restart ${service.name}. Manual intervention may be required.`,
        'error'
      );
    } else {
      this.logEvent('NOTIFICATION_SUPPRESSED', 'INFO', `Restart failure notification suppressed for ${service.name}`, {
        failureCount: service.failureCount,
        maxAttempts: this.config.maxNotificationAttempts,
        reason: 'spam_prevention'
      });
    }
  }

  // Show non-persistent notification
  showNotification(title, body, type = 'info') {
    try {
      const notification = new Notification({
        title,
        body,
        icon: this.getNotificationIcon(type),
        silent: false,
        urgency: type === 'error' ? 'critical' : type === 'warning' ? 'normal' : 'low'
      });

      // Auto-dismiss notification after configured timeout
      const notificationId = Date.now().toString();
      this.activeNotifications.set(notificationId, notification);

      notification.show();

      notification.on('click', () => {
        notification.close();
        this.activeNotifications.delete(notificationId);
      });

      notification.on('close', () => {
        this.activeNotifications.delete(notificationId);
      });

      // Auto-close after timeout
      setTimeout(() => {
        if (this.activeNotifications.has(notificationId)) {
          notification.close();
          this.activeNotifications.delete(notificationId);
        }
      }, this.config.notificationTimeout);

      log.info(`Notification shown: ${title} - ${body}`);
    } catch (error) {
      log.error('Error showing notification:', error);
      if (this.ipcLogger) {
        this.ipcLogger.logError('WatchdogService.showNotification', error);
      }
    }
  }

  // Get appropriate icon for notification type
  getNotificationIcon(type) {
    // You can customize these paths to your app's icon files
    switch (type) {
      case 'success':
        return null; // Use default app icon
      case 'warning':
        return null; // Use default app icon
      case 'error':
        return null; // Use default app icon
      default:
        return null; // Use default app icon
    }
  }

  // Get current status of all services
  getServicesStatus() {
    const status = {};
    for (const [key, service] of Object.entries(this.services)) {
      const inGracePeriod = this.isServiceInGracePeriod(service);
      const gracePeriodRemainingMinutes = service.lastHealthyTime 
        ? Math.max(0, Math.ceil((this.config.gracePeriod - (Date.now() - service.lastHealthyTime)) / (60 * 1000)))
        : 0;
        
      status[key] = {
        name: service.name,
        status: service.status,
        lastCheck: service.lastCheck,
        lastHealthyTime: service.lastHealthyTime,
        failureCount: service.failureCount,
        isRetrying: service.isRetrying,
        inGracePeriod: inGracePeriod,
        gracePeriodRemainingMinutes: gracePeriodRemainingMinutes
      };
    }
    return status;
  }

  // Get overall system health
  getOverallHealth() {
    const statuses = Object.values(this.services).map(service => service.status);
    const healthyCount = statuses.filter(status => status === 'healthy').length;
    const totalCount = statuses.length;
    
    if (healthyCount === totalCount) {
      return 'healthy';
    } else if (healthyCount === 0) {
      return 'critical';
    } else {
      return 'degraded';
    }
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    log.info('Watchdog configuration updated:', this.config);
    
    // Restart monitoring with new interval if it changed and service is running
    if (this.isRunning && newConfig.checkInterval) {
      this.stop();
      this.start();
    }
  }

  // Signal that Docker setup is complete and watchdog can start monitoring
  signalSetupComplete() {
    if (!this.isRunning || !this.isStarting) {
      return;
    }

    log.info('Docker setup complete signal received, starting health checks early...');
    
    // Clear the startup timer if it's still running
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    this.isStarting = false;
    
    // Perform initial health checks
    this.performHealthChecks();
    
    // Schedule regular health checks
    this.checkTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.checkInterval);

    log.info('Watchdog health checks started early due to setup completion');
  }

  // Manual health check trigger
  async performManualHealthCheck() {
    this.logEvent('MANUAL_HEALTH_CHECK', 'INFO', 'Manual health check triggered by admin');
    await this.performHealthChecks();
    const status = this.getServicesStatus();
    this.logEvent('MANUAL_HEALTH_CHECK_COMPLETE', 'INFO', 'Manual health check completed', status);
    return status;
  }

  // Reset failure counts for all services
  resetFailureCounts() {
    for (const [serviceKey, service] of Object.entries(this.services)) {
      const oldFailureCount = service.failureCount;
      service.failureCount = 0;
      service.isRetrying = false;
      // Keep grace period intact when resetting failure counts
    }
    this.logEvent('FAILURE_COUNTS_RESET', 'INFO', 'All service failure counts reset by admin', {
      preservedGracePeriods: true
    });
  }

  // Enable monitoring for a specific service (useful after onboarding)
  enableServiceMonitoring(serviceKey) {
    if (this.services[serviceKey]) {
      this.services[serviceKey].enabled = true;
      this.services[serviceKey].status = 'unknown'; // Reset status to trigger fresh check
      this.logEvent('SERVICE_MONITORING_ENABLED', 'INFO', `Monitoring enabled for service: ${serviceKey}`);
      
      // Trigger immediate health check for this service
      if (this.isRunning) {
        setTimeout(() => {
          this.performHealthChecks();
        }, 1000);
      }
      
      return true;
    } else {
      this.logEvent('SERVICE_MONITORING_ERROR', 'ERROR', `Cannot enable monitoring - service not found: ${serviceKey}`);
      return false;
    }
  }

  // Disable monitoring for a specific service
  disableServiceMonitoring(serviceKey) {
    if (this.services[serviceKey]) {
      this.services[serviceKey].enabled = false;
      this.services[serviceKey].status = 'disabled';
      this.logEvent('SERVICE_MONITORING_DISABLED', 'INFO', `Monitoring disabled for service: ${serviceKey}`);
      return true;
    } else {
      this.logEvent('SERVICE_MONITORING_ERROR', 'ERROR', `Cannot disable monitoring - service not found: ${serviceKey}`);
      return false;
    }
  }

  // Get list of services and their monitoring status
  getServiceMonitoringStatus() {
    const status = {};
    for (const [serviceKey, service] of Object.entries(this.services)) {
      status[serviceKey] = {
        name: service.name,
        enabled: service.enabled,
        status: service.status,
        lastCheck: service.lastCheck,
        lastHealthyTime: service.lastHealthyTime,
        failureCount: service.failureCount
      };
    }
    return status;
  }

  // Force end grace period for a specific service (for manual intervention)
  endGracePeriod(serviceKey) {
    if (this.services[serviceKey]) {
      this.services[serviceKey].lastHealthyTime = null;
      this.logEvent('GRACE_PERIOD_ENDED', 'INFO', `Grace period manually ended for ${this.services[serviceKey].name}`, {
        serviceKey: serviceKey,
        reason: 'admin_intervention'
      });
    }
  }

  // Force end grace period for all services
  endAllGracePeriods() {
    const endedServices = [];
    for (const [serviceKey, service] of Object.entries(this.services)) {
      if (service.lastHealthyTime) {
        service.lastHealthyTime = null;
        endedServices.push(service.name);
      }
    }
    this.logEvent('ALL_GRACE_PERIODS_ENDED', 'INFO', 'All service grace periods manually ended by admin', {
      affectedServices: endedServices,
      reason: 'admin_intervention'
    });
  }

  // Enable verbose logging for debugging
  enableVerboseLogging() {
    this.loggingConfig.level = 'DEBUG';
    this.logEvent('VERBOSE_LOGGING_ENABLED', 'INFO', 'Verbose logging enabled for debugging');
  }

  // Disable verbose logging 
  disableVerboseLogging() {
    this.loggingConfig.level = 'INFO';
    this.logEvent('VERBOSE_LOGGING_DISABLED', 'INFO', 'Verbose logging disabled');
  }

  // Get comprehensive system health report
  getSystemHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      watchdogStatus: this.isRunning ? 'running' : 'stopped',
      totalServices: Object.keys(this.services).length,
      enabledServices: Object.values(this.services).filter(s => s.enabled).length,
      healthyServices: Object.values(this.services).filter(s => s.status === 'healthy').length,
      services: {},
      serviceMetrics: Object.fromEntries(this.serviceMetrics),
      configuration: {
        checkInterval: this.config.checkInterval,
        gracePeriod: this.config.gracePeriod,
        retryAttempts: this.config.retryAttempts
      }
    };

    for (const [serviceKey, service] of Object.entries(this.services)) {
      report.services[serviceKey] = {
        name: service.name,
        status: service.status,
        enabled: service.enabled,
        failureCount: service.failureCount,
        isRetrying: service.isRetrying,
        lastCheck: service.lastCheck,
        lastHealthyTime: service.lastHealthyTime,
        inGracePeriod: this.isServiceInGracePeriod(service)
      };
    }

    return report;
  }
}

module.exports = WatchdogService; 
