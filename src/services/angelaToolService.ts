/**
 * angela Tool Service
 * Handles tool execution, MCP integration, and tool-related operations
 */

import { defaultTools, executeTool } from '../utils/angelaTools';
import { db } from '../db';
import type { Tool } from '../db';
import { angelaMCPService } from './angelaMCPService';
import { ToolSuccessRegistry } from './toolSuccessRegistry';
import type { angelaAIConfig, angelaArtifact, angelaMCPToolResult } from '../types/angela_assistant_types';
import type { ChatMessage } from '../utils/APIClient';

export class angelaToolService {
  /**
   * Get available tools based on configuration
   */
  public async getAvailableTools(config: angelaAIConfig, onContentChunk?: (content: string) => void): Promise<Tool[]> {
    let tools: Tool[] = [];
    
    if (config.features.enableTools) {
      const dbTools = await db.getEnabledTools();
      tools = dbTools;
      
      // Add MCP tools if enabled
      if (config.features.enableMCP && config.mcp?.enableTools) {
        console.log('🔧 MCP is enabled, attempting to add MCP tools...');
        try {
          if (angelaMCPService.isReady()) {
            console.log('✅ MCP service is ready');
            
            const enabledServers = config.mcp.enabledServers || [];
            console.log('📋 Enabled MCP servers from config:', enabledServers);
            
            if (enabledServers.length === 0) {
              console.log('🚫 No MCP servers explicitly enabled - skipping MCP tools');
              if (onContentChunk) {
                onContentChunk('ℹ️ **No MCP servers selected** - Please enable specific MCP servers in configuration to use MCP tools.\n\n');
              }
            } else {
              const serverSummary = angelaMCPService.getServerAvailabilitySummary(enabledServers);
              console.log('🔍 Server availability summary:', serverSummary);
              
              if (onContentChunk && serverSummary.unavailable.length > 0) {
                let feedbackMessage = '\n🔧 **MCP Server Status:**\n';
                
                if (serverSummary.available.length > 0) {
                  feedbackMessage += `✅ Available: ${serverSummary.available.join(', ')} (${serverSummary.totalTools} tools)\n`;
                }
                
                if (serverSummary.unavailable.length > 0) {
                  feedbackMessage += '❌ Unavailable servers:\n';
                  for (const unavailable of serverSummary.unavailable) {
                    feedbackMessage += `   • ${unavailable.server}: ${unavailable.reason}\n`;
                  }
                }
                
                feedbackMessage += '\n';
                onContentChunk(feedbackMessage);
              }
              
              const mcpTools = angelaMCPService.getToolsFromEnabledServers(enabledServers);
              console.log(`🛠️ Found ${mcpTools.length} MCP tools from enabled servers:`, mcpTools.map(t => `${t.server}:${t.name}`));
              
              if (mcpTools.length === 0) {
                console.warn('⚠️ No MCP tools available from enabled/running servers');
                if (onContentChunk) {
                  onContentChunk('⚠️ **No MCP tools available** - all configured servers are offline or disabled.\n\n');
                }
              } else {
                const mcpOpenAITools = angelaMCPService.convertSpecificToolsToOpenAIFormat(mcpTools);
                console.log(`🔄 Converted and validated ${mcpOpenAITools.length} OpenAI format tools`);
                
                const mcpToolsFormatted: Tool[] = mcpOpenAITools.map(tool => ({
                  id: tool.function.name,
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: Object.entries(tool.function.parameters.properties || {}).map(([name, prop]: [string, any]) => ({
                    name,
                    type: prop.type || 'string',
                    description: prop.description || '',
                    required: tool.function.parameters.required?.includes(name) || false
                  })),
                  implementation: 'mcp',
                  isEnabled: true
                }));
                
                const beforeCount = tools.length;
                tools = [...tools, ...mcpToolsFormatted];
                console.log(`📈 Added ${mcpToolsFormatted.length} MCP tools to existing ${beforeCount} tools (total: ${tools.length})`);
                
                if (onContentChunk && mcpToolsFormatted.length > 0) {
                  const toolsByServer = mcpToolsFormatted.reduce((acc, tool) => {
                    const serverName = tool.name.split('_')[1];
                    acc[serverName] = (acc[serverName] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);
                  
                  let toolsMessage = `🛠️ **Loaded ${mcpToolsFormatted.length} MCP tools:**\n`;
                  for (const [server, count] of Object.entries(toolsByServer)) {
                    toolsMessage += `   • ${server}: ${count} tools\n`;
                  }
                  toolsMessage += '\n';
                  onContentChunk(toolsMessage);
                }
              }
            }
          } else {
            console.warn('⚠️ MCP service not ready, skipping MCP tools');
            if (onContentChunk) {
              onContentChunk('⚠️ **MCP service not ready** - skipping MCP tools. Please check your MCP configuration.\n\n');
            }
          }
        } catch (error) {
          console.error('❌ Error adding MCP tools:', error);
          if (onContentChunk) {
            onContentChunk(`❌ **Error loading MCP tools:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
          }
        }
      } else {
        console.log('🚫 MCP tools disabled:', {
          enableMCP: config.features.enableMCP,
          enableTools: config.mcp?.enableTools
        });
        if (onContentChunk && config.features.enableMCP === false) {
          onContentChunk('ℹ️ **MCP tools disabled** in configuration.\n\n');
        }
      }
    }

    return tools;
  }

  /**
   * Execute tool calls using the angela tools system
   */
  public async executeToolCalls(toolCalls: any[], currentProviderId?: string): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        const functionName = toolCall.function?.name;
        
        // Safely parse arguments
        let args = {};
        try {
          if (typeof toolCall.function?.arguments === 'string') {
            const argsString = toolCall.function.arguments.trim();
            if (argsString === '' || argsString === 'null' || argsString === 'undefined') {
              args = {};
            } else {
              args = JSON.parse(argsString);
            }
          } else if (toolCall.function?.arguments && typeof toolCall.function.arguments === 'object') {
            args = toolCall.function.arguments;
          } else {
            args = {};
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse tool arguments for ${functionName}:`, parseError);
          args = {};
        }

        if (!functionName || functionName.trim() === '') {
          console.warn('⚠️ Skipping malformed tool call with empty function name:', toolCall);
          results.push({
            toolName: 'unknown',
            success: false,
            error: 'Tool call has empty or missing function name'
          });
          continue;
        }

        console.log(`🔧 Executing tool: ${functionName} with args:`, args);

        // Check if this is an MCP tool call
        if (functionName?.startsWith('mcp_')) {
          const mcpResult = await this.executeMCPToolCall(toolCall, functionName, currentProviderId);
          results.push(mcpResult);
          continue;
        }

        // Try to execute with angela tools first
        const angelaTool = defaultTools.find(tool => tool.name === functionName || tool.id === functionName);
        
        if (angelaTool) {
          const result = await executeTool(angelaTool.id, args);
          
          if (result.success) {
            ToolSuccessRegistry.recordSuccess(
              angelaTool.name,
              angelaTool.description,
              currentProviderId || 'unknown',
              toolCall.id
            );
          }
          
          results.push({
            toolName: functionName,
            success: result.success,
            result: result.result,
            error: result.error
          });
        } else {
          // Try database tools as fallback
          const dbTools = await db.getEnabledTools();
          const dbTool = dbTools.find(tool => tool.name === functionName);
          
          if (dbTool) {
            try {
              const funcBody = `return (async () => {
                ${dbTool.implementation}
                return await implementation(args);
              })();`;
              const testFunc = new Function('args', funcBody);
              const result = await testFunc(args);
              
              ToolSuccessRegistry.recordSuccess(
                dbTool.name,
                dbTool.description,
                currentProviderId || 'unknown',
                toolCall.id
              );
              
              results.push({
                toolName: functionName,
                success: true,
                result: result
              });
            } catch (error) {
              results.push({
                toolName: functionName,
                success: false,
                error: error instanceof Error ? error.message : 'Tool execution failed'
              });
            }
          } else {
            results.push({
              toolName: functionName,
              success: false,
              error: `Tool '${functionName}' not found`
            });
          }
        }
      } catch (error) {
        results.push({
          toolName: toolCall.function?.name || 'unknown',
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }

  /**
   * Execute MCP tool call
   */
  private async executeMCPToolCall(toolCall: any, functionName: string, currentProviderId?: string): Promise<any> {
    console.log(`🔧 Processing MCP tool call: ${functionName}`);
    try {
      const mcpToolCalls = angelaMCPService.parseOpenAIToolCalls([toolCall]);
      
      if (mcpToolCalls.length > 0) {
        const mcpResult = await angelaMCPService.executeToolCall(mcpToolCalls[0]);
        
        const processedResult = this.processMCPToolResult(mcpResult, functionName);
        
        const result = {
          toolName: functionName,
          success: mcpResult.success,
          result: processedResult.result,
          error: mcpResult.error,
          artifacts: processedResult.artifacts,
          images: processedResult.images,
          toolMessage: processedResult.toolMessage,
          metadata: {
            type: 'mcp',
            server: mcpToolCalls[0].server,
            toolName: mcpToolCalls[0].name,
            ...mcpResult.metadata
          }
        };
        
        if (result.success) {
          ToolSuccessRegistry.recordSuccess(
            functionName,
            'MCP tool',
            currentProviderId || 'unknown',
            toolCall.id
          );
        }
        
        return result;
      } else {
        return {
          toolName: functionName,
          success: false,
          error: 'Failed to parse MCP tool call'
        };
      }
    } catch (mcpError) {
      console.error(`❌ MCP tool execution error:`, mcpError);
      return {
        toolName: functionName,
        success: false,
        error: mcpError instanceof Error ? mcpError.message : 'MCP tool execution failed'
      };
    }
  }

  /**
   * Process MCP tool results to handle all content types
   */
  private processMCPToolResult(mcpResult: angelaMCPToolResult, toolName: string): {
    result: any;
    artifacts: angelaArtifact[];
    images: string[];
    toolMessage: ChatMessage;
  } {
    const artifacts: angelaArtifact[] = [];
    const images: string[] = [];
    let textContent = '';
    let structuredResult: any = {};

    if (mcpResult.success && mcpResult.content) {
      for (let i = 0; i < mcpResult.content.length; i++) {
        const contentItem = mcpResult.content[i];
        
        switch (contentItem.type) {
          case 'text':
            if (contentItem.text) {
              textContent += (textContent ? '\n\n' : '') + contentItem.text;
              structuredResult.text = contentItem.text;
            }
            break;
            
          case 'image':
            if (contentItem.data && contentItem.mimeType) {
              const imageData = contentItem.data.startsWith('data:') 
                ? contentItem.data 
                : `data:${contentItem.mimeType};base64,${contentItem.data}`;
              images.push(imageData);
              
              artifacts.push({
                id: `mcp-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'json',
                title: `${toolName} - Image Result`,
                content: JSON.stringify({
                  type: 'image',
                  mimeType: contentItem.mimeType,
                  data: imageData,
                  description: `Image generated by ${toolName}`
                }, null, 2),
                createdAt: new Date(),
                metadata: {
                  toolName,
                  mimeType: contentItem.mimeType,
                  source: 'mcp',
                  contentIndex: i,
                  originalType: 'image'
                }
              });
              
              if (!structuredResult.images) structuredResult.images = [];
              structuredResult.images.push({
                mimeType: contentItem.mimeType,
                data: contentItem.data,
                url: imageData
              });
              
              textContent += (textContent ? '\n\n' : '') + `📷 Image generated (${contentItem.mimeType})`;
            }
            break;
            
          case 'resource':
            if ((contentItem as any).resource) {
              artifacts.push({
                id: `mcp-resource-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'json',
                title: `${toolName} - Resource Result`,
                content: JSON.stringify((contentItem as any).resource, null, 2),
                createdAt: new Date(),
                metadata: {
                  toolName,
                  source: 'mcp',
                  contentIndex: i,
                  originalType: 'resource'
                }
              });
              
              structuredResult.resource = (contentItem as any).resource;
              textContent += (textContent ? '\n\n' : '') + `📄 Resource: ${JSON.stringify((contentItem as any).resource, null, 2)}`;
            }
            break;
            
          default:
            if ((contentItem as any).data) {
              let contentData = (contentItem as any).data;
              if (typeof contentData === 'string') {
                try {
                  contentData = JSON.parse(contentData);
                } catch (e) {
                  // Keep as string if parsing fails
                }
              }
              
              artifacts.push({
                id: `mcp-data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'json',
                title: `${toolName} - ${contentItem.type} Result`,
                content: JSON.stringify(contentData, null, 2),
                createdAt: new Date(),
                metadata: {
                  toolName,
                  source: 'mcp',
                  contentIndex: i,
                  originalType: contentItem.type
                }
              });
              
              structuredResult.data = contentData;
              textContent += (textContent ? '\n\n' : '') + `📊 ${contentItem.type}: ${JSON.stringify(contentData, null, 2)}`;
            }
            break;
        }
      }
    }

    // Fallback if no content was processed
    if (!textContent && Object.keys(structuredResult).length === 0) {
      textContent = mcpResult.success ? 'MCP tool executed successfully' : (mcpResult.error || 'MCP tool execution failed');
      structuredResult = { message: textContent };
    }

    // Create the tool message for the conversation
    const toolMessage: ChatMessage = {
      role: 'tool',
      content: textContent,
      name: toolName
    };

    // Add images to the tool message if any
    if (images.length > 0) {
      toolMessage.images = images;
    }

    return {
      result: Object.keys(structuredResult).length > 1 ? structuredResult : textContent,
      artifacts,
      images,
      toolMessage
    };
  }

  /**
   * Parse tool results into artifacts if appropriate
   */
  public parseToolResultsToArtifacts(toolResults: any[]): angelaArtifact[] {
    const artifacts: angelaArtifact[] = [];

    for (const result of toolResults) {
      if (result.success) {
        // Add MCP artifacts if available
        if (result.artifacts && Array.isArray(result.artifacts)) {
          artifacts.push(...result.artifacts);
        }
        
        // Create artifacts for other tool results
        if (result.result && typeof result.result === 'object' && !result.artifacts) {
          artifacts.push({
            id: `tool-result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'json',
            title: `${result.toolName} Result`,
            content: JSON.stringify(result.result, null, 2),
            createdAt: new Date(),
            metadata: {
              toolName: result.toolName,
              toolExecuted: true
            }
          });
        }
      }
    }

    return artifacts;
  }

  /**
   * Record a successful tool execution
   */
  public recordToolSuccess(toolName: string, toolDescription: string, providerId: string, toolCallId?: string): void {
    ToolSuccessRegistry.recordSuccess(
      toolName,
      toolDescription,
      providerId,
      toolCallId
    );
  }

  /**
   * Clear incorrectly blacklisted tools
   */
  public clearBlacklistedTools(providerId: string, client: any): void {
    if (client) {
      if (client.clearProblematicToolsForProvider) {
        client.clearProblematicToolsForProvider(providerId);
      }
      
      if (client.clearProblematicTools) {
        client.clearProblematicTools();
      }
    }
  }
}

// Export singleton instance
export const angelaToolService = new angelaToolService(); 
