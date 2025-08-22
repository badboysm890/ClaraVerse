/**
 * angela Agent Studio - Production Ready Framework
 * 
 * This is the main entry point for the Agent Studio framework.
 * It provides a complete plugin-based architecture for building
 * visual AI workflows with hot-reloading and LLM-powered node generation.
 * 
 * @version 2.0.0
 * @author angela Team
 */

// Core Framework
export { AgentStudioProvider } from './providers/AgentStudioProvider';
export { useAgentStudio } from './hooks/useAgentStudio';

// Plugin System
export { NodePlugin } from './plugins/NodePlugin';
export { PluginManager } from './plugins/PluginManager';
export { registerNode, unregisterNode } from './plugins/registry';

// Node Development Kit
export { createNode } from './sdk/createNode';
export { NodeBuilder } from './sdk/NodeBuilder';
export { withNodeValidation } from './sdk/withNodeValidation';

// Execution Engine
export { ExecutionEngine } from './engine/ExecutionEngine';
export { createExecutor } from './engine/createExecutor';

// Development Tools
export { NodeGenerator } from './tools/NodeGenerator';
export { HotReloader } from './tools/HotReloader';
export { StudioCLI } from './tools/StudioCLI';

// Types and Interfaces
export type {
  Node,
  NodeDefinition,
  NodePlugin as INodePlugin,
  ExecutionContext,
  StudioConfig,
  PluginConfig
} from './types';

// Constants
export { NODE_CATEGORIES, DATA_TYPES, EXECUTION_STATES } from './constants';

// Utilities
export { validateNodeDefinition } from './utils/validation';
export { generateNodeId } from './utils/ids';
export { createNodeTemplate } from './utils/templates';

/**
 * Quick Start API
 * 
 * For rapid prototyping and simple use cases
 */
export const AgentStudio = {
  // Quick node creation
  createNode,
  
  // LLM-powered generation
  generateNode: async (prompt: string) => {
    const generator = new NodeGenerator();
    return await generator.generateFromPrompt(prompt);
  },
  
  // Plugin management
  loadPlugin: async (pluginPath: string) => {
    const manager = PluginManager.getInstance();
    return await manager.loadPlugin(pluginPath);
  },
  
  // Development helpers
  startDevMode: () => {
    const reloader = new HotReloader();
    return reloader.start();
  }
};

/**
 * Version and metadata
 */
export const version = '2.0.0';
export const build = process.env.NODE_ENV || 'development';

/**
 * Default export for convenience
 */
export default AgentStudio; 
