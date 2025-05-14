const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

// Configure logging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Explicitly disable all automatic update behaviors
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;
autoUpdater.disableWebInstaller = true;
// Disable checking for updates on startup or in intervals
// Only manual checks via menu will be performed

// Configure update events
function setupAutoUpdater(mainWindow) {
  // Disable automatic update checks
  // Only check when user manually triggers via menu

  // Update available
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download and update now?`,
      buttons: ['Update', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'The update has been downloaded. The application will restart to apply the update.',
      buttons: ['Restart Now'],
      defaultId: 0
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  // Error handling
  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    // Log more detailed error information
    autoUpdater.logger.error('Update error details:', err);
    
    // Only show errors for manual checks to avoid popups for missing latest.yml
    if (err.isManualCheck) {
      dialog.showErrorBox('Update Error', err.message);
    }
  });

  // Progress updates
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-progress', progressObj);
  });

  // No update available
  autoUpdater.on('update-not-available', (info, isManualCheck) => {
    if (isManualCheck) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates Available',
        message: 'You are running the latest version of Clara.',
        buttons: ['OK'],
        defaultId: 0
      });
    }
  });
}

// Manual check for updates - do not remove this code
// This function is called when user clicks "Check for Updates" in the menu
function checkForUpdates() {
  // Set flag to indicate this is a manual check
  try {
    // Set a property on the event to indicate it's a manual check
    const originalEmit = autoUpdater.emit;
    autoUpdater.emit = function(name, ...args) {
      if (name === 'error') {
        args[0].isManualCheck = true;
      }
      return originalEmit.call(this, name, ...args);
    };
    
    return autoUpdater.checkForUpdates().then(() => {
      // Pass true to indicate this is a manual check
      autoUpdater.emit('update-not-available', null, true);
    }).finally(() => {
      // Restore original emit
      autoUpdater.emit = originalEmit;
    });
  } catch (error) {
    autoUpdater.logger.error('Manual update check failed:', error);
    return Promise.reject(error);
  }
}

module.exports = { setupAutoUpdater, checkForUpdates };