export interface ModelMmprojMapping {
  modelPath: string;
  modelName: string;
  mmprojPath: string;
  mmprojName: string;
  assignedAt: string;
  isManual: boolean; // true if manually assigned by user, false if auto-assigned during download
}

export interface MmprojFile {
  name: string;
  path: string;
  size: number;
  source: 'user' | 'bundled' | 'custom';
  embeddingSize?: number;
  isCompatible?: boolean;
  compatibilityReason?: string;
}

class ModelMmprojMappingService {
  private static readonly STORAGE_KEY = 'model_mmproj_mappings';
  private static readonly CONFIG_FILE = 'model-mmproj-mappings.json';

  /**
   * Get all model-mmproj mappings
   */
  static getMappings(): ModelMmprojMapping[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading model-mmproj mappings:', error);
    }
    return [];
  }

  /**
   * Save model-mmproj mappings
   */
  static saveMappings(mappings: ModelMmprojMapping[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mappings));
      // Also save to backend if available
      this.saveToBackend(mappings);
    } catch (error) {
      console.error('Error saving model-mmproj mappings:', error);
    }
  }

  /**
   * Get mmproj mapping for a specific model
   */
  static getMappingForModel(modelPath: string): ModelMmprojMapping | null {
    const mappings = this.getMappings();
    return mappings.find(mapping => mapping.modelPath === modelPath) || null;
  }

  /**
   * Set mmproj mapping for a model
   */
  static setMapping(
    modelPath: string,
    modelName: string,
    mmprojPath: string,
    mmprojName: string,
    isManual: boolean = true
  ): void {
    console.log('🔍 setMapping called with:', { modelPath, modelName, mmprojPath, mmprojName, isManual });
    
    const mappings = this.getMappings();
    console.log('🔍 Current mappings before update:', mappings);
    
    const existingIndex = mappings.findIndex(mapping => mapping.modelPath === modelPath);
    
    const newMapping: ModelMmprojMapping = {
      modelPath,
      modelName,
      mmprojPath,
      mmprojName,
      assignedAt: new Date().toISOString(),
      isManual
    };

    if (existingIndex >= 0) {
      console.log('🔍 Updating existing mapping at index:', existingIndex);
      mappings[existingIndex] = newMapping;
    } else {
      console.log('🔍 Adding new mapping');
      mappings.push(newMapping);
    }

    console.log('🔍 Updated mappings:', mappings);
    this.saveMappings(mappings);
    
    // Save to backend asynchronously
    console.log('🔍 Calling saveToBackend...');
    this.saveToBackend(mappings).catch(error => {
      console.error('❌ Failed to save mmproj mappings to backend:', error);
    });
  }

  /**
   * Remove mmproj mapping for a model
   */
  static removeMapping(modelPath: string): void {
    const mappings = this.getMappings();
    const filteredMappings = mappings.filter(mapping => mapping.modelPath !== modelPath);
    this.saveMappings(filteredMappings);
    
    // Save to backend asynchronously
    this.saveToBackend(filteredMappings).catch(error => {
      console.error('Failed to save mmproj mappings to backend:', error);
    });
  }

  /**
   * Remove all mappings that reference a specific mmproj file
   */
  static removeMappingsForMmproj(mmprojPath: string): void {
    const mappings = this.getMappings();
    const filteredMappings = mappings.filter(mapping => mapping.mmprojPath !== mmprojPath);
    this.saveMappings(filteredMappings);
  }

  /**
   * Get all models that use a specific mmproj file
   */
  static getModelsUsingMmproj(mmprojPath: string): ModelMmprojMapping[] {
    const mappings = this.getMappings();
    return mappings.filter(mapping => mapping.mmprojPath === mmprojPath);
  }

  /**
   * Check if a model has an mmproj mapping
   */
  static hasMapping(modelPath: string): boolean {
    return this.getMappingForModel(modelPath) !== null;
  }

  /**
   * Get available mmproj files from the backend
   */
  static async getAvailableMmprojFiles(): Promise<MmprojFile[]> {
    try {
      if (window.modelManager?.getLocalModels) {
        const result = await window.modelManager.getLocalModels();
        if (result.success) {
          // Define the local model type
          interface LocalModelFromBackend {
            file: string;
            path: string;
            size: number;
            source: 'user' | 'bundled' | 'custom';
          }
          
          // Filter for mmproj files
          const mmprojFiles = result.models.filter((model: LocalModelFromBackend) => 
            this.isMmprojFile(model.file)
          ).map((model: LocalModelFromBackend): MmprojFile => ({
            name: model.file,
            path: model.path,
            size: model.size,
            source: model.source
          }));

          // Get embedding info for each mmproj file
          for (const file of mmprojFiles) {
            try {
              if (window.modelManager?.getModelEmbeddingInfo) {
                const embeddingInfo = await window.modelManager.getModelEmbeddingInfo(file.path);
                if (embeddingInfo.success && embeddingInfo.embeddingSize) {
                  file.embeddingSize = typeof embeddingInfo.embeddingSize === 'number' 
                    ? embeddingInfo.embeddingSize 
                    : parseInt(embeddingInfo.embeddingSize as string) || undefined;
                }
              }
            } catch (error) {
              console.warn(`Could not get embedding info for ${file.name}:`, error);
            }
          }

          return mmprojFiles;
        }
      }
    } catch (error) {
      console.error('Error getting available mmproj files:', error);
    }
    return [];
  }

  /**
   * Check if a file is an mmproj file
   */
  static isMmprojFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.includes('mmproj') || 
           lower.includes('mm-proj') ||
           lower.includes('projection');
  }

  /**
   * Save mappings to backend for persistence
   */
  private static async saveToBackend(mappings: ModelMmprojMapping[]): Promise<void> {
    try {
      console.log('🔍 saveToBackend called with mappings:', mappings);
      if (window.modelManager?.saveMmprojMappings) {
        console.log('🔍 Calling window.modelManager.saveMmprojMappings...');
        const result = await window.modelManager.saveMmprojMappings(mappings);
        console.log('🔍 Backend save result:', result);
      } else {
        console.error('❌ window.modelManager.saveMmprojMappings not available');
      }
    } catch (error) {
      console.error('❌ Could not save mappings to backend:', error);
    }
  }

  /**
   * Load mappings from backend
   */
  static async loadFromBackend(): Promise<ModelMmprojMapping[]> {
    try {
      if (window.modelManager?.loadMmprojMappings) {
        const result = await window.modelManager.loadMmprojMappings();
        if (result.success && result.mappings) {
          // Merge with local storage, preferring backend data
          const localMappings = this.getMappings();
          const backendMappings = result.mappings;
          
          // Create a map for efficient lookup
          const mergedMap = new Map<string, ModelMmprojMapping>();
          
          // Add local mappings first
          localMappings.forEach(mapping => {
            mergedMap.set(mapping.modelPath, mapping);
          });
          
          // Override with backend mappings (they're more authoritative)
          // Backend returns object format, convert to array for processing
          const backendMappingsArray = Array.isArray(backendMappings) 
            ? backendMappings 
            : Object.values(backendMappings) as ModelMmprojMapping[];
            
          backendMappingsArray.forEach((mapping: ModelMmprojMapping) => {
            mergedMap.set(mapping.modelPath, mapping);
          });
          
          const mergedMappings = Array.from(mergedMap.values());
          this.saveMappings(mergedMappings);
          
          return mergedMappings;
        }
      }
    } catch (error) {
      console.warn('Could not load mappings from backend:', error);
    }
    return this.getMappings();
  }

  /**
   * Import mappings (for backup/restore functionality)
   */
  static importMappings(mappings: ModelMmprojMapping[]): void {
    this.saveMappings(mappings);
  }

  /**
   * Export mappings (for backup functionality)
   */
  static exportMappings(): ModelMmprojMapping[] {
    return this.getMappings();
  }

  /**
   * Cleanup invalid mappings (for maintenance)
   */
  static async cleanupInvalidMappings(): Promise<void> {
    try {
      const mappings = this.getMappings();
      const validMappings: ModelMmprojMapping[] = [];

      if (window.modelManager?.getLocalModels) {
        const result = await window.modelManager.getLocalModels();
        if (result.success) {
          interface CleanupModel {
            path: string;
          }
          const existingPaths = new Set(result.models.map((model: CleanupModel) => model.path));
          
          // Only keep mappings where both model and mmproj still exist
          for (const mapping of mappings) {
            if (existingPaths.has(mapping.modelPath) && existingPaths.has(mapping.mmprojPath)) {
              validMappings.push(mapping);
            }
          }
          
          if (validMappings.length !== mappings.length) {
            console.log(`Cleaned up ${mappings.length - validMappings.length} invalid mmproj mappings`);
            this.saveMappings(validMappings);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up invalid mappings:', error);
    }
  }
}

// Add test function to global for debugging
declare global {
  interface Window {
    testMmprojSave: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.testMmprojSave = () => {
    console.log('🧪 Testing mmproj save functionality...');
    try {
      ModelMmprojMappingService.setMapping(
        '/test/model.gguf',
        'test-model',
        '/test/mmproj.gguf', 
        'test-mmproj',
        true
      );
      console.log('🧪 Test mapping set successfully');
    } catch (error) {
      console.error('🧪 Test failed:', error);
    }
  };
}

export default ModelMmprojMappingService; 
