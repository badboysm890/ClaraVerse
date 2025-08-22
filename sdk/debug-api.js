/**
 * Debug AI API Connection
 */

console.log('🔍 Debugging AI API Connection...\n');

async function debugAPI() {
  const apiUrl = 'http://localhost:8091/v1';
  
  console.log(`Testing API at: ${apiUrl}`);
  
  try {
    // Test 1: Check if the server is responding
    console.log('\n📍 Test 1: Basic connectivity');
    const response = await fetch(`${apiUrl}/models`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.text();
      console.log('Response:', data.substring(0, 200) + (data.length > 200 ? '...' : ''));
    }
    
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    console.log('Error type:', error.constructor.name);
    
    if (error.cause) {
      console.log('Cause:', error.cause);
    }
  }
  
  try {
    // Test 2: Try chat completions endpoint  
    console.log('\n📍 Test 2: Chat completions endpoint');
    const chatResponse = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer s'  // API key from your workflow
      },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [
          { role: 'user', content: 'Hello, this is a test!' }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });
    
    console.log(`Chat API Status: ${chatResponse.status} ${chatResponse.statusText}`);
    
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      console.log('Chat Response:', JSON.stringify(chatData, null, 2));
    } else {
      const errorText = await chatResponse.text();
      console.log('Chat Error Response:', errorText);
    }
    
  } catch (error) {
    console.log('❌ Chat API failed:', error.message);
    console.log('Error details:', error);
  }
  
  // Test 3: Check if it's a Node.js fetch issue
  console.log('\n📍 Test 3: Node.js environment check');
  console.log('Node.js version:', process.version);
  console.log('Fetch available:', typeof fetch !== 'undefined');
  
  if (typeof fetch === 'undefined') {
    console.log('⚠️  fetch is not available in this Node.js version');
    console.log('Try: npm install node-fetch or upgrade to Node.js 18+');
  }
}

debugAPI().catch(console.error); 
