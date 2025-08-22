/**
 * memoryConfig.ts
 * 
 * Configuration settings for angela's memory system
 */

export const MEMORY_CONFIG = {
  // Storage settings
  storage: {
    tablePrefix: 'angela_memory_',
    enableBackup: true,
    backupInterval: 24 * 60 * 60 * 1000, // 24 hours
    maxProfileVersions: 10 // Keep last 10 versions for rollback
  },

  // Extraction settings
  extraction: {
    minConfidence: 0.2, // Minimum confidence to save memory (lowered from 0.3)
    maxRequestSize: 2000, // Max characters in user message to process
    minTokenSpeed: 10, // Min tokens/sec for processing
    enableRateLimiting: true,
    rateLimitInterval: 30000, // 30 seconds between extractions
    contextWindow: 3, // Number of previous messages to include
    timeoutMs: 15000 // 15 second timeout for AI extraction
  },

  // Feature flags
  features: {
    enableToastNotifications: true,
    enableAutoProcessing: true,
    enableConversationAnalysis: true,
    enableMemoryDashboard: true,
    enableExportImport: true,
    enableMemoryInsights: true
  },

  // UI settings
  ui: {
    toastDuration: 4000, // 4 seconds
    toastCooldown: 60000, // 1 minute cooldown
    knowledgeLevelThreshold: 5, // Show toast when knowledge increases by 5%
    maxToastsPerSession: 3 // Limit toasts per session
  },

  // Privacy settings
  privacy: {
    enableUserConsent: true,
    consentVersion: 1,
    enableDataExport: true,
    enableDataDeletion: true,
    enableMemoryTransparency: true // Show what angela learned
  },

  // Performance settings
  performance: {
    enableBatchProcessing: false, // Process multiple messages at once
    batchSize: 5,
    enableCaching: true,
    cacheExpiryMs: 5 * 60 * 1000, // 5 minutes
    enableCompression: false // Compress stored data
  }
};

export default MEMORY_CONFIG;
