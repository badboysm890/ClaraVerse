import React, { useState, useEffect } from 'react';

interface ContainerInfo {
  id: string;
  name: string;
  state: string;
  status: string;
  image: string;
  ports: any[];
  mounts: any[];
}

const ComfyUIDebugTest: React.FC = () => {
  const [containerInfo, setContainerInfo] = useState<ContainerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');

  const checkComfyUIContainer = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get all containers
      const containers = await window.electronAPI?.getContainers();
      console.log('All containers:', containers);
      
      // Find ComfyUI container
      const comfyuiContainer = containers?.find((c: any) => 
        c.name === 'angela_comfyui' || c.name.includes('comfyui')
      );
      
      if (!comfyuiContainer) {
        setError('ComfyUI container not found. Please start ComfyUI first.');
        return;
      }
      
      console.log('Found ComfyUI container:', comfyuiContainer);
      setContainerInfo(comfyuiContainer);
      
      // Get container logs
      try {
        const containerLogs = await window.electronAPI?.getContainerLogs(comfyuiContainer.id);
        setLogs(containerLogs || 'No logs available');
      } catch (logError) {
        console.error('Failed to get container logs:', logError);
        setLogs('Failed to retrieve logs');
      }
      
    } catch (err) {
      console.error('Error checking ComfyUI container:', err);
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startComfyUIContainer = async () => {
    if (!containerInfo) return;
    
    setIsLoading(true);
    try {
      await window.electronAPI?.containerAction(containerInfo.id, 'start');
      setTimeout(() => {
        checkComfyUIContainer();
      }, 3000);
    } catch (err) {
      setError(`Failed to start container: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const testLocalDownload = async () => {
    setIsLoading(true);
    try {
      // Test the new local download system
      const result = await window.modelManager?.comfyuiLocalDownloadModel?.(
        'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
        'test-model.safetensors',
        'checkpoints'
      );
      
      console.log('Download test result:', result);
      alert(`Download test result: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.error('Download test failed:', err);
      alert(`Download test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testStorageInfo = async () => {
    setIsLoading(true);
    try {
      const result = await window.modelManager?.comfyuiLocalGetStorageInfo?.();
      console.log('Storage info result:', result);
      alert(`Storage info: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.error('Storage info test failed:', err);
      alert(`Storage info test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testListModels = async () => {
    setIsLoading(true);
    try {
      const result = await window.modelManager?.comfyuiLocalListModels?.('loras');
      console.log('List models result:', result);
      alert(`List models result: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.error('List models test failed:', err);
      alert(`List models test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkComfyUIContainer();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">ComfyUI Debug Test</h1>
      
      <div className="space-y-6">
        {/* Container Status */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Container Status</h2>
          
          <div className="flex gap-4 mb-4">
            <button
              onClick={checkComfyUIContainer}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Checking...' : 'Check Container'}
            </button>
            
            {containerInfo && containerInfo.state !== 'running' && (
              <button
                onClick={startComfyUIContainer}
                disabled={isLoading}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                Start Container
              </button>
            )}
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 mb-4">
              {error}
            </div>
          )}
          
          {containerInfo && (
            <div className="space-y-2">
              <p><strong>Name:</strong> {containerInfo.name}</p>
              <p><strong>State:</strong> <span className={`font-medium ${containerInfo.state === 'running' ? 'text-green-600' : 'text-red-600'}`}>{containerInfo.state}</span></p>
              <p><strong>Status:</strong> {containerInfo.status}</p>
              <p><strong>Image:</strong> {containerInfo.image}</p>
              
              {containerInfo.mounts && containerInfo.mounts.length > 0 && (
                <div>
                  <strong>Volume Mounts:</strong>
                  <ul className="list-disc list-inside ml-4 mt-2">
                    {containerInfo.mounts.map((mount: any, index: number) => (
                      <li key={index} className="text-sm">
                        <code>{mount.Source}</code> → <code>{mount.Destination}</code>
                        {mount.RW ? ' (RW)' : ' (RO)'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {containerInfo.ports && containerInfo.ports.length > 0 && (
                <div>
                  <strong>Ports:</strong>
                  <ul className="list-disc list-inside ml-4 mt-2">
                    {containerInfo.ports.map((port: any, index: number) => (
                      <li key={index} className="text-sm">
                        {port.PublicPort ? `${port.PublicPort}:` : ''}{port.PrivatePort}/{port.Type}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test Functions */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Test Functions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={testStorageInfo}
              disabled={isLoading}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
            >
              Test Storage Info
            </button>
            
            <button
              onClick={testListModels}
              disabled={isLoading}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
            >
              Test List Models
            </button>
            
            <button
              onClick={testLocalDownload}
              disabled={isLoading}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              Test Download (Small)
            </button>
          </div>
        </div>

        {/* Container Logs */}
        {logs && (
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Container Logs (Last 50 lines)</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
              {logs}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComfyUIDebugTest; 
