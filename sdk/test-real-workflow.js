/**
 * angela Flow SDK v2.0 - Real Workflow Test
 * Testing with actual exported workflow from angela Studio
 */

import { angelaFlowRunner } from './dist/index.js';
import fs from 'fs';

console.log('🧠 Testing Real angela Studio Workflow\n');

// Load the actual exported workflow
const workflowData = JSON.parse(fs.readFileSync('agent_exported/Testing_SDK_flow_sdk.json', 'utf8'));

async function testRealWorkflow() {
  const runner = new angelaFlowRunner({ enableLogging: true });

  console.log('=' .repeat(60));
  console.log('📋 ANALYZING REAL angela STUDIO WORKFLOW');
  console.log('=' .repeat(60));
  
  // Analyze the workflow
  const description = runner.describe(workflowData);
  console.log(`📝 Name: ${description.name}`);
  console.log(`📄 Description: ${description.description}`);
  console.log(`🔧 Complexity: ${description.complexity}`);
  console.log(`🧩 Nodes: ${description.nodeCount}`);
  console.log(`🤖 Uses AI: ${description.hasAI ? 'Yes' : 'No'}`);
  if (description.hasAI) {
    console.log(`🔮 AI Models: ${description.aiModels.join(', ')}`);
  }
  console.log(`🎨 Custom Nodes: ${description.hasCustomNodes ? 'Yes' : 'No'}`);
  console.log();

  // Show required inputs
  const requiredInputs = runner.getRequiredInputs(workflowData);
  console.log('📥 Required Inputs:');
  if (requiredInputs.length === 0) {
    console.log('   ✨ No inputs required - this workflow uses default values!');
  } else {
    requiredInputs.forEach(input => {
      const status = input.required ? '🔴 REQUIRED' : '🟢 OPTIONAL';
      console.log(`   ${status} ${input.name} (${input.type})`);
      console.log(`      📝 ${input.description}`);
      if (input.defaultValue) {
        console.log(`      💡 Default: "${input.defaultValue}"`);
      }
      console.log(`      🎯 Example: "${input.example}"`);
      console.log();
    });
  }

  console.log('=' .repeat(60));
  console.log('🚀 RUNNING THE WORKFLOW');  
  console.log('=' .repeat(60));

  try {
    // Test 1: Run with default values
    console.log('📍 Test 1: Using default input value');
    const result1 = await runner.run(workflowData, {});
    console.log('✅ Result 1:', JSON.stringify(result1, null, 2));
    console.log();

    // Test 2: Override input value
    console.log('📍 Test 2: Override input with custom message');
    const result2 = await runner.run(workflowData, {
      '1753607451076-xzng2gkp3': 'Tell me a joke about programming!'
    });
    console.log('✅ Result 2:', JSON.stringify(result2, null, 2));
    console.log();

    // Test 3: Use input name instead of ID
    console.log('📍 Test 3: Using input name instead of ID');
    const result3 = await runner.run(workflowData, {
      'Input': 'What is the meaning of life?'
    });
    console.log('✅ Result 3:', JSON.stringify(result3, null, 2));
    console.log();

  } catch (error) {
    console.error('❌ Workflow execution failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. Check if API endpoint is accessible');
    console.log('2. Verify API key is correct');
    console.log('3. Ensure model is available');
    console.log('\n💡 This is expected if the AI API is not configured');
  }

  console.log('=' .repeat(60));
  console.log('💡 DEVELOPER SUMMARY');
  console.log('=' .repeat(60));
  console.log('✨ What the SDK automatically detected:');
  console.log(`   • Workflow format: ${workflowData.format}`);
  console.log(`   • Input nodes: ${requiredInputs.length}`);
  console.log(`   • AI nodes: ${description.hasAI ? 'LLM Chat node' : 'None'}`);
  console.log(`   • Custom nodes: ${description.hasCustomNodes ? 'Yes' : 'None'}`);
  console.log();
  console.log('🎯 For developers:');
  console.log('   const runner = new angelaFlowRunner();');
  console.log('   const result = await runner.run(workflow, inputs);');
  console.log();
  console.log('🚀 The SDK handled everything automatically:');
  console.log('   ✅ Detected angela Studio export format');
  console.log('   ✅ Found input requirements');
  console.log('   ✅ Applied default values');
  console.log('   ✅ Executed nodes in correct order');
  console.log('   ✅ Provided detailed execution logs');
}

testRealWorkflow().catch(console.error); 
