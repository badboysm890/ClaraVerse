/**
 * angela Agent Studio - Node Generator
 * 
 * This is the LLM-powered node generation system that makes creating new nodes
 * as easy as typing a description. It generates complete node implementations
 * including TypeScript code, tests, and documentation.
 */

import { NODE_CATEGORIES, DATA_TYPES } from '../constants';

// ========================================
// Types for Node Generation
// ========================================

export interface NodeGenerationRequest {
  name: string;
  description: string;
  category?: string;
  inputs?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
  properties?: Array<{
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
    description?: string;
  }>;
  executionLogic?: string;
  examples?: string[];
}

export interface GeneratedNode {
  nodeDefinition: any; // NodeDefinition type will be imported
  componentCode: string;
  executorCode: string;
  testCode: string;
  documentation: string;
  manifest: any;
}

export interface NodeGeneratorConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  templates: Record<string, string>;
}

// ========================================
// Node Generator Class
// ========================================

export class NodeGenerator {
  private config: NodeGeneratorConfig;
  private templates: Map<string, string> = new Map();

  constructor(config?: Partial<NodeGeneratorConfig>) {
    this.config = {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
      systemPrompt: this.getSystemPrompt(),
      templates: {},
      ...config
    };

    this.loadTemplates();
  }

  // ========================================
  // Public API Methods
  // ========================================

  /**
   * Generate a node from a simple text prompt
   */
  async generateFromPrompt(prompt: string): Promise<GeneratedNode> {
    const request = await this.parsePrompt(prompt);
    return this.generateNode(request);
  }

