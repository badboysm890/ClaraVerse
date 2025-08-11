const fs = require('fs');
const path = require('path');

/**
 * Build configuration script for Clara Electron builds
 * Supports two variants:
 * - full: Includes all llamaCpp binaries
 * - barebone: Excludes specific Windows variants (win32-x64-cpu, win32-x64-cuda, win32-x64-rocm, win32-x64-vulkan)
 */

function createBuildConfig(variant = 'full') {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Always include services folder
  const baseExtraResources = [
    {
      "from": "assets",
      "to": "assets"
    },
    {
      "from": "py_backend",
      "to": "py_backend",
      "filter": [
        "**/*",
        "!**/__pycache__/**",
        "!**/*.pyc"
      ]
    },
    {
      "from": "electron/services",
      "to": "electron/services",
      "filter": [
        "**/*"
      ]
    }
  ];

  // Configure llamaCpp binaries based on variant
  if (variant === 'full') {
    // Include all llamaCpp binaries
    baseExtraResources.push({
      "from": "electron/llamacpp-binaries",
      "to": "electron/llamacpp-binaries",
      "filter": [
        "**/*",
        "!*.log",
        "!config.yaml"
      ]
    });
  } else if (variant === 'barebone') {
    // Include llamaCpp binaries but exclude specific Windows variants
    baseExtraResources.push({
      "from": "electron/llamacpp-binaries",
      "to": "electron/llamacpp-binaries",
      "filter": [
        "**/*",
        "!*.log",
        "!config.yaml",
        "!win32-x64-cpu/**",
        "!win32-x64-cuda/**",
        "!win32-x64-rocm/**",
        "!win32-x64-vulkan/**"
      ]
    });
  }

  // Update the build configuration
  packageJson.build.extraResources = baseExtraResources;
  
  // Also update Windows-specific extraResources to include services
  packageJson.build.win.extraResources = [
    {
      "from": "py_backend",
      "to": "py_backend",
      "filter": [
        "**/*",
        "!**/__pycache__/**",
        "!**/*.pyc"
      ]
    },
    {
      "from": "electron/services",
      "to": "electron/services",
      "filter": [
        "**/*"
      ]
    }
  ];

  // Update artifact name based on variant
  if (variant === 'barebone') {
    packageJson.build.nsis.artifactName = "${productName}-${version}-barebone.${ext}";
  } else {
    // Remove custom artifact name for full build (use default)
    delete packageJson.build.nsis.artifactName;
  }

  // Write the updated package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  console.log(`Build configuration updated for variant: ${variant}`);
  console.log(`Services folder will be included in the build.`);
  
  if (variant === 'barebone') {
    console.log('Excluded llamaCpp binaries: win32-x64-cpu, win32-x64-cuda, win32-x64-rocm, win32-x64-vulkan');
  } else {
    console.log('All llamaCpp binaries will be included.');
  }
}

// Get variant from command line argument
const variant = process.argv[2] || 'full';

if (!['full', 'barebone'].includes(variant)) {
  console.error('Invalid variant. Use "full" or "barebone"');
  process.exit(1);
}

createBuildConfig(variant);
