import React, { useState, useRef, useEffect } from 'react';
import { User, Settings } from 'lucide-react';

interface UserProfileButtonProps {
  userName?: string;
  avatarUrl?: string;
  onPageChange: (page: string) => void;
}

const UserProfileButton: React.FC<UserProfileButtonProps> = ({
  userName,
  avatarUrl,
  onPageChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sakura-50 dark:hover:bg-sakura-100/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-sakura-100 dark:bg-sakura-100/10 flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User avatar"
              className="w-full h-full object-cover"
              onError={(e) => {
                // If image fails to load, show fallback icon
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : (
            <User className="w-5 h-5 text-sakura-500" />
          )}
          {avatarUrl && (
            <User className="w-5 h-5 text-sakura-500 hidden" />
          )}
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {userName || 'Profile'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-[9998]">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="font-medium text-gray-800 dark:text-gray-200">{userName}</div>
          </div>
          <button
            onClick={() => {
              onPageChange('settings');
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-sakura-50 dark:hover:bg-sakura-100/5"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileButton; 