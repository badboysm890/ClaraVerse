/**
 * angela Core HTTP Client
 * Replaces IPC calls to LlamaSwapService with HTTP API calls
 */

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

interface ServiceResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface StatusResult {
  isRunning: boolean;
  gpu?: any;
  port?: number;
}

interface HealthResult {
  status: string;
  message?: string;
}

interface ModelsResult {
  models: any[];
}

export class angelaCoreClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8091') {
    this.baseUrl = baseUrl;
  }

  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  async request(endpoint: string, options: RequestOptions = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`angela Core API error (${endpoint}):`, error);
      throw error;
    }
  }

  // Service Management
  async startService() {
    return this.request('/start', { method: 'POST' });
  }

  async stopService() {
    return this.request('/stop', { method: 'POST' });
  }

  async restartService() {
    return this.request('/restart', { method: 'POST' });
  }

  async getStatus() {
    return this.request('/status');
  }

  async getHealth() {
    return this.request('/health');
  }

  // Model Management
  async getModels(): Promise<ModelsResult> {
    return this.request('/models');
  }

  async scanModels(): Promise<ServiceResult> {
    return this.request('/models/scan', { method: 'POST' });
  }

  async getModelInfo(modelId: string): Promise<any> {
    return this.request(`/models/${modelId}`);
  }

  // Configuration
  async getConfig(): Promise<any> {
    return this.request('/config');
  }

  async updateConfig(config: any): Promise<ServiceResult> {
    return this.request('/config', {
      method: 'POST',
      body: { config }
    });
  }

  async generateConfig(): Promise<ServiceResult> {
    return this.request('/config/generate', { method: 'POST' });
  }

  // GPU Information
  async getGPUInfo(): Promise<any> {
    return this.request('/gpu');
  }

  // Logs
  async getLogs(): Promise<any> {
    return this.request('/logs');
  }

  // Health check with retry
  async waitForHealth(maxRetries = 30, interval = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const health = await this.getHealth();
        if (health.status === 'healthy') {
          return true;
        }
      } catch (error) {
        // Service not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('angela Core service did not become healthy within timeout');
  }

  // OpenAI-compatible proxy endpoints
  async listModels(): Promise<any> {
    try {
      const response = await this.request('/v1/models');
      return response;
    } catch (error) {
      // Fallback to our models endpoint
      const models = await this.getModels();
      return {
        object: 'list',
        data: models.models?.map((model: any) => ({
          id: `angela:${model.name}`,
          object: 'model',
          created: Math.floor(new Date(model.lastModified).getTime() / 1000),
          owned_by: 'angela'
        })) || []
      };
    }
  }

  async createCompletion(params: any): Promise<any> {
    return this.request('/v1/completions', {
      method: 'POST',
      body: params
    });
  }

  async createChatCompletion(params: any): Promise<any> {
    return this.request('/v1/chat/completions', {
      method: 'POST',
      body: params
    });
  }

  async createEmbedding(params: any): Promise<any> {
    return this.request('/v1/embeddings', {
      method: 'POST',
      body: params
    });
  }
}

// Factory function to create client instance
export function createangelaCoreClient(baseUrl?: string): angelaCoreClient {
  return new angelaCoreClient(baseUrl);
}

// Default client instance
export const angelaCoreClient = new angelaCoreClient();

// IPC compatibility layer for gradual migration
export class angelaCoreIPCAdapter {
  private client: angelaCoreClient;

  constructor(client = angelaCoreClient) {
    this.client = client;
  }

  // Map old IPC calls to new HTTP calls
  async startLlamaSwap(): Promise<any> {
    try {
      const result = await this.client.startService();
      return {
        success: result.success,
        message: result.message,
        error: result.error,
        status: await this.client.getStatus()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async stopLlamaSwap(): Promise<any> {
    try {
      const result = await this.client.stopService();
      return { success: result.success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async restartLlamaSwap(): Promise<any> {
    try {
      const result = await this.client.restartService();
      return {
        success: result.success,
        message: result.message || 'Service restarted',
        status: await this.client.getStatus()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getLlamaSwapStatus(): Promise<any> {
    try {
      const status = await this.client.getStatus();
      return {
        isRunning: status.isRunning,
        port: 8080, // Internal port
        apiUrl: status.isRunning ? `${this.client.apiBaseUrl}/v1` : null
      };
    } catch (error: any) {
      return { isRunning: false, port: null, apiUrl: null, error: error.message };
    }
  }

  async getLlamaSwapStatusWithHealth(): Promise<any> {
    try {
      const [status, health] = await Promise.all([
        this.client.getStatus(),
        this.client.getHealth()
      ]);
      
      return {
        isRunning: status.isRunning && health.status === 'healthy',
        port: 8080,
        apiUrl: status.isRunning ? `${this.client.apiBaseUrl}/v1` : null
      };
    } catch (error: any) {
      return { isRunning: false, port: null, apiUrl: null, error: error.message };
    }
  }

  async getLlamaSwapModels(): Promise<any[]> {
    try {
      const result = await this.client.getModels();
      return result.models || [];
    } catch (error) {
      console.error('Error getting models:', error);
      return [];
    }
  }

  async getLlamaSwapApiUrl(): Promise<string | null> {
    try {
      const status = await this.client.getStatus();
      return status.isRunning ? `${this.client.apiBaseUrl}/v1` : null;
    } catch (error) {
      return null;
    }
  }

  async regenerateLlamaSwapConfig(): Promise<any> {
    try {
      const result = await this.client.generateConfig();
      return { ...result, success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getGPUDiagnostics(): Promise<any> {
    try {
      const result = await this.client.getGPUInfo();
      return { success: true, ...result.gpu };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async debugBinaryPaths(): Promise<any> {
    try {
      const status = await this.client.getStatus();
      return {
        success: true,
        debugInfo: {
          isRunning: status.isRunning,
          gpu: status.gpu,
          containerized: true
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// Export adapter instance for IPC compatibility
export const angelaCoreIPCAdapter = new angelaCoreIPCAdapter();
