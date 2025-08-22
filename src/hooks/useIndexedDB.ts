import { Project, FileNode } from '../types';

export const useIndexedDB = () => {
  // Initialize IndexedDB
  const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LumauiDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create projects store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        
        // Create project files store
        if (!db.objectStoreNames.contains('projectFiles')) {
          const filesStore = db.createObjectStore('projectFiles', { keyPath: 'projectId' });
        }
      };
    });
  };

  const saveProjectToDB = async (project: Project, fileStructure?: FileNode[]) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['projects', 'projectFiles'], 'readwrite');
      
      // Save project metadata
      const projectStore = transaction.objectStore('projects');
      await projectStore.put(project);
      
      // Save project files if provided
      if (fileStructure) {
        const filesStore = transaction.objectStore('projectFiles');
        await filesStore.put({
          projectId: project.id,
          files: fileStructure,
          lastModified: new Date()
        });
      }
      
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Failed to save project to IndexedDB:', error);
    }
  };

  const loadProjectsFromDB = async (): Promise<Project[]> => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['projects'], 'readonly');
      const store = transaction.objectStore('projects');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const projects = request.result.map((project: any) => ({
            ...project,
            createdAt: new Date(project.createdAt)
          }));
          // Sort by creation date, newest first
          projects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          resolve(projects);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load projects from IndexedDB:', error);
      return [];
    }
  };

  const loadProjectFilesFromDB = async (projectId: string): Promise<FileNode[]> => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['projectFiles'], 'readonly');
      const store = transaction.objectStore('projectFiles');
      
      return new Promise((resolve, reject) => {
        const request = store.get(projectId);
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.files);
          } else {
            resolve([]);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load project files from IndexedDB:', error);
      return [];
    }
  };

  const deleteProjectFromDB = async (projectId: string) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['projects', 'projectFiles'], 'readwrite');
      
      const projectStore = transaction.objectStore('projects');
      const filesStore = transaction.objectStore('projectFiles');
      
      await projectStore.delete(projectId);
      await filesStore.delete(projectId);
      
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Failed to delete project from IndexedDB:', error);
    }
  };

  return {
    saveProjectToDB,
    loadProjectsFromDB,
    loadProjectFilesFromDB,
    deleteProjectFromDB
  };
}; 
