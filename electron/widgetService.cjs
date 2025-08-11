const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { platform } = require('os');
const log = require('electron-log');

class WidgetService {
  constructor() {
    this.process = null;
    this.port = 8765;
    this.isStarting = false;
    this.requiredWidgets = new Set(['gpu-monitor', 'system-monitor', 'process-monitor']);
    this.activeWidgets = new Set();
    this.healthCheckInterval = null;
  }

  /**
   * Get the correct executable name for the current platform
   */
  getExecutableName() {
    const currentPlatform = platform();
    switch (currentPlatform) {
      case 'win32':
        return 'widgets-service-windows.exe';
      case 'darwin':
        return 'widgets-service-macos';
      case 'linux':
        return 'widgets-service-linux';
      default:
        return 'widgets-service';
    }
  }

  /**
   * Get the path to the widget service executable
   */
  getServicePath() {
    const execName = this.getExecutableName();
    
    // Try electron app resources first (production)
    const resourcesPath = process.resourcesPath 
      ? path.join(process.resourcesPath, 'electron', 'services', execName)
      : null;
    
    // Try local development path
    const devPath = path.join(__dirname, 'services', execName);
    
    // Try fallback to widgets_service_app folder (development)
    const fallbackPath = path.join(__dirname, '..', 'widgets_service_app', execName);
    
    // Check which path exists
    if (resourcesPath && fs.existsSync(resourcesPath)) {
      log.info(`Using production service path: ${resourcesPath}`);
      return resourcesPath;
    } else if (fs.existsSync(devPath)) {
      log.info(`Using development service path: ${devPath}`);
      return devPath;
    } else if (fs.existsSync(fallbackPath)) {
      log.info(`Using fallback service path: ${fallbackPath}`);
      return fallbackPath;
    } else {
      throw new Error(`Widget service executable not found. Checked paths:
        - Resources: ${resourcesPath}
        - Dev: ${devPath}
        - Fallback: ${fallbackPath}`);
    }
  }

