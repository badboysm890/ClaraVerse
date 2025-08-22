import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Volume2, VolumeX, Trash2, CheckCheck, TestTube, Activity, AlertCircle, Info, CheckCircle, Speaker } from 'lucide-react';
import { notificationService, angelaNotification } from '../../services/notificationService';

interface NotificationPanelProps {
  className?: string;
  onNavigateToangela?: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ className = '', onNavigateToangela }) => {
  const [notifications, setNotifications] = useState<angelaNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = notificationService.subscribe((newNotifications) => {
      setNotifications(newNotifications);
      setUnreadCount(notificationService.getUnreadCount());
    });

    // Load initial state
    setNotifications(notificationService.getNotifications());
    setUnreadCount(notificationService.getUnreadCount());
    setSoundEnabled(notificationService.isSoundEnabled());

    return unsubscribe;
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTogglePanel = () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      // Mark all as read when opening panel
      setTimeout(() => {
        notificationService.markAllAsRead();
      }, 1000);
    }
  };

  const handleToggleSound = () => {
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);
    notificationService.setSoundEnabled(newSoundEnabled);
  };

  const handleTestSound = () => {
    notificationService.testCompletionChime();
  };

  const handleMarkAsRead = (id: string) => {
    notificationService.markAsRead(id);
  };

  const handleRemoveNotification = (id: string) => {
    notificationService.removeNotification(id);
  };

  const handleClearAll = () => {
    notificationService.clearAll();
  };

  const handleMarkAllAsRead = () => {
    notificationService.markAllAsRead();
  };

  const handleBackgroundNotificationClick = (notification: angelaNotification) => {
    // If it's a background angela notification, navigate to angela and mark as read
    if (notification.title.includes('angela Response Ready') && onNavigateToangela) {
      onNavigateToangela();
      handleMarkAsRead(notification.id);
      setIsOpen(false);
    }
    // If it's the background service notification, navigate to angela but don't mark as read
    else if (notification.title.includes('angela Assistant Active') && onNavigateToangela) {
      onNavigateToangela();
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: angelaNotification['type']) => {
    switch (type) {
      case 'completion':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4" />;
      case 'info':
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: angelaNotification['type']) => {
    switch (type) {
      case 'completion':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'info':
      default:
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  const isBackgroundServiceNotification = (notification: angelaNotification) => {
    return notification.title.includes('angela Assistant Active');
  };

  const isangelaResponseNotification = (notification: angelaNotification) => {
    return notification.title.includes('angela Response Ready');
  };

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleTogglePanel}
        className={`relative p-2 rounded-lg transition-all duration-200 ${
          unreadCount > 0 
            ? 'bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 border border-blue-200/30 dark:border-blue-700/30' 
            : 'hover:bg-sakura-50 dark:hover:bg-sakura-100/10'
        }`}
        aria-label="Notifications"
      >
        <Bell className={`w-5 h-5 transition-colors ${
          unreadCount > 0 
            ? 'text-blue-600 dark:text-blue-400' 
            : 'text-gray-600 dark:text-gray-300'
        }`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-medium shadow-lg animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50 z-[9999] overflow-hidden backdrop-blur-xl animate-fadeIn">
          {/* Header */}
          <div className="p-4 border-b border-gray-200/30 dark:border-gray-700/30 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  ({unreadCount} unread)
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSound}
                className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                title={soundEnabled ? 'Disable sound' : 'Enable sound'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                )}
              </button>
              {soundEnabled && (
                // add a tooltip to the button that says "Test completion sound"
                <button
                  onClick={handleTestSound}
                  className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                  title="Test completion sound"
                  data-tooltip-id="test-sound-tooltip"
                  data-tooltip-content="Test completion sound"
                  data-tooltip-place="top"
                >
                  <Speaker className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              )}
              <button
                onClick={() => {
                  // Demo different notification types
                  notificationService.addCompletionNotification(
                    'Demo Completion', 
                    'This is a demo completion notification with chime!',
                    3000
                  );
                  setTimeout(() => {
                    notificationService.addInfoNotification(
                      'Demo Info', 
                      'This is a demo info notification.',
                      3000
                    );
                  }, 1000);
                  setTimeout(() => {
                    notificationService.addErrorNotification(
                      'Demo Error', 
                      'This is a demo error notification.',
                      3000
                    );
                  }, 2000);
                }}
                className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                title="Demo notifications"
              >
                <TestTube className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={handleMarkAllAsRead}
                    className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const isBackgroundService = isBackgroundServiceNotification(notification);
                const isangelaResponse = isangelaResponseNotification(notification);
                
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleBackgroundNotificationClick(notification)}
                    title={
                      isangelaResponse 
                        ? 'Click to go to angela chat' 
                        : isBackgroundService 
                        ? 'angela is running in background - click to go to angela'
                        : undefined
                    }
                    className={`p-4 border-b border-gray-200/30 dark:border-gray-700/30 last:border-b-0 hover:bg-gray-100/50 dark:hover:bg-gray-700/20 transition-colors ${
                      !notification.isRead ? 'bg-blue-50/20 dark:bg-blue-900/10 border-l-2 border-l-blue-400/50' : ''
                    } ${
                      !notification.duration ? 'border-r-2 border-r-orange-400/50 bg-orange-50/10 dark:bg-orange-900/10' : ''
                    } ${
                      isBackgroundService 
                        ? 'cursor-pointer hover:bg-green-50/20 dark:hover:bg-green-900/20 border-l-2 border-l-green-400/50 bg-green-50/10 dark:bg-green-900/10' 
                        : isangelaResponse 
                        ? 'cursor-pointer hover:bg-sakura-50/20 dark:hover:bg-sakura-900/20' 
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5 text-gray-600 dark:text-gray-400">
                        {isBackgroundService ? <Activity className="w-4 h-4" /> : getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`font-medium text-sm ${
                            isBackgroundService 
                              ? 'text-green-600 dark:text-green-400' 
                              : getNotificationColor(notification.type)
                          }`}>
                            {notification.title}
                            {/* Persistent notification indicator */}
                            {!notification.duration && (
                              <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">•</span>
                            )}
                            {/* Background service indicator */}
                            {isBackgroundService && (
                              <span className="ml-2 text-xs text-green-600 dark:text-green-400 animate-pulse">●</span>
                            )}
                          </h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!notification.isRead && !isBackgroundService && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsRead(notification.id);
                                }}
                                className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-600/50 transition-colors"
                                title="Mark as read"
                              >
                                <Check className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                              </button>
                            )}
                            {!isBackgroundService && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveNotification(notification.id);
                                }}
                                className="p-1 rounded hover:bg-gray-100/50 dark:hover:bg-gray-600/50 transition-colors"
                                title="Remove"
                              >
                                <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(notification.timestamp)}
                          </p>
                          {!notification.duration && (
                            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium" title="This notification requires manual dismissal">
                              Persistent
                            </span>
                          )}
                          {isBackgroundService && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium" title="Click to go to angela">
                              Background Service
                            </span>
                          )}
                          {isangelaResponse && (
                            <span className="text-xs text-sakura-600 dark:text-sakura-400 font-medium" title="Click to go to angela">
                              → angela
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel; 
