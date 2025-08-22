import React, { useState, useRef, useEffect } from 'react';
import { Globe, Play, Loader2, RefreshCw, ExternalLink, Monitor, Zap, Eye, Terminal, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Project } from '../../types';

interface PreviewPaneProps {
  project: Project;
  isStarting: boolean;
  onStartProject: (project: Project) => void;
}

interface ConsoleMessage {
  id: string;
  type: 'log' | 'error' | 'warn' | 'info' | 'debug' | 'table' | 'group' | 'groupEnd' | 'clear' | 'command' | 'result';
  content: string;
  timestamp: Date;
  source?: string;
}

const PreviewPane: React.FC<PreviewPaneProps> = ({ project, isStarting, onStartProject }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(300);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Auto-scroll console to bottom
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleMessages]);

  // Listen for console messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'console-message') {
        const { level, args, timestamp } = event.data;
        
        // Handle special console commands
        if (level === 'clear') {
          setConsoleMessages([]);
          addConsoleMessage('clear', 'Console was cleared', 'preview');
        } else {
          addConsoleMessage(level, args.join(' '), 'preview');
        }
      } else if (event.data.type === 'preview-error') {
        const { error } = event.data;
        addConsoleMessage('error', `${error.message}${error.line ? ` (Line: ${error.line})` : ''}`, 'preview');
      } else if (event.data.type === 'command-result') {
        const { result, error } = event.data;
        if (error) {
          addConsoleMessage('error', `Error: ${error}`, 'system');
        } else {
          // Format the result better
          let formattedResult = result;
          if (typeof result === 'object' && result !== null) {
            try {
              formattedResult = JSON.stringify(result, null, 2);
            } catch (e) {
              formattedResult = String(result);
            }
          } else if (result === undefined) {
            formattedResult = 'undefined';
          } else if (result === null) {
            formattedResult = 'null';
          }
          addConsoleMessage('result', String(formattedResult), 'system');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Console resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      
      const container = resizeRef.current?.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      const minHeight = 150;
      const maxHeight = containerRect.height * 0.7;
      
      setConsoleHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsRefreshing(true);
      clearConsole();
      addConsoleMessage('info', '🔄 Refreshing preview...', 'system');
      
      // Add a small delay to show the refresh animation
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
        setIsRefreshing(false);
      }, 300);
    }
  };

  const addConsoleMessage = (type: ConsoleMessage['type'], content: string, source: string = 'user') => {
    const message: ConsoleMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      type,
      content,
      timestamp: new Date(),
      source
    };
    setConsoleMessages(prev => [...prev, message]);
  };

  const clearConsole = () => {
    setConsoleMessages([]);
    addConsoleMessage('info', 'Console cleared', 'system');
  };

  const executeCommand = () => {
    if (!commandInput.trim()) return;

    // Add command to history
    setCommandHistory(prev => [...prev, commandInput]);
    setHistoryIndex(-1);

    // Add command to console
    addConsoleMessage('command', `> ${commandInput}`, 'user');

    // Send command to iframe for execution
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: 'execute-command',
          command: commandInput
        }, '*');
      } catch (error) {
        addConsoleMessage('error', `Failed to send command: ${error}`, 'system');
      }
    } else {
      addConsoleMessage('error', 'Preview not available for command execution', 'system');
    }

    setCommandInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCommandInput('');
        } else {
          setHistoryIndex(newIndex);
          setCommandInput(commandHistory[newIndex]);
        }
      }
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const getMessageIcon = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🐛';
      case 'table': return '📊';
      case 'group': return '📁';
      case 'groupEnd': return '📂';
      case 'clear': return '🧹';
      case 'command': return '>';
      case 'result': return '←';
      default: return '📝';
    }
  };

  const getMessageColor = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      case 'table': return 'text-cyan-400';
      case 'group': return 'text-indigo-400';
      case 'groupEnd': return 'text-indigo-400';
      case 'clear': return 'text-gray-500';
      case 'command': return 'text-green-400';
      case 'result': return 'text-purple-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="h-full flex flex-col glassmorphic">
      {/* Enhanced Header */}
      <div className="glassmorphic-card border-b border-white/20 dark:border-gray-700/50 shrink-0 h-14">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-lg flex items-center justify-center">
              <Globe className="w-4 h-4 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Preview
                </span>
                {project.status === 'running' && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm"></div>
                    <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                      Live
                    </span>
                  </div>
                )}
                {project.status === 'idle' && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                    Stopped
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {project.status === 'running' ? 'Application running' : 'Start project to preview'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {project.status === 'running' && project.previewUrl && (
              <>
                <button
                  onClick={() => {
                    const wasHidden = !showConsole;
                    setShowConsole(!showConsole);
                    
                    // Add welcome message when console is first opened
                    if (wasHidden && consoleMessages.length === 0) {
                      setTimeout(() => {
                        addConsoleMessage('info', '🎉 Console ready! Try executing JavaScript commands like:', 'system');
                        addConsoleMessage('info', '• console.log("Hello World!")', 'system');
                        addConsoleMessage('info', '• document.title', 'system');
                        addConsoleMessage('info', '• window.location.href', 'system');
                        addConsoleMessage('info', '• Math.random()', 'system');
                      }, 100);
                    }
                  }}
                  className={`p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105 ${
                    showConsole 
                      ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400'
                  }`}
                  title="Toggle console"
                >
                  <Terminal className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 disabled:opacity-50 hover:shadow-md transform hover:scale-105"
                  title="Refresh preview"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => window.open(project.previewUrl, '_blank')}
                  className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Preview Content */}
      <div className="flex-1 relative overflow-hidden bg-white dark:bg-gray-900 flex flex-col">
        {project.status === 'running' && project.previewUrl ? (
          <>
            {/* Preview iframe */}
            <div 
              className="flex-1 relative overflow-hidden"
              style={{ height: showConsole ? `calc(100% - ${consoleHeight}px)` : '100%' }}
            >
              <iframe
                ref={iframeRef}
                src={project.previewUrl}
                className="w-full h-full border-0 bg-white"
                title="Project Preview"
                onLoad={() => {
                  setIsRefreshing(false);
                  addConsoleMessage('info', '✅ Preview loaded successfully', 'system');
                }}
              />
              {isRefreshing && (
                <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 flex items-center justify-center z-20 glassmorphic backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-sakura-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      Refreshing preview...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Console Panel */}
            {showConsole && (
              <>
                {/* Resize Handle */}
                <div
                  ref={resizeRef}
                  className="h-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-ns-resize transition-colors flex items-center justify-center group"
                  onMouseDown={handleResizeStart}
                >
                  <div className="w-8 h-0.5 bg-gray-400 dark:bg-gray-500 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 rounded transition-colors"></div>
                </div>

                {/* Console Content */}
                <div 
                  className="bg-gray-900 text-gray-100 flex flex-col"
                  style={{ height: `${consoleHeight}px` }}
                >
                  {/* Console Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium">Console</span>
                      <span className="text-xs text-gray-400">({consoleMessages.length} messages)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={clearConsole}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                        title="Clear console"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowConsole(false)}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                        title="Hide console"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Console Messages */}
                  <div className="flex-1 overflow-y-auto p-2 font-mono text-sm">
                    {consoleMessages.map((message) => (
                      <div key={message.id} className="flex items-start gap-2 py-1 hover:bg-gray-800/50 px-2 rounded">
                        <span className="text-xs text-gray-500 mt-0.5 min-w-[60px]">
                          {message.timestamp.toLocaleTimeString().slice(0, 8)}
                        </span>
                        <span className="mt-0.5">{getMessageIcon(message.type)}</span>
                        <span className={`flex-1 ${getMessageColor(message.type)} break-all`}>
                          {message.content}
                        </span>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>

                  {/* Command Input */}
                  <div className="border-t border-gray-700 p-2 bg-gray-800">
                    <div className="flex items-center gap-2">
                                             <span className="text-green-400 font-mono">{'>'}</span>
                      <input
                        type="text"
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Try: console.log('Hello!'), document.title, window.location.href..."
                        className="flex-1 bg-transparent text-gray-100 font-mono text-sm outline-none placeholder-gray-500"
                      />
                      <button
                        onClick={executeCommand}
                        disabled={!commandInput.trim()}
                        className="p-1 text-gray-400 hover:text-green-400 disabled:opacity-50 transition-colors"
                        title="Execute command"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : project.status === 'idle' ? (
          /* Start Project State */
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center shadow-lg">
                <Monitor className="w-10 h-10 text-sakura-600 dark:text-sakura-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                Ready to Preview
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                Start your project to see a live preview of your application. Your changes will be reflected in real-time.
              </p>
              <button
                onClick={() => onStartProject(project)}
                disabled={isStarting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl shadow-sakura-500/25 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Start Project</span>
                  </>
                )}
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-4">
                <Eye className="w-4 h-4" />
                <span>Live reload enabled</span>
              </div>
            </div>
          </div>
        ) : (
          /* Loading/Error State */
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Zap className="w-10 h-10 text-gray-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                {project.status === 'error' ? 'Preview Error' : 'Getting Ready...'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {project.status === 'error' 
                  ? 'There was an issue starting the preview. Please check the terminal for more details.'
                  : 'Your project is being prepared for preview. This may take a moment.'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewPane; 
