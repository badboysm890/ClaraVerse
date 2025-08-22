import { WebContainer } from '@webcontainer/api';
import type { FileSystemTree } from '../components/lumaui_components/types';
import { LumauiProjectStorage } from './lumauiProjectStorage';

// Utility to process WebContainer output streams
const processOutputData = (data: string): string[] => {
  // Clean ANSI codes and control characters
  const cleaned = data
    .replace(/\x1b\[[0-9;]*[mGKHJC]/g, '') // Remove ANSI color codes
    .replace(/\x1b\[[0-9]*[ABCD]/g, '') // Remove cursor movements
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n'); // Convert remaining carriage returns
  
  // Split into lines and filter out empty ones
  return cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => {
      // Filter out server status boxes and redundant messages
      if (line.includes('┌───') || line.includes('└───') || line.includes('│')) return false;
      if (line.includes('- Local:') || line.includes('- Network:')) return false;
      if (line.includes('Serving!')) return false;
      if (line.includes('Cannot copy server address')) return false;
      return true;
    });
};

export interface ContainerInfo {
  projectId: string;
  container: WebContainer;
  status: 'booting' | 'ready' | 'running' | 'error';
  port?: number;
  previewUrl?: string;
  process?: any;
  createdAt: Date;
}

export class WebContainerManager {
  private static instance: WebContainerManager;
  private containers: Map<string, ContainerInfo> = new Map();
  private isInitialized = false;

  static getInstance(): WebContainerManager {
    if (!WebContainerManager.instance) {
      WebContainerManager.instance = new WebContainerManager();
    }
    return WebContainerManager.instance;
  }

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Check cross-origin isolation
    if (!window.crossOriginIsolated) {
      throw new Error('WebContainers require cross-origin isolation. Please ensure proper headers are set.');
    }
    
    this.isInitialized = true;
    console.log('✅ WebContainerManager initialized');
  }

  /**
   * Get or create a WebContainer for a project
   */
  async getContainer(projectId: string, files?: FileSystemTree): Promise<WebContainer> {
    let containerInfo = this.containers.get(projectId);
    
    if (containerInfo) {
      // Return existing container if it's ready
      if (containerInfo.status === 'ready' || containerInfo.status === 'running') {
        return containerInfo.container;
      }
      
      // If container is in error state, remove it and create new one
      if (containerInfo.status === 'error') {
        await this.destroyContainer(projectId);
        containerInfo = undefined;
      }
    }
    
    if (!containerInfo) {
      // Create new container
      console.log(`🚀 Creating WebContainer for project ${projectId}`);
      
      const container = await WebContainer.boot();
      
      containerInfo = {
        projectId,
        container,
        status: 'booting',
        createdAt: new Date()
      };
      
      this.containers.set(projectId, containerInfo);
      
      // Mount files if provided
      if (files) {
        await container.mount(files as any);
        console.log(`📁 Files mounted for project ${projectId}`);
      }
      
      containerInfo.status = 'ready';
      console.log(`✅ WebContainer ready for project ${projectId}`);
    }
    
    return containerInfo.container;
  }

  /**
   * Start a project (install dependencies and run dev server)
   */
  async startProject(
    projectId: string, 
    framework: 'react' | 'vanilla-html',
    onOutput?: (message: string, type: 'output' | 'error' | 'info') => void
  ): Promise<{ url?: string; port?: number }> {
    
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo || containerInfo.status !== 'ready') {
      throw new Error('Container not ready for project ' + projectId);
    }

    const { container } = containerInfo;
    
    try {
      containerInfo.status = 'running';
      
      if (framework === 'vanilla-html') {
        // For vanilla HTML, use WebContainer's built-in static server
        onOutput?.('📄 Starting static file server...', 'info');
        
        // Create a minimal package.json for serving
        await container.fs.writeFile('/package.json', JSON.stringify({
          name: 'static-server',
          version: '1.0.0',
          scripts: {
            serve: 'npx serve -s . -p 3000'
          }
        }, null, 2));
        
        // Install serve package
        onOutput?.('📦 Installing serve package...', 'info');
        const installProcess = await container.spawn('npm', ['install', 'serve']);
        
        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error('Failed to install serve package');
        }
        
        // Start the static server
        onOutput?.('🌐 Starting static server...', 'info');
        const serverProcess = await container.spawn('npx', ['serve', '-s', '.', '-p', '3000']);
        containerInfo.process = serverProcess;
        
        serverProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        // Listen for server ready event
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Static server startup timeout'));
          }, 15000); // 15 second timeout
          
          container.on('server-ready', async (port, url) => {
            clearTimeout(timeout);
            
            containerInfo.port = port;
            containerInfo.previewUrl = url;
            
            // Update persistent storage
            await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
            
            onOutput?.(`🎉 Static server ready at ${url}`, 'info');
            resolve({ url, port });
          });
          
          // Also check manually after a delay as fallback
          setTimeout(async () => {
            if (!containerInfo.previewUrl) {
              try {
                // Try to detect the server manually
                const port = 3000;
                const url = `${window.location.protocol}//${window.location.hostname}:${port}`;
                
                containerInfo.port = port;
                containerInfo.previewUrl = url;
                
                await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
                
                clearTimeout(timeout);
                onOutput?.(`🎉 Static server ready at ${url}`, 'info');
                resolve({ url, port });
              } catch (error) {
                // Will be handled by timeout
              }
            }
          }, 3000);
        });
        
      } else {
        // For React projects, install dependencies and run dev server
        onOutput?.('📦 Installing dependencies...', 'info');
        
        const installProcess = await container.spawn('npm', ['install']);
        
        installProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error('Failed to install dependencies');
        }
        
        onOutput?.('🌐 Starting development server...', 'info');
        
        const devProcess = await container.spawn('npm', ['run', 'dev']);
        containerInfo.process = devProcess;
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) {
            const lines = processOutputData(data);
            lines.forEach(line => onOutput?.(line, 'output'));
          }
        }));
        
        // Listen for server ready event
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Server startup timeout'));
          }, 30000); // 30 second timeout
          
          container.on('server-ready', async (port, url) => {
            clearTimeout(timeout);
            
            containerInfo.port = port;
            containerInfo.previewUrl = url;
            
            // Update persistent storage
            await LumauiProjectStorage.updateProjectStatus(projectId, 'running', url, port);
            
            onOutput?.(`🎉 Server ready at ${url}`, 'info');
            resolve({ url, port });
          });
        });
      }
      
    } catch (error) {
      containerInfo.status = 'error';
      await LumauiProjectStorage.updateProjectStatus(projectId, 'error');
      throw error;
    }
  }

  /**
   * Stop a project
   */
  async stopProject(projectId: string): Promise<void> {
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;
    
    try {
      // Kill the process if it exists
      if (containerInfo.process) {
        containerInfo.process.kill();
        containerInfo.process = undefined;
      }
      
      containerInfo.status = 'ready';
      containerInfo.port = undefined;
      containerInfo.previewUrl = undefined;
      
      // Update persistent storage
      await LumauiProjectStorage.updateProjectStatus(projectId, 'idle');
      
      console.log(`⏹️ Stopped project ${projectId}`);
    } catch (error) {
      console.error('Error stopping project:', error);
    }
  }

  /**
   * Destroy a container completely
   */
  async destroyContainer(projectId: string): Promise<void> {
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;
    
    try {
      // Stop any running processes
      await this.stopProject(projectId);
      
      // Remove from tracking
      this.containers.delete(projectId);
      
      // Update persistent storage
      await LumauiProjectStorage.updateProjectStatus(projectId, 'idle');
      
      console.log(`🗑️ Destroyed container for project ${projectId}`);
    } catch (error) {
      console.error('Error destroying container:', error);
    }
  }

  /**
   * Get container status
   */
  getContainerStatus(projectId: string): ContainerInfo | undefined {
    return this.containers.get(projectId);
  }

  /**
   * Cleanup all containers (for app shutdown)
   */
  async cleanup(): Promise<void> {
    const projectIds = Array.from(this.containers.keys());
    
    await Promise.all(
      projectIds.map(id => this.destroyContainer(id))
    );
    
    console.log('🧹 WebContainerManager cleanup complete');
  }

  /**
   * Get all active containers
   */
  getActiveContainers(): ContainerInfo[] {
    return Array.from(this.containers.values());
  }
} 
