import React, { memo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { Download, Type, Hash, Braces } from 'lucide-react';
import BaseNode from './BaseNode';

const InputNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [value, setValue] = useState(data.value || '');
  const [inputType, setInputType] = useState(data.inputType || 'text');
  const [label, setLabel] = useState(data.label || 'Input');

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, value: newValue } });
    }
  };

  const handleTypeChange = (newType: string) => {
    setInputType(newType);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, inputType: newType } });
    }
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, label: newLabel } });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="w-3 h-3" />;
      case 'number': return <Hash className="w-3 h-3" />;
      case 'json': return <Braces className="w-3 h-3" />;
      default: return <Type className="w-3 h-3" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'text': return 'text-blue-600 dark:text-blue-400';
      case 'number': return 'text-purple-600 dark:text-purple-400';
      case 'json': return 'text-green-600 dark:text-green-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const validateValue = () => {
    if (!value) return { isValid: true, message: '' };
    
    switch (inputType) {
      case 'number':
        const num = Number(value);
        return {
          isValid: !isNaN(num),
          message: isNaN(num) ? 'Invalid number format' : ''
        };
      case 'json':
        try {
          JSON.parse(value);
          return { isValid: true, message: 'Valid JSON' };
        } catch {
          return { isValid: false, message: 'Invalid JSON format' };
        }
      default:
        return { isValid: true, message: `${value.length} characters` };
    }
  };

  const validation = validateValue();

  return (
    <BaseNode
      {...props}
      title="Input"
      category="basic"
      icon={<Download className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-4">
        {/* Input Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Input Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { type: 'text', icon: '📝', label: 'Text' },
              { type: 'number', icon: '🔢', label: 'Number' },
              { type: 'json', icon: '📋', label: 'JSON' }
            ].map((option) => (
              <button
                key={option.type}
                onClick={() => handleTypeChange(option.type)}
                className={`p-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                  inputType === option.type
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-500 text-gray-600 dark:text-gray-400'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">{option.icon}</span>
                  <span className="text-xs">{option.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Input Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter input label..."
            className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Value Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {inputType === 'text' ? 'Text Value' : inputType === 'number' ? 'Number Value' : 'JSON Value'}
          </label>
          {inputType === 'json' ? (
            <textarea
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder={`{\n  "key": "value"\n}`}
              rows={4}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all font-mono resize-none"
            />
          ) : (
            <input
              type={inputType === 'number' ? 'number' : 'text'}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder={`Enter ${inputType}...`}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            />
          )}
        </div>

        {/* Validation & Status */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2.5">
            <div className={`w-3 h-3 rounded-full ${
              value ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              {value ? '✓ Value Set' : '⚠ No Value'}
            </span>
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full font-medium">
            {inputType.toUpperCase()}
          </div>
        </div>

        {/* Examples/Hints */}
        {inputType === 'json' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <div className="text-blue-500 text-sm">💡</div>
              <div>
                <div className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                  JSON Examples:
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300 space-y-1 font-mono">
                  <div>{`{ "name": "John", "age": 30 }`}</div>
                  <div>{`["item1", "item2", "item3"]`}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Output Labels */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            {data.outputs.map((output: any, index: number) => (
              <div
                key={output.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right flex items-center justify-end gap-1"
                style={{ marginTop: index === 0 ? 0 : '8px' }}
              >
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
          <strong>💡 Tip:</strong> Input nodes provide initial data to start your workflow
        </div>
      </div>
    </BaseNode>
  );
});

InputNode.displayName = 'InputNode';

export default InputNode; 
