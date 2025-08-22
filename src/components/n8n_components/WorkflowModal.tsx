import React, { useState, useEffect } from 'react';
import { X, Download, Box, FileJson, FileText, ChevronLeft, Check, Copy, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface WorkflowModalProps {
  workflow: {
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
  };
  onClose: () => void;
  onDownload: () => void;
}

type ViewMode = 'details' | 'json' | 'docs';

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

const WorkflowModal: React.FC<WorkflowModalProps> = ({ workflow, onClose, onDownload }) => {
  const [jsonContent, setJsonContent] = useState<string>('');
  const [docsContent, setDocsContent] = useState<string>('');
  const [loading, setLoading] = useState({ json: true, docs: true });
  const [showDocs, setShowDocs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async () => {
    try {
      setLoading({ json: true, docs: true });
      setError(null);
      
      // Check if jsonLink is already a JSON string/object instead of a URL
      let jsonText = '';
      let docsText = '';
      
      if (workflow.jsonLink && (workflow.jsonLink.startsWith('http') || workflow.jsonLink.startsWith('https'))) {
        // It's a URL, fetch it
        const jsonResponse = await fetch(toRawGitHubUrl(workflow.jsonLink));
        if (!jsonResponse.ok) throw new Error(`JSON HTTP ${jsonResponse.status}`);
        jsonText = await jsonResponse.text();
      } else if (typeof workflow.jsonLink === 'string' && (
        workflow.jsonLink.startsWith('{') || workflow.jsonLink.startsWith('[')
      )) {
        // It's already a JSON string
        jsonText = workflow.jsonLink;
      } else {
        // Try to stringify it if it's an object
        try {
          jsonText = JSON.stringify(workflow.jsonLink, null, 2);
        } catch (e) {
          throw new Error('Invalid JSON format in workflow data');
        }
      }
      
      // Fetch documentation if available
      if (workflow.readmeLink) {
        try {
          const docsResponse = await fetch(toRawGitHubUrl(workflow.readmeLink));
          if (docsResponse.ok) {
            docsText = await docsResponse.text();
          } else {
            console.warn('Documentation not available:', docsResponse.status);
          }
        } catch (e) {
          console.warn('Failed to fetch documentation:', e);
        }
      }

      setJsonContent(jsonText);
      setDocsContent(docsText);
    } catch (err) {
      console.error('Failed to fetch content:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workflow content');
    } finally {
      setLoading({ json: false, docs: false });
    }
  };

  useEffect(() => {
    fetchContent();
  }, [workflow.jsonLink, workflow.readmeLink]);

  const handleCopy = async () => {
    try {
      // If jsonLink is a JSON string, we want to copy that directly
      const jsonToCopy = typeof workflow.jsonLink === 'string' 
        ? workflow.jsonLink 
        : JSON.stringify(workflow.jsonLink, null, 2);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(jsonToCopy);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Add this to display error messages if needed
  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-black w-full max-w-lg rounded-xl shadow-2xl p-6">
          <div className="flex items-center gap-3 text-red-500 mb-4">
            <AlertCircle className="w-6 h-6" />
            <h2 className="text-xl font-medium">Error Loading Workflow</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-gray-800 dark:text-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-black w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col relative">
        {/* Header */}
        <div className="p-6 border-b border-gray-100/10 dark:border-gray-800/50">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-medium text-gray-900 dark:text-white mb-2">
                {workflow.name}
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span>{workflow.nodeCount} Nodes</span>
                <div className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  <span>{workflow.downloads || 0} Downloads</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="h-full pt-28 pb-20 overflow-y-auto">
          <div className="px-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Details */}
            <div className="space-y-8">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Description
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {workflow.description}
                </p>
              </div>

              {/* Nodes */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Nodes Used
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {workflow.nodeNames.map((node) => (
                    <div
                      key={node}
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100/10 dark:border-gray-800/50 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                    >
                      {node}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {workflow.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-100/10 dark:border-gray-800/50 text-gray-600 dark:text-gray-300 text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Documentation (Hidden by default) */}
              {showDocs && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Documentation
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100/10 dark:border-gray-800/50 rounded-lg p-4">
                    {loading.docs ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 dark:border-pink-400"></div>
                      </div>
                    ) : (
                      <div className="prose dark:prose-invert max-w-none prose-sm">
                        <ReactMarkdown>{docsContent}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: JSON Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Workflow JSON
              </h3>
              <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200/50 dark:border-gray-800/50 rounded-lg p-4 h-[calc(100%-2rem)]">
                {loading.json ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 dark:border-pink-400"></div>
                  </div>
                ) : (
                  <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    customStyle={{
                      background: 'transparent',
                      margin: 0,
                      padding: 0,
                      height: '100%',
                      maxHeight: '100%',
                    }}
                  >
                    {jsonContent}
                  </SyntaxHighlighter>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="absolute bottom-0 inset-x-0 p-4 border-t border-gray-100/10 dark:border-gray-800/50 bg-white dark:bg-black">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg"
            >
              <Download className="w-4 h-4" />
              Download Workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowModal; 
