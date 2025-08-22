import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Eye, ChevronLeft, ChevronRight, Check, Grid, List } from 'lucide-react';
import { NotebookContent, ExportOptions } from './NotebookExportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
  notebookContent: NotebookContent;
}

interface ExportItem {
  id: string;
  type: 'note' | 'chat' | 'graph';
  title: string;
  content: string;
  selected: boolean;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    messageCount?: number;
    nodeCount?: number;
  };
}

interface ExportPage {
  id: string;
  title: string;
  items: ExportItem[];
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onExport, notebookContent }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [exportItems, setExportItems] = useState<ExportItem[]>([]);
  const [exportPages, setExportPages] = useState<ExportPage[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx' | 'md' | 'html' | 'txt'>('pdf');
  const [includeDiagrams, setIncludeDiagrams] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [previewMode, setPreviewMode] = useState<'grid' | 'list'>('grid');

  const steps = [
    { number: 1, title: 'Select Content', description: 'Choose what to include' },
    { number: 2, title: 'Organize Pages', description: 'Split content into pages' },
    { number: 3, title: 'Preview', description: 'Review before export' },
    { number: 4, title: 'Export Options', description: 'Choose format and settings' }
  ];

  // Initialize export items from notebook content
  useEffect(() => {
    if (!isOpen) return;

    const items: ExportItem[] = [];

    // Add notes
    notebookContent.notes.forEach(note => {
      items.push({
        id: `note-${note.id}`,
        type: 'note',
        title: note.title,
        content: note.content,
        selected: true,
        metadata: {
          createdAt: note.createdAt,
          updatedAt: note.updatedAt
        }
      });
    });

    // Add chat history
    if (notebookContent.chatHistory.length > 0) {
      items.push({
        id: 'chat-history',
        type: 'chat',
        title: 'Chat History',
        content: `${notebookContent.chatHistory.length} messages`,
        selected: true,
        metadata: {
          messageCount: notebookContent.chatHistory.length
        }
      });
    }

    // Add knowledge graph
    if (notebookContent.graphData) {
      items.push({
        id: 'knowledge-graph',
        type: 'graph',
        title: 'Knowledge Graph',
        content: `${notebookContent.graphData.nodes.length} nodes, ${notebookContent.graphData.edges.length} relationships`,
        selected: true,
        metadata: {
          nodeCount: notebookContent.graphData.nodes.length
        }
      });
    }

    setExportItems(items);

    // Create initial page organization
    const pages: ExportPage[] = [
      {
        id: 'page-1',
        title: `${notebookContent.notebook.name} - Complete Export`,
        items: items.filter(item => item.selected)
      }
    ];
    setExportPages(pages);
  }, [isOpen, notebookContent]);

  // Update pages when item selection changes
  useEffect(() => {
    if (exportPages.length === 0) return;
    
    const selectedItems = exportItems.filter(item => item.selected);
    
    // Update the first page with all selected items if it's the only page
    if (exportPages.length === 1) {
      setExportPages([{
        ...exportPages[0],
        items: selectedItems
      }]);
    } else {
      // For multiple pages, keep existing organization but remove unselected items
      setExportPages(prev => 
        prev.map(page => ({
          ...page,
          items: page.items.filter(item => item.selected)
        }))
      );
    }
  }, [exportItems]);

  const toggleItemSelection = (itemId: string) => {
    setExportItems(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const selectAllItems = () => {
    setExportItems(prev => prev.map(item => ({ ...item, selected: true })));
  };

  const deselectAllItems = () => {
    setExportItems(prev => prev.map(item => ({ ...item, selected: false })));
  };

  const createNewPage = () => {
    const newPage: ExportPage = {
      id: `page-${Date.now()}`,
      title: `Page ${exportPages.length + 1}`,
      items: []
    };
    setExportPages(prev => [...prev, newPage]);
  };

  const updatePageTitle = (pageId: string, title: string) => {
    setExportPages(prev =>
      prev.map(page =>
        page.id === pageId ? { ...page, title } : page
      )
    );
  };

  const moveItemToPage = (itemId: string, targetPageId: string) => {
    setExportPages(prev => {
      const newPages = prev.map(page => ({
        ...page,
        items: page.items.filter(item => item.id !== itemId)
      }));

      const targetPageIndex = newPages.findIndex(page => page.id === targetPageId);
      if (targetPageIndex !== -1) {
        const item = exportItems.find(item => item.id === itemId);
        if (item && item.selected) {
          newPages[targetPageIndex].items.push(item);
        }
      }

      return newPages;
    });
  };

  const deletePage = (pageId: string) => {
    if (exportPages.length <= 1) return; // Keep at least one page
    setExportPages(prev => prev.filter(page => page.id !== pageId));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const selectedItems = exportItems.filter(item => item.selected);
      const options: ExportOptions = {
        includeNotes: selectedItems.some(item => item.type === 'note'),
        includeChat: selectedItems.some(item => item.type === 'chat'),
        includeGraph: selectedItems.some(item => item.type === 'graph'),
        includeDiagrams,
        format: selectedFormat
      };
      
      await onExport(options);
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return exportItems.some(item => item.selected);
      case 2:
        return exportPages.some(page => page.items.length > 0);
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const getSelectedCount = () => exportItems.filter(item => item.selected).length;

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
            ${currentStep >= step.number 
              ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }
          `}>
            {currentStep > step.number ? <Check className="w-5 h-5" /> : step.number}
          </div>
          <div className="ml-3">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {step.title}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {step.description}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`
              w-12 h-0.5 mx-4
              ${currentStep > step.number 
                ? 'bg-gradient-to-r from-pink-500 to-purple-600' 
                : 'bg-gray-200 dark:bg-gray-700'
              }
            `} />
          )}
        </div>
      ))}
    </div>
  );

  const renderContentSelection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Select Content to Export
        </h3>
        <div className="flex gap-2">
          <button
            onClick={selectAllItems}
            className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            Select All
          </button>
          <button
            onClick={deselectAllItems}
            className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {getSelectedCount()} of {exportItems.length} items selected
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {exportItems.map(item => (
          <div
            key={item.id}
            className={`
              p-4 rounded-lg border-2 cursor-pointer transition-all
              ${item.selected 
                ? 'border-pink-300 bg-pink-50 dark:border-pink-600 dark:bg-pink-900/20' 
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
            onClick={() => toggleItemSelection(item.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-5 h-5 rounded border-2 flex items-center justify-center
                    ${item.selected 
                      ? 'border-pink-500 bg-pink-500' 
                      : 'border-gray-300 dark:border-gray-600'
                    }
                  `}>
                    {item.selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className={`
                    px-2 py-1 rounded-full text-xs font-medium
                    ${item.type === 'note' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                      item.type === 'chat' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                    }
                  `}>
                    {item.type.toUpperCase()}
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {item.title}
                  </h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 ml-8">
                  {item.content.length > 100 ? `${item.content.substring(0, 100)}...` : item.content}
                </p>
                {item.metadata && (
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2 ml-8">
                    {item.metadata.updatedAt && (
                      <span>Updated: {new Date(item.metadata.updatedAt).toLocaleDateString()}</span>
                    )}
                    {item.metadata.messageCount && (
                      <span>{item.metadata.messageCount} messages</span>
                    )}
                    {item.metadata.nodeCount && (
                      <span>{item.metadata.nodeCount} nodes</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPageOrganization = () => {
    const selectedItems = exportItems.filter(item => item.selected);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Organize Content into Pages
          </h3>
          <button
            onClick={createNewPage}
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-600 hover:to-purple-700 transition-all"
          >
            Add Page
          </button>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Split your {selectedItems.length} selected items across multiple pages for better organization.
        </div>

        <div className="space-y-4">
          {exportPages.map((page, pageIndex) => (
            <div key={page.id} className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-full text-sm flex items-center justify-center font-medium">
                    {pageIndex + 1}
                  </div>
                  <input
                    type="text"
                    value={page.title}
                    onChange={(e) => updatePageTitle(page.id, e.target.value)}
                    className="font-medium text-gray-900 dark:text-gray-100 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-pink-500 rounded px-2 py-1 flex-1"
                    placeholder="Page title..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {page.items.length} items
                  </span>
                  {exportPages.length > 1 && (
                    <button
                      onClick={() => deletePage(page.id)}
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Delete page"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-20">
                {page.items.length === 0 ? (
                  <div className="col-span-full text-sm text-gray-500 dark:text-gray-400 text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p>No items in this page</p>
                    <p className="text-xs">Use the controls below to move items here</p>
                  </div>
                ) : (
                  page.items.map(item => (
                    <div
                      key={item.id}
                      className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`
                          w-2 h-2 rounded-full
                          ${item.type === 'note' ? 'bg-blue-500' :
                            item.type === 'chat' ? 'bg-green-500' :
                            'bg-purple-500'
                          }
                        `} />
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.title}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                        {item.type}
                      </div>
                      {/* Move controls */}
                      <div className="flex gap-1 mt-2">
                        {exportPages.map((targetPage, targetIndex) => {
                          if (targetPage.id === page.id) return null;
                          return (
                            <button
                              key={targetPage.id}
                              onClick={() => moveItemToPage(item.id, targetPage.id)}
                              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                              title={`Move to ${targetPage.title}`}
                            >
                              → Page {targetIndex + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                // Distribute items evenly across existing pages
                const selectedItems = exportItems.filter(item => item.selected);
                const itemsPerPage = Math.ceil(selectedItems.length / exportPages.length);
                
                setExportPages(prev => 
                  prev.map((page, index) => ({
                    ...page,
                    items: selectedItems.slice(index * itemsPerPage, (index + 1) * itemsPerPage)
                  }))
                );
              }}
              className="px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              Distribute Evenly
            </button>
            <button
              onClick={() => {
                // Put all items in first page
                const selectedItems = exportItems.filter(item => item.selected);
                setExportPages(prev => 
                  prev.map((page, index) => ({
                    ...page,
                    items: index === 0 ? selectedItems : []
                  }))
                );
              }}
              className="px-3 py-2 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md hover:bg-green-200 dark:hover:bg-green-800"
            >
              All in First Page
            </button>
            <button
              onClick={() => {
                // Separate by type
                const noteItems = exportItems.filter(item => item.selected && item.type === 'note');
                const chatItems = exportItems.filter(item => item.selected && item.type === 'chat');
                const graphItems = exportItems.filter(item => item.selected && item.type === 'graph');
                
                const newPages: ExportPage[] = [];
                
                if (noteItems.length > 0) {
                  newPages.push({
                    id: `page-notes-${Date.now()}`,
                    title: 'Notes & Documents',
                    items: noteItems
                  });
                }
                
                if (chatItems.length > 0) {
                  newPages.push({
                    id: `page-chat-${Date.now()}`,
                    title: 'Chat History',
                    items: chatItems
                  });
                }
                
                if (graphItems.length > 0) {
                  newPages.push({
                    id: `page-graph-${Date.now()}`,
                    title: 'Knowledge Graph',
                    items: graphItems
                  });
                }
                
                if (newPages.length > 0) {
                  setExportPages(newPages);
                }
              }}
              className="px-3 py-2 text-sm bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-800"
            >
              Separate by Type
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPreview = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Export Preview
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode('grid')}
            className={`p-2 rounded ${previewMode === 'grid' ? 'bg-pink-100 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPreviewMode('list')}
            className={`p-2 rounded ${previewMode === 'list' ? 'bg-pink-100 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your export will contain {exportPages.length} page{exportPages.length > 1 ? 's' : ''} with {exportItems.filter(item => item.selected).length} selected items.
        </div>

        <div className={`
          ${previewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 gap-4' 
            : 'space-y-4'
          }
        `}>
          {exportPages.map((page, index) => (
            <div key={page.id} className="bg-white dark:bg-gray-700 rounded-lg p-4 border">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded text-xs flex items-center justify-center font-medium">
                  {index + 1}
                </div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {page.title}
                </h4>
              </div>
              
              <div className="space-y-2">
                {page.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <div className={`
                      w-2 h-2 rounded-full
                      ${item.type === 'note' ? 'bg-blue-500' :
                        item.type === 'chat' ? 'bg-green-500' :
                        'bg-purple-500'
                      }
                    `} />
                    <span className="text-gray-700 dark:text-gray-300">{item.title}</span>
                  </div>
                ))}
                {page.items.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    Empty page
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderExportOptions = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Export Settings
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Export Format
          </label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(['pdf', 'docx', 'md', 'html', 'txt'] as const).map(format => (
              <button
                key={format}
                onClick={() => setSelectedFormat(format)}
                className={`
                  p-3 rounded-lg border-2 text-center transition-all
                  ${selectedFormat === format
                    ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <FileText className="w-6 h-6 mx-auto mb-1" />
                <div className="text-sm font-medium">{format.toUpperCase()}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="includeDiagrams"
            checked={includeDiagrams}
            onChange={(e) => setIncludeDiagrams(e.target.checked)}
            className="w-4 h-4 text-pink-600 rounded focus:ring-pink-500"
          />
          <label htmlFor="includeDiagrams" className="text-sm text-gray-700 dark:text-gray-300">
            Include Mermaid diagrams (recommended)
          </label>
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderContentSelection();
      case 2:
        return renderPageOrganization();
      case 3:
        return renderPreview();
      case 4:
        return renderExportOptions();
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Export Notebook
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {notebookContent.notebook.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          {renderStepIndicator()}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex gap-2">
            {currentStep < 4 ? (
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                disabled={!canProceedToNextStep()}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={isExporting || !canProceedToNextStep()}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal; 
