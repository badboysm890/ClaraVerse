/**
 * angelaVerse Service Definitions
 * Centralized configuration for all services
 * Replaces scattered service configurations across multiple files
 */

const path = require('path');
const os = require('os');

// Get platform info
const platform = os.platform();
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

// Base paths
const appDataPath = path.join(os.homedir(), '.angela');
const pythonBackendDataPath = path.join(appDataPath, 'python_backend_data');

/**
 * Service definitions with all configuration
 */
const SERVICE_DEFINITIONS = {
  
  // Docker Engine (foundational service)
  docker: {
    name: 'Docker Engine',
    type: 'docker-daemon',
    critical: true,
    autoRestart: true,
    priority: 1,
    dependencies: [],
    
    healthCheck: async () => {
      const Docker = require('dockerode');
      try {
        const docker = new Docker();
        await docker.ping();
        return true;
      } catch {
        return false;
      }
    },
    
    customStart: async () => {
      // Docker daemon startup logic
      const DockerSetup = require('./dockerSetup.cjs');
      const dockerSetup = new DockerSetup();
      await dockerSetup.ensureDockerRunning();
      return dockerSetup;
    }
  },

  // Python Backend Service
  'python-backend': {
    name: 'Python Backend Service',
    type: 'docker-container',
    critical: true,
    autoRestart: true,
    priority: 2,
    dependencies: ['docker'],
    
    dockerContainer: {
      name: 'angela_python',
      image: 'angela17verse/angela-backend:latest',
      ports: { '5001': '5000' },
      volumes: [
        `${pythonBackendDataPath}:/home/angela`,
        'angela_python_models:/app/models'
      ],
      environment: [
        'PYTHONUNBUFFERED=1',
        'angela_ENV=production'
      ]
    },
    
    healthCheck: async () => {
      const http = require('http');
      return new Promise((resolve) => {
        const req = http.get('http://localhost:5001/health', (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // LlamaSwap Service (angela's AI model manager)
  llamaswap: {
    name: "angela's Core AI Engine",
    type: 'binary',
    critical: true,
    autoRestart: true,
    priority: 3,
    dependencies: ['docker'],
    
    // NEW: Deployment mode support - native binary service
    deploymentModes: ['native'],
    platformSupport: {
      native: ['win32', 'darwin', 'linux'] // Native binary supported on all platforms
    },
    
    binaryPath: platform === 'darwin' 
      ? './llamacpp-binaries/llamacpp-server-darwin-arm64'
      : platform === 'linux'
      ? './llamacpp-binaries/llamacpp-server-linux-x64'
      : './llamacpp-binaries/llamacpp-server-win-x64.exe',
    
    ports: { main: 8091, proxy: 9999 },
    
    healthCheck: async () => {
      const http = require('http');
      return new Promise((resolve) => {
        const req = http.get('http://localhost:8091/health', (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
    },
    
    customStart: async () => {
      const LlamaSwapService = require('./llamaSwapService.cjs');
      const service = new LlamaSwapService();
      await service.start();
      return service;
    },
    
    customStop: async (service) => {
      if (service.instance && service.instance.stop) {
        await service.instance.stop();
      }
    }
  },

  // ComfyUI Image Generation Service
  comfyui: {
    name: 'ComfyUI Image Generation',
    type: 'docker-container',
    critical: false, // Non-critical - user can disable
    autoRestart: true,
    priority: 4,
    dependencies: ['docker', 'python-backend'],
    
    // NEW: Deployment mode support
    deploymentModes: ['docker', 'manual'],
    platformSupport: {
      docker: ['win32'], // Docker only supported on Windows
      manual: ['win32', 'darwin', 'linux'] // Manual/BYOS supported on all platforms
    },
    
    // NEW: Manual service configuration
    manual: {
      urlRequired: true,
      defaultUrl: 'http://localhost:8188',
      healthEndpoint: '/',
      configKey: 'comfyui_url',
      description: 'Bring Your Own ComfyUI - Connect to external ComfyUI instance'
    },
    
    dockerContainer: {
      name: 'angela_comfyui',
      image: 'angela17verse/angela-comfyui:with-custom-nodes',
      ports: { '8188': '8188' },
      volumes: [
        `${path.join(appDataPath, 'comfyui_models')}:/app/ComfyUI/models`,
        `${path.join(appDataPath, 'comfyui_output')}:/app/ComfyUI/output`,
        `${path.join(appDataPath, 'comfyui_input')}:/app/ComfyUI/input`,
        `${path.join(appDataPath, 'comfyui_custom_nodes')}:/app/ComfyUI/custom_nodes`,
        `${path.join(appDataPath, 'comfyui_temp')}:/tmp`
      ],
      environment: [
        'NVIDIA_VISIBLE_DEVICES=all',
        'CUDA_VISIBLE_DEVICES=0',
        'PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:2048,expandable_segments:True',
        'COMFYUI_FORCE_FP16=1',
        'COMFYUI_HIGHVRAM=1'
      ],
      runtime: 'nvidia' // GPU support
    },
    
    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:8188';
      return new Promise((resolve) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(10000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // N8N Workflow Automation
  n8n: {
    name: 'N8N Workflow Engine',
    type: 'docker-container',
    critical: false,
    autoRestart: true,
    priority: 5,
    dependencies: ['docker'],
    
    // NEW: Deployment mode support
    deploymentModes: ['docker', 'manual'],
    platformSupport: {
      docker: ['win32', 'darwin', 'linux'], // Docker supported on all platforms
      manual: ['win32', 'darwin', 'linux'] // Manual/BYOS supported on all platforms
    },
    
    // NEW: Manual service configuration
    manual: {
      urlRequired: true,
      defaultUrl: 'http://localhost:5678',
      healthEndpoint: '/healthz',
      configKey: 'n8n_url',
      description: 'Bring Your Own N8N - Connect to external N8N instance'
    },
    
    dockerContainer: {
      name: 'angela_n8n',
      image: 'n8nio/n8n:latest',
      ports: { '5678': '5678' },
      volumes: [
        `${path.join(appDataPath, 'n8n')}:/home/node/.n8n`
      ],
      environment: [
        'N8N_BASIC_AUTH_ACTIVE=false',
        'N8N_METRICS=true',
        'WEBHOOK_URL=http://localhost:5678/',
        'GENERIC_TIMEZONE=UTC'
      ]
    },
    
    healthCheck: async (serviceUrl = null) => {
      const http = require('http');
      const url = serviceUrl || 'http://localhost:5678';
      const endpoint = serviceUrl ? `${url}/healthz` : 'http://localhost:5678/healthz';
      return new Promise((resolve) => {
        const req = http.get(endpoint, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });
    }
  },

  // Model Context Protocol Service
  mcp: {
    name: 'Model Context Protocol',
    type: 'service',
    critical: false,
    autoRestart: true,
    priority: 6,
    dependencies: ['llamaswap'],
    
    customStart: async () => {
      const MCPService = require('./mcpService.cjs');
      const service = new MCPService();
      await service.start();
      return service;
    },
    
    customStop: async (service) => {
      if (service.instance && service.instance.stop) {
        await service.instance.stop();
      }
    },
    
    healthCheck: async () => {
      // MCP health check logic
      return true; // Placeholder
    }
  }
};

/**
 * Platform-specific service configurations
 */
const PLATFORM_OVERRIDES = {
  darwin: {
    llamaswap: {
      binaryPath: './llamacpp-binaries/llamacpp-server-darwin-arm64',
      environment: [
        'METAL_PERFORMANCE_SHADERS_ENABLED=1',
        'GGML_METAL=1'
      ]
    }
  },
  
  linux: {
    llamaswap: {
      binaryPath: './llamacpp-binaries/llamacpp-server-linux-x64',
      environment: [
        'CUDA_VISIBLE_DEVICES=0',
        'GGML_CUDA=1'
      ]
    }
  },
  
  win32: {
    llamaswap: {
      binaryPath: './llamacpp-binaries/llamacpp-server-win-x64.exe',
      environment: [
        'CUDA_VISIBLE_DEVICES=0'
      ]
    }
  }
};

/**
 * Feature-based service selection
 * Based on user's feature selection during setup
 */
function getEnabledServices(selectedFeatures = {}) {
  const enabledServices = {};
  
  // Core services (always enabled)
  const coreServices = ['docker', 'python-backend'];
  
  // angela Core AI (always enabled if selected)
  if (selectedFeatures.angelaCore !== false) {
    coreServices.push('llamaswap', 'mcp');
  }
  
  // Optional services based on user selection
  if (selectedFeatures.comfyUI) {
    enabledServices.comfyui = SERVICE_DEFINITIONS.comfyui;
  }
  
  if (selectedFeatures.n8n) {
    enabledServices.n8n = SERVICE_DEFINITIONS.n8n;
  }
  
  // Add core services
  coreServices.forEach(serviceName => {
    if (SERVICE_DEFINITIONS[serviceName]) {
      enabledServices[serviceName] = SERVICE_DEFINITIONS[serviceName];
    }
  });
  
  return enabledServices;
}

/**
 * Apply platform-specific overrides
 */
function applyPlatformOverrides(services) {
  const platformOverrides = PLATFORM_OVERRIDES[platform] || {};
  
  const result = { ...services };
  
  Object.keys(platformOverrides).forEach(serviceName => {
    if (result[serviceName]) {
      result[serviceName] = {
        ...result[serviceName],
        ...platformOverrides[serviceName]
      };
    }
  });
  
  return result;
}

/**
 * Get complete service configuration for current platform and features
 */
function getServiceConfiguration(selectedFeatures = {}) {
  let services = getEnabledServices(selectedFeatures);
  services = applyPlatformOverrides(services);
  
  return services;
}

/**
 * Validate service configuration
 */
function validateServiceConfiguration(services) {
  const errors = [];
  
  // Check for circular dependencies
  const dependencies = {};
  Object.keys(services).forEach(name => {
    dependencies[name] = services[name].dependencies || [];
  });
  
  try {
    // Simple cycle detection
    const visited = new Set();
    const temp = new Set();
    
    const visit = (node) => {
      if (temp.has(node)) {
        errors.push(`Circular dependency detected involving ${node}`);
        return;
      }
      if (!visited.has(node)) {
        temp.add(node);
        dependencies[node].forEach(visit);
        temp.delete(node);
        visited.add(node);
      }
    };
    
    Object.keys(dependencies).forEach(visit);
  } catch (error) {
    errors.push(`Dependency validation failed: ${error.message}`);
  }
  
  // Check for missing dependencies
  Object.keys(services).forEach(serviceName => {
    const service = services[serviceName];
    service.dependencies?.forEach(dep => {
      if (!services[dep]) {
        errors.push(`Service ${serviceName} depends on ${dep} which is not enabled`);
      }
    });
  });
  
  return errors;
}

/**
 * Service health check timeouts by type
 */
const HEALTH_CHECK_TIMEOUTS = {
  'docker-daemon': 10000,
  'docker-container': 15000,
  'binary': 5000,
  'service': 3000
};

/**
 * Get health check timeout for service
 */
function getHealthCheckTimeout(service) {
  return HEALTH_CHECK_TIMEOUTS[service.type] || 5000;
}

/**
 * NEW: Check if a service supports a specific deployment mode on current platform
 */
function isServiceModeSupported(serviceName, deploymentMode, targetPlatform = platform) {
  const service = SERVICE_DEFINITIONS[serviceName];
  if (!service || !service.deploymentModes) {
    return deploymentMode === 'docker'; // Default to docker mode for backward compatibility
  }
  
  // Check if deployment mode is supported by service
  if (!service.deploymentModes.includes(deploymentMode)) {
    return false;
  }
  
  // Check platform support
  if (service.platformSupport) {
    if (typeof service.platformSupport === 'object') {
      // Platform support is mode-specific
      const supportedPlatforms = service.platformSupport[deploymentMode];
      return supportedPlatforms && supportedPlatforms.includes(targetPlatform);
    } else if (Array.isArray(service.platformSupport)) {
      // Platform support is general (backward compatibility)
      return service.platformSupport.includes(targetPlatform);
    }
  }
  
  return true; // No restrictions defined
}

/**
 * NEW: Get supported deployment modes for a service on current platform
 */
function getSupportedDeploymentModes(serviceName, targetPlatform = platform) {
  const service = SERVICE_DEFINITIONS[serviceName];
  if (!service || !service.deploymentModes) {
    return ['docker']; // Default to docker mode
  }
  
  return service.deploymentModes.filter(mode => 
    isServiceModeSupported(serviceName, mode, targetPlatform)
  );
}

/**
 * NEW: Get platform compatibility information for all services
 */
function getPlatformCompatibility(targetPlatform = platform) {
  const compatibility = {};
  
  Object.keys(SERVICE_DEFINITIONS).forEach(serviceName => {
    const service = SERVICE_DEFINITIONS[serviceName];
    
    compatibility[serviceName] = {
      name: service.name,
      critical: service.critical,
      supportedModes: getSupportedDeploymentModes(serviceName, targetPlatform),
      dockerSupported: isServiceModeSupported(serviceName, 'docker', targetPlatform),
      manualSupported: isServiceModeSupported(serviceName, 'manual', targetPlatform),
      manualConfig: service.manual || null
    };
  });
  
  return compatibility;
}

/**
 * NEW: Get services filtered by deployment mode and platform compatibility
 */
function getCompatibleServices(selectedFeatures = {}, preferredMode = 'docker', targetPlatform = platform) {
  let services = getEnabledServices(selectedFeatures);
  services = applyPlatformOverrides(services);
  
  // Filter services based on platform compatibility
  const compatibleServices = {};
  
  Object.keys(services).forEach(serviceName => {
    const service = services[serviceName];
    
    // Check if service supports preferred mode on current platform
    if (isServiceModeSupported(serviceName, preferredMode, targetPlatform)) {
      compatibleServices[serviceName] = {
        ...service,
        deploymentMode: preferredMode
      };
    } else {
      // Try to find alternative mode
      const supportedModes = getSupportedDeploymentModes(serviceName, targetPlatform);
      if (supportedModes.length > 0) {
        compatibleServices[serviceName] = {
          ...service,
          deploymentMode: supportedModes[0] // Use first available mode
        };
      }
      // If no modes supported, service is excluded (non-critical services only)
    }
  });
  
  return compatibleServices;
}

/**
 * NEW: Create manual service health check function
 */
function createManualHealthCheck(serviceUrl, healthEndpoint = '/') {
  return async () => {
    const http = require('http');
    const https = require('https');
    
    return new Promise((resolve) => {
      try {
        const url = new URL(serviceUrl);
        const client = url.protocol === 'https:' ? https : http;
        const endpoint = `${serviceUrl}${healthEndpoint}`.replace(/\/+/g, '/').replace(':/', '://');
        
        const req = client.get(endpoint, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      } catch (error) {
        resolve(false);
      }
    });
  };
}

module.exports = {
  SERVICE_DEFINITIONS,
  PLATFORM_OVERRIDES,
  getServiceConfiguration,
  validateServiceConfiguration,
  getEnabledServices,
  applyPlatformOverrides,
  getHealthCheckTimeout,
  HEALTH_CHECK_TIMEOUTS,
  // NEW: Deployment mode and platform compatibility functions
  isServiceModeSupported,
  getSupportedDeploymentModes,
  getPlatformCompatibility,
  getCompatibleServices,
  createManualHealthCheck
}; 
