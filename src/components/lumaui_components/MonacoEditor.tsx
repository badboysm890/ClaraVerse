import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileText, Eye, EyeOff, Code, Zap, Settings, CheckCircle, AlertTriangle, Search, Replace, Command, Palette, MoreVertical, Wand2, RefreshCw } from 'lucide-react';
import * as monaco from 'monaco-editor';
import { FileNode } from '../../types';

interface MonacoEditorProps {
  content: string;
  fileName: string;
  onChange: (content: string) => void;
  isPreviewVisible?: boolean;
  onTogglePreview?: () => void;
  showPreviewToggle?: boolean;
  projectFiles?: FileNode[];
  webContainer?: any;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({ 
  content, 
  fileName, 
  onChange, 
  isPreviewVisible = false,
  onTogglePreview,
  showPreviewToggle = false,
  projectFiles = [],
  webContainer
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  
  // Enhanced state management with debugging
  const [diagnostics, setDiagnostics] = useState<monaco.editor.IMarker[]>([]);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [editorSettings, setEditorSettings] = useState({
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on' as 'on' | 'off',
    minimap: false,
    lineNumbers: 'on' as 'on' | 'off',
  });

  // Debug logging
  useEffect(() => {
    console.log('🔧 Monaco Editor Debug Info:', {
      fileName,
      contentLength: content.length,
      projectFilesCount: projectFiles.length,
      isEditorReady,
      editorError
    });
  }, [fileName, content.length, projectFiles.length, isEditorReady, editorError]);

  // Loading timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isEditorReady && !editorError) {
        console.warn('⚠️ Monaco Editor taking too long to load, showing fallback');
        setLoadingTimeout(true);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [isEditorReady, editorError]);

  const getLanguageFromFileName = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
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

  const getFileTypeIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'tsx':
      case 'ts':
        return <Code className="w-4 h-4 text-blue-500" />;
      case 'jsx':
      case 'js':
        return <Code className="w-4 h-4 text-yellow-500" />;
      case 'css':
        return <FileText className="w-4 h-4 text-purple-500" />;
      case 'html':
        return <FileText className="w-4 h-4 text-orange-500" />;
      case 'json':
        return <FileText className="w-4 h-4 text-green-500" />;
      case 'md':
        return <FileText className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  // Flatten file structure for TypeScript language service
  const flattenFiles = useCallback((files: FileNode[]): Array<{path: string, content: string, isDirectory: boolean}> => {
    const result: Array<{path: string, content: string, isDirectory: boolean}> = [];
    
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'directory') {
          result.push({ path: node.path, content: '', isDirectory: true });
          if (node.children) {
            traverse(node.children);
          }
        } else {
          result.push({ path: node.path, content: node.content || '', isDirectory: false });
        }
      }
    };
    
