import type { Tool } from '../db';
import { ToolSuccessRegistry } from '../services/toolSuccessRegistry';

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  tool_calls?: any[];
  name?: string; // For tool responses
}

export interface RequestOptions {
  [key: string]: any;
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  type: 'ollama' | 'openai';
  providerId?: string; // Add provider ID to config
}

interface APIResponse {
  message?: {
    content: string;
    role: ChatRole;
    tool_calls?: {
      function: {
        name: string;
        arguments: string | Record<string, unknown>;
      };
    }[];
  };
  choices?: [{
    message: {
      content: string;
      role: string;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    delta?: {
      content?: string;
    };
  }];
  usage?: {
    total_tokens: number;
  };
  eval_count?: number;
}

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

interface BaseTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

interface OpenAITool extends BaseTool {
  type: 'function';
}

interface OllamaTool extends BaseTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export class OllamaClient {
  private abortController: AbortController | null = null;
  private static readonly OLLAMA_MAX_TOKENS = 8000; // Ollama's token limit
  private config: OpenAIConfig;
  private static problematicTools: Set<string> = new Set();

  constructor(baseUrl: string, config?: Partial<OpenAIConfig>) {
    this.config = {
      apiKey: config?.apiKey || '',
      baseUrl: baseUrl,
      type: config?.type || 'ollama',
      providerId: config?.providerId // Store provider ID
    };
  }

  /**
   * Get the current configuration
   */
  public getConfig(): OpenAIConfig {
    return { ...this.config };
  }

  /**
   * Helper for making API requests.
   */
  private async request(endpoint: string, method: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.type === 'openai' && this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // If using Ollama, ensure max_tokens doesn't exceed the limit
    if (this.config.type === 'ollama' && body) {
      body = {
        ...body,
        max_tokens: Math.min(body.max_tokens || OllamaClient.OLLAMA_MAX_TOKENS, OllamaClient.OLLAMA_MAX_TOKENS)
      };
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Lists available models
   */
  public async listModels(): Promise<any[]> {
    try {
      // Use consistent OpenAI-style endpoint for Ollama too
      const endpoint = this.config.type === 'ollama' ? '/api/tags' : '/models';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (this.config.type === 'openai' && this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const url = `${this.config.baseUrl}${endpoint}`;
      const response = await fetch(url, { 
        headers,
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (this.config.type === 'ollama') {
        return data.models || [];
      } else {
        // OpenAI format
        // Check if data.data exists (standard OpenAI and compatible APIs)
        if (Array.isArray(data?.data)) {
          return data.data.map((model: any) => ({
            name: model.id,
            id: model.id,
            digest: model.created?.toString() || '',
            size: 0,
            modified_at: model.created?.toString() || ''
          }));
        } else if (Array.isArray(data)) {
          // Some compatible APIs might return array directly
          return data.map((model: any) => ({
            name: model.id || model.name,
            id: model.id || model.name,
            digest: model.created?.toString() || '',
            size: 0,
            modified_at: model.created?.toString() || ''
          }));
        } else {
          console.warn('Unexpected model list format:', data);
          return [];
        }
      }
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }

  /**
   * Aborts any ongoing stream requests.
   */
  public abortStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
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
    const formattedTools = tools?.map(tool => this.formatTool(tool));
    
    if (this.config.type === 'ollama') {
      // Format tools according to Ollama's expected format
      const formattedToolsOllama = formattedTools?.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            required: tool.parameters.filter(p => p.required).map(p => p.name),
            properties: tool.parameters.reduce((acc, param) => ({
              ...acc,
              [param.name]: {
                type: param.type,
                description: param.description
              }
            }), {})
          }
        }
      }));

      // Create the Ollama chat request
      const ollamaRequest: any = {
        model,
        messages,
        stream: false,
        ...options
      };

      // Only add tools if they exist
      if (formattedToolsOllama && formattedToolsOllama.length > 0) {
        ollamaRequest.tools = formattedToolsOllama;
      }

      console.log("Sending Ollama request:", JSON.stringify(ollamaRequest, null, 2));
      const response = await this.request('/api/chat', 'POST', ollamaRequest);
      console.log("Received Ollama response:", JSON.stringify(response, null, 2));

      // Handle tool calls in the response
      if (response.message?.tool_calls?.length) {
        console.log("Tool calls detected, executing tools...");
        const toolCalls = response.message.tool_calls;
        
        // Execute tool calls
        const toolResults = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const tool = tools?.find(t => t.name === toolCall.function.name);
            if (!tool) {
              throw new Error(`Tool ${toolCall.function.name} not found`);
            }

            try {
              // Create function from implementation
              const func = new Function('args', `
                ${tool.implementation}
                return implementation(args);
              `);
              
              // Parse arguments
              const args = toolCall.function.arguments;
              console.log(`Executing tool ${tool.name} with args:`, args);
              
              // Execute the tool
              const result = await func(args);
              console.log(`Tool ${tool.name} execution result:`, result);
              
              // Format the result for the message
              return {
                role: 'tool' as ChatRole,
                name: tool.name,
                content: typeof result === 'string' ? result : JSON.stringify(result)
              };
            } catch (error) {
              console.error(`Error executing tool ${tool.name}:`, error);
              return {
                role: 'tool' as ChatRole,
                name: tool.name,
                content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
              };
            }
          })
        );

