/**
 * angela Assistant API Service
 * 
 * Main orchestrator service that coordinates between specialized services
 * for provider management, tools, agents, chat, and attachments.
 */

import { 
  angelaMessage, 
  angelaFileAttachment, 
  angelaProvider, 
  angelaModel, 
  angelaAIConfig
} from '../types/angela_assistant_types';
import { addCompletionNotification, addInfoNotification } from './notificationService';
import { ToolSuccessRegistry } from './toolSuccessRegistry';
import { APIClient } from '../utils/APIClient';

// Import specialized services
import { angelaProviderService } from './angelaProviderService';
import { angelaToolService } from './angelaToolService';
import { angelaAgentService } from './angelaAgentService';
import { angelaChatService } from './angelaChatService';
import { angelaModelService } from './angelaModelService';
import { angelaAttachmentService } from './angelaAttachmentService';

export class angelaApiService {




  /**
   * Send a chat message
   */
  public async sendChatMessage(
    message: string,
    config: angelaAIConfig,
    attachments?: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void
  ): Promise<angelaMessage> {
    const client = angelaProviderService.getCurrentClient();
    if (!client) {
      throw new Error('No API client configured. Please select a provider.');
    }

    // Switch to the provider specified in config if different from current
    await this.ensureCorrectProvider(config, onContentChunk);

    try {
      // Process file attachments if any
      const processedAttachments = await angelaAttachmentService.processFileAttachments(attachments || []);

      // Determine the appropriate model based on context and auto selection settings
      let modelId = angelaModelService.selectAppropriateModel(config, message, processedAttachments, conversationHistory);
      
      // Extract model ID from provider prefix if present
      modelId = angelaModelService.extractModelId(modelId);

      // Get tools if enabled
      const tools = await angelaToolService.getAvailableTools(config, onContentChunk);

      // Check if autonomous agent mode is enabled
      const isAutonomousMode = config.autonomousAgent?.enabled !== false;
      
      if (isAutonomousMode) {
        console.log(`🤖 Autonomous agent mode enabled - using new agent system`);
        
        // Add notification for autonomous mode start
        addInfoNotification(
          'Autonomous Mode Activated',
          'angela is now operating in autonomous mode.',
          3000
        );

        // Execute autonomous agent workflow
        const result = await angelaAgentService.executeAutonomousAgent(
          client,
          modelId, 
          message,
          tools, 
          config, 
          processedAttachments,
          systemPrompt,
          conversationHistory,
          onContentChunk,
          angelaProviderService.getCurrentProvider()?.id
        );

        // Add completion notification for autonomous mode
        const toolsUsed = result.metadata?.toolsUsed || [];
        const agentSteps = result.metadata?.agentSteps || 1;
        
        addCompletionNotification(
          'Autonomous Agent Complete',
          `Completed in ${agentSteps} steps${toolsUsed.length > 0 ? ` using ${toolsUsed.length} tools` : ''}.`,
          5000
        );

        return result;
      }

        // Execute standard chat workflow
      const shouldDisableStreamingForTools = angelaProviderService.shouldDisableStreamingForTools(tools);
      
      const result = await angelaChatService.executeStandardChat(
        client,
          modelId, 
        message,
          tools, 
          config,
        processedAttachments,
        systemPrompt,
        conversationHistory,
        onContentChunk,
        angelaProviderService.getCurrentProvider()?.id,
        shouldDisableStreamingForTools
        );

        return result;

    } catch (error) {
      console.error('Chat execution failed:', error);
      
      // Check if this is an abort error (user stopped the stream)
      const isAbortError = error instanceof Error && (
        error.message.includes('aborted') ||
        error.message.includes('BodyStreamBuffer was aborted') ||
        error.message.includes('AbortError') ||
        error.name === 'AbortError'
      );
      
      if (isAbortError) {
        console.log('Stream was aborted by user, returning partial content');
        
        return {
          id: `${Date.now()}-aborted`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          metadata: {
            model: `${config.provider}:${config.models.text || 'unknown'}`,
            temperature: config.parameters.temperature,
            aborted: true,
            error: 'Stream was stopped by user'
          }
        };
      }
      
      // Return error message with detailed server information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const status = (error as any)?.status;
      const errorData = (error as any)?.errorData;
      const rawResponse = (error as any)?.rawResponse;
      
      // Create more informative error message based on the actual server response
      let userFriendlyMessage = 'I encountered an error processing your request.';
      
      if (rawResponse && rawResponse.trim() && rawResponse !== errorMessage) {
        // If we have raw response text that's different from the error message, show it
        userFriendlyMessage = `I encountered an error processing your request. Response from server: ${rawResponse}

**If you're using angela Core:** The model may not be loaded correctly. Please go to Settings and apply the Balanced configuration to resolve this issue.`;
      } else if (errorMessage.includes('502')) {
        userFriendlyMessage = 'The server is temporarily unavailable. This could be due to the model loading, server maintenance, or connectivity issues.';
      } else if (errorMessage.includes('500')) {
        userFriendlyMessage = 'The server encountered an internal error. Please try again in a moment.';
      } else if (errorMessage.includes('503')) {
        userFriendlyMessage = 'The service is temporarily unavailable. The server may be overloaded or under maintenance.';
      } else if (errorMessage.includes('504')) {
        userFriendlyMessage = 'The request timed out. Please try again with a shorter message or wait a moment.';
      } else if (errorMessage.includes('upstream command exited prematurely')) {
        userFriendlyMessage = 'The AI model process stopped unexpectedly. This is usually temporary - please try your request again.';
      } else {
        userFriendlyMessage = `Error: ${errorMessage}`;
      }
      
      return {
        id: `${Date.now()}-error`,
        role: 'assistant',
        content: userFriendlyMessage,
        timestamp: new Date(),
        metadata: {
          error: errorMessage,
          serverStatus: status,
          errorData: errorData,
          failed: true,
          isStreaming: false
        }
      };
    }
  }

