import React from 'react';
import { Folder } from 'lucide-react';
import { Project } from '../../types';

interface ProjectTabsProps {
  projects: Project[];
  selectedProject: Project | null;
  onProjectSelect: (project: Project) => void;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({ 
  projects, 
  selectedProject, 
  onProjectSelect 
}) => {
  if (projects.length === 0) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {projects.map(project => (
        <button
          key={project.id}
          onClick={() => onProjectSelect(project)}
          className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm whitespace-nowrap ${
            selectedProject?.id === project.id
              ? 'bg-sakura-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          <Folder className="w-3 h-3" />
          {project.name}
          <div className={`w-2 h-2 rounded-full ${
            project.status === 'running' ? 'bg-green-400' :
            project.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
          }`} />
        </button>
      ))}
    </div>
  );
};

export default ProjectTabs; 
