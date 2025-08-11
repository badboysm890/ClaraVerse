/**
 * ClaraMemoryToastService.tsx
 * 
 * Service to manage Clara's memory learning toast notifications.
 * Handles cooldown periods, knowledge level tracking, and toast state management.
 */

import { UserMemoryProfile } from '../components/ClaraSweetMemory';

// ==================== INTERFACES ====================

interface MemoryToastState {
  isVisible: boolean;
  knowledgeLevel: number;
  learnedInfo?: string;
  lastShownAt: number;
}

type MemoryToastListener = (state: MemoryToastState) => void;

// ==================== CONSTANTS ====================

const COOLDOWN_PERIOD = 60000; // 60 seconds in milliseconds
const STORAGE_KEY = 'clara-memory-toast-state';
const KNOWLEDGE_LEVEL_KEY = 'clara-knowledge-level';

// Production mode - debug functionality removed

// ==================== SERVICE CLASS ====================

class ClaraMemoryToastService {
  private state: MemoryToastState = {
    isVisible: false,
    knowledgeLevel: 0,
    lastShownAt: 0
  };

  private listeners: Set<MemoryToastListener> = new Set();
  private knowledgeLevel: number = 0;

  constructor() {
    this.loadState();
    this.loadKnowledgeLevel();
  }

  /**
   * Calculate knowledge level based on memory profile completeness
   */
  private calculateKnowledgeLevel(profile: UserMemoryProfile): number {
    let totalPossibleSections = 8; // Number of memory sections
    let completedSections = 0;
    let totalFields = 0;
    let completedFields = 0;

    // Core Identity (weight: 2x)
    const coreFields = ['fullName', 'firstName', 'preferredName', 'email', 'age', 'location', 'occupation'];
    const coreCompleted = coreFields.filter(field => profile.coreIdentity?.[field as keyof typeof profile.coreIdentity]).length;
    totalFields += coreFields.length * 2; // Double weight
    completedFields += coreCompleted * 2;
    if (coreCompleted > 0) completedSections++;

    // Personal Characteristics (including interests and technology info)
    const personalFields = ['interests', 'hobbies', 'values', 'personalityTraits', 'communicationStyle'];
    const personalCompleted = personalFields.filter(field => {
      const value = profile.personalCharacteristics?.[field as keyof typeof profile.personalCharacteristics];
      return Array.isArray(value) ? value.length > 0 : !!value;
    }).length;
    
    // Count additional dynamic fields in personalCharacteristics
    const additionalPersonalFields = Object.keys(profile.personalCharacteristics || {}).filter(
      key => !personalFields.includes(key)
    ).length;
    
    totalFields += personalFields.length;
    completedFields += personalCompleted + Math.min(additionalPersonalFields, 3); // Cap bonus fields
    if (personalCompleted > 0 || additionalPersonalFields > 0) completedSections++;

    // Preferences
    const prefFields = ['communicationPreferences', 'workStyle', 'lifestylePreferences'];
    const prefCompleted = prefFields.filter(field => {
      const value = profile.preferences?.[field as keyof typeof profile.preferences];
      return value && Object.keys(value).length > 0;
    }).length;
    totalFields += prefFields.length;
    completedFields += prefCompleted;
    if (prefCompleted > 0) completedSections++;

    // Context Information
    const contextFields = ['lifeStage', 'professionalContext'];
    const contextCompleted = contextFields.filter(field => {
      const value = profile.context?.[field as keyof typeof profile.context];
      return value && (typeof value === 'string' ? !!value : Object.keys(value).length > 0);
    }).length;
    totalFields += contextFields.length;
    completedFields += contextCompleted;
    if (contextCompleted > 0) completedSections++;

    // Interactions
    const interactionFields = ['conversationTopics', 'expertiseAreas', 'supportNeeds'];
    const interactionCompleted = interactionFields.filter(field => {
      const value = profile.interactions?.[field as keyof typeof profile.interactions];
      return Array.isArray(value) ? value.length > 0 : !!value;
    }).length;
    totalFields += interactionFields.length;
    completedFields += interactionCompleted;
    if (interactionCompleted > 0) completedSections++;

    // Practical Information (including technology and work context)
    const practicalFields = ['skills', 'timeZone', 'importantDates'];
    const practicalCompleted = practicalFields.filter(field => {
      const value = profile.practical?.[field as keyof typeof profile.practical];
      return Array.isArray(value) ? value.length > 0 : value && Object.keys(value).length > 0;
    }).length;
    
    // Count dynamic practical fields (like workContext_hardware, personalDevices)
    const additionalPracticalFields = Object.keys(profile.practical || {}).filter(
      key => !practicalFields.includes(key)
    ).length;
    
    totalFields += practicalFields.length;
    completedFields += practicalCompleted + Math.min(additionalPracticalFields, 5); // Cap bonus fields
    if (practicalCompleted > 0 || additionalPracticalFields > 0) completedSections++;

    // Relationship Information
    const relationshipFields = ['familyMembers', 'friends', 'significantOthers'];
    const relationshipCompleted = Object.keys(profile.relationship || {}).length;
    totalFields += relationshipFields.length;
    completedFields += Math.min(relationshipCompleted, relationshipFields.length);
    if (relationshipCompleted > 0) completedSections++;

    // Emotional Information
    const emotionalFields = ['currentMood', 'recentEvents', 'emotionalState'];
    const emotionalCompleted = Object.keys(profile.emotional || {}).length;
    totalFields += emotionalFields.length;
    completedFields += Math.min(emotionalCompleted, emotionalFields.length);
    if (emotionalCompleted > 0) completedSections++;

    // Calculate knowledge level (0-100) with more granular scoring
    const sectionScore = (completedSections / totalPossibleSections) * 40; // 40% weight to section diversity
    const fieldScore = (completedFields / totalFields) * 50; // 50% weight to field completeness
    const profileMaturityBonus = Math.min(10, profile.version * 0.5); // Bonus for profile maturity
    
    const knowledgeLevel = Math.min(100, Math.round(sectionScore + fieldScore + profileMaturityBonus));

    return knowledgeLevel;
  }

