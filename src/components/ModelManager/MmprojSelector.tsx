import React, { useState, useEffect } from 'react';
import { X, Search, Link, AlertTriangle, CheckCircle } from 'lucide-react';
import ModelMmprojMappingService, { MmprojFile, ModelMmprojMapping } from '../../services/modelMmprojMappingService';

interface MmprojSelectorProps {
  modelPath: string;
  modelName: string;
  currentMapping?: ModelMmprojMapping | null;
  onMappingChange: (mapping: ModelMmprojMapping | null) => void;
  onClose: () => void;
}

const MmprojSelector: React.FC<MmprojSelectorProps> = ({
  modelPath,
  modelName,
  currentMapping,
  onMappingChange,
  onClose
}) => {
  const [availableMmprojFiles, setAvailableMmprojFiles] = useState<MmprojFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMmproj, setSelectedMmproj] = useState<string | null>(
    currentMapping?.mmprojPath || null
  );

  useEffect(() => {
    loadAvailableMmprojFiles();
  }, []);

  const loadAvailableMmprojFiles = async () => {
    try {
      setLoading(true);
      const files = await ModelMmprojMappingService.getAvailableMmprojFiles();
      setAvailableMmprojFiles(files);
    } catch (error) {
      console.error('Error loading mmproj files:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMmprojFiles = availableMmprojFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAssignMmproj = (mmprojFile: MmprojFile) => {
    // Set the mapping in the service
    ModelMmprojMappingService.setMapping(
      modelPath,
      modelName,
      mmprojFile.path,
      mmprojFile.name,
      true // isManual = true
    );

    // Create the mapping object to return
    const newMapping: ModelMmprojMapping = {
      modelPath,
      modelName,
      mmprojPath: mmprojFile.path,
      mmprojName: mmprojFile.name,
      assignedAt: new Date().toISOString(),
      isManual: true
    };

    onMappingChange(newMapping);
    onClose();
  };

  const handleRemoveMapping = () => {
    ModelMmprojMappingService.removeMapping(modelPath);
    onMappingChange(null);
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getCompatibilityStatus = (file: MmprojFile) => {
    if (file.isCompatible === true) {
      return { icon: CheckCircle, color: 'text-green-500', text: 'Compatible' };
    } else if (file.isCompatible === false) {
      return { icon: AlertTriangle, color: 'text-yellow-500', text: 'May be incompatible' };
    } else {
      return { icon: Search, color: 'text-gray-500', text: 'Unknown compatibility' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Select Mmproj for Model
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {modelName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search mmproj files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-sakura-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Current Mapping */}
        {currentMapping && (
          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Currently Assigned Mmproj
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {currentMapping.mmprojName}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {currentMapping.isManual ? 'Manually assigned' : 'Auto-assigned during download'}
                </p>
              </div>
              <button
                onClick={handleRemoveMapping}
                className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 
                         rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Mmproj Files List */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sakura-500"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading mmproj files...</span>
            </div>
          ) : filteredMmprojFiles.length === 0 ? (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {searchTerm ? 'No mmproj files match your search' : 'No mmproj files found'}
              </p>
              {!searchTerm && (
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                  Download models with mmproj support to see files here
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMmprojFiles.map((file) => {
                const isSelected = selectedMmproj === file.path;
                const isCurrentMapping = currentMapping?.mmprojPath === file.path;
                const compatibility = getCompatibilityStatus(file);
                const CompatibilityIcon = compatibility.icon;

                return (
                  <div
                    key={file.path}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-sakura-500 bg-sakura-50 dark:bg-sakura-900/20'
                        : isCurrentMapping
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedMmproj(file.path)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {file.name}
                          </h3>
                          {isCurrentMapping && (
                            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 
                                           text-blue-700 dark:text-blue-300 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span>Size: {formatFileSize(file.size)}</span>
                          <span className="capitalize">Source: {file.source}</span>
                          {file.embeddingSize && (
                            <span>Embedding: {file.embeddingSize}D</span>
                          )}
                        </div>

                        {/* Compatibility Status */}
                        <div className="flex items-center gap-2 mt-2">
                          <CompatibilityIcon className={`w-4 h-4 ${compatibility.color}`} />
                          <span className={`text-sm ${compatibility.color}`}>
                            {compatibility.text}
                          </span>
                          {file.compatibilityReason && (
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              ({file.compatibilityReason})
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 font-mono">
                          {file.path}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {selectedMmproj === file.path && !isCurrentMapping && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssignMmproj(file);
                            }}
                            className="px-3 py-1 bg-sakura-500 text-white rounded text-sm 
                                     hover:bg-sakura-600 transition-colors flex items-center gap-1"
                          >
                            <Link className="w-3 h-3" />
                            Assign
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {filteredMmprojFiles.length} mmproj file{filteredMmprojFiles.length !== 1 ? 's' : ''} available
            {filteredMmprojFiles.length > 5 && <span className="ml-2 text-xs">(scroll to see all)</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Cancel
            </button>
            {selectedMmproj && selectedMmproj !== currentMapping?.mmprojPath && (
              <button
                onClick={() => {
                  const selectedFile = filteredMmprojFiles.find(f => f.path === selectedMmproj);
                  if (selectedFile) {
                    handleAssignMmproj(selectedFile);
                  }
                }}
                className="px-4 py-2 bg-sakura-500 text-white rounded hover:bg-sakura-600 transition-colors"
              >
                Assign Selected
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MmprojSelector; 
