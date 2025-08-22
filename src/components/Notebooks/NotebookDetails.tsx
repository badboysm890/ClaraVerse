import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  MessageSquare, 
  Trash2, 
  Search,
  Network,
  Calendar,
  FileType,
  Settings,
  AlertCircle,
  Bot,
  Layers,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  X,
  BookOpen
} from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import NotebookChat from './NotebookChat';
import GraphViewer from './GraphViewer';
import NotebookWorkspace from './NotebookWorkspace';
import { 
  angelaNotebookService, 
  NotebookResponse, 
  NotebookDocumentResponse 
} from '../../services/angelaNotebookService';
import { useProviders } from '../../contexts/ProvidersContext';
import { angelaApiService } from '../../services/angelaApiService';
import { angelaModel } from '../../types/angela_assistant_types';

interface NotebookDetailsProps {
  notebook: NotebookResponse;
  onClose: () => void;
  onNotebookUpdated: (notebook: NotebookResponse) => void;
  onNotebookDeleted: () => void;
}

const NotebookDetails: React.FC<NotebookDetailsProps> = ({ 
  notebook, 
  onClose, 
  onNotebookUpdated,
  onNotebookDeleted 
}) => {
  const [documents, setDocuments] = useState<NotebookDocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingLLM, setIsEditingLLM] = useState(false);
  const [selectedLLMProvider, setSelectedLLMProvider] = useState('');
  const [selectedLLMModel, setSelectedLLMModel] = useState('');
  const [models, setModels] = useState<angelaModel[]>([]);
  const [useWorkspaceView] = useState(true);
  
  // Get providers from context
  const { providers } = useProviders();

  // Load documents from API
  useEffect(() => {
    loadDocuments();
  }, [notebook.id]);

  // Load models when providers change
  useEffect(() => {
    if (providers.length > 0) {
      loadModels();
    }
  }, [providers]);

  // Initialize LLM selection with current notebook values
  useEffect(() => {
    if (notebook.llm_provider) {
      setSelectedLLMProvider(notebook.llm_provider.name);
      setSelectedLLMModel(notebook.llm_provider.model);
    }
  }, [notebook]);

  // Auto-refresh documents every 5 seconds if there are processing documents
  useEffect(() => {
    const hasProcessingDocs = documents.some(doc => doc.status === 'processing');
    
    if (!hasProcessingDocs) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, notebook.id]);

  const loadDocuments = async () => {
    if (!angelaNotebookService.isBackendHealthy()) {
      setError('Notebook backend is not available');
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load, not on auto-refresh
    if (documents.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      const data = await angelaNotebookService.listDocuments(notebook.id);
      setDocuments(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const allModels = await angelaApiService.getModels();
      setModels(allModels);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    switch (extension) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-600" />;
      case 'txt':
      case 'md':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'csv':
      case 'json':
        return <FileType className="w-4 h-4 text-green-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string, error?: string) => {
    switch (status) {
      case 'completed':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Completed
          </div>
        );
      case 'processing':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3 animate-spin" />
            Processing
          </div>
        );
      case 'failed':
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded-full text-xs font-medium" title={error}>
            <XCircle className="w-3 h-3" />
            Failed
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            {status}
          </div>
        );
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDocumentUpload = async (files: File[]) => {
    if (!angelaNotebookService.isBackendHealthy()) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const uploadedDocs = await angelaNotebookService.uploadDocuments(notebook.id, files);
      
      // Add new documents to the list
      setDocuments(prev => [...uploadedDocs, ...prev]);
      
      // Update notebook document count
      const updatedNotebook = {
        ...notebook,
        document_count: notebook.document_count + uploadedDocs.length
      };
      onNotebookUpdated(updatedNotebook);
      
      setShowUploadModal(false);
    } catch (error) {
      console.error('Upload failed:', error);
      throw error; // Re-throw so the modal can handle it
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    if (!angelaNotebookService.isBackendHealthy()) {
      setError('Notebook backend is not available');
      return;
    }

    try {
      await angelaNotebookService.deleteDocument(notebook.id, documentId);
      
      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      // Update notebook document count
      const updatedNotebook = {
        ...notebook,
        document_count: Math.max(0, notebook.document_count - 1)
      };
      onNotebookUpdated(updatedNotebook);
    } catch (error) {
      console.error('Failed to delete document:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete document');
    }
  };

  const handleUpdateLLM = async () => {
    // TODO: Implement LLM update functionality
    // This would require a backend API to update the notebook's LLM provider
    console.log('Update LLM not yet implemented');
    setIsEditingLLM(false);
  };

  const getLLMModels = (providerId: string) => {
    return models.filter(m => 
      m.provider === providerId && 
      (m.type === 'text' || m.type === 'multimodal')
    );
  };

  // If using workspace view, render the new layout
  if (useWorkspaceView) {
    return (
      <NotebookWorkspace
        notebook={notebook}
        documents={documents}
        onClose={onClose}
        onNotebookUpdated={onNotebookUpdated}
      />
    );
  }

  return (
    <div className="h-[94vh] flex flex-col bg-black dark:bg-black">
      {/* Compact Header */}
      <div className="flex-shrink-0 bg-white dark:bg-black px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Left side - Back button and notebook info */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <button
              onClick={onClose}
              className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </button>
            
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
            
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <div className="p-1.5 bg-sakura-100 dark:bg-sakura-900/30 rounded">
                <BookOpen className="h-4 w-4 text-sakura-600 dark:text-sakura-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {notebook.name}
                </h1>
                <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <FileText className="h-3 w-3" />
                    <span>{notebook.document_count} docs</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Bot className="h-3 w-3" />
                    <span>{notebook.llm_provider?.name}</span>
                  </div>
                </div>
              </div>
              

            </div>
          </div>
          
          {/* Right side - Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center space-x-1 bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-sm transition-colors"
            >
              <Upload className="h-3 w-3" />
              <span>Upload</span>
            </button>
            
            <button
              onClick={() => setShowGraphModal(true)}
              className="flex items-center space-x-1 bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm transition-colors"
            >
              <Network className="h-3 w-3" />
              <span>Graph</span>
            </button>
            
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Documents panel */}
        <div className="w-1/3 bg-white dark:bg-black overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Documents</h2>
              <button
                onClick={() => setShowUploadModal(true)}
                className="text-sakura-500 hover:text-sakura-600 transition-colors"
              >
                <Upload className="h-5 w-5" />
              </button>
            </div>
            
            {/* Search documents */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-black text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:bg-white dark:focus:bg-black transition-colors"
              />
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          )}

          {/* Documents list */}
          <div className="p-4 space-y-3">
            {isLoading && documents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sakura-500"></div>
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading...</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {documents.length === 0 ? 'No documents uploaded yet' : 'No documents match your search'}
                </p>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 bg-gray-50 dark:bg-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1 min-w-0">
                      {getFileIcon(doc.filename)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {doc.filename}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          {getStatusBadge(doc.status, doc.error)}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(doc.uploaded_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors ml-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="w-px bg-gray-200 dark:bg-gray-800"></div>

        {/* Chat panel */}
        <div className="flex-1 bg-gray-50 dark:bg-black">
          <NotebookChat 
            notebookId={notebook.id} 
            documentCount={notebook.document_count}
            completedDocumentCount={documents.filter(doc => doc.status === 'completed').length}
          />
        </div>
      </div>

      {/* Modals */}
      {showUploadModal && (
        <DocumentUpload 
          onClose={() => setShowUploadModal(false)}
          onUpload={handleDocumentUpload}
        />
      )}

      {showGraphModal && (
        <GraphViewer 
          notebookId={notebook.id}
          onClose={() => setShowGraphModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glassmorphic-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-600 rounded-lg text-white">
                  <Settings className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Notebook Settings
                </h2>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-white/20 dark:hover:bg-black/30 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* AI Configuration */}
              <div className="glassmorphic-card p-6 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    AI Configuration
                  </h3>
                  {!isEditingLLM && notebook.llm_provider && (
                    <button
                      onClick={() => setIsEditingLLM(true)}
                      className="p-2 hover:bg-white/20 dark:hover:bg-black/30 rounded-lg transition-colors"
                      title="Edit LLM Configuration"
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
                
                {notebook.llm_provider && notebook.embedding_provider ? (
                  <div className="space-y-4">
                    {/* LLM Configuration */}
                    <div className="p-4 bg-white/50 dark:bg-black/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-700 dark:text-gray-300">Language Model</span>
                      </div>
                      {isEditingLLM ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
                            <select
                              value={selectedLLMProvider}
                              onChange={(e) => {
                                setSelectedLLMProvider(e.target.value);
                                setSelectedLLMModel('');
                              }}
                              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-white"
                            >
                              <option value="">Select Provider</option>
                              {providers.filter(p => p.isEnabled).map(provider => (
                                <option key={provider.id} value={provider.name}>
                                  {provider.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Model</label>
                            <select
                              value={selectedLLMModel}
                              onChange={(e) => setSelectedLLMModel(e.target.value)}
                              disabled={!selectedLLMProvider}
                              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-white disabled:opacity-50"
                            >
                              <option value="">Select Model</option>
                              {selectedLLMProvider && getLLMModels(selectedLLMProvider).map(model => (
                                <option key={model.id} value={model.name}>
                                  {model.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={handleUpdateLLM}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={() => setIsEditingLLM(false)}
                              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{notebook.llm_provider.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">{notebook.llm_provider.model}</div>
                        </div>
                      )}
                    </div>
                    
                    {/* Embedding Configuration */}
                    <div className="p-4 bg-white/50 dark:bg-black/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-gray-700 dark:text-gray-300">Embedding Model</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{notebook.embedding_provider.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{notebook.embedding_provider.model}</div>
                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Cannot be changed (dimensions fixed once created)
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                    Provider configuration not available (legacy notebook)
                  </div>
                )}
              </div>

              {/* System Status */}
              <div className="glassmorphic-card p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Backend Connection</span>
                    <div className={`flex items-center gap-2 ${angelaNotebookService.isBackendHealthy() ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${angelaNotebookService.isBackendHealthy() ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      {angelaNotebookService.isBackendHealthy() ? 'Connected' : 'Disconnected'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Documents</span>
                    <span className="text-gray-900 dark:text-white font-medium">{notebook.document_count}</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="glassmorphic-card p-6 rounded-lg bg-red-50/50 dark:bg-red-900/10">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-400 mb-4">Danger Zone</h3>
                <div className="space-y-3">
                  <button
                    onClick={loadDocuments}
                    disabled={!angelaNotebookService.isBackendHealthy()}
                    className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Refresh All Documents
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      onNotebookDeleted();
                    }}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    Delete Notebook
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookDetails; 
