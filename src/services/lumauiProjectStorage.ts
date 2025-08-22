import { IndexedDBService } from './indexedDB';
import type { Project, FileSystemTree, ProjectStatus, AIProvider } from '../components/lumaui_components/types/index';

const indexedDBService = new IndexedDBService();

export interface PersistedProject {
  id: string;
  name: string;
  description: string;
  framework: 'react' | 'vanilla-html';
  status: ProjectStatus;
  lastModified: string;
  createdAt: string;
  files: FileSystemTree;
  aiProvider?: string;
  model?: string;
  prompt?: string;
  previewUrl?: string;
  port?: number;
}

export class LumauiProjectStorage {
  private static readonly PROJECTS_STORE = 'lumaui_projects';
  private static readonly PROJECT_FILES_STORE = 'lumaui_project_files';
  
  /**
   * Initialize the storage service
   */
  static async initialize(): Promise<void> {
    try {
      console.log('🔄 LumauiProjectStorage: Initializing storage service...');
      
      // Test if stores exist by attempting to access them
      await indexedDBService.getAll(this.PROJECTS_STORE);
      console.log('✅ LumauiProjectStorage: Projects store accessible');
      
      await indexedDBService.getAll(this.PROJECT_FILES_STORE);
      console.log('✅ LumauiProjectStorage: Project files store accessible');
      
      console.log('✅ LumauiProjectStorage: Storage service initialized successfully');
    } catch (error) {
      console.error('❌ LumauiProjectStorage: Failed to initialize storage:', error);
      console.warn('🔧 LumauiProjectStorage: Stores will be created on database upgrade');
      throw error;
    }
  }

  /**
   * Get all projects
   */
  static async getAllProjects(): Promise<PersistedProject[]> {
    try {
      console.log('📚 LumauiProjectStorage: Loading all projects from IndexedDB');
      const projects = await indexedDBService.getAll<PersistedProject>(this.PROJECTS_STORE);
      console.log(`📊 LumauiProjectStorage: Found ${projects.length} projects:`, projects);
      return projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    } catch (error) {
      console.error('❌ LumauiProjectStorage: Error getting projects:', error);
      return [];
    }
  }

  /**
   * Get a specific project
   */
  static async getProject(id: string): Promise<PersistedProject | undefined> {
    try {
      return await indexedDBService.get<PersistedProject>(this.PROJECTS_STORE, id);
    } catch (error) {
      console.error('Error getting project:', error);
      return undefined;
    }
  }

  /**
   * Save a project
   */
  static async saveProject(project: Project): Promise<boolean> {
    try {
      console.log('🔄 LumauiProjectStorage: Attempting to save project:', {
        id: project.id,
        name: project.name,
        framework: project.framework,
        status: project.status
      });

      const persistedProject: PersistedProject = {
        id: project.id,
        name: project.name,
        description: project.description,
        framework: project.framework,
        status: project.status,
        lastModified: new Date().toISOString(),
        createdAt: project.lastModified.toISOString(),
        files: project.files || {},
        aiProvider: project.aiProvider,
        model: project.model,
        prompt: project.prompt,
        previewUrl: project.previewUrl,
        port: (project as any).port
      };

      console.log('💾 LumauiProjectStorage: Saving to IndexedDB with data:', persistedProject);
      await indexedDBService.put(this.PROJECTS_STORE, persistedProject);
      console.log('✅ LumauiProjectStorage: Project saved successfully');
      
      // Verify save by reading it back
      const savedProject = await indexedDBService.get<PersistedProject>(this.PROJECTS_STORE, project.id);
      console.log('🔍 LumauiProjectStorage: Verification read result:', savedProject);
      
      return true;
    } catch (error) {
      console.error('❌ LumauiProjectStorage: Error saving project:', error);
      return false;
    }
  }

  /**
   * Update project status and URL
   */
  static async updateProjectStatus(
    id: string, 
    status: 'idle' | 'running' | 'error', 
    previewUrl?: string,
    port?: number
  ): Promise<boolean> {
    try {
      const project = await this.getProject(id);
      if (!project) return false;

      project.status = status;
      project.lastModified = new Date().toISOString();
      
      if (previewUrl !== undefined) {
        project.previewUrl = previewUrl;
      }
      
      if (port !== undefined) {
        project.port = port;
      }

      await indexedDBService.put(this.PROJECTS_STORE, project);
      return true;
    } catch (error) {
      console.error('Error updating project status:', error);
      return false;
    }
  }

  /**
   * Delete a project
   */
  static async deleteProject(id: string): Promise<boolean> {
    try {
      await indexedDBService.delete(this.PROJECTS_STORE, id);
      // Also delete associated files
      await indexedDBService.delete(this.PROJECT_FILES_STORE, id);
      return true;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  }

  /**
   * Convert persisted project back to runtime project
   */
  static persistedToProject(persisted: PersistedProject): Project {
    return {
      id: persisted.id,
      name: persisted.name,
      description: persisted.description,
      framework: persisted.framework,
      status: persisted.status,
      lastModified: new Date(persisted.lastModified),
      files: persisted.files,
      aiProvider: persisted.aiProvider as AIProvider,
      model: persisted.model,
      prompt: persisted.prompt,
      previewUrl: persisted.previewUrl,
      preview: persisted.previewUrl || '',
      // WebContainer will be recreated when needed
      webContainer: undefined
    };
  }

  /**
   * Clear all projects (for cleanup/reset)
   */
  static async clearAllProjects(): Promise<boolean> {
    try {
      await indexedDBService.clear(this.PROJECTS_STORE);
      await indexedDBService.clear(this.PROJECT_FILES_STORE);
      return true;
    } catch (error) {
      console.error('Error clearing projects:', error);
      return false;
    }
  }

  /**
   * Debug method to check database stores
   */
  static async debugDatabaseStores(): Promise<string[]> {
    try {
      // Access the database directly to check available stores
      const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('angela_db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      const db = await dbPromise;
      const storeNames = Array.from(db.objectStoreNames);
      console.log('📊 Available IndexedDB stores:', storeNames);
      
      const lumauiStores = storeNames.filter(name => name.startsWith('lumaui_'));
      console.log('🎯 Lumaui-specific stores:', lumauiStores);
      
      db.close();
      return storeNames;
    } catch (error) {
      console.error('❌ Error checking database stores:', error);
      return [];
    }
  }
} 
