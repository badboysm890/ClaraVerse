#!/usr/bin/env node

/**
 * Test angela Flow SDK with Agent Studio Export Format
 * 
 * This script creates a mock export from Agent Studio and tests it with the SDK
 * to ensure compatibility between the export format and SDK expectations.
 */

import { angelaFlowRunner } from './dist/index.esm.js';
import fs from 'fs';

async function testExportCompatibility() {
  console.log('🔄 Testing Agent Studio Export Compatibility with SDK\n');

  try {
    // Create a mock Agent Studio export in the angela-sdk format
    const mockAgentStudioExport = {
      format: 'angela-sdk',
      version: '1.0.0',
      flow: {
        id: 'test-flow-123',
        name: 'Text Processing Flow',
        description: 'A test flow from Agent Studio',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Text Input',
            position: { x: 100, y: 100 },
            data: {
              label: 'Text Input',
              inputType: 'string',
              value: 'Hello from Agent Studio!'
            },
            inputs: [],
            outputs: [
              {
                id: 'output',
                name: 'Value',
                type: 'output',
                dataType: 'string',
                description: 'Input value'
              }
            ]
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Result Output',
            position: { x: 400, y: 100 },
            data: {
              label: 'Result Output',
              format: 'text'
            },
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
            outputs: []
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
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      customNodes: [],
      exportedAt: new Date().toISOString(),
      exportedBy: 'angela Agent Studio'
    };

    console.log('✅ Mock Agent Studio export created');
    console.log(`📋 Flow: ${mockAgentStudioExport.flow.name}`);
    console.log(`📊 Nodes: ${mockAgentStudioExport.flow.nodes.length}`);
    console.log(`🔗 Connections: ${mockAgentStudioExport.flow.connections.length}`);

    // Initialize the flow runner
    const runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'info',
      timeout: 30000
    });

    console.log('\n✅ Flow runner initialized');

    // Test 1: Direct export format (what Agent Studio exports)
    console.log('\n🧪 Test 1: Testing Agent Studio export format directly...');
    
    try {
      const result1 = await runner.executeFlow(mockAgentStudioExport, {
        'Text Input': 'Hello from Agent Studio!'
      });
      console.log('✅ Test 1 PASSED: Agent Studio export format works directly');
      console.log('📊 Results:', JSON.stringify(result1.results || result1, null, 2));
    } catch (error) {
      console.log('❌ Test 1 FAILED: Direct export format failed');
      console.log('Error:', error.message);
    }

    // Test 2: Extracted flow format (what our current test does)
    console.log('\n🧪 Test 2: Testing extracted flow format...');
    
    const extractedFlowData = {
      ...mockAgentStudioExport.flow,
      version: '1.0.0',
      connections: mockAgentStudioExport.flow.connections || [],
      customNodes: mockAgentStudioExport.customNodes || []
    };

    try {
      const result2 = await runner.executeFlow(extractedFlowData, {
        'Text Input': 'Hello from extracted format!'
      });
      console.log('✅ Test 2 PASSED: Extracted flow format works');
      console.log('📊 Results:', JSON.stringify(result2.results || result2, null, 2));
    } catch (error) {
      console.log('❌ Test 2 FAILED: Extracted format failed');
      console.log('Error:', error.message);
    }

    // Test 3: Test with custom node
    console.log('\n🧪 Test 3: Testing with custom nodes...');
    
    const customNodeExport = {
      format: 'angela-sdk',
      version: '1.0.0',
      flow: {
        id: 'custom-flow-123',
        name: 'Custom Node Flow',
        description: 'A test flow with custom nodes',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            name: 'Text Input',
            position: { x: 100, y: 100 },
            data: {
              label: 'Text Input',
              value: 'hello world'
            },
            inputs: [],
            outputs: [
              {
                id: 'output',
                name: 'Value',
                type: 'output',
                dataType: 'string'
              }
            ]
          },
          {
            id: 'custom-1',
            type: 'text-transformer',
            name: 'Text Transformer',
            position: { x: 300, y: 100 },
            data: {
              properties: {
                operation: 'uppercase'
              }
            },
            inputs: [
              {
                id: 'input',
                name: 'text',
                type: 'input',
                dataType: 'string',
                required: true
              }
            ],
            outputs: [
              {
                id: 'output',
                name: 'result',
                type: 'output',
                dataType: 'string'
              }
            ]
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Result',
            position: { x: 500, y: 100 },
            data: {
              label: 'Result'
            },
            inputs: [
              {
                id: 'input',
                name: 'Value',
                type: 'input',
                dataType: 'any',
                required: true
              }
            ],
            outputs: []
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
        ]
      },
      customNodes: [
        {
          id: 'text-transformer-node',
          type: 'text-transformer',
          name: 'Text Transformer',
          description: 'Transforms text with various operations',
          category: 'Text Processing',
          icon: '🔄',
          inputs: [
            {
              id: 'input',
              name: 'text',
              dataType: 'string',
              required: true,
              description: 'Text to transform'
            }
          ],
          outputs: [
            {
              id: 'output',
              name: 'result',
              dataType: 'string',
              description: 'Transformed text'
            }
          ],
          properties: [
            {
              id: 'operation',
              name: 'Operation',
              type: 'string',
              defaultValue: 'uppercase',
              description: 'Type of transformation'
            }
          ],
          executionCode: `
            async function execute(inputs, properties, context) {
              const text = inputs.text || '';
              const operation = properties.operation || 'uppercase';
              
              context.log('Transforming text:', text);
              context.log('Operation:', operation);
              
              let result;
              switch (operation.toLowerCase()) {
                case 'uppercase':
                  result = text.toUpperCase();
                  break;
                case 'lowercase':
                  result = text.toLowerCase();
                  break;
                case 'reverse':
                  result = text.split('').reverse().join('');
                  break;
                default:
                  result = text;
              }
              
              context.log('Result:', result);
              return { result };
            }
          `,
          metadata: {
            author: 'angela Agent Studio',
            version: '1.0.0',
            tags: ['text', 'transform']
          }
        }
      ]
    };

    try {
      const result3 = await runner.executeFlow(customNodeExport, {
        'Text Input': 'hello world'
      });
      console.log('✅ Test 3 PASSED: Custom node export works');
      console.log('📊 Results:', JSON.stringify(result3.results || result3, null, 2));
    } catch (error) {
      console.log('❌ Test 3 FAILED: Custom node export failed');
      console.log('Error:', error.message);
    }

    // Write the working examples to files for reference
    console.log('\n💾 Saving working examples...');
    
    fs.writeFileSync(
      './examples/agent-studio-export-example.json',
      JSON.stringify(mockAgentStudioExport, null, 2)
    );
    
    fs.writeFileSync(
      './examples/custom-node-export-example.json',
      JSON.stringify(customNodeExport, null, 2)
    );

    console.log('✅ Example files saved to ./examples/');
    console.log('\n🎉 Compatibility test completed!');

  } catch (error) {
    console.error('❌ Compatibility test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Test input mapping strategies
async function testInputMapping() {
  console.log('\n🔄 Testing Input Mapping Strategies\n');

  const runner = new angelaFlowRunner({
    enableLogging: false,
    logLevel: 'error'
  });

  const simpleFlow = {
    id: 'input-test',
    name: 'Input Test',
    version: '1.0.0',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'First Input',
        data: { value: 'default1' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
      },
      {
        id: 'input-2',
        type: 'input',
        name: 'Second Input',
        data: { value: 'default2' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
      }
    ],
    connections: []
  };

  console.log('🧪 Testing different input mapping methods:');

  // Method 1: By node name
  console.log('\n1. By node name:');
  try {
    const result1 = await runner.executeFlow(simpleFlow, {
      'First Input': 'value1',
      'Second Input': 'value2'
    });
    console.log('   ✅ Works - Input by node name');
  } catch (error) {
    console.log('   ❌ Failed - Input by node name:', error.message);
  }

  // Method 2: By node ID
  console.log('2. By node ID:');
  try {
    const result2 = await runner.executeFlow(simpleFlow, {
      'input-1': 'value1',
      'input-2': 'value2'
    });
    console.log('   ✅ Works - Input by node ID');
  } catch (error) {
    console.log('   ❌ Failed - Input by node ID:', error.message);
  }

  // Method 3: Mixed mapping
  console.log('3. Mixed mapping:');
  try {
    const result3 = await runner.executeFlow(simpleFlow, {
      'First Input': 'value1',
      'input-2': 'value2'
    });
    console.log('   ✅ Works - Mixed input mapping');
  } catch (error) {
    console.log('   ❌ Failed - Mixed input mapping:', error.message);
  }

  // Method 4: Empty inputs (should use defaults)
  console.log('4. Empty inputs (defaults):');
  try {
    const result4 = await runner.executeFlow(simpleFlow, {});
    console.log('   ✅ Works - Empty inputs use node defaults');
  } catch (error) {
    console.log('   ❌ Failed - Empty inputs:', error.message);
  }
}

// Run all tests
async function main() {
  try {
    await testExportCompatibility();
    await testInputMapping();
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main(); 