  /**
   * Generate a node from a structured request
   */
  async generateNode(request: NodeGenerationRequest): Promise<GeneratedNode> {
    try {
      // Step 1: Generate node definition
      const nodeDefinition = await this.generateNodeDefinition(request);
      
      // Step 2: Generate component code
      const componentCode = await this.generateComponentCode(nodeDefinition);
      
      // Step 3: Generate executor code
      const executorCode = await this.generateExecutorCode(nodeDefinition);
      
      // Step 4: Generate test code
      const testCode = await this.generateTestCode(nodeDefinition);
      
      // Step 5: Generate documentation
      const documentation = await this.generateDocumentation(nodeDefinition);
      
      // Step 6: Generate manifest
      const manifest = this.generateManifest(nodeDefinition);

      return {
        nodeDefinition,
        componentCode,
        executorCode,
        testCode,
        documentation,
        manifest
      };
    } catch (error) {
      throw new Error(`Node generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create files for a generated node
   */
  async createNodeFiles(generated: GeneratedNode, outputDir: string): Promise<string[]> {
    const files: string[] = [];
    const nodeType = generated.nodeDefinition.type;
    const className = this.toCamelCase(nodeType, true);

    // Create the node definition file
    const definitionPath = `${outputDir}/${nodeType}.definition.ts`;
    const definitionContent = this.generateDefinitionFile(generated.nodeDefinition);
    await this.writeFile(definitionPath, definitionContent);
    files.push(definitionPath);

    // Create the component file
    const componentPath = `${outputDir}/${className}Node.tsx`;
    await this.writeFile(componentPath, generated.componentCode);
    files.push(componentPath);

    // Create the executor file
    const executorPath = `${outputDir}/${nodeType}.executor.ts`;
    await this.writeFile(executorPath, generated.executorCode);
    files.push(executorPath);

    // Create the test file
    const testPath = `${outputDir}/${nodeType}.test.ts`;
    await this.writeFile(testPath, generated.testCode);
    files.push(testPath);

    // Create the documentation file
    const docsPath = `${outputDir}/${nodeType}.md`;
    await this.writeFile(docsPath, generated.documentation);
    files.push(docsPath);

    // Create the manifest file
    const manifestPath = `${outputDir}/package.json`;
    await this.writeFile(manifestPath, JSON.stringify(generated.manifest, null, 2));
    files.push(manifestPath);

    return files;
  }

  // ========================================
  // Prompt Parsing
  // ========================================

  private async parsePrompt(prompt: string): Promise<NodeGenerationRequest> {
    const parsePrompt = `
Parse the following user request into a structured node definition:

"${prompt}"

Extract:
- Node name
- Description
- Category (from: ${Object.values(NODE_CATEGORIES).join(', ')})
- Input ports (name, type, required, description)
- Output ports (name, type, description)
- Properties (configuration options)
- Examples of usage

Respond with a JSON object following the NodeGenerationRequest interface.
`;

    const response = await this.callLLM(parsePrompt);
    return JSON.parse(response);
  }

  // ========================================
  // Node Definition Generation
  // ========================================

  private async generateNodeDefinition(request: NodeGenerationRequest): Promise<any> {
    const prompt = `
Generate a complete NodeDefinition object for:
Name: ${request.name}
Description: ${request.description}
Category: ${request.category || NODE_CATEGORIES.CUSTOM}

Requirements:
- Create a unique type identifier (kebab-case)
- Define proper input/output ports with correct data types
- Add appropriate properties for configuration
- Include proper metadata (version, author, tags)

Available data types: ${Object.values(DATA_TYPES).join(', ')}
Available categories: ${Object.values(NODE_CATEGORIES).join(', ')}

Return a complete NodeDefinition JSON object.
`;

    const response = await this.callLLM(prompt);
    return JSON.parse(response);
  }

  // ========================================
  // Code Generation
  // ========================================

  private async generateComponentCode(nodeDefinition: any): Promise<string> {
    const template = this.templates.get('component') || this.getDefaultComponentTemplate();
    
    const prompt = `
Generate a React component for this node:
${JSON.stringify(nodeDefinition, null, 2)}

Use this template as a base:
${template}

Requirements:
- Extend BaseNode component
- Implement proper TypeScript types
- Add configuration UI for properties
- Handle input/output display
- Include proper error handling
- Follow React best practices

Return only the complete TypeScript React component code.
`;

    return await this.callLLM(prompt);
  }

  private async generateExecutorCode(nodeDefinition: any): Promise<string> {
    const template = this.templates.get('executor') || this.getDefaultExecutorTemplate();
    
    const prompt = `
Generate an executor function for this node:
${JSON.stringify(nodeDefinition, null, 2)}

Use this template as a base:
${template}

Requirements:
- Implement the core logic for the node
- Handle all input/output ports
- Include proper error handling
- Add logging and validation
- Make it async-safe
- Follow TypeScript best practices

Return only the complete executor function code.
`;

    return await this.callLLM(prompt);
  }

  private async generateTestCode(nodeDefinition: any): Promise<string> {
    const template = this.templates.get('test') || this.getDefaultTestTemplate();
    
    const prompt = `
Generate comprehensive test cases for this node:
${JSON.stringify(nodeDefinition, null, 2)}

Use this template as a base:
${template}

Requirements:
- Test all functionality
- Include edge cases
- Test error conditions
- Mock external dependencies
- Use Jest/React Testing Library
- Cover all input/output combinations

Return only the complete test file code.
`;

    return await this.callLLM(prompt);
  }

  private async generateDocumentation(nodeDefinition: any): Promise<string> {
    const prompt = `
Generate comprehensive documentation for this node:
${JSON.stringify(nodeDefinition, null, 2)}

Include:
- Overview and purpose
- Input/output descriptions
- Configuration options
- Usage examples
- Best practices
- Troubleshooting
- API reference

Use Markdown format.
`;

    return await this.callLLM(prompt);
  }

  // ========================================
  // Template Management
  // ========================================

  private loadTemplates(): void {
    // Load built-in templates
    this.templates.set('component', this.getDefaultComponentTemplate());
    this.templates.set('executor', this.getDefaultExecutorTemplate());
    this.templates.set('test', this.getDefaultTestTemplate());
  }

  private getDefaultComponentTemplate(): string {
    return `
import React, { memo } from 'react';
import { NodeProps } from 'reactflow';
import BaseNode from '../BaseNode';

interface {{NodeName}}Props extends NodeProps {
  // Add custom props here
}

const {{NodeName}}Node = memo<{{NodeName}}Props>(({ id, data, selected }) => {
  // Add state and handlers here

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      title="{{title}}"
      category="{{category}}"
      icon="{{icon}}"
      inputs={{{inputs}}}
      outputs={{{outputs}}}
    >
      {/* Add custom UI here */}
    </BaseNode>
  );
});

{{NodeName}}Node.displayName = '{{NodeName}}Node';

export default {{NodeName}}Node;
`;
  }

  private getDefaultExecutorTemplate(): string {
    return `
import { Node, ExecutionContext } from '../types';

export async function {{functionName}}(
  node: Node,
  inputs: Record<string, any>,
  context: ExecutionContext
): Promise<any> {
  const { logger, signal } = context;
  
  try {
    // Validate inputs
    {{inputValidation}}
    
    // Execute node logic
    {{executionLogic}}
    
    // Return results
    return {{outputMapping}};
  } catch (error) {
    logger.error('{{NodeName}} execution failed:', error);
    throw error;
  }
}
`;
  }

  private getDefaultTestTemplate(): string {
    return `
import { {{functionName}} } from './{{fileName}}.executor';
import { Node, ExecutionContext } from '../types';

describe('{{NodeName}} Node', () => {
  const mockContext: ExecutionContext = {
    flowId: 'test-flow',
    executionId: 'test-execution',
    nodeId: 'test-node',
    inputs: {},
    variables: {},
    settings: {} as any,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    signal: new AbortController().signal,
    services: {} as any
  };

  const mockNode: Node = {
    id: 'test-node',
    type: '{{nodeType}}',
    name: '{{NodeName}}',
    position: { x: 0, y: 0 },
    data: {},
    inputs: {{inputs}},
    outputs: {{outputs}}
  };

  // Add test cases here
  test('should execute successfully with valid inputs', async () => {
    const inputs = {{testInputs}};
    const result = await {{functionName}}(mockNode, inputs, mockContext);
    expect(result).toBeDefined();
  });

  test('should handle errors gracefully', async () => {
    const inputs = {};
    await expect({{functionName}}(mockNode, inputs, mockContext))
      .rejects.toThrow();
  });
});
`;
  }

  // ========================================
  // Utility Methods
  // ========================================

  private generateDefinitionFile(nodeDefinition: any): string {
    return `
/**
 * ${nodeDefinition.name} Node Definition
 * 
 * Generated by angela Agent Studio Node Generator
 */

import { NodeDefinition } from '../types';
import { ${this.toCamelCase(nodeDefinition.type)}Executor } from './${nodeDefinition.type}.executor';

export const ${this.toCamelCase(nodeDefinition.type)}Definition: NodeDefinition = ${JSON.stringify(nodeDefinition, null, 2)};

// Auto-register the node
import('./register').then(({ registerNode }) => {
  registerNode(${this.toCamelCase(nodeDefinition.type)}Definition);
});
`;
  }

  private generateManifest(nodeDefinition: any): any {
    return {
      name: `@angela/node-${nodeDefinition.type}`,
      version: '1.0.0',
      description: nodeDefinition.description,
      main: 'index.js',
      types: 'index.d.ts',
      keywords: ['angela', 'agent-studio', 'node', nodeDefinition.category],
      author: nodeDefinition.author || 'angela Studio',
      license: 'MIT',
      peerDependencies: {
        '@angela/agent-studio': '^2.0.0',
        'react': '^18.0.0',
        'reactflow': '^11.0.0'
      },
      files: [
        'dist/',
        'README.md'
      ],
      engines: {
        'agent-studio': '^2.0.0'
      }
    };
  }

  private toCamelCase(str: string, capitalizeFirst = false): string {
    const camelCase = str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return capitalizeFirst ? camelCase.charAt(0).toUpperCase() + camelCase.slice(1) : camelCase;
  }

  private getSystemPrompt(): string {
    return `
You are an expert TypeScript and React developer specializing in creating
nodes for the angela Agent Studio visual workflow system.

Your task is to generate production-ready, type-safe code that follows
these principles:
- Clean, readable TypeScript code
- Proper error handling
- Comprehensive validation
- React best practices
- Accessibility compliance
- Performance optimization

Always respond with complete, working code that can be used directly
without modifications.
`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // This would integrate with the actual LLM service
    // For now, return a placeholder
    console.log('LLM Prompt:', prompt);
    
    // In a real implementation, this would call OpenAI, Anthropic, or local LLM
    throw new Error('LLM integration not implemented. Connect to your preferred LLM service.');
  }

  private async writeFile(path: string, content: string): Promise<void> {
    // In a real implementation, this would write to the file system
    console.log(`Would write file: ${path}`);
    console.log(content);
  }
}

// ========================================
// Convenience Functions
// ========================================

/**
 * Quick node generation from a prompt
 */
export async function generateNode(prompt: string): Promise<GeneratedNode> {
  const generator = new NodeGenerator();
  return generator.generateFromPrompt(prompt);
}

/**
 * Create a node plugin package
 */
export async function createNodePlugin(
  prompt: string, 
  outputDir: string
): Promise<string[]> {
  const generator = new NodeGenerator();
  const generated = await generator.generateFromPrompt(prompt);
  return generator.createNodeFiles(generated, outputDir);
}

/**
 * Batch generate multiple nodes
 */
export async function generateMultipleNodes(
  prompts: string[]
): Promise<GeneratedNode[]> {
  const generator = new NodeGenerator();
  return Promise.all(prompts.map(prompt => generator.generateFromPrompt(prompt)));
}

export default NodeGenerator; 
