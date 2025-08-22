/**
 * angela Chat Service
 * 
 * This service handles standard chat interactions with AI models.
 * It manages conversation flow, tool execution, and response processing.
 */

import { AssistantAPIClient } from '../utils/AssistantAPIClient';
import type { ChatMessage } from '../utils/APIClient';
import { 
  angelaMessage, 
  angelaFileAttachment, 
  angelaAIConfig
} from '../types/angela_assistant_types';
import type { Tool } from '../db';
import { angelaToolService } from './angelaToolService';
import { TokenLimitRecoveryService } from './tokenLimitRecoveryService';
import { addErrorNotification } from './notificationService';
import { angelaImageExtractionService } from './angelaImageExtractionService';

export class angelaChatService {
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
   * Execute standard chat workflow without autonomous agent mode
   */
  public async executeStandardChat(
    client: AssistantAPIClient,
    modelId: string,
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string,
    shouldDisableStreamingForTools?: boolean
  ): Promise<angelaMessage> {
    const options = {
      temperature: config.parameters.temperature,
      max_tokens: config.parameters.maxTokens,
      top_p: config.parameters.topP
    };

    let responseContent = '';
    let totalTokens = 0;
    let toolResults: any[] = [];
    let finalUsage: any = {};
    let finalTimings: any = {};
    let streamWasAborted = false;

    // Build conversation messages
    const messages = this.buildConversationMessages(
      systemPrompt || 'You are angela, a helpful AI assistant.',
      message,
      attachments,
      conversationHistory
    );

    console.log(`💬 Starting chat execution with ${messages.length} messages and ${tools.length} tools`);

    try {
      let response;

      // Try streaming first if enabled
      if (config.features.enableStreaming) {
        // Check if we should disable streaming for this provider when tools are present
        if (shouldDisableStreamingForTools) {
          console.log(`🔄 Disabling streaming for provider with tools present`);
          if (onContentChunk) {
            onContentChunk('⚠️ Switching to non-streaming mode for better tool support with this provider...\n\n');
          }
          // Use non-streaming mode
          response = await client.sendChat(modelId, messages, options, tools);
          responseContent = response.message?.content || '';
          totalTokens = response.usage?.total_tokens || 0;
          finalUsage = response.usage || {};
          finalTimings = response.timings || {};
          
          if (onContentChunk && responseContent) {
            onContentChunk(responseContent);
          }
        } else {
          // Use streaming mode
          try {
            const collectedToolCalls: any[] = [];
            let streamContent = '';
            
            for await (const chunk of client.streamChat(modelId, messages, options, tools)) {
              if (chunk.message?.content) {
                streamContent += chunk.message.content;
                responseContent += chunk.message.content;
                if (onContentChunk) {
                  onContentChunk(chunk.message.content);
                }
              }

              // Check if stream was aborted
              if (chunk.finish_reason === 'aborted') {
                console.log(`🛑 [CHAT-SERVICE] Stream was aborted, preserving ${streamContent.length} characters`);
                streamWasAborted = true;
                // Break out of loop gracefully - content is already accumulated
                break;
              }

              // Collect tool calls
              if (chunk.message?.tool_calls) {
                for (const toolCall of chunk.message.tool_calls) {
                  if (!toolCall.id && !toolCall.function?.name) {
                    continue;
                  }
                  
                  let existingCall = collectedToolCalls.find(c => c.id === toolCall.id);
                  if (!existingCall) {
                    existingCall = {
                      id: toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: toolCall.type || 'function',
                      function: { name: '', arguments: '' }
                    };
                    collectedToolCalls.push(existingCall);
                  }
                  
                  if (toolCall.function?.name) {
                    existingCall.function.name = toolCall.function.name;
                  }
                  
                  if (toolCall.function?.arguments) {
                    existingCall.function.arguments += toolCall.function.arguments;
                  }
                }
              }

              if (chunk.usage?.total_tokens) {
                totalTokens = chunk.usage.total_tokens;
                finalUsage = chunk.usage;
              }
              if (chunk.timings) {
                finalTimings = chunk.timings;
              }
            }

            response = {
              message: {
                content: streamContent,
                tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined
              },
              usage: { total_tokens: totalTokens }
            };

            // Filter out incomplete tool calls
            if (response.message?.tool_calls) {
              response.message.tool_calls = response.message.tool_calls.filter(toolCall => {
                if (!toolCall.function?.name || toolCall.function.name.trim() === '') {
                  return false;
                }
                
                if (typeof toolCall.function.arguments !== 'string') {
                  return false;
                }
                
                try {
                  JSON.parse(toolCall.function.arguments || '{}');
                  return true;
                } catch (parseError) {
                  return false;
                }
              });
              
              if (response.message.tool_calls.length === 0) {
                response.message.tool_calls = undefined;
              }
            }

          } catch (streamError: any) {
            const errorMessage = streamError.message?.toLowerCase() || '';
            if (errorMessage.includes('stream') && errorMessage.includes('tool') && tools.length > 0) {
              if (onContentChunk) {
                onContentChunk('\n⚠️ Switching to non-streaming mode for tool support...\n\n');
              }
              response = await client.sendChat(modelId, messages, options, tools);
              responseContent = response.message?.content || '';
              totalTokens = response.usage?.total_tokens || 0;
              finalUsage = response.usage || {};
              finalTimings = response.timings || {};
              
              if (onContentChunk && responseContent) {
                onContentChunk(responseContent);
              }
            } else {
              throw streamError;
            }
          }
        }
      } else {
        // Non-streaming mode
        response = await client.sendChat(modelId, messages, options, tools);
        responseContent = response.message?.content || '';
        totalTokens = response.usage?.total_tokens || 0;
        finalUsage = response.usage || {};
        finalTimings = response.timings || {};
        
        if (onContentChunk && responseContent) {
          onContentChunk(responseContent);
        }
      }

      // Handle tool calls if any
      if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
        if (onContentChunk) {
          onContentChunk('\n\n🔧 **Executing tools...**\n\n');
        }

        toolResults = await angelaToolService.executeToolCalls(response.message.tool_calls, currentProviderId);

        if (onContentChunk) {
          onContentChunk('✅ **Tools executed**\n\n');
        }

        // After tool execution, make a follow-up request to process the results
        if (toolResults.length > 0) {
          const followUpMessages = [...messages];
          
          // Add the assistant's message with tool calls
          followUpMessages.push({
            role: 'assistant',
            content: response.message.content || '',
            tool_calls: response.message.tool_calls
          });
          
          // Add tool results
          for (const toolCall of response.message.tool_calls) {
            const result = toolResults.find(r => r.toolName === toolCall.function?.name);
            
            if (result) {
              let content: string;
              if (result.success && result.result !== undefined && result.result !== null) {
                content = this.serializeToolResult(result.result);
              } else {
                content = result.error || `Tool ${result.toolName} execution failed`;
              }
              
              followUpMessages.push({
                role: 'tool',
                content: content,
                name: result.toolName,
                tool_call_id: toolCall.id
              });
            } else {
              followUpMessages.push({
                role: 'tool',
                content: `Tool execution failed: No result returned for ${toolCall.function?.name || 'unknown tool'}`,
                name: toolCall.function?.name || 'unknown_tool',
                tool_call_id: toolCall.id
              });
            }
          }

          // Make follow-up request
          try {
            const followUpResponse = await client.sendChat(modelId, followUpMessages, options);
            const followUpContent = followUpResponse.message?.content || '';
            
            if (followUpContent) {
              responseContent += followUpContent;
              totalTokens += followUpResponse.usage?.total_tokens || 0;
              
              if (onContentChunk) {
                onContentChunk(followUpContent);
              }
            }
          } catch (followUpError) {
            console.error('❌ Follow-up request failed:', followUpError);
            if (onContentChunk) {
              onContentChunk('\n⚠️ Failed to process tool results, but tools were executed successfully.\n');
            }
          }
        }
      }

    } catch (error) {
      console.error('Standard chat execution failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const rawResponse = (error as any)?.rawResponse;
      
      // Create more informative error message based on the actual server response
      if (rawResponse && rawResponse.trim() && rawResponse !== errorMessage) {
        // If we have raw response text that's different from the error message, show it
        responseContent = `The server responded with: ${rawResponse}`;
      } else if (errorMessage.includes('502')) {
        responseContent = 'The server is temporarily unavailable. This could be due to the model loading, server maintenance, or connectivity issues.';
      } else if (errorMessage.includes('500')) {
        responseContent = 'The server encountered an internal error. Please try again in a moment.';
      } else if (errorMessage.includes('503')) {
        responseContent = 'The service is temporarily unavailable. The server may be overloaded or under maintenance.';
      } else if (errorMessage.includes('504')) {
        responseContent = 'The request timed out. Please try again with a shorter message or wait a moment.';
      } else if (errorMessage.includes('upstream command exited prematurely')) {
        responseContent = 'The AI model process stopped unexpectedly. This is usually temporary - please try your request again.';
      } else {
        responseContent = `Error: ${errorMessage}`;
      }
      
      // Store error information for proper propagation
      (this as any).lastError = error;
    }

    // Create final angela message
    const angelaMessage: angelaMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: responseContent || 'I apologize, but I was unable to generate a response.',
      timestamp: new Date(),
      metadata: {
        model: `${config.provider}:${modelId}`,
        tokens: totalTokens,
        usage: finalUsage,
        timings: finalTimings,
        temperature: config.parameters.temperature,
        toolsUsed: toolResults.map(tc => tc.toolName),
        autonomousMode: false,
        // Include abort information if stream was aborted
        aborted: streamWasAborted,
        // Include error information if available
        ...(((this as any).lastError) && {
          error: (this as any).lastError instanceof Error ? (this as any).lastError.message : 'Unknown error',
          serverStatus: ((this as any).lastError as any)?.status,
          errorData: ((this as any).lastError as any)?.errorData
        })
      }
    };

