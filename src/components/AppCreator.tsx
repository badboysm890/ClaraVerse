import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Check,
  X,
  Maximize,
  Minimize,
} from 'lucide-react';
import { addEdge, useNodesState, useEdgesState, Node, Connection } from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from '../hooks/useTheme';
import TopBar from './appcreator_components/TopBar';
import ToolsSidebar from './appcreator_components/ToolsSidebar';
import FlowCanvas from './appcreator_components/FlowCanvas';
import { getAllNodeTypes, getToolItems } from './appcreator_components/nodes/NodeRegistry';
import { executeFlow, generateExecutionPlan } from '../ExecutionEngine';
import DebugModal from './DebugModal';
import { OllamaProvider } from '../context/OllamaContext';
import { appStore } from '../services/AppStore';
import SaveAppModal from './appcreator_components/SaveAppModal';
import DraftRestoreModal from './appcreator_components/DraftRestoreModal';
import AppRunner from './AppRunner';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

// Helper to convert a tool ID (e.g., "api_call") to a node type key (e.g., "apiCallNode")
const convertToolIdToNodeType = (toolId: string): string => {
  const parts = toolId.split('_');
  const camelCase =
    parts[0] + parts.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return camelCase + 'Node';
};

interface AppCreatorProps {
  onPageChange: (page: string) => void;
  appId?: string;
}

