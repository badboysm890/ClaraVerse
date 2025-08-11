const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const log = require('electron-log');
const { app } = require('electron');
const PlatformManager = require('./platformManager.cjs');

class LlamaSwapService {
  constructor(ipcLogger = null) {
    this.process = null;
    this.isRunning = false;
    this.isStarting = false; // Add this flag to prevent concurrent starts
    this.startingTimestamp = null; // Track when startup began
    this.currentStartupPhase = null; // Track current startup phase for user feedback
    this.port = 8091;
    this.ipcLogger = ipcLogger; // Add IPC logger reference
    
    // Flash attention retry mechanism flags
    this.handleFlashAttentionRequired = false;
    this.flashAttentionRetryAttempted = false;
    this.forceFlashAttention = false;
    
    // Port cleanup retry mechanism flags
    this.needsPortRetry = false;
    this.portRetryAttempted = false;
    
    // Progress tracking for UI feedback
    this.progressCallback = null;
    
    // Custom model paths
    this.customModelPaths = [];
    
    // Handle different base directory paths for development vs production
    this.baseDir = this.getBaseBinaryDirectory();
    this.modelsDir = path.join(os.homedir(), '.clara', 'llama-models');
    
    // Use userData directory for config files to avoid read-only filesystem issues in AppImage
    const userDataDir = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.clara');
    this.configPath = path.join(userDataDir, 'llama-swap-config.yaml');
    this.logPath = path.join(userDataDir, 'llama-swap.log');
    
    // Settings directory for storing performance settings and individual model configurations
    this.settingsDir = path.join(os.homedir(), '.clara', 'settings');
    
    log.info(`Base binary directory: ${this.baseDir}`);
    log.info(`Models directory: ${this.modelsDir}`);
    log.info(`Config path: ${this.configPath}`);
    log.info(`Log path: ${this.logPath}`);
    
    // Initialize platform manager
    this.platformManager = new PlatformManager(this.baseDir);
    this.platformInfo = this.platformManager.platformInfo;
    this.platformBinDir = this.platformManager.getPlatformLibraryDirectory();
    
    // Get platform-specific binary paths with fallback support
    this.binaryPaths = this.getBinaryPathsWithFallback();
    
    log.info(`Platform detected: ${this.platformInfo.platform}-${this.platformInfo.arch}`);
    log.info(`Using platform directory: ${this.platformInfo.platformDir}`);
    log.info(`Binary paths:`, this.binaryPaths);
    
    // Initialize GPU info cache
    this.gpuInfo = null;
    this.systemMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    
    // Ensure models directory exists
    this.ensureDirectories();
    
    // Initialize custom model paths from saved settings
    this.initializeCustomModelPaths();
    
    if (this.ipcLogger) {
      this.ipcLogger.logServiceCall('LlamaSwapService', 'constructor', null, 'initialized');
    }
  }