    // Add artifacts if any were generated from tool calls
    if (toolResults.length > 0) {
      angelaMessage.artifacts = angelaToolService.parseToolResultsToArtifacts(toolResults);
      
      // **NEW: Extract images from tool results and store separately**
      try {
        const extractedImages = angelaImageExtractionService.extractImagesFromToolResults(
          toolResults,
          angelaMessage.id
        );
        
        if (extractedImages.length > 0) {
          // Add extracted images to metadata (not chat history)
          if (!angelaMessage.metadata) {
            angelaMessage.metadata = {};
          }
          angelaMessage.metadata.extractedImages = extractedImages;
          
          console.log(`📷 Extracted ${extractedImages.length} images from tool results:`, 
            extractedImages.map(img => `${img.toolName}:${img.description}`));
        }
      } catch (error) {
        console.error('Error extracting images from tool results:', error);
        // Don't fail the message if image extraction fails
      }
    }

    return angelaMessage;
  }

  /**
   * Build conversation messages for API call
   */
  public buildConversationMessages(
    systemPrompt: string,
    userMessage: string,
    attachments: angelaFileAttachment[],
    conversationHistory?: angelaMessage[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // Add system prompt
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add conversation history if provided with proper role alternation
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
      console.log(`📚 Added ${validMessages.length} properly formatted history messages to chat context`);
    }

    // Add the current user message
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage
    };

    // Add images if any attachments are images
    const imageAttachments = attachments.filter(att => att.type === 'image');
    if (imageAttachments.length > 0) {
      userChatMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
    }

    messages.push(userChatMessage);

    return messages;
  }

  /**
   * Preload/warm up a model
   */
  public async preloadModel(
    client: AssistantAPIClient,
    modelId: string,
    _config: angelaAIConfig,
    isLocalProvider: boolean
  ): Promise<void> {
    if (!client || !modelId) {
      return;
    }

    // Only preload for local providers
    if (!isLocalProvider) {
      return;
    }

    try {
      const warmupMessages = [
        { role: 'system' as const, content: 'You are angela, a helpful AI assistant.' },
        { role: 'user' as const, content: 'Hi' }
      ];

      const warmupOptions = {
        temperature: 0.1,
        max_tokens: 1,
        stream: false
      };

      client.sendChat(modelId, warmupMessages, warmupOptions).catch(() => {
        // Silently handle errors
      });
    } catch (error) {
      // Silently handle preload errors
    }
  }
}

// Export singleton instance
export const angelaChatService = new angelaChatService(); 
