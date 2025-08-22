#!/usr/bin/env node

/**
 * Debug LLM Output Issue
 * 
 * This script demonstrates the problem with complex LLM output 
 * and shows how to fix it.
 */

import { angelaFlowRunner } from './dist/index.esm.js';

console.log('🔍 Debug: LLM Output Issue\n');

const runner = new angelaFlowRunner({
  enableLogging: true,
  logLevel: 'debug'
});

// Create a custom LLM node that mimics your problematic output
await runner.registerCustomNode({
  type: 'problematic-llm',
  name: 'Problematic LLM',
  description: 'LLM node that returns complex object like yours',
  inputs: [
    { id: 'input', name: 'input', dataType: 'string', required: true }
  ],
  outputs: [
    { id: 'output', name: 'output', dataType: 'object' }
  ],
  executionCode: `
    async function execute(inputs, properties, context) {
      // This mimics your problematic output
      return {
        "1748778913858-yc1sdo01m": "hi",
        "1748778928358-6ddp1i7z5": "You are angela and you are the girl friend of the user and alwau act like one",
        "1748778916835-87arlbn16": {
          "response": "hi there! 😊 How's your day going so far?",
          "usage": {
            "completion_tokens": 242,
            "prompt_tokens": 22,
            "total_tokens": 264
          }
        },
        "1748778978330-y1a0hewow": "hi there! 😊 How's your day going so far?"
      };
    }
  `
});

// Create a fixed LLM node that returns just the response
await runner.registerCustomNode({
  type: 'fixed-llm',
  name: 'Fixed LLM',
  description: 'LLM node that returns just the response',
  inputs: [
    { id: 'input', name: 'input', dataType: 'string', required: true }
  ],
  outputs: [
    { id: 'response', name: 'response', dataType: 'string' }
  ],
  executionCode: `
    async function execute(inputs, properties, context) {
      // This is how it should work - return just the response
      return {
        response: "hi there! 😊 How's your day going so far?"
      };
    }
  `
});

// Test 1: Problematic flow (will fail)
console.log('❌ Test 1: Problematic LLM → Output (This will show the issue)');
console.log('═'.repeat(60));

const problematicFlow = {
  id: 'problematic-flow',
  name: 'Problematic Flow',
  version: '1.0.0',
  nodes: [
    {
      id: 'input-1',
      type: 'input',
      name: 'User Input',
      data: { value: 'hello' },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
    },
    {
      id: 'llm-1',
      type: 'problematic-llm',
      name: 'Problematic LLM',
      inputs: [{ id: 'input', name: 'input', type: 'input', dataType: 'string', required: true }],
      outputs: [{ id: 'output', name: 'output', type: 'output', dataType: 'object' }]
    },
    {
      id: 'output-1',
      type: 'output',
      name: 'Final Result',
      data: { format: 'text' },
      inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'any', required: true }],
      outputs: []
    }
  ],
  connections: [
    {
      id: 'conn-1',
      sourceNodeId: 'input-1',
      sourcePortId: 'output',
      targetNodeId: 'llm-1',
      targetPortId: 'input'
    },
    {
      id: 'conn-2',
      sourceNodeId: 'llm-1',
      sourcePortId: 'output',
      targetNodeId: 'output-1',
      targetPortId: 'input'
    }
  ]
};

try {
  const result1 = await runner.executeFlow(problematicFlow, {
    'User Input': 'hello'
  });
  
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('⚠️  Notice: The output contains the entire complex object!\n');
} catch (error) {
  console.error('❌ Error:', error.message, '\n');
}

// Test 2: Fixed flow (will work properly)
console.log('✅ Test 2: Fixed LLM → Output (This shows the solution)');
console.log('═'.repeat(60));