  /**
   * Check if the service is currently running
   */
  async isServiceRunning() {
    if (this.process && !this.process.killed) {
      return true;
    }

    // Try to ping the service
    try {
      const response = await fetch(`http://localhost:${this.port}/api/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if any active widgets require the service
   */
  shouldServiceRun() {
    for (const widget of this.activeWidgets) {
      if (this.requiredWidgets.has(widget)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Register a widget as active
   */
  registerWidget(widgetType) {
    log.info(`Registering widget: ${widgetType}`);
    this.activeWidgets.add(widgetType);
    
    if (this.requiredWidgets.has(widgetType)) {
      log.info(`Widget ${widgetType} requires service, starting if needed`);
      this.manageService();
    }
  }

  /**
   * Unregister a widget
   */
  unregisterWidget(widgetType) {
    log.info(`Unregistering widget: ${widgetType}`);
    this.activeWidgets.delete(widgetType);
    
    if (this.requiredWidgets.has(widgetType)) {
      log.info(`Widget ${widgetType} no longer active, checking if service still needed`);
      this.manageService();
    }
  }

  /**
   * Start the widget service
   */
  async startService() {
    // If already starting, wait for it to complete
    if (this.isStarting) {
      log.info('Service is already starting, waiting for completion...');
      // Wait for the current startup to complete
      while (this.isStarting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Check if service is now running
      if (await this.isServiceRunning()) {
        return {
          success: true,
          port: this.port,
          pid: this.process?.pid || null,
          message: 'Service started by another request'
        };
      }
    }

    if (await this.isServiceRunning()) {
      log.info('Widget service already running');
      return {
        success: true,
        port: this.port,
        pid: this.process?.pid || null,
        message: 'Service already running'
      };
    }

    this.isStarting = true;

    try {
      const servicePath = this.getServicePath();
      
      log.info(`Starting widget service: ${servicePath}`);
      
      this.process = spawn(servicePath, [this.port.toString()], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      // Handle process events
      this.process.on('error', (error) => {
        log.error('Widget service error:', error);
        this.process = null;
        this.isStarting = false;
      });

      this.process.on('exit', (code, signal) => {
        log.info(`Widget service exited with code ${code}, signal ${signal}`);
        this.process = null;
        this.isStarting = false;
        this.stopHealthCheck();
      });

      // Log service output
      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          log.info(`Widget Service: ${data.toString().trim()}`);
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          const message = data.toString().trim();
          if (message && !message.includes('Widget Service starting')) {
            log.warn(`Widget Service Error: ${message}`);
          }
        });
      }

      // Wait for the service to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify the service is running
      const isRunning = await this.isServiceRunning();
      
      if (!isRunning) {
        this.process = null;
        throw new Error('Service failed to start properly');
      }

      // Start health check
      this.startHealthCheck();

      log.info(`Widget service started successfully on port ${this.port}`);
      
      return {
        success: true,
        port: this.port,
        pid: this.process?.pid || null,
        message: 'Service started successfully'
      };

    } catch (error) {
      log.error('Failed to start widget service:', error);
      this.process = null;
      return {
        success: false,
        port: this.port,
        error: error.message
      };
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the widget service
   */
  async stopService() {
    // Check if already stopping or not running
    if (this.isStopping) {
      log.debug('Service is already stopping, waiting for completion...');
      while (this.isStopping) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return { success: true, message: 'Service stopped (was already stopping)' };
    }

    if (!this.process) {
      log.info('Widget service not running');
      return { success: true, message: 'Service not running' };
    }

    this.isStopping = true;

    try {
      log.info('Stopping widget service...');
      
      // Stop health check
      this.stopHealthCheck();
      
      // Try graceful shutdown first
      this.process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if graceful shutdown takes too long
          if (this.process && !this.process.killed) {
            log.info('Force killing widget service...');
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process = null;
      log.info('Widget service stopped');
      
      return { success: true, message: 'Service stopped successfully' };
      
    } catch (error) {
      log.error('Error stopping widget service:', error);
      this.process = null;
      return { success: false, error: error.message };
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Get current service status
   */
  async getStatus() {
    const running = await this.isServiceRunning();
    return {
      running,
      port: this.port,
      pid: this.process?.pid,
      activeWidgets: Array.from(this.activeWidgets),
      shouldRun: this.shouldServiceRun()
    };
  }

  /**
   * Manage service based on widget requirements
   */
  async manageService() {
    // Check if we're already managing the service
    if (this.isStarting || this.isStopping) {
      log.debug('Service management already in progress, waiting for completion...');
      
      // Wait for the current operation to complete
      while (this.isStarting || this.isStopping) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return await this.getStatus();
    }

    const shouldRun = this.shouldServiceRun();
    const isRunning = await this.isServiceRunning();

    if (shouldRun && !isRunning) {
      log.info('Starting widget service (required by active widgets)');
      return await this.startService();
    } else if (!shouldRun && isRunning) {
      log.info('Stopping widget service (no longer needed)');
      return await this.stopService();
    } else {
      return await this.getStatus();
    }
  }

  /**
   * Start health check interval
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const isRunning = await this.isServiceRunning();
      if (!isRunning && this.process) {
        log.warn('Widget service health check failed, process may have crashed');
        this.process = null;
        
        // Restart if widgets still need it
        if (this.shouldServiceRun()) {
          log.info('Attempting to restart widget service...');
          try {
            await this.startService();
          } catch (error) {
            log.error('Failed to restart widget service:', error);
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop health check interval
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Force restart the service
   */
  async restartService() {
    log.info('Force restarting widget service...');
    await this.stopService();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startService();
  }

  /**
   * Cleanup on application exit
   */
  cleanup() {
    this.stopHealthCheck();
    
    if (this.process && !this.process.killed) {
      log.info('Cleaning up widget service...');
      this.process.kill('SIGTERM');
      
      // Force kill after 3 seconds if still running
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 3000);
    }
  }
}

module.exports = WidgetService;
