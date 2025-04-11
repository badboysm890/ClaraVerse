import React, { useState } from 'react';
import { ArrowLeft, Save, PlayCircle, Bug, Trash2, Import, Share2, AlertCircle, Maximize, Minimize } from 'lucide-react';
import { appStore } from '../../services/AppStore';

interface TopBarProps {
  onPageChange: (page: string) => void;
  handleOpenSaveModal: () => void;
  handleTestApp: () => void;
  handleDebug: () => void;
  onExportApp: () => void;
  onImportApp: () => void;
  appName?: string;
  setAppName?: (name: string) => void;
  isExecuting?: boolean;
  appId?: string;
  hasUnsavedChanges: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ 
  onPageChange, 
  handleOpenSaveModal, 
  handleTestApp, 
  handleDebug, 
  onExportApp,
  onImportApp,
  appName = "New App", 
  setAppName,
  isExecuting = false,
  appId,
  hasUnsavedChanges,
  previewEnabled,
  onTogglePreview
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(appName);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const handleTitleClick = () => {
    if (setAppName) {
      setIsEditingTitle(true);
      setTempTitle(appName);
    }
  };
  
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempTitle(e.target.value);
  };
  
  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (setAppName && tempTitle.trim()) {
      setAppName(tempTitle.trim());
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleBlur();
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!appId) return;
    
    try {
      await appStore.deleteApp(appId);
      
      // Clear app ID from localStorage
      if (localStorage.getItem('current_app_id') === appId) {
        localStorage.removeItem('current_app_id');
      }
      
      // Navigate back to apps page
      onPageChange('apps');
    } catch (error) {
      console.error('Error deleting app:', error);
      alert('Failed to delete app. Please try again.');
    }
    
    setShowDeleteConfirm(false);
  };
  
  return (
    <>
      <div className="glassmorphic flex items-center justify-between p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onPageChange('apps')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 text-gray-700 dark:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Apps</span>
          </button>
          
          {isEditingTitle ? (
            <input
              type="text"
              value={tempTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleKeyDown}
              autoFocus
              className="text-xl font-semibold bg-transparent border-b-2 border-sakura-300 focus:border-sakura-500 outline-none text-gray-900 dark:text-white"
            />
          ) : (
            <h1 
              className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-sakura-600 dark:hover:text-sakura-400"
              onClick={handleTitleClick}
            >
              {appName}
            </h1>
          )}
          {hasUnsavedChanges && (
            <div className="flex items-center text-amber-500 text-xs">
              <AlertCircle className="w-4 h-4 mr-1" />
              <span>Unsaved changes</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePreview}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md 
              text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            title={previewEnabled ? "Hide Preview" : "Show Preview"}
          >
            {previewEnabled ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {previewEnabled ? "Hide Preview" : "Show Preview"}
          </button>
          {/* Show delete button only when editing an existing app */}
          {appId && (
            <div className="group relative">
              <button 
                onClick={handleDeleteClick}
                className="flex items-center justify-center p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors shadow-sm border border-red-400"
                aria-label="Delete app"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
                <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                  <p className="whitespace-nowrap">Delete App 🗑️</p>
                  {/* <p className="text-xs text-gray-300">Remove this app permanently</p> */}
                </div>
                <div className="absolute top-1/2 -left-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            </div>
          )}
          
          <div className="group relative">
            <button 
              onClick={handleOpenSaveModal}
              className="flex items-center justify-center p-2 rounded-lg bg-sakura-500 hover:bg-sakura-600 text-white transition-colors shadow-sm border border-sakura-400"
              aria-label="Save"
            >
              <Save className="w-5 h-5" />
            </button>
            <div className="absolute right-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
              <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                <p className="whitespace-nowrap">Save App 💾</p>
                {/* <p className="text-xs text-gray-300">Save current app state</p> */}
              </div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>

          <div className="group relative">
            <button 
              onClick={handleTestApp}
              disabled={isExecuting}
              className={`flex items-center justify-center p-2 rounded-lg shadow-sm border ${
                isExecuting 
                  ? 'bg-gray-400 cursor-not-allowed border-gray-300 text-gray-100' 
                  : 'bg-green-500 hover:bg-green-600 border-green-400 text-white'
              } transition-colors`}
              aria-label="Test"
            >
              <PlayCircle className="w-5 h-5" />
            </button>
            <div className="absolute right-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
              <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                <p className="whitespace-nowrap">Run Flow 🚀</p>
                {/* <p className="text-xs text-gray-300">Execute the current flow</p> */}
              </div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>

          <div className="group relative">
            <button 
              onClick={handleDebug}
              className="flex items-center justify-center p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors shadow-sm border border-blue-400"
              aria-label="Debug"
            >
              <Bug className="w-5 h-5" />
            </button>
            <div className="absolute right-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
              <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                <p className="whitespace-nowrap">Debug Flow 🐛</p>
                {/* <p className="text-xs text-gray-300">View flow execution plan</p> */}
              </div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>

          <div className="group relative">
            <button
              onClick={onImportApp}
              className="flex items-center justify-center p-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors shadow-sm border border-violet-400"
              aria-label="Import"
            >
              <Import className="w-5 h-5" />
            </button>
            <div className="absolute right-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
              <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                <p className="whitespace-nowrap">Import App 📥</p>
                <p className="text-xs text-gray-300">Import app from file</p>
              </div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>

          <div className="group relative">
            <button
              onClick={onExportApp}
              className="flex items-center justify-center p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm border border-amber-400"
              aria-label="Export"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <div className="absolute right-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-[9999]">
              <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl">
                <p className="whitespace-nowrap">Export App 📤</p>
                <p className="text-xs text-gray-300">Export app to file</p>
              </div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black bg-opacity-60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="relative glassmorphic dark:bg-gray-800/90 bg-white/95 rounded-lg shadow-xl p-6 max-w-md w-full border border-white/20 dark:border-gray-700/50">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">Delete App</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              WARNING: This action is irreversible. All app data, configurations, and history will be permanently deleted.
            </p>
            <p className="font-bold text-gray-800 dark:text-gray-200 mb-6">
              Are you absolutely sure you want to delete "{appName}"?
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopBar;
