import { indexedDBService } from './indexedDB';
import { 
  angelaChatSession, 
  angelaMessage, 
  angelaFileAttachment,
  angelaArtifact 
} from '../types/angela_assistant_types';

export interface angelaChatSessionRecord extends Omit<angelaChatSession, 'createdAt' | 'updatedAt'> {
  createdAt: string; // Store as ISO string for IndexedDB
  updatedAt: string;
}

export interface angelaMessageRecord extends Omit<angelaMessage, 'timestamp'> {
  sessionId: string; // Reference to the session
  timestamp: string; // Store as ISO string for IndexedDB
}

export interface angelaFileRecord {
  id: string;
  sessionId: string;
  messageId: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  content: string; // Base64 for small files or blob URL for large files
  thumbnail?: string; // Base64 thumbnail for images
  processed: boolean;
  createdAt: string;
}

/**
 * Database service specifically for angela chat sessions
 * Handles persistence of chat sessions, messages, and file attachments
 */
export class angelaDatabaseService {
  private readonly SESSIONS_STORE = 'angela_sessions';
  private readonly MESSAGES_STORE = 'angela_messages';
  private readonly FILES_STORE = 'angela_files';

  /**
   * Save a chat session to the database
   */
  async saveSession(session: angelaChatSession): Promise<void> {
    const sessionRecord: angelaChatSessionRecord = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: [] // Don't store messages in the session record, they're separate
    };

    await indexedDBService.put(this.SESSIONS_STORE, sessionRecord);

