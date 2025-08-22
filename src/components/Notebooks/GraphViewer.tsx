import React, { useState, useEffect } from 'react';
import { X, Network, ZoomIn, ZoomOut, RefreshCw, AlertCircle, Eye, EyeOff, Globe, Grid3X3 } from 'lucide-react';
import { angelaNotebookService, GraphData } from '../../services/angelaNotebookService';

interface GraphViewerProps {
  notebookId: string;
  onClose: () => void;
}

// Helper function to safely render unknown values
const renderSafeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  try {
    return String(value);
  } catch {
    return '';
  }
};

const GraphViewer: React.FC<GraphViewerProps> = ({ notebookId, onClose }) => {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isBackendHealthy, setIsBackendHealthy] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphData['nodes'][0] | null>(null);
  const [showNodeDetails, setShowNodeDetails] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'nodes' | 'html'>('nodes');
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoadingHtml, setIsLoadingHtml] = useState(false);

  // Subscribe to backend health changes
  useEffect(() => {
    const unsubscribe = angelaNotebookService.onHealthChange(setIsBackendHealthy);
    return unsubscribe;
  }, []);

  // Load graph data when component mounts or when backend becomes healthy
  useEffect(() => {
    if (isBackendHealthy) {
      loadGraphData();
    }
  }, [notebookId, isBackendHealthy]);

  // Load HTML content when switching to HTML view
  useEffect(() => {
    if (viewMode === 'html' && isBackendHealthy && !htmlContent) {
      loadHtmlGraph();
    }
  }, [viewMode, isBackendHealthy, htmlContent]);

  const loadHtmlGraph = async () => {
    if (!isBackendHealthy) {
      setError('Notebook backend is not available');
      return;
    }

    setIsLoadingHtml(true);
    try {
      const response = await fetch(angelaNotebookService.getGraphHtmlUrl(notebookId));
      if (!response.ok) {
        throw new Error(`Failed to load HTML graph: ${response.statusText}`);
      }
      const html = await response.text();
      setHtmlContent(html);
    } catch (err) {
      console.error('Failed to load HTML graph:', err);
      setError(err instanceof Error ? err.message : 'Failed to load HTML graph');
    } finally {
      setIsLoadingHtml(false);
    }
  };

  const loadGraphData = async () => {
    if (!isBackendHealthy) {
      setError('Notebook backend is not available');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await angelaNotebookService.getGraphData(notebookId);
      setGraphData(data);
    } catch (err) {
      console.error('Failed to load graph data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
      // Set empty graph data as fallback
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleReset = () => {
    setZoom(1);
    setSelectedNode(null);
  };

  // Get unique node types for filtering
  const getNodeTypes = () => {
    if (!graphData) return [];
    const types = new Set(graphData.nodes.map(node => node.type));
    return Array.from(types);
  };

  // Filter nodes based on type
  const getFilteredNodes = () => {
    if (!graphData) return [];
    if (filterType === 'all') return graphData.nodes;
    return graphData.nodes.filter(node => node.type === filterType);
  };

  // Get edges for filtered nodes
  const getFilteredEdges = () => {
    if (!graphData) return [];
    const filteredNodes = getFilteredNodes();
    const nodeIds = new Set(filteredNodes.map(node => node.id));
    return graphData.edges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
  };

  const getNodeColor = (nodeType: string) => {
    const colors: Record<string, string> = {
      'entity': 'bg-blue-500',
      'person': 'bg-green-500',
      'organization': 'bg-blue-600',
      'location': 'bg-red-500',
      'concept': 'bg-gray-500',
      'event': 'bg-sakura-500',
      'default': 'bg-gray-500'
    };
    return colors[nodeType.toLowerCase()] || colors.default;
  };

  const renderGraphVisualization = () => {
    const filteredNodes = getFilteredNodes();
    const filteredEdges = getFilteredEdges();

    if (filteredNodes.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <Network className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No nodes to display
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {filterType === 'all' 
                ? "Upload documents and chat with the notebook to generate the knowledge graph."
                : `No nodes of type "${filterType}" found.`
              }
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex overflow-hidden">
        {/* Main Graph Area - Uses CSS Grid for precise height control */}
        <div className="flex-1 grid grid-rows-[1fr_auto] bg-gray-50 dark:bg-gray-900 min-h-0">
          {/* Nodes Grid - Scrollable area with fixed height */}
          <div className="overflow-y-auto min-h-0">
            <div className="p-4">
              <div 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              >
                {filteredNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedNode?.id === node.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    } bg-white dark:bg-gray-800 shadow-sm hover:shadow-md`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${getNodeColor(node.type)}`}></div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {node.type}
                      </span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1 line-clamp-2">
                      {node.label}
                    </h4>
                    {node.properties?.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {String(renderSafeValue(node.properties.description))}
                      </p>
                    )}
                    
                    {/* Connection count */}
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {filteredEdges.filter(edge => 
                        edge.source === node.id || edge.target === node.id
                      ).length} connections
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Connections Section - Fixed at bottom */}
          {filteredEdges.length > 0 && (
            <div className="bg-white dark:bg-gray-800">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Relationships ({filteredEdges.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {filteredEdges.slice(0, 15).map((edge, index) => {
                    const sourceNode = filteredNodes.find(n => n.id === edge.source);
                    const targetNode = filteredNodes.find(n => n.id === edge.target);
                    
                    return (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {sourceNode?.label || edge.source}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">→</span>
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {targetNode?.label || edge.target}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {edge.relationship}
                          </div>
                        </div>
                        {edge.properties?.weight && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {typeof edge.properties.weight === 'number' 
                              ? edge.properties.weight.toFixed(1)
                              : renderSafeValue(edge.properties.weight)
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredEdges.length > 15 && (
                    <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-1">
                      ... and {filteredEdges.length - 15} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Node Details Panel - Fixed width sidebar */}
        {showNodeDetails && selectedNode && (
          <div className="w-72 bg-white dark:bg-gray-800 flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between p-3">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm">Node Details</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${getNodeColor(selectedNode.type)}`}></div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedNode.label}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {selectedNode.type}
                </div>
              </div>

              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-900 dark:text-white mb-2">Properties</h4>
                  <div className="space-y-1">
                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <div className="text-gray-600 dark:text-gray-400 capitalize">{key}:</div>
                        <div className="text-gray-900 dark:text-white break-words">
                          {String(renderSafeValue(value))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected nodes */}
              <div>
                <h4 className="text-xs font-medium text-gray-900 dark:text-white mb-2">Connections</h4>
                <div className="space-y-1">
                  {filteredEdges
                    .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
                    .slice(0, 10)
                    .map((edge, index) => {
                      const connectedNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const connectedNode = filteredNodes.find(n => n.id === connectedNodeId);
                      
                      return (
                        <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {connectedNode?.label || connectedNodeId}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            via {edge.relationship}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full bg-white dark:bg-gray-900 rounded-lg shadow-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sakura-500 rounded-lg text-white">
            <Network className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Knowledge Graph
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('nodes')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'nodes'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('html')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                viewMode === 'html'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>
          
          {viewMode === 'nodes' && (
            <>
              {/* Node type filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sakura-500"
              >
                <option value="all">All Types</option>
                {getNodeTypes().map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>

              {/* Show/Hide Details */}
              <button
                onClick={() => setShowNodeDetails(!showNodeDetails)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                {showNodeDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-sm font-medium">
                  {showNodeDetails ? "Hide Details" : "Show Details"}
                </span>
              </button>

              {/* Zoom Controls */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg">
                <button
                  onClick={handleZoomOut}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-l-lg transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-r-lg transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="text-sm font-medium">Reset View</span>
              </button>
            </>
          )}
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
            <span className="text-sm font-medium">Close</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex-shrink-0 px-6 py-3 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
            {isBackendHealthy && (
              <button
                onClick={loadGraphData}
                className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-sm underline"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content - Fixed height container */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading knowledge graph...</p>
            </div>
          </div>
        ) : viewMode === 'html' ? (
          <div className="h-full w-full">
            {isLoadingHtml ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading interactive graph...</p>
                </div>
              </div>
            ) : htmlContent ? (
              <iframe
                srcDoc={htmlContent}
                className="w-full h-full border-0"
                title="Interactive Knowledge Graph"
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => {
                  console.log('Graph HTML loaded successfully');
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-gray-600 dark:text-gray-400">Failed to load interactive graph</p>
                  <button
                    onClick={loadHtmlGraph}
                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          renderGraphVisualization()
        )}
      </div>

      {/* Compact Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {graphData && (
            <>
              {getFilteredNodes().length} nodes, {getFilteredEdges().length} connections
              {filterType !== 'all' && ` (${filterType})`}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadGraphData}
            disabled={!isBackendHealthy}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GraphViewer; 
