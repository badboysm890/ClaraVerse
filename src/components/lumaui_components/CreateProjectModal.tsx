import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { PROJECT_CONFIGS } from '../../services/projectScaffolder';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, configId: string) => Promise<void>;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateProject 
}) => {
  const [projectName, setProjectName] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('react-vite-tailwind');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    
    setIsCreating(true);
    try {
      await onCreateProject(projectName.trim(), selectedConfig);
      setProjectName('');
      setSelectedConfig('react-vite-tailwind');
      onClose();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const projectConfigs = Object.values(PROJECT_CONFIGS);
  
  // Add coming soon options that are not yet implemented
  const comingSoonOptions = [
    {
      id: 'expo',
      name: 'Expo (React Native)',
      description: 'Cross-platform mobile app development',
      icon: '📱',
      category: 'Mobile',
      comingSoon: true
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glassmorphic border border-white/20 dark:border-gray-700/50 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              Create New Project
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose a framework to get started
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-awesome-project"
              disabled={isCreating}
              className="w-full px-4 py-3 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-sakura-500 focus:border-sakura-500 dark:text-gray-100 disabled:opacity-50 placeholder-gray-500 dark:placeholder-gray-400 transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="framework" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Choose Your Framework
            </label>
            <div className="space-y-3">
              {/* Available Project Configurations */}
              {projectConfigs.map((config) => (
                <label
                  key={config.id}
                  className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 group ${
                    selectedConfig === config.id
                      ? 'border-sakura-500 bg-gradient-to-r from-sakura-50 to-pink-50 dark:from-sakura-900/20 dark:to-pink-900/20 shadow-lg'
                      : 'border-white/30 dark:border-gray-700/50 glassmorphic-card hover:border-sakura-300 dark:hover:border-sakura-600'
                  } ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="framework"
                    value={config.id}
                    checked={selectedConfig === config.id}
                    onChange={(e) => setSelectedConfig(e.target.value)}
                    disabled={isCreating}
                    className="sr-only"
                  />
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="text-3xl transition-transform group-hover:scale-110">
                      {config.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        {config.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {config.description}
                      </div>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-sakura-100 to-pink-100 text-sakura-700 dark:from-sakura-900/30 dark:to-pink-900/30 dark:text-sakura-300">
                        {config.category}
                      </div>
                    </div>
                  </div>
                  {selectedConfig === config.id && (
                    <div className="w-5 h-5 bg-gradient-to-r from-sakura-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  )}
                </label>
              ))}
              
              {/* Coming Soon Options */}
              {comingSoonOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center p-4 border-2 border-gray-300/50 dark:border-gray-600/50 rounded-xl opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="text-3xl grayscale">
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                        {option.name}
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 dark:from-amber-900/30 dark:to-orange-900/30 dark:text-amber-300 shadow-sm">
                          Coming Soon
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {option.description}
                      </div>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {option.category}
                      </div>
                    </div>
                  </div>
                  <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center opacity-50">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim() || isCreating}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sakura-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-sakura-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal; 
