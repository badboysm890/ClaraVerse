import React, { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  OnConnect,
  NodeTypes,
  ReactFlowInstance,
  OnNodesChange,
  OnEdgesChange,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useAgentBuilder } from '../../../contexts/AgentBuilder/AgentBuilderContext';
import CustomNode from '../Nodes/CustomNode';

// Import all built-in node components
import InputNode from '../Nodes/InputNode';
import OutputNode from '../Nodes/OutputNode';
import JsonParseNode from '../Nodes/JsonParseNode';
import IfElseNode from '../Nodes/IfElseNode';
import LLMNode from '../Nodes/LLMNode';
import StructuredLLMNode from '../Nodes/StructuredLLMNode';
import ImageInputNode from '../Nodes/ImageInputNode';
import TextNode from '../Nodes/TextNode';
import MathNode from '../Nodes/MathNode';
import PDFInputNode from '../Nodes/PDFInputNode';

import FileUploadNode from '../Nodes/FileUploadNode';
import WhisperTranscriptionNode from '../Nodes/WhisperTranscriptionNode';
import CombineTextNode from '../Nodes/CombineTextNode';
import APIRequestNode from '../Nodes/APIRequestNode';
import StaticTextNode from '../Nodes/StaticTextNode';

// Debug: Log successful imports
console.log('Node imports loaded:', {
  InputNode: !!InputNode,
  OutputNode: !!OutputNode,
  JsonParseNode: !!JsonParseNode,
  IfElseNode: !!IfElseNode,
  LLMNode: !!LLMNode,
  StructuredLLMNode: !!StructuredLLMNode,
  ImageInputNode: !!ImageInputNode,
  TextNode: !!TextNode,
  MathNode: !!MathNode,
  PDFInputNode: !!PDFInputNode,

  FileUploadNode: !!FileUploadNode,
  WhisperTranscriptionNode: !!WhisperTranscriptionNode,
  CombineTextNode: !!CombineTextNode,
  APIRequestNode: !!APIRequestNode,
  StaticTextNode: !!StaticTextNode,
});

// Define base node types with proper imports - moved outside component to ensure immediate availability
const baseNodeTypes: NodeTypes = {
  'input': InputNode,
  'output': OutputNode,
  'json-parse': JsonParseNode,
  'if-else': IfElseNode,
  'llm': LLMNode,
  'structured-llm': StructuredLLMNode,
  'image-input': ImageInputNode,
  'pdf-input': PDFInputNode,

  'file-upload': FileUploadNode,
  'whisper-transcription': WhisperTranscriptionNode,
  'combine-text': CombineTextNode,
  'api-request': APIRequestNode,
  'static-text': StaticTextNode,
  'text': TextNode,
  'math': MathNode,
};

// Debug: Log base node types immediately after definition
console.log('Base node types defined:', baseNodeTypes);

// Wrapper component for custom nodes that provides the node definition
const CustomNodeWrapper: React.FC<any> = (props) => {
  const { customNodes } = useAgentBuilder();
  const nodeDefinition = customNodes.find(def => def.type === props.type);
  
  if (!nodeDefinition) {
    console.error(`Custom node definition not found for type: ${props.type}`);
    return <div>Custom node definition not found</div>;
  }
  
  return <CustomNode {...props} nodeDefinition={nodeDefinition} />;
};

interface CanvasProps {
  className?: string;
}

