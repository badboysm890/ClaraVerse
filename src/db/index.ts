import { indexedDBService } from '../services/indexedDB';
import { ChatRole } from '../utils';

// Types
export interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_starred: boolean;
  is_deleted: boolean;
}

export interface Message {
  content: string;
  sender: 'user' | 'ai';
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  content: string;
  role: ChatRole;
  timestamp: number;
  tokens?: number;
  images?: string[];
  name?: string;
  tool?: {
    name: string;
    result: string;
  };
}

export interface StorageItem {
  id: string;
  title: string;
  description: string;
  size: number;
  timestamp: string;
  type: 'image' | 'document' | 'other';
  mime_type: string;
  data: string;
}

export interface Usage {
  id: string;
  type: 'tokens' | 'storage' | 'messages' | 'response_time';
  value: number;
  timestamp: string;
  // Add date in YYYY-MM-DD format for daily tracking
  date?: string;
}

export interface PersonalInfo {
  name: string;
  email: string;
  avatar_url?: string;
  timezone: string;
  theme_preference: 'light' | 'dark' | 'system';
}

export interface Provider {
  id: string;
  name: string;
  type: 'claras-pocket' | 'openai' | 'openrouter' | 'ollama' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  isEnabled: boolean;
  isPrimary: boolean;
  config?: {
    [key: string]: string | number | boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface APIConfig {
  comfyui_base_url: string;
  n8n_base_url?: string;  // URL of the n8n instance
  n8n_api_key?: string;   // API Key for n8n
  
  // Legacy fields (kept for backwards compatibility)
  ollama_base_url?: string;
  openai_api_key ?: string;
  openai_base_url ?: string;
  openrouter_api_key ?: string;
  api_type ?: string;
}

export interface ModelUsage {
  name: string;
  totalDuration: number;
  requestCount: number;
  avgDuration: number;
  lastUsed: string;
}

export interface SystemSettings {
  system_prompt: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  implementation: string;
  isEnabled: boolean;
}

export interface UIBuilderDesign {
  id: string;
  name: string;
  description?: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
  isDeleted?: boolean;
  version: number;
}

const DB_PREFIX = 'clara_db_';

const DEFAULT_SYSTEM_PROMPT = `You are Clara, a helpful and friendly AI assistant. Your responses should be:
- Clear and concise
- Accurate and well-reasoned
- Polite and professional
- Focused on the user's needs

If asked about your capabilities, explain that you can help with general questions, coding, analysis, and text-based tasks. If you're unsure about something, be honest and say so.`;

export class LocalStorageDB {
  private useIndexedDB = true; // Flag to control storage method
  private initialized = false;

  constructor() {
    // Check if IndexedDB is supported
    this.useIndexedDB = this.isIndexedDBSupported();
    this.migrateDataToIndexedDB();
  }

  private isIndexedDBSupported(): boolean {
    try {
      return 'indexedDB' in window && window.indexedDB !== null;
    } catch (e) {
      console.warn('IndexedDB is not supported in this browser. Falling back to localStorage.');
      return false;
    }
  }

  // Migrates existing localStorage data to IndexedDB
  private async migrateDataToIndexedDB(): Promise<void> {
    if (!this.useIndexedDB) return;
    
    try {
      // Set migration flag to avoid duplicate migrations
      if (localStorage.getItem(`${DB_PREFIX}migrated`) === 'true') {
        this.initialized = true;
        return;
      }

      console.info('Migrating data from localStorage to IndexedDB...');
      
      // Migrate all key collections
      await this.migrateCollection('chats');
      await this.migrateCollection('messages');
      await this.migrateCollection('storage');
      await this.migrateCollection('usage');
      
      // Migrate settings data
      const personalInfo = this.getItemFromLocalStorage<PersonalInfo>('personal_info');
      if (personalInfo) {
        await indexedDBService.put('settings', { key: 'personal_info', value: personalInfo });
      }
      
      const apiConfig = this.getItemFromLocalStorage<APIConfig>('api_config');
      if (apiConfig) {
        await indexedDBService.put('settings', { key: 'api_config', value: apiConfig });
      }
      
      // Migrate model usage data
      const modelUsage = this.getItemFromLocalStorage<Record<string, ModelUsage>>('model_usage');
      if (modelUsage) {
        for (const [key, value] of Object.entries(modelUsage)) {
          await indexedDBService.put('model_usage', value);
        }
      }
      
      localStorage.setItem(`${DB_PREFIX}migrated`, 'true');
      console.info('Migration completed successfully');
    } catch (error) {
      console.error('Error migrating data to IndexedDB:', error);
      this.useIndexedDB = false; // Fall back to localStorage on error
    } finally {
      this.initialized = true;
    }
  }

  private async migrateCollection(collectionName: string): Promise<void> {
    const items = this.getItemFromLocalStorage<any[]>(collectionName) || [];
    if (items.length) {
      for (const item of items) {
        await indexedDBService.put(collectionName, item);
      }
      console.info(`Migrated ${items.length} ${collectionName}`);
    }
  }

  private getItemFromLocalStorage<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(`${DB_PREFIX}${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error reading from localStorage: ${key}`, error);
      return null;
    }
  }

