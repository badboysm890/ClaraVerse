/**
 * Test file for clipboard utility
 * This can be used to manually test clipboard functionality
 */

import { copyToClipboard, readFromClipboard, isClipboardSupported } from './clipboard';

// Test function that can be called from browser console
(window as any).testClipboard = async () => {
  console.log('🧪 Testing clipboard functionality...');
  
  // Test clipboard support detection
  console.log('Clipboard supported:', isClipboardSupported());
  
  // Test copying
  const testText = 'Hello from angela clipboard test!';
  console.log('Attempting to copy:', testText);
  
  const copySuccess = await copyToClipboard(testText);
  console.log('Copy success:', copySuccess);
  
  if (copySuccess) {
    console.log('✅ Copy test passed');
    
    // Test reading (if supported)
    try {
      const readText = await readFromClipboard();
      console.log('Read from clipboard:', readText);
      
      if (readText === testText) {
        console.log('✅ Read test passed - clipboard round-trip successful!');
      } else {
        console.log('⚠️ Read test partial - text differs:', { expected: testText, actual: readText });
      }
    } catch (error) {
      console.log('ℹ️ Read test skipped - clipboard read not available or permission denied');
    }
  } else {
    console.log('❌ Copy test failed');
  }
  
  console.log('🧪 Clipboard test complete');
};

// Test code blocks specifically
(window as any).testCodeBlockCopy = async () => {
  console.log('🧪 Testing code block copy functionality...');
  
  const codeExample = `function greetUser(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}\`;
}

// Usage
const greeting = greetUser("angela");
console.log(greeting);`;

  console.log('Attempting to copy code block:', codeExample);
  
  const success = await copyToClipboard(codeExample);
  console.log('Code block copy success:', success);
  
  if (success) {
    console.log('✅ Code block copy test passed');
    console.log('Try pasting the code somewhere to verify it copied correctly!');
  } else {
    console.log('❌ Code block copy test failed');
  }
};

console.log('📋 Clipboard test functions loaded. Use testClipboard() or testCodeBlockCopy() in console to test.'); 