    traverse(files);
    return result;
  }, []);

  // Setup TypeScript language service for better IntelliSense
  const setupTypeScriptLanguageService = useCallback((monacoInstance: typeof monaco) => {
    if (!monacoInstance || projectFiles.length === 0) return;

    try {
      console.log('🔧 Setting up TypeScript Language Service...');
      const flatFiles = flattenFiles(projectFiles);
      const compilerOptions: monaco.languages.typescript.CompilerOptions = {
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        lib: ['ES2020', 'DOM'],
        allowNonTsExtensions: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.languages.typescript.JsxEmit.React,
        reactNamespace: 'React',
        allowJs: true,
        typeRoots: ['node_modules/@types']
      };

      // Configure TypeScript compiler options
      monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
      monacoInstance.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);

      // Add project files to Monaco's file system
      flatFiles.forEach(file => {
        if (!file.isDirectory && file.content) {
          const uri = monacoInstance.Uri.parse(`file:///${file.path}`);
          const existingModel = monacoInstance.editor.getModel(uri);
          
          if (existingModel) {
            existingModel.setValue(file.content);
          } else {
            monacoInstance.editor.createModel(
              file.content,
              getLanguageFromFileName(file.path),
              uri
            );
          }
        }
      });

      console.log('✅ TypeScript Language Service configured with', flatFiles.length, 'files');
    } catch (error) {
      console.error('❌ Failed to setup TypeScript Language Service:', error);
    }
  }, [projectFiles, flattenFiles]);

  // Get diagnostics for current file
  const getDiagnostics = useCallback(() => {
    if (!monacoRef.current || !fileName) return [];
    
    try {
      const uri = monacoRef.current.Uri.parse(`file:///${fileName}`);
      const model = monacoRef.current.editor.getModel(uri);
      if (model) {
        return monacoRef.current.editor.getModelMarkers({ resource: uri });
      }
    } catch (error) {
      console.error('Error getting diagnostics:', error);
    }
    return [];
  }, [fileName]);

  // Handle editor mount with enhanced error handling
  const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
    try {
      console.log('🎉 Monaco Editor mounted successfully!');
      editorRef.current = editor;
      monacoRef.current = monacoInstance;
      setIsEditorReady(true);
      setEditorError(null);
      
      // Setup TypeScript language service
      setupTypeScriptLanguageService(monacoInstance);
      
      // Update diagnostics periodically
      const diagnosticsInterval = setInterval(() => {
        const newDiagnostics = getDiagnostics();
        setDiagnostics(newDiagnostics);
      }, 2000);

      // Cleanup on unmount
      return () => {
        clearInterval(diagnosticsInterval);
      };
    } catch (error) {
      console.error('❌ Error during Monaco Editor mount:', error);
      setEditorError(error instanceof Error ? error.message : 'Unknown error');
      setIsEditorReady(false);
    }
  }, [setupTypeScriptLanguageService, getDiagnostics]);

  // Handle editor mount errors
  const handleEditorError = useCallback((error: any) => {
    console.error('❌ Monaco Editor failed to load:', error);
    setEditorError(error?.message || 'Failed to load Monaco Editor');
    setIsEditorReady(false);
  }, []);

  // Update diagnostics when file changes
  useEffect(() => {
    if (monacoRef.current && fileName) {
      const timeoutId = setTimeout(() => {
        const newDiagnostics = getDiagnostics();
        setDiagnostics(newDiagnostics);
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [fileName, content, getDiagnostics]);

  // Calculate diagnostic counts
  const hasErrors = diagnostics.some(d => d.severity === monaco?.MarkerSeverity.Error);
  const hasWarnings = diagnostics.some(d => d.severity === monaco?.MarkerSeverity.Warning);
  const errorCount = diagnostics.filter(d => d.severity === monaco?.MarkerSeverity.Error).length;
  const warningCount = diagnostics.filter(d => d.severity === monaco?.MarkerSeverity.Warning).length;

  // Fallback textarea editor
  const FallbackEditor = () => (
    <div className="h-full w-full relative">
      <div className="absolute top-2 left-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-lg text-sm z-10">
        Using fallback editor - Monaco failed to load
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full p-4 pt-12 font-mono text-sm bg-gray-900 text-gray-100 border-none outline-none resize-none"
        style={{
          fontFamily: '"Fira Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
          lineHeight: '1.5',
          tabSize: 2
        }}
        placeholder="Start typing your code here..."
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Clean, Professional Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        {/* File Info Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {getFileTypeIcon(fileName)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {fileName || 'No file selected'}
                </h2>
                {fileName && (
                  <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium">
                    {getLanguageFromFileName(fileName)}
                  </span>
                )}
                {/* Editor Status */}
                {fileName && (
                  <div className="flex items-center gap-2">
                    {isEditorReady && (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                        Monaco Ready
                      </span>
                    )}
                    {editorError && (
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs font-medium">
                        Fallback Mode
                      </span>
                    )}
                    {!isEditorReady && !editorError && !loadingTimeout && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                        Loading...
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {fileName ? (
                    projectFiles.length > 0 ? 
                      `IntelliSense enabled • ${projectFiles.filter(f => f.type === 'file').length} files indexed` :
                      'Ready to edit'
                  ) : (
                    'Select a file to start editing'
                  )}
                </p>
                
                {/* Diagnostics - Clean and Minimal */}
                {fileName && isEditorReady && (
                  <div className="flex items-center gap-3">
                    {hasErrors && (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">{errorCount}</span>
                      </div>
                    )}
                    {hasWarnings && (
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">{warningCount}</span>
                      </div>
                    )}
                    {!hasErrors && !hasWarnings && fileName && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">No issues</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Minimal and Clean */}
        <div className="flex items-center gap-2">
          {fileName && projectFiles.length > 0 && isEditorReady && (
            <button
              onClick={() => setupTypeScriptLanguageService(monacoRef.current!)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh IntelliSense"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          )}
          
          {showPreviewToggle && onTogglePreview && (
            <button
              onClick={onTogglePreview}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                isPreviewVisible
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              {isPreviewVisible ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>Show Editor</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Show Preview</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Editor Content - Full Height with Proper Constraints */}
      <div className="flex-1 min-h-0 bg-white dark:bg-gray-900">
        {fileName ? (
          <div className="h-full w-full relative">
            {(editorError || loadingTimeout) ? (
              <FallbackEditor />
            ) : (
              <Editor
                height="100%"
                width="100%"
                language={getLanguageFromFileName(fileName)}
                value={content}
                onChange={(value) => onChange(value || '')}
                theme="vs-dark"
                onMount={handleEditorDidMount}
                onValidate={(markers) => {
                  console.log('🔧 Monaco validation markers:', markers);
                }}
                beforeMount={(monaco) => {
                  console.log('🔧 Monaco before mount:', monaco);
                }}
                loading={
                  <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-600 dark:text-gray-400">Loading Monaco Editor...</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        If this takes too long, we'll show a fallback editor
                      </p>
                    </div>
                  </div>
                }
                options={{
                  // Core editor settings with enhanced line numbers
                  fontSize: editorSettings.fontSize,
                  tabSize: editorSettings.tabSize,
                  wordWrap: editorSettings.wordWrap,
                  lineNumbers: 'on', // Always show line numbers
                  lineNumbersMinChars: 3, // Minimum width for line numbers
                  lineDecorationsWidth: 10, // Space for line decorations
                  minimap: { enabled: editorSettings.minimap },
                  
                  // Essential functionality
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  folding: true,
                  autoIndent: 'full',
                  formatOnPaste: true,
                  formatOnType: true,
                  
                  // Modern editor features
                  find: {
                    addExtraSpaceOnTop: false,
                    autoFindInSelection: 'never',
                    seedSearchStringFromSelection: 'always',
                    loop: true
                  },
                  multiCursorModifier: 'ctrlCmd',
                  fontLigatures: true,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  
                  // Visual enhancements
                  padding: { top: 20, bottom: 20 },
                  fontFamily: '"Fira Code", "Monaco", "Menlo", "Ubuntu Mono", monospace',
                  renderLineHighlight: 'all', // Highlight current line
                  renderLineHighlightOnlyWhenFocus: false, // Always show line highlight
                  selectOnLineNumbers: true, // Allow clicking line numbers to select lines
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: true,
                    indentation: true,
                    highlightActiveIndentation: true
                  },
                  
                  // IntelliSense and suggestions
                  quickSuggestions: {
                    other: true,
                    comments: true,
                    strings: true
                  },
                  parameterHints: { enabled: true },
                  hover: { enabled: true, delay: 300 },
                  suggest: {
                    showKeywords: true,
                    showSnippets: true,
                    showFunctions: true,
                    showConstructors: true,
                    showFields: true,
                    showVariables: true,
                    showClasses: true,
                    showInterfaces: true,
                    showModules: true,
                    showProperties: true,
                  }
                }}
              />
            )}
          </div>
        ) : (
          /* Clean Empty State */
          <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center max-w-md mx-auto px-6">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                <Code className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Ready to Code
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                Select a file from the explorer to start editing with our powerful Monaco editor featuring IntelliSense, syntax highlighting, and more.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Zap className="w-4 h-4" />
                <span>Powered by Monaco Editor</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonacoEditor; 
