import React, { memo, useState, useRef } from 'react';
import { NodeProps } from 'reactflow';
import { Image, Upload, FileImage } from 'lucide-react';
import BaseNode from './BaseNode';

const ImageInputNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [imageFile, setImageFile] = useState(data.imageFile || '');
  const [maxWidth, setMaxWidth] = useState(data.maxWidth || 1024);
  const [maxHeight, setMaxHeight] = useState(data.maxHeight || 1024);
  const [quality, setQuality] = useState(data.quality || 0.8);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (value: string) => {
    setImageFile(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, imageFile: value } });
    }
  };

  const handleMaxWidthChange = (value: number) => {
    setMaxWidth(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, maxWidth: value } });
    }
  };

  const handleMaxHeightChange = (value: number) => {
    setMaxHeight(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, maxHeight: value } });
    }
  };

  const handleQualityChange = (value: number) => {
    setQuality(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, quality: value } });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const base64Data = base64.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      
      setPreview(base64);
      handleImageFileChange(base64Data);
      setUploading(false);
    };
    
    reader.onerror = () => {
      setUploading(false);
    };
    
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearImage = () => {
    setImageFile('');
    setPreview('');
    handleImageFileChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileSizeEstimate = () => {
    if (!imageFile) return '0 KB';
    // Rough estimate: base64 is about 1.33x larger than binary
    const bytes = (imageFile.length * 0.75);
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <BaseNode
      {...props}
      title="Image Input"
      category="media"
      icon={<Image className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        {/* Image Upload Area */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Image Upload
          </label>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <div 
            onClick={handleUploadClick}
            className="w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-400 dark:hover:border-pink-500 transition-colors bg-gray-50 dark:bg-gray-700/50"
          >
            {uploading ? (
              <div className="text-center">
                <div className="animate-spin w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full mx-auto mb-1"></div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Processing...</span>
              </div>
            ) : preview ? (
              <div className="text-center w-full">
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="w-16 h-16 object-cover rounded mx-auto mb-1"
                />
                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Image Ready • {getFileSizeEstimate()}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Click to upload image</span>
              </div>
            )}
          </div>
          
          {imageFile && (
            <button
              onClick={clearImage}
              className="w-full mt-2 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors"
            >
              Clear Image
            </button>
          )}
        </div>

        {/* Processing Options */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Processing Options
          </label>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Max Width
              </label>
              <input
                type="number"
                min="100"
                max="4096"
                value={maxWidth}
                onChange={(e) => handleMaxWidthChange(parseInt(e.target.value))}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Max Height
              </label>
              <input
                type="number"
                min="100"
                max="4096"
                value={maxHeight}
                onChange={(e) => handleMaxHeightChange(parseInt(e.target.value))}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Quality: {(quality * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={quality}
              onChange={(e) => handleQualityChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${imageFile ? 'bg-green-400' : 'bg-gray-400'}`}></div>
          <span className="text-gray-600 dark:text-gray-400">
            {imageFile ? 'Image Ready' : 'No Image'}
          </span>
          {imageFile && (
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 ml-auto">
              <FileImage className="w-3 h-3" />
              <span>Base64</span>
            </div>
          )}
        </div>

        {/* Output Labels */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            {data.outputs.map((output: any, index: number) => (
              <div
                key={output.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right flex items-center justify-end gap-1"
                style={{ marginTop: index === 0 ? 0 : '8px' }}
              >
                <div className={`w-2 h-2 rounded-full ${output.id === 'base64' ? 'bg-pink-400' : 'bg-purple-400'}`}></div>
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-pink-50 dark:bg-pink-900/20 p-2 rounded">
          <strong>💡 Tip:</strong> Connect base64 output to LLM vision models
        </div>
      </div>
    </BaseNode>
  );
});

ImageInputNode.displayName = 'ImageInputNode';

export default ImageInputNode; 
