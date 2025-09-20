const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { app } = require('electron');
const os = require('os');

class MCPService {
  constructor() {
    this.servers = new Map();
    this.configPath = path.join(app.getPath('userData'), 'mcp_config.json');
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      } else {
        this.config = {
          mcpServers: {},
          lastRunningServers: [] // Track which servers were running when app was closed
        };
        this.saveConfig();
      }
      
      // Ensure lastRunningServers exists for backward compatibility
      if (!this.config.lastRunningServers) {
        this.config.lastRunningServers = [];
      }
      
      // Schedule Clara's MCP server check for next tick to avoid sync/async issues
      setImmediate(() => {
        this.ensureClaraMCPExists().catch(error => {
          log.error('Failed to ensure Clara MCP server exists during config load:', error);
        });
      });
    } catch (error) {
      log.error('Error loading MCP config:', error);
      this.config = {
        mcpServers: {},
        lastRunningServers: []
      };
      // Schedule Clara's MCP server check even after an error
      setImmediate(() => {
        this.ensureClaraMCPExists().catch(ensureError => {
          log.error('Failed to ensure Clara MCP server exists after config load error:', ensureError);
        });
      });
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('Error saving MCP config:', error);
    }
  }

  // Ensure Clara's Python MCP server always exists
  async ensureClaraMCPExists() {
    try {
      // Check if Clara's Python MCP server exists
      if (!this.config.mcpServers['python-mcp']) {
        log.info('Clara\'s Python MCP server missing, restoring it...');
        
        try {
          // Get the resolved executable path
          const executablePath = this.resolveBundledExecutablePath('python-mcp-server');
          
          this.config.mcpServers['python-mcp'] = {
            type: 'stdio',
            command: executablePath,
            args: [],
            env: {},
            description: 'Bundled Python MCP Server (Clara Native) - Always Available',
            enabled: true,
            createdAt: new Date().toISOString()
          };
          
          this.saveConfig();
          log.info('Clara\'s Python MCP server restored successfully');
        } catch (pathError) {
          log.warn('Failed to resolve bundled executable path, Clara MCP server may not work:', pathError);
          // Still create the entry so the system knows it should exist
          this.config.mcpServers['python-mcp'] = {
            type: 'stdio',
            command: 'python-mcp-server', // Fallback to the command name
            args: [],
            env: {},
            description: 'Bundled Python MCP Server (Clara Native) - Always Available (Path Unresolved)',
            enabled: false, // Disable since path couldn't be resolved
            createdAt: new Date().toISOString()
          };
          this.saveConfig();
          log.info('Clara\'s Python MCP server entry created but disabled due to path resolution failure');
        }
      }
    } catch (error) {
      log.error('Error ensuring Clara\'s MCP server exists:', error);
    }
  }

  async addServer(serverConfig) {
    const { name, type, command, args, env, description, url, headers } = serverConfig;
    
    if (this.config.mcpServers[name]) {
      throw new Error(`MCP server '${name}' already exists`);
    }

    const serverType = type || 'stdio';
    
    // Validate required fields based on server type
    if (serverType === 'remote') {
      if (!url) {
        throw new Error('URL is required for remote MCP servers');
      }
    } else if (serverType === 'stdio') {
      if (!command) {
        throw new Error('Command is required for stdio MCP servers');
      }
    }

    this.config.mcpServers[name] = {
      type: serverType,
      command,
      args: args || [],
      env: env || {},
      url,
      headers: headers || {},
      description: description || '',
      enabled: true,
      createdAt: new Date().toISOString()
    };

    this.saveConfig();
    log.info(`Added MCP server: ${name} (type: ${serverType})`);
    return true;
  }

  async removeServer(name) {
    if (!this.config.mcpServers[name]) {
      throw new Error(`MCP server '${name}' not found`);
    }

    // Prevent deletion of Clara's core MCP server (python-mcp)
    if (name === 'python-mcp') {
      log.warn(`Attempted to delete Clara's core MCP server (${name}) - operation blocked`);
      throw new Error("Clara's Python MCP server cannot be deleted as it is a system-required component.");
    }

    // Stop the server if it's running
    await this.stopServer(name);
    
    delete this.config.mcpServers[name];
    this.saveConfig();
    log.info(`Removed MCP server: ${name}`);
    return true;
  }

  async updateServer(name, updates) {
    if (!this.config.mcpServers[name]) {
      throw new Error(`MCP server '${name}' not found`);
    }

    // Stop the server if it's running
    const wasRunning = this.servers.has(name);
    if (wasRunning) {
      await this.stopServer(name);
    }

    this.config.mcpServers[name] = {
      ...this.config.mcpServers[name],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveConfig();

    // Restart if it was running
    if (wasRunning && this.config.mcpServers[name].enabled) {
      await this.startServer(name);
    }

    log.info(`Updated MCP server: ${name}`);
    return true;
  }

  // Helper method to resolve bundled executable paths
  resolveBundledExecutablePath(command) {
    // Check if this is a bundled Python MCP server request
    if (command === 'python-mcp-server') {
      let executableName;
      switch (os.platform()) {
        case 'win32':
          executableName = 'python-mcp-server-windows.exe';
          break;
        case 'darwin':
          // For macOS, choose based on architecture
          if (os.arch() === 'arm64') {
            executableName = 'python-mcp-server-mac-arm64';
          } else if (os.arch() === 'x64') {
            executableName = 'python-mcp-server-mac-intel';
          } else {
            // Fallback to universal binary
            executableName = 'python-mcp-server-mac-universal';
          }
          break;
        case 'linux':
          executableName = 'python-mcp-server-linux';
          break;
        default:
          throw new Error(`Unsupported platform: ${os.platform()}`);
      }
      
      // Multiple paths to try (in order of preference)
      const pathsToTry = [];
      
      // 1. Production: electron app resources
      if (process.resourcesPath) {
        pathsToTry.push(path.join(process.resourcesPath, 'electron', 'services', executableName));
        pathsToTry.push(path.join(process.resourcesPath, 'clara-mcp', executableName));
      }
      
      // 2. Development: relative to electron directory
      pathsToTry.push(path.join(__dirname, 'services', executableName));
      pathsToTry.push(path.join(__dirname, '..', 'clara-mcp', executableName));
      
      // 3. Development: relative to project root
      const projectRoot = path.resolve(__dirname, '..');
      pathsToTry.push(path.join(projectRoot, 'clara-mcp', executableName));
      pathsToTry.push(path.join(projectRoot, 'electron', 'services', executableName));
      
      // Check which path exists
      for (const tryPath of pathsToTry) {
        if (fs.existsSync(tryPath)) {
          log.info(`Resolved bundled executable path: ${command} -> ${tryPath}`);
          return tryPath;
        }
      }
      
      // If none found, log all tried paths for debugging
      log.error(`MCP server binary not found. Tried paths: ${pathsToTry.join(', ')}`);
      throw new Error(`MCP server binary not found. Tried ${pathsToTry.length} paths.`);
    }
    
    // Return original command for non-bundled executables
    return command;
  }

  // Helper method to get enhanced PATH with common Node.js installation locations
  getEnhancedPath() {
    const currentPath = process.env.PATH || '';
    const homedir = os.homedir();

    // check for nvm versions
    let nvmNodePath = null;
    try {
      const versionsDir = path.join(homedir, '.nvm/versions/node');
      const versions = fs.readdirSync(versionsDir);
      if (versions.length > 0) {
        // Assuming the user is using the first installed version
        nvmNodePath = path.join(versionsDir, versions[0], 'bin');
      }
    } catch (err) {
      // ignore if not found
    }

    // Common Node.js installation paths
    
    const commonNodePaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
      nvmNodePath,
      path.join(homedir, '.volta/bin'),
      path.join(homedir, '.fnm/current/bin'),
      path.join(homedir, 'n/bin'),
      '/usr/local/node/bin',
      '/opt/node/bin'
    ];

    // Filter existing paths and add them to PATH
    const existingPaths = commonNodePaths.filter(nodePath => {
      try {
        return fs.existsSync(nodePath);
      } catch (error) {
        return false;
      }
    });

    // Combine current PATH with existing Node.js paths
    const allPaths = [currentPath, ...existingPaths].filter(Boolean);
    return allPaths.join(path.delimiter);
  }

  // Helper method to check if a command exists
  async commandExists(command) {
    return new Promise((resolve) => {
      const testProcess = spawn(command, ['--version'], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          PATH: this.getEnhancedPath()
        }
      });
      
      testProcess.on('error', () => resolve(false));
      testProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  // Diagnose Node.js installation
  async diagnoseNodeInstallation() {
    const enhancedPath = this.getEnhancedPath();
    const pathDirs = enhancedPath.split(path.delimiter);
    
    const diagnosis = {
      nodeAvailable: false,
      npmAvailable: false,
      npxAvailable: false,
      nodePath: null,
      npmPath: null,
      npxPath: null,
      pathDirs: pathDirs,
      suggestions: []
    };

    // Check for node, npm, and npx
    for (const dir of pathDirs) {
      if (!diagnosis.nodeAvailable) {
        const nodePath = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node');
        if (fs.existsSync(nodePath)) {
          diagnosis.nodeAvailable = true;
          diagnosis.nodePath = nodePath;
        }
      }
      
      if (!diagnosis.npmAvailable) {
        const npmPath = path.join(dir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
        if (fs.existsSync(npmPath)) {
          diagnosis.npmAvailable = true;
          diagnosis.npmPath = npmPath;
        }
      }
      
      if (!diagnosis.npxAvailable) {
        const npxPath = path.join(dir, process.platform === 'win32' ? 'npx.cmd' : 'npx');
        if (fs.existsSync(npxPath)) {
          diagnosis.npxAvailable = true;
          diagnosis.npxPath = npxPath;
        }
      }
    }

    // Generate suggestions
    if (!diagnosis.nodeAvailable) {
      diagnosis.suggestions.push('Node.js is not installed or not found in PATH. Please install Node.js from https://nodejs.org/');
    }
    
    if (!diagnosis.npmAvailable) {
      diagnosis.suggestions.push('npm is not available. It should come with Node.js installation.');
    }
    
    if (!diagnosis.npxAvailable) {
      diagnosis.suggestions.push('npx is not available. It should come with npm 5.2.0 or later.');
    }

    if (diagnosis.nodeAvailable && diagnosis.npmAvailable && diagnosis.npxAvailable) {
      diagnosis.suggestions.push('Node.js, npm, and npx are all available and should work correctly.');
    }

    return diagnosis;
  }

  async startServer(name) {
    const serverConfig = this.config.mcpServers[name];
    if (!serverConfig) {
      throw new Error(`MCP server '${name}' not found`);
    }

    if (this.servers.has(name)) {
      throw new Error(`MCP server '${name}' is already running`);
    }

    try {
      // Handle remote servers differently
      if (serverConfig.type === 'remote') {
        log.info(`Connecting to remote MCP server: ${name} at ${serverConfig.url}`);
        
        // Test the connection to the remote server
        const response = await fetch(serverConfig.url, {
          method: 'GET',
          headers: serverConfig.headers || {}
        });
        
        if (!response.ok) {
          throw new Error(`Remote server not accessible: HTTP ${response.status}: ${response.statusText}`);
        }
        
        const serverInfo = {
          name,
          config: serverConfig,
          startedAt: new Date(),
          status: 'running',
          type: 'remote'
        };
        
        this.servers.set(name, serverInfo);
        log.info(`Connected to remote MCP server: ${name}`);
        return serverInfo;
      }
      
      // Handle stdio servers (existing logic)
      const { command, args = [], env = {} } = serverConfig;
      
      // Resolve bundled executable paths
      const resolvedCommand = this.resolveBundledExecutablePath(command);
      
      // Check if command exists before trying to start (skip for bundled executables)
      if ((command === 'npx' || command === 'npm' || command === 'node') && command === resolvedCommand) {
        const commandAvailable = await this.commandExists(command);
        if (!commandAvailable) {
          throw new Error(`Command '${command}' not found. Please ensure Node.js and npm are properly installed and available in your PATH.`);
        }
      }
      
      // Merge environment variables with enhanced PATH
      const processEnv = {
        ...process.env,
        PATH: this.getEnhancedPath(),
        ...env
      };

      log.info(`Starting MCP server: ${name} with command: ${resolvedCommand} ${args.join(' ')}`);
      log.info(`Using PATH: ${processEnv.PATH}`);

      const serverProcess = spawn(resolvedCommand, args, {
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });

      const serverInfo = {
        process: serverProcess,
        name,
        config: serverConfig,
        startedAt: new Date(),
        status: 'starting',
        type: 'stdio'
      };

      this.servers.set(name, serverInfo);

      // Handle process events
      serverProcess.on('spawn', () => {
        log.info(`MCP server '${name}' spawned successfully`);
        serverInfo.status = 'running';
        serverInfo.initialized = false; // Reset initialization status for new process
      });

      serverProcess.on('error', (error) => {
        log.error(`MCP server '${name}' error:`, error);
        serverInfo.status = 'error';
        
        // Provide more helpful error messages
        if (error.code === 'ENOENT') {
          serverInfo.error = `Command '${command}' not found. Please ensure Node.js and npm are properly installed.`;
        } else {
          serverInfo.error = error.message;
        }
      });

      serverProcess.on('exit', (code, signal) => {
        log.info(`MCP server '${name}' exited with code ${code}, signal ${signal}`);
        this.servers.delete(name);
      });

      // Handle stdout/stderr
      serverProcess.stdout.on('data', (data) => {
        log.debug(`MCP server '${name}' stdout:`, data.toString());
      });

      serverProcess.stderr.on('data', (data) => {
        log.debug(`MCP server '${name}' stderr:`, data.toString());
      });

      return serverInfo;
    } catch (error) {
      log.error(`Error starting MCP server '${name}':`, error);
      throw error;
    }
  }

  async stopServer(name) {
    const serverInfo = this.servers.get(name);
    if (!serverInfo) {
      return false;
    }

    try {
      log.info(`Stopping MCP server: ${name}`);
      
      // Handle remote servers differently
      if (serverInfo.type === 'remote') {
        this.servers.delete(name);
        log.info(`Disconnected from remote MCP server: ${name}`);
        return true;
      }
      
      // Handle stdio servers (existing logic)
      // Send SIGTERM first
      serverInfo.process.kill('SIGTERM');
      
      // Wait a bit, then force kill if needed
      setTimeout(() => {
        if (this.servers.has(name)) {
          log.warn(`Force killing MCP server: ${name}`);
          serverInfo.process.kill('SIGKILL');
        }
      }, 5000);

      this.servers.delete(name);
      return true;
    } catch (error) {
      log.error(`Error stopping MCP server '${name}':`, error);
      throw error;
    }
  }

  async restartServer(name) {
    await this.stopServer(name);
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startServer(name);
  }

  getServerStatus(name) {
    const serverInfo = this.servers.get(name);
    const config = this.config.mcpServers[name];
    
    if (!config) {
      return null;
    }

    return {
      name,
      config,
      isRunning: !!serverInfo,
      status: serverInfo?.status || 'stopped',
      startedAt: serverInfo?.startedAt,
      error: serverInfo?.error,
      pid: serverInfo?.process?.pid
    };
  }

  getAllServers() {
    // Ensure Clara's MCP server exists before returning server list (async, non-blocking)
    this.ensureClaraMCPExists().catch(error => {
      log.error('Failed to ensure Clara MCP server exists in getAllServers:', error);
    });
    
    const servers = [];
    
    for (const [name, config] of Object.entries(this.config.mcpServers)) {
      const serverInfo = this.servers.get(name);
      servers.push({
        name,
        config,
        isRunning: !!serverInfo,
        status: serverInfo?.status || 'stopped',
        startedAt: serverInfo?.startedAt,
        error: serverInfo?.error,
        pid: serverInfo?.process?.pid
      });
    }
    
    return servers;
  }

  async startAllEnabledServers() {
    const results = [];
    
    for (const [name, config] of Object.entries(this.config.mcpServers)) {
      if (config.enabled) {
        try {
          await this.startServer(name);
          results.push({ name, success: true });
        } catch (error) {
          log.error(`Failed to start MCP server '${name}':`, error);
          results.push({ name, success: false, error: error.message });
        }
      }
    }
    
    return results;
  }

  async stopAllServers() {
    const results = [];
    
    for (const name of this.servers.keys()) {
      try {
        await this.stopServer(name);
        results.push({ name, success: true });
      } catch (error) {
        log.error(`Failed to stop MCP server '${name}':`, error);
        results.push({ name, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Test server connection
  async testServer(name) {
    try {
      const serverConfig = this.config.mcpServers[name];
      if (!serverConfig) {
        throw new Error(`MCP server '${name}' not found`);
      }

      // For remote servers, try to connect
      if (serverConfig.type === 'remote') {
        const response = await fetch(serverConfig.url, {
          method: 'GET',
          headers: serverConfig.headers || {}
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return { success: true, message: 'Remote server is accessible' };
      }
      
      // For stdio servers, check if command exists
      const { command } = serverConfig;
      const resolvedCommand = this.resolveBundledExecutablePath(command);
      
      // For bundled executables, check file existence instead of version command
      if (command !== resolvedCommand) {
        // This is a bundled executable, check if file exists
        if (fs.existsSync(resolvedCommand)) {
          return { success: true, message: 'Bundled executable is available' };
        } else {
          return { success: false, error: `Bundled executable not found at: ${resolvedCommand}` };
        }
      }
      
      return new Promise((resolve) => {
        const testProcess = spawn(resolvedCommand, ['--version'], {
          stdio: 'ignore',
          shell: process.platform === 'win32',
          env: {
            ...process.env,
            PATH: this.getEnhancedPath()
          }
        });
        
        testProcess.on('error', (error) => {
          if (error.code === 'ENOENT') {
            resolve({ success: false, error: `Command '${resolvedCommand}' not found. Please ensure Node.js and npm are properly installed.` });
          } else {
            resolve({ success: false, error: error.message });
          }
        });
        
        testProcess.on('exit', (code) => {
          if (code === 0) {
            resolve({ success: true, message: 'Command is available' });
          } else {
            resolve({ success: false, error: `Command exited with code ${code}` });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get available MCP server templates
  getServerTemplates() {
    return [
      // System & File Management
      {
        name: 'filesystem',
        displayName: 'File System',
        description: 'Access and manipulate files and directories',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/path/to/directory'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-folder',
        popularity: 'high'
      },
      {
        name: 'hyper-shell',
        displayName: 'Shell Access',
        description: 'Secure shell and OS-level command execution',
        command: 'npx',
        args: ['hyper-mcp-shell'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-terminal',
        popularity: 'medium'
      },

      // Development & Git
      {
        name: 'git',
        displayName: 'Git Repository',
        description: 'Git repository operations and history',
        command: 'npx',
        args: ['@modelcontextprotocol/server-git', '/path/to/repo'],
        type: 'stdio',
        category: 'Development',
        icon: 'fab fa-git-alt',
        popularity: 'high'
      },
      {
        name: 'github',
        displayName: 'GitHub',
        description: 'GitHub repository and issue management',
        command: 'npx',
        args: ['@modelcontextprotocol/server-github'],
        type: 'stdio',
        category: 'Development',
        icon: 'fab fa-github',
        popularity: 'high',
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: 'your-github-token'
        }
      },
      {
        name: 'gitlab',
        displayName: 'GitLab',
        description: 'GitLab project and pipeline management',
        command: 'npx',
        args: ['@modelcontextprotocol/server-gitlab'],
        type: 'stdio',
        category: 'Development',
        icon: 'fab fa-gitlab',
        popularity: 'medium',
        env: {
          GITLAB_PERSONAL_ACCESS_TOKEN: 'your-gitlab-token',
          GITLAB_URL: 'https://gitlab.com'
        }
      },

      // Databases
      {
        name: 'sqlite',
        displayName: 'SQLite Database',
        description: 'Query and manipulate SQLite databases',
        command: 'npx',
        args: ['@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
        type: 'stdio',
        category: 'Database',
        icon: 'fas fa-database',
        popularity: 'high'
      },
      {
        name: 'postgres',
        displayName: 'PostgreSQL Database',
        description: 'Connect to PostgreSQL databases',
        command: 'npx',
        args: ['@modelcontextprotocol/server-postgres'],
        type: 'stdio',
        category: 'Database',
        icon: 'fas fa-server',
        popularity: 'high',
        env: {
          POSTGRES_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/dbname'
        }
      },
      {
        name: 'mysql',
        displayName: 'MySQL Database',
        description: 'Connect to MySQL/MariaDB databases',
        command: 'npx',
        args: ['@modelcontextprotocol/server-mysql'],
        type: 'stdio',
        category: 'Database',
        icon: 'fas fa-hdd',
        popularity: 'medium',
        env: {
          MYSQL_CONNECTION_STRING: 'mysql://user:password@localhost:3306/dbname'
        }
      },

      // Web & APIs
      {
        name: 'puppeteer',
        displayName: 'Web Scraping',
        description: 'Web scraping and browser automation',
        command: 'npx',
        args: ['@modelcontextprotocol/server-puppeteer'],
        type: 'stdio',
        category: 'Web',
        icon: 'fas fa-spider',
        popularity: 'high'
      },
      {
        name: 'playwright',
        displayName: 'Playwright Automation',
        description: 'Cross-browser automation and testing',
        command: 'npx',
        args: ['playwright-mcp-server'],
        type: 'stdio',
        category: 'Web',
        icon: 'fas fa-theater-masks',
        popularity: 'medium'
      },
      {
        name: 'fetch',
        displayName: 'HTTP Requests',
        description: 'Make HTTP requests and API calls',
        command: 'npx',
        args: ['@modelcontextprotocol/server-fetch'],
        type: 'stdio',
        category: 'Web',
        icon: 'fas fa-globe',
        popularity: 'high'
      },

      // Search Engines
      {
        name: 'brave-search',
        displayName: 'Brave Search',
        description: 'Search the web using Brave Search API',
        command: 'npx',
        args: ['@modelcontextprotocol/server-brave-search'],
        type: 'stdio',
        category: 'Search',
        icon: 'fas fa-shield-alt',
        popularity: 'high',
        env: {
          BRAVE_API_KEY: 'your-brave-api-key'
        }
      },
      {
        name: 'searxng',
        displayName: 'SearxNG Search',
        description: 'Privacy-focused meta-search through SearxNG',
        command: 'npx',
        args: ['mcp-searxng'],
        type: 'stdio',
        category: 'Search',
        icon: 'fas fa-search',
        popularity: 'medium',
        env: {
          SEARXNG_URL: 'http://localhost:8080'
        }
      },
      {
        name: 'google-search',
        displayName: 'Google Search',
        description: 'Search Google with custom search engine',
        command: 'npx',
        args: ['@modelcontextprotocol/server-google-search'],
        type: 'stdio',
        category: 'Search',
        icon: 'fab fa-google',
        popularity: 'high',
        env: {
          GOOGLE_API_KEY: 'your-google-api-key',
          GOOGLE_SEARCH_ENGINE_ID: 'your-search-engine-id'
        }
      },

      // AI & Reasoning
      {
        name: 'memory',
        displayName: 'Persistent Memory',
        description: 'Knowledge-graph based long-term memory store',
        command: 'npx',
        args: ['@modelcontextprotocol/server-memory'],
        type: 'stdio',
        category: 'AI',
        icon: 'fas fa-brain',
        popularity: 'high'
      },
      {
        name: 'sequential-thinking',
        displayName: 'Sequential Thinking',
        description: 'Structured multi-step reasoning tools',
        command: 'npx',
        args: ['@modelcontextprotocol/server-sequential-thinking'],
        type: 'stdio',
        category: 'AI',
        icon: 'fas fa-sitemap',
        popularity: 'medium'
      },

      // Communication & Collaboration
      {
        name: 'slack',
        displayName: 'Slack',
        description: 'Slack workspace integration',
        command: 'npx',
        args: ['@modelcontextprotocol/server-slack'],
        type: 'stdio',
        category: 'Communication',
        icon: 'fab fa-slack',
        popularity: 'high',
        env: {
          SLACK_BOT_TOKEN: 'your-slack-bot-token'
        }
      },
      {
        name: 'discord',
        displayName: 'Discord',
        description: 'Discord server and message management',
        command: 'npx',
        args: ['discord-mcp-server'],
        type: 'stdio',
        category: 'Communication',
        icon: 'fab fa-discord',
        popularity: 'medium',
        env: {
          DISCORD_BOT_TOKEN: 'your-discord-bot-token'
        }
      },
      {
        name: 'notion',
        displayName: 'Notion',
        description: 'Notion workspace and page management',
        command: 'npx',
        args: ['@modelcontextprotocol/server-notion'],
        type: 'stdio',
        category: 'Communication',
        icon: 'fas fa-sticky-note',
        popularity: 'high',
        env: {
          NOTION_API_KEY: 'your-notion-api-key'
        }
      },
    
      // Remote & Custom
      {
        name: 'remote-server',
        displayName: 'Remote MCP Server',
        description: 'Connect to a remote MCP server via HTTP',
        type: 'remote',
        url: 'http://localhost:3000/mcp',
        headers: {},
        category: 'Remote',
        icon: 'fas fa-network-wired',
        popularity: 'low'
      },

      // Additional Popular Servers (No API Keys Required)
      {
        name: 'calculator',
        displayName: 'Calculator',
        description: 'Precise numerical calculations and math operations',
        command: 'npx',
        args: ['mcp-server-calculator'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-calculator',
        popularity: 'high'
      },
      {
        name: 'redis',
        displayName: 'Redis Cache',
        description: 'In-memory caching and key-value operations',
        command: 'npx',
        args: ['mcp-server-redis'],
        type: 'stdio',
        category: 'Database',
        icon: 'fas fa-memory',
        popularity: 'high',
        env: {
          REDIS_URL: 'redis://localhost:6379'
        }
      },
      {
        name: 'docker',
        displayName: 'Docker Manager',
        description: 'Manage containers, images, volumes, and networks',
        command: 'npx',
        args: ['mcp-server-docker'],
        type: 'stdio',
        category: 'Development',
        icon: 'fab fa-docker',
        popularity: 'high'
      },
      {
        name: 'kubernetes',
        displayName: 'Kubernetes',
        description: 'Connect to Kubernetes cluster and manage resources',
        command: 'npx',
        args: ['mcp-server-kubernetes'],
        type: 'stdio',
        category: 'Development',
        icon: 'fas fa-dharmachakra',
        popularity: 'high',
        env: {
          KUBECONFIG: '~/.kube/config'
        }
      },
      {
        name: 'pandoc',
        displayName: 'Document Converter',
        description: 'Convert between various document formats using Pandoc',
        command: 'npx',
        args: ['mcp-pandoc'],
        type: 'stdio',
        category: 'Productivity',
        icon: 'fas fa-file-export',
        popularity: 'high'
      },
      {
        name: 'everything-search',
        displayName: 'Everything Search',
        description: 'Fast file searching capabilities across Windows/macOS/Linux',
        command: 'npx',
        args: ['mcp-everything-search'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-search-plus',
        popularity: 'high'
      },
      {
        name: 'obsidian',
        displayName: 'Obsidian Notes',
        description: 'Read and search through your Obsidian vault notes',
        command: 'npx',
        args: ['mcp-obsidian'],
        type: 'stdio',
        category: 'Productivity',
        icon: 'fas fa-sticky-note',
        popularity: 'high',
        env: {
          OBSIDIAN_VAULT_PATH: '/path/to/obsidian/vault'
        }
      },
      {
        name: 'open-meteo',
        displayName: 'Weather Data',
        description: 'Weather forecasts and climate data (free API)',
        command: 'npx',
        args: ['mcp-weather'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-cloud-sun',
        popularity: 'high'
      },
      {
        name: 'wikipedia',
        displayName: 'Wikipedia',
        description: 'Access and search Wikipedia articles',
        command: 'npx',
        args: ['wikipedia-mcp'],
        type: 'stdio',
        category: 'Knowledge',
        icon: 'fab fa-wikipedia-w',
        popularity: 'high'
      },
      {
        name: 'shell-commands',
        displayName: 'Shell Commands',
        description: 'Run shell commands and scripts securely',
        command: 'npx',
        args: ['mcp-server-commands'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-terminal',
        popularity: 'high'
      },
      {
        name: 'ssh',
        displayName: 'SSH Remote Access',
        description: 'Execute SSH commands remotely and transfer files',
        command: 'npx',
        args: ['ssh-mcp-server'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-server',
        popularity: 'medium',
        env: {
          SSH_HOST: 'hostname',
          SSH_USER: 'username',
          SSH_PRIVATE_KEY_PATH: '/path/to/private/key'
        }
      },
      {
        name: 'json-tools',
        displayName: 'JSON Tools',
        description: 'JSON handling and processing with JSONPath queries',
        command: 'npx',
        args: ['json-mcp-server'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-code',
        popularity: 'medium'
      },
      {
        name: 'pdf-tools',
        displayName: 'PDF Tools',
        description: 'Read, search, and manipulate PDF files',
        command: 'npx',
        args: ['mcp-pdf-reader'],
        type: 'stdio',
        category: 'Productivity',
        icon: 'fas fa-file-pdf',
        popularity: 'medium'
      },
      {
        name: 'csv-editor',
        displayName: 'CSV Editor',
        description: 'Comprehensive CSV processing and data manipulation',
        command: 'npx',
        args: ['csv-editor'],
        type: 'stdio',
        category: 'Productivity',
        icon: 'fas fa-table',
        popularity: 'medium'
      },
      {
        name: 'time-utils',
        displayName: 'Date/Time Utils',
        description: 'Date and time operations and calculations',
        command: 'npx',
        args: ['mcp-datetime'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-clock',
        popularity: 'medium'
      },
      {
        name: 'markdown-docs',
        displayName: 'Markdown Docs',
        description: 'Access and manage local documentation files',
        command: 'npx',
        args: ['docs-mcp'],
        type: 'stdio',
        category: 'Productivity',
        icon: 'fab fa-markdown',
        popularity: 'medium',
        env: {
          DOCS_PATH: '/path/to/docs'
        }
      },
      {
        name: 'code-analysis',
        displayName: 'Code Analysis',
        description: 'Code context provider and analysis tools',
        command: 'npx',
        args: ['code-context-provider-mcp'],
        type: 'stdio',
        category: 'Development',
        icon: 'fas fa-code-branch',
        popularity: 'medium'
      },
      {
        name: 'fast-filesystem',
        displayName: 'Fast Filesystem',
        description: 'Advanced filesystem operations with large file handling',
        command: 'npx',
        args: ['fast-filesystem-mcp'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-folder-open',
        popularity: 'medium'
      },
      {
        name: 'basic-memory',
        displayName: 'Basic Memory',
        description: 'Local-first knowledge management with semantic search',
        command: 'npx',
        args: ['basic-memory'],
        type: 'stdio',
        category: 'AI',
        icon: 'fas fa-brain',
        popularity: 'medium'
      },
      {
        name: 'random-number',
        displayName: 'Random Generator',
        description: 'Random number and data generation utilities',
        command: 'npx',
        args: ['random-number-mcp'],
        type: 'stdio',
        category: 'Utilities',
        icon: 'fas fa-dice',
        popularity: 'low'
      },
      {
        name: 'browsermcp',
        displayName: 'Browser MCP',
        description: 'Control browser actions and automation - needs https://browsermcp.io/install extension',
        command: 'npx',
        args: ['@browsermcp/mcp@latest'],
        type: 'stdio',
        category: 'Browser',
        icon: 'fas fa-chrome',
        popularity: 'high'
      },
      {
        name: 'terminator-mcp-agent',
        displayName: 'Terminator MCP Agent',
        description: 'Control your PC directly from LLM',
        command: 'npx',
        args: ['-y', 'terminator-mcp-agent@latest'],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-terminal',
        popularity: 'high'
      },
      {
        name: 'blender',
        displayName: 'Blender MCP',
        description: 'Control and manage Blender instances - needs uvx and bit of a setup (https://github.com/ahujasid/blender-mcp)',
        command: 'uvx',
        args: ['blender-mcp'],
        type: 'stdio',
        category: '3D',
        icon: 'fas fa-cube',
        popularity: 'medium'
      },
      {
         name: 'desktop-commander',
         displayName: 'Desktop Commander',
         description: 'All-in-one development tool for managing your desktop environment',
         command: 'npx',
         args: ['-y', '@wonderwhy-er/desktop-commander@latest'],
         type: 'stdio',
         category: 'Productivity',
         icon: 'fas fa-desktop',
         popularity: 'high'
       },
       {
        name: 'mcp-docker-portal',
        displayName: 'MCP Docker Portal',
        description: 'Manage MCP instances in Docker Desktop',
        command: 'docker',
        args: [
          'mcp',
          'gateway',
          'run'
        ],
        type: 'stdio',
        category: 'System',
        icon: 'fas fa-docker',
        popularity: 'high'
      }
    ];
  }

  // Import servers from Claude Desktop config
  async importFromClaudeConfig(claudeConfigPath) {
    try {
      if (!fs.existsSync(claudeConfigPath)) {
        throw new Error('Claude config file not found');
      }

      const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      const mcpServers = claudeConfig.mcpServers || {};
      
      let imported = 0;
      const errors = [];

      for (const [name, config] of Object.entries(mcpServers)) {
        try {
          if (!this.config.mcpServers[name]) {
            this.config.mcpServers[name] = {
              type: 'stdio',
              command: config.command,
              args: config.args || [],
              env: config.env || {},
              description: `Imported from Claude Desktop`,
              enabled: true,
              createdAt: new Date().toISOString()
            };
            imported++;
          }
        } catch (error) {
          errors.push({ name, error: error.message });
        }
      }

      if (imported > 0) {
        this.saveConfig();
      }

      return { imported, errors };
    } catch (error) {
      throw new Error(`Failed to import Claude config: ${error.message}`);
    }
  }

  // Execute MCP tool call
  async executeToolCall(toolCall) {
    try {
      const { server: serverName, name: toolName, arguments: args, callId } = toolCall;
      
      // Get the server info
      const serverInfo = this.servers.get(serverName);
      if (!serverInfo || serverInfo.status !== 'running') {
        return {
          callId,
          success: false,
          error: `Server ${serverName} is not running`
        };
      }

      // Handle special MCP protocol methods
      if (toolName === 'tools/list') {
        return await this.listToolsFromServer(serverName, callId);
      }

      // Handle remote servers differently
      if (serverInfo.type === 'remote') {
        return await this.executeRemoteToolCall(serverInfo, toolName, args, callId);
      }

      // **CRITICAL FIX: Ensure MCP server is properly initialized before executing tools**
      if (!serverInfo.initialized) {
        log.info(`[${serverName}] Server not initialized, performing MCP handshake first...`);
        try {
          await this.initializeMCPServer(serverName);
          log.info(`[${serverName}] MCP initialization completed successfully`);
        } catch (initError) {
          log.error(`[${serverName}] MCP initialization failed:`, initError);
          return {
            callId,
            success: false,
            error: `MCP initialization failed: ${initError.message}`
          };
        }
      }

      // For stdio servers, use the existing implementation
      const mcpRequest = {
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      // Send the request to the MCP server via stdin
      const requestString = JSON.stringify(mcpRequest) + '\n';
      
      log.info(`[${serverName}] Sending MCP request:`, mcpRequest);
      log.info(`[${serverName}] Request string:`, requestString);
      
      return new Promise((resolve) => {
        let responseData = '';
        let timeoutId;

        // Set up response handler
        const onData = (data) => {
          responseData += data.toString();
          
          // Log raw response data for debugging
          log.info(`[${serverName}] Raw response data:`, data.toString());
          log.info(`[${serverName}] Accumulated responseData:`, responseData);
          
          // Try to parse JSON response
          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            log.info(`[${serverName}] Split into ${lines.length} lines:`, lines);
            
            for (const line of lines) {
              // Only try to parse lines that look like JSON (start with { or [)
              const trimmedLine = line.trim();
              log.info(`[${serverName}] Processing line:`, trimmedLine);
              
              if (!trimmedLine.startsWith('{') && !trimmedLine.startsWith('[')) {
                log.info(`[${serverName}] Skipping non-JSON line:`, trimmedLine);
                continue;
              }
              
              log.info(`[${serverName}] Attempting to parse JSON line:`, trimmedLine);
              
              try {
                const response = JSON.parse(trimmedLine);
                log.info(`[${serverName}] Successfully parsed JSON:`, response);
                
                if (response.id === callId) {
                  log.info(`[${serverName}] Found matching response for callId:`, callId);
                  // Clean up
                  clearTimeout(timeoutId);
                  serverInfo.process.stdout.off('data', onData);
                  
                  if (response.error) {
                    log.error(`[${serverName}] MCP server returned error:`, response.error);
                    resolve({
                      callId,
                      success: false,
                      error: response.error.message || 'MCP tool execution failed'
                    });
                  } else {
                    log.info(`[${serverName}] MCP server returned success:`, response.result);
                    resolve({
                      callId,
                      success: true,
                      content: response.result?.content || [{ type: 'text', text: JSON.stringify(response.result) }],
                      metadata: {
                        server: serverName,
                        tool: toolName,
                        executedAt: new Date().toISOString()
                      }
                    });
                  }
                  return;
                } else {
                  log.info(`[${serverName}] Response ID ${response.id} doesn't match expected ${callId}`);
                }
              } catch (lineParseError) {
                // Skip malformed lines and continue
                log.error(`[${serverName}] JSON parse error for line:`, trimmedLine, 'Error:', lineParseError.message);
                continue;
              }
            }
          } catch (parseError) {
            // Log parsing errors but continue waiting for more data
            log.error(`[${serverName}] Overall JSON parsing error:`, parseError.message, 'ResponseData:', responseData);
          }
        };

        // Set up timeout
        timeoutId = setTimeout(() => {
          log.error(`[${serverName}] MCP tool execution timeout after 60 seconds`);
          log.error(`[${serverName}] Final responseData:`, responseData);
          serverInfo.process.stdout.off('data', onData);
          resolve({
            callId,
            success: false,
            error: 'MCP tool execution timeout'
          });
        }, 60000); // 60 second timeout

        // Listen for response
        serverInfo.process.stdout.on('data', onData);

        // Send the request
        try {
          log.info(`[${serverName}] Writing request to stdin...`);
          serverInfo.process.stdin.write(requestString);
          log.info(`[${serverName}] Request sent successfully`);
        } catch (writeError) {
          log.error(`[${serverName}] Failed to write request:`, writeError);
          clearTimeout(timeoutId);
          serverInfo.process.stdout.off('data', onData);
          resolve({
            callId,
            success: false,
            error: `Failed to send request to MCP server: ${writeError.message}`
          });
        }
      });

    } catch (error) {
      log.error(`Error executing MCP tool call:`, error);
      return {
        callId: toolCall.callId,
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  // Initialize MCP server with proper handshake
  async initializeMCPServer(serverName) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo || serverInfo.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }

    // Skip initialization for remote servers or if already initialized
    if (serverInfo.type === 'remote' || serverInfo.initialized) {
      return true;
    }

    log.info(`[${serverName}] Starting MCP initialization handshake...`);

    return new Promise((resolve, reject) => {
      let initResponseReceived = false;
      const initCallId = `init-${Date.now()}`;
      
      // Step 1: Send initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: initCallId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          clientInfo: {
            name: 'ClaraVerse',
            version: '1.0.0'
          }
        }
      };

      const timeout = setTimeout(() => {
        if (!initResponseReceived) {
          serverInfo.process.stdout.off('data', onInitData);
          reject(new Error(`MCP initialization timeout for ${serverName}`));
        }
      }, 10000); // 10 second timeout for initialization

      const onInitData = (data) => {
        const responseData = data.toString();
        log.info(`[${serverName}] Init response data:`, responseData);
        
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('{')) continue;
            
            try {
              const response = JSON.parse(trimmedLine);
              if (response.id === initCallId) {
                clearTimeout(timeout);
                serverInfo.process.stdout.off('data', onInitData);
                initResponseReceived = true;

                if (response.error) {
                  log.error(`[${serverName}] MCP initialization failed:`, response.error);
                  reject(new Error(`MCP initialization failed: ${response.error.message}`));
                  return;
                }

                log.info(`[${serverName}] MCP initialization successful:`, response.result);

                // Step 2: Send initialized notification
                const initializedNotification = {
                  jsonrpc: '2.0',
                  method: 'notifications/initialized',
                  params: {}
                };

                try {
                  serverInfo.process.stdin.write(JSON.stringify(initializedNotification) + '\n');
                  log.info(`[${serverName}] Sent initialized notification`);
                  
                  // Mark as initialized
                  serverInfo.initialized = true;
                  resolve(true);
                } catch (notifyError) {
                  log.error(`[${serverName}] Failed to send initialized notification:`, notifyError);
                  reject(notifyError);
                }
                return;
              }
            } catch (lineParseError) {
              log.debug(`[${serverName}] Skipping non-JSON line during init:`, trimmedLine);
              continue;
            }
          }
        } catch (parseError) {
          log.debug(`[${serverName}] Parse error during initialization:`, parseError.message);
        }
      };

      // Listen for initialization response
      serverInfo.process.stdout.on('data', onInitData);

      // Send initialization request
      try {
        const requestString = JSON.stringify(initRequest) + '\n';
        log.info(`[${serverName}] Sending MCP initialize request:`, initRequest);
        serverInfo.process.stdin.write(requestString);
      } catch (writeError) {
        clearTimeout(timeout);
        serverInfo.process.stdout.off('data', onInitData);
        reject(new Error(`Failed to send initialize request: ${writeError.message}`));
      }
    });
  }

  // List tools from an MCP server
  async listToolsFromServer(serverName, callId) {
    try {
      const serverInfo = this.servers.get(serverName);
      if (!serverInfo || serverInfo.status !== 'running') {
        return {
          callId,
          success: false,
          error: `Server ${serverName} is not running`
        };
      }

      // Handle remote servers differently
      if (serverInfo.type === 'remote') {
        const mcpRequest = {
          jsonrpc: '2.0',
          id: callId,
          method: 'tools/list',
          params: {}
        };

        log.info(`[${serverName}] Sending remote tools/list request:`, mcpRequest);

        const response = await fetch(serverInfo.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...serverInfo.config.headers
          },
          body: JSON.stringify(mcpRequest)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();
        log.info(`[${serverName}] Remote tools/list response:`, responseData);

        if (responseData.error) {
          return {
            callId,
            success: false,
            error: responseData.error.message || 'Failed to list tools'
          };
        }

        const tools = responseData.result?.tools || [];
        return {
          callId,
          success: true,
          content: [{ 
            type: 'json', 
            text: JSON.stringify(tools),
            data: tools 
          }],
          metadata: {
            server: serverName,
            tool: 'tools/list',
            executedAt: new Date().toISOString(),
            type: 'remote'
          }
        };
      }

      // **CRITICAL FIX: Ensure MCP server is properly initialized before sending tools/list**
      if (!serverInfo.initialized) {
        log.info(`[${serverName}] Server not initialized, performing MCP handshake first...`);
        try {
          await this.initializeMCPServer(serverName);
          log.info(`[${serverName}] MCP initialization completed successfully`);
        } catch (initError) {
          log.error(`[${serverName}] MCP initialization failed:`, initError);
          return {
            callId,
            success: false,
            error: `MCP initialization failed: ${initError.message}`
          };
        }
      }

      // Handle stdio servers (existing logic)
      const mcpRequest = {
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/list',
        params: {}
      };

      const requestString = JSON.stringify(mcpRequest) + '\n';
      
      return new Promise((resolve) => {
        let responseData = '';
        let timeoutId;

        const onData = (data) => {
          responseData += data.toString();
          
          try {
            const lines = responseData.split('\n').filter(line => line.trim());
            for (const line of lines) {
              // Only try to parse lines that look like JSON (start with { or [)
              const trimmedLine = line.trim();
              if (!trimmedLine.startsWith('{') && !trimmedLine.startsWith('[')) {
                log.debug(`Skipping non-JSON line from ${serverName}:`, trimmedLine);
                continue;
              }
              
              try {
                const response = JSON.parse(trimmedLine);
                if (response.id === callId) {
                  clearTimeout(timeoutId);
                  serverInfo.process.stdout.off('data', onData);
                  
                  if (response.error) {
                    resolve({
                      callId,
                      success: false,
                      error: response.error.message || 'Failed to list tools'
                    });
                  } else {
                    // Return the tools list in a format the frontend expects
                    const tools = response.result?.tools || [];
                    resolve({
                      callId,
                      success: true,
                      content: [{ 
                        type: 'json', 
                        text: JSON.stringify(tools),
                        data: tools 
                      }],
                      metadata: {
                        server: serverName,
                        tool: 'tools/list',
                        executedAt: new Date().toISOString(),
                        type: 'stdio'
                      }
                    });
                  }
                  return;
                }
              } catch (lineParseError) {
                log.debug(`Skipping malformed JSON line from ${serverName}:`, trimmedLine);
                continue;
              }
            }
          } catch (parseError) {
            log.debug(`JSON parsing error for ${serverName}:`, parseError.message);
          }
        };

        timeoutId = setTimeout(() => {
          serverInfo.process.stdout.off('data', onData);
          resolve({
            callId,
            success: false,
            error: 'Tool listing timeout (waited 60s)'
          });
        }, 60000); // 60 second timeout for all MCP servers

        serverInfo.process.stdout.on('data', onData);

        try {
          serverInfo.process.stdin.write(requestString);
        } catch (writeError) {
          clearTimeout(timeoutId);
          serverInfo.process.stdout.off('data', onData);
          resolve({
            callId,
            success: false,
            error: `Failed to send tools/list request: ${writeError.message}`
          });
        }
      });

    } catch (error) {
      log.error(`Error listing tools from MCP server ${serverName}:`, error);
      return {
        callId,
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  // Execute tool call on remote MCP server
  async executeRemoteToolCall(serverInfo, toolName, args, callId) {
    try {
      const { config } = serverInfo;
      const mcpRequest = {
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      log.info(`[${serverInfo.name}] Sending remote MCP request:`, mcpRequest);

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      log.info(`[${serverInfo.name}] Remote MCP response:`, responseData);

      if (responseData.error) {
        return {
          callId,
          success: false,
          error: responseData.error.message || 'Remote MCP tool execution failed'
        };
      }

      return {
        callId,
        success: true,
        content: responseData.result?.content || [{ type: 'text', text: JSON.stringify(responseData.result) }],
        metadata: {
          server: serverInfo.name,
          tool: toolName,
          executedAt: new Date().toISOString(),
          type: 'remote'
        }
      };

    } catch (error) {
      log.error(`Error executing remote MCP tool call:`, error);
      return {
        callId,
        success: false,
        error: error.message || 'Remote MCP tool execution failed'
      };
    }
  }

  /**
   * Save the current running state of all servers
   */
  saveRunningState() {
    try {
      this.config.lastRunningServers = Array.from(this.servers.keys());
      this.saveConfig();
      log.info(`Saved running state: ${this.config.lastRunningServers.length} servers were running`);
    } catch (error) {
      log.error('Error saving running state:', error);
    }
  }

  /**
   * Start all servers that were running when the app was last closed
   */
  async startPreviouslyRunningServers() {
    const results = [];
    const previouslyRunning = this.config.lastRunningServers || [];
    
    log.info(`Attempting to restore ${previouslyRunning.length} previously running servers:`, previouslyRunning);
    
    for (const serverName of previouslyRunning) {
      // Check if the server still exists in config
      if (!this.config.mcpServers[serverName]) {
        log.warn(`Previously running server '${serverName}' no longer exists in config`);
        continue;
      }
      
      // Check if the server is enabled
      if (!this.config.mcpServers[serverName].enabled) {
        log.info(`Previously running server '${serverName}' is now disabled, skipping`);
        continue;
      }
      
      try {
        await this.startServer(serverName);
        results.push({ name: serverName, success: true });
        log.info(`Successfully restored server: ${serverName}`);
      } catch (error) {
        log.error(`Failed to restore MCP server '${serverName}':`, error);
        results.push({ name: serverName, success: false, error: error.message });
      }
    }
    
    log.info(`Restored ${results.filter(r => r.success).length}/${previouslyRunning.length} previously running servers`);
    return results;
  }
}

module.exports = MCPService; 