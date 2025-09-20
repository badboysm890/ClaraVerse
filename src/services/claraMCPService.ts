/**
 * Clara MCP Service
 * 
 * This service handles Model Context Protocol (MCP) integration for Clara Assistant.
 * It manages MCP servers, discovers available tools and resources, and executes tool calls.
 */

import { 
  ClaraMCPServer, 
  ClaraMCPTool, 
  ClaraMCPResource, 
  ClaraMCPToolCall, 
  ClaraMCPToolResult 
} from '../types/clara_assistant_types';

/**
 * MCP Client for communicating with MCP servers
 */
export class ClaraMCPService {
  private servers: Map<string, ClaraMCPServer> = new Map();
  private tools: Map<string, ClaraMCPTool> = new Map();
  private resources: Map<string, ClaraMCPResource> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the MCP service
   */
  public async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Clara MCP Service...');
      await this.refreshServers();
      
      // If no servers exist, set up a bundled Python MCP server
      if (this.servers.size === 0) {
        console.log('📦 No MCP servers found, setting up bundled Python MCP server...');
        await this.setupBundledPythonMCPServer();
      }
      
      await this.discoverToolsAndResources();
      this.isInitialized = true;
      console.log('✅ Clara MCP Service initialized successfully');
      console.log(`📊 MCP Status: ${this.servers.size} servers, ${this.tools.size} tools, ${this.resources.size} resources`);
    } catch (error) {
      console.error('❌ Failed to initialize Clara MCP Service:', error);
    }
  }

  /**
   * Refresh the list of MCP servers from the backend
   */
  public async refreshServers(): Promise<void> {
    try {
      console.log('🔄 Refreshing MCP servers...');
      if (!window.mcpService) {
        console.warn('⚠️ MCP service not available in window object');
        return;
      }

      const servers = await window.mcpService.getServers();
      
      // Always ensure Clara's Python MCP server exists
      const hasPythonMCP = servers.some((server: any) => server.name === 'python-mcp');
      if (!hasPythonMCP) {
        console.log('🔧 Clara Python MCP server missing, restoring it...');
        await this.setupBundledPythonMCPServer();
        return; // setupBundledPythonMCPServer calls refreshServers internally
      }
      
      this.servers.clear();
      
      console.log(`📡 Retrieved ${servers.length} servers from backend:`, servers.map(s => ({ 
        name: s.name, 
        isRunning: s.isRunning, 
        status: s.status,
        config: s.config,
        enabled: s.config?.enabled
      })));
      
      for (const server of servers) {
        console.log(`💾 Loading server: ${server.name}`, {
          isRunning: server.isRunning,
          status: server.status,
          config: server.config,
          enabled: server.config?.enabled
        });
        this.servers.set(server.name, server);
      }
      
      console.log(`💾 Loaded ${servers.length} MCP servers into service`);
    } catch (error) {
      console.error('❌ Failed to refresh MCP servers:', error);
    }
  }

  /**
   * Get all available MCP servers (including disabled ones)
   */
  public getAllServers(): ClaraMCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Start an MCP server
   */
  public async startServer(serverName: string): Promise<boolean> {
    try {
      console.log(`🚀 Starting MCP server: ${serverName}`);
      if (!window.mcpService) {
        console.warn('⚠️ MCP service not available in window object');
        return false;
      }

      await window.mcpService.startServer(serverName);
      
      // Refresh the server state
      await this.refreshServers();
      await this.discoverToolsAndResources();
      
      console.log(`✅ MCP server started successfully: ${serverName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to start MCP server ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Stop an MCP server
   */
  public async stopServer(serverName: string): Promise<boolean> {
    try {
      console.log(`🛑 Stopping MCP server: ${serverName}`);
      if (!window.mcpService) {
        console.warn('⚠️ MCP service not available in window object');
        return false;
      }

      await window.mcpService.stopServer(serverName);
      
      // Refresh the server state
      await this.refreshServers();
      await this.discoverToolsAndResources();
      
      console.log(`✅ MCP server stopped successfully: ${serverName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to stop MCP server ${serverName}:`, error);
      return false;
    }
  }

  /**
   * Toggle an MCP server on/off
   */
  public async toggleServer(serverName: string): Promise<boolean> {
    const server = this.servers.get(serverName);
    if (!server) {
      console.error(`❌ Server not found: ${serverName}`);
      return false;
    }

    if (server.isRunning) {
      return await this.stopServer(serverName);
    } else {
      return await this.startServer(serverName);
    }
  }

  /**
   * Discover available tools and resources from running MCP servers
   */
  public async discoverToolsAndResources(): Promise<void> {
    console.log('🔍 Starting tool and resource discovery...');
    this.tools.clear();
    this.resources.clear();

    // Get servers that are either running OR enabled (for testing)
    const availableServers = Array.from(this.servers.values()).filter(
      server => server.isRunning || server.config?.enabled !== false
    );

    const runningServers = availableServers.filter(
      server => server.isRunning && server.status === 'running'
    );

    console.log(`🏃 Found ${runningServers.length} running servers and ${availableServers.length} available servers out of ${this.servers.size} total servers`);
    console.log('🏃 Running servers:', runningServers.map(s => ({ name: s.name, status: s.status })));
    console.log('📋 Available servers:', availableServers.map(s => ({ name: s.name, status: s.status, isRunning: s.isRunning, enabled: s.config?.enabled })));

    // Process running servers first
    for (const server of runningServers) {
      try {
        console.log(`🔧 Discovering capabilities for running server: ${server.name}`);
        await this.discoverServerCapabilities(server);
      } catch (error) {
        console.warn(`⚠️ Failed to discover capabilities for running server ${server.name}:`, error);
      }
    }

    // For testing: also process enabled but not running servers
    const enabledButNotRunning = availableServers.filter(
      server => !server.isRunning && server.config?.enabled !== false
    );

    if (enabledButNotRunning.length > 0) {
      console.log(`🧪 Adding tools for ${enabledButNotRunning.length} enabled but not running servers (testing mode)`);
      for (const server of enabledButNotRunning) {
        try {
          console.log(`🔧 Discovering capabilities for enabled server: ${server.name} (not running)`);
          await this.discoverServerCapabilities(server);
        } catch (error) {
          console.warn(`⚠️ Failed to discover capabilities for enabled server ${server.name}:`, error);
        }
      }
    }

    console.log(`✅ Discovery complete: ${this.tools.size} tools and ${this.resources.size} resources`);
    if (this.tools.size > 0) {
      console.log('🛠️ Available tools:', Array.from(this.tools.keys()));
    }
  }

  /**
   * Discover capabilities from a specific MCP server (dynamic tool discovery)
   */
  private async discoverServerCapabilities(server: ClaraMCPServer): Promise<void> {
    // Dynamic MCP tool discovery using the MCP protocol
    try {
      if (!window.mcpService?.executeToolCall) {
        throw new Error('MCP service not available in window object');
      }
      // Compose a tool call for 'tools/list' (MCP standard)
      const callId = `list_tools_${server.name}_${Date.now()}`;
      const toolCall = {
        name: 'tools/list',
        arguments: {},
        server: server.name,
        callId
      };
      // Send the request to the MCP server
      const response = await window.mcpService.executeToolCall(toolCall);
      if (response && response.success && Array.isArray(response.content)) {
        // The result should be an array of tool definitions
        const tools = response.content.find((c: any) => c.type === 'json' || c.type === 'object' || c.type === 'text');
        let toolList = [];
        if (tools && tools.data) {
          // If type: 'json', parse data
          try {
            toolList = typeof tools.data === 'string' ? JSON.parse(tools.data) : tools.data;
          } catch (e) {
            toolList = [];
          }
        } else if (tools && tools.text) {
          // If type: 'text', try to parse as JSON
          try {
            toolList = JSON.parse(tools.text);
          } catch (e) {
            toolList = [];
          }
        }
        if (Array.isArray(toolList)) {
          for (const tool of toolList) {
            if (tool && tool.name && tool.inputSchema) {
              this.tools.set(`${server.name}:${tool.name}`, {
                ...tool,
                server: server.name
              });
            }
          }
          console.log(`✅ Dynamically discovered ${toolList.length} tools from MCP server '${server.name}'`);
          return;
        }
      }
      throw new Error('No valid tool list returned from server');
    } catch (error) {
      console.warn(`⚠️ Dynamic tool discovery failed for server ${server.name}:`, error);
      // Optionally, fallback to hardcoded tools for known servers (legacy/test only)
      if (server.name === 'python-mcp') {
        this.addPythonMCPTools(server.name);
      } else if (server.name === 'github') {
        this.addGitHubTools(server.name);
      } else if (server.name === 'filesystem') {
        this.addFileSystemTools(server.name);
      } else if (server.name === 'brave-search') {
        this.addSearchTools(server.name);
      } else if (server.name === 'puppeteer') {
        this.addWebScrapingTools(server.name);
      } else {
        console.log(`❓ Unknown server type: ${server.name}, no tools added`);
      }
    }
  }

  /**
   * Add GitHub-specific tools
   */
  private addGitHubTools(serverName: string): void {
    const githubTools: ClaraMCPTool[] = [
      {
        name: 'search_repositories',
        description: 'Search for GitHub repositories',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            sort: { type: 'string', description: 'Sort order (stars, forks, updated)' },
            order: { type: 'string', description: 'Sort direction (asc, desc)' }
          },
          required: ['query']
        },
        server: serverName
      },
      {
        name: 'get_repository',
        description: 'Get information about a specific repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' }
          },
          required: ['owner', 'repo']
        },
        server: serverName
      },
      {
        name: 'list_issues',
        description: 'List issues in a repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            state: { type: 'string', description: 'Issue state (open, closed, all)' }
          },
          required: ['owner', 'repo']
        },
        server: serverName
      },
      {
        name: 'create_issue',
        description: 'Create a new issue in a repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body' }
          },
          required: ['owner', 'repo', 'title']
        },
        server: serverName
      },
      {
        name: 'get_file_contents',
        description: 'Get contents of a file or directory',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'Path to file/directory' },
            branch: { type: 'string', description: 'Branch to get contents from' }
          },
          required: ['owner', 'repo', 'path']
        },
        server: serverName
      },
      {
        name: 'create_or_update_file',
        description: 'Create or update a single file in a repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'Path where to create/update the file' },
            content: { type: 'string', description: 'Content of the file' },
            message: { type: 'string', description: 'Commit message' },
            branch: { type: 'string', description: 'Branch to create/update the file in' },
            sha: { type: 'string', description: 'SHA of file being replaced (for updates)' }
          },
          required: ['owner', 'repo', 'path', 'content', 'message', 'branch']
        },
        server: serverName
      },
      {
        name: 'create_pull_request',
        description: 'Create a new pull request',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description' },
            head: { type: 'string', description: 'Branch containing changes' },
            base: { type: 'string', description: 'Branch to merge into' },
            draft: { type: 'boolean', description: 'Create as draft PR' }
          },
          required: ['owner', 'repo', 'title', 'head', 'base']
        },
        server: serverName
      }
    ];

    for (const tool of githubTools) {
      this.tools.set(`${serverName}:${tool.name}`, tool);
    }
  }

  /**
   * Add Python MCP-specific tools (fallback for bundled server)
   */
  private addPythonMCPTools(serverName: string): void {
    const pythonMCPTools: ClaraMCPTool[] = [
      {
        name: 'execute_python',
        description: 'Execute Python code safely',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Python code to execute' }
          },
          required: ['code']
        },
        server: serverName
      },
      {
        name: 'install_package',
        description: 'Install Python packages',
        inputSchema: {
          type: 'object',
          properties: {
            package: { type: 'string', description: 'Package name to install' },
            version: { type: 'string', description: 'Specific version (optional)' }
          },
          required: ['package']
        },
        server: serverName
      },
      {
        name: 'list_packages',
        description: 'List installed Python packages',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        server: serverName
      }
    ];

    for (const tool of pythonMCPTools) {
      this.tools.set(`${serverName}:${tool.name}`, tool);
    }
  }

  /**
   * Add filesystem-specific tools
   */
  private addFileSystemTools(serverName: string): void {
    const fsTools: ClaraMCPTool[] = [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' }
          },
          required: ['path']
        },
        server: serverName
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        },
        server: serverName
      },
      {
        name: 'list_directory',
        description: 'List contents of a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to list' }
          },
          required: ['path']
        },
        server: serverName
      }
    ];

    for (const tool of fsTools) {
      this.tools.set(`${serverName}:${tool.name}`, tool);
    }
  }

  /**
   * Add search-specific tools
   */
  private addSearchTools(serverName: string): void {
    const searchTools: ClaraMCPTool[] = [
      {
        name: 'brave_web_search',
        description: 'Execute web searches with pagination and filtering',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms' },
            count: { type: 'number', description: 'Results per page (max 20)' },
            offset: { type: 'number', description: 'Pagination offset (max 9)' }
          },
          required: ['query']
        },
        server: serverName
      },
      {
        name: 'brave_local_search',
        description: 'Search for local businesses and services',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Local search terms' },
            count: { type: 'number', description: 'Number of results (max 20)' }
          },
          required: ['query']
        },
        server: serverName
      }
    ];

    for (const tool of searchTools) {
      this.tools.set(`${serverName}:${tool.name}`, tool);
    }
  }

  /**
   * Add web scraping tools
   */
  private addWebScrapingTools(serverName: string): void {
    const webTools: ClaraMCPTool[] = [
      {
        name: 'scrape_page',
        description: 'Scrape content from a web page',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to scrape' },
            selector: { type: 'string', description: 'CSS selector for specific content' }
          },
          required: ['url']
        },
        server: serverName
      },
      {
        name: 'screenshot_page',
        description: 'Take a screenshot of a web page',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to screenshot' },
            width: { type: 'number', description: 'Screenshot width' },
            height: { type: 'number', description: 'Screenshot height' }
          },
          required: ['url']
        },
        server: serverName
      }
    ];

    for (const tool of webTools) {
      this.tools.set(`${serverName}:${tool.name}`, tool);
    }
  }

  /**
   * Get all available MCP tools
   */
  public getAvailableTools(): ClaraMCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools from specific servers
   */
  public getToolsFromServers(serverNames: string[]): ClaraMCPTool[] {
    return Array.from(this.tools.values()).filter(
      tool => serverNames.includes(tool.server)
    );
  }

  /**
   * Get all available MCP resources
   */
  public getAvailableResources(): ClaraMCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get running MCP servers
   */
  public getRunningServers(): ClaraMCPServer[] {
    return Array.from(this.servers.values()).filter(
      server => server.isRunning && server.status === 'running'
    );
  }

  /**
   * Execute an MCP tool call
   */
  public async executeToolCall(toolCall: ClaraMCPToolCall): Promise<ClaraMCPToolResult> {
    try {
      console.log(`🔧 [MCP] Starting tool execution:`, toolCall);
      
      const exactToolKey = `${toolCall.server}:${toolCall.name}`;
      let tool = this.tools.get(exactToolKey);
      let usedFuzzyMatch = false;
      let actualToolKey = exactToolKey;
      
      if (!tool) {
        console.warn(`❌ [MCP] Exact tool match not found: ${exactToolKey}`);
        console.log(`🔍 [MCP] Available tools:`, Array.from(this.tools.keys()));
        
        // Try fuzzy matching as failsafe
        const fuzzyMatch = this.findBestToolMatch(toolCall.server, toolCall.name);
        if (fuzzyMatch) {
          tool = fuzzyMatch.tool;
          actualToolKey = fuzzyMatch.toolKey;
          usedFuzzyMatch = true;
          console.log(`✅ [MCP-FUZZY] Found fuzzy match: ${exactToolKey} → ${actualToolKey} (confidence: ${fuzzyMatch.confidence.toFixed(3)})`);
        } else {
          console.error(`❌ [MCP] No suitable tool match found for: ${exactToolKey}`);
          const availableTools = Array.from(this.tools.keys()).join(', ');
          return {
            callId: toolCall.callId,
            success: false,
            error: `Tool ${toolCall.name} not found on server ${toolCall.server}. Available tools: ${availableTools}`
          };
        }
      } else {
        console.log(`✅ [MCP] Exact tool match found:`, exactToolKey);
      }

      console.log(`✅ [MCP] Using tool:`, tool);
      if (usedFuzzyMatch) {
        console.log(`🎯 [MCP-FUZZY] Fuzzy match applied: ${exactToolKey} → ${actualToolKey}`);
      }

      // Use the matched tool's server name for validation (important for fuzzy matching)
      const serverNameToCheck = usedFuzzyMatch ? tool.server : toolCall.server;
      const server = this.servers.get(serverNameToCheck);
      if (!server || !server.isRunning) {
        console.error(`❌ [MCP] Server not running: ${serverNameToCheck}`);
        console.log(`🔍 [MCP] Server status:`, server);
        console.log(`🔍 [MCP] Available servers:`, Array.from(this.servers.keys()));
        return {
          callId: toolCall.callId,
          success: false,
          error: `Server ${serverNameToCheck} is not running`
        };
      }

      console.log(`✅ [MCP] Server is running:`, server);

      // Use the backend MCP service to execute the tool call
      console.log(`🔍 [MCP] Checking window.mcpService:`, !!window.mcpService);
      console.log(`🔍 [MCP] Checking executeToolCall method:`, !!window.mcpService?.executeToolCall);
      
      if (window.mcpService?.executeToolCall) {
        try {
          // Create corrected tool call object for fuzzy matches
          const correctedToolCall = usedFuzzyMatch ? {
            ...toolCall,
            server: tool.server,
            name: tool.name
          } : toolCall;
          
          console.log(`📡 [MCP] Calling backend MCP service with:`, correctedToolCall);
          const result = await window.mcpService.executeToolCall(correctedToolCall);
          console.log(`📥 [MCP] Backend result:`, result);
          return result;
        } catch (error) {
          console.error('❌ [MCP] Backend MCP execution failed, falling back to simulation:', error);
          // Fall back to simulation if backend fails
        }
      } else {
        console.warn('⚠️ [MCP] Backend MCP service not available, using simulation');
      }

      // Fallback to simulation if backend is not available
      const correctedToolCall = usedFuzzyMatch ? {
        ...toolCall,
        server: tool.server,
        name: tool.name
      } : toolCall;
      
      console.log(`🎭 [MCP] Using simulation for tool:`, correctedToolCall);
      const result = await this.simulateToolExecution(correctedToolCall, tool);
      
      return {
        callId: toolCall.callId,
        success: true,
        content: [
          {
            type: 'text',
            text: result
          }
        ],
        metadata: {
          server: toolCall.server,
          tool: toolCall.name,
          executedAt: new Date().toISOString(),
          simulated: true // Mark as simulated
        }
      };
    } catch (error) {
      console.error(`❌ [MCP] Error executing MCP tool call ${toolCall.callId}:`, error);
      return {
        callId: toolCall.callId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Simulate tool execution (placeholder for actual MCP communication)
   */
  private async simulateToolExecution(toolCall: ClaraMCPToolCall, tool: ClaraMCPTool): Promise<string> {
    // This is a placeholder implementation
    // In a real implementation, this would send the tool call to the MCP server
    // and return the actual result
    
    const { name, arguments: args } = toolCall;
    
    switch (name) {
      case 'search_repositories':
        return `Found repositories matching "${args.query}": [Mock results for ${args.query}]`;
      
      case 'get_repository':
        return `Repository ${args.owner}/${args.repo}: [Mock repository information]`;
      
      case 'list_issues':
        return `Issues for ${args.owner}/${args.repo}: [Mock issue list]`;
      
      case 'create_issue':
        return `Created issue "${args.title}" in ${args.owner}/${args.repo}: [Mock issue details]`;
      
      case 'get_file_contents':
        return `Contents of ${args.path} in ${args.owner}/${args.repo}: [Mock file contents]`;
      
      case 'create_or_update_file':
        return `Created/updated file ${args.path} in ${args.owner}/${args.repo}: [Mock file operation result]`;
      
      case 'create_pull_request':
        return `Created pull request "${args.title}" in ${args.owner}/${args.repo}: [Mock PR details]`;
      
      case 'brave_web_search':
        return `Web search results for "${args.query}": [Mock search results for ${args.query}]`;
      
      case 'brave_local_search':
        return `Local search results for "${args.query}": [Mock local business results for ${args.query}]`;
      
      case 'read_file':
        return `Contents of ${args.path}: [Mock file contents]`;
      
      case 'scrape_page':
        return `Scraped content from ${args.url}: [Mock scraped content]`;
      
      default:
        return `Executed ${name} with arguments: ${JSON.stringify(args)}`;
    }
  }

  /**
   * Convert tool calls to OpenAI-compatible format for AI models
   * Only includes tools that pass OpenAI validation to ensure requests always work
   */
  public convertToolsToOpenAIFormat(): any[] {
    const tools = this.getAvailableTools();
    console.log(`🔧 [TOOL-CONVERSION] Starting validation and conversion of ${tools.length} tools`);
    
    const validatedTools: any[] = [];
    const rejectedTools: string[] = [];
    
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const toolId = `${tool.server}:${tool.name}`;
      
      try {
        console.log(`🔧 [TOOL-VALIDATION] Testing tool ${i + 1}/${tools.length}: ${toolId}`);
        
        // Try to create a valid OpenAI tool
        const openAITool = this.createOpenAITool(tool);
        
        // AGGRESSIVE FINAL FIX: Ensure all arrays have items right before validation
        this.aggressiveArrayFix(openAITool);
        
        // FINAL VALIDATION: Check the exact schema that will be sent to OpenAI
        const finalValidation = this.validateFinalOpenAITool(openAITool, toolId);
        if (!finalValidation.isValid) {
          rejectedTools.push(`${toolId} (${finalValidation.reason})`);
          console.error(`❌ [FINAL-VALIDATION] Tool ${toolId} failed final validation: ${finalValidation.reason}`);
          continue;
        }
        
        // Test if it passes OpenAI validation
        if (this.isValidOpenAITool(openAITool)) {
          validatedTools.push(openAITool);
          console.log(`✅ [TOOL-VALIDATION] Tool ${toolId} passed validation`);
        } else {
          rejectedTools.push(toolId);
          console.warn(`❌ [TOOL-VALIDATION] Tool ${toolId} failed validation - excluding from request`);
        }
        
      } catch (error) {
        rejectedTools.push(toolId);
        console.error(`❌ [TOOL-VALIDATION] Tool ${toolId} threw error during validation:`, error);
      }
    }
    
    console.log(`✅ [TOOL-CONVERSION] Validation complete:`);
    console.log(`   - Valid tools: ${validatedTools.length}`);
    console.log(`   - Rejected tools: ${rejectedTools.length}`);
    
    if (rejectedTools.length > 0) {
      console.warn(`⚠️ [TOOL-CONVERSION] Rejected tools:`, rejectedTools);
    }
    
    // Log the final valid tools (but only names to avoid spam)
    const validToolNames = validatedTools.map(t => t.function.name);
    console.log(`🔧 [TOOL-CONVERSION] Final valid tools:`, validToolNames);
    
    // FINAL DEBUG: Log the exact schemas being sent to OpenAI for array-containing tools
    console.log(`🔍 [FINAL-DEBUG] Checking final schemas for array properties...`);
    for (const tool of validatedTools) {
      const toolName = tool.function.name;
      if (tool.function.parameters?.properties) {
        for (const [propName, propSchema] of Object.entries(tool.function.parameters.properties)) {
          const prop = propSchema as any;
          if (prop?.type === 'array') {
            console.log(`🔍 [FINAL-DEBUG] Tool ${toolName}, array property '${propName}':`, {
              type: prop.type,
              hasItems: !!prop.items,
              items: prop.items,
              fullProperty: prop
            });
          }
        }
      }
    }
    
    return validatedTools;
  }

  /**
   * Create an OpenAI-compatible tool from an MCP tool
   */
  private createOpenAITool(tool: ClaraMCPTool): any {
    console.log(`🔧 [CREATE-TOOL] Creating OpenAI tool for: ${tool.server}:${tool.name}`);
    
    // Try to fix the schema first
    const fixedParameters = this.fixOpenAISchema(tool.inputSchema);
    
    // FAILSAFE: Double-check that all array properties have items
    this.ensureArrayItemsExist(fixedParameters);
    
    const openAITool = {
      type: 'function',
      function: {
        name: `mcp_${tool.server}_${tool.name}`,
        description: `[MCP:${tool.server}] ${tool.description}`,
        parameters: fixedParameters
      }
    };
    
    // COMPREHENSIVE DEBUG: Log the exact final tool being sent to OpenAI
    console.log(`✅ [CREATE-TOOL] Final OpenAI tool for ${tool.server}:${tool.name}:`);
    console.log(`📋 [CREATE-TOOL] Tool name: ${openAITool.function.name}`);
    console.log(`📋 [CREATE-TOOL] Parameters schema:`, JSON.stringify(openAITool.function.parameters, null, 2));
    
    // Special debug for array properties
    if (openAITool.function.parameters?.properties) {
      for (const [propName, propSchema] of Object.entries(openAITool.function.parameters.properties)) {
        const prop = propSchema as any;
        if (prop?.type === 'array') {
          console.log(`🔍 [CREATE-TOOL] Array property '${propName}':`, {
            type: prop.type,
            hasItems: !!prop.items,
            itemsType: prop.items?.type,
            itemsSchema: prop.items
          });
        }
      }
    }
    
    // FINAL SAFETY CHECK: Ensure all arrays have items before returning
    this.finalArraySafetyCheck(openAITool, `${tool.server}:${tool.name}`);
    
    return openAITool;
  }

  /**
   * Failsafe method to ensure all array properties have items
   */
  private ensureArrayItemsExist(schema: any): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propSchema && typeof propSchema === 'object') {
          const prop = propSchema as any;
          
          if (prop.type === 'array') {
            if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
              console.warn(`🚨 [FAILSAFE] Array property '${propName}' still missing items! Adding emergency fix.`);
              prop.items = { type: 'object' };
            }
          }
          
          // Recursively check nested objects
          if (prop.type === 'object') {
            this.ensureArrayItemsExist(prop);
          }
          
          // Check array items
          if (prop.items) {
            this.ensureArrayItemsExist(prop.items);
          }
        }
      }
    }
  }

  /**
   * Test if a tool is valid according to OpenAI's requirements
   */
  private isValidOpenAITool(tool: any): boolean {
    try {
      // Basic structure validation
      if (!tool || tool.type !== 'function' || !tool.function) {
        return false;
      }

      const func = tool.function;
      
      // Function must have name and description
      if (!func.name || typeof func.name !== 'string' || 
          !func.description || typeof func.description !== 'string') {
        return false;
      }

      // Parameters must exist and be valid
      if (!func.parameters) {
        return false;
      }

      // Validate the parameters schema
      return this.isValidParametersSchema(func.parameters);
      
    } catch (error) {
      console.error(`[TOOL-VALIDATION] Error validating tool:`, error);
      return false;
    }
  }

  /**
   * Validate parameters schema according to OpenAI requirements
   */
  private isValidParametersSchema(schema: any): boolean {
    try {
      // Must be an object
      if (!schema || typeof schema !== 'object') {
        return false;
      }

      // Must have type 'object'
      if (schema.type !== 'object') {
        return false;
      }

      // Must have properties (can be empty)
      if (!schema.hasOwnProperty('properties') || typeof schema.properties !== 'object') {
        return false;
      }

      // Required must be an array if present
      if (schema.hasOwnProperty('required') && !Array.isArray(schema.required)) {
        return false;
      }

      // Validate each property
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (!this.isValidPropertySchema(propSchema, propName)) {
          return false;
        }
      }

      // Validate required array references existing properties
      if (schema.required) {
        for (const reqProp of schema.required) {
          if (typeof reqProp !== 'string' || !schema.properties[reqProp]) {
            return false;
          }
        }
      }

      return true;
      
    } catch (error) {
      console.error(`[SCHEMA-VALIDATION] Error validating parameters schema:`, error);
      return false;
    }
  }

  /**
   * Validate a single property schema
   */
  private isValidPropertySchema(propSchema: any, propName: string): boolean {
    try {
      if (!propSchema || typeof propSchema !== 'object') {
        return false;
      }

      // Must have a type
      if (!propSchema.type || typeof propSchema.type !== 'string') {
        return false;
      }

      // Special validation for arrays - they MUST have items
      if (propSchema.type === 'array') {
        if (!propSchema.items || typeof propSchema.items !== 'object') {
          console.warn(`[SCHEMA-VALIDATION] Array property '${propName}' missing valid items`);
          return false;
        }
        
        // Items must have a type
        if (!propSchema.items.type || typeof propSchema.items.type !== 'string') {
          console.warn(`[SCHEMA-VALIDATION] Array property '${propName}' items missing type`);
          return false;
        }
      }

      // Validate nested objects recursively
      if (propSchema.type === 'object' && propSchema.properties) {
        for (const [nestedPropName, nestedPropSchema] of Object.entries(propSchema.properties)) {
          if (!this.isValidPropertySchema(nestedPropSchema, `${propName}.${nestedPropName}`)) {
            return false;
          }
        }
      }

      return true;
      
    } catch (error) {
      console.error(`[SCHEMA-VALIDATION] Error validating property '${propName}':`, error);
      return false;
    }
  }

  /**
   * Fix schema to be compatible with OpenAI function calling requirements
   * This is a basic fix attempt - if it can't be fixed, validation will reject it
   */
  private fixOpenAISchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    // Deep clone the schema to avoid modifying the original
    const fixedSchema = JSON.parse(JSON.stringify(schema));

    console.log(`🔧 [SCHEMA-FIX] Original schema:`, JSON.stringify(fixedSchema, null, 2));

    // Ensure we have the required top-level structure
    if (!fixedSchema.type) {
      fixedSchema.type = 'object';
    }
    if (!fixedSchema.properties) {
      fixedSchema.properties = {};
    }
    if (!fixedSchema.required) {
      fixedSchema.required = [];
    }

    // Recursively clean up the schema to remove OpenAI-incompatible properties
    this.cleanSchemaForOpenAI(fixedSchema);

    console.log(`✅ [SCHEMA-FIX] Fixed schema:`, JSON.stringify(fixedSchema, null, 2));

    // Clean up required array
    if (fixedSchema.required && Array.isArray(fixedSchema.required)) {
      fixedSchema.required = fixedSchema.required.filter((reqProp: string) => {
        return fixedSchema.properties && fixedSchema.properties[reqProp];
      });
    }

    return fixedSchema;
  }

  /**
   * Recursively clean up schema properties to be OpenAI-compatible
   */
  private cleanSchemaForOpenAI(schema: any): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    // Remove OpenAI-incompatible properties from ANY level (including top-level)
    const removedProps: string[] = [];
    if (schema.$schema) { removedProps.push('$schema'); delete schema.$schema; }
    if (schema.additionalProperties !== undefined) { removedProps.push('additionalProperties'); delete schema.additionalProperties; }
    if (schema.anyOf) { removedProps.push('anyOf'); delete schema.anyOf; }
    if (schema.oneOf) { removedProps.push('oneOf'); delete schema.oneOf; }
    if (schema.allOf) { removedProps.push('allOf'); delete schema.allOf; }
    if (schema.not) { removedProps.push('not'); delete schema.not; }
    if (schema.const) { removedProps.push('const'); delete schema.const; }
    if (schema.enum) { removedProps.push('enum'); delete schema.enum; }

    if (removedProps.length > 0) {
      console.log(`🧹 [SCHEMA-CLEAN] Removed incompatible properties:`, removedProps);
    }

    // Handle properties recursively
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propSchema && typeof propSchema === 'object') {
          const prop = propSchema as any;
          
          // AGGRESSIVE FIX: Handle all array properties
          if (prop.type === 'array') {
            console.log(`🔧 [SCHEMA-CLEAN] Processing array property '${propName}':`, prop);
            
            // Always ensure items exists and is valid
            if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
              console.log(`🔧 [SCHEMA-CLEAN] Fixing array property '${propName}' - adding/fixing items`);
              prop.items = { type: 'object' };
            } else {
              console.log(`🔧 [SCHEMA-CLEAN] Array property '${propName}' already has valid items:`, prop.items);
              // Clean the existing items
              this.cleanSchemaForOpenAI(prop.items);
            }
          }
          
          // Recursively clean nested objects
          if (prop.type === 'object') {
            this.cleanSchemaForOpenAI(prop);
          }
          
          // Clean the property itself
          this.cleanSchemaForOpenAI(prop);
        }
      }
    }

    // Handle array items at the top level
    if (schema.items && typeof schema.items === 'object') {
      console.log(`🔧 [SCHEMA-CLEAN] Cleaning top-level array items`);
      this.cleanSchemaForOpenAI(schema.items);
    }
  }

  /**
   * Parse OpenAI tool calls back to MCP format
   */
  public parseOpenAIToolCalls(toolCalls: any[]): ClaraMCPToolCall[] {
    const mcpToolCalls: ClaraMCPToolCall[] = [];
    
    console.log(`🔍 [MCP-PARSE] Starting to parse ${toolCalls.length} tool calls`);
    
    for (const toolCall of toolCalls) {
      try {
        console.log(`🔍 [MCP-PARSE] Processing tool call:`, JSON.stringify(toolCall, null, 2));
        
        if (toolCall.function?.name?.startsWith('mcp_')) {
          const nameParts = toolCall.function.name.replace('mcp_', '').split('_');
          console.log(`🔍 [MCP-PARSE] Name parts:`, nameParts);
          
          if (nameParts.length >= 2) {
            const server = nameParts[0];
            const toolName = nameParts.slice(1).join('_');
            console.log(`🔍 [MCP-PARSE] Server: ${server}, Tool: ${toolName}`);
            
            // Parse arguments safely with better error handling
            let parsedArguments = {};
            try {
              const argsString = toolCall.function.arguments || '{}';
              console.log(`🔍 [MCP-PARSE] Raw arguments:`, argsString);
              console.log(`🔍 [MCP-PARSE] Arguments type:`, typeof argsString);
              
              if (typeof argsString === 'string') {
                const trimmedArgs = argsString.trim();
                console.log(`🔍 [MCP-PARSE] Trimmed arguments:`, trimmedArgs);
                
                if (trimmedArgs === '' || trimmedArgs === 'null' || trimmedArgs === 'undefined') {
                  parsedArguments = {};
                  console.log(`🔍 [MCP-PARSE] Empty/null arguments, using empty object`);
                } else {
                  parsedArguments = JSON.parse(trimmedArgs);
                  console.log(`🔍 [MCP-PARSE] Successfully parsed arguments:`, parsedArguments);
                }
              } else if (argsString && typeof argsString === 'object') {
                parsedArguments = argsString;
                console.log(`🔍 [MCP-PARSE] Using object arguments directly:`, parsedArguments);
              } else {
                parsedArguments = {};
                console.log(`🔍 [MCP-PARSE] Invalid arguments type, using empty object`);
              }
            } catch (parseError) {
              console.warn(`⚠️ Failed to parse tool arguments for ${toolCall.function.name}:`, parseError);
              console.warn(`⚠️ Raw arguments:`, toolCall.function.arguments);
              parsedArguments = {};
            }
            
            const mcpToolCall = {
              name: toolName,
              arguments: parsedArguments,
              server: server,
              callId: toolCall.id || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            console.log(`🔍 [MCP-PARSE] Created MCP tool call:`, mcpToolCall);
            mcpToolCalls.push(mcpToolCall);
          } else {
            console.warn(`⚠️ Invalid MCP tool name format: ${toolCall.function.name}`);
          }
        } else {
          console.log(`🔍 [MCP-PARSE] Skipping non-MCP tool call: ${toolCall.function?.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error parsing tool call:`, error, toolCall);
      }
    }
    
    console.log(`🔍 [MCP-PARSE] Finished parsing, created ${mcpToolCalls.length} MCP tool calls`);
    return mcpToolCalls;
  }

  /**
   * Check if MCP service is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the path to the bundled Python MCP server executable
   */
   private getPythonMCPExecutablePath(): string {
    // Use a simple path pattern - the backend will resolve the actual path
    // This pattern will be resolved by the MCP service in the backend
    return 'python-mcp-server'; // The backend will append the correct suffix
  }

  /**
   * Set up the bundled Python MCP server (replaces GitHub server)
   */
  public async setupBundledPythonMCPServer(): Promise<boolean> {
    try {
      if (!window.mcpService) {
        console.error('❌ MCP service not available in window object');
        return false;
      }

      console.log('🔧 Setting up bundled Python MCP server...');
      
      // Get the path to the bundled executable
      let executablePath: string;
      try {
        executablePath = this.getPythonMCPExecutablePath();
        console.log('📍 Python MCP executable path:', executablePath);
      } catch (pathError) {
        console.error('❌ Failed to determine Python MCP executable path:', pathError);
        return false;
      }
      
      const pythonMCPServerConfig = {
        name: 'python-mcp',
        type: 'stdio' as const,
        command: executablePath,
        args: [], // Direct executable, no arguments needed
        env: {}, // No special environment variables needed
        description: 'Bundled Python MCP Server (Clara Native)',
        enabled: true
      };

      try {
        await window.mcpService.addServer(pythonMCPServerConfig);
        console.log('✅ Python MCP server added successfully');
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log('ℹ️ Python MCP server already exists, skipping add');
        } else {
          throw error;
        }
      }

      // Try to start the server
      try {
        console.log('🚀 Attempting to start Python MCP server...');
        await window.mcpService.startServer('python-mcp');
        console.log('✅ Python MCP server started successfully');
      } catch (startError) {
        console.warn('⚠️ Failed to start Python MCP server:', startError);
        // Continue anyway - the server is configured and can be started manually
      }
      
      // Refresh our local state
      await this.refreshServers();
      await this.discoverToolsAndResources();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to setup Python MCP server:', error);
      return false;
    }
  }

  /**
   * Refresh all MCP data
   */
  public async refresh(): Promise<void> {
    await this.refreshServers();
    await this.discoverToolsAndResources();
  }

  /**
   * Get enabled and running servers with status information
   */
  public getEnabledServersStatus(): { 
    server: string; 
    enabled: boolean; 
    running: boolean; 
    status: string;
    toolCount: number;
  }[] {
    const serverStatus: { 
      server: string; 
      enabled: boolean; 
      running: boolean; 
      status: string;
      toolCount: number;
    }[] = [];

    for (const [serverName, server] of this.servers.entries()) {
      const enabled = server.config?.enabled !== false;
      const running = server.isRunning && server.status === 'running';
      const toolCount = Array.from(this.tools.values()).filter(tool => tool.server === serverName).length;
      
      serverStatus.push({
        server: serverName,
        enabled,
        running,
        status: server.status || 'unknown',
        toolCount
      });
    }

    return serverStatus;
  }

  /**
   * Get tools only from enabled and running servers
   */
  public getToolsFromEnabledServers(enabledServerNames?: string[]): ClaraMCPTool[] {
    const serverStatus = this.getEnabledServersStatus();
    
    // If specific servers are requested, filter by those
    const targetServers = enabledServerNames || 
      serverStatus.filter(s => s.enabled).map(s => s.server);
    
    console.log(`🔍 [MCP-FILTER] Target servers:`, targetServers);
    console.log(`🔍 [MCP-FILTER] Server status:`, serverStatus);
    
    const availableTools: ClaraMCPTool[] = [];
    const unavailableServers: string[] = [];
    
    for (const serverName of targetServers) {
      const status = serverStatus.find(s => s.server === serverName);
      
      if (!status) {
        console.warn(`⚠️ [MCP-FILTER] Server '${serverName}' not found`);
        unavailableServers.push(`${serverName} (not found)`);
        continue;
      }
      
      if (!status.enabled) {
        console.warn(`⚠️ [MCP-FILTER] Server '${serverName}' is disabled`);
        unavailableServers.push(`${serverName} (disabled)`);
        continue;
      }
      
      if (!status.running) {
        console.warn(`⚠️ [MCP-FILTER] Server '${serverName}' is not running (status: ${status.status})`);
        unavailableServers.push(`${serverName} (not running - ${status.status})`);
        continue;
      }
      
      // Get tools from this server
      const serverTools = Array.from(this.tools.values()).filter(tool => tool.server === serverName);
      availableTools.push(...serverTools);
      
      console.log(`✅ [MCP-FILTER] Added ${serverTools.length} tools from server '${serverName}'`);
    }
    
    if (unavailableServers.length > 0) {
      console.warn(`⚠️ [MCP-FILTER] Unavailable servers:`, unavailableServers);
    }
    
    console.log(`🔧 [MCP-FILTER] Final result: ${availableTools.length} tools from ${targetServers.length - unavailableServers.length}/${targetServers.length} servers`);
    
    return availableTools;
  }

  /**
   * Convert specific tools to OpenAI-compatible format
   */
  public convertSpecificToolsToOpenAIFormat(tools: ClaraMCPTool[]): any[] {
    console.log(`🔧 [TOOL-CONVERSION] Converting ${tools.length} specific tools`);
    
    const validatedTools: any[] = [];
    const rejectedTools: string[] = [];
    
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const toolId = `${tool.server}:${tool.name}`;
      
      try {
        console.log(`🔧 [TOOL-VALIDATION] Testing tool ${i + 1}/${tools.length}: ${toolId}`);
        
        // Try to create a valid OpenAI tool
        const openAITool = this.createOpenAITool(tool);
        
        // AGGRESSIVE FINAL FIX: Ensure all arrays have items right before validation
        this.aggressiveArrayFix(openAITool);
        
        // FINAL VALIDATION: Check the exact schema that will be sent to OpenAI
        const finalValidation = this.validateFinalOpenAITool(openAITool, toolId);
        if (!finalValidation.isValid) {
          rejectedTools.push(`${toolId} (${finalValidation.reason})`);
          console.error(`❌ [FINAL-VALIDATION] Tool ${toolId} failed final validation: ${finalValidation.reason}`);
          continue;
        }
        
        // Test if it passes OpenAI validation
        if (this.isValidOpenAITool(openAITool)) {
          validatedTools.push(openAITool);
          console.log(`✅ [TOOL-VALIDATION] Tool ${toolId} passed validation`);
        } else {
          rejectedTools.push(toolId);
          console.warn(`❌ [TOOL-VALIDATION] Tool ${toolId} failed validation - excluding from request`);
        }
        
      } catch (error) {
        rejectedTools.push(toolId);
        console.error(`❌ [TOOL-VALIDATION] Tool ${toolId} threw error during validation:`, error);
      }
    }
    
    console.log(`✅ [TOOL-CONVERSION] Validation complete:`);
    console.log(`   - Valid tools: ${validatedTools.length}`);
    console.log(`   - Rejected tools: ${rejectedTools.length}`);
    
    if (rejectedTools.length > 0) {
      console.warn(`⚠️ [TOOL-CONVERSION] Rejected tools:`, rejectedTools);
    }
    
    // Log the final valid tools (but only names to avoid spam)
    const validToolNames = validatedTools.map(t => t.function.name);
    console.log(`🔧 [TOOL-CONVERSION] Final valid tools:`, validToolNames);
    
    // FINAL DEBUG: Log the exact schemas being sent to OpenAI for array-containing tools
    console.log(`🔍 [FINAL-DEBUG] Checking final schemas for array properties...`);
    for (const tool of validatedTools) {
      const toolName = tool.function.name;
      if (tool.function.parameters?.properties) {
        for (const [propName, propSchema] of Object.entries(tool.function.parameters.properties)) {
          const prop = propSchema as any;
          if (prop?.type === 'array') {
            console.log(`🔍 [FINAL-DEBUG] Tool ${toolName}, array property '${propName}':`, {
              type: prop.type,
              hasItems: !!prop.items,
              items: prop.items,
              fullProperty: prop
            });
          }
        }
      }
    }
    
    return validatedTools;
  }

  /**
   * Final validation check for OpenAI tools
   */
  private validateFinalOpenAITool(tool: any, toolId: string): { isValid: boolean; reason?: string } {
    try {
      // Check for additionalProperties anywhere in the schema
      const hasAdditionalProperties = this.findAdditionalProperties(tool.function.parameters);
      if (hasAdditionalProperties.found) {
        return { 
          isValid: false, 
          reason: `additionalProperties found at: ${hasAdditionalProperties.path}` 
        };
      }

      // Check for array properties without items
      const missingItems = this.findArraysWithoutItems(tool.function.parameters);
      if (missingItems.found) {
        return { 
          isValid: false, 
          reason: `array missing items at: ${missingItems.path}` 
        };
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        reason: `validation error: ${error instanceof Error ? error.message : 'unknown'}` 
      };
    }
  }

  /**
   * Recursively find any additionalProperties in the schema
   */
  private findAdditionalProperties(schema: any, path: string = 'root'): { found: boolean; path?: string } {
    if (!schema || typeof schema !== 'object') {
      return { found: false };
    }

    if (schema.additionalProperties !== undefined) {
      return { found: true, path };
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const result = this.findAdditionalProperties(propSchema, `${path}.properties.${propName}`);
        if (result.found) {
          return result;
        }
      }
    }

    if (schema.items) {
      const result = this.findAdditionalProperties(schema.items, `${path}.items`);
      if (result.found) {
        return result;
      }
    }

    return { found: false };
  }

  /**
   * Recursively find any arrays without items
   */
  private findArraysWithoutItems(schema: any, path: string = 'root'): { found: boolean; path?: string } {
    if (!schema || typeof schema !== 'object') {
      return { found: false };
    }

    if (schema.type === 'array' && (!schema.items || typeof schema.items !== 'object' || !schema.items.type)) {
      return { found: true, path };
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const result = this.findArraysWithoutItems(propSchema, `${path}.properties.${propName}`);
        if (result.found) {
          return result;
        }
      }
    }

    if (schema.items) {
      const result = this.findArraysWithoutItems(schema.items, `${path}.items`);
      if (result.found) {
        return result;
      }
    }

    return { found: false };
  }

  /**
   * Get server availability summary for UI feedback
   */
  public getServerAvailabilitySummary(requestedServers?: string[]): {
    available: string[];
    unavailable: { server: string; reason: string }[];
    totalTools: number;
  } {
    const serverStatus = this.getEnabledServersStatus();
    const targetServers = requestedServers || 
      serverStatus.filter(s => s.enabled).map(s => s.server);
    
    const available: string[] = [];
    const unavailable: { server: string; reason: string }[] = [];
    let totalTools = 0;
    
    for (const serverName of targetServers) {
      const status = serverStatus.find(s => s.server === serverName);
      
      if (!status) {
        unavailable.push({ server: serverName, reason: 'Server not found' });
      } else if (!status.enabled) {
        unavailable.push({ server: serverName, reason: 'Server disabled in configuration' });
      } else if (!status.running) {
        unavailable.push({ server: serverName, reason: `Server not running (${status.status})` });
      } else {
        available.push(serverName);
        totalTools += status.toolCount;
      }
    }
    
    return { available, unavailable, totalTools };
  }

  /**
   * Get detailed tool breakdown by server for UI feedback
   */
  public getToolBreakdownByServer(requestedServers?: string[]): {
    serverName: string;
    status: 'available' | 'unavailable';
    reason?: string;
    tools: { name: string; description: string }[];
  }[] {
    const serverStatus = this.getEnabledServersStatus();
    const targetServers = requestedServers || 
      serverStatus.filter(s => s.enabled).map(s => s.server);
    
    const breakdown: {
      serverName: string;
      status: 'available' | 'unavailable';
      reason?: string;
      tools: { name: string; description: string }[];
    }[] = [];
    
    for (const serverName of targetServers) {
      const status = serverStatus.find(s => s.server === serverName);
      
      if (!status) {
        breakdown.push({
          serverName,
          status: 'unavailable',
          reason: 'Server not found',
          tools: []
        });
      } else if (!status.enabled) {
        breakdown.push({
          serverName,
          status: 'unavailable',
          reason: 'Server disabled in configuration',
          tools: []
        });
      } else if (!status.running) {
        breakdown.push({
          serverName,
          status: 'unavailable',
          reason: `Server not running (${status.status})`,
          tools: []
        });
      } else {
        // Get tools from this server
        const serverTools = Array.from(this.tools.values())
          .filter(tool => tool.server === serverName)
          .map(tool => ({
            name: tool.name,
            description: tool.description
          }));
        
        breakdown.push({
          serverName,
          status: 'available',
          tools: serverTools
        });
      }
    }
    
    return breakdown;
  }

  /**
   * Aggressive final fix for OpenAI tools
   */
  private aggressiveArrayFix(tool: any): void {
    if (!tool || typeof tool !== 'object') {
      return;
    }

    if (tool.function && tool.function.parameters) {
      const parameters = tool.function.parameters;
      if (parameters.properties) {
        for (const propName in parameters.properties) {
          const prop = parameters.properties[propName];
          if (prop && typeof prop === 'object' && prop.type === 'array') {
            if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
              console.log(`🔧 [AGGRESSIVE-FIX] Fixing array property '${propName}' - adding/fixing items`);
              prop.items = { type: 'object' };
            }
          }
        }
      }
    }
  }

  /**
   * Final safety check for OpenAI tools
   */
  private finalArraySafetyCheck(tool: any, toolId: string): void {
    if (!tool || typeof tool !== 'object') {
      return;
    }

    if (tool.function && tool.function.parameters) {
      const parameters = tool.function.parameters;
      if (parameters.properties) {
        for (const propName in parameters.properties) {
          const prop = parameters.properties[propName];
          if (prop && typeof prop === 'object' && prop.type === 'array') {
            if (!prop.items || typeof prop.items !== 'object' || !prop.items.type) {
              console.log(`🔧 [FINAL-SAFETY-CHECK] Fixing array property '${propName}' - adding/fixing items`);
              prop.items = { type: 'object' };
            }
          }
        }
      }
    }
  }

  /**
   * Find the best matching tool using fuzzy matching algorithms
   * Uses multiple similarity measures for robust matching
   */
  private findBestToolMatch(targetServer: string, targetToolName: string): {
    tool: ClaraMCPTool;
    toolKey: string;
    confidence: number;
  } | null {
    console.log(`🎯 [MCP-FUZZY] Starting fuzzy match for: ${targetServer}:${targetToolName}`);
    
    const availableTools = Array.from(this.tools.entries());
    const candidates: Array<{
      toolKey: string;
      tool: ClaraMCPTool;
      confidence: number;
      reasons: string[];
    }> = [];

    const targetFullName = `${targetServer}:${targetToolName}`;
    
    for (const [toolKey, tool] of availableTools) {
      const confidence = this.calculateToolSimilarity(targetFullName, toolKey, targetServer, targetToolName);
      
      if (confidence.total > 0.5) { // Only consider matches with >50% confidence
        candidates.push({
          toolKey,
          tool,
          confidence: confidence.total,
          reasons: confidence.reasons
        });
      }
    }

    if (candidates.length === 0) {
      console.log(`🎯 [MCP-FUZZY] No suitable fuzzy matches found (all below 50% confidence)`);
      return null;
    }

    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    const bestMatch = candidates[0];
    
    // Only use matches with high confidence (>70%) to avoid false positives
    if (bestMatch.confidence < 0.7) {
      console.log(`🎯 [MCP-FUZZY] Best match confidence too low: ${bestMatch.confidence.toFixed(3)} < 0.7`);
      console.log(`🎯 [MCP-FUZZY] Top candidates:`, candidates.slice(0, 3).map(c => ({
        key: c.toolKey,
        confidence: c.confidence.toFixed(3),
        reasons: c.reasons
      })));
      return null;
    }

    console.log(`🎯 [MCP-FUZZY] Selected best match: ${bestMatch.toolKey} (confidence: ${bestMatch.confidence.toFixed(3)})`);
    console.log(`🎯 [MCP-FUZZY] Match reasons:`, bestMatch.reasons);
    
    return {
      tool: bestMatch.tool,
      toolKey: bestMatch.toolKey,
      confidence: bestMatch.confidence
    };
  }

  /**
   * Calculate similarity between target tool and candidate using multiple algorithms
   */
  private calculateToolSimilarity(
    targetFullName: string,
    candidateKey: string,
    targetServer: string,
    targetToolName: string
  ): { total: number; reasons: string[] } {
    const reasons: string[] = [];
    let totalScore = 0;
    let weightSum = 0;

    // Parse candidate key
    const [candidateServer, candidateToolName] = candidateKey.split(':', 2);
    const candidateFullName = candidateKey;

    // 1. Exact server name match (high weight)
    const serverWeight = 0.4;
    if (targetServer === candidateServer) {
      totalScore += serverWeight * 1.0;
      reasons.push(`exact_server_match`);
    } else {
      const serverSimilarity = this.calculateStringSimilarity(targetServer, candidateServer);
      if (serverSimilarity > 0.8) {
        totalScore += serverWeight * serverSimilarity;
        reasons.push(`server_similarity_${serverSimilarity.toFixed(2)}`);
      }
    }
    weightSum += serverWeight;

    // 2. Tool name similarity (high weight)
    const toolNameWeight = 0.4;
    if (targetToolName === candidateToolName) {
      totalScore += toolNameWeight * 1.0;
      reasons.push(`exact_tool_match`);
    } else {
      const toolSimilarity = this.calculateStringSimilarity(targetToolName, candidateToolName);
      if (toolSimilarity > 0.6) {
        totalScore += toolNameWeight * toolSimilarity;
        reasons.push(`tool_similarity_${toolSimilarity.toFixed(2)}`);
      }
    }
    weightSum += toolNameWeight;

    // 3. Full name similarity (medium weight)
    const fullNameWeight = 0.2;
    const fullNameSimilarity = this.calculateStringSimilarity(targetFullName, candidateFullName);
    if (fullNameSimilarity > 0.5) {
      totalScore += fullNameWeight * fullNameSimilarity;
      reasons.push(`full_name_similarity_${fullNameSimilarity.toFixed(2)}`);
    }
    weightSum += fullNameWeight;

    // 4. Handle common naming pattern mismatches
    const patternBonus = this.calculatePatternBonus(targetServer, targetToolName, candidateServer, candidateToolName);
    if (patternBonus > 0) {
      totalScore += patternBonus;
      reasons.push(`pattern_bonus_${patternBonus.toFixed(2)}`);
    }

    const normalizedScore = weightSum > 0 ? totalScore / weightSum : 0;
    
    return {
      total: Math.min(1.0, normalizedScore + patternBonus), // Cap at 1.0
      reasons
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance and other metrics
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0;

    // Normalize strings (lowercase, remove underscores/hyphens for comparison)
    const norm1 = str1.toLowerCase().replace(/[_-]/g, '');
    const norm2 = str2.toLowerCase().replace(/[_-]/g, '');
    
    if (norm1 === norm2) return 0.95; // Very high but not perfect due to formatting difference

    // Levenshtein distance-based similarity
    const levenshteinSim = this.levenshteinSimilarity(norm1, norm2);
    
    // Substring containment bonus
    const containmentBonus = this.calculateContainmentBonus(norm1, norm2);
    
    // Common prefix/suffix bonus
    const affixBonus = this.calculateAffixBonus(norm1, norm2);

    return Math.min(1.0, levenshteinSim + containmentBonus + affixBonus);
  }

  /**
   * Calculate Levenshtein distance-based similarity
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,         // deletion
          matrix[j - 1][i] + 1,         // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate containment bonus (one string contains the other)
   */
  private calculateContainmentBonus(str1: string, str2: string): number {
    if (str1.includes(str2) || str2.includes(str1)) {
      const minLength = Math.min(str1.length, str2.length);
      const maxLength = Math.max(str1.length, str2.length);
      return 0.3 * (minLength / maxLength); // Bonus proportional to containment ratio
    }
    return 0;
  }

  /**
   * Calculate bonus for common prefix/suffix
   */
  private calculateAffixBonus(str1: string, str2: string): number {
    let prefixLength = 0;
    let suffixLength = 0;
    
    // Calculate common prefix length
    const minLength = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLength; i++) {
      if (str1[i] === str2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }
    
    // Calculate common suffix length
    for (let i = 1; i <= minLength - prefixLength; i++) {
      if (str1[str1.length - i] === str2[str2.length - i]) {
        suffixLength++;
      } else {
        break;
      }
    }
    
    const totalCommon = prefixLength + suffixLength;
    const maxLength = Math.max(str1.length, str2.length);
    
    return totalCommon > 0 ? 0.2 * (totalCommon / maxLength) : 0;
  }

  /**
   * Calculate bonus for handling common naming pattern mismatches
   */
  private calculatePatternBonus(
    targetServer: string,
    targetToolName: string,
    candidateServer: string,
    candidateToolName: string
  ): number {
    let bonus = 0;

    // Handle MCP/MCP_DOCKER server name patterns
    if ((targetServer === 'MCP' && candidateServer === 'MCP_DOCKER') ||
        (targetServer === 'MCP_DOCKER' && candidateServer === 'MCP')) {
      // Check if tool names are complementary
      if (targetToolName.includes('DOCKER') || candidateToolName.includes('search') ||
          targetToolName === 'DOCKER_search' && candidateToolName === 'search') {
        bonus += 0.3;
      }
    }

    // Handle underscore vs. no underscore in server names
    const normalizedTarget = targetServer.replace(/[_-]/g, '');
    const normalizedCandidate = candidateServer.replace(/[_-]/g, '');
    if (normalizedTarget === normalizedCandidate && normalizedTarget !== targetServer) {
      bonus += 0.2;
    }

    // Handle tool name pattern variations (e.g., DOCKER_search vs search)
    if (targetToolName.includes('_') || candidateToolName.includes('_')) {
      const targetParts = targetToolName.split('_');
      const candidateParts = candidateToolName.split('_');
      
      // Check if one is a subset of the other
      const targetSet = new Set(targetParts.map(p => p.toLowerCase()));
      const candidateSet = new Set(candidateParts.map(p => p.toLowerCase()));
      
      const intersection = new Set([...targetSet].filter(x => candidateSet.has(x)));
      const union = new Set([...targetSet, ...candidateSet]);
      
      if (intersection.size > 0) {
        bonus += 0.1 * (intersection.size / union.size);
      }
    }

    return Math.min(0.4, bonus); // Cap pattern bonus at 0.4
  }
}

/**
 * Singleton instance of the Clara MCP Service
 */
export const claraMCPService = new ClaraMCPService(); 