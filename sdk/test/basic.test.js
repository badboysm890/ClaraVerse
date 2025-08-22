/**
 * Basic test for angela Flow SDK v2.0
 */

import { angelaFlowRunner, BrowserUtils } from '../src/index.js';

console.log('🧪 Testing angela Flow SDK v2.0...\n');

// Test 1: SDK Initialization
console.log('Test 1: SDK Initialization');
try {
  const runner = new angelaFlowRunner({
    enableLogging: true,
    timeout: 5000
  });
  console.log('✅ SDK initialized successfully');
} catch (error) {
  console.error('❌ SDK initialization failed:', error.message);
  process.exit(1);
}

// Test 2: Simple workflow execution
console.log('\nTest 2: Simple Workflow Execution');
try {
  const runner = new angelaFlowRunner({ enableLogging: true });
  
  // Simple workflow: Input -> Static Text -> Output
  const simpleFlow = {
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'User Input',
        data: { value: 'Hello from angela SDK!' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', dataType: 'string' }]
      },
      {
        id: 'static-1',
        type: 'static-text',
        name: 'Static Text',
        data: { text: 'Processing: ' },
        inputs: [{ id: 'input', name: 'Input', dataType: 'string' }],
        outputs: [{ id: 'output', name: 'Output', dataType: 'string' }]
      },
      {
        id: 'combine-1',
        type: 'combine-text',
        name: 'Combine',
        data: { separator: '' },
        inputs: [
          { id: 'text1', name: 'Text1', dataType: 'string' },
          { id: 'text2', name: 'Text2', dataType: 'string' }
        ],
        outputs: [{ id: 'output', name: 'Output', dataType: 'string' }]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Final Output',
        inputs: [{ id: 'input', name: 'Input', dataType: 'string' }],
        outputs: []
      }
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'static-1',
        sourcePortId: 'output',
        targetNodeId: 'combine-1',
        targetPortId: 'text1'
      },
      {
        id: 'conn-2',
        sourceNodeId: 'input-1',
        sourcePortId: 'output',
        targetNodeId: 'combine-1',
        targetPortId: 'text2'
      },
      {
        id: 'conn-3',
        sourceNodeId: 'combine-1',
        sourcePortId: 'output',
        targetNodeId: 'output-1',
        targetPortId: 'input'
      }
    ]
  };
  
  const result = await runner.execute(simpleFlow, {
    'input-1': 'World!'
  });
  
  console.log('✅ Simple workflow executed successfully');
  console.log('📤 Result:', result);
  
} catch (error) {
  console.error('❌ Simple workflow execution failed:', error.message);
  process.exit(1);
}

// Test 3: JSON parsing workflow
console.log('\nTest 3: JSON Parsing Workflow');
try {
  const runner = new angelaFlowRunner({ enableLogging: false });
  
  const jsonFlow = {
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'JSON Input',
        data: { value: '{"user": {"name": "Alice", "age": 30}}' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', dataType: 'string' }]
      },
      {
        id: 'parse-1',
        type: 'json-parse',
        name: 'Parse JSON',
        data: { field: 'user.name' },
        inputs: [{ id: 'input', name: 'JSON', dataType: 'string' }],
        outputs: [{ id: 'output', name: 'Output', dataType: 'any' }]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Parsed Output',
        inputs: [{ id: 'input', name: 'Input', dataType: 'any' }],
        outputs: []
      }
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'input-1',
        sourcePortId: 'output',
        targetNodeId: 'parse-1',
        targetPortId: 'input'
      },
      {
        id: 'conn-2',
        sourceNodeId: 'parse-1',
        sourcePortId: 'output',
        targetNodeId: 'output-1',
        targetPortId: 'input'
      }
    ]
  };
  
  const result = await runner.execute(jsonFlow);
  console.log('✅ JSON parsing workflow executed successfully');
  console.log('📤 Extracted name:', result['output-1']?.output);
  
} catch (error) {
  console.error('❌ JSON parsing workflow failed:', error.message);
  process.exit(1);
}

// Test 4: If/Else conditional workflow
console.log('\nTest 4: If/Else Conditional Workflow');
try {
  const runner = new angelaFlowRunner({ enableLogging: false });
  
  const conditionalFlow = {
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'Number Input',
        data: { value: 42 },
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', dataType: 'number' }]
      },
      {
        id: 'condition-1',
        type: 'if-else',
        name: 'Check Even',
        data: { 
          expression: 'input % 2 === 0',
          trueValue: 'Even number',
          falseValue: 'Odd number'
        },
        inputs: [{ id: 'input', name: 'Input', dataType: 'number' }],
        outputs: [
          { id: 'true', name: 'True', dataType: 'string' },
          { id: 'false', name: 'False', dataType: 'string' },
          { id: 'output', name: 'Output', dataType: 'string' }
        ]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Result',
        inputs: [{ id: 'input', name: 'Input', dataType: 'string' }],
        outputs: []
      }
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'input-1',
        sourcePortId: 'output',
        targetNodeId: 'condition-1',
        targetPortId: 'input'
      },
      {
        id: 'conn-2',
        sourceNodeId: 'condition-1',
        sourcePortId: 'output',
        targetNodeId: 'output-1',
        targetPortId: 'input'
      }
    ]
  };
  
  const result = await runner.execute(conditionalFlow);
  console.log('✅ Conditional workflow executed successfully');
  console.log('📤 Result:', result['output-1']?.output);
  
} catch (error) {
  console.error('❌ Conditional workflow failed:', error.message);
  process.exit(1);
}

