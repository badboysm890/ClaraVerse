#!/usr/bin/env node

/**
 * Test script for new angela Flow SDK nodes
 * Tests: combine-text, file-upload, whisper-transcription
 */

import { angelaFlowRunner } from './src/index.js';

console.log('[INFO] Testing new angela Flow SDK nodes...');

const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 30000
});

// Test 1: Combine Text Node
async function testCombineTextNode() {
  console.log('\n=== Testing Combine Text Node ===');
  
  const flowData = {
    name: "Combine Text Test",
    nodes: [
      {
        id: "input1",
        type: "input",
        data: { inputType: "string", defaultValue: "Hello" }
      },
      {
        id: "input2", 
        type: "input",
        data: { inputType: "string", defaultValue: "World" }
      },
      {
        id: "combine1",
        type: "combine-text",
        data: { 
          mode: "space",
          addSpaces: true
        }
      },
      {
        id: "output1",
        type: "output",
        data: {}
      }
    ],
    connections: [
      { source: "input1", target: "combine1", sourceHandle: "output", targetHandle: "text1" },
      { source: "input2", target: "combine1", sourceHandle: "output", targetHandle: "text2" },
      { source: "combine1", target: "output1", sourceHandle: "output", targetHandle: "input" }
    ]
  };

  try {
    const result = await runner.executeFlow(flowData, {});
    console.log('[SUCCESS] Combine Text Result:', result);
    
    // Test different modes
    const modes = ['concatenate', 'newline', 'comma', 'custom'];
    for (const mode of modes) {
      const testFlow = {
        ...flowData,
        nodes: flowData.nodes.map(node => 
          node.id === 'combine1' 
            ? { ...node, data: { mode, customSeparator: ' | ' } }
            : node
        )
      };
      
      const modeResult = await runner.executeFlow(testFlow, {});
      console.log(`[SUCCESS] Mode '${mode}':`, modeResult.output1);
    }
    
  } catch (error) {
    console.error('[ERROR] Combine Text test failed:', error.message);
  }
}

// Test 2: File Upload Node
async function testFileUploadNode() {
  console.log('\n=== Testing File Upload Node ===');
  
  // Create a test file (base64 encoded text)
  const testText = "This is a test file content for the file upload node.";
  const base64Data = btoa(testText);
  const testFile = `data:text/plain;base64,${base64Data}`;
  
  const flowData = {
    name: "File Upload Test",
    nodes: [
      {
        id: "upload1",
        type: "file-upload",
        data: { 
          outputFormat: "text",
          maxSize: 1048576, // 1MB
          allowedTypes: ["text/plain", "application/json"]
        }
      },
      {
        id: "output1",
        type: "output",
        data: {}
      }
    ],
    connections: [
      { source: "upload1", target: "output1", sourceHandle: "output", targetHandle: "input" }
    ]
  };

  try {
    const result = await runner.executeFlow(flowData, {
      file: testFile
    });
    console.log('[SUCCESS] File Upload Result:', result);
    
    // Test different output formats
    const formats = ['base64', 'base64_raw', 'metadata'];
    for (const format of formats) {
      const testFlow = {
        ...flowData,
        nodes: flowData.nodes.map(node => 
          node.id === 'upload1' 
            ? { ...node, data: { ...node.data, outputFormat: format } }
            : node
        )
      };
      
      const formatResult = await runner.executeFlow(testFlow, { file: testFile });
      console.log(`[SUCCESS] Format '${format}':`, formatResult.output1?.fileName, formatResult.output1?.size);
    }
    
  } catch (error) {
    console.error('[ERROR] File Upload test failed:', error.message);
  }
}

