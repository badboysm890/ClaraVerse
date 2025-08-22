import React from 'react';
import { User, Image } from 'lucide-react';
import { PersonalInfo } from '../../db';

interface ProfileTabProps {
  personalInfo: PersonalInfo;
  setPersonalInfo: React.Dispatch<React.SetStateAction<PersonalInfo>>;
  wallpaperUrl: string | null;
  handleSetWallpaper: () => void;
  handleClearWallpaper: () => void;
}

const ProfileTab: React.FC<ProfileTabProps> = ({
  personalInfo,
  setPersonalInfo,
  wallpaperUrl,
  handleSetWallpaper,
  handleClearWallpaper
}) => {
  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <User className="w-6 h-6 text-sakura-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Profile
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name
          </label>
          <input
            type="text"
            value={personalInfo.name}
            onChange={(e) => setPersonalInfo(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={personalInfo.email}
            onChange={(e) => setPersonalInfo(prev => ({ ...prev, email: e.target.value }))}
            className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
            placeholder="your.email@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Avatar URL
          </label>
          <input
            type="url"
            value={personalInfo.avatar_url}
            onChange={(e) => setPersonalInfo(prev => ({ ...prev, avatar_url: e.target.value }))}
            className="w-full px-4 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
            placeholder="https://example.com/avatar.jpg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Wallpaper
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSetWallpaper}
              className="px-4 py-2 bg-sakura-500 text-white rounded-lg flex items-center gap-2"
            >
              <Image className="w-4 h-4" />
              {wallpaperUrl ? 'Change Wallpaper' : 'Set Wallpaper'}
            </button>
            {wallpaperUrl && (
              <button
                onClick={handleClearWallpaper}
                className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-lg"
              >
                Clear Wallpaper
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileTab; 
