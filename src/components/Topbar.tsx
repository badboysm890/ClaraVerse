import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Clock, LogOut, Loader2, MessageCircle, Brain } from 'lucide-react';
import { useTheme, ThemeMode } from '../hooks/useTheme';
import UserProfileButton from './common/UserProfileButton';
import NotificationPanel from './common/NotificationPanel';
import SystemMonitor from './common/SystemMonitor';
import { db } from '../db';

interface TopbarProps {
  userName?: string;
  onPageChange?: (page: string) => void;
  projectTitle?: string;
  showProjectTitle?: boolean;
  // angela brain switch props (only used on angela page)
  showangelaBrainSwitch?: boolean;
  angelaBrainActiveTab?: 'chat' | 'brain';
  onangelaBrainTabChange?: (tab: 'chat' | 'brain') => void;
  angelaBrainMemoryLevel?: number;
  angelaBrainIsLoading?: boolean;
}

const Topbar = ({ 
  userName, 
  onPageChange, 
  projectTitle, 
  showProjectTitle = false,
  showangelaBrainSwitch = false,
  angelaBrainActiveTab = 'chat',
  onangelaBrainTabChange,
  angelaBrainMemoryLevel = 0,
  angelaBrainIsLoading = false
}: TopbarProps) => {
  const { theme, setTheme } = useTheme();
  const [now, setNow] = useState(new Date());
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [personalInfo, setPersonalInfo] = useState<any>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let timer = setInterval(() => setNow(new Date()), 1000);
    db.getPersonalInfo().then(info => {
      setPersonalInfo(info);
      if (info?.timezone) setTimezone(info.timezone);
      if (info?.theme_preference && (info.theme_preference === 'light' || info.theme_preference === 'dark' || info.theme_preference === 'system')) {
        setTheme(info.theme_preference as ThemeMode);
      }
    });
    return () => clearInterval(timer);
  }, [setTheme]);

  const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone });
  const dateString = now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone });
  const dayString = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });

  // Helper to update theme everywhere
  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    if (personalInfo) {
      db.updatePersonalInfo({ ...personalInfo, theme_preference: newTheme });
      setPersonalInfo({ ...personalInfo, theme_preference: newTheme });
    }
  };

  // Cycle through theme modes: light -> dark -> system -> light ...
  const cycleTheme = () => {
    let newTheme: ThemeMode;
    if (theme === 'light') newTheme = 'dark';
    else if (theme === 'dark') newTheme = 'system';
    else newTheme = 'light';
    handleThemeChange(newTheme);
  };

  // Handle app cleanup
  const handleCleanup = async () => {
    try {
      setIsExiting(true);
      
      // Get all services that need cleanup
      const services = [
        // WebContainer cleanup
        async () => {
          const webContainerManager = (window as any).webContainerManager;
          if (webContainerManager) {
            await webContainerManager.cleanup();
          }
        },
        // TTS cleanup
        async () => {
          const angelaTTSService = (window as any).angelaTTSService;
          if (angelaTTSService) {
            angelaTTSService.destroy();
          }
        },
        // Docker containers cleanup
        async () => {
          const electronAPI = (window as any).electronAPI;
          if (!electronAPI) {
            console.error('electronAPI not available');
            return;
          }

          // Get all containers
          const containers = await electronAPI.getContainers();
          
          // Stop and remove all angela containers
          for (const container of containers) {
            if (container.name.startsWith('angela_')) {
              try {
                // Stop the container first
                await electronAPI.containerAction(container.id, 'stop');
                // Then remove it
                await electronAPI.containerAction(container.id, 'remove');
              } catch (error) {
                console.error(`Error cleaning up container ${container.name}:`, error);
              }
            }
          }
        }
      ];

      // Execute all cleanup tasks
      await Promise.all(services.map(service => service().catch(error => {
        console.error('Error during service cleanup:', error);
      })));

      // Close the app
      if (window.electron) {
        window.electron.send('app-close', {});
      } else {
        window.close();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Still try to close the app even if cleanup fails
      if (window.electron) {
        window.electron.send('app-close', {});
      } else {
        window.close();
      }
    }
  };

  return (
    <div className="glassmorphic h-16 px-6 flex items-center justify-between relative z-[10000]">
      {/* Left section - System Monitor */}
      <div className="flex-1 flex items-center">
        <SystemMonitor />
      </div>
      
      {/* Center section - Project Title and Clock */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center min-w-[120px]">
        {showProjectTitle && projectTitle && (
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white mb-0.5">
            {projectTitle}
          </h1>
        )}
        <div className="text-xs font-mono text-gray-700 dark:text-gray-200 flex flex-row items-center gap-2 min-w-[90px]">
          <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mr-1" />
          <span className="font-semibold tracking-widest text-xs text-gray-700 dark:text-gray-200" style={{letterSpacing: '0.08em'}}>{timeString}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">· {dateString} · {dayString}</span>
        </div>
      </div>
      
      {/* Right section - Controls */}
      <div className="flex items-center gap-6">
        {/* angela Brain Switch - Single toggle icon only visible on angela page */}
        {showangelaBrainSwitch && (
          <button
            onClick={() => onangelaBrainTabChange?.(angelaBrainActiveTab === 'chat' ? 'brain' : 'chat')}
            className="p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors relative"
            title={angelaBrainActiveTab === 'chat' ? "Switch to angela's Brain" : "Switch to Chat"}
            aria-label={angelaBrainActiveTab === 'chat' ? "Switch to angela's Brain" : "Switch to Chat"}
          >
            {angelaBrainActiveTab === 'chat' ? (
              <Brain className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            ) : (
              <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            )}
            
            {/* Activity indicator for chat when on brain tab */}
            {angelaBrainActiveTab === 'brain' && angelaBrainIsLoading && (
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            )}
            
            {/* Memory indicator for brain when on chat tab */}
            {angelaBrainActiveTab === 'chat' && angelaBrainMemoryLevel > 0 && (
              <div className="absolute -top-1 -right-1 px-1 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full min-w-[16px] text-center">
                {angelaBrainMemoryLevel}%
              </div>
            )}
          </button>
        )}
        
        <button 
          onClick={cycleTheme}
          className="p-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'light' && <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
          {theme === 'dark' && <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
          {theme === 'system' && <Monitor className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        </button>
        <NotificationPanel onNavigateToangela={() => onPageChange?.('angela')} />
        <UserProfileButton
          userName={userName || personalInfo?.name || 'Profile'}
          avatarUrl={personalInfo?.avatar_url}
          onPageChange={onPageChange || (() => {})}
        />
        <button 
          onClick={handleCleanup}
          disabled={isExiting}
          className={`p-2 rounded-lg transition-colors group relative ${
            isExiting 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
          aria-label="Exit application"
          title="Exit angela"
        >
          {isExiting ? (
            <Loader2 className="w-5 h-5 text-red-600 dark:text-red-400 animate-spin" />
          ) : (
            <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
          )}
        </button>
      </div>
    </div>
  );
};

export default Topbar;
