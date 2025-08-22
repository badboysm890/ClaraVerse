const { EventEmitter } = require('events');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { promisify } = require('util');
const { pipeline } = require('stream');
const pipelineAsync = promisify(pipeline);

class ComfyUIModelService extends EventEmitter {
  constructor() {
    super();
    
    console.log('🎨 Initializing ComfyUIModelService...');
    
    this.docker = new Docker();
    this.containerName = 'angela_comfyui';
    
    // Local download and persistent storage directories
    const os = require('os');
    this.localDownloadDir = path.join(os.homedir(), '.angela', 'model-downloads');
    this.persistentModelDir = path.join(os.homedir(), '.angela', 'comfyui-data', 'models');
    
    console.log(`📁 Download dir: ${this.localDownloadDir}`);
    console.log(`📁 Persistent dir: ${this.persistentModelDir}`);
    
    // Ensure local directories exist
    if (!fs.existsSync(this.localDownloadDir)) {
      fs.mkdirSync(this.localDownloadDir, { recursive: true });
      console.log(`✅ Created download directory: ${this.localDownloadDir}`);
    }
    if (!fs.existsSync(this.persistentModelDir)) {
      fs.mkdirSync(this.persistentModelDir, { recursive: true });
      console.log(`✅ Created persistent directory: ${this.persistentModelDir}`);
    }
    
    // Model categories and their paths (both local and container)
    this.modelPaths = {
      checkpoints: {
        local: path.join(this.persistentModelDir, 'checkpoints'),
        container: '/app/ComfyUI/models/checkpoints',
        download: path.join(this.localDownloadDir, 'checkpoints')
      },
      loras: {
        local: path.join(this.persistentModelDir, 'loras'),
        container: '/app/ComfyUI/models/loras',
        download: path.join(this.localDownloadDir, 'loras')
      },
      vae: {
        local: path.join(this.persistentModelDir, 'vae'),
        container: '/app/ComfyUI/models/vae',
        download: path.join(this.localDownloadDir, 'vae')
      },
      controlnet: {
        local: path.join(this.persistentModelDir, 'controlnet'),
        container: '/app/ComfyUI/models/controlnet',
        download: path.join(this.localDownloadDir, 'controlnet')
      },
      upscale_models: {
        local: path.join(this.persistentModelDir, 'upscale_models'),
        container: '/app/ComfyUI/models/upscale_models',
        download: path.join(this.localDownloadDir, 'upscale_models')
      },
      embeddings: {
        local: path.join(this.persistentModelDir, 'embeddings'),
        container: '/app/ComfyUI/models/embeddings',
        download: path.join(this.localDownloadDir, 'embeddings')
      },
      clip_vision: {
        local: path.join(this.persistentModelDir, 'clip_vision'),
        container: '/app/ComfyUI/models/clip_vision',
        download: path.join(this.localDownloadDir, 'clip_vision')
      }
    };
    
    // Ensure all local directories exist
    Object.values(this.modelPaths).forEach(paths => {
      [paths.local, paths.download].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`✅ Created model directory: ${dir}`);
        }
      });
    });
    
    console.log('🎨 ComfyUIModelService initialized successfully');

    // Popular model repositories
    this.repositories = {
      huggingface: 'https://huggingface.co',
      civitai: 'https://civitai.com/api/download/models',
      openart: 'https://openart.ai'
    };

    // Download queue and status tracking
    this.downloadQueue = new Map();
    this.activeDownloads = new Map();
    this.transferQueue = new Map();
    
    console.log('🚀 ComfyUI Model Service initialized with local download support');
    console.log('📁 Local download directory:', this.localDownloadDir);
    console.log('💾 Persistent model directory:', this.persistentModelDir);
  }

  /**
   * Get ComfyUI container instance
   */
  async getContainer() {
    try {
      const container = this.docker.getContainer(this.containerName);
      const info = await container.inspect();
      
      if (info.State.Status !== 'running') {
        throw new Error('ComfyUI container is not running');
      }
      
      return container;
    } catch (error) {
      throw new Error(`Failed to get ComfyUI container: ${error.message}`);
    }
  }

  /**
   * List models currently installed in ComfyUI container
   */
  async listInstalledModels(category = 'checkpoints') {
    try {
      const container = await this.getContainer();
      const modelPath = this.modelPaths[category];
      
      if (!modelPath) {
        throw new Error(`Unknown model category: ${category}`);
      }

      const exec = await container.exec({
        Cmd: ['find', modelPath, '-type', 'f', '-name', '*.safetensors', '-o', '-name', '*.ckpt', '-o', '-name', '*.pth', '-o', '-name', '*.bin'],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      return new Promise((resolve, reject) => {
        let output = '';
        let error = '';
        
        stream.on('data', (data) => {
          const chunk = data.toString();
          if (chunk.includes('Error') || chunk.includes('error')) {
            error += chunk;
          } else {
            output += chunk;
          }
        });
        
        stream.on('end', () => {
          if (error) {
            reject(new Error(error));
          } else {
            const files = output.trim().split('\n')
              .filter(line => line.trim())
              .map(filePath => ({
                name: path.basename(filePath),
                path: filePath,
                category: category,
                size: null // We could get size with additional exec if needed
              }));
            resolve(files);
          }
        });
        
        stream.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to list models: ${error.message}`);
    }
  }

  /**
   * Get container storage info
   */
  async getStorageInfo() {
    try {
      const container = await this.getContainer();
      
      const exec = await container.exec({
        Cmd: ['df', '-h', '/app/ComfyUI/models'],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      return new Promise((resolve, reject) => {
        let output = '';
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.on('end', () => {
          const lines = output.trim().split('\n');
          if (lines.length > 1) {
            const [filesystem, size, used, available, percent, mountpoint] = lines[1].split(/\s+/);
            resolve({
              filesystem,
              size,
              used,
              available,
              percent,
              mountpoint
            });
          } else {
            resolve({ error: 'Could not parse storage info' });
          }
        });
        
        stream.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to get storage info: ${error.message}`);
    }
  }

  /**
   * Download model from URL to local storage, then transfer to container
   */
  async downloadModel(url, filename, category = 'checkpoints', onProgress = null, redirectCount = 0, options = {}) {
    try {
      // Prevent infinite redirect loops
      if (redirectCount > 10) {
        throw new Error('Too many redirects (maximum 10 allowed)');
      }
      
      this.emit('download:start', { filename, category, url });
      
      // Download to local directory first for better performance
      const downloadPath = path.join(this.modelPaths[category].download, filename);
      const fileStream = fs.createWriteStream(downloadPath);
      
      // Parse URL to determine protocol
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      console.log(`📥 Downloading ${filename} to local storage...`);
      
      // Prepare headers with API key if provided
      const headers = {
        'User-Agent': 'angela-AI-Assistant/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      };
      
      // Add authentication headers based on source and API key
      if (options.source === 'civitai' || url.includes('civitai.com')) {
        headers['Referer'] = 'https://civitai.com/';
        if (options.apiKey) {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
          console.log(`🔑 Using CivitAI API key for authentication`);
        }
      } else if (options.source === 'huggingface' || url.includes('huggingface.co')) {
        if (options.apiKey) {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
          console.log(`🔑 Using HuggingFace API key for authentication`);
        }
      }
      
      console.log(`🌐 Request headers prepared, API key provided: ${!!options.apiKey}`);
      
      return new Promise((resolve, reject) => {
        const request = client.get(url, { headers }, (response) => {
          // Handle all redirect status codes (301, 302, 307, 308)
          if (response.statusCode === 301 || response.statusCode === 302 || 
              response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error(`Redirect response missing location header`));
              return;
            }
            console.log(`📍 Following redirect (${response.statusCode}): ${redirectUrl} (redirect ${redirectCount + 1}/10)`);
            
            // For redirects, check if we're being redirected to a CDN URL
            // CDN URLs typically don't need authentication headers and can fail with them
            const redirectUrlObj = new URL(redirectUrl);
            const isCdnUrl = redirectUrlObj.hostname.includes('cloudflarestorage.com') || 
                            redirectUrlObj.hostname.includes('amazonaws.com') || 
                            redirectUrlObj.hostname.includes('s3.') ||
                            redirectUrlObj.hostname.includes('cdn.') ||
                            redirectUrlObj.hostname.includes('storage.googleapis.com');
            
            // If redirecting to CDN, strip authentication headers
            const redirectOptions = isCdnUrl ? {} : options;
            if (isCdnUrl) {
              console.log(`🌐 Detected CDN redirect, removing auth headers for: ${redirectUrlObj.hostname}`);
            }
            
            // Recursively follow the redirect with incremented count
            return this.downloadModel(redirectUrl, filename, category, onProgress, redirectCount + 1, redirectOptions)
              .then(resolve)
              .catch(reject);
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }
          
          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloadedSize = 0;
          
          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            
            if (onProgress && totalSize) {
              const progress = (downloadedSize / totalSize) * 100;
              onProgress(progress, downloadedSize, totalSize);
              this.emit('download:progress', { 
                filename, 
                progress, 
                downloadedSize, 
                totalSize,
                speed: this.calculateSpeed(downloadedSize)
              });
            }
          });
          
          response.pipe(fileStream);
          
          fileStream.on('finish', async () => {
            try {
              // Verify file integrity
              const stats = fs.statSync(downloadPath);
              if (stats.size === 0) {
                throw new Error('Downloaded file is empty');
              }
              
              console.log(`✅ Download completed: ${filename} (${stats.size} bytes)`);
              
              // Move to persistent storage
              const persistentPath = path.join(this.modelPaths[category].local, filename);
              await this.moveFile(downloadPath, persistentPath);
              
              console.log(`📁 Moved to persistent storage: ${persistentPath}`);
              
              this.emit('download:complete', { 
                filename, 
                category, 
                localPath: persistentPath,
                containerPath: path.join(this.modelPaths[category].container, filename),
                size: stats.size
              });
              
              resolve({ 
                filename, 
                category, 
                localPath: persistentPath,
                containerPath: path.join(this.modelPaths[category].container, filename),
                size: stats.size
              });
            } catch (error) {
              reject(new Error(`Download completed but file move failed: ${error.message}`));
            }
          });
          
          fileStream.on('error', (error) => {
            console.error(`File stream error for ${filename}:`, error);
            // Clean up partial download
            try {
              fs.unlinkSync(downloadPath);
            } catch (cleanupError) {
              console.warn('Could not clean up partial download:', cleanupError.message);
            }
            reject(error);
          });
        });
        
        request.on('error', (error) => {
          console.error(`Request error for ${filename}:`, error);
          // Clean up partial download
          try {
            fs.unlinkSync(downloadPath);
          } catch (cleanupError) {
            console.warn('Could not clean up partial download:', cleanupError.message);
          }
          reject(error);
        });
        request.setTimeout(300000, () => { // 5 minute timeout
          console.error(`Download timeout for ${filename}`);
          request.destroy();
          // Clean up partial download
          try {
            fs.unlinkSync(downloadPath);
          } catch (cleanupError) {
            console.warn('Could not clean up partial download:', cleanupError.message);
          }
          reject(new Error('Download timeout (5 minutes)'));
        });
      });
    } catch (error) {
      this.emit('download:error', { filename, error: error.message });
      throw error;
    }
  }

  /**
   * Transfer downloaded model file into ComfyUI container
   */
  async installModelToContainer(localFilePath, filename, category = 'checkpoints') {
    try {
      this.emit('install:start', { filename, category });
      
      const container = await this.getContainer();
      const targetPath = `${this.modelPaths[category]}/${filename}`;
      
      // Create the target directory if it doesn't exist
      const mkdirExec = await container.exec({
        Cmd: ['mkdir', '-p', this.modelPaths[category]],
        AttachStdout: true,
        AttachStderr: true
      });
      await mkdirExec.start({ hijack: true, stdin: false });
      
      // Read the local file
      const fileData = fs.readFileSync(localFilePath);
      
      // Copy file into container using docker cp equivalent
      const tarStream = require('tar-stream');
      const pack = tarStream.pack();
      
      pack.entry({ name: filename }, fileData);
      pack.finalize();
      
      // Use container.putArchive to copy the file
      await container.putArchive(pack, { path: this.modelPaths[category] });
      
      // Verify the file was copied successfully
      const verifyExec = await container.exec({
        Cmd: ['ls', '-la', targetPath],
        AttachStdout: true,
        AttachStderr: true
      });
      
      const verifyStream = await verifyExec.start({ hijack: true, stdin: false });
      
      return new Promise((resolve, reject) => {
        let output = '';
        
        verifyStream.on('data', (data) => {
          output += data.toString();
        });
        
        verifyStream.on('end', () => {
          if (output.includes(filename)) {
            // Clean up temporary file
            fs.unlinkSync(localFilePath);
            this.emit('install:complete', { filename, category, path: targetPath });
            resolve(targetPath);
          } else {
            reject(new Error('File verification failed'));
          }
        });
        
        verifyStream.on('error', reject);
      });
    } catch (error) {
      this.emit('install:error', { filename, category, error: error.message });
      throw error;
    }
  }

  /**
   * Download and install model in one operation
   */
  async downloadAndInstallModel(url, filename, category = 'checkpoints', onProgress = null, options = {}) {
    try {
      // Download the model
      const tempFilePath = await this.downloadModel(url, filename, category, onProgress, 0, options);
      
      // Install it to the container
      const installedPath = await this.installModelToContainer(tempFilePath, filename, category);
      
      return {
        success: true,
        filename,
        category,
        installedPath,
        message: `Successfully installed ${filename} to ${category}`
      };
    } catch (error) {
      return {
        success: false,
        filename,
        category,
        error: error.message
      };
    }
  }

  /**
   * Remove model from ComfyUI container
   */
  async removeModel(filename, category = 'checkpoints') {
    try {
      const container = await this.getContainer();
      const targetPath = `${this.modelPaths[category]}/${filename}`;
      
      const exec = await container.exec({
        Cmd: ['rm', '-f', targetPath],
        AttachStdout: true,
        AttachStderr: true
      });
      
      await exec.start({ hijack: true, stdin: false });
      
      this.emit('remove:complete', { filename, category });
      return { success: true, message: `Removed ${filename} from ${category}` };
    } catch (error) {
      this.emit('remove:error', { filename, category, error: error.message });
      throw error;
    }
  }

  /**
   * Search popular models from various sources
   */
  async searchModels(query, source = 'huggingface', category = 'checkpoints') {
    // This would integrate with various APIs to search for models
    // For now, return a mock response structure
    return {
      source,
      category,
      query,
      results: [
        {
          name: `${query} Model`,
          description: 'AI Generated model search result',
          downloadUrl: `https://example.com/models/${query}.safetensors`,
          size: '2.3 GB',
          author: 'Community',
          downloads: 12345,
          rating: 4.5
        }
      ]
    };
  }

  /**
   * Calculate download speed
   */
  calculateSpeed(downloadedBytes) {
    if (!this.downloadStartTime) {
      this.downloadStartTime = Date.now();
      return '0 MB/s';
    }
    
    const elapsed = (Date.now() - this.downloadStartTime) / 1000;
    const speed = downloadedBytes / elapsed;
    
    if (speed > 1024 * 1024) {
      return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
    } else {
      return `${(speed / 1024).toFixed(1)} KB/s`;
    }
  }

  /**
   * Get model management status
   */
  async getStatus() {
    try {
      const storageInfo = await this.getStorageInfo();
      const checkpoints = await this.listInstalledModels('checkpoints');
      const loras = await this.listInstalledModels('loras');
      const vaes = await this.listInstalledModels('vae');
      
      return {
        containerStatus: 'running',
        storage: storageInfo,
        modelCounts: {
          checkpoints: checkpoints.length,
          loras: loras.length,
          vaes: vaes.length
        },
        totalModels: checkpoints.length + loras.length + vaes.length
      };
    } catch (error) {
      return {
        containerStatus: 'error',
        error: error.message
      };
    }
  }

  /**
   * List locally stored models (persistent storage)
   */
  async listLocalModels(category = 'checkpoints') {
    try {
      const localPath = this.modelPaths[category]?.local;
      if (!localPath || !fs.existsSync(localPath)) {
        return [];
      }
      
      const files = fs.readdirSync(localPath);
      const modelFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.safetensors', '.ckpt', '.pth', '.bin', '.pt'].includes(ext);
      });
      
      return modelFiles.map(filename => {
        const filePath = path.join(localPath, filename);
        const stats = fs.statSync(filePath);
        
        return {
          name: filename,
          category: category,
          localPath: filePath,
          containerPath: path.join(this.modelPaths[category].container, filename),
          size: stats.size,
          modified: stats.mtime,
          isLocal: true,
          isPersistent: true
        };
      });
    } catch (error) {
      throw new Error(`Failed to list local models: ${error.message}`);
    }
  }

  /**
   * Move file from download to persistent storage
   */
  async moveFile(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Use rename for same filesystem, copy+delete for cross-filesystem
      fs.rename(sourcePath, destinationPath, (renameError) => {
        if (renameError && renameError.code === 'EXDEV') {
          // Cross-filesystem move - copy then delete
          const readStream = fs.createReadStream(sourcePath);
          const writeStream = fs.createWriteStream(destinationPath);
          
          readStream.pipe(writeStream);
          
          writeStream.on('finish', () => {
            fs.unlink(sourcePath, (unlinkError) => {
              if (unlinkError) {
                console.warn('Warning: Could not delete source file:', unlinkError);
              }
              resolve();
            });
          });
          
          writeStream.on('error', reject);
          readStream.on('error', reject);
        } else if (renameError) {
          reject(renameError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete a local model from persistent storage
   */
  async deleteLocalModel(filename, category = 'checkpoints') {
    try {
      const localPath = path.join(this.modelPaths[category].local, filename);
      
      if (!fs.existsSync(localPath)) {
        throw new Error(`Model file not found: ${filename}`);
      }
      
      fs.unlinkSync(localPath);
      
      this.emit('model:deleted', { filename, category, localPath });
      
      console.log(`🗑️ Deleted local model: ${filename}`);
      
      return { success: true, filename, category };
    } catch (error) {
      throw new Error(`Failed to delete model: ${error.message}`);
    }
  }

  /**
   * Get comprehensive storage information
   */
  async getEnhancedStorageInfo() {
    try {
      const info = {
        local: {},
        persistent: {},
        container: {},
        summary: {
          totalLocalModels: 0,
          totalLocalSize: 0,
          totalPersistentModels: 0,
          totalPersistentSize: 0
        }
      };
      
      // Get local storage info for each category
      for (const [category, paths] of Object.entries(this.modelPaths)) {
        try {
          const localModels = await this.listLocalModels(category);
          const totalSize = localModels.reduce((sum, model) => sum + model.size, 0);
          
          info.persistent[category] = {
            count: localModels.length,
            totalSize: totalSize,
            path: paths.local,
            models: localModels
          };
          
          info.summary.totalPersistentModels += localModels.length;
          info.summary.totalPersistentSize += totalSize;
        } catch (error) {
          info.persistent[category] = { error: error.message };
        }
      }
      
      // Get container storage info (if container is running)
      try {
        const container = await this.getContainer();
        const exec = await container.exec({
          Cmd: ['df', '-h', '/app/ComfyUI/models'],
          AttachStdout: true,
          AttachStderr: true
        });

        const stream = await exec.start({ hijack: true, stdin: false });
        
        const containerInfo = await new Promise((resolve, reject) => {
          let output = '';
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.on('end', () => {
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
              const [filesystem, size, used, available, percent, mountpoint] = lines[1].split(/\s+/);
              resolve({
                filesystem,
                size,
                used,
                available,
                percent,
                mountpoint,
                isAccessible: true
              });
            } else {
              resolve({ error: 'Could not parse container storage info' });
            }
          });
          
          stream.on('error', reject);
        });
        
        info.container = containerInfo;
      } catch (error) {
        info.container = { 
          error: `Container not accessible: ${error.message}`,
          isAccessible: false
        };
      }
      
      return info;
    } catch (error) {
      throw new Error(`Failed to get enhanced storage info: ${error.message}`);
    }
  }

  /**
   * Transfer external model file to persistent storage
   */
  async importExternalModel(externalPath, filename, category = 'checkpoints') {
    try {
      if (!fs.existsSync(externalPath)) {
        throw new Error(`External model file not found: ${externalPath}`);
      }
      
      const persistentPath = path.join(this.modelPaths[category].local, filename);
      
      // Copy file to persistent storage
      await this.moveFile(externalPath, persistentPath);
      
      console.log(`📥 Imported external model: ${filename} to ${category}`);
      
      this.emit('model:imported', { 
        filename, 
        category, 
        localPath: persistentPath,
        containerPath: path.join(this.modelPaths[category].container, filename)
      });
      
      return {
        success: true,
        filename,
        category,
        localPath: persistentPath,
        containerPath: path.join(this.modelPaths[category].container, filename)
      };
    } catch (error) {
      throw new Error(`Failed to import external model: ${error.message}`);
    }
  }

  /**
   * Backup models from container to host
   */
  async backupModels(category = 'checkpoints', backupPath) {
    try {
      const container = await this.getContainer();
      const sourcePath = this.modelPaths[category].container;
      
      // Create tar archive of the model directory
      const exec = await container.exec({
        Cmd: ['tar', '-czf', `/tmp/${category}_backup.tar.gz`, '-C', sourcePath, '.'],
        AttachStdout: true,
        AttachStderr: true
      });
      
      await exec.start({ hijack: true, stdin: false });
      
      // Copy the backup file out of the container
      const stream = await container.getArchive({ path: `/tmp/${category}_backup.tar.gz` });
      const backupFile = path.join(backupPath, `${category}_backup_${Date.now()}.tar.gz`);
      
      await pipelineAsync(stream, fs.createWriteStream(backupFile));
      
      // Clean up temporary file in container
      const cleanupExec = await container.exec({
        Cmd: ['rm', '-f', `/tmp/${category}_backup.tar.gz`],
        AttachStdout: true,
        AttachStderr: true
      });
      await cleanupExec.start({ hijack: true, stdin: false });
      
      return { success: true, backupFile };
    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    }
  }
}

module.exports = ComfyUIModelService; 
