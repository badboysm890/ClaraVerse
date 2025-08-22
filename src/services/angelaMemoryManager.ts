/**
 * angelaMemoryManager.ts
 * 
 * Centralized memory management service for angela's user profiling system.
 * Handles memory extraction, storage, retrieval, and profile management.
 * 
 * Features:
 * - Decoupled from UI components
 * - Event-driven architecture
 * - Proper error handling and logging
 * - Extensible for future features
 * - Single-user optimized but architecturally sound
 */

import { UserMemoryProfile } from '../components/angelaSweetMemory';
import { indexedDBService } from './indexedDB';
import type { angelaMessage, angelaAIConfig } from '../types/angela_assistant_types';

// ==================== LOCAL INTERFACES ====================

interface MemoryExtractionResponse {
  hasMemoryData: boolean;
  extractedMemory?: Partial<UserMemoryProfile>;
  confidence: number;
  reasoning?: string;
}

// ==================== EVENTS & INTERFACES ====================

export interface MemoryEvent {
  type: 'memory_extracted' | 'profile_updated' | 'memory_error' | 'processing_started' | 'processing_completed';
  data?: any;
  timestamp: number;
  profileId?: string;
  confidence?: number;
  error?: string;
}

export type MemoryEventListener = (event: MemoryEvent) => void;

export interface MemoryExtractionOptions {
  minConfidence?: number;
  maxRequestSize?: number;
  minTokenSpeed?: number;
  enableRateLimiting?: boolean;
  rateLimitInterval?: number;
  contextWindow?: number;
}

export interface MemoryManagerConfig {
  storage: {
    tablePrefix: string;
    enableBackup: boolean;
    backupInterval: number;
  };
  extraction: MemoryExtractionOptions;
  features: {
    enableToastNotifications: boolean;
    enableAutoProcessing: boolean;
    enableConversationAnalysis: boolean;
  };
}

// ==================== MEMORY MANAGER CLASS ====================

class angelaMemoryManager {
  private static instance: angelaMemoryManager;
  private listeners: Set<MemoryEventListener> = new Set();
  private processingQueue: Set<string> = new Set();
  private lastProcessedTime: number = 0;
  private config: MemoryManagerConfig;

  // Constants
  private readonly USER_ID = 'current_user'; // Single user app optimization
  private readonly MEMORY_TABLE_PREFIX = 'angela_user_memory_'; // 🔧 FIXED: Match angelaSweetMemory key format
  private readonly PROFILE_KEY = `${this.MEMORY_TABLE_PREFIX}${this.USER_ID}`; // Results in: angela_user_memory_current_user
  
  // Default configuration
  private readonly DEFAULT_CONFIG: MemoryManagerConfig = {
    storage: {
      tablePrefix: 'angela_memory_',
      enableBackup: true,
      backupInterval: 24 * 60 * 60 * 1000 // 24 hours
    },
    extraction: {
      minConfidence: 0.3,
      maxRequestSize: 2000,
      minTokenSpeed: 10,
      enableRateLimiting: true,
      rateLimitInterval: 30000, // 30 seconds
      contextWindow: 3
    },
    features: {
      enableToastNotifications: true,
      enableAutoProcessing: true,
      enableConversationAnalysis: true
    }
  };

  private constructor() {
    this.config = { ...this.DEFAULT_CONFIG };
    this.initializeStorage();
  }

  public static getInstance(): angelaMemoryManager {
    if (!angelaMemoryManager.instance) {
      angelaMemoryManager.instance = new angelaMemoryManager();
    }
    return angelaMemoryManager.instance;
  }

  // ==================== EVENT SYSTEM ====================

