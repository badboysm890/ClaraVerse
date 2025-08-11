const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');
const { shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Use node-fetch for HTTP requests with comprehensive fallback
let fetch;
let AbortController;

try {
  // Try to use global fetch first (Node.js 18+)
  fetch = globalThis.fetch;
  AbortController = globalThis.AbortController;
} catch (error) {
  // Fallback to node-fetch for older versions
  try {
    const nodeFetch = require('node-fetch');
    fetch = nodeFetch.default || nodeFetch;
    AbortController = require('abort-controller').AbortController;
  } catch (fetchError) {
    console.warn('No fetch implementation available. Update checking will not work.');
    fetch = null;
    AbortController = null;
  }
}

// Configure logging with error boundaries
let logger;
try {
  logger = require('electron-log');
  autoUpdater.logger = logger;
  autoUpdater.logger.transports.file.level = 'info';
} catch (error) {
  console.warn('Electron log not available, using console');
  logger = console;
}

// Enhanced constants for robust update handling with UX improvements
const UPDATE_CONSTANTS = {
  GITHUB_API_TIMEOUT: 15000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  RATE_LIMIT_DELAY: 60000,
  MAX_RELEASE_NOTES_LENGTH: 2000, // Increased for better release notes
  // Enhanced UX constants
  NOTIFICATION_DELAY: 1500,
  PROGRESS_UPDATE_INTERVAL: 500,
  BACKGROUND_CHECK_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  AUTO_CHECK_STARTUP_DELAY: 30000, // 30 seconds after startup
  DOWNLOAD_CHUNK_SIZE: 1024 * 1024, // 1MB chunks
};

// Update preferences management
const UPDATE_PREFERENCES_KEY = 'clara-update-preferences';
const DEFAULT_UPDATE_PREFERENCES = {
  autoCheck: true,
  checkFrequency: 'daily', // 'daily', 'weekly', 'monthly', 'manual'
  notifyOnAvailable: true,
  backgroundDownload: false, // For manual platforms
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  betaChannel: false,
  lastAutoCheck: null,
  dismissedVersions: [] // Versions user chose to skip
};

// Enhanced release notes processing with markdown support
function processReleaseNotes(notes) {
  if (!notes || typeof notes !== 'string') {
    return {
      plain: 'No release notes available.',
      formatted: 'No release notes available.',
      categories: {}
    };
  }
  
  // Enhanced sanitization while preserving markdown structure
  let sanitized = notes
    .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove scripts
    .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '') // Remove iframes
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .trim();
  
  // Parse and categorize content
  const categories = {
    'New Features': [],
    'Improvements': [],
    'Bug Fixes': [],
    'Breaking Changes': [],
    'Other': []
  };
  
  // Simple markdown-aware categorization
  const lines = sanitized.split('\n');
  let currentCategory = 'Other';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Detect category headers
    if (trimmed.match(/^#+\s*(new features?|features?)/i)) {
      currentCategory = 'New Features';
      continue;
    } else if (trimmed.match(/^#+\s*(improvements?|enhancements?)/i)) {
      currentCategory = 'Improvements';
      continue;
    } else if (trimmed.match(/^#+\s*(bug fixes?|fixes?|bugfixes?)/i)) {
      currentCategory = 'Bug Fixes';
      continue;
    } else if (trimmed.match(/^#+\s*(breaking changes?|breaking)/i)) {
      currentCategory = 'Breaking Changes';
      continue;
    }
    
    // Add content to current category
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
      categories[currentCategory].push(trimmed.substring(2).trim());
    } else if (trimmed && !trimmed.startsWith('#')) {
      categories[currentCategory].push(trimmed);
    }
  }
  
  // Create formatted version
  let formatted = '';
  for (const [category, items] of Object.entries(categories)) {
    if (items.length > 0) {
      formatted += `**${category}:**\n`;
      for (const item of items) {
        formatted += `• ${item}\n`;
      }
      formatted += '\n';
    }
  }
  
  // Limit length if needed
  const plainText = sanitized.replace(/[#*_`]/g, '');
  if (plainText.length > UPDATE_CONSTANTS.MAX_RELEASE_NOTES_LENGTH) {
    sanitized = plainText.substring(0, UPDATE_CONSTANTS.MAX_RELEASE_NOTES_LENGTH) + '...';
    formatted = formatted.substring(0, UPDATE_CONSTANTS.MAX_RELEASE_NOTES_LENGTH) + '...';
  }
  
  return {
    plain: plainText || 'No release notes available.',
    formatted: formatted || plainText || 'No release notes available.',
    categories,
    hasBreakingChanges: categories['Breaking Changes'].length > 0
  };
}

// Update preferences management with error handling
function getUpdatePreferences() {
  try {
    // Try localStorage first (for renderer process)
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(UPDATE_PREFERENCES_KEY);
      if (stored) {
        return { ...DEFAULT_UPDATE_PREFERENCES, ...JSON.parse(stored) };
      }
    }
    
    // Fallback to file-based storage (for main process)
    const { app } = require('electron');
    const prefsPath = path.join(app.getPath('userData'), 'update-preferences.json');
    
    if (fs.existsSync(prefsPath)) {
      const stored = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      return { ...DEFAULT_UPDATE_PREFERENCES, ...stored };
    }
  } catch (error) {
    logger.warn('Failed to load update preferences:', error);
  }
  return { ...DEFAULT_UPDATE_PREFERENCES };
}

function saveUpdatePreferences(preferences) {
  try {
    const current = getUpdatePreferences();
    const updated = { ...current, ...preferences, lastUpdated: new Date().toISOString() };
    
    // Try localStorage first (for renderer process)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UPDATE_PREFERENCES_KEY, JSON.stringify(updated));
    } else {
      // Fallback to file-based storage (for main process)
      const { app } = require('electron');
      const prefsPath = path.join(app.getPath('userData'), 'update-preferences.json');
      fs.writeFileSync(prefsPath, JSON.stringify(updated, null, 2));
    }
    
    logger.info('Update preferences saved:', updated);
    return updated;
  } catch (error) {
    logger.error('Failed to save update preferences:', error);
    return null;
  }
}

// Smart timing for update checks
function isQuietTime(preferences = getUpdatePreferences()) {
  if (!preferences.quietHours.enabled) return false;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = preferences.quietHours.start.split(':').map(Number);
  const [endHour, endMin] = preferences.quietHours.end.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  if (startTime <= endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Quiet hours span midnight
    return currentTime >= startTime || currentTime <= endTime;
  }
}

function shouldAutoCheck(preferences = getUpdatePreferences()) {
  if (!preferences.autoCheck) return false;
  if (isQuietTime(preferences)) return false;
  
  const lastCheck = preferences.lastAutoCheck ? new Date(preferences.lastAutoCheck) : null;
  if (!lastCheck) return true;
  
  const now = new Date();
  const timeDiff = now.getTime() - lastCheck.getTime();
  
  switch (preferences.checkFrequency) {
    case 'daily':
      return timeDiff >= 24 * 60 * 60 * 1000;
    case 'weekly':
      return timeDiff >= 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return timeDiff >= 30 * 24 * 60 * 60 * 1000;
    default:
      return false;
  }
}

// Robust version validation
function validateVersion(version) {
  if (!version || typeof version !== 'string') {
    throw new Error('Invalid version: must be a non-empty string');
  }
  
  const cleanVersion = version.replace(/^v/, '').trim();
  const versionRegex = /^\d+(\.\d+){0,3}(-[a-zA-Z0-9-]+)?$/;
  
  if (!versionRegex.test(cleanVersion)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  
  return cleanVersion;
}

// Safe package.json reading with validation
function getSafeCurrentVersion() {
  try {
    const packagePath = path.join(__dirname, '../package.json');
    
    if (!fs.existsSync(packagePath)) {
      throw new Error('Package.json not found');
    }
    
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const packageData = JSON.parse(packageContent);
    
    if (!packageData.version) {
      throw new Error('Version not found in package.json');
    }
    
    return validateVersion(packageData.version);
  } catch (error) {
    logger.error('Error reading version from package.json:', error);
    // Fallback version to prevent crashes
    return '1.0.0';
  }
}

// Enhanced error classification
class UpdateError extends Error {
  constructor(message, type = 'UNKNOWN', retryable = false) {
    super(message);
    this.name = 'UpdateError';
    this.type = type;
    this.retryable = retryable;
  }
}

// Robust network request with retry logic and progress tracking
async function makeRobustRequest(url, options = {}) {
  if (!fetch) {
    throw new UpdateError('Network functionality not available', 'NO_FETCH', false);
  }

  const controller = AbortController ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), UPDATE_CONSTANTS.GITHUB_API_TIMEOUT) : null;

  const requestOptions = {
    ...options,
    signal: controller?.signal,
    headers: {
      'User-Agent': 'Clara-App-Updater',
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers
    }
  };

  let lastError;
  
  for (let attempt = 1; attempt <= UPDATE_CONSTANTS.MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, requestOptions);
      
      if (timeoutId) clearTimeout(timeoutId);
      
      // Handle rate limiting
      if (response.status === 403) {
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        if (rateLimitReset) {
          const resetTime = new Date(parseInt(rateLimitReset) * 1000);
          const waitTime = Math.min(resetTime - Date.now(), UPDATE_CONSTANTS.RATE_LIMIT_DELAY);
          throw new UpdateError(
            `GitHub API rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
            'RATE_LIMIT',
            false
          );
        }
      }

      if (!response.ok) {
        throw new UpdateError(
          `GitHub API error: ${response.status} ${response.statusText}`,
          'API_ERROR',
          response.status >= 500 || response.status === 429
        );
      }

      return response;
    } catch (error) {
      lastError = error;
      
      if (timeoutId) clearTimeout(timeoutId);
      
      // Don't retry for non-retryable errors
      if (error instanceof UpdateError && !error.retryable) {
        throw error;
      }
      
      // Don't retry on the last attempt
      if (attempt === UPDATE_CONSTANTS.MAX_RETRIES) {
        break;
      }
      
      // Wait before retrying with exponential backoff
      const delay = UPDATE_CONSTANTS.RETRY_DELAY * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new UpdateError('All retry attempts failed', 'NETWORK_ERROR', false);
}

// Validate GitHub release data structure
function validateReleaseData(release) {
  if (!release || typeof release !== 'object') {
    throw new UpdateError('Invalid release data structure', 'INVALID_DATA', false);
  }
  
  const requiredFields = ['tag_name', 'html_url', 'assets'];
  for (const field of requiredFields) {
    if (!release[field]) {
      throw new UpdateError(`Missing required field: ${field}`, 'INVALID_DATA', false);
    }
  }
  
  if (!Array.isArray(release.assets)) {
    throw new UpdateError('Release assets must be an array', 'INVALID_DATA', false);
  }
  
  return true;
}

// Enhanced platform-specific update service with comprehensive UX improvements
class EnhancedPlatformUpdateService {
  constructor() {
    this.platform = process.platform;
    this.currentVersion = getSafeCurrentVersion();
    this.githubRepo = 'badboysm890/ClaraVerse';
    this.isChecking = false; // Prevent concurrent checks
    this.downloadProgress = null; // Track download progress
    this.backgroundDownload = null; // Background download state
    this.notificationCallbacks = new Set(); // UI notification callbacks
    this.preferences = getUpdatePreferences();
    this.autoCheckTimer = null;
    
    // Initialize background checking if enabled
    this.initializeAutoCheck();
  }

  /**
   * Initialize automatic update checking
   */
  initializeAutoCheck() {
    // Clear any existing timer
    if (this.autoCheckTimer) {
      clearTimeout(this.autoCheckTimer);
    }
    
    const preferences = getUpdatePreferences();
    
    if (preferences.autoCheck) {
      // Check on startup (delayed)
      this.autoCheckTimer = setTimeout(() => {
        this.performBackgroundCheck();
      }, UPDATE_CONSTANTS.AUTO_CHECK_STARTUP_DELAY);
      
      // Set up periodic checks
      setInterval(() => {
        if (shouldAutoCheck()) {
          this.performBackgroundCheck();
        }
      }, UPDATE_CONSTANTS.BACKGROUND_CHECK_INTERVAL);
    }
  }

  /**
   * Perform background update check
   */
  async performBackgroundCheck() {
    try {
      const preferences = getUpdatePreferences();
      
      if (!preferences.autoCheck || isQuietTime(preferences)) {
        return;
      }
      
      logger.info('Performing background update check...');
      
      const updateInfo = await this.checkGitHubReleases();
      
      // Update last check time
      saveUpdatePreferences({ lastAutoCheck: new Date().toISOString() });
      
      if (updateInfo.hasUpdate && preferences.notifyOnAvailable) {
        // Check if this version was dismissed
        if (!preferences.dismissedVersions.includes(updateInfo.latestVersion)) {
          this.notify('update-available', updateInfo);
          
          // Show native notification if supported
          this.showNativeNotification(updateInfo);
        }
      }
      
      logger.info('Background update check completed:', {
        hasUpdate: updateInfo.hasUpdate,
        version: updateInfo.latestVersion
      });
      
    } catch (error) {
      logger.error('Background update check failed:', error);
    }
  }

  /**
   * Show native system notification
   */
  showNativeNotification(updateInfo) {
    try {
      const { Notification } = require('electron');
      
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: `Clara ${updateInfo.latestVersion} Available`,
          body: `A new version of Clara is ready to download. Click to view details.`,
          icon: path.join(__dirname, '../assets/icons/icon.png'), // Adjust path as needed
          silent: false
        });
        
        notification.on('click', () => {
          // Open settings to updates tab
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            const mainWindow = windows[0];
            mainWindow.show();
            mainWindow.webContents.send('navigate-to-updates');
          }
        });
        
        notification.show();
      }
    } catch (error) {
      logger.warn('Failed to show native notification:', error);
    }
  }

  /**
   * Register callback for update notifications
   */
  onNotification(callback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  /**
   * Send notification to all registered callbacks
   */
  notify(type, data) {
    for (const callback of this.notificationCallbacks) {
      try {
        callback(type, data);
      } catch (error) {
        logger.error('Error in notification callback:', error);
      }
    }
  }

  /**
   * Update preferences and reinitialize if needed
   */
  updatePreferences(newPreferences) {
    const updated = saveUpdatePreferences(newPreferences);
    if (updated) {
      this.preferences = updated;
      this.initializeAutoCheck(); // Reinitialize with new settings
    }
    return updated;
  }

  /**
   * Dismiss a specific version (user chose to skip)
   */
  dismissVersion(version) {
    const preferences = getUpdatePreferences();
    const dismissedVersions = [...preferences.dismissedVersions, version];
    return this.updatePreferences({ dismissedVersions });
  }

  /**
   * Check if OTA updates are supported for the current platform
   */
  isOTASupported() {
    // Only Mac supports OTA updates because it's signed
    return this.platform === 'darwin';
  }

  /**
   * Safe GitHub releases check with comprehensive validation and enhanced UX
   */
  async checkGitHubReleases() {
    // Prevent concurrent update checks
    if (this.isChecking) {
      throw new UpdateError('Update check already in progress', 'CONCURRENT_CHECK', false);
    }

    this.isChecking = true;
    this.notify('check-started', { timestamp: new Date() });

    try {
      const url = `https://api.github.com/repos/${this.githubRepo}/releases/latest`;
      logger.info(`Checking for updates at: ${url}`);
      
      const response = await makeRobustRequest(url);
      const release = await response.json();
      
      // Validate release data structure
      validateReleaseData(release);
      
      const latestVersion = validateVersion(release.tag_name);
      const hasUpdate = this.isVersionNewer(latestVersion, this.currentVersion);
      
      // Enhanced release notes processing
      const processedNotes = processReleaseNotes(release.body);
      
      const updateInfo = {
        hasUpdate,
        latestVersion,
        currentVersion: this.currentVersion,
        releaseUrl: release.html_url,
        downloadUrl: this.getDownloadUrlForPlatform(release.assets),
        releaseNotes: processedNotes.plain,
        releaseNotesFormatted: processedNotes.formatted,
        releaseNotesCategories: processedNotes.categories,
        hasBreakingChanges: processedNotes.hasBreakingChanges,
        publishedAt: release.published_at,
        assetSize: this.getAssetSize(release.assets),
        downloadEstimate: this.estimateDownloadTime(release.assets)
      };
      
      logger.info('Update check completed successfully:', {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
        hasBreakingChanges: processedNotes.hasBreakingChanges
      });
      
      this.notify('check-completed', updateInfo);
      return updateInfo;
      
    } catch (error) {
      logger.error('Error checking GitHub releases:', error);
      
      const errorInfo = {
        hasUpdate: false,
        error: error instanceof UpdateError ? error.message : `Failed to check for updates: ${error.message}`,
        currentVersion: this.currentVersion,
        platform: this.platform,
        isOTASupported: this.isOTASupported()
      };
      
      this.notify('check-failed', errorInfo);
      
      if (error instanceof UpdateError) {
        throw error;
      }
      
      throw new UpdateError(
        `Failed to check for updates: ${error.message}`,
        'UNKNOWN_ERROR',
        true
      );
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Get asset size for download estimation
   */
  getAssetSize(assets) {
    if (!Array.isArray(assets)) return null;
    
    const platformAsset = this.findPlatformAsset(assets);
    if (platformAsset && platformAsset.size) {
      return this.formatFileSize(platformAsset.size);
    }
    
    return null;
  }

  /**
   * Estimate download time based on asset size
   */
  estimateDownloadTime(assets) {
    if (!Array.isArray(assets)) return null;
    
    const platformAsset = this.findPlatformAsset(assets);
    if (platformAsset && platformAsset.size) {
      // Assume average download speed of 10 Mbps (conservative estimate)
      const avgSpeedBytesPerSecond = (10 * 1024 * 1024) / 8; // 10 Mbps to bytes/sec
      const estimatedSeconds = platformAsset.size / avgSpeedBytesPerSecond;
      
      if (estimatedSeconds < 60) {
        return `< 1 minute`;
      } else if (estimatedSeconds < 3600) {
        return `~ ${Math.ceil(estimatedSeconds / 60)} minutes`;
      } else {
        return `~ ${Math.ceil(estimatedSeconds / 3600)} hours`;
      }
    }
    
    return null;
  }

  /**
   * Find platform-specific asset
   */
  findPlatformAsset(assets) {
    const platformExtensions = {
      darwin: ['.dmg', '-arm64.dmg', '-mac.dmg'],
      win32: ['.exe', '-win.exe', '-windows.exe'],
      linux: ['.AppImage', '.deb', '-linux.AppImage']
    };

    const extensions = platformExtensions[this.platform] || [];
    
    for (const ext of extensions) {
      const asset = assets.find(asset => 
        asset && 
        asset.name && 
        typeof asset.name === 'string' && 
        asset.name.toLowerCase().endsWith(ext.toLowerCase()) &&
        asset.browser_download_url
      );
      
      if (asset) {
        return asset;
      }
    }
    
    return null;
  }

  /**
   * Format file size in human readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get the appropriate download URL for the current platform with validation
   */
  getDownloadUrlForPlatform(assets) {
    if (!Array.isArray(assets)) {
      logger.warn('Invalid assets array, using fallback URL');
      return `https://github.com/${this.githubRepo}/releases/latest`;
    }

    const platformAsset = this.findPlatformAsset(assets);
    
    if (platformAsset) {
      logger.info(`Found platform-specific download: ${platformAsset.name}`);
      return platformAsset.browser_download_url;
    }

    // Fallback to releases page
    logger.info('No platform-specific download found, using releases page');
    return `https://github.com/${this.githubRepo}/releases/latest`;
  }

  /**
   * Robust version comparison with detailed logging
   */
  isVersionNewer(newVersion, currentVersion) {
    try {
      const parseVersion = (version) => {
        return version.split('.').map(num => {
          const parsed = parseInt(num, 10);
          return isNaN(parsed) ? 0 : parsed;
        });
      };

      const newParts = parseVersion(newVersion);
      const currentParts = parseVersion(currentVersion);
      const maxLength = Math.max(newParts.length, currentParts.length);

      for (let i = 0; i < maxLength; i++) {
        const newPart = newParts[i] || 0;
        const currentPart = currentParts[i] || 0;

        if (newPart > currentPart) {
          logger.info(`Version ${newVersion} is newer than ${currentVersion}`);
          return true;
        }
        if (newPart < currentPart) {
          logger.info(`Version ${newVersion} is older than ${currentVersion}`);
          return false;
        }
      }

      logger.info(`Version ${newVersion} is same as ${currentVersion}`);
      return false;
    } catch (error) {
      logger.error('Error comparing versions:', error);
      return false; // Safe fallback
    }
  }

  /**
   * Enhanced platform-specific update dialog with beautiful UX
   */
  async showEnhancedUpdateDialog(updateInfo) {
    try {
      const { hasUpdate, latestVersion, downloadUrl, releaseNotesFormatted, hasBreakingChanges } = updateInfo;

      if (!hasUpdate) {
        return await dialog.showMessageBox({
          type: 'info',
          title: '✅ You\'re Up to Date!',
          message: 'Clara is current',
          detail: `You're running Clara ${this.currentVersion}, which is the latest version available.`,
          buttons: ['Perfect!'],
          defaultId: 0
        });
      }

      // Build enhanced message with categorized release notes
      let detailMessage = `Current version: Clara ${this.currentVersion}\nNew version: Clara ${latestVersion}\n\n`;
      
      if (hasBreakingChanges) {
        detailMessage += `⚠️ This update contains breaking changes. Please review the release notes.\n\n`;
      }
      
      if (updateInfo.assetSize) {
        detailMessage += `Download size: ${updateInfo.assetSize}`;
        if (updateInfo.downloadEstimate) {
          detailMessage += ` (${updateInfo.downloadEstimate})`;
        }
        detailMessage += '\n\n';
      }

      if (releaseNotesFormatted && releaseNotesFormatted !== 'No release notes available.') {
        const truncated = releaseNotesFormatted.length > 400 
          ? releaseNotesFormatted.substring(0, 400) + '...\n\nClick "Release Notes" for full details.' 
          : releaseNotesFormatted;
        detailMessage += `What's new:\n${truncated}`;
      }

      if (this.isOTASupported()) {
        // Mac: Enhanced OTA update dialog
        return await dialog.showMessageBox({
          type: 'info',
          title: hasBreakingChanges ? '⚠️ Important Update Available' : '🎉 Update Available',
          message: `Clara ${latestVersion} is ready to install`,
          detail: detailMessage,
          buttons: ['Download & Install Now', 'View Release Notes', 'Remind Me Later', 'Skip This Version'],
          defaultId: 0,
          cancelId: 2
        }).then(({ response }) => {
          try {
            switch (response) {
              case 0:
                // Start OTA update with progress tracking
                this.startOTAUpdateWithProgress();
                return { action: 'download' };
              case 1:
                // Open release notes
                shell.openExternal(updateInfo.releaseUrl);
                return { action: 'view_notes' };
              case 2:
                return { action: 'later' };
              case 3:
                // Skip this version
                this.dismissVersion(latestVersion);
                return { action: 'dismissed' };
              default:
                return { action: 'later' };
            }
          } catch (error) {
            logger.error('Error handling dialog response:', error);
            return { action: 'error', error: error.message };
          }
        });
      } else {
        // Windows/Linux: Enhanced manual update dialog
        const platformName = this.platform === 'win32' ? 'Windows' : 'Linux';
        
        detailMessage += `\n🔒 On ${platformName}, updates are installed manually for security. The download will open in your browser.`;
        
        return await dialog.showMessageBox({
          type: 'info',
          title: hasBreakingChanges ? '⚠️ Important Update Available' : '📦 Update Available',
          message: `Clara ${latestVersion} is ready to download`,
          detail: detailMessage,
          buttons: ['Download Now', 'View Release Notes', 'Remind Me Later', 'Skip This Version'],
          defaultId: 0,
          cancelId: 2
        }).then(({ response }) => {
          try {
            switch (response) {
              case 0:
                // Open download page
                shell.openExternal(downloadUrl);
                return { action: 'download' };
              case 1:
                // Open release notes
                shell.openExternal(updateInfo.releaseUrl);
                return { action: 'view_notes' };
              case 2:
                return { action: 'later' };
              case 3:
                // Skip this version
                this.dismissVersion(latestVersion);
                return { action: 'dismissed' };
              default:
                return { action: 'later' };
            }
          } catch (error) {
            logger.error('Error handling dialog response:', error);
            return { action: 'error', error: error.message };
          }
        });
      }
    } catch (error) {
      logger.error('Error showing enhanced update dialog:', error);
      
      // Show fallback error dialog
      try {
        await dialog.showErrorBox(
          '❌ Update Dialog Error',
          `Failed to show update information: ${error.message}\n\nPlease check for updates manually at: https://github.com/${this.githubRepo}/releases`
        );
      } catch (dialogError) {
        logger.error('Failed to show error dialog:', dialogError);
      }
      
      return { action: 'error', error: error.message };
    }
  }

  /**
   * Start OTA update with progress tracking
   */
  startOTAUpdateWithProgress() {
    try {
      this.notify('download-started', { timestamp: new Date() });
      autoUpdater.downloadUpdate();
    } catch (error) {
      logger.error('Failed to start OTA update:', error);
      this.notify('download-error', { error: error.message });
    }
  }
}

// Create enhanced global instance with error protection
let enhancedPlatformUpdateService;
try {
  enhancedPlatformUpdateService = new EnhancedPlatformUpdateService();
} catch (error) {
  logger.error('Failed to initialize enhanced update service:', error);
  enhancedPlatformUpdateService = null;
}

// Enhanced auto-updater setup with comprehensive error handling and progress tracking
function setupEnhancedAutoUpdater(mainWindow) {
  if (!enhancedPlatformUpdateService || !enhancedPlatformUpdateService.isOTASupported()) {
    logger.info('OTA updates not supported on this platform');
    return;
  }

  try {
    // Enhanced progress tracking
    autoUpdater.on('download-progress', (progressObj) => {
      try {
        const progress = {
          percent: Math.round(progressObj.percent),
          transferred: enhancedPlatformUpdateService.formatFileSize(progressObj.transferred),
          total: enhancedPlatformUpdateService.formatFileSize(progressObj.total),
          bytesPerSecond: enhancedPlatformUpdateService.formatFileSize(progressObj.bytesPerSecond) + '/s'
        };
        
        enhancedPlatformUpdateService.notify('download-progress', progress);
        
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('update-download-progress', progress);
        }
      } catch (error) {
        logger.error('Error processing download progress:', error);
      }
    });

    // Update available with enhanced dialog
    autoUpdater.on('update-available', async (info) => {
      try {
        logger.info('OTA update available:', info);
        
        const updateInfo = {
          hasUpdate: true,
          latestVersion: info.version,
          currentVersion: enhancedPlatformUpdateService.currentVersion,
          releaseNotes: info.releaseNotes || 'Release notes not available',
          publishedAt: info.releaseDate
        };
        
        enhancedPlatformUpdateService.notify('update-available', updateInfo);
        
      } catch (error) {
        logger.error('Error in update-available handler:', error);
      }
    });

    // Update downloaded with enhanced dialog
    autoUpdater.on('update-downloaded', () => {
      try {
        enhancedPlatformUpdateService.notify('download-completed', { timestamp: new Date() });
        
        dialog.showMessageBox({
          type: 'info',
          title: '🎉 Update Ready!',
          message: 'Clara has been updated successfully',
          detail: 'The update has been downloaded and verified. Clara will restart to complete the installation.',
          buttons: ['Restart Now', 'Restart Later'],
          defaultId: 0,
          cancelId: 1
        }).then(({ response }) => {
          if (response === 0) {
            try {
              autoUpdater.quitAndInstall();
            } catch (error) {
              logger.error('Error during quit and install:', error);
              dialog.showErrorBox('Installation Failed', `Failed to install update: ${error.message}`);
            }
          }
        }).catch(error => {
          logger.error('Error showing update downloaded dialog:', error);
        });
      } catch (error) {
        logger.error('Error in update-downloaded handler:', error);
      }
    });

    // Enhanced error handling
    autoUpdater.on('error', (err) => {
      logger.error('Auto-updater error:', err);
      
      enhancedPlatformUpdateService.notify('download-error', { error: err.message });
      
      try {
        // Fallback to GitHub-based updates on error
        dialog.showErrorBox('❌ Update Error', 
          `Automatic update failed: ${err.message}\n\nYou can manually download the latest version from:\nhttps://github.com/${enhancedPlatformUpdateService.githubRepo}/releases`
        );
      } catch (dialogError) {
        logger.error('Failed to show error dialog:', dialogError);
      }
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
      try {
        enhancedPlatformUpdateService.notify('no-update-available', { 
          currentVersion: enhancedPlatformUpdateService.currentVersion,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error('Error in update-not-available handler:', error);
      }
    });

    logger.info('Enhanced auto-updater setup completed successfully');
  } catch (error) {
    logger.error('Failed to setup enhanced auto-updater:', error);
  }
}

// Enhanced universal update check with comprehensive error handling
async function checkForUpdatesEnhanced() {
  if (!enhancedPlatformUpdateService) {
    const error = 'Enhanced update service not available';
    logger.error(error);
    try {
      dialog.showErrorBox('Update Service Error', error);
    } catch (dialogError) {
      logger.error('Failed to show error dialog:', dialogError);
    }
    return null;
  }

  try {
    if (enhancedPlatformUpdateService.isOTASupported()) {
      // Mac: Use electron-updater first, fallback to GitHub
      try {
        return await autoUpdater.checkForUpdates();
      } catch (error) {
        logger.warn('OTA update check failed, falling back to GitHub:', error);
        const updateInfo = await enhancedPlatformUpdateService.checkGitHubReleases();
        return await enhancedPlatformUpdateService.showEnhancedUpdateDialog(updateInfo);
      }
    } else {
      // Windows/Linux: Use enhanced GitHub releases
      const updateInfo = await enhancedPlatformUpdateService.checkGitHubReleases();
      return await enhancedPlatformUpdateService.showEnhancedUpdateDialog(updateInfo);
    }
  } catch (error) {
    logger.error('Error checking for updates:', error);
    
    let userMessage = 'Could not check for updates. Please check your internet connection and try again.';
    
    if (error instanceof UpdateError) {
      switch (error.type) {
        case 'RATE_LIMIT':
          userMessage = error.message;
          break;
        case 'NO_FETCH':
          userMessage = 'Network functionality is not available. Please restart the application.';
          break;
        case 'CONCURRENT_CHECK':
          userMessage = 'Update check is already in progress. Please wait.';
          break;
        default:
          userMessage = `Update check failed: ${error.message}`;
      }
    }
    
    try {
      dialog.showErrorBox('❌ Update Check Failed', userMessage);
    } catch (dialogError) {
      logger.error('Failed to show error dialog:', dialogError);
    }
    
    return null;
  }
}

// Enhanced update info retrieval for UI with comprehensive data
async function getEnhancedUpdateInfo() {
  if (!enhancedPlatformUpdateService) {
    return {
      hasUpdate: false,
      error: 'Enhanced update service not available',
      platform: process.platform,
      isOTASupported: false,
      currentVersion: getSafeCurrentVersion(),
      preferences: DEFAULT_UPDATE_PREFERENCES
    };
  }

  try {
    const updateInfo = await enhancedPlatformUpdateService.checkGitHubReleases();
    const preferences = getUpdatePreferences();
    
    return {
      ...updateInfo,
      platform: enhancedPlatformUpdateService.platform,
      isOTASupported: enhancedPlatformUpdateService.isOTASupported(),
      preferences,
      lastAutoCheck: preferences.lastAutoCheck,
      dismissedVersions: preferences.dismissedVersions
    };
  } catch (error) {
    logger.error('Error getting enhanced update info:', error);
    
    let errorMessage = 'Failed to check for updates';
    
    if (error instanceof UpdateError) {
      errorMessage = error.message;
    } else {
      errorMessage = error.message || 'Unknown error occurred';
    }
    
    return {
      hasUpdate: false,
      error: errorMessage,
      platform: enhancedPlatformUpdateService.platform,
      isOTASupported: enhancedPlatformUpdateService.isOTASupported(),
      currentVersion: enhancedPlatformUpdateService.currentVersion,
      preferences: getUpdatePreferences()
    };
  }
}

// Export both enhanced and legacy functions for compatibility
module.exports = { 
  // Enhanced functions (new)
  setupEnhancedAutoUpdater,
  checkForUpdatesEnhanced,
  getEnhancedUpdateInfo,
  enhancedPlatformUpdateService,
  
  // Preferences management
  getUpdatePreferences,
  saveUpdatePreferences,
  
  // Legacy functions (for backward compatibility)
  setupAutoUpdater: setupEnhancedAutoUpdater,
  checkForUpdates: checkForUpdatesEnhanced,
  getUpdateInfo: getEnhancedUpdateInfo,
  platformUpdateService: enhancedPlatformUpdateService
};
