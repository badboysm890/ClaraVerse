/**
 * angela Flow SDK v2.0 - Simple Developer Test
 * Shows the EASIEST way to use workflows
 */

import { angelaFlowRunner } from './dist/index.js';

console.log('🚀 angela Flow SDK v2.0 - Developer Test\n');

// Simple workflow JSON (exported from angela Studio)
const workflow = {
  "name": "Text Processor",
  "nodes": [
    {
      "id": "user-input",
      "type": "input",
      "name": "User Input",
      "data": { "label": "Enter your text" },
      "outputs": [{ "id": "output" }]
    },
    {
      "id": "prefix-input",
      "type": "input", 
      "name": "Prefix",
      "data": { 
        "label": "Prefix text",
        "value": "[PROCESSED]" // Has default value
      },
      "outputs": [{ "id": "output" }]
    },
    {
      "id": "combiner",
      "type": "combine-text",
      "name": "Text Combiner",
      "data": { "separator": " " },
      "inputs": [
        { "id": "text1", "name": "Prefix" },
        { "id": "text2", "name": "Text" }
      ],
      "outputs": [{ "id": "output" }]
    },
    {
      "id": "result",
      "type": "output",
      "name": "Result", 
      "inputs": [{ "id": "input" }]
    }
  ],
  "connections": [
    { "sourceNodeId": "prefix-input", "sourcePortId": "output", "targetNodeId": "combiner", "targetPortId": "text1" },
    { "sourceNodeId": "user-input", "sourcePortId": "output", "targetNodeId": "combiner", "targetPortId": "text2" },
    { "sourceNodeId": "combiner", "sourcePortId": "output", "targetNodeId": "result", "targetPortId": "input" }
  ]
};

async function testDeveloperExperience() {
  const runner = new angelaFlowRunner({ enableLogging: true });

  console.log('📋 STEP 1: Analyze what this workflow needs');
  console.log('=' .repeat(50));
  
  // Show workflow info
  const info = runner.describe(workflow);
  console.log(`Name: ${info.name}`);
  console.log(`Complexity: ${info.complexity}`);
  console.log(`Node Count: ${info.nodeCount}`);
  console.log();

  // Show required inputs  
  const inputs = runner.getRequiredInputs(workflow);
  console.log('Required Inputs:');
  inputs.forEach(input => {
    const status = input.required ? '🔴 REQUIRED' : '🟢 OPTIONAL';
    console.log(`  ${status} ${input.name} (${input.type})`);
    if (input.defaultValue) {
      console.log(`    ↳ Default: "${input.defaultValue}"`);
    }
  });
  console.log();

  console.log('🚀 STEP 2: Run the workflow');
  console.log('=' .repeat(50));

  try {
    // Method 1: Provide required inputs
    console.log('📍 Test 1: Provide required inputs');
    const result1 = await runner.run(workflow, {
      'user-input': 'Hello World!'
      // prefix-input will use default value "[PROCESSED]"
    });
    console.log('✅ Result:', result1);
    console.log();

    // Method 2: Provide all inputs
    console.log('📍 Test 2: Override all inputs');  
    const result2 = await runner.run(workflow, {
      'user-input': 'Custom message',
      'prefix-input': '[CUSTOM]'
    });
    console.log('✅ Result:', result2);
    console.log();

    // Method 3: Show error for missing inputs
    console.log('📍 Test 3: Missing required input (will show error)');
    try {
      const result3 = await runner.run(workflow, {
        'prefix-input': '[ONLY PREFIX]'
        // Missing user-input which is required
      });
    } catch (error) {
      console.log('❌ Expected Error:', error.message.split('\n')[0]);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log();
  console.log('=' .repeat(50));
  console.log('💡 SUMMARY: Super Easy for Developers!');
  console.log('=' .repeat(50));
  console.log('✨ Just 3 lines of code:');
  console.log('   const runner = new angelaFlowRunner();');
  console.log('   const inputs = runner.getRequiredInputs(workflow);');
  console.log('   const result = await runner.run(workflow, myInputs);');
  console.log();
  console.log('🎯 The SDK handles everything automatically!');
}

testDeveloperExperience().catch(console.error); 
