import React, { memo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { Braces } from 'lucide-react';
import BaseNode from './BaseNode';

const JsonParseNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [extractField, setExtractField] = useState(data.extractField || '');
  const [failOnError, setFailOnError] = useState(data.failOnError || false);

  const handleExtractFieldChange = (value: string) => {
    setExtractField(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, extractField: value } });
    }
  };

  const handleFailOnErrorChange = (value: boolean) => {
    setFailOnError(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, failOnError: value } });
    }
  };

  return (
    <BaseNode
      {...props}
      title="JSON Parser"
      category="data"
      icon={<Braces className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Extract Field (optional)
          </label>
          <input
            type="text"
            value={extractField}
            onChange={(e) => handleExtractFieldChange(e.target.value)}
            placeholder="e.g., user.name"
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use dot notation for nested fields
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`fail-on-error-${props.id}`}
            checked={failOnError}
            onChange={(e) => handleFailOnErrorChange(e.target.checked)}
            className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label 
            htmlFor={`fail-on-error-${props.id}`}
            className="text-xs text-gray-700 dark:text-gray-300"
          >
            Fail on parse error
          </label>
        </div>

        {/* Output Labels */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            {data.outputs.map((output: any, index: number) => (
              <div
                key={output.id}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right"
                style={{ marginTop: index === 0 ? 0 : '8px' }}
              >
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

JsonParseNode.displayName = 'JsonParseNode';

export default JsonParseNode; 
