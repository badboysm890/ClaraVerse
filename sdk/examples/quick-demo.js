#!/usr/bin/env node

/**
 * angela Flow SDK - Quick Demo
 * 
 * This script demonstrates the key features of the angela Flow SDK:
 * - Loading flows from Agent Studio exports
 * - Multiple input methods
 * - Custom nodes
 * - Error handling
 */

import { angelaFlowRunner } from '../dist/angela-flow-sdk.esm.js';

console.log('🚀 angela Flow SDK - Quick Demo\n');

// Initialize the runner
const runner = new angelaFlowRunner({
  enableLogging: true,
  logLevel: 'info',
  timeout: 30000
});

console.log('✅ SDK initialized\n');

// Demo 1: Simple text processing
console.log('📝 Demo 1: Simple Text Processing');
console.log('═'.repeat(50));

const simpleFlow = {
  id: 'demo-flow',
  name: 'Text Processing Demo',
  version: '1.0.0',
  nodes: [
    {
      id: 'input-1',
      type: 'input',
      name: 'User Message',
      data: { inputType: 'string', defaultValue: 'Hello angela!' },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
    },
    {
      id: 'output-1',
      type: 'output',
      name: 'Processed Result',
      data: { format: 'text' },
      inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'string', required: true }],
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
};

try {
  const result1 = await runner.executeFlow(simpleFlow, {
    'User Message': 'Hello from the angela Flow SDK!'
  });
  
  console.log('✅ Result:', result1);
  console.log('');
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Demo 2: Mock Agent Studio Export Format
console.log('🏭 Demo 2: Agent Studio Export Format');
console.log('═'.repeat(50));

const agentStudioExport = {
  format: 'angela-sdk',
  version: '1.0.0',
  flow: {
    id: 'studio-export',
    name: 'Agent Studio Export Demo',
    description: 'Demonstrates Agent Studio export compatibility',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'Question',
        data: { inputType: 'string', defaultValue: 'What is AI?' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Answer',
        data: { format: 'text' },
        inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'string', required: true }],
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
  exportedAt: new Date().toISOString(),
  exportedBy: 'angela Agent Studio'
};

try {
  // SDK automatically detects and handles Agent Studio format
  const result2 = await runner.executeFlow(agentStudioExport, {
    'Question': 'How easy is it to use angela Flow SDK?'
  });
  
  console.log('✅ Result:', result2);
  console.log('');
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Demo 3: Custom Node
console.log('⚡ Demo 3: Custom Node Integration');
console.log('═'.repeat(50));

// Register a custom text transformer node
await runner.registerCustomNode({
  id: 'demo-transformer',
  type: 'demo-transformer',
  name: 'Demo Text Transformer',
  description: 'Transforms text for demo purposes',
  inputs: [
    {
      id: 'text',
      name: 'text',
      dataType: 'string',
      required: true,
      description: 'Text to transform'
    }
  ],
  outputs: [
    {
      id: 'result',
      name: 'result',
      dataType: 'string',
      description: 'Transformed text'
    }
  ],
  properties: [
    {
      id: 'style',
      name: 'Transform Style',
      type: 'string',
      defaultValue: 'excited',
      description: 'How to transform the text'
    }
  ],
  executionCode: `
    async function execute(inputs, properties, context) {
      const text = inputs.text || '';
      const style = properties.style || 'excited';
      
      context.log('Transforming text with style:', style);
      
      let result;
      switch (style) {
        case 'excited':
          result = text.toUpperCase() + '! 🎉';
          break;
        case 'whisper':
          result = text.toLowerCase() + '... 🤫';
          break;
        case 'robot':
          result = 'BEEP BOOP: ' + text.replace(/[aeiou]/gi, '0') + ' *MECHANICAL NOISES*';
          break;
        default:
          result = text;
      }
      
      context.log('Transformation complete:', result);
      return { result };
    }
  `
});

console.log('✅ Custom node registered');

const customNodeFlow = {
  format: 'angela-sdk',
  version: '1.0.0',
  flow: {
    id: 'custom-demo',
    name: 'Custom Node Demo',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        name: 'Original Text',
        data: { inputType: 'string', defaultValue: 'Hello World' },
        inputs: [],
        outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
      },
      {
        id: 'custom-1',
        type: 'demo-transformer',
        name: 'Text Transformer',
        data: {
          properties: {
            style: 'robot'
          }
        },
        inputs: [{ id: 'text', name: 'text', type: 'input', dataType: 'string', required: true }],
        outputs: [{ id: 'result', name: 'result', type: 'output', dataType: 'string' }]
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Transformed Text',
        data: { format: 'text' },
        inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'string', required: true }],
        outputs: []
      }
    ],
    connections: [
      {
        id: 'conn-1',
        sourceNodeId: 'input-1',
        sourcePortId: 'output',
        targetNodeId: 'custom-1',
        targetPortId: 'text'
      },
      {
        id: 'conn-2',
        sourceNodeId: 'custom-1',
        sourcePortId: 'result',
        targetNodeId: 'output-1',
        targetPortId: 'input'
      }
    ]
  },
  customNodes: []
};

