import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, RefreshCw, Settings, XCircle } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'failed' | 'unknown';
  lastCheck: string | null;
  failureCount: number;
  isRetrying: boolean;
}

interface WatchdogConfig {
  checkInterval: number;
  retryAttempts: number;
  retryDelay: number;
  notificationTimeout: number;
  maxNotificationAttempts: number;
}

interface WatchdogStatusProps {
  className?: string;
}

const WatchdogStatus: React.FC<WatchdogStatusProps> = ({ className = '' }) => {
  const [services, setServices] = useState<Record<string, ServiceStatus>>({});
  const [overallHealth, setOverallHealth] = useState<'healthy' | 'degraded' | 'critical'>('unknown' as any);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<WatchdogConfig>({
    checkInterval: 30000,
    retryAttempts: 3,
    retryDelay: 10000,
    notificationTimeout: 5000,
    maxNotificationAttempts: 3,
  });

  // Fetch services status
  const fetchStatus = async () => {
    try {
      const result = await window.electronAPI.invoke('watchdog-get-services-status');
      if (result.success) {
        setServices(result.services);
      }

      const healthResult = await window.electronAPI.invoke('watchdog-get-overall-health');
      if (healthResult.success) {
        setOverallHealth(healthResult.health);
      }
    } catch (error) {
      console.error('Error fetching watchdog status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Perform manual health check
  const performManualCheck = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.invoke('watchdog-perform-manual-health-check');
      if (result.success) {
        setServices(result.services);
      }
    } catch (error) {
      console.error('Error performing manual health check:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update watchdog configuration
  const updateConfig = async (newConfig: Partial<WatchdogConfig>) => {
    try {
      const result = await window.electronAPI.invoke('watchdog-update-config', newConfig);
      if (result.success) {
        setConfig(prev => ({ ...prev, ...newConfig }));
      }
    } catch (error) {
      console.error('Error updating watchdog config:', error);
    }
  };

  // Reset failure counts
  const resetFailureCounts = async () => {
    try {
      await window.electronAPI.invoke('watchdog-reset-failure-counts');
      fetchStatus(); // Refresh status
    } catch (error) {
      console.error('Error resetting failure counts:', error);
    }
  };

  // Listen for watchdog events
  useEffect(() => {
    const handleServiceRestored = (event: any, data: any) => {
      console.log('Service restored:', data);
      fetchStatus(); // Refresh status when service is restored
    };

    const handleServiceFailed = (event: any, data: any) => {
      console.log('Service failed:', data);
      fetchStatus(); // Refresh status when service fails
    };

    const handleServiceRestarted = (event: any, data: any) => {
      console.log('Service restarted:', data);
      fetchStatus(); // Refresh status when service is restarted
    };

    // Listen for watchdog events
    window.electronAPI.on('watchdog-service-restored', handleServiceRestored);
    window.electronAPI.on('watchdog-service-failed', handleServiceFailed);
    window.electronAPI.on('watchdog-service-restarted', handleServiceRestarted);

    // Initial fetch
    fetchStatus();

    // Set up periodic refresh
    const interval = setInterval(fetchStatus, 60000); // Refresh every 60 seconds (reduced from 30s)

    return () => {
      clearInterval(interval);
      window.electronAPI.removeAllListeners('watchdog-service-restored');
      window.electronAPI.removeAllListeners('watchdog-service-failed');
      window.electronAPI.removeAllListeners('watchdog-service-restarted');
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'unhealthy':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatLastCheck = (lastCheck: string | null) => {
    if (!lastCheck) return 'Never';
    return new Date(lastCheck).toLocaleTimeString();
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            System Watchdog
          </h3>
          <span className={`text-sm font-medium ${getHealthColor(overallHealth)}`}>
            ({overallHealth})
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={performManualCheck}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
            title="Perform manual health check"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            title="Configure watchdog settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Services Status */}
      <div className="space-y-3">
        {Object.entries(services).map(([key, service]) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              {getStatusIcon(service.status)}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {service.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Last check: {formatLastCheck(service.lastCheck)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2">
                {service.isRetrying && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    Retrying...
                  </span>
                )}
                {service.failureCount > 0 && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {service.failureCount} failures
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {service.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {Object.keys(services).length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No services being monitored
        </div>
      )}

      {/* Configuration Panel */}
      {showConfig && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            Watchdog Configuration
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Check Interval (seconds)
              </label>
              <input
                type="number"
                value={config.checkInterval / 1000}
                onChange={(e) => updateConfig({ checkInterval: parseInt(e.target.value) * 1000 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                min="10"
                max="300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Retry Attempts
              </label>
              <input
                type="number"
                value={config.retryAttempts}
                onChange={(e) => updateConfig({ retryAttempts: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                min="1"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Retry Delay (seconds)
              </label>
              <input
                type="number"
                value={config.retryDelay / 1000}
                onChange={(e) => updateConfig({ retryDelay: parseInt(e.target.value) * 1000 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                min="5"
                max="60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Notification Attempts
              </label>
              <input
                type="number"
                value={config.maxNotificationAttempts}
                onChange={(e) => updateConfig({ maxNotificationAttempts: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                min="1"
                max="10"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Stop showing notifications after this many failed attempts (service continues working silently)
              </p>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={resetFailureCounts}
                className="px-3 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Reset Failure Counts
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
            Checking services...
          </span>
        </div>
      )}
    </div>
  );
};

export default WatchdogStatus; 
