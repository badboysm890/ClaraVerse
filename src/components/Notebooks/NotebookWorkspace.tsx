import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  BookOpen, 
  Network, 
  Sidebar, 
  ArrowLeft,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  Users,
  Download
} from 'lucide-react';
import NotebookChat from './NotebookChat';
import NotebookCanvas from './NotebookCanvas';
import GraphViewer from './GraphViewer';
import ExportModal from './ExportModal';
import NotebookExportService, { NotebookContent, ExportOptions } from './NotebookExportService';
import { notebookDataCollector } from './NotebookDataCollector';
import { NotebookResponse, NotebookDocumentResponse, angelaNotebookService } from '../../services/angelaNotebookService';
import { db } from '../../db';

interface NotebookWorkspaceProps {
  notebook: NotebookResponse;
  documents: NotebookDocumentResponse[];
  onClose: () => void;
  onNotebookUpdated: (notebook: NotebookResponse) => void;
  onDocumentsUpdated?: (documents: NotebookDocumentResponse[]) => void;
}

const NotebookWorkspace: React.FC<NotebookWorkspaceProps> = ({
  notebook,
  documents,
  onClose,
  onNotebookUpdated,
  onDocumentsUpdated
}) => {
  // Panel visibility states
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [rightSidebarContent, setRightSidebarContent] = useState<'chat' | 'outline' | 'graph'>('chat');
  
  // Layout states
  const [rightSidebarWidth, setRightSidebarWidth] = useState(500);
  
  // Note-related states
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  
  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [notebookContent, setNotebookContent] = useState<NotebookContent | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Wallpaper state
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

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

  // Calculate completed document count
  const completedDocumentCount = documents.filter(doc => doc.status === 'completed').length;

  // Handle document upload
  const handleDocumentUpload = async (files: File[]) => {
    if (!angelaNotebookService.isBackendHealthy()) {
      throw new Error('Notebook backend is not available');
    }

    try {
      const uploadedDocs = await angelaNotebookService.uploadDocuments(notebook.id, files);
      
      // Update notebook document count
      const updatedNotebook = {
        ...notebook,
        document_count: notebook.document_count + uploadedDocs.length
      };
      onNotebookUpdated(updatedNotebook);
      
      // Notify parent component of document updates
      if (onDocumentsUpdated) {
        onDocumentsUpdated([...uploadedDocs, ...documents]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // Get panel widths
  const getRightPanelWidth = () => showRightSidebar ? rightSidebarWidth : 0;
  const getCenterPanelWidth = () => `calc(100% - ${getRightPanelWidth()}px)`;

  // Handle note events
  const handleNoteCreated = (note: any) => {
    // Note created handler
  };

  const handleNoteUpdated = (note: any) => {
    // Note updated handler
  };

  const handleNoteDeleted = (noteId: string) => {
    // Remove from selected notes
    setSelectedNotes(prev => prev.filter(id => id !== noteId));
  };

  // Resize handler for right sidebar
  const handleRightResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = rightSidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(350, Math.min(800, startWidth - (e.clientX - startX)));
      setRightSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Auto-expand sidebar for different content types
  const handleContentChange = (contentType: 'chat' | 'outline' | 'graph') => {
    setRightSidebarContent(contentType);
    
    // Auto-expand to optimal width based on content type
    const optimalWidths = {
      chat: 500,    // Good width for chat messages and interactions
      outline: 400, // Compact width for outline/list view
      graph: 650    // Wider width for graph visualization and entity cards
    };
    
    // Only expand if current width is smaller than optimal
    const optimalWidth = optimalWidths[contentType];
    if (rightSidebarWidth < optimalWidth) {
      setRightSidebarWidth(Math.min(optimalWidth, 800)); // Don't exceed max width
    }
  };

  const handleOpenExportModal = async () => {
    setIsLoadingContent(true);
    setShowExportModal(true);
    
    try {
      // Collect notebook data when opening the modal
      let content: NotebookContent;
      
      try {
        // Try to collect real notebook data
        content = await notebookDataCollector.collectNotebookData(notebook.id);
        console.log('Collected real notebook data for export modal:', content);
      } catch (error) {
        console.warn('Failed to collect real data, using sample data:', error);
        // Fallback to sample data for demonstration
        content = await notebookDataCollector.createSampleData(notebook.id, notebook.name);
      }
      
      setNotebookContent(content);
    } catch (error) {
      console.error('Failed to load notebook content:', error);
      // Create minimal content structure as fallback
      setNotebookContent({
        notebook: {
          id: notebook.id,
          name: notebook.name,
          description: notebook.description || '',
          created_at: notebook.created_at || new Date().toISOString()
        },
        notes: [],
        chatHistory: [],
        graphData: undefined
      });
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleExport = async (options: ExportOptions) => {
    try {
      console.log('Starting export with options:', options);
      
      if (!notebookContent) {
        throw new Error('No notebook content available for export');
      }

      // Perform export
      console.log('Exporting with service...');
      const exportService = new NotebookExportService();
      const { blob, filename } = await exportService.export(notebookContent, options);

      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`Successfully exported notebook as ${filename}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error as Error).message);
    }
  };

  return (
    <div className="h-[95vh] flex bg-white dark:bg-black overflow-hidden relative">
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
      <div className="relative z-10 h-full flex w-full">
        {/* Center Panel - Notes Canvas */}
        <div 
          className="flex-1 bg-white dark:bg-black flex flex-col h-full min-w-0"
          style={{ width: getCenterPanelWidth() }}
        >
          {/* Center Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-black flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-500" />
                <span className="font-medium text-gray-900 dark:text-white">{notebook.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Export Button */}
              <button
                onClick={handleOpenExportModal}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Export</span>
              </button>

              {/* Right Panel Toggle */}
              <button
                onClick={() => {
                  if (!showRightSidebar) {
                    // Auto-expand to optimal width when opening sidebar
                    const optimalWidths = {
                      chat: 500,
                      outline: 400,
                      graph: 650
                    };
                    const optimalWidth = optimalWidths[rightSidebarContent];
                    setRightSidebarWidth(Math.min(optimalWidth, 800));
                  }
                  setShowRightSidebar(!showRightSidebar);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  showRightSidebar
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {showRightSidebar ? "Hide Panel" : "Show Panel"}
                </span>
              </button>
            </div>
          </div>

          {/* Notes Canvas */}
          <div className="flex-1 overflow-hidden min-h-0">
            <NotebookCanvas
              notebookId={notebook.id}
              onNoteCreated={handleNoteCreated}
              onNoteUpdated={handleNoteUpdated}
              onNoteDeleted={handleNoteDeleted}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        {showRightSidebar && (
          <>
            {/* Right Resize Handle */}
            <div
              className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors h-full"
              onMouseDown={handleRightResize}
            />

            <div 
              className="bg-white dark:bg-black border-l border-gray-200 dark:border-gray-700 flex flex-col h-full"
              style={{ width: rightSidebarWidth }}
            >
              {/* Right Sidebar Header with Tabs */}
              <div className="border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between p-3">
                  <h3 className="font-medium text-gray-900 dark:text-white">Tools & Chat</h3>
                  <button
                    onClick={() => setShowRightSidebar(false)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-sm font-medium">Close</span>
                  </button>
                </div>
                
                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => handleContentChange('chat')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      rightSidebarContent === 'chat'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                  </button>
                  <button
                    onClick={() => handleContentChange('outline')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      rightSidebarContent === 'outline'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Outline
                  </button>

                  <button
                    onClick={() => handleContentChange('graph')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      rightSidebarContent === 'graph'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <Network className="w-4 h-4" />
                    Graph
                  </button>
                </div>
              </div>

              {/* Right Sidebar Content */}
              <div className="flex-1 overflow-hidden min-h-0">
                {rightSidebarContent === 'chat' && (
                  <div className="h-full">
                    <NotebookChat
                      notebookId={notebook.id}
                      documentCount={documents.length}
                      completedDocumentCount={completedDocumentCount}
                      onDocumentUpload={handleDocumentUpload}
                    />
                  </div>
                )}
                {rightSidebarContent === 'outline' && (
                  <div className="p-4 h-full overflow-y-auto">
                    <NotebookOutline notebookId={notebook.id} selectedNotes={selectedNotes} />
                  </div>
                )}

                {rightSidebarContent === 'graph' && (
                  <div className="h-full">
                    <GraphViewer notebookId={notebook.id} onClose={() => setShowRightSidebar(false)} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Export Modal */}
        {notebookContent && (
          <ExportModal
            isOpen={showExportModal}
            onClose={() => {
              setShowExportModal(false);
              setNotebookContent(null);
            }}
            onExport={handleExport}
            notebookContent={notebookContent}
          />
        )}

        {/* Loading overlay for export modal */}
        {isLoadingContent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
              <span className="text-gray-900 dark:text-gray-100">Loading notebook content...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Outline Component
const NotebookOutline: React.FC<{ notebookId: string; selectedNotes: string[] }> = ({ notebookId, selectedNotes }) => {
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    const savedNotes = localStorage.getItem(`notebook-notes-${notebookId}`);
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    }
  }, [notebookId]);

  const groupedNotes = notes.reduce((acc, note) => {
    if (!acc[note.type]) {
      acc[note.type] = [];
    }
    acc[note.type].push(note);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {notes.length} notes total
      </div>
      
      {Object.entries(groupedNotes).map(([type, typeNotes]) => (
        <div key={type} className="space-y-2">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 capitalize flex items-center gap-2">
            {type === 'text' && <FileText className="w-4 h-4" />}
            {type === 'code' && <FileText className="w-4 h-4" />}
            {type === 'todo' && <FileText className="w-4 h-4" />}
            {type === 'idea' && <FileText className="w-4 h-4" />}
            {type === 'query' && <FileText className="w-4 h-4" />}
            {type} ({(typeNotes as any[]).length})
          </h3>
          <div className="space-y-1">
            {(typeNotes as any[]).map((note: any) => (
              <div
                key={note.id}
                className={`p-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  selectedNotes.includes(note.id)
                    ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="font-medium truncate">{note.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {note.content.substring(0, 50)}...
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {notes.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No notes yet</p>
          <p className="text-xs">Create your first note to see the outline</p>
        </div>
      )}
    </div>
  );
};

export default NotebookWorkspace; 
