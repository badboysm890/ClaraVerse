import { angelaFlowRunner } from './dist/index.esm.js';

// Test flow data (using the format from the original error)
const testFlowData = {
  format: "angela-sdk",
  version: "1.0.0",
  flow: {
    id: "test-flow",
    name: "Personal AI",
    description: "Test flow",
    nodes: [
      {
        id: "input-1",
        type: "input",
        name: "Input",
        position: { x: 100, y: 100 },
        data: {
          value: "You are angela and you are the girl friend of the user and always act like one",
          inputType: "text"
        },
        inputs: [],
        outputs: [
          {
            id: "output",
            name: "Output",
            type: "output",
            dataType: "string"
          }
        ]
      },
      {
        id: "llm-1", 
        type: "llm",
        name: "LLM",
        position: { x: 300, y: 100 },
        data: {
          apiKey: "test-key",
          model: "gpt-3.5-turbo",
          temperature: 0.7
        },
        inputs: [
          {
            id: "system",
            name: "System",
            type: "input",
            dataType: "string"
          },
          {
            id: "user",
            name: "User",
            type: "input", 
            dataType: "string"
          }
        ],
        outputs: [
          {
            id: "response",
            name: "Response",
            type: "output",
            dataType: "string"
          }
        ]
      },
      {
        id: "output-1",
        type: "output",
        name: "Output",
        position: { x: 500, y: 100 },
        data: {},
        inputs: [
          {
            id: "input",
            name: "Input",
            type: "input",
            dataType: "string"
          }
        ],
        outputs: []
      }
    ],
    connections: [
      {
        id: "conn-1",
        sourceNodeId: "input-1",
        sourcePortId: "output",
        targetNodeId: "llm-1", 
        targetPortId: "system"
      },
      {
        id: "conn-2",
        sourceNodeId: "llm-1",
        sourcePortId: "response",
        targetNodeId: "output-1",
        targetPortId: "input"
      }
    ]
  }
};

async function testSDK() {
  console.log('[INFO] Testing angela Flow SDK...');
  
  try {
    // Create SDK instance
    const runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'info'
    });
    
    console.log('[INFO] SDK instance created successfully');
    
    // Test validation
    const validation = runner.validateFlow(testFlowData);
    console.log('[INFO] Flow validation:', validation);
    
    if (!validation.isValid) {
      console.log('[ERROR] Flow validation failed:', validation.errors);
      return;
    }
    
    // Test execution (this will fail due to invalid API key, but should get past the "unknown node type" error)
    console.log('[INFO] Starting flow execution...');
    
    try {
      const result = await runner.executeFlow(testFlowData, {
        user: "Hello angela!"
      });
      
      console.log('[SUCCESS] Flow executed successfully:', result);
    } catch (error) {
      // We expect this to fail due to invalid API key, but it should NOT be "Unknown node type: llm"
      console.log('[INFO] Flow execution failed (expected due to test API key):', error.message);
      
      if (error.message.includes('Unknown node type')) {
        console.log('[ERROR] SDK is missing node type definitions - this is the bug we fixed!');
        process.exit(1);
      } else {
        console.log('[SUCCESS] SDK recognizes all node types correctly!');
      }
    }
    
    console.log('[SUCCESS] SDK test completed successfully!');
    
  } catch (error) {
    console.log('[ERROR] SDK test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testSDK().catch(error => {
  console.error('[ERROR] Test failed:', error);
  process.exit(1);
}); 
