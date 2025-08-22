import React, { useState, useEffect, useRef } from 'react';
import { Plus, Play, Save, Download, Upload, Settings, Calculator, Type, ArrowRight, X, Terminal, Clock, CheckCircle, AlertCircle, Info, Folder, Zap, Layout } from 'lucide-react';
import { AgentBuilderProvider, useAgentBuilder } from '../contexts/AgentBuilder/AgentBuilderContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Canvas from './AgentBuilder/Canvas/Canvas';
import WorkflowManager from './AgentBuilder/WorkflowManager';
import NodeCreator from './AgentBuilder/NodeCreator/NodeCreator';
import ExportModal from './AgentBuilder/ExportModal';
import { CustomNodeDefinition } from '../types/agent/types';
import { customNodeManager } from './AgentBuilder/NodeCreator/CustomNodeManager';
import { db } from '../db';
import UIBuilder from './AgentBuilder/UIBuilder/UIBuilder';

interface AgentStudioProps {
  onPageChange: (page: string) => void;
  userName?: string;
  editingAgentId?: string | null;
}

const NewFlowModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description?: string, icon?: string) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [flowName, setFlowName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🧠');

  // Predefined icon options
  const iconOptions = [
    '🧠', '🤖', '⚡', '🔥', '🛠️', '👁️', '📄', '🔗', 
    '🌐', '🖼️', '📁', '🚀', '💡', '⭐', '🎯', '🎨',
    '🔧', '⚙️', '🎮', '📊', '💰', '🏆', '🌟', '💎'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (flowName.trim()) {
      onConfirm(flowName.trim(), description.trim() || undefined, selectedIcon);
      setFlowName('');
      setDescription('');
      setSelectedIcon('🧠');
      onClose();
    }
  };

  const handleClose = () => {
    setFlowName('');
    setDescription('');
    setSelectedIcon('🧠');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="glassmorphic rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-gray-700/50">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Create New Flow
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Flow Name *
            </label>
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="My Awesome Flow"
              className="w-full px-3 py-2 border border-white/30 dark:border-gray-700/50 rounded-lg glassmorphic-card text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500"
              required
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this flow does..."
              rows={3}
              className="w-full px-3 py-2 border border-white/30 dark:border-gray-700/50 rounded-lg glassmorphic-card text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Icon
            </label>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-lg">
                {selectedIcon}
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Selected icon</span>
            </div>
            <div className="grid grid-cols-8 gap-2 max-h-32 overflow-y-auto border border-white/30 dark:border-gray-700/50 rounded-lg p-2 glassmorphic-card">
              {iconOptions.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110 ${
                    selectedIcon === icon
                      ? 'bg-sakura-500 text-white shadow-lg transform scale-110'
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg transition-colors"
            >
              Create Flow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AgentStudioContent: React.FC<{ onPageChange: (page: string) => void; userName?: string; editingAgentId?: string | null }> = ({ onPageChange, userName, editingAgentId }) => {
  const {
    currentFlow,
    nodes,
    canvas,
    isExecuting,
    hasUnsavedChanges,
    saveFlow,
    exportFlow,
    executeFlow,
    createNewFlow,
    loadFlow,
    importFlow,
    executionLogs,
    isExecutionLogOpen,
    toggleExecutionLog,
    clearExecutionLogs,
    syncCustomNodes
  } = useAgentBuilder();

  const [isNodePaletteOpen, setIsNodePaletteOpen] = useState(true);
  const [isNewFlowModalOpen, setIsNewFlowModalOpen] = useState(false);
  const [isWorkflowManagerOpen, setIsWorkflowManagerOpen] = useState(false);
  const [isNodeCreatorOpen, setIsNodeCreatorOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUIBuilderOpen, setIsUIBuilderOpen] = useState(false);
  const [editingCustomNode, setEditingCustomNode] = useState<CustomNodeDefinition | null>(null);
  const [customNodes, setCustomNodes] = useState<CustomNodeDefinition[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Load custom nodes on mount
  useEffect(() => {
    setCustomNodes(customNodeManager.getCustomNodes());
    syncCustomNodes();
  }, [syncCustomNodes]);

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Load specific agent when editingAgentId is provided
  useEffect(() => {
    const loadSpecificAgent = async () => {
      if (editingAgentId) {
        try {
          const { agentWorkflowStorage } = await import('../services/agentWorkflowStorage');
          const agent = await agentWorkflowStorage.getWorkflow(editingAgentId);
          if (agent) {
            loadFlow(agent);
          } else {
            console.error('Agent not found:', editingAgentId);
          }
        } catch (error) {
          console.error('Failed to load agent:', error);
        }
      }
    };
    loadSpecificAgent();
  }, [editingAgentId, loadFlow]);

  // Prevent body scrolling and ensure proper viewport containment
  useEffect(() => {
    // Store original styles
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    
    // Apply containment styles
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.documentElement.style.height = '100vh';
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.height = '';
      document.documentElement.style.height = '';
    };
  }, []);

  const handleSave = async () => {
    console.log('Save button clicked - starting save process...');
    console.log('Current flow:', currentFlow);
    console.log('Has unsaved changes:', hasUnsavedChanges);
    console.log('Nodes count:', nodes.length);
    
    try {
      console.log('Calling saveFlow()...');
      await saveFlow();
      console.log('Save completed successfully');
    } catch (error) {
      console.error('Failed to save workflow:', error);
      // You could show a toast notification here
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importFlow(data);
        setImportError(null);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Failed to import workflow');
        console.error('Failed to import workflow:', error);
      }
    };
    input.click();
  };

  const handleTestFlow = async () => {
    // Clear previous logs when starting new execution
    clearExecutionLogs();
    await executeFlow();
  };

  const handleCreateNew = () => {
    setIsNewFlowModalOpen(true);
  };

  const handleConfirmNewFlow = (name: string, description?: string, icon?: string) => {
    createNewFlow(name, description, icon);
  };

  const handleCreateCustomNode = () => {
    setEditingCustomNode(null);
    setIsNodeCreatorOpen(true);
  };

  const handleEditCustomNode = (node: CustomNodeDefinition) => {
    setEditingCustomNode(node);
    setIsNodeCreatorOpen(true);
  };

  const handleSaveCustomNode = (nodeDefinition: CustomNodeDefinition) => {
    try {
      customNodeManager.registerCustomNode(nodeDefinition);
      setCustomNodes(customNodeManager.getCustomNodes());
      syncCustomNodes();
      setIsNodeCreatorOpen(false);
      setEditingCustomNode(null);
    } catch (error) {
      console.error('Failed to save custom node:', error);
      // You could show a toast notification here
    }
  };

  const handleDeleteCustomNode = (nodeType: string) => {
    if (confirm('Are you sure you want to delete this custom node?')) {
      customNodeManager.unregisterCustomNode(nodeType);
      setCustomNodes(customNodeManager.getCustomNodes());
      syncCustomNodes();
    }
  };

  // Handle drag start for nodes
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [executionLogs]);

  const handleExport = async (format: string) => {
    try {
      await exportFlow(format);
    } catch (error) {
      console.error('Export failed:', error);
      throw error; // Re-throw so ExportModal can handle it
    }
  };

  // Check if flow has custom nodes
  const hasCustomNodes = nodes.some(node => 
    customNodeManager.isCustomNode && customNodeManager.isCustomNode(node.type)
  );

  return (
    <div className="flex h-screen overflow-hidden relative">
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

      {/* Content with relative z-index */}
      <div className="relative z-10 flex h-screen w-full">
        <Sidebar activePage="agents" onPageChange={onPageChange} />
      
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Topbar userName={userName} onPageChange={onPageChange} />
        
        <div className="flex-1 flex flex-col bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 min-h-0 overflow-hidden">
          {/* Agent Studio Header */}
          <div className="glassmorphic px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 text-sakura-500">🧠</div>
                  <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    Agent Studio
                  </h1>
                </div>
                {currentFlow && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>•</span>
                    <span>{currentFlow.name}</span>
                    {hasUnsavedChanges && (
                      <span className="text-orange-500">• Unsaved changes</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCreateNew}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
                <button 
                  onClick={() => setIsWorkflowManagerOpen(true)}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Folder className="w-4 h-4" />
                  Workflows
                </button>
                <button 
                  onClick={handleCreateCustomNode}
                  className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                  title="Create Custom Node"
                >
                  <Zap className="w-4 h-4" />
                  Create Node
                </button>
                                  <button 
                  onClick={() => setIsUIBuilderOpen(true)}
                  disabled={!currentFlow}
                  className="px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                  title="Create Agent UI"
                >
                  <Layout className="w-4 h-4" />
                  Create UI
                </button>
                <button 
                  onClick={handleImport}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </button>
                
                {/* Export Button - Opens Modal */}
                <button 
                  onClick={() => setIsExportModalOpen(true)}
                  disabled={!currentFlow}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>

                <button 
                  onClick={handleSave}
                  disabled={!currentFlow || !hasUnsavedChanges}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button 
                  onClick={handleTestFlow}
                  disabled={!currentFlow || isExecuting || nodes.length === 0}
                  className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {isExecuting ? 'Running...' : 'Test Flow'}
                </button>
                <button 
                  onClick={() => setIsNodePaletteOpen(!isNodePaletteOpen)}
                  className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition-colors"
                  title="Toggle Node Library"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button 
                  onClick={toggleExecutionLog}
                  className={`p-2 rounded-lg text-gray-700 dark:text-gray-300 transition-colors relative ${
                    isExecutionLogOpen 
                      ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300' 
                      : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle Execution Log"
                >
                  <Terminal className="w-4 h-4" />
                  {executionLogs.length > 0 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-xs text-white font-medium">{executionLogs.length > 9 ? '9+' : executionLogs.length}</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Node Palette Sidebar */}
            {isNodePaletteOpen && (
              <div className="w-80 glassmorphic flex flex-col overflow-hidden min-h-0">
                <div className="p-4 flex-shrink-0">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                    Node Library
                  </h2>
                  
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search nodes..."
                    className="w-full px-3 py-2 glassmorphic-card rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sakura-500"
                  />
                </div>
                
                {/* Node Categories */}
                <div 
                  className="flex-1 overflow-y-auto overflow-x-hidden p-4 node-list-scrollable"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent'
                  }}
                >
                  <style dangerouslySetInnerHTML={{
                    __html: `
                      .node-list-scrollable::-webkit-scrollbar {
                        width: 6px !important;
                        display: block !important;
                      }
                      .node-list-scrollable::-webkit-scrollbar-track {
                        background: transparent !important;
                      }
                      .node-list-scrollable::-webkit-scrollbar-thumb {
                        background-color: rgba(156, 163, 175, 0.5) !important;
                        border-radius: 3px !important;
                      }
                      .node-list-scrollable::-webkit-scrollbar-thumb:hover {
                        background-color: rgba(156, 163, 175, 0.7) !important;
                      }
                      .dark .node-list-scrollable::-webkit-scrollbar-thumb {
                        background-color: rgba(107, 114, 128, 0.5) !important;
                      }
                      .dark .node-list-scrollable::-webkit-scrollbar-thumb:hover {
                        background-color: rgba(107, 114, 128, 0.7) !important;
                      }
                    `
                  }} />
                  <div className="space-y-6">
                    {/* Basic I/O Nodes */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        Input & Output
                      </h3>
                      <div className="space-y-2">
                        {[
                          { 
                            name: 'Input', 
                            type: 'input', 
                            icon: '📥', 
                            description: 'Text, JSON, or number input', 
                            color: 'bg-green-500',
                            features: ['Multi-type support', 'Configurable labels']
                          },
                          { 
                            name: 'Output', 
                            type: 'output', 
                            icon: '📤', 
                            description: 'Display results with formatting', 
                            color: 'bg-red-500',
                            features: ['Multiple formats', 'Auto-formatting']
                          },
                          { 
                            name: 'Image Input', 
                            type: 'image-input', 
                            icon: '🖼️', 
                            description: 'Upload images as base64', 
                            color: 'bg-pink-500',
                            features: ['Auto-resize', 'Base64 output']
                          },
                          { 
                            name: 'Load PDF', 
                            type: 'pdf-input', 
                            icon: '📄', 
                            description: 'Upload PDF and extract text content', 
                            color: 'bg-blue-500',
                            features: ['Text extraction', 'Multi-page support']
                          },

                          { 
                            name: 'File Upload', 
                            type: 'file-upload', 
                            icon: '📁', 
                            description: 'Upload any file with configurable output formats', 
                            color: 'bg-indigo-500',
                            features: ['Universal support', 'Multiple formats', 'Size validation']
                          },
                        ].map((node) => (
                                                      <div
                              key={node.name}
                              className="group p-4 glassmorphic-card rounded-xl hover:border-green-300 dark:hover:border-green-500 hover:shadow-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                            >
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 ${node.color} rounded-lg text-white text-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                                {node.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                                  {node.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
                                  {node.description}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {node.features.map((feature, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Data Processing */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        Data Processing
                      </h3>
                      <div className="space-y-2">
                        {[
                          { 
                            name: 'Static Text', 
                            type: 'static-text', 
                            icon: '📝', 
                            description: 'Provides fixed text content set during workflow creation', 
                            color: 'bg-gray-500',
                            features: ['Fixed content', 'Multiple formats', 'Template support', 'Prompt building']
                          },
                          { 
                            name: 'Combine Text', 
                            type: 'combine-text', 
                            icon: '🔗', 
                            description: 'Combine two text inputs with configurable separation for prompt building', 
                            color: 'bg-indigo-500',
                            features: ['Multiple modes', 'Custom separators', 'Prompt building', 'Space control']
                          },
                          { 
                            name: 'JSON Parser', 
                            type: 'json-parse', 
                            icon: '🔧', 
                            description: 'Parse JSON and extract fields', 
                            color: 'bg-blue-500',
                            features: ['Dot notation', 'Error handling', 'Field extraction']
                          },
                          { 
                            name: 'API Request', 
                            type: 'api-request', 
                            icon: '🌐', 
                            description: 'Production-grade HTTP/REST API client', 
                            color: 'bg-gradient-to-r from-green-500 to-teal-500',
                            features: ['All HTTP methods', 'Auth support', 'Auto retries', 'Response parsing']
                          },
                        ].map((node) => (
                          <div
                            key={node.name}
                            className="group p-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                            draggable
                            onDragStart={(e) => onDragStart(e, node.type)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 ${node.color} rounded-lg text-white text-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                                {node.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                                  {node.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
                                  {node.description}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {node.features.map((feature, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Logic & Control */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                        Logic & Control
                      </h3>
                      <div className="space-y-2">
                        {[
                          { 
                            name: 'If/Else', 
                            type: 'if-else', 
                            icon: '🔀', 
                            description: 'Conditional logic with expressions', 
                            color: 'bg-purple-500',
                            features: ['JavaScript expressions', 'Dual outputs', 'Variable support']
                          },
                        ].map((node) => (
                          <div
                            key={node.name}
                            className="group p-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-700/50 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                            draggable
                            onDragStart={(e) => onDragStart(e, node.type)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 ${node.color} rounded-lg text-white text-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                                {node.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                                  {node.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
                                  {node.description}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {node.features.map((feature, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI & Intelligence */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-gradient-to-r from-sakura-500 to-pink-500 rounded-full animate-pulse"></span>
                        AI & Intelligence
                      </h3>
                      <div className="space-y-2">
                        {[
                          { 
                            name: 'LLM Chat', 
                            type: 'llm', 
                            icon: '🧠', 
                            description: 'Large Language Model interface', 
                            color: 'bg-gradient-to-r from-sakura-500 to-pink-500',
                            features: ['Multi-model support', 'Image input', 'Memory integration']
                          },
                          { 
                            name: 'Structured LLM', 
                            type: 'structured-llm', 
                            icon: '📊', 
                            description: 'Generate structured JSON with any OpenAI-compatible API', 
                            color: 'bg-gradient-to-r from-purple-500 to-indigo-500',
                            features: ['Universal API support', 'Auto-fallback', 'JSON validation', 'Ollama compatible']
                          },
                          { 
                            name: 'Whisper Transcription', 
                            type: 'whisper-transcription', 
                            icon: '🎙️', 
                            description: 'Transcribe binary audio data using OpenAI Whisper', 
                            color: 'bg-gradient-to-r from-teal-500 to-cyan-500',
                            features: ['Binary input', 'Multi-format', 'High accuracy', 'Language detection']
                          },
                        ].map((node) => (
                          <div
                            key={node.name}
                            className="group p-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-700/50 hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden"
                            draggable
                            onDragStart={(e) => onDragStart(e, node.type)}
                          >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-sakura-100 to-transparent dark:from-sakura-900/30 rounded-bl-full opacity-50"></div>
                            <div className="flex items-start gap-3 relative">
                              <div className={`p-2.5 ${node.color} rounded-lg text-white text-lg flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg`}>
                                {node.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2">
                                  {node.name}
                                  <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-full font-medium">AI</span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
                                  {node.description}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {node.features.map((feature, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-gradient-to-r from-sakura-100 to-pink-100 dark:from-sakura-900/50 dark:to-pink-900/50 text-sakura-700 dark:text-sakura-300 rounded-full">
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Custom Nodes */}
                    {customNodes.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-pulse"></span>
                          Custom Nodes
                          <span className="ml-auto text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                            {customNodes.length}
                          </span>
                        </h3>
                        <div className="space-y-2">
                          {customNodes.map((node) => (
                            <div
                              key={node.id}
                              className="group p-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-700/50 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden"
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                            >
                              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-100 to-transparent dark:from-purple-900/30 rounded-bl-full opacity-50"></div>
                              <div className="flex items-start gap-3 relative">
                                <div className="p-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg text-white text-lg flex-shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                                  {node.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2">
                                    {node.name}
                                    <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-full font-medium">CUSTOM</span>
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
                                    {node.description}
                                  </div>
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {node.metadata?.tags?.slice(0, 3).map((tag, idx) => (
                                      <span key={idx} className="text-xs px-2 py-0.5 bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/50 dark:to-indigo-900/50 text-purple-700 dark:text-purple-300 rounded-full">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs text-gray-400">
                                      {node.inputs.length} inputs • {node.outputs.length} outputs
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditCustomNode(node);
                                        }}
                                        className="p-1 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
                                        title="Edit node"
                                      >
                                        <Settings className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCustomNode(node.type);
                                        }}
                                        className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                        title="Delete node"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {/* Add New Custom Node Button */}
                          <div
                            onClick={handleCreateCustomNode}
                            className="group p-4 glassmorphic-card rounded-xl border-2 border-dashed border-purple-300/50 dark:border-purple-700/50 hover:border-purple-400 dark:hover:border-purple-500 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                          >
                            <div className="flex items-center justify-center gap-3">
                              <div className="p-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg text-white text-lg group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4" />
                              </div>
                              <div className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                                Create Custom Node
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pro Tips */}
                    <div className="pt-4 border-t border-white/20 dark:border-gray-700/50">
                      <div className="p-4 glassmorphic-card rounded-xl border border-blue-300/50 dark:border-blue-800/50">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-500 rounded-lg text-white text-sm flex-shrink-0">
                            💡
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                              Pro Tips
                            </h4>
                            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                              <li>• <span className="font-medium">Copy/Paste:</span> Select a node and press Ctrl+C (Cmd+C) to copy, Ctrl+V (Cmd+V) to paste</li>
                              <li>• <span className="font-medium">Delete:</span> Use the X button on each node to remove it</li>
                              <li>• <span className="font-medium">Save:</span> Press Ctrl+S (Cmd+S) to save your workflow</li>
                              <li>• Use JSON Parser to extract specific fields from API responses</li>
                              <li>• If/Else nodes support complex JavaScript expressions</li>
                              <li>• Image Input automatically converts to base64 for AI models</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Canvas Area */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Canvas Header */}
              <div className="glassmorphic px-6 py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Canvas • {currentFlow ? `${currentFlow.name}` : 'No flow selected'}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Zoom: {Math.round(canvas.viewport.zoom * 100)}%</span>
                    <span>•</span>
                    <span>{nodes.length} nodes</span>
                  </div>
                </div>
              </div>

              {/* Canvas */}
              {!currentFlow ? (
                /* Welcome State */
                <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50/50 to-gray-100/50 dark:from-gray-900/50 dark:to-gray-800/50 overflow-hidden">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center text-3xl">
                      🧠
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      Welcome to Agent Studio
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Create a new flow or import an existing one to start building powerful AI agents.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button 
                        onClick={handleCreateNew}
                        className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        + Create New Flow
                      </button>
                      <button className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors">
                        Browse Templates
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ReactFlow Canvas */
                <div className="flex-1 overflow-hidden">
                  <Canvas className="w-full h-full" />
                </div>
              )}
            </div>

            {/* Execution Log Panel */}
            {isExecutionLogOpen && (
              <div className="w-96 glassmorphic flex flex-col overflow-hidden min-h-0">
                <div className="p-4 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      <Terminal className="w-5 h-5" />
                      Execution Log
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={clearExecutionLogs}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                        title="Clear logs"
                      >
                        Clear
                      </button>
                      <button
                        onClick={toggleExecutionLog}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Close log"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>{executionLogs.length} entries</span>
                    {isExecuting && (
                      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span>Executing...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Log Entries */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2" ref={logContainerRef}>
                  {executionLogs.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                      <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No execution logs yet</p>
                      <p className="text-xs mt-1">Run a flow to see execution details</p>
                    </div>
                  ) : (
                    executionLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg border text-sm ${
                          log.level === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : log.level === 'warning'
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                            : log.level === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-0.5">
                            {log.level === 'error' ? (
                              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                            ) : log.level === 'warning' ? (
                              <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            ) : log.level === 'success' ? (
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${
                              log.level === 'error'
                                ? 'text-red-800 dark:text-red-200'
                                : log.level === 'warning'
                                ? 'text-yellow-800 dark:text-yellow-200'
                                : log.level === 'success'
                                ? 'text-green-800 dark:text-green-200'
                                : 'text-blue-800 dark:text-blue-200'
                            }`}>
                              {log.message}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <Clock className="w-3 h-3" />
                              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                              {log.duration && (
                                <>
                                  <span>•</span>
                                  <span>{log.duration}ms</span>
                                </>
                              )}
                              {log.nodeName && (
                                <>
                                  <span>•</span>
                                  <span>{log.nodeName}</span>
                                </>
                              )}
                            </div>
                            {log.data && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:text-gray-800 dark:hover:text-gray-100">
                                  Show details
                                </summary>
                                <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-gray-700 dark:text-gray-300">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Error Display */}
      {importError && (
        <div className="fixed top-4 right-4 max-w-md p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 shadow-lg z-50">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{importError}</span>
          <button 
            onClick={() => setImportError(null)}
            className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
          >
            <X className="w-3 h-3 text-red-500" />
          </button>
        </div>
      )}

      {/* Workflow Manager Modal */}
      <WorkflowManager
        isOpen={isWorkflowManagerOpen}
        onClose={() => setIsWorkflowManagerOpen(false)}
        onLoadWorkflow={loadFlow}
      />

      {/* New Flow Modal */}
      <NewFlowModal
        isOpen={isNewFlowModalOpen}
        onClose={() => setIsNewFlowModalOpen(false)}
        onConfirm={handleConfirmNewFlow}
      />

      {/* Node Creator Modal */}
      <NodeCreator
        isOpen={isNodeCreatorOpen}
        onClose={() => setIsNodeCreatorOpen(false)}
        onSave={handleSaveCustomNode}
        editingNode={editingCustomNode}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        currentFlow={currentFlow ? { ...currentFlow, nodeCount: nodes.length } : null}
        hasCustomNodes={hasCustomNodes}
      />

      {/* UI Builder */}
      <UIBuilder
        isOpen={isUIBuilderOpen}
        onClose={() => setIsUIBuilderOpen(false)}
      />
      </div>
    </div>
  );
};

const AgentStudio: React.FC<AgentStudioProps> = ({ onPageChange, userName, editingAgentId }) => {
  return (
    <AgentBuilderProvider>
      <AgentStudioContent onPageChange={onPageChange} userName={userName} editingAgentId={editingAgentId} />
    </AgentBuilderProvider>
  );
};

export default AgentStudio; 
