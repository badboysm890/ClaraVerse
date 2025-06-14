import React, { useEffect, useState, useRef } from 'react';
import { Save, User, Server, Settings as SettingsIcon, Bot, Brain, Puzzle, Hammer, RefreshCw, Power } from 'lucide-react';
import { db, type PersonalInfo, type APIConfig } from '../db';
import { useTheme, ThemeMode } from '../hooks/useTheme';
import { useProviders } from '../contexts/ProvidersContext';
import MCPSettings from './MCPSettings';
import ToolBelt from './ToolBelt';
import ProfileTab from './Settings/ProfileTab';
import PreferencesTab from './Settings/PreferencesTab';
import AIServicesTab from './Settings/AIServicesTab';
import LocalModelsTab from './Settings/LocalModelsTab';
import ServicesTab from './Settings/ServicesTab';
import ExportCodeTab from './Settings/ExportCodeTab';
import UpdatesTab from './Settings/UpdatesTab';
import StartupTab from './Settings/StartupTab';

type TabId = 'personal' | 'api' | 'preferences' | 'models' | 'mcp' | 'toolbelt' | 'updates' | 'sdk-demo' | 'servers' | 'startup';

interface SettingsProps {
  alphaFeaturesEnabled: boolean;
  setAlphaFeaturesEnabled: (enabled: boolean) => void;
}

