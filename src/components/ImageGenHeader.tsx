import React from 'react';
import { Bell, Sun, Moon, Image, Settings, Download, ArrowLeftRight, RefreshCw, Cpu } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import UserProfileButton from './common/UserProfileButton';

interface ImageGenHeaderProps {
  userName?: string;
  onPageChange?: (page: string) => void;
  onComfyUIManager?: () => void;
  onModelManager?: () => void;
  onSwitchToComfyUI?: () => void;
  onRefreshComfyUI?: () => void;
  showComfyUIInterface?: boolean;
  comfyuiMode?: string;
  // Pass system stats from ComfyUI
  systemStats?: any;
  // Smart memory management props
  smartMemoryEnabled?: boolean;
  onToggleSmartMemory?: () => void;
}

const ImageGenHeader: React.FC<ImageGenHeaderProps> = ({
  userName,
  onPageChange,
  onComfyUIManager,
  onModelManager,
  onSwitchToComfyUI,
  onRefreshComfyUI,
  showComfyUIInterface,
  comfyuiMode,
  systemStats,
  smartMemoryEnabled,
  onToggleSmartMemory
}) => {
  const { isDark, setTheme } = useTheme();

  // Safely extract and format some system stats if available
  const pythonVersion = systemStats?.system?.python_version || 'N/A';
  const ramFree = systemStats?.system?.ram_free || 0;
  const ramTotal = systemStats?.system?.ram_total || 0;
  const ramFreeGB = (ramFree / 1_073_741_824).toFixed(2);  // Convert bytes to GB
  const ramTotalGB = (ramTotal / 1_073_741_824).toFixed(2);

  // Format ComfyUI mode for display
  const formatComfyUIMode = (mode: string | undefined) => {
    switch (mode?.toLowerCase()) {
      case 'docker':
        return 'Docker';
      case 'manual':
        return 'Manual';
      case 'auto':
        return 'Auto';
      default:
        return mode || 'Unknown';
    }
  };

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <div className="glassmorphic h-16 px-6 flex items-center justify-between">
      {/* Left side: System stats (if any) */}
      <div className="flex-1 flex items-center gap-6">
        <div className="text-xs text-gray-700 dark:text-gray-300">
          <span className="mr-4">
            <strong>ComfyUI:</strong> {formatComfyUIMode(comfyuiMode)}
          </span>
          {systemStats && (
            <>
              <span className="mr-4">
                <strong>Python:</strong> {pythonVersion}
              </span>
              <span>
                <strong>RAM:</strong> {ramFreeGB}/{ramTotalGB} GB
              </span>
            </>
          )}
        </div>
      </div>
      
      {/* Right side: Gallery, theme toggle, notifications, user info */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onPageChange?.('gallery')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
        >
          <Image className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Gallery</span>
        </button>

        {/* Only show Models and ComfyUI buttons when NOT in manual mode */}
        {comfyuiMode?.toLowerCase() !== 'manual' && (
          <>
            <button
              onClick={onModelManager}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
              title="Model Manager"
            >
              <Download className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Models</span>
            </button>

            <button
              onClick={onComfyUIManager}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
              title="ComfyUI Manager"
            >
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              <span className="text-sm text-gray-700 dark:text-gray-300">ComfyUI</span>
            </button>
          </>
        )}

        {/* ComfyUI Interface Button */}
        <button
          onClick={onSwitchToComfyUI}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          title={showComfyUIInterface ? "Switch back to angela ImageGen" : "Switch to ComfyUI Interface"}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span className="text-sm font-medium">
            {showComfyUIInterface ? "Back to angela" : "ComfyUI Interface"}
          </span>
        </button>

        {/* Refresh ComfyUI Button - only show when in ComfyUI mode */}
        {showComfyUIInterface && onRefreshComfyUI && (
          <button
            onClick={onRefreshComfyUI}
            className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            title="Refresh ComfyUI Interface"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}

        {/* Smart Memory Toggle */}
        <button
          onClick={onToggleSmartMemory}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
            smartMemoryEnabled 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title={smartMemoryEnabled ? "Smart Memory: Models stay loaded between generations for maximum speed" : "Smart Memory: Disabled - models are unloaded after each generation (saves VRAM)"}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-xs font-medium">
            {smartMemoryEnabled ? 'Smart Memory' : 'Standard Memory'}
          </span>
        </button>

        <button 
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          )}
        </button>

        <button className="p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors">
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        <UserProfileButton
          userName={userName || 'Profile'}
          onPageChange={onPageChange || (() => {})}
        />
      </div>
    </div>
  );
};

export default ImageGenHeader;
