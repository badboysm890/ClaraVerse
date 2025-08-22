// Store.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Store as StoreIcon, Search, Database, Globe2, FileText, Zap, MessageSquare, GitBranch, BarChart2, Boxes, ChevronDown, Loader2, Download } from 'lucide-react';
import WorkflowCard from './WorkflowCard';
import WorkflowModal from './WorkflowModal';
import { fetchWorkflows } from './utils/workflowsDB';

export interface Workflow {
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
  is_prebuilt?: boolean;
}

interface StoreProps {
  onBack: () => void;
}

const ITEMS_PER_PAGE = 12; // Number of items to load each time

// Category icon and display name mapping with colors
const categoryConfig: Record<string, { icon: React.ReactNode; displayName: string; color: string }> = {
  'data-integration': { 
    icon: <Database className="w-4 h-4" />, 
    displayName: 'Data Integration',
    color: 'from-blue-400 to-blue-500'
  },
  'api-webhooks': { 
    icon: <Globe2 className="w-4 h-4" />, 
    displayName: 'API & Webhooks',
    color: 'from-green-400 to-green-500'
  },
  'document-processing': { 
    icon: <FileText className="w-4 h-4" />, 
    displayName: 'Document Processing',
    color: 'from-purple-400 to-purple-500'
  },
  'automation': { 
    icon: <Zap className="w-4 h-4" />, 
    displayName: 'Automation',
    color: 'from-yellow-400 to-yellow-500'
  },
  'communication': { 
    icon: <MessageSquare className="w-4 h-4" />, 
    displayName: 'Communication',
    color: 'from-pink-400 to-pink-500'
  },
  'data-transformation': { 
    icon: <GitBranch className="w-4 h-4" />, 
    displayName: 'Data Transformation',
    color: 'from-indigo-400 to-indigo-500'
  },
  'analytics': { 
    icon: <BarChart2 className="w-4 h-4" />, 
    displayName: 'Analytics',
    color: 'from-orange-400 to-orange-500'
  },
};

const getCategoryDisplay = (category: string): { icon: React.ReactNode; displayName: string; color: string } => {
  return categoryConfig[category] || { 
    icon: <Boxes className="w-4 h-4" />, 
    displayName: category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    color: 'from-gray-400 to-gray-500'
  };
};

// Shuffle array function
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// Utility function to convert GitHub URLs to raw format
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

const Store: React.FC<StoreProps> = ({ onBack }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [displayedWorkflows, setDisplayedWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const [copied, setCopied] = useState(false);

  const lastWorkflowElementRef = useCallback((node: HTMLDivElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        setLoading(true);
        const data = await fetchWorkflows();
        setWorkflows(data);
      } catch (error) {
        console.error('Failed to load workflows:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWorkflows();
  }, []);

  useEffect(() => {
    const filteredWorkflows = workflows.filter(workflow => {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        workflow.name.toLowerCase().includes(lowerSearch) ||
        workflow.description.toLowerCase().includes(lowerSearch) ||
        workflow.tags.some(tag => tag.toLowerCase().includes(lowerSearch));
      const matchesCategory = !selectedCategory || workflow.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Shuffle the workflows if no category is selected
    const processedWorkflows = selectedCategory ? filteredWorkflows : shuffleArray(filteredWorkflows);

    // Reset pagination when filters change
    setPage(1);
    setDisplayedWorkflows(processedWorkflows.slice(0, ITEMS_PER_PAGE));
    setHasMore(processedWorkflows.length > ITEMS_PER_PAGE);
  }, [workflows, searchTerm, selectedCategory]);

  useEffect(() => {
    if (page === 1) return;

    setLoading(true);
    const filteredWorkflows = workflows.filter(workflow => {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        workflow.name.toLowerCase().includes(lowerSearch) ||
        workflow.description.toLowerCase().includes(lowerSearch) ||
        workflow.tags.some(tag => tag.toLowerCase().includes(lowerSearch));
      const matchesCategory = !selectedCategory || workflow.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Shuffle the workflows if no category is selected
    const processedWorkflows = selectedCategory ? filteredWorkflows : shuffleArray(filteredWorkflows);
    
    const newWorkflows = processedWorkflows.slice(0, page * ITEMS_PER_PAGE);
    setDisplayedWorkflows(newWorkflows);
    setHasMore(processedWorkflows.length > page * ITEMS_PER_PAGE);
    setLoading(false);
  }, [page, workflows, searchTerm, selectedCategory]);

  const categories = Array.from(new Set(workflows.map(w => w.category)));

  const handleDownloadWorkflow = async (workflow: Workflow) => {
    try {
      // Update local download count
      setWorkflows(prev => prev.map(w => 
        w.id === workflow.id ? { ...w, downloads: (w.downloads || 0) + 1 } : w
      ));

      // Download logic here...
      const jsonUrl = toRawGitHubUrl(workflow.jsonLink);
      window.open(jsonUrl, '_blank');
    } catch (error) {
      console.error('Failed to download workflow:', error);
    }
  };

  const handleCopy = async (workflow: Workflow, e: React.MouseEvent) => {
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

  if (loading && workflows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-pink-500" />
          <p className="text-lg text-gray-600 dark:text-gray-300">Loading angelaVerse Store...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header/Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-100/80 dark:hover:bg-gray-900/50 text-gray-600 dark:text-gray-300 backdrop-blur-sm"
            title="Back to n8n"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="relative">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-full">
              <StoreIcon className="w-5 h-5 text-pink-500 dark:text-pink-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                angelaVerse Store
              </span>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-64 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-400"
            />
          </div>
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-400 min-w-[180px]"
            >
              <option value="">All Categories</option>
              {categories.map(category => {
                const { displayName } = getCategoryDisplay(category);
                return (
                  <option key={category} value={category}>
                    {displayName}
                  </option>
                );
              })}
            </select>
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
              {selectedCategory ? getCategoryDisplay(selectedCategory).icon : <Boxes className="w-4 h-4" />}
            </div>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedWorkflows.map((workflow, index) => (
            <div
              key={workflow.id}
              ref={index === displayedWorkflows.length - 1 ? lastWorkflowElementRef : null}
            >
              <WorkflowCard
                workflow={workflow}
                onClick={() => setSelectedWorkflow(workflow)}
                onDownload={() => handleDownloadWorkflow(workflow)}
                onCopy={(e) => handleCopy(workflow, e)}
              />
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center items-center mt-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        )}
      </div>

      {selectedWorkflow && (
        <WorkflowModal
          workflow={selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
          onDownload={() => handleDownloadWorkflow(selectedWorkflow)}
        />
      )}
    </div>
  );
};

export default Store;