  /**
   * Extract a brief description of what was learned from the profile
   */
  private extractLearnedInfo(profile: UserMemoryProfile): string {
    const recentInfo: string[] = [];

    // Check core identity for interesting tidbits
    if (profile.coreIdentity?.preferredName && profile.coreIdentity.preferredName !== profile.coreIdentity.fullName) {
      recentInfo.push(`prefers to be called ${profile.coreIdentity.preferredName}`);
    }
    if (profile.coreIdentity?.occupation) {
      recentInfo.push(`works as a ${profile.coreIdentity.occupation}`);
    }
    if (profile.coreIdentity?.location) {
      recentInfo.push(`lives in ${profile.coreIdentity.location}`);
    }

    // Check hobbies and interests
    if (profile.personalCharacteristics?.hobbies?.length) {
      const hobbies = profile.personalCharacteristics.hobbies.slice(0, 2).join(' & ');
      recentInfo.push(`enjoys ${hobbies}`);
    }
    if (profile.personalCharacteristics?.interests?.length) {
      const interests = profile.personalCharacteristics.interests.slice(0, 2).join(' & ');
      recentInfo.push(`interested in ${interests}`);
    }

    // Check personality traits
    if (profile.personalCharacteristics?.personalityTraits?.length) {
      const trait = profile.personalCharacteristics.personalityTraits[0];
      recentInfo.push(`has a ${trait} personality`);
    }

    // Check communication style
    if (profile.personalCharacteristics?.communicationStyle) {
      recentInfo.push(`prefers ${profile.personalCharacteristics.communicationStyle} communication`);
    }

    // Check work style
    if (profile.preferences?.workStyle?.environment) {
      recentInfo.push(`works in a ${profile.preferences.workStyle.environment} environment`);
    }

    // Return a random selection or combine a few
    if (recentInfo.length === 0) {
      return 'something interesting about your personality';
    }

    if (recentInfo.length === 1) {
      return recentInfo[0];
    }

    // Pick 1-2 random items
    const selectedInfo = recentInfo
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(2, recentInfo.length));

