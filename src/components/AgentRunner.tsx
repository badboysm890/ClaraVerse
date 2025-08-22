import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, FileText, Image, Upload, Calculator, Terminal, Play, Loader2, Settings2, Zap } from 'lucide-react';
import { agentWorkflowStorage } from '../services/agentWorkflowStorage';
import { angelaFlowRunner } from '../../sdk/src/angelaFlowRunner';
import { customNodeManager } from './AgentBuilder/NodeCreator/CustomNodeManager';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface InputValue {
  nodeId: string;
  nodeName: string;
  value: string | File | null;
  type: 'text' | 'file' | 'number';
}

interface AgentRunnerProps {
  agentId: string;
  onClose: () => void;
  onPageChange: (page: string) => void;
  userName?: string;
}

interface SDKExecutionLog {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  duration?: number;
  data?: any;
}

const formatMessage = (content: string) => {
  // Split by lines and process markdown-like formatting
  const lines = content.split('\n');
  return lines.map((line, index) => {
    // Handle headers
    if (line.startsWith('**') && line.endsWith('**')) {
      const text = line.slice(2, -2);
      return (
        <div key={index} className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
          {text}
        </div>
      );
    }
    
    // Handle code blocks
    if (line.startsWith('```') || line.endsWith('```')) {
      return null; // Skip code block markers
    }
    
    // Handle regular lines
    if (line.trim()) {
      return (
        <div key={index} className="text-gray-700 dark:text-gray-300 mb-1">
          {line}
        </div>
      );
    }
    
    return <div key={index} className="h-2" />; // Empty line spacing
  }).filter(Boolean);
};

