#!/usr/bin/env node

const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const os = require('os');

class VolumeDebugger {
  constructor() {
    this.docker = new Docker();
    this.appDataPath = path.join(os.homedir(), '.angela');
    this.pythonBackendDataPath = path.join(this.appDataPath, 'python_backend_data');
  }

  async debugVolumeMounting() {
    console.log('🔍 Debugging angela Python Backend Volume Mounting\n');
    
    // 1. Check host directory structure
    await this.checkHostDirectories();
    
    // 2. Check container existence and configuration
    await this.checkContainerConfiguration();
    
    // 3. Check container volume mounts
    await this.checkContainerVolumeMounts();
    
    // 4. Verify file permissions
    await this.checkFilePermissions();
    
    // 5. Check container logs
    await this.checkContainerLogs();
    
    // 6. Test container file system access
    await this.testContainerFileAccess();
    
    console.log('\n🏁 Volume mounting diagnostic complete!');
  }

  async checkHostDirectories() {
    console.log('📁 Checking Host Directory Structure:');
    console.log('=====================================');
    
    const directories = [
      this.appDataPath,
      this.pythonBackendDataPath,
      path.join(this.pythonBackendDataPath, '.angela'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage', 'metadata'),
    ];

    const files = [
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage', 'metadata', 'notebooks.json'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage', 'metadata', 'documents.json'),
    ];

    directories.forEach(dir => {
      const exists = fs.existsSync(dir);
      console.log(`  ${exists ? '✅' : '❌'} ${dir} ${exists ? '(exists)' : '(missing)'}`);
      
      if (exists) {
        const stats = fs.statSync(dir);
        console.log(`      Permissions: ${stats.mode.toString(8)} | Owner: ${stats.uid}:${stats.gid}`);
      }
    });

    console.log('\n📄 Checking Metadata Files:');
    files.forEach(file => {
      const exists = fs.existsSync(file);
      console.log(`  ${exists ? '✅' : '❌'} ${file} ${exists ? '(exists)' : '(missing)'}`);
      
      if (exists) {
        const stats = fs.statSync(file);
        const content = fs.readFileSync(file, 'utf8');
        console.log(`      Size: ${stats.size} bytes | Content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
      }
    });
    console.log('');
  }

  async checkContainerConfiguration() {
    console.log('🐳 Checking Container Configuration:');
    console.log('===================================');
    
    try {
      const container = this.docker.getContainer('angela_python');
      const containerInfo = await container.inspect();
      
      console.log(`  ✅ Container exists: ${containerInfo.Name}`);
      console.log(`  📊 State: ${containerInfo.State.Status} (Running: ${containerInfo.State.Running})`);
      console.log(`  🖼️  Image: ${containerInfo.Config.Image}`);
      console.log(`  🔄 Restart Count: ${containerInfo.RestartCount}`);
      
      // Check mounts
      console.log('\n  📂 Configured Mounts:');
      containerInfo.Mounts.forEach((mount, index) => {
        console.log(`    ${index + 1}. Type: ${mount.Type}`);
        console.log(`       Source: ${mount.Source}`);
        console.log(`       Destination: ${mount.Destination}`);
        console.log(`       Mode: ${mount.Mode || 'default'}`);
        console.log(`       RW: ${mount.RW}`);
        console.log('');
      });

    } catch (error) {
      console.log(`  ❌ Container not found or error: ${error.message}`);
    }
    console.log('');
  }

  async checkContainerVolumeMounts() {
    console.log('🔗 Checking Container Volume Mounts:');
    console.log('===================================');
    
    try {
      const container = this.docker.getContainer('angela_python');
      const containerInfo = await container.inspect();
      
      // Look for our specific mount
      const angelaMounts = containerInfo.Mounts.filter(mount => 
        mount.Destination === '/home/angela' || 
        mount.Source.includes('python_backend_data')
      );

      if (angelaMounts.length === 0) {
        console.log('  ❌ No angela home directory mount found!');
        console.log('  🚨 ISSUE DETECTED: python_backend_data is not mounted to /home/angela');
      } else {
        angelaMounts.forEach(mount => {
          console.log(`  ✅ Found angela mount:`);
          console.log(`      Source: ${mount.Source}`);
          console.log(`      Destination: ${mount.Destination}`);
          console.log(`      Type: ${mount.Type}`);
          console.log(`      RW: ${mount.RW}`);
          
          // Verify source exists
          const sourceExists = fs.existsSync(mount.Source);
          console.log(`      Source exists on host: ${sourceExists ? '✅' : '❌'}`);
        });
      }

    } catch (error) {
      console.log(`  ❌ Error checking mounts: ${error.message}`);
    }
    console.log('');
  }

  async checkFilePermissions() {
    console.log('🔐 Checking File Permissions:');
    console.log('=============================');
    
    const importantPaths = [
      this.pythonBackendDataPath,
      path.join(this.pythonBackendDataPath, '.angela'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage', 'metadata'),
    ];

    importantPaths.forEach(dir => {
      if (fs.existsSync(dir)) {
        const stats = fs.statSync(dir);
        const mode = stats.mode.toString(8);
        const readable = fs.constants.R_OK;
        const writable = fs.constants.W_OK;
        
        try {
          fs.accessSync(dir, readable | writable);
          console.log(`  ✅ ${dir} - Mode: ${mode} (readable & writable)`);
        } catch (error) {
          console.log(`  ❌ ${dir} - Mode: ${mode} (permission error: ${error.code})`);
        }
      } else {
        console.log(`  ❌ ${dir} - Does not exist`);
      }
    });
    console.log('');
  }

  async checkContainerLogs() {
    console.log('📜 Checking Container Logs (last 50 lines):');
    console.log('===========================================');
    
    try {
      const container = this.docker.getContainer('angela_python');
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 50,
        timestamps: true
      });
      
      const logText = logs.toString();
      console.log(logText);
      
    } catch (error) {
      console.log(`  ❌ Error getting logs: ${error.message}`);
    }
    console.log('');
  }

  async testContainerFileAccess() {
    console.log('🧪 Testing Container File System Access:');
    console.log('=======================================');
    
    try {
      const container = this.docker.getContainer('angela_python');
      
      // Test if the container can see the mounted files
      const commands = [
        'ls -la /home/angela',
        'ls -la /home/angela/.angela',
        'ls -la /home/angela/.angela/lightrag_storage',
        'ls -la /home/angela/.angela/lightrag_storage/metadata',
        'cat /home/angela/.angela/lightrag_storage/metadata/notebooks.json',
        'cat /home/angela/.angela/lightrag_storage/metadata/documents.json',
        'whoami',
        'id',
        'pwd'
      ];

      for (const command of commands) {
        try {
          console.log(`\n  🔧 Running: ${command}`);
          const exec = await container.exec({
            Cmd: ['sh', '-c', command],
            AttachStdout: true,
            AttachStderr: true
          });
          
          const stream = await exec.start();
          const result = await this.streamToString(stream);
          console.log(`    📤 Output: ${result.trim()}`);
          
        } catch (error) {
          console.log(`    ❌ Error: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`  ❌ Container access error: ${error.message}`);
    }
    console.log('');
  }

  async streamToString(stream) {
    return new Promise((resolve, reject) => {
      let data = '';
      stream.on('data', chunk => {
        data += chunk.toString();
      });
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    });
  }

  async fixVolumeMounting() {
    console.log('🔧 Attempting to Fix Volume Mounting Issues:');
    console.log('============================================');
    
    try {
      // 1. Stop the container
      console.log('  1️⃣ Stopping container...');
      const container = this.docker.getContainer('angela_python');
      await container.stop();
      console.log('    ✅ Container stopped');
      
      // 2. Remove the container  
      console.log('  2️⃣ Removing container...');
      await container.remove({ force: true });
      console.log('    ✅ Container removed');
      
      // 3. Ensure directories exist
      console.log('  3️⃣ Ensuring directories exist...');
      await this.ensureDirectoryStructure();
      console.log('    ✅ Directories verified');
      
      // 4. Restart using Docker setup
      console.log('  4️⃣ Restarting container with proper volume mounting...');
      console.log('    ℹ️  Please restart angela to recreate the container with proper volumes');
      
    } catch (error) {
      console.log(`  ❌ Fix attempt failed: ${error.message}`);
    }
  }

  async ensureDirectoryStructure() {
    const directories = [
      this.pythonBackendDataPath,
      path.join(this.pythonBackendDataPath, '.angela'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage'),
      path.join(this.pythonBackendDataPath, '.angela', 'lightrag_storage', 'metadata'),
      path.join(this.pythonBackendDataPath, '.cache'),
      path.join(this.pythonBackendDataPath, 'uploads'),
      path.join(this.pythonBackendDataPath, 'temp')
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`    ✅ Created: ${dir}`);
      }
    });

    // Create metadata files
    const metadataFiles = [
      { file: '.angela/lightrag_storage/metadata/notebooks.json', content: '{}' },
      { file: '.angela/lightrag_storage/metadata/documents.json', content: '{}' }
    ];

    metadataFiles.forEach(({ file, content }) => {
      const filePath = path.join(this.pythonBackendDataPath, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`    ✅ Created: ${file}`);
      }
    });
  }
}

// Run the debugger
async function main() {
  const debugger = new VolumeDebugger();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--fix')) {
    await debugger.fixVolumeMounting();
  } else {
    await debugger.debugVolumeMounting();
    
    console.log('\n💡 Suggestions:');
    console.log('==============');
    console.log('1. If the python_backend_data mount is missing, run: node debug-volume-mounting.cjs --fix');
    console.log('2. If files are missing, the container will recreate them on next startup');
    console.log('3. If permissions are wrong, check that angela has read/write access to ~/.angela/');
    console.log('4. Make sure Docker has permission to access the ~/.angela directory');
  }
}

main().catch(console.error); 
