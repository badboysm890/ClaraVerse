import { ChatCheckpoint } from './CheckpointManager';

export interface PersistedChatData {
  projectId: string;
  messages: any[];
  checkpoints: ChatCheckpoint[];
  lastUpdated: Date;
  metadata: {
    messageCount: number;
    lastActivity: Date;
    projectName?: string;
    sessionId: string;
    conversationSummary?: string;
  };
}

export interface ChatSession {
  sessionId: string;
  projectId: string;
  projectName?: string;
  startTime: Date;
  endTime?: Date;
  messageCount: number;
  summary?: string;
  isActive: boolean;
}

export interface ConversationHistory {
  projectId: string;
  sessions: ChatSession[];
  lastSessionSummary?: string;
  totalSessions: number;
}

export class ChatPersistence {
  private static readonly STORAGE_PREFIX = 'lumaui_project_chat_';
  private static readonly CHAT_LIST_KEY = 'lumaui_project_chats';
  private static readonly HISTORY_PREFIX = 'lumaui_chat_history_';
  private static readonly SESSIONS_PREFIX = 'lumaui_chat_session_';

  // Generate unique session ID
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save chat data for a specific project with session tracking
  static saveChatData(projectId: string, messages: any[], checkpoints: ChatCheckpoint[], projectName?: string, sessionId?: string): void {
    try {
      const currentSessionId = sessionId || this.generateSessionId();
      
      const chatData: PersistedChatData = {
        projectId,
        messages: JSON.parse(JSON.stringify(messages)), // Deep clone
        checkpoints: JSON.parse(JSON.stringify(checkpoints)), // Deep clone
        lastUpdated: new Date(),
        metadata: {
          messageCount: messages.length,
          lastActivity: new Date(),
          projectName,
          sessionId: currentSessionId
        }
      };

      const storageKey = this.STORAGE_PREFIX + projectId;
      localStorage.setItem(storageKey, JSON.stringify(chatData));

      // Save individual session data
      this.saveSessionData(currentSessionId, projectId, messages, projectName);

      // Update conversation history
      this.updateConversationHistory(projectId, currentSessionId, messages, projectName);

      // Update the list of projects with chat data
      this.updateChatList(projectId, projectName);

      console.log('💾 Saved chat data for project:', projectId, 'session:', currentSessionId, 'with', messages.length, 'messages');
    } catch (error) {
      console.error('Failed to save chat data:', error);
    }
  }

  // Save individual session data
  private static saveSessionData(sessionId: string, projectId: string, messages: any[], projectName?: string): void {
    try {
      const sessionData = {
        sessionId,
        projectId,
        projectName,
        messages: JSON.parse(JSON.stringify(messages)),
        startTime: messages.length > 0 ? new Date(messages[0].timestamp) : new Date(),
        endTime: new Date(),
        messageCount: messages.length,
        isActive: true
      };

      const sessionKey = this.SESSIONS_PREFIX + sessionId;
      localStorage.setItem(sessionKey, JSON.stringify(sessionData));
    } catch (error) {
      console.error('Failed to save session data:', error);
    }
  }

  // Update conversation history for a project
  private static updateConversationHistory(projectId: string, sessionId: string, messages: any[], projectName?: string): void {
    try {
      const historyKey = this.HISTORY_PREFIX + projectId;
      let history: ConversationHistory = this.getConversationHistory(projectId) || {
        projectId,
        sessions: [],
        totalSessions: 0
      };

      // Check if session already exists
      const existingSessionIndex = history.sessions.findIndex(s => s.sessionId === sessionId);
      
      const sessionData: ChatSession = {
        sessionId,
        projectId,
        projectName,
        startTime: messages.length > 0 ? new Date(messages[0].timestamp) : new Date(),
        endTime: new Date(),
        messageCount: messages.length,
        isActive: true
      };

      if (existingSessionIndex >= 0) {
        // Update existing session
        history.sessions[existingSessionIndex] = sessionData;
      } else {
        // Add new session
        history.sessions.push(sessionData);
        history.totalSessions++;
      }

      // Keep only last 10 sessions per project
      history.sessions = history.sessions
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .slice(0, 10);

      // Generate summary for the last session if it has enough messages
      if (messages.length >= 3) {
        history.lastSessionSummary = this.generateSessionSummary(messages);
      }

      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to update conversation history:', error);
    }
  }

