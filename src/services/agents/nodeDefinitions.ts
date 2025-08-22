import { NodeDefinition } from '../../types/agent/types';

// Default Node Definitions for the Agent Builder
export const defaultNodeDefinitions: NodeDefinition[] = [
  // TRIGGER NODES
  {
    id: 'trigger-manual',
    name: 'Manual Trigger',
    type: 'trigger-manual',
    category: 'triggers',
    description: 'Manually start the workflow',
    icon: 'play',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'output',
        name: 'Output',
        type: 'output',
        dataType: 'any',
        description: 'Triggered output'
      }
    ],
    properties: [
      {
        id: 'name',
        name: 'Trigger Name',
        type: 'string',
        defaultValue: 'Manual Trigger',
        description: 'Name for this trigger'
      }
    ],
    executionHandler: 'manual-trigger-handler',
    metadata: {
      tags: ['trigger', 'manual'],
      documentation: 'A manual trigger allows you to start a workflow on demand.'
    }
  },

  {
    id: 'trigger-webhook',
    name: 'Webhook',
    type: 'trigger-webhook',
    category: 'triggers',
    description: 'HTTP webhook trigger',
    icon: 'network',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'body',
        name: 'Request Body',
        type: 'output',
        dataType: 'object',
        description: 'HTTP request body'
      },
      {
        id: 'headers',
        name: 'Headers',
        type: 'output',
        dataType: 'object',
        description: 'HTTP request headers'
      },
      {
        id: 'query',
        name: 'Query Parameters',
        type: 'output',
        dataType: 'object',
        description: 'URL query parameters'
      }
    ],
    properties: [
      {
        id: 'path',
        name: 'Webhook Path',
        type: 'string',
        defaultValue: '/webhook',
        description: 'URL path for the webhook'
      },
      {
        id: 'method',
        name: 'HTTP Method',
        type: 'select',
        defaultValue: 'POST',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' }
        ],
        description: 'Allowed HTTP method'
      },
      {
        id: 'authentication',
        name: 'Authentication',
        type: 'select',
        defaultValue: 'none',
        options: [
          { label: 'None', value: 'none' },
          { label: 'API Key', value: 'apikey' },
          { label: 'Bearer Token', value: 'bearer' }
        ],
        description: 'Authentication method'
      }
    ],
    executionHandler: 'webhook-trigger-handler',
    metadata: {
      tags: ['trigger', 'webhook', 'http'],
      documentation: 'Webhook trigger that responds to HTTP requests.'
    }
  },

  {
    id: 'trigger-schedule',
    name: 'Schedule',
    type: 'trigger-schedule',
    category: 'triggers',
    description: 'Time-based trigger',
    icon: 'clock',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'timestamp',
        name: 'Timestamp',
        type: 'output',
        dataType: 'string',
        description: 'Trigger timestamp'
      }
    ],
    properties: [
      {
        id: 'schedule',
        name: 'Schedule',
        type: 'string',
        defaultValue: '0 0 * * *',
        description: 'Cron expression for schedule'
      },
      {
        id: 'timezone',
        name: 'Timezone',
        type: 'string',
        defaultValue: 'UTC',
        description: 'Timezone for schedule'
      }
    ],
    executionHandler: 'schedule-trigger-handler',
    metadata: {
      tags: ['trigger', 'schedule', 'cron'],
      documentation: 'Schedule trigger based on cron expressions.'
    }
  },

  // AI/ML NODES
  {
    id: 'ai-llm-chat',
    name: 'LLM Chat',
    type: 'ai-llm-chat',
    category: 'ai',
    description: 'Chat with language models',
    icon: 'bot',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'message',
        name: 'Message',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'Input message for the AI'
      },
      {
        id: 'context',
        name: 'Context',
        type: 'input',
        dataType: 'string',
        required: false,
        description: 'Additional context for the conversation'
      }
    ],
    outputs: [
      {
        id: 'response',
        name: 'Response',
        type: 'output',
        dataType: 'string',
        description: 'AI response message'
      },
      {
        id: 'tokens',
        name: 'Token Usage',
        type: 'output',
        dataType: 'object',
        description: 'Token usage statistics'
      }
    ],
    properties: [
      {
        id: 'provider',
        name: 'AI Provider',
        type: 'select',
        defaultValue: 'openai',
        options: [
          { label: 'OpenAI', value: 'openai' },
          { label: 'Anthropic', value: 'anthropic' },
          { label: 'Google', value: 'google' }
        ],
        description: 'AI provider to use'
      },
      {
        id: 'model',
        name: 'Model',
        type: 'string',
        defaultValue: 'gpt-4',
        description: 'Model name'
      },
      {
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        validation: { min: 0, max: 2 },
        description: 'Creativity level (0-2)'
      },
      {
        id: 'maxTokens',
        name: 'Max Tokens',
        type: 'number',
        defaultValue: 1000,
        validation: { min: 1, max: 4000 },
        description: 'Maximum response tokens'
      },
      {
        id: 'systemPrompt',
        name: 'System Prompt',
        type: 'string',
        defaultValue: 'You are a helpful assistant.',
        description: 'System instruction for the AI'
      }
    ],
    executionHandler: 'llm-chat-handler',
    metadata: {
      tags: ['ai', 'llm', 'chat', 'conversation'],
      documentation: 'Chat with various language models using different providers.'
    }
  },

  {
    id: 'ai-text-generation',
    name: 'Text Generation',
    type: 'ai-text-generation',
    category: 'ai',
    description: 'Generate text content',
    icon: 'file-text',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'prompt',
        name: 'Prompt',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'Text generation prompt'
      }
    ],
    outputs: [
      {
        id: 'text',
        name: 'Generated Text',
        type: 'output',
        dataType: 'string',
        description: 'Generated text content'
      }
    ],
    properties: [
      {
        id: 'provider',
        name: 'AI Provider',
        type: 'select',
        defaultValue: 'openai',
        options: [
          { label: 'OpenAI', value: 'openai' },
          { label: 'Anthropic', value: 'anthropic' }
        ]
      },
      {
        id: 'model',
        name: 'Model',
        type: 'string',
        defaultValue: 'gpt-4'
      },
      {
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        validation: { min: 0, max: 2 }
      }
    ],
    executionHandler: 'text-generation-handler',
    metadata: {
      tags: ['ai', 'text', 'generation'],
      documentation: 'Generate text content using AI language models.'
    }
  },

  // UTILITY NODES
  {
    id: 'util-http-request',
    name: 'HTTP Request',
    type: 'util-http-request',
    category: 'utilities',
    description: 'Make HTTP requests',
    icon: 'globe',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'url',
        name: 'URL',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'Request URL'
      },
      {
        id: 'body',
        name: 'Request Body',
        type: 'input',
        dataType: 'any',
        required: false,
        description: 'Request body data'
      }
    ],
    outputs: [
      {
        id: 'response',
        name: 'Response',
        type: 'output',
        dataType: 'object',
        description: 'HTTP response'
      },
      {
        id: 'status',
        name: 'Status Code',
        type: 'output',
        dataType: 'number',
        description: 'HTTP status code'
      }
    ],
    properties: [
      {
        id: 'method',
        name: 'HTTP Method',
        type: 'select',
        defaultValue: 'GET',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' }
        ]
      },
      {
        id: 'headers',
        name: 'Headers',
        type: 'json',
        defaultValue: {},
        description: 'HTTP headers as JSON'
      },
      {
        id: 'timeout',
        name: 'Timeout (ms)',
        type: 'number',
        defaultValue: 30000,
        validation: { min: 1000, max: 300000 }
      }
    ],
    executionHandler: 'http-request-handler',
    metadata: {
      tags: ['http', 'request', 'api'],
      documentation: 'Make HTTP requests to external APIs or services.'
    }
  },

  {
    id: 'util-json-parser',
    name: 'JSON Parser',
    type: 'util-json-parser',
    category: 'utilities',
    description: 'Parse and manipulate JSON data',
    icon: 'code',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'json',
        name: 'JSON Input',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'JSON string to parse'
      }
    ],
    outputs: [
      {
        id: 'data',
        name: 'Parsed Data',
        type: 'output',
        dataType: 'object',
        description: 'Parsed JSON object'
      }
    ],
    properties: [
      {
        id: 'path',
        name: 'JSON Path',
        type: 'string',
        defaultValue: '',
        description: 'Optional JSON path to extract specific data'
      }
    ],
    executionHandler: 'json-parser-handler',
    metadata: {
      tags: ['json', 'parse', 'data'],
      documentation: 'Parse JSON strings and extract specific data using JSON paths.'
    }
  },

  // LOGIC NODES
  {
    id: 'logic-if-else',
    name: 'If/Else',
    type: 'logic-if-else',
    category: 'logic',
    description: 'Conditional branching',
    icon: 'git-branch',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'condition',
        name: 'Condition',
        type: 'input',
        dataType: 'boolean',
        required: true,
        description: 'Boolean condition to evaluate'
      },
      {
        id: 'data',
        name: 'Data',
        type: 'input',
        dataType: 'any',
        required: false,
        description: 'Data to pass through'
      }
    ],
    outputs: [
      {
        id: 'true',
        name: 'True Branch',
        type: 'output',
        dataType: 'any',
        description: 'Output when condition is true'
      },
      {
        id: 'false',
        name: 'False Branch',
        type: 'output',
        dataType: 'any',
        description: 'Output when condition is false'
      }
    ],
    properties: [],
    executionHandler: 'if-else-handler',
    metadata: {
      tags: ['logic', 'conditional', 'branch'],
      documentation: 'Route data flow based on boolean conditions.'
    }
  }
];

// Helper function to get node definitions by category
export const getNodeDefinitionsByCategory = (category: string): NodeDefinition[] => {
  return defaultNodeDefinitions.filter(def => def.category === category);
};

// Helper function to get all categories
export const getNodeCategories = (): string[] => {
  const categories = new Set(defaultNodeDefinitions.map(def => def.category));
  return Array.from(categories);
};

// Helper function to search node definitions
export const searchNodeDefinitions = (query: string): NodeDefinition[] => {
  const lowercaseQuery = query.toLowerCase();
  return defaultNodeDefinitions.filter(def => 
    def.name.toLowerCase().includes(lowercaseQuery) ||
    def.description.toLowerCase().includes(lowercaseQuery) ||
    (def.metadata?.tags || []).some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
}; 
