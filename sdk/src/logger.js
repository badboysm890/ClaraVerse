/**
 * Logger - Handles logging for the SDK
 */

export class Logger {
  constructor(enabled = false, logLevel = 'info') {
    this.enabled = enabled;
    this.logLevel = logLevel;
    this.logs = [];
    this.maxLogs = 1000; // Prevent memory issues
    
    // Log levels in order of severity
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    this.currentLevel = this.levels[logLevel] || this.levels.info;
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  info(message, data = {}) {
    this.log('info', message, data);
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  error(message, data = {}) {
    this.log('error', message, data);
  }

  /**
   * Internal log method
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    const levelValue = this.levels[level] || this.levels.info;
    
    // Skip if log level is below current threshold
    if (levelValue < this.currentLevel) {
      return;
    }

    const logEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      data: this.sanitizeData(data)
    };

    // Add to internal log storage
    this.logs.push(logEntry);
    
    // Trim logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Output to console if enabled
    if (this.enabled) {
      this.outputToConsole(logEntry);
    }
  }

  /**
   * Output log entry to console
   * @param {Object} logEntry - Log entry to output
   */
  outputToConsole(logEntry) {
    const { level, message, data, timestamp } = logEntry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    // Choose appropriate console method
    const consoleMethod = console[level] || console.log;
    
    if (Object.keys(data).length > 0) {
      consoleMethod(`${prefix} ${message}`, data);
    } else {
      consoleMethod(`${prefix} ${message}`);
    }
  }

  /**
   * Sanitize data for logging (remove sensitive info, circular refs)
   * @param {any} data - Data to sanitize
   * @returns {any} Sanitized data
   */
  sanitizeData(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    try {
      // Handle circular references by converting to JSON and back
      const jsonString = JSON.stringify(data, (key, value) => {
        // Remove sensitive keys
        const sensitiveKeys = ['password', 'apiKey', 'secret', 'token', 'authorization'];
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          return '[REDACTED]';
        }
        
        // Handle functions
        if (typeof value === 'function') {
          return '[Function]';
        }
        
        return value;
      });
      
      return JSON.parse(jsonString);
    } catch (error) {
      // If JSON serialization fails, return a safe representation
      return { error: 'Could not serialize data', type: typeof data };
    }
  }

  /**
   * Generate unique log ID
   * @returns {string} Unique log ID
   */
  generateLogId() {
    return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all logs
   * @returns {Array} Array of log entries
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   * @param {string} level - Log level to filter by
   * @returns {Array} Filtered log entries
   */
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs within a time range
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @returns {Array} Filtered log entries
   */
  getLogsByTimeRange(startTime, endTime) {
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime >= startTime && logTime <= endTime;
    });
  }

  /**
   * Search logs by message content
   * @param {string} searchTerm - Term to search for
   * @returns {Array} Matching log entries
   */
  searchLogs(searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return this.logs.filter(log => 
      log.message.toLowerCase().includes(lowerSearchTerm) ||
      JSON.stringify(log.data).toLowerCase().includes(lowerSearchTerm)
    );
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    if (this.enabled) {
      console.log('[LOGGER] Logs cleared');
    }
  }

  /**
   * Set log level
   * @param {string} level - New log level
   */
  setLogLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.logLevel = level;
      this.currentLevel = this.levels[level];
      this.info(`Log level set to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}. Available levels: ${Object.keys(this.levels).join(', ')}`);
    }
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Whether to enable logging
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) {
      this.info('Logging enabled');
    }
  }

  /**
   * Get logging statistics
   * @returns {Object} Logging statistics
   */
  getStats() {
    const stats = {
      totalLogs: this.logs.length,
      enabled: this.enabled,
      logLevel: this.logLevel,
      maxLogs: this.maxLogs,
      byLevel: {}
    };

    // Count logs by level
    for (const level of Object.keys(this.levels)) {
      stats.byLevel[level] = this.logs.filter(log => log.level === level).length;
    }

    return stats;
  }

  /**
   * Export logs to JSON string
   * @param {Object} options - Export options
   * @returns {string} JSON string of logs
   */
  exportLogs(options = {}) {
    const {
      level = null,
      startTime = null,
      endTime = null,
      maxEntries = null
    } = options;

    let logsToExport = [...this.logs];

    // Apply filters
    if (level) {
      logsToExport = logsToExport.filter(log => log.level === level);
    }

    if (startTime || endTime) {
      logsToExport = logsToExport.filter(log => {
        const logTime = new Date(log.timestamp);
        if (startTime && logTime < startTime) return false;
        if (endTime && logTime > endTime) return false;
        return true;
      });
    }

    if (maxEntries && maxEntries > 0) {
      logsToExport = logsToExport.slice(-maxEntries);
    }

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalEntries: logsToExport.length,
      filters: { level, startTime, endTime, maxEntries },
      logs: logsToExport
    }, null, 2);
  }

  /**
   * Import logs from JSON string
   * @param {string} jsonString - JSON string containing logs
   * @param {boolean} merge - Whether to merge with existing logs
   */
  importLogs(jsonString, merge = true) {
    try {
      const importData = JSON.parse(jsonString);
      
      if (!importData.logs || !Array.isArray(importData.logs)) {
        throw new Error('Invalid log format: missing logs array');
      }

      if (merge) {
        this.logs.push(...importData.logs);
        
        // Trim if exceeding max
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(-this.maxLogs);
        }
      } else {
        this.logs = importData.logs.slice(-this.maxLogs);
      }

      this.info(`Imported ${importData.logs.length} log entries`, { 
        merged: merge, 
        totalLogs: this.logs.length 
      });

    } catch (error) {
      this.error('Failed to import logs', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a child logger with a prefix
   * @param {string} prefix - Prefix for all log messages
   * @returns {Logger} Child logger instance
   */
  createChild(prefix) {
    const childLogger = new Logger(this.enabled, this.logLevel);
    childLogger.logs = this.logs; // Share the same log array
    
    // Override log method to add prefix
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, data) => {
      originalLog(level, `[${prefix}] ${message}`, data);
    };

    return childLogger;
  }
} 
