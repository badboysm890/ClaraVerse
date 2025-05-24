/**
 * Debug script to test binary paths in production builds
 * This can be invoked via IPC to help diagnose path issues
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('electron-log');

function debugPaths() {
  const info = {
    nodeEnv: process.env.NODE_ENV,
    isDev: process.env.NODE_ENV === 'development',
    __dirname: __dirname,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
    exePath: app.getPath('exe'),
    possibleBinaryPaths: [],
    existingPaths: [],
    directoryContents: {}
  };

  // Test all possible binary locations
  const possiblePaths = [
    path.join(__dirname, 'llamacpp-binaries'),
    path.join(process.resourcesPath, 'electron', 'llamacpp-binaries'),
    path.join(app.getAppPath(), 'electron', 'llamacpp-binaries'),
    path.join(app.getPath('userData'), 'llamacpp-binaries')
  ];

  possiblePaths.forEach(testPath => {
    info.possibleBinaryPaths.push(testPath);
    
    if (fs.existsSync(testPath)) {
      info.existingPaths.push(testPath);
      
      try {
        const contents = fs.readdirSync(testPath);
        info.directoryContents[testPath] = contents;
        
        // Check for platform-specific directories
        contents.forEach(item => {
          const itemPath = path.join(testPath, item);
          if (fs.statSync(itemPath).isDirectory() && item.includes('-')) {
            try {
              const platformContents = fs.readdirSync(itemPath);
              info.directoryContents[`${testPath}/${item}`] = platformContents;
            } catch (e) {
              info.directoryContents[`${testPath}/${item}`] = `Error: ${e.message}`;
            }
          }
        });
      } catch (e) {
        info.directoryContents[testPath] = `Error reading directory: ${e.message}`;
      }
    }
  });

  return info;
}

function logDebugInfo() {
  const info = debugPaths();
  
  log.info('=== BINARY PATH DEBUG INFO ===');
  log.info('Environment:', info.nodeEnv);
  log.info('__dirname:', info.__dirname);
  log.info('app.getAppPath():', info.appPath);
  log.info('process.resourcesPath:', info.resourcesPath);
  log.info('app.getPath("userData"):', info.userDataPath);
  log.info('app.getPath("exe"):', info.exePath);
  
  log.info('\n=== POSSIBLE BINARY PATHS ===');
  info.possibleBinaryPaths.forEach(p => log.info(`- ${p}`));
  
  log.info('\n=== EXISTING PATHS ===');
  info.existingPaths.forEach(p => log.info(`✅ ${p}`));
  
  if (info.existingPaths.length === 0) {
    log.error('❌ No binary paths found!');
  }
  
  log.info('\n=== DIRECTORY CONTENTS ===');
  Object.entries(info.directoryContents).forEach(([path, contents]) => {
    log.info(`${path}:`);
    if (Array.isArray(contents)) {
      contents.forEach(file => log.info(`  - ${file}`));
    } else {
      log.info(`  ${contents}`);
    }
  });
  
  return info;
}

module.exports = {
  debugPaths,
  logDebugInfo
}; 