    // Save all messages for this session
    for (const message of session.messages) {
      await this.saveMessage(session.id, message);
    }
  }

  /**
   * Save a message to the database
   */
  async saveMessage(sessionId: string, message: angelaMessage): Promise<void> {
    const messageRecord: angelaMessageRecord = {
      ...message,
      sessionId,
      timestamp: message.timestamp.toISOString()
    };

    await indexedDBService.put(this.MESSAGES_STORE, messageRecord);

    // Save file attachments if any
    if (message.attachments) {
      for (const attachment of message.attachments) {
        await this.saveFile(sessionId, message.id, attachment);
      }
    }
  }

  /**
   * Save a file attachment to the database
   */
  async saveFile(sessionId: string, messageId: string, file: angelaFileAttachment): Promise<void> {
    const fileRecord: angelaFileRecord = {
      id: file.id,
      sessionId,
      messageId,
      name: file.name,
      type: file.type,
      size: file.size,
      mimeType: file.mimeType,
      content: file.base64 || file.url || '',
      thumbnail: file.thumbnail,
      processed: file.processed || false,
      createdAt: new Date().toISOString()
    };

    await indexedDBService.put(this.FILES_STORE, fileRecord);
  }

  /**
   * Get all chat sessions, ordered by most recent first
   */
  async getAllSessions(includeMessages: boolean = false): Promise<angelaChatSession[]> {
    const sessionRecords = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    
    // Convert back to angelaChatSession objects and sort by updatedAt
    const sessions = sessionRecords
      .map(this.recordToSession)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Load messages if requested
    if (includeMessages) {
      for (const session of sessions) {
        session.messages = await this.getSessionMessages(session.id);
      }
    }

    return sessions;
  }

  /**
   * Get a specific session by ID with all its messages
   */
  async getSession(sessionId: string): Promise<angelaChatSession | null> {
    const sessionRecord = await indexedDBService.get<angelaChatSessionRecord>(this.SESSIONS_STORE, sessionId);
    if (!sessionRecord) return null;

    const session = this.recordToSession(sessionRecord);
    
    // Load all messages for this session
    const messages = await this.getSessionMessages(sessionId);
    session.messages = messages;

    return session;
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(sessionId: string): Promise<angelaMessage[]> {
    const allMessages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    const sessionMessages = allMessages
      .filter(msg => msg.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Convert to angelaMessage objects and load attachments
    const messages: angelaMessage[] = [];
    for (const messageRecord of sessionMessages) {
      const message = await this.recordToMessage(messageRecord);
      messages.push(message);
    }

    return messages;
  }

  /**
   * Get files for a specific message
   */
  async getMessageFiles(messageId: string): Promise<angelaFileAttachment[]> {
    const allFiles = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);
    const messageFiles = allFiles.filter(file => file.messageId === messageId);

    return messageFiles.map(this.recordToFileAttachment);
  }

  /**
   * Update session metadata (title, starred, archived, etc.)
   */
  async updateSession(sessionId: string, updates: Partial<angelaChatSession>): Promise<void> {
    const existingRecord = await indexedDBService.get<angelaChatSessionRecord>(this.SESSIONS_STORE, sessionId);
    if (!existingRecord) throw new Error(`Session ${sessionId} not found`);

    const updatedRecord: angelaChatSessionRecord = {
      ...existingRecord,
      ...updates,
      updatedAt: new Date().toISOString(),
      // Ensure dates are strings
      createdAt: updates.createdAt ? updates.createdAt.toISOString() : existingRecord.createdAt,
    };

    await indexedDBService.put(this.SESSIONS_STORE, updatedRecord);
  }

  /**
   * Update a message in the database
   */
  async updateMessage(sessionId: string, messageId: string, updates: Partial<angelaMessage>): Promise<void> {
    const existingRecord = await indexedDBService.get<angelaMessageRecord>(this.MESSAGES_STORE, messageId);
    if (!existingRecord) throw new Error(`Message ${messageId} not found`);

    const updatedRecord: angelaMessageRecord = {
      ...existingRecord,
      ...updates,
      sessionId, // Ensure session ID is maintained
      timestamp: updates.timestamp ? updates.timestamp.toISOString() : existingRecord.timestamp,
    };

    await indexedDBService.put(this.MESSAGES_STORE, updatedRecord);
  }

  /**
   * Delete a message and its associated files
   */
  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    // Delete all files associated with this message
    const files = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);
    for (const file of files.filter(f => f.messageId === messageId && f.sessionId === sessionId)) {
      await indexedDBService.delete(this.FILES_STORE, file.id);
    }

    // Delete the message itself
    await indexedDBService.delete(this.MESSAGES_STORE, messageId);
  }

  /**
   * Delete a session and all its messages and files
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Delete all messages for this session
    const messages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    for (const message of messages.filter(m => m.sessionId === sessionId)) {
      await indexedDBService.delete(this.MESSAGES_STORE, message.id);
    }

    // Delete all files for this session
    const files = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);
    for (const file of files.filter(f => f.sessionId === sessionId)) {
      await indexedDBService.delete(this.FILES_STORE, file.id);
    }

    // Delete the session itself
    await indexedDBService.delete(this.SESSIONS_STORE, sessionId);
  }

  /**
   * Get recent sessions (for sidebar)
   */
  async getRecentSessions(limit: number = 20): Promise<angelaChatSession[]> {
    const sessionRecords = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    
    // Convert to sessions and sort by updatedAt
    const sessions = sessionRecords
      .map(this.recordToSession)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);

    // Load messages for each session
    for (const session of sessions) {
      session.messages = await this.getSessionMessages(session.id);
    }

    return sessions;
  }

  /**
   * Get recent sessions WITHOUT messages (for lightning-fast loading)
   * But includes message counts for sidebar display
   */
  async getRecentSessionsLight(limit: number = 20, offset: number = 0): Promise<angelaChatSession[]> {
    const sessionRecords = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    const allMessages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    
    // Create a map of session ID to message count for efficient lookup
    const messageCountMap = new Map<string, number>();
    allMessages.forEach(message => {
      const currentCount = messageCountMap.get(message.sessionId) || 0;
      messageCountMap.set(message.sessionId, currentCount + 1);
    });
    
    // Convert to sessions and sort by updatedAt, then apply pagination
    const sessions = sessionRecords
      .map(this.recordToSession)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(offset, offset + limit);

    // Return sessions with empty messages array but include messageCount property
    return sessions.map(session => ({
      ...session,
      messages: [], // Empty array for fast loading
      messageCount: messageCountMap.get(session.id) || 0 // Add message count for sidebar
    }));
  }

  /**
   * Get starred sessions
   */
  async getStarredSessions(): Promise<angelaChatSession[]> {
    const sessions = await this.getAllSessions(true); // Include messages
    return sessions.filter(session => session.isStarred);
  }

  /**
   * Get archived sessions
   */
  async getArchivedSessions(): Promise<angelaChatSession[]> {
    const sessions = await this.getAllSessions(true); // Include messages
    return sessions.filter(session => session.isArchived);
  }

  /**
   * Search sessions by title or message content
   */
  async searchSessions(query: string): Promise<angelaChatSession[]> {
    const sessions = await this.getAllSessions(true); // Include messages for search
    const lowerQuery = query.toLowerCase();

    return sessions.filter(session => 
      session.title.toLowerCase().includes(lowerQuery) ||
      session.messages.some(message => 
        message.content.toLowerCase().includes(lowerQuery)
      )
    );
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalFiles: number;
    totalSize: number;
  }> {
    const sessions = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    const messages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    const files = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);

    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    return {
      totalSessions: sessions.length,
      totalMessages: messages.length,
      totalFiles: files.length,
      totalSize
    };
  }

  /**
   * Debug method to check for orphaned data and integrity issues
   */
  async debugDataIntegrity(): Promise<{
    sessions: number;
    messages: number;
    files: number;
    orphanedMessages: number;
    orphanedFiles: number;
  }> {
    const sessions = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    const messages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    const files = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);

    const sessionIds = new Set(sessions.map(s => s.id));
    const messageIds = new Set(messages.map(m => m.id));

    // Find orphaned messages (messages without valid sessions)
    const orphanedMessages = messages.filter(m => !sessionIds.has(m.sessionId));
    
    // Find orphaned files (files without valid messages or sessions)
    const orphanedFiles = files.filter(f => 
      !sessionIds.has(f.sessionId) || !messageIds.has(f.messageId)
    );

    console.log('Data integrity check:', {
      sessions: sessions.length,
      messages: messages.length,
      files: files.length,
      orphanedMessages: orphanedMessages.length,
      orphanedFiles: orphanedFiles.length
    });

    return {
      sessions: sessions.length,
      messages: messages.length,
      files: files.length,
      orphanedMessages: orphanedMessages.length,
      orphanedFiles: orphanedFiles.length
    };
  }

  /**
   * Clean up orphaned data
   */
  async cleanupOrphanedData(): Promise<void> {
    const sessions = await indexedDBService.getAll<angelaChatSessionRecord>(this.SESSIONS_STORE);
    const messages = await indexedDBService.getAll<angelaMessageRecord>(this.MESSAGES_STORE);
    const files = await indexedDBService.getAll<angelaFileRecord>(this.FILES_STORE);

    const sessionIds = new Set(sessions.map(s => s.id));
    const messageIds = new Set(messages.map(m => m.id));

    // Clean up orphaned messages
    const orphanedMessages = messages.filter(m => !sessionIds.has(m.sessionId));
    for (const message of orphanedMessages) {
      await indexedDBService.delete(this.MESSAGES_STORE, message.id);
      console.log('Deleted orphaned message:', message.id);
    }

    // Clean up orphaned files
    const orphanedFiles = files.filter(f => 
      !sessionIds.has(f.sessionId) || !messageIds.has(f.messageId)
    );
    for (const file of orphanedFiles) {
      await indexedDBService.delete(this.FILES_STORE, file.id);
      console.log('Deleted orphaned file:', file.id);
    }

    console.log(`Cleaned up ${orphanedMessages.length} orphaned messages and ${orphanedFiles.length} orphaned files`);
  }

  /**
   * Clear all angela chat sessions, messages, and files
   * WARNING: This will permanently delete all chat history
   */
  async clearAllSessions(): Promise<void> {
    try {
      // Clear all files first
      await indexedDBService.clear(this.FILES_STORE);
      
      // Clear all messages
      await indexedDBService.clear(this.MESSAGES_STORE);
      
      // Clear all sessions
      await indexedDBService.clear(this.SESSIONS_STORE);
      
      console.log('Successfully cleared all angela chat data');
    } catch (error) {
      console.error('Failed to clear angela chat data:', error);
      throw error;
    }
  }

  // Helper methods for converting between records and objects

  private recordToSession(record: angelaChatSessionRecord): angelaChatSession {
    return {
      ...record,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      messages: [] // Messages are loaded separately
    };
  }

  private async recordToMessage(record: angelaMessageRecord): Promise<angelaMessage> {
    const attachments = await this.getMessageFiles(record.id);
    
    console.log('📦 Loading message from database:', {
      messageId: record.id,
      role: record.role,
      contentLength: record.content.length,
      attachmentsCount: attachments.length,
      attachmentIds: attachments.map(att => att.id),
      attachmentTypes: attachments.map(att => att.type),
      hasImageAttachments: attachments.some(att => att.type === 'image'),
      contentPreview: record.content.substring(0, 100) + (record.content.length > 100 ? '...' : '')
    });
    
    return {
      ...record,
      timestamp: new Date(record.timestamp),
      attachments: attachments.length > 0 ? attachments : undefined
    };
  }

  private recordToFileAttachment(record: angelaFileRecord): angelaFileAttachment {
    console.log('📎 Converting file record to attachment:', {
      id: record.id,
      name: record.name,
      type: record.type,
      mimeType: record.mimeType,
      contentLength: record.content.length,
      contentIsDataUrl: record.content.startsWith('data:'),
      contentPrefix: record.content.substring(0, 50) + (record.content.length > 50 ? '...' : '')
    });
    
    let base64 = undefined;
    let url = undefined;
    
    if (record.content.startsWith('data:')) {
      // This is a data URL, extract the base64 part and keep the full URL
      url = record.content;
      const base64Match = record.content.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        base64 = base64Match[1];
      }
    } else {
      // This is raw base64 data, construct the data URL
      base64 = record.content;
      url = `data:${record.mimeType};base64,${record.content}`;
    }
    
    const attachment: angelaFileAttachment = {
      id: record.id,
      name: record.name,
      type: record.type as any,
      size: record.size,
      mimeType: record.mimeType,
      base64,
      url,
      thumbnail: record.thumbnail,
      processed: record.processed
    };
    
    console.log('📎 Converted attachment:', {
      id: attachment.id,
      hasBase64: !!attachment.base64,
      hasUrl: !!attachment.url,
      urlPrefix: attachment.url?.substring(0, 50) + (attachment.url && attachment.url.length > 50 ? '...' : ''),
      base64Length: attachment.base64?.length
    });
    
    return attachment;
  }
}

// Export singleton instance
export const angelaDatabaseService = new angelaDatabaseService(); 
