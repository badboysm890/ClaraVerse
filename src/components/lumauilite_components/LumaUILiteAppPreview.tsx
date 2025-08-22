import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Home, RefreshCw, ExternalLink, X } from 'lucide-react';
import { LiteProject, LiteProjectFile } from '../LumaUILite';

interface LumaUILiteAppPreviewProps {
  project: LiteProject;
  onClose: () => void;
}

const LumaUILiteAppPreview: React.FC<LumaUILiteAppPreviewProps> = ({
  project,
  onClose
}) => {
  const [currentPage, setCurrentPage] = useState<string>('index.html');
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle navigation messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'navigate-to-page') {
        const { page } = event.data;
        console.log('LumaUI-lite App Preview: Navigation request received:', page);
        
        // Check if the page exists in project files
        const pageExists = project.projectFiles.some(f => f.name === page);
        if (pageExists) {
          setCurrentPage(page);
          setPreviewKey(prev => prev + 1); // Force iframe refresh with new content
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [project.projectFiles]);

  const generatePreviewContent = (fileName: string = 'index.html') => {
    const htmlFile = project.projectFiles.find(f => f.name === fileName);
    if (!htmlFile) return '<html><body><p>No ' + fileName + ' file found</p></body></html>';
    
    let htmlContent = htmlFile.content;
    
    // Replace CSS file references with inline content (for preview functionality)
    const cssFile = project.projectFiles.find(f => f.name === 'styles.css');
    if (cssFile) {
      htmlContent = htmlContent.replace(
        /<link[^>]+href=["']styles\.css["'][^>]*>/gi,
        `<style>${cssFile.content}</style>`
      );
    }
    
    // Replace JS file references with inline content (for preview functionality)
    const jsFile = project.projectFiles.find(f => f.name === 'script.js');
    if (jsFile) {
      htmlContent = htmlContent.replace(
        /<script[^>]+src=["']script\.js["'][^>]*><\/script>/gi,
        `<script>${jsFile.content}</script>`
      );
    }
    
    // Handle local image references (data URLs for preview)
    project.projectFiles.filter(f => f.isImage).forEach(imageFile => {
      const regex = new RegExp(`src=["']${imageFile.name}["']`, 'gi');
      htmlContent = htmlContent.replace(regex, `src="${imageFile.content}"`);
    });
    
    // Add iframe-specific enhancements for better navigation handling
    const availableFiles = project.projectFiles.map(f => f.name).filter(name => name.endsWith('.html'));
    const iframeEnhancements = `
      <script>
        // Available HTML files in the project
        const availableFiles = ${JSON.stringify(availableFiles)};
        
        // Prevent iframe navigation issues and ensure smooth scrolling works
        document.addEventListener('DOMContentLoaded', function() {
          console.log('LumaUI-lite App Preview: Initializing iframe navigation enhancements');
          console.log('LumaUI-lite App Preview: Available HTML files:', availableFiles);
          
          // Handle all link clicks intelligently
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            console.log('LumaUI-lite App Preview: Link clicked:', href);
            
            // Handle anchor links (smooth scrolling within page)
            if (href.startsWith('#')) {
              const target = document.querySelector(href);
              if (target) {
                e.preventDefault();
                e.stopPropagation();
                console.log('LumaUI-lite App Preview: Scrolling to target:', href);
                
                target.scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'start'
                });
              } else {
                console.warn('LumaUI-lite App Preview: Target not found for:', href);
              }
              return;
            }
            
            // Handle navigation to project files
            if (availableFiles.includes(href)) {
              e.preventDefault();
              console.log('LumaUI-lite App Preview: Requesting navigation to project file:', href);
              // Send navigation request to parent
              window.parent.postMessage({
                type: 'navigate-to-page',
                page: href
              }, '*');
              return;
            }
            
            // Handle external links (allow them to open)
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
              console.log('LumaUI-lite App Preview: External link, allowing navigation:', href);
              return;
            }
            
            // Handle relative links to non-existent files
            if (!href.startsWith('#') && !availableFiles.includes(href)) {
              e.preventDefault();
              console.warn('LumaUI-lite App Preview: File not found in project:', href);
              alert('File "' + href + '" not found in project.');
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
            
            console.log('LumaUI-lite App Preview: Preventing external beforeunload');
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

  const handleRefresh = () => {
    setPreviewKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    const content = generatePreviewContent(currentPage);
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(content);
      newWindow.document.close();
    }
  };

  return (
    <div className="fixed bg-gray-50 dark:bg-gray-900 z-40 flex flex-col" style={{ top: '64px', left: '80px', right: '0', bottom: '0' }}>
      {/* Header */}
      <div className="glassmorphic border-b border-white/20 dark:border-gray-700/50 p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
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
                {project.type} • Running App Preview
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                  Live
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  📄 {currentPage}
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {currentPage !== 'index.html' && (
              <button
                onClick={() => {
                  setCurrentPage('index.html');
                  setPreviewKey(prev => prev + 1);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/30 transition-colors"
                title="Go to home page"
              >
                <Home className="w-3 h-3" />
                Home
              </button>
            )}
            
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Refresh app"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            
            <button
              onClick={handleOpenInNewTab}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3 h-3" />
              New Tab
            </button>
            
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/30 transition-colors"
              title="Close app preview"
            >
              <X className="w-3 h-3" />
              Close
            </button>
          </div>
        </div>
      </div>

      {/* App Preview */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden shadow-lg">
          <iframe
            key={previewKey}
            ref={iframeRef}
            className="w-full h-full border-0 bg-white"
            srcDoc={generatePreviewContent(currentPage)}
            title={`${project.name} - App Preview`}
            sandbox="allow-scripts allow-same-origin allow-forms"
            style={{
              colorScheme: 'light',
              backgroundColor: '#ffffff'
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default LumaUILiteAppPreview; 
