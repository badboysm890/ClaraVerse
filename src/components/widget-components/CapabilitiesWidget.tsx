import React from 'react';
import { 
  Zap, 
  XCircle,
  Code,
  FileText,
  ImageIcon
} from 'lucide-react';

interface CapabilitiesWidgetProps {
  id: string;
  onRemove: (id: string) => void;
}

const CapabilitiesWidget: React.FC<CapabilitiesWidgetProps> = ({ id, onRemove }) => {
  return (
    <div className="glassmorphic rounded-2xl p-4 sm:p-6 lg:p-8 animate-fadeIn animation-delay-400 relative group h-full">
      <button
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="p-2 sm:p-3 lg:p-4 bg-green-100 dark:bg-green-800/30 rounded-lg sm:rounded-xl">
          <Zap className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-green-500" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white mb-0.5 sm:mb-1">
            What You Can Do
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Explore angela's capabilities
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mt-2 sm:mt-4">
        <div className="bg-white/50 dark:bg-gray-800/50 p-3 sm:p-4 lg:p-5 rounded-lg sm:rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <Code className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
            <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Code Assistant</h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Ask about coding problems, debug issues, or generate code snippets in multiple languages.
          </p>
        </div>
        
        <div className="bg-white/50 dark:bg-gray-800/50 p-3 sm:p-4 lg:p-5 rounded-lg sm:rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
            <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Content Creation</h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Generate creative writing, summaries, translations, or professional documents.
          </p>
        </div>
        
        <div className="bg-white/50 dark:bg-gray-800/50 p-3 sm:p-4 lg:p-5 rounded-lg sm:rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-pink-500" />
            <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Image Generation</h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Create custom images with detailed prompts, adjust styles, and explore various artistic effects.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CapabilitiesWidget; 
