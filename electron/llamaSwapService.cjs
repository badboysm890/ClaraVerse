const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const log = require('electron-log');

class LlamaSwapService {
  constructor() {
    this.process = null;
    this.isRunning = false;
    this.port = 8091;
    this.baseDir = path.join(__dirname, 'llamacpp-binaries');
    this.modelsDir = path.join(os.homedir(), '.clara', 'llama-models');
    this.configPath = path.join(this.baseDir, 'config.yaml');
    this.logPath = path.join(this.baseDir, 'llama-swap.log');
    
    // Determine the correct binary based on platform
    this.binaryPath = this.getBinaryPath();
    
    // Ensure models directory exists
    this.ensureDirectories();
  }

  getBinaryPath() {
    const platform = os.platform();
    const arch = os.arch();
    
    let binaryName;
    switch (platform) {
      case 'darwin':
        binaryName = arch === 'arm64' ? 'llama-swap-darwin-arm64' : 'llama-swap-darwin-amd64';
        break;
      case 'linux':
        binaryName = 'llama-swap-linux-amd64';
        break;
      case 'win32':
        binaryName = 'llama-swap-windows-amd64.exe';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    return path.join(this.baseDir, binaryName);
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(path.join(os.homedir(), '.clara'), { recursive: true });
      await fs.mkdir(this.modelsDir, { recursive: true });
      log.info(`Models directory ensured at: ${this.modelsDir}`);
    } catch (error) {
      log.error('Error creating directories:', error);
    }
  }

  async scanModels() {
    const models = [];
    const sources = [
      { path: this.modelsDir, source: 'user' },
      { path: path.join(this.baseDir, 'models'), source: 'bundled' }
    ];

    for (const { path: modelPath, source } of sources) {
      try {
        if (await fs.access(modelPath).then(() => true).catch(() => false)) {
          const files = await fs.readdir(modelPath);
          const ggufFiles = files.filter(file => file.endsWith('.gguf'));
          
          for (const file of ggufFiles) {
            const fullPath = path.join(modelPath, file);
            try {
              const stats = await fs.stat(fullPath);
              const modelName = this.generateModelName(file);
              
              models.push({
                name: modelName,
                file: file,
                path: fullPath,
                size: stats.size,
                source: source,
                lastModified: stats.mtime
              });
            } catch (error) {
              log.warn(`Error reading stats for ${file}:`, error);
            }
          }
        }
      } catch (error) {
        log.warn(`Error scanning models in ${modelPath}:`, error);
      }
    }

    return models;
  }

  generateModelName(filename) {
    // Convert filename to a readable model name
    // Example: "llama-3.2-1b-instruct-q4_k_m.gguf" -> "llama3.2:1b-instruct"
    return filename
      .replace('.gguf', '')
      .replace(/-/g, '')
      .replace(/q4_k_m|q4_k_s|q8_0|f16/gi, '')
      .replace(/\./g, '.')
      .toLowerCase()
      .replace(/(\d+)b/, ':$1b')
      .replace(/instructinstruct/g, 'instruct')
      .replace(/chatinstruct/g, 'instruct');
  }

  async generateConfig() {
    const models = await this.scanModels();
    
    let configYaml = `# Auto-generated llama-swap configuration
# Models directory: ${this.modelsDir}
healthCheckTimeout: 30
logLevel: info

models:
`;

    const groupMembers = [];

    // Generate model configurations using single port with swapping
    models.forEach((model) => {
      const llamaServerPath = path.join(this.baseDir, 'llama-server');
      
      configYaml += `  "${model.name}":
    proxy: "http://127.0.0.1:9999"
    cmd: |
      "${llamaServerPath}"
      -m "${model.path}"
      --port 9999
    ttl: 300

`;
      
      groupMembers.push(model.name);
    });

    // Add groups configuration
    configYaml += `groups:
  "default_group":
    swap: true
    exclusive: true
    members:
`;
    
    groupMembers.forEach(member => {
      configYaml += `      - "${member}"\n`;
    });

    await fs.writeFile(this.configPath, configYaml);
    log.info('Dynamic config generated with', models.length, 'models');
    
    return { models: models.length };
  }

