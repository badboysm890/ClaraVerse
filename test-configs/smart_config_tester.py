#!/usr/bin/env python3
"""
Smart Llama.cpp Configuration Tester with Predictive Modeling

This script uses intelligent sampling and machine learning to find optimal configurations
with minimal testing time (5-10 minutes instead of hours).
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
from typing import Dict, List, Any, Optional, Tuple
import argparse

# Optional ML dependencies
try:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("⚠️  Machine learning libraries not available. Install with: pip install scikit-learn")

class SmartConfigTester:
    def __init__(self, model_path: str, llama_server_path: str, csv_output: str = "smart_config_results.csv"):
        self.model_path = model_path
        self.llama_server_path = llama_server_path
        self.csv_output = csv_output
        self.current_process = None
        self.base_port = 8081
        self.test_prompt = "Explain machine learning in simple terms."
        
        # ML models for prediction
        self.first_token_model = None
        self.throughput_model = None
        self.scaler = None
        
        # Test results storage
        self.test_results = []
        
        # Initialize CSV file
        if not os.path.exists(self.csv_output):
            self.init_csv()
        
    def init_csv(self):
        """Initialize the CSV file with headers"""
        headers = [
            'timestamp', 'test_id', 'threads', 'ctx_size', 'parallel', 'batch_size', 
            'ubatch_size', 'n_gpu_layers', 'keep', 'defrag_thold', 'mlock',
            'total_time_sec', 'tokens_per_sec', 'first_token_time_ms', 'total_tokens',
            'input_prompt', 'output_text', 'success', 'error_message', 'test_type'
        ]
        
        with open(self.csv_output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='|')
            writer.writerow(headers)
        
        print(f"✅ Initialized CSV file: {self.csv_output}")
    
    def get_strategic_sample_configs(self, sample_size: int = 30) -> List[Dict[str, Any]]:
        """Generate a strategic sample of configurations using intelligent sampling"""
        
        # Define parameter ranges
        param_ranges = {
            'threads': [4, 6, 8, 12],
            'ctx_size': [1024, 2048, 4096, 8192],
            'parallel': [1, 2, 4, 8],
            'batch_size': [256, 512, 1024, 2048],
            'ubatch_size': [64, 128, 256, 512],
            'n_gpu_layers': [0, 10, 50, 1000],  # CPU, partial, full GPU
            'keep': [512, 1024, 2048],
            'defrag_thold': [0.1],  # Fixed
            'mlock': [True, False]
        }
        
        configs = []
        
        # 1. Corner cases (extreme values)
        corner_configs = [
            # High performance config
            {'threads': 8, 'ctx_size': 4096, 'parallel': 4, 'batch_size': 1024, 'ubatch_size': 256, 'n_gpu_layers': 1000, 'keep': 1024, 'defrag_thold': 0.1, 'mlock': False},
            # CPU-only config
            {'threads': 8, 'ctx_size': 2048, 'parallel': 4, 'batch_size': 512, 'ubatch_size': 128, 'n_gpu_layers': 0, 'keep': 512, 'defrag_thold': 0.1, 'mlock': True},
            # Low resource config
            {'threads': 4, 'ctx_size': 1024, 'parallel': 1, 'batch_size': 256, 'ubatch_size': 64, 'n_gpu_layers': 10, 'keep': 512, 'defrag_thold': 0.1, 'mlock': False},
            # Large context config
            {'threads': 12, 'ctx_size': 8192, 'parallel': 8, 'batch_size': 2048, 'ubatch_size': 512, 'n_gpu_layers': 1000, 'keep': 2048, 'defrag_thold': 0.1, 'mlock': False},
        ]
        configs.extend(corner_configs)
        
        # 2. Random sampling for the rest
        remaining_samples = sample_size - len(corner_configs)
        
        if ML_AVAILABLE:
            # Use quasi-random sampling if available
            import random
            random.seed(42)  # For reproducibility
            
            for _ in range(remaining_samples):
                config = {}
                for param, values in param_ranges.items():
                    if param == 'defrag_thold':
                        config[param] = values[0]  # Fixed value
                    else:
                        config[param] = random.choice(values)
                
                # Apply constraints
                if config['ubatch_size'] > config['batch_size']:
                    config['ubatch_size'] = min(config['ubatch_size'], config['batch_size'])
                if config['keep'] > config['ctx_size']:
                    config['keep'] = min(config['keep'], config['ctx_size'])
                if config['parallel'] > config['threads']:
                    config['parallel'] = min(config['parallel'], config['threads'])
                
                configs.append(config)
        else:
            # Fallback to systematic sampling
            keys = list(param_ranges.keys())
            values = list(param_ranges.values())
            
            all_combinations = list(itertools.product(*values))
            step = max(1, len(all_combinations) // remaining_samples)
            
            for i in range(0, len(all_combinations), step):
                if len(configs) >= sample_size:
                    break
                config = dict(zip(keys, all_combinations[i]))
                
                # Apply constraints
                if config['ubatch_size'] > config['batch_size']:
                    continue
                if config['keep'] > config['ctx_size']:
                    continue
                if config['parallel'] > config['threads']:
                    continue
                
                configs.append(config)
        
        # Remove duplicates
        unique_configs = []
        seen = set()
        for config in configs:
            config_tuple = tuple(sorted(config.items()))
            if config_tuple not in seen:
                seen.add(config_tuple)
                unique_configs.append(config)
        
        print(f"🎯 Generated {len(unique_configs)} strategic test configurations")
        return unique_configs[:sample_size]
    
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
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=env,
                preexec_fn=os.setsid
            )
            
            # Wait for server to start
            max_wait = 20  # Reduced wait time
            start_time = time.time()
            
            while time.time() - start_time < max_wait:
                try:
                    response = requests.get(f"http://localhost:{port}/health", timeout=1)
                    if response.status_code == 200:
                        return True
                except requests.exceptions.RequestException:
                    time.sleep(0.5)
            
            self.stop_llama_server()
            return False
            
        except Exception as e:
            print(f"❌ Error starting server: {e}")
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
            
            # Shorter test for speed
            request_data = {
                "prompt": self.test_prompt,
                "n_predict": 30,  # Shorter generation for speed
                "temperature": 0.7,
                "stream": True
            }
            
            response = requests.post(
                f"http://localhost:{port}/completion",
                json=request_data,
                stream=True,
                timeout=30  # Shorter timeout
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
                'output_text': full_output.strip()[:100] + "..." if len(full_output) > 100 else full_output.strip(),
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
    
    def write_result_to_csv(self, test_id: int, config: Dict[str, Any], result: Dict[str, Any], test_type: str = "measured"):
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
            result.get('error_message', ''),
            test_type
        ]
        
        with open(self.csv_output, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='|')
            writer.writerow(row)
    
    def config_to_features(self, config: Dict[str, Any]) -> List[float]:
        """Convert configuration to feature vector for ML"""
        return [
            float(config['threads']),
            float(config['ctx_size']),
            float(config['parallel']),
            float(config['batch_size']),
            float(config['ubatch_size']),
            float(config['n_gpu_layers']),
            float(config['keep']),
            float(1 if config['mlock'] else 0)
        ]
    
    def train_prediction_models(self) -> bool:
        """Train ML models on the collected data"""
        if not ML_AVAILABLE:
            print("❌ ML libraries not available. Cannot train prediction models.")
            return False
        
        if len(self.test_results) < 5:
            print("❌ Not enough data to train models. Need at least 5 successful tests.")
            return False
        
        # Prepare training data
        successful_results = [r for r in self.test_results if r['result']['success']]
        
        if len(successful_results) < 3:
            print("❌ Not enough successful tests to train models.")
            return False
        
        X = np.array([self.config_to_features(r['config']) for r in successful_results])
        y_first_token = np.array([r['result']['first_token_time_ms'] for r in successful_results])
        y_throughput = np.array([r['result']['tokens_per_sec'] for r in successful_results])
        
        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Train models
        print(f"🧠 Training prediction models on {len(successful_results)} samples...")
        
        self.first_token_model = RandomForestRegressor(n_estimators=50, random_state=42)
        self.throughput_model = RandomForestRegressor(n_estimators=50, random_state=42)
        
        try:
            self.first_token_model.fit(X_scaled, y_first_token)
            self.throughput_model.fit(X_scaled, y_throughput)
            
            # Calculate cross-validation scores
            ft_score = cross_val_score(self.first_token_model, X_scaled, y_first_token, cv=min(3, len(successful_results))).mean()
            tp_score = cross_val_score(self.throughput_model, X_scaled, y_throughput, cv=min(3, len(successful_results))).mean()
            
            print(f"✅ Models trained successfully!")
            print(f"   First Token Model R²: {ft_score:.3f}")
            print(f"   Throughput Model R²: {tp_score:.3f}")
            
            return True
        except Exception as e:
            print(f"❌ Error training models: {e}")
            return False
    
    def predict_performance(self, config: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
        """Predict performance for a given configuration"""
        if not self.first_token_model or not self.throughput_model or not self.scaler:
            return None, None
        
        try:
            features = np.array([self.config_to_features(config)])
            features_scaled = self.scaler.transform(features)
            
            first_token_pred = self.first_token_model.predict(features_scaled)[0]
            throughput_pred = self.throughput_model.predict(features_scaled)[0]
            
            return first_token_pred, throughput_pred
        except Exception as e:
            print(f"❌ Error predicting: {e}")
            return None, None
    
    def run_strategic_sampling(self, sample_size: int = 30):
        """Run the strategic sampling phase"""
        print(f"🎯 Phase 1: Strategic Sampling ({sample_size} tests)")
        print("=" * 60)
        
        configs = self.get_strategic_sample_configs(sample_size)
        
        for i, config in enumerate(configs, 1):
            print(f"\n[{i}/{len(configs)}] Testing Config:")
            print(f"  🧵 Threads:{config['threads']} | 🎯 Context:{config['ctx_size']} | ⚡ Parallel:{config['parallel']}")
            print(f"  📦 Batch:{config['batch_size']} | 📋 uBatch:{config['ubatch_size']} | 🔧 GPU:{config['n_gpu_layers']}")
            
            # Test the configuration
            if self.start_llama_server(config, self.base_port):
                result = self.test_inference(self.base_port)
                self.stop_llama_server()
                
                # Store result
                self.test_results.append({'config': config, 'result': result})
                self.write_result_to_csv(i, config, result, "measured")
                
                if result['success']:
                    print(f"  ✅ Success: {result['tokens_per_sec']:.2f} t/s, {result['first_token_time_ms']:.0f}ms first token")
                else:
                    print(f"  ❌ Failed: {result['error_message']}")
                
                time.sleep(0.5)  # Brief pause
            else:
                error_result = {
                    'success': False,
                    'error_message': 'Failed to start server',
                    'tokens_per_sec': 0,
                    'first_token_time_ms': None,
                    'total_time_sec': 0,
                    'total_tokens': 0,
                    'output_text': ''
                }
                self.test_results.append({'config': config, 'result': error_result})
                self.write_result_to_csv(i, config, error_result, "measured")
                print(f"  ❌ Failed to start server")
    
    def run_predictive_analysis(self):
        """Run predictive analysis phase"""
        print(f"\n🔮 Phase 2: Predictive Analysis")
        print("=" * 60)
        
        if not self.train_prediction_models():
            print("❌ Cannot proceed with predictions. Training failed.")
            return
        
        # Generate all possible configurations
        param_ranges = {
            'threads': [4, 6, 8, 12],
            'ctx_size': [1024, 2048, 4096, 8192],
            'parallel': [1, 2, 4, 8],
            'batch_size': [256, 512, 1024, 2048],
            'ubatch_size': [64, 128, 256, 512],
            'n_gpu_layers': [0, 10, 50, 1000],
            'keep': [512, 1024, 2048],
            'defrag_thold': [0.1],
            'mlock': [True, False]
        }
        
        all_configs = []
        for combination in itertools.product(*param_ranges.values()):
            config = dict(zip(param_ranges.keys(), combination))
            
            # Apply constraints
            if config['ubatch_size'] > config['batch_size']:
                continue
            if config['keep'] > config['ctx_size']:
                continue
            if config['parallel'] > config['threads']:
                continue
            
            all_configs.append(config)
        
        print(f"📊 Predicting performance for {len(all_configs)} configurations...")
        
        # Predict performance for all configurations
        predictions = []
        for config in all_configs:
            first_token_pred, throughput_pred = self.predict_performance(config)
            if first_token_pred is not None and throughput_pred is not None:
                # Calculate composite score (lower first token + higher throughput = better)
                composite_score = (1000 / max(first_token_pred, 1)) + throughput_pred
                predictions.append({
                    'config': config,
                    'first_token_pred': first_token_pred,
                    'throughput_pred': throughput_pred,
                    'composite_score': composite_score
                })
        
        # Sort by composite score and get top configurations
        predictions.sort(key=lambda x: x['composite_score'], reverse=True)
        top_predictions = predictions[:min(20, len(predictions))]
        
        print(f"\n🏆 Top {len(top_predictions)} Predicted Configurations:")
        print("-" * 60)
        
        for i, pred in enumerate(top_predictions, 1):
            config = pred['config']
            print(f"\n#{i} Predicted Performance:")
            print(f"  🎯 First Token: {pred['first_token_pred']:.1f}ms")
            print(f"  📊 Throughput: {pred['throughput_pred']:.2f} tokens/sec")
            print(f"  🏆 Score: {pred['composite_score']:.2f}")
            print(f"  ⚙️  Config: threads={config['threads']}, ctx={config['ctx_size']}, "
                  f"batch={config['batch_size']}, gpu={config['n_gpu_layers']}")
            
            # Write prediction to CSV
            pred_result = {
                'success': True,
                'tokens_per_sec': pred['throughput_pred'],
                'first_token_time_ms': pred['first_token_pred'],
                'total_time_sec': 30 / max(pred['throughput_pred'], 1),  # Estimated
                'total_tokens': 30,
                'output_text': 'PREDICTED',
                'error_message': ''
            }
            self.write_result_to_csv(1000 + i, config, pred_result, "predicted")
    
    def analyze_results(self):
        """Analyze and summarize the results"""
        print(f"\n📈 Results Analysis")
        print("=" * 60)
        
        successful_tests = [r for r in self.test_results if r['result']['success']]
        
        if not successful_tests:
            print("❌ No successful tests to analyze")
            return
        
        # Find best measured configuration
        best_test = max(successful_tests, key=lambda x: x['result']['tokens_per_sec'])
        fastest_first_token = min(successful_tests, key=lambda x: x['result']['first_token_time_ms'])
        
        print(f"✅ Measured {len(successful_tests)} successful configurations")
        print(f"\n🏆 Best Measured Throughput:")
        print(f"  📊 {best_test['result']['tokens_per_sec']:.2f} tokens/sec")
        print(f"  ⚡ {best_test['result']['first_token_time_ms']:.1f}ms first token")
        config = best_test['config']
        print(f"  ⚙️  Config: threads={config['threads']}, ctx={config['ctx_size']}, "
              f"batch={config['batch_size']}, gpu={config['n_gpu_layers']}")
        
        print(f"\n⚡ Fastest First Token:")
        print(f"  ⚡ {fastest_first_token['result']['first_token_time_ms']:.1f}ms")
        print(f"  📊 {fastest_first_token['result']['tokens_per_sec']:.2f} tokens/sec")
        config = fastest_first_token['config']
        print(f"  ⚙️  Config: threads={config['threads']}, ctx={config['ctx_size']}, "
              f"batch={config['batch_size']}, gpu={config['n_gpu_layers']}")
    
    def run_smart_test(self, sample_size: int = 30):
        """Run the complete smart testing pipeline"""
        print("🚀 Smart Configuration Testing Started")
        print(f"⏱️  Estimated time: {sample_size * 0.5:.1f} minutes")
        print("=" * 60)
        
        start_time = time.time()
        
        # Phase 1: Strategic sampling
        self.run_strategic_sampling(sample_size)
        
        # Phase 2: Predictive analysis (if ML is available)
        if ML_AVAILABLE:
            self.run_predictive_analysis()
        else:
            print("\n⚠️  Skipping predictive analysis (ML libraries not available)")
        
        # Analysis
        self.analyze_results()
        
        total_time = time.time() - start_time
        print(f"\n⏱️  Total testing time: {total_time/60:.1f} minutes")
        print(f"📄 Results saved to: {self.csv_output}")
        print(f"🌐 View dashboard at: http://localhost:5002")

def main():
    parser = argparse.ArgumentParser(description='Smart Llama.cpp Configuration Tester')
    parser.add_argument('--sample-size', type=int, default=30, 
                       help='Number of configurations to actually test (default: 30)')
    args = parser.parse_args()
    
    # Configuration - modify these paths according to your setup
    model_path = "/Users/badfy17g/.angela/llama-models/Qwen3-30B-A3B-Q4_K_M.gguf"
    llama_server_path = "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64/llama-server"
    
    # Alternative model path
    alt_model_path = "/Users/badfy17g/Downloads/Qwen3 0.6B GGUF.gguf"
    
    # Check if files exist
    if not os.path.exists(model_path):
        if os.path.exists(alt_model_path):
            model_path = alt_model_path
            print(f"Using alternative model: {model_path}")
        else:
            print(f"❌ Error: Model file not found at {model_path}")
            print(f"Also checked: {alt_model_path}")
            return
    
    if not os.path.exists(llama_server_path):
        print(f"❌ Error: llama-server binary not found at {llama_server_path}")
        return
    
    # Create tester instance
    tester = SmartConfigTester(model_path, llama_server_path)
    
    try:
        # Run smart testing
        tester.run_smart_test(args.sample_size)
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user. Cleaning up...")
        tester.stop_llama_server()
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        tester.stop_llama_server()

if __name__ == "__main__":
    main() 
