import { indexedDBService } from './indexedDB';
import { AgentUI, UIComponent } from '../types/agent/ui-builder';

/**
 * Storage service for Agent UI designs
 * Handles saving, loading, and managing custom agent interfaces
 */
export class AgentUIStorage {
  private readonly UI_STORE = 'agent_ui_designs';
  private readonly CURRENT_VERSION = '1.0.0';

  constructor() {
    this.initializeStore();
  }

  /**
   * Initialize IndexedDB store
   */
  private async initializeStore(): Promise<void> {
    try {
      await indexedDBService.getAll(this.UI_STORE);
    } catch (error) {
      console.warn('Agent UI store will be created on first use');
    }
  }

  /**
   * Generate a unique ID for UI designs
   */
  private generateId(): string {
    return `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save an agent UI design
   */
  async saveAgentUI(agentId: string, components: UIComponent[], metadata?: Partial<AgentUI>): Promise<{ success: boolean; id: string; errors?: string[] }> {
    try {
      const now = new Date().toISOString();
      
      // Check if UI already exists for this agent
      const existingUI = await this.getAgentUI(agentId);
      
      const agentUI: AgentUI = {
        id: existingUI?.id || this.generateId(),
        agentId,
        name: metadata?.name || `${agentId} UI`,
        description: metadata?.description,
        components,
        layout: metadata?.layout || {
          width: 800,
          height: 600,
          responsive: true
        },
        theme: metadata?.theme || {
          primaryColor: '#3b82f6',
          backgroundColor: '#ffffff',
          textColor: '#1f2937',
          borderColor: '#e5e7eb'
        },
        createdAt: existingUI?.createdAt || now,
        updatedAt: now
      };

      await indexedDBService.put(this.UI_STORE, agentUI);

      return {
        success: true,
        id: agentUI.id
      };
    } catch (error) {
      console.error('Failed to save agent UI:', error);
      return {
        success: false,
        id: '',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get UI design for a specific agent
   */
  async getAgentUI(agentId: string): Promise<AgentUI | null> {
    try {
      const allUIs = await indexedDBService.getAll<AgentUI>(this.UI_STORE);
      const agentUI = allUIs.find((ui) => ui.agentId === agentId);
      return agentUI || null;
    } catch (error) {
      console.error('Failed to get agent UI:', error);
      return null;
    }
  }

  /**
   * Get UI design by ID
   */
  async getUIById(uiId: string): Promise<AgentUI | null> {
    try {
      const ui = await indexedDBService.get<AgentUI>(this.UI_STORE, uiId);
      return ui || null;
    } catch (error) {
      console.error('Failed to get UI by ID:', error);
      return null;
    }
  }

  /**
   * Get all UI designs
   */
  async getAllAgentUIs(): Promise<AgentUI[]> {
    try {
      const allUIs = await indexedDBService.getAll<AgentUI>(this.UI_STORE);
      return allUIs.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('Failed to get all agent UIs:', error);
      return [];
    }
  }

  /**
   * Delete an agent UI design
   */
  async deleteAgentUI(uiId: string): Promise<boolean> {
    try {
      await indexedDBService.delete(this.UI_STORE, uiId);
      return true;
    } catch (error) {
      console.error('Failed to delete agent UI:', error);
      return false;
    }
  }

  /**
   * Delete UI design for a specific agent
   */
  async deleteAgentUIByAgentId(agentId: string): Promise<boolean> {
    try {
      const agentUI = await this.getAgentUI(agentId);
      if (agentUI) {
        return await this.deleteAgentUI(agentUI.id);
      }
      return true; // No UI to delete
    } catch (error) {
      console.error('Failed to delete agent UI by agent ID:', error);
      return false;
    }
  }

  /**
   * Duplicate an agent UI design
   */
  async duplicateAgentUI(uiId: string, newAgentId?: string): Promise<{ success: boolean; id: string; errors?: string[] }> {
    try {
      const originalUI = await this.getUIById(uiId);
      if (!originalUI) {
        return {
          success: false,
          id: '',
          errors: ['Original UI not found']
        };
      }

      const now = new Date().toISOString();
      const duplicatedUI: AgentUI = {
        ...originalUI,
        id: this.generateId(),
        agentId: newAgentId || originalUI.agentId,
        name: `${originalUI.name} (Copy)`,
        createdAt: now,
        updatedAt: now,
        components: originalUI.components.map(component => ({
          ...component,
          id: `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }))
      };

      await indexedDBService.put(this.UI_STORE, duplicatedUI);

      return {
        success: true,
        id: duplicatedUI.id
      };
    } catch (error) {
      console.error('Failed to duplicate agent UI:', error);
      return {
        success: false,
        id: '',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Export an agent UI design
   */
  async exportAgentUI(uiId: string): Promise<{ success: boolean; data?: any; errors?: string[] }> {
    try {
      const ui = await this.getUIById(uiId);
      if (!ui) {
        return {
          success: false,
          errors: ['UI not found']
        };
      }

      const exportData = {
        version: this.CURRENT_VERSION,
        exportedAt: new Date().toISOString(),
        ui: ui,
        metadata: {
          componentCount: ui.components.length,
          lastModified: ui.updatedAt
        }
      };

      return {
        success: true,
        data: exportData
      };
    } catch (error) {
      console.error('Failed to export agent UI:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Import an agent UI design
   */
  async importAgentUI(data: any, agentId: string): Promise<{ success: boolean; id: string; errors?: string[] }> {
    try {
      if (!data.ui) {
        return {
          success: false,
          id: '',
          errors: ['Invalid import data: missing UI']
        };
      }

      const now = new Date().toISOString();
      const importedUI: AgentUI = {
        ...data.ui,
        id: this.generateId(),
        agentId: agentId,
        createdAt: now,
        updatedAt: now,
        components: data.ui.components.map((component: UIComponent) => ({
          ...component,
          id: `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }))
      };

      await indexedDBService.put(this.UI_STORE, importedUI);

      return {
        success: true,
        id: importedUI.id
      };
    } catch (error) {
      console.error('Failed to import agent UI:', error);
      return {
        success: false,
        id: '',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalUIs: number;
    totalComponents: number;
    averageComponentsPerUI: number;
    lastModified?: string;
  }> {
    try {
      const allUIs = await this.getAllAgentUIs();
      const totalComponents = allUIs.reduce((sum, ui) => sum + ui.components.length, 0);
      
      return {
        totalUIs: allUIs.length,
        totalComponents,
        averageComponentsPerUI: allUIs.length > 0 ? Math.round(totalComponents / allUIs.length) : 0,
        lastModified: allUIs.length > 0 ? allUIs[0].updatedAt : undefined
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        totalUIs: 0,
        totalComponents: 0,
        averageComponentsPerUI: 0
      };
    }
  }
}

// Export singleton instance
export const agentUIStorage = new AgentUIStorage(); 
