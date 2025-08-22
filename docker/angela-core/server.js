/**
 * angela Core HTTP Server
 * Containerized version of LlamaSwapService
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const yaml = require('js-yaml');

class angelaCoreServer {
  constructor() {
    this.app = express();
    this.port = process.env.angela_PORT || 8091;
    this.modelsDir = process.env.angela_MODELS_DIR || '/app/models';
    this.configDir = process.env.angela_CONFIG_DIR || '/app/config';
    this.logsDir = process.env.angela_LOGS_DIR || '/app/logs';
    this.binaryDir = '/app/llamacpp-binaries';
    
    this.llamaProcess = null;
    this.isRunning = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.detectGPU();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'angela-core',
        isRunning: this.isRunning,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Service management
    this.app.post('/start', this.startService.bind(this));
    this.app.post('/stop', this.stopService.bind(this));
    this.app.post('/restart', this.restartService.bind(this));
    this.app.get('/status', this.getStatus.bind(this));

    // Model management
    this.app.get('/models', this.getModels.bind(this));
    this.app.post('/models/scan', this.scanModels.bind(this));
    this.app.get('/models/:modelId', this.getModelInfo.bind(this));

    // Configuration
    this.app.get('/config', this.getConfig.bind(this));
    this.app.post('/config', this.updateConfig.bind(this));
    this.app.post('/config/generate', this.generateConfig.bind(this));

    // Logs
    this.app.get('/logs', this.getLogs.bind(this));

    // GPU info
    this.app.get('/gpu', this.getGPUInfo.bind(this));

    // Proxy to llama-server (when running)
    this.app.use('/v1', this.proxyToLlamaServer.bind(this));
  }

  async detectGPU() {
    this.gpuInfo = {
      hasGPU: false,
      type: 'cpu',
      memory: 0,
      devices: []
    };

    try {
      // Check for NVIDIA GPUs in Docker environment
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // First check if we're in a GPU-enabled Docker container
      if (process.env.NVIDIA_VISIBLE_DEVICES || process.env.CUDA_VISIBLE_DEVICES) {
        console.log('🎮 NVIDIA environment variables detected');
        
        try {
          // Try to run nvidia-smi
          const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null');
          const lines = stdout.trim().split('\n').filter(line => line.length > 0);
          
          if (lines.length > 0) {
            this.gpuInfo.hasGPU = true;
            this.gpuInfo.type = 'nvidia';
            this.gpuInfo.devices = lines.map(line => {
              const [name, memory] = line.split(',').map(s => s.trim());
              return { name, memory: parseInt(memory) };
            });
            this.gpuInfo.memory = Math.max(...this.gpuInfo.devices.map(d => d.memory));
            
            console.log('🎮 NVIDIA GPU detected:', this.gpuInfo);
            return;
          }
        } catch (error) {
          console.log('⚠️ nvidia-smi not available, checking alternative methods...');
        }
        
        // Alternative: Check for GPU device files
        try {
          const fs = require('fs').promises;
          const deviceFiles = await fs.readdir('/dev').catch(() => []);
          const hasNvidiaDevices = deviceFiles.some(file => file.startsWith('nvidia'));
          
          if (hasNvidiaDevices) {
            this.gpuInfo.hasGPU = true;
            this.gpuInfo.type = 'nvidia';
            this.gpuInfo.devices = [{ name: 'NVIDIA GPU (detected via /dev)', memory: 8192 }]; // Default assumption
            this.gpuInfo.memory = 8192;
            
            console.log('🎮 NVIDIA GPU detected via device files');
            return;
          }
        } catch (error) {
          console.log('📋 Could not check GPU device files');
        }
        
        // If environment variables suggest GPU but we can't detect it properly,
        // assume GPU is available but with limited info
        this.gpuInfo.hasGPU = true;
        this.gpuInfo.type = 'nvidia';
        this.gpuInfo.devices = [{ name: 'NVIDIA GPU (environment detected)', memory: 8192 }];
        this.gpuInfo.memory = 8192;
        console.log('🎮 GPU assumed available based on environment variables');
      } else {
        console.log('📋 No GPU environment variables detected, using CPU-only mode');
      }

      // Check for AMD GPUs (placeholder)
      // TODO: Add AMD GPU detection

    } catch (error) {
      console.log('🔍 GPU detection failed:', error.message);
    }
  }

  getBinaryPath() {
    const platform = os.platform();
    const arch = os.arch();
    
    // Determine platform directory
    let platformDir;
    if (platform === 'linux') {
      if (this.gpuInfo.hasGPU && this.gpuInfo.type === 'nvidia') {
        platformDir = arch === 'arm64' ? 'linux-arm64-cuda' : 'linux-x64-cuda';
      } else {
        platformDir = arch === 'arm64' ? 'linux-arm64-cpu' : 'linux-x64-cpu';
      }
    } else if (platform === 'darwin') {
      platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    } else if (platform === 'win32') {
      if (this.gpuInfo.hasGPU && this.gpuInfo.type === 'nvidia') {
        platformDir = 'win32-x64-cuda';
      } else {
        platformDir = 'win32-x64-cpu';
      }
    }

    const binaryName = platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    return path.join(this.binaryDir, platformDir, binaryName);
  }

  async ensureDirectories() {
    const dirs = [this.modelsDir, this.configDir, this.logsDir];
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  async scanModelsInternal() {
    const models = [];
    
    try {
      const files = await fs.readdir(this.modelsDir);
      
      for (const file of files) {
        if (file.endsWith('.gguf')) {
          const filePath = path.join(this.modelsDir, file);
          const stats = await fs.stat(filePath);
          
          models.push({
            name: file.replace('.gguf', ''),
            file: file,
            path: filePath,
            size: stats.size,
            lastModified: stats.mtime,
            source: 'local'
          });
        }
      }
    } catch (error) {
      console.error('Error scanning models:', error);
    }
    
    return models;
  }

  async generateConfig() {
    const models = await this.scanModelsInternal();
    
    const config = {
      host: '0.0.0.0',
      port: 8080, // Internal llama-server port
      models_path: this.modelsDir,
      log_level: 'info',
      models: {}
    };

    // Generate model configurations
    for (const model of models) {
      const modelName = `angela:${model.name}`;
      
      config.models[modelName] = {
        model: model.path,
        n_gpu_layers: this.gpuInfo.hasGPU ? -1 : 0, // Use all GPU layers if available
        n_ctx: 4096, // Default context size
        n_batch: 512,
        n_threads: os.cpus().length,
        f16_kv: true,
        use_mmap: true,
        use_mlock: false
      };

      // GPU-specific optimizations
      if (this.gpuInfo.hasGPU) {
        config.models[modelName].flash_attn = true;
        config.models[modelName].use_mmap = false; // Better for GPU
        config.models[modelName].n_batch = 1024;
      }
    }

    // Save config
    const configPath = path.join(this.configDir, 'llama-server.yaml');
    const yamlConfig = yaml.dump(config, { indent: 2 });
    await fs.writeFile(configPath, yamlConfig);
    
    console.log(`📄 Generated config for ${models.length} models`);
    return config;
  }

  async startService() {
    if (this.isRunning) {
      return { success: false, error: 'Service already running' };
    }

    try {
      await this.ensureDirectories();
      
      // Generate config
      await this.generateConfig();
      
      const binaryPath = this.getBinaryPath();
      const configPath = path.join(this.configDir, 'llama-server.yaml');
      
      console.log(`🚀 Starting llama-server: ${binaryPath}`);
      console.log(`📄 Using config: ${configPath}`);
      
      // Check if binary exists
      if (!fsSync.existsSync(binaryPath)) {
        throw new Error(`Binary not found: ${binaryPath}`);
      }

      const args = [
        '--config', configPath,
        '--host', '0.0.0.0',
        '--port', '8080'
      ];

      this.llamaProcess = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || '0'
        }
      });

      this.llamaProcess.stdout.on('data', (data) => {
        console.log(`llama-server: ${data.toString().trim()}`);
      });

      this.llamaProcess.stderr.on('data', (data) => {
        console.error(`llama-server error: ${data.toString().trim()}`);
      });

      this.llamaProcess.on('close', (code) => {
        console.log(`llama-server exited with code ${code}`);
        this.isRunning = false;
        this.llamaProcess = null;
      });

      this.isRunning = true;
      
      return { 
        success: true, 
        message: 'angela Core started successfully',
        pid: this.llamaProcess.pid
      };
      
    } catch (error) {
      console.error('Failed to start service:', error);
      return { success: false, error: error.message };
    }
  }

  async stopService() {
    if (!this.isRunning || !this.llamaProcess) {
      return { success: true, message: 'Service not running' };
    }

    try {
      this.llamaProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.llamaProcess) {
            this.llamaProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.llamaProcess.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isRunning = false;
      this.llamaProcess = null;
      
      return { success: true, message: 'Service stopped successfully' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async restartService() {
    await this.stopService();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startService();
  }

  // Express route handlers
  async startService(req, res) {
    const result = await this.startService();
    res.json(result);
  }

  async stopService(req, res) {
    const result = await this.stopService();
    res.json(result);
  }

  async restartService(req, res) {
    const result = await this.restartService();
    res.json(result);
  }

  getStatus(req, res) {
    res.json({
      isRunning: this.isRunning,
      pid: this.llamaProcess?.pid || null,
      uptime: this.isRunning ? process.uptime() : 0,
      models: 0, // Will be updated with actual model count
      gpu: this.gpuInfo
    });
  }

  async getModels(req, res) {
    try {
      const models = await this.scanModelsInternal();
      res.json({ success: true, models });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async scanModels(req, res) {
    try {
      const models = await this.scanModelsInternal();
      res.json({ success: true, models, count: models.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getModelInfo(req, res) {
    const { modelId } = req.params;
    // TODO: Implement model info retrieval
    res.json({ success: true, modelId, info: {} });
  }

  async getConfig(req, res) {
    try {
      const configPath = path.join(this.configDir, 'llama-server.yaml');
      if (fsSync.existsSync(configPath)) {
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = yaml.load(configContent);
        res.json({ success: true, config });
      } else {
        res.json({ success: false, error: 'Config file not found' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateConfig(req, res) {
    try {
      const { config } = req.body;
      const configPath = path.join(this.configDir, 'llama-server.yaml');
      const yamlConfig = yaml.dump(config, { indent: 2 });
      await fs.writeFile(configPath, yamlConfig);
      res.json({ success: true, message: 'Config updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async generateConfig(req, res) {
    try {
      const config = await this.generateConfig();
      res.json({ success: true, config });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  getLogs(req, res) {
    // TODO: Implement log retrieval
    res.json({ success: true, logs: [] });
  }

  getGPUInfo(req, res) {
    res.json({ success: true, gpu: this.gpuInfo });
  }

  async proxyToLlamaServer(req, res) {
    if (!this.isRunning) {
      return res.status(503).json({ error: 'angela Core service not running' });
    }

    try {
      const { default: fetch } = await import('node-fetch');
      const url = `http://localhost:8080${req.originalUrl}`;
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...req.headers
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      });

      const data = await response.json();
      res.status(response.status).json(data);
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async start() {
    await this.ensureDirectories();
    
    this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`🚀 angela Core HTTP Server running on port ${this.port}`);
      console.log(`🎮 GPU Support: ${this.gpuInfo.hasGPU ? this.gpuInfo.type : 'CPU only'}`);
      console.log(`📁 Models: ${this.modelsDir}`);
      console.log(`📄 Config: ${this.configDir}`);
    });

    // Auto-start the service
    setTimeout(async () => {
      const models = await this.scanModelsInternal();
      if (models.length > 0) {
        console.log(`🤖 Found ${models.length} models, auto-starting service...`);
        await this.startService();
      } else {
        console.log('📭 No models found. Service ready but not started.');
      }
    }, 2000);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  if (server.llamaProcess) {
    await server.stopService();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  if (server.llamaProcess) {
    await server.stopService();
  }
  process.exit(0);
});

// Start the server
const server = new angelaCoreServer();
server.start().catch(error => {
  console.error('❌ Failed to start angela Core server:', error);
  process.exit(1);
});

module.exports = angelaCoreServer;
