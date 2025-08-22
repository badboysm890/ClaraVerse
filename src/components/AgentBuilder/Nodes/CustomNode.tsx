import React, { memo, useState, useEffect } from 'react';
import { NodeProps } from 'reactflow';
import { Settings } from 'lucide-react';
import BaseNode from './BaseNode';
import { CustomNodeDefinition } from '../../../types/agent/types';
import { customNodeManager } from '../NodeCreator/CustomNodeManager';

interface CustomNodeProps extends NodeProps {
  nodeDefinition: CustomNodeDefinition;
}

const CustomNode = memo<CustomNodeProps>(({ nodeDefinition, ...props }) => {
  const { data } = props;
  const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Initialize property values
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    nodeDefinition.properties.forEach(prop => {
      initialValues[prop.id] = data.properties?.[prop.id] ?? prop.defaultValue ?? '';
    });
    setPropertyValues(initialValues);
  }, [nodeDefinition.properties, data.properties]);

  const handlePropertyChange = (propertyId: string, value: any) => {
    const newValues = { ...propertyValues, [propertyId]: value };
    setPropertyValues(newValues);
    
    if (data.onUpdate) {
      data.onUpdate({ 
        data: { 
          ...data, 
          properties: newValues 
        } 
      });
    }
  };

  const renderPropertyInput = (property: any) => {
    const value = propertyValues[property.id] ?? '';

    switch (property.type) {
      case 'string':
      case 'number':
        return (
          <input
            type={property.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => handlePropertyChange(property.id, 
              property.type === 'number' ? Number(e.target.value) : e.target.value
            )}
            placeholder={property.description || `Enter ${property.name.toLowerCase()}...`}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        );
      
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handlePropertyChange(property.id, e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{value ? 'True' : 'False'}</span>
          </label>
        );
      
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => handlePropertyChange(property.id, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="">Select {property.name.toLowerCase()}...</option>
            {property.options?.map((option: string) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handlePropertyChange(property.id, e.target.value)}
            placeholder={property.description || `Enter ${property.name.toLowerCase()}...`}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
          />
        );
      
      case 'json':
        return (
          <textarea
            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handlePropertyChange(property.id, parsed);
              } catch {
                handlePropertyChange(property.id, e.target.value);
              }
            }}
            placeholder={`{\n  "key": "value"\n}`}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono resize-none"
          />
        );
      
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value || '#000000'}
              onChange={(e) => handlePropertyChange(property.id, e.target.value)}
              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
            />
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handlePropertyChange(property.id, e.target.value)}
              placeholder="#000000"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        );
      
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handlePropertyChange(property.id, e.target.value)}
            placeholder={property.description || `Enter ${property.name.toLowerCase()}...`}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        );
    }
  };

  const getCategoryColor = (category: string) => {
    if (category === 'custom') {
      return 'bg-gradient-to-r from-purple-500 to-indigo-500';
    }
    
    switch (category.toLowerCase()) {
      case 'basic':
      case 'input': return 'bg-green-500';
      case 'output': return 'bg-red-500';
      case 'data': return 'bg-blue-500';
      case 'logic': return 'bg-purple-500';
      case 'ai': return 'bg-gradient-to-r from-sakura-500 to-pink-500';
      case 'media': return 'bg-pink-500';
      case 'text': return 'bg-blue-500';
      case 'math': return 'bg-purple-500';
      default: return 'bg-gradient-to-r from-purple-500 to-indigo-500';
    }
  };

  return (
    <BaseNode
      {...props}
      title={nodeDefinition.name}
      category={nodeDefinition.category}
      icon={
        <div className="flex items-center gap-2">
          <span className="text-base">{nodeDefinition.icon}</span>
          <div className="text-xs px-2 py-0.5 bg-white/20 rounded-full font-medium">
            CUSTOM
          </div>
        </div>
      }
      inputs={nodeDefinition.inputs}
      outputs={nodeDefinition.outputs}
    >
      <div className="space-y-4">
        {/* Node Description */}
        {nodeDefinition.description && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-blue-500 dark:text-blue-400 text-sm">ℹ️</div>
              <div className="text-xs text-blue-800 dark:text-blue-200">
                {nodeDefinition.description}
              </div>
            </div>
          </div>
        )}

        {/* Configuration Properties */}
        {nodeDefinition.properties.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Configuration
              </div>
              <button
                onClick={() => setIsConfiguring(!isConfiguring)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
                title="Toggle configuration"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>
            
            {(isConfiguring || nodeDefinition.properties.length <= 3) && (
              <div className="space-y-3">
                {nodeDefinition.properties.map((property) => (
                  <div key={property.id} className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      {property.name}
                      {property.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderPropertyInput(property)}
                    {property.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {property.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {!isConfiguring && nodeDefinition.properties.length > 3 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                {nodeDefinition.properties.length} configuration options available
              </div>
            )}
          </div>
        )}

        {/* Custom Node Info */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
              Custom Node
            </span>
          </div>
          
          <div className="flex items-center gap-3 text-xs text-purple-700 dark:text-purple-300">
            {nodeDefinition.version && (
              <span>v{nodeDefinition.version}</span>
            )}
            {nodeDefinition.customMetadata.createdBy && (
              <span>by {nodeDefinition.customMetadata.createdBy}</span>
            )}
          </div>
        </div>

        {/* Tags */}
        {nodeDefinition.metadata?.tags && nodeDefinition.metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {nodeDefinition.metadata.tags.slice(0, 4).map((tag, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-600"
              >
                {tag}
              </span>
            ))}
            {nodeDefinition.metadata.tags.length > 4 && (
              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-600">
                +{nodeDefinition.metadata.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Output Labels */}
        {nodeDefinition.outputs && nodeDefinition.outputs.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            {nodeDefinition.outputs.map((output, index) => (
              <div
                key={output.id}
                className="text-xs text-gray-700 dark:text-gray-300 mb-1 text-right flex items-center justify-end gap-1"
                style={{ marginTop: index === 0 ? 0 : '8px' }}
              >
                <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
                <span className="font-medium">{output.name}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">({output.dataType})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

CustomNode.displayName = 'CustomNode';

export default CustomNode; 
