/**
 * angela Agent Studio - Constants
 * 
 * This file contains all the constants used throughout the Agent Studio framework.
 */

// ========================================
// Node Categories
// ========================================

export const NODE_CATEGORIES = {
  TRIGGERS: 'triggers',
  ACTIONS: 'actions',
  TRANSFORMERS: 'transformers',
  UTILITIES: 'utilities',
  AI: 'ai',
  DATA: 'data',
  FLOW_CONTROL: 'flow-control',
  INTEGRATIONS: 'integrations',
  CUSTOM: 'custom'
} as const;

export type NodeCategory = typeof NODE_CATEGORIES[keyof typeof NODE_CATEGORIES];

// ========================================
// Data Types
// ========================================

export const DATA_TYPES = {
  ANY: 'any',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'array',
  JSON: 'json',
  FILE: 'file',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  TEXT: 'text',
  HTML: 'html',
  MARKDOWN: 'markdown',
  CSV: 'csv',
  XML: 'xml',
  DATE: 'date',
  TIME: 'time',
  DATETIME: 'datetime',
  URL: 'url',
  EMAIL: 'email',
  PHONE: 'phone',
  IP_ADDRESS: 'ip-address',
  UUID: 'uuid',
  REGEX: 'regex',
  CODE: 'code',
  SQL: 'sql',
  BINARY: 'binary',
  BASE64: 'base64'
} as const;

export type DataType = typeof DATA_TYPES[keyof typeof DATA_TYPES];

// ========================================
// Execution States
// ========================================

export const EXECUTION_STATES = {
  IDLE: 'idle',
  PENDING: 'pending',
  EXECUTING: 'executing',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  SKIPPED: 'skipped'
} as const;

export type ExecutionState = typeof EXECUTION_STATES[keyof typeof EXECUTION_STATES];

// ========================================
// Event Types
// ========================================

export const STUDIO_EVENTS = {
  // Flow events
  FLOW_CREATED: 'flow:created',
  FLOW_LOADED: 'flow:loaded',
  FLOW_SAVED: 'flow:saved',
  FLOW_DELETED: 'flow:deleted',
  FLOW_EXPORTED: 'flow:exported',
  FLOW_IMPORTED: 'flow:imported',
  
  // Node events
  NODE_ADDED: 'node:added',
  NODE_UPDATED: 'node:updated',
  NODE_DELETED: 'node:deleted',
  NODE_SELECTED: 'node:selected',
  NODE_DESELECTED: 'node:deselected',
  NODE_CONNECTED: 'node:connected',
  NODE_DISCONNECTED: 'node:disconnected',
  
  // Execution events
  EXECUTION_STARTED: 'execution:started',
  EXECUTION_COMPLETED: 'execution:completed',
  EXECUTION_FAILED: 'execution:failed',
  EXECUTION_CANCELLED: 'execution:cancelled',
  
  // Plugin events
  PLUGIN_LOADED: 'plugin:loaded',
  PLUGIN_UNLOADED: 'plugin:unloaded',
  PLUGIN_ERROR: 'plugin:error',
  
  // Editor events
  EDITOR_READY: 'editor:ready',
  EDITOR_CHANGED: 'editor:changed',
  EDITOR_SAVED: 'editor:saved'
} as const;

// ========================================
// Plugin System
// ========================================

export const PLUGIN_STATES = {
  UNLOADED: 'unloaded',
  LOADING: 'loading',
  LOADED: 'loaded',
  ACTIVE: 'active',
  ERROR: 'error',
  DISABLED: 'disabled'
} as const;

export const PLUGIN_TYPES = {
  NODE: 'node',
  THEME: 'theme',
  EXTENSION: 'extension',
  INTEGRATION: 'integration'
} as const;

// ========================================
// Node Property Types
// ========================================

export const NODE_PROPERTY_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  JSON: 'json',
  CODE: 'code',
  FILE: 'file',
  COLOR: 'color',
  DATE: 'date',
  TIME: 'time',
  DATETIME: 'datetime',
  SLIDER: 'slider',
  TEXTAREA: 'textarea',
  PASSWORD: 'password'
} as const;

// ========================================
// Validation Rules
// ========================================

export const VALIDATION_RULES = {
  REQUIRED: 'required',
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  MIN_VALUE: 'minValue',
  MAX_VALUE: 'maxValue',
  PATTERN: 'pattern',
  EMAIL: 'email',
  URL: 'url',
  JSON: 'json',
  CUSTOM: 'custom'
} as const;

// ========================================
// Export Formats
// ========================================

