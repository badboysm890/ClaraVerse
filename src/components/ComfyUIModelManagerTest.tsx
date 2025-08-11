import React, { useState, useEffect } from 'react';

interface LocalModel {
  name: string;
  category: string;
  localPath: string;
  containerPath: string;
  size: number;
  modified: Date;
  isLocal: boolean;
  isPersistent: boolean;
}

interface StorageInfo {
  persistent: Record<string, {
    count: number;
    totalSize: number;
    path: string;
    models: LocalModel[];
  }>;
  container: {
    filesystem?: string;
    size?: string;
    used?: string;
    available?: string;
    percent?: string;
    isAccessible: boolean;
    error?: string;
  };
  summary: {
    totalPersistentModels: number;
    totalPersistentSize: number;
  };
}

const ComfyUIModelManagerTest: React.FC = () => {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('checkpoints');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadFilename, setDownloadFilename] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<any>(null);

  const categories = ['checkpoints', 'loras', 'vae', 'controlnet', 'upscale_models', 'embeddings'];

  // Load models and storage info
  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Load models for selected category
      const modelsResult = await (window as any).modelManager.comfyuiLocalListModels(selectedCategory);
      if (modelsResult.success) {
        setModels(modelsResult.models);
      }
      
      // Load storage info
      const storageResult = await (window as any).modelManager.comfyuiLocalGetStorageInfo();
      if (storageResult.success) {
        setStorageInfo(storageResult.storage);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Download model
  const handleDownload = async () => {
    if (!downloadUrl || !downloadFilename) {
      alert('Please enter both URL and filename');
      return;
    }

    try {
      setIsLoading(true);
      const result = await (window as any).modelManager.comfyuiLocalDownloadModel(
        downloadUrl, 
        downloadFilename, 
        selectedCategory
      );
      
      if (result.success) {
        alert(`Model downloaded successfully: ${result.filename}`);
        setDownloadUrl('');
        setDownloadFilename('');
        loadData(); // Refresh the list
      } else {
        alert(`Download failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete model
  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      const result = await (window as any).modelManager.comfyuiLocalDeleteModel(filename, selectedCategory);
      if (result.success) {
        alert(`Model deleted: ${filename}`);
        loadData(); // Refresh the list
      } else {
        alert(`Delete failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert(`Delete error: ${error}`);
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Set up event listeners
  useEffect(() => {
    const progressUnsubscribe = (window as any).modelManager.onComfyUILocalDownloadProgress((data: any) => {
      setDownloadProgress(data);
    });

    const completeUnsubscribe = (window as any).modelManager.onComfyUILocalDownloadComplete((data: any) => {
      setDownloadProgress(null);
      loadData(); // Refresh the list
    });

    const errorUnsubscribe = (window as any).modelManager.onComfyUILocalDownloadError((data: any) => {
      setDownloadProgress(null);
      
      // Enhanced error handling with specific messages for different error types
      let userMessage = `Download failed for ${data.filename}`;
      
      if (data.error.includes('HTTP 401') || data.error.includes('Unauthorized')) {
        userMessage = `Download failed for ${data.filename}\n\nThis model requires an API key for download. Please:\n• Set up your CivitAI API key in the main Model Manager\n• Or get an API key from: civitai.com/user/account`;
      } else if (data.error.includes('HTTP 403') || data.error.includes('Forbidden')) {
        userMessage = `Download failed for ${data.filename}\n\nAccess forbidden. Please check your API key or account permissions.`;
      } else if (data.error.includes('HTTP 404') || data.error.includes('Not Found')) {
        userMessage = `Download failed for ${data.filename}\n\nModel file not found. The download link may be expired.`;
      } else if (data.error.includes('network') || data.error.includes('timeout')) {
        userMessage = `Download failed for ${data.filename}\n\nNetwork connection issue. Please check your internet connection.`;
      } else {
        userMessage = `Download failed for ${data.filename}\n\nError: ${data.error}`;
      }
      
      alert(userMessage);
    });

    return () => {
      progressUnsubscribe();
      completeUnsubscribe();
      errorUnsubscribe();
    };
  }, []);

  // Load data when component mounts or category changes
  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">ComfyUI Local Model Manager Test</h1>
      
      {/* Category Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Model Category:</label>
        <select 
          value={selectedCategory} 
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="border rounded px-3 py-2 bg-white"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Download Section */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Download Model</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Download URL:</label>
            <input
              type="text"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://example.com/model.safetensors"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filename:</label>
            <input
              type="text"
              value={downloadFilename}
              onChange={(e) => setDownloadFilename(e.target.value)}
              placeholder="model.safetensors"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={isLoading || !downloadUrl || !downloadFilename}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Downloading...' : 'Download Model'}
        </button>
        
        {/* Download Progress */}
        {downloadProgress && (
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <div className="text-sm font-medium">Downloading: {downloadProgress.filename}</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${downloadProgress.progress || 0}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {downloadProgress.progress?.toFixed(1)}% - {downloadProgress.speed} - ETA: {downloadProgress.eta}
            </div>
          </div>
        )}
      </div>

      {/* Storage Info */}
      {storageInfo && (
        <div className="bg-green-50 p-4 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Storage Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium">Local Persistent Storage</h3>
              <p>Total Models: {storageInfo.summary.totalPersistentModels}</p>
              <p>Total Size: {formatSize(storageInfo.summary.totalPersistentSize)}</p>
            </div>
            <div>
              <h3 className="font-medium">Container Storage</h3>
              {storageInfo.container.isAccessible ? (
                <div>
                  <p>Size: {storageInfo.container.size}</p>
                  <p>Used: {storageInfo.container.used}</p>
                  <p>Available: {storageInfo.container.available}</p>
                  <p>Usage: {storageInfo.container.percent}</p>
                </div>
              ) : (
                <p className="text-red-600">Container not accessible</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Models List */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Local Models ({selectedCategory})</h2>
          <p className="text-sm text-gray-600">{models.length} models found</p>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : models.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No models found in {selectedCategory} category
          </div>
        ) : (
          <div className="divide-y">
            {models.map((model, index) => (
              <div key={index} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium">{model.name}</h3>
                    <p className="text-sm text-gray-600">Size: {formatSize(model.size)}</p>
                    <p className="text-sm text-gray-600">Modified: {new Date(model.modified).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Local: {model.localPath}</p>
                    <p className="text-xs text-gray-500">Container: {model.containerPath}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      Persistent
                    </span>
                    <button
                      onClick={() => handleDelete(model.name)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComfyUIModelManagerTest; 