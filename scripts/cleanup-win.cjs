const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

console.log('Starting cleanup process before build...');

try {
  // Kill any running instances of the app
  console.log('Terminating any running instances of angela...');
  try {
    execSync('taskkill /f /im angela.exe', { stdio: 'ignore' });
    console.log('Successfully terminated angela processes');
  } catch (e) {
    // It's okay if no processes were found to kill
    console.log('No running angela processes found or could not terminate');
  }

  // Clean up the output directory
  const releaseDir = path.join(process.cwd(), 'release');
  const winUnpackedDir = path.join(releaseDir, 'win-unpacked');
  
  console.log('Cleaning up build directories...');
  
  // Use rimraf to force delete directories
  if (fs.existsSync(winUnpackedDir)) {
    console.log('Removing win-unpacked directory...');
    rimraf.sync(winUnpackedDir);
  }

  // Also try to clean any leftover installer
  const installerPath = path.join(releaseDir, 'angela-1.0.0-win.exe');
  if (fs.existsSync(installerPath)) {
    console.log('Removing previous installer...');
    fs.unlinkSync(installerPath);
  }

  console.log('Cleanup completed successfully!');
} catch (error) {
  console.error('Error during cleanup:', error);
  // Don't exit with error code as we want the build to try anyway
}
