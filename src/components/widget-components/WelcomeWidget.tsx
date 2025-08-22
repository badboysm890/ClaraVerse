import React from 'react';
import { Bot, XCircle, ArrowRight, Settings, Cpu, Server } from 'lucide-react';

interface WelcomeWidgetProps {
  id: string;
  onRemove: (id: string) => void;
  pythonStatus: 'checking' | 'connected' | 'disconnected';
  pythonPort: number | null;
  onPageChange?: (page: string) => void;
}

const WelcomeWidget: React.FC<WelcomeWidgetProps> = ({ 
  id, 
  onRemove, 
  pythonStatus, 
  pythonPort,
  onPageChange 
}) => {
  return (
    <div className="glassmorphic rounded-2xl p-4 sm:p-6 lg:p-8 animate-fadeIn relative group h-full flex flex-col">
      <button
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <div className="flex flex-col md:flex-row md:items-center h-full">
        <div className="flex items-center gap-2 sm:gap-4 mb-4 md:mb-0 md:mr-6 md:min-w-[250px]">
          <div className="p-2 sm:p-4 bg-sakura-100 dark:bg-sakura-100/10 rounded-xl">
            <Bot className="w-6 h-6 sm:w-8 sm:h-8 text-sakura-500" />
          </div>
          <div className="flex-grow">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                angela 
              </h1>
              <div className="flex items-center gap-2">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    pythonStatus === 'connected' 
                      ? 'bg-green-500 animate-pulse' 
                      : 'bg-red-500'
                  }`}
                />
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  {pythonStatus === 'connected' 
                    ? pythonPort 
                      ? `Systems nominal` 
                      : 'Online' 
                    : 'Offline'}
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              Here to speed up your workflow and protect your privacy.
            </p>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 flex-grow">
          {/* Chat Action */}
          <button 
            onClick={() => onPageChange?.('assistant')}
            className="group flex flex-col items-center text-center rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-3 sm:p-4"
          >
            <div className="mb-2">
              <div className="p-2 bg-sakura-100/50 dark:bg-sakura-500/20 rounded-xl backdrop-blur-sm">
                <Bot className="w-5 h-5 text-sakura-500" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Start Chatting
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 line-clamp-1">
              Chat with angela
            </p>
          </button>

          {/* Agents Action */}
          <button 
            onClick={() => onPageChange?.('agents')}
            className="group flex flex-col items-center text-center rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-3 sm:p-4"
          >
            <div className="mb-2">
              <div className="p-2 bg-blue-100/50 dark:bg-blue-500/20 rounded-xl backdrop-blur-sm">
                <Cpu className="w-5 h-5 text-blue-500" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Agents
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 line-clamp-1">
              Manage AI agents
            </p>
          </button>

          {/* Automation Action */}
          <button 
            onClick={() => onPageChange?.('n8n')}
            className="group flex flex-col items-center text-center rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-3 sm:p-4"
          >
            <div className="mb-2">
              <div className="p-2 bg-purple-100/50 dark:bg-purple-500/20 rounded-xl backdrop-blur-sm">
                <Server className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Automation
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 line-clamp-1">
              Create workflows
            </p>
          </button>

          {/* Settings Action */}
          <button 
            onClick={() => onPageChange?.('settings')}
            className="group flex flex-col items-center text-center rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-3 sm:p-4"
          >
            <div className="mb-2">
              <div className="p-2 bg-emerald-100/50 dark:bg-emerald-500/20 rounded-xl backdrop-blur-sm">
                <Settings className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Settings
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 line-clamp-1">
              Configure angela
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeWidget; 
