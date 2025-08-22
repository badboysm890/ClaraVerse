import React, { useState, useEffect } from 'react';
import { XCircle, Bot, Info, Star, LayoutGrid, Briefcase, RefreshCw, Workflow, Upload, Play, Monitor } from 'lucide-react';

interface WidgetOption {
  id: string;
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'system' | 'productivity';
  preview: React.ReactNode;
}

interface AddWidgetModalProps {
  onClose: () => void;
  onAddWidget: (type: string, data?: any) => void;
  onAddFlowWidget?: (name: string, flowData: any) => void;
  onResetDefault?: () => void;
}

const AVAILABLE_WIDGETS: WidgetOption[] = [
  {
    id: 'welcome',
    type: 'welcome',
    name: 'Welcome',
    description: 'Introduction and quick actions for angela',
    icon: <Bot className="w-5 h-5" />,
    category: 'system',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-sakura-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Welcome to angela</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">Your AI assistant powered by Ollama...</p>
      </div>
    )
  },
  {
    id: 'privacy',
    type: 'privacy',
    name: 'Privacy Notice',
    description: 'Information about angela\'s privacy and security',
    icon: <Info className="w-5 h-5" />,
    category: 'system',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-sakura-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Private & Secure</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">angela runs locally on your machine...</p>
      </div>
    )
  },
  {
    id: 'whats-new',
    type: 'whats-new',
    name: 'What\'s New',
    description: 'Latest updates and features in angela',
    icon: <Star className="w-5 h-5" />,
    category: 'system',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-sakura-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">What's New in angela</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">Latest updates and improvements...</p>
      </div>
    )
  },
  {
    id: 'gpu-monitor',
    type: 'gpu-monitor',
    name: 'GPU Monitor',
    description: 'Real-time GPU usage, memory, temperature, and performance stats',
    icon: <Monitor className="w-5 h-5" />,
    category: 'system',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">GPU Monitor</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">Live GPU stats for AI workloads...</p>
        <div className="mt-2 flex items-center gap-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Real-time Monitoring</span>
        </div>
      </div>
    )
  },
  {
    id: 'system-resources',
    type: 'system-resources',
    name: 'System Resources Graph',
    description: 'Real-time graphical view of CPU, RAM, GPU, and VRAM usage over time',
    icon: <LayoutGrid className="w-5 h-5" />,
    category: 'system',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">System Resources Graph</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">Interactive graphs for system performance...</p>
        <div className="mt-2 flex items-center gap-1">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Real-time Graphing</span>
        </div>
      </div>
    )
  },
  {
    id: 'flow-widget',
    type: 'flow-widget',
    name: 'Flow Widget',
    description: 'Import and execute your Agent Studio flows with real AI processing',
    icon: <Workflow className="w-5 h-5" />,
    category: 'productivity',
    preview: (
      <div className="p-3 bg-gray-500/5 dark:bg-gray-300/5 rounded-lg">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-sakura-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Agent Flow</h3>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">Real AI execution with live results...</p>
        <div className="mt-2 flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Real AI Execution</span>
        </div>
      </div>
    )
  }
];

