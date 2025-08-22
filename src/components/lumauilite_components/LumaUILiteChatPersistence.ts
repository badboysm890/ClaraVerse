import { LiteProjectFile } from '../LumaUILite';
import { Message } from './LumaUILiteChatWindow';

export interface LumaUILiteCheckpoint {
  id: string;
  timestamp: Date;
  messages: Message[];
  projectFiles: LiteProjectFile[];
  metadata: {
    messageCount: number;
    userQuery: string;
  };
}

const ChatPersistence = {
  getStorageKey(projectId: string): string {
    return `lumaui-lite-chat-history-${projectId}`;
  },

  getIDBKey(projectId: string): string {
    return `lumaui-lite-chat-${projectId}`;
  },

  // Enhanced save with IndexedDB support
  async saveChatData(
    projectId: string,
    messages: Message[],
    checkpoints: LumaUILiteCheckpoint[]
  ): Promise<void> {
    try {
      if (!projectId) return;
      const data = {
        messages: messages,
        checkpoints: checkpoints,
        lastModified: new Date().toISOString(),
      };

      // Save to localStorage as primary storage
      localStorage.setItem(this.getStorageKey(projectId), JSON.stringify(data));

      // Also save to IndexedDB for better persistence
      try {
        await this.saveToIndexedDB(projectId, data);
      } catch (idbError) {
        console.warn('IndexedDB save failed, using localStorage only:', idbError);
      }
    } catch (error) {
      console.error('Error saving LumaUI-lite chat data:', error);
    }
  },

  // Enhanced load with IndexedDB fallback
  async loadChatData(
    projectId: string
  ): Promise<{ messages: Message[]; checkpoints: LumaUILiteCheckpoint[] } | null> {
    try {
      // Try localStorage first (faster)
      let data = null;
      const saved = localStorage.getItem(this.getStorageKey(projectId));
      if (saved) {
        data = JSON.parse(saved);
      } else {
        // Fallback to IndexedDB if localStorage is empty
        try {
          data = await this.loadFromIndexedDB(projectId);
        } catch (idbError) {
          console.warn('IndexedDB load failed:', idbError);
        }
      }

      if (!data) return null;
      
      // Ensure timestamps are Date objects
      const messages = data.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      const checkpoints = data.checkpoints.map((cp: any) => ({
        ...cp,
        timestamp: new Date(cp.timestamp),
        // Also convert timestamps in messages within checkpoints
        messages: cp.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        // Convert timestamps in project files if they exist
        projectFiles: cp.projectFiles.map((file: any) => ({
          ...file,
          lastModified: new Date(file.lastModified),
        })),
      }));

      return { messages, checkpoints };
    } catch (error) {
      console.error('Error loading LumaUI-lite chat data:', error);
      return null;
    }
  },

  // Enhanced delete with IndexedDB cleanup
  async deleteChatData(projectId: string): Promise<void> {
    try {
      localStorage.removeItem(this.getStorageKey(projectId));
      
      // Also delete from IndexedDB
      try {
        await this.deleteFromIndexedDB(projectId);
      } catch (idbError) {
        console.warn('IndexedDB delete failed:', idbError);
      }
    } catch (error) {
      console.error('Error deleting LumaUI-lite chat data:', error);
    }
  },

  // IndexedDB operations
  async saveToIndexedDB(projectId: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LumaUILiteChat', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('chatHistory')) {
          db.createObjectStore('chatHistory', { keyPath: 'projectId' });
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['chatHistory'], 'readwrite');
        const store = transaction.objectStore('chatHistory');
        
        store.put({ projectId, ...data });
        
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  },

  async loadFromIndexedDB(projectId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LumaUILiteChat', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('chatHistory')) {
          db.createObjectStore('chatHistory', { keyPath: 'projectId' });
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['chatHistory'], 'readonly');
        const store = transaction.objectStore('chatHistory');
        const getRequest = store.get(projectId);
        
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result || null);
        };
        
        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error);
        };
      };
    });
  },

  async deleteFromIndexedDB(projectId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LumaUILiteChat', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['chatHistory'], 'readwrite');
        const store = transaction.objectStore('chatHistory');
        
        store.delete(projectId);
        
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  },
};

export default ChatPersistence; 
