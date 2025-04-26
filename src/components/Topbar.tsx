import React from 'react';
import { Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import UserProfileButton from './common/UserProfileButton';

interface TopbarProps {
  userName?: string;
  onPageChange?: (page: string) => void;
}

const Topbar = ({ userName, onPageChange }: TopbarProps) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="glassmorphic z-[1] h-16 px-6 flex items-center justify-between">
      <div className="flex-1">
        {/* Search input removed */}
      </div>
      
      <div className="flex items-center gap-4">
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

export default Topbar;