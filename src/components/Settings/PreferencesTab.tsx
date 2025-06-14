import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { PersonalInfo } from '../../db';

interface PreferencesTabProps {
  personalInfo: PersonalInfo;
  handleThemeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  setPersonalInfo: React.Dispatch<React.SetStateAction<PersonalInfo>>;
  timezoneOptions: { value: string; display: string; }[];
}

const PreferencesTab: React.FC<PreferencesTabProps> = ({
  personalInfo,
  handleThemeChange,
  setPersonalInfo,
  timezoneOptions
}) => {
  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-6 h-6 text-sakura-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          General Settings
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Theme
          </label>
          <select
            value={personalInfo.theme_preference}
            onChange={handleThemeChange}
            className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Timezone
          </label>
          <select
            value={personalInfo.timezone}
            onChange={(e) => setPersonalInfo(prev => ({ ...prev, timezone: e.target.value }))}
            className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
          >
            {timezoneOptions.map((tz: { value: string; display: string; }) => (
              <option key={tz.value} value={tz.value}>{tz.display}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default PreferencesTab; 