  /**
   * Get the correct base directory for binaries in both development and production
   */
  getBaseBinaryDirectory() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // Development mode - use electron directory
      return path.join(__dirname, 'llamacpp-binaries');
    } else {
      // Production mode - check multiple possible locations
      const possiblePaths = [
        // Standard Electron app structure
        process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'llamacpp-binaries') : null,
        // Alternative app structure
        app && app.getAppPath ? path.join(app.getAppPath(), 'electron', 'llamacpp-binaries') : null,
        // Fallback to current directory structure
        path.join(__dirname, 'llamacpp-binaries')
      ].filter(Boolean); // Remove null entries
      
      for (const possiblePath of possiblePaths) {
        log.info(`Checking binary path: ${possiblePath}`);
        if (fsSync.existsSync(possiblePath)) {
          log.info(`Found binaries at: ${possiblePath}`);
          return possiblePath;
        }
      }
      
      // If none found, create in app data directory and log error
      const fallbackPath = app && app.getPath 
        ? path.join(app.getPath('userData'), 'llamacpp-binaries')
        : path.join(__dirname, 'llamacpp-binaries'); // Final fallback for non-Electron environments
      log.error(`No binary directory found! Checked paths:`, possiblePaths);
      log.error(`Using fallback path: ${fallbackPath}`);
      return fallbackPath;
    }
  }

  /**
   * Get binary paths with fallback to legacy locations for backward compatibility
   */
  getBinaryPathsWithFallback() {
    try {
      // FIRST: Check for official llama-swap binary
      const officialLlamaSwapPath = this.getOfficialLlamaSwapPath();
      if (fsSync.existsSync(officialLlamaSwapPath)) {
        log.info(`✅ Using official llama-swap binary: ${officialLlamaSwapPath}`);
        
        // Still need llama-server from platform-specific location
        const platformPaths = this.platformManager.isCurrentPlatformSupported() 
          ? this.platformManager.getBinaryPaths()
          : this.getLegacyBinaryPaths();
          
        return {
          llamaSwap: officialLlamaSwapPath,
          llamaServer: platformPaths.llamaServer
        };
      }
      
      // FALLBACK: Try to get platform-specific paths
      if (this.platformManager.isCurrentPlatformSupported()) {
        return this.platformManager.getBinaryPaths();
      }
    } catch (error) {
      log.warn('Failed to get platform-specific binary paths, falling back to legacy detection:', error.message);
    }

    // FINAL FALLBACK: Legacy behavior
    return this.getLegacyBinaryPaths();
  }

  /**
   * Legacy binary path detection for backward compatibility
   */
  getLegacyBinaryPaths() {
    const platform = os.platform();
    const arch = os.arch();
    
    let platformDir;
    let binaryNames;
    
    // NEW: Check for backend override first (synchronous check for constructor)
    try {
      const overridePath = path.join(os.homedir(), '.clara', 'settings', 'backend-override.json');
      if (fsSync.existsSync(overridePath)) {
        const overrideData = JSON.parse(fsSync.readFileSync(overridePath, 'utf8'));
        if (overrideData.backendId && overrideData.backendId !== 'auto') {
          const availableBackends = this.getAvailableBackends();
          if (availableBackends.success) {
            const targetBackend = availableBackends.backends.find(b => b.id === overrideData.backendId);
            if (targetBackend && targetBackend.isAvailable && targetBackend.folder !== 'auto') {
              log.info(`🔧 Applying backend override: ${targetBackend.name} (${overrideData.backendId})`);
              platformDir = targetBackend.folder;
            }
          }
        }
      }
    } catch (overrideError) {
      log.debug('Error checking backend override during legacy detection:', overrideError.message);
    }
    
    // If no override or override failed, use normal platform detection
    if (!platformDir) {
      switch (platform) {
        case 'darwin':
          platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
          binaryNames = {
            llamaSwap: 'llama-swap-darwin',
            llamaServer: 'llama-server'
          };
          break;
        case 'linux':
          // Detect GPU and choose best platform directory
          platformDir = this.detectLinuxGPUPlatform();
          binaryNames = {
            llamaSwap: 'llama-swap-linux',
            llamaServer: 'llama-server'
          };
          break;
        case 'win32':
          // Detect GPU and choose best platform directory
          platformDir = this.detectWindowsGPUPlatform();
          binaryNames = {
            llamaSwap: 'llama-swap-win32-x64.exe',
            llamaServer: 'llama-server.exe'
          };
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}-${arch}`);
      }
    }
    
    // Set binary names based on the final platform directory (important for overrides)
    if (!binaryNames) {
      if (platformDir.includes('win32')) {
        binaryNames = {
          llamaSwap: 'llama-swap-win32-x64.exe',
          llamaServer: 'llama-server.exe'
        };
      } else if (platformDir.includes('darwin')) {
        binaryNames = {
          llamaSwap: 'llama-swap-darwin',
          llamaServer: 'llama-server'
        };
      } else {
        binaryNames = {
          llamaSwap: 'llama-swap-linux',
          llamaServer: 'llama-server'
        };
      }
    }
    
    const platformPath = path.join(this.baseDir, platformDir);
    
    // For llama-swap, try multiple possible names in order of preference
    const llamaSwapCandidates = platform === 'win32' 
      ? ['llama-swap-win32-x64.exe', 'llama-swap.exe']
      : platform === 'darwin'
      ? ['llama-swap-darwin', 'llama-swap']
      : ['llama-swap-linux', 'llama-swap'];
    
    let llamaSwapPath = null;
    for (const candidate of llamaSwapCandidates) {
      const candidatePath = path.join(platformPath, candidate);
      if (fsSync.existsSync(candidatePath)) {
        llamaSwapPath = candidatePath;
        log.info(`Found llama-swap binary: ${candidate}`);
        break;
      }
    }
    
    // Fallback to the expected name if no candidates found
    if (!llamaSwapPath) {
      llamaSwapPath = path.join(platformPath, binaryNames.llamaSwap);
      log.warn(`No llama-swap binary found in candidates, using expected path: ${binaryNames.llamaSwap}`);
    }
    
    return {
      llamaSwap: llamaSwapPath,
      llamaServer: path.join(platformPath, binaryNames.llamaServer)
    };
  }

  /**
   * Detect Windows GPU and return appropriate platform directory
   */
  detectWindowsGPUPlatform() {
    const { spawnSync } = require('child_process');
    
    // Try GPU-specific folders in priority order
    const gpuFolders = ['win32-x64-cuda', 'win32-x64-rocm', 'win32-x64-vulkan', 'win32-x64-cpu'];
    
    try {
      // Check for NVIDIA GPU (CUDA)
      const nvidiaSmi = spawnSync('nvidia-smi', ['--query-gpu=count', '--format=csv,noheader'], { 
        encoding: 'utf8', 
        timeout: 3000 
      });
      
      if (nvidiaSmi.status === 0 && nvidiaSmi.stdout && parseInt(nvidiaSmi.stdout.trim()) > 0) {
        const gpuCount = parseInt(nvidiaSmi.stdout.trim());
        log.info(`🎮 Detected ${gpuCount} NVIDIA GPU(s) - using CUDA binaries`);
        
        // Check if cuda folder exists
        if (fsSync.existsSync(path.join(this.baseDir, 'win32-x64-cuda'))) {
          return 'win32-x64-cuda';
        } else {
          log.warn('CUDA folder not found, will try other options');
        }
      }
    } catch (error) {
      log.debug('NVIDIA detection failed:', error.message);
    }

    try {
      // Check for AMD GPU (ROCm) via WMI
      const wmic = spawnSync('wmic', [
        'path', 'win32_VideoController', 
        'get', 'name', '/format:csv'
      ], { encoding: 'utf8', timeout: 3000 });
      
      if (wmic.status === 0 && wmic.stdout) {
        const gpuInfo = wmic.stdout.toLowerCase();
        if (gpuInfo.includes('amd') || gpuInfo.includes('radeon')) {
          log.info('🎮 Detected AMD GPU - using ROCm binaries');
          
          // Check if rocm folder exists
          if (fsSync.existsSync(path.join(this.baseDir, 'win32-x64-rocm'))) {
            return 'win32-x64-rocm';
          } else {
            log.warn('ROCm folder not found, will try other options');
          }
        }
      }
    } catch (error) {
      log.debug('AMD detection failed:', error.message);
    }

    // Check for Vulkan support (Intel/other GPUs)
    try {
      const vulkanInfo = spawnSync('vulkaninfo', ['--summary'], { 
        encoding: 'utf8', 
        timeout: 3000 
      });
      
      if (vulkanInfo.status === 0) {
        log.info('🎮 Detected Vulkan support - using Vulkan binaries');
        
        // Check if vulkan folder exists
        if (fsSync.existsSync(path.join(this.baseDir, 'win32-x64-vulkan'))) {
          return 'win32-x64-vulkan';
        } else {
          log.warn('Vulkan folder not found, will try other options');
        }
      }
    } catch (error) {
      log.debug('Vulkan detection failed:', error.message);
    }

    // Try each GPU folder in order, fallback to CPU
    for (const folder of gpuFolders) {
      if (fsSync.existsSync(path.join(this.baseDir, folder))) {
        log.info(`🎮 Using available GPU platform: ${folder}`);
        return folder;
      }
    }

    // Check if we should auto-setup GPU folders
    this.checkAndSetupGPUFolders();

    // Final fallback to original folder
    log.info('🎮 No GPU-specific folders found, using standard win32-x64');
    return 'win32-x64';
  }

  /**
   * Detect Linux GPU and return appropriate platform directory
   */
  detectLinuxGPUPlatform() {
    const { spawnSync } = require('child_process');
    
    // Try GPU-specific folders in priority order
    const gpuFolders = ['linux-x64-vulkan', 'linux-x64-cpu', 'linux-x64'];
    
    // Check for Vulkan support (primary GPU acceleration on Linux)
    try {
      const vulkanInfo = spawnSync('vulkaninfo', ['--summary'], { 
        encoding: 'utf8', 
        timeout: 3000 
      });
      
      if (vulkanInfo.status === 0) {
        log.info('🎮 Detected Vulkan support - using Vulkan binaries');
        
        // Check if vulkan folder exists
        if (fsSync.existsSync(path.join(this.baseDir, 'linux-x64-vulkan'))) {
          return 'linux-x64-vulkan';
        } else {
          log.warn('Vulkan folder not found, will try other options');
        }
      }
    } catch (error) {
      log.debug('Vulkan detection failed:', error.message);
    }

    // Alternative Vulkan detection via vkcube or vulkan-utils
    try {
      const vkcube = spawnSync('vkcube', ['--c', '1'], { 
        encoding: 'utf8', 
        timeout: 2000 
      });
      
      // vkcube returns 0 if Vulkan is working
      if (vkcube.status === 0) {
        log.info('🎮 Detected Vulkan support via vkcube - using Vulkan binaries');
        
        // Check if vulkan folder exists
        if (fsSync.existsSync(path.join(this.baseDir, 'linux-x64-vulkan'))) {
          return 'linux-x64-vulkan';
        }
      }
    } catch (error) {
      log.debug('vkcube Vulkan detection failed:', error.message);
    }

    // Try each GPU folder in order, fallback to CPU
    for (const folder of gpuFolders) {
      if (fsSync.existsSync(path.join(this.baseDir, folder))) {
        log.info(`🎮 Using available GPU platform: ${folder}`);
        return folder;
      }
    }

    // Check if we should auto-setup GPU folders
    this.checkAndSetupLinuxGPUFolders();

    // Final fallback to original folder
    log.info('🎮 No GPU-specific folders found, using standard linux-x64');
    return 'linux-x64';
  }

  /**
   * Check if GPU folders exist and offer to set them up automatically
   */
  checkAndSetupGPUFolders() {
    if (os.platform() !== 'win32') {
      return;
    }

    const gpuFolders = ['win32-x64-cuda', 'win32-x64-rocm', 'win32-x64-vulkan', 'win32-x64-cpu'];
    const existingFolders = gpuFolders.filter(folder => 
      fsSync.existsSync(path.join(this.baseDir, folder))
    );

    if (existingFolders.length === 0) {
      log.info('🚀 No GPU-specific folders found. Consider running setupGPUSpecificBinaries() to auto-download them.');
      
      // Only auto-setup in background if service is not currently starting
      if (!this.isStarting && !this.isRunning) {
        log.info('🔄 Scheduling background GPU folder setup...');
        
        // Auto-setup in background (non-blocking)
        setTimeout(() => {
          // Double-check we're still not starting/running before proceeding
          if (!this.isStarting && !this.isRunning) {
            log.info('🚀 Starting background GPU binary setup...');
            this.setupGPUSpecificBinaries().then(result => {
              if (result.success) {
                log.info('✅ GPU-specific folders have been automatically set up in background!');
                log.info('🔄 Next service start will use optimized GPU binaries.');
              } else {
                log.warn('⚠️ Background GPU folder setup failed:', result.error || result.message);
              }
            }).catch(error => {
              log.warn('⚠️ Background GPU setup failed:', error.message);
            });
          } else {
            log.info('🔄 Skipping background GPU setup - service is starting/running');
          }
        }, 5000); // Wait 5 seconds before starting background setup
      } else {
        log.info('🔄 Service is starting/running - skipping background GPU setup');
      }
    } else {
      log.info(`🎮 Found ${existingFolders.length} existing GPU folders: ${existingFolders.join(', ')}`);
    }
  }

  /**
   * Create GPU-specific folders and download binaries automatically
   */
  async setupGPUSpecificBinaries() {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return this.setupWindowsGPUSpecificBinaries();
    } else if (platform === 'linux') {
      return this.setupLinuxGPUSpecificBinaries();
    } else {
      log.info(`GPU-specific binary setup is not available for ${platform}`);
      return { success: false, message: `Only supported on Windows and Linux, detected: ${platform}` };
    }
  }

  /**
   * Create Windows GPU-specific folders and download binaries automatically
   */
  async setupWindowsGPUSpecificBinaries() {

    try {
      log.info('🚀 Setting up GPU-specific binary folders...');
      
      // Create all GPU-specific folders
      const gpuFolders = ['win32-x64-cuda', 'win32-x64-rocm', 'win32-x64-vulkan', 'win32-x64-cpu'];
      
      for (const folder of gpuFolders) {
        const folderPath = path.join(this.baseDir, folder);
        await fs.mkdir(folderPath, { recursive: true });
        log.info(`📁 Created folder: ${folder}`);
      }

      // Download and extract binaries for each GPU type (with timeout protection)
      log.info('⬇️ Starting GPU binary downloads...');
      const downloadPromise = this.downloadGPUBinaries(gpuFolders);
      const results = await Promise.race([
        downloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GPU binary download timeout after 5 minutes')), 300000)
        )
      ]);
      
      log.info('✅ GPU-specific binary setup completed');
      return { success: true, results };
      
    } catch (error) {
      log.error('❌ Failed to setup GPU-specific binaries:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if Linux GPU folders exist and offer to set them up automatically
   */
  checkAndSetupLinuxGPUFolders() {
    if (os.platform() !== 'linux') {
      return;
    }

    const gpuFolders = ['linux-x64-vulkan', 'linux-x64-cpu'];
    const existingFolders = gpuFolders.filter(folder => 
      fsSync.existsSync(path.join(this.baseDir, folder))
    );

    if (existingFolders.length === 0) {
      log.info('🚀 No Linux GPU-specific folders found. Consider running setupLinuxGPUSpecificBinaries() to auto-download them.');
      
      // Only auto-setup in background if service is not currently starting
      if (!this.isStarting && !this.isRunning) {
        log.info('🔄 Scheduling background Linux GPU folder setup...');
        
        // Auto-setup in background (non-blocking)
        setTimeout(() => {
          // Double-check we're still not starting/running before proceeding
          if (!this.isStarting && !this.isRunning) {
            log.info('🚀 Starting background Linux GPU binary setup...');
            this.setupLinuxGPUSpecificBinaries().then(result => {
              if (result.success) {
                log.info('✅ Linux GPU-specific folders have been automatically set up in background!');
                log.info('🔄 Next service start will use optimized GPU binaries.');
              } else {
                log.warn('⚠️ Background Linux GPU folder setup failed:', result.error || result.message);
              }
            }).catch(error => {
              log.warn('⚠️ Background Linux GPU setup failed:', error.message);
            });
          } else {
            log.info('🔄 Skipping background Linux GPU setup - service is starting/running');
          }
        }, 5000); // Wait 5 seconds before starting background setup
      } else {
        log.info('🔄 Service is starting/running - skipping background Linux GPU setup');
      }
    } else {
      log.info(`🎮 Found ${existingFolders.length} existing Linux GPU folders: ${existingFolders.join(', ')}`);
    }
  }

  /**
   * Create Linux GPU-specific folders and download binaries automatically
   */
  async setupLinuxGPUSpecificBinaries() {
    if (os.platform() !== 'linux') {
      log.info('Linux GPU-specific binary setup is only available for Linux');
      return { success: false, message: 'Only supported on Linux' };
    }

    try {
      log.info('🚀 Setting up Linux GPU-specific binary folders...');
      
      // Create Linux GPU-specific folders
      const gpuFolders = ['linux-x64-vulkan', 'linux-x64-cpu'];
      
      for (const folder of gpuFolders) {
        const folderPath = path.join(this.baseDir, folder);
        await fs.mkdir(folderPath, { recursive: true });
        log.info(`📁 Created folder: ${folder}`);
      }

      // Download and extract binaries for each GPU type (with timeout protection)
      log.info('⬇️ Starting Linux GPU binary downloads...');
      const downloadPromise = this.downloadLinuxGPUBinaries(gpuFolders);
      const results = await Promise.race([
        downloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Linux GPU binary download timeout after 5 minutes')), 300000)
        )
      ]);
      
      log.info('✅ Linux GPU-specific binary setup completed');
      return { success: true, results };
      
    } catch (error) {
      log.error('❌ Failed to setup Linux GPU-specific binaries:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download GPU-specific binaries from llama.cpp releases
   */
  async downloadGPUBinaries(gpuFolders) {
    const results = {};
    
    // Get latest llama.cpp release info
    const releaseInfo = await this.getLatestLlamaCppRelease();
    if (!releaseInfo) {
      throw new Error('Could not fetch latest llama.cpp release information');
    }

    log.info(`📦 Found llama.cpp release: ${releaseInfo.version}`);

    for (const folder of gpuFolders) {
      try {
        if (folder === 'win32-x64-cuda') {
          // CUDA requires both main binaries and runtime libraries
          log.info(`⬇️ Setting up CUDA binaries (dual download required)...`);
          const cudaSuccess = await this.setupCudaBinaries(releaseInfo, folder);
          
          if (cudaSuccess) {
            results[folder] = { success: true, method: 'cuda_dual_download' };
          } else {
            log.warn(`⚠️ CUDA setup failed, copying from base folder`);
            await this.copyBinariesFromBase(folder);
            results[folder] = { success: true, method: 'copied_from_base' };
          }
        } else {
          // Standard single download for other GPU types
          const downloadUrl = this.findAssetUrl(releaseInfo.assets, this.getGPUTypeFromFolder(folder), 'win32');
          
          if (!downloadUrl) {
            log.warn(`⚠️ No download URL found for ${folder}, copying from base folder`);
            await this.copyBinariesFromBase(folder);
            results[folder] = { success: true, method: 'copied_from_base' };
            continue;
          }

          log.info(`⬇️ Downloading binaries for ${folder}...`);
          const success = await this.downloadAndExtractBinaries(downloadUrl, folder);
          
          if (success) {
            results[folder] = { success: true, method: 'downloaded', url: downloadUrl };
          } else {
            log.warn(`⚠️ Download failed for ${folder}, copying from base folder`);
            await this.copyBinariesFromBase(folder);
            results[folder] = { success: true, method: 'copied_from_base' };
          }
        }
        
      } catch (error) {
        log.error(`❌ Failed to setup ${folder}:`, error.message);
        results[folder] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Download Linux GPU-specific binaries from llama.cpp releases
   */
  async downloadLinuxGPUBinaries(gpuFolders) {
    const results = {};
    
    // Get latest llama.cpp release info
    const releaseInfo = await this.getLatestLlamaCppRelease();
    if (!releaseInfo) {
      throw new Error('Could not fetch latest llama.cpp release information');
    }

    log.info(`📦 Found llama.cpp release: ${releaseInfo.version}`);

    for (const folder of gpuFolders) {
      try {
        const gpuType = this.getGPUTypeFromFolder(folder);
        const downloadUrl = this.findLinuxAssetUrl(releaseInfo.assets, gpuType);
        
        if (!downloadUrl) {
          log.warn(`⚠️ No download URL found for Linux ${folder}, copying from base folder`);
          await this.copyLinuxBinariesFromBase(folder);
          results[folder] = { success: true, method: 'copied_from_base' };
          continue;
        }

        log.info(`⬇️ Downloading Linux binaries for ${folder}...`);
        const success = await this.downloadAndExtractBinaries(downloadUrl, folder);
        
        if (success) {
          results[folder] = { success: true, method: 'downloaded', url: downloadUrl };
        } else {
          log.warn(`⚠️ Download failed for Linux ${folder}, copying from base folder`);
          await this.copyLinuxBinariesFromBase(folder);
          results[folder] = { success: true, method: 'copied_from_base' };
        }
        
      } catch (error) {
        log.error(`❌ Failed to setup Linux ${folder}:`, error.message);
        results[folder] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Setup CUDA binaries with dual download (main binaries + runtime libraries)
   */
  async setupCudaBinaries(releaseInfo, targetFolder) {
    try {
      // Find both CUDA assets
      const mainBinariesUrl = this.findCudaAsset(releaseInfo.assets, 'main');
      const runtimeLibsUrl = this.findCudaAsset(releaseInfo.assets, 'cudart');
      
      if (!mainBinariesUrl) {
        log.error('❌ Could not find main CUDA binaries asset');
        return false;
      }
      
      if (!runtimeLibsUrl) {
        log.error('❌ Could not find CUDA runtime libraries asset');
        return false;
      }
      
      log.info(`🎯 Found CUDA main binaries: ${mainBinariesUrl.split('/').pop()}`);
      log.info(`🎯 Found CUDA runtime libraries: ${runtimeLibsUrl.split('/').pop()}`);
      
      const targetPath = path.join(this.baseDir, targetFolder);
      
      // Download and extract main CUDA binaries
      log.info('⬇️ Downloading CUDA main binaries...');
      const mainSuccess = await this.downloadAndExtractBinaries(mainBinariesUrl, targetFolder);
      
      if (!mainSuccess) {
        log.error('❌ Failed to download CUDA main binaries');
        return false;
      }
      
      // Download and extract CUDA runtime libraries to the same folder
      log.info('⬇️ Downloading CUDA runtime libraries...');
      const runtimeSuccess = await this.downloadAndExtractToExistingFolder(runtimeLibsUrl, targetPath);
      
      if (!runtimeSuccess) {
        log.error('❌ Failed to download CUDA runtime libraries');
        return false;
      }
      
      // Copy llama-swap from base folder (common to all GPU types)
      await this.copyLlamaSwapBinary(targetFolder);
      
      log.info('✅ CUDA binaries setup completed (main + runtime)');
      return true;
      
    } catch (error) {
      log.error('❌ Error setting up CUDA binaries:', error);
      return false;
    }
  }

  /**
   * Find CUDA-specific assets (main binaries or runtime libraries)
   */
  findCudaAsset(assets, type) {
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      
      if (type === 'main') {
        // Look for main CUDA binaries: llama-b6002-bin-win-cuda-12.4-x64.zip
        if (name.includes('llama-') && 
            name.includes('bin-win-cuda') && 
            name.includes('.zip') &&
            !name.includes('cudart')) {
          return asset.browser_download_url;
        }
      } else if (type === 'cudart') {
        // Look for CUDA runtime: cudart-llama-bin-win-cuda-12.4-x64.zip
        if (name.includes('cudart') && 
            name.includes('llama') && 
            name.includes('bin-win-cuda') && 
            name.includes('.zip')) {
          return asset.browser_download_url;
        }
      }
    }
    return null;
  }

  /**
   * Download and extract to an existing folder (for CUDA runtime libraries)
   */
  async downloadAndExtractToExistingFolder(downloadUrl, targetPath) {
    try {
      // Download the zip file
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      log.info(`⬇️ Downloading from: ${downloadUrl}`);
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Create temp file
      const tempDir = path.join(require('os').tmpdir(), 'clara-cuda-runtime');
      await fs.mkdir(tempDir, { recursive: true });
      const tempZipPath = path.join(tempDir, 'cuda-runtime.zip');
      
      await fs.writeFile(tempZipPath, buffer);
      log.info(`📦 Downloaded to: ${tempZipPath}`);

      // Extract to existing target folder
      const success = await this.extractBinaries(tempZipPath, targetPath);
      
      if (success) {
        log.info(`✅ Successfully extracted CUDA runtime to: ${targetPath}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      log.error(`Failed to download/extract CUDA runtime:`, error);
      return false;
    }
  }

  /**
   * Get GPU type from folder name
   */
  getGPUTypeFromFolder(folder) {
    if (folder.includes('cuda')) return 'cuda';
    if (folder.includes('rocm')) return 'rocm';
    if (folder.includes('vulkan')) return 'vulkan';
    if (folder.includes('cpu')) return 'cpu';
    return 'unknown';
  }

  /**
   * Get latest llama.cpp release from GitHub
   */
  async getLatestLlamaCppRelease() {
    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      const response = await fetch('https://api.github.com/repos/ggerganov/llama.cpp/releases/latest');
      
      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status}`);
      }

      const release = await response.json();
      
      return {
        version: release.tag_name,
        assets: release.assets || []
      };
      
    } catch (error) {
      log.error('Failed to fetch llama.cpp release info:', error);
      return null;
    }
  }

  /**
   * Find appropriate asset URL for GPU type
   */
  findAssetUrl(assets, gpuType, platform) {
    // Look for assets that match the GPU type and platform
    const patterns = {
      cuda: ['cuda', 'nvidia'],
      rocm: ['hip-radeon', 'rocm', 'amd'],  // Updated to include hip-radeon pattern
      vulkan: ['vulkan'],
      cpu: ['cpu'] // Updated to match actual CPU binary naming
    };

    const searchPatterns = patterns[gpuType] || [gpuType];
    
    // Special handling for CPU binaries
    if (gpuType === 'cpu') {
      for (const asset of assets) {
        const name = asset.name.toLowerCase();
        
        // Look for CPU-specific naming: llama-bXXXX-bin-win-cpu-x64.zip
        if (name.includes('llama-') && 
            name.includes('bin-win-cpu') && 
            name.includes('x64') && 
            name.includes('.zip')) {
          log.info(`🎯 Found CPU asset: ${asset.name}`);
          return asset.browser_download_url;
        }
      }
    }
    
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      
      // Check if asset matches platform and GPU type
      if (name.includes('win') || name.includes('windows')) {
        for (const pattern of searchPatterns) {
          if (name.includes(pattern)) {
            log.info(`🎯 Found asset for ${gpuType}: ${asset.name}`);
            return asset.browser_download_url;
          }
        }
      }
    }

    // Special case for ROCm: look specifically for hip-radeon pattern
    if (gpuType === 'rocm') {
      for (const asset of assets) {
        const name = asset.name.toLowerCase();
        // Look for pattern: llama-b6002-bin-win-hip-radeon-x64.zip
        if (name.includes('llama-') && 
            name.includes('bin-win-hip-radeon') && 
            name.includes('.zip')) {
          log.info(`🎯 Found ROCm/HIP asset: ${asset.name}`);
          return asset.browser_download_url;
        }
      }
    }

    // Fallback: look for generic Windows binaries
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      if ((name.includes('win') || name.includes('windows')) && name.includes('.zip')) {
        log.info(`🎯 Using generic Windows asset for ${gpuType}: ${asset.name}`);
        return asset.browser_download_url;
      }
    }

    return null;
  }

  /**
   * Find appropriate asset URL for Linux GPU type
   */
  findLinuxAssetUrl(assets, gpuType) {
    // Look for Linux-specific assets based on the GitHub release patterns
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      
      // Check for Ubuntu/Linux assets (Ubuntu binaries work on most Linux distros)
      if (name.includes('ubuntu') && name.includes('.zip')) {
        if (gpuType === 'vulkan' && name.includes('vulkan')) {
          log.info(`🎯 Found Linux Vulkan asset: ${asset.name}`);
          return asset.browser_download_url;
        } else if (gpuType === 'cpu' && !name.includes('vulkan') && !name.includes('cuda') && !name.includes('rocm')) {
          // CPU version - the basic Ubuntu binary without GPU extensions
          log.info(`🎯 Found Linux CPU asset: ${asset.name}`);
          return asset.browser_download_url;
        }
      }
    }

    // Fallback: look for any Linux binary
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      if ((name.includes('linux') || name.includes('ubuntu')) && name.includes('.zip')) {
        log.info(`🎯 Using generic Linux asset for ${gpuType}: ${asset.name}`);
        return asset.browser_download_url;
      }
    }

    return null;
  }

  /**
   * Download and extract binaries to specific folder
   */
  async downloadAndExtractBinaries(downloadUrl, targetFolder) {
    try {
      // Add timeout protection to the entire download and extract process
      const downloadAndExtractPromise = this.performDownloadAndExtract(downloadUrl, targetFolder);
      
      const success = await Promise.race([
        downloadAndExtractPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Download timeout for ${targetFolder} after 2 minutes`)), 120000)
        )
      ]);
      
      return success;
      
    } catch (error) {
      log.error(`Failed to download/extract binaries for ${targetFolder}:`, error);
      return false;
    }
  }

  /**
   * Perform the actual download and extract (separated for timeout handling)
   */
  async performDownloadAndExtract(downloadUrl, targetFolder) {
    // Download the zip file
    let fetch;
    try {
      fetch = global.fetch || (await import('node-fetch')).default;
    } catch (importError) {
      const nodeFetch = require('node-fetch');
      fetch = nodeFetch.default || nodeFetch;
    }

    log.info(`⬇️ Downloading from: ${downloadUrl}`);
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Create temp file
    const tempDir = path.join(require('os').tmpdir(), 'clara-gpu-binaries');
    await fs.mkdir(tempDir, { recursive: true });
    const tempZipPath = path.join(tempDir, `${targetFolder}.zip`);
    
    await fs.writeFile(tempZipPath, buffer);
    log.info(`📦 Downloaded to: ${tempZipPath}`);

    // Extract using built-in or adm-zip
    const targetPath = path.join(this.baseDir, targetFolder);
    const success = await this.extractBinaries(tempZipPath, targetPath);
    
    if (success) {
      // Copy llama-swap from base folder (it's common to all GPU types)
      await this.copyLlamaSwapBinary(targetFolder);
      log.info(`✅ Successfully set up binaries for ${targetFolder}`);
      return true;
    }
    
    return false;
  }

  /**
   * Extract binaries using available extraction method
   */
  async extractBinaries(zipPath, targetPath) {
    try {
      // Try adm-zip first
      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        
        // Check if this is a Linux Ubuntu binary with build/bin structure
        const entries = zip.getEntries();
        const hasBuildBinStructure = entries.some(entry => 
          entry.entryName.includes('build/bin/') || entry.entryName.includes('bin/')
        );
        
        if (hasBuildBinStructure) {
          // Extract Linux binaries from build/bin/ structure
          return await this.extractLinuxBinariesFromZip(zip, targetPath);
        } else {
          // Standard extraction for Windows binaries
          zip.extractAllTo(targetPath, true);
          log.info(`📂 Extracted using adm-zip to: ${targetPath}`);
          return true;
        }
      } catch (admZipError) {
        log.debug('adm-zip not available, trying platform-specific extraction');
      }

      // Fallback to PowerShell on Windows
      if (os.platform() === 'win32') {
        return await this.extractWithPowerShell(zipPath, targetPath);
      }

      // Fallback to unzip on Linux/Unix
      if (os.platform() === 'linux' || os.platform() === 'darwin') {
        return await this.extractWithUnzip(zipPath, targetPath);
      }

      throw new Error('No extraction method available');
      
    } catch (error) {
      log.error('Binary extraction failed:', error);
      return false;
    }
  }

  /**
   * Extract Linux binaries from zip with build/bin/ structure
   */
  async extractLinuxBinariesFromZip(zip, targetPath) {
    try {
      // Ensure target directory exists
      await fs.mkdir(targetPath, { recursive: true });
      
      const entries = zip.getEntries();
      let extractedCount = 0;
      
      for (const entry of entries) {
        // Look for files in build/bin/ or bin/ directories
        if ((entry.entryName.includes('build/bin/') || entry.entryName.includes('bin/')) && 
            !entry.isDirectory) {
          
          // Extract just the filename (remove path)
          const fileName = path.basename(entry.entryName);
          
          // Skip non-binary files
          if (fileName.startsWith('.') || fileName.includes('.txt') || fileName.includes('.md')) {
            continue;
          }
          
          const targetFilePath = path.join(targetPath, fileName);
          
          // Extract the file content
          const fileContent = entry.getData();
          await fs.writeFile(targetFilePath, fileContent);
          
          // Make executable on Unix systems
          if (os.platform() !== 'win32') {
            await fs.chmod(targetFilePath, 0o755);
          }
          
          log.info(`📄 Extracted binary: ${fileName} -> ${targetFilePath}`);
          extractedCount++;
        }
      }
      
      if (extractedCount > 0) {
        log.info(`📂 Successfully extracted ${extractedCount} Linux binaries from build/bin to: ${targetPath}`);
        return true;
      } else {
        log.warn('⚠️ No binaries found in build/bin structure, falling back to standard extraction');
        zip.extractAllTo(targetPath, true);
        return true;
      }
      
    } catch (error) {
      log.error('Linux binary extraction failed:', error);
      return false;
    }
  }

  /**
   * Extract using PowerShell on Windows
   */
  async extractWithPowerShell(zipPath, targetPath) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetPath}" -Force`;
      const ps = spawn('powershell', ['-Command', psCommand], { stdio: 'pipe' });
      
      ps.on('close', (code) => {
        if (code === 0) {
          log.info(`📂 Extracted using PowerShell to: ${targetPath}`);
          resolve(true);
        } else {
          log.error(`PowerShell extraction failed with code: ${code}`);
          resolve(false);
        }
      });
      
      ps.on('error', (error) => {
        log.error('PowerShell extraction error:', error);
        resolve(false);
      });
    });
  }

  /**
   * Extract using unzip command on Linux/Unix systems
   */
  async extractWithUnzip(zipPath, targetPath) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      // First, try to extract and check the structure
      const listCommand = spawn('unzip', ['-l', zipPath], { stdio: 'pipe' });
      let zipContents = '';
      
      listCommand.stdout.on('data', (data) => {
        zipContents += data.toString();
      });
      
      listCommand.on('close', (code) => {
        if (code !== 0) {
          log.error(`unzip list failed with code: ${code}`);
          resolve(false);
          return;
        }
        
        // Check if this has build/bin structure
        const hasBuildBinStructure = zipContents.includes('build/bin/') || zipContents.includes(' bin/');
        
        if (hasBuildBinStructure) {
          // Extract only the bin directory contents
          this.extractLinuxBinariesWithUnzip(zipPath, targetPath).then(resolve);
        } else {
          // Standard extraction
          const extractCommand = spawn('unzip', ['-o', zipPath, '-d', targetPath], { stdio: 'pipe' });
          
          extractCommand.on('close', (extractCode) => {
            if (extractCode === 0) {
              log.info(`📂 Extracted using unzip to: ${targetPath}`);
              resolve(true);
            } else {
              log.error(`unzip extraction failed with code: ${extractCode}`);
              resolve(false);
            }
          });
          
          extractCommand.on('error', (error) => {
            log.error('unzip extraction error:', error);
            resolve(false);
          });
        }
      });
      
      listCommand.on('error', (error) => {
        log.error('unzip list error:', error);
        resolve(false);
      });
    });
  }

  /**
   * Extract Linux binaries from build/bin structure using unzip command
   */
  async extractLinuxBinariesWithUnzip(zipPath, targetPath) {
    return new Promise(async (resolve) => {
      try {
        // Ensure target directory exists
        await fs.mkdir(targetPath, { recursive: true });
        
        // Create a temporary directory for extraction
        const tempDir = path.join(require('os').tmpdir(), 'clara-linux-extract');
        await fs.mkdir(tempDir, { recursive: true });
        
        const { spawn } = require('child_process');
        
        // Extract everything to temp directory first
        const extractCommand = spawn('unzip', ['-o', zipPath, '-d', tempDir], { stdio: 'pipe' });
        
        extractCommand.on('close', async (code) => {
          if (code !== 0) {
            log.error(`unzip extraction failed with code: ${code}`);
            resolve(false);
            return;
          }
          
          try {
            // Find and move binaries from build/bin or bin directory
            const binDirs = [
              path.join(tempDir, 'build', 'bin'),
              path.join(tempDir, 'bin')
            ];
            
            let extractedCount = 0;
            
            for (const binDir of binDirs) {
              if (fsSync.existsSync(binDir)) {
                const files = await fs.readdir(binDir);
                
                for (const file of files) {
                  const sourcePath = path.join(binDir, file);
                  const targetFilePath = path.join(targetPath, file);
                  
                  // Skip directories and non-binary files
                  const stat = await fs.stat(sourcePath);
                  if (stat.isDirectory() || file.startsWith('.') || 
                      file.includes('.txt') || file.includes('.md')) {
                    continue;
                  }
                  
                  // Copy the file
                  await fs.copyFile(sourcePath, targetFilePath);
                  
                  // Make executable
                  await fs.chmod(targetFilePath, 0o755);
                  
                  log.info(`📄 Extracted binary: ${file} -> ${targetFilePath}`);
                  extractedCount++;
                }
                break; // Found the right directory, stop looking
              }
            }
            
            // Cleanup temp directory
            await fs.rm(tempDir, { recursive: true, force: true });
            
            if (extractedCount > 0) {
              log.info(`📂 Successfully extracted ${extractedCount} Linux binaries using unzip to: ${targetPath}`);
              resolve(true);
            } else {
              log.warn('⚠️ No binaries found in expected directories');
              resolve(false);
            }
            
          } catch (error) {
            log.error('Error processing extracted files:', error);
            resolve(false);
          }
        });
        
        extractCommand.on('error', (error) => {
          log.error('unzip extraction error:', error);
          resolve(false);
        });
        
      } catch (error) {
        log.error('Linux binary extraction setup failed:', error);
        resolve(false);
      }
    });
  }

  /**
   * Copy binaries from base folder as fallback
   */
  async copyBinariesFromBase(targetFolder) {
    const basePath = path.join(this.baseDir, 'win32-x64');
    const targetPath = path.join(this.baseDir, targetFolder);
    
    if (!fsSync.existsSync(basePath)) {
      throw new Error(`Base folder not found: ${basePath}`);
    }

    // Copy all files from base folder
    const files = await fs.readdir(basePath);
    
    for (const file of files) {
      const sourcePath = path.join(basePath, file);
      const destPath = path.join(targetPath, file);
      
      await fs.copyFile(sourcePath, destPath);
      log.info(`📋 Copied ${file} to ${targetFolder}`);
    }
  }

  /**
   * Copy Linux binaries from base folder as fallback
   */
  async copyLinuxBinariesFromBase(targetFolder) {
    const basePath = path.join(this.baseDir, 'linux-x64');
    const targetPath = path.join(this.baseDir, targetFolder);
    
    if (!fsSync.existsSync(basePath)) {
      throw new Error(`Linux base folder not found: ${basePath}`);
    }

    // Ensure target directory exists
    await fs.mkdir(targetPath, { recursive: true });

    // Copy all files from base folder
    const files = await fs.readdir(basePath);
    
    for (const file of files) {
      const sourcePath = path.join(basePath, file);
      const destPath = path.join(targetPath, file);
      
      await fs.copyFile(sourcePath, destPath);
      log.info(`📋 Copied ${file} to ${targetFolder}`);
    }
  }

  /**
   * Copy llama-swap binary to GPU-specific folder (it's common to all)
   */
  async copyLlamaSwapBinary(targetFolder) {
    const basePath = path.join(this.baseDir, 'win32-x64');
    const targetPath = path.join(this.baseDir, targetFolder);
    
    const llamaSwapFiles = ['llama-swap-win32-x64.exe', 'llama-swap.exe'];
    
    for (const fileName of llamaSwapFiles) {
      const sourcePath = path.join(basePath, fileName);
      const destPath = path.join(targetPath, fileName);
      
      if (fsSync.existsSync(sourcePath)) {
        await fs.copyFile(sourcePath, destPath);
        log.info(`📋 Copied ${fileName} to ${targetFolder}`);
        break; // Only copy the first one found
      }
    }
  }

  /**
   * Download official llama-swap binary from GitHub releases
   */
  async downloadOfficialLlamaSwap() {
    try {
      log.info('🚀 Downloading official llama-swap binary...');
      
      // Get latest llama-swap release info
      const releaseInfo = await this.getLatestLlamaSwapRelease();
      if (!releaseInfo) {
        throw new Error('Could not fetch latest llama-swap release information');
      }

      log.info(`📦 Found llama-swap release: ${releaseInfo.version}`);

      // Determine platform-specific download URL
      const downloadUrl = this.getLlamaSwapAssetUrl(releaseInfo.assets);
      if (!downloadUrl) {
        throw new Error(`No compatible llama-swap binary found for ${os.platform()}-${os.arch()}`);
      }

      log.info(`⬇️ Downloading from: ${downloadUrl}`);

      // Download and extract to appropriate location
      const success = await this.downloadAndExtractLlamaSwap(downloadUrl);
      if (success) {
        log.info('✅ Official llama-swap binary downloaded successfully');
        return { success: true };
      } else {
        throw new Error('Failed to download or extract llama-swap binary');
      }
      
    } catch (error) {
      log.error('❌ Failed to download official llama-swap binary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get latest llama-swap release from GitHub
   */
  async getLatestLlamaSwapRelease() {
    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      const response = await fetch('https://api.github.com/repos/mostlygeek/llama-swap/releases/latest');
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const release = await response.json();
      return {
        version: release.tag_name,
        assets: release.assets
      };
    } catch (error) {
      log.error('Error fetching llama-swap release info:', error);
      return null;
    }
  }

  /**
   * Get platform-specific llama-swap asset URL
   */
  getLlamaSwapAssetUrl(assets) {
    const platform = os.platform();
    const arch = os.arch();
    
    // Map Node.js platform/arch to llama-swap naming convention
    let platformName, archName, fileExtension;
    
    switch (platform) {
      case 'darwin':
        platformName = 'darwin';
        archName = arch === 'arm64' ? 'arm64' : 'amd64';
        fileExtension = 'tar.gz';
        break;
      case 'linux':
        platformName = 'linux';
        archName = arch === 'arm64' ? 'arm64' : 'amd64';
        fileExtension = 'tar.gz';
        break;
      case 'win32':
        platformName = 'windows';
        archName = 'amd64'; // llama-swap only provides amd64 for Windows
        fileExtension = 'zip';
        break;
      default:
        return null;
    }

    // Look for matching asset
    const expectedPattern = `llama-swap_.*_${platformName}_${archName}.${fileExtension}`;
    const regex = new RegExp(expectedPattern);
    
    for (const asset of assets) {
      if (regex.test(asset.name)) {
        log.info(`🎯 Found matching asset: ${asset.name}`);
        return asset.browser_download_url;
      }
    }

    log.warn(`⚠️ No matching asset found for pattern: ${expectedPattern}`);
    return null;
  }

  /**
   * Download and extract official llama-swap binary
   */
  async downloadAndExtractLlamaSwap(downloadUrl) {
    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      // Download the archive
      log.info(`⬇️ Downloading llama-swap from: ${downloadUrl}`);
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Create temp file
      const tempDir = path.join(require('os').tmpdir(), 'clara-llamaswap');
      await fs.mkdir(tempDir, { recursive: true });
      
      const platform = os.platform();
      const isWindows = platform === 'win32';
      const tempFilePath = path.join(tempDir, `llama-swap.${isWindows ? 'zip' : 'tar.gz'}`);
      
      await fs.writeFile(tempFilePath, buffer);
      log.info(`📦 Downloaded to: ${tempFilePath}`);

      // Determine target directory for llama-swap binary
      const targetDir = this.getLlamaSwapInstallDirectory();
      await fs.mkdir(targetDir, { recursive: true });

      // Extract based on platform
      if (isWindows) {
        await this.extractLlamaSwapZip(tempFilePath, targetDir);
      } else {
        await this.extractLlamaSwapTarGz(tempFilePath, targetDir);
      }

      // Clean up temp file
      await fs.unlink(tempFilePath);
      
      // Verify the binary was extracted correctly
      const binaryPath = this.getOfficialLlamaSwapPath();
      if (!fsSync.existsSync(binaryPath)) {
        throw new Error(`Binary not found after extraction: ${binaryPath}`);
      }

      // Make executable on Unix systems
      if (!isWindows) {
        await fs.chmod(binaryPath, 0o755);
      }

      log.info(`✅ llama-swap binary installed to: ${binaryPath}`);
      return true;
      
    } catch (error) {
      log.error('❌ Error downloading/extracting llama-swap:', error);
      return false;
    }
  }

  /**
   * Get the directory where llama-swap should be installed
   */
  getLlamaSwapInstallDirectory() {
    // Install to a dedicated directory in app data
    const userDataDir = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.clara');
    return path.join(userDataDir, 'llama-swap');
  }

  /**
   * Get the path to the official llama-swap binary
   */
  getOfficialLlamaSwapPath() {
    const installDir = this.getLlamaSwapInstallDirectory();
    const binaryName = os.platform() === 'win32' ? 'llama-swap.exe' : 'llama-swap';
    return path.join(installDir, binaryName);
  }

  /**
   * Extract llama-swap from ZIP (Windows)
   */
  async extractLlamaSwapZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Use PowerShell to extract ZIP
      const psCommand = `
        Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force;
        Get-ChildItem -Path "${targetDir}" -Recurse -Name "llama-swap.exe" | ForEach-Object {
          $sourcePath = Join-Path "${targetDir}" $_
          $destPath = Join-Path "${targetDir}" "llama-swap.exe"
          if ($sourcePath -ne $destPath) {
            Move-Item -Path $sourcePath -Destination $destPath -Force
          }
        }
      `;
      
      const ps = spawn('powershell', ['-Command', psCommand], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      
      ps.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ps.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code === 0) {
          log.info('✅ ZIP extraction completed');
          resolve();
        } else {
          reject(new Error(`PowerShell extraction failed: ${stderr}`));
        }
      });
      
      setTimeout(() => {
        ps.kill();
        reject(new Error('ZIP extraction timeout'));
      }, 30000);
    });
  }

  /**
   * Extract llama-swap from tar.gz (macOS/Linux)
   */
  async extractLlamaSwapTarGz(tarPath, targetDir) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Use tar to extract
      const tar = spawn('tar', ['-xzf', tarPath, '-C', targetDir], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      
      tar.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      tar.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      tar.on('close', (code) => {
        if (code === 0) {
          // Find and move the llama-swap binary to the root of target directory
          this.findAndMoveLlamaSwapBinary(targetDir)
            .then(() => {
              log.info('✅ tar.gz extraction completed');
              resolve();
            })
            .catch(reject);
        } else {
          reject(new Error(`tar extraction failed: ${stderr}`));
        }
      });
      
      setTimeout(() => {
        tar.kill();
        reject(new Error('tar.gz extraction timeout'));
      }, 30000);
    });
  }

  /**
   * Find llama-swap binary in extracted directory and move to root
   */
  async findAndMoveLlamaSwapBinary(targetDir) {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // Find the llama-swap binary (might be in a subdirectory)
      const find = spawn('find', [targetDir, '-name', 'llama-swap', '-type', 'f'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      
      find.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      find.on('close', async (code) => {
        if (code === 0 && stdout.trim()) {
          const binaryPath = stdout.trim().split('\n')[0]; // Get first match
          const targetPath = path.join(targetDir, 'llama-swap');
          
          try {
            if (binaryPath !== targetPath) {
              await fs.rename(binaryPath, targetPath);
              log.info(`📦 Moved llama-swap binary to: ${targetPath}`);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('llama-swap binary not found in extracted archive'));
        }
      });
    });
  }

  /**
   * Check if official llama-swap binary exists and is up to date
   */
  async checkOfficialLlamaSwapVersion() {
    try {
      const binaryPath = this.getOfficialLlamaSwapPath();
      
      if (!fsSync.existsSync(binaryPath)) {
        log.info('🔍 Official llama-swap binary not found, needs download');
        return { exists: false, needsUpdate: true };
      }

      // Get current version
      const currentVersion = await this.getLlamaSwapBinaryVersion(binaryPath);
      
      // Get latest version from GitHub
      const releaseInfo = await this.getLatestLlamaSwapRelease();
      if (!releaseInfo) {
        log.warn('⚠️ Could not check for updates, using existing binary');
        return { exists: true, needsUpdate: false, currentVersion };
      }

      const latestVersion = releaseInfo.version;
      const needsUpdate = currentVersion !== latestVersion;
      
      log.info(`📊 llama-swap version check: current=${currentVersion}, latest=${latestVersion}, needsUpdate=${needsUpdate}`);
      
      return {
        exists: true,
        needsUpdate,
        currentVersion,
        latestVersion
      };
      
    } catch (error) {
      log.error('❌ Error checking llama-swap version:', error);
      return { exists: false, needsUpdate: true, error: error.message };
    }
  }

  /**
   * Get version of llama-swap binary
   */
  async getLlamaSwapBinaryVersion(binaryPath) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      const process = spawn(binaryPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000
      });

      let stdout = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0 && stdout) {
          // Extract version from output (e.g., "llama-swap v144")
          const versionMatch = stdout.match(/v?(\d+(?:\.\d+)*)/);
          if (versionMatch) {
            resolve(`v${versionMatch[1]}`);
          } else {
            resolve('unknown');
          }
        } else {
          resolve('unknown');
        }
      });
      
      setTimeout(() => {
        process.kill();
        resolve('unknown');
      }, 5000);
    });
  }

  async validateBinaries() {
    log.info('Starting binary validation...');
    log.info(`📁 Config file location: ${this.configPath}`);
    log.info(`📁 Base directory: ${this.baseDir}`);
    log.info(`📁 Platform directory: ${this.platformBinDir || 'N/A'}`);
    
    try {
      // Use platform manager validation if available
      if (this.platformManager.isCurrentPlatformSupported()) {
        log.info('Using platform manager validation');
        await this.platformManager.validatePlatformBinaries();
        return true;
      }
    } catch (error) {
      log.warn('Platform manager validation failed, using legacy validation:', error.message);
    }

    // Fallback to legacy validation with official binary support
    log.info('Using legacy binary validation with official binary support');
    const { llamaSwap, llamaServer } = this.binaryPaths;
    
    const issues = [];
    
    log.info(`Checking llama-swap binary: ${llamaSwap}`);
    if (!this.binaryExists(llamaSwap)) {
      log.warn(`llama-swap binary not found at: ${llamaSwap}`);
      
      // TRY AUTO-DOWNLOAD: Attempt to download official llama-swap binary
      try {
        log.info('🔄 Attempting to download official llama-swap binary...');
        await this.downloadOfficialLlamaSwap();
        
        // Re-check using updated binary paths
        const updatedPaths = this.getBinaryPathsWithFallback();
        if (this.binaryExists(updatedPaths.llamaSwap)) {
          log.info('✅ Successfully downloaded and validated official llama-swap binary');
          // Update our current binary paths reference
          this.binaryPaths.llamaSwap = updatedPaths.llamaSwap;
        } else {
          const error = `llama-swap binary not found at: ${llamaSwap} (download failed or not applicable)`;
          log.error(error);
          issues.push(error);
        }
      } catch (downloadError) {
        log.error('❌ Failed to auto-download llama-swap binary:', downloadError.message);
        const error = `llama-swap binary not found at: ${llamaSwap} (auto-download failed: ${downloadError.message})`;
        log.error(error);
        issues.push(error);
      }
    } else {
      log.info('✅ llama-swap binary found');
    }
    
    log.info(`Checking llama-server binary: ${llamaServer}`);
    if (!this.binaryExists(llamaServer)) {
      const error = `llama-server binary not found at: ${llamaServer}`;
      log.error(error);
      issues.push(error);
    } else {
      log.info('✅ llama-server binary found');
    }
    
    if (issues.length > 0) {
      // Check if this is a GPU-specific folder that's missing binaries
      const isGPUFolder = llamaSwap.includes('win32-x64-cuda') || 
                         llamaSwap.includes('win32-x64-rocm') || 
                         llamaSwap.includes('win32-x64-vulkan') || 
                         llamaSwap.includes('win32-x64-cpu');
      
      if (isGPUFolder && os.platform() === 'win32') {
        log.info('🔧 GPU-specific folder detected with missing binaries - attempting automatic setup...');
        
        try {
          // Try to setup GPU binaries automatically
          const setupResult = await this.setupGPUSpecificBinaries();
          
          if (setupResult.success) {
            log.info('✅ GPU binaries setup completed successfully - retrying validation...');
            
            // Retry validation after setup
            const retryIssues = [];
            
            if (!this.binaryExists(llamaSwap)) {
              retryIssues.push(`llama-swap binary still not found at: ${llamaSwap}`);
            }
            
            if (!this.binaryExists(llamaServer)) {
              retryIssues.push(`llama-server binary still not found at: ${llamaServer}`);
            }
            
            if (retryIssues.length === 0) {
              log.info('✅ Binary validation successful after automatic setup');
              return true;
            } else {
              log.error('❌ Binaries still missing after automatic setup:', retryIssues);
              issues.push(...retryIssues.map(issue => `${issue} (after auto-setup)`));
            }
          } else {
            log.error('❌ Automatic GPU binary setup failed:', setupResult.error || setupResult.message);
            issues.push(`Automatic binary setup failed: ${setupResult.error || setupResult.message}`);
          }
        } catch (setupError) {
          log.error('❌ Error during automatic binary setup:', setupError);
          issues.push(`Binary setup error: ${setupError.message}`);
        }
      }
      
      // Additional diagnostic information
      log.error('=== BINARY VALIDATION FAILED ===');
      log.error('📁 Config file location:', this.configPath);
      log.error('📁 Base directory:', this.baseDir);
      log.error('📁 Platform directory:', this.platformBinDir);
      log.error('📁 Platform info:', this.platformInfo);
      log.error('📁 Binary paths:', this.binaryPaths);
      
      // List what's actually in the directories
      try {
        const baseContents = fsSync.readdirSync(this.baseDir);
        log.error('📁 Base directory contents:', baseContents);
        
        if (fsSync.existsSync(this.platformBinDir)) {
          const platformContents = fsSync.readdirSync(this.platformBinDir);
          log.error('📁 Platform directory contents:', platformContents);
        } else {
          log.error('📁 Platform directory does not exist:', this.platformBinDir);
        }
      } catch (dirError) {
        log.error('📁 Error reading directory contents:', dirError.message);
      }
      
      // Show helpful suggestions
      log.error('🔧 TROUBLESHOOTING SUGGESTIONS:');
      if (isGPUFolder) {
        log.error('   • GPU-specific folder detected but binaries are missing');
        log.error('   • Try manually running: setupGPUSpecificBinaries()');
        log.error('   • Or delete the GPU folder to fallback to base folder');
      }
      log.error('   • Check if antivirus software is blocking the binaries');
      log.error('   • Verify the base directory exists and contains binaries');
      log.error('   • Try restarting the application as administrator');
      
      const error = new Error(`Binary validation failed:\n${issues.join('\n')}`);
      error.issues = issues;
      error.diagnostics = {
        baseDir: this.baseDir,
        platformBinDir: this.platformBinDir,
        platformInfo: this.platformInfo,
        binaryPaths: this.binaryPaths,
        configPath: this.configPath
      };
      throw error;
    }
    
    // Check if binaries are executable (use current binary paths)
    try {
      await fs.access(this.binaryPaths.llamaSwap, fs.constants.F_OK | fs.constants.X_OK);
      await fs.access(this.binaryPaths.llamaServer, fs.constants.F_OK | fs.constants.X_OK);
      log.info('✅ Binaries are executable');
    } catch (error) {
      const execError = new Error(`Binaries exist but are not executable: ${error.message}`);
      log.error(execError.message);
      throw execError;
    }
    
    log.info('✅ Legacy binary validation successful');
    return true;
  }

  /**
   * Check if there's a newer version of llama-swap available
   */
  async checkForLlamaSwapUpdates() {
    try {
      const currentVersion = await this.getLlamaSwapVersion();
      const latestRelease = await this.getLatestLlamaSwapRelease();
      
      const hasUpdate = currentVersion !== latestRelease.tag_name;
      
      return {
        hasUpdate,
        currentVersion,
        latestVersion: latestRelease.tag_name,
        releaseInfo: latestRelease
      };
    } catch (error) {
      log.error('Failed to check for llama-swap updates:', error.message);
      throw error;
    }
  }

  /**
   * Get the version of the currently installed llama-swap binary
   */
  async getLlamaSwapVersion() {
    try {
      const paths = this.getBinaryPathsWithFallback();
      if (!paths.llamaSwap || !fsSync.existsSync(paths.llamaSwap)) {
        return 'not installed';
      }

      const result = await this.execAsync(`"${paths.llamaSwap}" --version`, { timeout: 5000 });
      
      // Extract version from output (format may vary)
      const versionMatch = result.stdout.match(/v?(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : 'unknown';
    } catch (error) {
      log.warn('Failed to get llama-swap version:', error.message);
      return 'unknown';
    }
  }

  /**
   * Update llama-swap to the latest version
   */
  async updateLlamaSwap() {
    try {
      log.info('🔄 Updating llama-swap to latest version...');
      
      // Download latest version
      await this.downloadOfficialLlamaSwap();
      
      // Verify the update
      const newVersion = await this.getLlamaSwapVersion();
      log.info(`✅ llama-swap updated to version: ${newVersion}`);
      
      return {
        success: true,
        version: newVersion
      };
    } catch (error) {
      log.error('❌ Failed to update llama-swap:', error.message);
      throw error;
    }
  }

  binaryExists(binaryPath) {
    try {
      return fsSync.existsSync(binaryPath) && fsSync.statSync(binaryPath).isFile();
    } catch (error) {
      return false;
    }
  }

  // Legacy method for backward compatibility
  getBinaryPath() {
    return this.binaryPaths.llamaSwap;
  }

  getPlatformInfo() {
    return this.platformManager.getPlatformInfo();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(path.join(os.homedir(), '.clara'), { recursive: true });
      await fs.mkdir(this.modelsDir, { recursive: true });
      await fs.mkdir(this.settingsDir, { recursive: true });
      
      // Ensure the directory for config files exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      log.info(`Models directory ensured at: ${this.modelsDir}`);
      log.info(`Settings directory ensured at: ${this.settingsDir}`);
      log.info(`Config directory ensured at: ${configDir}`);
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

    // Add custom model paths
    this.customModelPaths.forEach(customPath => {
      sources.push({ path: customPath, source: 'custom' });
    });

    // Recursive function to scan directories for .gguf files
    const scanDirectoryRecursive = async (dirPath, source, maxDepth = 10, currentDepth = 0) => {
      // Prevent infinite recursion in case of symlinks or very deep folder structures
      if (currentDepth >= maxDepth) {
        log.warn(`Maximum depth (${maxDepth}) reached while scanning ${dirPath}`);
        return;
      }

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        // First pass: collect all .gguf files in current directory
        const ggufFiles = [];
        const subdirectories = [];
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            subdirectories.push(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.gguf')) {
            ggufFiles.push({ name: entry.name, path: fullPath });
          }
        }
        
        // Process multi-part models in current directory
        const processedFiles = new Set();
        const multiPartGroups = new Map();
        
        // Group multi-part files
        ggufFiles.forEach(file => {
          // Pattern: filename-00001-of-00002.gguf
          const multiPartMatch = file.name.match(/^(.+)-(\d+)-of-(\d+)\.gguf$/);
          if (multiPartMatch) {
            const [, baseName, partNum, totalParts] = multiPartMatch;
            const key = `${baseName}-${totalParts}`;
            
            if (!multiPartGroups.has(key)) {
              multiPartGroups.set(key, {
                baseName,
                totalParts: parseInt(totalParts),
                parts: new Map()
              });
            }
            
            multiPartGroups.get(key).parts.set(parseInt(partNum), file);
          }
        });
        
        // Validate and add complete multi-part models
        for (const [key, group] of multiPartGroups) {
          const { baseName, totalParts, parts } = group;
          
          // Check if all parts are present
          let allPartsPresent = true;
          for (let i = 1; i <= totalParts; i++) {
            if (!parts.has(i)) {
              allPartsPresent = false;
              log.warn(`Multi-part model ${baseName} is incomplete: missing part ${i} of ${totalParts}`);
              break;
            }
          }
          
          if (allPartsPresent) {
            // Add only the first part as the model entry
            const firstPart = parts.get(1);
            try {
              const stats = await fs.stat(firstPart.path);
              
              models.push({
                file: firstPart.name,
                path: firstPart.path,
                size: stats.size,
                source: source,
                lastModified: stats.mtime,
                isMultiPart: true,
                totalParts: totalParts
              });
              
              // Mark all parts as processed
              for (const part of parts.values()) {
                processedFiles.add(part.name);
              }
              
              log.info(`Added complete multi-part model: ${baseName} (${totalParts} parts)`);
            } catch (error) {
              log.warn(`Error reading stats for multi-part model ${firstPart.path}:`, error);
            }
          } else {
            // Mark incomplete multi-part files as processed (so they won't be added as single files)
            for (const part of parts.values()) {
              processedFiles.add(part.name);
            }
          }
        }
        
        // Add single-part .gguf files that aren't part of multi-part models
        for (const file of ggufFiles) {
          if (!processedFiles.has(file.name)) {
            try {
              const stats = await fs.stat(file.path);
              
              models.push({
                file: file.name,
                path: file.path,
                size: stats.size,
                source: source,
                lastModified: stats.mtime,
                isMultiPart: false
              });
            } catch (error) {
              log.warn(`Error reading stats for ${file.path}:`, error);
            }
          }
        }
        
        // Recursively scan subdirectories
        for (const subdirPath of subdirectories) {
          await scanDirectoryRecursive(subdirPath, source, maxDepth, currentDepth + 1);
        }
        
      } catch (error) {
        // Log but don't fail completely if we can't read a specific directory
        log.warn(`Error reading directory ${dirPath}:`, error);
      }
    };

    for (const { path: modelPath, source } of sources) {
      try {
        if (await fs.access(modelPath).then(() => true).catch(() => false)) {
          // Use recursive scanning instead of just reading the root level
          await scanDirectoryRecursive(modelPath, source);
        }
      } catch (error) {
        log.warn(`Error scanning models in ${modelPath}:`, error);
      }
    }

    return models;
  }

  generateModelName(filename) {
    const raw = filename.replace('.gguf', '');
    const name = raw.toLowerCase();
    
    // Fixed mappings (override everything else)
    const fixedMappings = {
      'mxbai': 'mxbai-embed-large:embed',
    };
    
    for (const key in fixedMappings) {
      if (name.includes(key)) {
        return fixedMappings[key];
      }
    }
    
    // Special case for moondream - extract version number
    if (name.includes('moondream')) {
      const versionMatch = name.match(/moondream[-_.]?(\d+(?:\.\d+)?)/);
      const version = versionMatch ? versionMatch[1] : '2';
      return `moondream:${version}`;
    }
    
    // Try to match size - improved regex to handle various formats
    let size = null;
    
    // Look for patterns like "3B", "8B", "1B" etc.
    const sizeMatch = name.match(/(?:^|[^a-z\d])(\d+(?:\.\d+)?)b(?:[^a-z]|$)/i);
    if (sizeMatch) {
      size = `${sizeMatch[1]}b`;
    }
    
    // Fallback size detection for edge cases
    if (!size) {
      if (name.includes('large')) size = 'large';
      else if (name.includes('medium')) size = 'medium';
      else if (name.includes('small')) size = 'small';
      else size = 'unknown';
    }
    
    // Ordered patterns — first match wins (most specific first)
    const patterns = [
      // TinyLlama patterns - MUST come before Llama patterns
      { 
        regex: /(tinyllama)/i, 
        format: (m) => 'tinyllama' 
      },
      
      // DeepSeek patterns - handle R1 and version numbers
      { 
        regex: /(deepseek[-_.]r\d+(?:[-_.]?\d+)*)/i, 
        format: (m) => m[1].toLowerCase().replace(/[-_.]/g, '-') 
      },
      
      // Nomic embed patterns
      { 
        regex: /(nomic[-_.]?embed[-_.]?text[-_.]?v\d+(?:\.\d+)?)/i, 
        format: (m) => m[1].toLowerCase().replace(/[-_.]/g, '-') 
      },
      
      // Llama patterns - handle version numbers like 3.2
      { 
        regex: /(llama)[-_.]?(\d+(?:\.\d+)?)/i, 
        format: (m) => `llama${m[2]}` 
      },
      
      // Gemma patterns
      { 
        regex: /(gemma)[-_.]?(\d+(?:\.\d+)?)/i, 
        format: (m) => `gemma${m[2]}` 
      },
      
      // Qwen patterns - handle version numbers like 2.5
      { 
        regex: /(qwen)(\d+(?:\.\d+)?)/i, 
        format: (m) => `qwen${m[2]}` 
      },
      
      // Mistral patterns
      { 
        regex: /(mistral)/i, 
        format: (m) => 'mistral' 
      },
      
      // Devstral patterns
      { 
        regex: /(devstral)/i, 
        format: (m) => 'devstral' 
      },
    ];
    
    for (const { regex, format } of patterns) {
      const match = name.match(regex);
      if (match) {
        const base = format(match);
        return size !== 'unknown' ? `${base}:${size}` : base;
      }
    }
    
    // Fallback: clean up the filename and use as-is
    const fallback = raw.toLowerCase().replace(/[-_.]/g, '-');
    return size !== 'unknown' ? `${fallback}:${size}` : fallback;
  }

  /**
   * Start monitoring the main process and any child processes
   * This helps prevent zombie processes and handles cleanup after updates
   */
  startProcessMonitoring() {
    if (this.processMonitor) {
      clearInterval(this.processMonitor);
    }
    
    this.processMonitor = setInterval(() => {
      if (!this.process || this.process.killed) {
        log.warn('Main process lost during monitoring, cleaning up...');
        this.cleanup();
        return;
      }
      
      // Check if process is still responsive
      if (this.isRunning && this.process.pid) {
        try {
          // Send signal 0 to check if process exists (doesn't actually kill it)
          process.kill(this.process.pid, 0);
          
          // Optional: Check if port is still open
          this.checkPortStatus().catch(error => {
            log.debug('Port check failed during monitoring:', error.message);
          });
          
        } catch (error) {
          if (error.code === 'ESRCH') {
            log.warn('Main process no longer exists, cleaning up state...');
            this.cleanup();
          } else if (error.code === 'EPERM') {
            log.debug('Process exists but no permission to signal (this is normal)');
          } else {
            log.warn('Unexpected error during process monitoring:', error.message);
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Check if the service port is responsive
   */
  async checkPortStatus() {
    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }
      
      const response = await Promise.race([
        fetch(`http://localhost:${this.port}/v1/models`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      
      return response.ok;
    } catch (error) {
      throw new Error(`Port ${this.port} not responsive: ${error.message}`);
    }
  }

  async generateConfig() {
    // IMPORTANT: Apply backend overrides before generating config
    const overriddenPlatform = await this.applyBackendOverride();
    let llamaServerPath = this.binaryPaths.llamaServer;
    
    if (overriddenPlatform && overriddenPlatform !== 'auto') {
      log.info(`🔧 Config generation using overridden platform: ${overriddenPlatform}`);
      // Get the correct binary paths for the overridden platform
      const overriddenBinaryPaths = this.getBinaryPathsWithOverride(overriddenPlatform);
      llamaServerPath = overriddenBinaryPaths.llamaServer;
      log.info(`🔧 Using overridden llama-server path: ${llamaServerPath}`);
    } else {
      log.info(`🔧 Config generation using default platform binary paths`);
    }
    
    const models = await this.scanModels();
    
    // Separate main models from mmproj files
    const mainModels = models.filter(model => !this.isMmprojModel(model.file));
    const mmprojModels = models.filter(model => this.isMmprojModel(model.file));
    
    // Generate names and handle conflicts
    const modelNames = new Map();
    const nameConflicts = new Map();
    
    // First pass: generate base names and collect all conflicts
    mainModels.forEach((model) => {
      const baseName = this.generateModelName(model.file);
      if (modelNames.has(baseName)) {
        // If this is the first conflict for this name, move the existing model to conflicts
        if (!nameConflicts.has(baseName)) {
          nameConflicts.set(baseName, [modelNames.get(baseName)]);
        }
        // Add this conflicting model to the list
        nameConflicts.get(baseName).push(model);
      } else {
        modelNames.set(baseName, model);
      }
    });
    
    // Second pass: resolve conflicts by adding differentiators
    nameConflicts.forEach((conflictedModels, baseName) => {
      // Remove the original conflicting entry from modelNames
      modelNames.delete(baseName);
      
      // Generate unique names for all conflicting models
      const usedNames = new Set();
      
      conflictedModels.forEach((model, index) => {
        const quantization = this.extractQuantization(model.file);
        const sizeInfo = this.extractFileSizeInfo(model.file, model.size);
        let newName;
        
        if (quantization) {
          // Try quantization-based naming first
          newName = `${baseName.split(':')[0]}:${baseName.split(':')[1]}-${quantization}`;
          
          // If this quantization-based name is also taken, add size info
          if (usedNames.has(newName)) {
            newName = `${baseName.split(':')[0]}:${baseName.split(':')[1]}-${quantization}-${sizeInfo}`;
          }
          
          // If still taken, add index
          if (usedNames.has(newName)) {
            newName = `${baseName.split(':')[0]}:${baseName.split(':')[1]}-${quantization}-${sizeInfo}-v${index + 1}`;
          }
        } else {
          // Use size info and version for models without clear quantization
          newName = `${baseName}-${sizeInfo}-v${index + 1}`;
        }
        
        // Ensure the name is truly unique by adding additional suffixes if needed
        let finalName = newName;
        let suffix = 1;
        while (usedNames.has(finalName) || modelNames.has(finalName)) {
          finalName = `${newName}-${suffix}`;
          suffix++;
        }
        
        // Update the model name and track it
        model.name = finalName;
        usedNames.add(finalName);
        modelNames.set(finalName, model);
        
        log.info(`Resolved name conflict: ${model.file} -> ${finalName}`);
      });
    });
    
    // Assign final names to models that didn't have conflicts
    modelNames.forEach((model, name) => {
      if (!model.name) {
        model.name = name;
      }
    });

    // Load saved performance settings to apply to configuration
    let globalPerfSettings;
    try {
      const savedSettings = await this.loadPerformanceSettings();
      if (savedSettings.success && savedSettings.settings) {
        globalPerfSettings = savedSettings.settings;
        log.info('Applying saved performance settings to configuration:', globalPerfSettings);
        } else {
        globalPerfSettings = this.getSafeDefaultConfig();
        log.info('No saved performance settings found, using safe defaults');
      }
    } catch (error) {
      log.warn('Failed to load performance settings, using safe defaults:', error.message);
      globalPerfSettings = this.getSafeDefaultConfig();
    }

    // Load individual model configurations (takes priority over global settings)
    try {
      const individualConfigs = await this.loadIndividualModelConfigurations();
      if (individualConfigs.success && individualConfigs.models && individualConfigs.models.length > 0) {
        this.customModelConfigs = individualConfigs.models;
        log.info(`Loaded ${individualConfigs.models.length} individual model configurations from disk`);
      } else {
        // Fallback to generated configurations from metadata
        const generatedConfigs = await this.getModelConfigurations();
        if (generatedConfigs.success && generatedConfigs.models) {
          this.customModelConfigs = generatedConfigs.models;
          log.info(`Generated ${generatedConfigs.models.length} individual model configurations from metadata`);
        } else {
          this.customModelConfigs = [];
          log.info('No individual model configurations found, using global settings');
        }
      }
    } catch (error) {
      log.warn('Failed to load individual model configurations:', error.message);
      this.customModelConfigs = [];
    }
    
    let configYaml = `# Auto-generated llama-swap configuration
# Models directory: ${this.modelsDir}
healthCheckTimeout: 300
logLevel: info

models:
`;

    const groupMembers = [];
    const contextSizeSummary = []; // Track context sizes for summary logging

    // Generate model configurations with dynamic GPU layer calculation
    for (const model of mainModels) {
      // Use the determined llama-server path (with backend override applied)
      // NOTE: No longer using this.binaryPaths.llamaServer directly
      
      // Check for custom model configuration
      // Try to find by generated name first, then by filename
      const customConfig = this.customModelConfigs?.find(c => c.name === model.name) || 
                          this.customModelConfigs?.find(c => c.name === model.file);
      
      // Calculate optimal performance configuration for this model
      let perfConfig;
      try {
        // Start with saved performance settings, but prioritize individual model config
        perfConfig = { ...globalPerfSettings };
        
        // If we have individual model configuration, override global settings
        if (customConfig) {
          // Override global settings with individual model configuration
          if (customConfig.threads !== undefined) perfConfig.threads = customConfig.threads;
          if (customConfig.configuredContextSize !== undefined) perfConfig.contextSize = customConfig.configuredContextSize;
          if (customConfig.flashAttention !== undefined) perfConfig.flashAttention = customConfig.flashAttention;
          if (customConfig.batchSize !== undefined) perfConfig.batchSize = customConfig.batchSize;
          if (customConfig.ubatchSize !== undefined) perfConfig.ubatchSize = customConfig.ubatchSize;
          
          log.info(`Model ${model.name}: Applied individual model configuration - threads:${perfConfig.threads}, context:${perfConfig.contextSize}, flash:${perfConfig.flashAttention}`);
        } else {
          // Apply some model-specific optimizations based on available GPU info
          try {
            const gpuInfo = await this.detectGPUInfo();
            const cpuCores = require('os').cpus().length;
            
            // Apply performance settings to configuration
            if (globalPerfSettings.threads) {
              perfConfig.threads = globalPerfSettings.threads;
            } else {
              // Fallback to auto-detection if not set
              perfConfig.threads = Math.max(1, Math.min(8, Math.floor(cpuCores / 2)));
            }

            // Apply context size from settings
            if (globalPerfSettings.maxContextSize) {
              perfConfig.contextSize = globalPerfSettings.maxContextSize;
            }

            // Apply parallel sequences from settings
            if (globalPerfSettings.parallelSequences) {
              perfConfig.parallelSequences = globalPerfSettings.parallelSequences;
            }

            // Apply optimization flags from settings
            perfConfig.flashAttention = globalPerfSettings.flashAttention !== false;
            perfConfig.optimizeFirstToken = globalPerfSettings.optimizeFirstToken || false;
            perfConfig.aggressiveOptimization = globalPerfSettings.aggressiveOptimization || false;
            perfConfig.enableContinuousBatching = globalPerfSettings.enableContinuousBatching !== false;
            
            // Apply conversation optimization settings
            if (globalPerfSettings.keepTokens) {
              perfConfig.keepTokens = globalPerfSettings.keepTokens;
            }
            if (globalPerfSettings.defragThreshold) {
              perfConfig.defragThreshold = globalPerfSettings.defragThreshold;
            }
            
            log.info(`Model ${model.name}: Applied global performance settings - threads:${perfConfig.threads}, context:${perfConfig.contextSize}, flash:${perfConfig.flashAttention}`);
          } catch (detectionError) {
            log.warn('GPU detection failed during config generation, using settings as-is:', detectionError.message);
          }
        }
        
      } catch (error) {
        // Use safe defaults if performance calculation fails
        log.warn(`Failed to calculate performance config for ${model.name}, using defaults:`, error.message);
        perfConfig = this.getSafeDefaultConfig();
      }
      
      // Determine GPU layers to use - prioritize individual model config, then user setting, then automatic calculation
      let gpuLayersToUse;
      if (customConfig?.gpuLayers !== undefined && customConfig?.gpuLayers !== null) {
        // Individual model configuration has GPU layers - use that setting
        gpuLayersToUse = customConfig.gpuLayers;
        log.info(`Model ${model.name}: Using individually-configured GPU layers: ${gpuLayersToUse}`);
      } else if (globalPerfSettings.gpuLayers !== undefined && globalPerfSettings.gpuLayers !== null) {
        // User has explicitly set GPU layers - use their setting
        gpuLayersToUse = globalPerfSettings.gpuLayers;
        log.info(`Model ${model.name}: Using user-configured GPU layers: ${gpuLayersToUse}`);
      } else {
        // No user setting - calculate optimal GPU layers for this specific model
        gpuLayersToUse = await this.calculateOptimalGPULayers(model.path, model.size);
        log.info(`Model ${model.name}: Using auto-calculated GPU layers: ${gpuLayersToUse}`);
      }
      
      // Find matching mmproj model for this main model
      const matchingMmproj = await this.findMatchingMmproj(model, mmprojModels);
      
      // Use different port for embedding models
      const isEmbedding = this.isEmbeddingModel(model.file);
      const modelPort = isEmbedding ? 9998 : 9999;
      
      let cmdLine = `      "${llamaServerPath}"
      -m "${model.path}"
      --port ${modelPort}`;

      // Add --jinja parameter for all models
      cmdLine += ` --jinja --no-warmup`;
      
      // Add GPU layers based on user setting or calculation
      if (gpuLayersToUse > 0) {
        cmdLine += ` --n-gpu-layers ${gpuLayersToUse}`;
        log.info(`Model ${model.name}: Using ${gpuLayersToUse} GPU layers`);
      } else {
        log.info(`Model ${model.name}: Using CPU only (0 GPU layers)`);
      }
      
      // Add mmproj parameter if a matching mmproj model is found
      if (matchingMmproj) {
        cmdLine += `
      --mmproj "${matchingMmproj.path}"`;
      }
      
      // Add embedding pooling type for embedding models
      log.info(`Model ${model.name}: isEmbeddingModel: ${isEmbedding}, port: ${modelPort}`);
      if (isEmbedding) {
        log.info(`Model ${model.name}: Using embedding pooling type: mean`);
        cmdLine += ` --pooling mean`;
        cmdLine += ` --embeddings`;
        log.info(`Model ${model.name}: Embeddings support enabled`);
      }
      
      // Check for custom model configuration for threads
      
      // CPU optimization from performance settings
      const threads = customConfig?.threads || perfConfig.threads;
      cmdLine += ` --threads ${threads}`;
      if (customConfig?.threads) {
        log.info(`Model ${model.name}: Using custom thread count: ${threads}`);
      }
      
      // **CRITICAL KV CACHE OPTIMIZATIONS FOR CONVERSATIONAL SPEED**
      
      // 1. Context window optimization - extract context size from model's GGUF metadata
      let contextSize;
      let modelMetadata = null;
      
      // Extract context size from model's GGUF metadata
      try {
        modelMetadata = await this.extractGGUFMetadata(model.path);
        if (modelMetadata && modelMetadata.contextSize) {
          contextSize = modelMetadata.contextSize;
          log.info(`🧠 Model ${model.name}: Found native context size: ${contextSize.toLocaleString()} tokens`);
        }
      } catch (error) {
        log.warn(`Model ${model.name}: Could not extract GGUF metadata: ${error.message}`);
      }
      
      if (!isEmbedding && customConfig?.configuredContextSize) {
        // Use custom configured context size
        contextSize = customConfig.configuredContextSize;
        cmdLine += ` --ctx-size ${contextSize}`;
        log.info(`🎛️ Model ${model.name}: Using custom-configured context size: ${contextSize.toLocaleString()} tokens`);
      } else if (!isEmbedding && perfConfig.contextSize) {
        // User has explicitly set a context size - use their setting (overrides model metadata)
        contextSize = perfConfig.contextSize;
        cmdLine += ` --ctx-size ${contextSize}`;
        log.info(`🎛️ Model ${model.name}: Using user-configured context size: ${contextSize.toLocaleString()} (overriding native: ${modelMetadata?.contextSize?.toLocaleString() || 'unknown'})`);
      } else if (isEmbedding) {
        // For embedding models, never add context size - let llama-server decide automatically
        log.info(`🔤 Model ${model.name}: Embedding model - letting llama-server auto-detect context size`);
        contextSize = 8192; // Default fallback for keep token calculation only (not used in command line)
      } else if (contextSize) {
        // Use the extracted context size from model metadata
        cmdLine += ` --ctx-size ${contextSize}`;
        log.info(`📖 Model ${model.name}: Using model's native context size: ${contextSize.toLocaleString()} tokens`);
      } else {
        // No metadata found - use reasonable default
        contextSize = 8192;
        cmdLine += ` --ctx-size ${contextSize}`;
        log.info(`⚠️ Model ${model.name}: Could not determine native context size, using default: ${contextSize.toLocaleString()} tokens`);
      }
      
      // 2. Batch size optimization - prioritize individual model config, then user settings, then automatic calculation
      let batchSize, ubatchSize;
      if (customConfig?.batchSize !== undefined && customConfig?.ubatchSize !== undefined) {
        // Individual model configuration has batch sizes - use those settings
        batchSize = customConfig.batchSize;
        ubatchSize = customConfig.ubatchSize;
        log.info(`Model ${model.name}: Using individually-configured batch sizes: ${batchSize}/${ubatchSize}`);
      } else if (globalPerfSettings.batchSize !== undefined && globalPerfSettings.ubatchSize !== undefined) {
        // User has explicitly set batch sizes - use their settings
        batchSize = globalPerfSettings.batchSize;
        ubatchSize = globalPerfSettings.ubatchSize;
        log.info(`Model ${model.name}: Using user-configured batch sizes: ${batchSize}/${ubatchSize}`);
      } else {
        // No user setting - calculate optimal batch sizes
        const calculatedSizes = this.calculateTTFTOptimizedBatchSizes(
          model.size / (1024 * 1024 * 1024),
          { hasGPU: gpuLayersToUse > 0, gpuMemoryGB: 16 }
        );
        batchSize = calculatedSizes.batchSize;
        ubatchSize = calculatedSizes.ubatchSize;
        log.info(`Model ${model.name}: Using auto-calculated batch sizes: ${batchSize}/${ubatchSize}`);
      }
      cmdLine += ` --batch-size ${batchSize}`;
      cmdLine += ` --ubatch-size ${ubatchSize}`;
      
      // 3. KV Cache retention for fast subsequent responses - use saved setting or calculate
      const keepTokens = perfConfig.keepTokens || Math.min(1024, Math.floor(contextSize * 0.25));
      cmdLine += ` --keep ${keepTokens}`;
      
      // 4. Cache efficiency settings - use saved setting or default
      const defragThreshold = perfConfig.defragThreshold || 0.1;
      cmdLine += ` --defrag-thold ${defragThreshold}`;
      
      // 5. Memory optimization for conversations - prioritize individual model config over global setting
      const useMemoryLock = customConfig?.memoryLock !== undefined ? 
        customConfig.memoryLock : (globalPerfSettings.memoryLock !== false);
      if (useMemoryLock) {
        cmdLine += ` --mlock`; // Lock model in memory for consistent performance
        log.info(`Model ${model.name}: Memory lock enabled`);
      } else {
        log.info(`Model ${model.name}: Memory lock disabled`);
      }
      
      // 6. Parallel processing optimization - use saved setting
      cmdLine += ` --parallel ${perfConfig.parallelSequences || 1}`;
      
      // 7. Flash attention if enabled in individual model config or global settings
      const useFlashAttention = customConfig?.flashAttention !== undefined ? 
        customConfig.flashAttention : perfConfig.flashAttention;
      if (useFlashAttention) {
        cmdLine += ` --flash-attn`;
      }
      
      // 8. Continuous batching for better multi-turn performance - use saved setting
      if (perfConfig.enableContinuousBatching && !perfConfig.optimizeFirstToken) {
        cmdLine += ` --cont-batching`;
      }
      
      // 9. Cache type optimization
      if (perfConfig.kvCacheType && perfConfig.kvCacheType !== 'f16') {
        cmdLine += ` --cache-type-k ${perfConfig.kvCacheType}`;
        cmdLine += ` --cache-type-v ${perfConfig.kvCacheType}`;
      }
      
      // 10. Context shift for handling long conversations - DISABLED (not supported by llama-server yet)
      // if (perfConfig.enableContextShift !== false && !isEmbedding) {
      //   cmdLine += ` --ctx-shift`;
      //   log.info(`Model ${model.name}: Context shift enabled for long conversations`);
      // }
      
      // TTFT-specific optimizations (only when explicitly enabled in settings)
      if (perfConfig.optimizeFirstToken) {
        log.info(`Model ${model.name}: TTFT mode enabled - optimizing for first token speed`);
        
        // Use fewer threads for batch processing to reduce contention during prefill
        const batchThreads = Math.max(1, Math.floor(perfConfig.threads / 2));
        cmdLine += ` --threads-batch ${batchThreads}`;
        
        // Skip warmup to get to first token faster (warmup is for benchmarking)
        cmdLine += ` --no-warmup`;
        
        // TTFT mode: smaller context for faster initial response (only if user set explicit context and not embedding model)
        if (!isEmbedding && perfConfig.contextSize) {
          const ttftContextSize = Math.min(8192, contextSize);
          cmdLine = cmdLine.replace(`--ctx-size ${contextSize}`, `--ctx-size ${ttftContextSize}`);
          log.info(`Model ${model.name}: TTFT context override: ${ttftContextSize}`);
        } else if (!isEmbedding) {
          // For auto-detected context, add a reasonable TTFT limit (but not for embedding models)
          cmdLine += ` --ctx-size 8192`;
          log.info(`Model ${model.name}: TTFT context limit: 8192 (overriding auto-detection for speed)`);
        } else {
          log.info(`Model ${model.name}: Embedding model - skipping TTFT context override, letting llama-server decide`);
        }
        
        // TTFT mode: more aggressive cache clearing for speed over efficiency
        cmdLine = cmdLine.replace(`--defrag-thold ${defragThreshold}`, `--defrag-thold 0.05`);
        
        // TTFT mode: disable continuous batching
        cmdLine = cmdLine.replace(` --cont-batching`, '');
        
        log.info(`Model ${model.name}: TTFT optimizations applied - keep: ${keepTokens}`);
      } else {
        log.info(`Model ${model.name}: Conversational mode - optimizing for multi-turn chat speed`);
        if (perfConfig.contextSize) {
          log.info(`Model ${model.name}: Context: ${contextSize}, Keep: ${keepTokens}, Batch: ${batchSize}`);
        } else {
          log.info(`Model ${model.name}: Context: auto-detected, Keep: ${keepTokens}, Batch: ${batchSize}`);
        }
      }
      
      // Get platform-specific environment variables for the model process
      const platformEnv = this.platformManager.getPlatformEnvironment();
      
      // Build environment variables array for the YAML config
      let envVars = [];
      if (this.platformInfo.isLinux && platformEnv.LD_LIBRARY_PATH) {
        envVars.push(`LD_LIBRARY_PATH=${platformEnv.LD_LIBRARY_PATH}`);
      } else if (this.platformInfo.isMac && platformEnv.DYLD_LIBRARY_PATH) {
        envVars.push(`DYLD_LIBRARY_PATH=${platformEnv.DYLD_LIBRARY_PATH}`);
      }
      
      // Add CUDA environment variables if available
      if (process.env.CUDA_VISIBLE_DEVICES) {
        envVars.push(`CUDA_VISIBLE_DEVICES=${process.env.CUDA_VISIBLE_DEVICES}`);
      }
      
      configYaml += `  "${model.name}":
    proxy: "http://127.0.0.1:${modelPort}"
    cmd: |
${cmdLine}`;

      // Add environment variables if any are needed
      if (envVars.length > 0) {
        configYaml += `
    env:`;
        envVars.forEach(envVar => {
          configYaml += `
      - "${envVar}"`;
        });
      }

      configYaml += `
    ttl: 300

`;
      
      // Track context size for summary logging
      contextSizeSummary.push({
        name: model.name,
        contextSize: contextSize,
        source: !isEmbedding && perfConfig.contextSize ? 'user-configured' : 
                isEmbedding ? 'embedding-auto' :
                modelMetadata?.contextSize ? 'model-metadata' : 'default'
      });
      
      groupMembers.push(model.name);
    }

    // Separate models into embedding and regular groups
    const embeddingModels = [];
    const regularModels = [];
    
    groupMembers.forEach(memberName => {
      const model = mainModels.find(m => m.name === memberName);
      if (model && this.isEmbeddingModel(model.file)) {
        embeddingModels.push(memberName);
      } else {
        regularModels.push(memberName);
      }
    });

    // Add groups configuration
    configYaml += `groups:`;
    
    // Embedding models group - persistent and non-exclusive so they can run alongside other models
    if (embeddingModels.length > 0) {
      configYaml += `
  "embedding_models":
    # Allow multiple embedding models to run together
    swap: false
    # Don't unload other groups when embedding models start
    exclusive: false
    # Prevent other groups from unloading embedding models
    persistent: true
    members:
`;
      embeddingModels.forEach(member => {
        configYaml += `      - "${member}"\n`;
      });
    }
    
    // Regular models group - traditional swapping behavior
    if (regularModels.length > 0) {
      configYaml += `
  "regular_models":
    # Only one regular model at a time (traditional behavior)
    swap: true
    # Unload other non-persistent groups when loading
    exclusive: true
    members:
`;
      regularModels.forEach(member => {
        configYaml += `      - "${member}"\n`;
      });
    }

    await fs.writeFile(this.configPath, configYaml);
    
    // Wait a moment for the file system to ensure the config is fully written
    log.info('⏱️ Configuration written, ensuring file system sync...');
    await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
    
    // Verify the config file was written successfully
    try {
      const verifyContent = await fs.readFile(this.configPath, 'utf8');
      if (verifyContent.length < configYaml.length * 0.9) {
        log.warn('⚠️ Config file verification shows incomplete write, waiting longer...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Additional 2 second delay
      }
    } catch (verifyError) {
      log.warn('⚠️ Config file verification failed, but continuing:', verifyError.message);
    }
    
    log.info('Dynamic config generated with', mainModels.length, 'models using saved performance settings');
    
    // Log context size summary
    if (contextSizeSummary.length > 0) {
      log.info('📚 Model Context Size Summary:');
      for (const { name, contextSize, source } of contextSizeSummary) {
        const sizeStr = contextSize ? contextSize.toLocaleString() : 'auto';
        const emoji = source === 'user-configured' ? '🎛️' : 
                     source === 'model-metadata' ? '📖' : 
                     source === 'embedding-auto' ? '🔤' : '⚠️';
        log.info(`   ${emoji} ${name}: ${sizeStr} tokens (${source})`);
      }
    }
    
    return { models: mainModels.length };
  }

  // Helper method to check if a file is an mmproj model
  isMmprojModel(filename) {
    return filename.toLowerCase().includes('mmproj') || 
           filename.toLowerCase().includes('mm-proj') ||
           filename.toLowerCase().includes('projection');
  }

  // Helper method to find matching mmproj model for a main model
  async findMatchingMmproj(mainModel, mmprojModels) {
    const mainModelName = mainModel.name.toLowerCase();
    const mainModelFile = mainModel.file.toLowerCase();
    
    log.info(`Looking for mmproj model for: ${mainModel.name}`);
    
    // Track whether we have any saved mappings system at all
    let hasSavedMappingsSystem = false;
    let foundValidSavedMapping = false;
    
    // FIRST: Check for saved mmproj mappings (highest priority)
    try {
      const mappingsResult = await this.loadMmprojMappings();
      if (mappingsResult.success && mappingsResult.mappings) {
        hasSavedMappingsSystem = true; // We have a mappings system
        const mappingsCount = Object.keys(mappingsResult.mappings).length;
        log.info(`🔍 Checking ${mappingsCount} saved mmproj mappings for model: ${mainModel.name}`);
        
        const savedMapping = mappingsResult.mappings[mainModel.path];
        if (savedMapping && savedMapping.mmprojPath) {
          log.info(`📌 Found saved mmproj mapping for ${mainModel.name}: ${savedMapping.mmprojPath}`);
          
          // Verify the mapped mmproj file still exists
          if (fsSync.existsSync(savedMapping.mmprojPath)) {
            log.info(`✅ Using saved mmproj mapping: ${savedMapping.mmprojName} for ${mainModel.name} (${savedMapping.isManual ? 'manual' : 'automatic'})`);
            foundValidSavedMapping = true;
            return {
              name: savedMapping.mmprojName,
              file: savedMapping.mmprojName,
              path: savedMapping.mmprojPath,
              source: savedMapping.isManual ? 'manual' : 'automatic',
              isFromSavedMapping: true
            };
          } else {
            log.warn(`⚠️ Saved mmproj mapping points to non-existent file: ${savedMapping.mmprojPath}`);
            // Continue to automatic detection as fallback
          }
        } else {
          log.info(`📝 No saved mapping found for model: ${mainModel.name} (${mainModel.path})`);
        }
      } else {
        log.info(`📂 No mmproj mappings file found - will use automatic detection for ${mainModel.name}`);
      }
    } catch (error) {
      log.warn('Error loading saved mmproj mappings:', error.message);
      // Continue to automatic detection as fallback
    }
    
    // SECOND: Try to find a specifically matching mmproj model by name (automatic detection)
    // ONLY if no saved mappings system exists - this prevents overriding user's manual assignments
    if (!hasSavedMappingsSystem) {
      const mainModelBaseName = this.getModelBaseName(mainModel.file);
      
      for (const mmprojModel of mmprojModels) {
        const mmprojBaseName = this.getModelBaseName(mmprojModel.file);
        
        // Check if they share a common base name (e.g., "Qwen2.5-VL-7B")
        if (this.modelsMatch(mainModelBaseName, mmprojBaseName)) {
          log.info(`Found matching mmproj model: ${mmprojModel.file} for ${mainModel.name} (no saved mappings exist)`);
          return mmprojModel;
        }
      }
    } else {
      log.info(`🚫 Automatic name-based mmproj detection skipped for ${mainModel.name} - respecting user's saved mappings system`);
    }
    
    // Special handling for gemma models - ONLY if no saved mappings system exists
    // This prevents overriding user's manual mmproj assignments
    if (!hasSavedMappingsSystem && (mainModelName.includes('gemma') || mainModelFile.includes('gemma'))) {
      log.info(`Gemma model detected: ${mainModel.name}, no saved mappings exist - checking for compatible mmproj...`);
      
      // Check multiple possible locations for the mmproj file
      const possiblePaths = [
        path.join(this.baseDir, 'models', 'mmproj-model-f16.gguf'),
        path.join(this.modelsDir, 'mmproj-model-f16.gguf'),
        path.join(this.baseDir, 'mmproj-model-f16.gguf')
      ];
      
      // Also check if there's already a mmproj model in the scanned models
      const existingMmproj = mmprojModels.find(m => m.file === 'mmproj-model-f16.gguf');
      if (existingMmproj) {
        log.info(`Found existing generic mmproj model for Gemma: ${existingMmproj.path}`);
        log.warn(`⚠️ Using generic mmproj - may cause embedding dimension mismatch. Consider downloading model-specific mmproj.`);
        return existingMmproj;
      }
      
      // Check each possible path
      for (const bundledMmprojPath of possiblePaths) {
        log.info(`Checking mmproj path: ${bundledMmprojPath}`);
        if (fsSync.existsSync(bundledMmprojPath)) {
          log.info(`Found bundled mmproj for Gemma model at: ${bundledMmprojPath}`);
          log.warn(`⚠️ Using generic bundled mmproj - may cause embedding dimension mismatch. Consider downloading model-specific mmproj.`);
          return {
            name: 'mmproj-model-f16',
            file: 'mmproj-model-f16.gguf',
            path: bundledMmprojPath,
            source: 'bundled'
          };
        }
      }
      
      log.warn(`Gemma model detected but no compatible mmproj file found. Checked paths:`, possiblePaths);
    } else if (hasSavedMappingsSystem && (mainModelName.includes('gemma') || mainModelFile.includes('gemma'))) {
      log.info(`🚫 Gemma model detected but saved mappings system exists - respecting user's mmproj choices for ${mainModel.name}`);
    }
    
    // For vision/multimodal models that don't have a specific mmproj match,
    // check if this appears to be a vision model and use bundled mmproj as fallback
    // ONLY if no saved mappings system exists - this prevents overriding user's choices
    if (!hasSavedMappingsSystem && this.isVisionModel(mainModel.file)) {
      const bundledMmprojPath = path.join(this.baseDir, 'models', 'mmproj-model-f16.gguf');
      
      if (fsSync.existsSync(bundledMmprojPath)) {
        log.info(`Using bundled mmproj for vision model: ${mainModel.name} (no saved mappings exist)`);
        log.warn(`⚠️ Using generic bundled mmproj - may cause embedding dimension mismatch. Consider downloading model-specific mmproj.`);
        return {
          name: 'mmproj-model-f16',
          file: 'mmproj-model-f16.gguf',
          path: bundledMmprojPath,
          source: 'bundled'
        };
      }
    } else if (hasSavedMappingsSystem && this.isVisionModel(mainModel.file)) {
      log.info(`🚫 Vision model detected but saved mappings system exists - respecting user's mmproj choices for ${mainModel.name}`);
    }
    
    log.info(`ℹ️ No mmproj model found for ${mainModel.name} - model will run without multimodal capabilities`);
    return null;
  }

  // Helper method to detect vision/multimodal models
  isVisionModel(filename) {
    const visionKeywords = ['vl', 'vision', 'multimodal', 'mm', 'clip', 'siglip'];
    const lowerFilename = filename.toLowerCase();
    
    return visionKeywords.some(keyword => lowerFilename.includes(keyword));
  }

  // Helper method to detect embedding models
  isEmbeddingModel(filename) {
    const embeddingKeywords = [
      'embed', 'embedding', 'embeddings',
      'mxbai', 'nomic', 'bge', 'e5',
      'sentence-transformer', 'sentence_transformer',
      'all-minilm', 'all_minilm'
    ];
    const lowerFilename = filename.toLowerCase();
    
    return embeddingKeywords.some(keyword => lowerFilename.includes(keyword));
  }

  // Helper method to extract base model name from filename
  getModelBaseName(filename) {
    return filename
      .replace('.gguf', '')
      .replace(/-(mmproj|mm-proj|projection).*$/i, '')
      .replace(/-(q4_k_m|q4_k_s|q8_0|f16|instruct).*$/i, '')
      .toLowerCase();
  }

  // Helper method to check if two model names match
  modelsMatch(baseName1, baseName2) {
    // Remove common suffixes and compare
    const normalized1 = baseName1.replace(/-(instruct|chat|it)$/i, '');
    const normalized2 = baseName2.replace(/-(instruct|chat|it)$/i, '');
    
    return normalized1 === normalized2 || 
           normalized1.includes(normalized2) || 
           normalized2.includes(normalized1);
  }

  async start(skipConfigGeneration = false) {
    if (this.ipcLogger) {
      this.ipcLogger.logServiceCall('LlamaSwapService', 'start');
    }
    
    // Prevent concurrent start attempts
    if (this.isRunning) {
      log.info('Llama-swap service is already running');
      return { success: true, message: 'Service already running' };
    }
    
    if (this.isStarting) {
      log.info('Llama-swap service is already starting, waiting for completion...');
      
      // Check if startup has been stuck for too long
      const now = Date.now();
      const startingDuration = this.startingTimestamp ? (now - this.startingTimestamp) / 1000 : 0;
      
      if (startingDuration > 120) { // 2 minutes
        log.error(`🚨 Service has been stuck in starting state for ${Math.round(startingDuration)} seconds!`);
        log.error('🔧 Force resetting starting state and attempting fresh start...');
        
        this.isStarting = false;
        this.startingTimestamp = null;
        
        // Clean up any stuck processes
        try {
          await this.cleanup();
          await this.cleanupStaleProcesses();
        } catch (cleanupError) {
          log.warn('Cleanup during force reset failed:', cleanupError.message);
        }
        
        // Recursive call for fresh start
        return await this.start();
      }
      
      // Wait for the current start attempt to complete
      let attempts = 0;
      while (this.isStarting && attempts < 30) { // Wait up to 30 seconds
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      if (this.isRunning) {
        return { success: true, message: 'Service started by concurrent request' };
      } else {
        return { success: false, error: 'Concurrent start attempt failed or timed out' };
      }
    }
    
    this.isStarting = true;
    this.startingTimestamp = Date.now();
    this.setStartupPhase('Initializing Clara\'s Pocket...');
    
    try {
      // Reset retry flags for fresh start attempt
      this.flashAttentionRetryAttempted = false;
      this.portRetryAttempted = false;
      this.handleFlashAttentionRequired = false;
      this.needsPortRetry = false;

      // ===== COMPREHENSIVE GPU & BINARY SETUP (ALWAYS RUN) =====
      this.setStartupPhase('Checking GPU and binary setup...');
      log.info('🚀 Starting comprehensive GPU and binary verification...');
      
      try {
        // Step 1: Always check and setup GPU-specific folders if missing (with timeout)
        log.info('🔍 Step 1: Ensuring GPU folders and binaries...');
        const setupPromise = this.ensureGPUFoldersAndBinaries();
        const setupResult = await Promise.race([
          setupPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('GPU setup timeout after 60 seconds')), 60000)
          )
        ]);
        log.info('✅ Step 1 completed:', setupResult.message || 'GPU setup finished');
        
        // Step 2: Verify current GPU detection and folder selection (with timeout)
        log.info('🔍 Step 2: Verifying current GPU setup...');
        const verifyPromise = this.verifyCurrentGPUSetup();
        const verifyResult = await Promise.race([
          verifyPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('GPU verification timeout after 30 seconds')), 30000)
          )
        ]);
        log.info('✅ Step 2 completed:', verifyResult.message || 'GPU verification finished');
        
      } catch (gpuError) {
        log.error('⚠️ GPU setup/verification failed, but service will continue:', gpuError.message);
        log.info('🔄 Service will attempt to use available binaries...');
        
        // Don't fail the entire startup just because GPU setup failed
        // The service can still work with base binaries
      }

      // Check for stale processes after updates
      this.setStartupPhase('Cleaning up previous processes...');
      await this.cleanupStaleProcesses();

      // macOS Security Pre-check - Prepare for potential firewall prompts
      if (process.platform === 'darwin') {
        this.setStartupPhase('Checking macOS security permissions...');
        log.info('🔒 macOS detected - checking network security requirements...');
        
        if (this.ipcLogger) {
          this.ipcLogger.logServiceCall('LlamaSwapService', 'macOS-security-check');
        }
        
        // Check if port is already in use (could indicate permission issues)
        try {
          const net = require('net');
          const server = net.createServer();
          
          await new Promise((resolve, reject) => {
            server.listen(this.port, '127.0.0.1', () => {
              server.close();
              resolve(true);
            });
            
            server.on('error', (err) => {
              if (err.code === 'EADDRINUSE') {
                log.warn(`⚠️ Port ${this.port} already in use - may indicate permission or conflict issues`);
              }
              reject(err);
            });
          });
          
          log.info('✅ Port availability check passed');
        } catch (portError) {
          if (portError.code === 'EADDRINUSE') {
            log.warn(`⚠️ Port ${this.port} is already in use. This may cause permission prompts.`);
          }
          if (this.ipcLogger) {
            this.ipcLogger.logError('LlamaSwapService.portCheck', portError);
          }
        }
        
        log.info('🔓 Network security check complete. Starting service...');
        log.info('💡 If macOS shows a firewall prompt, please click "Allow" to enable local AI functionality.');
      }

      // Verify and repair binaries after potential updates
      this.setStartupPhase('Verifying binary files...');
      log.info('🔧 Verifying binary integrity after potential updates...');
      await this.verifyAndRepairBinariesAfterUpdate();

      // Validate binaries before attempting to start (this will auto-download if missing)
      this.setStartupPhase('Validating installation...');
      log.info('🔍 Final binary validation before startup...');
      await this.validateBinaries();
      
      // Ensure models directory and config exist
      this.setStartupPhase('Setting up directories and models...');
      await this.ensureDirectories();
      
      // Generate configuration and wait for it to be properly written (unless skipped)
      if (!skipConfigGeneration) {
        this.setStartupPhase('Generating configuration...');
        log.info('⚙️ Generating llama-swap configuration...');
        await this.generateConfig();
        
        // Wait a bit after config generation to ensure files are properly written to disk
        this.setStartupPhase('Finalizing configuration...');
        log.info('⏱️ Waiting for configuration to be fully written...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      } else {
        this.setStartupPhase('Using existing configuration...');
        log.info('⏭️ Skipping configuration generation - using existing optimized config');
      }
      
      // Additional verification that config file exists and is readable
      this.setStartupPhase('Verifying configuration...');
      try {
        await fs.access(this.configPath, fs.constants.F_OK | fs.constants.R_OK);
        const configContent = await fs.readFile(this.configPath, 'utf8');
        if (configContent.length < 100) {
          this.setStartupPhase('Waiting for configuration to complete...');
          log.warn('⚠️ Configuration file seems too small, waiting longer...');
          await new Promise(resolve => setTimeout(resolve, 3000)); // Additional 3 second delay
        }
        log.info('✅ Configuration file verified and ready');
      } catch (configError) {
        log.error('❌ Configuration file verification failed:', configError.message);
        throw new Error(`Configuration file not ready: ${configError.message}`);
      }

      this.setStartupPhase('Starting service...');
      log.info('🚀 All checks passed - starting llama-swap service...');
      log.info(`🎮 Platform: ${this.platformInfo.platformDir}`);
      log.info(`📁 Binary path: ${this.binaryPaths.llamaSwap}`);
      log.info(`📁 Config path: ${this.configPath}`);
      log.info(`🌐 Port: ${this.port}`);

      // Fixed command line arguments according to the binary's help output
      const args = [
        '-config', this.configPath,
        '-listen', `127.0.0.1:${this.port}` // Bind to localhost only for better security
      ];

      log.info(`🚀 Starting with args: ${args.join(' ')}`);
      
      if (this.ipcLogger) {
        this.ipcLogger.logProcessSpawn(this.binaryPaths.llamaSwap, args, {
          port: this.port,
          config: this.configPath
        });
      }

      // Final port check right before spawning - catch any lingering processes
      this.setStartupPhase('Checking port availability...');
      log.info('🔍 Performing final port availability check...');
      await this.killProcessesOnPort(this.port);
      
      // Double-check port is actually free by trying to bind to it briefly
      try {
        const net = require('net');
        const testServer = net.createServer();
        
        await new Promise((resolve, reject) => {
          testServer.listen(this.port, '127.0.0.1', () => {
            testServer.close();
            log.info(`✅ Port ${this.port} is available for use`);
            resolve();
          });
          
          testServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              log.error(`❌ Port ${this.port} is still in use after cleanup attempts`);
              reject(new Error(`Port ${this.port} is still in use after cleanup. Please manually stop any processes using this port.`));
            } else {
              reject(err);
            }
          });
        });
      } catch (portError) {
        if (this.ipcLogger) {
          this.ipcLogger.logError('LlamaSwapService.finalPortCheck', portError);
        }
        throw portError;
      }

      // Final preparation delay - ensure all file operations are complete
      this.setStartupPhase('Final preparations...');
      log.info('⏱️ Final preparation before spawning process...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second final delay

      this.setStartupPhase('Launching Clara\'s Pocket...');
      this.process = spawn(this.binaryPaths.llamaSwap, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.platformManager.getPlatformEnvironment(),
        detached: false
      });

      this.isRunning = true;
      this.setStartupPhase('Waiting for service to respond...');
      
      if (this.ipcLogger) {
        this.ipcLogger.logServiceCall('LlamaSwapService', 'processSpawned', { pid: this.process.pid });
      }
      
      // Start process monitoring to prevent zombie processes after updates
      this.startProcessMonitoring();

      // Handle process output
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        log.info(`llama-swap stdout: ${output.trim()}`);
        
        // Parse progress information for UI feedback
        this.parseProgressFromOutput(output);
        
        // Check for successful startup - look for different possible success messages
        if (output.includes(`listening on`) || 
            output.includes(`server started`) ||
            output.includes(`:${this.port}`)) {
          this.setStartupPhase('Service ready!');
          log.info(`✅ llama-swap service started successfully on port ${this.port}`);
          if (this.ipcLogger) {
            this.ipcLogger.logServiceCall('LlamaSwapService', 'startupSuccess', { port: this.port });
          }
        }
        
        this.parseProgressFromOutput(output);
      });

      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        log.error(`llama-swap stderr: ${error.trim()}`);
        
        if (this.ipcLogger) {
          this.ipcLogger.logServiceCall('LlamaSwapService', 'stderr', { error: error.trim() });
        }
        
        // Check for V cache quantization error that requires flash attention
        if (error.includes('V cache quantization requires flash_attn') || 
            error.includes('failed to create context with model')) {
          log.warn('⚠️ Model requires flash attention for V cache quantization - will retry with flash attention enabled');
          this.handleFlashAttentionRequired = true;
        }
        
        // Enhanced error handling for common issues
        if (error.includes('bind: address already in use') || 
            error.includes('bind: Only one usage of each socket address')) {
          log.error(`❌ Port ${this.port} is already in use - attempting automatic cleanup and retry`);
          
          // Mark for automatic retry with port cleanup
          this.needsPortRetry = true;
        }
        if (error.includes('no such file or directory')) {
          log.error('❌ Binary or config file not found');
        }
        if (error.includes('permission denied') || error.includes('Operation not permitted')) {
          log.error('🔒 Permission denied - this may be due to macOS security restrictions.');
          log.error('💡 If you saw a firewall prompt, make sure you clicked "Allow".');
          log.error('🔧 To fix: Go to System Preferences → Security & Privacy → Firewall → Firewall Options');
          log.error('📝 Find your Clara app and ensure it\'s set to "Allow incoming connections"');
        }
        if (error.includes('bind') && error.includes('cannot assign requested address')) {
          log.error('🌐 Network binding failed - possible firewall or permission issue');
          log.error('💡 This often happens if macOS firewall permission was denied');
        }
      });

      this.process.on('close', (code) => {
        log.info(`llama-swap process exited with code ${code}`);
        this.isRunning = false;
        this.process = null;
        
        if (this.ipcLogger) {
          this.ipcLogger.logProcessExit('llama-swap', code);
        }
        
        if (code !== 0 && code !== null) {
          log.error(`llama-swap service failed with exit code ${code}`);
          
          // If we detected a flash attention requirement, mark for retry
          if (this.handleFlashAttentionRequired) {
            log.info('🔄 Preparing automatic retry with flash attention enabled...');
          }
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
        this.setStartupPhase('Verifying service health...');
        log.info('✅ llama-swap process is running, checking if service is responding...');
        
        // Try to check if the service is actually responding
        try {
          await this.waitForService(10); // Wait up to 10 seconds
          this.setStartupPhase(null); // Clear startup phase when fully ready
          log.info('✅ llama-swap service is responding to requests');
          return { success: true, message: 'Service started successfully' };
        } catch (serviceError) {
          this.setStartupPhase('Service starting but not ready yet...');
          log.warn('⚠️ llama-swap process started but service is not responding:', serviceError.message);
          return { success: true, message: 'Service started but not responding yet', warning: serviceError.message };
        }
      } else {
        this.isRunning = false;
        this.setStartupPhase(null); // Clear startup phase on failure
        
        // Check if we need to retry with flash attention enabled
        if (this.handleFlashAttentionRequired && !this.flashAttentionRetryAttempted) {
          log.info('🔄 Automatically retrying with flash attention enabled...');
          this.flashAttentionRetryAttempted = true;
          this.handleFlashAttentionRequired = false;
          
          // Force regenerate config with flash attention enabled
          await this.enableFlashAttentionAndRegenerate();
          
          // Recursive retry
          this.isStarting = false; // Reset flag before recursive call
          return await this.start();
        }
        
        // Check if we need to retry due to port binding issues
        if (this.needsPortRetry && !this.portRetryAttempted) {
          log.info('🔄 Automatically retrying after port cleanup...');
          this.portRetryAttempted = true;
          this.needsPortRetry = false;
          
          // Force kill all processes on the port
          await this.killProcessesOnPort(this.port);
          
          // Wait a bit longer for cleanup
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Recursive retry
          this.isStarting = false; // Reset flag before recursive call
          return await this.start();
        }
        
        const errorMsg = this.handleFlashAttentionRequired 
          ? 'Model requires flash attention but retry failed. Please enable flash attention in GPU Diagnostics → Performance Settings.'
          : 'llama-swap process failed to start or exited immediately';
        log.error(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      log.error('Error starting llama-swap service:', error);
      this.isRunning = false;
      this.process = null;
      this.setStartupPhase(null); // Clear startup phase on error
      
      return { 
        success: false, 
        error: error.message,
        diagnostics: error.diagnostics || null
      };
    } finally {
      // Always reset the starting flag
      this.isStarting = false;
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
      
      // Enhanced timeout with graceful degradation
      const timeout = setTimeout(() => {
        if (this.process) {
          log.warn('Graceful shutdown timeout, attempting force kill...');
          
          // Try different kill signals in sequence
          try {
            this.process.kill('SIGKILL');
          } catch (killError) {
            log.warn('SIGKILL failed, trying alternative methods:', killError.message);
            
            // On Windows, try taskkill as fallback
            if (process.platform === 'win32' && this.process.pid) {
              try {
                const { spawn } = require('child_process');
                spawn('taskkill', ['/F', '/T', '/PID', this.process.pid.toString()], {
                  stdio: 'ignore'
                });
                log.info('Used taskkill as fallback for process termination');
              } catch (taskillError) {
                log.warn('Taskkill fallback also failed:', taskillError.message);
              }
            }
          }
        }
        this.cleanup();
        resolve(true);
      }, 8000); // Increased timeout for updated binaries

      this.process.once('close', () => {
        clearTimeout(timeout);
        this.cleanup();
        log.info('llama-swap service stopped gracefully');
        resolve(true);
      });

      this.process.once('error', (error) => {
        clearTimeout(timeout);
        log.warn('Error during stop process:', error.message);
        this.cleanup();
        resolve(true);
      });

      // Try graceful shutdown first
      try {
        this.process.kill('SIGTERM');
      } catch (error) {
        log.warn('SIGTERM failed, will use timeout fallback:', error.message);
        // Let timeout handle the force kill
      }
    });
  }

  cleanup() {
    this.isRunning = false;
    this.isStarting = false; // Reset starting flag
    this.startingTimestamp = null; // Reset starting timestamp
    this.currentStartupPhase = null; // Reset startup phase
    this.process = null;
    // Reset flash attention retry flags for next start attempt
    this.handleFlashAttentionRequired = false;
    this.flashAttentionRetryAttempted = false;
    this.forceFlashAttention = false;
    
    // Additional cleanup for updated binaries
    // Clear any cached process references
    if (this.processMonitor) {
      clearInterval(this.processMonitor);
      this.processMonitor = null;
    }
  }

  /**
   * Set the current startup phase for user feedback
   */
  setStartupPhase(phase) {
    this.currentStartupPhase = phase;
    // Only log when there's an actual phase to report
    if (phase !== null) {
      log.info(`📱 Startup Phase: ${phase}`);
    }
  }

  async restart(skipConfigRegeneration = false) {
    log.info('Restarting llama-swap service...');
    await this.stop();
    
    // Additional cleanup to ensure fresh start after updates
    this.cleanup();
    
    // Longer wait time to ensure process cleanup after binary updates
    log.info('⏱️ Waiting for process cleanup after restart...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Regenerate config to ensure compatibility with updated binaries (unless skipped)
    if (!skipConfigRegeneration) {
      try {
        log.info('⚙️ Regenerating configuration for restart...');
        await this.generateConfig();
        
        // Additional wait after config regeneration during restart
        log.info('⏱️ Waiting for configuration regeneration to complete...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        
        log.info('Configuration regenerated for updated binaries');
      } catch (configError) {
        log.warn('Config regeneration failed, using existing config:', configError.message);
      }
    } else {
      log.info('⏭️ Skipping configuration regeneration - using existing optimized config');
    }
    
    return await this.start(skipConfigRegeneration);
  }

  /**
   * Get the actual backend type from platform directory
   */
  getBackendTypeFromPlatformDir(platformDir) {
    if (!platformDir) return 'unknown';
    
    if (platformDir.includes('cuda')) return 'NVIDIA CUDA';
    if (platformDir.includes('rocm')) return 'AMD ROCm';
    if (platformDir.includes('vulkan')) return 'Vulkan';
    if (platformDir.includes('cpu')) return 'CPU Only';
    if (platformDir.includes('arm64')) return 'Apple Silicon';
    if (platformDir.includes('darwin')) return 'Apple Metal';
    if (platformDir.includes('win32')) return 'Windows';
    if (platformDir.includes('linux')) return 'Linux';
    
    return platformDir; // Fallback to directory name
  }

  getStatus() {
    // First check if we have a process reference
    const hasProcess = this.process && !this.process.killed;
    
    // Calculate how long we've been in starting state
    const startingDuration = this.startingTimestamp ? 
      Math.round((Date.now() - this.startingTimestamp) / 1000) : 0;
    
    // Get currently active backend information
    let currentBackend = 'auto';
    let currentPlatformDir = null;
    
    try {
      // Get the backend override
      const overridePath = path.join(os.homedir(), '.clara', 'settings', 'backend-override.json');
      if (fsSync.existsSync(overridePath)) {
        const overrideData = JSON.parse(fsSync.readFileSync(overridePath, 'utf8'));
        if (overrideData.backendId && overrideData.backendId !== 'auto') {
          currentBackend = overrideData.backendId;
        }
      }
      
      // Get the actual platform directory being used
      if (this.platformManager && this.platformManager.platformInfo) {
        currentPlatformDir = this.platformManager.platformInfo.platformDir;
      }
    } catch (error) {
      log.debug('Error getting current backend info:', error.message);
    }
    
    return {
      isRunning: this.isRunning && hasProcess,
      isStarting: this.isStarting,
      startingDuration: startingDuration,
      startingTimestamp: this.startingTimestamp,
      isStuck: this.isStarting && startingDuration > 60, // Consider stuck after 1 minute
      currentStartupPhase: this.currentStartupPhase, // Add current startup phase
      currentBackend: currentBackend, // Add current backend override
      currentPlatformDir: currentPlatformDir, // Add actual platform directory
      currentBackendName: this.getBackendTypeFromPlatformDir(currentPlatformDir), // Add readable backend name
      port: this.port,
      pid: this.process?.pid,
      apiUrl: `http://localhost:${this.port}`,
      processExists: hasProcess,
      flagStatus: this.isRunning
    };
  }

  /**
   * Force reset the service if it's stuck in starting state
   */
  async forceResetIfStuck() {
    const status = this.getStatus();
    
    if (status.isStuck) {
      log.error(`🚨 Service is stuck in starting state for ${status.startingDuration} seconds`);
      log.info('🔧 Performing force reset...');
      
      // Force cleanup
      this.cleanup();
      
      // Clean up any processes
      try {
        await this.cleanupStaleProcesses();
        await this.killProcessesOnPort(this.port);
      } catch (error) {
        log.warn('Error during force cleanup:', error.message);
      }
      
      log.info('✅ Force reset completed - service ready to start again');
      return { success: true, message: 'Service force reset completed' };
    } else {
      return { success: false, message: 'Service is not stuck - no reset needed' };
    }
  }

  // Add a new method to check if service is actually responding
  async getStatusWithHealthCheck() {
    if (this.ipcLogger) {
      this.ipcLogger.logServiceCall('LlamaSwapService', 'getStatusWithHealthCheck');
    }
    
    const basicStatus = this.getStatus();
    
    // If we think it's not running, return early
    if (!basicStatus.isRunning) {
      if (this.ipcLogger) {
        this.ipcLogger.logServiceCall('LlamaSwapService', 'getStatusWithHealthCheck', null, { 
          isRunning: false, 
          healthCheck: 'not-running' 
        });
      }
      return basicStatus;
    }
    
    // Try to make a quick health check
    try {
      if (this.ipcLogger) {
        this.ipcLogger.logHttpRequest('GET', `http://localhost:${this.port}/v1/models`);
      }
      
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      const response = await fetch(`http://localhost:${this.port}/v1/models`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const result = {
        ...basicStatus,
        isResponding: response.ok,
        healthCheck: response.ok ? 'passed' : 'failed'
      };
      
      if (this.ipcLogger) {
        this.ipcLogger.logHttpResponse('GET', `http://localhost:${this.port}/v1/models`, response.status);
        this.ipcLogger.logServiceCall('LlamaSwapService', 'getStatusWithHealthCheck', null, result);
      }
      
      return result;
    } catch (error) {
      const result = {
        ...basicStatus,
        isResponding: false,
        healthCheck: 'failed',
        healthError: error.message
      };
      
      if (this.ipcLogger) {
        this.ipcLogger.logError('LlamaSwapService.healthCheck', error);
        this.ipcLogger.logServiceCall('LlamaSwapService', 'getStatusWithHealthCheck', null, result);
      }
      
      return result;
    }
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

  /**
   * Unload all running models via the /unload endpoint
   */
  async unloadAllModels() {
    try {
      if (!this.isRunning) {
        return { success: true, message: 'Service not running, no models to unload' };
      }

      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }

      log.info('🔄 Attempting to unload all running models...');

      // First, get list of running models
      try {
        const runningResponse = await fetch(`http://localhost:${this.port}/running`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (runningResponse.ok) {
          const runningData = await runningResponse.json();
          if (runningData.models && runningData.models.length > 0) {
            log.info(`📋 Found ${runningData.models.length} running models to unload`);
          } else {
            log.info('📋 No running models found');
            return { success: true, message: 'No running models to unload' };
          }
        }
      } catch (runningError) {
        log.debug('Could not check running models:', runningError.message);
      }

      // Call the /unload endpoint to unload all models
      const unloadResponse = await fetch(`http://localhost:${this.port}/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body to unload all
      });

      if (unloadResponse.ok) {
        const unloadData = await unloadResponse.json();
        log.info('✅ Successfully unloaded all models');
        return { 
          success: true, 
          message: 'All models unloaded successfully',
          data: unloadData
        };
      } else {
        const errorText = await unloadResponse.text();
        throw new Error(`Unload request failed: ${unloadResponse.status} - ${errorText}`);
      }

    } catch (error) {
      log.warn('⚠️ Model unloading failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper method to extract quantization info
  extractQuantization(filename) {
    // Check for common quantization patterns in order of specificity
    const quantMatch = filename.toLowerCase().match(/(q4_k_m|q4_k_s|q5_k_m|q5_k_s|q6_k|q8_0|f16|f32|q4_0|q4_1|q5_0|q5_1|q2_k|q3_k_m|q3_k_s|q3_k_l|iq3_xxs|iq3_xs|iq3_s|iq3_m|iq4_xs|iq4_nl)/i);
    if (quantMatch) {
      return quantMatch[1].toLowerCase();
    }
    
    // Check for other patterns like IQ (IMatrix quantization)
    const iqMatch = filename.toLowerCase().match(/(iq\d+_\w+)/i);
    if (iqMatch) {
      return iqMatch[1].toLowerCase();
    }
    
    // Check for BitNet patterns
    const bitnetMatch = filename.toLowerCase().match(/(1\.58|bitnet)/i);
    if (bitnetMatch) {
      return 'bitnet';
    }
    
    return null;
  }

  // Helper method to extract file size as a differentiator
  extractFileSizeInfo(filename, fileSizeBytes) {
    // Convert file size to GB and create a readable size indicator
    const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
    
    if (sizeGB < 1) {
      return 'xs'; // Extra small
    } else if (sizeGB < 3) {
      return 's'; // Small
    } else if (sizeGB < 6) {
      return 'm'; // Medium
    } else if (sizeGB < 12) {
      return 'l'; // Large
    } else {
      return 'xl'; // Extra large
    }
  }

  /**
   * Detect GPU capabilities and memory
   */
  async detectGPUInfo() {
    if (this.gpuInfo) {
      return this.gpuInfo;
    }

    const platform = os.platform();
    let gpuMemoryMB = 0;
    let hasGPU = false;
    let gpuType = 'unknown';

    try {
      if (platform === 'darwin') {
        // For macOS, try to detect Metal/Apple Silicon info
        const systemInfo = await this.getMacOSGPUInfo();
        gpuMemoryMB = systemInfo.gpuMemoryMB;
        hasGPU = systemInfo.hasGPU;
        gpuType = systemInfo.gpuType;
      } else if (platform === 'win32') {
        // For Windows, try to detect NVIDIA/AMD/Intel GPU
        const systemInfo = await this.getWindowsGPUInfo();
        gpuMemoryMB = systemInfo.gpuMemoryMB;
        hasGPU = systemInfo.hasGPU;
        gpuType = systemInfo.gpuType;
      } else {
        // For Linux, try to detect GPU via nvidia-smi or other methods
        const systemInfo = await this.getLinuxGPUInfo();
        gpuMemoryMB = systemInfo.gpuMemoryMB;
        hasGPU = systemInfo.hasGPU;
        gpuType = systemInfo.gpuType;
      }
    } catch (error) {
      log.warn('Failed to detect GPU info:', error.message);
    }

    // Fallback estimation based on system memory and platform
    if (!hasGPU || gpuMemoryMB === 0) {
      const estimatedInfo = this.estimateGPUCapabilities();
      gpuMemoryMB = estimatedInfo.gpuMemoryMB;
      hasGPU = estimatedInfo.hasGPU;
      gpuType = estimatedInfo.gpuType;
    }

    this.gpuInfo = {
      hasGPU,
      gpuMemoryMB,
      gpuMemoryGB: Math.round(gpuMemoryMB / 1024 * 10) / 10,
      gpuType,
      systemMemoryGB: this.systemMemoryGB,
      platform
    };

    log.info('GPU Detection Results:', this.gpuInfo);
    return this.gpuInfo;
  }

  /**
   * Get macOS GPU information using system_profiler
   */
  async getMacOSGPUInfo() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      // Try to get GPU info from system_profiler
      const process = spawn('system_profiler', ['SPDisplaysDataType', '-json'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        try {
          if (code === 0 && stdout) {
            const displayData = JSON.parse(stdout);
            const displays = displayData.SPDisplaysDataType || [];
            
            let maxMemoryMB = 0;
            let gpuType = 'integrated';
            
            displays.forEach(display => {
              // Check for VRAM information
              if (display.sppci_model && display.sppci_model.includes('Apple')) {
                gpuType = 'apple_silicon';
                // For Apple Silicon, estimate based on unified memory
                // Apple Silicon shares memory, so use a portion of system memory
                const systemMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
                if (systemMemoryGB >= 32) {
                  maxMemoryMB = 16384; // 16GB for high-end systems
                } else if (systemMemoryGB >= 16) {
                  maxMemoryMB = 8192; // 8GB for mid-range
                } else {
                  maxMemoryMB = 4096; // 4GB for entry-level
                }
              } else if (display.sppci_vram) {
                // Dedicated GPU with VRAM
                const vramStr = display.sppci_vram;
                const vramMatch = vramStr.match(/(\d+)/);
                if (vramMatch) {
                  const vramMB = parseInt(vramMatch[1]);
                  if (vramMB > maxMemoryMB) {
                    maxMemoryMB = vramMB;
                    gpuType = 'dedicated';
                  }
                }
              }
            });

            resolve({
              hasGPU: maxMemoryMB > 0,
              gpuMemoryMB: maxMemoryMB,
              gpuType
            });
          } else {
            throw new Error('Failed to get system profiler data');
          }
        } catch (error) {
          log.warn('Error parsing macOS GPU info:', error.message);
          resolve(this.estimateGPUCapabilities());
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(this.estimateGPUCapabilities());
      }, 5000);
    });
  }

  /**
   * Get Windows GPU information using nvidia-smi (preferred) or wmic (fallback)
   */
  async getWindowsGPUInfo() {
    return new Promise((resolve) => {
      const { spawn, spawnSync } = require('child_process');

      // Try nvidia-smi first (for NVIDIA GPUs)
      try {
        const nvidiaSmi = spawnSync('nvidia-smi', [
          '--query-gpu=memory.total',
          '--format=csv,noheader,nounits'
        ], { encoding: 'utf8' });

        if (nvidiaSmi.status === 0 && nvidiaSmi.stdout) {
          const lines = nvidiaSmi.stdout.trim().split('\n');
          const maxMemoryMB = Math.max(...lines.map(line => parseInt(line.trim())));
          if (maxMemoryMB > 0) {
            return resolve({
              hasGPU: true,
              gpuMemoryMB: maxMemoryMB,
              gpuType: 'nvidia'
            });
          }
        }
      } catch (err) {
        // Ignore and fallback to WMIC
      }

      // Fallback to WMIC
      const process = spawn('wmic', ['path', 'win32_VideoController', 'get', 'name,AdapterRAM', '/format:csv'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        try {
          if (code === 0 && stdout) {
            const lines = stdout.split('\n').filter(line => line.trim());
            let maxMemoryMB = 0;
            let gpuType = 'integrated';

            lines.forEach(line => {
              const parts = line.split(',');
              if (parts.length >= 3) {
                const ramStr = parts[1];
                const nameStr = parts[2];

                if (ramStr && nameStr && !isNaN(parseInt(ramStr))) {
                  const ramBytes = parseInt(ramStr);
                  const ramMB = Math.round(ramBytes / (1024 * 1024));

                  if (ramMB > maxMemoryMB) {
                    maxMemoryMB = ramMB;

                    // Determine GPU type based on name
                    const lowerName = nameStr.toLowerCase();
                    if (lowerName.includes('nvidia') || lowerName.includes('geforce') || lowerName.includes('rtx') || lowerName.includes('gtx')) {
                      gpuType = 'nvidia';
                    } else if (lowerName.includes('amd') || lowerName.includes('radeon')) {
                      gpuType = 'amd';
                    } else if (lowerName.includes('intel')) {
                      gpuType = 'intel';
                    } else {
                      gpuType = 'dedicated';
                    }
                  }
                }
              }
            });

            resolve({
              hasGPU: maxMemoryMB > 0,
              gpuMemoryMB: maxMemoryMB,
              gpuType
            });
          } else {
            throw new Error('Failed to get Windows GPU info');
          }
        } catch (error) {
          log.warn('Error parsing Windows GPU info:', error.message);
          resolve(this.estimateGPUCapabilities());
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(this.estimateGPUCapabilities());
      }, 5000);
    });
  }

  /**
   * Get Linux GPU information using nvidia-smi or other methods
   */
  async getLinuxGPUInfo() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      // Try nvidia-smi first
      const process = spawn('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        try {
          if (code === 0 && stdout.trim()) {
            const memoryMB = parseInt(stdout.trim());
            if (!isNaN(memoryMB) && memoryMB > 0) {
              resolve({
                hasGPU: true,
                gpuMemoryMB: memoryMB,
                gpuType: 'nvidia'
              });
              return;
            }
          }
          
          // Fallback to estimation
          resolve(this.estimateGPUCapabilities());
        } catch (error) {
          log.warn('Error parsing Linux GPU info:', error.message);
          resolve(this.estimateGPUCapabilities());
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        process.kill();
        resolve(this.estimateGPUCapabilities());
      }, 5000);
    });
  }

  /**
   * Estimate GPU capabilities based on system specs
   */
  estimateGPUCapabilities() {
    const platform = os.platform();
    const arch = os.arch();
    const systemMemoryGB = this.systemMemoryGB;

    let hasGPU = true;
    let gpuMemoryMB = 2048; // Default 2GB
    let gpuType = 'integrated';

    if (platform === 'darwin') {
      if (arch === 'arm64') {
        // Apple Silicon - unified memory architecture
        gpuType = 'apple_silicon';
        if (systemMemoryGB >= 32) {
          gpuMemoryMB = 16384; // 16GB for high-end
        } else if (systemMemoryGB >= 16) {
          gpuMemoryMB = 8192; // 8GB for mid-range
        } else {
          gpuMemoryMB = 4096; // 4GB minimum
        }
      } else {
        // Intel Mac
        gpuType = 'integrated';
        gpuMemoryMB = Math.min(4096, systemMemoryGB * 256); // Up to 4GB or system memory/4
      }
    } else {
      // Windows/Linux - conservative estimate
      if (systemMemoryGB >= 16) {
        gpuMemoryMB = 4096; // Assume 4GB for systems with 16GB+ RAM
        gpuType = 'dedicated';
      } else if (systemMemoryGB >= 8) {
        gpuMemoryMB = 2048; // 2GB for 8GB systems
      } else {
        gpuMemoryMB = 1024; // 1GB for lower-end systems
        hasGPU = false; // Disable GPU for very low-end systems
      }
    }

    return { hasGPU, gpuMemoryMB, gpuType };
  }

  /**
   * Calculate optimal GPU layers for a model
   */
  async calculateOptimalGPULayers(modelPath, modelFileSize = null) {
    const gpuInfo = await this.detectGPUInfo();
    
    if (!gpuInfo.hasGPU || gpuInfo.gpuMemoryMB < 1024) {
      log.info('GPU not available or insufficient memory, using CPU only');
      return 0;
    }

    try {
      // Get model file size if not provided
      if (!modelFileSize) {
        const stats = await fs.stat(modelPath);
        modelFileSize = stats.size;
      }

      const modelSizeGB = modelFileSize / (1024 * 1024 * 1024);
      const availableGpuMemoryGB = gpuInfo.gpuMemoryGB;

      // Estimate model parameters and layers based on file size
      const modelInfo = this.estimateModelInfo(modelPath, modelSizeGB);
      
      log.info(`Model analysis for ${path.basename(modelPath)}:`, {
        sizeGB: modelSizeGB,
        estimatedParams: modelInfo.estimatedParams,
        estimatedLayers: modelInfo.estimatedLayers,
        availableGpuMemoryGB,
        gpuType: gpuInfo.gpuType
      });

      // Calculate how many layers can fit in GPU memory
      const layersToOffload = this.calculateLayerOffloading(modelInfo, gpuInfo, modelSizeGB);
      
      log.info(`Calculated optimal GPU layers: ${layersToOffload} / ${modelInfo.estimatedLayers}`);
      
      return layersToOffload;
    } catch (error) {
      log.warn('Error calculating optimal GPU layers:', error.message);
      // Fallback to conservative estimate
      return this.getConservativeGPULayers(gpuInfo);
    }
  }

  /**
   * Estimate model information from filename and size
   */
  estimateModelInfo(modelPath, modelSizeGB) {
    const fileName = path.basename(modelPath).toLowerCase();
    
    // Try to extract parameter count from filename
    let estimatedParams = '7b'; // default
    let estimatedLayers = 32; // default for 7B models
    
    // Extract parameter info from filename
    const paramMatch = fileName.match(/(\d+(?:\.\d+)?)\s*b/i);
    if (paramMatch) {
      const paramCount = parseFloat(paramMatch[1]);
      estimatedParams = `${paramCount}b`;
      
      // Estimate layers based on parameter count
      if (paramCount <= 1) {
        estimatedLayers = 22; // 1B models
      } else if (paramCount <= 3) {
        estimatedLayers = 26; // 3B models
      } else if (paramCount <= 7) {
        estimatedLayers = 32; // 7B models
      } else if (paramCount <= 13) {
        estimatedLayers = 40; // 13B models
      } else if (paramCount <= 30) {
        estimatedLayers = 60; // 30B models
      } else if (paramCount <= 70) {
        estimatedLayers = 80; // 70B models
      } else {
        estimatedLayers = 100; // Larger models
      }
    }

    // Adjust based on model size (more accurate than filename sometimes)
    if (modelSizeGB < 1) {
      estimatedLayers = Math.min(estimatedLayers, 22);
    } else if (modelSizeGB < 4) {
      estimatedLayers = Math.min(estimatedLayers, 32);
    } else if (modelSizeGB < 8) {
      estimatedLayers = Math.min(estimatedLayers, 40);
    } else if (modelSizeGB < 15) {
      estimatedLayers = Math.min(estimatedLayers, 60);
    }

    return {
      estimatedParams,
      estimatedLayers,
      modelSizeGB
    };
  }

  /**
   * Calculate how many layers to offload based on available memory
   */
  calculateLayerOffloading(modelInfo, gpuInfo, modelSizeGB) {
    const availableGpuMemoryGB = gpuInfo.gpuMemoryGB;
    const totalLayers = modelInfo.estimatedLayers;
    
    // Reserve memory for context and other overhead
    let reservedMemoryGB = 1; // Default 1GB reserved
    
    if (gpuInfo.gpuType === 'apple_silicon') {
      // Apple Silicon shares memory, so be more conservative
      reservedMemoryGB = Math.max(2, availableGpuMemoryGB * 0.3);
    } else if (gpuInfo.gpuType === 'integrated') {
      // Integrated graphics share system memory
      reservedMemoryGB = Math.max(1.5, availableGpuMemoryGB * 0.4);
    } else {
      // Dedicated GPU
      reservedMemoryGB = Math.max(1, availableGpuMemoryGB * 0.2);
    }

    const usableGpuMemoryGB = Math.max(0, availableGpuMemoryGB - reservedMemoryGB);
    
    // Estimate memory per layer (rough approximation)
    const memoryPerLayerGB = modelSizeGB / totalLayers;
    
    // Calculate how many layers can fit
    let maxLayers = Math.floor(usableGpuMemoryGB / memoryPerLayerGB);
    
    // Apply safety limits and platform-specific optimizations
    if (gpuInfo.gpuType === 'apple_silicon') {
      // Apple Silicon handles memory differently, can be more aggressive
      maxLayers = Math.min(maxLayers, totalLayers);
    } else if (gpuInfo.gpuType === 'nvidia' && gpuInfo.gpuMemoryMB >= 8192) {
      // High-end NVIDIA cards can handle full offloading better
      maxLayers = Math.min(maxLayers, totalLayers);
    } else {
      // Conservative approach for other GPUs
      maxLayers = Math.min(maxLayers, Math.floor(totalLayers * 0.8));
    }

    // Ensure we don't exceed total layers or go negative
    maxLayers = Math.max(0, Math.min(maxLayers, totalLayers));
    
    // Round down to avoid edge cases
    return Math.floor(maxLayers);
  }

  /**
   * Get conservative GPU layer estimate as fallback
   */
  getConservativeGPULayers(gpuInfo) {
    if (!gpuInfo.hasGPU) return 0;
    
    if (gpuInfo.gpuMemoryGB >= 16) {
      return 35; // High-end GPU
    } else if (gpuInfo.gpuMemoryGB >= 8) {
      return 25; // Mid-range GPU
    } else if (gpuInfo.gpuMemoryGB >= 4) {
      return 15; // Entry-level dedicated GPU
    } else {
      return 5; // Integrated graphics
    }
  }

  /**
   * Get GPU diagnostics information for the frontend
   */
  async getGPUDiagnostics() {
    try {
      // Get GPU information
      const gpuInfo = await this.detectGPUInfo();
      
      // Get model information with GPU allocation details
      const models = await this.scanModels();
      const mainModels = models.filter(model => !this.isMmprojModel(model.file));
      
      const modelInfo = [];
      
      for (const model of mainModels) {
        try {
          const modelSizeGB = model.size / (1024 * 1024 * 1024);
          const modelEstimation = this.estimateModelInfo(model.path, modelSizeGB);
          const allocatedLayers = await this.calculateOptimalGPULayers(model.path, model.size);
          
          modelInfo.push({
            name: this.generateModelName(model.file),
            path: model.path,
            sizeGB: modelSizeGB,
            estimatedLayers: modelEstimation.estimatedLayers,
            allocatedLayers: allocatedLayers,
            estimatedParams: modelEstimation.estimatedParams
          });
        } catch (error) {
          log.warn(`Error getting GPU info for model ${model.file}:`, error.message);
          // Include model with fallback data
          modelInfo.push({
            name: this.generateModelName(model.file),
            path: model.path,
            sizeGB: model.size / (1024 * 1024 * 1024),
            estimatedLayers: 32, // fallback
            allocatedLayers: 0, // fallback to CPU
            estimatedParams: 'unknown'
          });
        }
      }
      
      return {
        gpuInfo,
        modelInfo
      };
    } catch (error) {
      log.error('Error getting GPU diagnostics:', error);
      throw error;
    }
  }

  /**
   * Get safe default performance configuration when calculation fails
   */
  getSafeDefaultConfig() {
    const cpuCores = require('os').cpus().length;
    
    return {
      gpuLayers: 0,
      contextSize: 8192,      // Larger default context for better conversations
      batchSize: 512,
      ubatchSize: 128,
      flashAttention: this.forceFlashAttention || true,   // Enable by default or when forced - many modern quantized models require it
      useMemoryMapping: true,
      useMemoryLock: true,    // Enable memory locking for consistent performance
      useContinuousBatching: true,  // Enable by default for better multi-turn performance
      optimizeFirstToken: false,    // Default to conversational mode, not TTFT mode
      threads: Math.max(4, Math.min(8, Math.floor(cpuCores / 2))), // Better thread calculation
      parallelSequences: 1,
      kvCacheType: 'q8_0',
      // New conversational optimization settings
      keepTokens: 1024,       // Keep more tokens for faster subsequent responses
      defragThreshold: 0.1,   // Less aggressive defrag for better cache retention
      enableContinuousBatching: true,  // Explicit continuous batching flag
      enableContextShift: true,  // Enable context shift by default to prevent context overflow
      conversationMode: 'balanced',
    };
  }

  /**
   * Optimize conversation performance settings dynamically
   * This method can be called to adjust settings based on real usage patterns
   */
  async optimizeConversationPerformance(modelPath, conversationLength = 10) {
    try {
      const modelSizeGB = (await fs.stat(modelPath)).size / (1024 * 1024 * 1024);
      const gpuInfo = await this.detectGPUInfo();
      
      // Calculate optimal settings based on conversation length and system resources
      const contextSize = this.calculateOptimalContextSize(modelSizeGB, gpuInfo.hasGPU, gpuInfo.gpuMemoryGB);
      
      // Adjust keep tokens based on conversation length
      let keepTokens;
      if (conversationLength <= 5) {
        // Short conversations: keep most of the context
        keepTokens = Math.min(2048, Math.floor(contextSize * 0.4));
      } else if (conversationLength <= 15) {
        // Medium conversations: balance memory and speed
        keepTokens = Math.min(1536, Math.floor(contextSize * 0.3));
      } else {
        // Long conversations: more conservative to prevent memory issues
        keepTokens = Math.min(1024, Math.floor(contextSize * 0.25));
      }
      
      // Adjust defrag threshold based on conversation activity
      const defragThreshold = conversationLength > 20 ? 0.15 : 0.1;
      
      return {
        contextSize,
        keepTokens,
        defragThreshold,
        enableContinuousBatching: true,
        // Batch size optimization for conversation flow
        batchSize: modelSizeGB <= 4 ? 256 : 512,
        ubatchSize: modelSizeGB <= 4 ? 64 : 128
      };
    } catch (error) {
      log.warn('Failed to optimize conversation performance:', error.message);
      return this.getSafeDefaultConfig();
    }
  }

  /**
   * Get conversation-optimized command line arguments
   * This replaces the aggressive TTFT settings with conversation-friendly ones
   */
  getConversationOptimizedArgs(perfConfig, modelSizeGB) {
    const args = [];
    
    // Context size for good conversation memory
    const contextSize = perfConfig.contextSize || 8192;
    args.push(`--ctx-size ${contextSize}`);
    
    // Generous keep tokens to avoid reprocessing conversation history
    const keepTokens = perfConfig.keepTokens || Math.min(1024, Math.floor(contextSize * 0.25));
    args.push(`--keep ${keepTokens}`);
    
    // Less aggressive defrag to preserve cache
    const defragThreshold = perfConfig.defragThreshold || 0.1;
    args.push(`--defrag-thold ${defragThreshold}`);
    
    // Enable continuous batching for multi-turn efficiency
    if (perfConfig.enableContinuousBatching !== false) {
      args.push('--cont-batching');
    }
    
    // Memory locking for consistent performance
    if (perfConfig.useMemoryLock !== false) {
      args.push('--mlock');
    }
    
    // Batch sizes optimized for conversation flow
    const batchSize = perfConfig.batchSize || (modelSizeGB <= 4 ? 256 : 512);
    const ubatchSize = perfConfig.ubatchSize || (modelSizeGB <= 4 ? 64 : 128);
    args.push(`--batch-size ${batchSize}`);
    args.push(`--ubatch-size ${ubatchSize}`);
    
    // Parallel sequences
    const parallel = perfConfig.parallelSequences || 1;
    args.push(`--parallel ${parallel}`);
    
    // Cache type optimization
    if (perfConfig.kvCacheType && perfConfig.kvCacheType !== 'f16') {
      args.push(`--cache-type-k ${perfConfig.kvCacheType}`);
      args.push(`--cache-type-v ${perfConfig.kvCacheType}`);
    }
    
    // Flash attention if supported
    if (perfConfig.flashAttention) {
      args.push('--flash-attn');
    }
    
    // Context shift for long conversations - DISABLED (not supported by llama-server yet)
    // if (perfConfig.enableContextShift !== false) {
    //   args.push('--ctx-shift');
    // }
    
    return args;
  }

  /**
   * Save performance settings to persistent storage
   */
  async savePerformanceSettings(settings) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');
      
      // Create settings directory if it doesn't exist
      const settingsDir = path.join(os.homedir(), '.clara', 'settings');
      await fs.mkdir(settingsDir, { recursive: true });
      
      // Save performance settings to file
      const settingsPath = path.join(settingsDir, 'performance-settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      
      log.info('Performance settings saved successfully:', settingsPath);
      return { success: true, path: settingsPath };
      
    } catch (error) {
      log.error('Error saving performance settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load performance settings from persistent storage
   */
  async loadPerformanceSettings() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');
      
      const settingsPath = path.join(os.homedir(), '.clara', 'settings', 'performance-settings.json');
      
      // Check if settings file exists
      try {
        await fs.access(settingsPath);
      } catch (accessError) {
        // File doesn't exist, return default settings
        log.info('No saved performance settings found, using defaults');
        return { success: true, settings: this.getDefaultPerformanceSettings() };
      }
      
      // Read and parse settings file
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      
      log.info('Performance settings loaded successfully:', settingsPath);
      return { success: true, settings };
      
    } catch (error) {
      log.error('Error loading performance settings:', error);
      return { success: false, error: error.message, settings: this.getDefaultPerformanceSettings() };
    }
  }

  /**
   * Get performance settings (alias for loadPerformanceSettings for compatibility)
   */
  async getPerformanceSettings() {
    return await this.loadPerformanceSettings();
  }

  /**
   * Get default performance settings for UI initialization
   */
  getDefaultPerformanceSettings() {
    const cpuCores = require('os').cpus().length;
    
    return {
      flashAttention: true,   // Enable by default - required for many modern quantized models
      autoOptimization: true,
      maxContextSize: 8192,
      aggressiveOptimization: false,
      prioritizeSpeed: false,
      optimizeFirstToken: false,
      threads: Math.max(4, Math.min(8, Math.floor(cpuCores / 2))),
      parallelSequences: 1,
      // Conversational optimization settings
      optimizeConversations: true,
      keepTokens: 1024,
      defragThreshold: 0.1,
      enableContinuousBatching: true,
      enableContextShift: true,  // Enable context shift by default to prevent context overflow
      conversationMode: 'balanced',
      // GPU and batch settings - set to undefined by default so auto-calculation kicks in
      gpuLayers: undefined,   // undefined = auto-calculate, number = user override
      batchSize: 256,
      ubatchSize: 256,
      memoryLock: true
    };
  }

  // Helper method to calculate TTFT-optimized batch sizes and parameters
  calculateTTFTOptimizedBatchSizes(modelSizeGB, gpuInfo) {
    const hasGPU = gpuInfo.hasGPU;
    const memoryGB = hasGPU ? gpuInfo.gpuMemoryGB : 8; // Assume 8GB RAM fallback
    
    // For TTFT optimization, use smaller batch sizes for faster prefill
    let batchSize = 512;  // Default batch size for TTFT
    let ubatchSize = 128; // Smaller micro-batch for TTFT
    
    if (modelSizeGB <= 4) {
      // Small models: aggressive TTFT optimization
      batchSize = 256;
      ubatchSize = 64;
    } else if (modelSizeGB <= 8) {
      // Medium models: balanced TTFT
      batchSize = 512;
      ubatchSize = 128;
    } else {
      // Large models: conservative TTFT
      batchSize = 1024;
      ubatchSize = 256;
    }
    
    return { batchSize, ubatchSize };
  }

  // Helper method to optimize context size for performance vs capability
  calculateOptimalContextSize(modelSizeGB, hasGPU, memoryGB) {
    // For optimal conversational performance, we need larger context windows
    // but must balance memory usage
    
    if (modelSizeGB <= 4) {
      // Small models can handle larger contexts
      return hasGPU && memoryGB >= 8 ? 32768 : 16384;
    } else if (modelSizeGB <= 8) {
      // Medium models: balance performance and memory
      return hasGPU && memoryGB >= 12 ? 16384 : 8192;
    } else if (modelSizeGB <= 16) {
      // Large models: conservative context
      return hasGPU && memoryGB >= 16 ? 8192 : 4096;
    } else {
      // Very large models: minimal context for memory efficiency
      return hasGPU && memoryGB >= 24 ? 4096 : 2048;
    }
  }

  async enableFlashAttentionAndRegenerate() {
    try {
      log.info('🔄 Enabling flash attention and regenerating configuration...');
      
      // Temporarily force flash attention to true for this regeneration
      this.forceFlashAttention = true;
      
      // Regenerate the configuration with flash attention enabled
      await this.generateConfig();
      
      // Wait for flash attention config to be properly written
      log.info('⏱️ Waiting for flash attention configuration to be finalized...');
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
      
      log.info('✅ Configuration regenerated with flash attention enabled');
      
      // Also try to update saved performance settings to enable flash attention by default
      try {
        const currentSettings = await this.loadPerformanceSettings();
        if (currentSettings.success) {
          const updatedSettings = {
            ...currentSettings.settings,
            flashAttention: true
          };
          await this.savePerformanceSettings(updatedSettings);
          log.info('💾 Updated saved performance settings to enable flash attention by default');
        }
      } catch (settingsError) {
        log.warn('Could not update performance settings:', settingsError.message);
      }
      
    } catch (error) {
      log.error('Failed to enable flash attention and regenerate config:', error);
      throw error;
    }
  }

  /**
   * Set a callback function to receive progress updates
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Parse progress information from llama-swap stdout
   */
  parseProgressFromOutput(output) {
    if (!this.progressCallback) return;

    try {
      // Parse different types of progress messages
      
      // Context processing progress: "slot update_slots: id  0 | task 1508 | prompt processing progress, n_past = 517, n_tokens = 512, progress = 0.335958"
      const contextMatch = output.match(/(?:slot update_slots.*?)?prompt processing progress.*?progress = ([\d.]+)/);
      if (contextMatch) {
        const progress = Math.round(parseFloat(contextMatch[1]) * 100);
        
        // Extract additional details for better context
        const nPastMatch = output.match(/n_past = (\d+)/);
        const nTokensMatch = output.match(/n_tokens = (\d+)/);
        
        let details = 'Processing conversation context...';
        if (nPastMatch && nTokensMatch) {
          details = `Processed ${nPastMatch[1]} tokens, batch size ${nTokensMatch[1]}`;
        }
        
        this.progressCallback({
          type: 'context_loading',
          progress: progress,
          message: `Loading Context`,
          details: details
        });
        
        // Log progress to console for debugging
        console.log(`📊 Context Loading Progress: ${progress}% - ${details}`);
        return;
      }

      // Memory optimization: "kv cache rm"
      if (output.includes('kv cache rm')) {
        this.progressCallback({
          type: 'memory_optimization',
          progress: -1, // Indeterminate
          message: 'Optimizing Memory',
          details: 'Clearing conversation cache...'
        });
        
        console.log('🧹 Memory Optimization: Clearing cache');
        return;
      }

      // Chat format initialization
      const chatFormatMatch = output.match(/Chat format: (.+)/);
      if (chatFormatMatch) {
        this.progressCallback({
          type: 'initialization',
          progress: -1,
          message: 'Initializing',
          details: `Chat format: ${chatFormatMatch[1]}`
        });
        
        console.log(`🔧 Initializing chat format: ${chatFormatMatch[1]}`);
        return;
      }

      // Model loading/warmup
      if (output.includes('loading model') || output.includes('warming up')) {
        this.progressCallback({
          type: 'model_loading',
          progress: -1,
          message: 'Loading Model',
          details: 'Preparing AI model...'
        });
        
        console.log('🤖 Loading/warming up model');
        return;
      }

      // Task processing (new prompt)
      const taskMatch = output.match(/slot launch_slot_: id\s+(\d+) \| task (\d+) \| processing task/);
      if (taskMatch) {
        this.progressCallback({
          type: 'task_processing',
          progress: -1,
          message: 'Processing Request',
          details: `Starting task ${taskMatch[2]} on slot ${taskMatch[1]}`
        });
        
        console.log(`⚡ Starting new task: ${taskMatch[2]} on slot ${taskMatch[1]}`);
        return;
      }

    } catch (error) {
      // Silently ignore parsing errors but log for debugging
      console.warn('Progress parsing error:', error);
    }
  }

  /**
   * Clean up any stale processes that might be left after binary updates
   * This prevents "unexpected state" errors when restarting
   */
  async cleanupStaleProcesses() {
    try {
      log.info('🧹 Cleaning up stale processes before service start...');
      
      // Use targeted port-based cleanup first (already implemented efficiently)
      await this.killProcessesOnPort(this.port);
      
      // Platform-specific cleanup with minimal system impact
      if (process.platform === 'win32') {
        await this.cleanupWindowsProcessesEfficiently();
      } else {
        await this.cleanupUnixProcessesEfficiently();
      }
      
      // Reduced wait time for faster startup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      log.info('✅ Stale process cleanup completed');
      
    } catch (error) {
      log.warn('Stale process cleanup encountered error:', error.message);
      // Don't fail startup if cleanup fails
    }
  }

  /**
   * Efficient Windows process cleanup to minimize system impact
   */
  async cleanupWindowsProcessesEfficiently() {
    const { spawn } = require('child_process');
    
    try {
      // Only kill processes by name as backup - avoid duplicate netstat calls
      const processNames = [
        'llama-server.exe',
        'llama-swap.exe', 
        'llama-swap-win32-x64.exe'
      ];
      
      // Run cleanup in parallel for speed
      const cleanupPromises = processNames.map(processName => 
        this.killWindowsProcessByName(processName).catch(err => 
          log.debug(`Could not kill ${processName}: ${err.message}`)
        )
      );
      
      await Promise.allSettled(cleanupPromises);
      log.debug('Windows process name cleanup completed');
      
    } catch (error) {
      log.debug('Windows efficient cleanup failed:', error.message);
    }
  }

  /**
   * Kill a specific Windows process by name
   */
  async killWindowsProcessByName(processName) {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
      const killProcess = spawn('taskkill', ['/F', '/IM', processName], { 
        stdio: 'ignore',
        timeout: 5000 // Prevent hanging
      });
      
      killProcess.on('close', (code) => {
        if (code === 0) {
          log.debug(`Successfully killed ${processName}`);
        }
        resolve(); // Don't fail on non-zero exit codes
      });
      
      killProcess.on('error', () => resolve()); // Don't fail on errors
    });
  }

  /**
   * Efficient Unix process cleanup to minimize system impact  
   */
  async cleanupUnixProcessesEfficiently() {
    const { spawn } = require('child_process');
    
    try {
      // Use targeted pkill with timeout
      const processPatterns = ['llama-server', 'llama-swap'];
      
      const cleanupPromises = processPatterns.map(pattern =>
        this.killUnixProcessByPattern(pattern).catch(err =>
          log.debug(`Could not kill ${pattern}: ${err.message}`)
        )
      );
      
      await Promise.allSettled(cleanupPromises);
      log.debug('Unix process cleanup completed');
      
    } catch (error) {
      log.debug('Unix efficient cleanup failed:', error.message);
    }
  }

  /**
   * Kill Unix processes by pattern with timeout
   */
  async killUnixProcessByPattern(pattern) {
    const { spawn } = require('child_process');
    return new Promise((resolve) => {
      const killProcess = spawn('pkill', ['-f', pattern], { 
        stdio: 'ignore',
        timeout: 3000 // Prevent hanging
      });
      
      killProcess.on('close', () => resolve());
      killProcess.on('error', () => resolve()); // Don't fail on errors
      
      // Fallback timeout
      setTimeout(() => resolve(), 3000);
    });
  }

  /**
   * Kill processes specifically using the given port
   */
  async killProcessesOnPort(port) {
    try {
      log.info(`🔍 Checking for processes using port ${port}...`);
      
      if (process.platform === 'win32') {
        const { spawn } = require('child_process');
        
        // Use netstat to find processes using the port
        const netstatProcess = spawn('netstat', ['-ano'], { stdio: ['ignore', 'pipe', 'ignore'] });
        let netstatOutput = '';
        
        netstatProcess.stdout.on('data', (data) => {
          netstatOutput += data.toString();
        });
        
        await new Promise((resolve) => {
          netstatProcess.on('close', () => resolve());
        });
        
        // Parse output to find PIDs using our port
        const lines = netstatOutput.split('\n');
        const pidsToKill = new Set();
        
        for (const line of lines) {
          if (line.includes(`:${port} `) || line.includes(`:${port}\t`)) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && /^\d+$/.test(pid)) {
              pidsToKill.add(pid);
            }
          }
        }
        
        // Kill all processes using the port
        for (const pid of pidsToKill) {
          try {
            log.info(`🔪 Killing process PID ${pid} using port ${port}`);
            spawn('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
          } catch (killError) {
            log.debug(`Could not kill PID ${pid}: ${killError.message}`);
          }
        }
        
        if (pidsToKill.size > 0) {
          log.info(`✅ Cleaned up ${pidsToKill.size} processes using port ${port}`);
          // Wait for processes to actually die
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          log.info(`✅ No processes found using port ${port}`);
        }
        
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        const { spawn, exec } = require('child_process');
        
        // Use lsof to find processes using the port
        return new Promise((resolve) => {
          exec(`lsof -ti:${port}`, (error, stdout, stderr) => {
            if (error) {
              log.debug(`No processes found using port ${port}`);
              resolve();
              return;
            }
            
            const pids = stdout.trim().split('\n').filter(pid => pid && /^\d+$/.test(pid));
            
            if (pids.length > 0) {
              log.info(`🔪 Killing ${pids.length} processes using port ${port}`);
              
              for (const pid of pids) {
                try {
                  spawn('kill', ['-9', pid], { stdio: 'ignore' });
                  log.info(`Killed process PID ${pid} using port ${port}`);
                } catch (killError) {
                  log.debug(`Could not kill PID ${pid}: ${killError.message}`);
                }
              }
              
              // Wait for processes to die
              setTimeout(resolve, 3000);
            } else {
              log.info(`✅ No processes found using port ${port}`);
              resolve();
            }
          });
        });
      }
      
    } catch (error) {
      log.warn(`Error killing processes on port ${port}:`, error.message);
    }
  }

  /**
   * Attempt to recover from service errors (502/503) after updates
   */
  async recoverFromErrors() {
    log.info('Attempting service recovery after errors...');
    
    try {
      // Stop the service if it's in a bad state
      if (this.isRunning) {
        await this.stop();
      }
      
      // Clean up any stale processes
      await this.cleanupStaleProcesses();
      
      // Verify and repair binaries (especially important after updates)
      await this.verifyAndRepairBinariesAfterUpdate();
      
      // Regenerate configuration to ensure compatibility
      await this.generateConfig();
      
      // Wait a bit longer for complete cleanup
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Restart the service
      const result = await this.start();
      
      if (result.success) {
        log.info('Service recovery completed successfully');
      } else {
        log.error('Service recovery failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      log.error('Service recovery encountered error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify and repair binary paths after updates
   * This ensures the service can find the correct binaries even if naming changes after updates
   */
  async verifyAndRepairBinariesAfterUpdate() {
    log.info('🔧 Verifying and repairing binary paths after update...');
    
    try {
      const platform = os.platform();
      const platformPath = path.join(this.baseDir, this.platformInfo.platformDir);
      
      if (!fsSync.existsSync(platformPath)) {
        throw new Error(`Platform directory not found: ${platformPath}`);
      }
      
      // List all files in the platform directory
      const files = fsSync.readdirSync(platformPath);
      log.info(`Files found in platform directory:`, files);
      
      // Check for llama-swap binary variants
      const llamaSwapFiles = files.filter(file => 
        file.includes('llama-swap') && 
        !file.includes('backup') && 
        (file.endsWith('.exe') || !file.includes('.'))
      );
      
      // Check for llama-server binary
      const llamaServerFiles = files.filter(file => 
        file.includes('llama-server') && 
        !file.includes('backup') &&
        (file.endsWith('.exe') || !file.includes('.'))
      );
      
      log.info(`Found llama-swap candidates:`, llamaSwapFiles);
      log.info(`Found llama-server candidates:`, llamaServerFiles);
      
      // If we have multiple llama-swap binaries, ensure we have the standard names
      if (llamaSwapFiles.length > 0) {
        const standardName = platform === 'win32' ? 'llama-swap.exe' : 'llama-swap';
        const platformSpecificName = platform === 'win32' ? 'llama-swap-win32-x64.exe' 
          : platform === 'darwin' ? 'llama-swap-darwin' 
          : 'llama-swap-linux';
        
        const hasStandardName = llamaSwapFiles.includes(standardName);
        const hasPlatformName = llamaSwapFiles.includes(platformSpecificName);
        
        // If we only have platform-specific name, create a symlink/copy to standard name
        if (!hasStandardName && hasPlatformName) {
          try {
            const sourcePath = path.join(platformPath, platformSpecificName);
            const targetPath = path.join(platformPath, standardName);
            
            if (platform === 'win32') {
              // On Windows, copy the file
              fsSync.copyFileSync(sourcePath, targetPath);
              log.info(`✅ Created standard llama-swap binary: ${standardName}`);
            } else {
              // On Unix systems, create a symlink
              fsSync.symlinkSync(platformSpecificName, targetPath);
              log.info(`✅ Created symlink for llama-swap: ${standardName} -> ${platformSpecificName}`);
            }
          } catch (linkError) {
            log.warn(`Could not create standard binary name:`, linkError.message);
          }
        }
        
        // If we only have standard name, create platform-specific name
        if (hasStandardName && !hasPlatformName) {
          try {
            const sourcePath = path.join(platformPath, standardName);
            const targetPath = path.join(platformPath, platformSpecificName);
            
            if (platform === 'win32') {
              // On Windows, copy the file
              fsSync.copyFileSync(sourcePath, targetPath);
              log.info(`✅ Created platform-specific llama-swap binary: ${platformSpecificName}`);
            } else {
              // On Unix systems, create a symlink
              fsSync.symlinkSync(standardName, targetPath);
              log.info(`✅ Created symlink for llama-swap: ${platformSpecificName} -> ${standardName}`);
            }
          } catch (linkError) {
            log.warn(`Could not create platform-specific binary name:`, linkError.message);
          }
        }
      }
      
      // Refresh binary paths after potential repairs
      this.binaryPaths = this.getBinaryPathsWithFallback();
      log.info(`✅ Binary verification and repair completed`);
      log.info(`Updated binary paths:`, this.binaryPaths);
      
      return true;
      
    } catch (error) {
      log.error('Binary verification and repair failed:', error.message);
      return false;
    }
  }

  /**
   * Static method for update service to repair binaries after updates
   * This can be called without creating a full service instance
   */
  static async repairBinariesAfterUpdate(baseDir = null) {
    log.info('🔧 Static binary repair called after update...');
    
    try {
      if (!baseDir) {
        // Determine base directory using the same logic as constructor
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        if (isDevelopment) {
          baseDir = path.join(__dirname, 'llamacpp-binaries');
        } else {
          const possiblePaths = [
            process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'llamacpp-binaries') : null,
            app && app.getAppPath ? path.join(app.getAppPath(), 'electron', 'llamacpp-binaries') : null,
            path.join(__dirname, 'llamacpp-binaries')
          ].filter(Boolean);
          
          for (const possiblePath of possiblePaths) {
            if (fsSync.existsSync(possiblePath)) {
              baseDir = possiblePath;
              break;
            }
          }
          
          if (!baseDir) {
            baseDir = path.join(__dirname, 'llamacpp-binaries');
          }
        }
      }
      
      const platformManager = new PlatformManager(baseDir);
      const platformInfo = platformManager.platformInfo;
      const platform = os.platform();
      const platformPath = path.join(baseDir, platformInfo.platformDir);
      
      if (!fsSync.existsSync(platformPath)) {
        log.warn(`Platform directory not found during static repair: ${platformPath}`);
        return false;
      }
      
      // List all files and repair llama-swap binaries
      const files = fsSync.readdirSync(platformPath);
      const llamaSwapFiles = files.filter(file => 
        file.includes('llama-swap') && 
        !file.includes('backup') && 
        (file.endsWith('.exe') || !file.includes('.'))
      );
      
      log.info(`Static repair found llama-swap candidates:`, llamaSwapFiles);
      
      if (llamaSwapFiles.length > 0) {
        const standardName = platform === 'win32' ? 'llama-swap.exe' : 'llama-swap';
        const platformSpecificName = platform === 'win32' ? 'llama-swap-win32-x64.exe' 
          : platform === 'darwin' ? 'llama-swap-darwin' 
          : 'llama-swap-linux';
        
        const hasStandardName = llamaSwapFiles.includes(standardName);
        const hasPlatformName = llamaSwapFiles.includes(platformSpecificName);
        
        // Ensure both names exist for maximum compatibility
        if (!hasStandardName && hasPlatformName) {
          try {
            const sourcePath = path.join(platformPath, platformSpecificName);
            const targetPath = path.join(platformPath, standardName);
            fsSync.copyFileSync(sourcePath, targetPath);
            log.info(`✅ Static repair created standard binary: ${standardName}`);
          } catch (error) {
            log.warn(`Static repair failed to create standard binary:`, error.message);
          }
        }
        
        if (hasStandardName && !hasPlatformName) {
          try {
            const sourcePath = path.join(platformPath, standardName);
            const targetPath = path.join(platformPath, platformSpecificName);
            fsSync.copyFileSync(sourcePath, targetPath);
            log.info(`✅ Static repair created platform-specific binary: ${platformSpecificName}`);
          } catch (error) {
            log.warn(`Static repair failed to create platform-specific binary:`, error.message);
          }
        }
      }
      
      log.info('✅ Static binary repair completed');
      return true;
      
    } catch (error) {
      log.error('Static binary repair failed:', error.message);
      return false;
    }
  }

  /**
   * Initialize custom model paths from saved settings
   */
  initializeCustomModelPaths() {
    try {
      // Import required modules
      const fsSync = require('fs');
      const app = require('electron').app;
      
      // Try to load custom model paths from file storage
      const settingsPath = path.join(app.getPath('userData'), 'clara-settings.json');
      if (fsSync.existsSync(settingsPath)) {
        const settings = JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
        if (settings.customModelPath) {
          // Validate that the path still exists before setting it
          if (fsSync.existsSync(settings.customModelPath)) {
            this.customModelPaths = [settings.customModelPath];
            log.info('Loaded custom model path from settings:', settings.customModelPath);
          } else {
            log.warn('Custom model path from settings no longer exists:', settings.customModelPath);
          }
        }
      }
    } catch (error) {
      log.warn('Could not load custom model path from settings:', error.message);
    }
  }

  /**
   * Set custom model paths
   */
  setCustomModelPaths(paths) {
    this.customModelPaths = Array.isArray(paths) ? paths : [paths].filter(Boolean);
    log.info('Custom model paths updated:', this.customModelPaths);
  }

  /**
   * Add a custom model path
   */
  addCustomModelPath(path) {
    if (path && !this.customModelPaths.includes(path)) {
      this.customModelPaths.push(path);
      log.info('Added custom model path:', path);
    }
  }

  /**
   * Remove a custom model path
   */
  removeCustomModelPath(path) {
    const index = this.customModelPaths.indexOf(path);
    if (index > -1) {
      this.customModelPaths.splice(index, 1);
      log.info('Removed custom model path:', path);
    }
  }

  /**
   * Get all custom model paths
   */
  getCustomModelPaths() {
    return [...this.customModelPaths];
  }

  /**
   * Apply system resource limitations to the service
   */
  applyResourceLimitations(limitations) {
    try {
      log.info('🎯 Applying system resource limitations to LlamaSwap service:', limitations);
      
      this.resourceLimitations = limitations;
      
      // Apply thread limitations
      if (limitations.limitedThreads) {
        log.info(`🧵 Limiting thread count to: ${limitations.limitedThreads}`);
        this.maxThreads = limitations.limitedThreads;
      }
      
      // Apply context size limitations
      if (limitations.maxContextSize) {
        log.info(`📝 Limiting context size to: ${limitations.maxContextSize}`);
        this.maxContextSize = limitations.maxContextSize;
      }
      
      // Apply concurrent model limitations
      if (limitations.maxConcurrentModels) {
        log.info(`🔄 Limiting concurrent models to: ${limitations.maxConcurrentModels}`);
        this.maxConcurrentModels = limitations.maxConcurrentModels;
      }
      
      // Disable GPU acceleration if required
      if (limitations.disableGPUAcceleration) {
        log.info('🚫 GPU acceleration disabled due to system limitations');
        this.forceDisableGPU = true;
      }
      
      // Store limitations for later use in model spawning
      this.systemLimitations = limitations;
      
      log.info('✅ System resource limitations applied successfully');
    } catch (error) {
      log.error('❌ Failed to apply system resource limitations:', error);
    }
  }

  /**
   * Get system resource limitations
   */
  getResourceLimitations() {
    return this.resourceLimitations || {};
  }

  /**
   * Check if a feature is limited by system resources
   */
  isFeatureLimited(featureName) {
    const limitations = this.getResourceLimitations();
    
    switch (featureName) {
      case 'gpu':
        return limitations.disableGPUAcceleration || false;
      case 'concurrent_models':
        return limitations.maxConcurrentModels ? limitations.maxConcurrentModels < 2 : false;
      case 'large_context':
        return limitations.maxContextSize ? limitations.maxContextSize < 16384 : false;
      default:
        return false;
    }
  }

  /**
   * Extract metadata from GGUF file including embedding dimensions and context size
   */
  async extractGGUFMetadata(modelPath) {
    try {
      const fs = require('fs');
      const fileName = path.basename(modelPath);
      
      // Read a larger chunk to parse metadata properly (64KB should be enough for most metadata)
      const bufferSize = 65536;
      const buffer = Buffer.alloc(bufferSize);
      
      const fd = fs.openSync(modelPath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, 0);
      fs.closeSync(fd);
      
      // GGUF magic number check
      const magic = buffer.readUInt32LE(0);
      if (magic !== 0x46554747) { // 'GGUF' in little endian
        log.warn(`${fileName}: Not a valid GGUF file (magic: 0x${magic.toString(16)})`);
        return null;
      }
      
      // Read version
      const version = buffer.readUInt32LE(4);
      
      let offset = 8;
      const tensorCount = buffer.readBigUInt64LE(offset);
      offset += 8;
      const metadataCount = buffer.readBigUInt64LE(offset);
      offset += 8;
      
      // Parse metadata key-value pairs
      const metadata = {};
      let parsedCount = 0;
      
      for (let i = 0; i < Number(metadataCount) && offset < bytesRead - 16; i++) {
        try {
          // Read key length and key
          if (offset + 8 >= bytesRead) {
            break;
          }
          
          const keyLength = buffer.readBigUInt64LE(offset);
          offset += 8;
          
          if (Number(keyLength) > 1000 || offset + Number(keyLength) >= bytesRead) {
            break;
          }
          
          const key = buffer.subarray(offset, offset + Number(keyLength)).toString('utf-8');
          offset += Number(keyLength);
          
          // Read value type
          if (offset + 4 >= bytesRead) {
            break;
          }
          
          const valueType = buffer.readUInt32LE(offset);
          offset += 4;
          
          let value = null;
          
          // Parse value based on type
          switch (valueType) {
            case 4: // GGUF_TYPE_UINT32
              if (offset + 4 <= bytesRead) {
                value = buffer.readUInt32LE(offset);
                offset += 4;
              }
              break;
            case 5: // GGUF_TYPE_INT32
              if (offset + 4 <= bytesRead) {
                value = buffer.readInt32LE(offset);
                offset += 4;
              }
              break;
            case 6: // GGUF_TYPE_FLOAT32
              if (offset + 4 <= bytesRead) {
                value = buffer.readFloatLE(offset);
                offset += 4;
              }
              break;
            case 7: // GGUF_TYPE_BOOL
              if (offset + 1 <= bytesRead) {
                value = buffer.readUInt8(offset) !== 0;
                offset += 1;
              }
              break;
            case 8: // GGUF_TYPE_STRING
              if (offset + 8 <= bytesRead) {
                const strLength = buffer.readBigUInt64LE(offset);
                offset += 8;
                if (Number(strLength) <= 10000 && offset + Number(strLength) <= bytesRead) {
                  value = buffer.subarray(offset, offset + Number(strLength)).toString('utf-8');
                  offset += Number(strLength);
                } else {
                  break;
                }
              }
              break;
            case 9: // GGUF_TYPE_ARRAY
              // Skip arrays for now - they're complex to parse
              if (offset + 12 <= bytesRead) {
                const arrayType = buffer.readUInt32LE(offset);
                offset += 4;
                const arrayLength = buffer.readBigUInt64LE(offset);
                offset += 8;
                
                const arrayLen = Number(arrayLength);
                if (arrayLen > 10000) {
                  break;
                }
                
                // Skip the array data based on type
                if (arrayType === 4 || arrayType === 5 || arrayType === 6) { // uint32, int32, float32
                  offset += arrayLen * 4;
                } else if (arrayType === 7) { // bool
                  offset += arrayLen;
                } else if (arrayType === 8) { // string array
                  for (let j = 0; j < arrayLen && offset < bytesRead - 8; j++) {
                    if (offset + 8 > bytesRead) break;
                    const strLen = buffer.readBigUInt64LE(offset);
                    offset += 8;
                    if (offset + Number(strLen) > bytesRead) break;
                    offset += Number(strLen);
                  }
                } else {
                  break;
                }
              }
              break;
            default:
              break;
          }
          
          if (value !== null) {
            metadata[key] = value;
            parsedCount++;
          }
          
        } catch (parseError) {
          break;
        }
      }
      
      // Extract context size from metadata
      let contextSize = null;
      const contextKeys = [
        'llama.context_length',
        'llama.context_size', 
        'context_length',
        'n_ctx',
        'max_position_embeddings',
        // Model-specific context keys
        'qwen3moe.context_length',
        'qwen2.context_length', 
        'qwen.context_length',
        'gemma3.context_length',
        'gemma2.context_length',
        'gemma.context_length',
        'mistral.context_length',
        'phi3.context_length',
        'phi.context_length',
        'deepseek.context_length',
        'codellama.context_length',
        'bert.context_length',
        'gpt.context_length'
      ];
      
      for (const key of contextKeys) {
        if (metadata[key] && typeof metadata[key] === 'number') {
          contextSize = metadata[key];
          break;
        }
      }
      
      // Extract embedding size
      let embeddingSize = null;
      const embeddingKeys = [
        'llama.embedding_length',
        'llama.embedding_size',
        'embedding_length',
        'hidden_size',
        'n_embd',
        // Model-specific embedding keys
        'qwen3moe.embedding_length',
        'qwen2.embedding_length',
        'qwen.embedding_length', 
        'gemma3.embedding_length',
        'gemma2.embedding_length',
        'gemma.embedding_length',
        'mistral.embedding_length',
        'phi3.embedding_length',
        'phi.embedding_length',
        'deepseek.embedding_length',
        'codellama.embedding_length',
        'bert.embedding_length',
        'gpt.embedding_length'
      ];
      
      for (const key of embeddingKeys) {
        if (metadata[key] && typeof metadata[key] === 'number') {
          embeddingSize = metadata[key];
          break;
        }
      }
      
      // Fallback to estimation if no embedding size found in metadata
      if (!embeddingSize) {
        embeddingSize = this.estimateEmbeddingSize(modelPath);
      }
      
      return {
        version,
        tensorCount: Number(tensorCount),
        metadataCount: Number(metadataCount),
        contextSize,
        embeddingSize,
        parsedMetadataCount: parsedCount
      };
    } catch (error) {
      log.warn(`Failed to extract GGUF metadata from ${path.basename(modelPath)}:`, error.message);
      return {
        contextSize: null,
        embeddingSize: this.estimateEmbeddingSize(modelPath),
        error: error.message
      };
    }
  }

  /**
   * Estimate embedding size based on model name patterns and known models
   */
  estimateEmbeddingSize(modelPath) {
    const fileName = path.basename(modelPath).toLowerCase();
    
    // Known embedding dimensions for common models
    const embeddingDimensionMap = {
      // Text models (common dimensions)
      'gemma': 2048,
      'llama': 4096,
      'qwen': 4096,
      'mistral': 4096,
      'phi': 2560,
      'tinyllama': 2048,
      'deepseek': 4096,
      
      // Embedding models
      'nomic-embed': 768,
      'mxbai': 1024,
      'bge': 1024,
      'e5': 1024,
      'all-minilm': 384,
      
      // Vision models (projection dimensions)
      'llava': 4096,
      'moondream': 2048,
      'vision': 4096,
      'multimodal': 4096
    };
    
    // Check for specific model patterns
    for (const [pattern, dimension] of Object.entries(embeddingDimensionMap)) {
      if (fileName.includes(pattern)) {
        // Special case for e5-large-v2 which has higher dimensions
        if (pattern === 'e5' && fileName.includes('large')) {
          return 1024;
        }
        return dimension;
      }
    }
    
    // Fallback based on model size (rough estimation)
    if (this.isEmbeddingModel(fileName)) {
      return 768; // Default for embedding models
    }
    
    // Default for text models
    return 4096;
  }

  /**
   * Find compatible mmproj files for a model based on embedding dimensions
   */
  async findCompatibleMmprojFiles(model, allMmprojModels) {
    const compatibleFiles = [];
    
    try {
      // Get the model's embedding dimensions
      const modelMetadata = await this.extractGGUFMetadata(model.path);
      const modelEmbeddingSize = modelMetadata?.embeddingSize || this.estimateEmbeddingSize(model.path);
      
      // Check each mmproj file for compatibility
      for (const mmprojModel of allMmprojModels) {
        try {
          const mmprojMetadata = await this.extractGGUFMetadata(mmprojModel.path);
          const mmprojEmbeddingSize = mmprojMetadata?.embeddingSize || this.estimateEmbeddingSize(mmprojModel.path);
          
          // Models are compatible if their embedding dimensions match
          if (modelEmbeddingSize === mmprojEmbeddingSize) {
            compatibleFiles.push({
              ...mmprojModel,
              embeddingSize: mmprojEmbeddingSize,
              isCompatible: true,
              compatibilityReason: `Matching embedding dimensions (${mmprojEmbeddingSize})`
            });
          } else {
            // Include incompatible files with warning
            compatibleFiles.push({
              ...mmprojModel,
              embeddingSize: mmprojEmbeddingSize,
              isCompatible: false,
              compatibilityReason: `Dimension mismatch: model=${modelEmbeddingSize}, mmproj=${mmprojEmbeddingSize}`
            });
          }
        } catch (error) {
          log.warn(`Error checking mmproj compatibility for ${mmprojModel.file}:`, error.message);
          // Include with unknown compatibility
          compatibleFiles.push({
            ...mmprojModel,
            embeddingSize: 'unknown',
            isCompatible: false,
            compatibilityReason: 'Unable to determine compatibility'
          });
        }
      }
      
      // Sort compatible files first
      compatibleFiles.sort((a, b) => {
        if (a.isCompatible && !b.isCompatible) return -1;
        if (!a.isCompatible && b.isCompatible) return 1;
        return 0;
      });
      
    } catch (error) {
      log.error(`Error finding compatible mmproj files for ${model.file}:`, error.message);
    }
    
    return compatibleFiles;
  }

  /**
   * Get enhanced model information with embedding dimensions and mmproj compatibility
   */
  async getModelEmbeddingInfo(modelPath) {
    try {
      const metadata = await this.extractGGUFMetadata(modelPath);
      const embeddingSize = metadata?.embeddingSize || this.estimateEmbeddingSize(modelPath);
      const fileName = path.basename(modelPath);
      
      // Scan for available mmproj files
      const allModels = await this.scanModels();
      const mmprojModels = allModels.filter(model => this.isMmprojModel(model.file));
      
      // Find compatible mmproj files
      const model = { path: modelPath, file: fileName };
      const compatibleMmprojFiles = await this.findCompatibleMmprojFiles(model, mmprojModels);
      
      // Check if this is a vision model that needs mmproj
      const isVision = this.isVisionModel(fileName);
      const hasCompatibleMmproj = compatibleMmprojFiles.some(file => file.isCompatible);
      
      return {
        embeddingSize,
        isVisionModel: isVision,
        needsMmproj: isVision,
        compatibleMmprojFiles,
        hasCompatibleMmproj,
        compatibilityStatus: isVision ? 
          (hasCompatibleMmproj ? 'compatible' : 'needs_mmproj') : 
          'not_applicable'
      };
    } catch (error) {
      log.error(`Error getting model embedding info for ${modelPath}:`, error.message);
      return {
        embeddingSize: 'unknown',
        isVisionModel: false,
        needsMmproj: false,
        compatibleMmprojFiles: [],
        hasCompatibleMmproj: false,
        compatibilityStatus: 'unknown'
      };
    }
  }

  /**
   * Search Hugging Face for compatible mmproj files for a given model
   */
  async searchHuggingFaceForMmproj(modelName, embeddingSize) {
    try {
      let fetch;
      try {
        fetch = global.fetch || (await import('node-fetch')).default;
      } catch (importError) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
      }
      
      // Extract base model name for searching
      const baseModelName = modelName.toLowerCase()
        .replace(/[-_.]?(q\d+_k_[ms]|f16|f32|gguf).*$/i, '') // Remove quantization suffixes
        .replace(/[-_.]/g, '-');
      
      // Search for mmproj files related to this model
      const searchQueries = [
        `${baseModelName} mmproj`,
        `${baseModelName} mm-proj`,
        `${baseModelName} projection`,
        `mmproj ${baseModelName}`
      ];
      
      const results = [];
      
      for (const query of searchQueries) {
        try {
          const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=10`;
          const response = await fetch(url);
          
          if (response.ok) {
            const models = await response.json();
            
            for (const model of models) {
              // Check if this model has mmproj files
              const mmprojFiles = (model.siblings || []).filter(file => 
                file.rfilename.toLowerCase().includes('mmproj') ||
                file.rfilename.toLowerCase().includes('mm-proj') ||
                file.rfilename.toLowerCase().includes('projection')
              );
              
              if (mmprojFiles.length > 0) {
                results.push({
                  modelId: model.modelId || model.id,
                  modelName: model.modelId || model.id,
                  description: model.description || '',
                  files: mmprojFiles,
                  estimatedEmbeddingSize: this.estimateEmbeddingSize(mmprojFiles[0].rfilename),
                  isLikelyCompatible: this.estimateEmbeddingSize(mmprojFiles[0].rfilename) === embeddingSize,
                  downloads: model.downloads || 0,
                  likes: model.likes || 0
                });
              }
            }
          }
        } catch (searchError) {
          log.warn(`Error searching for mmproj with query "${query}":`, searchError.message);
        }
      }
      
      // Remove duplicates and sort by compatibility and popularity
      const uniqueResults = results.reduce((acc, current) => {
        const existing = acc.find(item => item.modelId === current.modelId);
        if (!existing) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      uniqueResults.sort((a, b) => {
        // Sort compatible first, then by downloads
        if (a.isLikelyCompatible && !b.isLikelyCompatible) return -1;
        if (!a.isLikelyCompatible && b.isLikelyCompatible) return 1;
        return (b.downloads || 0) - (a.downloads || 0);
      });
      
      return uniqueResults.slice(0, 5); // Return top 5 results
    } catch (error) {
      log.error(`Error searching Hugging Face for mmproj files:`, error.message);
      return [];
    }
  }

  /**
   * Save mmproj mappings to persistent storage
   */
  async saveMmprojMappings(mappings) {
    try {
      log.info('🔍 saveMmprojMappings called with mappings:', mappings);
      log.info('🔍 mappings type:', typeof mappings);
      log.info('🔍 mappings length/keys:', Array.isArray(mappings) ? mappings.length : Object.keys(mappings).length);
      
      const settingsDir = path.join(os.homedir(), '.clara', 'settings');
      log.info('🔍 Settings directory:', settingsDir);
      
      await fs.mkdir(settingsDir, { recursive: true });
      log.info('🔍 Settings directory ensured');
      
      // Convert array format to object format for consistency
      let mappingsToSave;
      if (Array.isArray(mappings)) {
        // Frontend sends array format - convert to object format
        mappingsToSave = {};
        mappings.forEach(mapping => {
          if (mapping.modelPath) {
            mappingsToSave[mapping.modelPath] = mapping;
          }
        });
        log.info('🔍 Converted array format to object format for mmproj mappings');
        log.info('🔍 Converted mappings:', mappingsToSave);
      } else {
        // Already in object format
        mappingsToSave = mappings;
        log.info('🔍 Using existing object format');
      }
      
      const mappingsPath = path.join(settingsDir, 'mmproj-mappings.json');
      log.info('🔍 Writing to file:', mappingsPath);
      
      const jsonContent = JSON.stringify(mappingsToSave, null, 2);
      log.info('🔍 JSON content to write:', jsonContent);
      
      await fs.writeFile(mappingsPath, jsonContent, 'utf8');
      log.info('🔍 File written successfully');
      
      // Verify the file was created
      try {
        const stats = await fs.stat(mappingsPath);
        log.info('🔍 File verification - size:', stats.size, 'bytes');
      } catch (statError) {
        log.error('❌ File verification failed:', statError);
      }
      
      log.info('✅ Mmproj mappings saved successfully:', mappingsPath);
      log.info(`✅ Saved ${Object.keys(mappingsToSave).length} mappings to ${mappingsPath}`);
      return { success: true, path: mappingsPath };
    } catch (error) {
      log.error('❌ Error saving mmproj mappings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load mmproj mappings from persistent storage
   */
  async loadMmprojMappings() {
    try {
      const mappingsPath = path.join(os.homedir(), '.clara', 'settings', 'mmproj-mappings.json');
      
      // Check if mappings file exists
      try {
        await fs.access(mappingsPath);
      } catch (accessError) {
        // File doesn't exist, return empty mappings
        log.info('No saved mmproj mappings found, returning empty object');
        return { success: true, mappings: {} };
      }
      
      // Read and parse mappings file
      const mappingsData = await fs.readFile(mappingsPath, 'utf8');
      const storedData = JSON.parse(mappingsData);
      
      // The data is always stored in object format (modelPath -> mapping)
      // Return as object for internal use (config generation)
      const mappings = storedData;
      
      log.info('Mmproj mappings loaded successfully:', mappingsPath);
      log.info(`Loaded ${Object.keys(mappings).length} mappings from ${mappingsPath}`);
      return { success: true, mappings };
    } catch (error) {
      log.error('Error loading mmproj mappings:', error);
      return { success: false, error: error.message, mappings: {} };
    }
  }

  /**
   * Get all available mmproj files from the file system
   */
  async getAvailableMmprojFiles() {
    try {
      const allModels = await this.scanModels();
      const mmprojModels = allModels.filter(model => this.isMmprojModel(model.file));
      
      // Enhance mmproj files with metadata
      const enhancedMmprojFiles = await Promise.all(
        mmprojModels.map(async (mmprojModel) => {
          try {
            const metadata = await this.extractGGUFMetadata(mmprojModel.path);
            return {
              ...mmprojModel,
              embeddingSize: metadata?.embeddingSize || this.estimateEmbeddingSize(mmprojModel.path),
              fileSize: mmprojModel.size,
              fileSizeFormatted: this.formatFileSize(mmprojModel.size)
            };
          } catch (error) {
            log.warn(`Error getting metadata for mmproj file ${mmprojModel.file}:`, error.message);
            return {
              ...mmprojModel,
              embeddingSize: 'unknown',
              fileSize: mmprojModel.size,
              fileSizeFormatted: this.formatFileSize(mmprojModel.size)
            };
          }
        })
      );
      
      return { success: true, mmprojFiles: enhancedMmprojFiles };
    } catch (error) {
      log.error('Error getting available mmproj files:', error);
      return { success: false, error: error.message, mmprojFiles: [] };
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Ensure GPU-specific folders and binaries are always available before startup
   */
  async ensureGPUFoldersAndBinaries() {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return this.ensureWindowsGPUFoldersAndBinaries();
    } else if (platform === 'linux') {
      return this.ensureLinuxGPUFoldersAndBinaries();
    } else {
      log.info(`🎮 GPU-specific setup only available on Windows and Linux, detected: ${platform}, skipping...`);
      return { success: true, message: `Platform ${platform} - GPU setup skipped` };
    }
  }

  /**
   * Ensure Windows GPU-specific folders and binaries are always available before startup
   */
  async ensureWindowsGPUFoldersAndBinaries() {
    try {
      log.info('🔍 Checking Windows GPU-specific folder availability...');
      
      const gpuFolders = ['win32-x64-cuda', 'win32-x64-rocm', 'win32-x64-vulkan', 'win32-x64-cpu'];
      const existingFolders = gpuFolders.filter(folder => 
        fsSync.existsSync(path.join(this.baseDir, folder))
      );

      if (existingFolders.length === 0) {
        log.info('🚀 No Windows GPU-specific folders found - setting up all GPU types...');
        
        // Setup all GPU folders and binaries
        const setupResult = await this.setupWindowsGPUSpecificBinaries();
        
        if (setupResult.success) {
          log.info('✅ Windows GPU-specific folders and binaries setup completed');
          return setupResult;
        } else {
          log.warn('⚠️ Windows GPU setup failed, service will use base folder:', setupResult.error);
          return { success: true, message: 'Windows GPU setup failed but service can continue', warning: setupResult.error };
        }
      } else {
        log.info(`✅ Found ${existingFolders.length} existing Windows GPU folders: ${existingFolders.join(', ')}`);
        
        // Check if the GPU folders have all required binaries
        await this.verifyGPUFolderContents(existingFolders);
        
        return { success: true, message: `${existingFolders.length} Windows GPU folders verified` };
      }
      
    } catch (error) {
      log.error('❌ Error ensuring Windows GPU folders and binaries:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure Linux GPU-specific folders and binaries are always available before startup
   */
  async ensureLinuxGPUFoldersAndBinaries() {
    try {
      log.info('🔍 Checking Linux GPU-specific folder availability...');
      
      const gpuFolders = ['linux-x64-vulkan', 'linux-x64-cpu'];
      const existingFolders = gpuFolders.filter(folder => 
        fsSync.existsSync(path.join(this.baseDir, folder))
      );

      if (existingFolders.length === 0) {
        log.info('🚀 No Linux GPU-specific folders found - setting up all GPU types...');
        
        // Setup all GPU folders and binaries
        const setupResult = await this.setupLinuxGPUSpecificBinaries();
        
        if (setupResult.success) {
          log.info('✅ Linux GPU-specific folders and binaries setup completed');
          return setupResult;
        } else {
          log.warn('⚠️ Linux GPU setup failed, service will use base folder:', setupResult.error);
          return { success: true, message: 'Linux GPU setup failed but service can continue', warning: setupResult.error };
        }
      } else {
        log.info(`✅ Found ${existingFolders.length} existing Linux GPU folders: ${existingFolders.join(', ')}`);
        
        // Check if the GPU folders have all required binaries
        await this.verifyLinuxGPUFolderContents(existingFolders);
        
        return { success: true, message: `${existingFolders.length} Linux GPU folders verified` };
      }
      
    } catch (error) {
      log.error('❌ Error ensuring Linux GPU folders and binaries:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify current GPU detection and folder selection
   */
  async verifyCurrentGPUSetup() {
    if (os.platform() !== 'win32') {
      log.info('🎮 GPU verification only available on Windows, skipping...');
      return { success: true, message: 'Not Windows - GPU verification skipped' };
    }

    try {
      log.info('🔍 Verifying current GPU detection and folder selection...');
      
      // Re-detect GPU and get the platform folder that will be used
      const detectedPlatform = this.detectWindowsGPUPlatform();
      const expectedBinaryPath = path.join(this.baseDir, detectedPlatform);
      
      log.info(`🎮 GPU detection result: ${detectedPlatform}`);
      log.info(`📁 Expected binary path: ${expectedBinaryPath}`);
      
      // Check if the selected folder exists and has required binaries
      if (!fsSync.existsSync(expectedBinaryPath)) {
        log.warn(`⚠️ Selected GPU folder doesn't exist: ${detectedPlatform}`);
        
        // Try to create and populate this specific folder
        await this.setupSpecificGPUFolder(detectedPlatform);
      } else {
        // Verify the folder has required binaries
        const requiredBinaries = ['llama-swap-win32-x64.exe', 'llama-server.exe'];
        const missingBinaries = [];
        
        for (const binary of requiredBinaries) {
          const binaryPath = path.join(expectedBinaryPath, binary);
          if (!fsSync.existsSync(binaryPath)) {
            missingBinaries.push(binary);
          }
        }
        
        if (missingBinaries.length > 0) {
          log.warn(`⚠️ Missing binaries in ${detectedPlatform}: ${missingBinaries.join(', ')}`);
          
          // Try to fix missing binaries
          await this.setupSpecificGPUFolder(detectedPlatform);
        } else {
          log.info(`✅ GPU folder ${detectedPlatform} has all required binaries`);
        }
      }
      
      return { success: true, message: `GPU setup verified for ${detectedPlatform}` };
      
    } catch (error) {
      log.error('❌ Error verifying GPU setup:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify that existing GPU folders have all required binaries
   */
  async verifyGPUFolderContents(existingFolders) {
    const requiredBinaries = ['llama-swap-win32-x64.exe', 'llama-server.exe'];
    
    for (const folder of existingFolders) {
      const folderPath = path.join(this.baseDir, folder);
      const missingBinaries = [];
      
      for (const binary of requiredBinaries) {
        const binaryPath = path.join(folderPath, binary);
        if (!fsSync.existsSync(binaryPath)) {
          missingBinaries.push(binary);
        }
      }
      
      if (missingBinaries.length > 0) {
        log.warn(`⚠️ GPU folder ${folder} missing binaries: ${missingBinaries.join(', ')}`);
        log.info(`🔧 Attempting to fix missing binaries in ${folder}...`);
        
        try {
          await this.setupSpecificGPUFolder(folder);
        } catch (error) {
          log.error(`❌ Failed to fix ${folder}:`, error.message);
        }
      } else {
        log.info(`✅ GPU folder ${folder} has all required binaries`);
      }
    }
  }

  /**
   * Verify that existing Linux GPU folders have all required binaries
   */
  async verifyLinuxGPUFolderContents(existingFolders) {
    const requiredBinaries = ['llama-swap-linux', 'llama-server'];
    
    for (const folder of existingFolders) {
      const folderPath = path.join(this.baseDir, folder);
      const missingBinaries = [];
      
      for (const binary of requiredBinaries) {
        const binaryPath = path.join(folderPath, binary);
        if (!fsSync.existsSync(binaryPath)) {
          missingBinaries.push(binary);
        }
      }
      
      if (missingBinaries.length > 0) {
        log.warn(`⚠️ Linux GPU folder ${folder} missing binaries: ${missingBinaries.join(', ')}`);
        log.info(`🔧 Attempting to fix missing binaries in ${folder}...`);
        
        try {
          await this.setupSpecificLinuxGPUFolder(folder);
        } catch (error) {
          log.error(`❌ Failed to fix Linux ${folder}:`, error.message);
        }
      } else {
        log.info(`✅ Linux GPU folder ${folder} has all required binaries`);
      }
    }
  }

  /**
   * Setup a specific GPU folder with required binaries
   */
  async setupSpecificGPUFolder(folderName) {
    try {
      log.info(`🔧 Setting up specific GPU folder: ${folderName}`);
      
      // Create folder if it doesn't exist
      const folderPath = path.join(this.baseDir, folderName);
      await fs.mkdir(folderPath, { recursive: true });
      
      if (folderName === 'win32-x64-cuda') {
        // CUDA requires dual download
        const releaseInfo = await this.getLatestLlamaCppRelease();
        if (releaseInfo) {
          const success = await this.setupCudaBinaries(releaseInfo, folderName);
          if (!success) {
            await this.copyBinariesFromBase(folderName);
          }
        } else {
          await this.copyBinariesFromBase(folderName);
        }
      } else {
        // Other GPU types - try download first, fallback to copy
        const releaseInfo = await this.getLatestLlamaCppRelease();
        if (releaseInfo) {
          const gpuType = this.getGPUTypeFromFolder(folderName);
          const downloadUrl = this.findAssetUrl(releaseInfo.assets, gpuType, 'win32');
          
          if (downloadUrl) {
            const success = await this.downloadAndExtractBinaries(downloadUrl, folderName);
            if (!success) {
              await this.copyBinariesFromBase(folderName);
            }
          } else {
            await this.copyBinariesFromBase(folderName);
          }
        } else {
          await this.copyBinariesFromBase(folderName);
        }
      }
      
      log.info(`✅ Successfully setup GPU folder: ${folderName}`);
      
    } catch (error) {
      log.error(`❌ Failed to setup GPU folder ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Setup a specific Linux GPU folder with required binaries
   */
  async setupSpecificLinuxGPUFolder(folderName) {
    try {
      log.info(`🔧 Setting up specific Linux GPU folder: ${folderName}`);
      
      // Create folder if it doesn't exist
      const folderPath = path.join(this.baseDir, folderName);
      await fs.mkdir(folderPath, { recursive: true });
      
      // Try download first, fallback to copy
      const releaseInfo = await this.getLatestLlamaCppRelease();
      if (releaseInfo) {
        const gpuType = this.getGPUTypeFromFolder(folderName);
        const downloadUrl = this.findLinuxAssetUrl(releaseInfo.assets, gpuType);
        
        if (downloadUrl) {
          const success = await this.downloadAndExtractBinaries(downloadUrl, folderName);
          if (!success) {
            await this.copyLinuxBinariesFromBase(folderName);
          }
        } else {
          await this.copyLinuxBinariesFromBase(folderName);
        }
      } else {
        await this.copyLinuxBinariesFromBase(folderName);
      }
      
      log.info(`✅ Successfully setup Linux GPU folder: ${folderName}`);
      
    } catch (error) {
      log.error(`❌ Failed to setup Linux GPU folder ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Get available GPU backends/engines for the current platform
   */
  getAvailableBackends() {
    try {
      const platform = os.platform();
      const arch = os.arch();
      
      let availableBackends = [];
      
      switch (platform) {
        case 'win32':
          availableBackends = [
            {
              id: 'cuda',
              name: 'NVIDIA CUDA',
              description: 'Optimized for NVIDIA GPUs with CUDA support',
              folder: 'win32-x64-cuda',
              requiresGPU: true,
              gpuType: 'nvidia'
            },
            {
              id: 'rocm',
              name: 'AMD ROCm',
              description: 'Optimized for AMD GPUs with ROCm support',
              folder: 'win32-x64-rocm',
              requiresGPU: true,
              gpuType: 'amd'
            },
            {
              id: 'vulkan',
              name: 'Vulkan',
              description: 'Cross-vendor GPU acceleration via Vulkan',
              folder: 'win32-x64-vulkan',
              requiresGPU: true,
              gpuType: 'any'
            },
            {
              id: 'cpu',
              name: 'CPU Only',
              description: 'CPU-only processing (no GPU acceleration)',
              folder: 'win32-x64-cpu',
              requiresGPU: false,
              gpuType: 'none'
            },
            {
              id: 'auto',
              name: 'Auto-detect',
              description: 'Automatically detect and use the best available backend',
              folder: 'auto',
              requiresGPU: false,
              gpuType: 'auto'
            }
          ];
          break;
          
        case 'darwin':
          availableBackends = [
            {
              id: 'metal',
              name: 'Apple Metal',
              description: 'Optimized for Apple Silicon with Metal GPU acceleration',
              folder: arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
              requiresGPU: true,
              gpuType: 'apple'
            },
            {
              id: 'cpu',
              name: 'CPU Only',
              description: 'CPU-only processing (no GPU acceleration)',
              folder: arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
              requiresGPU: false,
              gpuType: 'none'
            },
            {
              id: 'auto',
              name: 'Auto-detect',
              description: 'Automatically detect and use the best available backend',
              folder: 'auto',
              requiresGPU: false,
              gpuType: 'auto'
            }
          ];
          break;
          
        case 'linux':
          availableBackends = [
            {
              id: 'vulkan',
              name: 'Vulkan',
              description: 'Cross-vendor GPU acceleration via Vulkan',
              folder: 'linux-x64-vulkan',
              requiresGPU: true,
              gpuType: 'any'
            },
            {
              id: 'cpu',
              name: 'CPU Only',
              description: 'CPU-only processing (no GPU acceleration)',
              folder: 'linux-x64-cpu',
              requiresGPU: false,
              gpuType: 'none'
            },
            {
              id: 'legacy',
              name: 'Legacy Linux',
              description: 'Original Linux binaries (fallback option)',
              folder: 'linux-x64',
              requiresGPU: false,
              gpuType: 'legacy'
            },
            {
              id: 'auto',
              name: 'Auto-detect',
              description: 'Automatically detect and use the best available backend',
              folder: 'auto',
              requiresGPU: false,
              gpuType: 'auto'
            }
          ];
          break;
          
        default:
          availableBackends = [
            {
              id: 'auto',
              name: 'Auto-detect',
              description: 'Automatically detect and use the best available backend',
              folder: 'auto',
              requiresGPU: false,
              gpuType: 'auto'
            }
          ];
      }
      
      // Check which backends actually have binaries available
      const availableWithStatus = availableBackends.map(backend => {
        let isAvailable = false;
        let path = null;
        
        if (backend.folder === 'auto') {
          isAvailable = true; // Auto-detect is always available
        } else {
          path = this.baseDir ? require('path').join(this.baseDir, backend.folder) : null;
          isAvailable = path ? fsSync.existsSync(path) : false;
        }
        
        return {
          ...backend,
          isAvailable,
          binaryPath: path
        };
      });
      
      log.info(`Found ${availableWithStatus.length} potential backends for ${platform}`);
      log.info(`${availableWithStatus.filter(b => b.isAvailable).length} backends have binaries available`);
      
      return {
        success: true,
        backends: availableWithStatus,
        platform,
        architecture: arch
      };
      
    } catch (error) {
      log.error('Error getting available backends:', error);
      return {
        success: false,
        error: error.message,
        backends: [],
        platform: os.platform(),
        architecture: os.arch()
      };
    }
  }

  /**
   * Override the backend/engine selection
   */
  async setBackendOverride(backendId) {
    try {
      const settingsDir = path.join(os.homedir(), '.clara', 'settings');
      await fs.mkdir(settingsDir, { recursive: true });
      
      const overridePath = path.join(settingsDir, 'backend-override.json');
      
      if (backendId === 'auto' || backendId === null || backendId === undefined) {
        // Remove override to use auto-detection
        if (fsSync.existsSync(overridePath)) {
          await fs.unlink(overridePath);
          log.info('Backend override removed - using auto-detection');
        }
        this.backendOverride = null;
      } else {
        // Save the override
        const overrideData = {
          backendId,
          timestamp: new Date().toISOString(),
          platform: os.platform(),
          architecture: os.arch()
        };
        
        await fs.writeFile(overridePath, JSON.stringify(overrideData, null, 2), 'utf8');
        log.info(`Backend override set to: ${backendId}`);
        this.backendOverride = backendId;
      }
      
      return { success: true, backendId: this.backendOverride };
    } catch (error) {
      log.error('Error setting backend override:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current backend override setting
   */
  async getBackendOverride() {
    try {
      const overridePath = path.join(os.homedir(), '.clara', 'settings', 'backend-override.json');
      
      if (!fsSync.existsSync(overridePath)) {
        return { success: true, backendId: null, isOverridden: false };
      }
      
      const overrideData = await fs.readFile(overridePath, 'utf8');
      const override = JSON.parse(overrideData);
      
      return {
        success: true,
        backendId: override.backendId,
        isOverridden: true,
        timestamp: override.timestamp
      };
    } catch (error) {
      log.error('Error getting backend override:', error);
      return { success: false, error: error.message, backendId: null, isOverridden: false };
    }
  }

  /**
   * Apply backend override to platform detection
   */
  async applyBackendOverride() {
    try {
      const overrideResult = await this.getBackendOverride();
      
      if (!overrideResult.success || !overrideResult.isOverridden) {
        return null; // No override, use normal detection
      }
      
      const backendId = overrideResult.backendId;
      const availableBackends = this.getAvailableBackends();
      
      if (!availableBackends.success) {
        log.warn('Failed to get available backends for override application');
        return null;
      }
      
      const targetBackend = availableBackends.backends.find(b => b.id === backendId);
      
      if (!targetBackend) {
        log.warn(`Backend override '${backendId}' not found in available backends`);
        return null;
      }
      
      if (!targetBackend.isAvailable) {
        log.warn(`Backend override '${backendId}' is not available (binaries not found)`);
        return null;
      }
      
      log.info(`🔧 Applying backend override: ${targetBackend.name} (${backendId})`);
      return targetBackend.folder;
      
    } catch (error) {
      log.error('Error applying backend override:', error);
      return null;
    }
  }

  /**
   * Get current configuration as JSON (converted from YAML)
   */
  async getConfigAsJson() {
    try {
      if (!fsSync.existsSync(this.configPath)) {
        return {
          success: false,
          error: 'Configuration file not found. Please start the service first to generate config.',
          config: null
        };
      }
      
      const yamlContent = await fs.readFile(this.configPath, 'utf8');
      
      // Parse YAML to JSON
      let configJson;
      try {
        // Try to use js-yaml if available, otherwise try a simple parser
        let yaml;
        try {
          yaml = require('js-yaml');
        } catch (yamlError) {
          // Fallback to a simple YAML parser if js-yaml is not available
          log.info('js-yaml not available, using fallback YAML parsing');
          configJson = this.parseSimpleYaml(yamlContent);
        }
        
        if (yaml) {
          configJson = yaml.load(yamlContent);
        }
      } catch (parseError) {
        log.error('Error parsing YAML config:', parseError);
        return {
          success: false,
          error: `Failed to parse YAML configuration: ${parseError.message}`,
          config: null
        };
      }
      
      return {
        success: true,
        config: configJson,
        configPath: this.configPath,
        lastModified: fsSync.statSync(this.configPath).mtime
      };
      
    } catch (error) {
      log.error('Error reading config as JSON:', error);
      return {
        success: false,
        error: error.message,
        config: null
      };
    }
  }

  /**
   * Save configuration from JSON (converted to YAML)
   */
  async saveConfigFromJson(jsonConfig) {
    try {
      if (typeof jsonConfig === 'string') {
        try {
          jsonConfig = JSON.parse(jsonConfig);
        } catch (parseError) {
          return {
            success: false,
            error: `Invalid JSON format: ${parseError.message}`
          };
        }
      }

      // Convert JSON to YAML
      let yamlContent;
      try {
        let yaml;
        try {
          yaml = require('js-yaml');
          yamlContent = yaml.dump(jsonConfig, {
            indent: 2,
            quotingType: '"',
            forceQuotes: false
          });
        } catch (yamlError) {
          // Fallback to simple JSON-to-YAML conversion
          log.info('js-yaml not available, using fallback YAML generation');
          yamlContent = this.jsonToSimpleYaml(jsonConfig);
        }
      } catch (convertError) {
        log.error('Error converting JSON to YAML:', convertError);
        return {
          success: false,
          error: `Failed to convert JSON to YAML: ${convertError.message}`
        };
      }

      // Backup existing config
      const backupPath = `${this.configPath}.backup-${Date.now()}`;
      if (fsSync.existsSync(this.configPath)) {
        try {
          await fs.copyFile(this.configPath, backupPath);
          log.info(`Configuration backed up to: ${backupPath}`);
        } catch (backupError) {
          log.warn('Failed to create config backup:', backupError);
        }
      }

      // Write new YAML configuration
      await fs.writeFile(this.configPath, yamlContent, 'utf8');
      
      // Extract and save individual model configurations from the JSON config
      try {
        if (jsonConfig.models) {
          const modelConfigs = [];
          
          for (const [modelName, modelData] of Object.entries(jsonConfig.models)) {
            // Parse the command line to extract individual model settings
            const parsedConfig = this.parseCommandLineToConfig(modelData.cmd || '');
            
            // Create individual model config with parsed settings
            const individualConfig = {
              name: modelName,
              threads: parsedConfig.threads,
              configuredContextSize: parsedConfig.contextSize,
              flashAttention: parsedConfig.flashAttention,
              memoryLock: parsedConfig.memoryLock,
              batchSize: parsedConfig.batchSize,
              ubatchSize: parsedConfig.ubatchSize,
              gpuLayers: parsedConfig.gpuLayers
            };
            
            // Only include defined values
            Object.keys(individualConfig).forEach(key => {
              if (individualConfig[key] === undefined) {
                delete individualConfig[key];
              }
            });
            
            modelConfigs.push(individualConfig);
          }
          
          // Save individual model configurations
          const configsPath = path.join(this.settingsDir, 'individual-model-configs.json');
          const configsMap = {};
          
          for (const modelConfig of modelConfigs) {
            configsMap[modelConfig.name] = modelConfig;
          }
          
          await fs.writeFile(configsPath, JSON.stringify(configsMap, null, 2), 'utf8');
          log.info(`Saved individual configurations for ${modelConfigs.length} models to ${configsPath}`);
          
          // Update in-memory model configurations
          this.customModelConfigs = modelConfigs;
        }
      } catch (extractError) {
        log.warn('Failed to extract and save individual model configurations:', extractError.message);
        // Don't fail the entire save operation if this fails
      }
      
      // Verify the written file
      const verifyContent = await fs.readFile(this.configPath, 'utf8');
      if (verifyContent.length < yamlContent.length * 0.9) {
        throw new Error('Configuration file verification failed - file may be corrupted');
      }

      log.info('Configuration saved successfully from JSON input (manual edit preserved)');
      return {
        success: true,
        configPath: this.configPath,
        backupPath: fsSync.existsSync(backupPath) ? backupPath : null,
        message: 'Configuration saved successfully',
        requiresRestart: this.checkIfConfigRequiresRestart(yamlContent)
      };
      
    } catch (error) {
      log.error('Error saving config from JSON:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if configuration changes require a service restart
   */
  checkIfConfigRequiresRestart(yamlContent) {
    try {
      // For now, we'll assume any manual configuration change might require restart
      // since we don't have the original config to compare with
      // This is a conservative approach to ensure users know they should restart
      return {
        required: true,
        reason: 'Manual configuration changes may require restart to take effect',
        recommendation: 'Use "Save & Restart" for immediate effect, or restart manually when convenient'
      };
    } catch (error) {
      log.warn('Could not determine restart requirement:', error);
      return {
        required: true,
        reason: 'Unable to determine if restart is required',
        recommendation: 'Restart recommended to ensure changes take effect'
      };
    }
  }

  /**
   * Simple JSON to YAML converter fallback
   */
  jsonToSimpleYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'boolean') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'number') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'string') {
        // Escape strings that need quotes
        const needsQuotes = value.includes(':') || value.includes('#') || value.includes('\n') || 
                           value.trim() !== value || /^\d/.test(value);
        yaml += `${spaces}${key}: ${needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value}\n`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            yaml += `${spaces}  -\n`;
            yaml += this.jsonToSimpleYaml(item, indent + 2).replace(/^/gm, '    ');
          } else {
            const needsQuotes = typeof item === 'string' && (item.includes(':') || item.includes('#'));
            yaml += `${spaces}  - ${needsQuotes ? `"${item.replace(/"/g, '\\"')}"` : item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += this.jsonToSimpleYaml(value, indent + 1);
      }
    }
    
    return yaml;
  }

  /**
   * Save configuration and restart service with complete unloading
   */
  async saveConfigAndRestart(jsonConfig) {
    try {
      // First save the configuration
      const saveResult = await this.saveConfigFromJson(jsonConfig);
      if (!saveResult.success) {
        return saveResult;
      }

      log.info('Configuration saved, performing complete LlamaSwap server restart with model unloading...');
      
      // Step 1: Unload all models before shutdown
      try {
        log.info('🔄 Unloading all running models...');
        const unloadResult = await this.unloadAllModels();
        if (unloadResult.success) {
          log.info('✅ All models unloaded successfully');
        } else {
          log.warn('⚠️ Model unloading failed, proceeding with restart:', unloadResult.error);
        }
      } catch (unloadError) {
        log.warn('⚠️ Model unloading encountered error, proceeding with restart:', unloadError.message);
      }

      // Step 2: Complete service shutdown and cleanup
      log.info('🛑 Completely shutting down LlamaSwap server...');
      await this.stop();
      
      // Step 3: Comprehensive cleanup to ensure fresh start
      this.cleanup();
      
      // Step 4: Clean up stale processes and port
      log.info('🧹 Cleaning up all processes and resources...');
      try {
        await this.cleanupStaleProcesses();
        await this.killProcessesOnPort(this.port);
      } catch (cleanupError) {
        log.warn('⚠️ Cleanup warning (non-critical):', cleanupError.message);
      }
      
      // Step 5: Extended wait for complete cleanup
      log.info('⏱️ Waiting for complete process cleanup...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Extended wait
      
      log.info('🚀 Starting fresh LlamaSwap server with new configuration...');
      
      // Step 6: Start without calling generateConfig() to preserve manual edits
      const restartResult = await this.startWithoutConfigGeneration();
      if (!restartResult.success) {
        return {
          success: false,
          error: `Configuration saved but complete restart failed: ${restartResult.error}`,
          configSaved: true,
          backupPath: saveResult.backupPath
        };
      }

      return {
        success: true,
        message: 'Configuration saved and LlamaSwap server completely restarted successfully',
        configPath: this.configPath,
        backupPath: saveResult.backupPath,
        restarted: true,
        modelsUnloaded: true
      };
      
    } catch (error) {
      log.error('Error saving config and performing complete restart:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restart service without regenerating configuration (preserves manual edits)
   */
  async restartWithoutConfigRegeneration() {
    try {
      log.info('Restarting llama-swap service without config regeneration...');
      await this.stop();
      
      // Additional cleanup to ensure fresh start
      this.cleanup();
      
      // Wait for process cleanup but don't regenerate config
      log.info('⏱️ Waiting for process cleanup after restart...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      log.info('Starting service with existing configuration (preserving manual edits)...');
      
      // Start without calling generateConfig() to preserve manual edits
      return await this.startWithoutConfigGeneration();
      
    } catch (error) {
      log.error('Error during restart without config regeneration:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start service without generating configuration (uses existing config file)
   */
  async startWithoutConfigGeneration() {
    if (this.isRunning) {
      log.info('Service is already running');
      return { success: true, message: 'Service already running' };
    }

    if (this.isStarting) {
      log.info('Service is already starting, waiting...');
      // Wait for current startup to complete
      while (this.isStarting) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return { success: this.isRunning, message: this.isRunning ? 'Service started' : 'Service failed to start' };
    }

    try {
      this.isStarting = true;
      this.startingTimestamp = Date.now();
      
      // Check if config file exists
      if (!fsSync.existsSync(this.configPath)) {
        throw new Error('Configuration file not found. Please regenerate configuration first.');
      }

      log.info('Using existing configuration file:', this.configPath);
      
      // Skip config generation and jump to verification
      this.setStartupPhase('Verifying configuration...');
      
      // Verify configuration file is readable
      try {
        const configContent = await fs.readFile(this.configPath, 'utf8');
        if (configContent.length < 100) {
          log.warn('⚠️ Configuration file seems too small');
        }
        log.info('✅ Configuration file verified and ready');
      } catch (configError) {
        throw new Error(`Configuration file is not readable: ${configError.message}`);
      }

      // Continue with the rest of the startup process (same as the main start method)
      this.setStartupPhase('Starting service...');
      log.info('🚀 All checks passed - starting llama-swap service...');
      
      // Get binary path
      if (!this.binaryPaths?.llamaSwap) {
        throw new Error('llama-swap binary path not found');
      }

      // Log startup information
      log.info(`🎮 Platform: ${this.platformInfo.platformDir}`);
      log.info(`📁 Binary path: ${this.binaryPaths.llamaSwap}`);
      log.info(`📁 Config path: ${this.configPath}`);
      log.info(`🌐 Port: ${this.port}`);

      // Prepare startup arguments
      const args = [
        '-config', this.configPath,
        '-listen', `127.0.0.1:${this.port}`
      ];

      log.info(`🚀 Starting with args: ${args.join(' ')}`);

      // Final port check before starting
      this.setStartupPhase('Checking port availability...');
      await this.killProcessesOnPort(this.port);

      // Double-check port is actually free
      try {
        const net = require('net');
        const testServer = net.createServer();
        
        await new Promise((resolve, reject) => {
          testServer.listen(this.port, '127.0.0.1', () => {
            testServer.close();
            log.info(`✅ Port ${this.port} is available for use`);
            resolve();
          });
          
          testServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              reject(new Error(`Port ${this.port} is still in use after cleanup`));
            } else {
              reject(err);
            }
          });
        });
      } catch (portError) {
        throw portError;
      }

      // Final preparation delay
      this.setStartupPhase('Final preparations...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the process
      this.setStartupPhase('Launching Clara\'s Pocket...');
      this.process = spawn(this.binaryPaths.llamaSwap, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.platformManager.getPlatformEnvironment(),
        detached: false
      });

      this.isRunning = true;
      this.setStartupPhase('Waiting for service to respond...');
      
      // Start process monitoring
      this.startProcessMonitoring();

      // Set up process event handlers (same as main start method)
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        log.info(`llama-swap stdout: ${output.trim()}`);
        
        this.parseProgressFromOutput(output);
        
        if (output.includes(`listening on`) || 
            output.includes(`server started`) ||
            output.includes(`:${this.port}`)) {
          this.setStartupPhase('Service ready!');
          log.info(`✅ llama-swap service started successfully on port ${this.port}`);
        }
      });

      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        log.error(`llama-swap stderr: ${error.trim()}`);
      });

      this.process.on('close', (code) => {
        log.info(`llama-swap process exited with code ${code}`);
        this.isRunning = false;
        this.process = null;
      });

      this.process.on('error', (error) => {
        log.error('Failed to start llama-swap service:', error);
        this.isRunning = false;
        this.process = null;
      });

      // Wait for process to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if process is still running
      if (this.process && !this.process.killed) {
        this.setStartupPhase('Verifying service health...');
        log.info('✅ llama-swap process is running, checking if service is responding...');
        
        try {
          await this.waitForService(10);
          this.setStartupPhase(null);
          log.info('✅ llama-swap service is responding to requests');
          return { success: true, message: 'Service started successfully with existing configuration' };
        } catch (serviceError) {
          log.warn('⚠️ llama-swap process started but service is not responding:', serviceError.message);
          return { success: true, message: 'Service started but not responding yet', warning: serviceError.message };
        }
      } else {
        this.isRunning = false;
        this.setStartupPhase(null);
        throw new Error('Service failed to start or exited immediately');
      }

    } catch (error) {
      log.error('Error starting service without config generation:', error);
      this.isRunning = false;
      this.process = null;
      return { success: false, error: error.message };
    } finally {
      this.isStarting = false;
      this.startingTimestamp = null;
      this.setStartupPhase(null);
    }
  }

  /**
   * Regenerate configuration (alias for generateConfig for UI compatibility)
   */
  async regenerateConfig() {
    try {
      const result = await this.generateConfig();
      return {
        success: true,
        message: 'Configuration regenerated successfully',
        models: result.models || 0,
        configPath: this.configPath
      };
    } catch (error) {
      log.error('Error regenerating config:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Simple YAML parser fallback (very basic, for emergency use)
   */
  parseSimpleYaml(yamlContent) {
    // This is a very basic YAML parser - only handles the structure we generate
    const lines = yamlContent.split('\n');
    const result = {};
    let currentSection = null;
    let currentModel = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#') || trimmed === '') {
        continue; // Skip comments and empty lines
      }
      
      if (trimmed.includes(':') && !trimmed.startsWith(' ')) {
        // Top-level key
        const [key, value] = trimmed.split(':', 2);
        if (value && value.trim()) {
          result[key.trim()] = value.trim();
        } else {
          currentSection = key.trim();
          result[currentSection] = {};
        }
      } else if (trimmed.startsWith('  ') && !trimmed.startsWith('    ')) {
        // Second-level key (like model names or group names)
        if (currentSection) {
          const [key, value] = trimmed.substring(2).split(':', 2);
          if (value && value.trim()) {
            result[currentSection][key.trim()] = value.trim();
          } else {
            currentModel = key.trim().replace(/['"]/g, ''); // Remove quotes
            result[currentSection][currentModel] = {};
          }
        }
      } else if (trimmed.startsWith('    ') && currentSection && currentModel) {
        // Third-level key (model properties)
        const [key, value] = trimmed.substring(4).split(':', 2);
        if (value && value.trim()) {
          const cleanValue = value.trim().replace(/['"]/g, ''); // Remove quotes
          result[currentSection][currentModel][key.trim()] = cleanValue;
        }
      }
    }
    
    return result;
  }

  /**
   * Force regenerate configuration with current settings and overrides
   */
  async forceReconfigure() {
    try {
      log.info('🔄 Force reconfiguration requested');
      
      // Apply any backend overrides before regenerating config
      const overriddenPlatform = await this.applyBackendOverride();
      if (overriddenPlatform && overriddenPlatform !== 'auto') {
        log.info(`🔧 Using overridden platform: ${overriddenPlatform}`);
        // Temporarily override the platform detection
        this.platformInfo.platformDir = overriddenPlatform;
        this.binaryPaths = this.getBinaryPathsWithOverride(overriddenPlatform);
        log.info(`🎯 Updated binary paths:`, {
          llamaSwap: this.binaryPaths.llamaSwap,
          llamaServer: this.binaryPaths.llamaServer
        });
      } else {
        log.info('🔧 Using default platform detection (no override)');
      }
      
      // Regenerate configuration
      const result = await this.generateConfig();
      
      // Wait for force reconfiguration to complete properly
      log.info('⏱️ Waiting for force reconfiguration to finalize...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      
      log.info('✅ Force reconfiguration completed');
      return {
        success: true,
        message: 'Configuration regenerated successfully',
        modelsFound: result.models,
        configPath: this.configPath
      };
      
    } catch (error) {
      log.error('❌ Error during force reconfiguration:', error);
      return {
        success: false,  
        error: error.message
      };
    }
  }

  /**
   * Get binary paths with platform override
   */
  getBinaryPathsWithOverride(platformOverride) {
    try {
      const overridePlatformPath = path.join(this.baseDir, platformOverride);
      
      // Determine binary names based on platform
      let binaryNames;
      if (platformOverride.includes('win32')) {
        binaryNames = {
          llamaSwap: 'llama-swap-win32-x64.exe',
          llamaServer: 'llama-server.exe'
        };
      } else if (platformOverride.includes('darwin')) {
        binaryNames = {
          llamaSwap: 'llama-swap-darwin',
          llamaServer: 'llama-server'
        };
      } else {
        binaryNames = {
          llamaSwap: 'llama-swap-linux',
          llamaServer: 'llama-server'
        };
      }
      
      return {
        llamaSwap: path.join(overridePlatformPath, binaryNames.llamaSwap),
        llamaServer: path.join(overridePlatformPath, binaryNames.llamaServer)
      };
      
    } catch (error) {
      log.error('Error getting binary paths with override:', error);
      return this.binaryPaths; // Fallback to original paths
    }
  }

  /**
   * Get comprehensive configuration information for UI
   */
  async getConfigurationInfo() {
    try {
      const results = await Promise.all([
        this.getAvailableBackends(),
        this.getBackendOverride(),
        this.getConfigAsJson(),
        this.loadPerformanceSettings(),
        this.detectGPUInfo()
      ]);
      
      const [backends, override, config, perfSettings, gpuInfo] = results;
      
      return {
        success: true,
        availableBackends: backends.success ? backends.backends : [],
        currentBackendOverride: override.success ? {
          backendId: override.backendId,
          isOverridden: override.isOverridden,
          timestamp: override.timestamp
        } : null,
        configuration: config.success ? config.config : null,
        configPath: this.configPath,
        performanceSettings: perfSettings.success ? perfSettings.settings : null,
        platform: os.platform(),
        architecture: os.arch(),
        serviceStatus: this.getStatus(),
        gpuInfo: gpuInfo
      };
      
    } catch (error) {
      log.error('Error getting configuration info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Load individual model configurations from persistent storage
   */
  async loadIndividualModelConfigurations() {
    try {
      const configsPath = path.join(this.settingsDir, 'individual-model-configs.json');
      
      if (!fsSync.existsSync(configsPath)) {
        return {
          success: false,
          message: 'No individual model configurations file found'
        };
      }
      
      const configData = await fs.readFile(configsPath, 'utf8');
      const configsMap = JSON.parse(configData);
      
      // Convert from map to array format expected by the system
      const modelConfigs = Object.entries(configsMap).map(([name, config]) => ({
        name,
        ...config
      }));
      
      return {
        success: true,
        models: modelConfigs
      };
    } catch (error) {
      log.error('Error loading individual model configurations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get model configurations with native context sizes
   */
  async getModelConfigurations() {
    try {
      const models = await this.scanModels();
      const mainModels = models.filter(model => !this.isMmprojModel(model.file));
      
      const modelConfigs = [];
      
      for (const model of mainModels) {
        const isEmbedding = this.isEmbeddingModel(model.file);
        
        // Extract context size from GGUF metadata
        let nativeContextSize = null;
        try {
          const metadata = await this.extractGGUFMetadata(model.path);
          if (metadata?.contextSize) {
            nativeContextSize = metadata.contextSize;
          }
        } catch (error) {
          log.warn(`Could not extract metadata for ${model.file}:`, error.message);
        }
        
        // Get current configuration from existing config file
        let currentConfig = {};
        try {
          if (fsSync.existsSync(this.configPath)) {
            const configContent = fsSync.readFileSync(this.configPath, 'utf8');
            
            // Parse context size from command line
            const modelSection = configContent.split(`"${model.file}":`)[1];
            if (modelSection) {
              const cmdMatch = modelSection.match(/--ctx-size (\d+)/);
              if (cmdMatch) {
                currentConfig.configuredContextSize = parseInt(cmdMatch[1]);
              }
              
              const threadsMatch = modelSection.match(/--threads (\d+)/);
              if (threadsMatch) {
                currentConfig.threads = parseInt(threadsMatch[1]);
              }
              
              const ttlMatch = modelSection.match(/ttl: (\d+)/);
              if (ttlMatch) {
                currentConfig.ttl = parseInt(ttlMatch[1]);
              }
            }
          }
        } catch (error) {
          log.warn(`Could not parse current config for ${model.file}:`, error.message);
        }
        
        modelConfigs.push({
          name: model.file,
          path: model.path,
          port: isEmbedding ? 9998 : 9999,
          isEmbedding,
          nativeContextSize,
          configuredContextSize: currentConfig.configuredContextSize || nativeContextSize,
          gpuLayers: currentConfig.gpuLayers || 50,
          batchSize: currentConfig.batchSize || 256,
          ubatchSize: currentConfig.ubatchSize || 256,
          threads: currentConfig.threads || 4,
          flashAttention: currentConfig.flashAttention !== false,
          memoryLock: currentConfig.memoryLock !== false,
          ttl: currentConfig.ttl || 300,
          status: 'available'
        });
      }
      
      return {
        success: true,
        models: modelConfigs
      };
    } catch (error) {
      log.error('Error getting model configurations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save configuration for a specific model
   */
  async saveModelConfiguration(modelName, modelConfig) {
    try {
      // Load existing individual model configurations
      const configsPath = path.join(this.settingsDir, 'individual-model-configs.json');
      let existingConfigs = {};
      
      try {
        if (fsSync.existsSync(configsPath)) {
          const configData = await fs.readFile(configsPath, 'utf8');
          existingConfigs = JSON.parse(configData);
        }
      } catch (error) {
        log.warn('Failed to load existing individual model configurations:', error.message);
        existingConfigs = {};
      }
      
      // Update the configuration for this model
      existingConfigs[modelName] = modelConfig;
      
      // Save updated configurations
      await fs.writeFile(configsPath, JSON.stringify(existingConfigs, null, 2), 'utf8');
      
      // Update in-memory configurations
      if (!this.customModelConfigs) {
        this.customModelConfigs = [];
      }
      
      // Remove existing config for this model and add updated one
      this.customModelConfigs = this.customModelConfigs.filter(config => config.name !== modelName);
      this.customModelConfigs.push({ name: modelName, ...modelConfig });
      
      // Regenerate configuration with updated settings
      await this.generateConfig();
      
      log.info(`Configuration saved for model: ${modelName}`);
      return {
        success: true,
        message: `Configuration saved for ${modelName}`
      };
    } catch (error) {
      log.error(`Error saving model configuration for ${modelName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save configurations for all models
   */
  async saveAllModelConfigurations(modelConfigs) {
    try {
      // Save all individual model configurations to persistent storage
      const configsPath = path.join(this.settingsDir, 'individual-model-configs.json');
      const configsMap = {};
      
      for (const modelConfig of modelConfigs) {
        configsMap[modelConfig.name] = modelConfig;
      }
      
      await fs.writeFile(configsPath, JSON.stringify(configsMap, null, 2), 'utf8');
      
      // Store the model configurations for use in generateConfig
      this.customModelConfigs = modelConfigs;
      
      // Regenerate configuration with custom settings
      await this.generateConfig();
      
      log.info(`Configuration saved for ${modelConfigs.length} models`);
      return {
        success: true,
        message: `Configuration saved for ${modelConfigs.length} models`
      };
    } catch (error) {
      log.error('Error saving all model configurations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse command line arguments to extract configuration parameters
   */
  parseCommandLineToConfig(cmdLine) {
    const config = {};
    
    if (!cmdLine || typeof cmdLine !== 'string') {
      return config;
    }
    
    // Parse various command line parameters
    const patterns = {
      threads: /--threads\s+(\d+)/,
      contextSize: /--ctx-size\s+(\d+)/,
      flashAttention: /--flash-attn/,
      memoryLock: /--mlock/,
      batchSize: /--batch-size\s+(\d+)/,
      ubatchSize: /--ubatch-size\s+(\d+)/,
      gpuLayers: /--n-gpu-layers\s+(\d+)/
    };
    
    // Extract numeric parameters
    for (const [key, pattern] of Object.entries(patterns)) {
      if (key === 'flashAttention' || key === 'memoryLock') {
        // Boolean flags
        config[key] = pattern.test(cmdLine);
      } else {
        // Numeric parameters
        const match = cmdLine.match(pattern);
        if (match) {
          config[key] = parseInt(match[1]);
        }
      }
    }
    
    return config;
  }

  /**
   * Run LLaMA optimizer with specified preset
   * @param {Object} options - Optimization options
   * @param {string} options.configPath - Path to the configuration file
   * @param {string} options.preset - Optimization preset
   * @returns {Promise<Object>} Result of optimization
   */
  async runLlamaOptimizer(preset) {
    try {
      const { spawn } = require('child_process');
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      // Use the default config path from the service
      const configPath = this.configPath;
      
      // Determine the correct binary path based on platform
      let binaryName;
      switch (os.platform()) {
        case 'win32':
          binaryName = 'llama-optimizer-windows.exe';
          break;
        case 'darwin':
          binaryName = os.arch() === 'arm64' ? 'llama-optimizer-darwin-arm64' : 'llama-optimizer-darwin-amd64';
          break;
        case 'linux':
          binaryName = 'llama-optimizer-linux';
          break;
        default:
          throw new Error(`Unsupported platform: ${os.platform()}`);
      }
      
      // Try electron app resources first (production)
      let binaryPath;
      const resourcesPath = process.resourcesPath 
        ? path.join(process.resourcesPath, 'electron', 'services', binaryName)
        : null;
      
      // Try local development path
      const devPath = path.join(__dirname, 'services', binaryName);
      
      // Check which path exists
      if (resourcesPath && fs.existsSync(resourcesPath)) {
        binaryPath = resourcesPath;
      } else if (fs.existsSync(devPath)) {
        binaryPath = devPath;
      } else {
        throw new Error(`LLaMA Optimizer binary not found. Tried paths: ${resourcesPath || 'N/A'}, ${devPath}`);
      }
      
      log.info(`Running LLaMA Optimizer: ${binaryPath} -config "${configPath}" -preset ${preset}`);
      
      return new Promise((resolve) => {
        const child = spawn(binaryPath, [
          '-config', configPath,
          '-preset', preset,
          '-backup=true'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            log.info('LLaMA Optimizer completed successfully');
            log.info('Optimizer output:', stdout);
            
            // Instead of restarting (which regenerates config), read the optimized config
            // and save it through the proper JSON pathway to preserve the changes
            (async () => {
              try {
                const yaml = require('js-yaml');
                const fs = require('fs').promises;
                
                // Read the optimized YAML configuration
                const optimizedYaml = await fs.readFile(configPath, 'utf8');
                const optimizedConfig = yaml.load(optimizedYaml);
                
                // Save the optimized config through the JSON pathway to preserve changes
                const saveResult = await this.saveConfigFromJson(optimizedConfig);
                
                if (saveResult.success) {
                  log.info('Optimized configuration saved through proper pathway');
                  
                  // Now restart the service (skip config regeneration since we already saved properly)
                  this.restart(true).then(() => {
                    resolve({
                      success: true,
                      message: `Configuration optimized with ${preset} preset and service restarted`,
                      output: stdout,
                      preset: preset
                    });
                  }).catch((restartError) => {
                    log.error('Failed to restart after optimization:', restartError);
                    resolve({
                      success: true,
                      message: `Configuration optimized with ${preset} preset, but restart failed: ${restartError.message}`,
                      output: stdout,
                      preset: preset
                    });
                  });
                } else {
                  log.error('Failed to save optimized config:', saveResult.error);
                  resolve({
                    success: false,
                    error: `Optimization completed but failed to save: ${saveResult.error}`
                  });
                }
              } catch (saveError) {
                log.error('Error processing optimized configuration:', saveError);
                // Fallback: just return success without restart
                resolve({
                  success: true,
                  message: `Configuration optimized with ${preset} preset (manual restart required)`,
                  output: stdout,
                  preset: preset
                });
              }
            })();
          } else {
            const errorMessage = stderr || stdout || `Process exited with code ${code}`;
            log.error('LLaMA Optimizer failed:', errorMessage);
            resolve({
              success: false,
              error: errorMessage
            });
          }
        });
        
        child.on('error', (error) => {
          log.error('Failed to start LLaMA Optimizer:', error);
          resolve({
            success: false,
            error: error.message
          });
        });
        
        // Set a timeout for the operation (30 seconds)
        setTimeout(() => {
          child.kill();
          resolve({
            success: false,
            error: 'LLaMA Optimizer timed out after 30 seconds'
          });
        }, 30000);
      });
      
    } catch (error) {
      log.error('Error running LLaMA Optimizer:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = LlamaSwapService;