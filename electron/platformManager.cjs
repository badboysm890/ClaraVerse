const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const log = require('electron-log');

/**
 * Platform Manager for handling cross-platform binary distribution
 * Supports both pre-built binaries and just-in-time compilation
 */
class PlatformManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.platformInfo = this.detectPlatformInfo();
    this.supportedPlatforms = this.getSupportedPlatforms();
  }

  detectPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    
    return {
      platform,
      arch,
      platformDir: this.getPlatformDirectory(platform, arch),
      isWindows: platform === 'win32',
      isMac: platform === 'darwin',
      isLinux: platform === 'linux'
    };
  }

  getPlatformDirectory(platform, arch) {
    switch (platform) {
      case 'darwin':
        return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      case 'linux':
        return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      case 'win32':
        return 'win32-x64';
      default:
        throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }
  }

  getSupportedPlatforms() {
    return {
      'darwin-arm64': {
        name: 'macOS (Apple Silicon)',
        binaries: ['llama-swap-darwin-arm64', 'llama-server'],
        libraries: ['*.dylib'],
        headers: ['*.h'],
        shaders: ['*.metal'],
        supported: true
      },
      'darwin-x64': {
        name: 'macOS (Intel)',
        binaries: ['llama-swap-darwin-x64', 'llama-server'],
        libraries: ['*.dylib'],
        headers: ['*.h'],
        shaders: ['*.metal'],
        supported: false // Will be added in future
      },
      'linux-x64': {
        name: 'Linux (x64)',
        binaries: ['llama-swap-linux-x64', 'llama-server'],
        libraries: ['*.so'],
        headers: ['*.h'],
        supported: false // Will be added in future
      },
      'linux-arm64': {
        name: 'Linux (ARM64)',
        binaries: ['llama-swap-linux-arm64', 'llama-server'],
        libraries: ['*.so'],
        headers: ['*.h'],
        supported: false // Will be added in future
      },
      'win32-x64': {
        name: 'Windows (x64)',
        binaries: ['llama-swap-win32-x64.exe', 'llama-server.exe'],
        libraries: ['*.dll'],
        headers: ['*.h'],
        supported: false // Will be added in future
      }
    };
  }

  /**
   * Get the binary paths for the current platform
   */
  getBinaryPaths() {
    const platformBinDir = path.join(this.baseDir, this.platformInfo.platformDir);
    const platformConfig = this.supportedPlatforms[this.platformInfo.platformDir];
    
    if (!platformConfig) {
      throw new Error(`Unsupported platform: ${this.platformInfo.platformDir}`);
    }

    const binaryPaths = {};
    
    // Map standard binary names to platform-specific names
    platformConfig.binaries.forEach(binaryName => {
      if (binaryName.includes('llama-swap')) {
        binaryPaths.llamaSwap = path.join(platformBinDir, binaryName);
      } else if (binaryName.includes('llama-server')) {
        binaryPaths.llamaServer = path.join(platformBinDir, binaryName);
      }
    });

    return binaryPaths;
  }

  /**
   * Check if current platform is supported
   */
  isCurrentPlatformSupported() {
    const platformConfig = this.supportedPlatforms[this.platformInfo.platformDir];
    return platformConfig && platformConfig.supported;
  }

  /**
   * Validate that all required binaries exist for the current platform
   */
  async validatePlatformBinaries() {
    if (!this.isCurrentPlatformSupported()) {
      throw new Error(`Platform ${this.platformInfo.platformDir} is not yet supported. Supported platforms: ${this.getSupportedPlatformNames().join(', ')}`);
    }

    const binaryPaths = this.getBinaryPaths();
    const issues = [];

    for (const [name, binaryPath] of Object.entries(binaryPaths)) {
      if (!this.binaryExists(binaryPath)) {
        issues.push(`${name} binary not found at: ${binaryPath}`);
      } else {
        try {
          await fs.access(binaryPath, fs.constants.F_OK | fs.constants.X_OK);
        } catch (error) {
          issues.push(`${name} binary exists but is not executable: ${binaryPath}`);
        }
      }
    }

    if (issues.length > 0) {
      const error = new Error(`Platform binary validation failed:\n${issues.join('\n')}`);
      error.issues = issues;
      throw error;
    }

    log.info(`Platform validation successful for ${this.platformInfo.platformDir}`);
    return true;
  }

  /**
   * Check if a binary file exists and is a file
   */
  binaryExists(binaryPath) {
    try {
      return fsSync.existsSync(binaryPath) && fsSync.statSync(binaryPath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of supported platform names
   */
  getSupportedPlatformNames() {
    return Object.entries(this.supportedPlatforms)
      .filter(([_, config]) => config.supported)
      .map(([platformDir, config]) => config.name);
  }

  /**
   * Get platform directory for the current system
   */
  getCurrentPlatformDirectory() {
    return this.platformInfo.platformDir;
  }

  /**
   * Get platform-specific library directory
   */
  getPlatformLibraryDirectory() {
    return path.join(this.baseDir, this.platformInfo.platformDir);
  }

  /**
   * Get platform-specific environment variables for running binaries
   */
  getPlatformEnvironment() {
    const platformLibDir = this.getPlatformLibraryDirectory();
    const env = { ...process.env };

    if (this.platformInfo.isLinux) {
      env.LD_LIBRARY_PATH = platformLibDir + ':' + (env.LD_LIBRARY_PATH || '');
    } else if (this.platformInfo.isMac) {
      env.DYLD_LIBRARY_PATH = platformLibDir + ':' + (env.DYLD_LIBRARY_PATH || '');
    }
    // Windows uses PATH for DLL loading, which should already include the platform directory

    return env;
  }

  /**
   * Future: Download and install binaries for a specific platform
   * This will be implemented when adding JIT compilation support
   */
  async downloadPlatformBinaries(platformDir, version = 'latest') {
    throw new Error('Binary download functionality not yet implemented. This will support downloading pre-built binaries or compiling from source.');
  }

  /**
   * Future: Compile binaries from source (JIT)
   * This will be implemented when adding JIT compilation support
   */
  async compileBinariesFromSource(options = {}) {
    throw new Error('Just-in-time compilation not yet implemented. This will support building llama.cpp from source.');
  }

  /**
   * Get platform information for debugging
   */
  getPlatformInfo() {
    return {
      current: this.platformInfo,
      supported: this.isCurrentPlatformSupported(),
      availablePlatforms: this.getSupportedPlatformNames(),
      binaryPaths: this.isCurrentPlatformSupported() ? this.getBinaryPaths() : null
    };
  }

  /**
   * Check for platform-specific optimizations
   */
  getOptimizations() {
    const optimizations = {
      cpu: [],
      gpu: [],
      memory: []
    };

    // Detect CPU features
    const cpuFlags = os.cpus()[0]?.flags || [];
    if (cpuFlags.includes('avx2')) optimizations.cpu.push('AVX2');
    if (cpuFlags.includes('avx512')) optimizations.cpu.push('AVX-512');

    // Platform-specific GPU support
    if (this.platformInfo.isMac) {
      optimizations.gpu.push('Metal');
    } else if (this.platformInfo.isLinux) {
      optimizations.gpu.push('CUDA', 'OpenCL');
    } else if (this.platformInfo.isWindows) {
      optimizations.gpu.push('CUDA', 'DirectML');
    }

    return optimizations;
  }
}

module.exports = PlatformManager; 