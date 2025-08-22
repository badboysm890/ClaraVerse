import React from 'react';
import { 
  Star, 
  XCircle, 
  RefreshCw, 
  TerminalSquare, 
  Cpu, 
  Database, 
  Trash2, 
  ArrowRight,
  Sparkles,
  Zap,
  Lightbulb
} from 'lucide-react';

interface WhatsNewWidgetProps {
  id: string;
  onRemove: (id: string) => void;
}

const WhatsNewWidget: React.FC<WhatsNewWidgetProps> = ({ id, onRemove }) => {
  return (
    <div className="glassmorphic p-3 sm:p-4 h-full flex flex-col group relative">
      <button
        className="absolute top-2 right-2 sm:top-3 sm:right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <div className="flex items-center h-full">
        {/* Header */}
        <div className="flex items-center gap-2 mr-4 flex-shrink-0">
          <div className="p-1.5 rounded-lg bg-sakura-100 dark:bg-sakura-500/20">
            <Sparkles className="w-4 h-4 text-sakura-500" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">
            What's New
          </h3>
        </div>
        
        {/* Cards */}
        <div className="flex gap-3 sm:gap-4 flex-grow overflow-hidden">
          {/* Latest Feature */}
          <div className="bg-white/70 dark:bg-gray-800/70 p-2 sm:p-3 rounded-lg backdrop-blur-sm flex-1 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-sakura-100 to-transparent dark:from-sakura-500/10 dark:to-transparent opacity-50 -mt-8 -mr-8 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-0.5 rounded-md bg-green-100 dark:bg-green-500/20">
                  <Zap className="w-3 h-3 text-green-500" />
                </div>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">New Feature</span>
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">Privacy-focused AI</h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1">
                All AI processing happens locally, keeping your data private.
              </p>
            </div>
          </div>
          
          {/* Recent Update */}
          <div className="bg-white/70 dark:bg-gray-800/70 p-2 sm:p-3 rounded-lg backdrop-blur-sm flex-1 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-blue-100 to-transparent dark:from-blue-500/10 dark:to-transparent opacity-50 -mt-8 -mr-8 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-0.5 rounded-md bg-blue-100 dark:bg-blue-500/20">
                  <RefreshCw className="w-3 h-3 text-blue-500" />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Recent Update</span>
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">Customizable Widgets</h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1">
                Personalize your dashboard with widgets that matter to you.
              </p>
            </div>
          </div>
          
          {/* Coming Soon */}
          <div className="bg-white/70 dark:bg-gray-800/70 p-2 sm:p-3 rounded-lg backdrop-blur-sm flex-1 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-purple-100 to-transparent dark:from-purple-500/10 dark:to-transparent opacity-50 -mt-8 -mr-8 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-0.5 rounded-md bg-purple-100 dark:bg-purple-500/20">
                  <Lightbulb className="w-3 h-3 text-purple-500" />
                </div>
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Coming Soon</span>
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">Enhanced Workflows</h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1">
                Connect angela to your tools for seamless automation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewWidget; 