const AgentRunnerContent: React.FC<AgentRunnerProps> = ({ agentId, onClose, onPageChange, userName }) => {
  // State management - completely independent from AgentBuilderContext
  const [agentFlow, setAgentFlow] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValues, setInputValues] = useState<InputValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<SDKExecutionLog[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load wallpaper from database (same as Agent Studio)
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const { db } = await import('../db');
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

  // Load the agent workflow on component mount
  useEffect(() => {
    const loadAgent = async () => {
      try {
        setAgentLoading(true);
        console.log('🔄 Loading agent workflow:', agentId);
        
        const agent = await agentWorkflowStorage.getWorkflow(agentId);
        if (agent) {
          console.log('✅ Agent loaded successfully:', agent);
          setAgentFlow(agent);
          
          // Extract input nodes for UI
          const inputNodes = agent.nodes.filter((node: any) => 
            node.type === 'input' || 
            node.type === 'image-input' || 
            node.type === 'pdf-input' || 
            node.type === 'file-upload'
          );
          
          console.log('📥 Found input nodes:', inputNodes);
          
          // Initialize input values
          const initialValues = inputNodes.map((node: any) => ({
            nodeId: node.id,
            nodeName: node.name || `Input ${node.id}`,
            value: '',
            type: getInputTypeFromNodeType(node.type)
          }));
          
          setInputValues(initialValues);
        } else {
          console.error('❌ Agent not found:', agentId);
        }
      } catch (error) {
        console.error('❌ Failed to load agent:', error);
      } finally {
        setAgentLoading(false);
      }
    };

    if (agentId) {
      loadAgent();
    }
  }, [agentId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const getInputTypeFromNodeType = (nodeType: string): 'text' | 'file' | 'number' => {
    if (nodeType === 'image-input' || nodeType === 'pdf-input' || nodeType === 'file-upload') {
      return 'file';
    }
    return 'text';
  };

  const convertToSDKFormat = (agentFlow: any): any => {
    // Get custom nodes from the agent flow or fetch them from the custom node manager
    let customNodes = agentFlow.customNodes || [];
    
    // Check if any nodes in the flow are custom nodes and collect their definitions
    const customNodeTypes = new Set<string>();
    
    console.log('🔍 Analyzing nodes for custom types:', agentFlow.nodes.map((n: any) => `${n.name || 'Unnamed'} (${n.type})`));
    
    // Get all known node types from custom node manager first
    let knownCustomNodeTypes = new Set<string>();
    if (customNodeManager && customNodeManager.getCustomNodes) {
      try {
        const allCustomNodes = customNodeManager.getCustomNodes();
        allCustomNodes.forEach((customNode: any) => {
          knownCustomNodeTypes.add(customNode.type);
        });
        console.log('📋 Known custom node types:', Array.from(knownCustomNodeTypes));
      } catch (error) {
        console.warn('⚠️ Error getting all custom nodes:', error);
      }
    }
    
    // Identify custom node types in the flow - check against known types AND use isCustomNode if available
    agentFlow.nodes.forEach((node: any) => {
      let isCustom = false;
      
      // Method 1: Check against known custom node types
      if (knownCustomNodeTypes.has(node.type)) {
        isCustom = true;
        console.log(`✅ Found custom node by type match: ${node.name || node.id} (${node.type})`);
      }
      
      // Method 2: Use isCustomNode method if available
      if (!isCustom && customNodeManager && customNodeManager.isCustomNode && typeof customNodeManager.isCustomNode === 'function') {
        try {
          isCustom = customNodeManager.isCustomNode(node.type);
          if (isCustom) {
            console.log(`✅ Found custom node by isCustomNode method: ${node.name || node.id} (${node.type})`);
          }
        } catch (error) {
          console.warn(`⚠️ Error checking if ${node.type} is custom node:`, error);
        }
      }
      
      // Method 3: Fallback - check if it's not a built-in node type
      if (!isCustom) {
        const builtInTypes = [
          'input', 'output', 'text-input', 'number-input', 'image-input', 'file-input', 'pdf-input', 'file-upload',
          'text-processor', 'math-calculator', 'image-processor', 'pdf-processor', 'llm-text', 'llm-chat',
          'data-formatter', 'conditional', 'loop', 'delay', 'http-request', 'database-query',
          'email-sender', 'file-writer', 'code-executor', 'webhook', 'scheduler'
        ];
        
        if (!builtInTypes.includes(node.type)) {
          isCustom = true;
          console.log(`✅ Found custom node by exclusion: ${node.name || node.id} (${node.type}) - not in built-in types`);
        }
      }
      
      if (isCustom) {
        customNodeTypes.add(node.type);
      }
    });
    
    // If there are custom nodes in the flow, get their full definitions from the manager
    if (customNodeTypes.size > 0 && customNodeManager && customNodeManager.getCustomNode) {
      const customNodeDefinitions = Array.from(customNodeTypes).map(nodeType => {
        const customNode = customNodeManager.getCustomNode(nodeType);
        if (customNode) {
          console.log(`✅ Found custom node definition: ${customNode.name} (${customNode.type})`);
          return {
            id: customNode.id,
            type: customNode.type,
            name: customNode.name,
            description: customNode.description,
            category: customNode.category,
            icon: customNode.icon,
            inputs: customNode.inputs,
            outputs: customNode.outputs,
            properties: customNode.properties,
            executionCode: customNode.executionCode,
            metadata: customNode.metadata
          };
        } else {
          console.warn(`⚠️ Missing custom node definition for type: ${nodeType}`);
        }
        return null;
      }).filter(Boolean);
      
      // Merge with any existing custom nodes in the flow data
      const existingCustomNodeTypes = new Set((customNodes || []).map((node: any) => node.type));
      const newCustomNodes = customNodeDefinitions.filter(node => node && !existingCustomNodeTypes.has(node.type));
      customNodes = [...(customNodes || []), ...newCustomNodes];
    }
    
    return {
      format: 'angela-sdk',
      version: '1.0.0',
      flow: {
        name: agentFlow.name,
        description: agentFlow.description,
        nodes: agentFlow.nodes,
        connections: agentFlow.connections || agentFlow.edges,
      },
      customNodes: customNodes,
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedFrom: 'angela Agent Runner',
        hasCustomNodes: customNodes.length > 0
      }
    };
  };

  const handleInputChange = (nodeId: string, value: string | File) => {
    setInputValues(prev => prev.map(input => 
      input.nodeId === nodeId ? { ...input, value } : input
    ));
  };

  const handleRunAgent = async () => {
    if (!agentFlow || isLoading) return;

    setIsLoading(true);
    setExecutionLogs([]); // Clear previous logs
    setMessages([]); // Clear previous messages

    console.log('🚀 STARTING AGENT EXECUTION - angela Flow SDK Approach');
    console.log('📋 Agent Flow:', agentFlow);
    console.log('📥 Input Values:', inputValues);
    
    // 🔍 DEBUG: Check custom node manager state
    console.log('🔧 Custom Node Manager Debug:');
    console.log('  - Manager available:', !!customNodeManager);
    if (customNodeManager) {
      console.log('  - Has isCustomNode method:', typeof customNodeManager.isCustomNode === 'function');
      console.log('  - Has getCustomNode method:', typeof customNodeManager.getCustomNode === 'function');
      console.log('  - Has getCustomNodes method:', typeof customNodeManager.getCustomNodes === 'function');
      
      try {
        const allCustomNodes = customNodeManager.getCustomNodes ? customNodeManager.getCustomNodes() : [];
        console.log('  - Total custom nodes in manager:', allCustomNodes.length);
        if (allCustomNodes.length > 0) {
          console.log('  - Available custom nodes:', allCustomNodes.map((n: any) => `${n.name} (${n.type})`));
          
          // Check specifically for the uppercase-converter
          const uppercaseConverter = allCustomNodes.find((n: any) => n.type === 'uppercase-converter');
          if (uppercaseConverter) {
            console.log('  - ✅ uppercase-converter found in manager:', {
              name: uppercaseConverter.name,
              type: uppercaseConverter.type,
              hasExecutionCode: !!uppercaseConverter.executionCode,
              codeLength: uppercaseConverter.executionCode?.length || 0
            });
          } else {
            console.log('  - ❌ uppercase-converter NOT found in manager');
          }
        }
      } catch (error) {
        console.warn('  - Error getting custom nodes:', error);
      }
      
      // Try to get the uppercase-converter directly
      if (customNodeManager.getCustomNode) {
        try {
          const uppercaseNode = customNodeManager.getCustomNode('uppercase-converter');
          if (uppercaseNode) {
            console.log('  - ✅ Direct getCustomNode for uppercase-converter succeeded:', {
              name: uppercaseNode.name,
              type: uppercaseNode.type,
              hasCode: !!uppercaseNode.executionCode
            });
          } else {
            console.log('  - ❌ Direct getCustomNode for uppercase-converter returned null/undefined');
          }
        } catch (error) {
          console.log('  - ❌ Direct getCustomNode for uppercase-converter failed:', error);
        }
      }
    }

    try {
      // 🆕 Create angela Flow SDK Runner - completely isolated
      const runner = new angelaFlowRunner({
        enableLogging: true,
        timeout: 30000,
        onExecutionLog: (log: any) => {
          console.log('📝 SDK Log:', log);
          setExecutionLogs(prev => [...prev, {
            id: `${Date.now()}-${Math.random()}`,
            level: log.level || 'info',
            message: log.message,
            timestamp: new Date().toISOString(),
            nodeId: log.nodeId,
            nodeName: log.nodeName,
            duration: log.duration,
            data: log.data
          }]);
        }
      });

      console.log('✅ angela Flow SDK Runner created');

      // Convert agent flow to SDK format
      const sdkFlowData = convertToSDKFormat(agentFlow);
      console.log('🔄 Converted to SDK format:', sdkFlowData);
      console.log('🎨 Custom nodes in flow:', sdkFlowData.customNodes);
      
      // 🔧 EXPLICITLY REGISTER CUSTOM NODES WITH THE SDK RUNNER
      if (sdkFlowData.customNodes && sdkFlowData.customNodes.length > 0) {
        console.log('🔧 Registering custom nodes with SDK Runner:');
        for (const customNode of sdkFlowData.customNodes) {
          console.log(`  - Registering: ${customNode.name} (${customNode.type})`);
          console.log(`    Has execution code: ${!!customNode.executionCode}`);
          if (customNode.executionCode) {
            console.log(`    Code preview: ${customNode.executionCode.substring(0, 100)}...`);
          }
          
          // Register each custom node with the runner
          try {
            runner.registerCustomNode(customNode);
            console.log(`  ✅ Successfully registered: ${customNode.type}`);
          } catch (error) {
            console.error(`  ❌ Failed to register ${customNode.type}:`, error);
          }
        }
      } else {
        console.log('⚠️ No custom nodes found in SDK flow data, checking for fallback registration...');
        
        // 🔍 FALLBACK: Check if there are custom nodes in the workflow that weren't found
        const customNodeTypesInFlow = agentFlow.nodes
          .map((n: any) => n.type)
          .filter((type: string) => {
            // Use the same detection logic as in convertToSDKFormat
            let isCustom = false;
            
            // Check if it's a known custom node type
            if (customNodeManager && customNodeManager.getCustomNodes) {
              try {
                const allCustomNodes = customNodeManager.getCustomNodes();
                isCustom = allCustomNodes.some((cn: any) => cn.type === type);
              } catch (error) {
                console.warn('Error checking custom nodes:', error);
              }
            }
            
            // Fallback: check if it's not a built-in type
            if (!isCustom) {
              const builtInTypes = [
                'input', 'output', 'text-input', 'number-input', 'image-input', 'file-input', 'pdf-input', 'file-upload',
                'text-processor', 'math-calculator', 'image-processor', 'pdf-processor', 'llm-text', 'llm-chat',
                'data-formatter', 'conditional', 'loop', 'delay', 'http-request', 'database-query',
                'email-sender', 'file-writer', 'code-executor', 'webhook', 'scheduler'
              ];
              isCustom = !builtInTypes.includes(type);
            }
            
            return isCustom;
          });
        
        console.log('🔍 Custom node types found in flow for fallback:', customNodeTypesInFlow);
        
        if (customNodeTypesInFlow.length > 0) {
          console.warn('⚠️ Found custom nodes in workflow but no definitions loaded. Attempting direct registration...');
          for (const nodeType of customNodeTypesInFlow) {
            if (customNodeManager && customNodeManager.getCustomNode) {
              const customNode = customNodeManager.getCustomNode(nodeType);
              if (customNode) {
                console.log(`  - Fallback registering: ${customNode.name} (${customNode.type})`);
                try {
                  runner.registerCustomNode({
                    id: customNode.id,
                    type: customNode.type,
                    name: customNode.name,
                    description: customNode.description,
                    category: customNode.category,
                    icon: customNode.icon,
                    inputs: customNode.inputs,
                    outputs: customNode.outputs,
                    properties: customNode.properties,
                    executionCode: customNode.executionCode,
                    metadata: customNode.metadata
                  });
                  console.log(`  ✅ Fallback registration successful: ${customNode.type}`);
                } catch (error) {
                  console.error(`  ❌ Fallback registration failed for ${nodeType}:`, error);
                }
              } else {
                console.error(`  ❌ Custom node definition not found for type: ${nodeType}`);
                
                // Try to get more info about available custom nodes
                if (customNodeManager.getCustomNodes) {
                  try {
                    const available = customNodeManager.getCustomNodes();
                    console.log(`  📋 Available custom nodes: ${available.map((cn: any) => cn.type).join(', ')}`);
                  } catch (error) {
                    console.warn('  ⚠️ Error listing available custom nodes:', error);
                  }
                }
              }
            }
          }
        }
      }
      
      console.log('🔍 Custom node types detected in nodes:', agentFlow.nodes.map((n: any) => n.type).filter((type: string) => customNodeManager && customNodeManager.isCustomNode && customNodeManager.isCustomNode(type)));

      // Prepare inputs for SDK execution
      const sdkInputs: Record<string, any> = {};
      
      for (const inputValue of inputValues) {
        if (inputValue.value) {
          if (inputValue.type === 'file' && inputValue.value instanceof File) {
            // Handle file inputs
            const file = inputValue.value;
            let processedContent: string;
            
            if (file.type.startsWith('image/')) {
              // Convert image to base64
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
              });
            } else if (file.type === 'application/pdf') {
              // Convert PDF to base64
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
              });
            } else {
              // Read text files as text
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsText(file);
              });
            }
            
            sdkInputs[inputValue.nodeName] = processedContent;
          } else {
            // Handle text/number inputs
            sdkInputs[inputValue.nodeName] = inputValue.value;
          }
        }
      }

      console.log('📤 SDK Inputs prepared:', sdkInputs);

      // 🎯 Execute using angela Flow SDK - COMPLETELY ISOLATED
      console.log('⚡ Executing flow with angela Flow SDK...');
      const executionResult = await runner.executeFlow(sdkFlowData, sdkInputs);
      
      console.log('🎉 SDK Execution completed!');
      console.log('📊 Raw SDK Results:', executionResult);

      // Extract results from SDK output
      const outputNodes = agentFlow.nodes.filter((node: any) => node.type === 'output');
      console.log('📤 Output nodes found:', outputNodes);

      let responseContent = '';
      
      if (Object.keys(executionResult).length === 0) {
        responseContent = 'No results generated. Make sure your workflow has output nodes connected to the data flow.';
      } else {
        // Process SDK results
        const outputResults: Array<{label: string, content: string}> = [];
        
        for (const outputNode of outputNodes) {
          const nodeResult = executionResult[outputNode.id];
          
          if (nodeResult !== undefined && nodeResult !== null) {
            let processedContent = '';
            
            // Process the result based on its type
            if (typeof nodeResult === 'object') {
              // Try to unwrap common result formats
              if (nodeResult.output !== undefined) {
                processedContent = String(nodeResult.output);
              } else if (nodeResult.result !== undefined) {
                processedContent = String(nodeResult.result);
              } else if (nodeResult.text !== undefined) {
                processedContent = String(nodeResult.text);
              } else if (nodeResult.content !== undefined) {
                processedContent = String(nodeResult.content);
              } else if (nodeResult.value !== undefined) {
                processedContent = String(nodeResult.value);
              } else {
                // Display as JSON if it's a complex object
                processedContent = `\`\`\`json\n${JSON.stringify(nodeResult, null, 2)}\n\`\`\``;
              }
            } else {
              // Simple value - use as string
              processedContent = String(nodeResult);
            }
            
            if (processedContent.trim()) {
              outputResults.push({
                label: outputNode.name || `Output ${outputNode.id}`,
                content: processedContent
              });
            }
          }
        }
        
        // Format response
        if (outputResults.length === 0) {
          responseContent = 'Flow execution completed but no output results found.';
        } else if (outputResults.length === 1) {
          // Single output - just show the content
          responseContent = outputResults[0].content;
        } else {
          // Multiple outputs - show with labels
          responseContent = outputResults
            .map(result => `**${result.label}:**\n${result.content}`)
            .join('\n\n---\n\n');
        }
      }

      console.log('🎯 Final Response Content:', responseContent);

      // Create user message
      const userMessage: ChatMessage = {
        id: Date.now() + '_user',
        type: 'user',
        content: `Running agent with ${inputValues.filter(iv => iv.value).length} input(s)`,
        timestamp: new Date().toISOString()
      };

      // Create assistant message with results
      const assistantMessage: ChatMessage = {
        id: Date.now() + '_assistant',
        type: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString()
      };

      setMessages([userMessage, assistantMessage]);
      
      // Get execution logs from SDK
      const sdkLogs = runner.getLogs();
      console.log('📝 Final SDK logs:', sdkLogs);
      
    } catch (error) {
      console.error('❌ angela Flow SDK execution failed:', error);
      
      let errorMessage = 'Execution failed: ';
      
      if (error instanceof Error) {
        if (error.message.includes('Unknown node type:')) {
          const nodeType = error.message.split('Unknown node type: ')[1];
          errorMessage = `Custom node type "${nodeType}" is not registered. This usually means:\n\n• The custom node was not found in the custom node manager\n• The custom node definition is missing execution code\n• There was an error during custom node registration\n\nCheck the console logs for more details.`;
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Unknown error';
      }
      
      const errorMessage_obj: ChatMessage = {
        id: Date.now() + '_error',
        type: 'assistant',
        content: errorMessage,
        timestamp: new Date().toISOString()
      };
      
      setMessages([errorMessage_obj]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearInputs = () => {
    setInputValues(prev => prev.map(input => ({
      ...input,
      value: input.type === 'file' ? null : ''
    })));
  };

  const clearMessages = () => {
    setMessages([]);
    setExecutionLogs([]);
  };

  const hasAllInputs = inputValues.every(input => input.value !== null && input.value !== '');

  if (agentLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center relative overflow-hidden">
        {/* Wallpaper */}
        {wallpaperUrl && (
          <div 
            className="absolute top-0 left-0 right-0 bottom-0 z-0"
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
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-sakura-200 dark:border-sakura-700 border-t-sakura-500 dark:border-t-sakura-400 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading agent workflow...</p>
        </div>
      </div>
    );
  }

  if (!agentFlow) {
    return (
      <div className="h-screen w-screen flex items-center justify-center relative overflow-hidden">
        {/* Wallpaper */}
        {wallpaperUrl && (
          <div 
            className="absolute top-0 left-0 right-0 bottom-0 z-0"
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
        
        <div className="relative z-10 text-center">
          <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Agent Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">The requested agent could not be loaded.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden relative">
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="absolute top-0 left-0 right-0 bottom-0 z-0"
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
        <Sidebar activePage="runner" onPageChange={onPageChange} />
      
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Topbar userName={userName} onPageChange={onPageChange} />
          
          <div className="flex-1 flex flex-col bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 min-h-0 overflow-hidden">
            {/* Agent Runner Header */}
            <div className="glassmorphic px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-sakura-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                        {agentFlow.name}
                      </h1>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {agentFlow.description || 'AI Agent Ready to Execute'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-3 py-1.5 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 rounded-full font-medium border border-green-200/50 dark:border-green-700/50">
                      ✨ angela Flow SDK
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                      showLogs
                        ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                    {showLogs ? 'Hide Logs' : 'Show Logs'}
                    {executionLogs.length > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        showLogs ? 'bg-sakura-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        {executionLogs.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={clearMessages}
                    disabled={messages.length === 0}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Execution Logs Panel */}
              {showLogs && (
                <div className="mt-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-700/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/20 dark:border-gray-700/50 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <Terminal className="w-4 h-4" />
                        angela Flow SDK Logs
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                        {executionLogs.length} entries
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    {executionLogs.length === 0 ? (
                      <div className="text-center py-6">
                        <Settings2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No logs yet</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Run your agent to see execution details</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {executionLogs.map((log) => (
                          <div key={log.id} className={`p-3 rounded-lg text-xs font-mono border ${
                            log.level === 'error' 
                              ? 'bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200/50 dark:border-red-800/30'
                              : log.level === 'warning'
                              ? 'bg-yellow-50/80 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200/50 dark:border-yellow-800/30'
                              : log.level === 'success'
                              ? 'bg-green-50/80 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200/50 dark:border-green-800/30'
                              : 'bg-blue-50/80 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200/50 dark:border-blue-800/30'
                          }`}>
                            <div className="flex items-start gap-2">
                              <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="flex-1">{log.message}</span>
                            </div>
                            {log.data && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100">
                                  Details
                                </summary>
                                <pre className="mt-1 text-xs bg-gray-100/80 dark:bg-gray-800/80 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Input Panel */}
              <div className="w-80 glassmorphic flex flex-col overflow-hidden min-h-0">
                <div className="p-4 flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-sakura-500" />
                    Agent Inputs
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure the inputs for your agent execution
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
                  {inputValues.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-full flex items-center justify-center">
                        <Calculator className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">No inputs required</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        This agent runs without input parameters
                      </p>
                    </div>
                  ) : (
                    inputValues.map((input) => (
                      <div key={input.nodeId} className="glassmorphic-card rounded-xl p-4 border border-white/30 dark:border-gray-700/50">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-sakura-500 rounded-full"></div>
                          {input.nodeName}
                        </label>
                        
                        {input.type === 'file' ? (
                          <div className="space-y-3">
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleInputChange(input.nodeId, file);
                                }
                              }}
                              className="block w-full text-sm text-gray-500 dark:text-gray-400
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-lg file:border-0
                                file:text-sm file:font-medium
                                file:bg-sakura-50 file:text-sakura-700
                                dark:file:bg-sakura-900/30 dark:file:text-sakura-300
                                hover:file:bg-sakura-100 dark:hover:file:bg-sakura-900/50
                                file:cursor-pointer file:transition-colors"
                              accept={
                                input.nodeName.toLowerCase().includes('image') ? 'image/*' :
                                input.nodeName.toLowerCase().includes('pdf') ? '.pdf' :
                                '*/*'
                              }
                            />
                            {input.value && input.value instanceof File && (
                              <div className="flex items-center gap-3 p-3 bg-gray-50/80 dark:bg-gray-800/80 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                                <div className="flex-shrink-0">
                                  {input.value.type.startsWith('image/') ? (
                                    <Image className="w-4 h-4 text-blue-500" />
                                  ) : input.value.type === 'application/pdf' ? (
                                    <FileText className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <Upload className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                    {input.value.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {(input.value.size / 1024).toFixed(1)} KB
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <input
                            type={input.type === 'number' ? 'number' : 'text'}
                            value={input.value as string || ''}
                            onChange={(e) => handleInputChange(input.nodeId, e.target.value)}
                            placeholder={`Enter ${input.nodeName.toLowerCase()}...`}
                            className="w-full px-3 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-lg 
                              focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-sakura-500 
                              text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-white/20 dark:border-gray-700/50 space-y-3 flex-shrink-0">
                  <button
                    onClick={handleRunAgent}
                    disabled={!hasAllInputs || isLoading}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                      hasAllInputs && !isLoading
                        ? 'bg-gradient-to-r from-sakura-500 to-pink-500 hover:from-sakura-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executing with angela Flow SDK...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Play className="w-4 h-4" />
                        Run Agent ({inputValues.filter(iv => iv.value).length}/{inputValues.length} inputs)
                      </div>
                    )}
                  </button>
                  
                  {inputValues.some(iv => iv.value) && (
                    <button
                      onClick={clearInputs}
                      disabled={isLoading}
                      className="w-full py-2 px-4 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      Clear Inputs
                    </button>
                  )}
                </div>
              </div>

              {/* Results Panel */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="glassmorphic px-6 py-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      <Bot className="w-5 h-5 text-sakura-500" />
                      Agent Results
                    </h3>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {messages.length > 0 && `${messages.length} ${messages.length === 1 ? 'result' : 'results'}`}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center max-w-md">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100/50 to-sakura-200/50 dark:from-sakura-900/20 dark:to-sakura-800/20 rounded-full flex items-center justify-center">
                          <Bot className="w-10 h-10 text-sakura-500 dark:text-sakura-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                          Ready to Execute
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                          Configure your inputs and click "Run Agent" to see the results here.
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <span>Powered by</span>
                          <span className="px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                            angela Flow SDK
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] ${
                            message.type === 'user'
                              ? 'bg-gradient-to-r from-sakura-500 to-pink-500 text-white'
                              : 'glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-800 dark:text-gray-100'
                          } rounded-xl p-4 shadow-lg`}>
                            {message.type === 'assistant' ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                {formatMessage(message.content)}
                              </div>
                            ) : (
                              <div className="text-sm">{message.content}</div>
                            )}
                            <div className={`text-xs mt-2 ${
                              message.type === 'user' 
                                ? 'text-white/70' 
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentRunner: React.FC<AgentRunnerProps> = ({ agentId, onClose, onPageChange, userName }) => {
  return (
    <AgentRunnerContent 
      agentId={agentId} 
      onClose={onClose} 
      onPageChange={onPageChange}
      userName={userName}
    />
  );
};

export default AgentRunner; 
