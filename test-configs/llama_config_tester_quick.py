#!/usr/bin/env python3
"""
Llama.cpp Configuration Performance Tester - Quick Version

This is a simplified version with fewer parameter combinations for faster testing.
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

class LlamaConfigTesterQuick:
    def __init__(self, model_path: str, llama_server_path: str, csv_output: str = "config_test_results_quick.csv"):
        self.model_path = model_path
        self.llama_server_path = llama_server_path
        self.csv_output = csv_output
        self.current_process = None
        self.base_port = 8081
        self.test_prompt = "Explain quantum computing in simple terms."
        
        # Initialize CSV file with headers
        self.init_csv()
        
    def init_csv(self):
        """Initialize the CSV file with headers"""
        headers = [
            'timestamp', 'test_id', 'threads', 'ctx_size', 'parallel', 'batch_size', 
            'ubatch_size', 'n_gpu_layers', 'keep', 'defrag_thold', 'mlock',
            'total_time_sec', 'tokens_per_sec', 'first_token_time_ms', 'total_tokens',
            'input_prompt', 'output_text', 'success', 'error_message'
        ]
        
        with open(self.csv_output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='|')
            writer.writerow(headers)
        
        print(f"Initialized CSV file: {self.csv_output}")
        print("CSV format: | (pipe) separated values")
    
    def get_parameter_combinations(self) -> List[Dict[str, Any]]:
        """Generate a smaller set of parameter combinations for quick testing"""
        
        # Define reduced parameter ranges for quick testing
        param_ranges = {
            'n_gpu_layers': [0, 10, 1000],  # CPU only, partial, full GPU
            'ctx_size': [1024, 2048, 4096],  # Small, medium, large context
            'batch_size': [256, 512, 1024],  # Different batch sizes
            'ubatch_size': [64, 128],  # Micro batch sizes
            'threads': [6, 8],  # Thread counts
            'parallel': [1, 4],  # Parallel processing
            'keep': [512, 1024],  # Keep values
            'defrag_thold': [0.1],  # Fixed defrag threshold
            'mlock': [True, False]  # Memory locking
        }
        
        # Generate all combinations
        keys = list(param_ranges.keys())
        values = list(param_ranges.values())
        
        combinations = []
        for combination in itertools.product(*values):
            config = dict(zip(keys, combination))
            
            # Apply logical constraints
            if config['ubatch_size'] > config['batch_size']:
                continue
            if config['keep'] > config['ctx_size']:
                continue
            if config['parallel'] > config['threads']:
                continue
                
            combinations.append(config)
        
        print(f"Generated {len(combinations)} parameter combinations for quick testing")
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
            
            # Start the process
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,  # Suppress output for cleaner logs
                stderr=subprocess.DEVNULL,
                env=env,
                preexec_fn=os.setsid
            )
            
            # Wait for server to start
            max_wait = 30  # Reduced wait time for quick testing
            start_time = time.time()
            
            while time.time() - start_time < max_wait:
                try:
                    response = requests.get(f"http://localhost:{port}/health", timeout=1)
                    if response.status_code == 200:
                        return True
                except requests.exceptions.RequestException:
                    time.sleep(1)
            
            self.stop_llama_server()
            return False
            
        except Exception as e:
            print(f"Error starting server: {e}")
            return False
    
    def stop_llama_server(self):
        """Stop the currently running llama-server"""
        if self.current_process:
            try:
                os.killpg(os.getpgid(self.current_process.pid), signal.SIGTERM)
                self.current_process.wait(timeout=5)
            except Exception:
                try:
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
            
            # Prepare the request - smaller for quick testing
            request_data = {
                "prompt": self.test_prompt,
                "n_predict": 50,  # Generate fewer tokens for quick testing
                "temperature": 0.7,
                "stream": True
            }
            
            # Make the request
            response = requests.post(
                f"http://localhost:{port}/completion",
                json=request_data,
                stream=True,
                timeout=60  # Shorter timeout for quick testing
            )
            
            if response.status_code != 200:
                return {
                    'success': False,
                    'error_message': f"HTTP {response.status_code}: {response.text[:100]}"
                }
            
            # Process streaming response
            full_output = ""
            token_count = 0
            
            for line in response.iter_lines():
                if line:
                    try:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            json_str = line_text[6:]
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
                'output_text': full_output.strip()[:200] + "..." if len(full_output) > 200 else full_output.strip(),
                'first_token_time_ms': first_token_ms,
                'total_tokens': token_count,
                'total_time_sec': total_time,
                'tokens_per_sec': tokens_per_sec,
                'error_message': None
            }
            
        except Exception as e:
            return {
                'success': False,
                'error_message': str(e)[:100],
                'output_text': '',
                'first_token_time_ms': None,
                'total_tokens': 0,
                'total_time_sec': 0,
                'tokens_per_sec': 0
            }
    
    def write_result_to_csv(self, test_id: int, config: Dict[str, Any], result: Dict[str, Any]):
        """Write a single test result to CSV"""
        row = [
            datetime.now().isoformat(),
            test_id,
            config['threads'],
            config['ctx_size'],
            config['parallel'],
            config['batch_size'],
            config['ubatch_size'],
            config['n_gpu_layers'],
            config['keep'],
            config['defrag_thold'],
            config['mlock'],
            result.get('total_time_sec', 0),
            result.get('tokens_per_sec', 0),
            result.get('first_token_time_ms'),
            result.get('total_tokens', 0),
            self.test_prompt,
            result.get('output_text', ''),
            result.get('success', False),
            result.get('error_message', '')
        ]
        
        with open(self.csv_output, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='|')
            writer.writerow(row)
        
        success_indicator = "✓" if result.get('success') else "✗"
        if result.get('success'):
            print(f"Test {test_id} {success_indicator} - Threads:{config['threads']} | "
                  f"Context:{config['ctx_size']} | Parallel:{config['parallel']} | "
                  f"Batch:{config['batch_size']} | Total Time:{result.get('total_time_sec', 0):.2f}s | "
                  f"Tokens/sec:{result.get('tokens_per_sec', 0):.2f} | "
                  f"First Token:{result.get('first_token_time_ms', 0):.0f}ms")
        else:
            print(f"Test {test_id} {success_indicator} - Failed: {result.get('error_message', 'Unknown error')}")
    
    def run_all_tests(self):
        """Run all configuration tests"""
        combinations = self.get_parameter_combinations()
        total_tests = len(combinations)
        
        print(f"Starting quick configuration testing...")
        print(f"Total configurations to test: {total_tests}")
        print(f"Results will be saved to: {self.csv_output}")
        print("-" * 60)
        
        for test_id, config in enumerate(combinations, 1):
            print(f"\n[{test_id}/{total_tests}] Testing Config:")
            print(f"  GPU:{config['n_gpu_layers']} | Threads:{config['threads']} | "
                  f"Context:{config['ctx_size']} | Parallel:{config['parallel']} | "
                  f"Batch:{config['batch_size']} | uBatch:{config['ubatch_size']} | "
                  f"Keep:{config['keep']} | mLock:{config['mlock']}")
            
            # Start server with this configuration
            if self.start_llama_server(config, self.base_port):
                # Run inference test
                result = self.test_inference(self.base_port)
                
                # Write result to CSV immediately
                self.write_result_to_csv(test_id, config, result)
                
                # Stop server
                self.stop_llama_server()
                
                # Brief pause between tests
                time.sleep(1)
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
        self.analyze_results()
    
    def analyze_results(self):
        """Provide a quick analysis of the test results"""
        try:
            import pandas as pd
            df = pd.read_csv(self.csv_output)
            
            # Filter successful tests
            successful_tests = df[df['success'] == True]
            
            if len(successful_tests) > 0:
                print("\n" + "="*60)
                print("QUICK ANALYSIS")
                print("="*60)
                
                # Best performing configuration
                best_config = successful_tests.loc[successful_tests['tokens_per_sec'].idxmax()]
                print(f"Best performing configuration:")
                print(f"  Threads: {best_config['threads']}")
                print(f"  Context Size: {best_config['ctx_size']}")
                print(f"  Parallel: {best_config['parallel']}")
                print(f"  Batch Size: {best_config['batch_size']}")
                print(f"  GPU Layers: {best_config['n_gpu_layers']}")
                print(f"  Total Time: {best_config['total_time_sec']:.2f}s")
                print(f"  Tokens/sec: {best_config['tokens_per_sec']:.2f}")
                print(f"  First Token: {best_config['first_token_time_ms']:.0f}ms")
                
                # Average performance by GPU layers
                print(f"\nAverage tokens/sec by GPU layers:")
                gpu_performance = successful_tests.groupby('n_gpu_layers')['tokens_per_sec'].mean()
                for gpu_layers, avg_tokens in gpu_performance.items():
                    print(f"  {gpu_layers} layers: {avg_tokens:.2f} tokens/sec")
                    
        except ImportError:
            print("\nInstall pandas for automatic analysis: pip install pandas")
        except Exception as e:
            print(f"\nAnalysis error: {e}")

def main():
    # Configuration - modify these paths according to your setup
    model_path = "/Users/badfy17g/.angela/llama-models/Qwen3-30B-A3B-Q4_K_M.gguf"
    llama_server_path = "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64/llama-server"
    
    # Alternative model path from config.yaml
    alt_model_path = "/Users/badfy17g/Downloads/Qwen3 0.6B GGUF.gguf"
    
    # Check if files exist
    if not os.path.exists(model_path):
        if os.path.exists(alt_model_path):
            model_path = alt_model_path
            print(f"Using alternative model: {model_path}")
        else:
            print(f"Error: Model file not found at {model_path}")
            print(f"Also checked: {alt_model_path}")
            print("Please update the model_path variable with the correct path to your GGUF model.")
            return
    
    if not os.path.exists(llama_server_path):
        print(f"Error: llama-server binary not found at {llama_server_path}")
        print("Please update the llama_server_path variable with the correct path.")
        return
    
    # Create tester instance
    tester = LlamaConfigTesterQuick(model_path, llama_server_path)
    
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
