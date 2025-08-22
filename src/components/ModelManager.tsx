import React, { useState, useEffect } from 'react';
import { HardDrive } from 'lucide-react';
import { useProviders } from '../contexts/ProvidersContext';
import EnhancedModelDiscovery from './ModelManager/EnhancedModelDiscovery';
import LocalModelsLibrary from './ModelManager/LocalModelsLibrary';
import NotificationModal from './ModelManager/NotificationModal';
import ConfirmationModal from './ModelManager/ConfirmationModal';
import MmprojSelector from './ModelManager/MmprojSelector';
import modelMmprojMappingService from '../services/modelMmprojMappingService';
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
  
  // mmproj Selector state
  const [selectedModelForMmproj, setSelectedModelForMmproj] = useState<LocalModel | null>(null);
  const [showMmprojSelector, setShowMmprojSelector] = useState(false);
  
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
    const timer = setTimeout(async () => {
      // Initialize mmproj mapping service from backend
      try {
        await modelMmprojMappingService.loadFromBackend();
      } catch (error) {
        console.warn('Could not load mmproj mappings from backend on startup:', error);
      }
      
      // Load local models
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
          // Enhance models with mmproj information
          const enhancedModels = await Promise.all(
            result.models.map(async (model: any) => {
              try {
                // Get mmproj mapping for this model
                const mapping = modelMmprojMappingService.getMappingForModel(model.path);
                
                // Get embedding info if available
                let embeddingInfo = null;
                if (window.modelManager?.getModelEmbeddingInfo) {
                  try {
                    embeddingInfo = await window.modelManager.getModelEmbeddingInfo(model.path);
                  } catch (embeddingError) {
                    console.warn('Error getting embedding info for model:', model.file, embeddingError);
                  }
                }
                
                return {
                  ...model,
                  mmprojMapping: mapping,
                  isVisionModel: embeddingInfo?.isVisionModel || false,
                  hasAssignedMmproj: !!mapping,
                  embeddingSize: embeddingInfo?.embeddingSize || 'unknown'
                };
              } catch (error) {
                console.warn('Error enhancing model with mmproj info:', model.file, error);
                return {
                  ...model,
                  mmprojMapping: null,
                  isVisionModel: false,
                  hasAssignedMmproj: false,
                  embeddingSize: 'unknown'
                };
              }
            })
          );
          
          setLocalModels(enhancedModels);
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

  const downloadModelWithCustomName = async (modelId: string, fileName: string, customSaveName: string) => {
    if (!window.modelManager?.downloadModelWithCustomName) return;
    
    setDownloading(prev => new Set([...prev, fileName]));
    try {
      // Pass custom download path if enabled and custom path is set
      const downloadPath = (downloadToCustomPath && customModelPath) ? customModelPath : undefined;
      
      const result = await window.modelManager.downloadModelWithCustomName(modelId, fileName, customSaveName, downloadPath);
      if (result.success) {
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          setLocalModels(localResult.models);
        }
        
        // Show success notification with download location
        const downloadLocation = (downloadToCustomPath && customModelPath) ? customModelPath : 'default location';
        setNotification({
          type: 'success',
          title: 'Download Complete',
          message: `Model downloaded successfully as "${customSaveName}" to ${downloadLocation}!`
        });
      } else {
        setNotification({
          type: 'error',
          title: 'Download Failed',
          message: `Failed to download model: ${result.error}`
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      setNotification({
        type: 'error',
        title: 'Download Error',
        message: `Download failed: ${error}`
      });
    } finally {
      setDownloading(prev => {
        const newDownloading = new Set(prev);
        newDownloading.delete(fileName);
        return newDownloading;
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
      console.log('Download result:', result);
      
      if (result.success) {
        console.log('Downloaded files:', result.downloadedFiles);
        
        // Save mmproj mappings for downloaded models with dependencies
        try {
          if (result.downloadedFiles && Array.isArray(result.downloadedFiles)) {
            const mainModelFile = result.downloadedFiles.find((file: any) => 
              file.endsWith('.gguf') && 
              !file.toLowerCase().includes('mmproj') &&
              !file.toLowerCase().includes('mm-proj') &&
              !file.toLowerCase().includes('projection')
            );
            
            const mmprojFile = result.downloadedFiles.find((file: any) => 
              file.endsWith('.gguf') && (
                file.toLowerCase().includes('mmproj') ||
                file.toLowerCase().includes('mm-proj') ||
                file.toLowerCase().includes('projection')
              )
            );
            
            if (mainModelFile && mmprojFile) {
              // Construct full paths - use downloadPath if provided, otherwise assume models are in default location
              const basePath = downloadPath || '';
              const mainModelPath = basePath ? `${basePath}/${mainModelFile}` : mainModelFile;
              const mmprojPath = basePath ? `${basePath}/${mmprojFile}` : mmprojFile;
              
              // Save the mapping as automatic (not manual)
              modelMmprojMappingService.setMapping(
                mainModelPath, 
                mainModelFile,
                mmprojPath, 
                mmprojFile,
                false // isManual = false for automatic assignment
              );
              
              console.log('Saved automatic mmproj mapping:', mainModelFile, '->', mmprojFile);
            }
          }
        } catch (mappingError) {
          console.warn('Failed to save mmproj mapping after download:', mappingError);
        }
        
        // Refresh local models
        const localResult = await window.modelManager.getLocalModels();
        if (localResult.success) {
          await loadLocalModels(); // Use the enhanced loading function
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
        console.error('Download with dependencies failed:', result);
        console.error('Error details:', result.error);
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
      
      // Clean up mmproj mappings before deleting the model
      try {
        modelMmprojMappingService.removeMapping(filePath);
        console.log('Removed mmproj mapping for deleted model:', filePath);
      } catch (mappingError) {
        console.warn('Failed to remove mmproj mapping for deleted model:', mappingError);
      }
      
      const result = await window.modelManager.deleteLocalModel(filePath);
      if (result.success) {
        // Refresh local models with enhanced data
        await loadLocalModels();
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

  // Handle opening mmproj selector for a specific model
  const handleManageMmproj = (model: LocalModel) => {
    setSelectedModelForMmproj(model);
    setShowMmprojSelector(true);
  };

  // Handle confirmation with proper callback cleanup
  const handleConfirmation = (confirmationData: Confirmation) => {
    setConfirmation(confirmationData);
  };

  // Handle closing mmproj selector
  const handleCloseMmprojSelector = () => {
    setShowMmprojSelector(false);
    setSelectedModelForMmproj(null);
  };

  // Handle mmproj assignment - automatically restart service and reload models
  const handleMmprojAssigned = async () => {
    handleCloseMmprojSelector();
    
    // Show a loading notification
    setNotification({
      type: 'info',
      title: 'Applying mmproj Assignment',
      message: 'Restarting AI service to apply new configuration...'
    });

    try {
      // Automatically restart the llama-swap service to apply the new mmproj configuration
      if (window.modelManager?.restartLlamaSwap) {
        const result = await window.modelManager.restartLlamaSwap();
        if (result.success) {
          // Wait a moment then reload models to show updated status
          setTimeout(async () => {
            await loadLocalModels();
            setNotification({
              type: 'success',
              title: 'mmproj Applied Successfully',
              message: 'AI service restarted with new mmproj configuration.'
            });
          }, 2000);
        } else {
          throw new Error(result.error || 'Failed to restart service');
        }
      } else {
        // Fallback: just reload the models and show manual restart message
        await loadLocalModels();
        setNotification({
          type: 'info',
          title: 'mmproj Assigned',
          message: 'mmproj assignment saved. Please restart the AI service manually to apply changes.'
        });
      }
    } catch (error) {
      console.error('Error applying mmproj assignment:', error);
      setNotification({
        type: 'error',
        title: 'Restart Failed',
        message: `Failed to restart AI service: ${error instanceof Error ? error.message : 'Unknown error'}. Please restart manually.`
      });
      // Still reload models to show the mapping was saved
      await loadLocalModels();
    }
  };

  return (
    <div className="space-y-6">
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
          <EnhancedModelDiscovery
            onDownload={downloadModel}
            onDownloadWithCustomName={downloadModelWithCustomName}
            onDownloadWithDependencies={downloadModelWithDependencies}
            downloading={downloading}
            downloadProgress={downloadProgress}
          />
        )}

        {/* Library Tab Content */}
        {modelManagerTab === 'library' && (
          <LocalModelsLibrary
            localModels={localModels}
            onDeleteModel={deleteLocalModel}
            deleting={deleting}
            onModelManagerTabChange={setModelManagerTab}
            onManageMmproj={handleManageMmproj}
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

      {/* mmproj Selector Modal */}
      {showMmprojSelector && selectedModelForMmproj && (
        <MmprojSelector
          modelPath={selectedModelForMmproj.path}
          modelName={selectedModelForMmproj.name || selectedModelForMmproj.file}
          currentMapping={selectedModelForMmproj.mmprojMapping}
          onMappingChange={handleMmprojAssigned}
          onClose={handleCloseMmprojSelector}
        />
      )}
    </div>
  );
};

export default ModelManager; 
