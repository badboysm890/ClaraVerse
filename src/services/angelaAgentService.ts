/**
 * angela Agent Service
 * Handles autonomous agent functionality and structured tool calling
 */

import { AssistantAPIClient } from '../utils/AssistantAPIClient';
import type { ChatMessage } from '../utils/APIClient';
import { 
  angelaMessage, 
  angelaFileAttachment, 
  angelaAIConfig,
} from '../types/angela_assistant_types';
import type { Tool } from '../db';
import { angelaMemoryService } from './angelaMemoryService';
import { structuredToolCallService } from './structuredToolCallService';
import { angelaToolService } from './angelaToolService';
import { angelaImageExtractionService } from './angelaImageExtractionService';

/**
 * Simple autonomous agent configuration
 */
interface AutonomousConfig {
  maxIterations: number;
  enableToolChaining: boolean;
  enableProgressTracking: boolean;
}

/**
 * Agent iteration result
 */
interface AgentIteration {
  step: number;
  response: string;
  toolCalls: any[];
  toolResults: any[];
  hasMoreWork: boolean;
}

export class angelaAgentService {
  private stopExecution: boolean = false;

  /**
   * Helper method to safely serialize tool results to avoid [object Object] issues
   */
  private serializeToolResult(result: any): string {
    if (result === undefined || result === null) {
      return 'No result returned';
    }
    
    if (typeof result === 'string') {
      return result;
    }
    
    if (typeof result === 'object') {
      try {
        return JSON.stringify(result, null, 2);
      } catch (error) {
        return '[Object - could not serialize]';
      }
    }
    
    return String(result);
  }

  /**
   * Execute autonomous agent workflow
   */
  public async executeAutonomousAgent(
    client: AssistantAPIClient,
    modelId: string,
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string
  ): Promise<angelaMessage> {
    // Check if structured tool calling is enabled
    if (config.features.enableStructuredToolCalling) {
      console.log('🔄 Using structured tool calling for autonomous agent');
      return this.executeAutonomousAgentWithStructuredCalling(
        client,
        modelId,
        message,
        tools,
        config,
        attachments,
        systemPrompt,
        conversationHistory,
        onContentChunk,
        currentProviderId
      );
    }

    // Use standard tool calling (existing implementation)
    console.log('🔄 Using standard tool calling for autonomous agent');
    return this.executeAutonomousAgentWithStandardToolCalling(
      client,
      modelId,
      message,
      tools,
      config,
      attachments,
      conversationHistory,
      onContentChunk,
    );
  }