const AppCreator: React.FC<AppCreatorProps> = ({ onPageChange, appId }) => {
  const { isDark } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [executionJson, setExecutionJson] = useState<any>(null);
  const [appName, setAppName] = useState('New App');
  const [appDescription, setAppDescription] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentAppId, setCurrentAppId] = useState<string | undefined>(appId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [appIcon, setAppIcon] = useState('Activity');
  const [appColor, setAppColor] = useState('#3B82F6');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string; visible: boolean; }>({
    type: 'success',
    message: '',
    visible: false,
  });
  const [messageHistory, setMessageHistory] = useState<any[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'running' | 'completed' | 'error'>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(window.innerWidth * 0.2);

  // Sidebar resizing state
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Instead of hardcoding toolItems, get them dynamically from node metadata
  const toolItems = useMemo(() => getToolItems(), []);

  // Use a ref to store the nodeTypes so they remain stable across renders
  const nodeTypesRef = useRef(getAllNodeTypes());
  const nodeTypes = nodeTypesRef.current;

  useEffect(() => {
    if (appId) {
      loadApp(appId);
    } else {
      const draftData = localStorage.getItem('app_draft');
      if (draftData) {
        try {
          const draft = JSON.parse(draftData);
          setShowDraftModal(true);
        } catch (error) {
          console.error('Error parsing draft data:', error);
          resetAppState();
        }
      } else {
        resetAppState();
      }
    }
  }, [appId]);

  // Save draft when changes are made
  useEffect(() => {
    // Skip initial render and only track after loaded
    if (nodes.length > 0 || edges.length > 0) {
      setHasUnsavedChanges(true);
      saveDraft();
    }
  }, [nodes, edges, appName, appDescription, appIcon, appColor]);

  const saveDraft = () => {
    try {
      const draftData = {
        name: appName,
        description: appDescription,
        icon: appIcon,
        color: appColor,
        nodes,
        edges,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('app_draft', JSON.stringify(draftData));
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  };

  const restoreDraft = () => {
    try {
      const draftData = localStorage.getItem('app_draft');
      if (draftData) {
        const draft = JSON.parse(draftData);
        setAppName(draft.name);
        setAppDescription(draft.description);
        setAppIcon(draft.icon || 'Activity');
        setAppColor(draft.color || '#3B82F6');
        
        const restoredNodes = draft.nodes.map((node: Node) => {
          if (node.data && node.data.tool) {
            // Restore tool icon from dynamic toolItems
            const toolDefinition = toolItems.find(t => t.id === node.data.tool.id);
            if (toolDefinition) {
              node.data.tool.icon = toolDefinition.icon;
            }
          }
          return node;
        });
        
        setNodes(restoredNodes);
        setEdges(draft.edges);
        setCurrentAppId(undefined); // This is a draft, not a saved app
        setShowDraftModal(false);
      }
    } catch (error) {
      console.error('Error restoring draft:', error);
      resetAppState();
    }
  };

  const clearDraft = () => {
    localStorage.removeItem('app_draft');
  };

  const resetAppState = () => {
    setNodes([]);
    setEdges([]);
    setAppName('New App');
    setAppDescription('');
    setAppIcon('Activity');
    setAppColor('#3B82F6');
    setCurrentAppId(undefined);
    setShowDraftModal(false);
    clearDraft();
  };

  const handleStartNew = () => {
    resetAppState();
  };

  const loadApp = async (id: string) => {
    try {
      const app = await appStore.getApp(id);
      if (app) {
        setAppName(app.name);
        setAppDescription(app.description);
        setAppIcon(app.icon || 'Activity');
        setAppColor(app.color || '#3B82F6');
        const restoredNodes = app.nodes.map((node: Node) => {
          if (node.data && node.data.tool) {
            // Restore tool icon from dynamic toolItems
            const toolDefinition = toolItems.find(t => t.id === node.data.tool.id);
            if (toolDefinition) {
              node.data.tool.icon = toolDefinition.icon;
            }
          }
          return node;
        });
        setNodes(restoredNodes);
        setEdges(app.edges);
        setCurrentAppId(id);
        setHasUnsavedChanges(false);
        clearDraft(); // Clear any draft when loading a saved app
      }
    } catch (error) {
      console.error('Error loading app:', error);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            type: 'smoothstep',
            style: {
              stroke: isDark ? '#EC4899' : '#F472B6',
              strokeWidth: 2,
            },
          },
          eds
        )
      );
    },
    [setEdges, isDark]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Updated onDrop handler using screenToFlowPosition instead of project
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const toolId = event.dataTransfer.getData('application/reactflow');
      if (!toolId) return;

      // Find the tool metadata by ID
      const tool = toolItems.find((t) => t.id === toolId);
      if (!tool) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeType = convertToolIdToNodeType(toolId);

      const newNode: Node = {
        id: `${toolId}_${Date.now()}`,
        type: nodeType,
        position,
        data: {
          label: tool.name,
          labelStyle: { color: isDark ? '#fff' : '#000' },
          tool: tool,
          inputs: tool.inputs || [],
          outputs: tool.outputs || [],
          config: {},
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, isDark, toolItems]
  );

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, tool: any) => {
    event.dataTransfer.setData('application/reactflow', tool.id);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedTool(tool);
    setIsDragging(true);
  };

  const onDragEnd = () => {
    setSelectedTool(null);
    setIsDragging(false);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message, visible: true });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 3000);
  };

  const internalSaveApp = async (
    name: string,
    description: string,
    icon: string,
    color: string,
  ) => {
    try {
      const processedNodes = nodes.map((node) => {
        const processedNode = { ...node };
        if (node.type === 'baseLlmNode') {
          console.log('Saving LLM node configuration:', node.data.config);
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              prompt: node.data.config.prompt || '',
              model: node.data.config.model || '',
              ollamaUrl: node.data.config.ollamaUrl || '',
            },
          };
        } else if (node.type === 'imageTextLlmNode') {
          console.log('Saving ImageTextLLM node configuration:', node.data.config);
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              systemPrompt: node.data.config.systemPrompt || '',
              model: node.data.config.model || '',
              ollamaUrl: node.data.config.ollamaUrl || '',
            },
          };
        } else if (node.type === 'textOutputNode' || node.type === 'markdownOutputNode') {
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              outputText: '',
            },
          };
        } else if (node.type === 'conditionalNode') {
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              condition: node.data.config.condition || '',
              inputText: node.data.config.inputText || '',
            },
          };
        } else if (node.type === 'getClipboardTextNode') {
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              inputText: node.data.config.inputText || '',
            },
          };
        } else if (node.type === 'concatTextNode') {
          processedNode.data = {
            ...node.data,
            config: {
              ...node.data.config,
              outputText: '',
              topFirst: node.data.config.topFirst !== undefined ? node.data.config.topFirst : true,
            },
          };
        }
        return processedNode;
      });

      let id = currentAppId;
      if (!id) {
        id = await appStore.createApp(name, description);
        setCurrentAppId(id);
        localStorage.setItem('current_app_id', id);
      }
      setAppIcon(icon);
      setAppColor(color);

      await appStore.updateApp(id, {
        name,
        description,
        icon,
        color,
        nodes: processedNodes,
        edges,
      });

      console.log(`App "${name}" saved with ${processedNodes.length} nodes and ${edges.length} edges`);
      showNotification('success', `App "${name}" saved successfully!`);
      setHasUnsavedChanges(false);
      clearDraft(); // Clear the draft after successful save
    } catch (error) {
      console.error('Error saving app:', error);
      showNotification('error', `Error saving app: ${error instanceof Error ? error.message : String(error)}`);
    }
    setShowSaveModal(false);
  };

  const handleOpenSaveModal = () => {
    setShowSaveModal(true);
  };

  const handleCloseSaveModal = () => {
    setShowSaveModal(false);
  };

  const handleTestApp = async () => {
    // Add check for unsaved app
    if (!currentAppId) {
      showNotification('error', 'Save this app to proceed');
      handleOpenSaveModal();
      return;
    }

    setIsExecuting(true);
    setNodeStatuses({});  // Reset node statuses
    try {
      const plan = generateExecutionPlan(nodes, edges);
      const updateNodeOutput = (nodeId: string, output: any) => {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              if (node.type === 'imageOutputNode' || node.type === 'textToImageNode') {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    config: {
                      ...node.data.config,
                      outputImage: output
                    }
                  }
                };
              } else if (node.type === 'textOutputNode' || node.type === 'markdownOutputNode') {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    config: {
                      ...node.data.config,
                      outputText: typeof output === 'string' ? output : JSON.stringify(output),
                    },
                  },
                };
              }
            }
            return node;
          })
        );
      };

      const handleUiUpdate = (type: string, nodeId: string, data: any) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          const isOutputNode = ['textOutputNode', 'markdownOutputNode', 'imageOutputNode'].includes(node.type);
          if (isOutputNode) {
            setMessageHistory(prev => [...prev, {
              id: `ai-${Date.now()}-${nodeId}`,
              content: data,
              type: 'ai',
              timestamp: Date.now(),
              isImage: type === 'image'
            }]);
          }
        }
      };

      const updateNodeStatus = (nodeId: string, status: 'running' | 'completed' | 'error') => {
        setNodeStatuses(prev => ({ ...prev, [nodeId]: status }));
      };

      await executeFlow(plan, updateNodeOutput, handleUiUpdate, updateNodeStatus);
      setIsSuccess(true);
    } catch (error) {
      // ...existing error handling...
    } finally {
      setIsExecuting(false);
    }
  };

  // Highlight the clicked node by updating its style
  const onNodeClick = useCallback((_event: React.MouseEvent, clickedNode: Node) => {
    setSelectedNodeId(clickedNode.id);
    setNodes(nds =>
      nds.map(node => ({
        ...node,
        style: node.id === clickedNode.id 
          ? {
              ...node.style,
              boxShadow: isDark
                ? '0 0 0 2px #EC4899, 0 0 10px 2px rgba(236, 72, 153, 0.5)'
                : '0 0 0 2px #F472B6, 0 0 10px 2px rgba(244, 114, 182, 0.5)',
              zIndex: 1000,
            }
          : { ...node.style, boxShadow: 'none' }
      }))
    );
  }, [isDark, setNodes]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      const sourceType = sourceNode.data.tool.outputs;
      const targetType = targetNode.data.tool.inputs;
      if (!sourceType || !targetType) return false;
      return sourceType.some((type: string) => targetType.includes(type));
    },
    [nodes]
  );

  const handleDebug = () => {
    const plan = generateExecutionPlan(nodes, edges);
    setExecutionJson(plan);
    setDebugOpen(true);
  };

  const closeDebug = () => {
    setDebugOpen(false);
  };

  // Resizable sidebar drag handler
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + (e.clientX - startX);
      if (newWidth > 200 && newWidth < 500) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    console.log('Tool items initialized:', toolItems);
    if (!toolItems.some((tool) => tool.id === 'image_text_llm')) {
      console.warn('Image Text LLM tool not found in toolItems!');
    }
  }, [toolItems]);

  const flowStyles = useMemo(() => ({
    background: isDark ? '#1F2937' : '#F9FAFB',
  }), [isDark]);

  const minimapStyle = useMemo(() => ({
    backgroundColor: isDark ? '#374151' : '#F9FAFB',
    maskColor: isDark ? 'rgba(55, 65, 81, 0.7)' : 'rgba(249, 250, 251, 0.7)',
    nodeBorderRadius: 2,
  }), [isDark]);

  const minimapNodeColor = useMemo(() => (_node: Node) => {
    return isDark ? '#FFFFFFFF' : '#fff';
  }, [isDark]);

  const handleExportApp = () => {
    const exportData = {
      name: appName,
      description: appDescription,
      icon: appIcon,
      color: appColor,
      nodes: nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          // Remove runtime-specific data
          runtimeImage: undefined,
          runtimeInputs: undefined,
          runtimeOutputs: undefined
        }
      })),
      edges: edges
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${appName.replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('success', 'App exported successfully!');
  };

  const handleImportApp = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Basic validation
        if (!importData.nodes || !importData.edges || !importData.name) {
          throw new Error('Invalid app data format');
        }

        // Restore tool icons from registry
        const restoredNodes = importData.nodes.map((node: Node) => {
          if (node.data && node.data.tool) {
            const toolDefinition = toolItems.find(t => t.id === node.data.tool.id);
            if (toolDefinition) {
              node.data.tool.icon = toolDefinition.icon;
            }
          }
          return {
            ...node,
            data: {
              ...node.data,
              config: node.data.config || {}
            }
          };
        });

        // Save as new app
        const newAppId = await appStore.createApp(importData.name, importData.description || '');
        await appStore.updateApp(newAppId, {
          name: importData.name,
          description: importData.description || '',
          icon: importData.icon || 'Activity',
          color: importData.color || '#3B82F6',
          nodes: restoredNodes,
          edges: importData.edges
        });

        // Update UI state
        setNodes(restoredNodes);
        setEdges(importData.edges);
        setAppName(importData.name);
        setAppDescription(importData.description || '');
        setAppIcon(importData.icon || 'Activity');
        setAppColor(importData.color || '#3B82F6');
        setCurrentAppId(newAppId);
        
        showNotification('success', 'App imported successfully!');
      } catch (error) {
        console.error('Error importing app:', error);
        showNotification('error', 'Failed to import app. Invalid format or corrupted file.');
      }
    };
    input.click();
  };

  // When leaving the page, warn if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const handlePreviewResize = (e: any, { size }: { size: { width: number } }) => {
    setPreviewWidth(size.width);
  };

  const togglePreview = () => {
    setPreviewEnabled(prev => !prev);
    // Reset preview width when showing
    if (!previewEnabled) {
      setPreviewWidth(window.innerWidth * 0.2);
    }
  };

  // Modified to do nothing since we don't want to auto-save in preview
  const handlePreviewTest = async () => {
    // Preview testing without saving
    return;
  };

  return (
    <OllamaProvider>
      <div className="flex flex-col h-screen">
        <TopBar
          onPageChange={onPageChange}
          handleOpenSaveModal={handleOpenSaveModal}
          handleTestApp={handleTestApp}
          handleDebug={handleDebug}
          appName={appName}
          setAppName={setAppName}
          isExecuting={isExecuting}
          appId={currentAppId}
          onExportApp={handleExportApp}
          onImportApp={handleImportApp}
          hasUnsavedChanges={hasUnsavedChanges}
          previewEnabled={previewEnabled}
          onTogglePreview={togglePreview}
        />
        <div className="flex flex-1 overflow-hidden">
          <div
            ref={sidebarRef}
            style={{ width: sidebarWidth }}
            className="relative flex-shrink-0 border-r border-gray-200 dark:border-gray-700"
          >
            <ToolsSidebar
              toolItems={toolItems}
              isDark={isDark}
              selectedTool={selectedTool}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
            <div onMouseDown={handleMouseDown} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize z-10" />
          </div>

          <div className="flex flex-1">
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              setReactFlowInstance={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              flowStyles={flowStyles}
              isDark={isDark}
              reactFlowWrapper={reactFlowWrapper}
              selectedTool={selectedTool}
              isDragging={isDragging}
              isValidConnection={isValidConnection}
              minimapStyle={minimapStyle}
              minimapNodeColor={minimapNodeColor}
              nodeStatuses={nodeStatuses}
              style={{ width: previewEnabled ? `calc(100% - ${previewWidth}px)` : '100%' }}
            />

            {previewEnabled && (
              <ResizableBox
                width={previewWidth}
                height={Infinity}
                minConstraints={[300, Infinity]}
                maxConstraints={[800, Infinity]}
                onResize={handlePreviewResize}
                handle={<div className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-gray-200 dark:bg-gray-700 hover:bg-sakura-500 dark:hover:bg-sakura-400" />}
                axis="x"
                resizeHandles={['w']}
              >
                <div className="h-full border-l border-gray-200 dark:border-gray-700">
                  <AppRunner
                    appId={currentAppId}
                    onBack={() => {}}
                    isEmbedded={true}
                    nodes={nodes}
                    edges={edges}
                    onSaveRequest={handlePreviewTest}
                  />
                </div>
              </ResizableBox>
            )}
          </div>
        </div>
        {notification.visible && (
          <div
            className={`fixed bottom-6 right-6 py-3 px-4 rounded-lg shadow-lg flex items-center gap-3 transition-all duration-300 transform ${
              notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {notification.type === 'success' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
            <p className="font-medium">{notification.message}</p>
            <button onClick={() => setNotification((prev) => ({ ...prev, visible: false }))} className="ml-2 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {debugOpen && executionJson && <DebugModal jsonData={executionJson} onClose={closeDebug} />}
        {showSaveModal && (
          <SaveAppModal
            initialName={appName}
            initialDescription={appDescription}
            initialIcon={appIcon}
            initialColor={appColor}
            onSave={internalSaveApp}
            onCancel={handleCloseSaveModal}
          />
        )}
        {showDraftModal && (
          <DraftRestoreModal
            onRestore={restoreDraft}
            onStartNew={handleStartNew}
            onCancel={() => setShowDraftModal(false)}
          />
        )}
      </div>
    </OllamaProvider>
  );
};

export default AppCreator;
