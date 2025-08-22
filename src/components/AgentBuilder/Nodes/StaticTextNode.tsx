import React, { useState, memo } from 'react';
import { NodeProps } from 'reactflow';
import { FileText, Settings, Type } from 'lucide-react';
import BaseNode from './BaseNode';

const StaticTextNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [text, setText] = useState(data.text || 'Enter your static text here...');
  const [label, setLabel] = useState(data.label || 'Static Text');
  const [textFormat, setTextFormat] = useState(data.textFormat || 'plain');
  const [multiline, setMultiline] = useState(data.multiline !== false);

  const handleTextChange = (newText: string) => {
    setText(newText);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, text: newText } });
    }
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, label: newLabel } });
    }
  };

  const handleFormatChange = (newFormat: string) => {
    setTextFormat(newFormat);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, textFormat: newFormat } });
    }
  };

  const handleMultilineChange = (newMultiline: boolean) => {
    setMultiline(newMultiline);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, multiline: newMultiline } });
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'template': return '🔧';
      case 'json': return '{}';
      case 'markdown': return 'MD';
      default: return 'T';
    }
  };

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'template': return 'text-purple-600 dark:text-purple-400';
      case 'json': return 'text-green-600 dark:text-green-400';
      case 'markdown': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <BaseNode
      {...props}
      title={label}
      category="data"
      icon={<FileText className="w-4 h-4" />}
      inputs={data.inputs || []}
      outputs={data.outputs || [
        {
          id: 'text',
          name: 'Text Output',
          type: 'output',
          dataType: 'string'
        }
      ]}
    >
      <div className="space-y-3">
        {/* Node Label */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Node Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded glassmorphic-card focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Static Text"
          />
        </div>

        {/* Text Format */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Format
          </label>
          <div className="flex gap-1">
            <select
              value={textFormat}
              onChange={(e) => handleFormatChange(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded glassmorphic-card focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
            >
              <option value="plain">Plain Text</option>
              <option value="template">Template</option>
              <option value="json">JSON String</option>
              <option value="markdown">Markdown</option>
            </select>
            <div className={`px-2 py-1 text-xs rounded glassmorphic-card ${getFormatColor(textFormat)} flex items-center`}>
              {getFormatIcon(textFormat)}
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Static Text Content
          </label>
          {multiline ? (
            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={4}
              className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded glassmorphic-card focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter your static text here..."
            />
          ) : (
            <input
              type="text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded glassmorphic-card focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter your static text here..."
            />
          )}
        </div>

        {/* Options */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={multiline}
              onChange={(e) => handleMultilineChange(e.target.checked)}
              className="w-3 h-3 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500"
            />
            Multiline
          </label>
          
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {text.length} chars
          </div>
        </div>

        {/* Preview */}
        {text && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-xs">
            <div className="text-gray-500 dark:text-gray-400 mb-1 font-medium">Preview:</div>
            <div className="text-gray-700 dark:text-gray-300 font-mono max-h-16 overflow-y-auto break-words bg-white dark:bg-gray-900 p-1 rounded border border-gray-100 dark:border-gray-700">
              {text.substring(0, 100)}{text.length > 100 ? '...' : ''}
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
});

StaticTextNode.displayName = 'StaticTextNode';

export default StaticTextNode; 
