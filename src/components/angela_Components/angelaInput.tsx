import React, { useState, useRef } from 'react';
import { 
  Image as ImageIcon, 
  File, 
  Wrench, 
  Zap, 
  Database, 
  Mic, 
  Settings, 
  Send, 
  Plus,
  Paperclip,
  Bot,
  ChevronDown,
  Hand,
  Square,
  Loader2
} from 'lucide-react';

const angelaInput: React.FC = () => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    // Simulate processing
    setTimeout(() => {
      setIsProcessing(false);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="relative dark:border-gray-800 bg-transparent bg-opacity-80 dark:bg-opacity-80 transition-colors duration-100 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="p-6 flex justify-center">
            <div className="max-w-3xl w-full relative">
              {/* Main Input Container */}
              <div className="glassmorphic rounded-xl p-4 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg transition-all duration-300">
                
                {/* Input Field */}
                <div className="mb-4">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    className="w-full border-0 outline-none focus:outline-none focus:ring-0 resize-none bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
                    style={{
                      height: 'auto',
                      minHeight: '24px',
                      maxHeight: '250px',
                      overflowY: 'auto',
                      padding: '0',
                      borderRadius: '0'
                    }}
                    disabled={isProcessing}
                  />
                </div>

                {/* Bottom Actions */}
                <div className="flex justify-between items-center">
                  {/* Left Side Actions */}
                  <div className="flex items-center gap-2">
                    {/* New Chat Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="New Chat"
                    >
                      <Plus className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        New Chat
                      </div>
                    </button>
                    
                    {/* Image Upload Button */}
                    <button 
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      disabled={isProcessing}
                      title="Add Image"
                    >
                      <ImageIcon className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Add Image
                      </div>
                    </button>

                    {/* Document Upload Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="Add Document"
                    >
                      <File className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Add Document
                      </div>
                    </button>

                    {/* Tool Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="Select Tool"
                    >
                      <Wrench className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Select Tool
                      </div>
                    </button>

                    {/* Code Interpreter Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="Code Interpreter"
                    >
                      <Zap className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Code Interpreter
                      </div>
                    </button>

                    {/* RAG Toggle Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="RAG Database"
                    >
                      <Database className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        RAG Database
                      </div>
                    </button>

                    {/* Voice Recording Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="Voice Input"
                    >
                      <Mic className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Voice Input
                      </div>
                    </button>

                    {/* Model Config Button */}
                    <button
                      className="group p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/5 text-gray-600 dark:text-gray-400 transition-colors relative"
                      title="Model Configuration"
                    >
                      <Settings className="w-5 h-5" />
                      <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Model Configuration
                      </div>
                    </button>
                  </div>

                  {/* Right Side Actions */}
                  <div className="flex items-center gap-2">
                    {/* Mode Selection */}
                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors"
                      >
                        <Zap className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-300">Auto</span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>

                    {/* Model Selection */}
                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors border border-blue-300 dark:border-blue-600"
                      >
                        <Bot className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-300">
                          Auto (Auto)
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>

                    {/* Send Button */}
                    {isProcessing ? (
                      <button
                        className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1 group relative"
                        title="Stop generating"
                      >
                        <Square className="w-4 h-4" fill="white" />
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <div className="absolute right-1/2 translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          Stop Generating
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="p-2 rounded-lg bg-sakura-500 text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group relative"
                        title="Send Message"
                      >
                        <Send className="w-5 h-5" />
                        <div className="absolute right-1/2 translate-x-1/2 -top-8 px-2 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          Send Message
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default angelaInput; 
