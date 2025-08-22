/**
 * useMemoryManager.ts
 * 
 * React hook for integrating with angela's memory management system.
 * Provides reactive state management and event-driven updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { angelaMemoryManager, type MemoryEvent } from '../services/angelaMemoryManager';
import { UserMemoryProfile } from '../components/angelaSweetMemory';
import type { angelaMessage, angelaAIConfig } from '../types/angela_assistant_types';

export interface MemoryManagerState {
  profile: UserMemoryProfile | null;
  isProcessing: boolean;
  stats: {
    hasProfile: boolean;
    profileVersion: number;
    lastUpdated: string | null;
    confidenceLevel: number;
    totalSections: number;
    completedSections: number;
  };
  lastEvent: MemoryEvent | null;
}

export interface MemoryManagerActions {
  processConversation: (
    userMessage: string,
    assistantMessage: angelaMessage,
    conversationHistory?: angelaMessage[],
    aiConfig?: angelaAIConfig
  ) => Promise<boolean>;
  getUserProfile: () => Promise<UserMemoryProfile | null>;
  deleteProfile: () => Promise<boolean>;
  createBackup: () => Promise<string | null>;
  restoreFromBackup: (backup: string) => Promise<boolean>;
  migrateLegacyData: () => Promise<boolean>;
  refreshStats: () => Promise<void>;
}

export function useMemoryManager(): [MemoryManagerState, MemoryManagerActions] {
  const [state, setState] = useState<MemoryManagerState>({
    profile: null,
    isProcessing: false,
    stats: {
      hasProfile: false,
      profileVersion: 0,
      lastUpdated: null,
      confidenceLevel: 0,
      totalSections: 8,
      completedSections: 0
    },
    lastEvent: null
  });

  // Update stats
  const refreshStats = useCallback(async () => {
    try {
      const stats = await angelaMemoryManager.getMemoryStats();
      setState(prev => ({ ...prev, stats }));
    } catch (error) {
      console.error('Failed to refresh memory stats:', error);
    }
  }, []);

  // Memory manager actions
  const actions: MemoryManagerActions = {
    processConversation: useCallback(async (
      userMessage: string,
      assistantMessage: angelaMessage,
      conversationHistory: angelaMessage[] = [],
      aiConfig?: angelaAIConfig
    ) => {
      try {
        return await angelaMemoryManager.processConversation(
          userMessage,
          assistantMessage,
          conversationHistory,
          aiConfig
        );
      } catch (error) {
        console.error('Failed to process conversation:', error);
        return false;
      }
    }, []),

    getUserProfile: useCallback(async () => {
      try {
        const profile = await angelaMemoryManager.getUserProfile();
        setState(prev => ({ ...prev, profile }));
        return profile;
      } catch (error) {
        console.error('Failed to get user profile:', error);
        return null;
      }
    }, []),

    deleteProfile: useCallback(async () => {
      try {
        const success = await angelaMemoryManager.deleteUserProfile();
        if (success) {
          setState(prev => ({ 
            ...prev, 
            profile: null,
            stats: {
              hasProfile: false,
              profileVersion: 0,
              lastUpdated: null,
              confidenceLevel: 0,
              totalSections: 8,
              completedSections: 0
            }
          }));
        }
        return success;
      } catch (error) {
        console.error('Failed to delete profile:', error);
        return false;
      }
    }, []),

    createBackup: useCallback(async () => {
      try {
        return await angelaMemoryManager.createBackup();
      } catch (error) {
        console.error('Failed to create backup:', error);
        return null;
      }
    }, []),

    restoreFromBackup: useCallback(async (backup: string) => {
      try {
        const success = await angelaMemoryManager.restoreFromBackup(backup);
        if (success) {
          // Refresh profile and stats after restore
          const profile = await angelaMemoryManager.getUserProfile();
          const stats = await angelaMemoryManager.getMemoryStats();
          setState(prev => ({ ...prev, profile, stats }));
        }
        return success;
      } catch (error) {
        console.error('Failed to restore from backup:', error);
        return false;
      }
    }, []),

    migrateLegacyData: useCallback(async () => {
      try {
        const success = await angelaMemoryManager.migrateLegacyData();
        if (success) {
          // Refresh profile and stats after migration
          const profile = await angelaMemoryManager.getUserProfile();
          const stats = await angelaMemoryManager.getMemoryStats();
          setState(prev => ({ ...prev, profile, stats }));
        }
        return success;
      } catch (error) {
        console.error('Failed to migrate legacy data:', error);
        return false;
      }
    }, []),

    refreshStats
  };

  // Initialize and listen to memory events
  useEffect(() => {
    let isMounted = true;

    // Handle memory events
    const handleMemoryEvent = (event: MemoryEvent) => {
      if (!isMounted) return;

      setState(prev => ({ ...prev, lastEvent: event }));

      switch (event.type) {
        case 'processing_started':
          setState(prev => ({ ...prev, isProcessing: true }));
          break;

        case 'processing_completed':
          setState(prev => ({ ...prev, isProcessing: false }));
          break;

        case 'profile_updated':
          setState(prev => ({ 
            ...prev, 
            profile: event.data,
            isProcessing: false 
          }));
          // Refresh stats when profile is updated
          refreshStats();
          break;

        case 'memory_extracted':
          // Profile will be updated by profile_updated event
          console.log('🧠 Memory extracted:', event.data);
          break;

        case 'memory_error':
          setState(prev => ({ ...prev, isProcessing: false }));
          console.error('🧠 Memory error:', event.error);
          break;
      }
    };

    // Subscribe to memory events
    const unsubscribe = angelaMemoryManager.addEventListener(handleMemoryEvent);

    // Initial data load
    const initializeData = async () => {
      try {
        // Try to migrate legacy data first
        await angelaMemoryManager.migrateLegacyData();
        
        // Load current profile and stats
        const [profile, stats] = await Promise.all([
          angelaMemoryManager.getUserProfile(),
          angelaMemoryManager.getMemoryStats()
        ]);

        if (isMounted) {
          setState(prev => ({
            ...prev,
            profile,
            stats,
            isProcessing: angelaMemoryManager.isProcessing()
          }));
        }
      } catch (error) {
        console.error('Failed to initialize memory data:', error);
      }
    };

    initializeData();

    // Cleanup
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [refreshStats]);

  return [state, actions];
}

export default useMemoryManager;
