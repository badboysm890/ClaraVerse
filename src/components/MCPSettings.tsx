import React, { useState, useEffect } from 'react';
import { Server, Upload, Plus, Check, X, Edit3, RotateCcw, Square, Play, AlertCircle, CheckCircle, FileText, Trash2, Search, Filter, Star, Tag } from 'lucide-react';

// MCP Types
interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'remote';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  description?: string;
  enabled?: boolean;
}

interface MCPServerInfo {
  process?: any;
  name: string;
  config: MCPServerConfig;
  startedAt: Date;
  status: 'starting' | 'running' | 'error' | 'stopped';
  error?: string;
}

interface MCPServerStatus {
  name: string;
  config: MCPServerConfig;
  isRunning: boolean;
  status: 'starting' | 'running' | 'error' | 'stopped';
  startedAt?: Date;
  error?: string;
  pid?: number;
}

interface MCPServer {
  name: string;
  config: MCPServerConfig;
  isRunning: boolean;
  status: 'starting' | 'running' | 'error' | 'stopped';
  startedAt?: Date;
  error?: string;
  pid?: number;
}

interface MCPServerTemplate {
  name: string;
  displayName: string;
  description: string;
  command?: string;
  args?: string[];
  type: 'stdio' | 'remote';
  category: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  icon?: string;
  popularity?: 'high' | 'medium' | 'low';
}