  /**
   * Ensure we're using the correct provider
   */
  private async ensureCorrectProvider(config: angelaAIConfig, _onContentChunk?: (content: string) => void): Promise<void> {
    const currentProvider = angelaProviderService.getCurrentProvider();
    
    if (config.provider && (!currentProvider || currentProvider.id !== config.provider)) {
      console.log(`🔄 Switching provider from ${currentProvider?.id || 'none'} to ${config.provider}`);
      try {
        const providers = await angelaProviderService.getProviders();
        const requestedProvider = providers.find(p => p.id === config.provider);
        
        if (requestedProvider) {
          console.log(`✅ Found provider ${config.provider}:`, {
            name: requestedProvider.name,
            baseUrl: requestedProvider.baseUrl,
            isEnabled: requestedProvider.isEnabled
          });
          
          if (!requestedProvider.isEnabled) {
            throw new Error(`Provider ${requestedProvider.name} is not enabled`);
          }
          
          // Update the client to use the requested provider
          angelaProviderService.updateProvider(requestedProvider);
          console.log(`🚀 Switched to provider: ${requestedProvider.name} (${requestedProvider.baseUrl})`);
          } else {
          throw new Error(`Provider ${config.provider} not found or not configured`);
            }
        } catch (error) {
        console.error(`❌ Failed to switch to provider ${config.provider}:`, error);
        throw new Error(`Failed to switch to provider ${config.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (config.provider) {
      console.log(`✅ Already using correct provider: ${currentProvider?.name} (${currentProvider?.baseUrl})`);
    }
  }

  // Delegate provider-related methods to angelaProviderService
  public async getProviders(): Promise<angelaProvider[]> {
    return angelaProviderService.getProviders();
  }

  public async getModels(providerId?: string): Promise<angelaModel[]> {
    return angelaProviderService.getModels(providerId);
  }

  public async getCurrentProviderModels(): Promise<angelaModel[]> {
    return angelaProviderService.getCurrentProviderModels();
  }

  public async getPrimaryProvider(): Promise<angelaProvider | null> {
    return angelaProviderService.getPrimaryProvider();
  }

  public async setPrimaryProvider(providerId: string): Promise<void> {
    return angelaProviderService.setPrimaryProvider(providerId);
  }

  public updateProvider(provider: angelaProvider): void {
    return angelaProviderService.updateProvider(provider);
  }

  public async healthCheck(): Promise<boolean> {
    return angelaProviderService.healthCheck();
  }

  public async testProvider(provider: angelaProvider): Promise<boolean> {
    return angelaProviderService.testProvider(provider);
  }

  public getCurrentClient() {
    return angelaProviderService.getCurrentClient();
  }

  public getCurrentProvider(): angelaProvider | null {
    return angelaProviderService.getCurrentProvider();
  }

  /**
   * Stop the current chat generation
   */
  public stop(): void {
    // Set stop flag for autonomous mode
    
    // Stop agent execution
    angelaAgentService.stop();
    
    // Stop API client streaming
    const client = angelaProviderService.getCurrentClient();
    if (client) {
      const apiClient = client as any;
      if (typeof apiClient.abortStream === 'function') {
        apiClient.abortStream();
        console.log('Stream aborted successfully');
      }
    }
  }

  /**
   * Preload/warm up a model
   */
  public async preloadModel(config: angelaAIConfig, conversationHistory?: angelaMessage[]): Promise<void> {
    const client = angelaProviderService.getCurrentClient();
    if (!client || !config.models.text) {
      return;
    }

    // Only preload for local providers
    const currentProvider = angelaProviderService.getCurrentProvider();
    const isLocalProvider = angelaModelService.isLocalProvider(config, currentProvider?.baseUrl);
    
    if (!isLocalProvider) {
      return;
    }

    let modelId = angelaModelService.selectAppropriateModel(config, '', [], conversationHistory);
    modelId = angelaModelService.extractModelId(modelId);

    await angelaChatService.preloadModel(client, modelId, config, isLocalProvider);
  }

  /**
   * Record a successful tool execution
   */
  public recordToolSuccess(toolName: string, toolDescription: string, toolCallId?: string): void {
    const currentProvider = angelaProviderService.getCurrentProvider();
    angelaToolService.recordToolSuccess(
      toolName,
      toolDescription,
      currentProvider?.id || 'unknown',
      toolCallId
    );
  }

  /**
   * Clear incorrectly blacklisted tools
   */
  public clearBlacklistedTools(): void {
    const currentProvider = angelaProviderService.getCurrentProvider();
    const client = angelaProviderService.getCurrentClient();
    
    if (currentProvider && client) {
      angelaToolService.clearBlacklistedTools(currentProvider.id, client);
        
        addInfoNotification(
          'Tools Reset',
        `Cleared incorrectly blacklisted tools for ${currentProvider.name}.`,
          8000
        );
    }
  }

  /**
   * Clear blacklisted MCP tools specifically (for fixing false positives)
   */
  public clearMCPToolBlacklists(): void {
    // Clear from ToolSuccessRegistry
    ToolSuccessRegistry.clearMCPToolBlacklists();
    
    // Clear from APIClient static method
    APIClient.clearMCPToolBlacklists();
    
    addInfoNotification(
      'MCP Tools Restored',
      'Cleared all blacklisted MCP tools. These core tools are now protected from future blacklisting.',
      10000
    );
  }
}

// Export singleton instance
export const angelaApiService = new angelaApiService(); 

// Expose MCP tool restoration function globally for emergency console access
if (typeof window !== 'undefined') {
  (window as any).angelaEmergencyRestoreMCPTools = () => {
    console.log('🚨 Emergency MCP Tool Restoration via Console');
    angelaApiService.clearMCPToolBlacklists();
    
    // Also call the static methods directly for immediate effect
    ToolSuccessRegistry.clearMCPToolBlacklists();
    APIClient.clearMCPToolBlacklists();
    
    console.log('✅ MCP tools have been restored and are now protected');
    console.log('🔄 Please refresh the page to see the changes');
    
    return {
      success: true,
      message: 'MCP tools restored successfully',
      note: 'Please refresh the page to see changes'
    };
  };
  
  console.log('🔧 angela Emergency Functions Available:');
  console.log('- angelaEmergencyRestoreMCPTools() - Restore blacklisted MCP tools');
} 
