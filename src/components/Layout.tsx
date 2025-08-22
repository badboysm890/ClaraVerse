import React, { useState, useEffect } from 'react';

interface ElectronWithUpdates {
  checkForUpdates?: () => Promise<void>;
  [key: string]: any;
}

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [showGlobalContextMenu, setShowGlobalContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.closest('button') || 
          target.closest('a') || 
          target.closest('input') || 
          target.closest('textarea') || 
          target.closest('.context-menu') ||
          target.closest('[data-no-context-menu="true"]')) {
        return;
      }
      
      e.preventDefault();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowGlobalContextMenu(true);
    };

    const handleClick = () => {
      if (showGlobalContextMenu) {
        setShowGlobalContextMenu(false);
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, [showGlobalContextMenu]);

  const handleCheckForUpdates = () => {
    const electron = window.electron as ElectronWithUpdates;
    if (electron && electron.checkForUpdates) {
      electron.checkForUpdates();
    }
    setShowGlobalContextMenu(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {showGlobalContextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
          }}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={handleCheckForUpdates}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
            Check for Updates
          </button>
        </div>
      )}
      
      {children}
    </div>
  );
};

export default Layout; 