const fixedFlow = {
  id: 'fixed-flow',
  name: 'Fixed Flow', 
  version: '1.0.0',
  nodes: [
    {
      id: 'input-1',
      type: 'input',
      name: 'User Input',
      data: { value: 'hello' },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
    },
    {
      id: 'llm-1',
      type: 'fixed-llm',
      name: 'Fixed LLM',
      inputs: [{ id: 'input', name: 'input', type: 'input', dataType: 'string', required: true }],
      outputs: [{ id: 'response', name: 'response', type: 'output', dataType: 'string' }]
    },
    {
      id: 'output-1',
      type: 'output',
      name: 'Final Result',
      data: { format: 'text' },
      inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'any', required: true }],
      outputs: []
    }
  ],
  connections: [
    {
      id: 'conn-1',
      sourceNodeId: 'input-1',
      sourcePortId: 'output',
      targetNodeId: 'llm-1',
      targetPortId: 'input'
    },
    {
      id: 'conn-2',
      sourceNodeId: 'llm-1',
      sourcePortId: 'response',
      targetNodeId: 'output-1',
      targetPortId: 'input'
    }
  ]
};

try {
  const result2 = await runner.executeFlow(fixedFlow, {
    'User Input': 'hello'
  });
  
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('✅ Perfect! The output contains just the response text!\n');
} catch (error) {
  console.error('❌ Error:', error.message, '\n');
}

// Test 3: Using JSON Parser to extract from complex object
console.log('🔧 Test 3: Problematic LLM → JSON Parser → Output (Workaround)');
console.log('═'.repeat(60));

const workaroundFlow = {
  id: 'workaround-flow',
  name: 'Workaround Flow',
  version: '1.0.0',
  nodes: [
    {
      id: 'input-1',
      type: 'input',
      name: 'User Input',
      data: { value: 'hello' },
      inputs: [],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'string' }]
    },
    {
      id: 'llm-1',
      type: 'problematic-llm',
      name: 'Problematic LLM',
      inputs: [{ id: 'input', name: 'input', type: 'input', dataType: 'string', required: true }],
      outputs: [{ id: 'output', name: 'output', type: 'output', dataType: 'object' }]
    },
    {
      id: 'json-parse-1',
      type: 'json-parse',
      name: 'Extract Response',
      data: { fieldPath: '1748778916835-87arlbn16.response' },
      inputs: [{ id: 'input', name: 'json', type: 'input', dataType: 'object', required: true }],
      outputs: [{ id: 'output', name: 'Value', type: 'output', dataType: 'any' }]
    },
    {
      id: 'output-1',
      type: 'output',
      name: 'Final Result',
      data: { format: 'text' },
      inputs: [{ id: 'input', name: 'Value', type: 'input', dataType: 'any', required: true }],
      outputs: []
    }
  ],
  connections: [
    {
      id: 'conn-1',
      sourceNodeId: 'input-1',
      sourcePortId: 'output',
      targetNodeId: 'llm-1',
      targetPortId: 'input'
    },
    {
      id: 'conn-2',
      sourceNodeId: 'llm-1',
      sourcePortId: 'output',
      targetNodeId: 'json-parse-1',
      targetPortId: 'input'
    },
    {
      id: 'conn-3',
      sourceNodeId: 'json-parse-1',
      sourcePortId: 'output',
      targetNodeId: 'output-1',
      targetPortId: 'input'
    }
  ]
};

try {
  const result3 = await runner.executeFlow(workaroundFlow, {
    'User Input': 'hello'
  });
  
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('✅ Workaround works! JSON Parser extracted the response!\n');
} catch (error) {
  console.error('❌ Error:', error.message, '\n');
}

console.log('🎯 Summary:');
console.log('═'.repeat(60));
console.log('❌ Problem: Your LLM node returns a complex conversation object');
console.log('✅ Solution 1: Fix your LLM node to return just the response text');
console.log('✅ Solution 2: Use a JSON Parser node to extract the response');
console.log('✅ Solution 3: Create a custom extractor node');
console.log('\n📝 In Agent Studio, check your LLM node\'s custom code!'); 
