import { WebContainer } from '@webcontainer/api';
import { FileNode } from '../types';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface LumaToolsConfig {
  webContainer: WebContainer | null;
  files: FileNode[];
  onFilesUpdate: (files: FileNode[]) => void;
  onFileSelect: (path: string, content: string) => void;
  onTerminalWrite: (message: string) => void;
  workingDirectory: string;
  onRefreshFileTree?: () => Promise<void>;
}

export class LumaTools {
  private config: LumaToolsConfig;

  constructor(config: LumaToolsConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<LumaToolsConfig>) {
    this.config = { ...this.config, ...config };
  }

  // File Operations
  async createFile(path: string, content: string = ''): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer.fs.mkdir(dirPath, { recursive: true });
          this.config.onTerminalWrite(`\x1b[90m📁 Ensured directory exists: ${dirPath}\x1b[0m\n`);
        } catch (dirError) {
          // Directory might already exist, continue
          this.config.onTerminalWrite(`\x1b[90m📁 Directory check for: ${dirPath}\x1b[0m\n`);
        }
      }

      // Write to WebContainer
      await this.config.webContainer.fs.writeFile(path, content);
      
      // Update local file tree
      const updatedFiles = this.addFileToTree(this.config.files, path, content);
      this.config.onFilesUpdate(updatedFiles);
      
      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Created file: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `File created successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to create file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async readFile(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        // Try to read from local files first
        const file = this.findFileInTree(this.config.files, path);
        if (file && file.content !== undefined) {
          return {
            success: true,
            message: `File read successfully: ${path}`,
            data: { path, content: file.content, size: file.content.length }
          };
        }
        return { success: false, message: 'WebContainer not available and file not found locally', error: 'NO_CONTAINER' };
      }

      const content = await this.config.webContainer.fs.readFile(path, 'utf-8');
      
      this.config.onTerminalWrite(`\x1b[32m✅ Read file: ${path} (${content.length} bytes)\x1b[0m\n`);
      
      return {
        success: true,
        message: `File read successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to read file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async updateFile(path: string, content: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer.fs.mkdir(dirPath, { recursive: true });
          this.config.onTerminalWrite(`\x1b[90m📁 Ensured directory exists: ${dirPath}\x1b[0m\n`);
        } catch (dirError) {
          // Directory might already exist, continue
          this.config.onTerminalWrite(`\x1b[90m📁 Directory check for: ${dirPath}\x1b[0m\n`);
        }
      }

      // Write to WebContainer
      await this.config.webContainer.fs.writeFile(path, content);
      
      // Update local file tree
      const updatedFiles = this.updateFileInTree(this.config.files, path, content);
      this.config.onFilesUpdate(updatedFiles);
      
      // Update editor if this file is currently selected
      this.config.onFileSelect(path, content);
      
      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Updated file: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `File updated successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to update file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async editFileSection(path: string, oldText: string, newText: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // First read the current file content
      const currentContent = await this.config.webContainer.fs.readFile(path, 'utf-8');
      
      // Check if the old text exists in the file
      if (!currentContent.includes(oldText)) {
        const errorMsg = `Text not found in file ${path}. The old_text parameter must match exactly.`;
        this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
        this.config.onTerminalWrite(`\x1b[90m💡 Looking for: "${oldText.substring(0, 100)}..."\x1b[0m\n`);
        return { success: false, message: errorMsg, error: 'TEXT_NOT_FOUND' };
      }

      // Replace the text
      const newContent = currentContent.replace(oldText, newText);
      
      // Ensure parent directory exists
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await this.config.webContainer.fs.mkdir(dirPath, { recursive: true });
        } catch (dirError) {
          // Directory might already exist, continue
        }
      }

      // Write to WebContainer
      await this.config.webContainer.fs.writeFile(path, newContent);
      
      // Update local file tree
      const updatedFiles = this.updateFileInTree(this.config.files, path, newContent);
      this.config.onFilesUpdate(updatedFiles);
      
      // Update editor if this file is currently selected
      this.config.onFileSelect(path, newContent);
      
      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Section edited in file: ${path}\x1b[0m\n`);
      this.config.onTerminalWrite(`\x1b[90m🔄 Replaced ${oldText.length} chars with ${newText.length} chars\x1b[0m\n`);
      
      return {
        success: true,
        message: `File section updated successfully: ${path}`,
        data: { path, oldText, newText, newContent, size: newContent.length }
      };
    } catch (error) {
      const errorMsg = `Failed to edit file section ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async deleteFile(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      // Delete from WebContainer
      await this.config.webContainer.fs.rm(path, { force: true });
      
      // Update local file tree
      const updatedFiles = this.removeFileFromTree(this.config.files, path);
      this.config.onFilesUpdate(updatedFiles);
      
      this.config.onTerminalWrite(`\x1b[32m✅ Deleted file: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `File deleted successfully: ${path}`
      };
    } catch (error) {
      const errorMsg = `Failed to delete file ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async createDirectory(path: string): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      await this.config.webContainer.fs.mkdir(path, { recursive: true });
      
      // Update local file tree
      const updatedFiles = this.addDirectoryToTree(this.config.files, path);
      this.config.onFilesUpdate(updatedFiles);
      
      // Refresh file tree from WebContainer to ensure sync
      if (this.config.onRefreshFileTree) {
        setTimeout(() => this.config.onRefreshFileTree!(), 100);
      }
      
      this.config.onTerminalWrite(`\x1b[32m✅ Created directory: ${path}\x1b[0m\n`);
      
      return {
        success: true,
        message: `Directory created successfully: ${path}`
      };
    } catch (error) {
      const errorMsg = `Failed to create directory ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async listDirectory(path: string = '.'): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        // Return local file tree
        const dir = path === '.' ? this.config.files : this.findDirectoryInTree(this.config.files, path);
        if (!dir) {
          return { success: false, message: `Directory not found: ${path}`, error: 'DIR_NOT_FOUND' };
        }
        
        const items = Array.isArray(dir) ? dir : (dir.children || []);
        return {
          success: true,
          message: `Directory listing for ${path}`,
          data: {
            path,
            items: items.map(item => ({
              name: item.name,
              type: item.type,
              path: item.path,
              size: item.content?.length || 0
            }))
          }
        };
      }

      const entries = await this.config.webContainer.fs.readdir(path, { withFileTypes: true });
      const items = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path === '.' ? entry.name : `${path}/${entry.name}`
      }));

      this.config.onTerminalWrite(`\x1b[32m✅ Listed directory: ${path} (${items.length} items)\x1b[0m\n`);

      return {
        success: true,
        message: `Directory listing for ${path}`,
        data: { path, items }
      };
    } catch (error) {
      const errorMsg = `Failed to list directory ${path}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // Container Operations
  async runCommand(command: string, args: string[] = []): Promise<ToolResult> {
    try {
      if (!this.config.webContainer) {
        return { success: false, message: 'WebContainer not available', error: 'NO_CONTAINER' };
      }

      this.config.onTerminalWrite(`\x1b[33m🔧 Running: ${command} ${args.join(' ')}\x1b[0m\n`);
      
      const process = await this.config.webContainer.spawn(command, args);
      
      // Stream output to terminal
      process.output.pipeTo(new WritableStream({
        write: (data) => {
          this.config.onTerminalWrite(data);
        }
      }));

      const exitCode = await process.exit;
      
      if (exitCode === 0) {
        this.config.onTerminalWrite(`\x1b[32m✅ Command completed successfully\x1b[0m\n`);
        return {
          success: true,
          message: `Command executed successfully: ${command} ${args.join(' ')}`,
          data: { command, args, exitCode }
        };
      } else {
        this.config.onTerminalWrite(`\x1b[31m❌ Command failed with exit code ${exitCode}\x1b[0m\n`);
        return {
          success: false,
          message: `Command failed: ${command} ${args.join(' ')}`,
          error: `Exit code: ${exitCode}`
        };
      }
    } catch (error) {
      const errorMsg = `Failed to run command ${command}: ${error}`;
      this.config.onTerminalWrite(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async installPackage(packageName: string, isDev: boolean = false): Promise<ToolResult> {
    const args = ['install', packageName];
    if (isDev) args.push('--save-dev');
    
    return this.runCommand('npm', args);
  }

  async uninstallPackage(packageName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['uninstall', packageName]);
  }

  async runScript(scriptName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['run', scriptName]);
  }

  // Utility Operations
  async getProjectInfo(): Promise<ToolResult> {
    try {
      const packageJsonResult = await this.readFile('package.json');
      if (!packageJsonResult.success) {
        return { success: false, message: 'Could not read package.json', error: packageJsonResult.error };
      }

      const packageJson = JSON.parse(packageJsonResult.data.content);
      
      return {
        success: true,
        message: 'Project information retrieved',
        data: {
          name: packageJson.name,
          version: packageJson.version,
          description: packageJson.description,
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {},
          scripts: packageJson.scripts || {},
          workingDirectory: this.config.workingDirectory
        }
      };
    } catch (error) {
      const errorMsg = `Failed to get project info: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async searchFiles(pattern: string): Promise<ToolResult> {
    try {
      const matches: Array<{ path: string; type: string; content?: string }> = [];
      
      const searchInTree = (nodes: FileNode[], currentPath: string = '') => {
        for (const node of nodes) {
          const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
          
          if (node.name.includes(pattern) || fullPath.includes(pattern)) {
            matches.push({
              path: fullPath,
              type: node.type,
              content: node.type === 'file' ? node.content : undefined
            });
          }
          
          if (node.children) {
            searchInTree(node.children, fullPath);
          }
        }
      };

      searchInTree(this.config.files);

      return {
        success: true,
        message: `Search completed for pattern: ${pattern}`,
        data: { pattern, matches, count: matches.length }
      };
    } catch (error) {
      const errorMsg = `Failed to search files: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getAllFiles(): Promise<ToolResult> {
    try {
      const allFiles: Array<{ path: string; type: string; size: number }> = [];
      
      const traverseTree = (nodes: FileNode[], currentPath: string = '') => {
        for (const node of nodes) {
          const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
          
          allFiles.push({
            path: fullPath,
            type: node.type,
            size: node.content?.length || 0
          });
          
          if (node.children) {
            traverseTree(node.children, fullPath);
          }
        }
      };

      traverseTree(this.config.files);

      this.config.onTerminalWrite(`\x1b[32m✅ Listed all files: ${allFiles.length} items\x1b[0m\n`);

      return {
        success: true,
        message: `Found ${allFiles.length} files and directories`,
        data: { files: allFiles, count: allFiles.length }
      };
    } catch (error) {
      const errorMsg = `Failed to get all files: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getFileStructure(): Promise<ToolResult> {
    try {
      const structure = this.config.files;

      return {
        success: true,
        message: 'Project structure retrieved',
        data: { structure, fileCount: this.config.files.length }
      };
    } catch (error) {
      const errorMsg = `Failed to get file structure: ${error}`;
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // File tree manipulation helpers
  private findFileInTree(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = this.findFileInTree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private findDirectoryInTree(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
      if (node.path === path && node.type === 'directory') return node;
      if (node.children) {
        const found = this.findDirectoryInTree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  private addFileToTree(nodes: FileNode[], path: string, content: string): FileNode[] {
    const pathParts = path.split('/');
    const fileName = pathParts.pop()!;
    const dirPath = pathParts.join('/');

    if (dirPath === '') {
      // Add to root
      return [...nodes.filter(n => n.name !== fileName), {
        name: fileName,
        type: 'file',
        path,
        content
      }];
    }

    // Add to subdirectory
    return nodes.map(node => {
      if (node.path === dirPath && node.type === 'directory') {
        return {
          ...node,
          children: [...(node.children || []).filter(n => n.name !== fileName), {
            name: fileName,
            type: 'file',
            path,
            content
          }]
        };
      }
      if (node.children) {
        return { ...node, children: this.addFileToTree(node.children, path, content) };
      }
      return node;
    });
  }

  private updateFileInTree(nodes: FileNode[], path: string, content: string): FileNode[] {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, content };
      }
      if (node.children) {
        return { ...node, children: this.updateFileInTree(node.children, path, content) };
      }
      return node;
    });
  }

  private removeFileFromTree(nodes: FileNode[], path: string): FileNode[] {
    return nodes.filter(node => {
      if (node.path === path) return false;
      if (node.children) {
        node.children = this.removeFileFromTree(node.children, path);
      }
      return true;
    });
  }

  private addDirectoryToTree(nodes: FileNode[], path: string): FileNode[] {
    const pathParts = path.split('/');
    const dirName = pathParts.pop()!;
    const parentPath = pathParts.join('/');

    if (parentPath === '') {
      // Add to root
      return [...nodes.filter(n => n.name !== dirName), {
        name: dirName,
        type: 'directory',
        path,
        children: []
      }];
    }

    // Add to subdirectory
    return nodes.map(node => {
      if (node.path === parentPath && node.type === 'directory') {
        return {
          ...node,
          children: [...(node.children || []).filter(n => n.name !== dirName), {
            name: dirName,
            type: 'directory',
            path,
            children: []
          }]
        };
      }
      if (node.children) {
        return { ...node, children: this.addDirectoryToTree(node.children, path) };
      }
      return node;
    });
  }
}

// Tool registry for easy access
export const createLumaTools = (config: LumaToolsConfig): Record<string, any> => {
  const tools = new LumaTools(config);

  return {
    // File operations
    create_file: (params: any) => tools.createFile(params.path, params.content || ''),
    read_file: (params: any) => tools.readFile(params.path),
    edit_file: (params: any) => tools.updateFile(params.path, params.content),
    edit_file_section: (params: any) => tools.editFileSection(params.path, params.old_text, params.new_text),
    update_file: (params: any) => tools.updateFile(params.path, params.content),
    delete_file: (params: any) => tools.deleteFile(params.path),
    
    // Directory operations
    create_directory: (params: any) => tools.createDirectory(params.path),
    list_directory: (params: any) => tools.listDirectory(params.path || '.'),
    list_files: (params: any) => tools.listDirectory(params.path || '.'), // Alias for list_directory
    
    // Container operations
    run_command: (params: any) => tools.runCommand(params.command, params.args || []),
    install_package: (params: any) => tools.installPackage(params.package, params.dev || false),
    uninstall_package: (params: any) => tools.uninstallPackage(params.package),
    run_script: (params: any) => tools.runScript(params.script),
    
    // Utility operations
    get_project_info: () => tools.getProjectInfo(),
    search_files: (params: any) => tools.searchFiles(params.pattern),
    get_all_files: () => tools.getAllFiles(),
    get_file_structure: () => tools.getFileStructure(),
    
    // Additional aliases for common AI expectations
    ls: (params: any) => tools.listDirectory(params?.path || '.'),
    cat: (params: any) => tools.readFile(params.path),
    mkdir: (params: any) => tools.createDirectory(params.path),
    touch: (params: any) => tools.createFile(params.path, ''),
    
    // Direct access to tools instance for config updates
    _tools: tools,
    _updateConfig: tools.updateConfig.bind(tools)
  };
}; 