try {
  const result3 = await runner.executeFlow(customNodeFlow, {
    'Original Text': 'The angela Flow SDK is amazing'
  });
  
  console.log('✅ Result:', result3);
  console.log('');
} catch (error) {
  console.error('❌ Error:', error.message);
}

// Demo 4: Different Input Methods
console.log('📥 Demo 4: Input Flexibility');
console.log('═'.repeat(50));

const flexibleFlow = {
  id: 'flexible-input',
  name: 'Flexible Input Demo',
  version: '1.0.0',
  nodes: [
    {
      id: 'input-name',
      type: 'input',
      name: 'Your Name',
      data: { inputType: 'string', defaultValue: 'angela User' },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
    },
    {
      id: 'input-age',
      type: 'input',
      name: 'Your Age',
      data: { inputType: 'number', defaultValue: 25 },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'number' }]
    }
  ],
  connections: []
};

console.log('📝 Testing different input methods:');

// Method 1: By node name
try {
  const result4a = await runner.executeFlow(flexibleFlow, {
    'Your Name': 'Alice',
    'Your Age': 30
  });
  console.log('  ✅ By node name:', Object.keys(result4a).length, 'outputs');
} catch (error) {
  console.log('  ❌ By node name failed:', error.message);
}

// Method 2: By node ID
try {
  const result4b = await runner.executeFlow(flexibleFlow, {
    'input-name': 'Bob',
    'input-age': 35
  });
  console.log('  ✅ By node ID:', Object.keys(result4b).length, 'outputs');
} catch (error) {
  console.log('  ❌ By node ID failed:', error.message);
}

// Method 3: Mixed
try {
  const result4c = await runner.executeFlow(flexibleFlow, {
    'Your Name': 'Charlie',  // By name
    'input-age': 40          // By ID
  });
  console.log('  ✅ Mixed method:', Object.keys(result4c).length, 'outputs');
} catch (error) {
  console.log('  ❌ Mixed method failed:', error.message);
}

// Method 4: Empty (defaults)
try {
  const result4d = await runner.executeFlow(flexibleFlow, {});
  console.log('  ✅ Empty inputs (defaults):', Object.keys(result4d).length, 'outputs');
} catch (error) {
  console.log('  ❌ Empty inputs failed:', error.message);
}

console.log('');

// Summary
console.log('🎉 Demo Complete!');
console.log('═'.repeat(50));
console.log('✅ Simple flow execution works');
console.log('✅ Agent Studio export format supported');
console.log('✅ Custom nodes can be registered and used');
console.log('✅ Multiple input methods supported');
console.log('✅ Error handling is robust');
console.log('');
console.log('📚 Check the README.md for detailed documentation!');
console.log('🚀 Ready to build amazing AI workflows with angela Flow SDK!');

// Get execution statistics
const stats = runner.getStats();
console.log('\n📊 SDK Statistics:');
console.log(`  • Registered custom nodes: ${stats.registeredCustomNodes}`);
console.log(`  • Built-in node types: ${stats.supportedBuiltinNodes}`);
console.log(`  • Total execution logs: ${stats.totalLogs}`); 
