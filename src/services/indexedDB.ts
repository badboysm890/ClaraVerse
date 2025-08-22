const DB_NAME = 'angela_db';
const DB_VERSION = 9; // Increment version to trigger upgrade for Lumaui project stores

export class IndexedDBService {
  private db: IDBDatabase | null = null;
  private connecting: Promise<IDBDatabase> | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('Error opening database:', event);
        reject(new Error('Could not open database'));
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        
        if (!transaction) {
          console.error('No transaction available during upgrade');
          return;
        }

        // Create stores for all our data types
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          // Create indices for better lookups
          messageStore.createIndex('id_index', 'id', { unique: true });
          messageStore.createIndex('chat_id_index', 'chat_id', { unique: false });
        } else {
          // Ensure indices exist on existing store
          const messageStore = transaction.objectStore('messages');
          if (messageStore && !messageStore.indexNames.contains('id_index')) {
            messageStore.createIndex('id_index', 'id', { unique: true });
          }
          if (messageStore && !messageStore.indexNames.contains('chat_id_index')) {
            messageStore.createIndex('chat_id_index', 'chat_id', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains('storage')) {
          db.createObjectStore('storage', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('usage')) {
          db.createObjectStore('usage', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('model_usage')) {
          db.createObjectStore('model_usage', { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('system_settings')) {
          db.createObjectStore('system_settings', { keyPath: 'key' });
        }
        // Add the tools store
        if (!db.objectStoreNames.contains('tools')) {
          db.createObjectStore('tools', { keyPath: 'id' });
        }
        // Add designs store
        if (!db.objectStoreNames.contains('designs')) {
          const designStore = db.createObjectStore('designs', { keyPath: 'id' });
          designStore.createIndex('name_index', 'name', { unique: false });
          designStore.createIndex('created_at_index', 'createdAt', { unique: false });
        }
        // Add design versions store
        if (!db.objectStoreNames.contains('design_versions')) {
          const versionStore = db.createObjectStore('design_versions', { keyPath: 'id' });
          versionStore.createIndex('design_id_index', 'designId', { unique: false });
          versionStore.createIndex('version_number_index', 'versionNumber', { unique: false });
          versionStore.createIndex('created_at_index', 'createdAt', { unique: false });
        }
        // Add providers store
        if (!db.objectStoreNames.contains('providers')) {
          db.createObjectStore('providers', { keyPath: 'id' });
        }

        // Add angela-specific stores
        if (!db.objectStoreNames.contains('angela_sessions')) {
          const sessionStore = db.createObjectStore('angela_sessions', { keyPath: 'id' });
          sessionStore.createIndex('created_at_index', 'createdAt', { unique: false });
          sessionStore.createIndex('updated_at_index', 'updatedAt', { unique: false });
          sessionStore.createIndex('starred_index', 'isStarred', { unique: false });
          sessionStore.createIndex('archived_index', 'isArchived', { unique: false });
        }

        if (!db.objectStoreNames.contains('angela_messages')) {
          const messageStore = db.createObjectStore('angela_messages', { keyPath: 'id' });
          messageStore.createIndex('session_id_index', 'sessionId', { unique: false });
          messageStore.createIndex('timestamp_index', 'timestamp', { unique: false });
          messageStore.createIndex('role_index', 'role', { unique: false });
        }

        if (!db.objectStoreNames.contains('angela_files')) {
          const fileStore = db.createObjectStore('angela_files', { keyPath: 'id' });
          fileStore.createIndex('session_id_index', 'sessionId', { unique: false });
          fileStore.createIndex('message_id_index', 'messageId', { unique: false });
          fileStore.createIndex('type_index', 'type', { unique: false });
          fileStore.createIndex('created_at_index', 'createdAt', { unique: false });
        }

        // Add Agent Workflow stores
        if (!db.objectStoreNames.contains('agent_workflows')) {
          const workflowStore = db.createObjectStore('agent_workflows', { keyPath: 'id' });
          workflowStore.createIndex('name_index', 'name', { unique: false });
          workflowStore.createIndex('created_at_index', 'createdAt', { unique: false });
          workflowStore.createIndex('updated_at_index', 'updatedAt', { unique: false });
          workflowStore.createIndex('starred_index', 'metadata.isStarred', { unique: false });
          workflowStore.createIndex('archived_index', 'metadata.isArchived', { unique: false });
          workflowStore.createIndex('tags_index', 'metadata.tags', { unique: false, multiEntry: true });
        }

        // Add Lumaui Project stores
        if (!db.objectStoreNames.contains('lumaui_projects')) {
          console.log('🔧 IndexedDB: Creating lumaui_projects store');
          const projectStore = db.createObjectStore('lumaui_projects', { keyPath: 'id' });
          projectStore.createIndex('name_index', 'name', { unique: false });
          projectStore.createIndex('framework_index', 'framework', { unique: false });
          projectStore.createIndex('created_at_index', 'createdAt', { unique: false });
          projectStore.createIndex('last_modified_index', 'lastModified', { unique: false });
          projectStore.createIndex('status_index', 'status', { unique: false });
          console.log('✅ IndexedDB: lumaui_projects store created successfully');
        } else {
          console.log('ℹ️ IndexedDB: lumaui_projects store already exists');
        }

        if (!db.objectStoreNames.contains('lumaui_project_files')) {
          console.log('🔧 IndexedDB: Creating lumaui_project_files store');
          const filesStore = db.createObjectStore('lumaui_project_files', { keyPath: 'id' });
          filesStore.createIndex('project_id_index', 'projectId', { unique: false });
          console.log('✅ IndexedDB: lumaui_project_files store created successfully');
        } else {
          console.log('ℹ️ IndexedDB: lumaui_project_files store already exists');
        }

        if (!db.objectStoreNames.contains('workflow_templates')) {
          const templateStore = db.createObjectStore('workflow_templates', { keyPath: 'id' });
          templateStore.createIndex('category_index', 'category', { unique: false });
          templateStore.createIndex('tags_index', 'tags', { unique: false, multiEntry: true });
          templateStore.createIndex('public_index', 'isPublic', { unique: false });
          templateStore.createIndex('downloads_index', 'downloads', { unique: false });
          templateStore.createIndex('rating_index', 'rating', { unique: false });
        }

        if (!db.objectStoreNames.contains('workflow_versions')) {
          const versionStore = db.createObjectStore('workflow_versions', { keyPath: 'id' });
          versionStore.createIndex('workflow_id_index', 'workflowId', { unique: false });
          versionStore.createIndex('version_number_index', 'versionNumber', { unique: false });
          versionStore.createIndex('created_at_index', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('workflow_metadata')) {
          const metadataStore = db.createObjectStore('workflow_metadata', { keyPath: 'id' });
          metadataStore.createIndex('workflow_id_index', 'workflowId', { unique: false });
          metadataStore.createIndex('type_index', 'type', { unique: false });
        }

        // Add Agent UI designs store
        if (!db.objectStoreNames.contains('agent_ui_designs')) {
          const uiStore = db.createObjectStore('agent_ui_designs', { keyPath: 'id' });
          uiStore.createIndex('agent_id_index', 'agentId', { unique: false });
          uiStore.createIndex('created_at_index', 'createdAt', { unique: false });
          uiStore.createIndex('updated_at_index', 'updatedAt', { unique: false });
        }
      };
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = (event) => {
          const result = ((event.target as IDBRequest).result as T[]);
          resolve(result);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in getAll(${storeName}):`, error);
      throw error;
    }
  }

  async get<T>(storeName: string, key: string | number): Promise<T | undefined> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = (event) => {
          const result = ((event.target as IDBRequest).result as T | undefined);
          resolve(result);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in get(${storeName}, ${key}):`, error);
      throw error;
    }
  }

  async getByIndex<T>(storeName: string, indexName: string, value: string): Promise<T | undefined> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.get(value);

        request.onsuccess = (event) => {
          const result = ((event.target as IDBRequest).result as T);
          resolve(result);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in getByIndex(${storeName}, ${indexName}):`, error);
      return undefined;
    }
  }

  async put<T>(storeName: string, value: T): Promise<T> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value);

        request.onsuccess = (event) => {
          const result = ((event.target as IDBRequest).result as T);
          resolve(value);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in put(${storeName}):`, error);
      throw error;
    }
  }

  async delete(storeName: string, key: string | number): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = (event) => {
          resolve();
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in delete(${storeName}, ${key}):`, error);
      throw error;
    }
  }

  async clear(storeName: string): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = (event) => {
          resolve();
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          reject(error);
        };
      });
    } catch (error) {
      console.error(`Error in clear(${storeName}):`, error);
      throw error;
    }
  }

  async findMessage<T>(messageId: string): Promise<T | undefined> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('messages', 'readonly');
        const store = transaction.objectStore('messages');
        
        // Try using the index first
        if (store.indexNames.contains('id_index')) {
          const index = store.index('id_index');
          const request = index.get(messageId);
          
          request.onsuccess = (event) => {
            const result = ((event.target as IDBRequest).result as T);
            if (result) {
              resolve(result);
            } else {
              // Fallback to full scan if index lookup fails
              const getAllRequest = store.getAll();
              getAllRequest.onsuccess = (event) => {
                const results = ((event.target as IDBRequest).result as T[]);
                const message = results.find((msg: any) => msg.id === messageId);
                resolve(message);
              };
              getAllRequest.onerror = (event) => {
                const error = (event.target as IDBRequest).error;
                reject(error);
              };
            }
          };
          request.onerror = (event) => {
            const error = (event.target as IDBRequest).error;
            reject(error);
          };
        } else {
          // If index doesn't exist, do a full scan
          const request = store.getAll();
          request.onsuccess = (event) => {
            const results = ((event.target as IDBRequest).result as T[]);
            const message = results.find((msg: any) => msg.id === messageId);
            resolve(message);
          };
          request.onerror = (event) => {
            const error = (event.target as IDBRequest).error;
            reject(error);
          };
        }
      });
    } catch (error) {
      console.error('Error finding message:', error);
      return undefined;
    }
  }

  // Design methods
  async getAllDesigns(): Promise<any[]> {
    return this.getAll('designs');
  }

  async getDesignById(id: string): Promise<any> {
    return this.get('designs', id);
  }

  async addDesign(design: any): Promise<any> {
    return this.put('designs', design);
  }

  async updateDesign(design: any): Promise<any> {
    return this.put('designs', design);
  }

  async deleteDesign(id: string): Promise<void> {
    return this.delete('designs', id);
  }

  async clearDesigns(): Promise<void> {
    return this.clear('designs');
  }

  // Design version methods
  async getAllDesignVersions(): Promise<any[]> {
    return this.getAll('design_versions');
  }

  async getDesignVersionById(id: string): Promise<any> {
    return this.get('design_versions', id);
  }

  async getDesignVersionsByDesignId(designId: string): Promise<any[]> {
    const result = await this.getByIndex('design_versions', 'design_id_index', designId);
    return result ? [result] : [];
  }

  async addDesignVersion(version: any): Promise<any> {
    return this.put('design_versions', version);
  }

  async updateDesignVersion(version: any): Promise<any> {
    return this.put('design_versions', version);
  }

  async deleteDesignVersion(id: string): Promise<void> {
    return this.delete('design_versions', id);
  }

  async clearDesignVersions(): Promise<void> {
    return this.clear('design_versions');
  }

  // Custom Model Path methods
  async getCustomModelPath(): Promise<string | null> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('custom_model_path');
        request.onsuccess = (event) => {
          const result = (event.target as IDBRequest).result;
          resolve(result ? result.value : null);
        };
        request.onerror = (event) => {
          resolve(null);
        };
      });
    } catch (error) {
      return null;
    }
  }

  async setCustomModelPath(path: string | null): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        if (path) {
          const request = store.put({ key: 'custom_model_path', value: path });
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } else {
          const request = store.delete('custom_model_path');
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        }
      });
    } catch (error) {
      // ignore
    }
  }
}

export const indexedDBService = new IndexedDBService();
