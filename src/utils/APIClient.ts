import type { Tool } from '../db';
import { TokenLimitRecoveryService } from '../services/tokenLimitRecoveryService';
import { ToolSuccessRegistry } from '../services/toolSuccessRegistry';

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  tool_calls?: any[];
  name?: string; // For tool responses
  tool_call_id?: string; // Required for OpenAI tool messages
}

export interface RequestOptions {
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Tool[];
  max_tokens?: number;
  [key: string]: any;
}

export interface APIConfig {
  apiKey: string;
  baseUrl: string;
  providerId?: string;
}

// Enhanced error interface for better error handling
interface EnhancedError extends Error {
  status?: number;
  statusText?: string;
  errorData?: any;
  isStreaming?: boolean;
  rawResponse?: string;
}

interface APIResponse {
  message?: {
    content: string;
    role: ChatRole;
    tool_calls?: {
      id?: string;
      type?: string;
      function: {
        name: string;
        arguments: string | Record<string, unknown>;
      };
    }[];
    reasoning_content?: string; // For reasoning models like QwQ
  };
  choices?: [{
    message: {
      content: string;
      role: string;
      tool_calls?: any[];
    };
    delta?: {
      content?: string;
      role?: string;
      tool_calls?: any[];
      reasoning_content?: string; // For reasoning models like QwQ
    };
    finish_reason?: string;
  }];
  finish_reason?: string;
  usage?: {
    total_tokens: number;
    completion_tokens?: number;
    prompt_tokens?: number;
  };
  timings?: {
    prompt_n?: number;
    prompt_ms?: number;
    prompt_per_token_ms?: number;
    prompt_per_second?: number;
    predicted_n?: number;
    predicted_ms?: number;
    predicted_per_token_ms?: number;
    predicted_per_second?: number;
  };
}

export class APIClient {
  private abortController: AbortController | null = null;
  private config: APIConfig;
  private static problematicTools: Set<string> = new Set();
  private recoveryService: TokenLimitRecoveryService;

  constructor(baseUrl: string, config?: Partial<APIConfig>) {
    this.config = {
      apiKey: config?.apiKey || '',
      baseUrl: baseUrl,
      providerId: config?.providerId
    };
    
    // Initialize the recovery service and set this API client
    this.recoveryService = TokenLimitRecoveryService.getInstance();
    this.recoveryService.setApiClient(this);
  }

  /**
   * Get the current configuration
   */
  public getConfig(): APIConfig {
    return { ...this.config };
  }

  /**
   * Filter out model control tokens from content
   * @param content - The content to filter
   * @returns Filtered content without control tokens
   */
  private filterControlTokens(content: string): string {
    if (!content) return content;

    // Remove common model control tokens - specifically targeting the <|channel|> issue
    // IMPORTANT: Only remove tokens, preserve all spacing and formatting
    let filtered = content
      // Remove specific problematic tokens like <|channel|>, <|analysis|>, etc.
      // This targets the exact issue without being too broad
      .replace(/<\|channel\|>/gi, '')
      .replace(/<\|analysis\|>/gi, '')
      .replace(/<\|system\|>/gi, '')
      .replace(/<\|assistant\|>/gi, '')
      .replace(/<\|user\|>/gi, '')
      .replace(/<\|function\|>/gi, '')
      .replace(/<\|tool\|>/gi, '')
      // Remove standalone control tokens ONLY when they appear as isolated tokens at start of response
      // VERY SPECIFIC: Only remove if it's literally just "analysis" or "channel" followed by newline/end
      .replace(/^analysis(\r?\n|$)/gmi, '')
      .replace(/^channel(\r?\n|$)/gmi, '')
      // Keep a more specific pattern for other similar control tokens
      .replace(/<\|[a-zA-Z0-9_]+\|>/g, '')
      // Remove instruction tokens
      .replace(/\[INST\]|\[\/INST\]/g, '')
      // Remove system tokens  
      .replace(/<<SYS>>|<\/SYS>>/g, '')
      // Remove chat template tokens
      .replace(/<\|im_start\||<\|im_end\|>/g, '')
      // Remove template variables
      .replace(/\{\{[^}]*\}\}/g, '')
      // Remove special tokens
      .replace(/<\|endoftext\|>/g, '')
      .replace(/<\|startoftext\|>/g, '')
      // Remove padding and special tokens
      .replace(/\[PAD\]|\[UNK\]|\[CLS\]|\[SEP\]|\[MASK\]/g, '')
      .replace(/<pad>|<\/s>|<s>/g, '');
      // REMOVED: Don't mess with spacing or trim - preserve original formatting

