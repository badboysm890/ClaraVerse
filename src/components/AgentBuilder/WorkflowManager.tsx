import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Star, 
  Trash2, 
  Download, 
  Upload, 
  Eye, 
  Clock, 
  Folder, 
  Filter,
  X,
  RefreshCw,
  Archive,
  Copy,
  Play,
  MoreVertical,
  Calendar,
  FileText,
  Tag,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { AgentFlow } from '../../types/agent/types';
import { agentWorkflowStorage, WorkflowSearchOptions } from '../../services/agentWorkflowStorage';
import { useAgentBuilder } from '../../contexts/AgentBuilder/AgentBuilderContext';

interface WorkflowManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadWorkflow: (workflow: AgentFlow) => void;
}

interface FilterOptions {
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'executionCount';
  sortOrder: 'asc' | 'desc';
  showStarred: boolean;
  showArchived: boolean;
  selectedTags: string[];
}

const WorkflowManager: React.FC<WorkflowManagerProps> = ({ isOpen, onClose, onLoadWorkflow }) => {
  const { exportFlow } = useAgentBuilder();
  
  // State
  const [workflows, setWorkflows] = useState<AgentFlow[]>([]);
  const [filteredWorkflows, setFilteredWorkflows] = useState<AgentFlow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewWorkflow, setPreviewWorkflow] = useState<AgentFlow | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [storageStats, setStorageStats] = useState<any>(null);
  
  const [filters, setFilters] = useState<FilterOptions>({
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    showStarred: false,
    showArchived: false,
    selectedTags: []
  });

  // Load workflows
  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const searchOptions: WorkflowSearchOptions = {
        query: searchQuery || undefined,
        isStarred: filters.showStarred || undefined,
        isArchived: filters.showArchived || undefined,
        tags: filters.selectedTags.length > 0 ? filters.selectedTags : undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };

      const allWorkflows = await agentWorkflowStorage.getAllWorkflows(searchOptions);
      setWorkflows(allWorkflows);
      setFilteredWorkflows(allWorkflows);

      // Extract available tags
      const tags = Array.from(new Set(
        allWorkflows.flatMap(workflow => workflow.tags || [])
      )).sort();
      setAvailableTags(tags);

      // Load storage stats
      const stats = await agentWorkflowStorage.getStorageStats();
      setStorageStats(stats);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filters]);

  // Effects
  useEffect(() => {
    if (isOpen) {
      loadWorkflows();
    }
  }, [isOpen, loadWorkflows]);

  // Handlers
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleLoadWorkflow = async (workflow: AgentFlow) => {
    try {
      onLoadWorkflow(workflow);
      onClose();
    } catch (err) {
      setError('Failed to load workflow');
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!window.confirm('Are you sure you want to delete this workflow? This action cannot be undone.')) {
      return;
    }

    try {
      const success = await agentWorkflowStorage.deleteWorkflow(workflowId);
      if (success) {
        await loadWorkflows();
      } else {
        setError('Failed to delete workflow');
      }
    } catch (err) {
      setError('Failed to delete workflow');
    }
  };

  const handleToggleStar = async (workflowId: string) => {
    try {
      const workflow = workflows.find(w => w.id === workflowId);
      if (!workflow) return;

      // This is a simplified approach - in a real implementation you'd want to store metadata separately
      await agentWorkflowStorage.updateWorkflowMetadata(workflowId, {
        isStarred: !(workflow as any).metadata?.isStarred
      });
      
      await loadWorkflows();
    } catch (err) {
      setError('Failed to update workflow');
    }
  };

  const handleExportWorkflow = async (workflow: AgentFlow) => {
    try {
      const exported = await agentWorkflowStorage.exportWorkflow(workflow.id, 'angela-native');
      if (exported) {
        const blob = new Blob([JSON.stringify(exported.data, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${workflow.name.replace(/\s+/g, '_')}_workflow.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to export workflow');
    }
  };

  const handleDuplicateWorkflow = async (workflow: AgentFlow) => {
    try {
      const duplicated = {
        ...workflow,
        id: `${workflow.id}-copy-${Date.now()}`,
        name: `${workflow.name} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await agentWorkflowStorage.saveWorkflow(duplicated);
      if (result.success) {
        await loadWorkflows();
      } else {
        setError(result.errors?.join(', ') || 'Failed to duplicate workflow');
      }
    } catch (err) {
      setError('Failed to duplicate workflow');
    }
  };

  const handlePreviewWorkflow = (workflow: AgentFlow) => {
    setPreviewWorkflow(workflow);
    setShowPreview(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg text-white">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                Workflow Manager
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {storageStats && `${storageStats.totalWorkflows} workflows • ${formatFileSize(storageStats.totalSize)} used`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                showFilters 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            <button
              onClick={loadWorkflows}
              disabled={loading}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
              />
            </div>
            
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange({ sortBy: e.target.value as any })}
              className="px-3 py-2 bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-100"
            >
              <option value="updatedAt">Last Modified</option>
              <option value="createdAt">Date Created</option>
              <option value="name">Name</option>
              <option value="executionCount">Most Used</option>
            </select>
            
            <button
              onClick={() => handleFilterChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="px-3 py-2 bg-white dark:bg-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title={`Sort ${filters.sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
            >
              {filters.sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {showFilters && (
            <div className="flex items-center gap-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.showStarred}
                  onChange={(e) => handleFilterChange({ showStarred: e.target.checked })}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <Star className="w-4 h-4 text-yellow-500" />
                Starred Only
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.showArchived}
                  onChange={(e) => handleFilterChange({ showArchived: e.target.checked })}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <Archive className="w-4 h-4 text-gray-500" />
                Show Archived
              </label>

              {availableTags.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableTags.slice(0, 5).map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          const newTags = filters.selectedTags.includes(tag)
                            ? filters.selectedTags.filter(t => t !== tag)
                            : [...filters.selectedTags, tag];
                          handleFilterChange({ selectedTags: newTags });
                        }}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          filters.selectedTags.includes(tag)
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
            >
              <X className="w-3 h-3 text-red-500" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading workflows...</span>
              </div>
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <Folder className="w-12 h-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">
                {workflows.length === 0 ? 'No workflows found' : 'No workflows match your filters'}
              </h3>
              <p className="text-sm">
                {workflows.length === 0 
                  ? 'Create your first workflow to get started' 
                  : 'Try adjusting your search or filter criteria'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-y-auto h-full">
              {filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflow === workflow.id}
                  onSelect={() => setSelectedWorkflow(workflow.id)}
                  onLoad={() => handleLoadWorkflow(workflow)}
                  onDelete={() => handleDeleteWorkflow(workflow.id)}
                  onStar={() => handleToggleStar(workflow.id)}
                  onExport={() => handleExportWorkflow(workflow)}
                  onDuplicate={() => handleDuplicateWorkflow(workflow)}
                  onPreview={() => handlePreviewWorkflow(workflow)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewWorkflow && (
        <WorkflowPreview
          workflow={previewWorkflow}
          onClose={() => setShowPreview(false)}
          onLoad={() => {
            handleLoadWorkflow(previewWorkflow);
            setShowPreview(false);
          }}
        />
      )}
    </div>
  );
};

// Workflow Card Component
interface WorkflowCardProps {
  workflow: AgentFlow;
  isSelected: boolean;
  onSelect: () => void;
  onLoad: () => void;
  onDelete: () => void;
  onStar: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onPreview: () => void;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  isSelected,
  onSelect,
  onLoad,
  onDelete,
  onStar,
  onExport,
  onDuplicate,
  onPreview
}) => {
  const [showActions, setShowActions] = useState(false);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getAgentIcon = (workflow: AgentFlow) => {
    // Use custom icon if available
    if (workflow.icon) {
      return workflow.icon;
    }
    
    // Fallback to auto-generated icon based on agent characteristics
    const nodeCount = workflow.nodes?.length || 0;
    const hasLLMNode = workflow.nodes?.some(node => node.type === 'llm' || node.type === 'structured-llm');
    const hasAPINode = workflow.nodes?.some(node => node.type === 'api-request');
    const hasImageNode = workflow.nodes?.some(node => node.type === 'image-input');
    const hasFileNode = workflow.nodes?.some(node => node.type === 'file-upload' || node.type === 'pdf-input');
    
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

  return (
    <div
      className={`relative bg-white dark:bg-gray-700 rounded-xl border-2 transition-all duration-200 hover:shadow-lg cursor-pointer group ${
        isSelected 
          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800' 
          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-600">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
              {getAgentIcon(workflow)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                {workflow.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {workflow.description || 'No description'}
              </p>
            </div>
          </div>
          
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-all"
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            
            {showActions && (
              <div className="absolute right-0 top-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-10 py-1 min-w-[120px]">
                <button
                  onClick={(e) => { e.stopPropagation(); onLoad(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Play className="w-3 h-3" />
                  Load
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onPreview(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onExport(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onStar(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Star className="w-3 h-3" />
                  Star
                </button>
                <hr className="my-1 border-gray-200 dark:border-gray-600" />
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowActions(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>{workflow.nodes.length} nodes</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>{workflow.connections.length} connections</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-600">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(workflow.updatedAt)}</span>
          </div>
          
          {workflow.tags && workflow.tags.length > 0 && (
            <div className="flex items-center gap-1">
              {workflow.tags.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded"
                >
                  {tag}
                </span>
              ))}
              {workflow.tags.length > 2 && (
                <span className="text-xs text-gray-400">+{workflow.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="absolute inset-x-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onLoad(); }}
            className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Load Workflow
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Workflow Preview Component
interface WorkflowPreviewProps {
  workflow: AgentFlow;
  onClose: () => void;
  onLoad: () => void;
}

const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({ workflow, onClose, onLoad }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              {workflow.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {workflow.description || 'No description available'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onLoad}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium"
            >
              <Play className="w-4 h-4" />
              Load Workflow
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                  Workflow Details
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Nodes:</span>
                    <span className="text-sm font-medium">{workflow.nodes.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Connections:</span>
                    <span className="text-sm font-medium">{workflow.connections.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Version:</span>
                    <span className="text-sm font-medium">{workflow.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Created:</span>
                    <span className="text-sm font-medium">
                      {new Date(workflow.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Modified:</span>
                    <span className="text-sm font-medium">
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {workflow.tags && workflow.tags.length > 0 && (
                  <div className="mt-4">
                    <span className="text-sm text-gray-600 dark:text-gray-400 block mb-2">Tags:</span>
                    <div className="flex flex-wrap gap-2">
                      {workflow.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nodes List */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Nodes ({workflow.nodes.length})
              </h3>
              
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {workflow.nodes.map(node => (
                  <div
                    key={node.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {node.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {node.type}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {node.inputs?.length || 0}→{node.outputs?.length || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowManager; 
