import React, { useEffect, useState } from 'react';
import { Download, RotateCcw, AlertCircle, ExternalLink, HardDrive, Check } from 'lucide-react';

// Type for update info
interface UpdateInfo {
  hasUpdate: boolean;
  error?: string;
  currentVersion: string;
  latestVersion?: string;
  platform: string;
  isOTASupported: boolean;
  releaseUrl?: string;
  downloadUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
}

// Type for llama.cpp update info
interface LlamacppUpdateInfo {
  hasUpdate: boolean;
  error?: string;
  currentVersion: string;
  latestVersion?: string;
  platform: string;
  downloadSize?: string;
  releaseUrl?: string;
  publishedAt?: string;
}

interface UpdatesTabProps {
  alphaFeaturesEnabled: boolean;
  setAlphaFeaturesEnabled: (enabled: boolean) => void;
}

const UpdatesTab: React.FC<UpdatesTabProps> = ({ alphaFeaturesEnabled, setAlphaFeaturesEnabled }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<Date | null>(null);

  const [llamacppUpdateInfo, setLlamacppUpdateInfo] = useState<LlamacppUpdateInfo | null>(null);
  const [checkingLlamacppUpdates, setCheckingLlamacppUpdates] = useState(false);
  const [updatingLlamacppBinaries, setUpdatingLlamacppBinaries] = useState(false);
  const [lastLlamacppUpdateCheck, setLastLlamacppUpdateCheck] = useState<Date | null>(null);

  // Check for updates when component mounts
  useEffect(() => {
    if (!updateInfo && !checkingUpdates) {
      checkForUpdates();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-check for llama.cpp updates when component mounts
  useEffect(() => {
    if (!llamacppUpdateInfo && !checkingLlamacppUpdates) {
      setTimeout(() => {
        checkForLlamacppUpdates();
      }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update checking functionality
  const checkForUpdates = async () => {
    const electron = window.electron;

    if (!electron?.getUpdateInfo) {
      console.error('Update functionality not available');
      setUpdateInfo({
        error: 'Update functionality is not available in this version.',
        hasUpdate: false,
        currentVersion: '1.0.0',
        platform: 'unknown',
        isOTASupported: false
      });
      setCheckingUpdates(false);
      return;
    }

    if (checkingUpdates) {
      console.warn('Update check already in progress');
      return;
    }

    setCheckingUpdates(true);
    setUpdateInfo(null);

    try {
      console.log('Starting update check...');
      const info = await electron.getUpdateInfo();

      const safeInfo = {
        hasUpdate: Boolean(info.hasUpdate),
        currentVersion: info.currentVersion || '1.0.0',
        latestVersion: info.latestVersion || info.currentVersion || '1.0.0',
        platform: info.platform || 'unknown',
        isOTASupported: Boolean(info.isOTASupported),
        releaseUrl: info.releaseUrl || '',
        downloadUrl: info.downloadUrl || '',
        releaseNotes: info.releaseNotes || 'No release notes available.',
        publishedAt: info.publishedAt || null,
        error: info.error || null
      };

      setUpdateInfo(safeInfo);
      setLastUpdateCheck(new Date());

      console.log('Update check completed successfully:', {
        hasUpdate: safeInfo.hasUpdate,
        currentVersion: safeInfo.currentVersion,
        latestVersion: safeInfo.latestVersion,
        error: safeInfo.error
      });

    } catch (error) {
      console.error('Error checking for updates:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred while checking for updates';

      const errorInfo: UpdateInfo = {
        hasUpdate: false,
        error: errorMessage,
        currentVersion: '1.0.0',
        platform: 'unknown',
        isOTASupported: false
      };

      setUpdateInfo(errorInfo);
      setLastUpdateCheck(new Date());
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleManualUpdateCheck = async () => {
    const electron = window.electron;

    if (!electron?.checkForUpdates) {
      console.error('Manual update check not available');
      return;
    }

    if (checkingUpdates) {
      console.warn('Update check already in progress');
      return;
    }

    try {
      console.log('Starting manual update check...');
      await electron.checkForUpdates();
      console.log('Manual update check initiated successfully');

      setTimeout(() => {
        if (!checkingUpdates) {
          checkForUpdates();
        }
      }, 1500);

    } catch (error) {
      console.error('Error during manual update check:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to check for updates manually';

      setUpdateInfo((prev: UpdateInfo | null) => ({
        hasUpdate: false,
        error: errorMessage,
        currentVersion: prev?.currentVersion || '1.0.0',
        platform: prev?.platform || 'unknown',
        isOTASupported: prev?.isOTASupported || false
      }));
    }
  };

  const downloadUpdate = () => {
    try {
      if (!updateInfo?.downloadUrl) {
        console.warn('No download URL available');
        return;
      }

      try {
        new URL(updateInfo.downloadUrl);
      } catch {
        console.error('Invalid download URL:', updateInfo.downloadUrl);
        return;
      }

      console.log('Opening download URL:', updateInfo.downloadUrl);
      window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');

    } catch (error) {
      console.error('Error opening download URL:', error);
    }
  };

  const getPlatformName = (platform: string) => {
    if (!platform || typeof platform !== 'string') {
      return 'Unknown Platform';
    }

    switch (platform.toLowerCase()) {
      case 'darwin': return 'macOS';
      case 'win32': return 'Windows';
      case 'linux': return 'Linux';
      default: return platform.charAt(0).toUpperCase() + platform.slice(1);
    }
  };

  // Llama.cpp binary update functions
  const checkForLlamacppUpdates = async () => {
    const electron = window.electron;

    if (!electron?.checkLlamacppUpdates) {
      console.error('Llama.cpp update functionality not available');
      setLlamacppUpdateInfo({
        error: 'Llama.cpp update functionality is not available in this version.',
        hasUpdate: false,
        currentVersion: 'Unknown',
        platform: 'unknown'
      });
      setCheckingLlamacppUpdates(false);
      return;
    }

    if (checkingLlamacppUpdates) {
      console.warn('Llama.cpp update check already in progress');
      return;
    }

    setCheckingLlamacppUpdates(true);
    setLlamacppUpdateInfo(null);

    try {
      console.log('Starting llama.cpp binary update check...');
      const info = await electron.checkLlamacppUpdates();

      const safeInfo = {
        hasUpdate: Boolean(info.hasUpdate),
        currentVersion: info.currentVersion || 'Unknown',
        latestVersion: info.latestVersion || info.currentVersion || 'Unknown',
        platform: info.platform || 'unknown',
        downloadSize: info.downloadSize || 'Unknown size',
        releaseUrl: info.releaseUrl || '',
        publishedAt: info.publishedAt || null,
        error: info.error || null
      };

      setLlamacppUpdateInfo(safeInfo);
      setLastLlamacppUpdateCheck(new Date());

      console.log('Llama.cpp update check completed:', {
        hasUpdate: safeInfo.hasUpdate,
        currentVersion: safeInfo.currentVersion,
        latestVersion: safeInfo.latestVersion,
        error: safeInfo.error
      });

    } catch (error) {
      console.error('Error checking for llama.cpp updates:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred while checking for llama.cpp updates';

      setLlamacppUpdateInfo({
        hasUpdate: false,
        error: errorMessage,
        currentVersion: 'Unknown',
        platform: 'unknown'
      });
      setLastLlamacppUpdateCheck(new Date());
    } finally {
      setCheckingLlamacppUpdates(false);
    }
  };

  const updateLlamacppBinaries = async () => {
    const electron = window.electron;

    if (!electron?.updateLlamacppBinaries) {
      console.error('Llama.cpp binary update functionality not available');
      return;
    }

    if (updatingLlamacppBinaries) {
      console.warn('Llama.cpp binary update already in progress');
      return;
    }

    setUpdatingLlamacppBinaries(true);

    try {
      console.log('Starting llama.cpp binary update...');
      const result = await electron.updateLlamacppBinaries();

      if (result.success) {
        await checkForLlamacppUpdates();
        console.log('Official Llama.cpp Binaries Updated:', result.message || `Successfully updated official binaries to version ${result.version}. angela's custom binaries were preserved.`);
      } else {
        console.error('Binary update failed:', result.error);
      }

    } catch (error) {
      console.error('Error updating llama.cpp binaries:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to update llama.cpp binaries';

      setLlamacppUpdateInfo(prev => prev ? {
        ...prev,
        error: errorMessage
      } : null);
    } finally {
      setUpdatingLlamacppBinaries(false);
    }
  };

  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Download className="w-6 h-6 text-sakura-500" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Updates
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Keep angela up to date with the latest features and improvements
          </p>
        </div>
      </div>

      {/* Alpha Features Toggle */}
      <div className="flex items-center gap-4 mb-6">
        <input
          type="checkbox"
          id="alpha-features-toggle"
          checked={alphaFeaturesEnabled}
          onChange={e => setAlphaFeaturesEnabled(e.target.checked)}
          className="accent-sakura-500 w-5 h-5"
        />
        <label htmlFor="alpha-features-toggle" className="text-sm font-medium text-gray-700">
          Enable Alpha Features
        </label>
      </div>

      {/* Current Version Info */}
      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
              Current Version
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              angela {updateInfo?.currentVersion || '1.0.0'} on {updateInfo ? getPlatformName(updateInfo.platform) : 'Unknown Platform'}
            </p>
          </div>
          <button
            onClick={handleManualUpdateCheck}
            disabled={checkingUpdates}
            className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {checkingUpdates ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Checking...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Check for Updates
              </>
            )}
          </button>
        </div>
      </div>

      {/* Update Status */}
      {updateInfo && (
        <div className="space-y-4">
          {updateInfo.error ? (
            <div className="bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <div>
                  <h4 className="font-medium text-red-900 dark:text-red-100">
                    Update Check Failed
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {updateInfo.error}
                  </p>
                </div>
              </div>
            </div>
          ) : updateInfo.hasUpdate ? (
            <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                  <Download className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    New Version Available: angela {updateInfo.latestVersion || 'Unknown'}
                  </h4>

                  {/* Platform-specific messaging */}
                  {updateInfo.isOTASupported ? (
                    <div className="space-y-3">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        🍎 Automatic updates are supported on macOS. Click "Download & Install" to update angela automatically.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleManualUpdateCheck}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download & Install
                        </button>
                        {updateInfo.releaseUrl && (
                          <button
                            onClick={() => {
                              if (updateInfo.releaseUrl) {
                                window.open(updateInfo.releaseUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Release Notes
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        🔒 On {getPlatformName(updateInfo.platform)}, updates need to be installed manually for security reasons.
                        Click "Download Now" to get the latest version.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={downloadUpdate}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Download Now
                        </button>
                        {updateInfo.releaseUrl && (
                          <button
                            onClick={() => {
                              if (updateInfo.releaseUrl) {
                                window.open(updateInfo.releaseUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Release Notes
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {updateInfo.releaseNotes && updateInfo.releaseNotes !== 'No release notes available.' && (
                    <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                      <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        What's New:
                      </h5>
                      <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30 rounded p-3 max-h-32 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans">
                          {updateInfo.releaseNotes.length > 500
                            ? updateInfo.releaseNotes.substring(0, 500) + '...'
                            : updateInfo.releaseNotes}
                        </pre>
                      </div>
                    </div>
                  )}

                  {updateInfo.publishedAt && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                      Released {new Date(updateInfo.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    You're Up to Date!
                  </h4>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    angela {updateInfo.currentVersion || 'Unknown'} is the latest version.
                  </p>
                </div>
              </div>
            </div>
          )}

          {lastUpdateCheck && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Last checked: {lastUpdateCheck.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Update Information */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">
          Update Information
        </h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-sakura-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <strong>macOS:</strong> Supports automatic over-the-air (OTA) updates with code signing verification for security.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <strong>Windows & Linux:</strong> Manual updates ensure security. Download links point to the official GitHub releases.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <strong>Release Notes:</strong> View detailed information about new features, improvements, and bug fixes.
            </div>
          </div>
        </div>
      </div>

      {/* Llama.cpp Binary Updates Section */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <HardDrive className="w-6 h-6 text-orange-500" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Llama.cpp Binary Updates
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Keep official llama.cpp inference binaries up to date (angela's custom binaries are preserved)
            </p>
          </div>
        </div>

        {/* Current Binary Version Info */}
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                Current Llama.cpp Version
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Version {llamacppUpdateInfo?.currentVersion || 'Unknown'} on {llamacppUpdateInfo ? getPlatformName(llamacppUpdateInfo.platform) : 'Unknown Platform'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Updates official binaries only (llama-server, llama-cli, etc.)
              </p>
            </div>
            <button
              onClick={checkForLlamacppUpdates}
              disabled={checkingLlamacppUpdates}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {checkingLlamacppUpdates ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Checking...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Check for Updates
                </>
              )}
            </button>
          </div>
        </div>

        {/* Llama.cpp Update Status */}
        {llamacppUpdateInfo && (
          <div className="space-y-4">
            {llamacppUpdateInfo.error ? (
              <div className="bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <h4 className="font-medium text-red-900 dark:text-red-100">
                      Binary Update Check Failed
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {llamacppUpdateInfo.error}
                    </p>
                  </div>
                </div>
              </div>
            ) : llamacppUpdateInfo.hasUpdate ? (
              <div className="bg-orange-50/50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
                    <HardDrive className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">
                      🚀 New Llama.cpp Binaries Available: {llamacppUpdateInfo.latestVersion || 'Latest Version'}
                    </h4>
                    
                    <div className="space-y-3">
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        ⚡ Updated official binaries provide better performance, bug fixes, and new features for local AI inference.
                        Download size: <strong>{llamacppUpdateInfo.downloadSize}</strong>
                      </p>
                      
                      <div className="bg-orange-100/60 dark:bg-orange-900/30 rounded-lg p-3 text-sm">
                        <p className="text-orange-800 dark:text-orange-200">
                          <strong>📋 What will be updated:</strong> Official llama.cpp binaries (llama-server, llama-cli, etc.)
                        </p>
                        <p className="text-orange-700 dark:text-orange-300 mt-1">
                          <strong>🔒 What stays untouched:</strong> angela's custom binaries (llama-swap and others)
                        </p>
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={updateLlamacppBinaries}
                          disabled={updatingLlamacppBinaries}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                          {updatingLlamacppBinaries ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Updating...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Update Official Binaries
                            </>
                          )}
                        </button>
                        
                        {llamacppUpdateInfo.releaseUrl && (
                          <button
                            onClick={() => {
                              if (llamacppUpdateInfo.releaseUrl) {
                                window.open(llamacppUpdateInfo.releaseUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Release Notes
                          </button>
                        )}
                      </div>

                      {llamacppUpdateInfo.publishedAt && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-3">
                          Released {new Date(llamacppUpdateInfo.publishedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-50/50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-green-900 dark:text-green-100">
                      Official Binaries Up to Date!
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Llama.cpp binaries {llamacppUpdateInfo.currentVersion || 'Unknown'} are the latest version.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {lastLlamacppUpdateCheck && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Binaries last checked: {lastLlamacppUpdateCheck.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Binary Update Information */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">
            🔧 Binary Update Information
          </h4>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-orange-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <strong>Official Binaries Only:</strong> Updates llama-server, llama-cli, and other official tools from ggerganov/llama.cpp.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <strong>angela's Custom Binaries:</strong> llama-swap and other angela-specific tools remain untouched and preserved.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <strong>Safe Updates:</strong> Your existing setup continues working, only official tools get performance improvements.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatesTab; 
