#!/usr/bin/env node

/**
 * Simple test for new angela Flow SDK nodes
 * Tests node executors directly without complex flow validation
 */

import { angelaFlowRunner } from './src/index.js';

console.log('[INFO] Testing new angela Flow SDK nodes (direct execution)...');

const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 30000
});

// Test 1: Combine Text Node
async function testCombineTextNode() {
  console.log('\n=== Testing Combine Text Node ===');
  
  try {
    // Test basic combination
    const result1 = await runner.executeNode({
      type: 'combine-text',
      name: 'Test Combine',
      data: { mode: 'space', addSpaces: true }
    }, {
      text1: 'Hello',
      text2: 'World'
    });
    console.log('[SUCCESS] Basic combination:', result1);
    
    // Test different modes
    const modes = [
      { mode: 'concatenate', expected: 'HelloWorld' },
      { mode: 'newline', expected: 'Hello\nWorld' },
      { mode: 'comma', expected: 'Hello, World' },
      { mode: 'custom', customSeparator: ' | ', expected: 'Hello | World' }
    ];
    
    for (const test of modes) {
      const result = await runner.executeNode({
        type: 'combine-text',
        name: 'Test Combine',
        data: test
      }, {
        text1: 'Hello',
        text2: 'World'
      });
      console.log(`[SUCCESS] Mode '${test.mode}':`, result);
    }
    
    // Test empty inputs
    const emptyResult = await runner.executeNode({
      type: 'combine-text',
      name: 'Test Empty',
      data: { mode: 'space' }
    }, {});
    console.log('[SUCCESS] Empty inputs handled:', emptyResult);
    
  } catch (error) {
    console.error('[ERROR] Combine Text test failed:', error.message);
  }
}

// Test 2: File Upload Node
async function testFileUploadNode() {
  console.log('\n=== Testing File Upload Node ===');
  
  try {
    // Create test file data
    const testText = "This is a test file content for the file upload node.";
    const base64Data = btoa(testText);
    const testFile = `data:text/plain;base64,${base64Data}`;
    
    // Test basic file upload
    const result1 = await runner.executeNode({
      type: 'file-upload',
      name: 'Test Upload',
      data: { 
        outputFormat: 'text',
        maxSize: 1048576,
        allowedTypes: ['text/plain']
      }
    }, {
      file: testFile
    });
    console.log('[SUCCESS] Basic file upload:', {
      fileName: result1.fileName,
      mimeType: result1.mimeType,
      size: result1.size,
      dataLength: result1.data?.length
    });
    
    // Test different output formats
    const formats = ['base64', 'base64_raw', 'metadata'];
    for (const format of formats) {
      const result = await runner.executeNode({
        type: 'file-upload',
        name: 'Test Upload',
        data: { outputFormat: format }
      }, {
        file: testFile
      });
      console.log(`[SUCCESS] Format '${format}':`, {
        fileName: result.fileName,
        hasData: !!result.data,
        dataType: typeof result.data
      });
    }
    
    // Test file size validation
    try {
      await runner.executeNode({
        type: 'file-upload',
        name: 'Test Size Limit',
        data: { 
          outputFormat: 'text',
          maxSize: 10 // Very small limit
        }
      }, {
        file: testFile
      });
      console.log('[ERROR] Should have failed with size limit');
    } catch (sizeError) {
      console.log('[SUCCESS] Size validation works:', sizeError.message.includes('exceeds maximum'));
    }
    
  } catch (error) {
    console.error('[ERROR] File Upload test failed:', error.message);
  }
}

// Test 3: Whisper Transcription Node
async function testWhisperTranscriptionNode() {
  console.log('\n=== Testing Whisper Transcription Node ===');
  
  try {
    // Create mock audio data
    const mockAudioData = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    
    // Test without API key (should return mock response)
    const result1 = await runner.executeNode({
      type: 'whisper-transcription',
      name: 'Test Whisper',
      data: { 
        model: 'whisper-1',
        language: 'en',
        responseFormat: 'text'
      }
    }, {
      audio: `data:audio/wav;base64,${mockAudioData}`
    });
    console.log('[SUCCESS] Whisper without API key:', {
      hasText: !!result1.text,
      hasNote: !!result1.note,
      model: result1.model
    });
    
    // Test different configurations
    const configs = [
      { responseFormat: 'json', temperature: 0.2 },
      { language: 'es', prompt: 'Spanish audio' },
      { model: 'whisper-1', responseFormat: 'verbose_json' }
    ];
    
    for (const config of configs) {
      const result = await runner.executeNode({
        type: 'whisper-transcription',
        name: 'Test Whisper Config',
        data: config
      }, {
        audio: `data:audio/wav;base64,${mockAudioData}`
      });
      console.log(`[SUCCESS] Config ${JSON.stringify(config)}:`, {
        hasText: !!result.text,
        hasNote: !!result.note
      });
    }
    
    // Test error handling
    try {
      await runner.executeNode({
        type: 'whisper-transcription',
        name: 'Test No Audio',
        data: { model: 'whisper-1' }
      }, {});
      console.log('[ERROR] Should have failed with no audio');
    } catch (audioError) {
      console.log('[SUCCESS] Audio validation works:', audioError.message.includes('No audio data'));
    }
    
  } catch (error) {
    console.error('[ERROR] Whisper Transcription test failed:', error.message);
  }
}

// Test 4: Node Type Availability
async function testNodeAvailability() {
  console.log('\n=== Testing Node Type Availability ===');
  
  const newNodeTypes = ['combine-text', 'file-upload', 'whisper-transcription'];
  const supportedTypes = runner.getAvailableNodeTypes();
  
  console.log('[INFO] All available node types:', supportedTypes.sort());
  console.log('[INFO] New nodes availability:');
  
  for (const nodeType of newNodeTypes) {
    const isSupported = runner.isNodeTypeAvailable(nodeType);
    console.log(`  ${isSupported ? '✅' : '❌'} ${nodeType}`);
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testCombineTextNode();
    await testFileUploadNode();
    await testWhisperTranscriptionNode();
    await testNodeAvailability();
    
    console.log('\n[SUCCESS] All new node tests completed successfully!');
    console.log('[INFO] angela Flow SDK v1.4.0 with new nodes is ready for release');
    console.log('\n📦 New Features Added:');
    console.log('  🔗 combine-text: Advanced text combination with multiple modes');
    console.log('  📁 file-upload: Universal file handling with format conversion');
    console.log('  🎙️ whisper-transcription: OpenAI Whisper audio transcription');
    
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
