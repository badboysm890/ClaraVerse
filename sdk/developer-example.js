/**
 * angela Flow SDK v2.0 - Super Simple Developer Example
 * This shows how incredibly easy it is to use workflows with auto-input detection
 */

import { angelaFlowRunner } from './dist/index.js';

console.log('🧠 angela Flow SDK - Developer-Friendly Example\n');

// Just import your workflow JSON (from angela Studio export)
const myWorkflow = {
  "name": "Email Processor",
  "description": "Processes and validates emails with AI",
  "nodes": [
    {
      "id": "email-input",
      "type": "input",
      "name": "Email Address",
      "data": {
        "label": "Email Address",
        "type": "email",
        "description": "The email address to process"
      },
      "outputs": [{ "id": "output", "name": "Output" }]
    },
    {
      "id": "message-input", 
      "type": "input",
      "name": "Message",
      "data": {
        "label": "Message Content",
        "type": "text",
        "description": "The message content",
        "value": "Hello, this is a test message!" // Default value
      },
      "outputs": [{ "id": "output", "name": "Output" }]
    },
    {
      "id": "email-validator",
      "type": "combine-text",
      "name": "Email Validator",
      "data": { "separator": " - " },
      "inputs": [
        { "id": "text1", "name": "Email" },
        { "id": "text2", "name": "Message" }
      ],
      "outputs": [{ "id": "output", "name": "Output" }]
    },
    {
      "id": "result-output",
      "type": "output", 
      "name": "Result",
      "inputs": [{ "id": "input", "name": "Input" }]
    }
  ],
  "connections": [
    {
      "sourceNodeId": "email-input",
      "sourcePortId": "output",
      "targetNodeId": "email-validator", 
      "targetPortId": "text1"
    },
    {
      "sourceNodeId": "message-input",
      "sourcePortId": "output", 
      "targetNodeId": "email-validator",
      "targetPortId": "text2"
    },
    {
      "sourceNodeId": "email-validator",
      "sourcePortId": "output",
      "targetNodeId": "result-output",
      "targetPortId": "input"
    }
  ]
};

// Create SDK instance
const runner = new angelaFlowRunner({ enableLogging: true });

async function demonstrateSimpleUsage() {
  console.log('='.repeat(60));
  console.log('📋 STEP 1: Analyze the workflow');
  console.log('='.repeat(60));
  
  // Describe what this workflow does
  const description = runner.describe(myWorkflow);
  console.log(`📝 Name: ${description.name}`);
  console.log(`📄 Description: ${description.description}`);
  console.log(`🔧 Complexity: ${description.complexity}`);
  console.log(`🧩 Nodes: ${description.nodeCount}`);
  console.log(`🤖 Uses AI: ${description.hasAI ? 'Yes' : 'No'}`);
  console.log('');
  
  // Show required inputs
  const requiredInputs = runner.getRequiredInputs(myWorkflow);
  console.log('📥 Required Inputs:');
  requiredInputs.forEach(input => {
    console.log(`   • ${input.name} (${input.type})${input.required ? ' *required*' : ' [optional]'}`);
    console.log(`     ${input.description}`);
    if (input.defaultValue) {
      console.log(`     Default: "${input.defaultValue}"`);
    }
    console.log(`     Example: "${input.example}"`);
    console.log('');
  });

  console.log('='.repeat(60));
  console.log('🚀 STEP 2: Run the workflow');  
  console.log('='.repeat(60));

  // Method 1: Provide all inputs manually
  console.log('📍 Method 1: Manual inputs');
  try {
    const result1 = await runner.run(myWorkflow, {
      'email-input': 'john.doe@example.com',
      'message-input': 'Custom message from API'
    });
    console.log('✅ Result:', result1);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Method 2: Let SDK handle missing inputs with defaults
  console.log('📍 Method 2: Use defaults for optional inputs');
  try {
    const result2 = await runner.run(myWorkflow, {
      'email-input': 'jane.smith@company.com'
      // message-input will use its default value
    });
    console.log('✅ Result:', result2);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');

  // Method 3: Show what happens with missing required inputs
  console.log('📍 Method 3: Missing required inputs (will show error)');
  try {
    const result3 = await runner.run(myWorkflow, {
      // Missing email-input which is required
      'message-input': 'Only message provided'
    });
    console.log('✅ Result:', result3);
  } catch (error) {
    console.log('❌ Expected Error:', error.message);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('💡 SUMMARY FOR DEVELOPERS');
  console.log('='.repeat(60));
  console.log('🎯 THREE SUPER SIMPLE STEPS:');
  console.log('');
  console.log('1️⃣  Import your workflow JSON (from angela Studio)');
  console.log('2️⃣  Create runner: const runner = new angelaFlowRunner()');
  console.log('3️⃣  Run it: await runner.run(workflow, inputs)');
  console.log('');
  console.log('✨ The SDK automatically:');
  console.log('   • Detects what inputs you need');
  console.log('   • Shows helpful error messages');
  console.log('   • Uses default values when available');
  console.log('   • Handles all node types (including custom ones)');
  console.log('   • Provides detailed execution logs');
  console.log('');
  console.log('🔥 For production APIs, just wrap this in Express.js!');
}

// Run the demonstration
demonstrateSimpleUsage().catch(console.error); 
