import React, { useState } from 'react';
import { X, Plus, FolderOpen, Clock, Play, Trash2 } from 'lucide-react';
import { Project } from '../../types';

interface ProjectSelectionModalProps {
  isOpen: boolean;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onDeleteProject: (project: Project) => Promise<void>;
  onCreateNew: () => void;
  onClose: () => void;
}

const ProjectSelectionModal: React.FC<ProjectSelectionModalProps> = ({
  isOpen,
  projects,
  onSelectProject,
  onDeleteProject,
  onCreateNew,
  onClose
}) => {
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'error':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  const handleDeleteProject = async (project: Project, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the select action
    
    if (confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      setDeletingProjectId(project.id);
      try {
        await onDeleteProject(project);
      } finally {
        setDeletingProjectId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
              Select a Project
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Choose an existing project to continue working on
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Create New Project Button */}
          <button
            onClick={onCreateNew}
            className="w-full p-4 border-2 border-dashed border-sakura-300 dark:border-sakura-600 rounded-lg hover:border-sakura-400 dark:hover:border-sakura-500 hover:bg-sakura-50 dark:hover:bg-sakura-900/10 transition-colors group mb-6"
          >
            <div className="flex items-center justify-center gap-3">
              <div className="p-2 bg-sakura-100 dark:bg-sakura-900/20 rounded-lg group-hover:bg-sakura-200 dark:group-hover:bg-sakura-800/30 transition-colors">
                <Plus className="w-5 h-5 text-sakura-600 dark:text-sakura-400" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-gray-800 dark:text-gray-200">
                  Create New Project
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Start fresh with a new project template
                </p>
              </div>
            </div>
          </button>

          {/* Projects List */}
          {projects.length > 0 ? (
            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Recent Projects ({projects.length})
              </h3>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-sakura-300 dark:hover:border-sakura-600 transition-colors group"
                >
                  <button
                    onClick={() => onSelectProject(project)}
                    className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg group-hover:bg-sakura-100 dark:group-hover:bg-sakura-900/20 transition-colors">
                          <FolderOpen className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-sakura-600 dark:group-hover:text-sakura-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-gray-800 dark:text-gray-200 truncate">
                            {project.name}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {project.framework.replace('-', ' ')}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Clock className="w-3 h-3" />
                              {formatDate(project.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                        {project.status === 'running' && (
                          <Play className="w-4 h-4 text-green-500" />
                        )}
                        <button
                          onClick={(e) => handleDeleteProject(project, e)}
                          disabled={deletingProjectId === project.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete project"
                        >
                          {deletingProjectId === project.id ? (
                            <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                No Projects Yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Create your first project to get started
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            You can always create new projects or switch between them later
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProjectSelectionModal; 
