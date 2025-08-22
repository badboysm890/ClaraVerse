#!/usr/bin/env node

/**
 * Test angela Flow SDK with Example JSON
 * 
 * This script tests the SDK using the provided example JSON file.
 */

import { angelaFlowRunner } from './dist/index.esm.js';
import fs from 'fs';
import path from 'path';

async function testWithExampleJSON() {
  console.log('🚀 Testing angela Flow SDK with Example JSON\n');

  try {
    // Initialize the flow runner with logging enabled
    const runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'info',
      timeout: 30000
    });

    console.log('✅ Flow runner initialized');

    // Load the example JSON flow
    const exampleFlowPath = './examples/Testing_flow_sdk.json';
    console.log(`📄 Loading flow from: ${exampleFlowPath}`);
    
    const rawFlowData = JSON.parse(fs.readFileSync(exampleFlowPath, 'utf8'));
    
    // Extract the flow data from the wrapper and adjust format
    const flowData = {
      ...rawFlowData.flow,  // Extract the flow object
      version: '1.0.0',  // Use supported version
      // Keep connections if they exist
      connections: rawFlowData.flow.connections || [],
      // Keep custom nodes if they exist
      customNodes: rawFlowData.customNodes || []
    };
    
    console.log(`✅ Flow loaded: ${flowData.name}`);
    console.log(`📊 Flow contains ${flowData.nodes.length} nodes`);

    // Display flow information
    console.log('\n📋 Flow Details:');
    console.log(`  Name: ${flowData.name}`);
    console.log(`  Description: ${flowData.description}`);
    console.log(`  Version: ${flowData.version}`);

    // Show nodes in the flow
    console.log('\n🔧 Nodes in flow:');
    flowData.nodes.forEach((node, index) => {
      console.log(`  ${index + 1}. ${node.name} (${node.type}) - ID: ${node.id}`);
    });

    // Show connections if they exist
    if (rawFlowData.flow.connections && rawFlowData.flow.connections.length > 0) {
      console.log('\n🔗 Connections:');
      rawFlowData.flow.connections.forEach((conn, index) => {
        console.log(`  ${index + 1}. ${conn.sourceNodeId} -> ${conn.targetNodeId}`);
      });
    }

    // Prepare input data based on the flow's input nodes
    const inputNodes = flowData.nodes.filter(node => node.type === 'input');
    const inputs = {};
    
    console.log('\n📥 Available inputs:');
    inputNodes.forEach((node, index) => {
      const inputValue = node.data?.value || `Input ${index + 1}`;
      inputs[node.name] = inputValue;
      console.log(`  ${node.name} (${node.id}): "${inputValue}"`);
    });

    console.log('\n🔧 Executing flow with inputs:', inputs);
    
    // Execute the flow
    const startTime = Date.now();
    const result = await runner.executeFlow(flowData, inputs);
    const endTime = Date.now();

    console.log('\n✅ Flow execution completed!');
    console.log('📊 Results:', JSON.stringify(result.results || result, null, 2));
    console.log('⏱️  Execution time:', endTime - startTime, 'ms');
    
    // Get execution logs
    const logs = runner.getLogs();
    if (logs && logs.length > 0) {
      console.log('\n📝 Execution logs:');
      logs.forEach(log => {
        console.log(`[${log.level.toUpperCase()}] ${log.message}`);
      });
    }

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Error during execution:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Additional validation function
async function validateFlowStructure() {
  console.log('🔍 Validating flow structure...');
  
  try {
    const exampleFlowPath = './examples/Testing_flow_sdk.json';
    const rawFlowData = JSON.parse(fs.readFileSync(exampleFlowPath, 'utf8'));
    
    // Basic structure validation
    const requiredFields = ['format', 'version', 'flow'];
    const flowRequiredFields = ['id', 'name', 'nodes'];
    
    console.log('✅ Checking required top-level fields...');
    requiredFields.forEach(field => {
      if (!rawFlowData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
      console.log(`  ✓ ${field}: ${typeof rawFlowData[field] === 'object' ? 'object' : rawFlowData[field]}`);
    });
    
    console.log('✅ Checking required flow fields...');
    flowRequiredFields.forEach(field => {
      if (!rawFlowData.flow[field]) {
        throw new Error(`Missing required flow field: ${field}`);
      }
      console.log(`  ✓ flow.${field}: ${typeof rawFlowData.flow[field] === 'object' ? `${rawFlowData.flow[field].length} items` : rawFlowData.flow[field]}`);
    });
    
    // Node validation
    console.log('✅ Validating nodes...');
    rawFlowData.flow.nodes.forEach((node, index) => {
      if (!node.id || !node.type || !node.name) {
        throw new Error(`Node ${index} missing required fields (id, type, name)`);
      }
      console.log(`  ✓ Node ${index + 1}: ${node.name} (${node.type})`);
    });
    
    console.log('🎯 Flow structure validation passed!\n');
    
  } catch (error) {
    console.error('❌ Flow validation failed:', error.message);
    throw error;
  }
}

// Run the tests
async function main() {
  try {
    await validateFlowStructure();
    await testWithExampleJSON();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main(); 