  async start() {
    if (this.isRunning) {
      log.info('Llama-swap service is already running');
      return true;
    }

    try {
      // Ensure models directory and config exist
      await this.ensureDirectories();
      await this.generateConfig();

      log.info('Starting llama-swap service...');
      log.info(`Binary path: ${this.binaryPath}`);
      log.info(`Config path: ${this.configPath}`);
      log.info(`Port: ${this.port}`);

      // Fixed command line arguments according to the binary's help output
      const args = [
        '-config', this.configPath,
        '-listen', `:${this.port}`
      ];

      log.info(`Starting with args: ${args.join(' ')}`);

      this.process = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: false
      });

      this.isRunning = true;

      // Handle process output
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        log.info(`llama-swap stdout: ${output.trim()}`);
        
        // Check for successful startup - look for different possible success messages
        if (output.includes(`listening on`) || 
            output.includes(`server started`) ||
            output.includes(`:${this.port}`)) {
          log.info(`llama-swap service started successfully on port ${this.port}`);
        }
      });

      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        log.error(`llama-swap stderr: ${error.trim()}`);
        
        // Check for common errors
        if (error.includes('bind: address already in use')) {
          log.error(`Port ${this.port} is already in use. Please stop any existing llama-swap processes.`);
        }
        if (error.includes('no such file or directory')) {
          log.error('Binary or config file not found');
        }
        if (error.includes('permission denied')) {
          log.error('Permission denied - check binary execute permissions');
        }
      });

      this.process.on('close', (code) => {
        log.info(`llama-swap process exited with code ${code}`);
        this.isRunning = false;
        this.process = null;
        
        if (code !== 0 && code !== null) {
          log.error(`llama-swap service failed with exit code ${code}`);
        }
      });

      this.process.on('error', (error) => {
        log.error('Failed to start llama-swap service:', error);
        this.isRunning = false;
        this.process = null;
      });

      // Wait a bit to see if the process starts successfully
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if process is still running (didn't exit immediately due to error)
      if (this.process && !this.process.killed) {
        log.info('llama-swap process is running, checking if service is responding...');
        
        // Try to check if the service is actually responding
        try {
          await this.waitForService(10); // Wait up to 10 seconds
          log.info('llama-swap service is responding to requests');
          return true;
        } catch (serviceError) {
          log.warn('llama-swap process started but service is not responding:', serviceError.message);
          return true; // Still consider it a success if process is running
        }
      } else {
        this.isRunning = false;
        log.error('llama-swap process failed to start or exited immediately');
        return false;
      }
    } catch (error) {
      log.error('Error starting llama-swap service:', error);
      this.isRunning = false;
      this.process = null;
      return false;
    }
  }

  async waitForService(maxAttempts = 30) {
    let fetch;
    try {
      fetch = global.fetch || (await import('node-fetch')).default;
    } catch (importError) {
      // Fallback for older Node versions or import issues
      const nodeFetch = require('node-fetch');
      fetch = nodeFetch.default || nodeFetch;
    }

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.port}/v1/models`);
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Service not ready yet
        log.debug(`Service check attempt ${i + 1}/${maxAttempts} failed:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('llama-swap service failed to start within timeout period');
  }

  async stop() {
    if (!this.isRunning || !this.process) {
      log.info('Llama-swap service is not running');
      return true;
    }

    return new Promise((resolve) => {
      log.info('Stopping llama-swap service...');
      
      const timeout = setTimeout(() => {
        if (this.process) {
          log.warn('Force killing llama-swap process');
          this.process.kill('SIGKILL');
        }
        resolve(true);
      }, 5000);

      this.process.once('close', () => {
        clearTimeout(timeout);
        this.isRunning = false;
        this.process = null;
        log.info('llama-swap service stopped');
        resolve(true);
      });

      this.process.kill('SIGTERM');
    });
  }

  async restart() {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await this.start();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      pid: this.process?.pid,
      apiUrl: `http://localhost:${this.port}`
    };
  }

  async getModels() {
    if (!this.isRunning) {
      return [];
    }

    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      const response = await fetch(`http://localhost:${this.port}/v1/models`);
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
    } catch (error) {
      log.error('Error fetching models from llama-swap:', error);
    }
    
    return [];
  }

  async downloadModel(modelUrl, modelName) {
    // This would be implemented to download models from Hugging Face or other sources
    // For now, this is a placeholder
    log.info(`Download model functionality to be implemented: ${modelName} from ${modelUrl}`);
    throw new Error('Model download functionality not yet implemented');
  }

  getApiUrl() {
    return `http://localhost:${this.port}`;
  }
}

module.exports = LlamaSwapService; 