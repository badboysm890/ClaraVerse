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
}

declare global {
  interface Window {
    electron: Electron;
    electronAPI: ElectronAPI;
    llamaSwap: {
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
      scanCustomPathModels: (path: string) => Promise<{ success: boolean; models?: any[]; error?: string }>;
      downloadHuggingFaceModel: (modelId: string, fileName: string, downloadPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      downloadModelWithDependencies: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>, downloadPath: string) => Promise<{ success: boolean; results?: any[]; downloadedFiles?: string[]; error?: string }>;
    };
    modelManager: {
      searchHuggingFaceModels: (query: string, limit?: number) => Promise<{ success: boolean; models: any[]; error?: string }>;
      downloadModel: (modelId: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      downloadModelWithDependencies: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => Promise<{ success: boolean; results?: any[]; downloadedFiles?: string[]; error?: string }>;
      getLocalModels: () => Promise<{ success: boolean; models: any[]; error?: string }>;
      deleteLocalModel: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (data: any) => void) => () => void;
      stopDownload: (fileName: string) => Promise<{ success: boolean; error?: string }>;
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
    claraTTSService: any;
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