const Settings = ({ alphaFeaturesEnabled, setAlphaFeaturesEnabled }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('api');
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    name: '',
    email: '',
    avatar_url: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme_preference: 'system',
    startup_settings: {
      autoStart: false,
      startMinimized: false,
      startFullscreen: false,
      checkForUpdates: true,
      restoreLastSession: true
    }
  });

  const [apiConfig, setApiConfig] = useState<APIConfig>({
    ollama_base_url: '',
    comfyui_base_url: '',
    openai_api_key: '',
    openai_base_url: '',
    api_type: 'ollama'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  const { setTheme } = useTheme();
  const { providers, addProvider, updateProvider, deleteProvider, setPrimaryProvider, loading: providersLoading } = useProviders();
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const savedPersonalInfo = await db.getPersonalInfo();
      const savedApiConfig = await db.getAPIConfig();

      if (savedPersonalInfo) {
        // Ensure startup_settings exists with default values
        const updatedPersonalInfo = {
          ...savedPersonalInfo,
          startup_settings: {
            ...savedPersonalInfo.startup_settings,
            autoStart: savedPersonalInfo.startup_settings?.autoStart ?? false,
            startMinimized: savedPersonalInfo.startup_settings?.startMinimized ?? false,
            startFullscreen: savedPersonalInfo.startup_settings?.startFullscreen ?? false,
            checkForUpdates: savedPersonalInfo.startup_settings?.checkForUpdates ?? true,
            restoreLastSession: savedPersonalInfo.startup_settings?.restoreLastSession ?? true
          }
        };
        setPersonalInfo(updatedPersonalInfo);
        setTheme(updatedPersonalInfo.theme_preference as ThemeMode);
      }

      if (savedApiConfig) {
        setApiConfig({
          ...savedApiConfig,
          openai_base_url: savedApiConfig.openai_base_url || 'https://api.openai.com/v1',
        });
      }
    };

    loadSettings();
  }, [setTheme]);

  // Load wallpaper from IndexedDB on mount
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Check URL parameters on mount to set initial tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['personal', 'api', 'preferences', 'models', 'mcp', 'toolbelt', 'updates', 'sdk-demo', 'servers', 'startup'].includes(tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, []);

  // Auto-save effect for personalInfo and apiConfig
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setIsSaving(true);
    setSaveStatus('idle');
    saveTimeout.current = setTimeout(async () => {
      try {
        await db.updatePersonalInfo(personalInfo);
        await db.updateAPIConfig(apiConfig);
        setSaveStatus('success');
        // Hide success message after 2 seconds
        setTimeout(() => {
          setSaveStatus('idle');
          setIsSaving(false);
        }, 2000);
      } catch {
        setSaveStatus('error');
        // Hide error message after 3 seconds
        setTimeout(() => {
          setSaveStatus('idle');
          setIsSaving(false);
        }, 3000);
      }
    }, 600); // debounce 600ms
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [personalInfo, apiConfig]);

  // When theme_preference changes, update the theme immediately
  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as ThemeMode;
    setPersonalInfo(prev => ({ ...prev, theme_preference: value }));
    setTheme(value);
  };

  // Handle setting wallpaper
  const handleSetWallpaper = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          // Convert file to base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64String = e.target?.result as string;
            // Store in IndexedDB
            await db.setWallpaper(base64String);
            // Update state
            setWallpaperUrl(base64String);
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Error setting wallpaper:', error);
        }
      }
    };
    input.click();
  };

  // Handle clearing wallpaper
  const handleClearWallpaper = async () => {
    try {
      await db.setWallpaper('');
      setWallpaperUrl(null);
    } catch (error) {
      console.error('Error clearing wallpaper:', error);
    }
  };

  // Helper function to get timezone display name with UTC offset
  const getTimezoneDisplay = (timezone: string) => {
    try {
      const now = new Date();
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const offset = Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60));
      const offsetString = offset >= 0 ? `+${offset}` : `${offset}`;
      return `${timezone} (UTC${offsetString})`;
    } catch {
      return timezone;
    }
  };

  // Timezone options helper
  let timezoneOptions: string[] = [];
  try {
    // @ts-expect-error - Intl.supportedValuesOf may not be available in all environments
    timezoneOptions = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    timezoneOptions = [];
  }
  if (!timezoneOptions.length) {
    timezoneOptions = [
      'UTC', 'GMT',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo',
      'America/Argentina/Buenos_Aires', 'America/Lima', 'America/Bogota',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 
      'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna',
      'Europe/Prague', 'Europe/Warsaw', 'Europe/Stockholm', 'Europe/Helsinki',
      'Europe/Moscow', 'Europe/Istanbul', 'Europe/Athens', 'Europe/Zurich',
      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Hong_Kong',
      'Asia/Singapore', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila',
      'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tehran',
      'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo',
      'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane',
      'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart',
      'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu', 'Pacific/Tahiti',
      'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
      'Africa/Casablanca', 'Africa/Tunis', 'Africa/Algiers'
    ];
  }

  // Create timezone options with display names
  const timezoneOptionsWithDisplay = timezoneOptions.map(tz => ({
    value: tz,
    display: getTimezoneDisplay(tz)
  }));

  // Tab component
  const TabItem = ({ id, label, icon, isActive }: { id: TabId, label: string, icon: React.ReactNode, isActive: boolean }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${isActive
          ? 'bg-sakura-500 text-white'
          : 'text-gray-700 dark:text-gray-200 hover:bg-sakura-100 dark:hover:bg-gray-800'
        }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  const handlePersonalInfoChange = (info: Partial<PersonalInfo>) => {
    setPersonalInfo(prev => ({ ...prev, ...info }));
  };

  return (
    <>
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      <div className="flex max-w-7xl mx-auto gap-6 relative z-10 h-[calc(100vh-3rem)]">
        {/* Sidebar with tabs */}
        <div className="w-64 shrink-0">
          <div className="glassmorphic rounded-xl p-4 space-y-2 sticky top-4">
            <h2 className="flex items-center gap-2 px-4 py-3 text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 mb-2">
              <SettingsIcon className="w-5 h-5 text-sakura-500" />
              Settings
            </h2>

            <TabItem
              id="api"
              label="AI Services"
              icon={<Bot className="w-5 h-5" />}
              isActive={activeTab === 'api'}
            />

            <TabItem
              id="models"
              label="Local Models"
              icon={<Brain className="w-5 h-5" />}
              isActive={activeTab === 'models'}
            />

            <TabItem
              id="mcp"
              label="Extensions"
              icon={<Puzzle className="w-5 h-5" />}
              isActive={activeTab === 'mcp'}
            />

            <TabItem
              id="toolbelt"
              label="Tools"
              icon={<Hammer className="w-5 h-5" />}
              isActive={activeTab === 'toolbelt'}
            />

            <TabItem
              id="servers"
              label="Services"
              icon={<Server className="w-5 h-5" />}
              isActive={activeTab === 'servers'}
            />

            <TabItem
              id="preferences"
              label="General"
              icon={<SettingsIcon className="w-5 h-5" />}
              isActive={activeTab === 'preferences'}
            />

            <TabItem
              id="personal"
              label="Profile"
              icon={<User className="w-5 h-5" />}
              isActive={activeTab === 'personal'}
            />

            <TabItem
              id="updates"
              label="Updates"
              icon={<RefreshCw className="w-5 h-5" />}
              isActive={activeTab === 'updates'}
            />

            <TabItem
              id="startup"
              label="Startup"
              icon={<Power className="w-5 h-5" />}
              isActive={activeTab === 'startup'}
            />

            {/* Save Status - Only visible when saving/saved/error */}
            {(isSaving || saveStatus !== 'idle') && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white transition-colors w-full ${saveStatus === 'success'
                    ? 'bg-green-500'
                    : saveStatus === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                  }`}>
                  <Save className="w-4 h-4" />
                  {saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error!' : 'Saving...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className={`flex-1 space-y-6 py-2 pb-6 overflow-y-auto overflow-x-hidden ${activeTab === 'models' ? '' : 'max-w-4xl'
          }`}>
          {/* Profile Tab */}
          {activeTab === 'personal' && (
            <ProfileTab
              personalInfo={personalInfo}
              setPersonalInfo={setPersonalInfo}
              wallpaperUrl={wallpaperUrl}
              handleSetWallpaper={handleSetWallpaper}
              handleClearWallpaper={handleClearWallpaper}
            />
          )}

          {/* AI Services Tab */}
          {activeTab === 'api' && (
            <AIServicesTab
              apiConfig={apiConfig}
              setApiConfig={setApiConfig}
              providers={providers}
              providersLoading={providersLoading}
              addProvider={addProvider}
              updateProvider={updateProvider}
              deleteProvider={deleteProvider}
              setPrimaryProvider={setPrimaryProvider}
            />
          )}

          {/* General Preferences Tab */}
          {activeTab === 'preferences' && (
            <PreferencesTab
              personalInfo={personalInfo}
              handleThemeChange={handleThemeChange}
              setPersonalInfo={setPersonalInfo}
              timezoneOptions={timezoneOptionsWithDisplay}
            />
          )}

          {/* Local Models Tab */}
          {activeTab === 'models' && (
            <LocalModelsTab />
          )}

          {/* Extensions Tab */}
          {activeTab === 'mcp' && (
            <MCPSettings />
          )}

          {/* Tools Tab */}
          {activeTab === 'toolbelt' && (
            <ToolBelt />
          )}

          {/* Services Tab */}
          {activeTab === 'servers' && (
            <ServicesTab />
          )}

          {/* SDK Code Export Demo Tab */}
          {activeTab === 'sdk-demo' && (
            <ExportCodeTab />
          )}

          {/* Updates Tab */}
          {activeTab === 'updates' && (
            <UpdatesTab
              alphaFeaturesEnabled={alphaFeaturesEnabled}
              setAlphaFeaturesEnabled={setAlphaFeaturesEnabled}
            />
          )}

          {/* Startup Tab */}
          {activeTab === 'startup' && (
            <StartupTab />
          )}
        </div>
      </div>
    </>
  );
};

export default Settings;