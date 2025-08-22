import React, { memo, useState, useEffect } from 'react';
import { NodeProps } from 'reactflow';
import { Upload, Copy, Download, Eye, Code, FileText, Zap } from 'lucide-react';
import BaseNode from './BaseNode';

const OutputNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [outputLabel, setOutputLabel] = useState(data.outputLabel || 'Result');
  const [format, setFormat] = useState(data.format || 'auto');
  const inputValue = data.inputValue;

  // Sync local state with props when they change
  useEffect(() => {
    if (data.outputLabel !== undefined) {
      setOutputLabel(data.outputLabel);
    }
  }, [data.outputLabel]);

  useEffect(() => {
    if (data.format !== undefined) {
      setFormat(data.format);
    }
  }, [data.format]);

  // Debug logging for inputValue changes
  useEffect(() => {
    console.log(`OutputNode ${props.id} inputValue changed:`, inputValue);
  }, [inputValue, props.id]);

  const handleLabelChange = (value: string) => {
    setOutputLabel(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, outputLabel: value } });
    }
  };

  const handleFormatChange = (value: string) => {
    setFormat(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, format: value } });
    }
  };

  const formatValue = (value: any, formatType: string) => {
    if (value === null || value === undefined) return 'No data received';
    
    switch (formatType) {
      case 'json':
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      case 'text':
        return String(value);
      case 'raw':
        return value;
      default: // auto
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        }
        return String(value);
    }
  };

  const getValueType = (value: any) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const getValueSize = (value: any) => {
    if (value === null || value === undefined) return '0 B';
    const str = String(value);
    const bytes = new Blob([str]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFormatIcon = (formatType: string) => {
    switch (formatType) {
      case 'json': return <Code className="w-3 h-3" />;
      case 'text': return <FileText className="w-3 h-3" />;
      case 'raw': return <Zap className="w-3 h-3" />;
      default: return <Eye className="w-3 h-3" />;
    }
  };

  const copyToClipboard = async () => {
    if (inputValue === null || inputValue === undefined) return;
    
    try {
      const formattedValue = formatValue(inputValue, format);
      await navigator.clipboard.writeText(formattedValue);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const downloadFile = () => {
    if (inputValue === null || inputValue === undefined) return;
    
    try {
      const formattedValue = formatValue(inputValue, format);
      const fileExtension = format === 'json' ? 'json' : 'txt';
      const fileName = `${outputLabel.toLowerCase().replace(/\s+/g, '_') || 'output'}.${fileExtension}`;
      
      const blob = new Blob([formattedValue], { 
        type: format === 'json' ? 'application/json' : 'text/plain' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const hasValue = inputValue !== null && inputValue !== undefined;
  const formattedValue = hasValue ? formatValue(inputValue, format) : '';

  return (
    <BaseNode
      {...props}
      title="Output"
      category="basic"
      icon={<Upload className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-4">
        {/* Output Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Output Label
          </label>
          <input
            type="text"
            value={outputLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter output name..."
            className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Output Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'auto', icon: '🔄', label: 'Auto' },
              { value: 'text', icon: '📝', label: 'Text' },
              { value: 'json', icon: '📋', label: 'JSON' },
              { value: 'raw', icon: '🔧', label: 'Raw' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleFormatChange(option.value)}
                className={`p-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                  format === option.value
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500 text-gray-600 dark:text-gray-400'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>{option.icon}</span>
                  <span className="text-xs">{option.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Format Description */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Format:</strong> {format === 'auto' ? 'Auto-detect format' : 
              format === 'text' ? 'Plain text output' : 
              format === 'json' ? 'JSON formatted output' : 
              'Raw unformatted output'}
          </div>
        </div>

        {/* Preview Section */}
        {hasValue && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Output Preview
            </label>
            <div className="p-3 bg-gray-100/80 dark:bg-gray-800/80 border border-gray-300/70 dark:border-gray-600/70 rounded-lg">
              <div className="text-sm text-gray-800 dark:text-gray-200 font-mono max-h-32 overflow-y-auto">
                {formattedValue}
              </div>
            </div>
          </div>
        )}

        {/* Status Display */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2.5">
            <div className={`w-3 h-3 rounded-full ${
              hasValue ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm font-medium text-red-800 dark:text-red-200">
              {hasValue ? '📤 Ready to Output' : '⏳ Waiting for Input'}
            </span>
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full font-medium">
            {format.toUpperCase()}
          </div>
        </div>

        {/* Copy & Export Actions */}
        {hasValue && (
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => navigator.clipboard?.writeText(formattedValue)}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors text-sm font-medium"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
            <button 
              className="flex items-center justify-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <strong>💡 Tip:</strong> Output nodes display final results and can format data automatically
        </div>
      </div>
    </BaseNode>
  );
});

OutputNode.displayName = 'OutputNode';

export default OutputNode; 
