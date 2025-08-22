/**
 * angela Flow SDK - Integration Tests
 */

import { angelaFlowRunner } from '../src/index.js';

describe('angela Flow SDK Integration Tests', () => {
  let runner;

  beforeEach(() => {
    runner = new angelaFlowRunner({
      enableLogging: false, // Disable logging in tests
      timeout: 5000
    });
  });

  afterEach(() => {
    if (runner) {
      runner.clearLogs();
    }
  });

  describe('Flow Execution', () => {
    test('should execute simple flow with input and output nodes', async () => {
      const simpleFlow = {
        version: '1.0.0',
        name: 'Simple Test Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Test Input',
            data: { inputType: 'string', defaultValue: 'test' },
            position: { x: 100, y: 100 }
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Test Output',
            data: {},
            position: { x: 300, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'output-1',
            targetPortId: 'input'
          }
        ],
        customNodes: []
      };

      const result = await runner.executeFlow(simpleFlow, {
        'Test Input': 'Hello World'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    test('should execute flow with custom node', async () => {
      const customNodeFlow = {
        version: '1.0.0',
        name: 'Custom Node Test Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Text Input',
            data: { inputType: 'string', defaultValue: 'hello' },
            position: { x: 100, y: 100 }
          },
          {
            id: 'custom-1',
            type: 'text-transformer',
            name: 'Text Transformer',
            data: { operation: 'uppercase' },
            position: { x: 300, y: 100 }
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Result Output',
            data: {},
            position: { x: 500, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'custom-1',
            targetPortId: 'input'
          },
          {
            id: 'conn-2',
            sourceNodeId: 'custom-1',
            sourcePortId: 'output',
            targetNodeId: 'output-1',
            targetPortId: 'input'
          }
        ],
        customNodes: [
          {
            type: 'text-transformer',
            name: 'Text Transformer',
            description: 'Transforms text using various operations',
            inputs: [{ name: 'input', type: 'string', required: true }],
            outputs: [{ name: 'output', type: 'string' }],
            properties: [{ name: 'operation', type: 'string', defaultValue: 'uppercase' }],
            executionCode: `
              async function execute(inputs, properties, context) {
                const text = inputs.input || '';
                const operation = properties.operation || 'uppercase';
                
                let result;
                switch (operation) {
                  case 'uppercase':
                    result = text.toUpperCase();
                    break;
                  case 'lowercase':
                    result = text.toLowerCase();
                    break;
                  default:
                    result = text;
                }
                
                return { output: result };
              }
            `
          }
        ]
      };

      const result = await runner.executeFlow(customNodeFlow, {
        'Text Input': 'hello world'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.results['Result Output']).toBe('HELLO WORLD');
    });

    test('should handle async custom nodes', async () => {
      const asyncFlow = {
        version: '1.0.0',
        name: 'Async Test Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Delay Input',
            data: { inputType: 'number', defaultValue: 100 },
            position: { x: 100, y: 100 }
          },
          {
            id: 'custom-1',
            type: 'delay-processor',
            name: 'Delay Processor',
            data: {},
            position: { x: 300, y: 100 }
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Delayed Output',
            data: {},
            position: { x: 500, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'custom-1',
            targetPortId: 'input'
          },
          {
            id: 'conn-2',
            sourceNodeId: 'custom-1',
            sourcePortId: 'output',
            targetNodeId: 'output-1',
            targetPortId: 'input'
          }
        ],
        customNodes: [
          {
            type: 'delay-processor',
            name: 'Delay Processor',
            description: 'Adds a delay before processing',
            inputs: [{ name: 'input', type: 'number', required: true }],
            outputs: [{ name: 'output', type: 'string' }],
            executionCode: `
              async function execute(inputs, properties, context) {
                const delay = parseInt(inputs.input) || 100;
                
                await new Promise(resolve => setTimeout(resolve, delay));
                
                return { output: 'Processed after ' + delay + 'ms delay' };
              }
            `
          }
        ]
      };

      const startTime = Date.now();
      const result = await runner.executeFlow(asyncFlow, {
        'Delay Input': 200
      });
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(200);
      expect(result.results['Delayed Output']).toContain('200ms delay');
    });
  });

  describe('Flow Validation', () => {
    test('should validate valid flow', () => {
      const validFlow = {
        version: '1.0.0',
        name: 'Valid Test Flow',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Input',
            data: {},
            position: { x: 100, y: 100 }
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Output',
            data: {},
            position: { x: 300, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'output-1',
            targetPortId: 'input'
          }
        ],
        customNodes: []
      };

      const validation = runner.validateFlow(validFlow);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.summary).toBeDefined();
      expect(validation.summary.flowName).toBe('Valid Test Flow');
    });

    test('should detect validation errors', () => {
      const invalidFlow = {
        // Missing required fields
        nodes: [
          {
            // Missing id and type
            name: 'Invalid Node'
          }
        ],
        connections: [],
        customNodes: []
      };

      const validation = runner.validateFlow(invalidFlow);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should detect circular dependencies', () => {
      const circularFlow = {
        version: '1.0.0',
        name: 'Circular Flow',
        nodes: [
          {
            id: 'node-1',
            type: 'custom',
            name: 'Node 1',
            data: {},
            position: { x: 100, y: 100 }
          },
          {
            id: 'node-2',
            type: 'custom',
            name: 'Node 2',
            data: {},
            position: { x: 300, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'node-1',
            sourcePortId: 'output',
            targetNodeId: 'node-2',
            targetPortId: 'input'
          },
          {
            id: 'conn-2',
            sourceNodeId: 'node-2',
            sourcePortId: 'output',
            targetNodeId: 'node-1',
            targetPortId: 'input'
          }
        ],
        customNodes: []
      };

      const validation = runner.validateFlow(circularFlow);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('circular'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle execution timeout', async () => {
      const timeoutRunner = new angelaFlowRunner({
        enableLogging: false,
        timeout: 100 // Very short timeout
      });

      const longRunningFlow = {
        version: '1.0.0',
        name: 'Long Running Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Input',
            data: { defaultValue: 'test' },
            position: { x: 100, y: 100 }
          },
          {
            id: 'custom-1',
            type: 'slow-processor',
            name: 'Slow Processor',
            data: {},
            position: { x: 300, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'custom-1',
            targetPortId: 'input'
          }
        ],
        customNodes: [
          {
            type: 'slow-processor',
            name: 'Slow Processor',
            executionCode: `
              async function execute(inputs, properties, context) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                return { output: 'Done' };
              }
            `
          }
        ]
      };

      await expect(timeoutRunner.executeFlow(longRunningFlow)).rejects.toThrow('timeout');
    });

    test('should handle invalid custom node code', async () => {
      const invalidCodeFlow = {
        version: '1.0.0',
        name: 'Invalid Code Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Input',
            data: { defaultValue: 'test' },
            position: { x: 100, y: 100 }
          },
          {
            id: 'custom-1',
            type: 'broken-processor',
            name: 'Broken Processor',
            data: {},
            position: { x: 300, y: 100 }
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceNodeId: 'input-1',
            sourcePortId: 'output',
            targetNodeId: 'custom-1',
            targetPortId: 'input'
          }
        ],
        customNodes: [
          {
            type: 'broken-processor',
            name: 'Broken Processor',
            executionCode: `
              // Invalid JavaScript syntax
              async function execute(inputs, properties, context) {
                invalid syntax here!!!
                return { output: 'This will not work' };
              }
            `
          }
        ]
      };

      await expect(runner.executeFlow(invalidCodeFlow)).rejects.toThrow();
    });
  });

  describe('Logging', () => {
    test('should capture execution logs when enabled', async () => {
      const loggingRunner = new angelaFlowRunner({
        enableLogging: true,
        logLevel: 'debug'
      });

      const simpleFlow = {
        version: '1.0.0',
        name: 'Logging Test Flow',
        exportFormat: 'angela-sdk',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Input',
            data: { defaultValue: 'test' },
            position: { x: 100, y: 100 }
          }
        ],
        connections: [],
        customNodes: []
      };

      await loggingRunner.executeFlow(simpleFlow);
      
      const logs = loggingRunner.getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should support different log levels', () => {
      const debugRunner = new angelaFlowRunner({
        enableLogging: true,
        logLevel: 'debug'
      });

      const errorRunner = new angelaFlowRunner({
        enableLogging: true,
        logLevel: 'error'
      });

      // Log messages at different levels
      debugRunner.logger.debug('Debug message');
      debugRunner.logger.info('Info message');
      debugRunner.logger.warn('Warning message');
      debugRunner.logger.error('Error message');

      errorRunner.logger.debug('Debug message');
      errorRunner.logger.info('Info message');
      errorRunner.logger.warn('Warning message');
      errorRunner.logger.error('Error message');

      const debugLogs = debugRunner.getLogs();
      const errorLogs = errorRunner.getLogs();

      expect(debugLogs.length).toBe(4); // All messages
      expect(errorLogs.length).toBe(1); // Only error message
    });
  });

  describe('Configuration', () => {
    test('should respect custom timeout settings', async () => {
      const customRunner = new angelaFlowRunner({
        timeout: 2000,
        enableLogging: false
      });

      expect(customRunner.options.timeout).toBe(2000);
    });

    test('should handle sandbox configuration', () => {
      const sandboxedRunner = new angelaFlowRunner({
        sandbox: true
      });

      const unsandboxedRunner = new angelaFlowRunner({
        sandbox: false
      });

      expect(sandboxedRunner.options.sandbox).toBe(true);
      expect(unsandboxedRunner.options.sandbox).toBe(false);
    });
  });
}); 
