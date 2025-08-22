#!/usr/bin/env python3
"""
Llama.cpp Configuration Performance Tester

This script systematically tests different llama-server configurations
to find the optimal settings for your hardware and model.
"""

import subprocess
import time
import csv
import json
import requests
import itertools
import os
import signal
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional
import threading
import queue

class LlamaConfigTester:
    def __init__(self, model_path: str, llama_server_path: str, csv_output: str = "config_test_results.csv"):
        self.model_path = model_path
        self.llama_server_path = llama_server_path
        self.csv_output = csv_output
        self.current_process = None
        self.base_port = 8081
        self.test_prompt = "Write a detailed explanation of machine learning algorithms and their applications in modern technology."
        
        # Initialize CSV file with headers
        self.init_csv()
        
    def init_csv(self):
        """Initialize the CSV file with headers"""
        headers = [
            'timestamp', 'test_id', 'n_gpu_layers', 'ctx_size', 'batch_size', 
            'ubatch_size', 'threads', 'parallel', 'keep', 'defrag_thold',
            'mlock', 'input_prompt', 'output_text', 'first_token_time_ms',
            'total_tokens', 'total_time_sec', 'tokens_per_sec', 'success',
            'error_message', 'memory_usage_mb', 'cpu_usage_percent'
        ]
        
        with open(self.csv_output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
        
        print(f"Initialized CSV file: {self.csv_output}")
    
    def get_parameter_combinations(self) -> List[Dict[str, Any]]:
        """Generate all parameter combinations to test"""
        
        # Define parameter ranges to test - focused on GPU performance
        param_ranges = {
            'n_gpu_layers': [1000],  # Full GPU offload only
            'ctx_size': [2048, 4096, 8192],  # Context sizes that matter for GPU
            'batch_size': [512, 1024, 2048],  # Batch sizes good for GPU
            'ubatch_size': [128, 256, 512, 1028],  # Micro-batch sizes for GPU
            'threads': [4, 8, 16],  # Thread counts
            'parallel': [1, 2, 4, 8],  # Parallel processing
            'keep': [1024, 2048],  # Keep in context
            'defrag_thold': [0.1],  # Single defrag threshold
            'mlock': [False]  # Disable mlock for GPU focus
        }
        
        # Generate all combinations (this will be a lot!)
        keys = list(param_ranges.keys())
        values = list(param_ranges.values())
        
        combinations = []
        for combination in itertools.product(*values):
            config = dict(zip(keys, combination))
            
            # Apply some logical constraints to reduce invalid combinations
            if config['ubatch_size'] > config['batch_size']:
                continue
            if config['keep'] > config['ctx_size']:
                continue
            if config['parallel'] > config['threads']:
                continue
                
            combinations.append(config)
        
        print(f"Generated {len(combinations)} valid parameter combinations to test")
        return combinations
    
    def start_llama_server(self, config: Dict[str, Any], port: int) -> bool:
        """Start llama-server with given configuration"""
        try:
            cmd = [
                self.llama_server_path,
                "-m", self.model_path,
                "--port", str(port),
                "--jinja",
                "--n-gpu-layers", str(config['n_gpu_layers']),
                "--threads", str(config['threads']),
                "--ctx-size", str(config['ctx_size']),
                "--batch-size", str(config['batch_size']),
                "--ubatch-size", str(config['ubatch_size']),
                "--keep", str(config['keep']),
                "--defrag-thold", str(config['defrag_thold']),
                "--parallel", str(config['parallel'])
            ]
            
            if config['mlock']:
                cmd.append("--mlock")
            
            # Set environment variables
            env = os.environ.copy()
            env['DYLD_LIBRARY_PATH'] = f"{os.path.dirname(self.llama_server_path)}:"
            env['LD_LIBRARY_PATH'] = f"{os.path.dirname(self.llama_server_path)}:{env.get('LD_LIBRARY_PATH', '')}"
            
            # Start the process
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                preexec_fn=os.setsid  # Create new process group
            )
            
            # Wait for server to start (check health endpoint)
            max_wait = 60  # seconds
            start_time = time.time()
            
            while time.time() - start_time < max_wait:
                try:
                    response = requests.get(f"http://localhost:{port}/health", timeout=2)
                    if response.status_code == 200:
                        print(f"Server started successfully on port {port}")
                        return True
                except requests.exceptions.RequestException:
                    time.sleep(2)
            
            print(f"Server failed to start within {max_wait} seconds")
            self.stop_llama_server()
            return False
            
        except Exception as e:
            print(f"Error starting server: {e}")
            return False
    
    def stop_llama_server(self):
        """Stop the currently running llama-server"""
        if self.current_process:
            try:
                # Kill the entire process group
                os.killpg(os.getpgid(self.current_process.pid), signal.SIGTERM)
                self.current_process.wait(timeout=10)
            except Exception as e:
                print(f"Error stopping server: {e}")
                try:
                    # Force kill if normal termination fails
                    os.killpg(os.getpgid(self.current_process.pid), signal.SIGKILL)
                except:
                    pass
            finally:
                self.current_process = None
    
    def test_inference(self, port: int) -> Dict[str, Any]:
        """Test inference performance with the current configuration"""
        try:
            start_time = time.time()
            first_token_time = None
            
            # Prepare the request
            request_data = {
                "prompt": self.test_prompt,
                "n_predict": 200,  # Generate 200 tokens for better speed measurement
                "temperature": 0.7,
                "stream": True
            }
            
            # Make the request
            response = requests.post(
                f"http://localhost:{port}/completion",
                json=request_data,
                stream=True,
                timeout=120
            )
            
            if response.status_code != 200:
                return {
                    'success': False,
                    'error_message': f"HTTP {response.status_code}: {response.text}"
                }
            
            # Process streaming response
            full_output = ""
            token_count = 0
            
            for line in response.iter_lines():
                if line:
                    try:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            json_str = line_text[6:]  # Remove 'data: ' prefix
                            if json_str.strip() == '[DONE]':
                                break
                            
                            data = json.loads(json_str)
                            if 'content' in data:
                                if first_token_time is None and data['content']:
                                    first_token_time = time.time()
                                
                                full_output += data['content']
                                token_count += 1
                    except json.JSONDecodeError:
                        continue
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # Calculate metrics
            if first_token_time:
                first_token_ms = (first_token_time - start_time) * 1000
            else:
                first_token_ms = None
            
            tokens_per_sec = token_count / total_time if total_time > 0 else 0
            
            return {
                'success': True,
                'output_text': full_output.strip(),
                'first_token_time_ms': first_token_ms,
                'total_tokens': token_count,
                'total_time_sec': total_time,
                'tokens_per_sec': tokens_per_sec,
                'error_message': None
            }
            
        except Exception as e:
            return {
                'success': False,
                'error_message': str(e),
                'output_text': '',
                'first_token_time_ms': None,
                'total_tokens': 0,
                'total_time_sec': 0,
                'tokens_per_sec': 0
            }
    
    def get_system_metrics(self) -> Dict[str, float]:
        """Get system resource usage metrics"""
        try:
            # Get memory usage (rough estimate)
            if self.current_process:
                # This is a simplified approach - in production you'd want more detailed metrics
                memory_mb = 0  # Placeholder - would need psutil for accurate measurement
                cpu_percent = 0  # Placeholder - would need psutil for accurate measurement
            else:
                memory_mb = 0
                cpu_percent = 0
                
            return {
                'memory_usage_mb': memory_mb,
                'cpu_usage_percent': cpu_percent
            }
        except:
            return {'memory_usage_mb': 0, 'cpu_usage_percent': 0}
    
    def write_result_to_csv(self, test_id: int, config: Dict[str, Any], result: Dict[str, Any]):
        """Write a single test result to CSV"""
        system_metrics = self.get_system_metrics()
        
        row = [
            datetime.now().isoformat(),
            test_id,
            config['n_gpu_layers'],
            config['ctx_size'],
            config['batch_size'],
            config['ubatch_size'],
            config['threads'],
            config['parallel'],
            config['keep'],
            config['defrag_thold'],
            config['mlock'],
            self.test_prompt,
            result.get('output_text', ''),
            result.get('first_token_time_ms'),
            result.get('total_tokens', 0),
            result.get('total_time_sec', 0),
            result.get('tokens_per_sec', 0),
            result.get('success', False),
            result.get('error_message', ''),
            system_metrics.get('memory_usage_mb', 0),
            system_metrics.get('cpu_usage_percent', 0)
        ]
        
        with open(self.csv_output, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(row)
        
        print(f"Test {test_id} completed - Success: {result.get('success')}, "
              f"First Token: {result.get('first_token_time_ms', 0):.1f}ms, "
              f"Tokens/sec: {result.get('tokens_per_sec', 0):.2f}, "
              f"Total tokens: {result.get('total_tokens', 0)}")
    
    def run_all_tests(self):
        """Run all configuration tests"""
        combinations = self.get_parameter_combinations()
        total_tests = len(combinations)
        
        print(f"Starting comprehensive configuration testing...")
        print(f"Total configurations to test: {total_tests}")
        print(f"Results will be saved to: {self.csv_output}")
        print("-" * 60)
        
        for test_id, config in enumerate(combinations, 1):
            print(f"\n[{test_id}/{total_tests}] Testing configuration:")
            for key, value in config.items():
                print(f"  {key}: {value}")
            
            # Start server with this configuration
            if self.start_llama_server(config, self.base_port):
                # Run inference test
                result = self.test_inference(self.base_port)
                
                # Write result to CSV immediately
                self.write_result_to_csv(test_id, config, result)
                
                # Stop server
                self.stop_llama_server()
                
                # Brief pause between tests
                time.sleep(2)
            else:
                # Server failed to start
                error_result = {
                    'success': False,
                    'error_message': 'Failed to start server',
                    'output_text': '',
                    'first_token_time_ms': None,
                    'total_tokens': 0,
                    'total_time_sec': 0,
                    'tokens_per_sec': 0
                }
                self.write_result_to_csv(test_id, config, error_result)
        
        print(f"\nAll tests completed! Results saved to {self.csv_output}")
        print("You can analyze the CSV file to find the best performing configuration.")
        print("\n" + "="*80)
        print("QUICK ANALYSIS - TOP CONFIGURATIONS:")
        print("="*80)
        
        # Quick analysis of results
        try:
            import pandas as pd
            df = pd.read_csv(self.csv_output)
            successful_tests = df[df['success'] == True]
            
            if len(successful_tests) > 0:
                # Best first token time
                best_first_token = successful_tests.loc[successful_tests['first_token_time_ms'].idxmin()]
                print(f"\nBEST FIRST TOKEN TIME: {best_first_token['first_token_time_ms']:.1f}ms")
                print(f"Config: ctx={best_first_token['ctx_size']}, batch={best_first_token['batch_size']}, "
                      f"ubatch={best_first_token['ubatch_size']}, threads={best_first_token['threads']}, "
                      f"parallel={best_first_token['parallel']}")
                
                # Best tokens per second
                best_throughput = successful_tests.loc[successful_tests['tokens_per_sec'].idxmax()]
                print(f"\nBEST THROUGHPUT: {best_throughput['tokens_per_sec']:.2f} tokens/sec")
                print(f"Config: ctx={best_throughput['ctx_size']}, batch={best_throughput['batch_size']}, "
                      f"ubatch={best_throughput['ubatch_size']}, threads={best_throughput['threads']}, "
                      f"parallel={best_throughput['parallel']}")
                
                print(f"\nTotal successful tests: {len(successful_tests)}/{total_tests}")
            else:
                print("No successful tests found!")
        except ImportError:
            print("Install pandas for automatic analysis: pip install pandas")

def main():
    # Configuration - modify these paths according to your setup
    model_path = "/Users/badfy17g/.angela/llama-models/Qwen3-30B-A3B-Q4_K_M.gguf"
    llama_server_path = "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64/llama-server"
    
    # Check if files exist
    if not os.path.exists(model_path):
        print(f"Error: Model file not found at {model_path}")
        print("Please update the model_path variable with the correct path to your GGUF model.")
        return
    
    if not os.path.exists(llama_server_path):
        print(f"Error: llama-server binary not found at {llama_server_path}")
        print("Please update the llama_server_path variable with the correct path.")
        return
    
    # Create tester instance
    tester = LlamaConfigTester(model_path, llama_server_path)
    
    try:
        # Run all tests
        tester.run_all_tests()
    except KeyboardInterrupt:
        print("\nTests interrupted by user. Cleaning up...")
        tester.stop_llama_server()
    except Exception as e:
        print(f"Unexpected error: {e}")
        tester.stop_llama_server()

if __name__ == "__main__":
    main() 
