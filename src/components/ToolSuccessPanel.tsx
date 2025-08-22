import React, { useState, useEffect } from 'react';
import { ToolSuccessRegistry, ToolSuccessRecord, ToolBlacklistAttempt } from '../services/toolSuccessRegistry';

interface ToolSuccessPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ToolSuccessPanel: React.FC<ToolSuccessPanelProps> = ({ isOpen, onClose }) => {
  const [statistics, setStatistics] = useState<ReturnType<typeof ToolSuccessRegistry.getStatistics> | null>(null);
  const [successRecords, setSuccessRecords] = useState<ToolSuccessRecord[]>([]);
  const [blacklistAttempts, setBlacklistAttempts] = useState<ToolBlacklistAttempt[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  const refreshData = () => {
    const stats = ToolSuccessRegistry.getStatistics();
    setStatistics(stats);
    
    const attempts = ToolSuccessRegistry.getBlacklistAttempts();
    setBlacklistAttempts(attempts);
    
    // Get all success records
    const allRecords: ToolSuccessRecord[] = [];
    if (stats) {
      Object.keys(stats.providerBreakdown).forEach(providerId => {
        const providerRecords = ToolSuccessRegistry.getSuccessfulToolsForProvider(providerId);
        allRecords.push(...providerRecords);
      });
    }
    setSuccessRecords(allRecords);
  };

  const filteredRecords = selectedProvider === 'all' 
    ? successRecords 
    : successRecords.filter(record => record.providerId === selectedProvider);

  const filteredAttempts = selectedProvider === 'all' 
    ? blacklistAttempts 
    : blacklistAttempts.filter(attempt => attempt.providerId === selectedProvider);

  const clearAllRecords = () => {
    if (confirm('Are you sure you want to clear all tool success records? This cannot be undone.')) {
      ToolSuccessRegistry.clearAllSuccessRecords();
      refreshData();
    }
  };

  const clearProviderRecords = (providerId: string) => {
    if (confirm(`Are you sure you want to clear success records for ${providerId}? This cannot be undone.`)) {
      ToolSuccessRegistry.clearSuccessRegistryForProvider(providerId);
      refreshData();
    }
  };

  const clearMCPBlacklists = () => {
    if (confirm('Are you sure you want to clear all blacklisted MCP tools? This will restore core MCP functionality.')) {
      ToolSuccessRegistry.clearMCPToolBlacklists();
      // Also import and use APIClient to clear from API client level
      import('../utils/APIClient').then(({ APIClient }) => {
        APIClient.clearMCPToolBlacklists();
      });
      refreshData();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            🛡️ Tool Success Protection Panel
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-4rem)]">
          {/* Statistics Overview */}
          {statistics && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Protected Tools</h3>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {statistics.totalSuccessfulTools}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 dark:text-green-100">Total Successes</h3>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {statistics.totalSuccesses}
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Blacklist Attempts</h3>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {statistics.totalBlacklistAttempts}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-red-900 dark:text-red-100">Blocked Attempts</h3>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {statistics.blockedBlacklistAttempts}
                </p>
              </div>
            </div>
          )}

          {/* Provider Filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filter by Provider:
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Providers</option>
              {statistics && Object.keys(statistics.providerBreakdown).map(providerId => (
                <option key={providerId} value={providerId}>
                  {providerId} ({statistics.providerBreakdown[providerId]} tools)
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              🔄 Refresh Data
            </button>
            <button
              onClick={clearMCPBlacklists}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              🛡️ Restore MCP Tools
            </button>
            <button
              onClick={clearAllRecords}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              🗑️ Clear All Records
            </button>
            {selectedProvider !== 'all' && (
              <button
                onClick={() => clearProviderRecords(selectedProvider)}
                className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
              >
                🗑️ Clear {selectedProvider} Records
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="mb-4">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setSelectedProvider('all')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    selectedProvider === 'all'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Protected Tools ({filteredRecords.length})
                </button>
                <button
                  onClick={() => setSelectedProvider('attempts')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    selectedProvider === 'attempts'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Blacklist Attempts ({filteredAttempts.length})
                </button>
              </nav>
            </div>
          </div>

          {/* Content */}
          {selectedProvider !== 'attempts' ? (
            /* Protected Tools List */
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Protected Tools
              </h3>
              {filteredRecords.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No protected tools found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredRecords.map((record, index) => (
                    <div key={index} className="border dark:border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {record.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {record.description}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>Provider: {record.providerId}</span>
                            <span>Successes: {record.successCount}</span>
                            <span>First Success: {new Date(record.firstSuccessTimestamp).toLocaleString()}</span>
                            <span>Last Success: {new Date(record.lastSuccessTimestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="ml-4 flex items-center">
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-full text-xs">
                            🛡️ Protected
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Blacklist Attempts List */
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Blacklist Attempts
              </h3>
              {filteredAttempts.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No blacklist attempts found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredAttempts.map((attempt, index) => (
                    <div key={index} className="border dark:border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {attempt.toolName}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {attempt.reason}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>Provider: {attempt.providerId}</span>
                            <span>Time: {new Date(attempt.timestamp).toLocaleString()}</span>
                            {attempt.successHistory && (
                              <span>
                                Protected by: {attempt.successHistory.successCount} previous successes
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex items-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            attempt.blocked
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                              : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                          }`}>
                            {attempt.blocked ? '🛡️ Blocked' : '❌ Allowed'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 
