import React, { useState, useEffect } from 'react';
import { X, Search, Copy, Check, Loader2 } from 'lucide-react';
import { fetchWorkflows } from './utils/workflowsDB';

interface Workflow {
  id?: string;
  category: string;
  name: string;
  description: string;
  nodeCount: number;
  tags: string[];
  jsonLink: string;
  nodeNames: string[];
  readmeLink: string;
  likes?: number;
  downloads?: number;
  is_prebuilt?: boolean;
}

interface MiniStoreProps {
  onClose: () => void;
}

// Helper to convert GitHub URL to raw.githubusercontent.com URL
const toRawGitHubUrl = (url: string): string =>
  url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');

const MiniStore: React.FC<MiniStoreProps> = ({ onClose }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedLinks, setCopiedLinks] = useState<Record<string, boolean>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout>();

  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        setIsLoading(true);
        const data = await fetchWorkflows();
        setWorkflows(data);
      } catch (error) {
        console.error('Failed to load workflows:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkflows();
  }, []);

  // Add debounced search with loading state
  useEffect(() => {
    if (searchTerm) {
      setIsSearching(true);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        setIsSearching(false);
      }, 300); // Show loader for at least 300ms for better UX
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const filteredWorkflows = workflows.filter(workflow => {
    if (!searchTerm) return false; // Only show results when searching
    const lowerSearch = searchTerm.toLowerCase();
    return (
      workflow.name.toLowerCase().includes(lowerSearch) ||
      workflow.description.toLowerCase().includes(lowerSearch) ||
      workflow.tags.some(tag => tag.toLowerCase().includes(lowerSearch))
    );
  }).slice(0, 10); // Limit to 10 results for better performance

  const handleCopyLink = async (jsonLink: string, workflowName: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    try {
      const rawUrl = toRawGitHubUrl(jsonLink);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(rawUrl);
      
      setCopiedLinks(prev => ({ ...prev, [workflowName]: true }));
      setTimeout(() => {
        setCopiedLinks(prev => ({ ...prev, [workflowName]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="w-80 bg-white dark:bg-black overflow-y-auto">
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading workflows...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white dark:bg-black overflow-y-auto">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">{/* Keep only bottom border for separation */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
            Quick Workflows
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Search Input */}
        <div className="relative">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-500 animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-400"
          />
        </div>

        {/* Workflow Cards */}
        <div className="space-y-3">
          {searchTerm === '' ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Start typing to search workflows
            </div>
          ) : isSearching ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-pink-500" />
              <span>Searching workflows...</span>
            </div>
          ) : (
            <>
              {filteredWorkflows.map((workflow) => (
                <div
                  key={workflow.name}
                  onClick={() => handleCopyLink(workflow.jsonLink, workflow.name)}
                  className={`relative p-3 rounded-lg border cursor-pointer 
                    ${copiedLinks[workflow.name]
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/10 shadow-[0_0_10px_rgba(34,197,94,0.3)] dark:shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-900'
                    } transition-all duration-200`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                        {workflow.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {workflow.description}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleCopyLink(workflow.jsonLink, workflow.name, e)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
                      title="Copy workflow link"
                    >
                      {copiedLinks[workflow.name] ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {copiedLinks[workflow.name] && (
                    <div className="absolute -top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full shadow-lg animate-fade-in-down">
                      Copied! & Paste it in the workflow editor
                    </div>
                  )}
                </div>
              ))}

              {filteredWorkflows.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No workflows found
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Add keyframes for the fade-in-down animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fade-in-down {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-fade-in-down {
    animation: fade-in-down 0.2s ease-out;
  }
`;
document.head.appendChild(style);

export default MiniStore; 
