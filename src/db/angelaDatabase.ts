import { angelaDatabaseService } from '../services/angelaDatabase';
import { angelaChatSession, angelaMessage, angelaFileAttachment } from '../types/angela_assistant_types';

/**
 * angela Database Helper
 * Provides convenient methods for angela chat persistence
 */
export class angelaDatabase {
  /**
   * Generate a unique ID for messages/sessions
   */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Create a new angela chat session
   */
  async createangelaSession(title: string): Promise<angelaChatSession> {
    const session: angelaChatSession = {
      id: this.generateId(),
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isStarred: false,
      isArchived: false
    };

    await angelaDatabaseService.saveSession(session);
    return session;
  }

  /**
   * Get a angela chat session by ID
   */
  async getangelaSession(sessionId: string): Promise<angelaChatSession | null> {
    return await angelaDatabaseService.getSession(sessionId);
  }

  /**
   * Save/Update a angela chat session
   */
  async saveangelaSession(session: angelaChatSession): Promise<void> {
    await angelaDatabaseService.saveSession(session);
  }

  /**
   * Update angela session metadata
   */
  async updateangelaSession(sessionId: string, updates: Partial<angelaChatSession>): Promise<void> {
    await angelaDatabaseService.updateSession(sessionId, updates);
  }

  /**
   * Delete a angela chat session
   */
  async deleteangelaSession(sessionId: string): Promise<void> {
    await angelaDatabaseService.deleteSession(sessionId);
  }

  /**
   * Get recent angela chat sessions
   */
  async getRecentangelaSessions(limit: number = 20): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.getRecentSessions(limit);
  }

  /**
   * Get recent angela chat sessions without messages (for fast loading)
   */
  async getRecentangelaSessionsLight(limit: number = 20, offset: number = 0): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.getRecentSessionsLight(limit, offset);
  }

  /**
   * Get all angela chat sessions
   */
  async getAllangelaSessions(): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.getAllSessions();
  }

  /**
   * Get starred angela sessions
   */
  async getStarredangelaSessions(): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.getStarredSessions();
  }

  /**
   * Get archived angela sessions
   */
  async getArchivedangelaSessions(): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.getArchivedSessions();
  }

  /**
   * Search angela sessions
   */
  async searchangelaSessions(query: string): Promise<angelaChatSession[]> {
    return await angelaDatabaseService.searchSessions(query);
  }

  /**
   * Add a message to a angela session
   */
  async addangelaMessage(sessionId: string, message: angelaMessage): Promise<void> {
    await angelaDatabaseService.saveMessage(sessionId, message);
    
    // Update session's updatedAt timestamp
    await angelaDatabaseService.updateSession(sessionId, {
      updatedAt: new Date()
    });
  }

  /**
   * Update a message in a angela session
   */
  async updateangelaMessage(sessionId: string, messageId: string, updates: Partial<angelaMessage>): Promise<void> {
    await angelaDatabaseService.updateMessage(sessionId, messageId, updates);
    
    // Update session's updatedAt timestamp
    await angelaDatabaseService.updateSession(sessionId, {
      updatedAt: new Date()
    });
  }

  /**
   * Delete a message from a angela session
   */
  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    await angelaDatabaseService.deleteMessage(sessionId, messageId);
    
    // Update session's updatedAt timestamp
    await angelaDatabaseService.updateSession(sessionId, {
      updatedAt: new Date()
    });
  }

  /**
   * Get angela storage statistics
   */
  async getangelaStorageStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalFiles: number;
    totalSize: number;
  }> {
    return await angelaDatabaseService.getStorageStats();
  }

  /**
   * Clear all angela chat sessions, messages, and files
   * WARNING: This will permanently delete all chat history
   */
  async clearAllangelaSessions(): Promise<void> {
    return await angelaDatabaseService.clearAllSessions();
  }

  /**
   * Debug data integrity and check for orphaned data
   */
  async debugDataIntegrity(): Promise<{
    sessions: number;
    messages: number;
    files: number;
    orphanedMessages: number;
    orphanedFiles: number;
  }> {
    return await angelaDatabaseService.debugDataIntegrity();
  }

  /**
   * Clean up orphaned data (messages without sessions, files without messages)
   */
  async cleanupOrphanedData(): Promise<void> {
    return await angelaDatabaseService.cleanupOrphanedData();
  }
}

// Export singleton instance
export const angelaDB = new angelaDatabase(); 
