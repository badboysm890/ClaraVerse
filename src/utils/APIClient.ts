import type { Tool } from '../db';

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  tool_calls?: any[];
  name?: string; // For tool responses
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
      tool_calls?: any[];
    };
    delta?: {
      content?: string;
    };
  }];
  usage?: {
    total_tokens: number;
  };
}

export class APIClient {
  private abortController: AbortController | null = null;
  private config: APIConfig;

  constructor(baseUrl: string, config?: Partial<APIConfig>) {
    this.config = {
      apiKey: config?.apiKey || '',
      baseUrl: baseUrl
    };
  }

  /**
   * Get the current configuration
   */
  public getConfig(): APIConfig {
    return { ...this.config };
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
    
    const payload = {
      model,
      messages: this.prepareMessages(messages),
      stream: false,
      ...options
    };

    if (formattedTools && formattedTools.length > 0) {
      payload.tools = formattedTools;
    }

    const response = await this.request('/chat/completions', 'POST', payload);
    
    return {
      message: {
        content: response.choices?.[0]?.message?.content || '',
        role: response.choices?.[0]?.message?.role as ChatRole,
        tool_calls: response.choices?.[0]?.message?.tool_calls
      },
      usage: response.usage
    };
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
    
    const formattedTools = tools?.map(tool => this.formatTool(tool));
    
    const payload = { 
      model, 
      messages: this.prepareMessages(messages), 
      stream: true,
      ...options 
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
      const streamResponse = await fetch(`${this.config.baseUrl}/chat/completions`, {
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
            const parsed = JSON.parse(line.replace('data: ', ''));
            const data: APIResponse = {
              message: {
                content: parsed.choices?.[0]?.delta?.content || '',
                role: 'assistant'
              }
            };
            yield data;
          } catch (e) {
            console.warn('Failed to parse streaming response line:', line, e);
          }
        }
      }
    } finally {
      if (this.abortController) {
        this.abortController = null;
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

    const response = await this.request("/chat/completions", "POST", {
      model,
      messages,
      max_tokens: options.max_tokens || 1000,
      ...options
    });

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
        return { role: msg.role, content };
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
} 