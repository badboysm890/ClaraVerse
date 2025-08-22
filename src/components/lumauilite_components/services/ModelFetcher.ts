export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    input?: number;
    output?: number;
  };
}

export class ModelFetcher {
  static async fetchModels(provider: any): Promise<ModelInfo[]> {
    try {
      switch (provider.type) {
        case 'openai':
          return await this.fetchOpenAIModels(provider);
        case 'openrouter':
          return await this.fetchOpenRouterModels(provider);
        case 'ollama':
          return await this.fetchOllamaModels(provider);
        default:
          console.warn(`Model fetching not implemented for provider type: ${provider.type}`);
          return [];
      }
    } catch (error) {
      console.error(`Error fetching models for ${provider.name}:`, error);
      return [];
    }
  }

  private static async fetchOpenAIModels(provider: any): Promise<ModelInfo[]> {
    const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
    const apiKey = provider.apiKey;

    if (!apiKey) {
      throw new Error('API key is required for OpenAI');
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAI models: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Filter for chat completion models and sort by relevance
    const chatModels = data.data
      .filter((model: any) => 
        model.id.includes('gpt') || 
        model.id.includes('claude') ||
        model.id.includes('text-davinci') ||
        model.id.includes('chat')
      )
      .map((model: any) => ({
        id: model.id,
        name: model.id,
        description: `OpenAI model: ${model.id}`,
        context_length: this.getContextLength(model.id)
      }))
      .sort((a: ModelInfo, b: ModelInfo) => {
        // Prioritize GPT-4 models, then GPT-3.5, then others
        const priority = (id: string) => {
          if (id.includes('gpt-4')) return 1;
          if (id.includes('gpt-3.5')) return 2;
          if (id.includes('gpt')) return 3;
          return 4;
        };
        return priority(a.id) - priority(b.id);
      });

    return chatModels;
  }

  private static async fetchOpenRouterModels(provider: any): Promise<ModelInfo[]> {
    const baseUrl = provider.baseUrl || 'https://openrouter.ai/api/v1';
    const apiKey = provider.apiKey;

    if (!apiKey) {
      throw new Error('API key is required for OpenRouter');
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.data
      .map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description || `${model.id}`,
        context_length: model.context_length,
        pricing: model.pricing
      }))
      .sort((a: ModelInfo, b: ModelInfo) => {
        // Prioritize popular models
        const priority = (id: string) => {
          if (id.includes('claude-3.5-sonnet')) return 1;
          if (id.includes('gpt-4')) return 2;
          if (id.includes('claude')) return 3;
          if (id.includes('gpt-3.5')) return 4;
          if (id.includes('llama')) return 5;
          return 6;
        };
        return priority(a.id) - priority(b.id);
      });
  }

  private static async fetchOllamaModels(provider: any): Promise<ModelInfo[]> {
    const baseUrl = provider.baseUrl || 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/tags`);

    if (!response.ok) {
      throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.models?.map((model: any) => ({
      id: model.name,
      name: model.name,
      description: `Ollama model: ${model.name}`,
      context_length: 4096 // Default context length for Ollama models
    })) || [];
  }

  private static getContextLength(modelId: string): number {
    // Common context lengths for known models
    if (modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4-1106')) return 128000;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo-16k')) return 16384;
    if (modelId.includes('gpt-3.5')) return 4096;
    if (modelId.includes('claude-3')) return 200000;
    if (modelId.includes('claude-2')) return 100000;
    return 4096; // Default
  }

  // Get common/recommended models for a provider type without API call
  static getCommonModels(providerType: string): ModelInfo[] {
    switch (providerType) {
      case 'openai':
        return [
          { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model', context_length: 8192 },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Latest GPT-4 with 128k context', context_length: 128000 },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient', context_length: 4096 },
          { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16k', description: 'Extended context version', context_length: 16384 }
        ];
      case 'openrouter':
        return [
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Latest Claude model', context_length: 200000 },
          { id: 'openai/gpt-4', name: 'GPT-4', description: 'OpenAI GPT-4 via OpenRouter', context_length: 8192 },
          { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'Most capable Claude model', context_length: 200000 },
          { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Meta\'s latest large model', context_length: 131072 }
        ];
      case 'ollama':
        return [
          { id: 'llama3.1', name: 'Llama 3.1', description: 'Meta\'s latest model', context_length: 4096 },
          { id: 'codellama', name: 'Code Llama', description: 'Specialized for code', context_length: 4096 },
          { id: 'mistral', name: 'Mistral', description: 'Efficient 7B model', context_length: 4096 },
          { id: 'qwen2', name: 'Qwen 2', description: 'Alibaba\'s latest model', context_length: 4096 }
        ];
      default:
        return [];
    }
  }
} 
