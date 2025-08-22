const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const log = require('electron-log');
const yaml = require('js-yaml');
const { app } = require('electron');

/**
 * Platform Manager for handling cross-platform binary distribution
 * Supports both pre-built binaries and just-in-time compilation
 * Now includes comprehensive system resource validation
 */
class PlatformManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.platformInfo = this.detectPlatformInfo();
    this.supportedPlatforms = this.getSupportedPlatforms();
    
    // System resources configuration
    this.systemResourcesConfigPath = path.join(app.getPath('userData'), 'angela-system-config.yaml');
    this.systemRequirements = {
      minimum: {
        ramGB: 8,
        cpuCores: 4,
        diskSpaceGB: 10
      },
      recommended: {
        ramGB: 16,
        cpuCores: 8,
        diskSpaceGB: 50
      }
    };
    
    // OS version requirements
    this.osRequirements = {
      linux: {
        minimumKernel: '4.4.0',
        recommendedKernel: '5.4.0',
        description: 'Linux Kernel 4.4+ (Ubuntu 16.04+, CentOS 7+, RHEL 7+)'
      },
      darwin: {
        minimumVersion: '20.0.0', // macOS Big Sur 11.0
        recommendedVersion: '21.0.0', // macOS Monterey 12.0
        description: 'macOS Big Sur 11.0 or later'
      },
      win32: {
        minimumBuild: 19041, // Windows 10 Build 19041 (2004 May 2020 Update)
        recommendedBuild: 22000, // Windows 11
        description: 'Windows 10 Build 19041+ (May 2020 Update) or Windows 11'
      }
    };
    
    this.systemResourcesInfo = null;
    this.osCompatibilityInfo = null;
  }

  detectPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    
    return {
      platform,
      arch,
      platformDir: this.getPlatformDirectory(platform, arch),
      isWindows: platform === 'win32',
      isMac: platform === 'darwin',
      isLinux: platform === 'linux',
      osRelease: os.release(),
      osType: os.type()
    };
  }

  /**
   * Comprehensive OS version validation
   * Checks if the current OS version meets minimum requirements
   */
  async validateOSCompatibility() {
    log.info('🔍 Starting OS version compatibility validation...');
    
    try {
      const osInfo = await this.getDetailedOSInfo();
      const compatibility = this.evaluateOSCompatibility(osInfo);
      
      log.info('✅ OS compatibility validation completed');
      log.info(`🖥️  OS: ${osInfo.displayName}`);
      log.info(`📊 Version: ${osInfo.version}`);
      log.info(`✅ Compatible: ${compatibility.isSupported ? 'Yes' : 'No'}`);
      
      if (!compatibility.isSupported) {
        log.error('❌ OS version not supported!');
        compatibility.issues.forEach(issue => log.error(`  • ${issue}`));
      }
      
      return compatibility;
    } catch (error) {
      log.error('❌ OS compatibility validation failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed OS information including version detection
   */
  async getDetailedOSInfo() {
    const platform = this.platformInfo.platform;
    
    let osInfo = {
      platform,
      arch: this.platformInfo.arch,
      type: this.platformInfo.osType,
      release: this.platformInfo.osRelease,
      version: 'Unknown',
      displayName: 'Unknown OS',
      buildNumber: null,
      kernelVersion: null,
      codeName: null
    };

    try {
      switch (platform) {
        case 'linux':
          osInfo = await this.getLinuxOSInfo(osInfo);
          break;
        case 'darwin':
          osInfo = await this.getMacOSInfo(osInfo);
          break;
        case 'win32':
          osInfo = await this.getWindowsOSInfo(osInfo);
          break;
        default:
          osInfo.displayName = `Unsupported Platform: ${platform}`;
      }
    } catch (error) {
      log.warn('⚠️  Failed to get detailed OS info, using fallback:', error.message);
      osInfo.displayName = `${platform} ${osInfo.release}`;
      osInfo.version = osInfo.release;
    }

    this.osCompatibilityInfo = osInfo;
    return osInfo;
  }

  /**
   * Get detailed Linux OS information
   */
  async getLinuxOSInfo(baseInfo) {
    try {
      const { spawn } = require('child_process');
      
      // Get kernel version
      const kernelVersion = baseInfo.release;
      
      // Try to get distribution info
      let distributionInfo = await this.getLinuxDistributionInfo();
      
      return {
        ...baseInfo,
        kernelVersion,
        version: kernelVersion,
        displayName: distributionInfo.name || 'Linux',
        codeName: distributionInfo.codeName,
        distributionVersion: distributionInfo.version
      };
    } catch (error) {
      log.warn('⚠️  Failed to get Linux distribution info:', error.message);
      return {
        ...baseInfo,
        kernelVersion: baseInfo.release,
        version: baseInfo.release,
        displayName: `Linux ${baseInfo.release}`
      };
    }
  }

  /**
   * Get Linux distribution information
   */
  async getLinuxDistributionInfo() {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        // Try lsb_release first
        const lsbRelease = spawn('lsb_release', ['-a'], { stdio: 'pipe' });
        let output = '';
        
        lsbRelease.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        lsbRelease.on('close', (code) => {
          if (code === 0 && output) {
            const lines = output.split('\n');
            const info = {};
            
            lines.forEach(line => {
              if (line.includes('Distributor ID:')) {
                info.name = line.split(':')[1]?.trim();
              } else if (line.includes('Release:')) {
                info.version = line.split(':')[1]?.trim();
              } else if (line.includes('Codename:')) {
                info.codeName = line.split(':')[1]?.trim();
              }
            });
            
            if (info.name) {
              return resolve(info);
            }
          }
          
          // Fallback to /etc/os-release
          this.readOSReleaseFile().then(resolve).catch(() => resolve({}));
        });
        
        lsbRelease.on('error', () => {
          // Fallback to /etc/os-release
          this.readOSReleaseFile().then(resolve).catch(() => resolve({}));
        });
      });
    } catch (error) {
      return {};
    }
  }

  /**
   * Read /etc/os-release file
   */
  async readOSReleaseFile() {
    try {
      const content = await fs.readFile('/etc/os-release', 'utf8');
      const lines = content.split('\n');
      const info = {};
      
      lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          const cleanValue = value.replace(/['"]/g, '');
          if (key === 'NAME') info.name = cleanValue;
          if (key === 'VERSION') info.version = cleanValue;
          if (key === 'VERSION_CODENAME') info.codeName = cleanValue;
        }
      });
      
      return info;
    } catch (error) {
      return {};
    }
  }

  /**
   * Get detailed macOS information
   */
  async getMacOSInfo(baseInfo) {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const swVers = spawn('sw_vers', [], { stdio: 'pipe' });
        let output = '';
        
        swVers.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        swVers.on('close', (code) => {
          try {
            if (code === 0 && output) {
              const lines = output.split('\n');
              let productName = 'macOS';
              let productVersion = baseInfo.release;
              let buildVersion = null;
              
              lines.forEach(line => {
                if (line.includes('ProductName:')) {
                  productName = line.split(':')[1]?.trim() || productName;
                } else if (line.includes('ProductVersion:')) {
                  productVersion = line.split(':')[1]?.trim() || productVersion;
                } else if (line.includes('BuildVersion:')) {
                  buildVersion = line.split(':')[1]?.trim();
                }
              });
              
              return resolve({
                ...baseInfo,
                version: productVersion,
                displayName: `${productName} ${productVersion}`,
                buildNumber: buildVersion,
                codeName: this.getMacOSCodeName(productVersion)
              });
            }
          } catch (parseError) {
            log.warn('⚠️  Failed to parse macOS version info:', parseError.message);
          }
          
          // Fallback
          resolve({
            ...baseInfo,
            version: baseInfo.release,
            displayName: `macOS ${baseInfo.release}`
          });
        });
        
        swVers.on('error', () => {
          resolve({
            ...baseInfo,
            version: baseInfo.release,
            displayName: `macOS ${baseInfo.release}`
          });
        });
      });
    } catch (error) {
      return {
        ...baseInfo,
        version: baseInfo.release,
        displayName: `macOS ${baseInfo.release}`
      };
    }
  }

  /**
   * Get macOS code name from version
   */
  getMacOSCodeName(version) {
    const versionMap = {
      '14': 'Sonoma',
      '13': 'Ventura', 
      '12': 'Monterey',
      '11': 'Big Sur',
      '10.15': 'Catalina',
      '10.14': 'Mojave',
      '10.13': 'High Sierra',
      '10.12': 'Sierra'
    };
    
    const majorVersion = version.split('.')[0];
    return versionMap[majorVersion] || versionMap[version] || 'Unknown';
  }

  /**
   * Get detailed Windows OS information
   */
  async getWindowsOSInfo(baseInfo) {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        // Use PowerShell to get detailed Windows info
        const psCommand = `
          $os = Get-WmiObject -Class Win32_OperatingSystem;
          $version = [System.Environment]::OSVersion.Version;
          Write-Output "Caption: $($os.Caption)";
          Write-Output "Version: $($os.Version)";
          Write-Output "BuildNumber: $($os.BuildNumber)";
          Write-Output "OSArchitecture: $($os.OSArchitecture)";
          Write-Output "ServicePack: $($os.ServicePackMajorVersion).$($os.ServicePackMinorVersion)";
        `;
        
        const powershell = spawn('powershell', ['-Command', psCommand], { stdio: 'pipe' });
        let output = '';
        
        powershell.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        powershell.on('close', (code) => {
          try {
            if (code === 0 && output) {
              const lines = output.split('\n');
              let caption = 'Windows';
              let version = baseInfo.release;
              let buildNumber = null;
              
              lines.forEach(line => {
                if (line.includes('Caption:')) {
                  caption = line.split(':')[1]?.trim() || caption;
                } else if (line.includes('Version:')) {
                  version = line.split(':')[1]?.trim() || version;
                } else if (line.includes('BuildNumber:')) {
                  buildNumber = parseInt(line.split(':')[1]?.trim()) || null;
                }
              });
              
              return resolve({
                ...baseInfo,
                version,
                displayName: caption,
                buildNumber,
                codeName: this.getWindowsCodeName(buildNumber)
              });
            }
          } catch (parseError) {
            log.warn('⚠️  Failed to parse Windows version info:', parseError.message);
          }
          
          // Fallback
          resolve({
            ...baseInfo,
            version: baseInfo.release,
            displayName: `Windows ${baseInfo.release}`,
            buildNumber: this.extractWindowsBuildFromRelease(baseInfo.release)
          });
        });
        
        powershell.on('error', () => {
          resolve({
            ...baseInfo,
            version: baseInfo.release,
            displayName: `Windows ${baseInfo.release}`,
            buildNumber: this.extractWindowsBuildFromRelease(baseInfo.release)
          });
        });
      });
    } catch (error) {
      return {
        ...baseInfo,
        version: baseInfo.release,
        displayName: `Windows ${baseInfo.release}`,
        buildNumber: this.extractWindowsBuildFromRelease(baseInfo.release)
      };
    }
  }

  /**
   * Extract Windows build number from release string
   */
  extractWindowsBuildFromRelease(release) {
    // Windows release typically contains build number
    const match = release.match(/(\d{5,})/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Get Windows code name from build number
   */
  getWindowsCodeName(buildNumber) {
    if (!buildNumber) return 'Unknown';
    
    if (buildNumber >= 22000) return 'Windows 11';
    if (buildNumber >= 19041) return 'Windows 10 (2004+)';
    if (buildNumber >= 18363) return 'Windows 10 (1909)';
    if (buildNumber >= 18362) return 'Windows 10 (1903)';
    if (buildNumber >= 17763) return 'Windows 10 (1809)';
    if (buildNumber >= 17134) return 'Windows 10 (1803)';
    if (buildNumber >= 16299) return 'Windows 10 (1709)';
    if (buildNumber >= 15063) return 'Windows 10 (1703)';
    if (buildNumber >= 14393) return 'Windows 10 (1607)';
    if (buildNumber >= 10240) return 'Windows 10 (1507)';
    
    return 'Windows (Legacy)';
  }

  /**
   * Evaluate OS compatibility based on detected version
   */
  evaluateOSCompatibility(osInfo) {
    const platform = osInfo.platform;
    const requirements = this.osRequirements[platform];
    
    if (!requirements) {
      return {
        osInfo,
        isSupported: false,
        meetsMinimumRequirements: false,
        meetsRecommendedRequirements: false,
        issues: [`Unsupported platform: ${platform}`],
        warnings: [],
        recommendations: ['Please use a supported operating system'],
        upgradeInstructions: this.getUnsupportedPlatformInstructions(platform)
      };
    }

    const evaluation = {
      osInfo,
      isSupported: true,
      meetsMinimumRequirements: true,
      meetsRecommendedRequirements: true,
      issues: [],
      warnings: [],
      recommendations: [],
      upgradeInstructions: null
    };

    // Platform-specific compatibility checks
    switch (platform) {
      case 'linux':
        this.evaluateLinuxCompatibility(osInfo, requirements, evaluation);
        break;
      case 'darwin':
        this.evaluateMacOSCompatibility(osInfo, requirements, evaluation);
        break;
      case 'win32':
        this.evaluateWindowsCompatibility(osInfo, requirements, evaluation);
        break;
    }

    // Add upgrade instructions if not compatible
    if (!evaluation.isSupported) {
      evaluation.upgradeInstructions = this.getUpgradeInstructions(platform, osInfo);
    }

    return evaluation;
  }

  /**
   * Evaluate Linux kernel version compatibility
   */
  evaluateLinuxCompatibility(osInfo, requirements, evaluation) {
    const kernelVersion = osInfo.kernelVersion || osInfo.version;
    
    if (!this.compareVersions(kernelVersion, requirements.minimumKernel)) {
      evaluation.isSupported = false;
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(
        `Linux kernel ${kernelVersion} is below minimum required version ${requirements.minimumKernel}`
      );
    } else if (!this.compareVersions(kernelVersion, requirements.recommendedKernel)) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(
        `Linux kernel ${kernelVersion} is below recommended version ${requirements.recommendedKernel}`
      );
      evaluation.recommendations.push('Consider upgrading to a newer Linux distribution for optimal performance');
    }

    // Additional checks for specific distributions
    if (osInfo.displayName && osInfo.distributionVersion) {
      this.checkLinuxDistributionCompatibility(osInfo, evaluation);
    }
  }

  /**
   * Check specific Linux distribution compatibility
   */
  checkLinuxDistributionCompatibility(osInfo, evaluation) {
    const distName = osInfo.displayName.toLowerCase();
    const distVersion = osInfo.distributionVersion;
    
    const knownDistributions = {
      ubuntu: { minimum: '16.04', recommended: '20.04' },
      debian: { minimum: '9', recommended: '11' },
      centos: { minimum: '7', recommended: '8' },
      rhel: { minimum: '7', recommended: '8' },
      fedora: { minimum: '30', recommended: '35' },
      opensuse: { minimum: '15.0', recommended: '15.3' }
    };

    for (const [dist, versions] of Object.entries(knownDistributions)) {
      if (distName.includes(dist)) {
        if (!this.compareVersions(distVersion, versions.minimum)) {
          evaluation.warnings.push(
            `${osInfo.displayName} ${distVersion} may have compatibility issues. Minimum supported: ${versions.minimum}`
          );
        } else if (!this.compareVersions(distVersion, versions.recommended)) {
          evaluation.recommendations.push(
            `Consider upgrading to ${dist} ${versions.recommended}+ for best compatibility`
          );
        }
        break;
      }
    }
  }

  /**
   * Evaluate macOS version compatibility
   */
  evaluateMacOSCompatibility(osInfo, requirements, evaluation) {
    const version = osInfo.version;
    const darwinVersion = osInfo.release;
    
    // Check Darwin kernel version (more reliable)
    if (!this.compareVersions(darwinVersion, requirements.minimumVersion)) {
      evaluation.isSupported = false;
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(
        `macOS version ${version} (Darwin ${darwinVersion}) is below minimum required macOS Big Sur 11.0`
      );
    } else if (!this.compareVersions(darwinVersion, requirements.recommendedVersion)) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(
        `macOS ${version} is below recommended version. Consider upgrading to macOS Monterey 12.0+ for optimal performance`
      );
    }

    // Additional macOS-specific checks
    if (evaluation.isSupported) {
      this.checkMacOSSpecificFeatures(osInfo, evaluation);
    }
  }

  /**
   * Check macOS-specific features and compatibility
   */
  checkMacOSSpecificFeatures(osInfo, evaluation) {
    const majorVersion = parseInt(osInfo.version.split('.')[0]);
    
    if (majorVersion < 12) {
      evaluation.recommendations.push('macOS Monterey 12.0+ recommended for best Metal GPU acceleration support');
    }
    
    if (majorVersion < 13) {
      evaluation.recommendations.push('macOS Ventura 13.0+ recommended for latest security features');
    }
  }

  /**
   * Evaluate Windows version compatibility
   */
  evaluateWindowsCompatibility(osInfo, requirements, evaluation) {
    const buildNumber = osInfo.buildNumber;
    
    if (!buildNumber || buildNumber < requirements.minimumBuild) {
      evaluation.isSupported = false;
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(
        `Windows build ${buildNumber || 'unknown'} is below minimum required build ${requirements.minimumBuild} (Windows 10 May 2020 Update)`
      );
    } else if (buildNumber < requirements.recommendedBuild) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(
        `Windows build ${buildNumber} is below recommended build ${requirements.recommendedBuild} (Windows 11)`
      );
      evaluation.recommendations.push('Consider upgrading to Windows 11 for optimal performance and features');
    }

    // Additional Windows-specific checks
    if (evaluation.isSupported) {
      this.checkWindowsSpecificFeatures(osInfo, evaluation);
    }
  }

  /**
   * Check Windows-specific features
   */
  checkWindowsSpecificFeatures(osInfo, evaluation) {
    const buildNumber = osInfo.buildNumber;
    
    if (buildNumber && buildNumber < 19041) {
      evaluation.warnings.push('WSL2 support requires Windows 10 Build 19041+');
    }
    
    if (buildNumber && buildNumber < 22000) {
      evaluation.recommendations.push('Windows 11 provides better performance for AI workloads');
    }
  }

  /**
   * Compare version strings (returns true if version1 >= version2)
   */
  compareVersions(version1, version2) {
    if (!version1 || !version2) return false;
    
    const v1Parts = version1.split('.').map(x => parseInt(x) || 0);
    const v2Parts = version2.split('.').map(x => parseInt(x) || 0);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return true;
      if (v1Part < v2Part) return false;
    }
    
    return true; // Equal versions
  }

  /**
   * Get upgrade instructions for unsupported OS versions
   */
  getUpgradeInstructions(platform, osInfo) {
    switch (platform) {
      case 'linux':
        return {
          title: 'Linux Kernel Update Required',
          description: `Your Linux kernel version ${osInfo.kernelVersion || osInfo.version} is not supported.`,
          minimumRequired: this.osRequirements.linux.description,
          instructions: [
            'Update your Linux distribution to a newer version:',
            '• Ubuntu: Run "sudo apt update && sudo apt upgrade" then "sudo do-release-upgrade"',
            '• CentOS/RHEL: Upgrade to CentOS 8+ or RHEL 8+',
            '• Debian: Upgrade to Debian 11+ (Bullseye)',
            '• Fedora: Upgrade to Fedora 35+',
            '• Or install a modern Linux distribution with kernel 4.4+'
          ],
          downloadLinks: [
            { name: 'Ubuntu LTS', url: 'https://ubuntu.com/download' },
            { name: 'Debian', url: 'https://www.debian.org/distrib/' },
            { name: 'Fedora', url: 'https://getfedora.org/' }
          ]
        };
        
      case 'darwin':
        return {
          title: 'macOS Update Required',
          description: `Your macOS version ${osInfo.version} is not supported.`,
          minimumRequired: this.osRequirements.darwin.description,
          instructions: [
            'Update your macOS to Big Sur 11.0 or later:',
            '1. Click the Apple menu → About This Mac',
            '2. Click "Software Update" to check for updates',
            '3. Install macOS Big Sur, Monterey, Ventura, or Sonoma',
            '4. Restart your Mac after installation',
            '',
            'If Software Update doesn\'t show newer versions:',
            '• Your Mac might not be compatible with newer macOS versions',
            '• Check Apple\'s compatibility list for your Mac model'
          ],
          downloadLinks: [
            { name: 'macOS Compatibility', url: 'https://support.apple.com/en-us/HT201260' },
            { name: 'macOS Updates', url: 'https://support.apple.com/en-us/HT201541' }
          ]
        };
        
      case 'win32':
        return {
          title: 'Windows Update Required',
          description: `Your Windows version (build ${osInfo.buildNumber || 'unknown'}) is not supported.`,
          minimumRequired: this.osRequirements.win32.description,
          instructions: [
            'Update Windows to build 19041 or later:',
            '1. Press Win + I to open Settings',
            '2. Go to Update & Security → Windows Update',
            '3. Click "Check for updates"',
            '4. Install all available updates',
            '5. Restart your computer',
            '',
            'For Windows 11 (recommended):',
            '• Check if your PC meets Windows 11 requirements',
            '• Download Windows 11 from Microsoft if compatible'
          ],
          downloadLinks: [
            { name: 'Windows Update', url: 'https://support.microsoft.com/en-us/windows/update-windows-3c5ae7fc-9fb6-9af1-1984-b5e0412c556a' },
            { name: 'Windows 11', url: 'https://www.microsoft.com/software-download/windows11' },
            { name: 'PC Health Check', url: 'https://aka.ms/GetPCHealthCheckApp' }
          ]
        };
        
      default:
        return {
          title: 'Unsupported Operating System',
          description: `Platform ${platform} is not supported.`,
          minimumRequired: 'Supported platforms: Windows 10+, macOS Big Sur 11.0+, Linux Kernel 4.4+',
          instructions: [
            'Please use one of the supported operating systems:',
            '• Windows 10 Build 19041+ or Windows 11',
            '• macOS Big Sur 11.0 or later',
            '• Linux with kernel 4.4+ (Ubuntu 16.04+, CentOS 7+, etc.)'
          ],
          downloadLinks: []
        };
    }
  }

  /**
   * Get instructions for completely unsupported platforms
   */
  getUnsupportedPlatformInstructions(platform) {
    return {
      title: `Unsupported Platform: ${platform}`,
      description: `The platform ${platform} is not currently supported by angelaVerse.`,
      minimumRequired: 'Supported platforms: Windows, macOS, Linux',
      instructions: [
        'angelaVerse currently supports:',
        '• Windows 10+ (x64)',
        '• macOS Big Sur 11.0+ (Intel and Apple Silicon)',
        '• Linux x64 with kernel 4.4+ (Ubuntu, Debian, CentOS, RHEL, Fedora, etc.)',
        '',
        'Please use one of these supported platforms to run angelaVerse.'
      ],
      downloadLinks: [
        { name: 'Windows', url: 'https://www.microsoft.com/windows' },
        { name: 'macOS', url: 'https://www.apple.com/macos' },
        { name: 'Ubuntu Linux', url: 'https://ubuntu.com' }
      ]
    };
  }

  /**
   * Comprehensive system resource validation
   * Checks RAM, CPU cores, disk space, and OS compatibility
   */
  async validateSystemResources() {
    log.info('🔍 Starting comprehensive system resource validation...');
    
    try {
      // Validate system resources
      const systemInfo = await this.getSystemResourceInfo();
      const resourceValidation = this.evaluateSystemResources(systemInfo);
      
      // Validate OS compatibility
      const osCompatibility = await this.validateOSCompatibility();
      
      // Combine validations
      const combinedValidation = {
        ...resourceValidation,
        osCompatibility,
        overallCompatible: resourceValidation.isCompatible && osCompatibility.isSupported
      };
      
      // Save system configuration
      await this.saveSystemConfiguration(combinedValidation);
      
      log.info('✅ System resource validation completed');
      log.info(`💾 RAM: ${systemInfo.ramGB}GB (Required: ${this.systemRequirements.minimum.ramGB}GB)`);
      log.info(`🖥️  CPU Cores: ${systemInfo.cpuCores} (Required: ${this.systemRequirements.minimum.cpuCores})`);
      log.info(`💽 Available Disk Space: ${systemInfo.availableDiskSpaceGB}GB (Required: ${this.systemRequirements.minimum.diskSpaceGB}GB)`);
      log.info(`🎯 System Performance Mode: ${resourceValidation.performanceMode}`);
      log.info(`📱 OS Compatibility: ${osCompatibility.isSupported ? 'Supported' : 'Not Supported'}`);
      
      // Log OS compatibility issues
      if (!osCompatibility.isSupported) {
        log.error('❌ OS compatibility issues detected:');
        osCompatibility.issues.forEach(issue => log.error(`  • ${issue}`));
      }
      
      if (osCompatibility.warnings.length > 0) {
        log.warn('⚠️  OS compatibility warnings:');
        osCompatibility.warnings.forEach(warning => log.warn(`  • ${warning}`));
      }
      
      return combinedValidation;
    } catch (error) {
      log.error('❌ System resource validation failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system resource information
   */
  async getSystemResourceInfo() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Get disk space information
    const userDataPath = app.getPath('userData');
    const diskSpace = await this.getDiskSpace(userDataPath);
    
    const systemInfo = {
      // Memory information
      ramGB: Math.round(totalMemory / (1024 * 1024 * 1024)),
      freeRamGB: Math.round(freeMemory / (1024 * 1024 * 1024)),
      usedRamGB: Math.round((totalMemory - freeMemory) / (1024 * 1024 * 1024)),
      
      // CPU information
      cpuCores: cpus.length,
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuSpeed: cpus[0]?.speed || 0,
      
      // Disk space information
      totalDiskSpaceGB: diskSpace.total,
      availableDiskSpaceGB: diskSpace.available,
      usedDiskSpaceGB: diskSpace.used,
      
      // Platform information
      platform: this.platformInfo.platform,
      arch: this.platformInfo.arch,
      osRelease: os.release(),
      
      // System load (if available)
      loadAverage: os.loadavg(),
      
      // Timestamp
      timestamp: new Date().toISOString()
    };
    
    this.systemResourcesInfo = systemInfo;
    return systemInfo;
  }

  /**
   * Get disk space information for a given path
   */
  async getDiskSpace(dirPath) {
    try {
      const stats = await fs.statvfs ? fs.statvfs(dirPath) : null;
      
      if (stats) {
        // Unix-like systems
        const blockSize = stats.f_bsize || stats.f_frsize;
        const totalBlocks = stats.f_blocks;
        const availableBlocks = stats.f_bavail;
        
        const total = Math.round((totalBlocks * blockSize) / (1024 * 1024 * 1024));
        const available = Math.round((availableBlocks * blockSize) / (1024 * 1024 * 1024));
        const used = total - available;
        
        return { total, available, used };
      } else {
        // Fallback for systems without statvfs
        log.warn('⚠️  statvfs not available, using fallback disk space detection');
        return await this.getDiskSpaceFallback(dirPath);
      }
    } catch (error) {
      log.warn('⚠️  Failed to get disk space info, using fallback:', error.message);
      return await this.getDiskSpaceFallback(dirPath);
    }
  }

  /**
   * Fallback disk space detection using df command or Windows dir
   */
  async getDiskSpaceFallback(dirPath) {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        let command, args;
        
        if (this.platformInfo.isWindows) {
          // Windows: Use PowerShell to get disk space
          command = 'powershell';
          args = ['-Command', `Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq "${path.parse(dirPath).root.replace('\\', '')}"} | Select-Object Size,FreeSpace`];
        } else {
          // Unix-like: Use df command
          command = 'df';
          args = ['-BG', dirPath];
        }
        
        const proc = spawn(command, args, { stdio: 'pipe' });
        let output = '';
        
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        proc.on('close', (code) => {
          try {
            if (this.platformInfo.isWindows) {
              // Parse Windows PowerShell output
              const lines = output.trim().split('\n');
              const dataLine = lines.find(line => line.includes('Size') || /^\s*\d/.test(line));
              if (dataLine) {
                const match = dataLine.match(/(\d+)\s+(\d+)/);
                if (match) {
                  const total = Math.round(parseInt(match[1]) / (1024 * 1024 * 1024));
                  const available = Math.round(parseInt(match[2]) / (1024 * 1024 * 1024));
                  const used = total - available;
                  return resolve({ total, available, used });
                }
              }
            } else {
              // Parse Unix df output
              const lines = output.trim().split('\n');
              const dataLine = lines[lines.length - 1];
              const parts = dataLine.split(/\s+/);
              if (parts.length >= 4) {
                const total = Math.round(parseInt(parts[1].replace('G', '')) || 0);
                const used = Math.round(parseInt(parts[2].replace('G', '')) || 0);
                const available = Math.round(parseInt(parts[3].replace('G', '')) || 0);
                return resolve({ total, available, used });
              }
            }
          } catch (parseError) {
            log.warn('⚠️  Failed to parse disk space output:', parseError.message);
          }
          
          // Fallback to conservative estimates
          resolve({ total: 100, available: 50, used: 50 });
        });
        
        proc.on('error', () => {
          // Fallback to conservative estimates
          resolve({ total: 100, available: 50, used: 50 });
        });
      });
    } catch (error) {
      log.warn('⚠️  Fallback disk space detection failed:', error.message);
      return { total: 100, available: 50, used: 50 };
    }
  }

  /**
   * Evaluate system resources and determine performance mode
   */
  evaluateSystemResources(systemInfo) {
    const { minimum, recommended } = this.systemRequirements;
    
    const evaluation = {
      systemInfo,
      meetsMinimumRequirements: true,
      meetsRecommendedRequirements: true,
      issues: [],
      warnings: [],
      recommendations: [],
      performanceMode: 'full', // full, lite, core-only
      enabledFeatures: {
        angelaCore: true,
        dockerServices: true,
        comfyUI: true,
        n8nWorkflows: true,
        agentStudio: true,
        lumaUI: true,
        advancedFeatures: true
      },
      resourceLimitations: {}
    };

    // Check RAM
    if (systemInfo.ramGB < minimum.ramGB) {
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(`Insufficient RAM: ${systemInfo.ramGB}GB (minimum required: ${minimum.ramGB}GB)`);
      evaluation.performanceMode = 'core-only';
    } else if (systemInfo.ramGB < recommended.ramGB) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(`RAM below recommended: ${systemInfo.ramGB}GB (recommended: ${recommended.ramGB}GB)`);
      evaluation.performanceMode = 'lite';
    }

    // Check CPU cores
    if (systemInfo.cpuCores < minimum.cpuCores) {
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(`Insufficient CPU cores: ${systemInfo.cpuCores} (minimum required: ${minimum.cpuCores})`);
      evaluation.performanceMode = 'core-only';
    } else if (systemInfo.cpuCores < recommended.cpuCores) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(`CPU cores below recommended: ${systemInfo.cpuCores} (recommended: ${recommended.cpuCores})`);
      if (evaluation.performanceMode === 'full') {
        evaluation.performanceMode = 'lite';
      }
    }

    // Check disk space
    if (systemInfo.availableDiskSpaceGB < minimum.diskSpaceGB) {
      evaluation.meetsMinimumRequirements = false;
      evaluation.issues.push(`Insufficient disk space: ${systemInfo.availableDiskSpaceGB}GB (minimum required: ${minimum.diskSpaceGB}GB)`);
      evaluation.performanceMode = 'core-only';
    } else if (systemInfo.availableDiskSpaceGB < recommended.diskSpaceGB) {
      evaluation.meetsRecommendedRequirements = false;
      evaluation.warnings.push(`Disk space below recommended: ${systemInfo.availableDiskSpaceGB}GB (recommended: ${recommended.diskSpaceGB}GB)`);
    }

    // Configure features based on performance mode
    this.configureFeaturesByPerformanceMode(evaluation);

    // Add recommendations based on limitations
    this.addPerformanceRecommendations(evaluation);

    return evaluation;
  }

  /**
   * Configure available features based on system performance mode
   */
  configureFeaturesByPerformanceMode(evaluation) {
    const { performanceMode } = evaluation;
    
    switch (performanceMode) {
      case 'core-only':
        evaluation.enabledFeatures = {
          angelaCore: true,
          dockerServices: false,
          comfyUI: false,
          n8nWorkflows: false,
          agentStudio: false,
          lumaUI: false,
          advancedFeatures: false
        };
        evaluation.resourceLimitations = {
          maxConcurrentModels: 1,
          maxContextSize: 4096,
          disableGPUAcceleration: true,
          limitedThreads: Math.max(2, Math.floor(evaluation.systemInfo.cpuCores / 2))
        };
        break;
        
      case 'lite':
        evaluation.enabledFeatures = {
          angelaCore: true,
          dockerServices: false,
          comfyUI: false,
          n8nWorkflows: true,
          agentStudio: true,
          lumaUI: true,
          advancedFeatures: false
        };
        evaluation.resourceLimitations = {
          maxConcurrentModels: 1,
          maxContextSize: 8192,
          limitedThreads: Math.max(4, Math.floor(evaluation.systemInfo.cpuCores * 0.75))
        };
        break;
        
      case 'full':
        // All features enabled with no limitations
        evaluation.resourceLimitations = {
          maxConcurrentModels: 3,
          maxContextSize: 32768
        };
        break;
    }
  }

  /**
   * Add performance recommendations based on system analysis
   */
  addPerformanceRecommendations(evaluation) {
    const { systemInfo, performanceMode } = evaluation;
    
    if (performanceMode === 'core-only') {
      evaluation.recommendations.push('🎯 Running in Core-Only mode for optimal performance on your system');
      evaluation.recommendations.push('💡 Consider upgrading RAM to 16GB+ and CPU to 8+ cores for full features');
    } else if (performanceMode === 'lite') {
      evaluation.recommendations.push('⚡ Running in Lite mode - some resource-intensive features are disabled');
      evaluation.recommendations.push('🔧 Docker services disabled to preserve system resources');
    }

    // Memory-specific recommendations
    if (systemInfo.ramGB <= 8) {
      evaluation.recommendations.push('🧠 Consider closing other applications to free up memory');
    }

    // CPU-specific recommendations
    if (systemInfo.cpuCores <= 4) {
      evaluation.recommendations.push('⚙️  Model inference may be slower due to limited CPU cores');
    }

    // Disk space recommendations
    if (systemInfo.availableDiskSpaceGB < 20) {
      evaluation.recommendations.push('💾 Consider freeing up disk space for better performance');
    }
  }

  /**
   * Save system configuration to YAML file
   */
  async saveSystemConfiguration(validation) {
    try {
      const config = {
        version: '1.1.0', // Updated version to include OS compatibility
        lastUpdated: new Date().toISOString(),
        systemInfo: validation.systemInfo,
        performanceMode: validation.performanceMode,
        enabledFeatures: validation.enabledFeatures,
        resourceLimitations: validation.resourceLimitations,
        meetsMinimumRequirements: validation.meetsMinimumRequirements,
        meetsRecommendedRequirements: validation.meetsRecommendedRequirements,
        issues: validation.issues,
        warnings: validation.warnings,
        recommendations: validation.recommendations,
        
        // OS Compatibility Information
        osCompatibility: validation.osCompatibility ? {
          osInfo: validation.osCompatibility.osInfo,
          isSupported: validation.osCompatibility.isSupported,
          meetsMinimumRequirements: validation.osCompatibility.meetsMinimumRequirements,
          meetsRecommendedRequirements: validation.osCompatibility.meetsRecommendedRequirements,
          issues: validation.osCompatibility.issues,
          warnings: validation.osCompatibility.warnings,
          recommendations: validation.osCompatibility.recommendations,
          upgradeInstructions: validation.osCompatibility.upgradeInstructions
        } : null,
        
        // Overall compatibility (resources + OS)
        overallCompatible: validation.overallCompatible || false
      };

      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });

      await fs.writeFile(this.systemResourcesConfigPath, yamlContent, 'utf8');
      log.info(`✅ System configuration saved to: ${this.systemResourcesConfigPath}`);
      
      return config;
    } catch (error) {
      log.error('❌ Failed to save system configuration:', error);
      throw error;
    }
  }

  /**
   * Load system configuration from YAML file
   */
  async loadSystemConfiguration() {
    try {
      if (!fsSync.existsSync(this.systemResourcesConfigPath)) {
        log.info('ℹ️  No existing system configuration found, will create new one');
        return null;
      }

      const yamlContent = await fs.readFile(this.systemResourcesConfigPath, 'utf8');
      const config = yaml.load(yamlContent);
      
      log.info('✅ System configuration loaded successfully');
      return config;
    } catch (error) {
      log.error('❌ Failed to load system configuration:', error);
      return null;
    }
  }

  /**
   * Get current system configuration (load from file or validate fresh)
   */
  async getSystemConfiguration(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const existingConfig = await this.loadSystemConfiguration();
        if (existingConfig) {
          // Check if config is recent (less than 1 hour old)
          const lastUpdated = new Date(existingConfig.lastUpdated);
          const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          if (lastUpdated > hourAgo) {
            log.info('📄 Using cached system configuration');
            return existingConfig;
          }
        }
      }

      log.info('🔄 Refreshing system configuration...');
      const validation = await this.validateSystemResources();
      return await this.loadSystemConfiguration();
    } catch (error) {
      log.error('❌ Failed to get system configuration:', error);
      throw error;
    }
  }

  /**
   * Check if system meets minimum requirements for specific feature
   */
  async checkFeatureRequirements(featureName) {
    try {
      const config = await this.getSystemConfiguration();
      if (!config) {
        return { supported: false, reason: 'System configuration not available' };
      }

      const isEnabled = config.enabledFeatures[featureName];
      if (!isEnabled) {
        return {
          supported: false,
          reason: `Feature disabled due to ${config.performanceMode} performance mode`,
          performanceMode: config.performanceMode,
          recommendations: config.recommendations
        };
      }

      return {
        supported: true,
        performanceMode: config.performanceMode,
        limitations: config.resourceLimitations
      };
    } catch (error) {
      log.error(`❌ Failed to check requirements for feature ${featureName}:`, error);
      return { supported: false, reason: 'Failed to check system requirements' };
    }
  }

  getPlatformDirectory(platform, arch) {
    switch (platform) {
      case 'darwin':
        return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      case 'linux':
        return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      case 'win32':
        return 'win32-x64';
      default:
        throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }
  }

  getSupportedPlatforms() {
    return {
      'darwin-arm64': {
        name: 'macOS (Apple Silicon)',
        binaries: ['llama-swap-darwin-arm64', 'llama-server'],
        libraries: ['*.dylib'],
        headers: ['*.h'],
        shaders: ['*.metal'],
        supported: true
      },
      'darwin-x64': {
        name: 'macOS (Intel)',
        binaries: ['llama-swap-darwin-x64', 'llama-server'],
        libraries: ['*.dylib'],
        headers: ['*.h'],
        shaders: ['*.metal'],
        supported: false // Will be added in future
      },
      'linux-x64': {
        name: 'Linux (x64)',
        binaries: ['llama-swap-linux', 'llama-server'],
        libraries: ['*.so'],
        headers: ['*.h'],
        supported: true // Enable Linux support since binaries are working
      },
      'linux-arm64': {
        name: 'Linux (ARM64)',
        binaries: ['llama-swap-linux-arm64', 'llama-server'],
        libraries: ['*.so'],
        headers: ['*.h'],
        supported: false // Will be added in future
      },
      'win32-x64': {
        name: 'Windows (x64)',
        binaries: ['llama-swap-win32-x64.exe', 'llama-server.exe'],
        libraries: ['*.dll'],
        headers: ['*.h'],
        supported: false // Will be added in future
      }
    };
  }

  /**
   * Get the binary paths for the current platform
   */
  getBinaryPaths() {
    const platformBinDir = path.join(this.baseDir, this.platformInfo.platformDir);
    const platformConfig = this.supportedPlatforms[this.platformInfo.platformDir];
    
    if (!platformConfig) {
      throw new Error(`Unsupported platform: ${this.platformInfo.platformDir}`);
    }

    const binaryPaths = {};
    
    // Map standard binary names to platform-specific names
    platformConfig.binaries.forEach(binaryName => {
      if (binaryName.includes('llama-swap')) {
        binaryPaths.llamaSwap = path.join(platformBinDir, binaryName);
      } else if (binaryName.includes('llama-server')) {
        binaryPaths.llamaServer = path.join(platformBinDir, binaryName);
      }
    });

    return binaryPaths;
  }

  /**
   * Check if current platform is supported
   */
  isCurrentPlatformSupported() {
    const platformConfig = this.supportedPlatforms[this.platformInfo.platformDir];
    return platformConfig && platformConfig.supported;
  }

  /**
   * Validate that all required binaries exist for the current platform
   */
  async validatePlatformBinaries() {
    if (!this.isCurrentPlatformSupported()) {
      throw new Error(`Platform ${this.platformInfo.platformDir} is not yet supported. Supported platforms: ${this.getSupportedPlatformNames().join(', ')}`);
    }

    const binaryPaths = this.getBinaryPaths();
    const issues = [];

    for (const [name, binaryPath] of Object.entries(binaryPaths)) {
      if (!this.binaryExists(binaryPath)) {
        issues.push(`${name} binary not found at: ${binaryPath}`);
      } else {
        try {
          await fs.access(binaryPath, fs.constants.F_OK | fs.constants.X_OK);
        } catch (error) {
          issues.push(`${name} binary exists but is not executable: ${binaryPath}`);
        }
      }
    }

    if (issues.length > 0) {
      const error = new Error(`Platform binary validation failed:\n${issues.join('\n')}`);
      error.issues = issues;
      throw error;
    }

    log.info(`Platform validation successful for ${this.platformInfo.platformDir}`);
    return true;
  }

  /**
   * Check if a binary file exists and is a file
   */
  binaryExists(binaryPath) {
    try {
      return fsSync.existsSync(binaryPath) && fsSync.statSync(binaryPath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of supported platform names
   */
  getSupportedPlatformNames() {
    return Object.entries(this.supportedPlatforms)
      .filter(([_, config]) => config.supported)
      .map(([platformDir, config]) => config.name);
  }

  /**
   * Get platform directory for the current system
   */
  getCurrentPlatformDirectory() {
    return this.platformInfo.platformDir;
  }

  /**
   * Get platform-specific library directory
   */
  getPlatformLibraryDirectory() {
    return path.join(this.baseDir, this.platformInfo.platformDir);
  }

  /**
   * Get platform-specific environment variables for running binaries
   */
  getPlatformEnvironment() {
    const platformLibDir = this.getPlatformLibraryDirectory();
    const env = { ...process.env };

    if (this.platformInfo.isLinux) {
      env.LD_LIBRARY_PATH = platformLibDir + ':' + (env.LD_LIBRARY_PATH || '');
    } else if (this.platformInfo.isMac) {
      env.DYLD_LIBRARY_PATH = platformLibDir + ':' + (env.DYLD_LIBRARY_PATH || '');
    }
    // Windows uses PATH for DLL loading, which should already include the platform directory

    return env;
  }

  /**
   * Future: Download and install binaries for a specific platform
   * This will be implemented when adding JIT compilation support
   */
  async downloadPlatformBinaries(platformDir, version = 'latest') {
    throw new Error('Binary download functionality not yet implemented. This will support downloading pre-built binaries or compiling from source.');
  }

  /**
   * Future: Compile binaries from source (JIT)
   * This will be implemented when adding JIT compilation support
   */
  async compileBinariesFromSource(options = {}) {
    throw new Error('Just-in-time compilation not yet implemented. This will support building llama.cpp from source.');
  }

  /**
   * Get platform information for debugging
   */
  getPlatformInfo() {
    return {
      current: this.platformInfo,
      supported: this.isCurrentPlatformSupported(),
      availablePlatforms: this.getSupportedPlatformNames(),
      binaryPaths: this.isCurrentPlatformSupported() ? this.getBinaryPaths() : null
    };
  }

  /**
   * Check for platform-specific optimizations
   */
  getOptimizations() {
    const optimizations = {
      cpu: [],
      gpu: [],
      memory: []
    };

    // Detect CPU features
    const cpuFlags = os.cpus()[0]?.flags || [];
    if (cpuFlags.includes('avx2')) optimizations.cpu.push('AVX2');
    if (cpuFlags.includes('avx512')) optimizations.cpu.push('AVX-512');

    // Platform-specific GPU support
    if (this.platformInfo.isMac) {
      optimizations.gpu.push('Metal');
    } else if (this.platformInfo.isLinux) {
      optimizations.gpu.push('CUDA', 'OpenCL');
    } else if (this.platformInfo.isWindows) {
      optimizations.gpu.push('CUDA', 'DirectML');
    }

    return optimizations;
  }
}

module.exports = PlatformManager; 