  // Generate a simple summary of the conversation
  private static generateSessionSummary(messages: any[]): string {
    try {
      const userMessages = messages.filter(m => m.type === 'user').slice(-3); // Last 3 user messages
      const assistantMessages = messages.filter(m => m.type === 'assistant').slice(-2); // Last 2 assistant messages
      
      let summary = '';
             if (userMessages.length > 0) {
         summary += `User requests: ${userMessages.map((m: any) => m.content.substring(0, 100)).join('; ')}`;
       }
       if (assistantMessages.length > 0) {
         summary += ` | AI actions: ${assistantMessages.map((m: any) => m.content.substring(0, 100)).join('; ')}`;
       }
      
      return summary.substring(0, 500); // Limit summary length
    } catch (error) {
      console.error('Failed to generate session summary:', error);
      return 'Conversation summary unavailable';
    }
  }

  // Get conversation history for a project
  static getConversationHistory(projectId: string): ConversationHistory | null {
    try {
      const historyKey = this.HISTORY_PREFIX + projectId;
      const saved = localStorage.getItem(historyKey);
      
      if (!saved) {
        return null;
      }

      const history: ConversationHistory = JSON.parse(saved);
      
      // Convert date strings back to Date objects
      history.sessions = history.sessions.map(session => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: session.endTime ? new Date(session.endTime) : undefined
      }));

