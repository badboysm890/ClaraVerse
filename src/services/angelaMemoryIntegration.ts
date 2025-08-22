/**
 * angelaMemoryIntegration.ts
 * 
 * Integration service to bridge between the new memory manager and existing angela systems.
 * Provides backward compatibility while enabling the new architecture.
 */

import { angelaMemoryManager } from './angelaMemoryManager';
import { UserMemoryProfile } from '../components/angelaSweetMemory';
import type { angelaMessage, angelaAIConfig } from '../types/angela_assistant_types';

class angelaMemoryIntegration {
  private static instance: angelaMemoryIntegration;

  private constructor() {}

  public static getInstance(): angelaMemoryIntegration {
    if (!angelaMemoryIntegration.instance) {
      angelaMemoryIntegration.instance = new angelaMemoryIntegration();
    }
    return angelaMemoryIntegration.instance;
  }

  /**
   * Enhanced system prompt with memory data
   * Uses the new memory manager instead of direct API calls
   */
  public async enhanceSystemPromptWithMemory(
    basePrompt: string,
    _userInfo?: { name?: string; email?: string; timezone?: string }
  ): Promise<string> {
    try {
      // Get memory profile from the new memory manager
      const memoryProfile = await angelaMemoryManager.getUserProfile();
      if (!memoryProfile) {
        return basePrompt;
      }

      console.log('🧠 System Prompt: Enhancing with user memory data (via Memory Manager)');
      
      /**
       * Safely convert any value to a readable string, handling objects dynamically
       */
      const safeToString = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) {
          return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(', ');
        }
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return '[Complex Object]';
          }
        }
        return String(value);
      };

      /**
       * Dynamically process a data section
       */
      const processSection = (sectionData: any, sectionTitle: string): string => {
        if (!sectionData || typeof sectionData !== 'object') return '';
        
        const entries = Object.entries(sectionData)
          .filter(([_key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => {
            const readableKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const readableValue = safeToString(value);
            return `- **${readableKey}**: ${readableValue}`;
          });

        return entries.length > 0 ? `### ${sectionTitle}\n${entries.join('\n')}\n` : '';
      };

      let memoryContext = `\n## 🧠 PERSONAL MEMORY\n`;
      let hasMemoryData = false;
      
      // **DYNAMIC SECTION DISCOVERY**: Automatically detect all memory categories
      const sections = [];
      const skipFields = ['id', 'userId', 'metadata', 'version', 'createdAt', 'updatedAt'];
      
      // Map of field names to human-readable titles
      const titleMap: { [key: string]: string } = {
        coreIdentity: 'Personal Identity',
        personalCharacteristics: 'Personal Traits',
        preferences: 'Preferences',
        relationship: 'Relationship Context',
        interactions: 'Interaction History',
        context: 'Current Context',
        emotional: 'Emotional & Social Intelligence',
        practical: 'Practical Information',
        skills: 'Skills & Expertise',
        social: 'Social Networks',
        professional: 'Professional Context',
        learning: 'Learning & Development',
        health: 'Health & Wellness',
        financial: 'Financial Context',
        travel: 'Travel & Location',
        communication: 'Communication Patterns'
      };
      
      // Dynamically discover all memory sections from the profile
      for (const [fieldName, fieldData] of Object.entries(memoryProfile)) {
        if (skipFields.includes(fieldName)) continue;
        
        const title = titleMap[fieldName] || fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        sections.push({ fieldName, title, data: fieldData });
      }

      console.log(`🧠 Dynamic Memory Discovery: Found ${sections.length} memory sections:`, 
                  sections.map(s => `${s.fieldName} → "${s.title}"`));

      for (const section of sections) {
        const sectionContent = processSection(section.data, section.title);
        if (sectionContent) {
          memoryContext += sectionContent + '\n';
          hasMemoryData = true;
        }
      }
      
      if (hasMemoryData) {
        memoryContext += `**This is personal information about the user. Use it to provide more personalized, relevant responses. Always respect their privacy and preferences.**\n\n`;
        return basePrompt + memoryContext;
      }
      
      return basePrompt;
    } catch (error) {
      console.error('🧠 System Prompt: Failed to enhance with memory data:', error);
      return basePrompt;
    }
  }

  /**
   * Process conversation for memory extraction
   * Wrapper around the new memory manager
   */
  public async processConversationMemory(
    userMessage: string,
    assistantMessage: angelaMessage,
    conversationHistory: angelaMessage[] = [],
    aiConfig?: angelaAIConfig
  ): Promise<boolean> {
    try {
      console.log('🧠 Processing conversation with Memory Manager...');
      
      return await angelaMemoryManager.processConversation(
        userMessage,
        assistantMessage,
        conversationHistory,
        aiConfig
      );
    } catch (error) {
      console.error('🧠 Failed to process conversation memory:', error);
      return false;
    }
  }

  /**
   * Get current user profile
   * Wrapper around the new memory manager
   */
  public async getCurrentUserProfile(): Promise<UserMemoryProfile | null> {
    try {
      return await angelaMemoryManager.getUserProfile();
    } catch (error) {
      console.error('🧠 Failed to get current user profile:', error);
      return null;
    }
  }

  /**
   * Get memory statistics
   * Useful for UI components that need to show memory status
   */
  public async getMemoryStats() {
    try {
      return await angelaMemoryManager.getMemoryStats();
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

  /**
   * Create memory backup
   */
  public async createBackup(): Promise<string | null> {
    try {
      return await angelaMemoryManager.createBackup();
    } catch (error) {
      console.error('🧠 Failed to create memory backup:', error);
      return null;
    }
  }

  /**
   * Restore from backup
   */
  public async restoreFromBackup(backup: string): Promise<boolean> {
    try {
      return await angelaMemoryManager.restoreFromBackup(backup);
    } catch (error) {
      console.error('🧠 Failed to restore from backup:', error);
      return false;
    }
  }

  /**
   * Delete user profile
   */
  public async deleteUserProfile(): Promise<boolean> {
    try {
      return await angelaMemoryManager.deleteUserProfile();
    } catch (error) {
      console.error('🧠 Failed to delete user profile:', error);
      return false;
    }
  }

  /**
   * Migrate legacy data
   */
  public async migrateLegacyData(): Promise<boolean> {
    try {
      return await angelaMemoryManager.migrateLegacyData();
    } catch (error) {
      console.error('🧠 Failed to migrate legacy data:', error);
      return false;
    }
  }

  /**
   * Subscribe to memory events
   */
  public addEventListener(listener: (event: any) => void): () => void {
    return angelaMemoryManager.addEventListener(listener);
  }

  /**
   * Check if memory extraction is currently processing
   */
  public isProcessing(): boolean {
    return angelaMemoryManager.isProcessing();
  }

  /**
   * Update memory manager configuration
   */
  public updateConfig(config: any): void {
    angelaMemoryManager.updateConfig(config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): any {
    return angelaMemoryManager.getConfig();
  }
}

// ==================== SINGLETON EXPORT ====================

export const angelaMemoryIntegration = angelaMemoryIntegration.getInstance();
export default angelaMemoryIntegration;
