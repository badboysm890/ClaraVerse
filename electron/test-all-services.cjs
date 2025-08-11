const path = require('path');
const fs = require('fs');

/**
 * Comprehensive test for all service path resolutions
 */

console.log('=== Comprehensive Service Path Test ===\n');

function testAllServices(simulateProduction = false) {
  console.log(`Environment: ${simulateProduction ? 'Production (simulated)' : 'Development'}`);
  
  // Simulate production environment
  const originalResourcesPath = process.resourcesPath;
  if (simulateProduction) {
    process.resourcesPath = 'C:\\Users\\Admin\\AppData\\Local\\Programs\\Clara\\resources';
  } else {
    delete process.resourcesPath;
  }
  
  const services = [
    {
      name: 'LLama Optimizer',
      binary: 'llama-optimizer-windows.exe',
      service: 'llamaSwapService'
    },
    {
      name: 'MCP Server',
      binary: 'python-mcp-server-windows.exe',
      service: 'mcpService'
    },
    {
      name: 'Widget Service',
      binary: 'widgets-service-windows.exe',
      service: 'widgetService'
    }
  ];
  
  let allSuccess = true;
  
  services.forEach(service => {
    console.log(`\n--- ${service.name} ---`);
    
    // Production path
    const resourcesPath = process.resourcesPath 
      ? path.join(process.resourcesPath, 'electron', 'services', service.binary)
      : null;
    
    // Development path
    const devPath = path.join(__dirname, 'services', service.binary);
    
    let selectedPath;
    if (resourcesPath && fs.existsSync(resourcesPath)) {
      selectedPath = resourcesPath;
      console.log('✅ Production path found');
    } else if (fs.existsSync(devPath)) {
      selectedPath = devPath;
      console.log('✅ Development path found');
    } else {
      console.log('❌ No valid path found');
      console.log(`   Tried: ${resourcesPath || 'N/A'}`);
      console.log(`   Tried: ${devPath}`);
      allSuccess = false;
    }
    
    if (selectedPath) {
      console.log(`   Path: ${selectedPath}`);
    }
  });
  
  console.log(`\n${simulateProduction ? 'Production' : 'Development'} Result: ${allSuccess ? '✅ All services OK' : '❌ Some services failed'}`);
  
  // Restore original
  if (originalResourcesPath) {
    process.resourcesPath = originalResourcesPath;
  } else {
    delete process.resourcesPath;
  }
  
  return allSuccess;
}

// Test both environments
const devSuccess = testAllServices(false);
console.log('\n' + '='.repeat(50) + '\n');
const prodSuccess = testAllServices(true);

console.log('\n=== SUMMARY ===');
console.log(`Development: ${devSuccess ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Production:  ${prodSuccess ? '✅ PASS' : '❌ FAIL'}`);

if (devSuccess && prodSuccess) {
  console.log('\n🎉 All services should work correctly in both environments!');
} else {
  console.log('\n⚠️  Some services may have path resolution issues.');
}