    return filtered;
  }

  /**
   * Helper for making API requests.
   */
  private async request(endpoint: string, method: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Use abort controller if available
    const fetchOptions: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    };

    if (this.abortController) {
      fetchOptions.signal = this.abortController.signal;
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, fetchOptions);

    if (!response.ok) {
      // Try to get the actual server response (JSON or text)
      let errorData: any = null;
      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      let rawResponseText: string = '';
      
      try {
        // First try to get the raw response text
        rawResponseText = await response.text();
        
        // Try to parse as JSON if it looks like JSON
        if (rawResponseText.trim().startsWith('{') || rawResponseText.trim().startsWith('[')) {
          try {
            errorData = JSON.parse(rawResponseText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (jsonParseError) {
            // If JSON parsing fails, use the raw text as the error message
            if (rawResponseText.trim()) {
              errorMessage = rawResponseText.trim();
            }
          }
        } else {
          // Not JSON, use the raw text as the error message
          if (rawResponseText.trim()) {
            errorMessage = rawResponseText.trim();
          }
        }
      } catch (textParseError) {
        // If we can't even get text, keep the original error message
        console.warn('Failed to parse error response as text:', textParseError);
      }
      
      // Create error with detailed information
      const error: EnhancedError = new Error(errorMessage);
      error.status = response.status;
      error.errorData = errorData;
      (error as any).rawResponse = rawResponseText;
      throw error;
    }

    return response.json();
  }

  /**
   * Lists available models
   */
  public async listModels(): Promise<any[]> {
    try {
      const response = await this.request('/models', 'GET');
      
      // Handle different response formats
      if (Array.isArray(response?.data)) {
        return response.data.map((model: any) => ({
          name: model.id,
          id: model.id,
          digest: model.created?.toString() || '',
          size: 0,
          modified_at: model.created?.toString() || ''
        }));
      } else if (Array.isArray(response)) {
        return response.map((model: any) => ({
          name: model.id || model.name,
          id: model.id || model.name,
          digest: model.created?.toString() || '',
          size: 0,
          modified_at: model.created?.toString() || ''
        }));
      } else {
        console.warn('Unexpected model list format:', response);
        return [];
      }
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }

  /**
   * Aborts any ongoing stream requests or chat operations.
   */
  public abortStream(): void {
    if (this.abortController) {
      console.log('🛑 [API-CLIENT] Aborting ongoing operation...');
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if there's an ongoing operation that can be aborted
   */
  public isProcessing(): boolean {
    return this.abortController !== null;
  }

  /**
   * Alias for abortStream for better clarity when aborting any operation
   */
  public abort(): void {
    this.abortStream();
  }

  /**
   * Send a chat message with optional tools.
   */
  public async sendChat(
    model: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): Promise<APIResponse> {
    return this.sendChatWithDynamicToolRemoval(model, messages, options, tools);
  }

  /**
   * Check if a model is a GPT-4o series model that requires max_completion_tokens
   */
  private isGPT4oModel(model: string): boolean {
    const modelName = model.toLowerCase();
    return modelName.includes('gpt-4o') || 
           modelName.includes('gpt-4o-mini') ||
           modelName.includes('gpt-4o-2024') ||
           modelName.startsWith('gpt-4o');
  }

  /**
   * Check if a model is a GPT-5 series model that has specific parameter restrictions
   */
  private isGPT5Model(model: string): boolean {
    const modelName = model.toLowerCase();
    return modelName.includes('gpt-5') || 
           modelName.includes('gpt-5-mini') ||
           modelName.includes('gpt-5-2024') ||
           modelName.startsWith('gpt-5');
  }

  /**
   * Transform API parameters for modern OpenAI model compatibility (GPT-4o, GPT-5)
   */
  private transformParametersForModernModels(options: RequestOptions, model: string): RequestOptions {
    // Create a new options object to avoid mutating the original
    const transformedOptions = { ...options };

    // GPT-4o specific transformations
    if (this.isGPT4oModel(model)) {
      // Transform max_tokens to max_completion_tokens for GPT-4o models
      if (transformedOptions.max_tokens && !transformedOptions.max_completion_tokens) {
        transformedOptions.max_completion_tokens = transformedOptions.max_tokens;
        delete transformedOptions.max_tokens;
        console.log(`🔧 [GPT-4o] Transformed max_tokens (${transformedOptions.max_completion_tokens}) to max_completion_tokens for GPT-4o model: ${model}`);
      }
    }

    // GPT-5 specific transformations
    if (this.isGPT5Model(model)) {
      // GPT-5 models only support temperature = 1 (default)
      if (transformedOptions.temperature !== undefined && transformedOptions.temperature !== 1) {
        const originalTemp = transformedOptions.temperature;
        transformedOptions.temperature = 1;
        console.log(`🔧 [GPT-5] Transformed temperature (${originalTemp} → 1) for GPT-5 model: ${model} (GPT-5 only supports default temperature)`);
      }

      // GPT-5 models also require max_completion_tokens instead of max_tokens
      if (transformedOptions.max_tokens && !transformedOptions.max_completion_tokens) {
        transformedOptions.max_completion_tokens = transformedOptions.max_tokens;
        delete transformedOptions.max_tokens;
        console.log(`🔧 [GPT-5] Transformed max_tokens (${transformedOptions.max_completion_tokens}) to max_completion_tokens for GPT-5 model: ${model}`);
      }
    }

    return transformedOptions;
  }

  /**
   * Send a chat message with dynamic tool removal on validation errors
   */
  private async sendChatWithDynamicToolRemoval(
    model: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[],
    attempt: number = 1
  ): Promise<APIResponse> {
    // Set maximum attempts to prevent infinite loops
    const MAX_ATTEMPTS = 10;
    
    if (attempt > MAX_ATTEMPTS) {
      console.error(`🚫 [DYNAMIC-TOOLS] Maximum attempts (${MAX_ATTEMPTS}) reached, aborting`);
      throw new Error(`Maximum retry attempts (${MAX_ATTEMPTS}) exceeded. Unable to resolve tool validation errors.`);
    }

    // Check if operation was aborted
    if (this.abortController?.signal.aborted) {
      console.log(`🛑 [DYNAMIC-TOOLS] Operation aborted at attempt ${attempt}`);
      throw new Error('Operation was aborted by user');
    }

    let currentTools = tools ? [...tools] : undefined;
    
    // Filter out known problematic tools before starting
    if (currentTools && currentTools.length > 0) {
      const originalCount = currentTools.length;
      currentTools = this.filterOutProblematicTools(currentTools, this.config.providerId);
      if (currentTools.length < originalCount) {
        console.log(`🔧 [DYNAMIC-TOOLS] Filtered out ${originalCount - currentTools.length} known problematic tools, ${currentTools.length} remaining`);
      }
    }
    
    // Set up abort controller for this request if not already set
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    
    const formattedTools = currentTools?.map(tool => this.formatTool(tool));
    
    // Transform parameters for GPT-4o compatibility BEFORE creating payload
    const transformedOptions = this.transformParametersForModernModels(options, model);
    
    const payload = {
      model,
      messages: this.prepareMessages(messages),
      stream: false,
      ...transformedOptions
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    try {
      console.log(`🔧 [DYNAMIC-TOOLS] Attempt ${attempt}/${MAX_ATTEMPTS}: Sending request with ${formattedTools?.length || 0} tools`);
      
      // Check abort signal before making request
      if (this.abortController.signal.aborted) {
        throw new Error('Operation was aborted by user');
      }
      
      const response = await this.request('/chat/completions', 'POST', payload);
      
      console.log(`✅ [DYNAMIC-TOOLS] Request successful on attempt ${attempt}`);
      return {
        message: {
          content: response.choices?.[0]?.message?.content || '',
          role: response.choices?.[0]?.message?.role as ChatRole,
          tool_calls: response.choices?.[0]?.message?.tool_calls
        },
        usage: response.usage
      };
    } catch (error: any) {
      // Check if this is an abort error
      if (error.name === 'AbortError' || error.message.includes('aborted') || this.abortController?.signal.aborted) {
        console.log(`🛑 [DYNAMIC-TOOLS] Request aborted at attempt ${attempt}`);
        throw new Error('Operation was aborted by user');
      }

      console.log(`🔍 [DYNAMIC-TOOLS-DEBUG] Caught error:`, {
        message: error.message,
        status: error.status,
        errorData: error.errorData
      });
      
      // CRITICAL: Check token limit errors FIRST before tool validation errors
      const isTokenLimitError = this.isTokenLimitError(error);
      console.log(`🔍 [DYNAMIC-TOOLS-DEBUG] Is token limit error:`, isTokenLimitError);
      
      if (isTokenLimitError) {
        console.log("🔄 [TOKEN-LIMIT] Token limit error detected, initiating recovery...");
        
        // Parse token limit error details
        const tokenLimitError = this.parseTokenLimitError(error);
        
        // Use recovery service to compress context and continue
        const recoveredMessages = await this.recoveryService.handleTokenLimitError(
          tokenLimitError,
          messages,
          `chat_${Date.now()}`
        );
        
        // Ensure all messages have valid content
        const validatedMessages: ChatMessage[] = recoveredMessages.map(msg => ({
          ...msg,
          content: msg.content || '' // Ensure content is never undefined
        }));
        
        // Retry with recovered messages
        console.log("🔄 [TOKEN-LIMIT] Retrying with compressed context...");
        return this.sendChatWithDynamicToolRemoval(model, validatedMessages, options, tools, attempt + 1);
      }
      
      // Check if this is an OpenAI tool validation error (after excluding token limit errors)
      const isToolValidationError = this.isOpenAIToolValidationError(error);
      console.log(`🔍 [DYNAMIC-TOOLS-DEBUG] Is tool validation error:`, isToolValidationError);
      
      if (isToolValidationError && currentTools && currentTools.length > 0) {
        const problematicToolIndex = this.extractProblematicToolIndex(error);
        console.log(`🔍 [DYNAMIC-TOOLS-DEBUG] Problematic tool index:`, problematicToolIndex);
        
        if (problematicToolIndex !== null && problematicToolIndex < currentTools.length) {
          const removedTool = currentTools[problematicToolIndex];
          console.warn(`⚠️ [DYNAMIC-TOOLS] Removing problematic tool at index ${problematicToolIndex}: ${removedTool.name}`);
          console.warn(`⚠️ [DYNAMIC-TOOLS] Error details:`, error.message);
          
          // Store the problematic tool so it won't be loaded again
          this.storeProblematicTool(removedTool, error.message, this.config.providerId);
          
          // Remove the problematic tool
          currentTools.splice(problematicToolIndex, 1);
          
          // Retry with remaining tools
          console.log(`🔄 [DYNAMIC-TOOLS] Retrying with ${currentTools.length} remaining tools...`);
          return this.sendChatWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
        } else {
          console.warn(`⚠️ [DYNAMIC-TOOLS] Could not identify problematic tool index from error`);
          
          // If we can't identify the specific tool, remove the first tool and try again
          // This is a fallback to ensure we make progress
          if (currentTools.length > 0) {
            const removedTool = currentTools[0];
            console.warn(`⚠️ [DYNAMIC-TOOLS] Removing first tool as fallback: ${removedTool.name}`);
            this.storeProblematicTool(removedTool, error.message, this.config.providerId);
            currentTools.splice(0, 1);
            
            console.log(`🔄 [DYNAMIC-TOOLS] Retrying with ${currentTools.length} remaining tools...`);
            return this.sendChatWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
          } else {
            // No tools left, send without tools
            console.warn(`⚠️ [DYNAMIC-TOOLS] No tools left, sending without tools`);
            return this.sendChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
          }
        }
      } else if (isToolValidationError && (!currentTools || currentTools.length === 0)) {
        // This is the problematic case - tool validation error but no tools to remove
        // This suggests the error is in the message format itself, not the tools
        console.error(`🚫 [DYNAMIC-TOOLS] Tool validation error with no tools to remove. This suggests a message format issue.`);
        console.error(`🚫 [DYNAMIC-TOOLS] Error details:`, error.message);
        
        // Don't retry indefinitely - throw the error after a few attempts
        if (attempt >= 3) {
          console.error(`🚫 [DYNAMIC-TOOLS] Giving up after ${attempt} attempts with message format error`);
          throw new Error(`Tool validation error that cannot be resolved by removing tools: ${error.message}`);
        }
        
        // Try once more without tools, but don't loop forever
        console.warn(`⚠️ [DYNAMIC-TOOLS] Attempting once more without tools (attempt ${attempt + 1})`);
        return this.sendChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
      } else {
        // Not a tool validation error or token limit error, re-throw the error
        throw error;
      }
    }
  }

  /**
   * Stream a chat response with dynamic tool removal on validation errors
   */
  private async *streamChatWithDynamicToolRemoval(
    model: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[],
    attempt: number = 1
  ): AsyncGenerator<APIResponse> {
    // Track reasoning state for proper <think> block handling
    let isInReasoningMode = false;
    let hasStartedReasoning = false;
    // Track accumulated content for abort preservation
    let accumulatedContent = '';
    // Set maximum attempts to prevent infinite loops
    const MAX_ATTEMPTS = 10;
    
    if (attempt > MAX_ATTEMPTS) {
      console.error(`🚫 [DYNAMIC-TOOLS-STREAM] Maximum attempts (${MAX_ATTEMPTS}) reached, aborting`);
      throw new Error(`Maximum retry attempts (${MAX_ATTEMPTS}) exceeded. Unable to resolve tool validation errors.`);
    }

    // Check if operation was aborted
    if (this.abortController?.signal.aborted) {
      console.log(`🛑 [DYNAMIC-TOOLS-STREAM] Operation aborted at attempt ${attempt}`);
      return; // Exit gracefully instead of throwing - no content to preserve at this point
    }

    let currentTools = tools ? [...tools] : undefined;
    
    // Filter out known problematic tools before starting
    if (currentTools && currentTools.length > 0) {
      const originalCount = currentTools.length;
      currentTools = this.filterOutProblematicTools(currentTools, this.config.providerId);
      if (currentTools.length < originalCount) {
        console.log(`🔧 [DYNAMIC-TOOLS-STREAM] Filtered out ${originalCount - currentTools.length} known problematic tools, ${currentTools.length} remaining`);
      }
    }
    
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    const formattedTools = currentTools?.map(tool => this.formatTool(tool));
    
    // Transform parameters for GPT-4o compatibility BEFORE creating payload
    const transformedOptions = this.transformParametersForModernModels(options, model);
    
    const payload = { 
      model, 
      messages: this.prepareMessages(messages), 
      stream: true,
      ...transformedOptions 
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      console.log(`🔧 [DYNAMIC-TOOLS-STREAM] Attempt ${attempt}/${MAX_ATTEMPTS}: Sending stream request with ${formattedTools?.length || 0} tools`);
      
      // Check abort signal before making request
      if (signal.aborted) {
        return; // Exit gracefully instead of throwing - no content to preserve at this point
      }
      
      const streamResponse = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal
      });

      if (!streamResponse.ok) {
        // Try to get the actual server response (JSON or text)
        let errorMessage = `Stream request failed: ${streamResponse.status} ${streamResponse.statusText}`;
        let errorData: any = null;
        let rawResponseText: string = '';
        
        try {
          // First try to get the raw response text
          rawResponseText = await streamResponse.text();
          
          // Try to parse as JSON if it looks like JSON
          if (rawResponseText.trim().startsWith('{') || rawResponseText.trim().startsWith('[')) {
            try {
              errorData = JSON.parse(rawResponseText);
              if (errorData.error?.message) {
                errorMessage = errorData.error.message;
              } else if (errorData.message) {
                errorMessage = errorData.message;
              }
            } catch (jsonParseError) {
              // If JSON parsing fails, use the raw text as the error message
              if (rawResponseText.trim()) {
                errorMessage = rawResponseText.trim();
              }
            }
          } else {
            // Not JSON, use the raw text as the error message
            if (rawResponseText.trim()) {
              errorMessage = rawResponseText.trim();
            }
          }
        } catch (textParseError) {
          // If we can't even get text, keep the original error message
          console.warn('Failed to parse error response as text:', textParseError);
        }
        
        // Create enhanced error with detailed information for streaming requests
        const error: EnhancedError = new Error(errorMessage);
        error.status = streamResponse.status;
        error.statusText = streamResponse.statusText;
        error.errorData = errorData;
        error.isStreaming = true;
        
        // Add raw response text to error for debugging
        (error as any).rawResponse = rawResponseText;
        
        // Check if this is a tool validation error
        const isToolValidationError = this.isOpenAIToolValidationError(error);
        
        if (isToolValidationError && currentTools && currentTools.length > 0) {
          const problematicToolIndex = this.extractProblematicToolIndex(error);
          
          if (problematicToolIndex !== null && problematicToolIndex < currentTools.length) {
            const removedTool = currentTools[problematicToolIndex];
            console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Removing problematic tool at index ${problematicToolIndex}: ${removedTool.name}`);
            console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Error details:`, error.message);
            
            // Store the problematic tool so it won't be loaded again
            this.storeProblematicTool(removedTool, error.message, this.config.providerId);
            
            // Remove the problematic tool
            currentTools.splice(problematicToolIndex, 1);
            
            // Retry with remaining tools
            console.log(`🔄 [DYNAMIC-TOOLS-STREAM] Retrying with ${currentTools.length} remaining tools...`);
            yield* this.streamChatWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
            return;
          } else {
            console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Could not identify problematic tool index from error`);
            
            // If we can't identify the specific tool, remove the first tool and try again
            if (currentTools.length > 0) {
              const removedTool = currentTools[0];
              console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Removing first tool as fallback: ${removedTool.name}`);
              this.storeProblematicTool(removedTool, errorMessage, this.config.providerId);
              currentTools.splice(0, 1);
              
              console.log(`🔄 [DYNAMIC-TOOLS-STREAM] Retrying with ${currentTools.length} remaining tools...`);
              yield* this.streamChatWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
              return;
            } else {
              // No tools left, send without tools
              console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] No tools left, sending without tools`);
              yield* this.streamChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
              return;
            }
          }
        } else if (isToolValidationError && (!currentTools || currentTools.length === 0)) {
          // This is the problematic case - tool validation error but no tools to remove
          // This suggests the error is in the message format itself, not the tools
          console.error(`🚫 [DYNAMIC-TOOLS-STREAM] Tool validation error with no tools to remove. This suggests a message format issue.`);
          console.error(`🚫 [DYNAMIC-TOOLS-STREAM] Error details:`, error.message);
          
          // Don't retry indefinitely - throw the error after a few attempts
          if (attempt >= 3) {
            console.error(`🚫 [DYNAMIC-TOOLS-STREAM] Giving up after ${attempt} attempts with message format error`);
            const finalError: EnhancedError = new Error(`Tool validation error that cannot be resolved by removing tools: ${error.message}`);
            finalError.status = (error as any).status;
            finalError.statusText = (error as any).statusText;
            finalError.errorData = (error as any).errorData;
            finalError.isStreaming = true;
            throw finalError;
          }
          
          // Try once more without tools, but don't loop forever
          console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Attempting once more without tools (attempt ${attempt + 1})`);
          yield* this.streamChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
          return;
        } else {
          // Not a tool validation error, throw the enhanced error with all details
          throw error;
        }
      }

      console.log(`✅ [DYNAMIC-TOOLS-STREAM] Stream request successful on attempt ${attempt}`);

      if (!streamResponse.body) throw new Error("No response body");

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        // Check abort signal during streaming
        if (signal.aborted) {
          console.log(`🛑 [DYNAMIC-TOOLS-STREAM] Stream aborted during reading`);
          // Instead of throwing an error, yield the accumulated content with abort flag
          if (accumulatedContent.trim()) {
            console.log(`💾 [ABORT-PRESERVE] Preserving ${accumulatedContent.length} characters of streamed content`);
            yield {
              message: {
                content: accumulatedContent,
                role: 'assistant'
              },
              finish_reason: 'aborted'
            };
          }
          return; // Exit gracefully instead of throwing
        }

        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim() || line === 'data: [DONE]') continue;
          
          try {
            const parsed = JSON.parse(line.replace('data: ', ''));
            
            // Check for error in streaming response
            if (parsed.error) {
              const error: EnhancedError = new Error(parsed.error.message || 'Streaming error');
              error.errorData = parsed.error;
              throw error;
            }
            
            const choice = parsed.choices?.[0];
            
            if (choice) {
              // Handle both regular content and reasoning content from reasoning models
              let content = choice.delta?.content || '';
              let reasoningContent = choice.delta?.reasoning_content || '';
              
              // Filter out model control tokens from content
              if (content) {
                content = this.filterControlTokens(content);
              }
              
              // Handle reasoning content from models like QwQ
              if (reasoningContent) {
                reasoningContent = this.filterControlTokens(reasoningContent);
                
                if (!hasStartedReasoning) {
                  // Start of reasoning - open <think> block
                  content = '<think>' + reasoningContent;
                  hasStartedReasoning = true;
                  isInReasoningMode = true;
                } else if (isInReasoningMode) {
                  // Continue reasoning - just add the content
                  content = reasoningContent;
                }
              } else if (content && hasStartedReasoning && isInReasoningMode) {
                // We have regular content after reasoning - close thinking and start response
                content = '</think>\n\n' + content;
                isInReasoningMode = false;
              }
              
              // Accumulate content for abort preservation
              if (content) {
                accumulatedContent += content;
              }
              
              const data: APIResponse = {
                message: {
                  content: content,
                  role: choice.delta?.role || 'assistant',
                  tool_calls: choice.delta?.tool_calls,
                  // Store raw reasoning content for potential future use
                  reasoning_content: reasoningContent || undefined
                },
                finish_reason: choice.finish_reason,
                usage: parsed.usage,
                timings: parsed.timings
              };
              
              yield data;
            }
          } catch (e) {
            // If it's a parsing error, just warn and continue
            if (e instanceof SyntaxError) {
              console.warn('Failed to parse streaming response line:', line, e);
            } else {
              // If it's our custom error (like tools+stream error), re-throw it
              throw e;
            }
          }
        }
      }
    } catch (error: any) {
      // Check if this is an abort error
      if (error.name === 'AbortError' || error.message.includes('aborted') || signal.aborted) {
        console.log(`🛑 [DYNAMIC-TOOLS-STREAM] Request aborted at attempt ${attempt}`);
        // Instead of throwing, yield accumulated content if we have any
        if (accumulatedContent.trim()) {
          console.log(`💾 [ABORT-PRESERVE] Preserving ${accumulatedContent.length} characters of streamed content from catch block`);
          yield {
            message: {
              content: accumulatedContent,
              role: 'assistant'
            },
            finish_reason: 'aborted'
          };
        }
        return; // Exit gracefully instead of throwing
      }

      // CRITICAL: Check token limit errors FIRST in streaming
      const isTokenLimitError = this.isTokenLimitError(error);
      
      if (isTokenLimitError) {
        console.log("🔄 [TOKEN-LIMIT-STREAM] Token limit error detected during streaming, initiating recovery...");
        
        // Parse token limit error details
        const tokenLimitError = this.parseTokenLimitError(error);
        
        // Use recovery service to compress context and continue
        const recoveredMessages = await this.recoveryService.handleTokenLimitError(
          tokenLimitError,
          messages,
          `stream_${Date.now()}`
        );
        
        // Ensure all messages have valid content
        const validatedMessages: ChatMessage[] = recoveredMessages.map(msg => ({
          ...msg,
          content: msg.content || '' // Ensure content is never undefined
        }));
        
        // Retry with recovered messages
        console.log("🔄 [TOKEN-LIMIT-STREAM] Retrying streaming with compressed context...");
        yield* this.streamChatWithDynamicToolRemoval(model, validatedMessages, options, tools, attempt + 1);
        return;
      }
      
      // Check if this is an OpenAI tool validation error that occurred during streaming
      const isToolValidationError = this.isOpenAIToolValidationError(error);
      
      if (isToolValidationError && currentTools && currentTools.length > 0) {
        const problematicToolIndex = this.extractProblematicToolIndex(error);
        
        if (problematicToolIndex !== null && problematicToolIndex < currentTools.length) {
          const removedTool = currentTools[problematicToolIndex];
          console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Removing problematic tool at index ${problematicToolIndex}: ${removedTool.name}`);
          console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Error details:`, error.message);
          
          // Remove the problematic tool
          currentTools.splice(problematicToolIndex, 1);
          
          // Retry with remaining tools
          console.log(`🔄 [DYNAMIC-TOOLS-STREAM] Retrying with ${currentTools.length} remaining tools...`);
          yield* this.streamChatWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
          return;
        } else {
          console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Could not identify problematic tool index from error, removing all tools`);
          // If we can't identify the specific tool, try without any tools
          yield* this.streamChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
          return;
        }
      } else if (isToolValidationError && currentTools && currentTools.length > 0) {
        console.warn(`⚠️ [DYNAMIC-TOOLS-STREAM] Max attempts reached, sending without tools`);
        // Max attempts reached, send without tools
        yield* this.streamChatWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
        return;
      } else {
        // Not a tool validation error or no tools to remove, re-throw the error
        throw error;
      }
    } finally {
      if (this.abortController) {
        this.abortController = null;
      }
    }
  }

  /**
   * Check if the error is a token limit error
   */
  private isTokenLimitError(error: any): boolean {
    const errorMessage = error.message || error.toString();
    return errorMessage.includes('maximum context length') || 
           errorMessage.includes('token') && errorMessage.includes('limit') ||
           errorMessage.includes('context_length_exceeded') ||
           errorMessage.includes('tokens') && (errorMessage.includes('exceed') || errorMessage.includes('maximum'));
  }

  /**
   * Parse token limit error details from error message
   */
  private parseTokenLimitError(error: any): any {
    const errorMessage = error.message || error.toString();
    
    // Pattern: "This model's maximum context length is 128000 tokens. However, you requested 130755 tokens (122755 in the messages, 8000 in the completion)."
    const tokenPattern = /maximum context length is (\d+) tokens.*?you requested (\d+) tokens.*?\((\d+) in the messages(?:, (\d+) in the completion)?\)/;
    const match = errorMessage.match(tokenPattern);
    
    if (match) {
      return {
        message: errorMessage,
        maxTokens: parseInt(match[1]),
        tokensRequested: parseInt(match[2]),
        messagesTokens: parseInt(match[3]),
        completionTokens: parseInt(match[4] || '0')
      };
    }
    
    // Fallback for other token limit error formats
    return {
      message: errorMessage,
      maxTokens: 128000, // Default assumption
      tokensRequested: 150000, // Estimated based on error
      messagesTokens: 140000, // Estimated
      completionTokens: 10000 // Estimated
    };
  }

  /**
   * Check if an error is an OpenAI tool validation error
   */
  private isOpenAIToolValidationError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message || '';
    const errorData = error.errorData || {};
    
    console.log(`🔍 [ERROR-CHECK] Checking error:`, {
      message,
      errorDataExists: !!errorData,
      errorCode: errorData?.error?.code,
      errorType: errorData?.error?.type,
      errorParam: errorData?.error?.param
    });
    
    // CRITICAL: Exclude token limit errors first
    const isTokenLimitError = this.isTokenLimitError(error);
    if (isTokenLimitError) {
      console.log(`🔍 [ERROR-CHECK] This is a token limit error, not a tool validation error`);
      return false;
    }
    
    // Check for OpenAI function parameter validation errors
    const isValidationError = (
      message.includes('Invalid schema for function') ||
      message.includes('array schema missing items') ||
      message.includes('invalid_function_parameters') ||
      message.includes('Image URLs are only allowed in messages with role') ||
      message.includes('Invalid \'messages[') ||
      message.includes('message with role \'tool\' contains an image URL') ||
      errorData?.error?.code === 'invalid_function_parameters' ||
      errorData?.error?.code === 'invalid_value' ||
      errorData?.error?.type === 'invalid_request_error'
    );
    
    console.log(`🔍 [ERROR-CHECK] Is validation error:`, isValidationError);
    return isValidationError;
  }

  /**
   * Extract the problematic tool index from OpenAI error message
   */
  private extractProblematicToolIndex(error: any): number | null {
    if (!error) return null;
    
    const message = error.message || '';
    const errorData = error.errorData || {};
    
    console.log(`🔍 [INDEX-EXTRACT] Extracting from:`, {
      message,
      errorParam: errorData?.error?.param,
      fullErrorData: errorData
    });
    
    // Check if this is a message format error (not tool-specific)
    if (message.includes('Image URLs are only allowed in messages with role') ||
        message.includes('message with role \'tool\' contains an image URL') ||
        message.includes('Invalid \'messages[')) {
      console.log(`🔍 [INDEX-EXTRACT] This is a message format error, not tool-specific`);
      return null;
    }
    
    // Look for patterns like "tools[9].function.parameters"
    const toolIndexMatch = message.match(/tools\[(\d+)\]/);
    if (toolIndexMatch) {
      const index = parseInt(toolIndexMatch[1], 10);
      console.log(`🔍 [DYNAMIC-TOOLS] Extracted tool index ${index} from error message: ${message}`);
      return index;
    }
    
    // Also check in errorData.error.param
    if (errorData?.error?.param) {
      const paramMatch = errorData.error.param.match(/tools\[(\d+)\]/);
      if (paramMatch) {
        const index = parseInt(paramMatch[1], 10);
        console.log(`🔍 [DYNAMIC-TOOLS] Extracted tool index ${index} from error param: ${errorData.error.param}`);
        return index;
      }
    }
    
    console.warn(`⚠️ [DYNAMIC-TOOLS] Could not extract tool index from error:`, { message, errorData });
    return null;
  }

  /**
   * Generate a completion that includes images
   */
  public async generateWithImages(
    model: string,
    prompt: string,
    images: string[],
    options: RequestOptions = {}
  ): Promise<any> {
    const formattedContent = [
      {
        type: "text",
        text: prompt
      },
      ...images.map(img => ({
        type: "image_url",
        image_url: {
          url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
        }
      }))
    ];

    const messages = [
      {
        role: "user",
        content: formattedContent
      }
    ];

    // Transform parameters for GPT-4o compatibility BEFORE creating payload
    const transformedOptions = this.transformParametersForModernModels(options, model);
    
    // Handle the default max_tokens value
    const payload: any = {
      model,
      messages,
      ...transformedOptions
    };
    
    // Add max_tokens or max_completion_tokens based on model type
    if (!payload.max_tokens && !payload.max_completion_tokens) {
      if (this.isGPT4oModel(model) || this.isGPT5Model(model)) {
        payload.max_completion_tokens = 1000;
      } else {
        payload.max_tokens = 1000;
      }
    }

    const response = await this.request("/chat/completions", "POST", payload);

    if (!response.choices?.[0]?.message) {
      throw new Error('Invalid response format from image generation');
    }

    return {
      response: response.choices[0].message.content,
      eval_count: response.usage?.total_tokens || 0
    };
  }

  /**
   * Helper to prepare messages for API format
   */
  private prepareMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      if (msg.images?.length) {
        // Format message with images
        const content = [
          { type: "text", text: msg.content },
          ...msg.images.map(img => ({
            type: "image_url",
            image_url: {
              url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
            }
          }))
        ];
        // CRITICAL FIX: Don't include 'images' property in final message (OpenAI API doesn't support it)
        // Only preserve essential properties for OpenAI API compatibility
        const { images, ...msgWithoutImages } = msg;
        return { ...msgWithoutImages, content };
      }
      return msg;
    });
  }

  /**
   * Generate embeddings from a model.
   */
  public async generateEmbeddings(
    model: string,
    input: string | string[],
    options: RequestOptions = {}
  ): Promise<any> {
    const payload = { 
      model, 
      input: Array.isArray(input) ? input : [input], 
      ...options 
    };
    
    return this.request('/embeddings', "POST", payload);
  }

  /**
   * Check connection to the API
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch (error) {
      console.error('Error checking API connection:', error);
      return false;
    }
  }

  /**
   * Format tools for OpenAI-compatible API
   */
  private formatTool(tool: Tool): any {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((acc: any, param: any) => ({
            ...acc,
            [param.name]: {
              type: param.type.toLowerCase(),
              description: param.description
            }
          }), {}),
          required: tool.parameters
            .filter((p: any) => p.required)
            .map((p: any) => p.name)
        }
      }
    };
  }

  /**
   * Store a problematic tool so it won't be loaded again for this specific provider
   * Now checks if the tool is protected from blacklisting first
   */
  private storeProblematicTool(tool: Tool, errorMessage: string, providerId?: string): void {
    const providerPrefix = providerId || 'unknown';
    
    // Check if the tool is protected from blacklisting
    const blacklistResult = ToolSuccessRegistry.attemptBlacklist(
      tool.name,
      tool.description,
      providerPrefix,
      errorMessage
    );
    
    if (!blacklistResult.allowed) {
      console.warn(`🛡️ [BLACKLIST-PROTECTION] Tool ${tool.name} protected from blacklisting`);
      console.warn(`🛡️ [BLACKLIST-PROTECTION] Reason: ${blacklistResult.reason}`);
      console.warn(`🛡️ [BLACKLIST-PROTECTION] Original error: ${errorMessage}`);
      
      // Add notification about protection
      console.log(`🚫 [BLACKLIST-PREVENTED] False positive blacklist prevented for tool: ${tool.name}`);
      return; // Don't blacklist the tool
    }
    
    // Tool is not protected, proceed with blacklisting
    const toolKey = `${providerPrefix}:${tool.name}:${tool.description}`;
    APIClient.problematicTools.add(toolKey);
    
    console.log(`🚫 [PROBLEMATIC-TOOLS] Stored problematic tool for provider ${providerPrefix}: ${tool.name}`);
    console.log(`🚫 [PROBLEMATIC-TOOLS] Error: ${errorMessage}`);
    console.log(`🚫 [PROBLEMATIC-TOOLS] Total problematic tools: ${APIClient.problematicTools.size}`);
    
    // Also store in localStorage for persistence across sessions with provider-specific key
    try {
      const storageKey = `angela-problematic-tools-${providerPrefix}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const toolInfo = {
        name: tool.name,
        description: tool.description,
        error: errorMessage,
        providerId: providerPrefix,
        timestamp: new Date().toISOString()
      };
      
      // Check if already exists
      const exists = stored.some((t: any) => t.name === tool.name && t.description === tool.description);
      if (!exists) {
        stored.push(toolInfo);
        localStorage.setItem(storageKey, JSON.stringify(stored));
        console.log(`💾 [PROBLEMATIC-TOOLS] Persisted to localStorage for provider ${providerPrefix}`);
      }
    } catch (error) {
      console.warn('Failed to store problematic tool in localStorage:', error);
    }
  }

  /**
   * Record a successful tool execution to prevent false positive blacklisting
   */
  public recordToolSuccess(toolName: string, toolDescription: string, toolCallId?: string): void {
    const providerPrefix = this.config.providerId || 'unknown';
    
    ToolSuccessRegistry.recordSuccess(
      toolName,
      toolDescription,
      providerPrefix,
      toolCallId
    );
    
    console.log(`✅ [TOOL-SUCCESS] Recorded successful execution of ${toolName} for provider ${providerPrefix}`);
  }

  /**
   * Filter out known problematic tools for the current provider
   */
  private filterOutProblematicTools(tools: Tool[], providerId?: string): Tool[] {
    const providerPrefix = providerId || 'unknown';
    
    // Load from localStorage on first use for this provider
    this.loadProblematicToolsFromStorage(providerPrefix);
    
    const filtered = tools.filter(tool => {
      const toolKey = `${providerPrefix}:${tool.name}:${tool.description}`;
      const isProblematic = APIClient.problematicTools.has(toolKey);
      
      if (isProblematic) {
        console.log(`🚫 [FILTER] Skipping known problematic tool for provider ${providerPrefix}: ${tool.name}`);
      }
      
      return !isProblematic;
    });
    
    return filtered;
  }

  /**
   * Load problematic tools from localStorage for a specific provider
   */
  private loadProblematicToolsFromStorage(providerId: string): void {
    try {
      const storageKey = `angela-problematic-tools-${providerId}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      for (const toolInfo of stored) {
        const toolKey = `${providerId}:${toolInfo.name}:${toolInfo.description}`;
        APIClient.problematicTools.add(toolKey);
      }
      
      if (stored.length > 0) {
        console.log(`📂 [PROBLEMATIC-TOOLS] Loaded ${stored.length} problematic tools from localStorage for provider ${providerId}`);
      }
    } catch (error) {
      console.warn(`Failed to load problematic tools from localStorage for provider ${providerId}:`, error);
    }
  }

  /**
   * Clear all stored problematic tools for a specific provider (for debugging/reset)
   */
  public static clearProblematicToolsForProvider(providerId: string): void {
    // Remove from memory
    const keysToRemove = Array.from(APIClient.problematicTools).filter(key => key.startsWith(`${providerId}:`));
    keysToRemove.forEach(key => APIClient.problematicTools.delete(key));
    
    try {
      const storageKey = `angela-problematic-tools-${providerId}`;
      localStorage.removeItem(storageKey);
      console.log(`🗑️ [PROBLEMATIC-TOOLS] Cleared all stored problematic tools for provider ${providerId}`);
    } catch (error) {
      console.warn(`Failed to clear problematic tools from localStorage for provider ${providerId}:`, error);
    }
  }

  /**
   * Clear all stored problematic tools (for debugging/reset)
   */
  public static clearProblematicTools(): void {
    APIClient.problematicTools.clear();
    try {
      // Clear all provider-specific storage keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('angela-problematic-tools-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Also clear the old global key for backward compatibility
      localStorage.removeItem('angela-problematic-tools');
      console.log(`🗑️ [PROBLEMATIC-TOOLS] Cleared all stored problematic tools for all providers`);
    } catch (error) {
      console.warn('Failed to clear problematic tools from localStorage:', error);
    }
  }

  /**
   * Clear blacklisted MCP tools from all providers (for fixing false positives)
   */
  public static clearMCPToolBlacklists(): void {
    const mcpToolNames = ['mcp_python-mcp_py', 'mcp_python-mcp_powershell', 'mcp_python-mcp_pip', 'mcp_python-mcp_save', 'mcp_python-mcp_load', 'mcp_python-mcp_ls', 'mcp_python-mcp_open', 'mcp_python-mcp_search', 'mcp_python-mcp_fetch_content'];
    
    // Clear from memory
    const keysToRemove = Array.from(APIClient.problematicTools).filter(key => {
      return mcpToolNames.some(mcpName => key.includes(mcpName));
    });
    keysToRemove.forEach(key => APIClient.problematicTools.delete(key));
    
    // Clear from localStorage for all providers
    try {
      const storageKeysToCheck: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('angela-problematic-tools-')) {
          storageKeysToCheck.push(key);
        }
      }
      
      for (const storageKey of storageKeysToCheck) {
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const filtered = stored.filter((tool: any) => !mcpToolNames.includes(tool.name));
          
          if (filtered.length !== stored.length) {
            localStorage.setItem(storageKey, JSON.stringify(filtered));
            console.log(`🗑️ [MCP-CLEANUP] Removed ${stored.length - filtered.length} MCP tools from ${storageKey}`);
          }
        } catch (error) {
          console.warn(`Failed to clean MCP tools from ${storageKey}:`, error);
        }
      }
      
      console.log(`✅ [MCP-CLEANUP] Cleared all blacklisted MCP tools from memory and localStorage`);
      console.log(`🗑️ [MCP-CLEANUP] Removed ${keysToRemove.length} MCP tool entries from memory`);
    } catch (error) {
      console.warn('Failed to clear MCP tools from localStorage:', error);
    }
  }

  /**
   * Get list of problematic tools (for debugging)
   */
  public static getProblematicTools(): string[] {
    return Array.from(APIClient.problematicTools);
  }

  /**
   * Stream a chat response with optional tools.
   */
  public async *streamChat(
    model: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): AsyncGenerator<APIResponse> {
    yield* this.streamChatWithDynamicToolRemoval(model, messages, options, tools);
  }
} 