export const EXPORT_FORMATS = {
  angela_NATIVE: 'angela-native',
  JSON: 'json',
  YAML: 'yaml',
  DOCKER: 'docker',
  API_SERVER: 'api-server',
  NPM_PACKAGE: 'npm-package',
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  PYTHON: 'python'
} as const;

// ========================================
// Theme Colors
// ========================================

export const THEME_COLORS = {
  PRIMARY: '#f472b6', // sakura-400
  PRIMARY_DARK: '#ec4899', // sakura-500
  PRIMARY_LIGHT: '#fbb6ce', // sakura-300
  
  SUCCESS: '#10b981', // emerald-500
  WARNING: '#f59e0b', // amber-500
  ERROR: '#ef4444', // red-500
  INFO: '#3b82f6', // blue-500
  
  GRAY_50: '#f9fafb',
  GRAY_100: '#f3f4f6',
  GRAY_200: '#e5e7eb',
  GRAY_300: '#d1d5db',
  GRAY_400: '#9ca3af',
  GRAY_500: '#6b7280',
  GRAY_600: '#4b5563',
  GRAY_700: '#374151',
  GRAY_800: '#1f2937',
  GRAY_900: '#111827'
} as const;

// ========================================
// Node Category Colors
// ========================================

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  [NODE_CATEGORIES.TRIGGERS]: THEME_COLORS.SUCCESS,
  [NODE_CATEGORIES.ACTIONS]: THEME_COLORS.PRIMARY,
  [NODE_CATEGORIES.TRANSFORMERS]: THEME_COLORS.INFO,
  [NODE_CATEGORIES.UTILITIES]: THEME_COLORS.GRAY_500,
  [NODE_CATEGORIES.AI]: '#8b5cf6', // purple-500
  [NODE_CATEGORIES.DATA]: '#06b6d4', // cyan-500
  [NODE_CATEGORIES.FLOW_CONTROL]: THEME_COLORS.WARNING,
  [NODE_CATEGORIES.INTEGRATIONS]: '#84cc16', // lime-500
  [NODE_CATEGORIES.CUSTOM]: THEME_COLORS.GRAY_600
};

// ========================================
// Default Configuration
// ========================================

export const DEFAULT_CONFIG = {
  autoSave: true,
  autoSaveInterval: 30000, // 30 seconds
  hotReload: true,
  debugMode: false,
  pluginDirectories: ['./plugins', './node_modules/@angela/agent-studio-*'],
  allowRemotePlugins: false,
  defaultTimeout: 30000,
  maxConcurrency: 10,
  theme: 'auto' as const,
  compactMode: false,
  showGrid: true,
  snapToGrid: true
};

// ========================================
// API Endpoints
// ========================================

export const API_ENDPOINTS = {
  FLOWS: '/api/flows',
  PLUGINS: '/api/plugins',
  TEMPLATES: '/api/templates',
  EXECUTE: '/api/execute',
  VALIDATE: '/api/validate',
  EXPORT: '/api/export',
  IMPORT: '/api/import'
} as const;

// ========================================
// File Extensions
// ========================================

export const FILE_EXTENSIONS = {
  FLOW: '.angela-flow',
  PLUGIN: '.angela-plugin',
  TEMPLATE: '.angela-template',
  NODE: '.angela-node'
} as const;

// ========================================
// Keyboard Shortcuts
// ========================================

export const KEYBOARD_SHORTCUTS = {
  SAVE: 'Ctrl+S',
  SAVE_AS: 'Ctrl+Shift+S',
  UNDO: 'Ctrl+Z',
  REDO: 'Ctrl+Y',
  COPY: 'Ctrl+C',
  PASTE: 'Ctrl+V',
  DELETE: 'Delete',
  SELECT_ALL: 'Ctrl+A',
  ZOOM_IN: 'Ctrl+=',
  ZOOM_OUT: 'Ctrl+-',
  ZOOM_RESET: 'Ctrl+0',
  FIND: 'Ctrl+F',
  RUN: 'F5',
  DEBUG: 'F9'
} as const;

// ========================================
// Version Information
// ========================================

export const VERSION_INFO = {
  MAJOR: 2,
  MINOR: 0,
  PATCH: 0,
  PRERELEASE: 'beta',
  BUILD: process.env.REACT_APP_BUILD_NUMBER || 'dev'
} as const;

export const VERSION_STRING = `${VERSION_INFO.MAJOR}.${VERSION_INFO.MINOR}.${VERSION_INFO.PATCH}${
  VERSION_INFO.PRERELEASE ? `-${VERSION_INFO.PRERELEASE}` : ''
}.${VERSION_INFO.BUILD}`;

// ========================================
// Runtime Environment
// ========================================

export const ENVIRONMENT = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEV: process.env.NODE_ENV === 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test'
} as const; 
