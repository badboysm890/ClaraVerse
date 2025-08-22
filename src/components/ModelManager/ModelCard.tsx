import React, { useState } from 'react';
import { Download, Star, FileText, X, ExternalLink, Cpu, Database } from 'lucide-react';
import { HuggingFaceModel, DownloadProgress } from './types';
import { formatFileSize, getModelParams, sortFilesByPriority, isMmprojFile, isVisionModel } from './utils';

interface ModelCardProps {
  model: HuggingFaceModel;
  onDownload: (modelId: string, fileName: string) => void;
  onDownloadWithDependencies?: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => void;
  downloading: Set<string>;
  downloadProgress: { [fileName: string]: DownloadProgress };
  onTagClick?: (tag: string) => void;
}

const ModelCard: React.FC<ModelCardProps> = ({ 
  model, 
  onDownload, 
  onDownloadWithDependencies, 
  downloading, 
  downloadProgress, 
  onTagClick 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModelCard, setShowModelCard] = useState(false);
  const [modelCardContent, setModelCardContent] = useState<string>('');
  const [loadingModelCard, setLoadingModelCard] = useState(false);
  
  // Calculate total model size
  const totalSize = model.files.reduce((acc, file) => acc + (file.size || 0), 0);
  
  // Check if this is a vision model
  const isVision = isVisionModel(model);
  
  // Find mmproj files
  const mmprojFiles = model.requiredMmprojFiles || 
    model.files.filter(file => isMmprojFile(file.rfilename));
  
  const hasRequiredMmproj = isVision && mmprojFiles.length > 0;
  
  // Separate main model files from mmproj files
  const mainModelFiles = model.files.filter(file => file.rfilename.endsWith('.gguf') && !isMmprojFile(file.rfilename));
  const onlyMmprojFiles = model.files.filter(file => file.rfilename.endsWith('.gguf') && isMmprojFile(file.rfilename));
  
  // For standalone mmproj models (when there are no main model files), use mmproj files as primary
  const isStandaloneMmprojModel = mainModelFiles.length === 0 && onlyMmprojFiles.length > 0;
  
  // Sort files to prioritize main model files, but if it's a standalone mmproj model, use mmproj files
  const sortedFiles = sortFilesByPriority(
    isStandaloneMmprojModel ? onlyMmprojFiles : mainModelFiles
  );

  // Load model card content
  const loadModelCard = async () => {
    if (modelCardContent) {
      setShowModelCard(true);
      return;
    }
    
    setLoadingModelCard(true);
    try {
      // Try to fetch README from HuggingFace
      const response = await fetch(`https://huggingface.co/${model.id}/raw/main/README.md`);
      if (response.ok) {
        const content = await response.text();
        setModelCardContent(content);
        setShowModelCard(true);
      } else {
        setModelCardContent(`# ${model.name}\n\n${model.description}\n\n**Author:** ${model.author}\n\n**Downloads:** ${model.downloads.toLocaleString()}\n\n**Tags:** ${model.tags.join(', ')}`);
        setShowModelCard(true);
      }
    } catch (error) {
      console.error('Error loading model card:', error);
      setModelCardContent(`# ${model.name}\n\n${model.description}\n\n**Author:** ${model.author}\n\n**Downloads:** ${model.downloads.toLocaleString()}\n\n**Tags:** ${model.tags.join(', ')}`);
      setShowModelCard(true);
    } finally {
      setLoadingModelCard(false);
    }
  };

  return (
    <>
      <div className="bg-white/40 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/60 dark:border-gray-700/60 hover:bg-white/60 dark:hover:bg-gray-800/60 transition-all duration-200 hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-gray-900/20">
        <div className="flex items-start gap-3">
          {/* Model Icon */}
          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
            {model.name.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h5 className="font-semibold text-gray-900 dark:text-white text-base truncate">{model.name}</h5>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={loadModelCard}
                      disabled={loadingModelCard}
                      className="p-1 text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 transition-colors rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                      title="View model card"
                    >
                      {loadingModelCard ? (
                        <div className="w-3 h-3 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                    </button>
                    <a
                      href={`https://huggingface.co/${model.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-blue-500 transition-colors rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                      title="View on HuggingFace"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">by {model.author}</p>
                
                {/* Model Stats */}
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {model.downloads > 1000 ? `${(model.downloads / 1000).toFixed(0)}k` : model.downloads.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {model.likes > 1000 ? `${(model.likes / 1000).toFixed(0)}k` : model.likes.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    {getModelParams(model.name)}
                  </span>
                  {totalSize > 0 && (
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {formatFileSize(totalSize)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Vision Model Indicator */}
            {isVision && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                  <div className="w-4 h-4 text-blue-600 dark:text-blue-400">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Vision-Language Model
                  </span>
                  {hasRequiredMmproj ? (
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">
                      ✓ mmproj available
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs rounded-full">
                      ! mmproj needed
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">{model.description}</p>
            
            {/* Tags */}
            {model.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {model.pipeline_tag && (
                  <span className="px-2 py-0.5 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 text-xs rounded-full font-medium">
                    {model.pipeline_tag}
                  </span>
                )}
                {model.tags.slice(0, 3).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onTagClick?.(tag)}
                    className="px-2 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 text-xs rounded-full hover:bg-purple-200 dark:hover:bg-purple-700/50 transition-colors cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
                {model.tags.length > 3 && (
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full">
                    +{model.tags.length - 3}
                  </span>
                )}
              </div>
            )}
            
            {/* Primary Download - Always Visible */}
            {sortedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="bg-gray-50/80 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{sortedFiles[0].rfilename}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                            {isStandaloneMmprojModel ? 'mmproj' : 'Primary'}
                          </span>
                          {(sortedFiles[0].rfilename.toLowerCase().includes('q4') || sortedFiles[0].rfilename.toLowerCase().includes('4bit')) && (
                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                              Q4
                            </span>
                          )}
                        </div>
                      </div>
                      {sortedFiles[0].size && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(sortedFiles[0].size)}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      {downloading.has(sortedFiles[0].rfilename) ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin"></div>
                          {downloadProgress[sortedFiles[0].rfilename] && (
                            <div className="text-xs text-sakura-600 dark:text-sakura-400">
                              {downloadProgress[sortedFiles[0].rfilename].progress}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => onDownload(model.id, sortedFiles[0].rfilename)}
                            className="px-3 py-1.5 bg-sakura-500 text-white text-sm rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2 font-medium"
                          >
                            <Download className="w-4 h-4" />
                            {isStandaloneMmprojModel ? 'Download mmproj' : 'Download Model'}
                          </button>
                          {hasRequiredMmproj && !isStandaloneMmprojModel && (
                            <button
                              onClick={() => {
                                if (onDownloadWithDependencies) {
                                  onDownloadWithDependencies(model.id, sortedFiles[0].rfilename, model.files);
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 font-medium"
                            >
                              <Download className="w-4 h-4" />
                              + mmproj
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Show mmproj files if available (but not for standalone mmproj models) */}
                {mmprojFiles.length > 0 && !isStandaloneMmprojModel && (
                  <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-2 font-medium">
                      📷 Required projection files for image processing:
                    </div>
                    <div className="space-y-2">
                      {mmprojFiles.map((file) => (
                        <div key={file.rfilename} className="flex items-center justify-between p-2 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/30 dark:border-blue-700/30">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-blue-700 dark:text-blue-300 truncate">{file.rfilename}</div>
                            {file.size && (
                              <div className="text-xs text-blue-500 dark:text-blue-400">
                                {formatFileSize(file.size)}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 ml-2">
                            {downloading.has(file.rfilename) ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                {downloadProgress[file.rfilename] && (
                                  <div className="text-xs text-blue-600 dark:text-blue-400">
                                    {downloadProgress[file.rfilename].progress}%
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => onDownload(model.id, file.rfilename)}
                                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Show More Files Button */}
                {sortedFiles.length > 1 && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full text-left px-3 py-2 text-sm text-sakura-600 dark:text-sakura-400 hover:text-sakura-700 dark:hover:text-sakura-300 transition-colors bg-gray-50/50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex items-center justify-between">
                      <span>{isExpanded ? 'Show Less' : `Show ${sortedFiles.length - 1} More Files`}</span>
                      <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </div>
                    </div>
                  </button>
                )}
                
                {/* Collapsible additional files */}
                {isExpanded && sortedFiles.length > 1 && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {sortedFiles.slice(1).map((file) => (
                      <div key={file.rfilename} className="bg-gray-50/80 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{file.rfilename}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {(file.rfilename.toLowerCase().includes('q4') || file.rfilename.toLowerCase().includes('4bit')) && (
                                  <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                                    Q4
                                  </span>
                                )}
                                {(/q[0-9]|[0-9]bit/i.test(file.rfilename) && !file.rfilename.toLowerCase().includes('q4')) && (
                                  <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs rounded">
                                    Quant
                                  </span>
                                )}
                              </div>
                            </div>
                            {file.size && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatFileSize(file.size)}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {downloading.has(file.rfilename) ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin"></div>
                                {downloadProgress[file.rfilename] && (
                                  <div className="text-xs text-sakura-600 dark:text-sakura-400">
                                    {downloadProgress[file.rfilename].progress}%
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => onDownload(model.id, file.rfilename)}
                                className="px-3 py-1.5 bg-sakura-500 text-white text-sm rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2"
                              >
                                <Download className="w-4 h-4" />
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Model Card Modal */}
      {showModelCard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-sakura-500" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {model.name} - Model Card
                </h3>
              </div>
              <button
                onClick={() => setShowModelCard(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              <div className="prose dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
                  {modelCardContent}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ModelCard; 
