import { NodeDefinition } from '../../types/agent/types';

// Comprehensive Node Definitions for AI Agent Builder
export const simpleNodeDefinitions: NodeDefinition[] = [
  // INPUT NODE - supports text, json, number
  {
    id: 'input-node',
    name: 'Input',
    type: 'input',
    category: 'basic',
    description: 'Provides input values to the workflow - supports text, JSON, and numbers',
    icon: 'input',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'output',
        name: 'Value',
        type: 'output',
        dataType: 'any',
        description: 'Input value'
      }
    ],
    properties: [
      {
        id: 'inputType',
        name: 'Input Type',
        type: 'select',
        defaultValue: 'text',
        options: [
          { label: 'Text', value: 'text' },
          { label: 'Number', value: 'number' },
          { label: 'JSON', value: 'json' }
        ],
        description: 'Type of input value'
      },
      {
        id: 'value',
        name: 'Value',
        type: 'string',
        defaultValue: '',
        description: 'The input value'
      },
      {
        id: 'label',
        name: 'Label',
        type: 'string',
        defaultValue: 'Input',
        description: 'Display label for this input'
      }
    ],
    executionHandler: 'input-node-handler',
    metadata: {
      tags: ['input', 'basic', 'source'],
      documentation: 'Provides input values to start or feed the workflow. Supports text, numbers, and JSON objects.'
    }
  },

  // JSON PARSE NODE
  {
    id: 'json-parse-node',
    name: 'JSON Parser',
    type: 'json-parse',
    category: 'data',
    description: 'Parse JSON data and optionally extract specific fields',
    icon: 'braces',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'input',
        name: 'JSON Data',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'JSON string to parse'
      }
    ],
    outputs: [
      {
        id: 'output',
        name: 'Parsed Data',
        type: 'output',
        dataType: 'any',
        description: 'Parsed JSON object or extracted field value'
      }
    ],
    properties: [
      {
        id: 'extractField',
        name: 'Extract Field',
        type: 'string',
        defaultValue: '',
        description: 'Optional: specific field to extract (use dot notation for nested fields, e.g. user.name)'
      },
      {
        id: 'failOnError',
        name: 'Fail on Parse Error',
        type: 'boolean',
        defaultValue: false,
        description: 'Whether to fail execution if JSON parsing fails'
      }
    ],
    executionHandler: 'json-parse-node-handler',
    metadata: {
      tags: ['json', 'parser', 'data'],
      documentation: 'Parses JSON strings and optionally extracts specific fields using dot notation.'
    }
  },

  // OUTPUT NODE
  {
    id: 'output-node',
    name: 'Output',
    type: 'output',
    category: 'basic',
    description: 'Displays the final result of the workflow',
    icon: 'external-link',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'input',
        name: 'Value',
        type: 'input',
        dataType: 'any',
        required: true,
        description: 'Value to output'
      }
    ],
    outputs: [],
    properties: [
      {
        id: 'outputLabel',
        name: 'Output Label',
        type: 'string',
        defaultValue: 'Result',
        description: 'Label for the output'
      },
      {
        id: 'format',
        name: 'Output Format',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Text', value: 'text' },
          { label: 'JSON', value: 'json' },
          { label: 'Raw', value: 'raw' }
        ],
        description: 'How to format the output display'
      }
    ],
    executionHandler: 'output-node-handler',
    metadata: {
      tags: ['output', 'basic', 'sink'],
      documentation: 'Displays the final result with various formatting options.'
    }
  },

  // IF/ELSE NODE
  {
    id: 'if-else-node',
    name: 'If/Else',
    type: 'if-else',
    category: 'logic',
    description: 'Conditional logic based on expression evaluation',
    icon: 'git-branch',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'input',
        name: 'Input Variable',
        type: 'input',
        dataType: 'any',
        required: true,
        description: 'Input value to evaluate'
      }
    ],
    outputs: [
      {
        id: 'true',
        name: 'True',
        type: 'output',
        dataType: 'any',
        description: 'Output when condition is true'
      },
      {
        id: 'false',
        name: 'False',
        type: 'output',
        dataType: 'any',
        description: 'Output when condition is false'
      }
    ],
    properties: [
      {
        id: 'expression',
        name: 'Expression',
        type: 'string',
        defaultValue: 'input > 0',
        description: 'JavaScript expression to evaluate (use "input" as variable name)'
      },
      {
        id: 'trueValue',
        name: 'True Value',
        type: 'string',
        defaultValue: '',
        description: 'Value to output when true (empty = pass input through)'
      },
      {
        id: 'falseValue',
        name: 'False Value',
        type: 'string',
        defaultValue: '',
        description: 'Value to output when false (empty = pass input through)'
      }
    ],
    executionHandler: 'if-else-node-handler',
    metadata: {
      tags: ['logic', 'conditional', 'control-flow'],
      documentation: 'Evaluates JavaScript expressions and routes data based on the result.'
    }
  },

  // LLM NODE
  {
    id: 'llm-node',
    name: 'LLM Chat',
    type: 'llm',
    category: 'ai',
    description: 'Large Language Model chat interface with multiple inputs and image support',
    icon: 'brain',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'system',
        name: 'System Message',
        type: 'input',
        dataType: 'string',
        required: false,
        description: 'System prompt for the LLM'
      },
      {
        id: 'user',
        name: 'User Message',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'User message/prompt'
      },
      {
        id: 'context',
        name: 'Pre-context',
        type: 'input',
        dataType: 'string',
        required: false,
        description: 'Additional context to prepend'
      },
      {
        id: 'memory',
        name: 'Memory',
        type: 'input',
        dataType: 'array',
        required: false,
        description: 'Conversation history array (messages with role and content)'
      },
      {
        id: 'image',
        name: 'Image',
        type: 'input',
        dataType: 'string',
        required: false,
        description: 'Base64 encoded image data'
      }
    ],
    outputs: [
      {
        id: 'response',
        name: 'Response',
        type: 'output',
        dataType: 'string',
        description: 'LLM response text'
      },
      {
        id: 'usage',
        name: 'Usage Stats',
        type: 'output',
        dataType: 'object',
        description: 'Token usage and cost information'
      }
    ],
    properties: [
      {
        id: 'apiBaseUrl',
        name: 'API Base URL',
        type: 'string',
        defaultValue: 'https://api.openai.com/v1',
        description: 'OpenAI-compatible API base URL'
      },
      {
        id: 'apiKey',
        name: 'API Key',
        type: 'string',
        defaultValue: '',
        description: 'API key for authentication'
      },
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        defaultValue: 'gpt-3.5-turbo',
        options: [
          { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
          { label: 'GPT-4', value: 'gpt-4' },
          { label: 'GPT-4 Vision', value: 'gpt-4-vision-preview' },
          { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
          { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229' },
          { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' }
        ],
        description: 'AI model to use'
      },
      {
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        description: 'Temperature for response generation (0.0 - 2.0)'
      },
      {
        id: 'maxTokens',
        name: 'Max Tokens',
        type: 'number',
        defaultValue: 1000,
        description: 'Maximum tokens in response'
      }
    ],
    executionHandler: 'llm-node-handler',
    metadata: {
      tags: ['ai', 'llm', 'chat', 'openai'],
      documentation: 'Interfaces with OpenAI-compatible APIs for text and vision tasks.'
    }
  },

  // STRUCTURED LLM NODE
  {
    id: 'structured-llm-node',
    name: 'Structured LLM',
    type: 'structured-llm',
    category: 'ai',
    description: 'Generate structured JSON outputs using OpenAI structured response format',
    icon: 'chart',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'prompt',
        name: 'Prompt',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'The prompt describing what to generate'
      },
      {
        id: 'jsonExample',
        name: 'JSON Example',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'Example JSON structure that defines the output format'
      },
      {
        id: 'context',
        name: 'Context',
        type: 'input',
        dataType: 'string',
        required: false,
        description: 'Additional context for generation'
      }
    ],
    outputs: [
      {
        id: 'jsonOutput',
        name: 'JSON Output',
        type: 'output',
        dataType: 'object',
        description: 'Generated JSON object matching the example structure'
      },
      {
        id: 'rawResponse',
        name: 'Raw Response',
        type: 'output',
        dataType: 'string',
        description: 'Raw JSON string response'
      },
      {
        id: 'usage',
        name: 'Usage Stats',
        type: 'output',
        dataType: 'object',
        description: 'Token usage and cost information'
      }
    ],
    properties: [
      {
        id: 'apiBaseUrl',
        name: 'API Base URL',
        type: 'string',
        defaultValue: 'https://api.openai.com/v1',
        description: 'OpenAI API base URL'
      },
      {
        id: 'apiKey',
        name: 'API Key',
        type: 'string',
        defaultValue: '',
        description: 'OpenAI API key for authentication'
      },
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        defaultValue: 'gpt-4o-mini',
        options: [
          { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
          { label: 'GPT-4o', value: 'gpt-4o' },
          { label: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview' }
        ],
        description: 'OpenAI model to use (structured outputs require GPT-4 models)'
      },
      {
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        description: 'Temperature for response generation (0.0 - 2.0)'
      },
      {
        id: 'maxTokens',
        name: 'Max Tokens',
        type: 'number',
        defaultValue: 1000,
        description: 'Maximum tokens in response'
      }
    ],
    executionHandler: 'structured-llm-node-handler',
    metadata: {
      tags: ['ai', 'llm', 'structured', 'json', 'openai'],
      documentation: 'Uses OpenAI structured output feature to generate JSON that matches a provided example format.'
    }
  },

  // IMAGE INPUT NODE
  {
    id: 'image-input-node',
    name: 'Image Input',
    type: 'image-input',
    category: 'media',
    description: 'Accepts image files and outputs base64 encoded data',
    icon: 'image',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'base64',
        name: 'Base64 Data',
        type: 'output',
        dataType: 'string',
        description: 'Base64 encoded image data'
      },
      {
        id: 'metadata',
        name: 'Image Metadata',
        type: 'output',
        dataType: 'object',
        description: 'Image information (size, type, etc.)'
      }
    ],
    properties: [
      {
        id: 'imageFile',
        name: 'Image File',
        type: 'string',
        defaultValue: '',
        description: 'Image file or URL'
      },
      {
        id: 'maxWidth',
        name: 'Max Width',
        type: 'number',
        defaultValue: 1024,
        description: 'Maximum width for image resize'
      },
      {
        id: 'maxHeight',
        name: 'Max Height',
        type: 'number',
        defaultValue: 1024,
        description: 'Maximum height for image resize'
      },
      {
        id: 'quality',
        name: 'Quality',
        type: 'number',
        defaultValue: 0.8,
        description: 'Image compression quality (0.1 - 1.0)'
      }
    ],
    executionHandler: 'image-input-node-handler',
    metadata: {
      tags: ['image', 'input', 'base64', 'media'],
      documentation: 'Processes image files and converts them to base64 for AI model consumption.'
    }
  },

  // PDF INPUT NODE
  {
    id: 'pdf-input-node',
    name: 'Load PDF',
    type: 'pdf-input',
    category: 'input',
    description: 'Upload PDF files and extract text content',
    icon: 'file-text',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'text',
        name: 'Extracted Text',
        type: 'output',
        dataType: 'string',
        required: true,
        description: 'Text content extracted from the PDF'
      },
      {
        id: 'metadata',
        name: 'Metadata',
        type: 'output',
        dataType: 'object',
        required: false,
        description: 'PDF metadata including page count, file size, etc.'
      }
    ],
    properties: [
      {
        id: 'maxPages',
        name: 'Max Pages',
        type: 'number',
        defaultValue: 50,
        description: 'Maximum number of pages to process',
        validation: {
          min: 1,
          max: 200
        }
      },
      {
        id: 'preserveFormatting',
        name: 'Preserve Formatting',
        type: 'boolean',
        defaultValue: false,
        description: 'Attempt to preserve text formatting and layout'
      }
    ],
    executionHandler: 'pdf-input-node-handler',
    metadata: {
      examples: [
        {
          name: 'Basic PDF Text Extraction',
          description: 'Extract all text from a PDF document',
          config: {
            maxPages: 50,
            preserveFormatting: false
          }
        }
      ]
    }
  },



  // FILE UPLOAD NODE
  {
    id: 'file-upload-node',
    name: 'File Upload',
    type: 'file-upload',
    category: 'input',
    description: 'Upload any file and output in various formats (base64, binary, text, etc.)',
    icon: 'upload',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'content',
        name: 'File Content',
        type: 'output',
        dataType: 'any',
        required: true,
        description: 'File content in the specified format'
      },
      {
        id: 'metadata',
        name: 'File Metadata',
        type: 'output',
        dataType: 'object',
        required: false,
        description: 'File metadata (name, size, type, format, etc.)'
      }
    ],
    properties: [
      {
        id: 'outputFormat',
        name: 'Output Format',
        type: 'select',
        defaultValue: 'base64',
        options: [
          { label: 'Base64 String', value: 'base64' },
          { label: 'Data URL', value: 'dataurl' },
          { label: 'Text Content', value: 'text' },
          { label: 'Binary Array', value: 'binary' },
          { label: 'File Object', value: 'file' }
        ],
        description: 'Format to output the file content'
      },
      {
        id: 'acceptedTypes',
        name: 'Accepted File Types',
        type: 'string',
        defaultValue: '*/*',
        description: 'MIME types or extensions (e.g., image/*, .pdf, .txt, or */* for all)'
      },
      {
        id: 'maxSize',
        name: 'Max File Size (MB)',
        type: 'number',
        defaultValue: 10,
        description: 'Maximum file size in megabytes',
        validation: {
          min: 1,
          max: 100
        }
      }
    ],
    executionHandler: 'file-upload-node-handler',
    metadata: {
      examples: [
        {
          name: 'Image Upload as Base64',
          description: 'Upload image files and output as base64 for AI processing',
          config: {
            outputFormat: 'base64',
            acceptedTypes: 'image/*',
            maxSize: 5
          }
        },
        {
          name: 'Document Upload as Text',
          description: 'Upload text documents and output content as plain text',
          config: {
            outputFormat: 'text',
            acceptedTypes: '.txt,.md,.csv',
            maxSize: 2
          }
        },
        {
          name: 'Any File Upload',
          description: 'Upload any file type and get file object with metadata',
          config: {
            outputFormat: 'file',
            acceptedTypes: '*/*',
            maxSize: 10
          }
        }
      ],
      tags: ['file', 'upload', 'input', 'base64', 'binary', 'text', 'universal']
    }
  },

  // COMBINE TEXT NODE
  {
    id: 'combine-text-node',
    name: 'Combine Text',
    type: 'combine-text',
    category: 'data',
    description: 'Combine two text inputs with configurable separation options for prompt building',
    icon: 'type',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'text1',
        name: 'Text 1',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'First text input'
      },
      {
        id: 'text2',
        name: 'Text 2',
        type: 'input',
        dataType: 'string',
        required: true,
        description: 'Second text input'
      }
    ],
    outputs: [
      {
        id: 'combined',
        name: 'Combined Text',
        type: 'output',
        dataType: 'string',
        required: true,
        description: 'Combined text result'
      },
      {
        id: 'metadata',
        name: 'Metadata',
        type: 'output',
        dataType: 'object',
        required: false,
        description: 'Combination metadata (mode, separator, lengths, etc.)'
      }
    ],
    properties: [
      {
        id: 'combineMode',
        name: 'Combine Mode',
        type: 'select',
        defaultValue: 'concat',
        options: [
          { label: 'Concatenate', value: 'concat' },
          { label: 'Text1 + Separator + Text2', value: 'separator' },
          { label: 'Text2 as Prefix', value: 'prefix' },
          { label: 'Text2 as Suffix', value: 'suffix' }
        ],
        description: 'How to combine the two text inputs'
      },
      {
        id: 'separator',
        name: 'Separator',
        type: 'string',
        defaultValue: '',
        description: 'Separator to use between texts (only for separator mode)'
      },
      {
        id: 'addSpaces',
        name: 'Add Spaces',
        type: 'boolean',
        defaultValue: true,
        description: 'Automatically add spaces between texts for readability'
      }
    ],
    executionHandler: 'combine-text-node-handler',
    metadata: {
      examples: [
        {
          name: 'Simple Prompt Building',
          description: 'Combine system prompt with user input',
          config: {
            combineMode: 'concat',
            addSpaces: true
          }
        },
        {
          name: 'Prompt with Separator',
          description: 'Add context with clear separation',
          config: {
            combineMode: 'separator',
            separator: '\\n\\n---\\n\\n',
            addSpaces: false
          }
        },
        {
          name: 'Prefix Instructions',
          description: 'Add instructions before main content',
          config: {
            combineMode: 'prefix',
            addSpaces: true
          }
        }
      ],
      tags: ['text', 'combine', 'prompt', 'concatenate', 'string', 'merge']
    }
  },

  // STATIC TEXT NODE
  {
    id: 'static-text-node',
    name: 'Static Text',
    type: 'static-text',
    category: 'data',
    description: 'Provides static text content with fixed values set during workflow creation',
    icon: 'file-text',
    version: '1.0.0',
    author: 'angela',
    inputs: [],
    outputs: [
      {
        id: 'text',
        name: 'Text Output',
        type: 'output',
        dataType: 'string',
        required: true,
        description: 'The static text content'
      }
    ],
    properties: [
      {
        id: 'text',
        name: 'Text Content',
        type: 'string',
        defaultValue: 'Enter your static text here...',
        description: 'Fixed text content that will be output by this node'
      },
      {
        id: 'label',
        name: 'Node Label',
        type: 'string',
        defaultValue: 'Static Text',
        description: 'Display label for this static text node'
      },
      {
        id: 'textFormat',
        name: 'Text Format',
        type: 'select',
        defaultValue: 'plain',
        options: [
          { label: 'Plain Text', value: 'plain' },
          { label: 'Template (with variables)', value: 'template' },
          { label: 'JSON String', value: 'json' },
          { label: 'Markdown', value: 'markdown' }
        ],
        description: 'Format of the static text content'
      },
      {
        id: 'multiline',
        name: 'Multiline Support',
        type: 'boolean',
        defaultValue: true,
        description: 'Whether the text supports multiple lines'
      }
    ],
    executionHandler: 'static-text-node-handler',
    metadata: {
      examples: [
        {
          name: 'System Prompt',
          description: 'Static system prompt for AI models',
          config: {
            text: 'You are a helpful AI assistant. Please respond in a friendly and professional manner.',
            label: 'System Prompt',
            textFormat: 'plain',
            multiline: true
          }
        },
        {
          name: 'API Instructions',
          description: 'Fixed instructions for API requests',
          config: {
            text: 'Please analyze the following data and provide insights:\n\n',
            label: 'API Instructions',
            textFormat: 'template',
            multiline: true
          }
        },
        {
          name: 'JSON Template',
          description: 'Static JSON structure template',
          config: {
            text: '{"role": "system", "content": "You are a helpful assistant"}',
            label: 'JSON Template',
            textFormat: 'json',
            multiline: false
          }
        }
      ],
      tags: ['text', 'static', 'prompt', 'template', 'content', 'fixed', 'constant']
    }
  },

  // WHISPER TRANSCRIPTION NODE
  {
    id: 'whisper-transcription-node',
    name: 'Whisper Transcription',
    type: 'whisper-transcription',
    category: 'ai',
    description: 'Transcribe binary audio data using OpenAI Whisper API',
    icon: 'mic',
    version: '1.0.0',
    author: 'angela',
    inputs: [
      {
        id: 'audioData',
        name: 'Audio Data',
        type: 'input',
        dataType: 'any',
        required: true,
        description: 'Binary audio data (array, base64, or blob)'
      }
    ],
    outputs: [
      {
        id: 'text',
        name: 'Transcribed Text',
        type: 'output',
        dataType: 'string',
        required: true,
        description: 'Text content transcribed from the audio'
      },
      {
        id: 'metadata',
        name: 'Transcription Metadata',
        type: 'output',
        dataType: 'object',
        required: false,
        description: 'Transcription metadata (language, duration, model, etc.)'
      }
    ],
    properties: [
      {
        id: 'apiKey',
        name: 'OpenAI API Key',
        type: 'string',
        defaultValue: '',
        description: 'OpenAI API key for Whisper API access (sk-...)',
        validation: {
          pattern: '^sk-[a-zA-Z0-9]+$'
        }
      },
      {
        id: 'model',
        name: 'Whisper Model',
        type: 'select',
        defaultValue: 'gpt-4o-transcribe',
        options: [
          { label: 'GPT-4o Transcribe (Recommended)', value: 'gpt-4o-transcribe' },
          { label: 'Whisper-1 (Legacy)', value: 'whisper-1' }
        ],
        description: 'OpenAI Whisper model to use for transcription'
      },
      {
        id: 'language',
        name: 'Language',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto-detect', value: 'auto' },
          { label: 'English', value: 'en' },
          { label: 'Spanish', value: 'es' },
          { label: 'French', value: 'fr' },
          { label: 'German', value: 'de' },
          { label: 'Italian', value: 'it' },
          { label: 'Portuguese', value: 'pt' },
          { label: 'Russian', value: 'ru' },
          { label: 'Japanese', value: 'ja' },
          { label: 'Korean', value: 'ko' },
          { label: 'Chinese', value: 'zh' },
          { label: 'Arabic', value: 'ar' },
          { label: 'Hindi', value: 'hi' },
          { label: 'Dutch', value: 'nl' },
          { label: 'Polish', value: 'pl' }
        ],
        description: 'Language of the audio (auto-detect or specific language)'
      },
      {
        id: 'temperature',
        name: 'Temperature',
        type: 'number',
        defaultValue: 0,
        description: 'Sampling temperature (0 = deterministic, 1 = creative)',
        validation: {
          min: 0,
          max: 1
        }
      },
      {
        id: 'prompt',
        name: 'Transcription Prompt',
        type: 'string',
        defaultValue: 'You are a transcription assistant. Transcribe the audio accurately.',
        description: 'Instructions for the transcription model (works best with gpt-4o-transcribe)'
      }
    ],
    executionHandler: 'whisper-transcription-node-handler',
    metadata: {
      examples: [
        {
          name: 'GPT-4o Audio Transcription',
          description: 'Transcribe binary audio data using GPT-4o with custom prompt',
          config: {
            model: 'gpt-4o-transcribe',
            language: 'auto',
            temperature: 0,
            prompt: 'You are a transcription assistant. Transcribe the audio in English.'
          }
        },
        {
          name: 'Multi-language Transcription',
          description: 'Transcribe audio with specific language setting',
          config: {
            model: 'gpt-4o-transcribe',
            language: 'es',
            temperature: 0.2,
            prompt: 'You are a transcription assistant. Transcribe the audio accurately in Spanish.'
          }
        }
      ],
      tags: ['ai', 'audio', 'transcription', 'whisper', 'binary', 'speech-to-text']
    }
  },

  // API REQUEST NODE
  {
    id: 'api-request-node',
    name: 'API Request',
    type: 'api-request',
    category: 'data',
    description: 'Production-grade HTTP/REST API client with comprehensive features',
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
        description: 'API endpoint URL'
      },
      {
        id: 'body',
        name: 'Request Body',
        type: 'input',
        dataType: 'any',
        required: false,
        description: 'Request body data (JSON object, string, etc.)'
      },
      {
        id: 'headers',
        name: 'Headers',
        type: 'input',
        dataType: 'object',
        required: false,
        description: 'Additional HTTP headers as JSON object'
      },
      {
        id: 'params',
        name: 'Query Params',
        type: 'input',
        dataType: 'object',
        required: false,
        description: 'URL query parameters as JSON object'
      },
      {
        id: 'auth',
        name: 'Auth Data',
        type: 'input',
        dataType: 'object',
        required: false,
        description: 'Authentication data (API key, token, etc.)'
      }
    ],
    outputs: [
      {
        id: 'data',
        name: 'Response Data',
        type: 'output',
        dataType: 'any',
        required: true,
        description: 'Parsed response data (JSON object or raw text)'
      },
      {
        id: 'status',
        name: 'Status Code',
        type: 'output',
        dataType: 'number',
        required: true,
        description: 'HTTP status code (200, 404, 500, etc.)'
      },
      {
        id: 'headers',
        name: 'Response Headers',
        type: 'output',
        dataType: 'object',
        required: true,
        description: 'HTTP response headers'
      },
      {
        id: 'success',
        name: 'Success',
        type: 'output',
        dataType: 'boolean',
        required: true,
        description: 'Whether the request was successful (2xx status)'
      },
      {
        id: 'metadata',
        name: 'Metadata',
        type: 'output',
        dataType: 'object',
        required: false,
        description: 'Request metadata (timing, retries, etc.)'
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
          { label: 'PATCH', value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' },
          { label: 'HEAD', value: 'HEAD' },
          { label: 'OPTIONS', value: 'OPTIONS' }
        ],
        description: 'HTTP method for the request'
      },
      {
        id: 'timeout',
        name: 'Timeout (ms)',
        type: 'number',
        defaultValue: 30000,
        description: 'Request timeout in milliseconds'
      },
      {
        id: 'retries',
        name: 'Max Retries',
        type: 'number',
        defaultValue: 3,
        description: 'Maximum number of retry attempts'
      },
      {
        id: 'retryDelay',
        name: 'Retry Delay (ms)',
        type: 'number',
        defaultValue: 1000,
        description: 'Delay between retry attempts'
      },
      {
        id: 'authType',
        name: 'Authentication Type',
        type: 'select',
        defaultValue: 'none',
        options: [
          { label: 'None', value: 'none' },
          { label: 'API Key', value: 'apiKey' },
          { label: 'Bearer Token', value: 'bearer' },
          { label: 'Basic Auth', value: 'basic' },
          { label: 'Custom Header', value: 'custom' }
        ],
        description: 'Type of authentication to use'
      },
      {
        id: 'contentType',
        name: 'Content Type',
        type: 'select',
        defaultValue: 'application/json',
        options: [
          { label: 'JSON', value: 'application/json' },
          { label: 'Form Data', value: 'application/x-www-form-urlencoded' },
          { label: 'Multipart', value: 'multipart/form-data' },
          { label: 'Plain Text', value: 'text/plain' },
          { label: 'XML', value: 'application/xml' },
          { label: 'Custom', value: 'custom' }
        ],
        description: 'Content-Type header for request body'
      },
      {
        id: 'responseType',
        name: 'Response Type',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto Detect', value: 'auto' },
          { label: 'JSON', value: 'json' },
          { label: 'Text', value: 'text' },
          { label: 'Binary', value: 'binary' }
        ],
        description: 'How to parse the response'
      },
      {
        id: 'followRedirects',
        name: 'Follow Redirects',
        type: 'boolean',
        defaultValue: true,
        description: 'Follow HTTP redirects automatically'
      },
      {
        id: 'validateStatus',
        name: 'Validate Status',
        type: 'boolean',
        defaultValue: true,
        description: 'Throw error for non-2xx status codes'
      }
    ],
    executionHandler: 'api-request-node-handler',
    metadata: {
      tags: ['data', 'api', 'http', 'rest'],
      documentation: 'Handles HTTP/REST API requests with comprehensive features.'
    }
  },

  // TEXT PROCESSING NODE
];

// Helper functions
export const getSimpleNodeDefinitionsByCategory = (category: string): NodeDefinition[] => {
  return simpleNodeDefinitions.filter(def => def.category === category);
};

export const getSimpleNodeCategories = (): string[] => {
  const categories = simpleNodeDefinitions.map(def => def.category);
  return [...new Set(categories)];
};

export const searchSimpleNodeDefinitions = (query: string): NodeDefinition[] => {
  const lowercaseQuery = query.toLowerCase();
  return simpleNodeDefinitions.filter(def => 
    def.name.toLowerCase().includes(lowercaseQuery) ||
    def.description.toLowerCase().includes(lowercaseQuery) ||
    def.metadata?.tags?.some(tag => tag.toLowerCase().includes(lowercaseQuery))
  );
}; 
