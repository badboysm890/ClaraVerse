const path = require('path');
const fs = require('fs');

/**
 * Debug script to check service paths in both development and production
 */

console.log('=== Service Path Debug ===');

const binaryName = 'llama-optimizer-windows.exe';

// Production path (when built with electron-builder)
const resourcesPath = process.resourcesPath 
  ? path.join(process.resourcesPath, 'electron', 'services', binaryName)
  : null;

// Development path
const devPath = path.join(__dirname, 'services', binaryName);

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('process.resourcesPath:', process.resourcesPath || 'undefined');
console.log('__dirname:', __dirname);
console.log('');

console.log('Production path:', resourcesPath || 'N/A');
console.log('Production exists:', resourcesPath ? fs.existsSync(resourcesPath) : 'N/A');
console.log('');

console.log('Development path:', devPath);
console.log('Development exists:', fs.existsSync(devPath));
console.log('');

// Check what path would be selected
let selectedPath;
if (resourcesPath && fs.existsSync(resourcesPath)) {
  selectedPath = resourcesPath;
  console.log('Selected: Production path');
} else if (fs.existsSync(devPath)) {
  selectedPath = devPath;
  console.log('Selected: Development path');
} else {
  console.log('Selected: NONE - Error would occur');
}

console.log('Final path:', selectedPath || 'ERROR');

// List services directory contents if it exists
const servicesDir = resourcesPath ? path.dirname(resourcesPath) : path.join(__dirname, 'services');
if (fs.existsSync(servicesDir)) {
  console.log('');
  console.log('Services directory contents:');
  const files = fs.readdirSync(servicesDir);
  files.forEach(file => {
    console.log('  -', file);
  });
} else {
  console.log('');
  console.log('Services directory not found:', servicesDir);
}