const MCPSettings: React.FC = () => {
  // MCP state
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpTemplates, setMcpTemplates] = useState<MCPServerTemplate[]>([]);
  const [isLoadingMcp, setIsLoadingMcp] = useState(true);
  const [showAddMcpModal, setShowAddMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<MCPServer | null>(null);
  const [showDeleteMcpConfirm, setShowDeleteMcpConfirm] = useState<string | null>(null);
  const [testingMcpServer, setTestingMcpServer] = useState<string | null>(null);
  const [mcpTestResults, setMcpTestResults] = useState<{ [key: string]: { 
    status: 'success' | 'error' | null;
    tools?: Array<{ name: string; description?: string; inputSchema?: any }>;
    resources?: Array<{ uri: string; name?: string }>;
    error?: string;
  } }>({});
  const [newMcpServerForm, setNewMcpServerForm] = useState({
    name: '',
    type: 'stdio' as 'stdio' | 'remote',
    command: '',
    args: [] as string[],
    env: {} as Record<string, string>,
    url: '',
    headers: {} as Record<string, string>,
    description: '',
    enabled: true
  });

  // Node.js diagnosis state
  const [nodeDiagnosis, setNodeDiagnosis] = useState<{
    nodeAvailable: boolean;
    npmAvailable: boolean;
    npxAvailable: boolean;
    nodePath?: string | null;
    npmPath?: string | null;
    npxPath?: string | null;
    pathDirs: string[];
    suggestions: string[];
  } | null>(null);
  const [isRunningDiagnosis, setIsRunningDiagnosis] = useState(false);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  
  // MCP sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<'servers' | 'templates' | 'diagnosis'>('servers');
  
  // Templates UI state
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPopularity, setSelectedPopularity] = useState<string>('All');
  const [templateViewMode, setTemplateViewMode] = useState<'grid' | 'list'>('grid');
  
  // JSON import state
  const [showJsonImportModal, setShowJsonImportModal] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [isImportingJson, setIsImportingJson] = useState(false);
      
      // Add timeout configuration for better debugging
      const MCP_TIMEOUT = 15000; // 15 seconds

  // Load MCP servers and templates
  useEffect(() => {
    const loadMcpData = async () => {
      if (!window.mcpService) return;
      
      setIsLoadingMcp(true);
      try {
        const [servers, templates] = await Promise.all([
          window.mcpService.getServers(),
          window.mcpService.getTemplates()
        ]);
        
        setMcpServers(servers);
        setMcpTemplates(templates);
      } catch (error) {
        console.error('Error loading MCP data:', error);
      } finally {
        setIsLoadingMcp(false);
      }
    };

    loadMcpData();
  }, []);

  // MCP management functions
  const handleAddMcpServer = async () => {
    if (!window.mcpService) return;
    
    try {
      await window.mcpService.addServer(newMcpServerForm);
      
      // Refresh servers list
      const servers = await window.mcpService.getServers();
      setMcpServers(servers);
      
      setShowAddMcpModal(false);
      setNewMcpServerForm({
        name: '',
        type: 'stdio',
        command: '',
        args: [],
        env: {},
        url: '',
        headers: {},
        description: '',
        enabled: true
      });
    } catch (error) {
      console.error('Error adding MCP server:', error);
      alert('Failed to add MCP server. Please try again.');
    }
  };

  const handleEditMcpServer = (server: MCPServer) => {
    setEditingMcpServer(server);
    setNewMcpServerForm({
      name: server.name,
      type: server.config.type,
      command: server.config.command || '',
      args: server.config.args || [],
      env: server.config.env || {},
      url: server.config.url || '',
      headers: server.config.headers || {},
      description: server.config.description || '',
      enabled: server.config.enabled !== false
    });
    setShowAddMcpModal(true);
  };

  const handleUpdateMcpServer = async () => {
    if (!editingMcpServer || !window.mcpService) return;
    
    try {
      await window.mcpService.updateServer(editingMcpServer.name, newMcpServerForm);
      
      // Refresh servers list
      const servers = await window.mcpService.getServers();
      setMcpServers(servers);
      
      setShowAddMcpModal(false);
      setEditingMcpServer(null);
      setNewMcpServerForm({
        name: '',
        type: 'stdio',
        command: '',
        args: [],
        env: {},
        url: '',
        headers: {},
        description: '',
        enabled: true
      });
    } catch (error) {
      console.error('Error updating MCP server:', error);
      alert('Failed to update MCP server. Please try again.');
    }
  };

  const handleDeleteMcpServer = async (name: string) => {
    if (!window.mcpService) return;
    
    try {
      await window.mcpService.removeServer(name);
      
      // Refresh servers list
      const servers = await window.mcpService.getServers();
      setMcpServers(servers);
      
      setShowDeleteMcpConfirm(null);
    } catch (error) {
      console.error('Error deleting MCP server:', error);
      setShowDeleteMcpConfirm(null);
      
      // Show user-friendly error message
      if (error instanceof Error && error.message.includes("Clara's Python MCP server cannot be deleted")) {
        alert("❌ Clara's Python MCP server cannot be deleted as it is a system-required component that ensures the application functions properly.");
      } else {
        alert('Failed to delete MCP server. Please try again.');
      }
    }
  };

  const handleMcpServerAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    if (!window.mcpService) return;
    
    try {
      switch (action) {
        case 'start':
          await window.mcpService.startServer(name);
          break;
        case 'stop':
          await window.mcpService.stopServer(name);
          break;
        case 'restart':
          await window.mcpService.restartServer(name);
          break;
      }
      
      // Refresh servers list
      const servers = await window.mcpService.getServers();
      setMcpServers(servers);
      
      // Save the current running state after any server action
      try {
        await window.mcpService.saveRunningState();
      } catch (saveError) {
        console.warn('Failed to save running state:', saveError);
      }
    } catch (error) {
      console.error(`Error ${action}ing MCP server:`, error);
      alert(`Failed to ${action} MCP server. Please try again.`);
    }
  };

  const testMcpServer = async (name: string) => {
    if (!window.mcpService) return;
    
    setTestingMcpServer(name);
    setMcpTestResults(prev => ({ ...prev, [name]: { status: null } }));
    
    try {
      // First, check if the server is running
      const serverStatus = await window.mcpService.getServerStatus(name);
      let needsStart = !serverStatus?.isRunning;
      
      // If server is not running, try to start it temporarily for testing
      if (needsStart) {
        try {
          await window.mcpService.startServer(name);
          // Give it a moment to start
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (startError) {
          setMcpTestResults(prev => ({ 
            ...prev, 
            [name]: { 
              status: 'error', 
              error: `Failed to start server: ${startError instanceof Error ? startError.message : 'Unknown error'}` 
            } 
          }));
          return;
        }
      }

      // Now try to discover tools by executing a tools/list call
      try {
        const toolsResult = await window.mcpService.executeToolCall({
          server: name,
          name: 'tools/list',
          arguments: {},
          callId: `test-${Date.now()}`
        });

        console.log('Full tools result:', JSON.stringify(toolsResult, null, 2)); // Enhanced debug log

        // Check if tools/list request failed
        if (!toolsResult.success) {
          console.log('Tools listing failed:', toolsResult.error);
          setMcpTestResults(prev => ({ 
            ...prev, 
            [name]: { 
              status: 'error',
              error: `Tool listing failed: ${toolsResult.error || 'Unknown error'}`
            } 
          }));
          return; // Don't continue with basic test if tools/list specifically failed
        }

        // Try multiple possible response structures
        let tools = null;
        
        if (toolsResult.success) {
          // Check various possible nested structures
          if (toolsResult.content && toolsResult.content[0]?.data) {
            tools = toolsResult.content[0].data;
            console.log('Found tools in content[0].data:', tools);
          } else if (toolsResult.result?.result?.tools) {
            tools = toolsResult.result.result.tools;
            console.log('Found tools in result.result.tools:', tools);
          } else if (toolsResult.result?.tools) {
            tools = toolsResult.result.tools;
            console.log('Found tools in result.tools:', tools);
          } else if (toolsResult.tools) {
            tools = toolsResult.tools;
            console.log('Found tools in direct tools:', tools);
          } else {
            console.log('No tools found in response structure');
          }
        }

        if (tools && Array.isArray(tools) && tools.length > 0) {
          console.log('Setting tools in state:', tools);
          setMcpTestResults(prev => ({ 
            ...prev, 
            [name]: { 
              status: 'success', 
              tools: tools.map((tool: any) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
              }))
            } 
          }));
        } else {
          console.log('Tools listed successfully but no tools returned - empty server');
          setMcpTestResults(prev => ({ 
            ...prev, 
            [name]: { 
              status: 'success',
              tools: [],
              error: 'Server responded successfully but provides no tools'
            } 
          }));
        }
      } catch (toolsError) {
        console.error('Exception during tools listing:', toolsError);
        setMcpTestResults(prev => ({ 
          ...prev, 
          [name]: { 
            status: 'error',
            error: `Tool listing failed: ${toolsError instanceof Error ? toolsError.message : 'Unknown error'}`
          } 
        }));
      }

      // If we started the server for testing, stop it again
      if (needsStart) {
        try {
          await window.mcpService.stopServer(name);
        } catch (stopError) {
          console.warn('Failed to stop server after testing:', stopError);
        }
      }

    } catch (error) {
      setMcpTestResults(prev => ({ 
        ...prev, 
        [name]: { 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        } 
      }));
      console.error('MCP server test failed:', error);
    } finally {
      setTestingMcpServer(null);
      
      // Clear test results after 10 seconds (longer to see tools)
      setTimeout(() => {
        setMcpTestResults(prev => ({ ...prev, [name]: { status: null } }));
      }, 10000);
    }
  };

  const handleImportClaudeConfig = async () => {
    if (!window.mcpService) return;
    
    try {
      // Open file dialog
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          try {
            const text = await file.text();
            const config = JSON.parse(text);
            
            // Import the config
            const result = await window.mcpService!.importClaudeConfig(file.path);
            
            if (result.imported > 0) {
              alert(`Successfully imported ${result.imported} MCP servers from Claude Desktop config.`);
              
              // Refresh servers list
              const servers = await window.mcpService!.getServers();
              setMcpServers(servers);
            } else {
              alert('No new servers were imported. They may already exist.');
            }
            
            if (result.errors.length > 0) {
              console.warn('Import errors:', result.errors);
            }
          } catch (error) {
            console.error('Error importing Claude config:', error);
            alert('Failed to import Claude Desktop config. Please check the file format.');
          }
        }
      };
      input.click();
    } catch (error) {
      console.error('Error importing Claude config:', error);
      alert('Failed to import Claude Desktop config.');
    }
  };

  const handleJsonImport = async () => {
    if (!window.mcpService || !jsonImportText.trim()) return;
    
    setIsImportingJson(true);
    try {
      const config = JSON.parse(jsonImportText);
      
      // Validate the JSON structure
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        throw new Error('Invalid JSON format. Expected "mcpServers" object at root level.');
      }
      
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      // Import each server
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const mcpServerConfig = serverConfig as any;
          
          // Check if server already exists
          const existingServers = await window.mcpService.getServers();
          if (existingServers.some((s: MCPServer) => s.name === serverName)) {
            skipped++;
            continue;
          }
          
          // Convert to our format
          const newServerConfig = {
            name: serverName,
            type: 'stdio' as const,
            command: mcpServerConfig.command || '',
            args: mcpServerConfig.args || [],
            env: mcpServerConfig.env || {},
            description: mcpServerConfig.description || `Imported server: ${serverName}`,
            enabled: mcpServerConfig.enabled !== false
          };
          
          await window.mcpService.addServer(newServerConfig);
          imported++;
        } catch (error) {
          errors.push(`Failed to import ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Show results
      let message = `Import completed!\n`;
      if (imported > 0) message += `✅ Successfully imported: ${imported} servers\n`;
      if (skipped > 0) message += `⚠️ Skipped (already exist): ${skipped} servers\n`;
      if (errors.length > 0) message += `❌ Failed: ${errors.length} servers\n\nErrors:\n${errors.join('\n')}`;
      
      alert(message);
      
      // Refresh servers list
      const servers = await window.mcpService.getServers();
      setMcpServers(servers);
      
      // Close modal and clear text
      setShowJsonImportModal(false);
      setJsonImportText('');
      
    } catch (error) {
      console.error('Error importing JSON:', error);
      alert(`Failed to import JSON: ${error instanceof Error ? error.message : 'Invalid JSON format'}`);
    } finally {
      setIsImportingJson(false);
    }
  };

  const addMcpServerFromTemplate = (template: MCPServerTemplate) => {
    setNewMcpServerForm({
      name: template.name,
      type: template.type,
      command: template.command || '',
      args: template.args || [],
      env: template.env || {},
      url: template.url || '',
      headers: template.headers || {},
      description: template.description,
      enabled: true
    });
    setShowAddMcpModal(true);
  };

  // Run Node.js diagnosis
  const runNodeDiagnosis = async () => {
    if (!window.mcpService) return;
    
    setIsRunningDiagnosis(true);
    try {
      const diagnosis = await window.mcpService.diagnoseNode();
      setNodeDiagnosis(diagnosis);
      setShowDiagnosis(true);
    } catch (error) {
      console.error('Error running Node.js diagnosis:', error);
    } finally {
      setIsRunningDiagnosis(false);
    }
  };

  return (
    <div className="space-y-6 min-h-0">
      {/* MCP Header */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Server className="w-6 h-6 text-sakura-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Model Context Protocol (MCP)
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage MCP servers, templates, and system diagnostics
            </p>
          </div>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveSubTab('servers')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSubTab === 'servers'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Server className="w-4 h-4" />
              Servers
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('templates')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSubTab === 'templates'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              Templates
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab('diagnosis')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeSubTab === 'diagnosis'
                ? 'bg-sakura-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Diagnosis
            </div>
          </button>
        </div>
      </div>

      {/* Servers Tab */}
      {activeSubTab === 'servers' && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Server className="w-6 h-6 text-sakura-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  MCP Servers
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manage your Model Context Protocol servers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJsonImportModal(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import JSON
              </button>
              <button
                onClick={() => {
                  setEditingMcpServer(null);
                  setNewMcpServerForm({
                    name: '',
                    type: 'stdio',
                    command: '',
                    args: [],
                    env: {},
                    url: '',
                    headers: {},
                    description: '',
                    enabled: true
                  });
                  setShowAddMcpModal(true);
                }}
                className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Server
              </button>
            </div>
          </div>

          {/* MCP Servers List */}
          {isLoadingMcp ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sakura-500"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {mcpServers.length > 0 ? (
                mcpServers.map((server) => (
                  <div
                    key={server.name}
                    className={`p-4 rounded-lg border transition-all ${
                      server.isRunning 
                        ? 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-900/10 shadow-sm' 
                        : 'border-gray-200 dark:border-gray-700 bg-white/30 dark:bg-gray-800/30'
                    } hover:bg-white/50 dark:hover:bg-gray-800/50`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          server.isRunning 
                            ? 'bg-green-500' 
                            : server.config.enabled 
                            ? 'bg-sakura-500' 
                            : 'bg-gray-400 dark:bg-gray-600'
                        }`}>
                          <Server className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {server.name}
                            </h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              server.status === 'running' 
                                ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                                : server.status === 'error'
                                ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}>
                              {server.status}
                            </span>
                            {!server.config.enabled && (
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {server.config.description || 'No description'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 font-mono">
                            {server.config.type === 'stdio' 
                              ? `${server.config.command} ${(server.config.args || []).join(' ')}`
                              : server.config.url
                            }
                          </p>
                          {server.error && (
                            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                              Error: {server.error}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Server Controls */}
                        {server.isRunning ? (
                          <>
                            <button
                              onClick={() => handleMcpServerAction(server.name, 'restart')}
                              className="p-2 text-sakura-500 hover:text-sakura-700 dark:text-sakura-400 dark:hover:text-sakura-300 transition-colors"
                              title="Restart server"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMcpServerAction(server.name, 'stop')}
                              className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                              title="Stop server"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleMcpServerAction(server.name, 'start')}
                            disabled={!server.config.enabled}
                            className="p-2 text-sakura-500 hover:text-sakura-700 dark:text-sakura-400 dark:hover:text-sakura-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Start server"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Test Button */}
                        <button
                          onClick={() => testMcpServer(server.name)}
                          disabled={testingMcpServer === server.name}
                          className={`px-3 py-1 text-sm rounded transition-colors disabled:opacity-50 flex items-center gap-1 ${
                            mcpTestResults[server.name]?.status === 'success' 
                              ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-600'
                              : mcpTestResults[server.name]?.status === 'error'
                              ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-600'
                              : 'bg-sakura-100 dark:bg-sakura-800 text-sakura-700 dark:text-sakura-300 hover:bg-sakura-200 dark:hover:bg-sakura-700'
                          }`}
                        >
                          {testingMcpServer === server.name ? (
                            <>
                              <div className="w-3 h-3 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin"></div>
                              Testing...
                            </>
                          ) : mcpTestResults[server.name]?.status === 'success' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              {mcpTestResults[server.name]?.tools?.length ? 
                                `${mcpTestResults[server.name]?.tools?.length} Tools` : 
                                'Available'
                              }
                            </>
                          ) : mcpTestResults[server.name]?.status === 'error' ? (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3" />
                              Test
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={() => handleEditMcpServer(server)}
                          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                          title="Edit server"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        
                        {/* Hide delete button for Clara's core python-mcp server */}
                        {server.name !== 'python-mcp' && (
                          <button
                            onClick={() => setShowDeleteMcpConfirm(server.name)}
                            className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                            title="Delete server"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tools List - Show when test results include tools */}
                    {(mcpTestResults[server.name]?.tools?.length ?? 0) > 0 && (
                      <div className="mt-4 p-4 bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <h5 className="text-sm font-medium text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Available Tools ({mcpTestResults[server.name]?.tools?.length || 0})
                        </h5>
                        <div className="space-y-3">
                          {(mcpTestResults[server.name]?.tools || []).map((tool, index) => (
                            <div key={index} className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 border border-green-200/50 dark:border-green-700/50">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-white text-xs font-bold">🔧</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h6 className="font-mono text-sm font-semibold text-green-700 dark:text-green-400">
                                      {tool.name}
                                    </h6>
                                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 text-xs rounded-full">
                                      Tool
                                    </span>
                                  </div>
                                  {tool.description && (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 leading-relaxed">
                                      {tool.description}
                                    </p>
                                  )}
                                  
                                  {/* Input Schema */}
                                  {tool.inputSchema && (
                                    <div className="mt-2">
                                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                                        Parameters:
                                      </span>
                                      <div className="bg-gray-50/80 dark:bg-gray-900/40 rounded-md p-2 border border-gray-200/50 dark:border-gray-700/50">
                                        {tool.inputSchema.properties ? (
                                          <div className="space-y-1">
                                            {Object.entries(tool.inputSchema.properties).map(([paramName, paramDef]: [string, any]) => (
                                              <div key={paramName} className="flex items-start gap-2 text-xs">
                                                <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                                                  {paramName}
                                                </span>
                                                <span className="text-gray-500 dark:text-gray-400">
                                                  ({paramDef.type || 'any'})
                                                </span>
                                                {tool.inputSchema.required?.includes(paramName) && (
                                                  <span className="text-red-500 text-xs">*</span>
                                                )}
                                                {paramDef.description && (
                                                  <span className="text-gray-600 dark:text-gray-300 flex-1">
                                                    - {paramDef.description}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                            {tool.inputSchema.required && tool.inputSchema.required.length > 0 && (
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                                                * Required parameters
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-gray-500 dark:text-gray-400">
                                            No parameters required
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Error Display - Show when test fails */}
                    {mcpTestResults[server.name]?.status === 'error' && mcpTestResults[server.name]?.error && (
                      <div className="mt-4 p-3 bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <h5 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Test Failed
                        </h5>
                        <p className="text-sm text-red-700 dark:text-red-400">{mcpTestResults[server.name]?.error}</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Server className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No MCP servers configured</h4>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Add MCP servers to extend AI capabilities with external tools and data sources
                  </p>
                  <button 
                    onClick={() => setShowAddMcpModal(true)}
                    className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors"
                  >
                    Add Your First Server
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Node.js Diagnosis Section */}
      {activeSubTab === 'diagnosis' && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-sakura-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Node.js Diagnosis
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Check if Node.js and npm are properly installed for MCP servers
                </p>
              </div>
            </div>
            <button
              onClick={runNodeDiagnosis}
              disabled={isRunningDiagnosis}
              className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isRunningDiagnosis ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Running...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Run Diagnosis
                </>
              )}
            </button>
          </div>

          {showDiagnosis && nodeDiagnosis && (
            <div className="space-y-4">
              {/* Status Overview */}
              <div className="grid grid-cols-3 gap-4">
                <div className={`p-3 rounded-lg border ${
                  nodeDiagnosis.nodeAvailable 
                    ? 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-900/10'
                    : 'border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-900/10'
                }`}>
                  <div className="flex items-center gap-2">
                    {nodeDiagnosis.nodeAvailable ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">Node.js</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {nodeDiagnosis.nodeAvailable ? 'Available' : 'Not found'}
                  </p>
                  {nodeDiagnosis.nodePath && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-mono mt-1 break-all">
                      {nodeDiagnosis.nodePath}
                    </p>
                  )}
                </div>

                <div className={`p-3 rounded-lg border ${
                  nodeDiagnosis.npmAvailable 
                    ? 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-900/10'
                    : 'border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-900/10'
                }`}>
                  <div className="flex items-center gap-2">
                    {nodeDiagnosis.npmAvailable ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">npm</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {nodeDiagnosis.npmAvailable ? 'Available' : 'Not found'}
                  </p>
                  {nodeDiagnosis.npmPath && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-mono mt-1 break-all">
                      {nodeDiagnosis.npmPath}
                    </p>
                  )}
                </div>

                <div className={`p-3 rounded-lg border ${
                  nodeDiagnosis.npxAvailable 
                    ? 'border-green-300 dark:border-green-600 bg-green-50/30 dark:bg-green-900/10'
                    : 'border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-900/10'
                }`}>
                  <div className="flex items-center gap-2">
                    {nodeDiagnosis.npxAvailable ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">npx</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {nodeDiagnosis.npxAvailable ? 'Available' : 'Not found'}
                  </p>
                  {nodeDiagnosis.npxPath && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-mono mt-1 break-all">
                      {nodeDiagnosis.npxPath}
                    </p>
                  )}
                </div>
              </div>

              {/* Suggestions */}
              {nodeDiagnosis.suggestions.length > 0 && (
                <div className="p-4 bg-sakura-50/30 dark:bg-sakura-900/10 border border-sakura-300 dark:border-sakura-600 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Recommendations:</h4>
                  <ul className="space-y-1">
                    {nodeDiagnosis.suggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-sakura-500 mt-1">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* PATH Information */}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                  View PATH directories ({nodeDiagnosis.pathDirs.length} entries)
                </summary>
                <div className="mt-2 p-3 bg-gray-50/30 dark:bg-gray-800/30 rounded-lg">
                  <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-none">
                    {nodeDiagnosis.pathDirs.map((dir, index) => (
                      <div key={index} className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                        {dir}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* MCP Templates Section */}
      {activeSubTab === 'templates' && (
        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-sakura-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Server Templates
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Quick setup for popular MCP servers ({mcpTemplates.length} available)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingMcpServer(null);
                  setNewMcpServerForm({
                    name: '',
                    type: 'stdio',
                    command: '',
                    args: [],
                    env: {},
                    url: '',
                    headers: {},
                    description: '',
                    enabled: true
                  });
                  setShowAddMcpModal(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Custom Server
              </button>
              <button
                onClick={() => setTemplateViewMode(templateViewMode === 'grid' ? 'list' : 'grid')}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={`Switch to ${templateViewMode === 'grid' ? 'list' : 'grid'} view`}
              >
                {templateViewMode === 'grid' ? '☰' : '⊞'}
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-sakura-300 dark:focus:border-sakura-600 dark:text-gray-100"
              />
            </div>
            
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-sakura-300 dark:focus:border-sakura-600 dark:text-gray-100"
              >
                <option value="All">All Categories</option>
                {Array.from(new Set(mcpTemplates.map(t => t.category))).sort().map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Popularity Filter */}
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-gray-500" />
              <select
                value={selectedPopularity}
                onChange={(e) => setSelectedPopularity(e.target.value)}
                className="px-3 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-sakura-300 dark:focus:border-sakura-600 dark:text-gray-100"
              >
                <option value="All">All Popularity</option>
                <option value="high">High Popularity</option>
                <option value="medium">Medium Popularity</option>
                <option value="low">Low Popularity</option>
              </select>
            </div>
          </div>

          {/* Templates Display */}
          {(() => {
            // Filter templates based on search and filters
            let filteredTemplates = mcpTemplates.filter(template => {
              const matchesSearch = template.displayName.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                                  template.description.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                                  template.category.toLowerCase().includes(templateSearchQuery.toLowerCase());
              const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
              const matchesPopularity = selectedPopularity === 'All' || template.popularity === selectedPopularity;
              return matchesSearch && matchesCategory && matchesPopularity;
            });

            // Sort templates by popularity (high first) and then by category
            filteredTemplates.sort((a, b) => {
              const popularityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
              const aPopularity = popularityOrder[a.popularity || 'low'];
              const bPopularity = popularityOrder[b.popularity || 'low'];
              
              if (aPopularity !== bPopularity) {
                return bPopularity - aPopularity; // High to low
              }
              
              // If same popularity, sort by category then by name
              if (a.category !== b.category) {
                return a.category.localeCompare(b.category);
              }
              
              return a.displayName.localeCompare(b.displayName);
            });

            // Get category counts for stats
            const categoryCounts = filteredTemplates.reduce((acc, template) => {
              acc[template.category] = (acc[template.category] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            return (
              <>
                {/* Results Stats */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {filteredTemplates.length} of {mcpTemplates.length} templates
                    {(templateSearchQuery || selectedCategory !== 'All' || selectedPopularity !== 'All') && (
                      <button
                        onClick={() => {
                          setTemplateSearchQuery('');
                          setSelectedCategory('All');
                          setSelectedPopularity('All');
                        }}
                        className="ml-2 text-sakura-500 hover:text-sakura-700 text-xs underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  
                  {/* Category Tags */}
                  {selectedCategory === 'All' && Object.keys(categoryCounts).length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(categoryCounts).slice(0, 5).map(([category, count]) => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-sakura-100 dark:hover:bg-sakura-900 hover:text-sakura-700 dark:hover:text-sakura-300 transition-colors"
                        >
                          {category} ({count})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Templates Grid/List */}
                {filteredTemplates.length > 0 ? (
                  <div className={templateViewMode === 'grid' 
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
                    : "space-y-3"
                  }>
                    {filteredTemplates.map((template) => (
                      <div
                        key={template.name}
                        className={`p-4 bg-white/30 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white/50 dark:hover:bg-gray-800/50 transition-all hover:shadow-md ${
                          templateViewMode === 'list' ? 'flex items-center gap-4' : ''
                        }`}
                      >
                        {templateViewMode === 'grid' ? (
                          // Grid Layout
                          <div className="flex flex-col h-full">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-800 dark:to-sakura-900 rounded-lg flex items-center justify-center">
                                {template.icon ? (
                                  <i className={`${template.icon} text-lg text-sakura-600 dark:text-sakura-300`}></i>
                                ) : (
                                  <span className="text-lg">🔧</span>
                                )}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-white">
                                  {template.displayName}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                    {template.category}
                                  </span>
                                  {template.popularity && (
                                    <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                                      template.popularity === 'high' 
                                        ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                                        : template.popularity === 'medium'
                                        ? 'bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                    }`}>
                                      <Star className="w-3 h-3" />
                                      {template.popularity}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 flex-1">
                              {template.description}
                            </p>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded mb-3">
                              {template.type === 'stdio' 
                                ? `${template.command || ''} ${template.args?.join(' ') || ''}`
                                : template.url || 'Remote server'
                              }
                            </div>
                            {template.env && Object.keys(template.env).length > 0 && (
                              <div className="mb-3 flex items-center gap-1">
                                <Tag className="w-3 h-3 text-orange-500" />
                                <span className="text-xs text-orange-600 dark:text-orange-400">
                                  Requires environment variables
                                </span>
                              </div>
                            )}
                            <button
                              onClick={() => addMcpServerFromTemplate(template)}
                              className="w-full px-4 py-2 bg-sakura-500 text-white text-sm font-medium rounded-lg hover:bg-sakura-600 hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 mt-auto"
                            >
                              <Plus className="w-4 h-4" />
                              Use Template
                            </button>
                          </div>
                        ) : (
                          // List Layout
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-800 dark:to-sakura-900 rounded-lg flex items-center justify-center shrink-0">
                                {template.icon ? (
                                  <i className={`${template.icon} text-lg text-sakura-600 dark:text-sakura-300`}></i>
                                ) : (
                                  <span className="text-lg">🔧</span>
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-gray-900 dark:text-white">
                                    {template.displayName}
                                  </h4>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                    {template.category}
                                  </span>
                                  {template.popularity && (
                                    <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                                      template.popularity === 'high' 
                                        ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                                        : template.popularity === 'medium'
                                        ? 'bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                    }`}>
                                      <Star className="w-3 h-3" />
                                      {template.popularity}
                                    </span>
                                  )}
                                  {template.env && Object.keys(template.env).length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Tag className="w-3 h-3 text-orange-500" />
                                      <span className="text-xs text-orange-600 dark:text-orange-400">
                                        Env vars
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                                  {template.description}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {template.type === 'stdio' 
                                    ? `${template.command || ''} ${template.args?.join(' ') || ''}`
                                    : template.url || 'Remote server'
                                  }
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => addMcpServerFromTemplate(template)}
                              className="px-6 py-2.5 bg-sakura-500 text-white text-sm font-medium rounded-lg hover:bg-sakura-600 hover:shadow-md transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
                            >
                              <Plus className="w-4 h-4" />
                              Use Template
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // No Results
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No templates found
                    </h4>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      Try adjusting your search terms or filters
                    </p>
                    <button 
                      onClick={() => {
                        setTemplateSearchQuery('');
                        setSelectedCategory('All');
                        setSelectedPopularity('All');
                      }}
                      className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* MCP Delete Confirmation Modal */}
      {showDeleteMcpConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete MCP Server
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete the MCP server "{showDeleteMcpConfirm}"? This will stop the server and remove all its configuration.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteMcpConfirm(null)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMcpServer(showDeleteMcpConfirm)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit MCP Server Modal */}
      {showAddMcpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingMcpServer ? 'Edit MCP Server' : 'Add MCP Server'}
              </h3>
              <button
                onClick={() => {
                  setShowAddMcpModal(false);
                  setEditingMcpServer(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={newMcpServerForm.name}
                    onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="Enter server name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server Type
                  </label>
                  <select
                    value={newMcpServerForm.type}
                    onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, type: e.target.value as 'stdio' | 'remote' }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  >
                    <option value="stdio">Standard I/O</option>
                    <option value="remote">Remote Server</option>
                  </select>
                </div>
              </div>

              {newMcpServerForm.type === 'stdio' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Command
                    </label>
                    <input
                      type="text"
                      value={newMcpServerForm.command}
                      onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, command: e.target.value }))}
                      className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      placeholder="npx @modelcontextprotocol/server-filesystem"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Arguments (one per line)
                    </label>
                    <textarea
                      value={newMcpServerForm.args.join('\n')}
                      onChange={(e) => setNewMcpServerForm(prev => ({ 
                        ...prev, 
                        args: e.target.value.split('\n').filter(arg => arg.trim()).map(arg => arg.trim())
                      }))}
                      className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                      rows={3}
                      placeholder="/path/to/directory"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server URL
                  </label>
                  <input
                    type="url"
                    value={newMcpServerForm.url}
                    onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                    placeholder="https://your-mcp-server.com"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newMcpServerForm.description}
                  onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
                  placeholder="Brief description of what this server does"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Environment Variables (JSON format)
                </label>
                <textarea
                  value={JSON.stringify(newMcpServerForm.env, null, 2)}
                  onChange={(e) => {
                    try {
                      const env = JSON.parse(e.target.value);
                      setNewMcpServerForm(prev => ({ ...prev, env }));
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100 font-mono text-sm"
                  rows={4}
                  placeholder='{\n  "API_KEY": "your-api-key",\n  "DATABASE_URL": "your-db-url"\n}'
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mcpEnabled"
                  checked={newMcpServerForm.enabled}
                  onChange={(e) => setNewMcpServerForm(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 text-sakura-500 rounded border-gray-300 focus:ring-sakura-500"
                />
                <label htmlFor="mcpEnabled" className="text-sm text-gray-700 dark:text-gray-300">
                  Enable this server
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddMcpModal(false);
                  setEditingMcpServer(null);
                }}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingMcpServer ? handleUpdateMcpServer : handleAddMcpServer}
                disabled={
                  !newMcpServerForm.name?.trim() || 
                  (newMcpServerForm.type === 'stdio' && !newMcpServerForm.command?.trim()) || 
                  (newMcpServerForm.type === 'remote' && !newMcpServerForm.url?.trim())
                }
                className="flex-1 px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingMcpServer ? 'Update' : 'Add'} Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Import Modal */}
      {showJsonImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Import MCP Servers from JSON
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Paste your MCP configuration JSON below
                </p>
              </div>
              <button
                onClick={() => {
                  setShowJsonImportModal(false);
                  setJsonImportText('');
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  JSON Configuration
                </label>
                <textarea
                  value={jsonImportText}
                  onChange={(e) => setJsonImportText(e.target.value)}
                  className="w-full h-64 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-blue-300 dark:focus:border-blue-600 dark:text-gray-100 font-mono text-sm resize-none"
                  placeholder={`{
  "mcpServers": {
    "desktop-commander": {
      "command": "npx",
      "args": [
        "-y",
        "@smithery/cli@latest",
        "run",
        "@wonderwhy-er/desktop-commander",
        "--key",
        "19a80d11-46ae-4bd8-a5e8-8dab60cfc125"
      ]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/files"
      ],
      "env": {
        "API_KEY": "your-api-key"
      },
      "description": "File system access server"
    }
  }
}`}
                />
              </div>

              {/* Format help */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Expected JSON Format
                </h4>
                <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                  <p>• <strong>mcpServers</strong>: Object containing server configurations</p>
                  <p>• <strong>command</strong>: Executable command (required)</p>
                  <p>• <strong>args</strong>: Array of command arguments (optional)</p>
                  <p>• <strong>env</strong>: Environment variables object (optional)</p>
                  <p>• <strong>description</strong>: Server description (optional)</p>
                  <p>• <strong>enabled</strong>: Whether server is enabled (optional, defaults to true)</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowJsonImportModal(false);
                  setJsonImportText('');
                }}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJsonImport}
                disabled={!jsonImportText.trim() || isImportingJson}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isImportingJson ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import Servers
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPSettings; 