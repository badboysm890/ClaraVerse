import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, FileText, Code, Eye, Play, Save, RefreshCw, MessageSquare, Menu, X, Settings, CheckCircle, AlertTriangle,
  Plus, FolderPlus, Upload, Image, File, Folder, FolderOpen, MoreHorizontal, Trash2, Edit2, Copy, Terminal
} from 'lucide-react';
import { LiteProject, LiteProjectFile } from '../LumaUILite';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import LumaUILiteChatWindow from './LumaUILiteChatWindow';
import AISettingsModal from './AISettingsModal';
import { useProviders } from '../../contexts/ProvidersContext';
import { WebContainer } from '@webcontainer/api';
import type { FileSystemTree } from '@webcontainer/api';

interface LumaUILiteEditorProps {
  project: LiteProject;
  onUpdateProject: (project: LiteProject) => void;
  onBackToProjects: () => void;
}

// WebContainer state interface
interface ContainerState {
  status: 'idle' | 'booting' | 'ready' | 'running' | 'error';
  previewUrl?: string;
  port?: number;
  error?: string;
}

// AI Parameters interface
interface AIParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxIterations: number;
}

const LumaUILiteEditor: React.FC<LumaUILiteEditorProps> = ({
  project,
  onUpdateProject,
  onBackToProjects
}) => {
  const [selectedFile, setSelectedFile] = useState<LiteProjectFile | null>(null);
  const [projectFiles, setProjectFiles] = useState<LiteProjectFile[]>(project.projectFiles || []);
  const [previewKey, setPreviewKey] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isAutoSave, setIsAutoSave] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const chatWidth = 25; // Fixed 25% width for chat panel - CANNOT BE CHANGED
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file?: LiteProjectFile } | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  
  // AI Settings Modal state
  const [showAISettingsModal, setShowAISettingsModal] = useState(false);
  
  // Providers context
  const { providers } = useProviders();
  
  // AI Settings state from chat window
  const [aiSettings, setAISettings] = useState<{
    selectedProviderId: string;
    selectedModel: string;
    parameters: AIParameters;
    availableModels: string[];
    customSystemPrompt: string;
    handleProviderChange: (providerId: string) => void;
    handleModelChange: (model: string) => void;
    handleParametersChange: (params: AIParameters) => void;
    handleSystemPromptChange: (prompt: string) => void;
  } | null>(null);
  
  // WebContainer state
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [containerState, setContainerState] = useState<ContainerState>({ status: 'idle' });
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isFileExplorerOpen, setIsFileExplorerOpen] = useState(false); // Default collapsed
  const [isCodeEditorOpen, setIsCodeEditorOpen] = useState(false); // Default collapsed
  
  const previewRef = useRef<HTMLIFrameElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // Add WebContainer sync debouncing to prevent excessive remounting during auto mode
  const webContainerSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingWebContainerSync, setPendingWebContainerSync] = useState(false);
  
  // Preview mode detection - use simple iframe for basic HTML/CSS/JS, WebContainer for complex projects
  const [previewMode, setPreviewMode] = useState<'simple' | 'webcontainer'>('simple');
  
  // Current page for simple preview navigation
  const [currentPage, setCurrentPage] = useState<string>('index.html');
  
  // Detect if project needs WebContainer (has package.json, complex structure, etc.)
  const needsWebContainer = useMemo(() => {
    const hasPackageJson = projectFiles.some(f => f.name === 'package.json');
    const hasNodeModules = projectFiles.some(f => f.path.includes('node_modules'));
    const hasComplexStructure = projectFiles.some(f => f.path.includes('/src/') || f.path.includes('/components/'));
    const hasFrameworkFiles = projectFiles.some(f => 
      f.name.endsWith('.tsx') || f.name.endsWith('.jsx') || 
      f.name.endsWith('.vue') || f.name.endsWith('.svelte')
    );
    
    return hasPackageJson || hasNodeModules || hasComplexStructure || hasFrameworkFiles;
  }, [projectFiles]);

  // Handle navigation messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'navigate-to-page') {
        const { page } = event.data;
        console.log('LumaUI-lite: Navigation request received:', page);
        
        // Check if the page exists in project files
        const pageExists = projectFiles.some(f => f.name === page);
        if (pageExists) {
          setCurrentPage(page);
          setPreviewKey(prev => prev + 1); // Force iframe refresh with new content
          addTerminalOutput(`📄 Navigated to ${page}`, 'info');
        } else {
          addTerminalOutput(`❌ Page not found: ${page}`, 'error');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [projectFiles]);

  // Handle keyboard shortcuts for panel toggles
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'e':
            event.preventDefault();
            setIsCodeEditorOpen(prev => !prev);
            break;
          case 'f':
            event.preventDefault();
            setIsFileExplorerOpen(prev => !prev);
            break;
          case 'b':
            event.preventDefault();
            setIsChatOpen(prev => !prev);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper function to add terminal output
  const addTerminalOutput = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const colorCode = type === 'error' ? '\x1b[31m' : type === 'success' ? '\x1b[32m' : '\x1b[36m';
    const resetCode = '\x1b[0m';
    const formattedMessage = `${colorCode}[${timestamp}] ${message}${resetCode}`;
    
    setTerminalOutput(prev => [...prev, formattedMessage]);
    
    // Auto-scroll terminal
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 10);
  }, []);

  // Initialize WebContainer when component mounts
  useEffect(() => {
    const initWebContainer = async () => {
      try {
        if (!window.crossOriginIsolated) {
          setContainerState({ 
            status: 'error', 
            error: 'WebContainer requires cross-origin isolation. Please restart the development server.' 
          });
          addTerminalOutput('❌ WebContainer requires cross-origin isolation', 'error');
          addTerminalOutput('💡 Please restart the development server to apply COEP changes', 'info');
          return;
        }

        addTerminalOutput('🚀 Initializing WebContainer with external resource support...', 'info');
        setContainerState({ status: 'booting' });
        
        // Configure WebContainer with relaxed COEP settings for external resources
        const container = await WebContainer.boot({
          coep: 'credentialless', // Allow external resources with credentials protection
          forwardPreviewErrors: true // Forward errors for debugging
        });
        setWebContainer(container);
        setContainerState({ status: 'ready' });
        addTerminalOutput('✅ WebContainer initialized with external resource support', 'success');
        addTerminalOutput('🌐 External CDNs and resources are now supported', 'success');
        
      } catch (error) {
        console.error('Failed to initialize WebContainer:', error);
        const errorMessage = String(error);
        setContainerState({ status: 'error', error: errorMessage });
        addTerminalOutput(`❌ Failed to initialize WebContainer: ${errorMessage}`, 'error');
        
        if (errorMessage.includes('cross-origin')) {
          addTerminalOutput('💡 Try restarting the development server', 'info');
        }
      }
    };

    initWebContainer();

    // Cleanup on unmount
    return () => {
      if (webContainer) {
        try {
          webContainer.teardown();
        } catch (error) {
          console.error('Error during WebContainer teardown:', error);
        }
      }
    };
  }, []);

  // Mount files to WebContainer when it's ready
  useEffect(() => {
    if (webContainer && containerState.status === 'ready' && projectFiles.length > 0) {
      mountFilesToContainer();
    }
  }, [webContainer, containerState.status, projectFiles]);

  // Convert project files to WebContainer file system format
  const createFileSystemTree = (): FileSystemTree => {
    const tree: FileSystemTree = {};
    
    projectFiles.forEach(file => {
      if (file.type === 'file') {
        const pathParts = file.path.split('/');
        let current = tree;
        
        // Create nested structure
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!current[part]) {
            current[part] = { directory: {} };
          }
          current = (current[part] as any).directory;
        }
        
        // Add file
        const fileName = pathParts[pathParts.length - 1];
        current[fileName] = { file: { contents: file.content } };
      }
    });

    // Add package.json for proper web development
    tree['package.json'] = {
      file: {
        contents: JSON.stringify({
          name: project.name.toLowerCase().replace(/\s+/g, '-'),
          version: '1.0.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            serve: 'vite preview'
          },
          devDependencies: {
            'vite': '^5.0.0'
          }
        }, null, 2)
      }
    };

    // Add vite.config.js with CORS and external resource support
    tree['vite.config.js'] = {
      file: {
        contents: `import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    cors: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: []
    }
  },
  optimizeDeps: {
    include: []
  }
})`
      }
    };

    return tree;
  };

  // Mount files to WebContainer
  const mountFilesToContainer = async () => {
    if (!webContainer) return;

    try {
      addTerminalOutput('📁 Mounting files to WebContainer...', 'info');
      const fileSystemTree = createFileSystemTree();
      await webContainer.mount(fileSystemTree);
      addTerminalOutput('✅ Files mounted successfully', 'success');
    } catch (error) {
      console.error('Failed to mount files:', error);
      addTerminalOutput(`❌ Failed to mount files: ${error}`, 'error');
    }
  };

  // Debounced WebContainer sync to prevent excessive remounting during auto mode
  const debouncedWebContainerSync = useCallback(async () => {
    // Only sync if we're in WebContainer mode and container is active
    if (previewMode !== 'webcontainer' || !webContainer || containerState.status === 'idle') {
      return;
    }

    // Clear any existing timeout
    if (webContainerSyncTimeoutRef.current) {
      clearTimeout(webContainerSyncTimeoutRef.current);
    }

    // Set pending sync state
    setPendingWebContainerSync(true);

    // Debounce the sync operation
    webContainerSyncTimeoutRef.current = setTimeout(async () => {
      try {
        addTerminalOutput('🔄 Syncing files to WebContainer (debounced)...', 'info');
        await mountFilesToContainer();
        addTerminalOutput('✅ WebContainer sync completed', 'success');
      } catch (error) {
        console.error('Failed to sync WebContainer:', error);
        addTerminalOutput(`❌ WebContainer sync failed: ${error}`, 'error');
      } finally {
        setPendingWebContainerSync(false);
      }
    }, 2000); // 2 second debounce to prevent excessive syncing
  }, [previewMode, webContainer, containerState.status, mountFilesToContainer]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (webContainerSyncTimeoutRef.current) {
        clearTimeout(webContainerSyncTimeoutRef.current);
      }
    };
  }, []);

  // Auto-detect preview mode based on project complexity
  useEffect(() => {
    if (needsWebContainer && previewMode === 'simple') {
      setPreviewMode('webcontainer');
      addTerminalOutput('🔄 Switching to WebContainer mode for complex project', 'info');
    } else if (!needsWebContainer && previewMode === 'webcontainer') {
      setPreviewMode('simple');
      addTerminalOutput('🔄 Switching to simple preview mode for basic HTML/CSS/JS', 'info');
    }
  }, [needsWebContainer, previewMode]);

  // Start development server
  const startServer = async () => {
    if (!webContainer || containerState.status !== 'ready') return;

    try {
      setContainerState({ status: 'running' });
      addTerminalOutput('📦 Installing dependencies...', 'info');

      // Install dependencies
      const installProcess = await webContainer.spawn('npm', ['install']);
      
      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          // Clean ANSI codes for display
          const cleanData = data.replace(/\x1b\[[0-9;]*[mGKH]/g, '');
          if (cleanData.trim()) {
            addTerminalOutput(cleanData.trim(), 'info');
          }
        }
      }));

      const installExitCode = await installProcess.exit;
      if (installExitCode !== 0) {
        throw new Error('Failed to install dependencies');
      }

      addTerminalOutput('🌐 Starting development server...', 'info');

      // Start dev server
      const devProcess = await webContainer.spawn('npm', ['run', 'dev']);
      
      devProcess.output.pipeTo(new WritableStream({
        write(data) {
          const cleanData = data.replace(/\x1b\[[0-9;]*[mGKH]/g, '');
          if (cleanData.trim()) {
            addTerminalOutput(cleanData.trim(), 'info');
          }
        }
      }));

      // Listen for server ready
      webContainer.on('server-ready', (port, url) => {
        setContainerState({ 
          status: 'running', 
          port, 
          previewUrl: url 
        });
        addTerminalOutput(`🎉 Server ready at ${url}`, 'success');
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      setContainerState({ status: 'error', error: String(error) });
      addTerminalOutput(`❌ Failed to start server: ${error}`, 'error');
    }
  };

  // Stop development server
  const stopServer = async () => {
    if (!webContainer) return;

    try {
      addTerminalOutput('🛑 Stopping server...', 'info');
      // Note: WebContainer doesn't have a direct stop method, 
      // but we can reset the container state
      setContainerState({ status: 'ready' });
      addTerminalOutput('✅ Server stopped', 'success');
    } catch (error) {
      console.error('Failed to stop server:', error);
      addTerminalOutput(`❌ Failed to stop server: ${error}`, 'error');
    }
  };

  // Initialize with existing files or create default files
  useEffect(() => {
    if (projectFiles.length === 0 && project.files) {
      const defaultFiles: LiteProjectFile[] = [];
      
      if (project.files.html) {
        defaultFiles.push({
          id: `file-${Date.now()}-1`,
          name: 'index.html',
          path: 'index.html',
          content: project.files.html,
          type: 'file',
          mimeType: 'text/html',
          extension: 'html',
          lastModified: new Date()
        });
      }
      
      if (project.files.css) {
        defaultFiles.push({
          id: `file-${Date.now()}-2`,
          name: 'styles.css',
          path: 'styles.css',
          content: project.files.css,
          type: 'file',
          mimeType: 'text/css',
          extension: 'css',
          lastModified: new Date()
        });
      }
      
      if (project.files.js) {
        defaultFiles.push({
          id: `file-${Date.now()}-3`,
          name: 'script.js',
          path: 'script.js',
          content: project.files.js,
          type: 'file',
          mimeType: 'application/javascript',
          extension: 'js',
          lastModified: new Date()
        });
      }
      
      if (defaultFiles.length > 0) {
        setProjectFiles(defaultFiles);
        setSelectedFile(defaultFiles[0]);
      }
    } else if (projectFiles.length > 0 && !selectedFile) {
      setSelectedFile(projectFiles[0]);
    }
  }, [project, projectFiles.length]);

  // Auto-save functionality - triggers on any file changes (manual or AI)
  // Uses longer timeout during auto mode to prevent excessive saves
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (isAutoSave && projectFiles.length > 0) {
      // Use longer timeout if WebContainer sync is pending (only in WebContainer mode)
      const saveTimeout = (previewMode === 'webcontainer' && pendingWebContainerSync) ? 5000 : 1500;
      
      autoSaveTimeoutRef.current = setTimeout(async () => {
        await handleSave();
        addTerminalOutput('💾 Project auto-saved', 'success');
        
        // For simple mode, refresh preview after save to show changes
        if (previewMode === 'simple') {
          setPreviewKey(prev => prev + 1);
        }
      }, saveTimeout);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [projectFiles, isAutoSave, pendingWebContainerSync, previewMode]);

  // Update Monaco editor content when selected file content changes (from AI updates)
  useEffect(() => {
    if (selectedFile && editorRef.current) {
      const currentEditorContent = editorRef.current.getValue();
      if (currentEditorContent !== selectedFile.content) {
        editorRef.current.setValue(selectedFile.content);
      }
    }
  }, [selectedFile?.content]);

  const handleFileContentChange = (content: string) => {
    if (!selectedFile) return;
    
    setProjectFiles(prev => prev.map(file => 
      file.id === selectedFile.id 
        ? { ...file, content, lastModified: new Date() }
        : file
    ));

    // Only sync individual file changes to WebContainer when in WebContainer mode
    if (previewMode === 'webcontainer' && webContainer && containerState.status !== 'idle') {
      webContainer.fs.writeFile(selectedFile.path, content).catch(error => {
        console.error('Failed to sync file to WebContainer:', error);
        addTerminalOutput(`Failed to sync ${selectedFile.path}: ${error}`, 'error');
      });
    }
  };

  const handleSave = async () => {
    const updatedProject = {
      ...project,
      projectFiles,
      // Update legacy files for backward compatibility
      files: {
        html: projectFiles.find(f => f.name === 'index.html')?.content || '',
        css: projectFiles.find(f => f.name === 'styles.css')?.content || '',
        js: projectFiles.find(f => f.name === 'script.js')?.content || ''
      }
    };
    onUpdateProject(updatedProject);
    setLastSaved(new Date());

    // Only sync to WebContainer if we're in WebContainer mode and it's active
    if (previewMode === 'webcontainer' && webContainer && containerState.status !== 'idle') {
      debouncedWebContainerSync();
    }
  };

  const handleRefreshPreview = () => {
    if (previewMode === 'simple') {
      // For simple mode, just refresh the iframe
      setPreviewKey(prev => prev + 1);
      addTerminalOutput('🔄 Refreshing simple preview...', 'info');
    } else if (previewMode === 'webcontainer' && containerState.status === 'running') {
      // For WebContainer mode, refresh the iframe
      setPreviewKey(prev => prev + 1);
      addTerminalOutput('🔄 Refreshing WebContainer preview...', 'info');
    } else {
      // If WebContainer is not running, just refresh the key
      setPreviewKey(prev => prev + 1);
      addTerminalOutput('🔄 Preview refreshed', 'info');
    }
  };

  const generatePreviewContent = (fileName: string = 'index.html') => {
    const htmlFile = projectFiles.find(f => f.name === fileName);
    if (!htmlFile) return '<html><body><p>No ' + fileName + ' file found</p></body></html>';
    
    let htmlContent = htmlFile.content;
    
    // **PURE USER CODE APPROACH**: Show exactly what user wrote, like CodePen/JSFiddle
    // Only inline local files (CSS/JS) for proper preview functionality
    
    // Replace CSS file references with inline content (for preview functionality)
    const cssFile = projectFiles.find(f => f.name === 'styles.css');
    if (cssFile) {
      htmlContent = htmlContent.replace(
        /<link[^>]+href=["']styles\.css["'][^>]*>/gi,
        `<style>${cssFile.content}</style>`
      );
    }
    
    // Replace JS file references with inline content (for preview functionality)
    const jsFile = projectFiles.find(f => f.name === 'script.js');
    if (jsFile) {
      htmlContent = htmlContent.replace(
        /<script[^>]+src=["']script\.js["'][^>]*><\/script>/gi,
        `<script>${jsFile.content}</script>`
      );
    }
    
    // Handle local image references (data URLs for preview)
    projectFiles.filter(f => f.isImage).forEach(imageFile => {
      const regex = new RegExp(`src=["']${imageFile.name}["']`, 'gi');
      htmlContent = htmlContent.replace(regex, `src="${imageFile.content}"`);
    });
    
    // Add iframe-specific enhancements for better navigation handling
    const availableFiles = projectFiles.map(f => f.name).filter(name => name.endsWith('.html'));
    
    // CSS for proper iframe layout and scrolling
    const iframeCSSFixes = `
      <style>
        /* Ensure proper scrolling and layout within iframe */
        html, body {
          margin: 0;
          padding: 0;
          overflow: auto !important;
          height: auto !important;
          min-height: 100vh;
        }
        * {
          box-sizing: border-box;
        }
      </style>
    `;
    
    // Add CSS to head if possible, otherwise add before body
    if (htmlContent.includes('</head>')) {
      htmlContent = htmlContent.replace('</head>', `${iframeCSSFixes}\n</head>`);
    } else if (htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<head>', `<head>\n${iframeCSSFixes}`);
    } else {
      // If no head tag, add after <html> or at the beginning
      if (htmlContent.includes('<html>')) {
        htmlContent = htmlContent.replace('<html>', `<html>\n<head>${iframeCSSFixes}</head>`);
      } else {
        htmlContent = `<head>${iframeCSSFixes}</head>\n` + htmlContent;
      }
    }
    
    const iframeEnhancements = `
      <script>
        // Available HTML files in the project
        const availableFiles = ${JSON.stringify(availableFiles)};
        
        // Prevent iframe navigation issues and ensure smooth scrolling works
        document.addEventListener('DOMContentLoaded', function() {
          console.log('LumaUI-lite: Initializing iframe navigation enhancements');
          console.log('LumaUI-lite: Available HTML files:', availableFiles);
          
          // Handle all link clicks intelligently
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            console.log('LumaUI-lite: Link clicked:', href);
            
            // Handle anchor links (smooth scrolling within page)
            if (href.startsWith('#')) {
              const target = document.querySelector(href);
              if (target) {
                e.preventDefault();
                e.stopPropagation();
                console.log('LumaUI-lite: Scrolling to target:', href);
                
                target.scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'start'
                });
              } else {
                console.warn('LumaUI-lite: Target not found for:', href);
              }
              return;
            }
            
                         // Handle navigation to project files
             if (availableFiles.includes(href)) {
               e.preventDefault();
               console.log('LumaUI-lite: Requesting navigation to project file:', href);
               // Send navigation request to parent
               window.parent.postMessage({
                 type: 'navigate-to-page',
                 page: href
               }, '*');
               return;
             }
            
            // Handle external links (allow them to open)
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
              console.log('LumaUI-lite: External link, allowing navigation:', href);
              return;
            }
            
            // Handle relative links to non-existent files
            if (!href.startsWith('#') && !availableFiles.includes(href)) {
              e.preventDefault();
              console.warn('LumaUI-lite: File not found in project:', href);
              alert('File "' + href + '" not found in project. Please create this file first.');
              return;
            }
          }, true); // Use capture phase to override other handlers
          
          // Only prevent beforeunload for external navigation attempts
          window.addEventListener('beforeunload', function(e) {
            // Check if this is a legitimate navigation to a project file
            const currentHref = window.location.href;
            if (currentHref.includes('about:srcdoc')) {
              // We're in an iframe with srcdoc, allow internal navigation
              return;
            }
            
            console.log('LumaUI-lite: Preventing external beforeunload');
            e.preventDefault();
            return false;
          });
        });
      </script>
    `;
    
    // Inject iframe enhancements before closing body tag
    if (htmlContent.includes('</body>')) {
      htmlContent = htmlContent.replace('</body>', `${iframeEnhancements}\n</body>`);
    } else {
      htmlContent += iframeEnhancements;
    }
    
    // Return enhanced user code with iframe navigation fixes
    return htmlContent;
  };

  const getFileIcon = (file: LiteProjectFile) => {
    if (file.type === 'directory') {
      return expandedFolders.has(file.path) ? 
        <FolderOpen className="w-4 h-4 text-blue-500" /> : 
        <Folder className="w-4 h-4 text-blue-500" />;
    }
    
    if (file.isImage) {
      return <Image className="w-4 h-4 text-green-500" />;
    }
    
    switch (file.extension) {
      case 'html':
        return <FileText className="w-4 h-4 text-orange-500" />;
      case 'css':
        return <Code className="w-4 h-4 text-blue-500" />;
      case 'js':
      case 'ts':
        return <Code className="w-4 h-4 text-yellow-500" />;
      default:
        return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  const getLanguageFromFile = (file: LiteProjectFile): string => {
    if (!file.extension) return 'plaintext';
    
    const ext = file.extension.toLowerCase();
    switch (ext) {
      case 'tsx':
      case 'ts':
        return 'typescript';
      case 'jsx':
      case 'js':
        return 'javascript';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      default:
        return 'plaintext';
    }
  };

  // File operations
  const handleCreateFile = (fileName: string, content: string = '') => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const newFile: LiteProjectFile = {
      id: `file-${Date.now()}`,
      name: fileName,
      path: fileName,
      content,
      type: 'file',
      mimeType: getMimeType(extension),
      extension,
      lastModified: new Date()
    };
    
    setProjectFiles(prev => [...prev, newFile]);
    setSelectedFile(newFile);
  };

  const handleFileUpload = (files: FileList) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension);
        
        const newFile: LiteProjectFile = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name,
          path: file.name,
          content: e.target?.result as string,
          type: 'file',
          mimeType: file.type,
          size: file.size,
          isImage,
          extension,
          lastModified: new Date()
        };
        
        setProjectFiles(prev => [...prev, newFile]);
      };
      
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleDeleteFile = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      setProjectFiles(prev => prev.filter(f => f.id !== fileId));
      if (selectedFile?.id === fileId) {
        setSelectedFile(projectFiles.find(f => f.id !== fileId) || null);
      }
    }
  };

  const handleRenameFile = (fileId: string, newName: string) => {
    const extension = newName.split('.').pop()?.toLowerCase() || '';
    setProjectFiles(prev => prev.map(file => 
      file.id === fileId 
        ? { 
            ...file, 
            name: newName, 
            path: newName, 
            extension,
            mimeType: getMimeType(extension),
            lastModified: new Date() 
          }
        : file
    ));
    setIsRenaming(null);
  };

  const getMimeType = (extension: string): string => {
    const mimeTypes: Record<string, string> = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'json': 'application/json',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp'
    };
    return mimeTypes[extension] || 'text/plain';
  };

  // Calculate preview width based on open panels
  const getPreviewWidth = () => {
    const chatSpace = isChatOpen ? chatWidth : 0;
    const rightPanelSpace = (isCodeEditorOpen || isFileExplorerOpen) ? 50 : 0; // 50% for right panel when open
    return 100 - chatSpace - rightPanelSpace;
  };

  // Setup Monaco editor
  const setupLanguageService = useCallback(async (monacoInstance: typeof monaco) => {
    if (!monacoInstance) return;

    try {
      const compilerOptions: monaco.languages.typescript.CompilerOptions = {
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        allowJs: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        forceConsistentCasingInFileNames: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
        isolatedModules: false,
        noEmit: true,
        jsx: monaco.languages.typescript.JsxEmit.None,
        module: monaco.languages.typescript.ModuleKind.ES2015,
        noImplicitAny: false,
        strictNullChecks: false,
      };

      monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
      monacoInstance.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);

      monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
      });

      monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
      });

      // Create models for all project files
      projectFiles.filter(f => !f.isImage).forEach(file => {
        const language = getLanguageFromFile(file);
        const uri = monacoInstance.Uri.parse(`file:///${file.path}`);
        
        let model = monacoInstance.editor.getModel(uri);
        if (model) {
          model.setValue(file.content);
        } else {
          model = monacoInstance.editor.createModel(file.content, language, uri);
        }
      });

      // Add DOM types
      const domTypes = `
declare var document: Document;
declare var window: Window;
declare var console: Console;
declare var localStorage: Storage;
declare var sessionStorage: Storage;
declare var fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;

interface Document {
  getElementById(elementId: string): HTMLElement | null;
  querySelector(selectors: string): Element | null;
  querySelectorAll(selectors: string): NodeList;
  createElement(tagName: string): HTMLElement;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  body: HTMLElement;
  head: HTMLElement;
  title: string;
}

interface HTMLElement {
  innerHTML: string;
  textContent: string;
  style: CSSStyleDeangelation;
  classList: DOMTokenList;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  click(): void;
  focus(): void;
  blur(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
}
`;

      monacoInstance.languages.typescript.javascriptDefaults.addExtraLib(domTypes, 'file:///lib.dom.d.ts');
      
      monacoInstance.languages.css.cssDefaults.setOptions({
        data: { useDefaultDataProvider: true },
        lint: {
          compatibleVendorPrefixes: 'warning',
          vendorPrefix: 'warning',
          duplicateProperties: 'warning',
          emptyRules: 'warning',
          importStatement: 'warning',
          boxModel: 'warning',
          universalSelector: 'warning',
          zeroUnits: 'warning',
          fontFaceProperties: 'warning',
          hexColorLength: 'warning',
          argumentsInColorFunction: 'warning',
          unknownProperties: 'warning',
          ieHack: 'warning',
          unknownVendorSpecificProperties: 'warning',
          propertyIgnoredDueToDisplay: 'warning',
          important: 'warning',
          float: 'warning',
          idSelector: 'warning'
        }
      });

      monacoInstance.languages.html.htmlDefaults.setOptions({
        format: {
          tabSize: 2,
          insertSpaces: true,
          wrapLineLength: 120,
          unformatted: 'default',
          contentUnformatted: 'pre,code,textarea',
          indentInnerHtml: false,
          preserveNewLines: true,
          maxPreserveNewLines: undefined,
          indentHandlebars: false,
          endWithNewline: false,
          extraLiners: 'head, body, /html',
          wrapAttributes: 'auto'
        },
        suggest: {
          html5: true,
          angular1: false,
          ionic: false
        }
      });

      console.log('✅ Language service configured for LumaUI-lite');
    } catch (error) {
      console.error('Failed to setup language service:', error);
    }
  }, [projectFiles]);

  const handleEditorDidMount = useCallback(async (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    await setupLanguageService(monacoInstance);

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      handleSave();
    });

    editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF],
      run: () => {
        editor.getAction('editor.action.formatDocument')?.run();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });
    
    const editorElement = editor.getDomNode();
    if (editorElement?.parentElement) {
      resizeObserver.observe(editorElement.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [setupLanguageService]);

  useEffect(() => {
    if (!monacoRef.current) return;
    
    const timeoutId = setTimeout(() => {
      setupLanguageService(monacoRef.current!);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [projectFiles, setupLanguageService]);

  const getDiagnostics = useCallback(() => {
    if (!monacoRef.current || !selectedFile) return [];
    
    const uri = monacoRef.current.Uri.parse(`file:///${selectedFile.path}`);
    const markers = monacoRef.current.editor.getModelMarkers({ resource: uri });
    return markers;
  }, [selectedFile]);

  const diagnostics = getDiagnostics();
  const hasErrors = diagnostics.some(d => d.severity === monaco?.MarkerSeverity.Error);
  const hasWarnings = diagnostics.some(d => d.severity === monaco?.MarkerSeverity.Warning);

  const formatLastSaved = () => {
    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'Just saved';
    if (minutes === 1) return '1 minute ago';
    return `${minutes} minutes ago`;
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleCreateFileFromChat = (newFile: Omit<LiteProjectFile, 'id' | 'lastModified'>) => {
    // Use the path instead of name to ensure proper file paths
    const filePath = newFile.path || newFile.name;
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    
    const newFileWithId: LiteProjectFile = {
      id: `file-${Date.now()}`,
      name: newFile.name,
      path: filePath,
      content: newFile.content || '',
      type: 'file',
      mimeType: getMimeType(extension),
      extension,
      lastModified: new Date()
    };
    
    setProjectFiles(prev => [...prev, newFileWithId]);
    setSelectedFile(newFileWithId);
  };

  const handleFileSelectFromChat = (path: string) => {
    const file = projectFiles.find(f => f.path === path);
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpdateFileFromChat = (fileId: string, content: string) => {
    setProjectFiles(prev => prev.map(file => 
      file.id === fileId 
        ? { ...file, content, lastModified: new Date() }
        : file
    ));

    // If this is the currently selected file, update the editor content
    if (selectedFile?.id === fileId) {
      // The Monaco editor will be updated through the useEffect that watches selectedFile
    }

    // Only sync individual file changes to WebContainer when in WebContainer mode
    if (previewMode === 'webcontainer' && webContainer && containerState.status !== 'idle') {
      const file = projectFiles.find(f => f.id === fileId);
      if (file) {
        webContainer.fs.writeFile(file.path, content).catch(error => {
          console.error('Failed to sync file to WebContainer:', error);
          addTerminalOutput(`Failed to sync ${file.path}: ${error}`, 'error');
        });
      }
    }
  };

  return (
    <div className="h-full bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 overflow-hidden w-full max-w-full" style={{ maxWidth: '100vw' }}>
      <div className="h-full flex flex-col w-full max-w-full" style={{ maxWidth: '100vw' }}>
        {/* Header */}
        <div className="glassmorphic border-b border-white/20 dark:border-gray-700/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBackToProjects}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Projects
              </button>
              
              <div className="border-l border-gray-300 dark:border-gray-600 pl-4">
                <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  {project.name}
                </h1>
                <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  {project.type} • {formatLastSaved()} • {projectFiles.length} files
                  {isAutoSave && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                      Auto-save ON
                    </span>
                  )}
                  {pendingWebContainerSync && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-1 animate-pulse"></div>
                      Syncing...
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    <Code className="w-3 h-3 mr-1" />
                    Editor {isCodeEditorOpen ? 'ON' : 'OFF'}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <FolderOpen className="w-3 h-3 mr-1" />
                    Explorer {isFileExplorerOpen ? 'ON' : 'OFF'}
                  </span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`p-2 rounded-lg transition-colors ${
                  isChatOpen 
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Toggle chat (Ctrl/Cmd + B)"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setIsCodeEditorOpen(!isCodeEditorOpen)}
                className={`p-2 rounded-lg transition-colors ${
                  isCodeEditorOpen 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Toggle code editor (Ctrl/Cmd + E)"
              >
                <Code className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setIsFileExplorerOpen(!isFileExplorerOpen)}
                className={`p-2 rounded-lg transition-colors ${
                  isFileExplorerOpen 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Toggle file explorer (Ctrl/Cmd + F)"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setupLanguageService(monacoRef.current!)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Refresh IntelliSense"
              >
                <Settings className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleRefreshPreview}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Refresh preview"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setIsAutoSave(!isAutoSave)}
                className={`p-2 rounded-lg transition-colors ${
                  isAutoSave 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={`Auto-save is ${isAutoSave ? 'ON' : 'OFF'} - Click to toggle`}
              >
                <Save className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                Manual Save
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden w-full max-w-full" style={{ width: '100%', maxWidth: '100vw' }}>
          {/* Left Panel - Chat (Fixed 25% Width) */}
          <div 
            className="chat-panel-container transition-all duration-300 ease-in-out flex-shrink-0"
            style={{ 
              width: isChatOpen ? `${chatWidth}%` : '0px', 
              minWidth: isChatOpen ? `${chatWidth}%` : '0px',
              maxWidth: isChatOpen ? `${chatWidth}%` : '0px',
              opacity: isChatOpen ? 1 : 0 
            }}
          >
            {isChatOpen && (
              <LumaUILiteChatWindow
                projectFiles={projectFiles}
                onUpdateFile={handleUpdateFileFromChat}
                onCreateFile={handleCreateFileFromChat}
                onDeleteFile={handleDeleteFile}
                onFileSelect={handleFileSelectFromChat}
                onProjectUpdate={setProjectFiles}
                projectId={project.id}
                projectName={project.name}
                showAISettingsModal={showAISettingsModal}
                onShowAISettingsModal={() => setShowAISettingsModal(true)}
                onCloseAISettingsModal={() => setShowAISettingsModal(false)}
                onAISettingsChange={setAISettings}
              />
            )}
          </div>

          {/* Center Panel - Preview */}
          <div 
            className="glassmorphic flex flex-col min-w-0 relative overflow-hidden"
            style={{ 
              width: `${getPreviewWidth()}%`,
              maxWidth: `${getPreviewWidth()}%`,
              minWidth: '0px',
              flexShrink: 0
            }}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/20 dark:border-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Preview
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-1"></div>
                  {previewMode === 'simple' ? 'Simple' : 'WebContainer'}
                </span>
                {previewMode === 'simple' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    📄 {currentPage}
                  </span>
                )}
                {previewMode === 'webcontainer' && containerState.status === 'running' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                    Live
                  </span>
                )}
                {previewMode === 'webcontainer' && containerState.status === 'error' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    Error
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {previewMode === 'simple' && currentPage !== 'index.html' && (
                  <button
                    onClick={() => {
                      setCurrentPage('index.html');
                      setPreviewKey(prev => prev + 1);
                      addTerminalOutput('🏠 Navigated to home page', 'info');
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/30 transition-colors"
                    title="Go to home page"
                  >
                    🏠 Home
                  </button>
                )}
                <button
                  onClick={() => {
                    const newMode = previewMode === 'simple' ? 'webcontainer' : 'simple';
                    setPreviewMode(newMode);
                    addTerminalOutput(`🔄 Switched to ${newMode} preview mode`, 'info');
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                  title={`Switch to ${previewMode === 'simple' ? 'WebContainer' : 'Simple'} mode`}
                >
                  <RefreshCw className="w-3 h-3" />
                  {previewMode === 'simple' ? 'Use WebContainer' : 'Use Simple'}
                </button>
                {previewMode === 'webcontainer' && containerState.status === 'ready' && (
                  <button
                    onClick={startServer}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Start
                  </button>
                )}
                {previewMode === 'webcontainer' && containerState.status === 'running' && (
                  <button
                    onClick={stopServer}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Stop
                  </button>
                )}
                <button
                  onClick={() => setShowTerminal(!showTerminal)}
                  className={`p-1 rounded transition-colors ${
                    showTerminal 
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="Toggle terminal"
                >
                  <Terminal className="w-3 h-3" />
                </button>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={isAutoSave}
                    onChange={(e) => setIsAutoSave(e.target.checked)}
                    className="rounded"
                  />
                  Auto-save
                </label>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Preview Area */}
              <div className={`${showTerminal ? 'flex-1' : 'flex-1'} flex flex-col min-h-0`}>
                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm m-4 min-h-0">
                  {previewMode === 'simple' ? (
                    /* Simple HTML/CSS/JS Preview */
                    <iframe
                      key={previewKey}
                      ref={previewRef}
                      className="w-full h-full border-0 bg-white"
                      srcDoc={generatePreviewContent(currentPage)}
                      title="Simple Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      style={{
                        colorScheme: 'light',
                        backgroundColor: '#ffffff',
                        minHeight: '100%',
                        overflow: 'auto'
                      }}
                    />
                  ) : previewMode === 'webcontainer' ? (
                    /* WebContainer Preview for Complex Projects */
                    containerState.status === 'running' && containerState.previewUrl ? (
                      <iframe
                        key={previewKey}
                        ref={previewRef}
                        className="w-full h-full border-0 bg-white"
                        src={containerState.previewUrl}
                        title="WebContainer Preview"
                        style={{
                          colorScheme: 'light',
                          backgroundColor: '#ffffff',
                          minHeight: '100%',
                          overflow: 'auto'
                        }}
                      />
                    ) : containerState.status === 'error' ? (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                            WebContainer Error
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {containerState.error || 'Failed to start the development server'}
                          </p>
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                setContainerState({ status: 'ready' });
                                addTerminalOutput('Resetting container state...', 'info');
                              }}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                            >
                              Reset Container
                            </button>
                            <button
                              onClick={() => {
                                setPreviewMode('simple');
                                addTerminalOutput('Switching to simple preview mode...', 'info');
                              }}
                              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm ml-2"
                            >
                              Use Simple Preview
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                            {containerState.status === 'booting' ? (
                              <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                            ) : (
                              <Eye className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
                            {containerState.status === 'booting' ? 'Initializing WebContainer...' : 
                             containerState.status === 'ready' ? 'Ready to Start' : 'Starting Preview'}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {containerState.status === 'booting' ? 'Setting up development environment' :
                             containerState.status === 'ready' ? 'Click Start to launch your application' :
                             'Preparing your application preview'}
                          </p>
                          {containerState.status === 'ready' && (
                            <div className="space-y-2">
                              <button
                                onClick={startServer}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm mx-auto"
                              >
                                <Play className="w-4 h-4" />
                                Start Development Server
                              </button>
                              <button
                                onClick={() => {
                                  setPreviewMode('simple');
                                  addTerminalOutput('Switching to simple preview mode...', 'info');
                                }}
                                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                              >
                                Use Simple Preview Instead
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              </div>

              {/* Terminal Panel (Collapsible) */}
              {showTerminal && (
                <div className="h-64 border-t border-white/20 dark:border-gray-700/50 flex flex-col">
                  <div className="flex items-center justify-between p-2 border-b border-white/20 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Terminal className="w-3 h-3" />
                      Terminal Output
                    </h4>
                    <button
                      onClick={() => setTerminalOutput([])}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div 
                    ref={terminalRef}
                    className="flex-1 p-3 bg-gray-900 overflow-y-auto font-mono text-xs"
                  >
                    {terminalOutput.length === 0 ? (
                      <div className="text-gray-500">No output yet...</div>
                    ) : (
                      terminalOutput.map((line, index) => (
                        <div 
                          key={index} 
                          className="text-green-400 whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{
                            __html: line.replace(/\x1b\[[0-9;]*m/g, (match) => {
                              // Basic ANSI color code handling
                              if (match.includes('31')) return '<span style="color: #ef4444">';
                              if (match.includes('32')) return '<span style="color: #22c55e">';
                              if (match.includes('36')) return '<span style="color: #06b6d4">';
                              if (match.includes('0')) return '</span>';
                              return '';
                            })
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Editor & File Tree */}
          {(isCodeEditorOpen || isFileExplorerOpen) && (
            <div 
              className="glassmorphic border-l border-white/20 dark:border-gray-700/50 flex flex-col overflow-hidden"
              style={{ 
                width: '50%',
                maxWidth: '50%',
                minWidth: '0px',
                flexShrink: 0
              }}
            >
            {/* Monaco Editor */}
            {isCodeEditorOpen && (
              <div className={`flex flex-col min-h-0 ${isFileExplorerOpen ? 'flex-1' : 'flex-1'}`}>
                {/* Code Editor Header */}
                <div className="flex items-center justify-between p-2 border-b border-white/20 dark:border-gray-700/50 bg-purple-50 dark:bg-purple-900/20">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Code Editor
                    </span>
                    {selectedFile && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                        {selectedFile.name}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setIsCodeEditorOpen(false)}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Collapse editor"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
              {selectedFile && !selectedFile.isImage ? (
                <>
                  <div className="flex items-center justify-between p-2 border-b border-white/20 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50">
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {selectedFile.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getLanguageFromFile(selectedFile)}
                      </span>
                      <span className="text-xs text-green-600 dark:text-green-400">
                        IntelliSense
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900">
                    <Editor
                      height="100%"
                      language={getLanguageFromFile(selectedFile)}
                      value={selectedFile.content}
                      onChange={(value) => handleFileContentChange(value || '')}
                      theme="vs-dark"
                      onMount={handleEditorDidMount}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        renderWhitespace: 'selection',
                        automaticLayout: true,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        folding: true,
                        autoIndent: 'full',
                        formatOnPaste: true,
                        formatOnType: true,
                        suggest: {
                          showKeywords: true,
                          showSnippets: true,
                          showFunctions: true,
                          showConstructors: true,
                          showFields: true,
                          showVariables: true,
                          showClasses: true,
                          showStructs: true,
                          showInterfaces: true,
                          showModules: true,
                          showProperties: true,
                          showEvents: true,
                          showOperators: true,
                          showUnits: true,
                          showValues: true,
                          showConstants: true,
                          showEnums: true,
                          showEnumMembers: true,
                          showColors: true,
                          showFiles: true,
                          showReferences: true,
                          showFolders: true,
                          showTypeParameters: true,
                        },
                        quickSuggestions: {
                          other: true,
                          comments: true,
                          strings: true
                        },
                        parameterHints: {
                          enabled: true,
                          cycle: true
                        },
                        hover: {
                          enabled: true,
                          delay: 300
                        },
                        lightbulb: {
                          enabled: 'on' as any
                        },
                        padding: { top: 8, bottom: 8 },
                        fontFamily: '"Fira Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
                        fontLigatures: true,
                        cursorBlinking: 'smooth',
                        renderLineHighlight: 'gutter',
                        smoothScrolling: true,
                        mouseWheelZoom: true,
                        contextmenu: true,
                        copyWithSyntaxHighlighting: true,
                        links: true,
                        colorDecorators: true,
                        dragAndDrop: true,
                        showFoldingControls: 'always',
                        foldingStrategy: 'indentation',
                        showUnused: true,
                        bracketPairColorization: {
                          enabled: true
                        },
                        guides: {
                          bracketPairs: true,
                          bracketPairsHorizontal: true,
                          highlightActiveBracketPair: true,
                          indentation: true,
                          highlightActiveIndentation: true
                        },
                        inlineSuggest: {
                          enabled: true
                        }
                      }}
                    />
                  </div>
                </>
              ) : selectedFile?.isImage ? (
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="text-center">
                    <img 
                      src={selectedFile.content} 
                      alt={selectedFile.name}
                      className="max-w-full max-h-64 rounded-lg shadow-lg mb-4"
                    />
                    <p className="text-sm text-gray-600 dark:text-gray-400">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      {selectedFile.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Image file'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center shadow-lg">
                      <Code className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                      Select a File
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                      Choose a file from the tree to start editing, or create a new file to begin coding.
                    </p>
                  </div>
                </div>
              )}
              </div>
            )}

            {/* Empty State when both panels are collapsed */}
            {!isCodeEditorOpen && !isFileExplorerOpen && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
                    <Menu className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                    Panels Collapsed
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    Use the toggle buttons in the header to open the Code Editor or File Explorer panels.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setIsCodeEditorOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
                    >
                      <Code className="w-4 h-4" />
                      Open Editor
                    </button>
                    <button
                      onClick={() => setIsFileExplorerOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Open Explorer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* File Tree */}
            {isFileExplorerOpen && (
              <div className={`border-t border-white/20 dark:border-gray-700/50 flex flex-col ${isCodeEditorOpen ? 'h-64' : 'flex-1'}`}>
              {/* File Explorer Header */}
              <div className="flex items-center justify-between p-3 border-b border-white/20 dark:border-gray-700/50 bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    File Explorer
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {projectFiles.length} files
                  </span>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsFileExplorerOpen(false)}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors mr-2"
                    title="Collapse explorer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const fileName = prompt('Enter file name:');
                      if (fileName) handleCreateFile(fileName);
                    }}
                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                    title="Create New File"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                    title="Upload Files"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Simple File List */}
              <div className="flex-1 overflow-auto p-2">
                {projectFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <File className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No files in this project</p>
                    <button
                      onClick={() => {
                        const fileName = prompt('Enter file name:');
                        if (fileName) handleCreateFile(fileName);
                      }}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                      Create First File
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {projectFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                          selectedFile?.id === file.id
                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
                        }`}
                        onClick={() => !file.isImage && setSelectedFile(file)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, file });
                        }}
                      >
                        {/* Simple File Icon */}
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${
                          file.type === 'directory' 
                            ? 'bg-blue-500' 
                            : file.isImage
                              ? 'bg-green-500'
                              : file.extension === 'html'
                                ? 'bg-orange-500'
                                : file.extension === 'css'
                                  ? 'bg-blue-500'
                                  : file.extension === 'js' || file.extension === 'ts'
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-500'
                        }`}>
                          {file.extension ? file.extension.charAt(0).toUpperCase() : 'F'}
                        </div>
                        
                        {/* File Name */}
                        <div className="flex-1 min-w-0">
                          {isRenaming === file.id ? (
                            <input
                              type="text"
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              onBlur={() => {
                                if (newFileName.trim() && newFileName !== file.name) {
                                  handleRenameFile(file.id, newFileName.trim());
                                }
                                setIsRenaming(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (newFileName.trim() && newFileName !== file.name) {
                                    handleRenameFile(file.id, newFileName.trim());
                                  }
                                  setIsRenaming(null);
                                } else if (e.key === 'Escape') {
                                  setIsRenaming(null);
                                }
                              }}
                              className="w-full px-1 py-0.5 text-sm bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                          ) : (
                            <div className={`text-sm truncate ${
                              selectedFile?.id === file.id
                                ? 'text-blue-700 dark:text-blue-300 font-medium'
                                : 'text-gray-800 dark:text-gray-200'
                            }`}>
                              {file.name}
                            </div>
                          )}
                        </div>
                        
                        {/* Simple File Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsRenaming(file.id);
                              setNewFileName(file.name);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors"
                            title="Rename"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete ${file.name}?`)) {
                                handleDeleteFile(file.id);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) {
            handleFileUpload(e.target.files);
          }
        }}
      />

      {/* Simple Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-32"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onBlur={() => setContextMenu(null)}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {contextMenu.file?.name}
            </div>
          </div>
          
          <button
            onClick={() => {
              setIsRenaming(contextMenu.file!.id);
              setNewFileName(contextMenu.file!.name);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Rename
          </button>
          
          <button
            onClick={() => {
              // Duplicate file logic here
              const extension = contextMenu.file!.extension;
              const baseName = contextMenu.file!.name.replace(`.${extension}`, '');
              const newName = extension ? `${baseName}_copy.${extension}` : `${baseName}_copy`;
              handleCreateFile(newName, contextMenu.file!.content);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
          
          <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
          
          <button
            onClick={() => {
              if (confirm(`Delete ${contextMenu.file!.name}?`)) {
                handleDeleteFile(contextMenu.file!.id);
              }
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}

      {/* AI Settings Modal - Rendered outside chat window */}
      {aiSettings && (
        <AISettingsModal
          isOpen={showAISettingsModal}
          onClose={() => setShowAISettingsModal(false)}
          providers={providers}
          selectedProviderId={aiSettings.selectedProviderId}
          selectedModel={aiSettings.selectedModel}
          parameters={aiSettings.parameters}
          systemPrompt={aiSettings.customSystemPrompt}
          availableModels={aiSettings.availableModels}
          onProviderSelect={aiSettings.handleProviderChange}
          onModelSelect={aiSettings.handleModelChange}
          onParametersChange={aiSettings.handleParametersChange}
          onSystemPromptChange={aiSettings.handleSystemPromptChange}
        />
      )}
    </div>
  );
};

export default LumaUILiteEditor;
