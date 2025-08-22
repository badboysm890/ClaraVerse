const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class IPCLogger {
  constructor() {
    // Create logs directory in userData
    this.logsDir = path.join(app.getPath('userData'), 'logs');
    this.logFile = path.join(this.logsDir, 'ipc.log');
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.maxBackups = 5; // Keep 5 backup files
    
    this.ensureLogsDirectory();
    this.initializeLogFile();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  initializeLogFile() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  formatLogEntry(type, channel, data, direction = 'incoming') {
    const timestamp = new Date().toISOString();
    const arrow = direction === 'incoming' ? '→' : '←';
    
    let dataStr = '';
    if (data !== undefined) {
      try {
        dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
      } catch (error) {
        dataStr = '[Circular or Non-serializable Object]';
      }
    }

    return `${timestamp} [${type}] ${arrow} ${channel}${dataStr ? `\n  Data: ${dataStr}` : ''}\n`;
  }

  checkFileSize() {
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.maxFileSize) {
        this.rotateLogFile();
      }
    } catch (error) {
      console.error('Error checking log file size:', error);
    }
  }

  rotateLogFile() {
    try {
      // Rotate existing backup files
      for (let i = this.maxBackups - 1; i >= 1; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxBackups - 1) {
            fs.unlinkSync(oldFile); // Delete oldest backup
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      if (fs.existsSync(this.logFile)) {
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }

      // Create new empty log file
      fs.writeFileSync(this.logFile, '');
      
      this.log('SYSTEM', 'log-rotation', { message: 'Log file rotated due to size limit' });
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  log(type, channel, data, direction = 'incoming') {
    try {
      this.checkFileSize();
      const logEntry = this.formatLogEntry(type, channel, data, direction);
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  logIPC(channel, data, direction = 'incoming') {
    this.log('IPC', channel, data, direction);
  }

  logError(channel, error, direction = 'incoming') {
    this.log('ERROR', channel, {
      message: error.message,
      stack: error.stack,
      code: error.code
    }, direction);
  }

  logSystem(message, data = null) {
    this.log('SYSTEM', 'system-event', { message, data });
  }

  // Enhanced logging methods for different communication types
  logServiceCall(serviceName, methodName, args = null, result = null) {
    this.log('SERVICE', `${serviceName}.${methodName}`, {
      args: args,
      result: result
    }, 'internal');
  }

  logProcessSpawn(command, args, options = {}) {
    this.log('PROCESS', 'spawn', {
      command: command,
      args: args,
      options: options
    }, 'outgoing');
  }

  logProcessExit(command, exitCode, signal = null) {
    this.log('PROCESS', 'exit', {
      command: command,
      exitCode: exitCode,
      signal: signal
    }, 'incoming');
  }

  logHttpRequest(method, url, options = {}) {
    this.log('HTTP', `${method} ${url}`, {
      options: options
    }, 'outgoing');
  }

  logHttpResponse(method, url, statusCode, responseData = null) {
    this.log('HTTP', `${method} ${url}`, {
      statusCode: statusCode,
      response: responseData
    }, 'incoming');
  }

  logDockerOperation(operation, containerName, data = null) {
    this.log('DOCKER', `${operation}:${containerName}`, data, 'outgoing');
  }

  logDockerResult(operation, containerName, result) {
    this.log('DOCKER', `${operation}:${containerName}`, result, 'incoming');
  }

  logWatchdogEvent(eventType, serviceName, data = null) {
    this.log('WATCHDOG', `${eventType}:${serviceName}`, data, 'internal');
  }

  logFileOperation(operation, filePath, data = null) {
    this.log('FILE', `${operation}:${path.basename(filePath)}`, {
      path: filePath,
      data: data
    }, 'internal');
  }

  async readLogs(lines = 1000) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return '';
      }

      const data = fs.readFileSync(this.logFile, 'utf8');
      const logLines = data.split('\n');
      
      // Return last N lines (or all if fewer than N)
      const startIndex = Math.max(0, logLines.length - lines);
      return logLines.slice(startIndex).join('\n');
    } catch (error) {
      console.error('Error reading log file:', error);
      return `Error reading log file: ${error.message}`;
    }
  }

  async getLogFiles() {
    try {
      const files = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith('ipc.log'))
        .map(file => {
          const fullPath = path.join(this.logsDir, file);
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime,
            isActive: file === 'ipc.log'
          };
        })
        .sort((a, b) => {
          // Sort with active file first, then by modification time (newest first)
          if (a.isActive) return -1;
          if (b.isActive) return 1;
          return b.modified - a.modified;
        });

      return files;
    } catch (error) {
      console.error('Error getting log files:', error);
      return [];
    }
  }

  async clearLogs() {
    try {
      // Remove all log files
      const files = await this.getLogFiles();
      for (const file of files) {
        fs.unlinkSync(file.path);
      }
      
      // Create new empty log file
      this.initializeLogFile();
      this.logSystem('Logs cleared by user');
      
      return { success: true };
    } catch (error) {
      console.error('Error clearing logs:', error);
      return { success: false, error: error.message };
    }
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

module.exports = IPCLogger; 