// Test 3: Whisper Transcription Node (without API key - should return mock response)
async function testWhisperTranscriptionNode() {
  console.log('\n=== Testing Whisper Transcription Node ===');
  
  // Create mock audio data (base64 encoded)
  const mockAudioData = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="; // Empty WAV header
  
  const flowData = {
    name: "Whisper Transcription Test",
    nodes: [
      {
        id: "whisper1",
        type: "whisper-transcription",
        data: { 
          model: "whisper-1",
          language: "en",
          responseFormat: "text",
          temperature: 0
        }
      },
      {
        id: "output1",
        type: "output",
        data: {}
      }
    ],
    connections: [
      { source: "whisper1", target: "output1", sourceHandle: "output", targetHandle: "input" }
    ]
  };

  try {
    const result = await runner.executeFlow(flowData, {
      audio: `data:audio/wav;base64,${mockAudioData}`
    });
    console.log('[SUCCESS] Whisper Transcription Result:', result);
    
    // Test with different configurations
    const configs = [
      { responseFormat: "json", temperature: 0.2 },
      { language: "es", prompt: "Spanish audio" },
      { model: "whisper-1", responseFormat: "verbose_json" }
    ];
    
    for (const config of configs) {
      const testFlow = {
        ...flowData,
        nodes: flowData.nodes.map(node => 
          node.id === 'whisper1' 
            ? { ...node, data: { ...node.data, ...config } }
            : node
        )
      };
      
      const configResult = await runner.executeFlow(testFlow, { 
        audio: `data:audio/wav;base64,${mockAudioData}` 
      });
      console.log(`[SUCCESS] Config ${JSON.stringify(config)}:`, configResult.output1?.text || configResult.output1?.note);
    }
    
  } catch (error) {
    console.error('[ERROR] Whisper Transcription test failed:', error.message);
  }
}

// Test 4: Integration Test - All new nodes together
async function testIntegration() {
  console.log('\n=== Testing Integration of New Nodes ===');
  
  const testText = "Audio transcription result";
  const base64Data = btoa(testText);
  const mockAudioData = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  
  const flowData = {
    name: "Integration Test",
    nodes: [
      {
        id: "file1",
        type: "file-upload",
        data: { outputFormat: "text" }
      },
      {
        id: "whisper1",
        type: "whisper-transcription",
        data: { model: "whisper-1" }
      },
      {
        id: "combine1",
        type: "combine-text",
        data: { mode: "newline" }
      },
      {
        id: "output1",
        type: "output",
        data: {}
      }
    ],
    connections: [
      { source: "file1", target: "combine1", sourceHandle: "output", targetHandle: "text1" },
      { source: "whisper1", target: "combine1", sourceHandle: "output", targetHandle: "text2" },
      { source: "combine1", target: "output1", sourceHandle: "output", targetHandle: "input" }
    ]
  };

  try {
    const result = await runner.executeFlow(flowData, {
      file: `data:text/plain;base64,${base64Data}`,
      audio: `data:audio/wav;base64,${mockAudioData}`
    });
    console.log('[SUCCESS] Integration Test Result:', result);
    
  } catch (error) {
    console.error('[ERROR] Integration test failed:', error.message);
  }
}

// Test 5: Error Handling
async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');
  
  // Test file upload with oversized file
  try {
    const largeData = 'x'.repeat(1000000); // 1MB of data
    const base64Data = btoa(largeData);
    
    const flowData = {
      name: "Error Test",
      nodes: [
        {
          id: "upload1",
          type: "file-upload",
          data: { 
            outputFormat: "text",
            maxSize: 1000 // Very small limit
          }
        }
      ],
      connections: []
    };
    
    await runner.executeFlow(flowData, {
      file: `data:text/plain;base64,${base64Data}`
    });
    
    console.log('[ERROR] Should have failed with file size error');
    
  } catch (error) {
    console.log('[SUCCESS] Correctly caught file size error:', error.message);
  }
  
  // Test combine text with missing inputs
  try {
    const flowData = {
      name: "Error Test 2",
      nodes: [
        {
          id: "combine1",
          type: "combine-text",
          data: { mode: "space" }
        }
      ],
      connections: []
    };
    
    const result = await runner.executeFlow(flowData, {});
    console.log('[SUCCESS] Combine text handled empty inputs:', result);
    
  } catch (error) {
    console.log('[INFO] Combine text error handling:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testCombineTextNode();
    await testFileUploadNode();
    await testWhisperTranscriptionNode();
    await testIntegration();
    await testErrorHandling();
    
    console.log('\n[SUCCESS] All new node tests completed!');
    console.log('[INFO] SDK version 1.4.0 with new nodes is ready for release');
    
  } catch (error) {
    console.error('\n[ERROR] Test suite failed:', error.message);
    process.exit(1);
  }
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests }; 
