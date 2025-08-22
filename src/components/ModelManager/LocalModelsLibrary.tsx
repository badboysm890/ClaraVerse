import React, { useEffect, useState } from 'react';
import { HardDrive, Cloud, Trash2, Eye, Link, AlertTriangle, FileIcon } from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';
import { LocalModel, VisionCompatibilityInfo, Notification, Confirmation } from './types';
import { formatFileSize } from './utils';
import CustomModelPathManager from './CustomModelPathManager';

interface LocalModelsLibraryProps {
  localModels: LocalModel[];
  onDeleteModel: (filePath: string) => void;
  deleting: Set<string>;
  onModelManagerTabChange: (tab: 'discover' | 'library') => void;
  onManageMmproj: (model: LocalModel) => void;
  onNotification: (notification: Notification) => void;
  onConfirmation: (confirmation: Confirmation) => void;
}

const LocalModelsLibrary: React.FC<LocalModelsLibraryProps> = ({
  localModels,
  onDeleteModel,
  deleting,
  onModelManagerTabChange,
  onManageMmproj,
  onNotification,
  onConfirmation
}) => {
  const { customModelPath } = useProviders();
  const [modelEmbeddingInfo, setModelEmbeddingInfo] = useState<Map<string, VisionCompatibilityInfo>>(new Map());

  // Helper function to check if a file is an mmproj model
  const isMmprojModel = (filename: string) => {
    return filename.toLowerCase().includes('mmproj') || 
           filename.toLowerCase().includes('mm-proj') ||
           filename.toLowerCase().includes('projection');
  };

  // Helper function to check if a file is an embedding model
  const isEmbeddingModel = (filename: string) => {
    const embeddingKeywords = [
      'embed', 'embedding', 'embeddings',
      'mxbai', 'nomic', 'bge', 'e5',
      'sentence-transformer', 'sentence_transformer',
      'all-minilm', 'all_minilm'
    ];
    const lowerFilename = filename.toLowerCase();
    return embeddingKeywords.some(keyword => lowerFilename.includes(keyword));
  };

  // Function to load embedding info for a model
  const loadModelEmbeddingInfo = async (model: LocalModel) => {
    if (modelEmbeddingInfo.has(model.path)) return;
    
    try {
      const result = await window.llamaSwap.getModelEmbeddingInfo(model.path);
      if (result.success) {
        const compatibilityInfo: VisionCompatibilityInfo = {
          embeddingSize: result.embeddingSize || 'unknown',
          isVisionModel: result.isVisionModel || false,
          needsMmproj: result.needsMmproj || false,
          compatibleMmprojFiles: result.compatibleMmprojFiles || [],
          hasCompatibleMmproj: result.hasCompatibleMmproj || false,
          compatibilityStatus: result.compatibilityStatus || 'unknown'
        };

        // If it's a vision model that needs mmproj and doesn't have compatible local ones,
        // search Hugging Face for compatible mmproj files
        if (compatibilityInfo.isVisionModel && !compatibilityInfo.hasCompatibleMmproj && 
            typeof compatibilityInfo.embeddingSize === 'number') {
          try {
            const hfResult = await window.llamaSwap.searchHuggingFaceMmproj(
              model.file || model.name, 
              compatibilityInfo.embeddingSize
            );
            if (hfResult.success && hfResult.results) {
              compatibilityInfo.availableHuggingFaceMmproj = hfResult.results;
            }
          } catch (error) {
            console.warn('Error searching Hugging Face for mmproj files:', error);
          }
        }

        setModelEmbeddingInfo(prev => new Map(prev).set(model.path, compatibilityInfo));
      }
    } catch (error) {
      console.error('Error loading model embedding info:', error);
    }
  };

  // Load embedding info when models are loaded
  useEffect(() => {
    if (localModels.length > 0) {
      localModels.forEach(model => {
        loadModelEmbeddingInfo(model);
      });
    }
  }, [localModels]);

  // Handle opening mmproj selector for a specific model
  const handleManageMmproj = (model: LocalModel) => {
    onManageMmproj(model);
  };

  return (
    <div className="space-y-6">
      {/* Custom Model Path Manager */}
      <CustomModelPathManager 
        onNotification={onNotification}
        onConfirmation={onConfirmation}
      />

     

      {/* Models Table */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Library
          </h3>
          {localModels.length > 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {localModels.length} models
            </div>
          )}
        </div>

        {localModels.length > 0 ? (
          <div className="space-y-3">
            {localModels.map((model) => (
              <div key={model.path} className="flex items-center gap-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all duration-200 hover:shadow-sm">
                {/* Model Icon & Type */}
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-sm ${
                  model.source === 'custom' ? 'bg-gradient-to-br from-blue-400 to-blue-600' :
                  model.source === 'user' ? 'bg-gradient-to-br from-green-400 to-green-600' :
                  'bg-gradient-to-br from-purple-400 to-purple-600'
                }`}>
                  <HardDrive className="w-7 h-7" />
                </div>

                {/* Model Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h5 className="font-semibold text-gray-900 dark:text-white text-lg truncate">
                      {model.name}
                    </h5>
                    
                    {/* Model Type Badges */}
                    <div className="flex gap-1 shrink-0">
                      {isMmprojModel(model.file) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                          <FileIcon className="w-3 h-3" />
                          mmproj
                        </span>
                      )}
                      {isEmbeddingModel(model.file) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                          embedding
                        </span>
                      )}
                      {model.isVisionModel && !isMmprojModel(model.file) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                          <Eye className="w-3 h-3" />
                          Vision
                        </span>
                      )}
                      {model.hasAssignedMmproj && !isMmprojModel(model.file) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-full">
                          <Link className="w-3 h-3" />
                          linked
                        </span>
                      )}
                      {model.isVisionModel && !model.hasAssignedMmproj && !isMmprojModel(model.file) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          needs mmproj
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mb-3 truncate">
                    {model.file}
                  </p>
                  
                  {/* Model Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      <span>{formatFileSize(model.size)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Cloud className="w-3 h-3" />
                      <span className="capitalize">{model.source}</span>
                    </div>
                    <div>
                      <span>Added {new Date(model.lastModified).toLocaleDateString()}</span>
                    </div>
                    {model.source === 'custom' && customModelPath && (
                      <div className="text-blue-600 dark:text-blue-400 truncate" title={model.path}>
                        📁 Custom Dir
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* mmproj Management Button */}
                  {!isMmprojModel(model.file) && !isEmbeddingModel(model.file) && (
                    <button
                      onClick={() => handleManageMmproj(model)}
                      className="p-2 rounded-lg transition-colors text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="Manage mmproj assignment"
                    >
                      <Link className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete Button */}
                  {deleting.has(model.path) ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white text-xs rounded-lg opacity-50 cursor-not-allowed">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Removing...
                    </div>
                  ) : (
                    <button
                      onClick={() => onDeleteModel(model.path)}
                      disabled={deleting.has(model.path) || model.source === 'bundled'}
                      className={`p-2 rounded-lg transition-colors ${
                        model.source === 'bundled' 
                          ? 'text-gray-400 cursor-not-allowed' 
                          : 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20'
                      }`}
                      title={model.source === 'bundled' ? 'Cannot delete bundled models' : 'Remove model'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <HardDrive className="w-10 h-10 text-gray-400 dark:text-gray-600" />
            </div>
            <h4 className="text-xl font-medium text-gray-900 dark:text-white mb-3">
              No models in your library
            </h4>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Download models from the Discover tab or set a custom model directory to get started with local AI models
            </p>
            <button 
              onClick={() => onModelManagerTabChange('discover')}
              className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors font-medium"
            >
              Discover Models
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocalModelsLibrary; 