  private setItemToLocalStorage(key: string, value: any): void {
    try {
      localStorage.setItem(`${DB_PREFIX}${key}`, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing to localStorage: ${key}`, error);
    }
  }

  private async getItem<T>(key: string): Promise<T | null> {
    if (this.useIndexedDB) {
      try {
        const items = await indexedDBService.getAll<T>(key);
        // For collection types, we need to return the whole array
        if (Array.isArray(items)) {
          return items as unknown as T;
        }
        return (items as any[] && (items as any[]).length > 0) ? (items as any[])[0] as T : null;
      } catch (error) {
        console.error(`Error getting from IndexedDB: ${key}`, error);
        // Fall back to localStorage
        return this.getItemFromLocalStorage<T>(key);
      }
    } else {
      return this.getItemFromLocalStorage<T>(key);
    }
  }

  private async setItem(key: string, value: any): Promise<void> {
    if (this.useIndexedDB) {
      try {
        // For collections, add each item to the store
        if (Array.isArray(value)) {
          for (const item of value) {
            await indexedDBService.put(key, item);
          }
        } else {
          // For settings or single objects, just add with key
          await indexedDBService.put('settings', { key, value });
        }
      } catch (error) {
        console.error(`Error writing to IndexedDB: ${key}`, error);
        // Fall back to localStorage
        this.setItemToLocalStorage(key, value);
      }
    } else {
      this.setItemToLocalStorage(key, value);
    }
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  // Chat methods
  async createChat(title: string): Promise<string> {
    const chats = await this.getItem<Chat[]>('chats') || [];
    const now = new Date().toISOString();
    const newChat: Chat = {
      id: this.generateId(),
      title,
      created_at: now,
      updated_at: now,
      is_archived: false,
      is_starred: false,
      is_deleted: false
    };
    
    if (this.useIndexedDB) {
      await indexedDBService.put('chats', newChat);
    } else {
      chats.push(newChat);
      await this.setItem('chats', chats);
    }
    
    return newChat.id;
  }

  async getChat(id: string): Promise<Chat | undefined> {
    if (this.useIndexedDB) {
      const result = await indexedDBService.get<Chat>('chats', id);
      return result || undefined;
    } else {
      const chats = await this.getItem<Chat[]>('chats') || [];
      return chats.find(chat => chat.id === id);
    }
  }

  async updateChat(id: string, updates: Partial<Chat>): Promise<string> {
    if (this.useIndexedDB) {
      const chat = await indexedDBService.get<Chat>('chats', id);
      if (chat) {
        const updatedChat = {
          ...chat,
          ...updates,
          updated_at: new Date().toISOString()
        };
        await indexedDBService.put('chats', updatedChat);
      }
    } else {
      const chats = await this.getItem<Chat[]>('chats') || [];
      const index = chats.findIndex(chat => chat.id === id);
      if (index !== -1) {
        chats[index] = {
          ...chats[index],
          ...updates,
          updated_at: new Date().toISOString()
        };
        await this.setItem('chats', chats);
      }
    }
    return id;
  }

  async getRecentChats(limit: number = 10): Promise<Chat[]> {
    if (this.useIndexedDB) {
      const chats = await indexedDBService.getAll<Chat>('chats');
      return chats
        .filter(chat => !chat.is_deleted)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, limit);
    } else {
      const chats = await this.getItem<Chat[]>('chats') || [];
      return chats
        .filter(chat => !chat.is_deleted)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, limit);
    }
  }

  // Message methods
  async addMessage(chatId: string, content: string, role: ChatRole, tokens?: number, images?: string[]): Promise<ChatMessage> {
    const messages = await this.getMessages(chatId);
    const newMessage: ChatMessage = {
      id: this.generateId(),
      chat_id: chatId,
      content,
      role,
      timestamp: Date.now(),
      tokens,
      images
    };
    
    messages.push(newMessage);
    await this.saveMessages(chatId, messages);
    return newMessage;
  }

  async getMessages(chatId: string): Promise<ChatMessage[]> {
    if (this.useIndexedDB) {
      try {
        const allMessages = await indexedDBService.getAll<ChatMessage>('messages');
        return allMessages.filter(msg => msg.chat_id === chatId);
      } catch (error) {
        console.error(`Error getting messages from IndexedDB for chat ${chatId}:`, error);
        // Fall back to localStorage
        const key = `${DB_PREFIX}messages_${chatId}`;
        const messages = localStorage.getItem(key);
        return messages ? JSON.parse(messages) : [];
      }
    } else {
      const key = `${DB_PREFIX}messages_${chatId}`;
      const messages = localStorage.getItem(key);
      return messages ? JSON.parse(messages) : [];
    }
  }

  async saveMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    if (this.useIndexedDB) {
      try {
        // First delete existing messages for this chat
        const existingMessages = await this.getMessages(chatId);
        for (const msg of existingMessages) {
          await indexedDBService.delete('messages', msg.id);
        }
        
        // Then add all messages for this chat
        for (const message of messages) {
          await indexedDBService.put('messages', message);
        }
      } catch (error) {
        console.error(`Error saving messages to IndexedDB for chat ${chatId}:`, error);
        // Fall back to localStorage
        const key = `${DB_PREFIX}messages_${chatId}`;
        localStorage.setItem(key, JSON.stringify(messages));
      }
    } else {
      const key = `${DB_PREFIX}messages_${chatId}`;
      localStorage.setItem(key, JSON.stringify(messages));
    }
  }

  async getChatMessages(chatId: string): Promise<ChatMessage[]> {
    if (this.useIndexedDB) {
      const allMessages = await indexedDBService.getAll<ChatMessage>('messages');
      return allMessages
        .filter(message => message.chat_id === chatId)
        .sort((a, b) => a.timestamp - b.timestamp);
    } else {
      const messages = await this.getItem<ChatMessage[]>('messages') || [];
      return messages
        .filter(message => message.chat_id === chatId)
        .sort((a, b) => a.timestamp - b.timestamp);
    }
  }

  async updateMessage(messageId: string, update: Partial<ChatMessage>): Promise<void> {
    if (this.useIndexedDB) {
      try {
        // Simpler approach: First try direct get, then delete and add new
        const allMessages = await indexedDBService.getAll<ChatMessage>('messages');
        const existingMessage = allMessages.find(msg => msg.id === messageId);
        
        if (!existingMessage) {
          console.error('Message not found in database:', messageId);
          throw new Error(`Message not found: ${messageId}`);
        }

        const updatedMessage = {
          ...existingMessage,
          ...update,
          timestamp: Date.now()
        };

        // Delete and re-add as a reliable update strategy
        try {
          await indexedDBService.delete('messages', messageId);
        } catch (e) {
          console.warn('Delete operation failed, attempting put anyway:', e);
        }
        
        await indexedDBService.put('messages', updatedMessage);
        console.log('Message updated successfully:', messageId);

      } catch (error) {
        console.error('Error updating message in IndexedDB:', error);
        throw error;
      }
    } else {
      const messages = await this.getItem<ChatMessage[]>('messages') || [];
      const index = messages.findIndex(msg => msg.id === messageId);
      
      if (index === -1) {
        throw new Error('Message not found');
      }
      
      messages[index] = {
        ...messages[index],
        ...update,
        timestamp: Date.now()
      };
      
      await this.setItem('messages', messages);
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (this.useIndexedDB) {
      try {
        await indexedDBService.delete('messages', messageId);
      } catch (error) {
        console.error('Error deleting message:', error);
        throw error;
      }
    } else {
      const messages = await this.getItem<ChatMessage[]>('messages') || [];
      const filteredMessages = messages.filter(msg => msg.id !== messageId);
      await this.setItem('messages', filteredMessages);
    }
  }

  // Storage methods
  async addStorageItem(item: Omit<StorageItem, 'id' | 'timestamp'>): Promise<string> {
    const newItem: StorageItem = {
      ...item,
      id: this.generateId(),
      timestamp: new Date().toISOString()
    };
    
    if (this.useIndexedDB) {
      await indexedDBService.put('storage', newItem);
    } else {
      const storage = await this.getItem<StorageItem[]>('storage') || [];
      storage.push(newItem);
      await this.setItem('storage', storage);
    }
    
    await this._updateUsage('storage', item.size);
    return newItem.id;
  }

  async getStorageItem(id: string): Promise<StorageItem | undefined> {
    if (this.useIndexedDB) {
      const result = await indexedDBService.get<StorageItem>('storage', id);
      return result || undefined;
    } else {
      const storage = await this.getItem<StorageItem[]>('storage') || [];
      return storage.find(item => item.id === id);
    }
  }

  async getRecentStorageItems(limit: number = 5): Promise<StorageItem[]> {
    if (this.useIndexedDB) {
      const items = await indexedDBService.getAll<StorageItem>('storage');
      return items
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } else {
      const storage = await this.getItem<StorageItem[]>('storage') || [];
      return storage
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    }
  }

  // Usage methods
  private async _updateUsage(type: Usage['type'], value: number): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const usageRecord: Usage = {
      id: this.generateId(),
      type,
      value,
      timestamp: now.toISOString(),
      date: dateStr
    };
    
    if (this.useIndexedDB) {
      await indexedDBService.put('usage', usageRecord);
      
      // Also update daily summary
      await this._updateDailySummary(type, value, dateStr);
    } else {
      const usage = await this.getItem<Usage[]>('usage') || [];
      usage.push(usageRecord);
      await this.setItem('usage', usage);
      
      // Also update daily summary
      await this._updateDailySummary(type, value, dateStr);
    }
  }
  
  private async _updateDailySummary(type: Usage['type'], value: number, dateStr: string): Promise<void> {
    const summaryKey = `daily_summary_${type}_${dateStr}`;
    
    if (this.useIndexedDB) {
      const existingSummary = await indexedDBService.get<{key: string, value: number}>('settings', summaryKey);
      
      if (existingSummary) {
        await indexedDBService.put('settings', { 
          key: summaryKey, 
          value: existingSummary.value + value 
        });
      } else {
        await indexedDBService.put('settings', { key: summaryKey, value });
      }
    } else {
      const existingSummary = await this.getItemFromLocalStorage<number>(summaryKey) || 0;
      await this.setItemToLocalStorage(summaryKey, existingSummary + value);
    }
  }
  
  async getDailyUsageChange(type: Usage['type']): Promise<{value: number, percentage: number}> {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let todayValue = 0;
    let yesterdayValue = 0;
    
    if (this.useIndexedDB) {
      const todaySummary = await indexedDBService.get<{key: string, value: number}>('settings', `daily_summary_${type}_${todayStr}`);
      const yesterdaySummary = await indexedDBService.get<{key: string, value: number}>('settings', `daily_summary_${type}_${yesterdayStr}`);
      
      todayValue = todaySummary ? todaySummary.value : 0;
      yesterdayValue = yesterdaySummary ? yesterdaySummary.value : 0;
    } else {
      todayValue = await this.getItemFromLocalStorage<number>(`daily_summary_${type}_${todayStr}`) || 0;
      yesterdayValue = await this.getItemFromLocalStorage<number>(`daily_summary_${type}_${yesterdayStr}`) || 0;
    }
    
    // Calculate percentage change
    let percentageChange = 0;
    if (yesterdayValue > 0) {
      percentageChange = ((todayValue - yesterdayValue) / yesterdayValue) * 100;
    } else if (todayValue > 0) {
      // If yesterday was 0 but today has value, that's 100% increase
      percentageChange = 100;
    }
    
    return {
      value: todayValue,
      percentage: Number(percentageChange.toFixed(1))
    };
  }

  async updateModelUsage(model: string, duration: number): Promise<void> {
    const now = new Date().toISOString();
    
    if (this.useIndexedDB) {
      const existingUsage = await indexedDBService.get<ModelUsage>('model_usage', model);
      
      if (!existingUsage) {
        const newModelUsage: ModelUsage = {
          name: model,
          totalDuration: duration,
          requestCount: 1,
          avgDuration: duration,
          lastUsed: now
        };
        await indexedDBService.put('model_usage', newModelUsage);
      } else {
        existingUsage.totalDuration += duration;
        existingUsage.requestCount += 1;
        existingUsage.avgDuration = existingUsage.totalDuration / existingUsage.requestCount;
        existingUsage.lastUsed = now;
        await indexedDBService.put('model_usage', existingUsage);
      }
    } else {
      const usageKey = 'model_usage';
      const usage = await this.getItem<Record<string, ModelUsage>>(usageKey) || {};
      
      if (!usage[model]) {
        usage[model] = {
          name: model,
          totalDuration: 0,
          requestCount: 0,
          avgDuration: 0,
          lastUsed: now
        };
      }
      
      usage[model].totalDuration += duration;
      usage[model].requestCount += 1;
      usage[model].avgDuration = usage[model].totalDuration / usage[model].requestCount;
      usage[model].lastUsed = now;
      
      await this.setItem(usageKey, usage);
    }
  }

  async getModelUsage(): Promise<ModelUsage[]> {
    if (this.useIndexedDB) {
      const models = await indexedDBService.getAll<ModelUsage>('model_usage');
      return models.sort((a, b) => b.requestCount - a.requestCount);
    } else {
      const usage = await this.getItem<Record<string, ModelUsage>>('model_usage') || {};
      return Object.values(usage).sort((a, b) => b.requestCount - a.requestCount);
    }
  }

  async getTokensUsed(days: number = 30): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    if (this.useIndexedDB) {
      const records = await indexedDBService.getAll<Usage>('usage');
      return records
        .filter(record => 
          record.type === 'tokens' && 
          new Date(record.timestamp) >= since
        )
        .reduce((sum, record) => sum + record.value, 0);
    } else {
      const usage = await this.getItem<Usage[]>('usage') || [];
      return usage
        .filter(record => 
          record.type === 'tokens' && 
          new Date(record.timestamp) >= since
        )
        .reduce((sum, record) => sum + record.value, 0);
    }
  }

  async getTotalStorage(): Promise<number> {
    try {
      if (this.useIndexedDB) {
        const records = await indexedDBService.getAll<Usage>('usage');
        const totalFromRecords = records
          .filter(record => record.type === 'storage')
          .reduce((sum, record) => sum + record.value, 0);
        
        // If no storage records found, return a minimum value
        return totalFromRecords || 11 * 1024 * 1024; // Return 11 MB in bytes if 0
      } else {
        const usage = await this.getItem<Usage[]>('usage') || [];
        const totalFromRecords = usage
          .filter(record => record.type === 'storage')
          .reduce((sum, record) => sum + record.value, 0);
          
        // If no storage records found, return a minimum value
        return totalFromRecords || 11 * 1024 * 1024; // Return 11 MB in bytes if 0
      }
    } catch (error) {
      console.error('Error calculating total storage:', error);
      return 11 * 1024 * 1024; // Return 11 MB in bytes as fallback
    }
  }

  async getMessageCount(): Promise<number> {
    if (this.useIndexedDB) {
      const messages = await indexedDBService.getAll<Message>('messages');
      return messages.length;
    } else {
      const messages = await this.getItem<Message[]>('messages') || [];
      return messages.length;
    }
  }

  async getAverageResponseTime(days: number = 1): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    if (this.useIndexedDB) {
      const allRecords = await indexedDBService.getAll<Usage>('usage');
      const records = allRecords.filter(
        record => 
          record.type === 'response_time' && 
          new Date(record.timestamp) >= since
      );
      const sum = records.reduce((total, record) => total + record.value, 0);
      return records.length ? sum / records.length : 0;
    } else {
      const usage = await this.getItem<Usage[]>('usage') || [];
      const records = usage.filter(
        record => 
          record.type === 'response_time' && 
          new Date(record.timestamp) >= since
      );
      const sum = records.reduce((sum, record) => sum + record.value, 0);
      return records.length ? sum / records.length : 0;
    }
  }

  // Settings methods
  async updatePersonalInfo(info: PersonalInfo): Promise<void> {
    if (this.useIndexedDB) {
      await indexedDBService.put('settings', { key: 'personal_info', value: info });
    } else {
      await this.setItem('personal_info', info);
    }
  }

  async getPersonalInfo(): Promise<PersonalInfo | null> {
    if (this.useIndexedDB) {
      const record = await indexedDBService.get<{key: string, value: PersonalInfo}>('settings', 'personal_info');
      return record ? record.value : null;
    } else {
      return await this.getItem<PersonalInfo>('personal_info');
    }
  }

  async updateAPIConfig(config: APIConfig): Promise<void> {
    if (this.useIndexedDB) {
      await indexedDBService.put('settings', { key: 'api_config', value: config });
    } else {
      await this.setItem('api_config', config);
    }
  }

  async getAPIConfig(): Promise<APIConfig | null> {
    if (this.useIndexedDB) {
      const record = await indexedDBService.get<{key: string, value: APIConfig}>('settings', 'api_config');
      return record ? record.value : null;
    } else {
      return await this.getItem<APIConfig>('api_config');
    }
  }

  async updateSystemPrompt(prompt: string): Promise<void> {
    if (this.useIndexedDB) {
      await indexedDBService.put('settings', { 
        key: 'system_settings', 
        value: { system_prompt: prompt }
      });
    } else {
      await this.setItem('system_settings', { system_prompt: prompt });
    }
  }

  async getSystemPrompt(): Promise<string> {
    if (this.useIndexedDB) {
      const record = await indexedDBService.get<{key: string, value: SystemSettings}>('settings', 'system_settings');
      return record?.value?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    } else {
      const settings = await this.getItem<SystemSettings>('system_settings');
      return settings?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    }
  }

  // Tool methods
  async getAllTools(): Promise<Tool[]> {
    if (this.useIndexedDB) {
      return await indexedDBService.getAll<Tool>('tools');
    } else {
      return await this.getItem<Tool[]>('tools') || [];
    }
  }

  async getEnabledTools(): Promise<Tool[]> {
    const tools = await this.getAllTools();
    return tools.filter(tool => tool.isEnabled);
  }

  async addTool(tool: Omit<Tool, 'id'>): Promise<string> {
    const id = this.generateId();
    const newTool: Tool = {
      ...tool,
      id
    };

    if (this.useIndexedDB) {
      await indexedDBService.put('tools', newTool);
    } else {
      const tools = await this.getItem<Tool[]>('tools') || [];
      tools.push(newTool);
      await this.setItem('tools', tools);
    }

    return id;
  }

  async updateTool(id: string, updates: Partial<Tool>): Promise<void> {
    if (this.useIndexedDB) {
      const tool = await indexedDBService.get<Tool>('tools', id);
      if (tool) {
        await indexedDBService.put('tools', { ...tool, ...updates });
      }
    } else {
      const tools = await this.getItem<Tool[]>('tools') || [];
      const index = tools.findIndex(t => t.id === id);
      if (index !== -1) {
        tools[index] = { ...tools[index], ...updates };
        await this.setItem('tools', tools);
      }
    }
  }

  async deleteTool(id: string): Promise<void> {
    if (this.useIndexedDB) {
      await indexedDBService.delete('tools', id);
    } else {
      const tools = await this.getItem<Tool[]>('tools') || [];
      const filtered = tools.filter(t => t.id !== id);
      await this.setItem('tools', filtered);
    }
  }

  // Design methods
  async getAllDesigns(): Promise<UIBuilderDesign[]> {
    const designs = localStorage.getItem('designs');
    return designs ? JSON.parse(designs) : [];
  }

  async getDesignById(id: string): Promise<UIBuilderDesign | null> {
    const designs = await this.getAllDesigns();
    return designs.find(design => design.id === id) || null;
  }

  async updateDesign(design: UIBuilderDesign): Promise<void> {
    const designs = await this.getAllDesigns();
    const index = designs.findIndex(d => d.id === design.id);
    
    if (index !== -1) {
      designs[index] = design;
    } else {
      designs.push(design);
    }
    
    localStorage.setItem('designs', JSON.stringify(designs));
  }

  async deleteDesign(id: string): Promise<void> {
    const designs = await this.getAllDesigns();
    const filteredDesigns = designs.filter(design => design.id !== id);
    localStorage.setItem('designs', JSON.stringify(filteredDesigns));
  }

  async clearDesigns(): Promise<void> {
    localStorage.removeItem('designs');
  }

  // Clear all data
  async reset(): Promise<void> {
    if (this.useIndexedDB) {
      try {
        // Clear all stores
        await indexedDBService.clear('chats');
        await indexedDBService.clear('messages');
        await indexedDBService.clear('storage');
        await indexedDBService.clear('usage');
        await indexedDBService.clear('model_usage');
        await indexedDBService.clear('settings');
        // Remove migration flag
        localStorage.removeItem(`${DB_PREFIX}migrated`);
      } catch (error) {
        console.error('Error resetting IndexedDB:', error);
      }
    }
    
    // Also clear localStorage for completeness
    Object.keys(localStorage)
      .filter(key => key.startsWith(DB_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }

  async clearAll(): Promise<void> {
    // Clear IndexedDB if it's being used
    if (this.useIndexedDB) {
      // Clear all stores one by one
      await indexedDBService.clear('chats');
      await indexedDBService.clear('messages');
      await indexedDBService.clear('storage');
      await indexedDBService.clear('usage');
      await indexedDBService.clear('model_usage');
      await indexedDBService.clear('settings');
      await indexedDBService.clear('tools');
    }
    
    // Also clear localStorage for good measure
    const keys = Object.keys(localStorage)
      .filter(key => key.startsWith(DB_PREFIX));
    
    if (keys.length > 0) {
      console.info(`Clearing ${keys.length} items from localStorage`);
      keys
        .forEach(key => localStorage.removeItem(key));
    }
  }
  
  // Public wrapper for the private updateUsage method
  async updateUsage(type: Usage['type'], value: number): Promise<void> {
    await this._updateUsage(type, value);
  }

  // Wallpaper methods
  async setWallpaper(wallpaperData: string): Promise<void> {
    if (this.useIndexedDB) {
      await indexedDBService.put('settings', { key: 'wallpaper', value: wallpaperData });
    } else {
      await this.setItem('wallpaper', wallpaperData);
    }
  }

  async getWallpaper(): Promise<string | null> {
    try {
      if (this.useIndexedDB) {
        // Get directly from settings store
        const settingItem = await indexedDBService.get<{key: string, value: string}>('settings', 'wallpaper');
        return settingItem ? settingItem.value : null;
      } else {
        const result = await this.getItem<string>('wallpaper');
        return result;
      }
    } catch (error) {
      console.error('Error getting wallpaper:', error);
      return null;
    }
  }

  // Provider management methods
  async getAllProviders(): Promise<Provider[]> {
    try {
      if (this.useIndexedDB) {
        return await indexedDBService.getAll('providers') || [];
      } else {
        return this.getItemFromLocalStorage<Provider[]>('providers') || [];
      }
    } catch (error) {
      console.error('Error getting providers:', error);
      return [];
    }
  }

  async getProvider(id: string): Promise<Provider | null> {
    try {
      const providers = await this.getAllProviders();
      return providers.find(p => p.id === id) || null;
    } catch (error) {
      console.error('Error getting provider:', error);
      return null;
    }
  }

  async getPrimaryProvider(): Promise<Provider | null> {
    try {
      const providers = await this.getAllProviders();
      return providers.find(p => p.isPrimary && p.isEnabled) || null;
    } catch (error) {
      console.error('Error getting primary provider:', error);
      return null;
    }
  }

  async addProvider(provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Prevent multiple Clara's Pocket providers
      if (provider.type === 'claras-pocket') {
        const providers = await this.getAllProviders();
        const existingClarasPocket = providers.find(p => p.type === 'claras-pocket');
        if (existingClarasPocket) {
          throw new Error("Clara's Pocket provider already exists. Only one instance is allowed.");
        }
      }

      const id = this.generateId();
      const now = new Date().toISOString();
      
      const newProvider: Provider = {
        ...provider,
        id,
        createdAt: now,
        updatedAt: now
      };

      // If this is being set as primary, unset other primary providers
      if (provider.isPrimary) {
        await this.setPrimaryProvider(id);
      }

      if (this.useIndexedDB) {
        await indexedDBService.put('providers', newProvider);
      } else {
        const providers = await this.getAllProviders();
        providers.push(newProvider);
        this.setItemToLocalStorage('providers', providers);
      }

      return id;
    } catch (error) {
      console.error('Error adding provider:', error);
      throw error;
    }
  }

  async updateProvider(id: string, updates: Partial<Provider>): Promise<void> {
    try {
      const providers = await this.getAllProviders();
      const index = providers.findIndex(p => p.id === id);
      
      if (index === -1) {
        throw new Error('Provider not found');
      }

      const updatedProvider = {
        ...providers[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // If this is being set as primary, unset other primary providers
      if (updates.isPrimary) {
        providers.forEach(p => {
          if (p.id !== id) p.isPrimary = false;
        });
      }

      providers[index] = updatedProvider;

      if (this.useIndexedDB) {
        await indexedDBService.put('providers', updatedProvider);
        // Update other providers if needed
        if (updates.isPrimary) {
          for (const provider of providers) {
            if (provider.id !== id && provider.isPrimary) {
              await indexedDBService.put('providers', { ...provider, isPrimary: false });
            }
          }
        }
      } else {
        this.setItemToLocalStorage('providers', providers);
      }
    } catch (error) {
      console.error('Error updating provider:', error);
      throw error;
    }
  }

  async deleteProvider(id: string): Promise<void> {
    try {
      const providers = await this.getAllProviders();
      const filteredProviders = providers.filter(p => p.id !== id);

      if (this.useIndexedDB) {
        await indexedDBService.delete('providers', id);
      } else {
        this.setItemToLocalStorage('providers', filteredProviders);
      }
    } catch (error) {
      console.error('Error deleting provider:', error);
      throw error;
    }
  }

  async setPrimaryProvider(id: string): Promise<void> {
    try {
      const providers = await this.getAllProviders();
      
      // Unset all primary providers
      providers.forEach(p => p.isPrimary = false);
      
      // Set the specified provider as primary
      const targetProvider = providers.find(p => p.id === id);
      if (targetProvider) {
        targetProvider.isPrimary = true;
        targetProvider.isEnabled = true; // Ensure primary provider is enabled
      }

      if (this.useIndexedDB) {
        // Update all providers in IndexedDB
        for (const provider of providers) {
          await indexedDBService.put('providers', provider);
        }
      } else {
        this.setItemToLocalStorage('providers', providers);
      }
    } catch (error) {
      console.error('Error setting primary provider:', error);
      throw error;
    }
  }

  async initializeDefaultProviders(): Promise<void> {
    try {
      const providers = await this.getAllProviders();
      
      // Clean up any duplicate Clara's Pocket providers (keep only the first one)
      const clarasPocketProviders = providers.filter(p => p.type === 'claras-pocket');
      if (clarasPocketProviders.length > 1) {
        console.log('Cleaning up duplicate Clara\'s Pocket providers...');
        // Keep the first one, delete the rest
        for (let i = 1; i < clarasPocketProviders.length; i++) {
          await this.deleteProvider(clarasPocketProviders[i].id);
        }
        // Refresh providers list after cleanup
        const updatedProviders = await this.getAllProviders();
        providers.length = 0;
        providers.push(...updatedProviders);
      }
      
      // Check if Clara's Pocket exists
      const clarasPocketExists = providers.some(p => p.type === 'claras-pocket');
      // Check if Ollama exists  
      const ollamaExists = providers.some(p => p.type === 'ollama' && p.name === 'Ollama');
      
      // Create Clara's Pocket if it doesn't exist
      if (!clarasPocketExists) {
        await this.addProvider({
          name: "Clara's Pocket",
          type: 'claras-pocket',
          baseUrl: 'http://localhost:8091/v1',
          isEnabled: true,
          isPrimary: true,
          config: {
            description: 'Local LLM service powered by llama.cpp'
          }
        });
      }

      // Create Ollama if it doesn't exist
      if (!ollamaExists) {
        await this.addProvider({
          name: 'Ollama',
          type: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'ollama',
          isEnabled: true,
          isPrimary: false,
          config: {
            description: 'Local Ollama service'
          }
        });
      }
      
      // Ensure at least one provider is primary
      const updatedProviders = await this.getAllProviders();
      const primaryProvider = updatedProviders.find(p => p.isPrimary);
      if (!primaryProvider) {
        const enabledProvider = updatedProviders.find(p => p.isEnabled);
        if (enabledProvider) {
          await this.setPrimaryProvider(enabledProvider.id);
        }
      }
    } catch (error) {
      console.error('Error initializing default providers:', error);
    }
  }
}

export const db = new LocalStorageDB();

export const updateChat = async (chatId: string, updates: { title?: string }) => {
  // Use the existing updateChat method on db instance
  await db.updateChat(chatId, updates);
};