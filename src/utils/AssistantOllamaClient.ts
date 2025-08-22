import { OllamaClient, ChatMessage, RequestOptions, Tool } from './OllamaClient';

interface ModelConfig {
  visionModel: string;
  toolModel: string;
  ragModel: string;
}

export class AssistantOllamaClient extends OllamaClient {
  private modelConfig: ModelConfig = {
    visionModel: '',
    toolModel: '',
    ragModel: ''
  };

  constructor(baseUrl: string, config?: any) {
    super(baseUrl, config);
  }

  public setModelConfig(config: Partial<ModelConfig>) {
    this.modelConfig = { ...this.modelConfig, ...config };
  }

  public getModelConfig(): ModelConfig {
    return { ...this.modelConfig };
  }

  public async generateWithImages(
    defaultModel: string,
    prompt: string,
    images: string[],
    options: RequestOptions = {}
  ): Promise<any> {
    // Use vision model if configured, otherwise fall back to default
    const model = this.modelConfig.visionModel || defaultModel;

    if (this.getConfig().type === 'openai') {
      // Format messages for OpenAI's vision API
      const messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map(img => ({
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${img}`
            }
          }))
        ]
      }];

      const response = await fetch(`${this.getConfig().baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getConfig().apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        response: data.choices[0]?.message?.content,
        eval_count: data.usage?.total_tokens
      };
    }

    return super.generateWithImages(model, prompt, images, options);
  }

  public async *streamGenerateWithImages(
    defaultModel: string,
    prompt: string,
    images: string[],
    options: RequestOptions = {}
  ): AsyncGenerator<any> {
    // Use vision model if configured, otherwise fall back to default
    const model = this.modelConfig.visionModel || defaultModel;
    
    if (this.getConfig().type === 'openai') {
      // Format messages for OpenAI's vision API
      const messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map(img => ({
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${img}`
            }
          }))
        ]
      }];

      const response = await fetch(`${this.getConfig().baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getConfig().apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...options
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                yield {
                  response: data.choices[0].delta.content,
                  eval_count: data.usage?.total_tokens || 0
                };
              }
            } catch (e) {
              console.warn('Failed to parse streaming response:', e);
            }
          }
        }
      }

      if (buffer) {
        try {
          const data = JSON.parse(buffer.replace(/^data: /, ''));
          if (data.choices?.[0]?.delta?.content) {
            yield {
              response: data.choices[0].delta.content,
              eval_count: data.usage?.total_tokens || 0
            };
          }
        } catch (e) {
          console.warn('Failed to parse final buffer:', e);
        }
      }
    } else {
      // Use Ollama's generate endpoint for non-OpenAI
      const body = {
        model,
        prompt,
        images,
        stream: true,
        ...options
      };

      try {
        const response = await fetch(`${this.getConfig().baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                yield data;
              } catch (e) {
                console.warn('Failed to parse streaming response:', e);
              }
            }
          }
        }

        if (buffer) {
          try {
            const data = JSON.parse(buffer);
            yield data;
          } catch (e) {
            console.warn('Failed to parse final buffer:', e);
          }
        }
      } catch (error) {
        console.error('Error in streamGenerateWithImages:', error);
        throw error;
      }
    }
  }

  public async sendChat(
    defaultModel: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): Promise<any> {
    // Use tool model for tool calls, RAG model for RAG, or default model
    let model = defaultModel;
    
    if (tools && tools.length > 0) {
      model = this.modelConfig.toolModel || defaultModel;
    } else if (options.useRag) {
      model = this.modelConfig.ragModel || defaultModel;
    }

    return super.sendChat(model, messages, options, tools);
  }

  public async *streamChat(
    defaultModel: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): AsyncGenerator<any> {
    // Use tool model for tool calls, RAG model for RAG, or default model
    let model = defaultModel;
    
    if (tools && tools.length > 0) {
      model = this.modelConfig.toolModel || defaultModel;
    } else if (options.useRag) {
      model = this.modelConfig.ragModel || defaultModel;
    }

    yield* super.streamChat(model, messages, options, tools);
  }
} 