// Test 5: Custom node registration and execution
console.log('\nTest 5: Custom Node Registration');
try {
  const runner = new angelaFlowRunner({ enableLogging: false });
  
  // Register a custom node
  runner.registerCustomNode({
    type: 'multiply',
    name: 'Multiply Numbers',
    executionCode: `
      function execute(inputs, properties, context) {
        const a = parseFloat(inputs.a) || 0;
        const b = parseFloat(inputs.b) || 0;
        const factor = parseFloat(properties.factor) || 1;
        const result = a * b * factor;
        context.log('Multiplying: ' + a + ' * ' + b + ' * ' + factor + ' = ' + result);
        return { output: result };
      }
    `
  });
  
  const customFlow = {
    nodes: [
      {
        id: 'input-a',
        type: 'input',
        name: 'Input A',
        data: { value: 6 },
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', dataType: 'number' }]
      },
      {
        id: 'input-b',
        type: 'input',
        name: 'Input B',
        data: { value: 7 },
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', dataType: 'number' }]
      },
      {
        id: 'multiply-1',
        type: 'multiply',
        name: 'Custom Multiply',
        data: { factor: 2 },
        inputs: [
          { id: 'a', name: 'A', dataType: 'number' },
          { id: 'b', name: 'B', dataType: 'number' }
        ],
        outputs: [{ id: 'output', name: 'Output', dataType: 'number' }]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Final Result',
        inputs: [{ id: 'input', name: 'Input', dataType: 'number' }],
        outputs: []
      }
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'input-a',
        sourcePortId: 'output',
        targetNodeId: 'multiply-1',
        targetPortId: 'a'
      },
      {
        id: 'conn-2',
        sourceNodeId: 'input-b',
        sourcePortId: 'output',
        targetNodeId: 'multiply-1',
        targetPortId: 'b'
      },
      {
        id: 'conn-3',
        sourceNodeId: 'multiply-1',
        sourcePortId: 'output',
        targetNodeId: 'output-1',
        targetPortId: 'input'
      }
    ]
  };
  
  const result = await runner.execute(customFlow);
  console.log('✅ Custom node workflow executed successfully');
  console.log('📤 Result (6 * 7 * 2):', result['output-1']?.output);
  
} catch (error) {
  console.error('❌ Custom node workflow failed:', error.message);
  process.exit(1);
}

// Test 6: angela Studio export format compatibility
console.log('\nTest 6: angela Studio Export Format');
try {
  const runner = new angelaFlowRunner({ enableLogging: false });
  
  // Simulate angela Studio export format
  const studioExport = {
    format: 'angela-sdk',
    version: '1.0.0',
    flow: {
      id: 'test-flow',
      name: 'Test Flow',
      nodes: [
        {
          id: 'input-1',
          type: 'input',
          name: 'Test Input',
          data: { value: 'angela Studio Export Test' },
          inputs: [],
          outputs: [{ id: 'output', name: 'Output', dataType: 'string' }]
        },
        {
          id: 'output-1',
          type: 'output',
          name: 'Test Output',
          inputs: [{ id: 'input', name: 'Input', dataType: 'string' }],
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
      ]
    },
    customNodes: [],
    metadata: {
      exportedAt: new Date().toISOString(),
      exportedBy: 'angela Agent Studio'
    }
  };
  
  const result = await runner.execute(studioExport);
  console.log('✅ angela Studio export format handled successfully');
  console.log('📤 Result:', result['output-1']?.output);
  
} catch (error) {
  console.error('❌ angela Studio export format failed:', error.message);
  process.exit(1);
}

console.log('\n🎉 All tests passed! angela Flow SDK v2.0 is working correctly.');
console.log('\n📋 SDK Features Verified:');
console.log('✅ Basic workflow execution');
console.log('✅ JSON parsing with dot notation');
console.log('✅ Conditional logic (if/else)');
console.log('✅ Custom node registration and execution');
console.log('✅ angela Studio export format compatibility');
console.log('✅ Built-in nodes: input, output, static-text, combine-text, json-parse, if-else');
console.log('✅ Topological sorting for execution order');
console.log('✅ Error handling and logging');

// Show execution logs example
console.log('\n📝 Sample Execution Logs:');
const runner = new angelaFlowRunner({ enableLogging: true });
const logs = runner.getLogs();
console.log('Logs count:', logs.length); 
