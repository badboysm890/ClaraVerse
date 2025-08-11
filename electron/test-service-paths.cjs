const path = require('path');
const fs = require('fs');

/**
 * Test script to verify the service path resolution logic
 * This simulates both development and production environments
 */

console.log('=== Service Path Test ===\n');

function testServicePath(simulateProduction = false) {
  const binaryName = 'llama-optimizer-windows.exe';
  
  // Simulate production environment
  const originalResourcesPath = process.resourcesPath;
  if (simulateProduction) {
    // Simulate production path
    process.resourcesPath = 'C:\\Users\\Admin\\AppData\\Local\\Programs\\Clara\\resources';
  } else {
    // Ensure we're in development mode
    delete process.resourcesPath;
  }
  
  console.log(`Environment: ${simulateProduction ? 'Production (simulated)' : 'Development'}`);
  console.log(`process.resourcesPath: ${process.resourcesPath || 'undefined'}`);
  
  // Apply the same logic as in llamaSwapService.cjs
  let binaryPath;
  const resourcesPath = process.resourcesPath 
    ? path.join(process.resourcesPath, 'electron', 'services', binaryName)
    : null;
  
  const devPath = path.join(__dirname, 'services', binaryName);
  
  // Check which path exists
  if (resourcesPath && fs.existsSync(resourcesPath)) {
    binaryPath = resourcesPath;
    console.log('Selected: Production path');
  } else if (fs.existsSync(devPath)) {
    binaryPath = devPath;
    console.log('Selected: Development path');
  } else {
    console.log('Selected: NONE - Error would occur');
    console.log(`Tried paths:`);
    console.log(`  Production: ${resourcesPath || 'N/A'}`);
    console.log(`  Development: ${devPath}`);
  }
  
  console.log(`Final path: ${binaryPath || 'ERROR'}`);
  console.log(`Path exists: ${binaryPath ? fs.existsSync(binaryPath) : 'N/A'}`);
  
  // Restore original
  if (originalResourcesPath) {
    process.resourcesPath = originalResourcesPath;
  } else {
    delete process.resourcesPath;
  }
  
  console.log('');
  return binaryPath;
}

// Test development environment
testServicePath(false);

// Test production environment (simulated)
testServicePath(true);
