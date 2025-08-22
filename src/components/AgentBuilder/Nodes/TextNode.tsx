import React, { useState, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Type } from 'lucide-react';
import BaseNode from './BaseNode';

const TextNode: React.FC<NodeProps> = (props) => {
  const { data } = props;
  const [operation, setOperation] = useState(data.operation || 'uppercase');
  const [customText, setCustomText] = useState(data.customText || '');
  const [separator, setSeparator] = useState(data.separator || ', ');

  const handleOperationChange = useCallback((newOperation: string) => {
    setOperation(newOperation);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, operation: newOperation } });
    }
  }, [data]);

  const handleCustomTextChange = useCallback((newText: string) => {
    setCustomText(newText);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, customText: newText } });
    }
  }, [data]);

  const handleSeparatorChange = useCallback((newSeparator: string) => {
    setSeparator(newSeparator);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, separator: newSeparator } });
    }
  }, [data]);

  // Preview the operation
  const getPreview = () => {
    const sampleInput = data.inputValue || 'sample text';
    
    switch (operation) {
      case 'uppercase':
        return String(sampleInput).toUpperCase();
      case 'lowercase':
        return String(sampleInput).toLowerCase();
      case 'capitalize':
        return String(sampleInput).replace(/\b\w/g, char => char.toUpperCase());
      case 'reverse':
        return String(sampleInput).split('').reverse().join('');
      case 'length':
        return String(sampleInput).length.toString();
      case 'trim':
        return String(sampleInput).trim();
      case 'append':
        return String(sampleInput) + customText;
      case 'prepend':
        return customText + String(sampleInput);
      case 'replace':
        return String(sampleInput).replace(/\s+/g, separator);
      case 'split':
        return String(sampleInput).split(separator);
      default:
        return sampleInput;
    }
  };

  return (
    <BaseNode
      {...props}
      title="Text"
      category="text"
      icon={<Type />}
      inputs={data.inputs || []}
      outputs={data.outputs || []}
    >
      <div className="space-y-2">
        {/* Operation Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Operation
          </label>
          <select
            value={operation}
            onChange={(e) => handleOperationChange(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="uppercase">Uppercase</option>
            <option value="lowercase">Lowercase</option>
            <option value="capitalize">Capitalize</option>
            <option value="reverse">Reverse</option>
            <option value="length">Get Length</option>
            <option value="trim">Trim Whitespace</option>
            <option value="append">Append Text</option>
            <option value="prepend">Prepend Text</option>
            <option value="replace">Replace Spaces</option>
            <option value="split">Split Text</option>
          </select>
        </div>

        {/* Custom Text Input (for append/prepend operations) */}
        {(operation === 'append' || operation === 'prepend') && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Text to {operation}
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => handleCustomTextChange(e.target.value)}
              placeholder={`Text to ${operation}...`}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {/* Separator Input (for replace/split operations) */}
        {(operation === 'replace' || operation === 'split') && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {operation === 'replace' ? 'Replace with' : 'Split by'}
            </label>
            <input
              type="text"
              value={separator}
              onChange={(e) => handleSeparatorChange(e.target.value)}
              placeholder={operation === 'replace' ? 'Replacement text...' : 'Separator...'}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {/* Preview */}
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Preview:
          </div>
          <div className="text-xs text-gray-800 dark:text-gray-200 break-words">
            {typeof getPreview() === 'object' ? 
              JSON.stringify(getPreview(), null, 2) : 
              String(getPreview())
            }
          </div>
        </div>
      </div>
    </BaseNode>
  );
};

export default TextNode; 