      return history;
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      return null;
    }
  }

  // Get the last conversation summary for context in auto mode
  static getLastConversationContext(projectId: string): string | null {
    try {
      const history = this.getConversationHistory(projectId);
      if (!history || history.sessions.length === 0) {
        return null;
      }

      // Get the most recent session summary
      const lastSession = history.sessions[0];
      if (history.lastSessionSummary) {
        return `Previous conversation context: ${history.lastSessionSummary}`;
      }

             // Fallback: load the actual last session messages
       const sessionData = this.getSessionData(lastSession.sessionId);
       if (sessionData && sessionData.messages.length > 0) {
         const lastMessages = sessionData.messages.slice(-3); // Last 3 messages
         return `Previous conversation: ${lastMessages.map((m: any) => `${m.type}: ${m.content.substring(0, 100)}`).join(' | ')}`;
       }

      return null;
    } catch (error) {
      console.error('Failed to get last conversation context:', error);
      return null;
    }
  }

  // Get session data by session ID
  static getSessionData(sessionId: string): any | null {
    try {
      const sessionKey = this.SESSIONS_PREFIX + sessionId;
      const saved = localStorage.getItem(sessionKey);
      
      if (!saved) {
        return null;
      }

      const sessionData = JSON.parse(saved);
      
      // Convert date strings back to Date objects
      sessionData.startTime = new Date(sessionData.startTime);
      if (sessionData.endTime) {
        sessionData.endTime = new Date(sessionData.endTime);
      }
      
      // Convert message timestamps
      sessionData.messages = sessionData.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));

      return sessionData;
    } catch (error) {
      console.error('Failed to load session data:', error);
      return null;
    }
  }

  // Load chat data for a specific project
  static loadChatData(projectId: string): PersistedChatData | null {
    try {
      const storageKey = this.STORAGE_PREFIX + projectId;
      const saved = localStorage.getItem(storageKey);
      
      if (!saved) {
        return null;
      }

      const chatData: PersistedChatData = JSON.parse(saved);
      
      // Convert date strings back to Date objects
      chatData.lastUpdated = new Date(chatData.lastUpdated);
      chatData.metadata.lastActivity = new Date(chatData.metadata.lastActivity);
      
      // Convert checkpoint timestamps back to Date objects
      chatData.checkpoints = chatData.checkpoints.map(cp => ({
        ...cp,
        timestamp: new Date(cp.timestamp)
      }));

      // Convert message timestamps back to Date objects
      chatData.messages = chatData.messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));

      console.log('📖 Loaded chat data for project:', projectId, 'with', chatData.messages.length, 'messages');
      return chatData;
    } catch (error) {
      console.error('Failed to load chat data:', error);
      return null;
    }
  }

  // Delete chat data for a specific project
  static deleteChatData(projectId: string): void {
    try {
      const storageKey = this.STORAGE_PREFIX + projectId;
      localStorage.removeItem(storageKey);
      
      // Delete conversation history
      const historyKey = this.HISTORY_PREFIX + projectId;
      localStorage.removeItem(historyKey);
      
      // Delete all sessions for this project
      const history = this.getConversationHistory(projectId);
      if (history) {
        history.sessions.forEach(session => {
          const sessionKey = this.SESSIONS_PREFIX + session.sessionId;
          localStorage.removeItem(sessionKey);
        });
      }
      
      // Remove from chat list
      this.removeChatFromList(projectId);
      
      console.log('🗑️ Deleted chat data and history for project:', projectId);
    } catch (error) {
      console.error('Failed to delete chat data:', error);
    }
  }

  // Get list of all projects with chat data
  static getAllProjectChats(): Array<{projectId: string, projectName?: string, lastActivity: Date, messageCount: number}> {
    try {
      const chatListData = localStorage.getItem(this.CHAT_LIST_KEY);
      if (!chatListData) {
        return [];
      }

      const chatList = JSON.parse(chatListData);
      return chatList.map((item: any) => ({
        ...item,
        lastActivity: new Date(item.lastActivity)
      }));
    } catch (error) {
      console.error('Failed to get project chat list:', error);
      return [];
    }
  }

  // Check if a project has saved chat data
  static hasChatData(projectId: string): boolean {
    const storageKey = this.STORAGE_PREFIX + projectId;
    return localStorage.getItem(storageKey) !== null;
  }

  // Clear all chat data (for debugging/reset)
  static clearAllChatData(): void {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.STORAGE_PREFIX) || 
        key.startsWith(this.HISTORY_PREFIX) || 
        key.startsWith(this.SESSIONS_PREFIX)
      );
      keys.forEach(key => localStorage.removeItem(key));
      localStorage.removeItem(this.CHAT_LIST_KEY);
      console.log('🧹 Cleared all chat data, history, and sessions');
    } catch (error) {
      console.error('Failed to clear chat data:', error);
    }
  }

  // Auto-save with debouncing to prevent excessive saves
  private static saveTimeout: NodeJS.Timeout | null = null;
  static autoSave(projectId: string, messages: any[], checkpoints: ChatCheckpoint[], projectName?: string, delay: number = 2000): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveChatData(projectId, messages, checkpoints, projectName);
      this.saveTimeout = null;
    }, delay);
  }

  // Private helper methods
  private static updateChatList(projectId: string, projectName?: string): void {
    try {
      let chatList = this.getAllProjectChats();
      
      // Remove existing entry if it exists
      chatList = chatList.filter(item => item.projectId !== projectId);
      
      // Add updated entry
      chatList.push({
        projectId,
        projectName,
        lastActivity: new Date(),
        messageCount: 0 // Will be updated by the actual save
      });

      // Sort by last activity (most recent first)
      chatList.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

      // Keep only last 20 projects to prevent storage bloat
      chatList = chatList.slice(0, 20);

      localStorage.setItem(this.CHAT_LIST_KEY, JSON.stringify(chatList));
    } catch (error) {
      console.error('Failed to update chat list:', error);
    }
  }

  private static removeChatFromList(projectId: string): void {
    try {
      let chatList = this.getAllProjectChats();
      chatList = chatList.filter(item => item.projectId !== projectId);
      localStorage.setItem(this.CHAT_LIST_KEY, JSON.stringify(chatList));
    } catch (error) {
      console.error('Failed to remove chat from list:', error);
    }
  }
}

export default ChatPersistence; 
