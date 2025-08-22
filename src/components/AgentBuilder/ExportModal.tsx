import React, { useState } from 'react';
import { X, Download, Zap, FileText, Code, Sparkles, Info, ExternalLink, Copy, Check } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: string) => Promise<void>;
  currentFlow: any;
  hasCustomNodes: boolean;
}

type ExportFormat = 'angela-native' | 'angela-sdk' | 'sdk-code';

interface ExportOption {
  id: ExportFormat;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  features: string[];
  useCase: string;
  fileExtension: string;
  color: string;
  gradient: string;
  recommended?: boolean;
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  currentFlow,
  hasCustomNodes
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('angela-sdk');
  const [isExporting, setIsExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const exportOptions: ExportOption[] = [
    {
      id: 'angela-native',
      name: 'Standard JSON',
      description: 'Classic angela Agent Studio format for sharing and backup',
      icon: <FileText className="w-5 h-5" />,
      features: [
        'Compatible with all angela versions',
        'Lightweight file size',
        'Easy to share and backup',
        'Standard JSON format'
      ],
      useCase: 'Best for sharing flows between angela installations',
      fileExtension: '.json',
      color: 'blue',
      gradient: 'from-blue-500 to-blue-600'
    },
    {
      id: 'angela-sdk',
      name: 'SDK Enhanced',
      description: 'JSON format with embedded custom nodes for SDK execution',
      icon: <Download className="w-5 h-5" />,
      badge: 'ENHANCED',
      features: [
        'Includes custom node definitions',
        'Self-contained execution',
        'SDK compatible',
        'Preserves all functionality'
      ],
      useCase: 'Perfect for running flows with the angela SDK',
      fileExtension: '.json',
      color: 'green',
      gradient: 'from-green-500 to-green-600',
      recommended: hasCustomNodes
    },
    {
      id: 'sdk-code',
      name: 'JavaScript Code',
      description: 'Ready-to-use JavaScript module for direct integration',
      icon: <Code className="w-5 h-5" />,
      badge: 'NEW',
      features: [
        'Complete JavaScript class',
        'Zero configuration needed',
        'TypeScript friendly',
        'Production ready'
      ],
      useCase: 'Ideal for embedding in web applications and servers',
      fileExtension: '.js',
      color: 'purple',
      gradient: 'from-purple-500 to-indigo-500'
    }
  ];

  const selectedOption = exportOptions.find(opt => opt.id === selectedFormat)!;

  const handleExport = async () => {
    if (!currentFlow) return;

    setIsExporting(true);
    try {
      await onExport(selectedFormat);
      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyInstallCommand = () => {
    if (selectedFormat === 'sdk-code') {
      navigator.clipboard.writeText('npm install angela-flow-sdk');
    }
  };

  const generatePreviewFilename = () => {
    if (!currentFlow) return `flow${selectedOption.fileExtension}`;
    const safeName = currentFlow.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${safeName}${selectedOption.fileExtension}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-xl flex items-center justify-center shadow-md">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Export Flow
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose your export format and options
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex h-[600px]">
          {/* Export Options */}
          <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Select Export Format
            </h3>
            
            <div className="space-y-3">
              {exportOptions.map((option) => (
                <div
                  key={option.id}
                  className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    selectedFormat === option.id
                      ? `border-${option.color}-300 dark:border-${option.color}-600 bg-${option.color}-50 dark:bg-${option.color}-900/20`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                  onClick={() => setSelectedFormat(option.id)}
                >
                  {/* Recommended badge */}
                  {option.recommended && (
                    <div className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      RECOMMENDED
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className={`p-2 bg-gradient-to-r ${option.gradient} rounded-lg text-white flex-shrink-0`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {option.name}
                        </h4>
                        {option.badge && (
                          <span className={`px-2 py-0.5 bg-gradient-to-r ${option.gradient} text-white text-xs font-medium rounded-full`}>
                            {option.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {option.description}
                      </p>
                      <div className="space-y-1">
                        {option.features.map((feature, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <div className={`w-1.5 h-1.5 bg-${option.color}-500 rounded-full`}></div>
                            {feature}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Nodes Warning */}
            {hasCustomNodes && selectedFormat === 'angela-native' && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="text-amber-800 dark:text-amber-200 font-medium">
                      Custom Nodes Detected
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 mt-1">
                      Standard JSON format won't include custom node execution code. 
                      Consider using "SDK Enhanced" format instead.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview & Details */}
          <div className="w-1/2 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Export Details
            </h3>

            {/* Selected Format Info */}
            <div className={`p-4 bg-gradient-to-br ${selectedOption.gradient} rounded-xl text-white mb-6`}>
              <div className="flex items-center gap-3 mb-3">
                {selectedOption.icon}
                <div>
                  <h4 className="font-semibold">{selectedOption.name}</h4>
                  <p className="text-sm opacity-90">{selectedOption.useCase}</p>
                </div>
              </div>
              
              <div className="bg-white/20 rounded-lg p-3">
                <div className="text-sm font-medium mb-1">Output File:</div>
                <div className="font-mono text-sm bg-black/20 px-2 py-1 rounded">
                  {generatePreviewFilename()}
                </div>
              </div>
            </div>

            {/* Flow Information */}
            {currentFlow && (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-6">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Flow Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Name:</span>
                    <span className="text-gray-900 dark:text-white font-medium">{currentFlow.name}</span>
                  </div>
                  {currentFlow.description && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Description:</span>
                      <span className="text-gray-900 dark:text-white text-right max-w-48 truncate">
                        {currentFlow.description}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Nodes:</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {/* We'd need to pass node count as prop */}
                      {currentFlow.nodeCount || 'Multiple'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Custom Nodes:</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {hasCustomNodes ? 'Yes' : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Format-specific instructions */}
            {selectedFormat === 'sdk-code' && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-6">
                <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Setup Instructions
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-purple-800 dark:text-purple-200 mb-2">
                      1. Install the angela Flow SDK:
                    </p>
                    <div className="flex items-center gap-2 bg-gray-900 dark:bg-black rounded p-2 font-mono text-green-400">
                      <span className="flex-1">npm install angela-flow-sdk</span>
                      <button
                        onClick={handleCopyInstallCommand}
                        className="p-1 hover:bg-gray-800 rounded transition-colors"
                        title="Copy command"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-purple-800 dark:text-purple-200">
                      2. Import and use the generated flow in your application
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() => window.open('/settings?tab=sdk-demo', '_blank')}
                      className="flex items-center gap-2 text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View integration examples
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Export Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleExport}
                disabled={!currentFlow || isExporting}
                className={`flex-1 px-4 py-3 bg-gradient-to-r ${selectedOption.gradient} text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg transform hover:-translate-y-0.5`}
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Exporting...
                  </>
                ) : exportSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    Exported!
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export {selectedOption.name}
                  </>
                )}
              </button>
              
              <button
                onClick={onClose}
                className="px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal; 