        console.log("Tool execution results:", toolResults);

        // Add tool results to messages and get final response
        const updatedMessages = [
          ...messages,
          response.message,
          ...toolResults
        ];

        console.log("Sending follow-up request with tool results:", updatedMessages);
        
        // Get final response without tools to avoid infinite loop
        const ollamaFollowupRequest: any = {
          model,
          messages: updatedMessages,
          stream: false,
          temperature: options.temperature || 0.5,
          top_p: options.top_p || 0.9
        };
        
        // Send the follow-up request WITHOUT tools to get the final answer
        const finalResponse = await this.request('/api/chat', 'POST', ollamaFollowupRequest);
        console.log("Final response:", finalResponse);
        
        return finalResponse;
      }

      return response;
    } else {
      // OpenAI format remains unchanged
      const endpoint = '/chat/completions';
      const payload = {
        model,
        messages,
        stream: false,
        ...options
      };

      const response = await this.request(endpoint, "POST", payload);
      return {
        message: {
          content: response.choices?.[0]?.message?.content || '',
          role: response.choices?.[0]?.message?.role as ChatRole
        },
        eval_count: response.usage?.total_tokens || 0
      };
    }
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
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    const endpoint = this.config.type === 'ollama' ? '/api/chat' : '/chat/completions';
    
    // Convert tools to API format
    const formattedTools = tools?.map(tool => this.formatTool(tool));
    
    const payload: any = { 
      model, 
      messages: this.prepareMessages(messages), 
      tools: formattedTools,
      stream: true,
      ...options 
    };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey && this.config.type !== 'ollama') {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const streamResponse = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal
      });

      if (!streamResponse.ok) {
        throw new Error(`Stream request failed: ${streamResponse.status} ${streamResponse.statusText}`);
      }

      if (!streamResponse.body) throw new Error("No response body");

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim() || line === 'data: [DONE]') continue;
          try {
            // Debug: log each streaming line
            console.log('Ollama stream line:', line);
            let data: APIResponse;
            if (this.config.type === 'ollama') {
              data = JSON.parse(line);
              
              // Handle tool calls in stream
              if (data.message?.tool_calls?.length) {
                // Execute tools and continue conversation
                const toolResults = await Promise.all(
                  data.message.tool_calls.map(async (toolCall: any) => {
                    const tool = tools?.find(t => t.name === toolCall.function.name);
                    if (!tool) {
                      throw new Error(`Tool ${toolCall.function.name} not found`);
                    }

                    try {
                      const func = new Function('args', tool.implementation);
                      const args = typeof toolCall.function.arguments === 'string'
                        ? JSON.parse(toolCall.function.arguments)
                        : toolCall.function.arguments;
                      
                      const result = await func(args);
                      return {
                        role: 'tool' as const,
                        name: tool.name,
                        content: typeof result === 'string' ? result : JSON.stringify(result)
                      };
                    } catch (error) {
                      console.error(`Error executing tool ${tool.name}:`, error);
                      throw error;
                    }
                  })
                );

                // Add tool results to messages and continue conversation
                const updatedMessages = [
                  ...messages,
                  {
                    role: 'assistant' as const,
                    content: data.message.content || '',
                    tool_calls: data.message.tool_calls
                  },
                  ...toolResults
                ];

                // Start a new non-streaming request to get the final response
                const finalResponse = await this.sendChat(model, updatedMessages, { ...options, stream: false });
                yield finalResponse;
                return;
              }
            } else {
              // Parse OpenAI SSE format
              const parsed = JSON.parse(line.replace('data: ', ''));
              data = {
                message: {
                  content: parsed.choices?.[0]?.delta?.content || '',
                  role: 'assistant'
                }
              };
            }
            yield data;
          } catch (e) {
            console.warn('Failed to parse streaming response line:', line, e);
            // Do not throw or yield the error, just skip this line
          }
        }
      }
    } finally {
      if (this.abortController) {
        this.abortController = null;
      }
      if (signal.aborted) {
        console.log("Stream aborted");
      }
    }
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
    try {
      if (this.config.type === 'ollama') {
        // Use Ollama's generate API
        return this.request("/api/generate", "POST", {
          model,
          prompt,
          images,
          stream: false,
          max_tokens: options.max_tokens || 1000,
          ...options
        });
      }
  
      // Structure messages for OpenAI vision API
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
  
      console.log('OpenAI Vision Request:', {
        model,
        messages,
        max_tokens: options.max_tokens || 1000
      });
  
      try {
        const response = await this.request("/chat/completions", "POST", {
          model,
          messages,
          max_tokens: options.max_tokens || 1000,
          ...options
        });
  
        console.log('OpenAI Vision Response:', response);
  
        if (!response.choices?.[0]?.message) {
          throw new Error('Invalid response format from image generation');
        }
  
        return {
          response: response.choices[0].message.content,
          eval_count: response.usage?.total_tokens || 0
        };
      } catch (error) {
        console.error('Vision API Error:', error);
        // Return error in a format that can be displayed in chat
        throw new Error(JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            type: 'vision_api_error'
          }
        }, null, 2));
      }
    } catch (error) {
      console.error('Vision API Error:', error);
      // Return error in a format that can be displayed in chat
      throw new Error(JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          type: 'vision_api_error'
        }
      }, null, 2));
    }
  }

  /**
   * Pull a model from Ollama (Ollama-specific functionality)
   */
  public async *pullModel(
    model: string,
    insecure: boolean = false
  ): AsyncGenerator<{
    status: string;
    digest?: string;
    total?: number;
    completed?: number;
  }> {
    if (this.config.type !== 'ollama') {
      throw new Error('Model pulling is only supported with Ollama');
    }

    const payload = { model, insecure, stream: true };
    const response = await fetch(`${this.config.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentDigest = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.digest && data.digest !== currentDigest) {
                currentDigest = data.digest;
                console.log(`\nStarting new layer: ${currentDigest.slice(0, 12)}...`);
              }
              yield data;
            } catch (error) {
              console.warn('Failed to parse pull response line:', error);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          yield data;
        } catch (error) {
          console.warn('Failed to parse final pull response buffer:', error);
        }
      }
    } finally {
      reader.cancel();
    }
  }

  /**
   * Helper to prepare messages for OpenAI format if needed
   */
  private prepareMessages(messages: ChatMessage[]): any[] {
    if (this.config.type !== 'ollama') {
      return messages.map(msg => {
        if (msg.images?.length) {
          // Format message with images for OpenAI
          const content = [
            { type: "text", text: msg.content },
            ...msg.images.map(img => ({
              type: "image_url",
              image_url: {
                url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
              }
            }))
          ];
          return { role: msg.role, content };
        }
        return msg;
      });
    }
    return messages;
  }

  /**
   * Generate embeddings from a model.
   */
  public async generateEmbeddings(
    model: string,
    input: string | string[],
    options: RequestOptions = {}
  ): Promise<any> {
    const endpoint = this.config.type === 'ollama' ? '/api/embed' : '/embeddings';
    const payload = this.config.type === 'ollama'
      ? { model, input, ...options }
      : { model, input: Array.isArray(input) ? input : [input], ...options };
    
    return this.request(endpoint, "POST", payload);
  }

  /**
   * Send a chat message with structured output format.
   * This is useful for getting responses in a specific JSON schema.
   */
  public async sendStructuredChat(
    model: string,
    messages: ChatMessage[],
    format: object,
    options: RequestOptions = {}
  ): Promise<any> {
    const endpoint = this.config.type === 'ollama' ? '/api/chat' : '/chat/completions';
    
    let payload;
    if (this.config.type === 'ollama') {
      // Ollama uses format parameter
      payload = { 
        model, 
        messages, 
        format: format, 
        ...options, 
        stream: false 
      };
    } else {
      // OpenAI only supports simple JSON response format (no schema validation)
      let OpenAIformat: any = format;
      OpenAIformat.type = 'json_schema';
    
      payload = { 
        model, 
        messages,
        response_format: { type: "json_object" },
        stream: false, 
        ...options 
      };
      
      // For OpenAI, we need to add schema information in the system prompt

      function expandObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj; // Return as is if not an object
        }
    
        if (Array.isArray(obj)) {
            return obj.map(expandObject); // Recursively expand arrays
        }
    
        let expanded = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                expanded[key] = expandObject(obj[key]); // Recursively expand properties
            }
        }
        return expanded;
    }
    
    let expandedSchema = expandObject(format.properties);
    let schemaString = JSON.stringify(expandedSchema, null, 2);
    console.log('schemaString', schemaString);
    


      const schemaDescription = schemaString;
      console.log('schemaDescription', schemaDescription);




      // Find if there's already a system message to append to
      const systemMessageIndex = messages.findIndex(m => m.role === 'system');
      
      if (systemMessageIndex >= 0) {
        // Append to existing system message
        payload.messages = [...messages];
        payload.messages[systemMessageIndex] = {
          ...payload.messages[systemMessageIndex],
          content: `${payload.messages[systemMessageIndex].content}\n\n${schemaDescription}`
        };
      } else {
        // Add new system message at the beginning
        payload.messages = [
          { role: 'system', content: schemaDescription },
          ...messages
        ];
      }
    }

    const response = await this.request(endpoint, "POST", payload);

    // Transform response to a consistent format
    if (this.config.type !== 'ollama') {
      return {
        message: {
          content: response.choices[0].message.content,
          role: response.choices[0].message.role
        },
        eval_count: response.usage?.total_tokens || 0
      };
    }
    
    return response;
  }
  
  /**
   * Format schema description for inclusion in prompts
   * This converts a JSON schema to a text description for OpenAI
   */
  private formatSchemaForPrompt(schema: any): string {
    try {
      // If this is a full JSON schema with properties
      if (schema.type === 'object' && schema.properties) {
        const fields = Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
          return `- "${key}": ${prop.description || 'No description'} (${prop.type || 'string'})`;
        });

       
        
        return `You must respond with a valid JSON object that matches this schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

The JSON object should include these fields:
${fields.join('\n')}

Your response MUST be a valid JSON object, properly formatted and parsable.`;
      } 
      
      // If it's just a simple object with field descriptions
      else if (typeof schema === 'object') {
        const fields = Object.entries(schema).map(([key, description]) => {
          return `- "${key}": ${description}`;
        });
        
        return `You must respond with a valid JSON object that includes these fields:
${fields.join('\n')}

Your response MUST be a valid JSON object, properly formatted and parsable.`;
      }
      
      // Default case
      return 'You must respond with a valid JSON object.';
    } catch (error) {
      console.warn('Error formatting schema for prompt:', error);
      return 'You must respond with a valid JSON object.';
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      // Use the list models endpoint to check connection
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.error('Error checking Ollama connection:', error);
      return false;
    }
  }

  private isOllamaResponse(response: APIResponse | OpenAIResponse): response is APIResponse {
    return 'message' in response;
  }

  private isOpenAIResponse(response: APIResponse | OpenAIResponse): response is OpenAIResponse {
    return 'choices' in response;
  }

  private expandObject(obj: Record<string, ToolParameter>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        if ('properties' in value && value.properties) {
          result[key] = this.expandObject(value.properties);
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  private formatTool(tool: BaseTool): OpenAITool | OllamaTool {
    if (this.config.type === 'openai') {
      return {
        type: 'function',
        ...tool
      };
    } else {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: tool.parameters.reduce((acc: Record<string, unknown>, param: ToolParameter) => ({
              ...acc,
              [param.name]: {
                type: param.type.toLowerCase(),
                description: param.description
              }
            }), {}),
            required: tool.parameters
              .filter((p: ToolParameter) => p.required)
              .map((p: ToolParameter) => p.name)
          }
        }
      };
    }
  }

  // Add a new method specifically for tool calls that preserves OpenAI response format
  async sendChatWithToolsPreserveFormat(model: string, messages: ChatMessage[], options?: any, tools?: any[]) {
    if (this.config.type === 'openai') {
      // Implement OpenAI-specific request that returns the raw response
      return this.sendOpenAIRequest(model, messages, options, tools);
    } else {
      // For Ollama, use the regular sendChat method
      return this.sendChat(model, messages, options, tools);
    }
  }

  // Helper method for OpenAI requests
  private async sendOpenAIRequest(model: string, messages: any[], options?: any, tools?: any[]) {
    return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, tools);
  }

  // Helper method for OpenAI requests with dynamic tool removal
  private async sendOpenAIRequestWithDynamicToolRemoval(
    model: string, 
    messages: any[], 
    options?: any, 
    tools?: any[], 
    attempt: number = 1
  ): Promise<any> {
    // No limit on attempts - keep trying until all problematic tools are removed
    let currentTools = tools ? [...tools] : undefined;
    
    // Filter out known problematic tools before starting
    if (currentTools && currentTools.length > 0) {
      const originalCount = currentTools.length;
      currentTools = this.filterOutProblematicTools(currentTools, this.config.providerId);
      if (currentTools.length < originalCount) {
        console.log(`🔧 [DYNAMIC-TOOLS-OLLAMA] Filtered out ${originalCount - currentTools.length} known problematic tools, ${currentTools.length} remaining`);
      }
    }
    
    const formattedTools = currentTools?.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((acc: any, param: any) => {
            acc[param.name] = {
              type: param.type.toLowerCase(),
              description: param.description
            };
            return acc;
          }, {}),
          required: tool.parameters
            .filter((param: any) => param.required)
            .map((param: any) => param.name)
        }
      }
    }));

    const payload: any = {
      model,
      messages,
      temperature: options?.temperature || 0.7,
      top_p: options?.top_p || 0.9,
      stream: options?.stream || false
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    try {
      console.log(`🔧 [DYNAMIC-TOOLS-OLLAMA] Attempt ${attempt}: Sending OpenAI request with ${formattedTools?.length || 0} tools`);
      
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Try to parse JSON error response
        let errorMessage = `OpenAI request failed: ${response.status} ${response.statusText}`;
        let errorData: any = null;
        
        try {
          errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (parseError) {
          // If JSON parsing fails, use original error message
        }
        
        // Check if this is a tool validation error
        const isToolValidationError = this.isOpenAIToolValidationError({ message: errorMessage, errorData });
        
        if (isToolValidationError && currentTools && currentTools.length > 0) {
          const problematicToolIndex = this.extractProblematicToolIndex({ message: errorMessage, errorData });
          
          if (problematicToolIndex !== null && problematicToolIndex < currentTools.length) {
            const removedTool = currentTools[problematicToolIndex];
            console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Removing problematic tool at index ${problematicToolIndex}: ${removedTool.name}`);
            console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Error details:`, errorMessage);
            
            // Store the problematic tool so it won't be loaded again for this specific provider
            this.storeProblematicTool(removedTool, errorMessage, this.config.providerId);
            
            // Remove the problematic tool
            currentTools.splice(problematicToolIndex, 1);
            
            // Retry with remaining tools
            console.log(`🔄 [DYNAMIC-TOOLS-OLLAMA] Retrying with ${currentTools.length} remaining tools...`);
            return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
          } else {
            console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Could not identify problematic tool index from error`);
            
            // If we can't identify the specific tool, remove the first tool and try again
            if (currentTools.length > 0) {
              const removedTool = currentTools[0];
              console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Removing first tool as fallback: ${removedTool.name}`);
              this.storeProblematicTool(removedTool, errorMessage, this.config.providerId);
              currentTools.splice(0, 1);
              
              console.log(`🔄 [DYNAMIC-TOOLS-OLLAMA] Retrying with ${currentTools.length} remaining tools...`);
              return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
            } else {
              // No tools left, send without tools
              console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] No tools left, sending without tools`);
              return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
            }
          }
        } else if (isToolValidationError && (!currentTools || currentTools.length === 0)) {
          console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Tool validation error but no tools to remove, sending without tools`);
          // Send without tools
          return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
        } else {
          // Not a tool validation error, throw the error
          const error = new Error(errorMessage);
          (error as any).status = response.status;
          (error as any).errorData = errorData;
          throw error;
        }
      }

      console.log(`✅ [DYNAMIC-TOOLS-OLLAMA] OpenAI request successful on attempt ${attempt}`);
      return await response.json();
    } catch (error: any) {
      // Check if this is an OpenAI tool validation error that occurred during the request
      const isToolValidationError = this.isOpenAIToolValidationError(error);
      
      if (isToolValidationError && currentTools && currentTools.length > 0) {
        const problematicToolIndex = this.extractProblematicToolIndex(error);
        
        if (problematicToolIndex !== null && problematicToolIndex < currentTools.length) {
          const removedTool = currentTools[problematicToolIndex];
          console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Removing problematic tool at index ${problematicToolIndex}: ${removedTool.name}`);
          console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Error details:`, error.message);
          
          // Store the problematic tool so it won't be loaded again for this specific provider
          this.storeProblematicTool(removedTool, error.message, this.config.providerId);
          
          // Remove the problematic tool
          currentTools.splice(problematicToolIndex, 1);
          
          // Retry with remaining tools
          console.log(`🔄 [DYNAMIC-TOOLS-OLLAMA] Retrying with ${currentTools.length} remaining tools...`);
          return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
        } else {
          console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Could not identify problematic tool index from error`);
          
          // If we can't identify the specific tool, remove the first tool and try again
          if (currentTools.length > 0) {
            const removedTool = currentTools[0];
            console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Removing first tool as fallback: ${removedTool.name}`);
            this.storeProblematicTool(removedTool, error.message, this.config.providerId);
            currentTools.splice(0, 1);
            
            console.log(`🔄 [DYNAMIC-TOOLS-OLLAMA] Retrying with ${currentTools.length} remaining tools...`);
            return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, currentTools, attempt + 1);
          } else {
            // No tools left, send without tools
            console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] No tools left, sending without tools`);
            return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
          }
        }
      } else if (isToolValidationError && (!currentTools || currentTools.length === 0)) {
        console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Tool validation error but no tools to remove, sending without tools`);
        // Send without tools
        return this.sendOpenAIRequestWithDynamicToolRemoval(model, messages, options, undefined, attempt + 1);
      } else {
        // Not a tool validation error, re-throw the error
        throw error;
      }
    }
  }

  /**
   * Check if an error is an OpenAI tool validation error
   */
  private isOpenAIToolValidationError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message || '';
    const errorData = error.errorData || {};
    
    // Check for OpenAI function parameter validation errors
    return (
      message.includes('Invalid schema for function') ||
      message.includes('array schema missing items') ||
      message.includes('invalid_function_parameters') ||
      errorData.error?.code === 'invalid_function_parameters' ||
      errorData.error?.type === 'invalid_request_error'
    );
  }

  /**
   * Extract the problematic tool index from OpenAI error message
   */
  private extractProblematicToolIndex(error: any): number | null {
    if (!error) return null;
    
    const message = error.message || '';
    const errorData = error.errorData || {};
    
    // Look for patterns like "tools[9].function.parameters"
    const toolIndexMatch = message.match(/tools\[(\d+)\]/);
    if (toolIndexMatch) {
      const index = parseInt(toolIndexMatch[1], 10);
      console.log(`🔍 [DYNAMIC-TOOLS-OLLAMA] Extracted tool index ${index} from error message: ${message}`);
      return index;
    }
    
    // Also check in errorData.error.param
    if (errorData.error?.param) {
      const paramMatch = errorData.error.param.match(/tools\[(\d+)\]/);
      if (paramMatch) {
        const index = parseInt(paramMatch[1], 10);
        console.log(`🔍 [DYNAMIC-TOOLS-OLLAMA] Extracted tool index ${index} from error param: ${errorData.error.param}`);
        return index;
      }
    }
    
    console.warn(`⚠️ [DYNAMIC-TOOLS-OLLAMA] Could not extract tool index from error:`, { message, errorData });
    return null;
  }

  /**
   * Store a problematic tool so it won't be loaded again for this specific provider
   * Now checks if the tool is protected from blacklisting first
   */
  private storeProblematicTool(tool: any, errorMessage: string, providerId?: string): void {
    const providerPrefix = providerId || this.config.providerId || 'unknown';
    
    // Check if the tool is protected from blacklisting
    const blacklistResult = ToolSuccessRegistry.attemptBlacklist(
      tool.name,
      tool.description,
      providerPrefix,
      errorMessage
    );
    
    if (!blacklistResult.allowed) {
      console.warn(`🛡️ [OLLAMA-BLACKLIST-PROTECTION] Tool ${tool.name} protected from blacklisting`);
      console.warn(`🛡️ [OLLAMA-BLACKLIST-PROTECTION] Reason: ${blacklistResult.reason}`);
      console.warn(`🛡️ [OLLAMA-BLACKLIST-PROTECTION] Original error: ${errorMessage}`);
      
      // Add notification about protection
      console.log(`🚫 [OLLAMA-BLACKLIST-PREVENTED] False positive blacklist prevented for tool: ${tool.name}`);
      return; // Don't blacklist the tool
    }
    
    // Tool is not protected, proceed with blacklisting
    const toolKey = `${providerPrefix}:${tool.name}:${tool.description}`;
    OllamaClient.problematicTools.add(toolKey);
    
    console.log(`🚫 [PROBLEMATIC-TOOLS-OLLAMA] Stored problematic tool for provider ${providerPrefix}: ${tool.name}`);
    console.log(`🚫 [PROBLEMATIC-TOOLS-OLLAMA] Error: ${errorMessage}`);
    console.log(`🚫 [PROBLEMATIC-TOOLS-OLLAMA] Total problematic tools: ${OllamaClient.problematicTools.size}`);
    
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
        console.log(`💾 [PROBLEMATIC-TOOLS-OLLAMA] Persisted to localStorage for provider ${providerPrefix}`);
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
    
    console.log(`✅ [OLLAMA-TOOL-SUCCESS] Recorded successful execution of ${toolName} for provider ${providerPrefix}`);
  }

  /**
   * Filter out known problematic tools for the current provider
   */
  private filterOutProblematicTools(tools: any[], providerId?: string): any[] {
    const providerPrefix = providerId || this.config.providerId || 'unknown';
    
    // Load from localStorage on first use for this provider
    this.loadProblematicToolsFromStorage(providerPrefix);
    
    const filtered = tools.filter(tool => {
      const toolKey = `${providerPrefix}:${tool.name}:${tool.description}`;
      const isProblematic = OllamaClient.problematicTools.has(toolKey);
      
      if (isProblematic) {
        console.log(`🚫 [FILTER-OLLAMA] Skipping known problematic tool for provider ${providerPrefix}: ${tool.name}`);
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
        OllamaClient.problematicTools.add(toolKey);
      }
      
      if (stored.length > 0) {
        console.log(`📂 [PROBLEMATIC-TOOLS-OLLAMA] Loaded ${stored.length} problematic tools from localStorage for provider ${providerId}`);
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
    const keysToRemove = Array.from(OllamaClient.problematicTools).filter(key => key.startsWith(`${providerId}:`));
    keysToRemove.forEach(key => OllamaClient.problematicTools.delete(key));
    
    try {
      const storageKey = `angela-problematic-tools-${providerId}`;
      localStorage.removeItem(storageKey);
      console.log(`🗑️ [PROBLEMATIC-TOOLS-OLLAMA] Cleared all stored problematic tools for provider ${providerId}`);
    } catch (error) {
      console.warn(`Failed to clear problematic tools from localStorage for provider ${providerId}:`, error);
    }
  }

  /**
   * Clear all stored problematic tools (for debugging/reset)
   */
  public static clearProblematicTools(): void {
    OllamaClient.problematicTools.clear();
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
      localStorage.removeItem('angela-problematic-tools-ollama');
      console.log(`🗑️ [PROBLEMATIC-TOOLS-OLLAMA] Cleared all stored problematic tools for all providers`);
    } catch (error) {
      console.warn('Failed to clear problematic tools from localStorage:', error);
    }
  }

  /**
   * Get list of problematic tools (for debugging)
   */
  public static getProblematicTools(): string[] {
    return Array.from(OllamaClient.problematicTools);
  }
}


