import React, { useState } from 'react';
import { Download, Upload, Share2, Star, Clock, User, Tag, Search, Filter, X } from 'lucide-react';
import { CustomNodeDefinition } from '../../../types/agent/types';
import { customNodeManager } from './CustomNodeManager';

interface CustomNodeLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeImported: () => void;
}

const SAMPLE_COMMUNITY_NODES: CustomNodeDefinition[] = [
  {
    id: 'community-text-formatter',
    name: 'Text Formatter',
    type: 'text-formatter',
    category: 'text',
    description: 'Format text with various transformations like uppercase, lowercase, title case, etc.',
    icon: '📝',
    version: '1.0.0',
    author: 'Community',
    inputs: [
      { id: 'text', name: 'Text', type: 'input', dataType: 'string', required: true, description: 'Text to format' }
    ],
    outputs: [
      { id: 'formatted', name: 'Formatted Text', type: 'output', dataType: 'string', description: 'Formatted text result' }
    ],
    properties: [
      {
        id: 'format',
        name: 'Format Type',
        type: 'select',
        required: true,
        defaultValue: 'uppercase',
        description: 'Type of formatting to apply',
        options: [
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Title Case', value: 'titlecase' },
          { label: 'Capitalize', value: 'capitalize' }
        ]
      }
    ],
    executionHandler: 'text-formatter-handler',
    executionCode: `async function execute(inputs, properties, context) {
  const text = inputs.text || '';
  const format = properties.format || 'uppercase';
  
  let result;
  switch (format) {
    case 'uppercase':
      result = text.toUpperCase();
      break;
    case 'lowercase':
      result = text.toLowerCase();
      break;
    case 'titlecase':
      result = text.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
      break;
    case 'capitalize':
      result = text.charAt(0).toUpperCase() + text.slice(1);
      break;
    default:
      result = text;
  }
  
  context.log('Formatted text:', result);
  return { formatted: result };
}`,
    customMetadata: {
      isUserCreated: true,
      createdBy: 'Community User',
      createdAt: '2024-01-15T10:00:00Z',
      published: true,
      downloadCount: 156,
      rating: 4.5
    },
    metadata: {
      tags: ['text', 'formatting', 'transform', 'utility'],
      documentation: 'A utility node for formatting text in various ways.',
      examples: ['Convert "hello world" to "HELLO WORLD"']
    }
  },
  {
    id: 'community-math-calculator',
    name: 'Math Calculator',
    type: 'math-calculator',
    category: 'math',
    description: 'Perform basic mathematical operations on two numbers',
    icon: '🧮',
    version: '1.2.0',
    author: 'Community',
    inputs: [
      { id: 'a', name: 'Number A', type: 'input', dataType: 'number', required: true, description: 'First number' },
      { id: 'b', name: 'Number B', type: 'input', dataType: 'number', required: true, description: 'Second number' }
    ],
    outputs: [
      { id: 'result', name: 'Result', type: 'output', dataType: 'number', description: 'Calculation result' }
    ],
    properties: [
      {
        id: 'operation',
        name: 'Operation',
        type: 'select',
        required: true,
        defaultValue: 'add',
        description: 'Mathematical operation to perform',
        options: [
          { label: 'Add (+)', value: 'add' },
          { label: 'Subtract (-)', value: 'subtract' },
          { label: 'Multiply (×)', value: 'multiply' },
          { label: 'Divide (÷)', value: 'divide' },
          { label: 'Power (^)', value: 'power' }
        ]
      }
    ],
    executionHandler: 'math-calculator-handler',
    executionCode: `async function execute(inputs, properties, context) {
  const a = Number(inputs.a) || 0;
  const b = Number(inputs.b) || 0;
  const operation = properties.operation || 'add';
  
  let result;
  switch (operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) {
        throw new Error('Division by zero is not allowed');
      }
      result = a / b;
      break;
    case 'power':
      result = Math.pow(a, b);
      break;
    default:
      throw new Error('Unknown operation: ' + operation);
  }
  
  context.log(\`\${a} \${operation} \${b} = \${result}\`);
  return { result };
}`,
    customMetadata: {
      isUserCreated: true,
      createdBy: 'MathWiz',
      createdAt: '2024-01-10T14:30:00Z',
      published: true,
      downloadCount: 89,
      rating: 4.8
    },
    metadata: {
      tags: ['math', 'calculator', 'arithmetic', 'numbers'],
      documentation: 'Performs basic mathematical operations between two numbers.',
      examples: ['Calculate 5 + 3 = 8', 'Calculate 10 / 2 = 5']
    }
  }
];

const CustomNodeLibrary: React.FC<CustomNodeLibraryProps> = ({ isOpen, onClose, onNodeImported }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('downloads');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const categories = ['all', 'text', 'math', 'data', 'logic', 'ai', 'custom'];
  
  const filteredNodes = SAMPLE_COMMUNITY_NODES.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (node.metadata?.tags || []).some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || node.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'downloads':
        return (b.customMetadata.downloadCount || 0) - (a.customMetadata.downloadCount || 0);
      case 'rating':
        return (b.customMetadata.rating || 0) - (a.customMetadata.rating || 0);
      case 'recent':
        return new Date(b.customMetadata.createdAt).getTime() - new Date(a.customMetadata.createdAt).getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  const handleImportNode = (node: CustomNodeDefinition) => {
    try {
      customNodeManager.registerCustomNode(node);
      setImportSuccess(`Successfully imported "${node.name}"`);
      setImportError(null);
      onNodeImported();
      
      // Clear success message after 3 seconds
      setTimeout(() => setImportSuccess(null), 3000);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import node');
      setImportSuccess(null);
    }
  };

  const handleImportFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = customNodeManager.importCustomNodes(text);
        
        if (result.imported > 0) {
          setImportSuccess(`Successfully imported ${result.imported} node(s)`);
          setImportError(null);
          onNodeImported();
        }
        
        if (result.errors.length > 0) {
          setImportError(`Errors: ${result.errors.join(', ')}`);
        }
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Failed to import nodes');
      }
    };
    input.click();
  };

  const handleExportNodes = () => {
    try {
      const exportData = customNodeManager.exportCustomNodes();
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom-nodes-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportError('Failed to export nodes');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Custom Node Library
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Discover and import custom nodes from the community
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleImportFromFile}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm flex items-center gap-2"
              title="Import from file"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleExportNodes}
              className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm flex items-center gap-2"
              title="Export your nodes"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="downloads">Most Downloaded</option>
              <option value="rating">Highest Rated</option>
              <option value="recent">Most Recent</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>

          {/* Status Messages */}
          {importError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {importError}
            </div>
          )}
          
          {importSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
              {importSuccess}
            </div>
          )}
        </div>

        {/* Node Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                className="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-2xl">{node.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {node.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      by {node.customMetadata.createdBy} • v{node.version}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {node.customMetadata.downloadCount}
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        {node.customMetadata.rating}
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                  {node.description}
                </p>
                
                <div className="flex flex-wrap gap-1 mb-3">
                  {node.metadata?.tags?.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {node.inputs.length} inputs • {node.outputs.length} outputs
                  </div>
                  <button
                    onClick={() => handleImportNode(node)}
                    className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs font-medium transition-colors"
                  >
                    Import
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {filteredNodes.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Search className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-2">
                No nodes found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomNodeLibrary; 
