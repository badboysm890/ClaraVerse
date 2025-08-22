#!/usr/bin/env python3
"""
Test script to diagnose Ollama connectivity and performance issues.
Run this to check if Ollama is working properly before using with LightRAG.
"""

import asyncio
import time
import httpx
from openai import AsyncOpenAI

async def test_ollama_connection():
    """Test basic connection to Ollama"""
    print("🔍 Testing Ollama connection...")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("http://localhost:11434/api/tags")
            if response.status_code == 200:
                models = response.json()
                print(f"✅ Ollama is running with {len(models.get('models', []))} models")
                for model in models.get('models', []):
                    print(f"   - {model['name']}")
                return True
            else:
                print(f"❌ Ollama returned status {response.status_code}")
                return False
    except Exception as e:
        print(f"❌ Could not connect to Ollama: {e}")
        return False

async def test_simple_completion():
    """Test a simple completion request"""
    print("\n🔍 Testing simple completion...")
    
    try:
        client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            timeout=60.0
        )
        
        start_time = time.time()
        response = await client.chat.completions.create(
            model="llama3.2:latest",  # Change this to your model
            messages=[{"role": "user", "content": "Hello! Respond with just 'Hi there!' and nothing else."}],
            max_tokens=10,
            temperature=0.1
        )
        
        duration = time.time() - start_time
        result = response.choices[0].message.content
        print(f"✅ Simple completion successful ({duration:.1f}s): {result}")
        await client.close()
        return True
        
    except Exception as e:
        print(f"❌ Simple completion failed: {e}")
        return False

async def test_entity_extraction():
    """Test entity extraction (the most demanding operation)"""
    print("\n🔍 Testing entity extraction simulation...")
    
    try:
        client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            timeout=300.0  # 5 minutes for this test
        )
        
        # Simulate the kind of prompt LightRAG uses for entity extraction
        test_text = """
        John Smith works at Microsoft as a software engineer. 
        He lives in Seattle, Washington and has been developing AI applications.
        Microsoft is a technology company founded by Bill Gates and Paul Allen.
        """
        
        entity_prompt = f"""
        Extract all named entities from the following text. 
        Return them as a simple list of entities with their types.
        Text: {test_text}
        
        Entities:
        """
        
        start_time = time.time()
        response = await client.chat.completions.create(
            model="llama3.2:latest",  # Change this to your model
            messages=[{"role": "user", "content": entity_prompt}],
            max_tokens=200,
            temperature=0.1
        )
        
        duration = time.time() - start_time
        result = response.choices[0].message.content
        print(f"✅ Entity extraction test successful ({duration:.1f}s)")
        print(f"   Response: {result[:100]}{'...' if len(result) > 100 else ''}")
        
        # Warn if it's taking too long
        if duration > 30:
            print(f"⚠️  Warning: Entity extraction took {duration:.1f}s - this may cause timeouts with large documents")
        
        await client.close()
        return True
        
    except Exception as e:
        print(f"❌ Entity extraction test failed: {e}")
        return False

async def test_embedding_model():
    """Test embedding model if available"""
    print("\n🔍 Testing embedding model...")
    
    try:
        client = AsyncOpenAI(
            base_url="http://localhost:11434/v1", 
            api_key="ollama",
            timeout=60.0
        )
        
        start_time = time.time()
        response = await client.embeddings.create(
            model="mxbai-embed-large:latest",  # Change this to your embedding model
            input=["This is a test sentence for embedding."]
        )
        
        duration = time.time() - start_time
        embedding = response.data[0].embedding
        print(f"✅ Embedding test successful ({duration:.1f}s): {len(embedding)} dimensions")
        await client.close()
        return True
        
    except Exception as e:
        print(f"❌ Embedding test failed: {e}")
        print("   Note: Make sure you have an embedding model installed (e.g., 'ollama pull mxbai-embed-large')")
        return False

async def main():
    """Run all tests"""
    print("🚀 Ollama Diagnostic Test\n")
    
    results = []
    results.append(await test_ollama_connection())
    
    if results[0]:  # Only continue if basic connection works
        results.append(await test_simple_completion())
        results.append(await test_entity_extraction())
        results.append(await test_embedding_model())
    
    print(f"\n📊 Test Results: {sum(results)}/{len(results)} passed")
    
    if not all(results):
        print("\n🔧 Troubleshooting Tips:")
        print("1. Make sure Ollama is running: 'ollama serve'")
        print("2. Make sure you have models installed: 'ollama pull llama3.2'")
        print("3. For embeddings: 'ollama pull mxbai-embed-large'")
        print("4. Check if another service is using port 11434")
        print("5. Try restarting Ollama")
    else:
        print("\n✅ All tests passed! Ollama should work with LightRAG.")

if __name__ == "__main__":
    asyncio.run(main()) 
