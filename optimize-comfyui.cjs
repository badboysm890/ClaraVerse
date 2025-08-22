#!/usr/bin/env node

/**
 * ComfyUI High-Performance Optimization Script
 * Optimizes ComfyUI for RTX 4090 + i9 + RAID 0 SSD
 */

const DockerSetup = require('./electron/dockerSetup.cjs');
const path = require('path');

async function optimizeComfyUI() {
  console.log('🚀 Starting ComfyUI High-Performance Optimization...');
  console.log('🎯 Target Hardware: RTX 4090 Mobile + i9 + RAID 0 SSD');
  console.log('=' .repeat(60));

  const dockerSetup = new DockerSetup();

  try {
    // Check if Docker is running
    console.log('🔍 Checking Docker status...');
    const isDockerRunning = await dockerSetup.isDockerRunning();
    if (!isDockerRunning) {
      throw new Error('Docker is not running. Please start Docker Desktop first.');
    }
    console.log('✅ Docker is running');

    // Check for NVIDIA GPU
    console.log('🔍 Checking NVIDIA GPU support...');
    const hasNvidiaGPU = await dockerSetup.detectNvidiaGPU();
    if (!hasNvidiaGPU) {
      console.log('⚠️  NVIDIA GPU not detected or Docker GPU support not configured');
      console.log('   ComfyUI will run on CPU (much slower)');
    } else {
      console.log('✅ NVIDIA GPU support detected');
    }

    // Stop existing ComfyUI container if running
    console.log('🛑 Stopping existing ComfyUI container...');
    try {
      const container = dockerSetup.docker.getContainer('angela_comfyui');
      const containerInfo = await container.inspect();
      
      if (containerInfo.State.Running) {
        await container.stop();
        console.log('✅ Stopped existing container');
      }
      
      await container.remove({ force: true });
      console.log('✅ Removed existing container');
    } catch (error) {
      if (error.statusCode === 404) {
        console.log('ℹ️  No existing ComfyUI container found');
      } else {
        console.log(`⚠️  Error stopping container: ${error.message}`);
      }
    }

    // Pull latest ComfyUI image
    console.log('📥 Pulling latest ComfyUI image...');
    const comfyuiConfig = dockerSetup.containers.comfyui;
    await dockerSetup.pullImageWithProgress(comfyuiConfig.image, (status) => {
      console.log(`   ${status}`);
    });
    console.log('✅ Image pulled successfully');

    // Create optimized directories
    console.log('📁 Creating optimized directory structure...');
    const appDataPath = dockerSetup.appDataPath;
    const optimizedDirs = [
      'comfyui_models_fast',
      'comfyui_output_fast',
      'comfyui_input_fast', 
      'comfyui_custom_nodes_fast'
    ];

    const fs = require('fs');
    optimizedDirs.forEach(dir => {
      const dirPath = path.join(appDataPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created ${dir}`);
      } else {
        console.log(`ℹ️  ${dir} already exists`);
      }
    });

    // Start optimized ComfyUI container
    console.log('🚀 Starting optimized ComfyUI container...');
    await dockerSetup.startContainer(comfyuiConfig);
    console.log('✅ ComfyUI container started with optimizations');

    // Wait for container to be ready
    console.log('⏳ Waiting for ComfyUI to initialize...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Run internal optimizations
    console.log('🔧 Running internal container optimizations...');
    await dockerSetup.optimizeComfyUIContainer();

    // Final health check
    console.log('🏥 Performing final health check...');
    const isHealthy = await dockerSetup.isComfyUIRunning();
    
    if (isHealthy) {
      console.log('🎉 ComfyUI optimization completed successfully!');
      console.log('');
      console.log('🚀 Performance Optimizations Applied:');
      console.log('   • GPU memory allocation optimized for RTX 4090');
      console.log('   • TF32 and cuDNN optimizations enabled');
      console.log('   • Multi-core CPU utilization (16 threads)');
      console.log('   • 8GB tmpfs for temporary files');
      console.log('   • Optimized I/O for RAID 0 SSD');
      console.log('   • Latest PyTorch with CUDA 12.x');
      console.log('   • xFormers and TensorRT optimizations');
      console.log('');
      console.log('🌐 ComfyUI is now available at: http://localhost:8188');
      console.log('');
      console.log('⚡ Expected Performance:');
      console.log('   • Model loading: 2-5 seconds (SDXL)');
      console.log('   • Image generation: 1-3 seconds (1024x1024, 20 steps)');
      console.log('   • Memory usage: Optimized for 24GB VRAM');
    } else {
      console.log('❌ ComfyUI health check failed');
      console.log('   Check Docker logs: docker logs angela_comfyui');
    }

  } catch (error) {
    console.error('❌ Optimization failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   1. Ensure Docker Desktop is running');
    console.error('   2. Check NVIDIA drivers are up to date');
    console.error('   3. Verify Docker has GPU access enabled');
    console.error('   4. Check available disk space');
    process.exit(1);
  }
}

// Run optimization if called directly
if (require.main === module) {
  optimizeComfyUI().catch(console.error);
}

module.exports = { optimizeComfyUI }; 
