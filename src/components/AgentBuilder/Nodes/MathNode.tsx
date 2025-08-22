import React, { useState, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Calculator } from 'lucide-react';
import BaseNode from './BaseNode';

const MathNode: React.FC<NodeProps> = (props) => {
  const { data } = props;
  const [operation, setOperation] = useState(data.operation || 'add');
  const [constantValue, setConstantValue] = useState(data.constantValue || 0);
  const [precision, setPrecision] = useState(data.precision || 2);

  const handleOperationChange = useCallback((newOperation: string) => {
    setOperation(newOperation);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, operation: newOperation } });
    }
  }, [data]);

  const handleConstantValueChange = useCallback((newValue: number) => {
    setConstantValue(newValue);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, constantValue: newValue } });
    }
  }, [data]);

  const handlePrecisionChange = useCallback((newPrecision: number) => {
    setPrecision(newPrecision);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, precision: newPrecision } });
    }
  }, [data]);

  // Preview the operation
  const getPreview = () => {
    const inputA = Number(data.inputValueA) || 5;
    const inputB = Number(data.inputValueB) || constantValue;
    
    let result: number;
    
    switch (operation) {
      case 'add':
        result = inputA + inputB;
        break;
      case 'subtract':
        result = inputA - inputB;
        break;
      case 'multiply':
        result = inputA * inputB;
        break;
      case 'divide':
        result = inputB !== 0 ? inputA / inputB : NaN;
        break;
      case 'power':
        result = Math.pow(inputA, inputB);
        break;
      case 'modulo':
        result = inputA % inputB;
        break;
      case 'sqrt':
        result = Math.sqrt(inputA);
        break;
      case 'abs':
        result = Math.abs(inputA);
        break;
      case 'round':
        result = Math.round(inputA);
        break;
      case 'ceil':
        result = Math.ceil(inputA);
        break;
      case 'floor':
        result = Math.floor(inputA);
        break;
      case 'min':
        result = Math.min(inputA, inputB);
        break;
      case 'max':
        result = Math.max(inputA, inputB);
        break;
      default:
        result = inputA;
    }
    
    return isNaN(result) ? 'Error' : Number(result.toFixed(precision));
  };

  const needsSecondInput = ['add', 'subtract', 'multiply', 'divide', 'power', 'modulo', 'min', 'max'].includes(operation);
  const needsConstant = needsSecondInput && !data.inputValueB;

  return (
    <BaseNode
      {...props}
      title="Math"
      category="math"
      icon={<Calculator />}
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
            <optgroup label="Basic Math">
              <option value="add">Add (+)</option>
              <option value="subtract">Subtract (-)</option>
              <option value="multiply">Multiply (×)</option>
              <option value="divide">Divide (÷)</option>
              <option value="power">Power (^)</option>
              <option value="modulo">Modulo (%)</option>
            </optgroup>
            <optgroup label="Single Input">
              <option value="sqrt">Square Root</option>
              <option value="abs">Absolute Value</option>
              <option value="round">Round</option>
              <option value="ceil">Ceiling</option>
              <option value="floor">Floor</option>
            </optgroup>
            <optgroup label="Comparison">
              <option value="min">Minimum</option>
              <option value="max">Maximum</option>
            </optgroup>
          </select>
        </div>

        {/* Constant Value (when second input is not connected) */}
        {needsConstant && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {operation === 'add' ? 'Add' : 
               operation === 'subtract' ? 'Subtract' :
               operation === 'multiply' ? 'Multiply by' :
               operation === 'divide' ? 'Divide by' :
               operation === 'power' ? 'Raise to power' :
               operation === 'modulo' ? 'Modulo' :
               'Second value'}
            </label>
            <input
              type="number"
              value={constantValue}
              onChange={(e) => handleConstantValueChange(Number(e.target.value))}
              step="any"
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {/* Precision Control */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Decimal Places
          </label>
          <input
            type="number"
            value={precision}
            onChange={(e) => handlePrecisionChange(Math.max(0, Math.min(10, Number(e.target.value))))}
            min="0"
            max="10"
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Preview */}
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Preview:
          </div>
          <div className="text-xs text-gray-800 dark:text-gray-200">
            <div className="font-mono">
              {data.inputValueA || 5} {
                operation === 'add' ? '+' :
                operation === 'subtract' ? '-' :
                operation === 'multiply' ? '×' :
                operation === 'divide' ? '÷' :
                operation === 'power' ? '^' :
                operation === 'modulo' ? '%' :
                operation === 'min' ? 'min' :
                operation === 'max' ? 'max' :
                ''
              } {needsSecondInput ? (data.inputValueB || constantValue) : ''} = <strong>{getPreview()}</strong>
            </div>
          </div>
        </div>
      </div>
    </BaseNode>
  );
};

export default MathNode; 
