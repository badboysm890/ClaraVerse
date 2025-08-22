/**
 * Debug AI API Connection - IPv4 Fix
 */

console.log('🔍 Testing AI API with correct IPv4 address...\n');

async function testAPIFixed() {
  // Use 127.0.0.1 instead of localhost to force IPv4
  const apiUrl = 'http://127.0.0.1:8091/v1';
  
  console.log(`Testing API at: ${apiUrl}`);
  
  try {
    // Test the chat completions endpoint directly
    console.log('📍 Testing chat completions...');
    const chatResponse = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer s'  // API key from your workflow
      },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [
          { role: 'user', content: 'Hello! This is a test from angela Flow SDK.' }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });
    
    console.log(`✅ Status: ${chatResponse.status} ${chatResponse.statusText}`);
    
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      console.log('🎉 SUCCESS! AI API is working!');
      console.log('Response:', JSON.stringify(chatData, null, 2));
    } else {
      const errorText = await chatResponse.text();
      console.log('❌ API Error:', errorText);
    }
    
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
  }
}

testAPIFixed().catch(console.error); 
