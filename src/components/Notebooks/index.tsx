import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Grid3X3,
  List,
  Loader2,
  FileText,
  Clock
} from 'lucide-react';
import CreateNotebookModal from './CreateNotebookModal';
import NotebookDetails from './NotebookDetails';
import PythonStartupModal from '../PythonStartupModal';
import { angelaNotebookService, NotebookResponse, ProviderConfig } from '../../services/angelaNotebookService';
import { ProvidersProvider } from '../../contexts/ProvidersContext';
import { db } from '../../db';

interface NotebooksProps {
  onPageChange: (page: string) => void;
  userName?: string;
}

interface NotebookWithStatus extends NotebookResponse {
  completedDocumentCount?: number;
  isLoadingDocuments?: boolean;
}

const NotebooksContent: React.FC<{ onPageChange: (page: string) => void; userName?: string }> = ({ onPageChange: _onPageChange, userName: _userName }) => {
  const [notebooks, setNotebooks] = useState<NotebookWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState<NotebookWithStatus | null>(null);
  const [isBackendHealthy, setIsBackendHealthy] = useState(false);
  const [showStartupModal, setShowStartupModal] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Subscribe to backend health changes
  useEffect(() => {
    const unsubscribe = angelaNotebookService.onHealthChange(setIsBackendHealthy);
    return unsubscribe;
  }, []);

  // Load notebooks on component mount and when backend becomes healthy
  useEffect(() => {
    if (isBackendHealthy) {
      loadNotebooks();
    }
  }, [isBackendHealthy]);

  // Show startup modal when backend is not healthy
  useEffect(() => {
    if (!isBackendHealthy && !showStartupModal) {
      // Add a slight delay to avoid showing modal immediately on component mount
      const timer = setTimeout(() => {
        setShowStartupModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isBackendHealthy, showStartupModal]);

  // Periodic refresh of document status for notebooks with processing documents
  useEffect(() => {
    if (!isBackendHealthy || notebooks.length === 0) return;

    const interval = setInterval(() => {
      const notebooksNeedingRefresh = notebooks.filter(notebook => 
        !notebook.isLoadingDocuments && 
        (notebook.document_count || 0) > 0 && 
        (notebook.completedDocumentCount || 0) < (notebook.document_count || 0)
      );

      if (notebooksNeedingRefresh.length > 0) {
        loadDocumentStatusForNotebooks(notebooksNeedingRefresh);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isBackendHealthy, notebooks]);

  const loadNotebooks = async () => {
    if (!isBackendHealthy) {
      setError('Notebook backend is not available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await angelaNotebookService.listNotebooks();
      setNotebooks(data.map(notebook => ({ ...notebook, isLoadingDocuments: true })));
      
      // Load document status for each notebook
      loadDocumentStatusForNotebooks(data);
    } catch (err) {
      console.error('Failed to load notebooks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notebooks');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocumentStatusForNotebooks = async (notebookList: NotebookResponse[]) => {
    // Load document status for each notebook in parallel
    const statusPromises = notebookList.map(async (notebook) => {
      try {
        const documents = await angelaNotebookService.listDocuments(notebook.id);
        const completedCount = documents.filter(doc => doc.status === 'completed').length;
        return { id: notebook.id, completedDocumentCount: completedCount };
      } catch (error) {
        console.error(`Failed to load documents for notebook ${notebook.id}:`, error);
        return { id: notebook.id, completedDocumentCount: 0 };
      }
    });

    try {
      const results = await Promise.all(statusPromises);
      
      setNotebooks(prev => prev.map(notebook => {
        const status = results.find(r => r.id === notebook.id);
        return {
          ...notebook,
          completedDocumentCount: status?.completedDocumentCount ?? 0,
          isLoadingDocuments: false
        };
      }));
    } catch (error) {
      console.error('Failed to load document status:', error);
      // Remove loading state even if some failed
      setNotebooks(prev => prev.map(notebook => ({
        ...notebook,
        isLoadingDocuments: false
      })));
    }
  };

  const handleCreateNotebook = async (name: string, description: string, llmProvider: ProviderConfig, embeddingProvider: ProviderConfig) => {
    if (!isBackendHealthy) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const newNotebook = await angelaNotebookService.createNotebook({
        name,
        description: description || undefined,
        llm_provider: llmProvider,
        embedding_provider: embeddingProvider
      });
      
      // Add the new notebook to the list
      setNotebooks(prev => [newNotebook, ...prev]);
      setShowCreateModal(false);
      
      // Automatically open the newly created notebook
      setSelectedNotebook(newNotebook);
    } catch (error) {
      console.error('Failed to create notebook:', error);
      throw error; // Re-throw so the modal can handle it
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (!isBackendHealthy) {
      setError('Notebook backend is not available');
      return;
    }

    try {
      await angelaNotebookService.deleteNotebook(id);
      
      // Remove from local state
      setNotebooks(prev => prev.filter(notebook => notebook.id !== id));
      
      // Close details if this notebook was selected
      if (selectedNotebook?.id === id) {
        setSelectedNotebook(null);
      }
    } catch (error) {
      console.error('Failed to delete notebook:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete notebook');
    }
  };

  const handleOpenNotebook = (notebook: NotebookResponse) => {
    setSelectedNotebook(notebook);
  };

  const handleCloseNotebook = () => {
    setSelectedNotebook(null);
  };

  const handleNotebookUpdated = (updatedNotebook: NotebookResponse) => {
    setNotebooks(prev => 
      prev.map(notebook => 
        notebook.id === updatedNotebook.id 
          ? { ...updatedNotebook, isLoadingDocuments: true, completedDocumentCount: notebook.completedDocumentCount }
          : notebook
      )
    );
    setSelectedNotebook(updatedNotebook);
    
    // Refresh document status for the updated notebook
    refreshDocumentStatusForNotebook(updatedNotebook.id);
  };

  const refreshDocumentStatusForNotebook = async (notebookId: string) => {
    try {
      const documents = await angelaNotebookService.listDocuments(notebookId);
      const completedCount = documents.filter(doc => doc.status === 'completed').length;
      
      setNotebooks(prev => prev.map(notebook => 
        notebook.id === notebookId 
          ? { ...notebook, completedDocumentCount: completedCount, isLoadingDocuments: false }
          : notebook
      ));
    } catch (error) {
      console.error(`Failed to refresh document status for notebook ${notebookId}:`, error);
      setNotebooks(prev => prev.map(notebook => 
        notebook.id === notebookId 
          ? { ...notebook, isLoadingDocuments: false }
          : notebook
      ));
    }
  };

  // Filter and sort notebooks based on search query (most recent first)
  const filteredNotebooks = notebooks
    .filter(notebook =>
      notebook.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (notebook.description && notebook.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Show notebook details if one is selected
  if (selectedNotebook) {
    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 relative overflow-hidden">
        {/* Wallpaper */}
        {wallpaperUrl && (
          <div 
            className="fixed top-0 left-0 right-0 bottom-0 z-0"
            style={{
              backgroundImage: `url(${wallpaperUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.1,
              filter: 'blur(1px)',
              pointerEvents: 'none'
            }}
          />
        )}

        {/* Content with relative z-index */}
        <div className="relative z-10 h-full">
          <NotebookDetails 
            notebook={selectedNotebook}
            onClose={handleCloseNotebook}
            onNotebookUpdated={handleNotebookUpdated}
            onNotebookDeleted={() => {
              handleDeleteNotebook(selectedNotebook.id);
              handleCloseNotebook();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 relative overflow-hidden">
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Content with relative z-index */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Notebooks Header */}
        <div className="pt-12 px-8 flex-shrink-0">
          <div className="glassmorphic px-6 py-6 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 text-sakura-500 text-2xl">📚</div>
                  <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Notebooks</h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">Create, manage, and organize your knowledge documents</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  disabled={!isBackendHealthy}
                  className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg flex items-center gap-2 font-medium transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Plus className="w-5 h-5" />
                  Create Notebook
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search notebooks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 dark:bg-gray-900/50 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sakura-500 w-80"
                  />
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {filteredNotebooks.length} of {notebooks.length} notebooks
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadNotebooks}
                  disabled={!isBackendHealthy || isLoading}
                  className="p-2 rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Refresh notebooks"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                {/* Backend status indicator */}
                {isBackendHealthy ? (
                  <div className="flex items-center text-green-600 dark:text-green-400 text-sm ml-2">
                    <Wifi className="h-4 w-4 mr-1" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center text-red-600 dark:text-red-400 text-sm ml-2">
                    <WifiOff className="h-4 w-4 mr-1" />
                    <span>Disconnected</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          {/* Main Content - Canvas Area */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Canvas Content */}
            <div className="flex-1 overflow-hidden">
              {/* Error state */}
              {error && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      Connection Error
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {error}
                    </p>
                    {isBackendHealthy && (
                      <button
                        onClick={loadNotebooks}
                        className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Loading state */}
              {isLoading && !error && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-sakura-500 border-t-transparent"></div>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      Loading Notebooks
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Fetching your notebooks from the backend...
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !error && notebooks.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center text-3xl">
                      📚
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      Welcome to Notebooks
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {isBackendHealthy 
                        ? "Create your first notebook to start organizing your documents and knowledge."
                        : "Backend is not available. Please check your connection."
                      }
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      {isBackendHealthy && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="px-4 py-2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          + Create New Notebook
                        </button>
                      )}
                      <button className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors">
                        Browse Templates
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* No search results */}
              {!isLoading && !error && notebooks.length > 0 && filteredNotebooks.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900/30 dark:to-gray-800/30 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      No notebooks found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Try adjusting your search terms or create a new notebook.
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear Search
                    </button>
                  </div>
                </div>
              )}

              {/* Notebooks grid/list */}
              {!isLoading && !error && filteredNotebooks.length > 0 && (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-8 py-6">
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredNotebooks.map((notebook) => (
                          <div
                            key={notebook.id}
                            className="group glassmorphic rounded-xl hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                          >
                            {/* Header Section */}
                            <div className="p-4 border-b border-white/20 dark:border-gray-700/50">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-lg">
                                    📚
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                                      {notebook.name}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                      <FileText className="w-3 h-3" />
                                      <span>{notebook.document_count || 0} documents</span>
                                      
                                      {/* Processing Status */}
                                      {notebook.isLoadingDocuments ? (
                                        <div className="flex items-center gap-1 text-blue-500">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Loading...</span>
                                        </div>
                                      ) : (notebook.document_count || 0) > 0 && (notebook.completedDocumentCount || 0) < (notebook.document_count || 0) ? (
                                        <div className="flex items-center gap-1 text-amber-500">
                                          <Clock className="w-3 h-3" />
                                          <span>
                                            Processing {(notebook.document_count || 0) - (notebook.completedDocumentCount || 0)}
                                          </span>
                                        </div>
                                      ) : (notebook.document_count || 0) > 0 && (notebook.completedDocumentCount || 0) === (notebook.document_count || 0) ? (
                                        <div className="flex items-center gap-1 text-green-500">
                                          <span>✓ Ready</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                <div className="w-3 h-3 mr-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                </div>
                                {new Date(notebook.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric', 
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {notebook.description && (
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {notebook.description}
                                </div>
                              )}
                            </div>
                            
                            {/* Action Buttons Section */}
                            <div className="p-4">
                              <div className="flex items-center justify-center gap-4">
                                <button
                                  onClick={() => handleOpenNotebook(notebook)}
                                  className="group relative w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                  title="Open Notebook"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform group-hover:scale-110">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                  </svg>
                                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNotebook(notebook.id);
                                  }}
                                  className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                  title="Delete Notebook"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform group-hover:scale-110">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                    <line x1="10" x2="10" y1="11" y2="17"></line>
                                    <line x1="14" x2="14" y1="11" y2="17"></line>
                                  </svg>
                                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredNotebooks.map((notebook) => (
                          <div
                            key={notebook.id}
                            className="group glassmorphic rounded-xl hover:border-sakura-300 dark:hover:border-sakura-500 hover:shadow-lg transition-all duration-200"
                          >
                            <div className="p-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                  <div className="w-12 h-12 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                                    📚
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
                                        {notebook.name}
                                      </h3>
                                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                          <polyline points="14 2 14 8 20 8"></polyline>
                                          <line x1="16" x2="8" y1="13" y2="13"></line>
                                          <line x1="16" x2="8" y1="17" y2="17"></line>
                                          <polyline points="10 9 9 9 8 9"></polyline>
                                        </svg>
                                        <span>{notebook.document_count || 0} documents</span>
                                        
                                        {/* Processing Status */}
                                        {notebook.isLoadingDocuments ? (
                                          <div className="flex items-center gap-1 text-blue-500">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="text-xs">Loading...</span>
                                          </div>
                                        ) : (notebook.document_count || 0) > 0 && (notebook.completedDocumentCount || 0) < (notebook.document_count || 0) ? (
                                          <div className="flex items-center gap-1 text-amber-500">
                                            <Clock className="w-3 h-3" />
                                            <span className="text-xs">
                                              Processing {(notebook.document_count || 0) - (notebook.completedDocumentCount || 0)}
                                            </span>
                                          </div>
                                        ) : (notebook.document_count || 0) > 0 && (notebook.completedDocumentCount || 0) === (notebook.document_count || 0) ? (
                                          <div className="flex items-center gap-1 text-green-500">
                                            <span className="text-xs">✓ Ready</span>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 mr-1">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                      </svg>
                                      <span>Updated {new Date(notebook.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric', 
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}</span>
                                    </div>
                                    {notebook.description && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
                                        {notebook.description}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 ml-4">
                                  <button
                                    onClick={() => handleOpenNotebook(notebook)}
                                    className="group relative w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                    title="Open Notebook"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform group-hover:scale-110">
                                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                    </svg>
                                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  </button>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteNotebook(notebook.id);
                                    }}
                                    className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                    title="Delete Notebook"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform group-hover:scale-110">
                                      <path d="M3 6h18"></path>
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                      <line x1="10" x2="10" y1="11" y2="17"></line>
                                      <line x1="14" x2="14" y1="11" y2="17"></line>
                                    </svg>
                                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        {/* Create notebook modal */}
        {showCreateModal && (
          <CreateNotebookModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateNotebook}
          />
        )}

        {/* Python backend startup modal */}
        <PythonStartupModal
          isOpen={showStartupModal}
          onClose={() => setShowStartupModal(false)}
          onStartupComplete={() => {
            setShowStartupModal(false);
            // Refresh the backend health after successful startup
            setTimeout(() => {
              loadNotebooks();
            }, 1000);
          }}
        />
      </div>
    </div>
  );
};

const Notebooks: React.FC<NotebooksProps> = ({ onPageChange, userName }) => {
  return (
    <ProvidersProvider>
      <NotebooksContent onPageChange={onPageChange} userName={userName} />
    </ProvidersProvider>
  );
};

export default Notebooks; 
