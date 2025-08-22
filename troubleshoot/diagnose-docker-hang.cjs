#!/usr/bin/env node

/**
 * angela Docker Startup Diagnostic Tool
 * 
 * This script helps diagnose and resolve Docker startup hang issues.
 * Run this when angela gets stuck after "Update check complete" message.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class DockerDiagnostic {
  constructor() {
    this.issues = [];
    this.suggestions = [];
  }

  async run() {
    console.log('🔍 angela Docker Startup Diagnostic Tool');
    console.log('=====================================\n');

    try {
      await this.checkDockerStatus();
      await this.checkDockerImages();
      await this.checkRunningContainers();
      await this.checkDockerResources();
      await this.checkNetworkConnectivity();
      await this.checkDockerLogs();
      
      this.printSummary();
      this.provideSolutions();
      
    } catch (error) {
      console.error('❌ Diagnostic failed:', error.message);
    }
  }

  async checkDockerStatus() {
    console.log('🐳 Checking Docker Status...');
    
    try {
      const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"');
      console.log(`✅ Docker is running (version: ${stdout.trim()})`);
    } catch (error) {
      this.issues.push('Docker is not running or not accessible');
      this.suggestions.push('Start Docker Desktop and ensure it\'s fully initialized');
      console.log('❌ Docker is not running or not accessible');
      return;
    }

    try {
      const { stdout } = await execAsync('docker system df');
      console.log('✅ Docker system is responsive');
    } catch (error) {
      this.issues.push('Docker system is unresponsive');
      this.suggestions.push('Restart Docker Desktop');
      console.log('❌ Docker system is unresponsive');
    }
  }

  async checkDockerImages() {
    console.log('\n📦 Checking angela Docker Images...');
    
    const angelaImages = [
      'angela17verse/angela-backend',
      'angela17verse/angela-comfyui',
      'n8nio/n8n'
    ];

    for (const imageName of angelaImages) {
      try {
        const { stdout } = await execAsync(`docker images ${imageName} --format "{{.Repository}}:{{.Tag}} {{.Size}}"`);
        if (stdout.trim()) {
          console.log(`✅ ${imageName}: ${stdout.trim()}`);
        } else {
          console.log(`⚠️  ${imageName}: Not found locally`);
        }
      } catch (error) {
        console.log(`❌ Error checking ${imageName}:`, error.message);
      }
    }
  }

  async checkRunningContainers() {
    console.log('\n🔄 Checking Running angela Containers...');
    
    const angelaContainers = ['angela_python', 'angela_comfyui', 'angela_n8n'];
    
    try {
      const { stdout } = await execAsync('docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"');
      const runningContainers = stdout.trim().split('\n').filter(line => line.trim());
      
      for (const containerName of angelaContainers) {
        const found = runningContainers.find(line => line.includes(containerName));
        if (found) {
          console.log(`✅ ${containerName}: ${found}`);
        } else {
          console.log(`❌ ${containerName}: Not running`);
        }
      }

      // Check for stuck containers
      const { stdout: stuckCheck } = await execAsync('docker ps -a --filter "status=created" --filter "status=restarting" --format "{{.Names}} {{.Status}}"');
      if (stuckCheck.trim()) {
        console.log('\n⚠️  Potentially stuck containers:');
        console.log(stuckCheck);
        this.issues.push('Found containers in stuck states');
        this.suggestions.push('Remove stuck containers: docker rm -f $(docker ps -aq --filter "status=created" --filter "status=restarting")');
      }
      
    } catch (error) {
      console.log('❌ Error checking containers:', error.message);
    }
  }

  async checkDockerResources() {
    console.log('\n💾 Checking Docker Resources...');
    
    try {
      const { stdout } = await execAsync('docker system df');
      console.log('Docker disk usage:');
      console.log(stdout);
      
      // Check for low disk space
      if (stdout.includes('0B') || stdout.includes('100%')) {
        this.issues.push('Docker may be low on disk space');
        this.suggestions.push('Clean up Docker: docker system prune -af');
      }
      
    } catch (error) {
      console.log('❌ Error checking Docker resources:', error.message);
    }
  }

  async checkNetworkConnectivity() {
    console.log('\n🌐 Checking Network Connectivity...');
    
    // Test Docker Hub connectivity
    try {
      const { stdout } = await execAsync('docker pull hello-world:latest', { timeout: 30000 });
      console.log('✅ Docker Hub connectivity is working');
      
      // Clean up test image
      await execAsync('docker rmi hello-world:latest').catch(() => {});
    } catch (error) {
      this.issues.push('Network connectivity to Docker Hub may be limited');
      this.suggestions.push('Check your internet connection and firewall settings');
      console.log('❌ Docker Hub connectivity test failed');
    }
  }

  async checkDockerLogs() {
    console.log('\n📋 Checking angela Container Logs...');
    
    const angelaContainers = ['angela_python', 'angela_comfyui', 'angela_n8n'];
    
    for (const containerName of angelaContainers) {
      try {
        const { stdout } = await execAsync(`docker logs ${containerName} --tail 10`, { timeout: 5000 });
        if (stdout.trim()) {
          console.log(`📋 Last 10 lines from ${containerName}:`);
          console.log(stdout.trim());
          console.log('---');
        }
      } catch (error) {
        if (!error.message.includes('No such container')) {
          console.log(`❌ Error getting logs for ${containerName}:`, error.message);
        }
      }
    }
  }

  printSummary() {
    console.log('\n📊 DIAGNOSTIC SUMMARY');
    console.log('====================');
    
    if (this.issues.length === 0) {
      console.log('✅ No obvious issues detected');
      console.log('   The hang may be due to:');
      console.log('   • Slow network connection during image pulls');
      console.log('   • High system load affecting Docker performance');
      console.log('   • Temporary Docker daemon issues');
    } else {
      console.log('❌ Issues detected:');
      this.issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
    }
  }

  provideSolutions() {
    console.log('\n💡 RECOMMENDED SOLUTIONS');
    console.log('========================');
    
    if (this.suggestions.length > 0) {
      console.log('Specific fixes for detected issues:');
      this.suggestions.forEach((suggestion, i) => {
        console.log(`   ${i + 1}. ${suggestion}`);
      });
      console.log('');
    }
    
    console.log('General troubleshooting steps:');
    console.log('   1. Restart Docker Desktop completely');
    console.log('   2. Clear Docker cache: docker system prune -af');
    console.log('   3. Restart angela application');
    console.log('   4. If still stuck, check angela logs in console');
    console.log('   5. Try running angela with: DEBUG=1 npm start');
    
    console.log('\n🔧 Emergency Recovery Commands:');
    console.log('   # Stop all angela containers');
    console.log('   docker stop angela_python angela_comfyui angela_n8n 2>/dev/null || true');
    console.log('   ');
    console.log('   # Remove all angela containers');
    console.log('   docker rm -f angela_python angela_comfyui angela_n8n 2>/dev/null || true');
    console.log('   ');
    console.log('   # Clean up angela network');
    console.log('   docker network rm angela_network 2>/dev/null || true');
    console.log('   ');
    console.log('   # Full Docker cleanup (use with caution)');
    console.log('   docker system prune -af --volumes');
  }
}

// Run diagnostic if called directly
if (require.main === module) {
  const diagnostic = new DockerDiagnostic();
  diagnostic.run().catch(error => {
    console.error('Diagnostic tool failed:', error);
    process.exit(1);
  });
}

module.exports = DockerDiagnostic; 
