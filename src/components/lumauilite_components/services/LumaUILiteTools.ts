import { LiteProjectFile } from '../../LumaUILite';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface LumaUILiteToolsConfig {
  projectFiles: LiteProjectFile[];
  onUpdateFile: (fileId: string, content: string) => void;
  onCreateFile: (file: Omit<LiteProjectFile, 'id' | 'lastModified'>) => void;
  onDeleteFile: (fileId: string) => void;
  onFileSelect: (path: string, content: string) => void;
  onTerminalWrite?: (message: string) => void;
  projectName?: string;
}

export default class LumaUILiteTools {
  private config: LumaUILiteToolsConfig;

  constructor(config: LumaUILiteToolsConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<LumaUILiteToolsConfig>) {
    this.config = { ...this.config, ...config };
  }

  // Log to terminal if available
  private log(message: string) {
    if (this.config.onTerminalWrite) {
      this.config.onTerminalWrite(message);
    }
  }

  // File Operations
  async createFile(path: string, content: string = ''): Promise<ToolResult> {
    try {
      // Check if file already exists
      const existingFile = this.config.projectFiles.find(f => f.path === path);
      if (existingFile) {
        this.log(`\x1b[31m❌ File already exists: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File already exists: ${path}`,
          error: 'FILE_EXISTS'
        };
      }

      // Determine file properties
      const fileName = path.split('/').pop() || path;
      const extension = fileName.includes('.') ? fileName.split('.').pop() : undefined;
      const mimeType = this.getMimeType(extension);
      const isImage = this.isImageFile(extension);

      // Create new file
      const newFile: Omit<LiteProjectFile, 'id' | 'lastModified'> = {
        name: fileName,
        path,
        content,
        type: 'file',
        mimeType,
        size: content.length,
        isImage,
        extension
      };

      this.config.onCreateFile(newFile);

      // Auto-select the new file
      this.config.onFileSelect(path, content);

      this.log(`\x1b[32m✅ Created file: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `File created successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to create file ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async readFile(path: string): Promise<ToolResult> {
    try {
      const file = this.config.projectFiles.find(f => f.path === path && f.type === 'file');
      
      if (!file) {
        this.log(`\x1b[31m❌ File not found: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File not found: ${path}`,
          error: 'FILE_NOT_FOUND'
        };
      }

      if (file.content === undefined) {
        this.log(`\x1b[31m❌ File content not available: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File content not available: ${path}`,
          error: 'NO_CONTENT'
        };
      }

      this.log(`\x1b[32m✅ Read file: ${path} (${file.content.length} bytes)\x1b[0m\n`);

      return {
        success: true,
        message: `File read successfully: ${path}`,
        data: { path, content: file.content, size: file.content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to read file ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async updateFile(path: string, content: string): Promise<ToolResult> {
    try {
      const file = this.config.projectFiles.find(f => f.path === path && f.type === 'file');
      
      if (!file) {
        this.log(`\x1b[31m❌ File not found: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File not found: ${path}`,
          error: 'FILE_NOT_FOUND'
        };
      }

      // Update the file content
      this.config.onUpdateFile(file.id, content);

      // Auto-select the updated file
      this.config.onFileSelect(path, content);

      this.log(`\x1b[32m✅ Updated file: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `File updated successfully: ${path}`,
        data: { path, content, size: content.length }
      };
    } catch (error) {
      const errorMsg = `Failed to update file ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async editFile(path: string, content: string): Promise<ToolResult> {
    return this.updateFile(path, content);
  }

  async editFileSection(path: string, oldText: string, newText: string): Promise<ToolResult> {
    try {
      const file = this.config.projectFiles.find(f => f.path === path && f.type === 'file');
      
      if (!file || !file.content) {
        this.log(`\x1b[31m❌ File not found or has no content: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File not found or has no content: ${path}`,
          error: 'FILE_NOT_FOUND'
        };
      }

      // Check if the old text exists in the file
      if (!file.content.includes(oldText)) {
        const errorMsg = `Text not found in file ${path}. The old_text parameter must match exactly.`;
        this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
        this.log(`\x1b[90m💡 Looking for: "${oldText.substring(0, 100)}..."\x1b[0m\n`);
        return { success: false, message: errorMsg, error: 'TEXT_NOT_FOUND' };
      }

      // Replace the text
      const newContent = file.content.replace(oldText, newText);
      
      // Update the file content
      this.config.onUpdateFile(file.id, newContent);

      // Auto-select the updated file
      this.config.onFileSelect(path, newContent);

      this.log(`\x1b[32m✅ Section edited in file: ${path}\x1b[0m\n`);
      this.log(`\x1b[90m🔄 Replaced ${oldText.length} chars with ${newText.length} chars\x1b[0m\n`);

      return {
        success: true,
        message: `File section updated successfully: ${path}`,
        data: { path, oldText, newText, newContent, size: newContent.length }
      };
    } catch (error) {
      const errorMsg = `Failed to edit file section ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async deleteFile(path: string): Promise<ToolResult> {
    try {
      const file = this.config.projectFiles.find(f => f.path === path && f.type === 'file');
      
      if (!file) {
        this.log(`\x1b[31m❌ File not found: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `File not found: ${path}`,
          error: 'FILE_NOT_FOUND'
        };
      }

      this.config.onDeleteFile(file.id);

      this.log(`\x1b[32m✅ Deleted file: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `File deleted successfully: ${path}`,
        data: { path }
      };
    } catch (error) {
      const errorMsg = `Failed to delete file ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // Directory Operations (simulated for LumaUI-lite)
  async createDirectory(path: string): Promise<ToolResult> {
    try {
      // Check if directory already exists
      const existingDir = this.config.projectFiles.find(f => f.path === path && f.type === 'directory');
      if (existingDir) {
        this.log(`\x1b[31m❌ Directory already exists: ${path}\x1b[0m\n`);
        return {
          success: false,
          message: `Directory already exists: ${path}`,
          error: 'DIR_EXISTS'
        };
      }

      const dirName = path.split('/').pop() || path;

      // Create new directory
      const newDir: Omit<LiteProjectFile, 'id' | 'lastModified'> = {
        name: dirName,
        path,
        content: '',
        type: 'directory',
        mimeType: 'inode/directory',
        size: 0
      };

      this.config.onCreateFile(newDir);

      this.log(`\x1b[32m✅ Created directory: ${path}\x1b[0m\n`);

      return {
        success: true,
        message: `Directory created successfully: ${path}`,
        data: { path }
      };
    } catch (error) {
      const errorMsg = `Failed to create directory ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async listDirectory(path: string = '.'): Promise<ToolResult> {
    try {
      let items;
      
      if (path === '.') {
        // List root level items
        items = this.config.projectFiles.filter(f => !f.path.includes('/'));
      } else {
        // List items in specific directory
        items = this.config.projectFiles.filter(f => 
          f.path.startsWith(path + '/') && 
          f.path.split('/').length === path.split('/').length + 1
        );
      }

      const itemList = items.map(item => ({
        name: item.name,
        type: item.type,
        path: item.path,
        size: item.size || 0,
        lastModified: item.lastModified
      }));

      this.log(`\x1b[32m✅ Listed directory: ${path} (${itemList.length} items)\x1b[0m\n`);

      return {
        success: true,
        message: `Directory listing for ${path}`,
        data: { path, items: itemList }
      };
    } catch (error) {
      const errorMsg = `Failed to list directory ${path}: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // Utility Operations
  async listFiles(): Promise<ToolResult> {
    return this.listDirectory('.');
  }

  async getAllFiles(): Promise<ToolResult> {
    try {
      const allFiles = this.config.projectFiles.map(file => ({
        name: file.name,
        path: file.path,
        type: file.type,
        size: file.size || 0,
        extension: file.extension,
        lastModified: file.lastModified
      }));

      this.log(`\x1b[32m✅ Listed all files: ${allFiles.length} items\x1b[0m\n`);

      return {
        success: true,
        message: `Found ${allFiles.length} files and directories`,
        data: { files: allFiles, count: allFiles.length }
      };
    } catch (error) {
      const errorMsg = `Failed to get all files: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getProjectInfo(): Promise<ToolResult> {
    try {
      const packageFile = this.config.projectFiles.find(f => f.path === 'package.json');
      let packageJson: any = {};
      
      if (packageFile && packageFile.content) {
        try {
          packageJson = JSON.parse(packageFile.content);
        } catch (e) {
          // Invalid JSON, use default
        }
      }

      const projectInfo = {
        name: packageJson.name || this.config.projectName || 'LumaUI-lite Project',
        version: packageJson.version || '1.0.0',
        description: packageJson.description || 'A LumaUI-lite project',
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
        scripts: packageJson.scripts || {},
        totalFiles: this.config.projectFiles.filter(f => f.type === 'file').length,
        totalSize: this.config.projectFiles.reduce((sum, f) => sum + (f.size || 0), 0)
      };

      this.log(`\x1b[32m✅ Retrieved project info: ${projectInfo.name}\x1b[0m\n`);

      return {
        success: true,
        message: 'Project information retrieved',
        data: projectInfo
      };
    } catch (error) {
      const errorMsg = `Failed to get project info: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async searchFiles(pattern: string): Promise<ToolResult> {
    try {
      const matches: Array<{ path: string; type: string; content?: string; matchType: string }> = [];
      
      for (const file of this.config.projectFiles) {
        // Match by filename or path
        if (file.name.includes(pattern) || file.path.includes(pattern)) {
          matches.push({
            path: file.path,
            type: file.type,
            content: file.type === 'file' ? file.content : undefined,
            matchType: 'path'
          });
        }
        
        // Match by content (for non-image files)
        if (file.type === 'file' && file.content && !file.isImage && file.content.includes(pattern)) {
          const existingMatch = matches.find(m => m.path === file.path);
          if (!existingMatch) {
            matches.push({
              path: file.path,
              type: file.type,
              content: file.content,
              matchType: 'content'
            });
          } else {
            existingMatch.matchType = 'both';
          }
        }
      }

      this.log(`\x1b[32m✅ Search completed for pattern: ${pattern} (${matches.length} matches)\x1b[0m\n`);

      return {
        success: true,
        message: `Search completed for pattern: ${pattern}`,
        data: { pattern, matches, count: matches.length }
      };
    } catch (error) {
      const errorMsg = `Failed to search files: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  async getFileStructure(): Promise<ToolResult> {
    try {
      const structure = {
        totalFiles: this.config.projectFiles.filter(f => f.type === 'file').length,
        totalDirectories: this.config.projectFiles.filter(f => f.type === 'directory').length,
        totalSize: this.config.projectFiles.reduce((sum, f) => sum + (f.size || 0), 0),
        files: this.config.projectFiles.map(f => ({
          name: f.name,
          path: f.path,
          type: f.type,
          size: f.size || 0,
          extension: f.extension,
          isImage: f.isImage || false
        }))
      };

      this.log(`\x1b[32m✅ Retrieved file structure: ${structure.totalFiles} files, ${structure.totalDirectories} directories\x1b[0m\n`);

      return {
        success: true,
        message: 'File structure retrieved',
        data: structure
      };
    } catch (error) {
      const errorMsg = `Failed to get file structure: ${error}`;
      this.log(`\x1b[31m❌ ${errorMsg}\x1b[0m\n`);
      return { success: false, message: errorMsg, error: String(error) };
    }
  }

  // Simulated Development Operations (since no WebContainer)
  async runCommand(command: string, args: string[] = []): Promise<ToolResult> {
    this.log(`\x1b[33m🔧 Simulated command: ${command} ${args.join(' ')}\x1b[0m\n`);
    this.log(`\x1b[90m💡 Note: LumaUI-lite runs in browser environment without command execution\x1b[0m\n`);
    
    // Simulate some common commands
    if (command === 'npm' && args[0] === 'install') {
      this.log(`\x1b[32m✅ Simulated npm install completed\x1b[0m\n`);
      return {
        success: true,
        message: `Simulated command: ${command} ${args.join(' ')}`,
        data: { command, args, simulated: true }
      };
    }
    
    if (command === 'npm' && args[0] === 'run') {
      this.log(`\x1b[32m✅ Simulated npm script execution\x1b[0m\n`);
      return {
        success: true,
        message: `Simulated script: ${args[1] || 'unknown'}`,
        data: { command, args, simulated: true }
      };
    }

    return {
      success: false,
      message: `Command execution not supported in LumaUI-lite: ${command}`,
      error: 'NOT_SUPPORTED'
    };
  }

  async installPackage(packageName: string, isDev: boolean = false): Promise<ToolResult> {
    return this.runCommand('npm', ['install', packageName, ...(isDev ? ['--save-dev'] : [])]);
  }

  async uninstallPackage(packageName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['uninstall', packageName]);
  }

  async runScript(scriptName: string): Promise<ToolResult> {
    return this.runCommand('npm', ['run', scriptName]);
  }

  // Helper: Get MIME type based on file extension
  private getMimeType(extension?: string): string {
    if (!extension) return 'text/plain';
    
    const mimeTypes: Record<string, string> = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'jsx': 'application/javascript',
      'ts': 'application/typescript',
      'tsx': 'application/typescript',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'xml': 'application/xml',
      'svg': 'image/svg+xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'ico': 'image/x-icon',
      'vue': 'text/x-vue',
      'scss': 'text/x-scss',
      'sass': 'text/x-sass',
      'less': 'text/x-less',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'toml': 'text/x-toml'
    };

    return mimeTypes[extension.toLowerCase()] || 'text/plain';
  }

  // Helper: Check if file is an image
  private isImageFile(extension?: string): boolean {
    if (!extension) return false;
    
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif'];
    return imageExtensions.includes(extension.toLowerCase());
  }










}

// Essential tool registry for vanilla HTML/CSS/JS projects only
export const createLumaUILiteTools = (config: LumaUILiteToolsConfig): Record<string, any> => {
  const tools = new LumaUILiteTools(config);

  return {
    // Core file operations for HTML projects
    create_file: (params: any) => tools.createFile(params.path, params.content || ''),
    read_file: (params: any) => tools.readFile(params.path),
    edit_file: (params: any) => tools.updateFile(params.path, params.content),
    edit_file_section: (params: any) => tools.editFileSection(params.path, params.old_text, params.new_text),
    delete_file: (params: any) => tools.deleteFile(params.path),
    
    // Basic directory operations for organizing HTML projects
    create_directory: (params: any) => tools.createDirectory(params.path),
    list_files: (params: any) => tools.listDirectory(params.path || '.'),
    
    // Project information and search
    get_project_info: () => tools.getProjectInfo(),
    get_all_files: () => tools.getAllFiles(),
    search_files: (params: any) => tools.searchFiles(params.pattern),
    
    // Direct access to tools instance for config updates
    _tools: tools,
    _updateConfig: tools.updateConfig.bind(tools)
  };
}; 
