import { useState, useEffect } from 'react';
import { db } from '../db';

export function useDatabase() {
  const [stats, setStats] = useState({
    tokensUsed: '0',
    totalStorage: '0 B',
    messageCount: '0',
    averageResponseTime: '0s',
    storageType: 'Loading...',
    // Add percentage changes
    tokensChange: '0%',
    storageChange: '0%',
    messageChange: '0%'
  });

  const [recentActivities, setRecentActivities] = useState<Array<{
    title: string;
    desc: string;
    size: string;
    time: string;
  }>>([]);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const updateStats = async () => {
      setIsLoading(true);
      try {
        const tokensUsed = await db.getTokensUsed();
        const totalStorage = await db.getTotalStorage();
        const messageCount = await db.getMessageCount();
        const averageResponseTime = await db.getAverageResponseTime();

        // Get the percentage changes
        const tokensChange = await db.getDailyUsageChange('tokens');
        const storageChange = await db.getDailyUsageChange('storage');
        const messageChange = await db.getDailyUsageChange('messages');

        // Detect storage type
        const storageType = 'indexedDB' in window && window.indexedDB !== null ? 
          (localStorage.getItem('angela_db_migrated') === 'true' ? 'IndexedDB' : 'LocalStorage') : 
          'LocalStorage';

        // Convert nanoseconds to seconds
        const avgResponseInSeconds = averageResponseTime / 1_000_000_000;

        setStats({
          tokensUsed: formatNumber(tokensUsed),
          totalStorage: formatBytes(totalStorage),
          messageCount: formatNumber(messageCount),
          averageResponseTime: `${avgResponseInSeconds.toFixed(2)}s`,
          storageType,
          tokensChange: `${tokensChange.percentage > 0 ? '+' : ''}${tokensChange.percentage}%`,
          storageChange: `${storageChange.percentage > 0 ? '+' : ''}${storageChange.percentage}%`,
          messageChange: `${messageChange.percentage > 0 ? '+' : ''}${messageChange.percentage}%`
        });

        const recentItems = await db.getRecentStorageItems();
        setRecentActivities(
          recentItems.map(activity => ({
            title: activity.title,
            desc: activity.description,
            size: formatBytes(activity.size),
            time: new Date(activity.timestamp).toLocaleString()
          }))
        );
      } catch (error) {
        console.error("Error updating database stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    updateStats();
    // Update stats every 30 seconds
    const interval = setInterval(updateStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  return {
    stats,
    recentActivities,
    isLoading
  };
}