const AddWidgetModal: React.FC<AddWidgetModalProps> = ({ onClose, onAddWidget, onAddFlowWidget, onResetDefault }) => {
  const [selectedCategory, setSelectedCategory] = React.useState<'system' | 'productivity'>('system');
  const [selectedWidget, setSelectedWidget] = React.useState<string | null>(null);

  // Flow widget form state
  const [flowWidgetName, setFlowWidgetName] = useState('');
  const [flowData, setFlowData] = useState<any>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [flowFileName, setFlowFileName] = useState<string>('');

  // Filter widgets by category
  const filteredWidgets = AVAILABLE_WIDGETS.filter(widget => widget.category === selectedCategory);

  const isFlowWidgetSelected = selectedWidget === 'flow-widget';
  const isFlowWidgetFormValid = flowWidgetName.trim() !== '' && flowData !== null;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setFlowError('Please select a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedFlow = JSON.parse(content);
        
        // More flexible validation - check for common flow export formats
        const hasValidStructure = 
          parsedFlow && 
          typeof parsedFlow === 'object' && 
          (
            // Standard flow export format
            (parsedFlow.nodes && Array.isArray(parsedFlow.nodes)) ||
            // Alternative format - flow data might be nested
            (parsedFlow.flow && parsedFlow.flow.nodes && Array.isArray(parsedFlow.flow.nodes)) ||
            // Another alternative - direct nodes array
            (Array.isArray(parsedFlow) && parsedFlow.some((item: any) => item.type))
          );

        if (!hasValidStructure) {
          console.log('Parsed flow structure:', parsedFlow);
          setFlowError(`Invalid flow file format. Expected a flow with nodes array. Found: ${Object.keys(parsedFlow).join(', ')}`);
          return;
        }

        // Normalize the flow data structure
        let normalizedFlow = parsedFlow;
        
        // If flow data is nested under 'flow' property
        if (parsedFlow.flow && parsedFlow.flow.nodes) {
          normalizedFlow = parsedFlow.flow;
        }
        
        // If it's a direct array of nodes, wrap it
        if (Array.isArray(parsedFlow)) {
          normalizedFlow = {
            name: file.name.replace('.json', ''),
            nodes: parsedFlow,
            edges: []
          };
        }

        // Ensure we have required properties
        if (!normalizedFlow.name) {
          normalizedFlow.name = file.name.replace('.json', '');
        }
        
        if (!normalizedFlow.nodes) {
          normalizedFlow.nodes = [];
        }

        setFlowData(normalizedFlow);
        setFlowFileName(file.name);
        setFlowError(null);
        
        // Auto-populate name if not set
        if (!flowWidgetName) {
          setFlowWidgetName(normalizedFlow.name || file.name.replace('.json', ''));
        }
      } catch (error) {
        console.error('JSON parsing error:', error);
        setFlowError('Failed to parse JSON file. Please check the file format and ensure it\'s valid JSON.');
        setFlowData(null);
        setFlowFileName('');
      }
    };
    reader.readAsText(file);
  };

  const handleAddWidget = () => {
    if (selectedWidget) {
      const widget = AVAILABLE_WIDGETS.find(w => w.id === selectedWidget);
      if (widget) {
        if (widget.id === 'flow-widget' && onAddFlowWidget) {
          if (!isFlowWidgetFormValid) {
            setFlowError('Please enter a name and upload a flow file');
            return;
          }
          onAddFlowWidget(flowWidgetName, flowData);
        } else {
          onAddWidget(widget.type);
        }
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div 
        className="glassmorphic rounded-2xl shadow-lg w-full max-w-4xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-48 flex flex-col h-full border-r border-gray-200/10 dark:border-gray-700/10">
            <div className="p-4 border-b border-gray-200/10 dark:border-gray-700/10">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Widget</h2>
            </div>
            
            {/* Categories */}
            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold mb-4 text-gray-900 dark:text-white">Categories</h3>
              <div className="space-y-2">
                <button
                  className={`w-full px-3 py-2 rounded-lg text-left text-sm flex items-center gap-2 transition-colors ${
                    selectedCategory === 'system'
                      ? 'bg-sakura-500/10 text-sakura-500'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-500/5 dark:hover:bg-gray-300/5'
                  }`}
                  onClick={() => setSelectedCategory('system')}
                >
                  <LayoutGrid className="w-4 h-4" />
                  System Widgets
                </button>
                <button
                  className={`w-full px-3 py-2 rounded-lg text-left text-sm flex items-center gap-2 transition-colors ${
                    selectedCategory === 'productivity'
                      ? 'bg-sakura-500/10 text-sakura-500'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-500/5 dark:hover:bg-gray-300/5'
                  }`}
                  onClick={() => setSelectedCategory('productivity')}
                >
                  <Briefcase className="w-4 h-4" />
                  Productivity
                </button>
              </div>
            </div>
            
            {/* Action Buttons in Sidebar */}
            <div className="p-4 border-t border-gray-200/10 dark:border-gray-700/10 space-y-2">
              {onResetDefault && (
                <button
                  className="w-full px-3 py-2 border border-sakura-500 text-sakura-500 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-900/10 transition-colors flex items-center justify-center gap-2 text-sm"
                  onClick={onResetDefault}
                  type="button"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset to Default
                </button>
              )}
              <button
                className={`w-full px-3 py-2 rounded-lg text-white transition-colors text-sm flex items-center justify-center gap-2 ${
                  selectedWidget && !((isFlowWidgetSelected && !isFlowWidgetFormValid))
                    ? 'bg-sakura-500 hover:bg-sakura-600 cursor-pointer' 
                    : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                }`}
                disabled={!selectedWidget || (isFlowWidgetSelected && !isFlowWidgetFormValid)}
                onClick={handleAddWidget}
              >
                Add Widget
              </button>
              <button
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-200/10 dark:border-gray-700/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedWidget === 'flow-widget' ? 'Configure Flow Widget' : 'Select Widget'}
              </h2>
              <button 
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={onClose}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Widget Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-4 auto-rows-max max-h-[calc(100vh-20rem)] overflow-y-auto p-1">
                {filteredWidgets.map(widget => (
                  <div
                    key={widget.id}
                    className={`p-3 rounded-xl cursor-pointer transition-all bg-gray-500/5 dark:bg-gray-300/5 hover:bg-gray-500/10 dark:hover:bg-gray-300/10 h-[160px] flex flex-col ${
                      selectedWidget === widget.id
                        ? 'ring-1 ring-sakura-500'
                        : ''
                    }`}
                    onClick={() => setSelectedWidget(widget.id)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-500/10 dark:bg-gray-300/10 rounded-lg">
                        {widget.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">{widget.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{widget.description}</p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">{widget.preview}</div>
                  </div>
                ))}
              </div>
              
              {/* Flow Widget Configuration Form */}
              {isFlowWidgetSelected && (
                <div className="mt-6 bg-gray-500/5 dark:bg-gray-300/5 p-4 rounded-lg max-h-[60vh] overflow-y-auto">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-4">Flow Widget Configuration</h3>
                  
                  {flowError && (
                    <div className="mb-4 text-red-500 text-sm">{flowError}</div>
                  )}
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Widget Name</label>
                      <input 
                        type="text"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg"
                        placeholder="My Flow Widget"
                        value={flowWidgetName}
                        onChange={(e) => setFlowWidgetName(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Flow File</label>
                      <div className="relative">
                        <input 
                          type="file"
                          accept=".json"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="flow-file-input"
                        />
                        <label 
                          htmlFor="flow-file-input"
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          {flowFileName ? flowFileName : 'Choose flow JSON file...'}
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Upload a flow exported from Agent Studio (.json file)</p>
                    </div>

                    {flowData && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0">
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <Play className="w-2 h-2 text-white" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
                              Flow Loaded: {flowData.name}
                            </h4>
                            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                              {flowData.nodes?.length || 0} nodes • 
                              {flowData.description ? ` ${flowData.description}` : ' Ready to execute'}
                            </div>
                            {flowData.nodes && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {flowData.nodes
                                  .filter((node: any) => node.type === 'input' || node.type === 'output')
                                  .slice(0, 3)
                                  .map((node: any, idx: number) => (
                                    <span 
                                      key={idx}
                                      className={`text-xs px-2 py-0.5 rounded-full ${
                                        node.type === 'input' 
                                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                      }`}
                                    >
                                      {node.type}: {node.data?.label || 'Unlabeled'}
                                    </span>
                                  ))}
                                {flowData.nodes.filter((node: any) => node.type === 'input' || node.type === 'output').length > 3 && (
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                                    +{flowData.nodes.filter((node: any) => node.type === 'input' || node.type === 'output').length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Real Agent Studio Execution:</h4>
                      <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                        <li>• Export any flow from Agent Studio as JSON</li>
                        <li>• Upload it here to create an interactive widget</li>
                        <li>• Input nodes become form fields you can fill</li>
                        <li>• <strong>Real AI processing</strong> with Ollama/OpenAI models</li>
                        <li>• <strong>Live API calls</strong> and actual data processing</li>
                        <li>• View execution logs and real-time progress</li>
                      </ul>
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                        <p className="text-xs font-medium text-green-800 dark:text-green-200">
                          🧠 Powered by the same execution engine as Agent Studio
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddWidgetModal;