  public addEventListener(listener: MemoryEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: Omit<MemoryEvent, 'timestamp'>): void {
    const fullEvent: MemoryEvent = {
      ...event,
      timestamp: Date.now()
    };

    // Log significant events
    if (event.type !== 'processing_started') {
      console.log(`🧠 Memory Event: ${event.type}`, fullEvent);
    }

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(fullEvent);
      } catch (error) {
        console.error('🧠 Error in memory event listener:', error);
      }
    });
  }

  // ==================== CONFIGURATION ====================

  public updateConfig(newConfig: Partial<MemoryManagerConfig>): void {
    this.config = {
      storage: { ...this.config.storage, ...newConfig.storage },
      extraction: { ...this.config.extraction, ...newConfig.extraction },
      features: { ...this.config.features, ...newConfig.features }
    };
    console.log('🧠 Memory manager configuration updated:', this.config);
  }

  public getConfig(): MemoryManagerConfig {
    return { ...this.config };
  }

  // ==================== STORAGE OPERATIONS ====================

  private async initializeStorage(): Promise<void> {
    try {
      // Ensure the settings store exists (memory uses it with prefixed keys)
      await indexedDBService.getAll('settings');
      console.log('🧠 Memory storage initialized successfully');
    } catch (error) {
      console.error('🧠 Failed to initialize memory storage:', error);
      throw new Error('Memory storage initialization failed');
    }
  }

  public async getUserProfile(): Promise<UserMemoryProfile | null> {
    try {
      console.log(`🧠 DEBUG: Looking for memory profile with key: ${this.PROFILE_KEY}`);
      const result = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', this.PROFILE_KEY);
      
      if (result?.value) {
        console.log(`🧠 ✅ Retrieved user profile (version: ${result.value.version}, userId: ${result.value.userId})`);
        console.log(`🧠 Profile sections:`, {
          coreIdentity: Object.keys(result.value.coreIdentity || {}).length,
          personalCharacteristics: Object.keys(result.value.personalCharacteristics || {}).length,
          preferences: Object.keys(result.value.preferences || {}).length,
          interactions: Object.keys(result.value.interactions || {}).length,
          context: Object.keys(result.value.context || {}).length,
          practical: Object.keys(result.value.practical || {}).length
        });
        return result.value;
      }
      
      // 🔧 MIGRATION: Check for legacy memory manager keys
      const legacyKey = `angela_memory_profile_${this.USER_ID}`;
      console.log(`🧠 DEBUG: Profile not found, checking legacy key: ${legacyKey}`);
      
      const legacyResult = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', legacyKey);
      if (legacyResult?.value) {
        console.log('🧠 DEBUG: Found legacy profile, migrating to new key format...');
        
        // Save under new key
        await this.saveUserProfile(legacyResult.value);
        
        // Delete legacy key
        try {
          await indexedDBService.delete('settings', legacyKey);
          console.log('🧠 ✅ Successfully migrated legacy profile and cleaned up old key');
        } catch (deleteError) {
          console.warn('🧠 Could not delete legacy key:', deleteError);
        }
        
        return legacyResult.value;
      }
      
      // 🔍 DEBUG: List all memory-related keys to help diagnose issues
      try {
        const allSettings = await indexedDBService.getAll<{ key: string; value: any }>('settings');
        const memoryKeys = allSettings
          .filter(item => item.key.includes('memory') || item.key.includes('angela'))
          .map(item => item.key);
        console.log('🧠 DEBUG: All angela/memory-related keys in storage:', memoryKeys);
      } catch (listError) {
        console.warn('🧠 DEBUG: Could not list storage keys:', listError);
      }
      
      console.log('🧠 No user profile found (searched both current and legacy keys)');
      return null;
    } catch (error) {
      console.error('🧠 Failed to retrieve user profile:', error);
      this.emitEvent({
        type: 'memory_error',
        error: `Failed to retrieve profile: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return null;
    }
  }

  public async saveUserProfile(profile: UserMemoryProfile): Promise<boolean> {
    try {
      await indexedDBService.put('settings', { 
        key: this.PROFILE_KEY, 
        value: profile 
      });
      
      console.log(`🧠 Saved user profile (version: ${profile.version})`);
      
      this.emitEvent({
        type: 'profile_updated',
        data: profile,
        profileId: profile.id,
        confidence: profile.metadata.confidenceLevel
      });
      
      return true;
    } catch (error) {
      console.error('🧠 Failed to save user profile:', error);
      this.emitEvent({
        type: 'memory_error',
        error: `Failed to save profile: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  public async deleteUserProfile(): Promise<boolean> {
    try {
      await indexedDBService.delete('settings', this.PROFILE_KEY);
      console.log('🧠 User profile deleted');
      
      this.emitEvent({
        type: 'profile_updated',
        data: null
      });
      
      return true;
    } catch (error) {
      console.error('🧠 Failed to delete user profile:', error);
      this.emitEvent({
        type: 'memory_error',
        error: `Failed to delete profile: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  // ==================== BACKUP & SYNC ====================

  public async createBackup(): Promise<string | null> {
    try {
      const profile = await this.getUserProfile();
      if (!profile) {
        return null;
      }

      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        profile: profile,
        metadata: {
          appVersion: '1.0', // You can get this from package.json
          backupType: 'manual'
        }
      };

      const backupString = JSON.stringify(backup, null, 2);
      console.log('🧠 Memory backup created');
      
      return backupString;
    } catch (error) {
      console.error('🧠 Failed to create backup:', error);
      return null;
    }
  }

  public async restoreFromBackup(backupData: string): Promise<boolean> {
    try {
      const backup = JSON.parse(backupData);
      
      if (!backup.profile || !backup.version) {
        throw new Error('Invalid backup format');
      }

      const success = await this.saveUserProfile(backup.profile);
      if (success) {
        console.log('🧠 Memory restored from backup');
      }
      
      return success;
    } catch (error) {
      console.error('🧠 Failed to restore from backup:', error);
      this.emitEvent({
        type: 'memory_error',
        error: `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  // ==================== MEMORY EXTRACTION ====================

  public async processConversation(
    userMessage: string,
    assistantMessage: angelaMessage,
    conversationHistory: angelaMessage[] = [],
    aiConfig?: angelaAIConfig
  ): Promise<boolean> {
    const messageId = assistantMessage.id;

    try {
      this.emitEvent({
        type: 'processing_started',
        data: { messageId, userMessage: userMessage.substring(0, 100) + '...' }
      });

      // Check if we should process this conversation
      if (!this.shouldProcessConversation(userMessage, assistantMessage)) {
        console.log('🧠 Skipping conversation processing - conditions not met');
        return false;
      }

      // Mark as processing
      this.processingQueue.add(messageId);
      this.lastProcessedTime = Date.now();

      try {
        // Get existing profile
        const existingProfile = await this.getUserProfile();

        // Extract memory data using AI
        const extractionResult = await this.extractMemoryFromConversation(
          userMessage,
          assistantMessage,
          conversationHistory,
          aiConfig
        );

        if (!extractionResult || !extractionResult.hasMemoryData) {
          console.log('🧠 No meaningful memory data extracted');
          return false;
        }

        // Merge with existing profile
        const mergedProfile = this.mergeProfileData(
          existingProfile,
          extractionResult.extractedMemory!,
          extractionResult.confidence
        );

        // Save updated profile
        const saveSuccess = await this.saveUserProfile(mergedProfile);
        
        if (saveSuccess) {
          this.emitEvent({
            type: 'memory_extracted',
            data: {
              extractedMemory: extractionResult.extractedMemory,
              confidence: extractionResult.confidence,
              reasoning: extractionResult.reasoning,
              profileVersion: mergedProfile.version
            },
            profileId: mergedProfile.id,
            confidence: extractionResult.confidence
          });

          console.log(`🧠 Memory processing completed successfully (confidence: ${extractionResult.confidence})`);
          return true;
        }

        return false;
      } finally {
        this.processingQueue.delete(messageId);
        this.emitEvent({
          type: 'processing_completed',
          data: { messageId }
        });
      }

    } catch (error) {
      console.error('🧠 Memory processing failed:', error);
      this.emitEvent({
        type: 'memory_error',
        error: error instanceof Error ? error.message : 'Unknown processing error'
      });
      return false;
    }
  }

  private shouldProcessConversation(
    userMessage: string,
    assistantMessage: angelaMessage
  ): boolean {
    const { extraction, features } = this.config;

    // Check if auto-processing is enabled
    if (!features.enableAutoProcessing) {
      return false;
    }

    // Check message size
    if (userMessage.length > extraction.maxRequestSize!) {
      console.log(`🧠 Message too large (${userMessage.length} chars)`);
      return false;
    }

    // Check token speed if available
    const tokenSpeed = assistantMessage.metadata?.timings?.predicted_per_second || 0;
    if (tokenSpeed > 0 && tokenSpeed < extraction.minTokenSpeed!) {
      console.log(`🧠 Token speed too low (${tokenSpeed} tokens/sec)`);
      return false;
    }

    // Check rate limiting
    if (extraction.enableRateLimiting) {
      const timeSinceLastProcess = Date.now() - this.lastProcessedTime;
      if (timeSinceLastProcess < extraction.rateLimitInterval!) {
        console.log(`🧠 Rate limit active (${Math.round(timeSinceLastProcess / 1000)}s since last)`);
        return false;
      }
    }

    // Check if already processing this message
    if (this.processingQueue.has(assistantMessage.id)) {
      console.log('🧠 Already processing this message');
      return false;
    }

    return true;
  }

  private async extractMemoryFromConversation(
    userMessage: string,
    assistantMessage: angelaMessage,
    conversationHistory: angelaMessage[],
    aiConfig?: angelaAIConfig
  ): Promise<MemoryExtractionResponse | null> {
    // This will use the existing angelaSweetMemory extraction logic
    // Import the existing extraction function
    const { angelaSweetMemoryAPI } = await import('../components/angelaSweetMemory');
    
    try {
      // We need to call the actual extraction function since angelaSweetMemory component
      // doesn't expose the extractMemoryData function through the API
      // For now, let's trigger the processMemory and then check if new data was saved
      
      const profileBefore = await this.getUserProfile();
      const versionBefore = profileBefore?.version || 0;
      
      // Process the memory using the existing component
      await angelaSweetMemoryAPI.processMemory(
        userMessage,
        assistantMessage,
        conversationHistory,
        aiConfig
      );
      
      // Check if the profile was updated
      const profileAfter = await this.getUserProfile();
      const versionAfter = profileAfter?.version || 0;
      
      if (versionAfter > versionBefore && profileAfter) {
        // Memory was extracted and profile updated
        return {
          hasMemoryData: true,
          extractedMemory: profileAfter,
          confidence: profileAfter.metadata?.confidenceLevel || 0.7,
          reasoning: 'Memory extracted and profile updated successfully'
        };
      }
      
      return {
        hasMemoryData: false,
        confidence: 0,
        reasoning: 'No new memory data found in conversation'
      };
      
    } catch (error) {
      console.error('🧠 AI extraction failed:', error);
      return null;
    }
  }

  private mergeProfileData(
    existingProfile: UserMemoryProfile | null,
    extractedData: Partial<UserMemoryProfile>,
    confidence: number
  ): UserMemoryProfile {
    const now = new Date().toISOString();
    const profileId = existingProfile?.id || `profile_${Date.now()}`;

    // Create new profile if none exists
    if (!existingProfile) {
      return {
        id: profileId,
        userId: this.USER_ID,
        coreIdentity: extractedData.coreIdentity || {},
        personalCharacteristics: extractedData.personalCharacteristics || {},
        preferences: extractedData.preferences || {},
        relationship: extractedData.relationship || {},
        interactions: extractedData.interactions || {},
        context: extractedData.context || {},
        emotional: extractedData.emotional || {},
        practical: extractedData.practical || {},
        metadata: {
          confidenceLevel: confidence,
          source: 'direct_conversation',
          extractedAt: now,
          lastUpdated: now,
          relevanceScore: confidence
        },
        version: 1,
        createdAt: now,
        updatedAt: now
      };
    }

    // Merge with existing profile
    return {
      ...existingProfile,
      coreIdentity: { ...existingProfile.coreIdentity, ...extractedData.coreIdentity },
      personalCharacteristics: { ...existingProfile.personalCharacteristics, ...extractedData.personalCharacteristics },
      preferences: { ...existingProfile.preferences, ...extractedData.preferences },
      relationship: { ...existingProfile.relationship, ...extractedData.relationship },
      interactions: { ...existingProfile.interactions, ...extractedData.interactions },
      context: { ...existingProfile.context, ...extractedData.context },
      emotional: { ...existingProfile.emotional, ...extractedData.emotional },
      practical: { ...existingProfile.practical, ...extractedData.practical },
      metadata: {
        ...existingProfile.metadata,
        confidenceLevel: Math.max(existingProfile.metadata.confidenceLevel, confidence),
        lastUpdated: now,
        relevanceScore: Math.max(existingProfile.metadata.relevanceScore, confidence)
      },
      version: existingProfile.version + 1,
      updatedAt: now
    };
  }

  // ==================== UTILITY METHODS ====================

  public async getMemoryStats(): Promise<{
    hasProfile: boolean;
    profileVersion: number;
    lastUpdated: string | null;
    confidenceLevel: number;
    totalSections: number;
    completedSections: number;
  }> {
    try {
      const profile = await this.getUserProfile();
      
      if (!profile) {
        return {
          hasProfile: false,
          profileVersion: 0,
          lastUpdated: null,
          confidenceLevel: 0,
          totalSections: 8,
          completedSections: 0
        };
      }

      // Count completed sections
      const sections = [
        profile.coreIdentity,
        profile.personalCharacteristics,
        profile.preferences,
        profile.relationship,
        profile.interactions,
        profile.context,
        profile.emotional,
        profile.practical
      ];

      const completedSections = sections.filter(section => 
        section && Object.keys(section).length > 0
      ).length;

      return {
        hasProfile: true,
        profileVersion: profile.version,
        lastUpdated: profile.updatedAt,
        confidenceLevel: profile.metadata.confidenceLevel,
        totalSections: 8,
        completedSections
      };
    } catch (error) {
      console.error('🧠 Failed to get memory stats:', error);
      return {
        hasProfile: false,
        profileVersion: 0,
        lastUpdated: null,
        confidenceLevel: 0,
        totalSections: 8,
        completedSections: 0
      };
    }
  }

  public isProcessing(): boolean {
    return this.processingQueue.size > 0;
  }

  public getProcessingQueue(): string[] {
    return Array.from(this.processingQueue);
  }

  // ==================== LEGACY MIGRATION ====================

  public async migrateLegacyData(): Promise<boolean> {
    try {
      // Check for old anonymous profile and migrate if needed
      const legacyKey = 'angela_user_memory_anonymous';
      const legacyResult = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', legacyKey);
      
      if (legacyResult?.value) {
        console.log('🧠 Found legacy anonymous profile, migrating...');
        
        // Update user ID and save under new key
        const migratedProfile = {
          ...legacyResult.value,
          userId: this.USER_ID,
          version: legacyResult.value.version + 1,
          updatedAt: new Date().toISOString(),
          metadata: {
            ...legacyResult.value.metadata,
            lastUpdated: new Date().toISOString()
          }
        };

        const success = await this.saveUserProfile(migratedProfile);
        
        if (success) {
          // Delete old data
          await indexedDBService.delete('settings', legacyKey);
          console.log('🧠 Legacy data migrated successfully');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('🧠 Legacy migration failed:', error);
      return false;
    }
  }
}

// ==================== SINGLETON EXPORT ====================

export const angelaMemoryManager = angelaMemoryManager.getInstance();
export default angelaMemoryManager;
