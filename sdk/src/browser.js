/**
 * Browser-compatible entry point for angela Flow SDK
 * Excludes Node.js-specific modules and provides browser-safe functionality
 */

// Import core functionality
import { angelaFlowRunner } from './index.js';

// Browser-compatible logger (simplified)
class BrowserLogger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.enableColors = false; // No colors in browser console by default
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  debug(message, data) { this.log('debug', message, data); }
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }
}

// Browser-compatible Flow Runner
class BrowserangelaFlowRunner extends angelaFlowRunner {
  constructor(options = {}) {
    // Override logger for browser compatibility
    const browserOptions = {
      ...options,
      logger: new BrowserLogger(options.logger || {})
    };
    
    super(browserOptions);
    
    // Disable Node.js-specific features
    this.isNodeEnvironment = false;
    this.isBrowserEnvironment = true;
  }

  // Override methods that use Node.js-specific APIs
  async loadFlowFromFile(filePath) {
    throw new Error('File system operations are not supported in browser environment. Use loadFlow() with flow data instead.');
  }

  async saveFlowToFile(flowData, filePath) {
    throw new Error('File system operations are not supported in browser environment. Use exportFlow() to get flow data instead.');
  }

  // Browser-compatible flow loading
  async loadFlowFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch flow from ${url}: ${response.statusText}`);
      }
      const flowData = await response.json();
      return this.loadFlow(flowData);
    } catch (error) {
      throw new Error(`Failed to load flow from URL: ${error.message}`);
    }
  }

  // Browser-compatible file handling for file-upload node
  async handleFileUpload(file, options = {}) {
    if (!(file instanceof File)) {
      throw new Error('Expected File object for browser file upload');
    }

    const { outputFormat = 'base64', maxSize = 10 * 1024 * 1024 } = options;

    // Check file size
    if (file.size > maxSize) {
      throw new Error(`File size (${file.size} bytes) exceeds maximum allowed size (${maxSize} bytes)`);
    }

    try {
      switch (outputFormat) {
        case 'base64':
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file as base64'));
            reader.readAsDataURL(file);
          });

        case 'text':
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file as text'));
            reader.readAsText(file);
          });

        case 'binary':
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file as binary'));
            reader.readAsArrayBuffer(file);
          });

        case 'url':
          return URL.createObjectURL(file);

        default:
          throw new Error(`Unsupported output format: ${outputFormat}`);
      }
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
  }
}

// Export for UMD build
export { BrowserangelaFlowRunner as angelaFlowRunner };

// Also export utility functions
export const createFlowRunner = (options = {}) => {
  return new BrowserangelaFlowRunner(options);
};

export const validateFlow = (flowData) => {
  const runner = new BrowserangelaFlowRunner();
  return runner.validateFlow(flowData);
};

// Browser-specific utilities
export const BrowserUtils = {
  // Check if running in browser
  isBrowser: () => typeof window !== 'undefined',
  
  // Get browser info
  getBrowserInfo: () => {
    if (typeof navigator === 'undefined') return null;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language
    };
  },
  
  // Download flow as file (browser-specific)
  downloadFlow: (flowData, filename = 'flow.json') => {
    const dataStr = JSON.stringify(flowData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  
  // Load flow from file input
  loadFlowFromFileInput: (fileInput) => {
    return new Promise((resolve, reject) => {
      const file = fileInput.files[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const flowData = JSON.parse(e.target.result);
          resolve(flowData);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};

// Default export
export default BrowserangelaFlowRunner; 
