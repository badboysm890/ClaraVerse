const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// First, run cleanup directly to ensure we're starting fresh
try {
  console.log('Running pre-build cleanup...');
  // Install rimraf if not already installed (needed for cleanup)
  try {
    execSync('npm list rimraf || npm install --no-save rimraf');
  } catch (e) {
    console.log('Installing rimraf for cleanup operations...');
    execSync('npm install --no-save rimraf');
  }

  // Run the cleanup script
  require('./cleanup-win.cjs');
} catch (error) {
  console.error('Cleanup error:', error);
}

// Create a batch script that will run the build with elevation
const batchScript = `
@echo off
echo Running build with administrator privileges...
cd /d "${process.cwd()}"
echo Cleaning build directories...
if exist "release\\win-unpacked" rmdir /s /q "release\\win-unpacked"
if exist "release\\angela-1.0.0-win.exe" del /f "release\\angela-1.0.0-win.exe"
echo Building application...
npm run build
echo Packaging with electron-builder...
npx electron-builder --win
echo Build process completed.
pause
`;

const batchPath = path.join(__dirname, 'build-admin.bat');

// Write the batch script to disk
fs.writeFileSync(batchPath, batchScript);

// Write a VBS script to run the batch file with elevated privileges
const vbsScript = `
Set UAC = CreateObject("Shell.Application")
UAC.ShellExecute "${batchPath.replace(/\\/g, '\\\\')}", "", "", "runas", 1
`;

const vbsPath = path.join(__dirname, 'elevate.vbs');

// Write the script to disk
fs.writeFileSync(vbsPath, vbsScript);

console.log('Running build with elevated privileges...');

// Execute the VBS script
const child = spawn('cscript.exe', [vbsPath], { 
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  console.log(`Build process exited with code ${code}`);
  // Clean up the temporary files
  try {
    fs.unlinkSync(vbsPath);
    fs.unlinkSync(batchPath);
  } catch (err) {
    console.error('Error cleaning up temporary files:', err);
  }
});

child.on('error', (err) => {
  console.error('Failed to start build process:', err);
  // Clean up the temporary files
  try {
    fs.unlinkSync(vbsPath);
    fs.unlinkSync(batchPath);
  } catch (cleanupErr) {
    console.error('Error cleaning up temporary files:', cleanupErr);
  }
});
