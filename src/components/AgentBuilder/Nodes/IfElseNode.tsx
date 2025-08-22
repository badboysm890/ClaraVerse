import React, { memo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import BaseNode from './BaseNode';

const IfElseNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [expression, setExpression] = useState(data.expression || 'input > 0');
  const [trueValue, setTrueValue] = useState(data.trueValue || '');
  const [falseValue, setFalseValue] = useState(data.falseValue || '');

  const handleExpressionChange = (value: string) => {
    setExpression(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, expression: value } });
    }
  };

  const handleTrueValueChange = (value: string) => {
    setTrueValue(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, trueValue: value } });
    }
  };

  const handleFalseValueChange = (value: string) => {
    setFalseValue(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, falseValue: value } });
    }
  };

  return (
    <BaseNode
      {...props}
      title="If/Else"
      category="logic"
      icon={<GitBranch className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Condition
          </label>
          <textarea
            value={expression}
            onChange={(e) => handleExpressionChange(e.target.value)}
            placeholder="input > 0"
            rows={2}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none font-mono"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            JavaScript expression using "input" variable
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              True Value
            </label>
            <input
              type="text"
              value={trueValue}
              onChange={(e) => handleTrueValueChange(e.target.value)}
              placeholder="(pass input)"
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              False Value
            </label>
            <input
              type="text"
              value={falseValue}
              onChange={(e) => handleFalseValueChange(e.target.value)}
              placeholder="(pass input)"
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
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
                <div className={`w-2 h-2 rounded-full ${output.id === 'true' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
          <strong>Examples:</strong><br/>
          • input {'>'}  10<br/>
          • input.includes("hello")<br/>
          • input.length {'>'} 0
        </div>
      </div>
    </BaseNode>
  );
});

IfElseNode.displayName = 'IfElseNode';

export default IfElseNode; 
