/**
 * Message Content Renderer Component
 * 
 * Enhanced content renderer for angela messages that supports:
 * - Markdown rendering with syntax highlighting
 * - Inline chart and diagram rendering (replacing code blocks)
 * - HTML code detection and preview
 * - Code block syntax highlighting
 * - Interactive elements
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Eye, EyeOff, ExternalLink, Code2, Loader2, BarChart3, GitBranch, Maximize2, Download } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { angelaFileAttachment } from '../../types/angela_assistant_types';

// Import Chart.js components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface MessageContentRendererProps {
  content: string;
  className?: string;
  isDark?: boolean;
  isStreaming?: boolean;
  attachments?: angelaFileAttachment[]; // Add attachments prop
}

/**
 * Inline Mermaid Diagram Renderer
 */
const InlineMermaidRenderer: React.FC<{ content: string; isDark?: boolean }> = ({ content, isDark = false }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedSvg, setRenderedSvg] = useState<string>('');
  const diagramRef = useRef<HTMLDivElement>(null);
  const diagramId = useRef(`inline-mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

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

    // Skip if same content as last render
    if (lastContentRef.current === content) {
      return;
    }

    renderTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        lastContentRef.current = content;
        
        // Validate diagram code before attempting to render
        if (!content || !content.trim()) {
          setError('Empty diagram content');
          setIsLoading(false);
          return;
        }

        let cleanCode = content.trim();
        
        // Ensure diagram has a proper deangelation first
        if (!cleanCode.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gitgraph|pie|quadrantChart|timeline|mindmap|sankey|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment)/m)) {
          // Add a graph deangelation if missing
          cleanCode = `graph TD\n${cleanCode}`;
        }
        
        // Dynamic import of mermaid
        const mermaid = await import('mermaid');
        
        // Initialize mermaid with configuration
        mermaid.default.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
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

        // Generate unique ID for this diagram
        const uniqueId = diagramId.current;
        
        // Clear any existing diagrams
        const existingEl = document.getElementById(uniqueId);
        if (existingEl) {
          existingEl.remove();
        }
        
        try {
          // First try to render the original code (with deangelation if needed)
          const result = await mermaid.default.render(uniqueId, cleanCode);
          setRenderedSvg(result.svg);
        } catch (originalError) {
          // Only if original fails, try with syntax fixes
          console.log('Original syntax failed, trying fixes...', originalError);
          
          const fixedCode = fixMermaidSyntax(cleanCode);
          
          if (!isValidMermaid(fixedCode)) {
            throw new Error('Invalid Mermaid syntax - missing diagram deangelation or connections');
          }
          
          const fixedResult = await mermaid.default.render(`${uniqueId}-fixed`, fixedCode);
          setRenderedSvg(fixedResult.svg);
        }
        
      } catch (err) {
        console.error('Inline Mermaid rendering error:', err);
        
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
  }, [content, isDark]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
        <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
        <span className="ml-2 text-purple-700 dark:text-purple-300 text-sm">Rendering diagram...</span>
      </div>
    );
  }

  if (error) {
    const fixedCode = fixMermaidSyntax(content);
    const showFixed = fixedCode !== content.trim();
    
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
          <GitBranch className="w-4 h-4" />
          <span className="font-medium">Diagram Error</span>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        
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
            Show diagram source
          </summary>
          <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/40 rounded text-red-700 dark:text-red-300 overflow-x-auto">
            {content}
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

  if (!renderedSvg) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <p className="text-gray-500 dark:text-gray-400 text-sm">No diagram to display</p>
      </div>
    );
  }

  return (
    <div className="my-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-b border-purple-200 dark:border-purple-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Mermaid Diagram</span>
        </div>
        <button
          onClick={() => {
            // Create a modal for full-screen view
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm';
            modal.innerHTML = `
              <div class="relative bg-white dark:bg-gray-900 w-full h-full p-8 overflow-auto">
                <button onclick="this.parentElement.parentElement.remove()" class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">&times;</button>
                <div class="w-full h-full flex items-center justify-center">
                  ${renderedSvg}
                </div>
              </div>
            `;
            document.body.appendChild(modal);
          }}
          className="p-1 text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-200 transition-colors"
          title="View fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Diagram Content */}
      <div className="p-4 overflow-auto" style={{ maxHeight: '600px' }}>
        <div 
          ref={diagramRef}
          className="w-full flex justify-center"
          dangerouslySetInnerHTML={{ __html: renderedSvg }}
        />
      </div>
    </div>
  );
};

/**
 * Inline HTML Renderer
 */
const InlineHTMLRenderer: React.FC<{ content: string; isDark?: boolean }> = ({ content, isDark = false }) => {
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Clean and validate HTML content
  const cleanHTML = useMemo(() => {
    try {
      // Basic HTML validation and enhancement
      let html = content.trim();
      
      // If it's a fragment, wrap it in a full HTML document
      if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
        html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 20px; 
            line-height: 1.6;
            background: ${isDark ? '#1f2937' : '#ffffff'};
            color: ${isDark ? '#f9fafb' : '#111827'};
        }
        * { box-sizing: border-box; }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
      }
      
      return html;
    } catch (err) {
      setError('Invalid HTML content');
      return '';
    }
  }, [content, isDark]);

  useEffect(() => {
    if (iframeRef.current && cleanHTML && !error) {
      try {
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(cleanHTML);
          doc.close();
        }
      } catch (err) {
        console.error('HTML rendering error:', err);
        setError('Failed to render HTML content');
      }
    }
  }, [cleanHTML, error]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
          <Code2 className="w-4 h-4" />
          <span className="font-medium">HTML Error</span>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="my-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 border-b border-orange-200 dark:border-orange-700">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span className="text-sm font-medium text-orange-700 dark:text-orange-300">HTML Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200 dark:hover:bg-orange-900/70 transition-colors"
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>
          <button
            onClick={() => {
              const newWindow = window.open('', '_blank');
              if (newWindow) {
                newWindow.document.write(cleanHTML);
                newWindow.document.close();
              }
            }}
            className="p-1 text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-200 transition-colors"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* HTML Preview */}
      <div className="relative">
        <iframe
          ref={iframeRef}
          className="w-full border-0 bg-white dark:bg-gray-900"
          style={{ height: '400px', minHeight: '200px' }}
          sandbox="allow-scripts allow-same-origin allow-forms"
          title="HTML Preview"
        />
      </div>
      
      {/* Code Display */}
      {showCode && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language="html"
            PreTag="div"
            className="text-sm"
            showLineNumbers={true}
          >
            {content}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
};

/**
 * Inline Chart Renderer for Chart.js JSON
 */
const InlineChartRenderer: React.FC<{ content: string; isDark?: boolean }> = ({ content, isDark = false }) => {
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(content);
      setChartData(parsed);
      setError(null);
    } catch (err) {
      setError('Invalid chart JSON format');
    }
  }, [content]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
          <BarChart3 className="w-4 h-4" />
          <span className="font-medium">Chart Error</span>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading chart...</p>
      </div>
    );
  }

  const renderChart = () => {
    const chartType = chartData.type?.toLowerCase();
    const commonProps = {
      data: chartData.data,
      options: {
        ...chartData.options,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...chartData.options?.plugins,
          legend: {
            ...chartData.options?.plugins?.legend,
            labels: {
              ...chartData.options?.plugins?.legend?.labels,
              color: isDark ? '#e5e7eb' : '#374151'
            }
          }
        },
        scales: chartData.options?.scales ? {
          ...chartData.options.scales,
          x: {
            ...chartData.options.scales.x,
            ticks: {
              ...chartData.options.scales.x?.ticks,
              color: isDark ? '#e5e7eb' : '#374151'
            },
            grid: {
              ...chartData.options.scales.x?.grid,
              color: isDark ? '#374151' : '#e5e7eb'
            }
          },
          y: {
            ...chartData.options.scales.y,
            ticks: {
              ...chartData.options.scales.y?.ticks,
              color: isDark ? '#e5e7eb' : '#374151'
            },
            grid: {
              ...chartData.options.scales.y?.grid,
              color: isDark ? '#374151' : '#e5e7eb'
            }
          }
        } : undefined
      }
    };

    switch (chartType) {
      case 'line':
        return <Line {...commonProps} />;
      case 'bar':
        return <Bar {...commonProps} />;
      case 'pie':
        return <Pie {...commonProps} />;
      case 'doughnut':
        return <Doughnut {...commonProps} />;
      default:
        return <Bar {...commonProps} />;
    }
  };

  return (
    <div className="my-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-b border-blue-200 dark:border-blue-700">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {chartData.type?.charAt(0).toUpperCase() + chartData.type?.slice(1) || 'Chart'}
          </span>
          {chartData.options?.plugins?.title?.text && (
            <>
              <span className="text-blue-400 dark:text-blue-500">•</span>
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {chartData.options.plugins.title.text}
              </span>
            </>
          )}
        </div>
      </div>
      
      {/* Chart Content */}
      <div className="p-6" style={{ height: '400px' }}>
        {renderChart()}
      </div>
    </div>
  );
};

/**
 * Enhanced Code Block Component with Inline Visual Rendering
 */
const CodeBlock: React.FC<{
  children: string;
  language?: string;
  className?: string;
  isInline?: boolean;
  isDark?: boolean;
  isStreaming?: boolean;
  [key: string]: any;
}> = ({ children, language, className, isInline, isDark, isStreaming, ...props }) => {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  
  const code = String(children).replace(/\n$/, '');
  
  // Check if this should be rendered as a visual element instead of code
  const shouldRenderAsVisual = !isInline && code.length > 20;
  
  // Detect Mermaid diagrams
  const isMermaidDiagram = shouldRenderAsVisual && (
    language === 'mermaid' ||
    code.trim().match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|requirement|c4context)/i)
  );
  
  // Detect Chart.js JSON
  const isChartJSON = shouldRenderAsVisual && (
    language === 'json' && (
      code.includes('"type":') && 
      code.includes('"data":') && 
      (code.includes('"bar"') || code.includes('"line"') || code.includes('"pie"') || code.includes('"doughnut"'))
    )
  );
  
  // Detect HTML content
  const isHTML = shouldRenderAsVisual && (
    language === 'html' ||
    (code.includes('<') && code.includes('>') && (
      code.includes('<html') || 
      code.includes('<div') || 
      code.includes('<p') || 
      code.includes('<h1') || 
      code.includes('<h2') || 
      code.includes('<h3') || 
      code.includes('<section') || 
      code.includes('<article') || 
      code.includes('<header') || 
      code.includes('<footer') ||
      code.includes('<main') ||
      code.includes('<nav') ||
      code.includes('<aside') ||
      code.includes('<form') ||
      code.includes('<button') ||
      code.includes('<input') ||
      code.includes('<table') ||
      code.includes('<ul') ||
      code.includes('<ol') ||
      code.includes('<li') ||
      code.includes('<span') ||
      code.includes('<a ')
    ))
  );

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // If inline code, render normally
  if (isInline) {
    return (
      <code 
        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // If this is a Mermaid diagram, render it visually (but only after streaming is complete)
  if (isMermaidDiagram && !isStreaming) {
    return (
      <div className="my-4">
        <InlineMermaidRenderer content={code} isDark={isDark} />
        
        {/* Show code option */}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => setShowCode(!showCode)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <Code2 className="w-3 h-3" />
            {showCode ? 'Hide source' : 'Show source'}
          </button>
        </div>
        
        {showCode && (
          <div className="mt-2 relative">
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={handleCopy}
                className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                title="Copy code"
              >
                {copied ? <Eye className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={language || 'text'}
              PreTag="div"
              className="text-sm rounded-lg"
              showLineNumbers={false}
              {...props}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    );
  }

  // If this is a Chart.js JSON, render it visually (but only after streaming is complete)
  if (isChartJSON && !isStreaming) {
    return (
      <div className="my-4">
        <InlineChartRenderer content={code} isDark={isDark} />
        
        {/* Show code option */}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => setShowCode(!showCode)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <Code2 className="w-3 h-3" />
            {showCode ? 'Hide source' : 'Show source'}
          </button>
        </div>
        
        {showCode && (
          <div className="mt-2 relative">
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={handleCopy}
                className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                title="Copy code"
              >
                {copied ? <Eye className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language="json"
              PreTag="div"
              className="text-sm rounded-lg"
              showLineNumbers={false}
              {...props}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    );
  }

  // If this is HTML content, render it visually (but only after streaming is complete)
  if (isHTML && !isStreaming) {
    return (
      <div className="my-4">
        <InlineHTMLRenderer content={code} isDark={isDark} />
      </div>
    );
  }

  // Regular code block rendering
  return (
    <div className="relative my-4 group">
      {/* Copy button */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
          title="Copy code"
        >
          {copied ? <Eye className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language || 'text'}
        PreTag="div"
        className="text-sm rounded-lg"
        showLineNumbers={code.split('\n').length > 5}
        {...props}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

const MessageContentRenderer: React.FC<MessageContentRendererProps> = React.memo(({
  content, 
  className = '',
  isDark = false,
  isStreaming = false,
  attachments = [] // Default to empty array
}) => {
  // Auto-detect dark mode if not explicitly provided
  const [darkMode, setDarkMode] = useState(isDark);
  
  // State to hold extracted images
  const [extractedImages, setExtractedImages] = useState<Array<{
    id: string;
    src: string;
    alt: string;
  }>>([]);

  // Pre-process content to extract and replace image data URLs and attachment references
  const processedContent = useMemo(() => {
    // Check for both data URLs and attachment ID references
    const imageDataUrlRegex = /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g;
    const attachmentIdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    
    const dataUrlMatches = Array.from(content.matchAll(imageDataUrlRegex));
    const attachmentMatches = Array.from(content.matchAll(attachmentIdRegex));
    
    const images: Array<{id: string; src: string; alt: string}> = [];
    let processedContent = content;
    
    // Process data URL images (existing logic)
    if (dataUrlMatches.length > 0) {
      dataUrlMatches.forEach((match, index) => {
        const fullMatch = match[0];
        const alt = match[1] || 'Generated Image';
        const dataUrlMatch = match[0].match(/data:image\/[^;]+;base64,[^)]+/);
        
        if (dataUrlMatch) {
          const dataUrl = dataUrlMatch[0];
          const imageId = `extracted-image-${index}`;
          
          // Validate the data URL
          if (dataUrl.length > 50 && dataUrl.includes('base64,')) {
            // Add to extracted images
            images.push({
              id: imageId,
              src: dataUrl,
              alt
            });
            
            // Replace the full markdown image with a placeholder
            processedContent = processedContent.replace(fullMatch, `\n\n**[IMAGE_PLACEHOLDER_${imageId}]**\n\n`);
          }
        }
      });
    }
    
    // Process attachment ID references (new logic)
    if (attachmentMatches.length > 0) {
      attachmentMatches.forEach((match, index) => {
        const fullMatch = match[0];
        const alt = match[1] || 'Generated Image';
        const attachmentIdOrUrl = match[2];
        
        // Skip if this is already a data URL (handled above)
        if (attachmentIdOrUrl.startsWith('data:')) {
          return;
        }
        
        // Look for attachment with this ID
        const attachment = attachments.find(att => att.id === attachmentIdOrUrl);
        
        if (attachment && attachment.type === 'image') {
          // Get the image source from the attachment - properly construct data URL
          let imageSrc = null;
          
          if (attachment.url && attachment.url.startsWith('data:')) {
            // Already a proper data URL
            imageSrc = attachment.url;
          } else if (attachment.base64) {
            // Construct proper data URL from base64
            const mimeType = attachment.mimeType || 'image/png';
            imageSrc = `data:${mimeType};base64,${attachment.base64}`;
          } else if (attachment.url) {
            // Use URL as-is (for external URLs)
            imageSrc = attachment.url;
          }
          
          if (imageSrc) {
            const imageId = `attachment-image-${attachmentIdOrUrl}`;
            
            // Add to extracted images
            images.push({
              id: imageId,
              src: imageSrc,
              alt: alt || attachment.name || 'Generated Image'
            });
            
            // Replace the full markdown image with a placeholder
            processedContent = processedContent.replace(fullMatch, `\n\n**[IMAGE_PLACEHOLDER_${imageId}]**\n\n`);
          }
        }
      });
    }
    
    // Return both processed content and images
    return {
      content: processedContent,
      images: images
    };
  }, [content, JSON.stringify(attachments)]); // Stabilize attachments dependency

  // Update extracted images when processedContent changes
  useEffect(() => {
    setExtractedImages(processedContent.images);
  }, [processedContent]);

  useEffect(() => {
    if (!isDark) {
      const checkTheme = () => {
        // Add null checks for document.documentElement
        if (!document?.documentElement) {
          console.warn('document.documentElement is not available');
          return;
        }
        
        try {
          const isDarkMode = document.documentElement.classList.contains('dark') ||
                            window.matchMedia('(prefers-color-scheme: dark)').matches;
          setDarkMode(isDarkMode);
        } catch (error) {
          console.error('Error checking theme:', error);
          // Fallback to light mode
          setDarkMode(false);
        }
      };

      checkTheme();
      
      // Only set up observer if document.documentElement exists
      if (document?.documentElement) {
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        
        return () => observer.disconnect();
      }
    } else {
      setDarkMode(isDark);
    }
  }, [isDark]);

  // Custom component to render extracted images
  const ImagePlaceholder: React.FC<{ imageId: string }> = ({ imageId }) => {
    const image = extractedImages.find(img => img.id === imageId);
    
    if (!image) {
      console.error('🖼️ Image not found for placeholder:', imageId);
      return (
        <div className="my-4 flex flex-col items-center">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm">Image not found</p>
          </div>
        </div>
      );
    }
    
    console.log('🖼️ Rendering extracted image:', {
      id: image.id,
      alt: image.alt,
      srcLength: image.src.length,
      srcStart: image.src.substring(0, 50) + '...'
    });
    
    const handleDownload = () => {
      try {
        // Create a temporary link element
        const link = document.createElement('a');
        link.href = image.src;
        
        // Generate filename from alt text or use default
        const filename = image.alt && image.alt !== 'Generated Image' 
          ? `${image.alt.replace(/[^a-zA-Z0-9]/g, '_')}.png`
          : `generated_image_${Date.now()}.png`;
        
        link.download = filename;
        
        // Append to body, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('📥 Downloaded image:', filename);
      } catch (error) {
        console.error('❌ Failed to download image:', error);
      }
    };
    
    return (
      <div className="my-4 flex flex-col items-center group">
        <div className="relative">
          <img
            src={image.src}
            alt={image.alt}
            className="max-w-full h-auto rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow duration-300"
            style={{ maxHeight: '500px' }}
            onLoad={() => {
              console.log('✅ Extracted image loaded successfully:', { id: image.id, alt: image.alt });
            }}
            onError={(e) => {
              console.error('🖼️ Extracted image failed to load:', { id: image.id, alt: image.alt });
            }}
          />
          
          {/* Download button - appears on hover */}
          <button
            onClick={handleDownload}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        
        {image.alt && image.alt !== 'Generated Image' && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center italic">
            {image.alt}
          </p>
        )}
      </div>
    );
  };

  // Function to render content with image placeholders replaced
  const renderContentWithImages = (content: string) => {
    // Split content by image placeholders
    const parts = content.split(/\*\*\[IMAGE_PLACEHOLDER_([^\]]+)\]\*\*/);
    
    const elements: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Regular content
        if (parts[i].trim()) {
          elements.push(
            <ReactMarkdown
              key={`content-${i}`}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                // Custom code block renderer with inline visual rendering
                code: ({ node, inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  
                  return (
                    <CodeBlock
                      language={language}
                      className={className}
                      isInline={inline}
                      isDark={darkMode}
                      isStreaming={isStreaming}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </CodeBlock>
                  );
                },
                
                // Enhanced link renderer
                a: ({ href, children, ...props }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-400 underline-offset-2"
                    {...props}
                  >
                    {children}
                  </a>
                ),
                
                // Regular image renderer (for non-data URLs)
                img: ({ src, alt, ...props }) => {
                  // Only handle regular URLs, not data URLs
                  if (!src || src.startsWith('data:')) {
                    return (
                      <div className="my-4 flex flex-col items-center">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <p className="text-yellow-600 dark:text-yellow-400 text-sm">
                            Data URL images are handled separately
                          </p>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="my-4 flex flex-col items-center">
                      <img
                        src={src}
                        alt={alt}
                        className="max-w-full h-auto rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow duration-300"
                        style={{ maxHeight: '500px' }}
                        {...props}
                      />
                      {alt && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center italic">
                          {alt}
                        </p>
                      )}
                    </div>
                  );
                },
                
                // Enhanced table renderer
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg" {...props}>
                      {children}
                    </table>
                  </div>
                ),
                
                // Enhanced blockquote renderer
                blockquote: ({ children, ...props }) => (
                  <blockquote 
                    className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg italic text-gray-700 dark:text-gray-300"
                    {...props}
                  >
                    {children}
                  </blockquote>
                ),

                // Enhanced ordered list renderer
                ol: ({ children, ...props }) => (
                  <ol 
                    className="list-decimal list-outside ml-6 mb-4 space-y-1 text-gray-800 dark:text-gray-200"
                    {...props}
                  >
                    {children}
                  </ol>
                ),

                // Enhanced unordered list renderer
                ul: ({ children, ...props }) => (
                  <ul 
                    className="list-disc list-outside ml-6 mb-4 space-y-1 text-gray-800 dark:text-gray-200"
                    {...props}
                  >
                    {children}
                  </ul>
                ),

                // Enhanced list item renderer
                li: ({ children, ...props }) => (
                  <li 
                    className="pl-2 leading-relaxed text-gray-800 dark:text-gray-200"
                    {...props}
                  >
                    {children}
                  </li>
                ),
              }}
            >
              {parts[i]}
            </ReactMarkdown>
          );
        }
      } else {
        // Image placeholder
        const imageId = parts[i];
        elements.push(
          <ImagePlaceholder key={`image-${imageId}`} imageId={imageId} />
        );
      }
    }
    
    return elements;
  };

  // Render as Markdown with custom image handling
  return (
    <div className={`prose prose-base dark:prose-invert max-w-none ${className}`}>
      {renderContentWithImages(processedContent.content)}
    </div>
  );
});

// Set display names for React DevTools
CodeBlock.displayName = 'CodeBlock';
MessageContentRenderer.displayName = 'MessageContentRenderer';

export default MessageContentRenderer; 
