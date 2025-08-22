import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import MonacoEditor from './MonacoEditor';
import { 
  Plus, 
  Search, 
  Filter, 
  Grid, 
  List, 
  FileText, 
  Folder,
  FolderOpen,
  Edit3,
  Trash2,
  Save,
  Eye,
  Bold,
  Italic,
  Underline,
  Link,
  Hash,
  Quote,
  Code,
  Image,
  Table,
  MoreHorizontal,
  Calendar,
  Clock,
  Star,
  Archive,
  X,
  ChevronRight,
  ChevronDown,
  File,
  FolderPlus,
  Edit,
  Check,
  Copy,
  CheckCircle,
  Circle,
  ExternalLink,
  Play,
  SplitSquareHorizontal,
  Monitor,
  Menu,
  PanelLeft
} from 'lucide-react';

// Import CSS for math rendering and markdown constraints
import 'katex/dist/katex.min.css';
import './markdown-styles.css';

// Separate Mermaid component to handle useEffect properly
const MermaidDiagram: React.FC<{ code: string; id: string }> = ({ code, id }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCodeRef = useRef<string>('');

  // Conservative syntax fixing function - only fix actual errors
  const fixMermaidSyntax = (code: string): string => {
    let fixed = code.trim();
    
    // Only fix clear syntax errors, don't touch valid syntax
    fixed = fixed
      // Fix only obvious malformed arrows (not valid labeled arrows like -->|label|)
      .replace(/-->->/g, '-->')  // Fix -->-> to -->
      .replace(/-->-(?!\|)/g, '-->')   // Fix -->- to --> (but not -->|label|)
      .replace(/->>->/g, '-->>')  // Fix ->>-> to -->>
      .replace(/->>-(?!\|)/g, '-->>')   // Fix ->>- to -->> (but not ->>|label|)
      
      // Fix incomplete arrows only at end of lines or before whitespace
      .replace(/\s+AWS\s*-\s*$/gm, ' AWS --> ')
      .replace(/\s+AWS\s*-\s+(?![|\w])/g, ' AWS --> ')  // Don't break AWS-something patterns
      
      // Fix single dash only when it's clearly wrong (not part of valid syntax)
      .replace(/([A-Za-z0-9_]+)\s+-\s*$/gm, '$1 --> ')   // Fix - at end of line
      .replace(/([A-Za-z0-9_]+)\s+-\s+(?![|\w])/g, '$1 --> ')  // Fix single dash but preserve - in valid contexts
      
      // Clean up extra spaces around arrows (but preserve labeled arrows)
      .replace(/\s*-->\s*(?!\|)/g, ' --> ')  // Clean --> but not -->|
      .replace(/\s*---\s*/g, ' --- ')
      .replace(/\s*-\.\s*/g, ' -. ')
      .replace(/\s*\.\.\>\s*/g, ' ..> ')
      
      // Ensure proper line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    
    return fixed;
  };

  // Validate if the diagram has proper Mermaid structure
  const isValidMermaid = (code: string): boolean => {
    const lines = code.split('\n').filter(line => line.trim());
    
    // Must have at least one diagram type deangelation
    const hasDeangelation = lines.some(line => 
      line.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gitgraph|pie|quadrantChart|timeline|mindmap|sankey|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment)\s/)
    );
    
    // Must have at least one connection or valid syntax
    const hasConnections = lines.some(line => 
      line.includes('-->') || 
      line.includes('---') ||
      line.includes('..>') ||
      line.includes('-.') ||
      line.match(/^\s*[A-Za-z0-9_]+\s*:/) || // sequence diagram
      line.match(/^\s*[A-Za-z0-9_]+\s*\{/) || // class diagram
      line.match(/^\s*[A-Za-z0-9_]+\s*\[/) // flowchart node
    );
    
    return hasDeangelation || hasConnections;
  };

  useEffect(() => {
    // Debounce rendering to prevent repeated attempts
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Skip if same code as last render
    if (lastCodeRef.current === code) {
      return;
    }

    renderTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        lastCodeRef.current = code;
        
        // Validate diagram code
        if (!code || !code.trim()) {
          setError('Empty diagram code');
          setIsLoading(false);
          return;
        }

        let cleanCode = code.trim();
        
        // Ensure diagram has a proper deangelation first
        if (!cleanCode.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gitgraph|pie|quadrantChart|timeline|mindmap|sankey|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment)/m)) {
          // Add a graph deangelation if missing
          cleanCode = `graph TD\n${cleanCode}`;
        }

        const { default: mermaid } = await import('mermaid');
        
        // Reinitialize mermaid with safe settings
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          logLevel: 'fatal', // Suppress console spam
          suppressErrorRendering: true, // Prevent DOM pollution
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis'
          },
          sequence: {
            useMaxWidth: true,
            wrap: true
          },
          gantt: {
            useMaxWidth: true
          }
        });

        // Generate unique ID to avoid conflicts
        const uniqueId = `mermaid-${id}-${Date.now()}`;
        
        // Clear any existing diagrams
        const existingEl = document.getElementById(uniqueId);
        if (existingEl) {
          existingEl.remove();
        }

        try {
          // First try to render the original code (with deangelation if needed)
          const result = await mermaid.render(uniqueId, cleanCode);
          setSvg(result.svg);
        } catch (originalError) {
          // Only if original fails, try with syntax fixes
          console.log('Original syntax failed, trying fixes...', originalError);
          
          const fixedCode = fixMermaidSyntax(cleanCode);
          
          if (!isValidMermaid(fixedCode)) {
            throw new Error('Invalid Mermaid syntax - missing diagram deangelation or connections');
          }
          
          const fixedResult = await mermaid.render(`${uniqueId}-fixed`, fixedCode);
          setSvg(fixedResult.svg);
        }
        
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        
        // Enhanced error reporting with specific guidance
        let errorMessage = 'Failed to render diagram';
        if (err instanceof Error) {
          if (err.message.includes('Parse error') || err.message.includes('Expecting')) {
            // Extract line number and issue from error
            const lineMatch = err.message.match(/line (\d+):/);
            const expectingMatch = err.message.match(/Expecting '([^']+)'/);
            
            errorMessage = `Syntax Error on line ${lineMatch ? lineMatch[1] : 'unknown'}`;
            if (expectingMatch) {
              errorMessage += ` - Expected: ${expectingMatch[1]}`;
            }
          } else {
            errorMessage = `Rendering Error: ${err.message}`;
          }
        }
        
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    // Cleanup
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [code, id]);

  if (isLoading) {
    return (
      <div className="my-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
          <span className="text-sm">Rendering Mermaid diagram...</span>
        </div>
      </div>
    );
  }

  if (error) {
    const fixedCode = fixMermaidSyntax(code);
    const showFixed = fixedCode !== code.trim();
    
    return (
      <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="text-red-600 dark:text-red-400 text-sm font-medium mb-2">Mermaid Syntax Error</div>
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
        
        {showFixed && (
          <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <p className="text-xs text-green-600 dark:text-green-400 mb-2">🔧 Suggested fix:</p>
            <pre className="text-xs text-green-700 dark:text-green-300 overflow-x-auto">
              {fixedCode}
            </pre>
          </div>
        )}
        
        <details className="text-xs">
          <summary className="text-red-500 dark:text-red-400 cursor-pointer hover:text-red-600 dark:hover:text-red-300">
            View original code
          </summary>
          <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/40 rounded text-red-700 dark:text-red-300 overflow-x-auto">
            {code}
          </pre>
        </details>
        
        <div className="mt-3 text-xs text-red-400 dark:text-red-500">
          <p className="font-medium mb-1">Quick fixes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Use proper arrows: <code>--&gt;</code> or <code>---</code></li>
            <li>Add diagram type: <code>flowchart TD</code> or <code>graph LR</code></li>
            <li>Check node syntax: <code>A[Node Name]</code></li>
            <li>Avoid special characters in node IDs</li>
            <li>Ensure balanced brackets and quotes</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 w-full overflow-hidden group">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 text-sm text-gray-300">
        <span>Mermaid Diagram</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-700 rounded"
            title="Copy original code"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div 
        className="flex justify-center items-center p-4 bg-white dark:bg-gray-900 rounded-b-lg border overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

interface Note {
  id: string;
  title: string;
  content: string;
  folder?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  linkedNotes: string[]; // IDs of notes this note links to
  backlinks: string[]; // IDs of notes that link to this note
}

interface Folder {
  id: string;
  name: string;
  parentId?: string;
  isExpanded: boolean;
}

interface NotebookCanvasProps {
  notebookId: string;
  onNoteCreated?: (note: Note) => void;
  onNoteUpdated?: (note: Note) => void;
  onNoteDeleted?: (noteId: string) => void;
}

const NotebookCanvas: React.FC<NotebookCanvasProps> = ({ 
  notebookId, 
  onNoteCreated, 
  onNoteUpdated, 
  onNoteDeleted 
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split'); // New view mode state - default to split for Notion-like experience
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const splitPreviewRef = useRef<HTMLDivElement>(null);

  // Load notes and folders from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem(`notebook-notes-${notebookId}`);
    const savedFolders = localStorage.getItem(`notebook-folders-${notebookId}`);
    
    if (savedNotes) {
      const parsedNotes = JSON.parse(savedNotes);
      setNotes(parsedNotes);
      // Auto-select first note if none selected
      if (parsedNotes.length > 0 && !selectedNoteId) {
        setSelectedNoteId(parsedNotes[0].id);
      }
    }
    if (savedFolders) {
      setFolders(JSON.parse(savedFolders));
    }
  }, [notebookId]);

  // Save notes to localStorage
  const saveNotes = useCallback((newNotes: Note[]) => {
    localStorage.setItem(`notebook-notes-${notebookId}`, JSON.stringify(newNotes));
    setNotes(newNotes);
  }, [notebookId]);

  // Save folders to localStorage
  const saveFolders = useCallback((newFolders: Folder[]) => {
    localStorage.setItem(`notebook-folders-${notebookId}`, JSON.stringify(newFolders));
    setFolders(newFolders);
  }, [notebookId]);

  // Debounced auto-save for backlinks processing
  const debouncedSave = useCallback((noteId: string, content: string) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      // Get fresh notes from localStorage to ensure we have the latest data
      const savedNotes = localStorage.getItem(`notebook-notes-${notebookId}`);
      const currentNotes = savedNotes ? JSON.parse(savedNotes) : [];
      
      const linkedNotes = extractLinkedNotes(content);
      
      // Update the note with linked notes
      const updatedNotes = currentNotes.map((note: Note) => 
        note.id === noteId 
          ? { ...note, linkedNotes }
          : note
      );
      
      // Update backlinks for all notes
      const notesWithBacklinks = updatedNotes.map((note: Note) => {
        // Remove this note from all backlinks first
        const cleanedBacklinks = (note.backlinks || []).filter(id => id !== noteId);
        
        // Add backlink if this note is linked
        if (linkedNotes.includes(note.id)) {
          return { ...note, backlinks: [...cleanedBacklinks, noteId] };
        }
        
        return { ...note, backlinks: cleanedBacklinks };
      });
      
      // Save final state with backlinks
      localStorage.setItem(`notebook-notes-${notebookId}`, JSON.stringify(notesWithBacklinks));
      
      if (onNoteUpdated) {
        const updatedNote = notesWithBacklinks.find((n: Note) => n.id === noteId);
        if (updatedNote) onNoteUpdated(updatedNote);
      }
    }, 500); // 500ms debounce
  }, [notebookId, onNoteUpdated]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Create a new folder
  const createFolder = () => {
    if (!newFolderName.trim()) return;
    
    const newFolder: Folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newFolderName.trim(),
      isExpanded: true
    };

    const updatedFolders = [...(folders || []), newFolder];
    saveFolders(updatedFolders);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // Edit folder name
  const editFolder = (folderId: string, newName: string) => {
    if (!newName.trim()) return;
    
    const updatedFolders = (folders || []).map(folder => 
      folder.id === folderId ? { ...folder, name: newName.trim() } : folder
    );
    saveFolders(updatedFolders);
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  // Delete folder and move notes to no folder
  const deleteFolder = (folderId: string) => {
    // Move all notes from this folder to no folder
    const updatedNotes = (notes || []).map(note => 
      note.folder === folderId ? { ...note, folder: undefined } : note
    );
    saveNotes(updatedNotes);
    
    // Remove the folder
    const updatedFolders = (folders || []).filter(folder => folder.id !== folderId);
    saveFolders(updatedFolders);
    
    // Clear selected folder if it was deleted
    if (selectedFolder === folderId) {
      setSelectedFolder(null);
    }
  };

  // Create a new note
  const createNote = (folder?: string) => {
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: 'Untitled Note',
      content: '',
      folder: folder || selectedFolder || undefined,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedNotes: [],
      backlinks: []
    };

    const updatedNotes = [...notes, newNote];
    saveNotes(updatedNotes);
    setSelectedNoteId(newNote.id);
    setIsEditing(true);
    setEditTitle(newNote.title);
    setEditContent(newNote.content);
    // Auto-collapse sidebar when creating a new note
    setIsSidebarCollapsed(true);
    onNoteCreated?.(newNote);
  };

  // Update note
  const updateNote = (noteId: string, updates: Partial<Note>) => {
    const updatedNotes = (notes || []).map(note => 
      note.id === noteId 
        ? { ...note, ...updates, updatedAt: new Date().toISOString() }
        : note
    );
    saveNotes(updatedNotes);
    
    const updatedNote = updatedNotes.find(n => n.id === noteId);
    if (updatedNote) {
      onNoteUpdated?.(updatedNote);
    }
  };

  // Delete note
  const deleteNote = (noteId: string) => {
    const updatedNotes = (notes || []).filter(note => note.id !== noteId);
    saveNotes(updatedNotes);
    
    if (selectedNoteId === noteId) {
      setSelectedNoteId(updatedNotes.length > 0 ? updatedNotes[0].id : null);
    }
    
    onNoteDeleted?.(noteId);
  };

  // Save current edit
  const saveEdit = () => {
    if (selectedNoteId) {
      // Process content for wiki-links [[Note Title]]
      const linkedNotes = extractLinkedNotes(editContent);
      
      // Update the note with new content
      const updatedNotes = (notes || []).map(note => 
        note.id === selectedNoteId 
          ? { ...note, title: editTitle, content: editContent, linkedNotes, updatedAt: new Date().toISOString() }
          : note
      );
      
      // Update backlinks for linked notes using the updated notes array
      const notesWithBacklinks = updatedNotes.map(note => {
        // Remove this note from all backlinks first
        const cleanedBacklinks = (note.backlinks || []).filter(id => id !== selectedNoteId);
        
        // Add backlink if this note is linked
        if (linkedNotes.includes(note.id)) {
          return { ...note, backlinks: [...cleanedBacklinks, selectedNoteId] };
        }
        
        return { ...note, backlinks: cleanedBacklinks };
      });
      
      // Save everything at once
      saveNotes(notesWithBacklinks);
      
      const updatedNote = notesWithBacklinks.find(n => n.id === selectedNoteId);
      if (updatedNote) {
        onNoteUpdated?.(updatedNote);
      }
    }
    setIsEditing(false);
    // Auto-expand sidebar when saving edit
    setIsSidebarCollapsed(false);
  };

  // Filter notes based on search and folder
  const filteredNotes = (notes || []).filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (note.tags || []).some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFolder = !selectedFolder || note.folder === selectedFolder;
    
    return matchesSearch && matchesFolder;
  });

  // Get current note
  const currentNote = (notes || []).find(n => n.id === selectedNoteId);

  // Extract [[Note Title]] links from content
  const extractLinkedNotes = (content: string): string[] => {
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const linkedTitle = match[1];
      const linkedNote = (notes || []).find(note => note.title === linkedTitle);
      if (linkedNote) {
        links.push(linkedNote.id);
      }
    }
    
    return links;
  };

  // Update backlinks for linked notes
  const updateBacklinks = (sourceNoteId: string, linkedNoteIds: string[]) => {
    const updatedNotes = (notes || []).map(note => {
      // Remove this note from all backlinks first
      const cleanedBacklinks = (note.backlinks || []).filter(id => id !== sourceNoteId);
      
      // Add backlink if this note is linked
      if (linkedNoteIds.includes(note.id)) {
        return { ...note, backlinks: [...cleanedBacklinks, sourceNoteId] };
      }
      
      return { ...note, backlinks: cleanedBacklinks };
    });
    
    saveNotes(updatedNotes);
  };

  // Cancel edit
  const cancelEdit = () => {
    const currentNote = (notes || []).find(n => n.id === selectedNoteId);
    if (currentNote) {
      setEditTitle(currentNote.title);
      setEditContent(currentNote.content);
    }
    setIsEditing(false);
    // Auto-expand sidebar when exiting edit mode
    setIsSidebarCollapsed(false);
  };

  // Start editing
  const startEdit = () => {
    const currentNote = (notes || []).find(n => n.id === selectedNoteId);
    if (currentNote) {
      setEditTitle(currentNote.title);
      setEditContent(currentNote.content);
      setIsEditing(true);
      // Auto-collapse sidebar when editing starts for more space
      setIsSidebarCollapsed(true);
    }
  };

  // Toggle sidebar collapse
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Initialize Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
    });
  }, []);

  // Keyboard shortcut for sidebar toggle (Ctrl/Cmd + \)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Enhanced markdown renderer with custom components
  const renderMarkdown = (content: string) => {
    // Process wiki links and special embeds before markdown rendering
    let processedContent = content.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
      const linkedNote = (notes || []).find(note => note.title === title);
      if (linkedNote) {
        return `<span class="wiki-link" data-note-id="${linkedNote.id}">${title}</span>`;
      }
      return `<span class="wiki-link-missing">${title}</span>`;
    });

    // Process YouTube embeds
    processedContent = processedContent.replace(
      /https:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/g,
      '<div class="youtube-embed" data-video-id="$1"></div>'
    );

    // Process callouts
    processedContent = processedContent.replace(
      /> \[!(info|warning|error|success|note)\]\s*(.+?)$/gm,
      '<div class="callout callout-$1">$2</div>'
    );

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        className="w-full"
        components={{
          // Custom code block renderer
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const isInline = !className;
            
            if (!isInline && language) {
              // Handle Mermaid diagrams
              if (language === 'mermaid') {
                const chartId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const chartCode = String(children);
                
                return <MermaidDiagram code={chartCode} id={chartId} />;
              }

              return (
                <div 
                  className="relative group my-4 overflow-hidden rounded-lg"
                  style={{ 
                    maxWidth: '100%', 
                    width: '100%',
                    minWidth: 0 
                  }}
                >
                  <div className="flex items-center justify-between bg-gray-800 px-4 py-2 text-sm text-gray-300">
                    <span className="truncate">{language}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(String(children))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-700 rounded flex-shrink-0"
                      title="Copy code"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div 
                    className="overflow-x-auto"
                    style={{ maxWidth: '100%' }}
                  >
                    <SyntaxHighlighter
                      style={oneDark as any}
                      language={language}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        maxWidth: '100%',
                        fontSize: '14px',
                        lineHeight: '1.4',
                      } as any}
                      wrapLines={true}
                      wrapLongLines={true}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                </div>
              );
            }
            
          return (
              <code 
                className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono break-all"
                style={{ 
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  maxWidth: '100%',
                  display: 'inline-block'
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          
          // Enhanced image renderer with zoom and captions
          img({ src, alt, title, ...props }) {
            return (
              <div className="my-4">
                <img
                  src={src}
                  alt={alt}
                  title={title}
                  className="max-w-full h-auto rounded-lg shadow-lg cursor-zoom-in hover:shadow-xl transition-shadow"
                  onClick={() => {
                    // Open image in modal/lightbox
                    window.open(src, '_blank');
                  }}
                  {...props}
                />
                {alt && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-2 italic">
                    {alt}
                  </p>
                )}
              </div>
            );
          },
          
          // Enhanced table renderer
          table({ children, ...props }) {
            return (
              <div 
                className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-gray-700"
                style={{ 
                  maxWidth: '100%',
                  width: '100%',
                  minWidth: 0
                }}
              >
                <table className="w-full table-auto" style={{ minWidth: '400px' }} {...props}>
                  {children}
                </table>
              </div>
            );
          },
          
          th({ children, ...props }) {
            return (
              <th className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left font-semibold" {...props}>
                {children}
              </th>
            );
          },
          
          td({ children, ...props }) {
            return (
              <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700" {...props}>
                {children}
              </td>
            );
          },
          
          // Enhanced blockquote
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-900/20 italic" {...props}>
                {children}
              </blockquote>
            );
          },
          
          // Task list items
          li({ children, ...props }) {
            const childrenStr = String(children);
            
            // Check if it's a task list item
            if (childrenStr.includes('[ ]') || childrenStr.includes('[x]')) {
              const isChecked = childrenStr.includes('[x]');
              const text = childrenStr.replace(/\[([ x])\]\s*/, '');
              
              return (
                <li className="flex items-center gap-2 my-1" {...props}>
                  {isChecked ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className={isChecked ? 'line-through text-gray-500' : ''}>{text}</span>
                </li>
              );
            }
            
            return <li {...props}>{children}</li>;
          },
          
          // Enhanced links
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http');
            
            return (
              <a
                href={href}
                className="text-blue-500 hover:text-blue-700 underline break-all"
                style={{
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  maxWidth: '100%',
                  display: 'inline-block'
                }}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              >
                <span className="inline-flex items-center gap-1 break-all">
                  <span className="break-all">{children}</span>
                  {isExternal && <ExternalLink className="w-3 h-3 flex-shrink-0" />}
                </span>
              </a>
            );
          },
          
          // Headers with anchors
          h1({ children, ...props }) {
            return <h1 className="text-3xl font-bold mt-6 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700" {...props}>{children}</h1>;
          },
          h2({ children, ...props }) {
            return <h2 className="text-2xl font-semibold mt-5 mb-3" {...props}>{children}</h2>;
          },
          h3({ children, ...props }) {
            return <h3 className="text-xl font-semibold mt-4 mb-2" {...props}>{children}</h3>;
          },
          h4({ children, ...props }) {
            return <h4 className="text-lg font-semibold mt-3 mb-2" {...props}>{children}</h4>;
          },
          
          // Paragraphs
          p({ children, ...props }) {
            return <p className="mb-3 leading-relaxed break-words overflow-wrap-anywhere" {...props}>{children}</p>;
          },
          
          // Horizontal rule
          hr({ ...props }) {
            return <hr className="my-6 border-gray-300 dark:border-gray-600" {...props} />;
          },
          
          // Custom span handler for wiki links
          span({ className, children, ...props }: any) {
            if (className === 'wiki-link') {
              const noteId = props['data-note-id'];
                  return (
                    <button
                      onClick={() => {
                    setSelectedNoteId(noteId);
                          setIsEditing(false);
                      }}
                  className="text-blue-500 hover:text-blue-700 underline bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded"
                    >
                  [[{children}]]
                    </button>
                  );
                }
            
            if (className === 'wiki-link-missing') {
              return (
                <span className="text-red-500 bg-red-50 dark:bg-red-900/20 px-1 py-0.5 rounded">
                  [[{children}]]
                </span>
              );
            }
            
            return <span className={className} {...props}>{children}</span>;
          },

          // Custom div handler for embeds and callouts
          div({ className, children, ...props }: any) {
            // YouTube embed
            if (className === 'youtube-embed') {
              const videoId = props['data-video-id'];
              return (
                <div className="my-4 w-full">
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-lg max-w-full">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="YouTube video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                </div>
              );
        }
        
            // Callouts
            if (className?.startsWith('callout')) {
              const type = className.split('-')[1];
              const styles = {
                info: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
                warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200',
                error: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
                success: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200',
                note: 'border-gray-500 bg-gray-50 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200',
              };

              const icons = {
                info: '💡',
                warning: '⚠️',
                error: '❌',
                success: '✅',
                note: '📝',
              };

              return (
                <div className={`border-l-4 p-4 my-4 rounded-r-lg ${styles[type as keyof typeof styles] || styles.note}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{icons[type as keyof typeof icons] || icons.note}</span>
                    <div className="flex-1">{children}</div>
                  </div>
                </div>
              );
            }

            return <div className={className} {...props}>{children}</div>;
          },
        }}
              >
          {processedContent}
        </ReactMarkdown>
    );
  };

  // Get notes without folder
  const notesWithoutFolder = (filteredNotes || []).filter(note => !note.folder);

  // Check if we have any content at all
  const hasAnyContent = (notes || []).length > 0 || (folders || []).length > 0;

  return (
    <div className="h-full flex bg-gradient-to-br from-white to-sakura-100/20 dark:from-gray-900 dark:to-sakura-900/10 overflow-hidden">
      {/* Collapsible Left Sidebar - File Tree */}
      <div className={`${isSidebarCollapsed ? 'w-0' : 'w-80'} flex flex-col glassmorphic-card border-r border-white/30 dark:border-gray-700/30 transition-all duration-300 ease-in-out overflow-hidden`}>
        {/* Sidebar Header */}
        <div className="px-6 py-5 glassmorphic border-b border-white/20 dark:border-gray-800/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notes</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="p-2.5 glassmorphic hover:bg-white/40 dark:hover:bg-gray-700/40 rounded-xl transition-all duration-200 text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 hover:scale-105"
                title="New Folder"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={() => createNote()}
                className="p-2.5 bg-gradient-to-r from-sakura-500 to-sakura-600 hover:from-sakura-600 hover:to-sakura-700 text-white rounded-xl transition-all duration-200 hover:scale-105 shadow-lg"
                title="New Note"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 glassmorphic border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:bg-white/90 dark:focus:bg-gray-600/90 text-gray-900 dark:text-white transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Create Folder Input */}
          {isCreatingFolder && (
            <div className="mt-4 p-4 glassmorphic-card rounded-xl border border-white/30 dark:border-gray-600/30">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createFolder();
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  className="flex-1 px-3 py-2.5 glassmorphic border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sakura-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  autoFocus
                />
                <button
                  onClick={createFolder}
                  className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 hover:scale-105 shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">Create</span>
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 glassmorphic hover:bg-white/40 dark:hover:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-all duration-200 hover:scale-105"
                >
                  <X className="w-4 h-4" />
                  <span className="text-sm font-medium">Cancel</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!hasAnyContent ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="glassmorphic-card bg-gradient-to-br from-sakura-50/50 to-pink-100/50 dark:from-sakura-900/20 dark:to-pink-900/20 rounded-2xl p-8 mb-6 shadow-xl">
                <FileText className="w-16 h-16 text-sakura-400 dark:text-sakura-500 mx-auto" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                No notes yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 text-sm leading-relaxed max-w-xs">
                Create your first note or organize with folders to get started
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => createNote()}
                  className="flex items-center justify-center gap-3 px-6 py-3.5 bg-gradient-to-r from-sakura-500 to-sakura-600 text-white rounded-xl hover:from-sakura-600 hover:to-sakura-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <Plus className="w-4 h-4" />
                  Create Note
                </button>
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="flex items-center justify-center gap-3 px-6 py-3.5 glassmorphic-card text-gray-700 dark:text-white border border-white/30 dark:border-gray-500/30 rounded-xl hover:bg-white/80 dark:hover:bg-gray-500/80 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <FolderPlus className="w-4 h-4" />
                  Create Folder
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Notes without folder */}
              {notesWithoutFolder.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 px-3 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3">
                    <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-semibold">Unsorted Notes</span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full ml-auto">
                      {notesWithoutFolder.length}
                    </span>
                  </div>
                  <div className="ml-2 space-y-2">
                    {notesWithoutFolder.map(note => (
                      <button
                        key={note.id}
                        onClick={() => {
                          setSelectedNoteId(note.id);
                          setIsEditing(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group ${
                          selectedNoteId === note.id 
                            ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-xl scale-105 ring-4 ring-sakura-100 dark:ring-sakura-900/20' 
                            : 'glassmorphic-card hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-900 dark:text-white shadow-lg hover:shadow-xl hover:scale-102'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${selectedNoteId === note.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'}`}>
                          <FileText className="w-4 h-4 flex-shrink-0" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate mb-1">{note.title}</div>
                          <div className="text-xs opacity-75 truncate leading-relaxed">{(note.content || '').substring(0, 60)}...</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Folders */}
              {(folders || []).map(folder => (
                <div key={folder.id} className="mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedFolder(selectedFolder === folder.id ? null : folder.id);
                        // Toggle folder expansion
                        const updatedFolders = (folders || []).map(f => 
                          f.id === folder.id ? { ...f, isExpanded: !f.isExpanded } : f
                        );
                        saveFolders(updatedFolders);
                      }}
                      className={`flex-1 flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group ${
                        selectedFolder === folder.id 
                          ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-xl ring-4 ring-purple-100 dark:ring-purple-900/20' 
                          : 'glassmorphic-card hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-900 dark:text-white shadow-lg hover:shadow-xl'
                      }`}
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${folder.isExpanded ? 'rotate-90' : ''} ${selectedFolder === folder.id ? 'text-white' : 'text-gray-400'}`} />
                      <div className={`p-2 rounded-lg ${selectedFolder === folder.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'}`}>
                        {folder.isExpanded ? <FolderOpen className="w-4 h-4 text-current" /> : <Folder className="w-4 h-4 text-current" />}
                      </div>
                      
                      {editingFolderId === folder.id ? (
                        <input
                          type="text"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') editFolder(folder.id, editingFolderName);
                            if (e.key === 'Escape') {
                              setEditingFolderId(null);
                              setEditingFolderName('');
                            }
                          }}
                          onBlur={() => editFolder(folder.id, editingFolderName)}
                          className="flex-1 text-sm font-semibold bg-transparent focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-semibold flex-1">{folder.name}</span>
                      )}
                      
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">
                        {(notes || []).filter(note => note.folder === folder.id).length}
                      </span>
                    </button>
                    
                    {/* Folder Actions */}
                    <button
                      onClick={() => {
                        setEditingFolderId(folder.id);
                        setEditingFolderName(folder.name);
                      }}
                      className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all duration-200"
                      title="Edit Folder"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteFolder(folder.id)}
                      className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200"
                      title="Delete Folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Notes in folder */}
                  {folder.isExpanded && (
                    <div className="ml-6 mt-3 space-y-2">
                      {(filteredNotes || [])
                        .filter(note => note.folder === folder.id)
                        .map(note => (
                          <button
                            key={note.id}
                            onClick={() => {
                              setSelectedNoteId(note.id);
                              setIsEditing(false);
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group ${
                              selectedNoteId === note.id 
                                ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-xl scale-105 ring-4 ring-sakura-100 dark:ring-sakura-900/20' 
                                : 'glassmorphic-card hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-900 dark:text-white shadow-lg hover:shadow-xl hover:scale-102'
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${selectedNoteId === note.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'}`}>
                              <FileText className="w-4 h-4 flex-shrink-0" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate mb-1">{note.title}</div>
                              <div className="text-xs opacity-75 truncate leading-relaxed">{(note.content || '').substring(0, 60)}...</div>
                            </div>
                          </button>
                        ))}
                      
                      {/* Create note in folder */}
                      <button
                        onClick={() => createNote(folder.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 border-2 border-dashed border-white/30 dark:border-gray-600/30 hover:border-sakura-400 dark:hover:border-sakura-500 hover:bg-sakura-50/20 dark:hover:bg-sakura-900/10 text-gray-600 dark:text-gray-400 hover:text-sakura-600 dark:hover:text-sakura-400 group glassmorphic-card"
                      >
                                                  <div className="p-2 rounded-lg glassmorphic group-hover:bg-sakura-200/50 dark:group-hover:bg-sakura-800/50 transition-all duration-200">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">New note in {folder.name}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentNote ? (
          <>
            {/* Editor Header */}
            <div className="flex items-center justify-between p-4 bg-white dark:bg-black border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Sidebar Toggle Button */}
                <button
                  onClick={toggleSidebar}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 text-gray-700 dark:text-gray-300 hover:scale-105"
                >
                  <PanelLeft className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
                  </span>
                </button>
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-xl font-semibold bg-transparent outline-none text-gray-900 dark:text-white flex-1"
                    placeholder="Note title..."
                  />
                ) : (
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                    {currentNote.title}
                  </h1>
                )}
                
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{new Date(currentNote.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={saveEdit}
                      className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {/* View Mode Controls */}
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    <button
                        onClick={() => setViewMode('edit')}
                        className={`p-2 rounded-md transition-colors ${
                          viewMode === 'edit' 
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                        title="Editor Only"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('split')}
                        className={`p-2 rounded-md transition-colors ${
                          viewMode === 'split' 
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                        title="Split View"
                      >
                        <SplitSquareHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`p-2 rounded-md transition-colors ${
                          viewMode === 'preview' 
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                        title="Preview Mode"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    </div>
                    

                    <button
                      onClick={() => deleteNote(currentNote.id)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-500 dark:text-red-400 rounded-lg transition-colors"
                      title="Delete Note"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {isEditing ? (
                <MonacoEditor
                  content={editContent}
                  onChange={setEditContent}
                  placeholder="Start writing your note here, this notes is for creating document from the chat

You can chat with your Document and you can use the content of the chat to create a document.

Tips:
- Use # for headers
- Use [[Note Title]] to link to other notes
- Use - for bullet points
- Use ** for bold text"
                  language="markdown"
                  theme="vs-dark"
                  height="100%"
                  className="w-full h-full"
                />
              ) : viewMode === 'edit' ? (
                <MonacoEditor
                  content={currentNote.content}
                  onChange={(newContent: string) => {
                    // Update the current note content immediately for responsive UI
                    const updatedNotes = (notes || []).map(note => 
                      note.id === currentNote.id 
                        ? { ...note, content: newContent, updatedAt: new Date().toISOString() }
                        : note
                    );
                    saveNotes(updatedNotes);
                    // Debounced save for backlinks and final persistence
                    debouncedSave(currentNote.id, newContent);
                  }}
                  placeholder="Start writing your note here, this notes is for creating document from the chat

You can chat with your Document and you can use the content of the chat to create a document.
Tips:
- Use # for headers
- Use [[Note Title]] to link to other notes
- Use - for bullet points
- Use ** for bold text
- Use ```mermaid for diagrams"
                  language="markdown"
                  theme="vs-dark"
                  height="100%"
                  className="w-full h-full"
                />
              ) : viewMode === 'split' ? (
                <div className="flex h-full">
                  {/* Editor Side */}
                  <div className="flex-1 border-r border-gray-200 dark:border-gray-700">
                    <MonacoEditor
                      content={currentNote.content}
                      onChange={(newContent: string) => {
                        // Update the current note content immediately for responsive UI
                        const updatedNotes = (notes || []).map(note => 
                          note.id === currentNote.id 
                            ? { ...note, content: newContent, updatedAt: new Date().toISOString() }
                            : note
                        );
                        saveNotes(updatedNotes);
                        // Debounced save for backlinks and final persistence
                        debouncedSave(currentNote.id, newContent);
                      }}
                      placeholder="Start writing your note here, this notes is for creating document from the chat

- You can chat with your Document and you can use the content of the chat to create a document.

Tips:
- Use # for headers
- Use [[Note Title]] to link to other notes
- Use - for bullet points
- Use ** for bold text
- Use ```mermaid for diagrams"
                      language="markdown"
                      theme="vs-dark"
                      height="100%"
                      className="w-full h-full"
                    />
                      </div>
                  
                  {/* Preview Side */}
                  <div 
                    ref={splitPreviewRef}
                    className="flex-1 h-full overflow-y-auto overflow-x-hidden p-6 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white markdown-content-container"
                  >
                    <div className="prose prose-gray dark:prose-invert max-w-none markdown-content">
                      {renderMarkdown(currentNote.content)}
                      </div>
                  </div>
                  </div>
              ) : (
                <div className="h-full overflow-y-auto overflow-x-hidden p-6 bg-white dark:bg-black text-gray-900 dark:text-white markdown-content-container">
                  <div className="prose prose-gray dark:prose-invert max-w-none markdown-content">
                    {renderMarkdown(currentNote.content)}
                </div>
              </div>
            )}
            </div>


          </>
        ) : (
          /* No Note Selected */
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-black">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No note selected
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Select a note from the sidebar or create a new one
              </p>
              <button
                onClick={() => createNote()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create your first note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Sidebar Toggle (when collapsed) */}
      {isSidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-50 p-3 bg-gradient-to-r from-sakura-500 to-sakura-600 hover:from-sakura-600 hover:to-sakura-700 text-white rounded-full shadow-xl glassmorphic-card border border-white/20 transition-all duration-200 hover:scale-110 animate-pulse"
          title="Show Sidebar (Ctrl+\)"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default NotebookCanvas; 
