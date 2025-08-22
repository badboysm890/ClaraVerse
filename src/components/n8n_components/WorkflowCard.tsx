import React, { useState } from 'react';
import { Box, Copy, Check, Download, Database, Globe2, FileText, Zap, MessageSquare, GitBranch, BarChart2, Boxes } from 'lucide-react';

interface Workflow {
  id: string;
  category: string;
  name: string;
  description: string;
  nodeCount: number;
  tags: string[];
  jsonLink: string;
  nodeNames: string[];
  readmeLink: string;
  downloads?: number;
}

interface WorkflowCardProps {
  workflow: Workflow;
  onClick: () => void;
  onDownload: () => void;
  onCopy: (e: React.MouseEvent) => void;
}

// Category icon and display name mapping with colors
const categoryConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  'data-integration': { 
    icon: <Database className="w-5 h-5" />,
    color: 'from-blue-400/10 to-blue-500/10 dark:from-blue-400/20 dark:to-blue-500/20'
  },
  'api-webhooks': { 
    icon: <Globe2 className="w-5 h-5" />,
    color: 'from-green-400/10 to-green-500/10 dark:from-green-400/20 dark:to-green-500/20'
  },
  'document-processing': { 
    icon: <FileText className="w-5 h-5" />,
    color: 'from-purple-400/10 to-purple-500/10 dark:from-purple-400/20 dark:to-purple-500/20'
  },
  'automation': { 
    icon: <Zap className="w-5 h-5" />,
    color: 'from-yellow-400/10 to-yellow-500/10 dark:from-yellow-400/20 dark:to-yellow-500/20'
  },
  'communication': { 
    icon: <MessageSquare className="w-5 h-5" />,
    color: 'from-pink-400/10 to-pink-500/10 dark:from-pink-400/20 dark:to-pink-500/20'
  },
  'data-transformation': { 
    icon: <GitBranch className="w-5 h-5" />,
    color: 'from-indigo-400/10 to-indigo-500/10 dark:from-indigo-400/20 dark:to-indigo-500/20'
  },
  'analytics': { 
    icon: <BarChart2 className="w-5 h-5" />,
    color: 'from-orange-400/10 to-orange-500/10 dark:from-orange-400/20 dark:to-orange-500/20'
  },
};

const getCategoryConfig = (category: string): { icon: React.ReactNode; color: string; textColor: string; bgColor: string } => {
  const config = categoryConfig[category] || {
    icon: <Boxes className="w-5 h-5" />,
    color: 'from-gray-400/10 to-gray-500/10 dark:from-gray-400/20 dark:to-gray-500/20'
  };

  const colorMap: Record<string, { text: string; bg: string }> = {
    'data-integration': { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500' },
    'api-webhooks': { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-500' },
    'document-processing': { text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500' },
    'automation': { text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500' },
    'communication': { text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-500' },
    'data-transformation': { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500' },
    'analytics': { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500' }
  };

  const colors = colorMap[category] || { text: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-500' };

  return {
    ...config,
    textColor: colors.text,
    bgColor: colors.bg
  };
};

// Helper to convert GitHub URL to raw.githubusercontent.com URL
const toRawGitHubUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  
  // If it's already a raw URL or not a GitHub URL, return as is
  if (url.includes('raw.githubusercontent.com') || !url.includes('github.com')) {
    return url;
  }
  
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
};

const WorkflowCard: React.FC<WorkflowCardProps> = ({ workflow, onClick, onDownload, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const { icon, color, textColor, bgColor } = getCategoryConfig(workflow.category);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let jsonToCopy;
      
      if (workflow.jsonLink.startsWith('http') || workflow.jsonLink.startsWith('https')) {
        // It's a URL, format it as a raw URL if needed
        jsonToCopy = toRawGitHubUrl(workflow.jsonLink);
      } else if (typeof workflow.jsonLink === 'string') {
        // It's already a JSON string
        jsonToCopy = workflow.jsonLink;
      } else {
        // Try to stringify it if it's an object
        jsonToCopy = JSON.stringify(workflow.jsonLink, null, 2);
      }
      
      // Copy to clipboard
      await navigator.clipboard.writeText(jsonToCopy);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload();
  };

  return (
    <div
      onClick={onClick}
      className="group relative backdrop-blur-sm bg-white/80 dark:bg-gray-800/50 rounded-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 hover:border-pink-400 dark:hover:border-pink-400 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-pink-500/10 dark:hover:shadow-pink-400/10 hover:scale-[1.02] transform h-[280px]"
    >
      <div className="p-5 flex flex-col h-full">
        {/* Category Badge */}
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2 bg-gradient-to-br ${color} rounded-lg`}>
            <div className={textColor}>
              {icon}
            </div>
          </div>
          <div className={`px-2 py-1 ${bgColor} dark:bg-black backdrop-blur-sm text-white text-xs rounded-full font-medium`}>
            {workflow.category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
          </div>
        </div>

        {/* Title & Stats */}
        <div className="mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 min-h-[48px]">
            {workflow.name}
          </h3>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>{workflow.nodeCount} Nodes</span>
            <div className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              <span>{workflow.downloads || 0}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-4 flex-grow">
          {workflow.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-6">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={`px-2 py-1 bg-${bgColor.split('-')[1]}/10 dark:bg-${bgColor.split('-')[1]}/20 backdrop-blur-sm ${textColor} text-xs rounded-full`}
            >
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span
              className={`px-2 py-1 bg-${bgColor.split('-')[1]}/10 dark:bg-${bgColor.split('-')[1]}/20 backdrop-blur-sm ${textColor} text-xs rounded-full`}
            >
              +{workflow.tags.length - 3}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-end gap-2 p-3">
          <button
            onClick={handleDownload}
            className={`p-1.5 rounded-lg ${bgColor} dark:bg-black backdrop-blur-sm text-white text-xs hover:bg-opacity-90 dark:hover:bg-gray-900 transition-colors duration-200`}
            title="Download JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            {copied && (
              <span className="text-xs text-green-500 dark:text-green-400 font-medium">
                Copied!
              </span>
            )}
            <button
              onClick={handleCopy}
              className={`p-1.5 rounded-lg ${bgColor} dark:bg-black backdrop-blur-sm text-white text-xs hover:bg-opacity-90 dark:hover:bg-gray-900 transition-colors duration-200`}
              title={copied ? 'Copied!' : 'Copy raw JSON URL'}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowCard;
