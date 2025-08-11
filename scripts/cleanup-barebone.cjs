const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Cleanup script for barebone Windows build
 * This script restores the original package.json configuration after build
 */

console.log('Cleaning up after barebone build...');

// Read the original package.json structure
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Reset to default configuration
exec('node scripts/build-config.cjs full', (error, stdout, stderr) => {
  if (error) {
    console.error('Error resetting build configuration:', error);
    return;
  }
  
  console.log('Build configuration reset to default (full)');
  console.log(stdout);
});

console.log('Cleanup completed.');
