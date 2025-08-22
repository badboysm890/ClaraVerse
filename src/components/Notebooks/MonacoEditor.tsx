import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { editor, KeyMod, KeyCode } from 'monaco-editor';

interface MonacoEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  language?: string;
  theme?: string;
  height?: string;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  content,
  onChange,
  placeholder = "Start writing...",
  className = "",
  readOnly = false,
  language = "markdown",
  theme = "vs-dark",
  height = "100%"
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Set a timeout for editor loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isEditorReady) {
        setLoadingTimeout(true);
        console.warn('Monaco Editor taking longer than expected to load');
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [isEditorReady]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    try {
      editorRef.current = editor;
      setIsEditorReady(true);
      setLoadingError(null);
      setLoadingTimeout(false);
      
      // Configure editor options
      editor.updateOptions({
        fontSize: 14,
        lineHeight: 1.6,
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
        wordWrap: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 24, bottom: 24 },
        lineNumbers: 'off',
        glyphMargin: true,
        folding: false,
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 0,
        renderLineHighlight: 'none',
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
      });

      // Add markdown shortcuts
      editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => {
        const selection = editor.getSelection();
        if (selection) {
          const selectedText = editor.getModel()?.getValueInRange(selection) || '';
          editor.executeEdits('bold', [{
            range: selection,
            text: `**${selectedText}**`
          }]);
        }
      });

      editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => {
        const selection = editor.getSelection();
        if (selection) {
          const selectedText = editor.getModel()?.getValueInRange(selection) || '';
          editor.executeEdits('italic', [{
            range: selection,
            text: `*${selectedText}*`
          }]);
        }
      });

      // Add placeholder functionality
      if (!content && placeholder) {
        editor.setValue(`<!-- ${placeholder} -->\n`);
      }
    } catch (error) {
      console.error('Error configuring Monaco Editor:', error);
      setLoadingError('Failed to configure editor');
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    try {
      if (value !== undefined) {
        // Remove placeholder if it exists
        if (value.startsWith(`<!-- ${placeholder} -->\n`)) {
          const cleanValue = value.replace(`<!-- ${placeholder} -->\n`, '');
          if (cleanValue.trim()) {
            onChange(cleanValue);
          } else {
            onChange('');
          }
        } else {
          onChange(value);
        }
      }
    } catch (error) {
      console.error('Error handling editor change:', error);
    }
  };


  // Update editor content when prop changes
  useEffect(() => {
    if (editorRef.current && content !== editorRef.current.getValue()) {
      try {
        editorRef.current.setValue(content || '');
      } catch (error) {
        console.error('Error updating editor content:', error);
      }
    }
  }, [content]);

  // Fallback textarea for when Monaco fails to load
  const FallbackEditor = () => (
    <div className="h-full w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full h-full p-4 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none border-none outline-none font-mono text-sm"
        style={{ 
          fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
          lineHeight: 1.6
        }}
      />
    </div>
  );

  if (loadingError) {
    return (
      <div className={`monaco-editor-container ${className}`} style={{ height: '100%' }}>
        <div className="h-full w-full flex flex-col">
          <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
            Monaco Editor failed to load. Using fallback editor.
          </div>
          <FallbackEditor />
        </div>
      </div>
    );
  }

  if (loadingTimeout && !isEditorReady) {
    return (
      <div className={`monaco-editor-container ${className}`} style={{ height: '100%' }}>
        <div className="h-full w-full flex flex-col">
          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
            Monaco Editor is taking longer than expected. Click to use fallback editor.
            <button 
              onClick={() => setLoadingError('User requested fallback')}
              className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              Use Fallback
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              <div>Loading Monaco Editor...</div>
              <div className="text-xs mt-1">This may take a moment</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`monaco-editor-container ${className}`} style={{ height: '100%' }}>
      <Editor
        height={height}
        language={language}
        theme={theme}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              <div>Loading Monaco Editor...</div>
            </div>
          </div>
        }
        options={{
          readOnly,
          contextmenu: true,
          selectOnLineNumbers: false,
          roundedSelection: false,
          cursorStyle: 'line',
          automaticLayout: true,
        }}
        onValidate={(markers) => {
          // Handle validation errors gracefully
          if (markers.length > 0) {
            console.warn('Monaco Editor validation markers:', markers);
          }
        }}
      />
      
      <style>{`
        .monaco-editor-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
        }
        
        .dark .monaco-editor-container {
          background: #1f2937;
        }
        
        /* Custom scrollbar styling */
        :global(.monaco-editor .monaco-scrollable-element > .scrollbar > .slider) {
          background: rgba(121, 121, 121, 0.4);
        }
        
        :global(.monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover) {
          background: rgba(100, 100, 100, 0.7);
        }
        
        :global(.monaco-editor .monaco-scrollable-element > .scrollbar > .slider.active) {
          background: rgba(191, 191, 191, 0.4);
        }
      `}</style>
    </div>
  );
};

export default MonacoEditor; 