    return selectedInfo.join(' and ');
  }

  /**
   * Check if enough time has passed since last toast
   */
  private isOnCooldown(): boolean {
    return Date.now() - this.state.lastShownAt < COOLDOWN_PERIOD;
  }

  /**
   * Show memory learning toast if conditions are met
   */
  public showMemoryToast(profile: UserMemoryProfile): boolean {
    // Check cooldown
    if (this.isOnCooldown()) {
      return false;
    }

    // Calculate new knowledge level
    const newKnowledgeLevel = this.calculateKnowledgeLevel(profile);
    
    // Only show if knowledge level increased significantly
    if (newKnowledgeLevel <= this.knowledgeLevel + 5) {
      return false;
    }

    // Extract what was learned
    const learnedInfo = this.extractLearnedInfo(profile);

    // Update state
    this.state = {
      isVisible: true,
      knowledgeLevel: newKnowledgeLevel,
      learnedInfo,
      lastShownAt: Date.now()
    };

    // Save the new knowledge level
    this.knowledgeLevel = newKnowledgeLevel;
    this.saveKnowledgeLevel();
    this.saveState();

    // Notify listeners
    this.notifyListeners();

    return true;
  }

  /**
   * Hide the memory toast
   */
  public hideMemoryToast(): void {
    this.state = {
      ...this.state,
      isVisible: false
    };

    this.saveState();
    this.notifyListeners();
  }

  /**
   * Get current toast state
   */
  public getState(): MemoryToastState {
    return { ...this.state };
  }

  /**
   * Get current knowledge level
   */
  public getKnowledgeLevel(): number {
    return this.knowledgeLevel;
  }

  /**
   * Reset knowledge level (for testing or user preference)
   */
  public resetKnowledgeLevel(): void {
    this.knowledgeLevel = 0;
    this.saveKnowledgeLevel();
    
    this.state = {
      ...this.state,
      knowledgeLevel: 0
    };
    
    this.saveState();
    this.notifyListeners();
  }

  /**
   * Subscribe to toast state changes
   */
  public subscribe(listener: MemoryToastListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('Error notifying memory toast listener:', error);
      }
    });
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lastShownAt: this.state.lastShownAt,
        knowledgeLevel: this.state.knowledgeLevel
      }));
    } catch (error) {
      console.warn('Failed to save memory toast state:', error);
    }
  }

  /**
   * Load state from localStorage
   */
  private loadState(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = {
          isVisible: false, // Never restore visibility
          knowledgeLevel: parsed.knowledgeLevel || 0,
          lastShownAt: parsed.lastShownAt || 0
        };
      }
    } catch (error) {
      console.warn('Failed to load memory toast state:', error);
    }
  }

  /**
   * Save knowledge level separately for persistence
   */
  private saveKnowledgeLevel(): void {
    try {
      localStorage.setItem(KNOWLEDGE_LEVEL_KEY, this.knowledgeLevel.toString());
    } catch (error) {
      console.warn('Failed to save knowledge level:', error);
    }
  }

  /**
   * Load knowledge level from localStorage
   */
  private loadKnowledgeLevel(): void {
    try {
      const saved = localStorage.getItem(KNOWLEDGE_LEVEL_KEY);
      if (saved) {
        this.knowledgeLevel = parseInt(saved, 10) || 0;
      }
    } catch (error) {
      console.warn('Failed to load knowledge level:', error);
    }
  }

  /**
   * Get time remaining on cooldown (in seconds)
   */
  public getCooldownRemaining(): number {
    const remaining = COOLDOWN_PERIOD - (Date.now() - this.state.lastShownAt);
    return Math.max(0, Math.ceil(remaining / 1000));
  }
}

// ==================== EXPORTS ====================

// Export singleton instance
export const claraMemoryToastService = new ClaraMemoryToastService();

// Export types
export type { MemoryToastState, MemoryToastListener };
