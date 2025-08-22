/**
 * angela Notebook Service
 * 
 * This service handles notebook functionality with LightRAG integration.
 * It provides CRUD operations for notebooks and documents, querying, and health checking.
 */

export interface ProviderConfig {
  name: string;
  type: 'openai' | 'openai_compatible' | 'ollama';
  baseUrl?: string;
  apiKey?: string;
  model: string;
  [key: string]: string | number | boolean | undefined;
}

export interface NotebookCreate {
  name: string;
  description?: string;
  llm_provider: ProviderConfig;
  embedding_provider: ProviderConfig;
}

export interface NotebookResponse {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  document_count: number;
  // Add provider information to response (optional for backward compatibility)
  llm_provider?: ProviderConfig;
  embedding_provider?: ProviderConfig;
}

/**
 * Document in a notebook
 */
export interface NotebookDocumentResponse {
  id: string;
  filename: string;
  notebook_id: string;
  uploaded_at: string;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  file_path?: string; // Add file path for citation tracking
}

/**
 * Citation information for sources
 */
export interface NotebookCitation {
  filename: string;
  file_path: string;
  document_id: string;
  title: string;
}

/**
 * Query request to a notebook
 */
export interface NotebookQueryRequest {
  question: string;
  mode?: 'local' | 'global' | 'hybrid' | 'naive' | 'mix';
  response_type?: string;
  top_k?: number;
  llm_provider?: ProviderConfig; // Optional provider override
}

/**
 * Query response from a notebook
 */
export interface NotebookQueryResponse {
  answer: string;
  mode: string;
  context_used: boolean;
  citations?: NotebookCitation[]; // Add citations support
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
    properties?: Record<string, unknown>;
  }>;
}

export interface BackendHealth {
  status: string;
  port: number;
  uptime: string;
}

export class angelaNotebookService {
  private baseUrl: string;
  private isHealthy: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckCallbacks: ((isHealthy: boolean) => void)[] = [];
  private abortController: AbortController | null = null;

  constructor(baseUrl: string = 'http://localhost:5001') {
    this.baseUrl = baseUrl;
    this.startHealthChecking();
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.checkHealth();
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 10000);
  }

  /**
   * Stop health checking
   */
  public stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check backend health
   */
  private async checkHealth(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const health: BackendHealth = await response.json();
        const wasHealthy = this.isHealthy;
        this.isHealthy = health.status === 'healthy';
        
        if (wasHealthy !== this.isHealthy) {
          console.log(`📚 Notebook Backend health changed: ${this.isHealthy ? 'healthy' : 'unhealthy'}`);
          this.notifyHealthCallbacks();
        }
      } else {
        this.setUnhealthy();
      }
    } catch {
      this.setUnhealthy();
    }
  }

  /**
   * Set backend as unhealthy
   */
  private setUnhealthy(): void {
    const wasHealthy = this.isHealthy;
    this.isHealthy = false;
    
    if (wasHealthy) {
      console.log('📚 Notebook Backend is unhealthy');
      this.notifyHealthCallbacks();
    }
  }

  /**
   * Notify all health callbacks
   */
  private notifyHealthCallbacks(): void {
    this.healthCheckCallbacks.forEach(callback => {
      try {
        callback(this.isHealthy);
      } catch (error) {
        console.error('Error in health callback:', error);
      }
    });
  }

  /**
   * Subscribe to health status changes
   */
  public onHealthChange(callback: (isHealthy: boolean) => void): () => void {
    this.healthCheckCallbacks.push(callback);
    callback(this.isHealthy);
    
    return () => {
      const index = this.healthCheckCallbacks.indexOf(callback);
      if (index > -1) {
        this.healthCheckCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current health status
   */
  public isBackendHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Force a health check
   */
  public async forceHealthCheck(): Promise<boolean> {
    await this.checkHealth();
    return this.isHealthy;
  }

  /**
   * Create a new notebook
   */
  public async createNotebook(notebook: NotebookCreate): Promise<NotebookResponse> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notebook),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to create notebook: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Create notebook error:', error);
      throw error;
    }
  }

  /**
   * List all notebooks
   */
  public async listNotebooks(): Promise<NotebookResponse[]> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to list notebooks: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('List notebooks error:', error);
      throw error;
    }
  }

  /**
   * Get a specific notebook
   */
  public async getNotebook(notebookId: string): Promise<NotebookResponse> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Notebook not found');
        }
        throw new Error(`Failed to get notebook: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get notebook error:', error);
      throw error;
    }
  }

  /**
   * Delete a notebook
   */
  public async deleteNotebook(notebookId: string): Promise<void> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Notebook not found');
        }
        throw new Error(`Failed to delete notebook: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Delete notebook error:', error);
      throw error;
    }
  }

  /**
   * Upload documents to a notebook
   */
  public async uploadDocuments(notebookId: string, files: File[]): Promise<NotebookDocumentResponse[]> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to upload documents: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Upload documents error:', error);
      throw error;
    }
  }

  /**
   * List documents in a notebook
   */
  public async listDocuments(notebookId: string): Promise<NotebookDocumentResponse[]> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/documents`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to list documents: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('List documents error:', error);
      throw error;
    }
  }

  /**
   * Delete a document from a notebook
   */
  public async deleteDocument(notebookId: string, documentId: string): Promise<void> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Document not found');
        }
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Delete document error:', error);
      throw error;
    }
  }

  /**
   * Query a notebook
   */
  public   async queryNotebook(notebookId: string, query: NotebookQueryRequest): Promise<NotebookQueryResponse> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      // Cancel any previous request
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: query.question,
          mode: query.mode || 'hybrid',
          response_type: query.response_type || 'Multiple Paragraphs',
          top_k: query.top_k || 60,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to query notebook: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Query was cancelled');
      }
      console.error('Query notebook error:', error);
      throw error;
    }
  }

  async generateSummary(notebookId: string): Promise<NotebookQueryResponse> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Failed to generate summary: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Generate summary error:', error);
      throw error;
    }
  }

  /**
   * Get graph data for a notebook
   */
  public async getGraphData(notebookId: string): Promise<GraphData> {
    if (!this.isHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/notebooks/${notebookId}/graph`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to get graph data: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform the response to match our GraphData interface
      return {
        nodes: data.nodes || [],
        edges: data.edges || []
      };
    } catch (error) {
      console.error('Get graph data error:', error);
      throw error;
    }
  }

  /**
   * Get URL for interactive HTML graph visualization
   */
  public getGraphHtmlUrl(notebookId: string): string {
    return `${this.baseUrl}/notebooks/${notebookId}/graph/html`;
  }

  /**
   * Stop current operations
   */
  public stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopHealthChecking();
    this.stop();
    this.healthCheckCallbacks = [];
  }
}

// Create singleton instance
export const angelaNotebookService = new angelaNotebookService();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    angelaNotebookService.destroy();
  });
} 
