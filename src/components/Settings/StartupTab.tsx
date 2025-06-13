import React, { useEffect, useState } from 'react';
import { Power, Maximize2, Minimize2, RefreshCw, History } from 'lucide-react';
import { StartupService, type StartupSettings } from '../../services/startupService';

const StartupTab = () => {
  const [settings, setSettings] = useState<StartupSettings>({
    startFullscreen: false,
    startMinimized: false,
    autoStart: false,
    checkUpdates: true,
    restoreLastSession: true
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
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Startup Settings</h2>
        
        <div className="space-y-4">
          {/* Auto Start */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Power className="w-5 h-5 text-sakura-500" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Auto Start with System</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Launch Clara automatically when you start your computer</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.autoStart}
                onChange={(e) => handleStartupSettingChange('autoStart', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>

          {/* Start Minimized */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Minimize2 className="w-5 h-5 text-sakura-500" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Start Minimized</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Launch Clara in the system tray instead of showing the main window</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.startMinimized}
                onChange={(e) => handleStartupSettingChange('startMinimized', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>

          {/* Start Fullscreen */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Maximize2 className="w-5 h-5 text-sakura-500" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Start Fullscreen</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Launch Clara in fullscreen mode</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.startFullscreen}
                onChange={(e) => handleStartupSettingChange('startFullscreen', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>

          {/* Check for Updates */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-sakura-500" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Check for Updates</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automatically check for updates when Clara starts</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.checkUpdates}
                onChange={(e) => handleStartupSettingChange('checkUpdates', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>

          {/* Restore Last Session */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-sakura-500" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Restore Last Session</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automatically restore your last active project and workspace layout</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.restoreLastSession}
                onChange={(e) => handleStartupSettingChange('restoreLastSession', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartupTab; 