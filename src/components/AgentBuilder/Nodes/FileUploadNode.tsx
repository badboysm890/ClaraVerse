import React, { useState, useCallback, useRef, memo } from 'react';
import { Upload, File, X, Settings, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { NodeProps } from 'reactflow';
import BaseNode from './BaseNode';

interface FileUploadNodeProps extends NodeProps {
  data: {
    label: string;
    outputFormat: 'base64' | 'binary' | 'file' | 'dataurl' | 'text';
    acceptedTypes: string;
    maxSize: number; // in MB
    inputs: any[];
    outputs: any[];
    onUpdate: (updates: any) => void;
    onDelete: () => void;
  };
}

const FileUploadNode = memo<FileUploadNodeProps>((props) => {
  const { data } = props;
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const outputFormat = data.outputFormat || 'base64';
  const acceptedTypes = data.acceptedTypes || '*/*';
  const maxSize = data.maxSize || 10; // Default 10MB

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return `File size exceeds ${maxSize}MB limit`;
    }

    // Check file type if specific types are specified
    if (acceptedTypes !== '*/*') {
      const acceptedTypesArray = acceptedTypes.split(',').map(type => type.trim());
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      const mimeType = file.type;
      
      const isAccepted = acceptedTypesArray.some(type => {
        if (type.startsWith('.')) {
          return fileExtension === type.toLowerCase();
        }
        if (type.includes('*')) {
          const baseType = type.split('/')[0];
          return mimeType.startsWith(baseType);
        }
        return mimeType === type;
      });

      if (!isAccepted) {
        return `File type not accepted. Accepted types: ${acceptedTypes}`;
      }
    }

    return null;
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      let output: any;
      let metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        format: outputFormat
      };

      switch (outputFormat) {
        case 'base64':
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // Remove data URL prefix to get pure base64
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          output = base64;
          break;

        case 'dataurl':
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          output = dataUrl;
          break;

        case 'text':
          const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          output = text;
          break;

        case 'binary':
          const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
          output = Array.from(new Uint8Array(arrayBuffer));
          break;

        case 'file':
        default:
          output = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            // For file format, we'll provide the file reference
            file: file
          };
          break;
      }

      // Update node outputs
      if (data.onUpdate) {
        data.onUpdate({
          data: {
            ...data,
            outputs: {
              content: output,
              metadata: metadata
            }
          }
        });
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploadedFile(file);
    await processFile(file);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileSelect(files[0]);
    }
  }, []);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileSelect(files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setError(null);
    if (data.onUpdate) {
      data.onUpdate({
        data: {
          ...data,
          outputs: {
            content: null,
            metadata: null
          }
        }
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getOutputFormatDescription = (format: string): string => {
    switch (format) {
      case 'base64': return 'Pure base64 encoded string';
      case 'dataurl': return 'Data URL with MIME type prefix';
      case 'text': return 'Plain text content (for text files)';
      case 'binary': return 'Array of bytes (Uint8Array)';
      case 'file': return 'File object with metadata';
      default: return 'File content';
    }
  };

  return (
    <BaseNode
      {...props}
      title={data.label || 'File Upload'}
      category="input"
      icon={<Upload className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        {/* Configuration Toggle */}
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            File Upload Settings
          </label>
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Toggle configuration"
          >
            <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Configuration Panel */}
        {isConfigOpen && (
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border">
            {/* Output Format */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Output Format
              </label>
              <select
                value={outputFormat}
                onChange={(e) => data.onUpdate({ data: { ...data, outputFormat: e.target.value } })}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="base64">Base64 String</option>
                <option value="dataurl">Data URL</option>
                <option value="text">Text Content</option>
                <option value="binary">Binary Array</option>
                <option value="file">File Object</option>
              </select>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getOutputFormatDescription(outputFormat)}
              </div>
            </div>

            {/* Accepted File Types */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Accepted File Types
              </label>
              <input
                type="text"
                value={acceptedTypes}
                onChange={(e) => data.onUpdate({ data: { ...data, acceptedTypes: e.target.value } })}
                placeholder="*/* or image/*,.pdf,.txt"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Max File Size */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max File Size (MB)
              </label>
              <input
                type="number"
                value={maxSize}
                onChange={(e) => data.onUpdate({ data: { ...data, maxSize: parseInt(e.target.value) || 10 } })}
                min="1"
                max="100"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            File Upload
          </label>
          
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            onChange={handleFileInputChange}
            className="hidden"
          />
          
          {!uploadedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
            >
              <Upload className={`w-6 h-6 mx-auto mb-2 ${
                isDragging ? 'text-blue-500' : 'text-gray-400'
              }`} />
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {acceptedTypes === '*/*' ? 'Any file type' : acceptedTypes} • Max {maxSize}MB
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* File Preview */}
              <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <File className="w-6 h-6 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                    {uploadedFile.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(uploadedFile.size)} • {uploadedFile.type || 'Unknown type'}
                  </div>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  title="Remove file"
                >
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              </div>

              {/* Processing Status */}
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Processing file...
                </div>
              )}

              {/* Output Info */}
              {!isProcessing && (
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-xs text-green-800 dark:text-green-200">
                    <Info className="w-3 h-3" />
                    File processed as {outputFormat}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <div className="text-xs text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}
        </div>

        {/* Status Display */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Output: {outputFormat} • Max: {maxSize}MB
        </div>
      </div>
    </BaseNode>
  );
});

FileUploadNode.displayName = 'FileUploadNode';

export default FileUploadNode; 
