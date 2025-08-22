/**
 * angela Model Service
 * Handles model selection and auto-selection logic
 */

import { 
  angelaMessage, 
  angelaFileAttachment, 
  angelaAIConfig
} from '../types/angela_assistant_types';

export class angelaModelService {
  /**
   * Select the appropriate model based on context and configuration
   */
  public selectAppropriateModel(
    config: angelaAIConfig, 
    message: string, 
    attachments: angelaFileAttachment[],
    conversationHistory?: angelaMessage[]
  ): string {
    // If auto model selection is disabled, use the configured text model
    if (!config.features.autoModelSelection) {
      return config.models.text || 'llama2';
    }
    
    // Check for images in current attachments
    const hasCurrentImages = attachments.some(att => att.type === 'image');
    
    // Check for images in conversation history
    const hasHistoryImages = conversationHistory ? 
      conversationHistory.slice(-10).some(msg => 
        msg.attachments && msg.attachments.some(att => att.type === 'image')
      ) : false;
    
    const hasImages = hasCurrentImages || hasHistoryImages;
    
    // Check for code-related content
    const hasCodeFiles = attachments.some(att => att.type === 'code');
    const hasCodeKeywords = /\b(code|programming|function|class|variable|debug|compile|syntax|algorithm|script|development)\b/i.test(message);
    const hasCodeContext = hasCodeFiles || hasCodeKeywords;
    
    // Check for tools mode
    const isToolsMode = config.features.enableTools && !config.features.enableStreaming;
    
    // Model selection priority:
    // 1. Vision model for images
    // 2. Code model for tools mode or code context
    // 3. Text model for general use
    
    if (hasImages && config.models.vision) {
      return config.models.vision;
    }
    
    if (isToolsMode && config.models.code) {
      return config.models.code;
    }
    
    if (hasCodeContext && config.models.code && config.features.enableStreaming) {
      return config.models.code;
    }
    
    // Default to text model
    return config.models.text || 'llama2';
  }

  /**
   * Extract model ID from provider-prefixed model string
   */
  public extractModelId(modelId: string): string {
    // If the model ID includes the provider prefix (e.g., "ollama:qwen3:30b"), 
    // extract everything after the first colon to get the actual model name
    if (modelId.includes(':')) {
      const parts = modelId.split(':');
      // Remove the provider part (first element) and rejoin the rest
      const originalModelId = modelId;
      const extractedModelId = parts.slice(1).join(':');
      console.log(`Model ID extraction: "${originalModelId}" -> "${extractedModelId}"`);
      return extractedModelId;
    }
    
    return modelId;
  }

  /**
   * Determine if a provider is local based on configuration
   */
  public isLocalProvider(config: angelaAIConfig, baseUrl?: string): boolean {
    const providerType = config.provider;
    const url = baseUrl?.toLowerCase() || '';
    
    return providerType === 'ollama' || 
           url.includes('localhost') ||
           url.includes('127.0.0.1') ||
           url.includes('0.0.0.0');
  }
}

// Export singleton instance
export const angelaModelService = new angelaModelService(); 
