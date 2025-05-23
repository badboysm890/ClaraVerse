// Export the new API clients
export { APIClient } from './APIClient';
export { AssistantAPIClient } from './AssistantAPIClient';
export type { ChatMessage, ChatRole, RequestOptions } from './APIClient';

// Keep legacy exports for backwards compatibility
export { OllamaClient } from './OllamaClient';
export { AssistantOllamaClient } from './AssistantOllamaClient';
export type { Tool } from '../db';