import React, { useState, useEffect } from 'react';
import { HardDrive } from 'lucide-react';
import { useProviders } from '../contexts/ProvidersContext';
import CustomModelPathManager from './ModelManager/CustomModelPathManager';
import SearchSection from './ModelManager/SearchSection';
import PopularModelsSection from './ModelManager/PopularModelsSection';
import LocalModelsLibrary from './ModelManager/LocalModelsLibrary';
import NotificationModal from './ModelManager/NotificationModal';
import ConfirmationModal from './ModelManager/ConfirmationModal';
import { 
  LocalModel, 
  DownloadProgress, 
  Notification, 
  Confirmation, 
  ModelManagerTab 
} from './ModelManager/types';

// Re-export types for backwards compatibility
export type { LocalModel, DownloadProgress, Notification, Confirmation } from './ModelManager/types';

const ModelManager: React.FC = () => {
  // Model manager state
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ [fileName: string]: DownloadProgress }>({});
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [modelManagerTab, setModelManagerTab] = useState<ModelManagerTab>('discover');
  
  const { customModelPath } = useProviders();

  // UI state for notifications and confirmations
  const [notification, setNotification] = useState<Notification | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Initialize downloadToCustomPath directly from localStorage to avoid race condition
  const downloadToCustomPath = (() => {
    try {
      const savedSetting = localStorage.getItem('downloadToCustomPath');
      return savedSetting ? JSON.parse(savedSetting) : false;
    } catch (error) {
      console.error('Error initializing download setting from localStorage:', error);
      return false;
    }
  })();

  // Initial load of local models on mount
  useEffect(() => {
    // Add a small delay to ensure backend is ready and custom path is set
    const timer = setTimeout(() => {
      loadLocalModels();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Load local models on mount and set up download progress listener
  const loadLocalModels = async () => {
    if (window.modelManager?.getLocalModels) {
      try {
        const result = await window.modelManager.getLocalModels();
        if (result.success) {
          setLocalModels(result.models);
        }
      } catch (error) {
        console.error('Error loading local models:', error);
      }
    }
  };

  // Add effect to reload local models when customModelPath changes
  useEffect(() => {
    loadLocalModels();
  }, [customModelPath]);

  const downloadModel = async (modelId: string, fileName: string) => {
    if (!window.modelManager?.downloadModel) return;
    
    setDownloading(prev => new Set([...prev, fileName]));
    try {
      // Pass custom download path if enabled and custom path is set
      const downloadPath = (downloadToCustomPath && customModelPath) ? customModelPath : undefined;
      
      const result = await window.modelManager.downloadModel(modelId, fileName, downloadPath);
      if (result.success) {
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
        
        // Show success notification with download location
        setNotification({
          type: 'success',
          title: 'Download Complete',
          message: downloadPath 
            ? `Model downloaded to custom directory: ${downloadPath}`
            : 'Model downloaded to default directory'
        });
      } else {
        console.error('Download failed:', result.error);
        setNotification({
          type: 'error',
          title: 'Download Failed',
          message: result.error || 'Unknown error occurred during download'
        });
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      setNotification({
        type: 'error',
        title: 'Download Error',
        message: 'An unexpected error occurred during download'
      });
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        return newSet;
      });
      
      // Clean up progress
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[fileName];
        return newProgress;
      });
    }
  };

  const downloadModelWithDependencies = async (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => {
    if (!window.modelManager?.downloadModelWithDependencies) return;
    
    // Set downloading state for the main file initially
    setDownloading(prev => new Set([...prev, fileName]));
    
    try {
      // Pass custom download path if enabled and custom path is set
      const downloadPath = (downloadToCustomPath && customModelPath) ? customModelPath : undefined;
      
      const result = await window.modelManager.downloadModelWithDependencies(modelId, fileName, allFiles, downloadPath);
      if (result.success) {
        console.log('Downloaded files:', result.downloadedFiles);
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
        
        // Show success notification with download location
        setNotification({
          type: 'success',
          title: 'Download Complete',
          message: downloadPath 
            ? `Model with dependencies downloaded to custom directory: ${downloadPath}`
            : 'Model with dependencies downloaded to default directory'
        });
      } else {
        console.error('Download with dependencies failed:', result.error);
        setNotification({
          type: 'error',
          title: 'Download Failed',
          message: result.error || 'Unknown error occurred during download with dependencies - probably due to the rate limiting, hit download after 30s'
        });
      }
    } catch (error) {
      console.error('Error downloading model with dependencies:', error);
      setNotification({
        type: 'error',
        title: 'Download Error',
        message: 'An unexpected error occurred during download with dependencies'
      });
    } finally {
      // Clean up downloading state for all files that might have been downloaded
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileName);
        
        // Also remove any mmproj files that might have been downloaded
        const visionKeywords = ['vl', 'vision', 'multimodal', 'mm', 'clip', 'siglip'];
        const isVision = visionKeywords.some(keyword => fileName.toLowerCase().includes(keyword));
        
        if (isVision) {
          // Find and remove mmproj files from downloading state
          allFiles.forEach(file => {
            if (file.rfilename.toLowerCase().includes('mmproj') ||
                file.rfilename.toLowerCase().includes('mm-proj') ||
                file.rfilename.toLowerCase().includes('projection')) {
              newSet.delete(file.rfilename);
            }
          });
        }
        
        return newSet;
      });
      
      // Clean up progress for all downloaded files
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[fileName];
        
        // Also clean up mmproj file progress
        const visionKeywords = ['vl', 'vision', 'multimodal', 'mm', 'clip', 'siglip'];
        const isVision = visionKeywords.some(keyword => fileName.toLowerCase().includes(keyword));
        
        if (isVision) {
          allFiles.forEach(file => {
            if (file.rfilename.toLowerCase().includes('mmproj') ||
                file.rfilename.toLowerCase().includes('mm-proj') ||
                file.rfilename.toLowerCase().includes('projection')) {
              delete newProgress[file.rfilename];
            }
          });
        }
        
        return newProgress;
      });
    }
  };

  const deleteLocalModel = async (filePath: string) => {
    if (!window.modelManager?.deleteLocalModel) return;
    
    try {
      // Add to deleting set
      setDeleting(prev => new Set([...prev, filePath]));
      
      const result = await window.modelManager.deleteLocalModel(filePath);
      if (result.success) {
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
      } else {
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Error deleting model:', error);
    } finally {
      // Remove from deleting set
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  // Handler for tag filtering - pass to search section
  const handleTagFilter = async (tag: string) => {
    // This will be handled by the SearchSection component
    console.log('Tag filter:', tag);
  };

  // Handle confirmation with proper callback cleanup
  const handleConfirmation = (confirmationData: Confirmation) => {
    setConfirmation({
      ...confirmationData,
      onConfirm: async () => {
        try {
          await confirmationData.onConfirm();
        } finally {
          setConfirmation(null);
        }
      },
      onCancel: () => {
        confirmationData.onCancel();
        setConfirmation(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Custom Model Path Manager */}
      <CustomModelPathManager 
        onNotification={setNotification}
        onConfirmation={handleConfirmation}
      />

      {/* Main Model Manager Section */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <HardDrive className="w-6 h-6 text-sakura-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Model Manager
          </h2>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => setModelManagerTab('discover')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              modelManagerTab === 'discover'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Discover Models
          </button>
          <button
            onClick={() => setModelManagerTab('library')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              modelManagerTab === 'library'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            My Library ({localModels.length})
          </button>
        </div>

        {/* Discover Tab Content */}
        {modelManagerTab === 'discover' && (
          <>
            {/* Search Section */}
            <SearchSection
              onDownload={downloadModel}
              onDownloadWithDependencies={downloadModelWithDependencies}
              downloading={downloading}
              downloadProgress={downloadProgress}
              onTagClick={handleTagFilter}
            />

            {/* Popular Models Section */}
            <PopularModelsSection
              onDownload={downloadModel}
              onDownloadWithDependencies={downloadModelWithDependencies}
              downloading={downloading}
              downloadProgress={downloadProgress}
              onTagClick={handleTagFilter}
            />
          </>
        )}

        {/* Library Tab Content */}
        {modelManagerTab === 'library' && (
          <LocalModelsLibrary
            localModels={localModels}
            onDeleteModel={deleteLocalModel}
            deleting={deleting}
            onModelManagerTabChange={setModelManagerTab}
            onManageMmproj={() => {}} // Provide a suitable handler or stub
            onNotification={setNotification}
            onConfirmation={handleConfirmation}
          />
        )}
      </div>

      {/* Modals */}
      <NotificationModal 
        notification={notification}
        onClose={() => setNotification(null)}
      />
      
      <ConfirmationModal 
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
};

export default ModelManager; 
