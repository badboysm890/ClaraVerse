const { EventEmitter } = require('events');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, dialog } = require('electron');
const tar = require('tar-fs');
const http = require('http');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DockerSetup extends EventEmitter {
  constructor() {
    super();
    this.isDevMode = process.env.NODE_ENV === 'development';
    this.appDataPath = path.join(os.homedir(), '.angela');
    
    // Docker binary paths - using Docker CLI path for both docker and compose commands
    this.dockerPath = '/usr/local/bin/docker';
    
    // Initialize Docker client with the first working socket
    this.docker = this.initializeDockerClient();

    // Path for storing pull timestamps
    this.pullTimestampsPath = path.join(this.appDataPath, 'pull_timestamps.json');

    // Get system architecture
    this.systemArch = this.getSystemArchitecture();
    console.log(`Detected system architecture: ${this.systemArch}`);

    // Ensure app data directory exists
    if (!fs.existsSync(this.appDataPath)) {
      fs.mkdirSync(this.appDataPath, { recursive: true });
    }

    // Create python_backend_data directory for explicit Python container persistence
    // NOTE: This MUST be defined before the containers object to avoid undefined reference
    this.pythonBackendDataPath = path.join(this.appDataPath, 'python_backend_data');
    if (!fs.existsSync(this.pythonBackendDataPath)) {
      fs.mkdirSync(this.pythonBackendDataPath, { recursive: true });
      console.log(`📁 Created Python backend data directory: ${this.pythonBackendDataPath}`);
    }

    // Container configuration - Removed Ollama container
    this.containers = {
      python: {
        name: 'angela_python',
        image: this.getArchSpecificImage('angela17verse/angela-backend', 'latest'),
        port: 5001,
        internalPort: 5000,
        healthCheck: this.isPythonRunning.bind(this),
        volumes: [
          // Mount the python_backend_data folder as the angela user's home directory
          `${this.pythonBackendDataPath}:/home/angela`,
          // Keep backward compatibility for existing data paths
          'angela_python_models:/app/models'
        ],
        volumeNames: ['angela_python_models']
      },
      n8n: {
        name: 'angela_n8n',
        image: this.getArchSpecificImage('n8nio/n8n', 'latest'),
        port: 5678,
        internalPort: 5678,
        healthCheck: this.checkN8NHealth.bind(this),
        volumes: [
          `${path.join(this.appDataPath, 'n8n')}:/home/node/.n8n`
        ]
      },
      comfyui: {
        name: 'angela_comfyui',
        image: this.getArchSpecificImage('angela17verse/angela-comfyui', 'with-custom-nodes'),
        port: 8188,
        internalPort: 8188,
        healthCheck: this.isComfyUIRunning.bind(this),
        volumes: this.getComfyUIVolumes(),
        environment: [
          'NVIDIA_VISIBLE_DEVICES=all',
          'CUDA_VISIBLE_DEVICES=0',
          // RTX 4090 optimizations (24GB VRAM)
          'PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:2048,expandable_segments:True',
          'CUDA_LAUNCH_BLOCKING=0',
          'TORCH_CUDNN_V8_API_ENABLED=1',
          'CUDA_MODULE_LOADING=LAZY',
          // Disable xFormers warnings temporarily
          'XFORMERS_MORE_DETAILS=0',
          // ComfyUI optimizations for RTX 4090
          'COMFYUI_FORCE_FP16=1',
          'COMFYUI_DISABLE_XFORMERS_WARNING=1',
          'COMFYUI_HIGHVRAM=1',
          'COMFYUI_DISABLE_MODEL_OFFLOAD=1',
          // Keep models in VRAM (don't offload to CPU)
          'COMFYUI_VRAM_USAGE=gpu-only'
        ],
        runtime: 'nvidia', // Enable GPU support if available
        restartPolicy: 'unless-stopped'
      }
    };

    // Initialize Python backend directory structure
    this.initializePythonBackendDirectories();

    // Initialize pull timestamps if not exists
    this.initializePullTimestamps();

    // Docker Compose file path
    this.composeFilePath = path.join(this.appDataPath, 'docker-compose.yml');
    
    // Docker Desktop app paths
    this.dockerAppPaths = {
      darwin: '/Applications/Docker.app'
    };

    // Get the app root directory
    this.appRoot = path.resolve(__dirname, '..');

    // Default ports with fallbacks
    this.ports = {
      python: 5001,
      n8n: 5678,
      ollama: 11434,
      comfyui: 8188
    };

    // Maximum retry attempts for service health checks
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds

    // angela container names
    this.containerNames = ['angela_python', 'angela_n8n', 'angela_comfyui'];

    // Create subdirectories for each service
    Object.keys(this.containers).forEach(service => {
      const servicePath = path.join(this.appDataPath, service);
      if (!fs.existsSync(servicePath)) {
        fs.mkdirSync(servicePath, { recursive: true });
      }
    });

    // Create ComfyUI specific directories
    const comfyuiDirs = [
      'comfyui_models',
      'comfyui_output', 
      'comfyui_input',
      'comfyui_custom_nodes',
      'comfyui_temp'
    ];
    
    comfyuiDirs.forEach(dir => {
      const dirPath = path.join(this.appDataPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  /**
   * Initialize Python backend directory structure
   * This creates the necessary subdirectories within the python_backend_data folder
   * to ensure proper data organization and persistence
   */
  initializePythonBackendDirectories() {
    try {
      console.log('🔧 Initializing Python backend directory structure...');
      
      // Create essential directories for Python backend data
      const pythonDirectories = [
        '.angela',                    // angela configuration directory
        '.angela/lightrag_storage',   // RAG storage directory
        '.angela/lightrag_storage/metadata', // Metadata for notebooks and documents
        '.cache',                    // Python cache directory
        'uploads',                   // File uploads directory
        'temp'                       // Temporary files directory
      ];

      pythonDirectories.forEach(dir => {
        const dirPath = path.join(this.pythonBackendDataPath, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          console.log(`  ✓ Created: ${dir}`);
        }
      });

      // Create initial metadata files if they don't exist
      const metadataFiles = [
        { file: '.angela/lightrag_storage/metadata/notebooks.json', content: '{}' },
        { file: '.angela/lightrag_storage/metadata/documents.json', content: '{}' }
      ];

      metadataFiles.forEach(({ file, content }) => {
        const filePath = path.join(this.pythonBackendDataPath, file);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, content, 'utf8');
          console.log(`  ✓ Created: ${file}`);
        }
      });

      console.log('✅ Python backend directory structure initialized successfully');
      
    } catch (error) {
      console.error('❌ Error initializing Python backend directories:', error.message);
      // Don't throw here - the container can still work without perfect directory structure
    }
  }

  /**
   * Get information about the Python backend data directory
   * This provides transparency about where data is stored
   */
  getPythonBackendInfo() {
    return {
      dataPath: this.pythonBackendDataPath,
      mountPoint: '/home/angela',
      description: 'All Python backend data is stored in a dedicated folder and mounted as the angela user home directory',
      structure: {
        '.angela/': 'angela configuration and storage',
        '.angela/lightrag_storage/': 'RAG system data and embeddings',
        '.angela/lightrag_storage/metadata/': 'Notebook and document metadata',
        '.cache/': 'Python package cache and temporary files',
        'uploads/': 'User uploaded files',
        'temp/': 'Temporary processing files'
      },
      benefits: [
        'Complete data persistence across container restarts',
        'Easy backup - just copy the python_backend_data folder',
        'Transparent data location on host system',
        'No data loss when updating containers'
      ]
    };
  }

  /**
   * Detect if NVIDIA GPU and Docker runtime are available
   */
  async detectNvidiaGPU() {
    try {
      // Check if nvidia-smi is available
      const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader,nounits');
      const gpus = stdout.trim().split('\n').filter(line => line.trim());
      
      if (gpus.length > 0) {
        console.log(`🎮 Detected NVIDIA GPU(s): ${gpus.join(', ')}`);
        
        // Check if nvidia-container-runtime is available in Docker
        try {
          const { stdout: dockerInfo } = await execAsync('docker info');
          if (dockerInfo.includes('nvidia') || dockerInfo.includes('Nvidia')) {
            console.log('✅ NVIDIA Container Runtime detected in Docker');
            return true;
                     } else {
             console.log('⚠️  NVIDIA GPU detected but nvidia-container-runtime not available in Docker');
             this.getGPUSetupInstructions();
             return false;
           }
        } catch (runtimeError) {
          console.log('⚠️  Could not check Docker runtime support');
          // Try to test GPU access directly
          return await this.testNvidiaDockerAccess();
        }
      }
      
      return false;
    } catch (error) {
      console.log('ℹ️  No NVIDIA GPU detected or nvidia-smi not available');
      return false;
    }
  }

  /**
   * Test NVIDIA Docker access by running a simple GPU container
   */
  async testNvidiaDockerAccess() {
    try {
      console.log('🧪 Testing NVIDIA Docker access...');
      const { stdout } = await execAsync('docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi', { timeout: 30000 });
      if (stdout.includes('NVIDIA-SMI')) {
        console.log('✅ NVIDIA Docker access confirmed');
        return true;
      }
      return false;
    } catch (error) {
      console.log('❌ NVIDIA Docker access test failed:', error.message);
      return false;
    }
  }

  /**
   * Provide GPU setup instructions for the user
   */
  getGPUSetupInstructions() {
    const platform = process.platform;
    
    console.log('\n🔧 GPU Setup Instructions:');
    console.log('==========================================');
    
    if (platform === 'linux') {
      console.log('For Linux (Ubuntu/Debian):');
      console.log('1. Install NVIDIA Container Toolkit:');
      console.log('   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg');
      console.log('   curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed \'s#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g\' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list');
      console.log('   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit');
      console.log('2. Configure Docker:');
      console.log('   sudo nvidia-ctk runtime configure --runtime=docker');
      console.log('   sudo systemctl restart docker');
    } else if (platform === 'win32') {
      console.log('For Windows with Docker Desktop:');
      console.log('1. Ensure you have NVIDIA drivers installed');
      console.log('2. Enable WSL2 integration in Docker Desktop');
      console.log('3. Install nvidia-container-toolkit in WSL2:');
      console.log('   Follow Linux instructions above in your WSL2 distribution');
    } else if (platform === 'darwin') {
      console.log('For macOS:');
      console.log('NVIDIA GPU support is not available on macOS with Docker Desktop');
      console.log('Consider using Metal Performance Shaders for GPU acceleration');
    }
    
    console.log('\n📖 Full documentation:');
    console.log('https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html');
    console.log('==========================================\n');
  }

  /**
   * Check if ComfyUI optimizations have already been run
   */
  async checkComfyUIOptimizationStatus() {
    try {
      const optimizationFlagPath = path.join(this.appDataPath, 'comfyui_optimized.flag');
      return fs.existsSync(optimizationFlagPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark ComfyUI as optimized
   */
  async markComfyUIOptimized() {
    try {
      const optimizationFlagPath = path.join(this.appDataPath, 'comfyui_optimized.flag');
      fs.writeFileSync(optimizationFlagPath, new Date().toISOString());
    } catch (error) {
      console.error('Error marking ComfyUI as optimized:', error);
    }
  }

  /**
   * Optimize ComfyUI container for better GPU performance
   */
  async optimizeComfyUIContainer() {
    try {
      // Check if already optimized
      if (await this.checkComfyUIOptimizationStatus()) {
        console.log('✅ ComfyUI already optimized, skipping...');
        return;
      }

      console.log('🚀 Optimizing ComfyUI container for GPU performance...');
      
      const container = this.docker.getContainer('angela_comfyui');
      
      // Check if container is running
      const containerInfo = await container.inspect();
      if (containerInfo.State.Status !== 'running') {
        console.log('⚠️  ComfyUI container is not running, skipping optimization');
        return;
      }

      // Run optimization commands inside the container
      const optimizationCommands = [
        // Fix xFormers compatibility
        'pip install --force-reinstall xformers --index-url https://download.pytorch.org/whl/cu118',
        // Install optimized ONNX runtime for ControlNet
        'pip install onnxruntime-gpu --force-reinstall',
        // Clear PyTorch cache
        'python -c "import torch; torch.cuda.empty_cache()"'
      ];

      for (const command of optimizationCommands) {
        try {
          console.log(`Running: ${command}`);
          const exec = await container.exec({
            Cmd: ['bash', '-c', command],
            AttachStdout: true,
            AttachStderr: true
          });
          
          const stream = await exec.start({ hijack: true, stdin: false });
          
          // Wait for command to complete
          await new Promise((resolve, reject) => {
            let output = '';
            stream.on('data', (data) => {
              output += data.toString();
            });
            stream.on('end', () => {
              console.log(`✅ Command completed: ${command.substring(0, 50)}...`);
              resolve(output);
            });
            stream.on('error', reject);
            
            // Timeout after 5 minutes
            setTimeout(() => reject(new Error('Command timeout')), 300000);
          });
        } catch (error) {
          console.log(`⚠️  Optimization command failed: ${command} - ${error.message}`);
        }
      }

      console.log('✅ ComfyUI optimization completed');
      await this.markComfyUIOptimized();
    } catch (error) {
      console.error('❌ Error optimizing ComfyUI container:', error.message);
    }
  }

  /**
   * Get ComfyUI volumes - hybrid approach with persistent storage and local model management
   */
  getComfyUIVolumes() {
    const os = require('os');
    
    // Create persistent data directory for ComfyUI
    const comfyUIDataDir = path.join(os.homedir(), '.angela', 'comfyui-data');
    
    // Ensure directory exists
    if (!fs.existsSync(comfyUIDataDir)) {
      fs.mkdirSync(comfyUIDataDir, { recursive: true });
    }
    
    // Create subdirectories for different types of persistent data
    const subdirs = ['models', 'outputs', 'temp', 'custom_nodes', 'user', 'config'];
    subdirs.forEach(subdir => {
      const subdirPath = path.join(comfyUIDataDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
      
      // Create model type subdirectories
      if (subdir === 'models') {
        const modelTypes = ['checkpoints', 'loras', 'vae', 'controlnet', 'upscale_models', 'embeddings', 'clip_vision'];
        modelTypes.forEach(modelType => {
          const modelTypePath = path.join(subdirPath, modelType);
          if (!fs.existsSync(modelTypePath)) {
            fs.mkdirSync(modelTypePath, { recursive: true });
          }
        });
      }
    });
    
    console.log('🚀 ComfyUI persistent data directory:', comfyUIDataDir);
    console.log('📁 Models will be stored persistently and managed locally');
    
    // Mount persistent volumes for data that should survive container restarts
    return [
      // Persistent model storage - allows local downloads to be transferred
      `${path.join(comfyUIDataDir, 'models')}:/app/ComfyUI/models:rw`,
      
      // Output directory for generated images
      `${path.join(comfyUIDataDir, 'outputs')}:/app/ComfyUI/output:rw`,
      
      // Temp directory for processing
      `${path.join(comfyUIDataDir, 'temp')}:/app/ComfyUI/temp:rw`,
      
      // Custom nodes for extensions
      `${path.join(comfyUIDataDir, 'custom_nodes')}:/app/ComfyUI/custom_nodes:rw`,
      
      // User directory for personal settings
      `${path.join(comfyUIDataDir, 'user')}:/app/ComfyUI/user:rw`,
      
      // Config directory for ComfyUI settings
      `${path.join(comfyUIDataDir, 'config')}:/app/ComfyUI/config:rw`,
      
      // Legacy support for existing paths
      `${path.join(this.appDataPath, 'comfyui_input')}:/app/ComfyUI/input:rw`
    ];
  }

  /**
   * Enhanced Docker detection with comprehensive support for all Docker variants
   */
  async detectDockerInstallations() {
    const detectedInstallations = [];
    
    console.log('🔍 Starting comprehensive Docker detection...');
    
    // 1. Socket-based detection (existing + enhanced)
    const socketResults = await this.detectSocketBasedDocker();
    detectedInstallations.push(...socketResults);
    
    // 2. TCP/HTTP Docker detection
    const tcpResults = await this.detectTcpDocker();
    detectedInstallations.push(...tcpResults);
    
    // 3. Docker Context detection
    const contextResults = await this.detectDockerContexts();
    detectedInstallations.push(...contextResults);
    
    // 4. Docker Machine detection
    const machineResults = await this.detectDockerMachine();
    detectedInstallations.push(...machineResults);
    
    // 5. Alternative container runtimes (Podman, etc.)
    const alternativeResults = await this.detectAlternativeRuntimes();
    detectedInstallations.push(...alternativeResults);
    
    // 6. Process-based detection (fallback)
    const processResults = await this.detectDockerProcesses();
    detectedInstallations.push(...processResults);
    
    // Remove duplicates and sort by priority
    const uniqueInstallations = this.deduplicateAndPrioritize(detectedInstallations);
    
    console.log(`✅ Docker detection complete. Found ${uniqueInstallations.length} installation(s):`, 
                uniqueInstallations.map(i => `${i.type} (${i.method})`));
    
    return uniqueInstallations;
  }

  /**
   * Enhanced socket-based Docker detection
   */
  async detectSocketBasedDocker() {
    const results = [];
    
    // Comprehensive list of socket locations
    const socketLocations = [
      // Docker Desktop locations
      { path: path.join(os.homedir(), '.docker', 'desktop', 'docker.sock'), type: 'Docker Desktop', priority: 1 },
      { path: path.join(os.homedir(), '.docker', 'docker.sock'), type: 'Docker Desktop', priority: 2 },
      
      // Traditional Linux socket locations
      { path: '/var/run/docker.sock', type: 'Docker Engine', priority: 3 },
      { path: '/run/docker.sock', type: 'Docker Engine', priority: 4 },
      
      // WSL2 and Windows locations
      { path: '/mnt/wsl/docker-desktop/docker.sock', type: 'Docker Desktop (WSL2)', priority: 5 },
      { path: '/mnt/wsl/shared-docker/docker.sock', type: 'Docker (WSL2 Shared)', priority: 6 },
      { path: '/mnt/c/Users/Public/.docker/docker.sock', type: 'Docker (Windows Shared)', priority: 7 },
      
      // Alternative Docker implementations
      { path: path.join(os.homedir(), '.colima', 'docker.sock'), type: 'Colima', priority: 8 },
      { path: path.join(os.homedir(), '.colima', 'default', 'docker.sock'), type: 'Colima (Default)', priority: 9 },
      { path: path.join(os.homedir(), '.rd', 'docker.sock'), type: 'Rancher Desktop', priority: 10 },
      { path: path.join(os.homedir(), '.lima', 'docker', 'sock', 'docker.sock'), type: 'Lima Docker', priority: 11 },
      { path: path.join(os.homedir(), '.lima', 'default', 'sock', 'docker.sock'), type: 'Lima Docker (Default)', priority: 12 },
      
      // OrbStack (macOS Docker alternative)
      { path: path.join(os.homedir(), '.orbstack', 'run', 'docker.sock'), type: 'OrbStack', priority: 13 },
      
      // Snap Docker (Linux)
      { path: '/var/snap/docker/common/var-lib-docker.sock', type: 'Docker (Snap)', priority: 14 },
      { path: '/run/snap.docker.dockerd.socket', type: 'Docker (Snap)', priority: 15 },
      
      // Flatpak Docker (Linux)
      { path: path.join(os.homedir(), '.var', 'app', 'io.docker.Docker', 'docker.sock'), type: 'Docker (Flatpak)', priority: 16 },
      
      // Rootless Docker locations
      { path: path.join(os.homedir(), '.docker', 'run', 'docker.sock'), type: 'Docker (Rootless)', priority: 17 },
      { path: `/run/user/${process.getuid ? process.getuid() : '1000'}/docker.sock`, type: 'Docker (Rootless User)', priority: 18 },
      
      // Podman socket locations
      { path: path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock'), type: 'Podman', priority: 19 },
      { path: `/run/user/${process.getuid ? process.getuid() : '1000'}/podman/podman.sock`, type: 'Podman (User)', priority: 20 },
      { path: '/run/podman/podman.sock', type: 'Podman (System)', priority: 21 }
    ];

    // Windows named pipe
    if (process.platform === 'win32') {
      socketLocations.unshift({ 
        path: '//./pipe/docker_engine', 
        type: 'Docker Desktop (Windows)', 
        priority: 0,
        isNamedPipe: true 
      });
      
      // Additional Windows pipes
      socketLocations.push(
        { path: '//./pipe/podman-machine-default', type: 'Podman (Windows)', priority: 22, isNamedPipe: true },
        { path: '//./pipe/docker_wsl', type: 'Docker (WSL)', priority: 23, isNamedPipe: true }
      );
    }

    // Test each socket location
    for (const location of socketLocations) {
      try {
        let canConnect = false;
        
        if (location.isNamedPipe) {
          // For Windows named pipes, just try to create the client
          const testClient = new Docker({ socketPath: location.path });
          await testClient.ping();
          canConnect = true;
        } else {
          // For Unix sockets, check file existence first
          if (fs.existsSync(location.path)) {
            const testClient = new Docker({ socketPath: location.path });
            await testClient.ping();
            canConnect = true;
          }
        }
        
        if (canConnect) {
          results.push({
            type: location.type,
            method: 'socket',
            path: location.path,
            priority: location.priority,
            client: new Docker({ socketPath: location.path }),
            isNamedPipe: location.isNamedPipe || false
          });
          
          console.log(`✅ Found working ${location.type} at: ${location.path}`);
        }
      } catch (error) {
        // Silent fail for socket detection
        continue;
      }
    }

    return results;
  }

  /**
   * Detect TCP/HTTP Docker connections
   */
  async detectTcpDocker() {
    const results = [];
    const tcpHosts = [
      { host: 'localhost', port: 2375, tls: false, type: 'Docker (TCP)' },
      { host: 'localhost', port: 2376, tls: true, type: 'Docker (TLS)' },
      { host: '127.0.0.1', port: 2375, tls: false, type: 'Docker (TCP)' },
      { host: '127.0.0.1', port: 2376, tls: true, type: 'Docker (TLS)' }
    ];

    // Check environment variables for custom TCP hosts
    if (process.env.DOCKER_HOST && process.env.DOCKER_HOST.startsWith('tcp://')) {
      const url = new URL(process.env.DOCKER_HOST);
      tcpHosts.unshift({
        host: url.hostname,
        port: parseInt(url.port) || 2376,
        tls: process.env.DOCKER_TLS_VERIFY === '1',
        type: 'Docker (TCP from DOCKER_HOST)'
      });
    }

    for (const tcpHost of tcpHosts) {
      try {
        const dockerOptions = {
          host: tcpHost.host,
          port: tcpHost.port
        };

        if (tcpHost.tls) {
          dockerOptions.protocol = 'https';
          if (process.env.DOCKER_CERT_PATH) {
            dockerOptions.ca = fs.readFileSync(path.join(process.env.DOCKER_CERT_PATH, 'ca.pem'));
            dockerOptions.cert = fs.readFileSync(path.join(process.env.DOCKER_CERT_PATH, 'cert.pem'));
            dockerOptions.key = fs.readFileSync(path.join(process.env.DOCKER_CERT_PATH, 'key.pem'));
          }
        }

        const testClient = new Docker(dockerOptions);
        await testClient.ping();
        
        results.push({
          type: tcpHost.type,
          method: 'tcp',
          host: tcpHost.host,
          port: tcpHost.port,
          tls: tcpHost.tls,
          priority: 50,
          client: testClient
        });
        
        console.log(`✅ Found working ${tcpHost.type} at: ${tcpHost.host}:${tcpHost.port}`);
      } catch (error) {
        // Silent fail for TCP detection
        continue;
      }
    }

    return results;
  }

  /**
   * Detect Docker contexts
   */
  async detectDockerContexts() {
    const results = [];
    
    try {
      const { stdout } = await execAsync('docker context ls --format json', { timeout: 5000 });
      const contexts = stdout.trim().split('\n').map(line => JSON.parse(line));
      
      for (const context of contexts) {
        if (context.Current) {
          // This is the current context, try to use it
          try {
            const testClient = new Docker(); // Uses current context
            await testClient.ping();
            
            results.push({
              type: `Docker Context (${context.Name})`,
              method: 'context',
              contextName: context.Name,
              endpoint: context.DockerEndpoint,
              priority: 25,
              client: testClient
            });
            
            console.log(`✅ Found working Docker context: ${context.Name} (${context.DockerEndpoint})`);
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      // Docker CLI not available or contexts not supported
    }

    return results;
  }

  /**
   * Detect Docker Machine installations
   */
  async detectDockerMachine() {
    const results = [];
    
    try {
      const { stdout } = await execAsync('docker-machine ls --format "{{.Name}},{{.State}},{{.URL}}"', { timeout: 5000 });
      const machines = stdout.trim().split('\n').filter(Boolean);
      
      for (const machineInfo of machines) {
        const [name, state, url] = machineInfo.split(',');
        
        if (state === 'Running' && url) {
          try {
            const machineUrl = new URL(url);
            const dockerOptions = {
              host: machineUrl.hostname,
              port: parseInt(machineUrl.port) || 2376,
              protocol: 'https'
            };

            // Try to get machine environment
            const { stdout: envOutput } = await execAsync(`docker-machine env ${name}`, { timeout: 3000 });
            const certPath = envOutput.match(/DOCKER_CERT_PATH="([^"]+)"/)?.[1];
            
            if (certPath && fs.existsSync(certPath)) {
              dockerOptions.ca = fs.readFileSync(path.join(certPath, 'ca.pem'));
              dockerOptions.cert = fs.readFileSync(path.join(certPath, 'cert.pem'));
              dockerOptions.key = fs.readFileSync(path.join(certPath, 'key.pem'));
            }

            const testClient = new Docker(dockerOptions);
            await testClient.ping();
            
            results.push({
              type: `Docker Machine (${name})`,
              method: 'machine',
              machineName: name,
              url: url,
              priority: 30,
              client: testClient
            });
            
            console.log(`✅ Found working Docker Machine: ${name} (${url})`);
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      // Docker Machine not available
    }

    return results;
  }

  /**
   * Detect alternative container runtimes
   */
  async detectAlternativeRuntimes() {
    const results = [];
    
    // Test Podman compatibility
    try {
      const { stdout } = await execAsync('podman version --format json', { timeout: 3000 });
      const podmanInfo = JSON.parse(stdout);
      
      // Podman can be used as Docker replacement
      const podmanSockets = [
        path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock'),
        `/run/user/${process.getuid ? process.getuid() : '1000'}/podman/podman.sock`,
        '/run/podman/podman.sock'
      ];

      for (const socketPath of podmanSockets) {
        if (fs.existsSync(socketPath)) {
          try {
            const testClient = new Docker({ socketPath });
            await testClient.ping();
            
            results.push({
              type: `Podman v${podmanInfo.Client.Version}`,
              method: 'podman',
              path: socketPath,
              priority: 40,
              client: testClient,
              isPodman: true
            });
            
            console.log(`✅ Found working Podman at: ${socketPath}`);
            break; // Only add one Podman instance
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      // Podman not available
    }

    return results;
  }

  /**
   * Process-based Docker detection (fallback method)
   */
  async detectDockerProcesses() {
    const results = [];
    
    try {
      let psCommand;
      if (process.platform === 'win32') {
        psCommand = 'wmic process where "name=\'dockerd.exe\' or name=\'docker.exe\'" get ProcessId,CommandLine /format:csv';
      } else {
        psCommand = 'ps aux | grep -E "(dockerd|docker|podman)" | grep -v grep';
      }
      
      const { stdout } = await execAsync(psCommand, { timeout: 5000 });
      
      if (stdout.trim()) {
        // Found Docker processes, try default connection
        try {
          const testClient = new Docker();
          await testClient.ping();
          
          results.push({
            type: 'Docker (Process Detection)',
            method: 'process',
            priority: 60,
            client: testClient
          });
          
          console.log('✅ Found Docker via process detection');
        } catch (error) {
          // Process exists but can't connect
        }
      }
    } catch (error) {
      // Process detection failed
    }

    return results;
  }

  /**
   * Remove duplicates and prioritize Docker installations
   */
  deduplicateAndPrioritize(installations) {
    // Remove duplicates based on connection details
    const unique = installations.filter((installation, index, self) => {
      return index === self.findIndex(i => 
        i.path === installation.path && 
        i.host === installation.host && 
        i.port === installation.port
      );
    });

    // Sort by priority (lower number = higher priority)
    return unique.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the best Docker client from detected installations
   */
  async getBestDockerClient() {
    const installations = await this.detectDockerInstallations();
    
    if (installations.length === 0) {
      throw new Error('No Docker installations found');
    }

    // Return the highest priority (first) installation
    const best = installations[0];
    console.log(`🎯 Using ${best.type} via ${best.method}`);
    
    return {
      client: best.client,
      info: best
    };
  }

  /**
   * Get detailed Docker detection report for debugging
   */
  async getDockerDetectionReport() {
    try {
      const installations = await this.detectDockerInstallations();
      
      const report = {
        timestamp: new Date().toISOString(),
        platform: process.platform,
        architecture: os.arch(),
        systemArch: this.systemArch,
        totalFound: installations.length,
        installations: installations.map(install => ({
          type: install.type,
          method: install.method,
          priority: install.priority,
          path: install.path,
          host: install.host,
          port: install.port,
          contextName: install.contextName,
          machineName: install.machineName,
          isPodman: install.isPodman || false,
          isNamedPipe: install.isNamedPipe || false
        })),
        environment: {
          DOCKER_HOST: process.env.DOCKER_HOST || 'not set',
          DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY || 'not set',
          DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH || 'not set',
          DOCKER_MACHINE_NAME: process.env.DOCKER_MACHINE_NAME || 'not set'
        }
      };

      console.log('📊 Docker Detection Report:', JSON.stringify(report, null, 2));
      return report;
    } catch (error) {
      console.error('Failed to generate Docker detection report:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        platform: process.platform,
        architecture: os.arch()
      };
    }
  }

  /**
   * Test all detected Docker installations
   */
  async testAllDockerInstallations() {
    const installations = await this.detectDockerInstallations();
    const results = [];

    console.log(`🧪 Testing ${installations.length} Docker installation(s)...`);

    for (const installation of installations) {
      const testResult = {
        type: installation.type,
        method: installation.method,
        working: false,
        error: null,
        responseTime: null
      };

      try {
        const startTime = Date.now();
        await installation.client.ping();
        testResult.working = true;
        testResult.responseTime = Date.now() - startTime;
        console.log(`✅ ${installation.type} (${installation.method}): Working (${testResult.responseTime}ms)`);
      } catch (error) {
        testResult.error = error.message;
        console.log(`❌ ${installation.type} (${installation.method}): Failed - ${error.message}`);
      }

      results.push(testResult);
    }

    return results;
  }

  /**
   * Get system architecture and map to Docker platform
   */
  getSystemArchitecture() {
    const arch = os.arch();
    const platform = os.platform();
    
    console.log(`System info - Platform: ${platform}, Arch: ${arch}`);
    
    // Map Node.js arch to Docker platform
    const archMap = {
      'x64': 'amd64',
      'arm64': 'arm64',
      'arm': 'arm/v7',
      'ia32': '386'
    };
    
    const dockerArch = archMap[arch] || arch;
    
    // For Docker platform specification, use linux as the OS part
    // This works for Windows containers running Linux containers via WSL2
    return `linux/${dockerArch}`;
  }

  /**
   * Get just the Docker architecture without OS prefix
   */
  getDockerArchitecture() {
    const arch = os.arch();
    
    // Map Node.js arch to Docker arch
    const archMap = {
      'x64': 'amd64',
      'arm64': 'arm64',
      'arm': 'arm/v7',
      'ia32': '386'
    };
    
    return archMap[arch] || arch;
  }

  /**
   * Get architecture-specific image name
   */
  getArchSpecificImage(baseImage, tag) {
    // Special handling for angela-backend images which have architecture-specific tags
    if (baseImage === 'angela17verse/angela-backend') {
      const arch = os.arch();
      const platform = os.platform();
      
      console.log(`Getting angela-backend image for platform: ${platform}, arch: ${arch}`);
      
      // For ARM64 systems (Mac ARM64 and Linux ARM64), use the default tag without suffix
      if (arch === 'arm64') {
        const imageName = `${baseImage}:${tag}`;
        console.log(`Using ARM64 image: ${imageName}`);
        return imageName;
      }
      
      // For x64/AMD64 systems (Windows x64, Linux x64, Mac x64), use the -amd64 suffix
      if (arch === 'x64') {
        const imageName = `${baseImage}:${tag}-amd64`;
        console.log(`Using AMD64 image: ${imageName}`);
        return imageName;
      }
      
      // Fallback to AMD64 for other architectures (ia32, etc.)
      const imageName = `${baseImage}:${tag}-amd64`;
      console.log(`Using fallback AMD64 image for arch ${arch}: ${imageName}`);
      return imageName;
    }
    
    // For other images, use the original approach (multi-arch images)
    const imageName = `${baseImage}:${tag}`;
    console.log(`Using standard multi-arch image: ${imageName}`);
    return imageName;
  }

  /**
   * Check if container image has updates available
   */
  async checkForImageUpdates(imageName, statusCallback) {
    try {
      // Validate imageName parameter
      if (!imageName || typeof imageName !== 'string') {
        console.error('Invalid imageName provided to checkForImageUpdates:', imageName);
        return { 
          hasUpdate: false, 
          reason: 'Invalid image name provided', 
          imageName: imageName || 'undefined',
          error: 'Invalid image name'
        };
      }

      statusCallback(`Checking for updates to ${imageName}...`);
      
      // Get local image info
      let localImage = null;
      try {
        localImage = await this.docker.getImage(imageName).inspect();
      } catch (error) {
        if (error.statusCode === 404) {
          statusCallback(`${imageName} not found locally, will download...`);
          return { hasUpdate: true, reason: 'Image not found locally', imageName };
        }
        throw error;
      }

      // Pull latest image info without downloading
      return new Promise((resolve, reject) => {
        // Try with platform specification first
        this.docker.pull(imageName, { platform: this.systemArch }, (err, stream) => {
          if (err) {
            console.error('Error checking for updates with platform specification:', err);
            
            // If platform-specific check fails, try without platform specification
            console.log(`Retrying ${imageName} update check without platform specification...`);
            
            this.docker.pull(imageName, {}, (fallbackErr, fallbackStream) => {
              if (fallbackErr) {
                console.error('Error checking for updates (fallback):', fallbackErr);
                resolve({ hasUpdate: false, reason: 'Failed to check for updates', error: fallbackErr.message, imageName });
                return;
              }
              
              this.handleUpdateCheckStream(fallbackStream, imageName, statusCallback, resolve);
            });
            return;
          }

          this.handleUpdateCheckStream(stream, imageName, statusCallback, resolve);
        });
      });
    } catch (error) {
      console.error('Error checking for image updates:', error);
      return { 
        hasUpdate: false, 
        reason: 'Error checking for updates', 
        error: error.message,
        imageName: imageName || 'undefined'
      };
    }
  }

  /**
   * Handle the update check stream
   */
  handleUpdateCheckStream(stream, imageName, statusCallback, resolve) {
    let hasUpdate = false;
    let updateReason = '';
    let downloadingDetected = false;

    stream.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        try {
          const parsed = JSON.parse(line);
          
          // Check for various update indicators
          if (parsed.status) {
            if (parsed.status.includes('Image is up to date')) {
              hasUpdate = false;
              updateReason = 'Image is up to date';
            } else if (parsed.status.includes('Downloading') || 
                     parsed.status.includes('Extracting') ||
                     parsed.status.includes('Pulling fs layer')) {
              hasUpdate = true;
              downloadingDetected = true;
              updateReason = 'New version available';
            } else if (parsed.status.includes('Pull complete')) {
              if (downloadingDetected) {
                hasUpdate = true;
                updateReason = 'Update downloaded';
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
    });

    stream.on('end', () => {
      statusCallback(`Update check complete for ${imageName}`);
      resolve({ 
        hasUpdate, 
        reason: updateReason || 'No updates available',
        imageName 
      });
    });

    stream.on('error', (error) => {
      console.error('Stream error during update check:', error);
      resolve({ 
        hasUpdate: false, 
        reason: 'Error checking for updates', 
        error: error.message,
        imageName // Add imageName here to fix the undefined issue
      });
    });
  }

  /**
   * Automatically update containers without user prompts
   */
  async autoUpdateContainers(statusCallback) {
    try {
      console.log('🔍 Starting autoUpdateContainers...');
      statusCallback('Starting container update check...');
      
      // Check if we've already checked for updates recently (within the last hour)
      const lastUpdateCheckFile = path.join(this.appDataPath, 'last_update_check.json');
      const now = Date.now();
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
      
      let shouldCheckForUpdates = true;
      try {
        if (fs.existsSync(lastUpdateCheckFile)) {
          const lastCheck = JSON.parse(fs.readFileSync(lastUpdateCheckFile, 'utf8'));
          if (now - lastCheck.timestamp < oneHour) {
            console.log('⏭️ Skipping update check (checked recently)');
            statusCallback('Skipping update check (checked recently)');
            shouldCheckForUpdates = false;
          }
        }
      } catch (error) {
        console.log('Error reading last update check file:', error.message);
        // Continue with update check if we can't read the file
      }
      
      if (!shouldCheckForUpdates) {
        console.log('✅ autoUpdateContainers completed (skipped)');
        return true;
      }
      
      console.log('🔍 Checking for container updates...');
      statusCallback(`Checking for container updates (${this.systemArch})...`);
      
      // Check for updates for all containers in parallel
      const updateChecks = [];
      for (const [name, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (name === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container update check on ${process.platform} (not supported)`);
          continue;
        }
        
        console.log(`📦 Adding update check for ${name}: ${config.image}`);
        updateChecks.push(
          this.checkForImageUpdates(config.image, statusCallback)
            .then(result => {
              console.log(`✅ Update check completed for ${name}: hasUpdate=${result.hasUpdate}`);
              return { ...result, containerName: name };
            })
            .catch(error => {
              console.error(`❌ Update check failed for ${name}:`, error.message);
              return {
                hasUpdate: false,
                error: error.message,
                containerName: name,
                imageName: config.image
              };
            })
        );
      }

      console.log('⏳ Waiting for all update checks to complete...');
      const updateResults = await Promise.all(updateChecks);
      console.log('✅ All update checks completed');
      
      const updatesAvailable = updateResults.filter(result => result.hasUpdate);

      // Save the timestamp of this update check
      try {
        fs.writeFileSync(lastUpdateCheckFile, JSON.stringify({ timestamp: now }));
        console.log('📝 Saved update check timestamp');
      } catch (error) {
        console.log('Error saving last update check timestamp:', error.message);
      }

      if (updatesAvailable.length > 0) {
        console.log(`📥 Found ${updatesAvailable.length} container update(s) available`);
        statusCallback(`Found ${updatesAvailable.length} container update(s) available - updating automatically...`);
        
        // Update containers in parallel for faster startup
        const updatePromises = updatesAvailable.map(async (update) => {
          try {
            console.log(`📥 Starting update for ${update.imageName}...`);
            await this.pullImageWithProgress(update.imageName, statusCallback);
            console.log(`✅ Update completed for ${update.imageName}`);
            return { success: true, imageName: update.imageName };
          } catch (error) {
            console.error(`❌ Update failed for ${update.imageName}:`, error.message);
            statusCallback(`Failed to update ${update.imageName}: ${error.message}`, 'warning');
            return { success: false, imageName: update.imageName, error: error.message };
          }
        });

        console.log('⏳ Waiting for all updates to complete...');
        const updateResults = await Promise.all(updatePromises);
        console.log('✅ All updates completed');
        
        const successCount = updateResults.filter(r => r.success).length;
        const failCount = updateResults.filter(r => !r.success).length;
        
        if (successCount > 0) {
          console.log(`✅ Updated ${successCount} container(s) successfully`);
          statusCallback(`✓ Updated ${successCount} container(s) successfully`);
        }
        if (failCount > 0) {
          console.log(`⚠️ ${failCount} container(s) failed to update`);
          statusCallback(`⚠️ ${failCount} container(s) failed to update`, 'warning');
        }
      } else {
        console.log('✅ All containers are up to date');
        statusCallback('All containers are up to date');
      }

      console.log('✅ autoUpdateContainers completed successfully');
      return true;
    } catch (error) {
      console.error('❌ autoUpdateContainers failed:', error);
      statusCallback(`Update check failed: ${error.message}`, 'warning');
      return false;
    }
  }

  /**
   * Show update dialog and handle user choice
   */
  async showUpdateDialog(updateInfo, parentWindow = null) {
    const updatesAvailable = updateInfo.filter(info => info.hasUpdate);
    
    if (updatesAvailable.length === 0) {
      return { updateAll: false, updates: [] };
    }

    const updateList = updatesAvailable.map(info => 
      `• ${info.imageName}: ${info.reason}`
    ).join('\n');

    const dialogOptions = {
      type: 'question',
      buttons: ['Update Now', 'Skip Updates', 'Cancel'],
      defaultId: 0,
      title: 'Container Updates Available',
      message: `Updates are available for the following containers:\n\n${updateList}\n\nWould you like to update them now?`,
      detail: `Architecture: ${this.systemArch}\n\nUpdating will ensure you have the latest features and security fixes.`,
      alwaysOnTop: true,
      modal: true
    };

    // If a parent window is provided, show dialog relative to it, otherwise show as standalone dialog
    const response = parentWindow 
      ? await dialog.showMessageBox(parentWindow, dialogOptions)
      : await dialog.showMessageBox(dialogOptions);

    return {
      updateAll: response.response === 0,
      skip: response.response === 1,
      cancel: response.response === 2,
      updates: updatesAvailable
    };
  }

  /**
   * Pull image with progress tracking and architecture specification
   */
  async pullImageWithProgress(imageName, statusCallback) {
    return new Promise((resolve, reject) => {
      statusCallback(`Pulling ${imageName} for ${this.systemArch}...`);
      
      // Try pulling with platform specification first
      this.docker.pull(imageName, { platform: this.systemArch }, (err, stream) => {
        if (err) {
          console.error('Error pulling image with platform specification:', err);
          
          // If platform-specific pull fails, try without platform specification
          console.log(`Retrying ${imageName} pull without platform specification...`);
          statusCallback(`Retrying ${imageName} pull without platform specification...`);
          
          this.docker.pull(imageName, {}, (fallbackErr, fallbackStream) => {
            if (fallbackErr) {
              console.error('Error pulling image (fallback):', fallbackErr);
              
              // Special fallback for angela-backend images: try base image without -amd64 suffix
              if (imageName.includes('angela17verse/angela-backend') && imageName.includes('-amd64')) {
                const baseImageName = imageName.replace('-amd64', '');
                console.log(`Trying base angela-backend image: ${baseImageName}`);
                statusCallback(`Trying base angela-backend image: ${baseImageName}`);
                
                this.docker.pull(baseImageName, {}, (baseErr, baseStream) => {
                  if (baseErr) {
                    console.error('Error pulling base angela-backend image:', baseErr);
                    reject(baseErr);
                    return;
                  }
                  
                  this.handlePullStream(baseStream, baseImageName, statusCallback, resolve, reject);
                });
                return;
              }
              
              reject(fallbackErr);
              return;
            }
            
            this.handlePullStream(fallbackStream, imageName, statusCallback, resolve, reject);
          });
          return;
        }

        this.handlePullStream(stream, imageName, statusCallback, resolve, reject);
      });
    });
  }

  /**
   * Handle the Docker pull stream
   */
  handlePullStream(stream, imageName, statusCallback, resolve, reject) {
    let lastStatus = '';
    let progress = {};
    let isFirstTimePull = false;

    // Check if this is a first-time pull by looking at pull timestamps
    const timestamps = this.getPullTimestamps();
    const lastPull = timestamps[imageName] || 0;
    if (lastPull === 0) {
      isFirstTimePull = true;
    }

    // Show first-time setup message
    if (isFirstTimePull) {
      statusCallback(`🚀 First-time setup: Downloading AI services...`, 'info', { percentage: 0 });
      statusCallback(`This may take 5-15 minutes depending on your internet speed. angela is downloading essential AI components - please wait...`, 'info', { percentage: 5 });
    }

    stream.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        try {
          const parsed = JSON.parse(line);
          
          if (parsed.error) {
            console.error('Pull error:', parsed.error);
            reject(new Error(parsed.error));
            return;
          }

          if (parsed.status && parsed.status !== lastStatus) {
            lastStatus = parsed.status;
            
            // Track progress for different layers
            if (parsed.id && parsed.progressDetail) {
              progress[parsed.id] = parsed.progressDetail;
              
              // Calculate overall progress
              const layers = Object.values(progress);
              const totalCurrent = layers.reduce((sum, layer) => sum + (layer.current || 0), 0);
              const totalTotal = layers.reduce((sum, layer) => sum + (layer.total || 0), 0);
              
              if (totalTotal > 0) {
                const percentage = Math.round((totalCurrent / totalTotal) * 100);
                const progressMessage = isFirstTimePull 
                  ? `First-time download: ${imageName} (${percentage}%) - ${parsed.status}`
                  : `Pulling ${imageName}: ${parsed.status} (${percentage}%)`;
                statusCallback(progressMessage, 'info', { percentage });
              } else {
                const progressMessage = isFirstTimePull 
                  ? `First-time setup: ${imageName} - ${parsed.status}`
                  : `Pulling ${imageName}: ${parsed.status}`;
                statusCallback(progressMessage, 'info', { percentage: 10 });
              }
            } else {
              // Handle status messages without progress details
              let percentage = 10;
              if (parsed.status.includes('Downloading')) {
                percentage = 30;
              } else if (parsed.status.includes('Extracting')) {
                percentage = 70;
              } else if (parsed.status.includes('Pull complete')) {
                percentage = 90;
              }
              
              const progressMessage = isFirstTimePull 
                ? `First-time setup: ${imageName} - ${parsed.status}`
                : `Pulling ${imageName}: ${parsed.status}`;
              statusCallback(progressMessage, 'info', { percentage });
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
    });

    stream.on('end', () => {
      const successMessage = isFirstTimePull 
        ? `✓ First-time setup complete: ${imageName} downloaded successfully!`
        : `✓ Successfully pulled ${imageName}`;
      statusCallback(successMessage, 'success', { percentage: 100 });
      this.updatePullTimestamp(imageName);
      resolve();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      reject(error);
    });
  }

  async execAsync(command, timeout = 60000) {
    // Replace docker-compose with docker compose
    command = command
      .replace(/^docker-compose\s/, `"${this.dockerPath}" compose `)
      .replace(/^docker\s/, `"${this.dockerPath}" `);

    return new Promise((resolve, reject) => {
      exec(command, { 
        timeout, 
        env: { 
          ...process.env,
          PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        }
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async findAvailablePort(startPort, endPort = startPort + 100) {
    for (let port = startPort; port <= endPort; port++) {
      try {
        await this.execAsync(`lsof -i :${port}`);
      } catch (error) {
        // If lsof fails, it means the port is available
        return port;
      }
    }
    throw new Error(`No available ports found between ${startPort} and ${endPort}`);
  }

  async isPortInUse(port) {
    try {
      await this.execAsync(`lsof -i :${port}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  async findWorkingDockerSocket() {
    try {
      const { client, info } = await this.getBestDockerClient();
      
      // Return the socket path or connection info
      if (info.path) {
        return info.path;
      } else if (info.host && info.port) {
        return `tcp://${info.host}:${info.port}`;
      } else {
        // Fallback to default socket
        return process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
      }
    } catch (error) {
      console.error('Enhanced Docker detection failed:', error.message);
      
      // Fallback to original simple detection
      const possibleSockets = [
        // Docker Desktop locations
        path.join(os.homedir(), '.docker', 'desktop', 'docker.sock'),
        path.join(os.homedir(), '.docker', 'docker.sock'),
        // Traditional Linux socket locations
        '/var/run/docker.sock',
        '/run/docker.sock',
        // WSL2 socket location
        '/mnt/wsl/docker-desktop/docker.sock',
        // Colima socket location (for macOS/Linux)
        path.join(os.homedir(), '.colima', 'docker.sock'),
        // Rancher Desktop socket location
        path.join(os.homedir(), '.rd', 'docker.sock')
      ];

      // Windows pipe
      if (process.platform === 'win32') {
        return '//./pipe/docker_engine';
      }

      // Check environment variable first
      if (process.env.DOCKER_HOST) {
        const match = process.env.DOCKER_HOST.match(/unix:\/\/(.*)/);
        if (match && match[1]) {
          try {
            const docker = new Docker({ socketPath: match[1] });
            await docker.ping();
            console.log('Using Docker socket from DOCKER_HOST:', match[1]);
            return match[1];
          } catch (error) {
            console.log('DOCKER_HOST socket not working:', error.message);
          }
        }
      }

      // Try each socket location
      for (const socketPath of possibleSockets) {
        try {
          if (fs.existsSync(socketPath)) {
            const docker = new Docker({ socketPath });
            await docker.ping();
            console.log('Found working Docker socket at:', socketPath);
            return socketPath;
          }
        } catch (error) {
          console.log('Socket not working at:', socketPath, error.message);
          continue;
        }
      }

      throw new Error('No working Docker socket found');
    }
  }

  initializeDockerClient() {
    try {
      // Try enhanced detection first (but don't await since this is sync)
      // We'll use the enhanced detection in isDockerRunning() instead
      
      // For Windows, always use the named pipe as default
      if (process.platform === 'win32') {
        return new Docker({ socketPath: '//./pipe/docker_engine' });
      }

      // For other platforms, try to find a working socket synchronously
      const socketPaths = [
        process.env.DOCKER_HOST ? process.env.DOCKER_HOST.replace('unix://', '') : null,
        path.join(os.homedir(), '.docker', 'desktop', 'docker.sock'),
        path.join(os.homedir(), '.docker', 'docker.sock'),
        '/var/run/docker.sock',
        '/run/docker.sock',
        '/mnt/wsl/docker-desktop/docker.sock',
        path.join(os.homedir(), '.colima', 'docker.sock'),
        path.join(os.homedir(), '.rd', 'docker.sock'),
        // Additional enhanced locations
        path.join(os.homedir(), '.colima', 'default', 'docker.sock'),
        path.join(os.homedir(), '.lima', 'docker', 'sock', 'docker.sock'),
        path.join(os.homedir(), '.lima', 'default', 'sock', 'docker.sock'),
        path.join(os.homedir(), '.orbstack', 'run', 'docker.sock'),
        path.join(os.homedir(), '.docker', 'run', 'docker.sock')
      ].filter(Boolean);

      for (const socketPath of socketPaths) {
        if (fs.existsSync(socketPath)) {
          try {
            return new Docker({ socketPath });
          } catch (error) {
            console.log(`Failed to initialize Docker with socket ${socketPath}:`, error.message);
          }
        }
      }

      // If no socket works, fall back to default
      return new Docker({ socketPath: '/var/run/docker.sock' });
    } catch (error) {
      console.error('Error initializing Docker client:', error);
      // Return a default client - the isDockerRunning check will handle the error case
      return new Docker({ socketPath: '/var/run/docker.sock' });
    }
  }

  async isDockerRunning() {
    try {
      // If current client isn't working, try to find a working socket
      try {
        await this.docker.ping();
        return true;
      } catch (error) {
        console.log('Current Docker client not working, trying enhanced detection...');
        
        // Use enhanced detection to find the best Docker client
        try {
          const { client, info } = await this.getBestDockerClient();
          this.docker = client;
          await this.docker.ping();
          console.log(`✅ Successfully connected to ${info.type} via ${info.method}`);
          return true;
        } catch (enhancedError) {
          console.log('Enhanced detection failed, trying fallback method...');
          
          // Fallback to original socket detection
          const workingSocket = await this.findWorkingDockerSocket();
          this.docker = new Docker({ socketPath: workingSocket });
          await this.docker.ping();
          return true;
        }
      }
    } catch (error) {
      console.error('Docker is not running or not accessible:', error.message);
      return false;
    }
  }

  async createNetwork() {
    try {
      // First check if the network already exists
      const networks = await this.docker.listNetworks();
      const networkExists = networks.some(network => network.Name === 'angela_network');
      
      if (networkExists) {
        console.log('Network angela_network already exists, skipping creation');
        return;
      }
      
      // Create the network if it doesn't exist
      try {
        console.log('Creating angela_network...');
        await this.docker.createNetwork({
          Name: 'angela_network',
          Driver: 'bridge',
          Attachable: true,
          Internal: false,
          Scope: 'local'
        });
        console.log('Successfully created angela_network');
      } catch (error) {
        // Special handling for conflict error (network created between our check and creation)
        if (error.statusCode === 409) {
          console.log('Network already exists (409 error), continuing...');
          return;
        }
        
        // Log details for other errors to help troubleshooting
        console.error('Error creating network:', error.message);
        console.error('Error details:', error);
        
        // For Mac-specific issues, provide more guidance
        if (process.platform === 'darwin') {
          console.log('On macOS, make sure Docker Desktop is running and properly configured');
          console.log('Try restarting Docker Desktop if issues persist');
        }
        
        // For Windows-specific issues
        if (process.platform === 'win32') {
          console.log('On Windows, ensure Docker Desktop is running and WSL2 backend is enabled');
          console.log('Try restarting Docker Desktop if issues persist');
        }
        
        throw new Error(`Failed to create network: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in createNetwork:', error.message);
      // Re-throw the error so the caller can handle it appropriately
      throw error;
    }
  }

  async createDockerVolumes() {
    try {
      console.log('Creating Docker volumes for persistent storage...');
      
      // Get list of existing volumes
      const volumes = await this.docker.listVolumes();
      const existingVolumeNames = volumes.Volumes ? volumes.Volumes.map(vol => vol.Name) : [];
      
      // Collect all volume names from all containers that specify them
      const volumesToCreate = [];
      for (const [serviceName, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (serviceName === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI volume creation on ${process.platform} (not supported)`);
          continue;
        }
        
        if (config.volumeNames) {
          for (const volumeName of config.volumeNames) {
            if (!existingVolumeNames.includes(volumeName)) {
              volumesToCreate.push({
                name: volumeName,
                service: serviceName
              });
            }
          }
        }
      }
      
      // Create volumes that don't exist
      for (const volumeInfo of volumesToCreate) {
        try {
          await this.docker.createVolume({
            Name: volumeInfo.name,
            Driver: 'local',
            Labels: {
              'angela.service': volumeInfo.service,
              'angela.managed': 'true'
            }
          });
          console.log(`✓ Created Docker volume: ${volumeInfo.name} for ${volumeInfo.service}`);
        } catch (error) {
          // Handle conflict error (volume created between our check and creation)
          if (error.statusCode === 409) {
            console.log(`Volume ${volumeInfo.name} already exists, continuing...`);
          } else {
            console.error(`Error creating volume ${volumeInfo.name}:`, error.message);
            // Don't throw here, continue with other volumes
          }
        }
      }
      
      if (volumesToCreate.length === 0) {
        console.log('All required Docker volumes already exist');
      }
      
    } catch (error) {
      console.error('Error in createDockerVolumes:', error.message);
      // Don't throw here to allow the application to continue
      // Containers will still work with the bind mounts if volumes fail
    }
  }

  async pullImage(imageName, statusCallback) {
    // Use the new architecture-aware pull method
    return this.pullImageWithProgress(imageName, statusCallback);
  }

  async startContainer(config) {
    try {
      // Validate config parameter
      if (!config) {
        throw new Error('Container configuration is required but was not provided');
      }
      
      if (!config.name) {
        throw new Error('Container configuration is missing required "name" property');
      }
      
      if (!config.image) {
        throw new Error(`Container configuration for "${config.name}" is missing required "image" property`);
      }

      // First, verify Docker daemon is responsive
      try {
        if (config.statusCallback) {
          config.statusCallback('Verifying Docker daemon...', 'info', { percentage: 0 });
        }
        await this.docker.ping();
      } catch (pingError) {
        throw new Error(`Docker daemon is not responsive: ${pingError.message}. Please ensure Docker Desktop is running.`);
      }

      // Check if container exists and is running
      try {
        const existingContainer = await this.docker.getContainer(config.name);
        const containerInfo = await existingContainer.inspect();
        
        if (containerInfo.State.Running) {
          console.log(`Container ${config.name} is already running, checking health...`);
          
          // Check if the running container is healthy
          const isHealthy = await config.healthCheck();
          if (isHealthy) {
            console.log(`Container ${config.name} is running and healthy, skipping recreation`);
            return;
          }
          
          console.log(`Container ${config.name} is running but not healthy, will recreate`);
          await existingContainer.stop();
          await existingContainer.remove({ force: true });
        } else {
          console.log(`Container ${config.name} exists but is not running, will recreate`);
          await existingContainer.remove({ force: true });
        }
      } catch (error) {
        if (error.statusCode !== 404) {
          console.error(`Error checking container ${config.name}:`, error);
        } else {
          console.log(`No existing container ${config.name}, will create new one`);
        }
      }

      // First ensure we have the image
      try {
        await this.docker.getImage(config.image).inspect();
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(`Image ${config.image} not found locally, pulling for ${this.systemArch}...`);
          
          // Use the statusCallback if provided, otherwise fallback to console.log
          const statusCallback = config.statusCallback || ((status) => console.log(status));
          await this.pullImageWithProgress(config.image, statusCallback);
        } else {
          throw error;
        }
      }

      // Ensure the angela network exists before creating the container
      try {
        console.log('Ensuring angela_network exists...');
        
        // Send progress update if callback is available
        if (config.statusCallback) {
          config.statusCallback('Setting up container network...', 'info', { percentage: 0 });
        }
        
        await this.createNetwork();
        
        if (config.statusCallback) {
          config.statusCallback('Network setup complete', 'success', { percentage: 10 });
        }
      } catch (networkError) {
        console.error('Failed to create/verify network:', networkError);
        if (config.statusCallback) {
          config.statusCallback('Network setup failed, attempting to continue...', 'warning', { percentage: 5 });
        }
        // Don't throw immediately - try to continue as the network might exist
        console.log('Attempting to continue despite network setup issues...');
      }

      console.log(`Creating container ${config.name} with port mapping ${config.internalPort} -> ${config.port}`);
      
      // Check for GPU availability if this container requests GPU runtime
      let useGPURuntime = false;
      if (config.runtime === 'nvidia') {
        useGPURuntime = await this.detectNvidiaGPU();
        if (useGPURuntime) {
          console.log(`🚀 GPU support enabled for ${config.name}`);
        } else {
          console.log(`⚠️  GPU requested but not available for ${config.name}, falling back to CPU`);
        }
      }
      
      // Create and start container
      let networkMode = 'angela_network';
      
      // Check if angela_network actually exists before using it
      try {
        const networks = await this.docker.listNetworks();
        const networkExists = networks.some(network => network.Name === 'angela_network');
        if (!networkExists) {
          console.warn('angela_network not found, falling back to bridge network');
          networkMode = 'bridge';
          if (config.statusCallback) {
            config.statusCallback('Using default bridge network (some features may be limited)', 'warning', { percentage: 15 });
          }
        }
      } catch (error) {
        console.warn('Failed to check network status, using bridge network:', error.message);
        networkMode = 'bridge';
      }

      const containerConfig = {
        Image: config.image,
        name: config.name,
        ExposedPorts: {
          [`${config.internalPort}/tcp`]: {}
        },
        HostConfig: {
          PortBindings: {
            [`${config.internalPort}/tcp`]: [{ HostPort: config.port.toString() }]
          },
          Binds: config.volumes,
          NetworkMode: networkMode,
          // Add GPU runtime support if available
          ...(useGPURuntime && { Runtime: 'nvidia' }),
          // Add restart policy if specified
          ...(config.restartPolicy && { RestartPolicy: { Name: config.restartPolicy } }),
          // Add GPU device access for NVIDIA runtime
          ...(useGPURuntime && {
            DeviceRequests: [{
              Driver: 'nvidia',
              Count: -1, // All GPUs
              Capabilities: [['gpu']]
            }]
          })
        },
        Env: [
          'PYTHONUNBUFFERED=1',
          'OLLAMA_BASE_URL=http://angela_ollama:11434',
          // Add any environment variables from the container config
          ...(config.environment || []),
          // Add GPU-specific environment variables if GPU is available
          ...(useGPURuntime ? [
            'NVIDIA_VISIBLE_DEVICES=all',
            'NVIDIA_DRIVER_CAPABILITIES=compute,utility'
          ] : [])
        ]
      };

      try {
        if (config.statusCallback) {
          config.statusCallback(`Creating container ${config.name}...`, 'info', { percentage: 20 });
        }
        
        const newContainer = await this.docker.createContainer(containerConfig);
        console.log(`Container ${config.name} created, starting...`);
        
        if (config.statusCallback) {
          config.statusCallback(`Starting container ${config.name}...`, 'info', { percentage: 30 });
        }
        
        await newContainer.start();
        console.log(`Container ${config.name} started, waiting for health check...`);
        
        if (config.statusCallback) {
          config.statusCallback(`Container started, performing health checks...`, 'info', { percentage: 40 });
        }
      } catch (containerError) {
        console.error(`Failed to create/start container ${config.name}:`, containerError);
        
        // Provide more specific error messages
        if (containerError.message.includes('network')) {
          throw new Error(`Network error: ${containerError.message}. Try restarting Docker Desktop.`);
        } else if (containerError.message.includes('port')) {
          throw new Error(`Port binding error: ${containerError.message}. Port ${config.port} may be in use.`);
        } else {
          throw new Error(`Container creation failed: ${containerError.message}`);
        }
      }

      // Initial delay to give the container time to fully start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Wait for health check
      let healthy = false;
      const maxHealthChecks = 5;
      for (let i = 0; i < maxHealthChecks; i++) {
        console.log(`Health check attempt ${i + 1} for ${config.name}...`);
        
        if (config.statusCallback) {
          const healthProgress = 40 + (i / maxHealthChecks) * 50; // Progress from 40% to 90%
          config.statusCallback(`Health check ${i + 1}/${maxHealthChecks} for ${config.name}...`, 'info', { percentage: Math.round(healthProgress) });
        }
        
        try {
          healthy = await config.healthCheck();
          console.log(`Health check result for ${config.name}: ${healthy}`);
          if (healthy) {
            if (config.statusCallback) {
              config.statusCallback(`${config.name} is healthy and ready!`, 'success', { percentage: 100 });
            }
            break;
          }
        } catch (error) {
          console.error(`Health check error for ${config.name}:`, error);
        }
        // Increased delay between attempts to 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!healthy) {
        // Get container logs to help diagnose the issue
        const container = await this.docker.getContainer(config.name);
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 50
        });
        console.error(`Container logs for ${config.name}:`, logs.toString());
        throw new Error(`Container ${config.name} failed health check after 5 attempts`);
      }

      // Run optimization for ComfyUI container after it's healthy
      if (config.name === 'angela_comfyui' && useGPURuntime) {
        console.log('🚀 Running GPU optimizations for ComfyUI...');
        // Run optimization in background to not block startup
        setTimeout(() => {
          this.optimizeComfyUIContainer().catch(error => {
            console.error('Optimization failed:', error.message);
          });
        }, 10000); // Wait 10 seconds after health check
      }
    } catch (error) {
      console.error(`Error starting ${config.name}:`, error);
      throw error;
    }
  }

  async initializePullTimestamps() {
    try {
      if (!fs.existsSync(this.pullTimestampsPath)) {
        const initialTimestamps = {};
        Object.keys(this.containers).forEach(key => {
          initialTimestamps[this.containers[key].image] = 0;
        });
        fs.writeFileSync(this.pullTimestampsPath, JSON.stringify(initialTimestamps, null, 2));
      }
    } catch (error) {
      console.error('Error initializing pull timestamps:', error);
    }
  }

  getPullTimestamps() {
    try {
      if (fs.existsSync(this.pullTimestampsPath)) {
        return JSON.parse(fs.readFileSync(this.pullTimestampsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error reading pull timestamps:', error);
    }
    return {};
  }

  updatePullTimestamp(imageName) {
    try {
      const timestamps = this.getPullTimestamps();
      timestamps[imageName] = Date.now();
      fs.writeFileSync(this.pullTimestampsPath, JSON.stringify(timestamps, null, 2));
    } catch (error) {
      console.error('Error updating pull timestamp:', error);
    }
  }

  async checkImageUpdate(imageName) {
    try {
      // First try to inspect the local image
      try {
        await this.docker.getImage(imageName).inspect();
      } catch (error) {
        // If image doesn't exist locally, we need to pull it
        if (error.statusCode === 404) {
          return true;
        }
      }

      // Try to pull the image to check for updates
      return new Promise((resolve, reject) => {
        this.docker.pull(imageName, (err, stream) => {
          if (err) {
            // If we can't pull, but have local image, use local
            if (err.statusCode === 404) {
              resolve(false);
              return;
            }
            reject(err);
            return;
          }

          let needsUpdate = false;
          
          stream.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
              try {
                const parsed = JSON.parse(line);
                // Check for "up to date" message
                if (parsed.status && parsed.status.includes('up to date')) {
                  needsUpdate = false;
                }
                // Check for "downloading" or "extracting" which indicates an update
                if (parsed.status && (parsed.status.includes('Downloading') || parsed.status.includes('Extracting'))) {
                  needsUpdate = true;
                }
              } catch (e) {
                // Ignore parse errors
              }
            });
          });

          stream.on('end', () => {
            resolve(needsUpdate);
          });

          stream.on('error', (error) => {
            console.error('Stream error during pull:', error);
            resolve(true); // If we can't determine, assume update needed
          });
        });
      });
    } catch (error) {
      console.error('Error checking image update:', error);
      return true; // If we can't determine, assume update needed
    }
  }

  shouldPullImage(imageName, forceCheck = false) {
    try {
      if (forceCheck) {
        return this.checkImageUpdate(imageName);
      }

      const timestamps = this.getPullTimestamps();
      const lastPull = timestamps[imageName] || 0;
      const daysSinceLastPull = (Date.now() - lastPull) / (1000 * 60 * 60 * 24);
      return daysSinceLastPull >= 10;
    } catch (error) {
      console.error('Error checking pull timestamp:', error);
      return true; // Pull if there's an error reading timestamps
    }
  }

  /**
   * Wrapper function with timeout to prevent indefinite hangs
   */
  async withTimeout(promise, timeoutMs, operationName) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Enhanced setup with timeout protection and better error handling
   */
  async setup(selectedFeatures, statusCallback) {
    const setupStartTime = Date.now();
    console.log('🚀 Starting Docker setup with timeout protection...');
    
    try {
      // Set overall timeout for setup (10 minutes)
      return await this.withTimeout(
        this.performSetup(selectedFeatures, statusCallback),
        10 * 60 * 1000, // 10 minutes
        'Docker Setup'
      );
    } catch (error) {
      const setupDuration = ((Date.now() - setupStartTime) / 1000).toFixed(2);
      console.error(`❌ Docker setup failed after ${setupDuration}s:`, error);
      
      if (error.message.includes('timed out')) {
        statusCallback(`Setup timed out after ${setupDuration}s. This may indicate a network or Docker issue.`, 'error');
        
        // Provide recovery suggestions
        statusCallback('💡 Try restarting Docker Desktop and angela, or check your internet connection.', 'info');
        
        // Attempt graceful cleanup
        try {
          console.log('🧹 Attempting cleanup after timeout...');
          await this.cleanupAfterTimeout();
        } catch (cleanupError) {
          console.error('Cleanup after timeout failed:', cleanupError);
        }
      } else {
        statusCallback(`Setup failed: ${error.message}`, 'error');
      }
      
      return false;
    }
  }

  /**
   * Cleanup operations after a timeout
   */
  async cleanupAfterTimeout() {
    try {
      // Stop any partially started containers
      for (const [name, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (name === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container cleanup on ${process.platform} (not supported)`);
          continue;
        }
        
        try {
          const container = await this.docker.getContainer(config.name);
          const containerInfo = await container.inspect();
          if (containerInfo.State.Running) {
            console.log(`🛑 Stopping partially started container: ${config.name}`);
            await container.stop({ t: 10 }); // 10 second graceful stop
          }
        } catch (error) {
          // Ignore errors during cleanup
          console.log(`Cleanup: Could not stop ${config.name}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error during timeout cleanup:', error);
    }
  }

  /**
   * Main setup logic (extracted to allow timeout wrapping)
   */
  async performSetup(selectedFeatures, statusCallback) {
    try {
      if (!await this.isDockerRunning()) {
        let dockerDownloadLink;
        let installMessage;
        switch (process.platform) {
          case 'darwin':
            dockerDownloadLink = 'https://desktop.docker.com/mac/main/arm64/Docker.dmg';
            installMessage = 'download Docker Desktop';
            break;
          case 'win32':
            dockerDownloadLink = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe';
            installMessage = 'download Docker Desktop';
            break;
          case 'linux':
          default:
            dockerDownloadLink = 'https://docs.docker.com/engine/install/';
            installMessage = 'install Docker Engine';
            break;
        }
        const errorMessage = `Docker is not running. Please ${installMessage} for better experience with workflows and automation.\n\nDownload from: ${dockerDownloadLink}`;
        statusCallback(errorMessage, 'warning');
        
        // Return false but don't throw error - let the app continue without Docker
        return false;
      }

      // Get user's feature selections from global scope - conservative defaults during onboarding
      const selectedFeatures = global.selectedFeatures || {
        comfyUI: false,   // Conservative default - only start if explicitly selected
        n8n: false,       // Conservative default - only start if explicitly selected  
        ragAndTts: false, // Conservative default - prevent unwanted Python backend downloads
        angelaCore: true   // Always enable core functionality
      };

      statusCallback('Creating Docker network...');
      await this.createNetwork();

      statusCallback('Creating Docker volumes for persistent storage...');
      await this.createDockerVolumes();

      // Check if Ollama is running on the system (no container management)
      const ollamaRunning = await this.checkOllamaAvailability();
      if (ollamaRunning) {
        statusCallback('✓ Ollama detected and available at http://localhost:11434', 'success');
      } else {
        statusCallback('⚠️ Ollama not detected. Please install Ollama manually if you want local AI models. Visit: https://ollama.com', 'warning');
      }

      // Check if this is first-time setup
      const timestamps = this.getPullTimestamps();
      const isFirstTimeSetup = Object.values(timestamps).every(timestamp => timestamp === 0);
      
      if (isFirstTimeSetup) {
        statusCallback(`🎉 Welcome to angela! Setting up your AI environment for the first time...`, 'info', { percentage: 5 });
        statusCallback(`This initial setup will download several AI services (may require 1-3 GB). Subsequent startups will be much faster!`, 'info', { percentage: 10 });
      }

      // Automatically check for and install container updates
      console.log('🔄 Calling autoUpdateContainers...');
      await this.autoUpdateContainers(statusCallback);
      console.log('✅ autoUpdateContainers completed, continuing with setup...');

      // Filter containers based on user selections
      console.log('🔍 Filtering containers based on user selections...');
      const enabledContainers = {};
      for (const [name, config] of Object.entries(this.containers)) {
        let shouldEnable = false;
        
        switch (name) {
          case 'python':
            // Python backend only if user selected TTS/RAG features
            // During onboarding, respect user's explicit choice to prevent unwanted downloads
            shouldEnable = selectedFeatures.ragAndTts || false;
            if (!shouldEnable) {
              console.log(`⏭️ Python backend disabled (TTS/RAG not selected by user)`);
              statusCallback(`⏭️ Python backend disabled (TTS/RAG not selected by user)`, 'info');
            }
            break;
          case 'n8n':
            // N8N only if user selected it
            shouldEnable = selectedFeatures.n8n;
            break;
          case 'comfyui':
            // ComfyUI only if user selected it AND platform supports it (Windows only)
            shouldEnable = selectedFeatures.comfyUI && process.platform === 'win32';
            if (selectedFeatures.comfyUI && process.platform !== 'win32') {
              console.log(`⚠️ ComfyUI is not supported on ${process.platform} - requires Windows with NVIDIA GPU`);
              statusCallback(`⚠️ ComfyUI is not supported on ${process.platform} - requires Windows with NVIDIA GPU`, 'warning');
            }
            break;
          default:
            // Unknown services disabled by default
            shouldEnable = false;
            break;
        }
        
        if (shouldEnable) {
          enabledContainers[name] = config;
          console.log(`✓ ${name} service enabled (selected by user)`);
          statusCallback(`✓ ${name} service enabled (selected by user)`);
        } else {
          console.log(`⏭️ ${name} service disabled (not selected by user)`);
          statusCallback(`⏭️ ${name} service disabled (not selected by user)`, 'info');
        }
      }
      console.log(`📦 Enabled containers: ${Object.keys(enabledContainers).join(', ')}`);

      // Resolve actual available image names and ensure all images are available locally
      console.log('🔍 Resolving container images...');
      const resolvedContainers = {};
      for (const [name, config] of Object.entries(enabledContainers)) {
        console.log(`🔍 Resolving image for ${name}...`);
        
        // Check if image is already architecture-specific (has -amd64 or -arm64 suffix)
        const isAlreadyArchSpecific = config.image.includes('-amd64') || config.image.includes('-arm64');
        
        let resolvedImageName;
        if (isAlreadyArchSpecific) {
          // Image is already architecture-specific, use as-is
          resolvedImageName = config.image;
          console.log(`✓ Using architecture-specific ${name} image: ${resolvedImageName}`);
          statusCallback(`Using architecture-specific ${name} image: ${resolvedImageName}`);
        } else {
          // Parse base image and tag and resolve the actual available image name
          const [baseImage, tag] = config.image.split(':');
          console.log(`🔍 Resolving ${name} image from base: ${baseImage}:${tag || 'latest'}`);
          statusCallback(`Resolving ${name} image...`);
          resolvedImageName = await this.resolveImageName(baseImage, tag || 'latest');
          console.log(`✓ Resolved ${name} image: ${resolvedImageName}`);
        }
        
        // Create updated config with resolved image name
        resolvedContainers[name] = {
          ...config,
          image: resolvedImageName
        };
        
        console.log(`🔍 Checking if ${name} image is available locally...`);
        try {
          await this.docker.getImage(resolvedImageName).inspect();
          console.log(`✓ ${name} image ready (${resolvedImageName})`);
          statusCallback(`✓ ${name} image ready (${resolvedImageName})`);
        } catch (error) {
          if (error.statusCode === 404) {
            console.log(`📥 ${name} image not found locally, downloading...`);
            statusCallback(`Downloading ${name} image (${resolvedImageName})...`);
            await this.pullImageWithProgress(resolvedImageName, statusCallback);
            console.log(`✅ ${name} image downloaded successfully`);
          } else {
            console.error(`❌ Error checking ${name} image:`, error);
            throw error;
          }
        }
      }

      // Update containers configuration with resolved image names
      console.log('📝 Updating containers configuration...');
      this.containers = resolvedContainers;
      console.log(`✅ Container configuration updated with ${Object.keys(resolvedContainers).length} containers`);

      // Start containers in sequence
      console.log('🚀 Starting containers...');
      for (const [name, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (name === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container startup on ${process.platform} (not supported)`);
          continue;
        }
        
        console.log(`🚀 Starting ${name} service...`);
        statusCallback(`Starting ${name} service...`);
        
        try {
          await this.startContainer(config);
          console.log(`✅ ${name} service started successfully`);
          statusCallback(`✅ ${name} service started successfully`);
        } catch (error) {
          console.error(`❌ Failed to start ${name} service:`, error);
          statusCallback(`❌ Failed to start ${name} service: ${error.message}`, 'error');
          throw error;
        }
      }

      console.log('✅ All services started successfully');
      statusCallback('All services started successfully');
      return true;
    } catch (error) {
      statusCallback(`Setup failed: ${error.message}`, 'error');
      // Return false instead of throwing to allow app to continue
      return false;
    }
  }

  async stop() {
    try {
      for (const [name, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (name === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container stop on ${process.platform} (not supported)`);
          continue;
        }
        
        try {
          const container = await this.docker.getContainer(config.name);
          await container.stop();
          await container.remove();
        } catch (error) {
          // Ignore errors if container doesn't exist
        }
      }

      // Clean up network
      try {
        const network = await this.docker.getNetwork('angela_network');
        await network.remove();
      } catch (error) {
        // Ignore network removal errors
      }
    } catch (error) {
      console.error('Error stopping services:', error);
      throw error;
    }
  }

  async cleanupDockerVolumes() {
    try {
      console.log('Cleaning up angela-managed Docker volumes...');
      
      // Get list of existing volumes
      const volumes = await this.docker.listVolumes();
      if (!volumes.Volumes) {
        console.log('No volumes to clean up');
        return;
      }
      
      // Find angela-managed volumes
      const angelaVolumes = volumes.Volumes.filter(vol => 
        vol.Labels && vol.Labels['angela.managed'] === 'true'
      );
      
      // Remove angela-managed volumes
      for (const volume of angelaVolumes) {
        try {
          const dockerVolume = this.docker.getVolume(volume.Name);
          await dockerVolume.remove();
          console.log(`✓ Removed Docker volume: ${volume.Name}`);
        } catch (error) {
          console.error(`Error removing volume ${volume.Name}:`, error.message);
          // Don't throw here, continue with other volumes
        }
      }
      
      if (angelaVolumes.length === 0) {
        console.log('No angela-managed volumes found to clean up');
      }
      
    } catch (error) {
      console.error('Error in cleanupDockerVolumes:', error.message);
      // Don't throw here to allow the application to continue
    }
  }

  async isPythonRunning() {
    try {
      if (!this.ports.python) {
        console.log('Python port not set');
        return false;
      }

      console.log(`Checking Python health at http://localhost:${this.ports.python}/health`);
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${this.ports.python}/health`, (res) => {
          console.log(`Python health check status code: ${res.statusCode}`);
          
          if (res.statusCode === 200) {
            let data = '';
            res.on('data', chunk => {
              data += chunk;
            });
            res.on('end', () => {
              console.log('Python health check response:', data);
              try {
                const jsonResponse = JSON.parse(data);
                const isHealthy = jsonResponse.status === 'healthy' || jsonResponse.status === 'ok';
                console.log(`Python health parsed result: ${isHealthy}`);
                resolve(isHealthy);
              } catch (e) {
                console.error('Failed to parse health check JSON:', e);
                resolve(false);
              }
            });
          } else {
            reject(new Error(`Python health check failed with status ${res.statusCode}`));
          }
        });

        req.on('error', (error) => {
          console.error('Python health check request error:', error);
          resolve(false);
        });

        req.setTimeout(5000, () => {
          console.error('Python health check timeout');
          req.destroy();
          resolve(false);
        });
      });

      return response;
    } catch (error) {
      console.error('Python health check error:', error);
      return false;
    }
  }

  async checkN8NHealth() {
    try {
      const response = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${this.ports.n8n}/healthz`, (res) => {
          if (res.statusCode === 200) {
            resolve({ success: true });
          } else {
            reject(new Error(`N8N health check failed with status ${res.statusCode}`));
          }
        }).on('error', (error) => reject(error));
      });
      return response;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkOllamaAvailability() {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:11434/api/tags', (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
        
        req.on('error', () => resolve(false));
        
        // Add timeout to avoid hanging
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
      
      return response;
    } catch (error) {
      return false;
    }
  }

  /**
   * Manual update check that can be called from the main process
   */
  async checkForUpdates(statusCallback) {
    try {
      if (!await this.isDockerRunning()) {
        throw new Error('Docker is not running');
      }

      statusCallback(`Checking for container updates (${this.systemArch})...`);
      const updateChecks = [];
      
      for (const [name, config] of Object.entries(this.containers)) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (name === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container update check on ${process.platform} (not supported)`);
          continue;
        }
        
        updateChecks.push(
          this.checkForImageUpdates(config.image, statusCallback)
            .then(result => ({ ...result, containerName: name }))
        );
      }

      const updateResults = await Promise.all(updateChecks);
      const updatesAvailable = updateResults.filter(result => result.hasUpdate);

      return {
        updatesAvailable: updatesAvailable.length > 0,
        updates: updateResults,
        architecture: this.systemArch
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      throw error;
    }
  }

  /**
   * Update specific containers
   */
  async updateContainers(containerNames, statusCallback) {
    try {
      if (!await this.isDockerRunning()) {
        throw new Error('Docker is not running');
      }

      const containersToUpdate = containerNames || Object.keys(this.containers);
      const results = [];

      for (const containerName of containersToUpdate) {
        // Skip ComfyUI container on macOS and Linux as it's not supported
        if (containerName === 'comfyui' && (process.platform === 'darwin' || process.platform === 'linux')) {
          console.log(`⏭️ Skipping ComfyUI container update on ${process.platform} (not supported)`);
          results.push({
            container: containerName,
            success: false,
            error: `ComfyUI is not supported on ${process.platform}`
          });
          continue;
        }
        
        const config = this.containers[containerName];
        if (!config) {
          results.push({
            container: containerName,
            success: false,
            error: 'Container not found'
          });
          continue;
        }

        try {
          statusCallback(`Updating ${containerName}...`);
          
          // Stop and remove existing container
          try {
            const existingContainer = await this.docker.getContainer(config.name);
            const containerInfo = await existingContainer.inspect();
            
            if (containerInfo.State.Running) {
              await existingContainer.stop();
            }
            await existingContainer.remove({ force: true });
            statusCallback(`Stopped and removed old ${containerName} container`);
          } catch (error) {
            // Container might not exist, which is fine
            if (error.statusCode !== 404) {
              console.warn(`Warning removing old container ${config.name}:`, error.message);
            }
          }

          // Pull latest image
          await this.pullImageWithProgress(config.image, statusCallback);
          
          // Start new container
          await this.startContainer(config);
          
          results.push({
            container: containerName,
            success: true,
            message: `Successfully updated ${containerName}`
          });
          
          statusCallback(`✓ ${containerName} updated successfully`);
        } catch (error) {
          results.push({
            container: containerName,
            success: false,
            error: error.message
          });
          statusCallback(`✗ Failed to update ${containerName}: ${error.message}`, 'error');
        }
      }

      return results;
    } catch (error) {
      console.error('Error updating containers:', error);
      throw error;
    }
  }

  async isComfyUIRunning() {
    try {
      if (!this.ports.comfyui) {
        console.log('ComfyUI port not set');
        return false;
      }

      console.log(`Checking ComfyUI health at http://localhost:${this.ports.comfyui}/`);
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${this.ports.comfyui}/`, (res) => {
          console.log(`ComfyUI health check status code: ${res.statusCode}`);
          
          // ComfyUI returns 200 for the main page when running
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        });

        req.on('error', (error) => {
          console.error('ComfyUI health check request error:', error);
          resolve(false);
        });

        req.setTimeout(5000, () => {
          console.error('ComfyUI health check timeout');
          req.destroy();
          resolve(false);
        });
      });

      return response;
    } catch (error) {
      console.error('ComfyUI health check error:', error);
      return false;
    }
  }

  /**
   * Resolve the actual available image name by testing different variants
   */
  async resolveImageName(baseImage, tag) {
    // For angela-backend, we need to test which variant is actually available
    if (baseImage === 'angela17verse/angela-backend') {
      const arch = os.arch();
      
      // List of image variants to try in order of preference
      const imageVariants = [];
      
      if (arch === 'arm64') {
        // For ARM64, prefer base image first, then amd64 as fallback
        imageVariants.push(`${baseImage}:${tag}`);
        imageVariants.push(`${baseImage}:${tag}-amd64`);
      } else {
        // For x64/AMD64, prefer amd64 image first, then base as fallback
        imageVariants.push(`${baseImage}:${tag}-amd64`);
        imageVariants.push(`${baseImage}:${tag}`);
      }
      
      // Test each variant to see which one exists
      for (const imageName of imageVariants) {
        try {
          console.log(`Testing availability of image: ${imageName}`);
          
          // Try to inspect the image locally first
          try {
            await this.docker.getImage(imageName).inspect();
            console.log(`Found local image: ${imageName}`);
            return imageName;
          } catch (localError) {
            // Image not local, try to pull manifest to check if it exists remotely
            const manifestExists = await this.checkImageManifest(imageName);
            if (manifestExists) {
              console.log(`Remote image available: ${imageName}`);
              return imageName;
            }
          }
        } catch (error) {
          console.log(`Image not available: ${imageName} - ${error.message}`);
          continue;
        }
      }
      
      // If no specific variant works, return the original preference
      const fallbackImage = arch === 'arm64' ? `${baseImage}:${tag}` : `${baseImage}:${tag}-amd64`;
      console.log(`No variants found, using fallback: ${fallbackImage}`);
      return fallbackImage;
    }
    
    // For other images, return as-is
    return `${baseImage}:${tag}`;
  }

  /**
   * Check if an image manifest exists without pulling the full image
   */
  async checkImageManifest(imageName) {
    return new Promise((resolve) => {
      // Use a quick pull with dry-run-like behavior
      this.docker.pull(imageName, {}, (err, stream) => {
        if (err) {
          resolve(false);
          return;
        }

        let manifestFound = false;
        
        stream.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          lines.forEach(line => {
            try {
              const parsed = JSON.parse(line);
              // If we get any valid status, the manifest exists
              if (parsed.status && !parsed.error) {
                manifestFound = true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          });
        });

        stream.on('end', () => {
          resolve(manifestFound);
        });

        stream.on('error', () => {
          resolve(false);
        });

        // Stop the stream early since we just want to check manifest
        setTimeout(() => {
          try {
            stream.destroy();
          } catch (e) {
            // Ignore destroy errors
          }
          resolve(manifestFound);
        }, 5000);
      });
    });
  }
}

module.exports = DockerSetup; 