const CanvasContent: React.FC<CanvasProps> = ({ className = '' }) => {
  const {
    nodes,
    connections,
    canvas,
    customNodes,
    executionResults,
    addNode,
    updateNode,
    deleteNode,
    addConnection,
    deleteConnection,
    updateCanvas,
    selectNodes,
    clearSelection,
    duplicateNode,
    addExecutionLog,
    saveFlow,
  } = useAgentBuilder();

  // Clipboard state for copy-paste functionality
  const [clipboard, setClipboard] = useState<{
    nodeData: any;
    timestamp: number;
  } | null>(null);

  // Create dynamic node types that include custom nodes - use useState for immediate initialization
  const [nodeTypes, setNodeTypes] = useState<NodeTypes>(() => {
    const dynamicNodeTypes = { ...baseNodeTypes };
    
    console.log('Base node types registered:', Object.keys(baseNodeTypes));
    console.log('Base node type details:', baseNodeTypes);
    
    console.log('Initial dynamic node types available:', Object.keys(dynamicNodeTypes));
    console.log('Initial nodeTypes object:', dynamicNodeTypes);
    return dynamicNodeTypes;
  });

  // Update nodeTypes when customNodes change
  useEffect(() => {
    const dynamicNodeTypes = { ...baseNodeTypes };
    
    // Add all custom nodes to the nodeTypes
    customNodes.forEach(customNodeDef => {
      dynamicNodeTypes[customNodeDef.type] = CustomNodeWrapper;
      console.log(`Registered custom node type: ${customNodeDef.type}`);
    });
    
    console.log('Updated dynamic node types available:', Object.keys(dynamicNodeTypes));
    console.log('Updated nodeTypes object:', dynamicNodeTypes);
    setNodeTypes(dynamicNodeTypes);
  }, [customNodes]);

  // Convert our internal format to ReactFlow format
  const initialNodes: Node[] = useMemo(() => {
    return nodes.map(node => {
      // Get execution result for this node
      const executionResult = executionResults[node.id];
      
      // For output nodes, pass the execution result as inputValue
      const nodeData: any = {
        ...node.data,
        label: node.name,
        inputs: node.inputs,
        outputs: node.outputs,
        onUpdate: (updates: any) => updateNode(node.id, updates),
        onDelete: () => deleteNode(node.id),
      };

      // Add execution results to node data based on node type
      if (node.type === 'output' && executionResult !== undefined) {
        nodeData.inputValue = executionResult;
      }

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: nodeData,
        selected: canvas.selection.nodeIds.includes(node.id),
        draggable: true,
      };
    });
  }, [nodes, canvas.selection.nodeIds, executionResults, updateNode, deleteNode]);

  // Convert our internal connections to ReactFlow edges
  const initialEdges: Edge[] = useMemo(() => {
    return connections.map(connection => ({
      id: connection.id,
      source: connection.sourceNodeId,
      target: connection.targetNodeId,
      sourceHandle: connection.sourcePortId,
      targetHandle: connection.targetPortId,
      type: 'default',
      animated: false,
    }));
  }, []);

  // Use ReactFlow's internal state management
  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync our context state to ReactFlow state when it changes
  useEffect(() => {
    const newNodes: Node[] = nodes.map(node => {
      // Get execution result for this node
      const executionResult = executionResults[node.id];
      
      const nodeData: any = {
        ...node.data,
        label: node.name,
        inputs: node.inputs,
        outputs: node.outputs,
        onUpdate: (updates: any) => updateNode(node.id, updates),
        onDelete: () => deleteNode(node.id),
      };

      // Add execution results to node data based on node type
      if (node.type === 'output' && executionResult !== undefined) {
        nodeData.inputValue = executionResult;
      }

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: nodeData,
        selected: canvas.selection.nodeIds.includes(node.id),
        draggable: true,
      };
    });

    // Only update if there are actual changes to prevent infinite loops
    const hasChanges = 
      newNodes.length !== reactFlowNodes.length ||
      newNodes.some((node, index) => {
        const existing = reactFlowNodes[index];
        return !existing || 
               node.id !== existing.id || 
               node.position.x !== existing.position.x || 
               node.position.y !== existing.position.y ||
               node.selected !== existing.selected ||
               JSON.stringify(node.data) !== JSON.stringify(existing.data);
      });

    if (hasChanges) {
      setReactFlowNodes(newNodes);
    }
  }, [nodes, canvas.selection.nodeIds, executionResults, updateNode, deleteNode, reactFlowNodes, setReactFlowNodes]);

  // Sync connections to ReactFlow edges
  useEffect(() => {
    const newEdges: Edge[] = connections.map(connection => ({
      id: connection.id,
      source: connection.sourceNodeId,
      target: connection.targetNodeId,
      sourceHandle: connection.sourcePortId,
      targetHandle: connection.targetPortId,
      type: 'default',
      animated: false,
    }));

    // Only update if there are actual changes
    const hasChanges = 
      newEdges.length !== reactFlowEdges.length ||
      newEdges.some((edge, index) => {
        const existing = reactFlowEdges[index];
        return !existing || edge.id !== existing.id;
      });

    if (hasChanges) {
      setReactFlowEdges(newEdges);
    }
  }, [connections, reactFlowEdges, setReactFlowEdges]);

  // Handle ReactFlow node changes and sync back to context
  const handleNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    
    changes.forEach((change) => {
      if (change.type === 'position' && 'position' in change && change.position) {
        // Update node position in our context
        updateNode(change.id, {
          position: change.position
        });
      } else if (change.type === 'select' && 'selected' in change) {
        // Handle selection changes
        const allSelectedNodes = changes
          .filter((c): c is typeof change => c.type === 'select' && 'selected' in c && c.selected)
          .map(c => c.id);
        
        selectNodes(allSelectedNodes);
      } else if (change.type === 'remove') {
        // Handle node deletion (using close button on each node)
        deleteNode(change.id);
      }
    });
  }, [onNodesChange, updateNode, selectNodes, deleteNode]);

  // Handle ReactFlow edge changes and sync back to context
  const handleEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    
    changes.forEach((change) => {
      if (change.type === 'remove') {
        deleteConnection(change.id);
      }
    });
  }, [onEdgesChange, deleteConnection]);

  // Handle new connections
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && connection.sourceHandle && connection.targetHandle) {
      addConnection(
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle
      );
    }
  }, [addConnection]);

  // Handle canvas click to clear selection
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Handle viewport changes
  const onMove = useCallback((_: any, viewport: { x: number; y: number; zoom: number }) => {
    updateCanvas({
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      }
    });
  }, [updateCanvas]);

  // Handle drag over for node dropping
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle node drop from palette
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const nodeType = event.dataTransfer.getData('application/reactflow');
    if (!nodeType) return;

    const reactFlowBounds = (event.target as Element).closest('.react-flow')?.getBoundingClientRect();
    if (!reactFlowBounds) return;

    const position = {
      x: event.clientX - reactFlowBounds.left - canvas.viewport.x,
      y: event.clientY - reactFlowBounds.top - canvas.viewport.y,
    };

    // Adjust for zoom
    position.x = position.x / canvas.viewport.zoom;
    position.y = position.y / canvas.viewport.zoom;

    addNode(nodeType, position);
  }, [addNode, canvas.viewport]);

  // Debug: Log nodeTypes being passed to ReactFlow whenever nodeTypes changes
  useEffect(() => {
    console.log('ReactFlow nodeTypes being passed:', Object.keys(nodeTypes));
  }, [nodeTypes]);

  // Copy selected node to clipboard
  const handleCopyNode = useCallback(() => {
    if (canvas.selection.nodeIds.length !== 1) {
      addExecutionLog({
        level: 'warning',
        message: 'Please select exactly one node to copy'
      });
      return;
    }

    const selectedNodeId = canvas.selection.nodeIds[0];
    const nodeToCopy = nodes.find(node => node.id === selectedNodeId);
    
    if (!nodeToCopy) {
      addExecutionLog({
        level: 'error',
        message: 'Selected node not found'
      });
      return;
    }

    // Store node data in clipboard (excluding ID and position)
    const { id, position, ...nodeDataToCopy } = nodeToCopy;
    setClipboard({
      nodeData: {
        ...nodeDataToCopy,
        // Store original position as reference for relative pasting
        originalPosition: position
      },
      timestamp: Date.now()
    });

    addExecutionLog({
      level: 'success',
      message: `Node "${nodeToCopy.name}" copied to clipboard`,
      data: { nodeType: nodeToCopy.type }
    });
  }, [canvas.selection.nodeIds, nodes, addExecutionLog]);

  // Paste node from clipboard
  const handlePasteNode = useCallback((event: KeyboardEvent) => {
    if (!clipboard || !clipboard.nodeData) return;

    // Check if clipboard data is not too old (5 minutes)
    const clipboardAge = Date.now() - clipboard.timestamp;
    if (clipboardAge > 5 * 60 * 1000) {
      setClipboard(null);
      addExecutionLog({
        level: 'warning',
        message: 'Clipboard data expired'
      });
      return;
    }

    try {
      const { nodeData } = clipboard;
      const { originalPosition, ...restNodeData } = nodeData;

      // Calculate new position - offset from original position
      const offsetX = 50;
      const offsetY = 50;
      const newPosition = {
        x: originalPosition.x + offsetX,
        y: originalPosition.y + offsetY
      };

      // Generate new unique ID
      const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create new node with copied data
      const newNode = {
        ...restNodeData,
        id: newId,
        name: `${restNodeData.name} (Copy)`,
        position: newPosition,
        // Ensure inputs and outputs have clean IDs (no references to original node)
        inputs: restNodeData.inputs.map((input: any) => ({ ...input })),
        outputs: restNodeData.outputs.map((output: any) => ({ ...output }))
      };

      // Add the new node using the context function (this will handle validation and state updates)
      // We'll reconstruct it by using addNode with the type and then updating it
      const addedNode = addNode(restNodeData.type, newPosition);
      
      // Update the added node with the copied data (excluding the auto-generated parts)
      updateNode(addedNode.id, {
        name: newNode.name,
        data: restNodeData.data || {}
      });

      // Select the newly pasted node
      selectNodes([addedNode.id]);

      addExecutionLog({
        level: 'success',
        message: `Node "${newNode.name}" pasted successfully`,
        data: { nodeType: restNodeData.type, newId: addedNode.id }
      });

      // Update clipboard position for next paste (cascade effect)
      setClipboard(prev => prev ? {
        ...prev,
        nodeData: {
          ...prev.nodeData,
          originalPosition: newPosition
        }
      } : null);

    } catch (error) {
      addExecutionLog({
        level: 'error',
        message: `Failed to paste node: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }, [clipboard, addNode, updateNode, selectNodes, addExecutionLog]);

  // Handle save shortcut
  const handleSave = useCallback(async () => {
    try {
      await saveFlow();
      addExecutionLog({
        level: 'success',
        message: 'Workflow saved successfully'
      });
    } catch (error) {
      addExecutionLog({
        level: 'error',
        message: `Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }, [saveFlow, addExecutionLog]);

  // Handle keyboard events for copy-paste and save (removed delete functionality)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when user is typing in input fields or text areas
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement ||
          (event.target instanceof HTMLElement && event.target.isContentEditable)) {
        return;
      }

      // Handle save (Ctrl+S or Cmd+S)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
        return;
      }
      
      // Handle copy (Ctrl+C or Cmd+C)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && canvas.selection.nodeIds.length === 1) {
        event.preventDefault();
        handleCopyNode();
      }
      
      // Handle paste (Ctrl+V or Cmd+V)
      else if ((event.ctrlKey || event.metaKey) && event.key === 'v' && clipboard) {
        event.preventDefault();
        handlePasteNode(event);
      }
    };

    // Add event listener to document to catch keyboard events
    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvas.selection.nodeIds, clipboard, handleCopyNode, handlePasteNode, handleSave]);

  // Category-based colors
  const getCategoryColor = (node: Node): string => {
    const nodeType = node.type;
    switch (nodeType) {
      case 'input':
      case 'output':
        return '#10b981';
      case 'json-parse': return '#3b82f6';
      case 'api-request': return '#10b981';
      case 'if-else': return '#84cc16';
      case 'llm': return '#ec4899';
      case 'structured-llm': return '#8b5cf6';
      case 'image-input': return '#f59e0b';
      case 'pdf-input': return '#3b82f6';
      case 'text': return '#84cc16';
      case 'math': return '#ec4899';
      default: return '#6b7280';
    }
  };

  return (
    <div className={`w-full h-full ${className} focus:outline-none focus:ring-2 focus:ring-sakura-500/20 focus:ring-inset`} tabIndex={0} onMouseDown={(e) => e.currentTarget.focus()}>
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onMove={onMove}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        defaultViewport={canvas.viewport}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        panOnDrag={true}
        selectNodesOnDrag={false}
        attributionPosition="bottom-left"
        className="bg-gray-50 dark:bg-gray-900"
        fitView={false}
        minZoom={0.1}
        maxZoom={3}
        multiSelectionKeyCode={['Meta', 'Ctrl']}
        zoomOnDoubleClick={false}
        key={`reactflow-${nodes.length}-${connections.length}`}
      >
        <Background 
          color="#e5e7eb" 
          gap={20} 
          size={1}
          className="dark:opacity-20"
        />
        <Controls 
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        />
        <MiniMap 
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          nodeColor={getCategoryColor}
        />
      </ReactFlow>
    </div>
  );
};

const Canvas: React.FC<CanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
};

export default Canvas; 
