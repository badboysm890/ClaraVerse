#!/usr/bin/env node

/**
 * angela Flow SDK - Node.js Example
 * 
 * This example demonstrates how to load and execute a angela flow
 * in a Node.js environment using the SDK.
 */

const { angelaFlowRunner } = require('../dist/angela-flow-sdk.cjs.js');
const fs = require('fs');
const path = require('path');

async function runExample() {
  console.log('🚀 angela Flow SDK - Node.js Example\n');

  try {
    // Initialize the flow runner with logging enabled
    const runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'info',
      timeout: 30000
    });

    console.log('✅ Flow runner initialized');

    // Load a sample flow (you can replace this with your exported flow)
    const sampleFlow = {
      version: '1.0.0',
      name: 'Text Processing Flow',
      description: 'A simple flow that processes text input',
      exportFormat: 'angela-sdk',
      nodes: [
        {
          id: 'input-1',
          type: 'input',
          name: 'Text Input',
          data: {
            inputType: 'string',
            defaultValue: 'Hello, angela SDK!'
          },
          position: { x: 100, y: 100 }
        },
        {
          id: 'custom-1',
          type: 'text-processor',
          name: 'Text Processor',
          data: {
            operation: 'uppercase'
          },
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
          type: 'text-processor',
          name: 'Text Processor',
          description: 'Processes text with various operations',
          inputs: [
            { name: 'input', type: 'string', required: true }
          ],
          outputs: [
            { name: 'output', type: 'string' }
          ],
          properties: [
            { name: 'operation', type: 'string', defaultValue: 'uppercase' }
          ],
          executionCode: `
            async function execute(inputs, properties, context) {
              const inputText = inputs.input || '';
              const operation = properties.operation || 'uppercase';
              
              context.log('Processing text:', inputText);
              context.log('Operation:', operation);
              
              let result;
              switch (operation.toLowerCase()) {
                case 'uppercase':
                  result = inputText.toUpperCase();
                  break;
                case 'lowercase':
                  result = inputText.toLowerCase();
                  break;
                case 'reverse':
                  result = inputText.split('').reverse().join('');
                  break;
                case 'length':
                  result = inputText.length.toString();
                  break;
                default:
                  result = inputText;
              }
              
              context.log('Result:', result);
              return { output: result };
            }
          `
        }
      ]
    };

    console.log('📄 Sample flow loaded');

    // Execute the flow with input data
    const inputs = {
      'Text Input': 'Hello, angela Flow SDK!'
    };

    console.log('🔧 Executing flow with inputs:', inputs);
    
    const result = await runner.executeFlow(sampleFlow, inputs);

    console.log('\n✅ Flow execution completed!');
    console.log('📊 Results:', JSON.stringify(result.results, null, 2));
    console.log('⏱️  Execution time:', result.executionTimeMs, 'ms');
    
    // Get execution logs
    const logs = runner.getLogs();
    console.log('\n📝 Execution logs:');
    logs.forEach(log => {
      console.log(`[${log.level.toUpperCase()}] ${log.message}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Example 2: Loading a flow from file
async function loadFlowFromFile(filePath) {
  console.log('\n📁 Loading flow from file example');
  
  try {
    const flowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const runner = new angelaFlowRunner({
      enableLogging: true
    });

    const result = await runner.executeFlow(flowData, {
      // Add your input data here
    });

    console.log('Flow execution result:', result);
    
  } catch (error) {
    console.error('Error loading flow from file:', error.message);
  }
}

// Example 3: Batch processing multiple flows
async function batchProcessing() {
  console.log('\n🔄 Batch processing example');
  
  const runner = new angelaFlowRunner({
    enableLogging: false, // Disable logging for batch processing
    timeout: 10000
  });

  const flows = [
    // Add your flow definitions here
  ];

  const results = [];
  
  for (let i = 0; i < flows.length; i++) {
    try {
      console.log(`Processing flow ${i + 1}/${flows.length}`);
      const result = await runner.executeFlow(flows[i]);
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  console.log('Batch processing completed:', results);
}

// Example 4: Custom node validation
async function validateCustomNodes() {
  console.log('\n🔍 Custom node validation example');
  
  const runner = new angelaFlowRunner();
  
  // Validate a flow before execution
  const validation = runner.validateFlow(sampleFlow);
  
  if (validation.isValid) {
    console.log('✅ Flow validation passed');
    console.log('📈 Validation summary:', validation.summary);
  } else {
    console.log('❌ Flow validation failed');
    console.log('Errors:', validation.errors);
    console.log('Warnings:', validation.warnings);
  }
}

// Run the main example
if (require.main === module) {
  runExample().catch(console.error);
  
  // Uncomment to run other examples:
  // loadFlowFromFile('./path/to/your/flow.json');
  // batchProcessing();
  // validateCustomNodes();
} 
