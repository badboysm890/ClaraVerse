// Define the expected structure for service ports
interface ServicePorts {
  python: number;
  n8n: number;
  ollama: number;
}

// Define the expected structure for setup status messages
interface SetupStatus {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ElectronAPI {
  getAppVersion: () => string;
  getElectronVersion: () => string;
  getPlatform: () => string;
  getOsVersion: () => string;
  getWorkflowsPath: () => Promise<string>;
  getServicePorts: () => Promise<{ n8nPort: number }>;
  checkN8NHealth: () => Promise<boolean>;
  startN8N: () => Promise<void>;
  stopN8N: () => Promise<void>;
  getPythonPort: () => Promise<number>;
  checkPythonBackend: () => Promise<boolean>;
  checkDockerServices: () => Promise<{
    dockerAvailable: boolean;
    n8nAvailable: boolean;
    pythonAvailable: boolean;
    message?: string;
    ports?: {
      python: number;
      n8n: number;
      ollama: number;
    };
  }>;
  restartInterpreterContainer: () => Promise<{ success: boolean; error?: string }>;
  checkForUpdates: () => Promise<void>;
  getUpdateInfo: () => Promise<{
    hasUpdate: boolean;
    latestVersion?: string;
    currentVersion: string;
    releaseUrl?: string;
    downloadUrl?: string;
    releaseNotes?: string;
    publishedAt?: string;
    platform: string;
    isOTASupported: boolean;
    error?: string;
  }>;
  sendReactReady: () => void;
  clipboard: {
    writeText: (text: string) => void;
    readText: () => string;
  };
  ipcRenderer: {
    on: (channel: string, callback: (data: any) => void) => void;
    removeListener: (channel: string, callback: (...args: any[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
  receive: (channel: string, callback: (data: any) => void) => void;
  removeListener: (channel: string) => void;
  requestMicrophonePermission?: () => Promise<boolean>;
  isDev: boolean;
  getContainers: () => Promise<Array<{
    id: string;
    name: string;
    status: string;
    ports: Array<{ host: string; container: string }>;
  }>>;
  containerAction: (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<void>;
  createContainer: (config: {
    name: string;
    image: string;
    ports: Array<{ host: string; container: string }>;
    env?: Record<string, string>;
  }) => Promise<void>;
  getContainerLogs: (containerId: string) => Promise<string>;
  send: (channel: string, data?: any) => void;
  
  // ComfyUI specific methods
  comfyuiStatus: () => Promise<{
    running: boolean;
    port?: number;
    containerName?: string;
    error?: string;
  }>;
  comfyuiStart: () => Promise<{ success: boolean; error?: string }>;
  comfyuiStop: () => Promise<{ success: boolean; error?: string }>;
  comfyuiRestart: () => Promise<{ success: boolean; error?: string }>;
  comfyuiLogs: () => Promise<{ success: boolean; logs?: string; error?: string }>;
  comfyuiOptimize: () => Promise<{ success: boolean; message?: string; error?: string }>;
  
  // System information methods
  getSystemInfo: () => Promise<{ arch: string; platform: string; [key: string]: any }>;
  saveComfyUIConsent: (hasConsented: boolean) => Promise<void>;
  getComfyUIConsent: () => Promise<{ hasConsented: boolean; timestamp?: string; version?: string } | null>;
  getGPUInfo: () => Promise<{ success: boolean; gpuInfo?: { hasNvidiaGPU: boolean; gpuName: string; isAMD: boolean; renderer?: string; [key: string]: any }; error?: string }>;
  
  // Generic invoke method for IPC
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  
  // Event handling methods for ComfyUI and other real-time updates
  on: (channel: string, callback: (data: any) => void) => void;
  off: (channel: string, callback: (data: any) => void) => void;
}

interface LlamaSwapAPI {
  getGPUDiagnostics: () => Promise<{
    success: boolean;
    gpuInfo?: {
      hasNvidiaGPU: boolean;
      gpuName: string;
      isAMD: boolean;
      [key: string]: any;
    };
    error?: string;
  }>;
  
  // Services status
  getServicesStatus: () => Promise<{
    services?: {
      [key: string]: {
        name: string;
        status: 'healthy' | 'unhealthy' | 'failed' | 'unknown';
        lastCheck: Date | null;
        failureCount: number;
        isRetrying: boolean;
      };
    };
    overallHealth?: 'healthy' | 'degraded' | 'critical';
    error?: string;
  }>;
}

declare global {
  interface Window {
    electron: Electron;
    electronAPI: ElectronAPI;
    llamaSwap: LlamaSwapAPI & {
      start: () => Promise<{ success: boolean; message?: string; error?: string; warning?: string; diagnostics?: any; status?: any }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      restart: () => Promise<{ success: boolean; message?: string; status?: any; error?: string }>;
      getStatus: () => Promise<{ isRunning: boolean; port: number | null; apiUrl: string | null; error?: string }>;
      getStatusWithHealth: () => Promise<{ isRunning: boolean; port: number | null; apiUrl: string | null; isResponding?: boolean; healthCheck?: string; healthError?: string; error?: string }>;
      getModels: () => Promise<any[]>;
      getApiUrl: () => Promise<string | null>;
      regenerateConfig: () => Promise<{ success: boolean; models?: number; error?: string }>;
      debugBinaryPaths: () => Promise<{ success: boolean; debugInfo?: any; error?: string }>;
      getGPUDiagnostics: () => Promise<{ success: boolean; gpuInfo?: any; modelInfo?: any[]; error?: string }>;
      setCustomModelPath: (path: string | null) => Promise<{ success: boolean; error?: string }>;
      getCustomModelPaths: () => Promise<string[]>;
      scanCustomPathModels: (path: string) => Promise<{ 
        success: boolean; 
        models?: {
          name: string;
          file: string;
          path: string;
          relativePath?: string;
          folderHint?: string;
          size: number;
          source: string;
          lastModified: Date;
        }[]; 
        error?: string;
      }>;
      downloadHuggingFaceModel: (modelId: string, fileName: string, downloadPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      getModelEmbeddingInfo: (modelPath: string) => Promise<{ 
        success: boolean; 
        embeddingSize?: number | string;
        isVisionModel?: boolean;
        needsMmproj?: boolean;
        compatibleMmprojFiles?: any[];
        hasCompatibleMmproj?: boolean;
        compatibilityStatus?: string;
        error?: string; 
      }>;
      searchHuggingFaceMmproj: (modelName: string, embeddingSize: number) => Promise<{ 
        success: boolean; 
        results?: any[];
        error?: string; 
      }>;
      downloadModelWithDependencies: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>, downloadPath: string) => Promise<{ success: boolean; results?: any[]; downloadedFiles?: string[]; error?: string }>;
    };
    modelManager: {
      searchHuggingFaceModels: (query: string, limit?: number, sort?: string) => Promise<{ success: boolean; models: any[]; error?: string }>;
      downloadModel: (modelId: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      downloadModelWithCustomName: (modelId: string, fileName: string, customSaveName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      downloadModelWithDependencies: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => Promise<{ success: boolean; results?: any[]; downloadedFiles?: string[]; error?: string }>;
      getLocalModels: () => Promise<{ success: boolean; models: any[]; error?: string }>;
      deleteLocalModel: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (data: any) => void) => () => void;
      stopDownload: (fileName: string) => Promise<{ success: boolean; error?: string }>;
      
      // Model Manager APIs (CivitAI search)
      searchCivitAI: (query: string, types?: string[], sort?: string, apiKey?: string, nsfw?: boolean) => Promise<any>;
      downloadModelFile: (url: string, filename: string, modelType: string, source: string) => Promise<any>;
      getLocalModelFiles: () => Promise<Record<string, any[]>>;
      deleteLocalModelFile: (modelType: string, filename: string) => Promise<{ success: boolean; error?: string }>;
      saveApiKeys: (keys: { civitai?: string }) => Promise<void>;
      getApiKeys: () => Promise<{ civitai?: string }>;
      
      // ComfyUI Model Manager APIs
      comfyuiDownloadModel: (url: string, filename: string, modelType: string, source: string, apiKey?: string) => Promise<{ success: boolean; path?: string; modelType?: string; size?: number; error?: string }>;
      comfyuiGetLocalModels: () => Promise<Record<string, Array<{ name: string; size: number; modified: Date; path: string; type: string }>>>;
      comfyuiDeleteModel: (modelType: string, filename: string) => Promise<{ success: boolean; error?: string }>;
      comfyuiGetModelsDir: () => Promise<{ path: string; exists: boolean }>;
      
      // ComfyUI Download Progress Events
      onComfyUIDownloadProgress: (callback: (data: { filename: string; progress: number; downloadedSize: number; totalSize: number; speed?: string; eta?: string }) => void) => () => void;
      onComfyUIDownloadComplete: (callback: (data: { filename: string; modelType: string; path: string; size: number }) => void) => () => void;
      onModelDownloadProgress: (callback: (data: { filename: string; progress: number; downloadedSize: number; totalSize: number; speed?: string; eta?: string }) => void) => () => void;
      
      // ComfyUI Local Model Management APIs
      comfyuiLocalListModels: (category: string) => Promise<{ success: boolean; models: Array<{ name: string; size: number; modified: Date; path: string; type: string }>; error?: string }>;
      comfyuiLocalDownloadModel: (url: string, filename: string, category: string, apiKey?: string, source?: string) => Promise<{ success: boolean; filename?: string; category?: string; localPath?: string; containerPath?: string; size?: number; error?: string }>;
      comfyuiLocalDeleteModel: (filename: string, category: string) => Promise<{ success: boolean; error?: string }>;
      comfyuiLocalImportModel: (externalPath: string, filename: string, category: string) => Promise<{ success: boolean; error?: string }>;
      comfyuiLocalGetStorageInfo: () => Promise<{ success: boolean; storage?: any; error?: string }>;
      
      // ComfyUI Local Download Progress Events
      onComfyUILocalDownloadProgress: (callback: (data: { filename: string; progress: number; downloadedSize: number; totalSize: number; speed?: string; eta?: string }) => void) => () => void;
      onComfyUILocalDownloadComplete: (callback: (data: { filename: string; category: string; localPath: string; containerPath: string; size: number }) => void) => () => void;
      onComfyUILocalDownloadError: (callback: (data: { filename: string; error: string }) => void) => () => void;
      
      // Mmproj mapping management
      getModelEmbeddingInfo: (modelPath: string) => Promise<{ 
        success: boolean; 
        embeddingSize?: number | string;
        isVisionModel?: boolean;
        needsMmproj?: boolean;
        compatibleMmprojFiles?: any[];
        hasCompatibleMmproj?: boolean;
        compatibilityStatus?: string;
        error?: string; 
      }>;
      saveMmprojMappings: (mappings: any[]) => Promise<{ success: boolean; error?: string }>;
      loadMmprojMappings: () => Promise<{ success: boolean; mappings?: any[]; error?: string }>;
      runLlamaOptimizer: (preset: string) => Promise<{ success: boolean; message?: string; error?: string }>;
      restartLlamaSwap: () => Promise<{ success: boolean; error?: string }>;
    };
    mcpService: {
      getServers: () => Promise<MCPServer[]>;
      addServer: (serverConfig: MCPServerConfig) => Promise<boolean>;
      removeServer: (name: string) => Promise<boolean>;
      updateServer: (name: string, updates: Partial<MCPServerConfig>) => Promise<boolean>;
      startServer: (name: string) => Promise<MCPServerInfo>;
      stopServer: (name: string) => Promise<boolean>;
      restartServer: (name: string) => Promise<MCPServerInfo>;
      getServerStatus: (name: string) => Promise<MCPServerStatus | null>;
      testServer: (name: string) => Promise<{ success: boolean; message?: string; error?: string }>;
      getTemplates: () => Promise<MCPServerTemplate[]>;
      startAllEnabled: () => Promise<{ name: string; success: boolean; error?: string }[]>;
      stopAll: () => Promise<{ name: string; success: boolean; error?: string }[]>;
      startPreviouslyRunning: () => Promise<{ name: string; success: boolean; error?: string }[]>;
      saveRunningState: () => Promise<boolean>;
      importClaudeConfig: (configPath: string) => Promise<{ imported: number; errors: any[] }>;
      executeToolCall: (toolCall: any) => Promise<any>;
      diagnoseNode: () => Promise<{
        nodeAvailable: boolean;
        npmAvailable: boolean;
        npxAvailable: boolean;
        nodePath?: string | null;
        npmPath?: string | null;
        npxPath?: string | null;
        pathDirs: string[];
        suggestions: string[];
      }>;
    };
    webContainerManager: any;
    angelaTTSService: any;
    electronScreenShare?: {
      getDesktopSources: () => Promise<Array<{
        id: string;
        name: string;
        thumbnail: string;
      }>>;
      getScreenAccessStatus: () => Promise<{
        status: 'granted' | 'denied' | 'unknown';
        error?: string;
      }>;
      requestScreenAccess: () => Promise<{
        granted: boolean;
        error?: string;
      }>;
    };
  }
}

// Electron specific types
declare namespace Electron {
  interface WebViewElement extends HTMLElement {
    src: string;
    reload(): void;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<Electron.WebViewElement>, Electron.WebViewElement> & {
        src?: string;
        allowpopups?: string;
      };
    }
  }
}

// MCP Types
interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'remote';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  description?: string;
  enabled?: boolean;
}

interface MCPServerInfo {
  process?: any;
  name: string;
  config: MCPServerConfig;
  startedAt: Date;
  status: 'starting' | 'running' | 'error' | 'stopped';
  error?: string;
}

interface MCPServerStatus {
  name: string;
  config: MCPServerConfig;
  isRunning: boolean;
  status: 'starting' | 'running' | 'error' | 'stopped';
  startedAt?: Date;
  error?: string;
  pid?: number;
}

interface MCPServer {
  name: string;
  config: MCPServerConfig;
  isRunning: boolean;
  status: 'starting' | 'running' | 'error' | 'stopped';
  startedAt?: Date;
  error?: string;
  pid?: number;
}

interface MCPServerTemplate {
  name: string;
  displayName: string;
  description: string;
  command: string;
  args: string[];
  type: 'stdio' | 'remote';
  category: string;
  env?: Record<string, string>;
}

interface Electron {
  getWorkflowsPath: () => Promise<string>;
  getPythonPort: () => Promise<number>;
  checkPythonBackend: () => Promise<{ port: number; status: string; available: boolean; }>;
  receive: (channel: string, func: (data: any) => void) => void;
  removeListener: (channel: string, func: (data: any) => void) => void;
  send: (channel: string, data?: any) => void;
} 
