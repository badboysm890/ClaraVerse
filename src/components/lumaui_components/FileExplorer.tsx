import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderOpen, 
  Folder, 
  FileText, 
  Code, 
  Image, 
  Settings, 
  Database, 
  Plus,
  Trash2,
  Edit3,
  Copy,
  Scissors,
  FolderPlus,
  FilePlus,
  MoreHorizontal
} from 'lucide-react';
import { FileNode } from '../../types';

interface FileExplorerProps {
  files: FileNode[];
  selectedFile: string | null;
  onFileSelect: (path: string, content: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onCreateFile?: (parentPath: string, fileName: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  onDeleteFolder?: (path: string) => Promise<void>;
  onRenameFile?: (oldPath: string, newPath: string) => Promise<void>;
  onDuplicateFile?: (path: string) => Promise<void>;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetPath: string;
  targetType: 'file' | 'directory' | 'empty';
}

interface EditingState {
  path: string;
  type: 'rename' | 'create-file' | 'create-folder';
  originalName?: string;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, 
  selectedFile, 
  onFileSelect, 
  expandedFolders, 
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onDuplicateFile
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetPath: '',
    targetType: 'empty'
  });
  
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(prev => ({ ...prev, isOpen: false }));
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'directory') => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetPath: path,
      targetType: type
    });
  };

  // Handle empty area right-click
  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetPath: '',
      targetType: 'empty'
    });
  };

  // Start editing (rename or create)
  const startEditing = (path: string, type: 'rename' | 'create-file' | 'create-folder', originalName?: string) => {
    setEditing({ path, type, originalName });
    setEditValue(originalName || '');
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  // Handle edit submission
  const handleEditSubmit = async () => {
    if (!editing || !editValue.trim()) {
      setEditing(null);
      return;
    }

    try {
      switch (editing.type) {
        case 'rename':
          if (onRenameFile && editValue !== editing.originalName) {
            const pathParts = editing.path.split('/');
            pathParts[pathParts.length - 1] = editValue.trim();
            const newPath = pathParts.join('/');
            await onRenameFile(editing.path, newPath);
          }
          break;
        
        case 'create-file':
          if (onCreateFile) {
            await onCreateFile(editing.path, editValue.trim());
          }
          break;
        
        case 'create-folder':
          if (onCreateFolder) {
            await onCreateFolder(editing.path, editValue.trim());
          }
          break;
      }
    } catch (error) {
      console.error('Edit operation failed:', error);
    }
    
    setEditing(null);
    setEditValue('');
  };

  // Handle edit cancellation
  const handleEditCancel = () => {
    setEditing(null);
    setEditValue('');
  };

  // Handle key events in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  // Context menu actions
  const contextMenuActions = {
    createFile: () => {
      const targetPath = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';
      startEditing(targetPath, 'create-file');
    },
    
    createFolder: () => {
      const targetPath = contextMenu.targetType === 'directory' ? contextMenu.targetPath : '';
      startEditing(targetPath, 'create-folder');
    },
    
    rename: () => {
      const fileName = contextMenu.targetPath.split('/').pop() || '';
      startEditing(contextMenu.targetPath, 'rename', fileName);
    },
    
    duplicate: async () => {
      if (onDuplicateFile && contextMenu.targetType === 'file') {
        try {
          await onDuplicateFile(contextMenu.targetPath);
        } catch (error) {
          console.error('Duplicate failed:', error);
        }
      }
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    },
    
    delete: async () => {
      const confirmMessage = contextMenu.targetType === 'directory' 
        ? `Are you sure you want to delete the folder "${contextMenu.targetPath}" and all its contents?`
        : `Are you sure you want to delete "${contextMenu.targetPath}"?`;
      
      if (window.confirm(confirmMessage)) {
        try {
          if (contextMenu.targetType === 'directory' && onDeleteFolder) {
            await onDeleteFolder(contextMenu.targetPath);
          } else if (contextMenu.targetType === 'file' && onDeleteFile) {
            await onDeleteFile(contextMenu.targetPath);
          }
        } catch (error) {
          console.error('Delete failed:', error);
        }
      }
      setContextMenu(prev => ({ ...prev, isOpen: false }));
    }
  };
  
  // Get appropriate icon for file type with enhanced styling
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'vue':
      case 'svelte':
        return <Code className="w-4 h-4 text-emerald-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        return <Image className="w-4 h-4 text-sakura-500" />;
      case 'json':
      case 'yaml':
      case 'yml':
        return <Database className="w-4 h-4 text-blue-500" />;
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return <Settings className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };
  
  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;
    const isEditing = editing?.path === node.path && editing?.type === 'rename';
    
    return (
      <div key={node.path}>
        <div
          className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-200 hover:bg-gradient-to-r hover:from-sakura-50/60 hover:to-pink-50/60 dark:hover:from-sakura-900/30 dark:hover:to-pink-900/30 hover:border-l-2 hover:border-sakura-400 hover:shadow-sm hover:backdrop-blur-sm ${
            isSelected 
              ? 'bg-gradient-to-r from-sakura-100 to-pink-100 dark:from-sakura-900/50 dark:to-pink-900/50 border-l-3 border-sakura-500 shadow-md backdrop-blur-sm' 
              : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => {
            if (isEditing) return;
            
            if (node.type === 'directory') {
              onToggleFolder(node.path);
            } else if (node.content !== undefined) {
              onFileSelect(node.path, node.content);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, node.path, node.type)}
        >
          {node.type === 'directory' ? (
            <>
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-sakura-500 transition-colors" />
              ) : (
                <Folder className="w-4 h-4 text-sakura-400 group-hover:text-sakura-500 transition-colors" />
              )}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleEditSubmit}
                  className="text-sm font-medium bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-1 py-0.5 min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-sakura-700 dark:group-hover:text-sakura-300 transition-colors">
                  {node.name}
                </span>
              )}
            </>
          ) : (
            <>
              {getFileIcon(node.name)}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleEditSubmit}
                  className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-1 py-0.5 min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                  {node.name}
                </span>
              )}
              {isSelected && !isEditing && (
                <div className="ml-auto w-2 h-2 bg-gradient-to-br from-sakura-500 to-pink-500 rounded-full animate-pulse shadow-lg" />
              )}
            </>
          )}
        </div>
        
        {/* Render create file/folder inputs */}
        {editing?.path === node.path && editing.type === 'create-file' && (
          <div
            className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300"
            style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
          >
            <FileText className="w-4 h-4 text-gray-500" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="filename.ext"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {editing?.path === node.path && editing.type === 'create-folder' && (
          <div
            className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300"
            style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
          >
            <Folder className="w-4 h-4 text-sakura-400" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="folder name"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {node.type === 'directory' && isExpanded && node.children && (
          <div className="border-l border-sakura-200/50 dark:border-sakura-700/50 ml-6">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render create inputs for root level
  const renderRootCreateInputs = () => {
    if (!editing || editing.path !== '') return null;

    return (
      <div className="px-2">
        {editing.type === 'create-file' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300 rounded-r">
            <FileText className="w-4 h-4 text-gray-500" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="filename.ext"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
        
        {editing.type === 'create-folder' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sakura-50/50 dark:bg-sakura-900/20 border-l-2 border-sakura-300 rounded-r">
            <Folder className="w-4 h-4 text-sakura-400" />
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSubmit}
              placeholder="folder name"
              className="text-sm bg-white dark:bg-gray-800 border border-sakura-300 dark:border-sakura-600 rounded px-2 py-1 min-w-0 flex-1"
            />
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="h-full glassmorphic">
      <div className="p-4 border-b border-white/20 dark:border-gray-700/50 glassmorphic-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/40 dark:to-pink-900/40 rounded-xl flex items-center justify-center shadow-sm backdrop-blur-sm border border-white/30 dark:border-gray-700/50">
              <FolderOpen className="w-5 h-5 text-sakura-600 dark:text-sakura-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Explorer</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Project files</p>
            </div>
          </div>
          
          {/* Quick action buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => startEditing('', 'create-file')}
              className="p-1.5 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
              title="New File"
            >
              <FilePlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => startEditing('', 'create-folder')}
              className="p-1.5 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
              title="New Folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      <div 
        className="overflow-auto scrollbar-none p-2"
        onContextMenu={handleEmptyAreaContextMenu}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-20 h-20 bg-gradient-to-br from-sakura-100 to-pink-100 dark:from-sakura-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center mb-6 shadow-lg backdrop-blur-sm border border-white/30 dark:border-gray-700/50">
              <FolderOpen className="w-10 h-10 text-sakura-600 dark:text-sakura-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
              No Files Yet
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed mb-4">
              Start your project to explore files and directories
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => startEditing('', 'create-file')}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-sakura-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:shadow-md transition-all duration-200 transform hover:scale-105"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={() => startEditing('', 'create-folder')}
                className="flex items-center gap-2 px-3 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:shadow-md transition-all duration-200 transform hover:scale-105"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
            </div>
          </div>
        ) : (
          <>
            {renderRootCreateInputs()}
            {files.map(node => renderNode(node))}
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-2 min-w-48"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {contextMenu.targetType === 'empty' && (
            <>
              <button
                onClick={contextMenuActions.createFile}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={contextMenuActions.createFolder}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'directory' && (
            <>
              <button
                onClick={contextMenuActions.createFile}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                New File
              </button>
              <button
                onClick={contextMenuActions.createFolder}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.rename}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Rename
              </button>
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.delete}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Folder
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'file' && (
            <>
              <button
                onClick={contextMenuActions.rename}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={contextMenuActions.duplicate}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              <button
                onClick={contextMenuActions.delete}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete File
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FileExplorer; 
