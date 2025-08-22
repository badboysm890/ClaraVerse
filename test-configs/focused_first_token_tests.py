#!/usr/bin/env python3
"""
Focused First Token Performance Tests

This script runs more targeted tests specifically to optimize first token latency
while maintaining good overall performance.
"""

import subprocess
import json
import csv
import time
import os
import requests
import psutil
from datetime import datetime
import itertools

# Test configurations focused on first token performance
THREAD_COUNTS = [4, 6, 8, 10, 12]  # More granular thread testing
CTX_SIZES = [1024, 2048, 4096]     # Smaller contexts for faster first token
PARALLEL_VALUES = [1, 2, 4, 8]     # Test different parallel values
BATCH_SIZES = [128, 256, 512, 1024] # Test batch size impact
UBATCH_SIZES = [32, 64, 128, 256]   # More granular ubatch testing
GPU_LAYERS = [0, 10, 20]           # Test GPU layer impact

# Test prompt optimized for quick response measurement
TEST_PROMPT = "Hi"  # Very short prompt for consistent first token testing

# Server configuration
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8081
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"

# Results file
RESULTS_FILE = "focused_first_token_results.csv"

def kill_llama_processes():
    """Kill any existing llama-server processes"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if 'llama-server' in proc.info['name'] or any('llama-server' in str(cmd) for cmd in proc.info['cmdline'] or []):
                print(f"🔄 Killing existing llama-server process (PID: {proc.info['pid']})")
                proc.kill()
                proc.wait(timeout=5)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
            pass
    time.sleep(2)

def start_llama_server(config):
    """Start llama-server with specific configuration"""
    kill_llama_processes()
    
    # Use the same model path as the main tests
    model_path = "/Users/badfy17g/.angela/llama-models/Qwen3-30B-A3B-Q4_K_M.gguf"
    
    cmd = [
        "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64/llama-server",
        "-m", model_path,
        "--port", str(SERVER_PORT),
        "--threads", str(config['threads']),
        "--ctx-size", str(config['ctx_size']),
        "--parallel", str(config['parallel']),
        "--batch-size", str(config['batch_size']),
        "--ubatch-size", str(config['ubatch_size']),
        "--n-gpu-layers", str(config['n_gpu_layers']),
        "--defrag-thold", "0.1",
        "--keep", "512",
        "--jinja"
    ]
    
    if config.get('mlock', True):
        cmd.append("--mlock")
    
    env = os.environ.copy()
    env["DYLD_LIBRARY_PATH"] = "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64:"
    
    print(f"🚀 Starting server with config: threads={config['threads']}, ctx={config['ctx_size']}, parallel={config['parallel']}, batch={config['batch_size']}, ubatch={config['ubatch_size']}, gpu_layers={config['n_gpu_layers']}")
    
    process = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    # Wait for server to start
    max_wait = 30
    for i in range(max_wait):
        try:
            response = requests.get(f"{SERVER_URL}/health", timeout=2)
            if response.status_code == 200:
                print(f"✅ Server started successfully after {i+1} seconds")
                return process
        except requests.exceptions.RequestException:
            pass
        time.sleep(1)
    
    print("❌ Failed to start server")
    process.terminate()
    return None

def test_performance(config):
    """Test the performance with the given configuration"""
    try:
        # Prepare the request
        data = {
            "prompt": TEST_PROMPT,
            "n_predict": 50,  # Fixed number of tokens for consistency
            "temperature": 0.1,
            "top_p": 0.9,
            "stream": False
        }
        
        start_time = time.time()
        
        # Make the request
        response = requests.post(
            f"{SERVER_URL}/completion",
            json=data,
            timeout=60,
            headers={'Content-Type': 'application/json'}
        )
        
        end_time = time.time()
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract timing information
            total_time = end_time - start_time
            tokens_generated = result.get('tokens_predicted', 50)
            tokens_per_sec = tokens_generated / total_time if total_time > 0 else 0
            
            # Extract timing details from response
            timings = result.get('timings', {})
            first_token_time = timings.get('predicted_ms', 0) / tokens_generated if tokens_generated > 0 else 0
            
            # Estimate first token time (rough approximation)
            if 'prompt_ms' in timings:
                estimated_first_token = timings['prompt_ms'] + (timings.get('predicted_ms', 0) / tokens_generated if tokens_generated > 0 else 0)
            else:
                # Fallback estimation
                estimated_first_token = (total_time * 1000) * 0.3  # Assume first token is ~30% of total time
            
            return {
                'success': True,
                'total_time_sec': total_time,
                'tokens_per_sec': tokens_per_sec,
                'first_token_time_ms': estimated_first_token,
                'total_tokens': tokens_generated,
                'output_text': result.get('content', '')[:100] + '...' if len(result.get('content', '')) > 100 else result.get('content', ''),
                'error_message': None
            }
        else:
            return {
                'success': False,
                'error_message': f"HTTP {response.status_code}: {response.text[:200]}",
                'total_time_sec': 0,
                'tokens_per_sec': 0,
                'first_token_time_ms': 0,
                'total_tokens': 0,
                'output_text': ''
            }
            
    except Exception as e:
        return {
            'success': False,
            'error_message': str(e)[:200],
            'total_time_sec': 0,
            'tokens_per_sec': 0,
            'first_token_time_ms': 0,
            'total_tokens': 0,
            'output_text': ''
        }

def save_result(config, result, test_id):
    """Save test result to CSV"""
    file_exists = os.path.exists(RESULTS_FILE)
    
    with open(RESULTS_FILE, 'a', newline='') as csvfile:
        fieldnames = [
            'test_id', 'timestamp', 'threads', 'ctx_size', 'parallel', 'batch_size', 
            'ubatch_size', 'n_gpu_layers', 'mlock', 'defrag_thold', 'keep',
            'input_prompt', 'success', 'total_time_sec', 'tokens_per_sec', 
            'first_token_time_ms', 'total_tokens', 'output_text', 'error_message'
        ]
        
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter='|')
        
        if not file_exists:
            writer.writeheader()
        
        row = {
            'test_id': test_id,
            'timestamp': datetime.now().isoformat(),
            'threads': config['threads'],
            'ctx_size': config['ctx_size'],
            'parallel': config['parallel'],
            'batch_size': config['batch_size'],
            'ubatch_size': config['ubatch_size'],
            'n_gpu_layers': config['n_gpu_layers'],
            'mlock': config.get('mlock', 1),
            'defrag_thold': 0.1,
            'keep': 512,
            'input_prompt': TEST_PROMPT,
            'success': 1 if result['success'] else 0,
            'total_time_sec': result['total_time_sec'],
            'tokens_per_sec': result['tokens_per_sec'],
            'first_token_time_ms': result['first_token_time_ms'],
            'total_tokens': result['total_tokens'],
            'output_text': result['output_text'],
            'error_message': result.get('error_message', '')
        }
        
        writer.writerow(row)

def generate_focused_configs():
    """Generate configurations focused on first token optimization"""
    configs = []
    
    # Generate all combinations but prioritize likely fast configs
    for threads in THREAD_COUNTS:
        for ctx_size in CTX_SIZES:
            for parallel in PARALLEL_VALUES:
                for batch_size in BATCH_SIZES:
                    for ubatch_size in UBATCH_SIZES:
                        for gpu_layers in GPU_LAYERS:
                            # Skip obviously bad combinations
                            if ubatch_size > batch_size:
                                continue
                            if parallel > threads:
                                continue
                            
                            config = {
                                'threads': threads,
                                'ctx_size': ctx_size,
                                'parallel': parallel,
                                'batch_size': batch_size,
                                'ubatch_size': ubatch_size,
                                'n_gpu_layers': gpu_layers,
                                'mlock': 1
                            }
                            configs.append(config)
    
    # Sort configs to test likely faster ones first
    configs.sort(key=lambda x: (x['ctx_size'], -x['threads'], x['parallel']))
    
    return configs

def main():
    """Main test execution"""
    print("🎯 FOCUSED FIRST TOKEN PERFORMANCE TESTING")
    print("=" * 60)
    print(f"📝 Results will be saved to: {RESULTS_FILE}")
    print(f"🔥 Test prompt: '{TEST_PROMPT}'")
    
    configs = generate_focused_configs()
    total_configs = len(configs)
    
    print(f"🧪 Total configurations to test: {total_configs}")
    print(f"⏱️  Estimated time: {total_configs * 2:.1f} minutes")
    print("-" * 60)
    
    successful_tests = 0
    failed_tests = 0
    
    for i, config in enumerate(configs, 1):
        print(f"\n📊 Test {i}/{total_configs}")
        print(f"🔧 Config: T={config['threads']}, Ctx={config['ctx_size']}, P={config['parallel']}, B={config['batch_size']}, UB={config['ubatch_size']}, GPU={config['n_gpu_layers']}")
        
        # Start server
        server_process = start_llama_server(config)
        if not server_process:
            print("❌ Failed to start server, skipping...")
            failed_tests += 1
            continue
        
        try:
            # Test performance
            result = test_performance(config)
            
            # Save result
            save_result(config, result, i)
            
            if result['success']:
                print(f"✅ Success: {result['first_token_time_ms']:.1f}ms first token, {result['tokens_per_sec']:.2f} t/s")
                successful_tests += 1
            else:
                print(f"❌ Failed: {result['error_message']}")
                failed_tests += 1
            
        finally:
            # Clean up
            try:
                server_process.terminate()
                server_process.wait(timeout=5)
            except:
                pass
            kill_llama_processes()
        
        # Progress update
        if i % 10 == 0:
            success_rate = (successful_tests / i) * 100
            print(f"\n📈 Progress: {i}/{total_configs} ({i/total_configs*100:.1f}%) - Success rate: {success_rate:.1f}%")
    
    print(f"\n🎉 TESTING COMPLETED!")
    print(f"✅ Successful tests: {successful_tests}")
    print(f"❌ Failed tests: {failed_tests}")
    print(f"📊 Success rate: {successful_tests/(successful_tests+failed_tests)*100:.1f}%")
    print(f"📝 Results saved to: {RESULTS_FILE}")
    print(f"\n💡 Use the dashboard to analyze results:")
    print(f"   python dashboard_server.py")
    print(f"   Then open: http://localhost:5002")

if __name__ == "__main__":
    main() 