  /**
   * Execute autonomous agent workflow with structured tool calling
   */
  private async executeAutonomousAgentWithStructuredCalling(
    client: AssistantAPIClient,
    modelId: string,
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string
  ): Promise<angelaMessage> {
    // Reset stop flag
    this.stopExecution = false;
    
    // Start memory session for this autonomous execution
    const sessionId = `structured-autonomous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    angelaMemoryService.startSession(sessionId, 'structured-autonomous-agent');
    
    // Default autonomous configuration
    const autonomousConfig: AutonomousConfig = {
      maxIterations: config.autonomousAgent?.maxToolCalls || 3,
      enableToolChaining: config.autonomousAgent?.enableToolGuidance !== false,
      enableProgressTracking: config.autonomousAgent?.enableProgressTracking !== false
    };

    console.log(`🤖 Starting structured autonomous agent with config:`, autonomousConfig);

    // Progress tracking
    if (autonomousConfig.enableProgressTracking && onContentChunk) {
      onContentChunk('**angela is now operating in structured autonomous mode.**\n\n');
      onContentChunk('ℹ️ **Using native JSON Schema structured outputs (default)**\n\n');
    }

    let totalTokens = 0;
    let allToolResults: any[] = [];
    let finalResponse = '';
    let currentIterationCount = 0;

    try {
      // Main structured autonomous loop
      for (let iteration = 0; iteration < autonomousConfig.maxIterations; iteration++) {
        currentIterationCount = iteration + 1;
        
        // Check for stop signal
        if (this.stopExecution) {
          console.log(`🛑 Structured autonomous execution stopped at iteration ${currentIterationCount}`);
          if (onContentChunk) {
            onContentChunk(`\n🛑 **Execution stopped by user**\n\n`);
          }
          break;
        }

        console.log(`🔄 Structured autonomous iteration ${currentIterationCount}/${autonomousConfig.maxIterations}`);
        
        if (autonomousConfig.enableProgressTracking && onContentChunk && iteration > 0) {
          onContentChunk(`\n**Step ${currentIterationCount}:**\n`);
        }

        try {
          // Use enhanced structured tool calling with native JSON Schema support
          const structuredResult = await structuredToolCallService.executeStructuredToolCallingWithSchema(
            client,
            modelId,
            message,
            tools,
            config,
            attachments,
            systemPrompt,
            conversationHistory,
            onContentChunk,
            currentProviderId
          );
          
          console.log(`📊 Structured response result:`, {
            hasResponse: !!structuredResult.response,
            needsToolExecution: structuredResult.needsToolExecution,
            toolCallsCount: structuredResult.toolCalls.length,
            reasoning: structuredResult.reasoning
          });
          
          // Add to final response
          finalResponse += structuredResult.response;
          // Note: totalTokens tracking would need to be enhanced in the new method
          
          // Check if tools need to be executed
          if (structuredResult.needsToolExecution && structuredResult.toolCalls.length > 0) {
            if (onContentChunk) {
              onContentChunk(`\n🔧 **Executing ${structuredResult.toolCalls.length} structured tool calls...**\n\n`);
            }

            console.log(`🚀 Starting execution of ${structuredResult.toolCalls.length} tool calls:`, 
              structuredResult.toolCalls.map(tc => tc.toolName));

            // Execute structured tool calls
            const toolResults = await structuredToolCallService.executeStructuredToolCalls(
              structuredResult.toolCalls,
              onContentChunk ? (msg: string) => onContentChunk(`${msg}\n`) : undefined
            );

            console.log(`📋 Tool execution results:`, toolResults.map(tr => ({
              toolName: tr.toolName,
              success: tr.success,
              hasResult: !!tr.result,
              error: tr.error
            })));

            // Store tool results in memory
            for (const toolResult of toolResults) {
              angelaMemoryService.storeToolResult({
                toolName: toolResult.toolName,
                success: toolResult.success,
                result: toolResult.result,
                error: toolResult.error,
                metadata: { 
                  reasoning: toolResult.reasoning,
                  iteration: currentIterationCount,
                  timestamp: Date.now()
                }
              });
            }

            allToolResults.push(...toolResults);

            // Build proper conversation history with tool results
            const conversationWithResults: angelaMessage[] = [];
            
            // Add original conversation history
            if (conversationHistory && conversationHistory.length > 0) {
              conversationWithResults.push(...conversationHistory);
            }
            
            // Add user message
            conversationWithResults.push({
              id: `user-${Date.now()}`,
              role: 'user',
              content: message,
              timestamp: new Date(),
              attachments
            });
            
            // Add assistant response with tool calls
            conversationWithResults.push({
              id: `assistant-${Date.now()}`,
              role: 'assistant', 
              content: structuredResult.response,
              timestamp: new Date(),
              metadata: {
                toolCalls: structuredResult.toolCalls,
                reasoning: structuredResult.reasoning
              }
            });
            
            // Add tool results
            for (const toolResult of toolResults) {
              // Properly serialize the result to avoid [object Object]
              let resultContent = '';
              if (toolResult.success) {
                resultContent = this.serializeToolResult(toolResult.result);
              } else {
                resultContent = toolResult.error || 'Tool execution failed';
              }
              
              conversationWithResults.push({
                id: `tool-${Date.now()}-${toolResult.toolName}`,
                role: 'assistant',
                content: `Tool ${toolResult.toolName} executed: ${toolResult.success ? 'Success' : 'Failed'}. ${resultContent}`,
                timestamp: new Date(),
                metadata: {
                  toolExecution: true,
                  toolName: toolResult.toolName,
                  success: toolResult.success
                }
              });
            }

            console.log(`📝 Built conversation history with ${conversationWithResults.length} messages`);

            // Convert angela messages to ChatMessage format for API call
            const chatMessages: ChatMessage[] = [];
            
            // Add system prompt
            chatMessages.push({
              role: 'system',
              content: systemPrompt || 'You are angela, a helpful AI assistant.'
            });
            
            // Add conversation messages
            for (const msg of conversationWithResults) {
              chatMessages.push({
                role: msg.role,
                content: msg.content
              });
            }
            
            // Add final instruction as user message
            chatMessages.push({
              role: 'user',
              content: `Please provide a comprehensive and natural response to my original request based on the tool execution results above. Present the information in a user-friendly way without mentioning technical details.`
            });

            // Define options for follow-up call
            const options = {
              temperature: config.parameters.temperature,
              max_tokens: config.parameters.maxTokens,
              top_p: config.parameters.topP
            };

            // Execute follow-up call
            const followUpResponse = await client.sendChat(modelId, chatMessages, options);
            const followUpContent = followUpResponse.message?.content || '';
            
            console.log(`📤 Follow-up response length: ${followUpContent.length} chars`);
            
            // Store follow-up response in memory
            if (followUpContent) {
              angelaMemoryService.storeToolResult({
                toolName: 'follow_up_response',
                success: true,
                result: followUpContent,
                metadata: { 
                  type: 'follow_up_response',
                  iteration: currentIterationCount,
                  timestamp: Date.now(),
                  tokens: followUpResponse.usage?.total_tokens || 0
                }
              });
              
              if (onContentChunk) {
                onContentChunk('\n\n**Final Response:**\n');
                onContentChunk(followUpContent);
              }
              finalResponse += '\n\n' + followUpContent;
              totalTokens += followUpResponse.usage?.total_tokens || 0;
            }

            // IMPORTANT: After tool execution and follow-up, task is complete
            console.log(`✅ Task completed after tool execution and follow-up response`);
            if (onContentChunk) {
              onContentChunk(`\n✅ **Task completed**\n\n`);
            }
            break;

          } else {
            // No tools needed, task complete
            console.log(`✅ No tools needed or tool execution disabled - task complete`);
            if (onContentChunk) {
              onContentChunk(`\n✅ **Task completed**\n\n`);
            }
            break;
          }

        } catch (error) {
          console.error(`❌ Structured autonomous iteration ${currentIterationCount} failed:`, error);
          if (onContentChunk) {
            onContentChunk(`\n❌ **Error in step ${currentIterationCount}**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
          }
          break;
        }
      }

      // Generate memory context for final response
      const memoryContext = angelaMemoryService.generateMemoryContext();
      
      // If we have memory context, append it to the final response
      if (memoryContext) {
        console.log('🧠 Appending memory context to final response');
        finalResponse += memoryContext;
      }

      // Create final angela message
      const angelaMessage: angelaMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalResponse || 'I completed the structured autonomous agent execution.',
        timestamp: new Date(),
        metadata: {
          model: `${config.provider}:${modelId}`,
          tokens: totalTokens,
          temperature: config.parameters.temperature,
          toolsUsed: allToolResults.map(tc => tc.toolName),
          agentSteps: currentIterationCount,
          autonomousMode: true,
          structuredToolCalling: true,
          memorySessionId: sessionId
        }
      };

      // Add artifacts if any were generated from tool calls
      if (allToolResults.length > 0) {
        angelaMessage.artifacts = angelaToolService.parseToolResultsToArtifacts(allToolResults);
        
        // **NEW: Extract images from tool results and store separately**
        try {
          const extractedImages = angelaImageExtractionService.extractImagesFromToolResults(
            allToolResults,
            angelaMessage.id
          );
          
          if (extractedImages.length > 0) {
            // Add extracted images to metadata (not chat history)
            if (!angelaMessage.metadata) {
              angelaMessage.metadata = {};
            }
            angelaMessage.metadata.extractedImages = extractedImages;
            
            console.log(`📷 [Autonomous] Extracted ${extractedImages.length} images from tool results:`, 
              extractedImages.map(img => `${img.toolName}:${img.description}`));
          }
        } catch (error) {
          console.error('Error extracting images from autonomous tool results:', error);
          // Don't fail the message if image extraction fails
        }
      }

      return angelaMessage;

    } catch (globalError) {
      console.error('❌ Structured autonomous agent execution failed:', globalError);
      
      // Create error message with detailed information
      const errorMessage = globalError instanceof Error ? globalError.message : 'Unknown error occurred';
      const status = (globalError as any)?.status;
      const errorData = (globalError as any)?.errorData;
      
      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `I encountered an error while executing the autonomous agent: ${errorMessage}`,
        timestamp: new Date(),
        metadata: {
          model: `${config.provider}:${modelId}`,
          error: errorMessage,
          serverStatus: status,
          errorData: errorData,
          autonomousMode: true,
          structuredToolCalling: true,
          failed: true
        }
      };
    } finally {
      // Clear memory session after completion
      angelaMemoryService.clearCurrentSession();
      console.log('🧠 Memory session cleared after structured autonomous execution');
    }
  }

  /**
   * Execute autonomous agent workflow with standard tool calling
   */
  private async executeAutonomousAgentWithStandardToolCalling(
    client: AssistantAPIClient,
    modelId: string,
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    // systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string
  ): Promise<angelaMessage> {
    // Reset stop flag
    this.stopExecution = false;
    
    // Start memory session for this autonomous execution
    const sessionId = `autonomous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    angelaMemoryService.startSession(sessionId, 'autonomous-agent');
    
    // Default autonomous configuration
    const autonomousConfig: AutonomousConfig = {
      maxIterations: config.autonomousAgent?.maxToolCalls || 5,
      enableToolChaining: config.autonomousAgent?.enableToolGuidance !== false,
      enableProgressTracking: config.autonomousAgent?.enableProgressTracking !== false
    };

    console.log(`🤖 Starting autonomous agent with config:`, autonomousConfig);

    // Build enhanced system prompt for autonomous mode
    const enhancedSystemPrompt = this.createToolMasteryPrompt(tools);

    // Build conversation messages
    const messages: ChatMessage[] = [];
    
    // Add enhanced system prompt
    messages.push({
      role: 'system',
      content: enhancedSystemPrompt
    });

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      // Filter and organize conversation history to ensure proper alternating pattern
      const validMessages: ChatMessage[] = [];
      let lastRole: 'user' | 'assistant' | null = null;
      
      for (const historyMessage of conversationHistory) {
        // Skip system messages and tool messages from history
        if (historyMessage.role === 'system') {
          continue;
        }
        
        // Only include user and assistant messages
        if (historyMessage.role === 'user' || historyMessage.role === 'assistant') {
          // Ensure alternating pattern - skip consecutive messages of same role
          if (lastRole !== historyMessage.role) {
            const chatMessage: ChatMessage = {
              role: historyMessage.role,
              content: historyMessage.content
            };

            if (historyMessage.attachments) {
              const imageAttachments = historyMessage.attachments.filter(att => att.type === 'image');
              if (imageAttachments.length > 0) {
                chatMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
              }
            }

            validMessages.push(chatMessage);
            lastRole = historyMessage.role;
          }
        }
      }
      
      // Ensure the conversation history ends with an assistant message if we have history
      // This prevents starting with user->user pattern when we add the current user message
      if (validMessages.length > 0 && validMessages[validMessages.length - 1].role === 'user') {
        // Remove the last user message to maintain alternating pattern
        validMessages.pop();
      }
      
      messages.push(...validMessages);
    }

    // Add the current user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message
    };

    // Add images if any attachments are images
    const imageAttachments = attachments.filter(att => att.type === 'image');
    if (imageAttachments.length > 0) {
      userMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
    }

    messages.push(userMessage);

    // Track execution state
    let totalTokens = 0;
    let allToolResults: any[] = [];
    let finalResponse = '';
    let currentMessages = [...messages];

    // Progress tracking
    if (autonomousConfig.enableProgressTracking && onContentChunk) {
      onContentChunk('\n\n');
    }

    try {
      // Main autonomous loop
      for (let iteration = 0; iteration < autonomousConfig.maxIterations; iteration++) {
        // Check for stop signal
        if (this.stopExecution) {
          console.log(`🛑 Autonomous execution stopped at iteration ${iteration + 1}`);
          if (onContentChunk) {
            onContentChunk(`\n🛑 **Execution stopped by user**\n\n`);
          }
          break;
        }

        console.log(`🔄 Autonomous iteration ${iteration + 1}/${autonomousConfig.maxIterations}`);
        
        if (autonomousConfig.enableProgressTracking && onContentChunk && iteration > 0) {
          onContentChunk(`\n**Step ${iteration + 1}:**\n`);
        }

        try {
          // Execute single iteration
          const iterationResult = await this.executeAgentIteration(
            client,
            modelId,
            currentMessages,
            tools,
            config,
            iteration + 1,
            onContentChunk,
            currentProviderId
          );

          // Store tool results in memory
          for (const toolResult of iterationResult.toolResults) {
            angelaMemoryService.storeToolResult({
              toolName: toolResult.toolName,
              success: toolResult.success,
              result: toolResult.result,
              error: toolResult.error,
              metadata: toolResult.metadata
            });
          }

          // Add iteration response to final output
          finalResponse += iterationResult.response;
          totalTokens += iterationResult.toolResults.length * 10; // Rough estimate
          allToolResults.push(...iterationResult.toolResults);

          // Add assistant response to conversation
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: iterationResult.response,
            tool_calls: iterationResult.toolCalls
          };
          currentMessages.push(assistantMessage);

          // Add tool results to conversation
          for (const toolCall of iterationResult.toolCalls) {
            const toolResult = iterationResult.toolResults.find(r => r.toolName === toolCall.function?.name);
            if (toolResult) {
              let content: string;
              if (toolResult.success && toolResult.result !== undefined && toolResult.result !== null) {
                content = this.serializeToolResult(toolResult.result);
              } else {
                content = toolResult.error || `Tool ${toolResult.toolName} execution failed`;
              }
              
              currentMessages.push({
                role: 'tool',
                content: content,
                name: toolResult.toolName,
                tool_call_id: toolCall.id
              });
            }
          }

          // Check if we should continue
          if (!iterationResult.hasMoreWork) {
            console.log(`✅ Autonomous agent completed at iteration ${iteration + 1}`);
            if (autonomousConfig.enableProgressTracking && onContentChunk) {
              onContentChunk(`\n✅ **Task completed**\n\n`);
            }
            break;
          }

        } catch (error) {
          console.error(`❌ Autonomous iteration ${iteration + 1} failed:`, error);
          if (onContentChunk) {
            onContentChunk(`\n❌ **Error in step ${iteration + 1}**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
          }
          break;
        }
      }

      // Generate memory context for final response
      const memoryContext = angelaMemoryService.generateMemoryContext();
      
      // If we have memory context, append it to the final response
      if (memoryContext) {
        console.log('🧠 Appending memory context to final response');
        finalResponse += memoryContext;
      }

      // Create final angela message
      const angelaMessage: angelaMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalResponse || 'I completed the autonomous agent execution.',
        timestamp: new Date(),
        metadata: {
          model: `${config.provider}:${modelId}`,
          tokens: totalTokens,
          temperature: config.parameters.temperature,
          toolsUsed: allToolResults.map(tc => tc.toolName),
          agentSteps: Math.min(autonomousConfig.maxIterations, allToolResults.length / 2 + 1),
          autonomousMode: true,
          memorySessionId: sessionId
        }
      };

      // Add artifacts if any were generated from tool calls
      if (allToolResults.length > 0) {
        angelaMessage.artifacts = angelaToolService.parseToolResultsToArtifacts(allToolResults);
        
        // **NEW: Extract images from tool results and store separately**
        try {
          const extractedImages = angelaImageExtractionService.extractImagesFromToolResults(
            allToolResults,
            angelaMessage.id
          );
          
          if (extractedImages.length > 0) {
            // Add extracted images to metadata (not chat history)
            if (!angelaMessage.metadata) {
              angelaMessage.metadata = {};
            }
            angelaMessage.metadata.extractedImages = extractedImages;
            
            console.log(`📷 [Autonomous Standard] Extracted ${extractedImages.length} images from tool results:`, 
              extractedImages.map(img => `${img.toolName}:${img.description}`));
          }
        } catch (error) {
          console.error('Error extracting images from autonomous standard tool results:', error);
          // Don't fail the message if image extraction fails
        }
      }

      return angelaMessage;

    } catch (globalError) {
      console.error('❌ Standard autonomous agent execution failed:', globalError);
      
      // Create error message with detailed information
      const errorMessage = globalError instanceof Error ? globalError.message : 'Unknown error occurred';
      const status = (globalError as any)?.status;
      const errorData = (globalError as any)?.errorData;
      
      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `I encountered an error while executing the autonomous agent: ${errorMessage}`,
        timestamp: new Date(),
        metadata: {
          model: `${config.provider}:${modelId}`,
          error: errorMessage,
          serverStatus: status,
          errorData: errorData,
          autonomousMode: true,
          failed: true
        }
      };
    } finally {
      // Clear memory session after completion
      angelaMemoryService.clearCurrentSession();
      console.log('🧠 Memory session cleared after autonomous execution');
    }
  }

  /**
   * Execute a single autonomous agent iteration
   */
  private async executeAgentIteration(
    client: AssistantAPIClient,
    modelId: string,
    messages: ChatMessage[],
    tools: Tool[],
    config: angelaAIConfig,
    stepNumber: number,
    onContentChunk?: (content: string) => void,
    currentProviderId?: string
  ): Promise<AgentIteration> {
    const options = {
      temperature: config.parameters.temperature,
      max_tokens: config.parameters.maxTokens,
      top_p: config.parameters.topP
    };

    let response = '';
    let toolCalls: any[] = [];
    let toolResults: any[] = [];

    try {
      // Make API call - use non-streaming for autonomous mode to avoid complexity
      const apiResponse = await client.sendChat(modelId, messages, options, tools);
      response = apiResponse.message?.content || '';
      
      if (onContentChunk && response) {
        onContentChunk(response);
      }

      // Handle tool calls if any
      if (apiResponse.message?.tool_calls && apiResponse.message.tool_calls.length > 0) {
        toolCalls = apiResponse.message.tool_calls;
        
        if (onContentChunk) {
          onContentChunk(`\n🔧 **Executing tools...**\n`);
        }

        // Execute tools
        toolResults = await angelaToolService.executeToolCalls(toolCalls, currentProviderId);

        // Check for failures and provide recovery guidance
        const failedTools = toolResults.filter(r => !r.success);
        if (failedTools.length > 0 && onContentChunk) {
          onContentChunk(`\n⚠️ **${failedTools.length} tool(s) failed - analyzing for recovery...**\n`);
          
          // Log failure analysis for learning
          failedTools.forEach(failed => {
            console.log(`🔍 Tool failure analysis: ${failed.toolName} - ${failed.error}`);
          });
        }

        if (onContentChunk) {
          const successCount = toolResults.filter(r => r.success).length;
          const failCount = toolResults.filter(r => !r.success).length;
          
          if (failCount === 0) {
            onContentChunk(`[✔] All tools completed successfully\n\n`);
          } else {
            onContentChunk(`[⚠] Tools completed: ${successCount} successful, ${failCount} failed\n`);
            onContentChunk(`[🔄] Failure analysis complete - ready for alternative approaches\n\n`);
          }

          // Stream each tool result with enhanced feedback
          toolResults.forEach((result) => {
            const status = result.success ? '✅' : '❌';
            let msg = `[${status}] ${result.toolName}`;
            
            if (result.success && result.result !== undefined && result.result !== null) {
              if (typeof result.result === 'string') {
                msg += `: ${result.result.substring(0, 100)}${result.result.length > 100 ? '...' : ''}\n`;
              } else {
                try {
                  const resultStr = JSON.stringify(result.result, null, 2);
                  msg += `: ${resultStr.substring(0, 100)}${resultStr.length > 100 ? '...' : ''}\n`;
                } catch {
                  msg += `: [Complex object returned]\n`;
                }
              }
            } else if (!result.success && result.error) {
              msg += ` FAILED: ${result.error}\n`;
            } else {
              msg += `: No result returned\n`;
            }
            onContentChunk(msg);
          });
        }
      }

      // Determine if there's more work to do based on success/failure patterns
      const hasFailures = toolResults.some(r => !r.success);
      const hasToolCalls = toolCalls.length > 0;
      
      // More sophisticated logic for determining if more work is needed
      const hasMoreWork = (hasToolCalls && stepNumber < 5) || (hasFailures && stepNumber < 3);

      return {
        step: stepNumber,
        response,
        toolCalls,
        toolResults,
        hasMoreWork
      };

    } catch (error) {
      console.error(`❌ Agent iteration ${stepNumber} failed:`, error);
      
      // Provide recovery guidance even for iteration failures
      if (onContentChunk) {
        onContentChunk(`\n❌ **Iteration ${stepNumber} encountered an error**\n`);
        onContentChunk(`🔄 **Error analysis**: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        onContentChunk(`🎯 **Recovery strategy**: Will try alternative approaches in next iteration\n\n`);
      }
      
      return {
        step: stepNumber,
        response: response || `Iteration ${stepNumber} failed, but learning from error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolCalls: [],
        toolResults: [],
        hasMoreWork: stepNumber < 3 // Allow recovery attempts
      };
    }
  }

  /**
   * Build enhanced system prompt for autonomous mode
   */


  /**
   * Create a tool-focused system prompt that emphasizes persistence and exhaustive problem-solving
   */
  private createToolMasteryPrompt(tools: Tool[]): string {
    const toolCategories = this.categorizeTools(tools);
    
    return `You are angela, an autonomous problem-solving agent. Your mission: SOLVE ANY TASK using the tools at your disposal.

TOOL ARSENAL:
${this.formatToolCategories(toolCategories)}

PROBLEM-SOLVING PROTOCOL:
1. ANALYZE: Understand the task completely
2. STRATEGIZE: Plan your tool usage approach
3. EXECUTE: Use tools systematically
4. ADAPT: If blocked, try alternative tools/approaches
5. PERSIST: Never accept defeat - exhaust all options
6. COMBINE: Chain tools creatively for complex solutions

FAILURE RECOVERY:
- Tool failed? Try different parameters or alternative tools
- Blocked? Find creative workarounds using other tools
- Stuck? Break the problem into smaller parts
- Error? Learn from it and adjust your approach

MINDSET: Every problem has a solution. Your job is to find it using the tools available. Be relentless, creative, and resourceful.`;
  }

  /**
   * Categorize tools for better organization in prompts
   */
  private categorizeTools(tools: Tool[]): Record<string, Tool[]> {
    const categories: Record<string, Tool[]> = {
      'File Operations': [],
      'Web/Browser': [],
      'System': [],
      'Communication': [],
      'Data Processing': [],
      'Other': []
    };

    tools.forEach(tool => {
      const name = tool.name.toLowerCase();
      if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('create')) {
        categories['File Operations'].push(tool);
      } else if (name.includes('web') || name.includes('browser') || name.includes('http') || name.includes('url')) {
        categories['Web/Browser'].push(tool);
      } else if (name.includes('system') || name.includes('command') || name.includes('execute')) {
        categories['System'].push(tool);
      } else if (name.includes('email') || name.includes('message') || name.includes('send')) {
        categories['Communication'].push(tool);
      } else if (name.includes('data') || name.includes('process') || name.includes('analyze')) {
        categories['Data Processing'].push(tool);
      } else {
        categories['Other'].push(tool);
      }
    });

    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });

    return categories;
  }

  /**
   * Format tool categories for display in prompts
   */
  private formatToolCategories(categories: Record<string, Tool[]>): string {
    return Object.entries(categories)
      .map(([category, tools]) => {
        const toolList = tools.map(tool => `  • ${tool.name}: ${tool.description}`).join('\n');
        return `${category}:\n${toolList}`;
      })
      .join('\n\n');
  }

  /**
   * Create iteration-specific prompt that maintains persistence across attempts
   */


  /**
   * Stop the current autonomous agent execution
   */
  public stop(): void {
    this.stopExecution = true;
  }
}

// Export singleton instance
export const angelaAgentService = new angelaAgentService(); 
