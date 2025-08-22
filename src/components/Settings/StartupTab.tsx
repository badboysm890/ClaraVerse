import { useEffect, useState } from 'react';
import { Power, Maximize2, Minimize2, History, AlertTriangle } from 'lucide-react';
import { StartupService, type StartupSettings } from '../../services/startupService';

const StartupTab = () => {
  const [settings, setSettings] = useState<StartupSettings>({
    startFullscreen: false,
    startMinimized: false,
    autoStart: false,
    checkUpdates: true, // Keep this for compatibility but don't show it
    restoreLastSession: true,
    isDevelopment: false
  });

  useEffect(() => {
    const loadSettings = async () => {
      const startupService = StartupService.getInstance();
      const currentSettings = await startupService.getStartupSettings();
      setSettings(currentSettings);
    };
    loadSettings();
  }, []);

  const handleStartupSettingChange = async (key: keyof StartupSettings, value: boolean) => {
    const startupService = StartupService.getInstance();
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await startupService.updateStartupSettings(newSettings);
  };

  return (
    <div className="space-y-6">
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-sakura-500 rounded-lg flex items-center justify-center shadow-md">
            <Power className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Startup & Launch</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Control how angela starts and behaves when launching
            </p>
          </div>
        </div>
        
        {/* System Startup Behavior */}
        <div className="space-y-6">
          {/* Development Mode Warning */}
          {settings.isDevelopment && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-amber-200/50 dark:border-amber-800/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">Development Mode</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Auto-start is disabled in development mode to prevent startup issues. 
                    Use the built production version for auto-start functionality.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Integration</h3>
            <div className="space-y-4">
              {/* Auto Start */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Power className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Auto Start with System</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Launch angela automatically when you start your computer
                      {settings.isDevelopment && (
                        <span className="text-amber-600 dark:text-amber-400 ml-1">(Disabled in development mode)</span>
                      )}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle auto start with system">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.autoStart && !settings.isDevelopment}
                    onChange={(e) => handleStartupSettingChange('autoStart', e.target.checked)}
                    aria-describedby="auto-start-description"
                    disabled={settings.isDevelopment}
                  />
                  <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 ${settings.isDevelopment ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* Start Minimized */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Minimize2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Start Minimized</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Launch angela in the system tray instead of showing the main window</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle start minimized">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.startMinimized}
                    onChange={(e) => handleStartupSettingChange('startMinimized', e.target.checked)}
                    aria-describedby="start-minimized-description"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 dark:peer-focus:ring-blue-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Window & Session Behavior */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Window & Session</h3>
            <div className="space-y-4">
              {/* Start Fullscreen */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Maximize2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Start Fullscreen</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Launch angela in fullscreen mode for immersive experience</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle start fullscreen">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.startFullscreen}
                    onChange={(e) => handleStartupSettingChange('startFullscreen', e.target.checked)}
                    aria-describedby="start-fullscreen-description"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Restore Last Session */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Restore Last Session</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Automatically restore your last active project and workspace layout</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle restore last session">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.restoreLastSession}
                    onChange={(e) => handleStartupSettingChange('restoreLastSession', e.target.checked)}
                    aria-describedby="restore-session-description"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 dark:peer-focus:ring-purple-800/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Startup Tips */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200/50 dark:border-amber-800/30">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">💡</span>
              </div>
              <div>
                <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Pro Tips</h4>
                <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                  <li>• Enable "Start Minimized" with "Auto Start" for seamless background operation</li>
                  <li>• Use "Restore Last Session" to quickly continue where you left off</li>
                  <li>• "Start Fullscreen" is great for presentations and focused work sessions</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartupTab; 
