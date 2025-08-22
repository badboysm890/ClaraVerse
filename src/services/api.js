/**
 * API client for Python backend with auto-discovery and retry capabilities
 */
class PythonApi {
  constructor() {
    this.baseUrl = null;
    this.port = null;
    this.initialized = false;
    this.initPromise = null;
    this.retryTimeout = null;
    this.requestQueue = [];
    this.maxRetries = 3;
    this.currentRetry = 0;
    
    // Initialize the API client
    this.init();
    
    // Listen for backend status updates from Electron
    if (window.electron) {
      window.electron.receive('backend-status', (status) => {
        console.log('Backend status update:', status);
        if (status.status === 'running' && status.port) {
          this.updateBackendInfo(status.port);
        } else if (['crashed', 'failed', 'stopped', 'unresponsive'].includes(status.status)) {
          this.initialized = false;
          this.scheduleReconnect();
        }
      });
    }
    
    // Set up periodic backend status checks
    this.setupPeriodicChecks();
  }
  
  setupPeriodicChecks() {
    // Check backend status every 10 seconds
    setInterval(async () => {
      if (window.electron && !this.initialized) {
        try {
          const status = await window.electron.checkPythonBackend();
          if (status.status === 'running' && status.available && status.port) {
            this.updateBackendInfo(status.port);
          }
        } catch (error) {
          console.warn('Failed to check backend status:', error);
        }
      }
    }, 10000);
  }
  
  updateBackendInfo(port) {
    if (port !== this.port || !this.initialized) {
      console.log(`Updating API baseUrl to use port ${port}`);
      this.port = port;
      this.baseUrl = `http://localhost:${port}`;
      this.initialized = true;
      this.currentRetry = 0;
      this.processQueue();
    }
  }

  /**
   * Initialize the API client and discover the backend port
   */
  init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise(async (resolve) => {
      try {
        // Try to get port from Electron first
        if (window.electron) {
          try {
            this.port = await window.electron.getPythonPort();
            if (this.port) {
              this.baseUrl = `http://localhost:${this.port}`;
              console.log('API initialized with port from Electron:', this.port);
              this.initialized = true;
              resolve({ port: this.port });
              this.processQueue();
              return;
            }
          } catch (error) {
            console.warn('Failed to get Python port from Electron:', error);
          }
        }
        
        // If still not initialized, try to detect port by probing
        await this.detectPortByProbing();
        resolve({ port: this.port });
        this.processQueue();
      } catch (error) {
        console.error('API initialization failed:', error);
        this.initialized = false;
        this.scheduleReconnect();
        resolve({ error });
      }
    });
    
    return this.initPromise;
  }

  /**
   * Detect backend port by probing common ports
   */
  async detectPortByProbing() {
    console.log('Detecting backend port by probing...');
    
    // Try common ports in our range, including 5001 where the backend is currently running
    const ports = [5001, 8099, 8100, 8098, 8097, 8000, 8080];
    
    for (const port of ports) {
      try {
        const response = await fetch(`http://localhost:${port}/`, { 
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(500) // Abort after 500ms
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.service === 'angela Backend') {
            this.port = port;
            this.baseUrl = `http://localhost:${port}`;
            this.initialized = true;
            console.log(`Detected API on port ${port}`);
            return;
          }
        }
      } catch (e) {
        // Ignore errors, just try next port
      }
    }
    
    console.warn('Failed to detect backend port by probing');
    
    // If we couldn't detect the port, use the default
    this.port = 8099;
    this.baseUrl = `http://localhost:${this.port}`;
    this.initialized = false;
    
    throw new Error('Failed to connect to the Python backend');
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect(delay = 5000) {
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    
    this.retryTimeout = setTimeout(() => {
      console.log('Attempting to reconnect to backend...');
      this.initPromise = null;
      this.init();
    }, delay);
  }

  /**
   * Process any queued requests
   */
  processQueue() {
    if (!this.initialized || this.requestQueue.length === 0) return;
    
    console.log(`Processing ${this.requestQueue.length} queued requests`);
    
    while (this.requestQueue.length > 0) {
      const { method, args, resolve, reject } = this.requestQueue.shift();
      
      this[method](...args)
        .then(resolve)
        .catch(reject);
    }
  }

  /**
   * Ensure the client is initialized before making requests
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
      if (!this.initialized) {
        throw new Error('API client is not initialized');
      }
    }
  }

  /**
   * Get test data from the backend with retries
   */
  async getTest() {
    try {
      // Try the root endpoint first as it's more reliable
      const rootCheck = await this.get('/');
      if (rootCheck && rootCheck.status === 'ok') {
        return this.get('/test');
      }
      return null;
    } catch (error) {
      console.warn('Root check failed, trying direct test endpoint');
      return this.get('/test');
    }
  }

  /**
   * Check health of the backend
   */
  async checkHealth() {
    try {
      const status = await this.get('/');
      return {
        status: 'connected',
        port: this.port,
        info: status
      };
    } catch (error) {
      console.error('Backend health check failed:', error);
      return {
        status: 'disconnected',
        error: error.message
      };
    }
  }

  /**
   * Make a GET request to the backend with enhanced error handling
   */
  async get(endpoint, options = {}) {
    // Support for request queueing
    if (!this.initialized && this.initPromise) {
      return new Promise((resolve, reject) => {
        console.log(`Queueing GET request to ${endpoint}`);
        this.requestQueue.push({ method: 'get', args: [endpoint, options], resolve, reject });
      });
    }
    
    try {
      await this.ensureInitialized();
      
      const url = `${this.baseUrl}${endpoint}`;
      console.log(`API GET: ${url}`);
      
      // Create request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = new Error(`HTTP error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API error (${endpoint}):`, error);
      
      // Enhanced error handling with auto-reconnect for network errors
      if (error.name === 'AbortError' || 
          error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError') ||
          error.message.includes('ECONNREFUSED')) {
        this.initialized = false;
        
        // Increase retry count
        this.currentRetry++;
        
        if (this.currentRetry <= this.maxRetries) {
          console.log(`Scheduling reconnect attempt ${this.currentRetry}/${this.maxRetries}`);
          this.scheduleReconnect(1000 * Math.pow(2, this.currentRetry - 1)); // Exponential backoff
          
          // Queue this request to retry after reconnect
          return new Promise((resolve, reject) => {
            this.requestQueue.push({ method: 'get', args: [endpoint, options], resolve, reject });
          });
        }
      }
      
      throw error;
    }
  }

  /**
   * Make a POST request to the backend
   */
  async post(endpoint, data, options = {}) {
    // Check if a retry is already in progress
    if (!this.initialized && this.initPromise) {
      // Queue the request to be processed after initialization
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ method: 'post', args: [endpoint, data, options], resolve, reject });
      });
    }
    
    try {
      await this.ensureInitialized();
      
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = new Error(`HTTP error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API error (${endpoint}):`, error);
      
      // If the error is due to connection issues, try to reconnect
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        this.initialized = false;
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Get the current backend port
   */
  getPort() {
    return this.port;
  }

  /**
   * Check if the client is ready
   */
  isReady() {
    return this.initialized;
  }
}

// Create singleton instance
const api = new PythonApi();
export default api;
