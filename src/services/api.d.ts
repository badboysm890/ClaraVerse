interface HealthCheckResponse {
  status: string;
  port?: number;
}

interface ApiService {
  checkHealth: () => Promise<HealthCheckResponse>;
  getTest: () => Promise<any>;
  // Add other methods as needed
}

declare const api: ApiService;

export default api; 
