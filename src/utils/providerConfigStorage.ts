const STORAGE_KEY = 'angela_provider_configs';

import type { angelaAIConfig } from '../types/angela_assistant_types';

export function saveProviderConfig(providerId: string, config: angelaAIConfig) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  all[providerId] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  console.log(`Saved config for provider ${providerId}:`, config);
}

export function loadProviderConfig(providerId: string): angelaAIConfig | null {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const config = all[providerId] || null;
  console.log(`Loaded config for provider ${providerId}:`, config);
  return config;
}

export function getAllProviderConfigs(): Record<string, angelaAIConfig> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

export function deleteProviderConfig(providerId: string): void {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  delete all[providerId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  console.log(`Deleted config for provider ${providerId}`);
}

export function clearAllProviderConfigs(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log('Cleared all provider configurations');
}

// Debug utility to log all provider configs
export function debugProviderConfigs(): void {
  const all = getAllProviderConfigs();
  console.log('All provider configurations:', all);
  Object.entries(all).forEach(([providerId, config]) => {
    console.log(`Provider ${providerId}:`, {
      models: config.models,
      parameters: config.parameters,
      features: config.features
    });
  });
}

// Utility to clean invalid configurations
export function cleanInvalidProviderConfigs(validProviderIds: string[]): void {
  const all = getAllProviderConfigs();
  let cleaned = false;
  
  Object.keys(all).forEach(providerId => {
    if (!validProviderIds.includes(providerId)) {
      delete all[providerId];
      cleaned = true;
      console.log(`Removed config for invalid provider: ${providerId}`);
    }
  });
  
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    console.log('Cleaned invalid provider configurations');
  }
}

// Utility to validate provider config
export function validateProviderConfig(providerId: string, config: angelaAIConfig, availableModels: string[]): angelaAIConfig {
  const cleanConfig = {
    ...config,
    provider: providerId, // Ensure provider ID is correct
    models: {
      text: config.models.text && availableModels.includes(config.models.text) ? config.models.text : '',
      vision: config.models.vision && availableModels.includes(config.models.vision) ? config.models.vision : '',
      code: config.models.code && availableModels.includes(config.models.code) ? config.models.code : ''
    }
  };
  
  console.log('Validated config for provider', providerId, ':', cleanConfig);
  return cleanConfig;
} 
