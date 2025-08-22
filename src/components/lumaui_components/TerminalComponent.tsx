import React, { useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Maximize2, Minimize2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebContainer } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

interface TerminalComponentProps {
  webContainer: WebContainer | null;
  isVisible: boolean;
  onToggle: () => void;
  terminalRef: React.MutableRefObject<Terminal | null>;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ 
  webContainer, 
  isVisible, 
  onToggle, 
  terminalRef 
}) => {
  const terminalElementRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (terminalElementRef.current && !terminalRef.current) {
      // Initialize terminal
      const terminal = new Terminal({
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#ffffff',
        },
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        cursorBlink: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      
      terminal.open(terminalElementRef.current);
      fitAddon.fit();
      
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Add some initial text
      terminal.writeln('\x1b[32m🚀 Lumaui Terminal Ready\x1b[0m');
      terminal.writeln('WebContainer processes will appear here when you start a project...\n');
    }

    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [terminalRef]);

  useEffect(() => {
    if (fitAddonRef.current && isVisible) {
      // Fit terminal when visibility changes or container resizes
      const fitTerminal = () => {
        fitAddonRef.current?.fit();
      };
      
      // Initial fit
      setTimeout(fitTerminal, 100);
      
      // Add resize observer to handle container size changes
      const resizeObserver = new ResizeObserver(() => {
        setTimeout(fitTerminal, 50);
      });
      
      if (terminalElementRef.current) {
        resizeObserver.observe(terminalElementRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [isVisible]);

  if (!isVisible) {
    return (
      <div className="h-8 border-t border-gray-200 dark:border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-3 py-1 h-full">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">Terminal</span>
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full border-t border-gray-200 dark:border-gray-700 bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-600 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-300">Terminal</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <Minimize2 className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div 
        ref={terminalElementRef} 
        className="flex-1 p-2"
      />
    </div>
  );
};

export default TerminalComponent; 
