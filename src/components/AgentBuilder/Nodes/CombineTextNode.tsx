import React, { useState, memo } from 'react';
import { Type, Settings, Plus, ArrowRight } from 'lucide-react';
import { NodeProps } from 'reactflow';
import BaseNode from './BaseNode';

interface CombineTextNodeProps extends NodeProps {
  data: {
    label: string;
    combineMode: string;
    separator: string;
    addSpaces: boolean;
    inputs: any[];
    outputs: any[];
    onUpdate: (updates: any) => void;
    onDelete: () => void;
  };
}

const CombineTextNode = memo<CombineTextNodeProps>((props) => {
  const { data } = props;
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const combineMode = data.combineMode || 'concat';
  const separator = data.separator || '';
  const addSpaces = data.addSpaces !== undefined ? data.addSpaces : true;

  const handleCombineModeChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, combineMode: value } });
    }
  };

  const handleSeparatorChange = (value: string) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, separator: value } });
    }
  };

  const handleAddSpacesChange = (value: boolean) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, addSpaces: value } });
    }
  };

  const getCombineModeOptions = () => [
    { label: 'Concatenate', value: 'concat', description: 'Join texts together' },
    { label: 'Text1 + Separator + Text2', value: 'separator', description: 'Insert separator between texts' },
    { label: 'Text2 as Prefix', value: 'prefix', description: 'Text2 + Text1' },
    { label: 'Text2 as Suffix', value: 'suffix', description: 'Text1 + Text2' }
  ];

  const getPreviewText = () => {
    const text1 = "Hello world";
    const text2 = "How are you?";
    
    switch (combineMode) {
      case 'concat':
        return addSpaces ? `${text1} ${text2}` : `${text1}${text2}`;
      case 'separator':
        const sep = separator || '|';
        return addSpaces ? `${text1} ${sep} ${text2}` : `${text1}${sep}${text2}`;
      case 'prefix':
        return addSpaces ? `${text2} ${text1}` : `${text2}${text1}`;
      case 'suffix':
        return addSpaces ? `${text1} ${text2}` : `${text1}${text2}`;
      default:
        return `${text1} ${text2}`;
    }
  };

  const getSeparatorPresets = () => [
    { label: 'None', value: '' },
    { label: 'Newline', value: '\\n' },
    { label: 'Comma', value: ',' },
    { label: 'Pipe', value: '|' },
    { label: 'Dash', value: '-' },
    { label: 'Colon', value: ':' },
    { label: 'Custom', value: 'custom' }
  ];

  return (
    <BaseNode
      {...props}
      title={data.label || 'Combine Text'}
      category="data"
      icon={<Type className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        {/* Configuration Toggle */}
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded border">
          <div className="flex items-center gap-2">
            <Plus className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Mode: {getCombineModeOptions().find(opt => opt.value === combineMode)?.label}
            </span>
          </div>
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="p-1 hover:bg-white/50 dark:hover:bg-gray-600/50 rounded transition-colors"
            title="Toggle configuration"
          >
            <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Configuration Panel */}
        {isConfigOpen && (
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border">
            {/* Combine Mode */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Combine Mode
              </label>
              <div className="space-y-2">
                {getCombineModeOptions().map((option) => (
                  <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="combineMode"
                      value={option.value}
                      checked={combineMode === option.value}
                      onChange={(e) => handleCombineModeChange(e.target.value)}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        {option.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {option.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Separator Configuration (only for separator mode) */}
            {combineMode === 'separator' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Separator
                </label>
                <div className="space-y-2">
                  <select
                    value={getSeparatorPresets().find(p => p.value === separator)?.value || 'custom'}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        // Keep current separator for custom
                      } else if (e.target.value === '\\n') {
                        handleSeparatorChange('\n');
                      } else {
                        handleSeparatorChange(e.target.value);
                      }
                    }}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {getSeparatorPresets().map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* Custom separator input */}
                  {!getSeparatorPresets().some(p => p.value === separator) && (
                    <input
                      type="text"
                      value={separator}
                      onChange={(e) => handleSeparatorChange(e.target.value)}
                      placeholder="Enter custom separator..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Add Spaces Option */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSpaces}
                  onChange={(e) => handleAddSpacesChange(e.target.checked)}
                  className="text-blue-600 focus:ring-blue-500 rounded"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Add spaces between texts
                </span>
              </label>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Automatically add spaces for better readability
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Preview
              </label>
              <div className="p-2 bg-white dark:bg-gray-800 rounded border text-xs font-mono">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Result:</div>
                <div className="text-gray-800 dark:text-gray-200">
                  "{getPreviewText()}"
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input Flow Visualization */}
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-blue-700 dark:text-blue-300">Text 1</span>
            </div>
            <ArrowRight className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <div className="px-2 py-1 bg-blue-100 dark:bg-blue-800/50 rounded text-blue-800 dark:text-blue-200 font-medium">
              {getCombineModeOptions().find(opt => opt.value === combineMode)?.label}
            </div>
            <ArrowRight className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-blue-700 dark:text-blue-300">Text 2</span>
            </div>
            <ArrowRight className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-700 dark:text-green-300">Combined</span>
            </div>
          </div>
        </div>

        {/* Status Display */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Mode: {combineMode} • Spaces: {addSpaces ? 'Yes' : 'No'}
          {combineMode === 'separator' && separator && (
            <span> • Sep: "{separator === '\n' ? '\\n' : separator}"</span>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

CombineTextNode.displayName = 'CombineTextNode';

export default CombineTextNode; 
