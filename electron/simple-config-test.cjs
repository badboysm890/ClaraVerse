const os = require('os');
const path = require('path');

// Mock dependencies
global.log = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

global.app = {
  getPath: (name) => {
    if (name === 'userData') {
      return path.join(os.homedir(), '.angela-test');
    }
    return os.homedir();
  }
};

console.log('🧪 Testing Enhanced GPU Detection Configuration');
console.log('Platform:', os.platform(), os.arch());
console.log('');

async function testConfig() {
  try {
    // Test the basic flow without full service initialization
    console.log('1. Testing legacy binary path detection...');
    
    // Import after setting up mocks
    const LlamaSwapService = require('./llamaSwapService.cjs');
    const service = new LlamaSwapService();
    
    // Test legacy paths first
    const legacyPaths = service.getLegacyBinaryPaths();
    console.log('   Legacy llama-swap:', legacyPaths.llamaSwap);
    console.log('   Legacy llama-server:', legacyPaths.llamaServer);
    
    if (os.platform() === 'win32') {
      console.log('\n2. Testing enhanced GPU detection...');
      
      try {
        const gpuInfo = await service.getEnhancedWindowsGPUInfo();
        console.log('   Best Accelerator:', gpuInfo.bestAccelerator.toUpperCase());
        console.log('   GPU Count:', gpuInfo.gpus.length);
        console.log('   CUDA GPUs:', gpuInfo.cudaGpuCount);
        console.log('   ROCm GPUs:', gpuInfo.rocmGpuCount);
        console.log('   Vulkan GPUs:', gpuInfo.vulkanGpuCount);
        
        console.log('\n3. Testing enhanced binary paths...');
        const enhancedPaths = await service.getEnhancedLegacyBinaryPaths();
        console.log('   Enhanced llama-swap:', enhancedPaths.llamaSwap);
        console.log('   Enhanced llama-server:', enhancedPaths.llamaServer);
        
        if (service.selectedPlatformInfo) {
          console.log('\n4. Selected Platform Info:');
          console.log('   Platform Directory:', service.selectedPlatformInfo.platformDir);
          console.log('   Accelerator:', service.selectedPlatformInfo.accelerator.toUpperCase());
        }
        
      } catch (enhancedError) {
        console.log('   Enhanced detection failed:', enhancedError.message);
        console.log('   This is expected if no base binaries exist yet');
      }
    } else {
      console.log('\n2. Enhanced detection only available on Windows currently');
    }
    
    console.log('\n✅ Basic configuration path detection test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testConfig(); 
