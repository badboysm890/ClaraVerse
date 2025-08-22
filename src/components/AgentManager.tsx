import React, { useState, useEffect } from 'react';
import { Plus, Edit, Play, Trash2, Search, Grid, List, Clock,  Bot } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { AgentFlow } from '../types/agent/types';
import { agentWorkflowStorage } from '../services/agentWorkflowStorage';
import { db } from '../db';

interface AgentManagerProps {
  onPageChange: (page: string) => void;
  onEditAgent: (agentId: string) => void;
  onOpenAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  userName?: string;
}

const AgentManager: React.FC<AgentManagerProps> = ({ onPageChange, onEditAgent, onOpenAgent, onCreateAgent, userName }) => {
  const [agents, setAgents] = useState<AgentFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  // Load wallpaper from IndexedDB on mount
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        console.log('AgentManager: Loading wallpaper...');
        const wallpaper = await db.getWallpaper();
        console.log('AgentManager: Wallpaper loaded:', wallpaper ? 'Yes' : 'No');
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
          console.log('AgentManager: Wallpaper URL set:', wallpaper.substring(0, 50) + '...');
        }
      } catch (error) {
        console.error('AgentManager: Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const flows = await agentWorkflowStorage.getAllWorkflows();
      setAgents(flows || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
      try {
        await agentWorkflowStorage.deleteWorkflow(agentId);
        await loadAgents();
      } catch (error) {
        console.error('Failed to delete agent:', error);
      }
    }
  };

  const handleDuplicateAgent = async (agent: AgentFlow) => {
    try {
      const now = new Date().toISOString();
      const duplicatedFlow = {
        ...agent,
        id: `${agent.id}-copy-${Date.now()}`,
        name: `${agent.name} (Copy)`,
        createdAt: now,
        updatedAt: now
      };
      await agentWorkflowStorage.saveWorkflow(duplicatedFlow);
      await loadAgents();
    } catch (error) {
      console.error('Failed to duplicate agent:', error);
    }
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.description && agent.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const getAgentIcon = (agent: AgentFlow) => {
    // Use custom icon if available
    if (agent.icon) {
      return agent.icon;
    }
    
    // Fallback to auto-generated icon based on agent characteristics
    const nodeCount = agent.nodes?.length || 0;
    const hasLLMNode = agent.nodes?.some(node => node.type === 'llm' || node.type === 'structured-llm');
    const hasAPINode = agent.nodes?.some(node => node.type === 'api-request');
    const hasImageNode = agent.nodes?.some(node => node.type === 'image-input');
    const hasFileNode = agent.nodes?.some(node => node.type === 'file-upload' || node.type === 'pdf-input');
    
    // Determine icon based on functionality
    if (hasLLMNode && hasImageNode) return '👁️'; // Vision AI
    if (hasLLMNode && hasFileNode) return '📄'; // Document AI
    if (hasLLMNode && hasAPINode) return '🔗'; // Connected AI
    if (hasLLMNode) return '🤖'; // AI Agent
    if (hasAPINode) return '🌐'; // API Agent
    if (hasImageNode) return '🖼️'; // Image Agent
    if (hasFileNode) return '📁'; // File Agent
    
    // Fallback based on complexity
    if (nodeCount === 0) return '🧠';
    if (nodeCount < 5) return '⚡';
    if (nodeCount < 10) return '🛠️';
    return '🔥';
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar activePage="agents" onPageChange={onPageChange} />
        <div className="flex-1 flex flex-col">
          <Topbar userName={userName} onPageChange={onPageChange} />
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-sakura-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading agents...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activePage="agents" onPageChange={onPageChange} />
      
      <div className="flex-1 flex flex-col min-h-0">
        <Topbar userName={userName} onPageChange={onPageChange} />
        
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full relative p-6 overflow-y-auto scrollbar-none">
            {/* Wallpaper */}
            {wallpaperUrl && (
              <div 
                className="fixed top-0 left-0 right-0 bottom-0 z-0"
                style={{
                  backgroundImage: `url(${wallpaperUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: 0.1,
                  filter: 'blur(1px)',
                  pointerEvents: 'none'
                }}
              />
            )}
            
            <div className="relative z-10">
              {/* Header */}
              <div className="glassmorphic px-6 py-6 rounded-2xl">
                <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 text-sakura-500 text-2xl">🧠</div>
                  <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                    AI Agents
                  </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                  Create, manage, and run your AI agent workflows
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={onCreateAgent}
                  className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg flex items-center gap-2 font-medium transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Plus className="w-5 h-5" />
                  Create Agent
                </button>
              </div>
            </div>

            {/* Search and Controls */}
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 dark:bg-gray-900/50 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 w-80"
                  />
                </div>
                
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {filteredAgents.length} of {agents.length} agents
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-auto p-6">
            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
                {searchQuery ? (
                  <>
                    <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 text-3xl">
                      🔍
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      No agents found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      No agents match your search query "{searchQuery}". Try different keywords.
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center mb-6 text-3xl">
                      🧠
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      No agents yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Create your first AI agent to automate tasks and build intelligent workflows.
                    </p>
                    <button
                      onClick={onCreateAgent}
                      className="px-6 py-3 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Create Your First Agent
                    </button>
                  </>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="group glassmorphic rounded-xl hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                  >
                    {/* Card Header */}
                    <div className="p-4 border-b border-white/20 dark:border-gray-700/50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-lg">
                            {getAgentIcon(agent)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                              {agent.name}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {agent.nodes?.length || 0} nodes
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {agent.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                          {agent.description}
                        </p>
                      )}
                      
                                             <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                         <Clock className="w-3 h-3 mr-1" />
                         {formatDate(new Date(agent.updatedAt || agent.createdAt))}
                       </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-4">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => onOpenAgent(agent.id)}
                          className="group relative w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                          title="Open Agent"
                        >
                          <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
                          <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </button>
                        
                        <button
                          onClick={() => onEditAgent(agent.id)}
                          className="group relative w-12 h-12 bg-gradient-to-r from-sakura-500 to-pink-500 hover:from-sakura-600 hover:to-pink-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                          title="Edit Agent"
                        >
                          <Edit className="w-5 h-5 transition-transform group-hover:scale-110" />
                          <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </button>
                        
                        <button
                          onClick={() => handleDuplicateAgent(agent)}
                          className="group relative w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                          title="Duplicate Agent"
                        >
                          <Plus className="w-5 h-5 transition-transform group-hover:scale-110" />
                          <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </button>
                        
                        <button
                          onClick={() => handleDeleteAgent(agent.id)}
                          className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                          title="Delete Agent"
                        >
                          <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                          <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="glassmorphic rounded-xl hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-12 h-12 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                            {getAgentIcon(agent)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
                                {agent.name}
                              </h3>
                              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <Bot className="w-4 h-4" />
                                <span>{agent.nodes?.length || 0} nodes</span>
                              </div>
                            </div>
                            
                            {agent.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
                                {agent.description}
                              </p>
                            )}
                            
                                                         <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                               <Clock className="w-3 h-3 mr-1" />
                               <span>Updated {formatDate(new Date(agent.updatedAt || agent.createdAt))}</span>
                             </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 ml-4">
                          <button
                            onClick={() => onOpenAgent(agent.id)}
                            className="group relative w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                            title="Open Agent"
                          >
                            <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
                            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </button>
                          
                          <button
                            onClick={() => onEditAgent(agent.id)}
                            className="group relative w-12 h-12 bg-gradient-to-r from-sakura-500 to-pink-500 hover:from-sakura-600 hover:to-pink-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                            title="Edit Agent"
                          >
                            <Edit className="w-5 h-5 transition-transform group-hover:scale-110" />
                            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </button>
                          
                          <button
                            onClick={() => handleDuplicateAgent(agent)}
                            className="group relative w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                            title="Duplicate Agent"
                          >
                            <Plus className="w-5 h-5 transition-transform group-hover:scale-110" />
                            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </button>
                          
                          <button
                            onClick={() => handleDeleteAgent(agent.id)}
                            className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                            title="Delete Agent"
                          >
                            <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentManager; 
