#!/usr/bin/env python3
"""
LLaMA.cpp Configuration Optimizer

Uses machine learning to predict optimal configuration settings
based on system specifications and historical performance data.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score
import joblib
import os
from datetime import datetime
import json


class LlamaConfigOptimizer:
    def __init__(self, csv_file="config_test_results.csv"):
        self.csv_file = csv_file
        self.model_first_token = None
        self.model_throughput = None
        self.scaler = StandardScaler()
        self.feature_names = ['threads', 'ctx_size', 'batch_size', 'ubatch_size', 'parallel', 'n_gpu_layers']
        self.model_trained = False
        
    def load_data(self):
        """Load and prepare training data from CSV"""
        if not os.path.exists(self.csv_file):
            raise FileNotFoundError(f"CSV file {self.csv_file} not found")
        
        print(f"📊 Loading data from {self.csv_file}...")
        df = pd.read_csv(self.csv_file)
        
        # Filter successful tests only
        df = df[df['success'] == True].copy()
        
        if len(df) < 5:
            raise ValueError("Need at least 5 successful tests to train the model")
        
        print(f"✅ Loaded {len(df)} successful tests")
        
        # Prepare features and targets
        X = df[self.feature_names].copy()
        y_first_token = df['first_token_time_ms'].copy()
        y_throughput = df['tokens_per_sec'].copy()
        
        # Handle any missing values
        X = X.fillna(X.median())
        
        return X, y_first_token, y_throughput, df
    
    def train_models(self):
        """Train machine learning models to predict performance"""
        print("🧠 Training ML models...")
        
        try:
            X, y_first_token, y_throughput, df = self.load_data()
            
            # Split data for training and validation
            X_train, X_test, y1_train, y1_test, y2_train, y2_test = train_test_split(
                X, y_first_token, y_throughput, test_size=0.2, random_state=42
            )
            
            # Scale features
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            # Train models
            self.model_first_token = RandomForestRegressor(
                n_estimators=100, random_state=42, max_depth=10
            )
            self.model_throughput = RandomForestRegressor(
                n_estimators=100, random_state=42, max_depth=10
            )
            
            self.model_first_token.fit(X_train_scaled, y1_train)
            self.model_throughput.fit(X_train_scaled, y2_train)
            
            # Validate models
            y1_pred = self.model_first_token.predict(X_test_scaled)
            y2_pred = self.model_throughput.predict(X_test_scaled)
            
            r2_first = r2_score(y1_test, y1_pred)
            r2_throughput = r2_score(y2_test, y2_pred)
            
            print(f"📈 Model Performance:")
            print(f"   First Token Time R²: {r2_first:.3f}")
            print(f"   Throughput R²: {r2_throughput:.3f}")
            
            # Feature importance
            importance_first = self.model_first_token.feature_importances_
            importance_throughput = self.model_throughput.feature_importances_
            
            print(f"\n🔍 Feature Importance (First Token Time):")
            for i, feature in enumerate(self.feature_names):
                print(f"   {feature}: {importance_first[i]:.3f}")
            
            print(f"\n🔍 Feature Importance (Throughput):")
            for i, feature in enumerate(self.feature_names):
                print(f"   {feature}: {importance_throughput[i]:.3f}")
            
            self.model_trained = True
            self.save_models()
            
            return {
                'r2_first_token': r2_first,
                'r2_throughput': r2_throughput,
                'feature_importance_first': dict(zip(self.feature_names, importance_first)),
                'feature_importance_throughput': dict(zip(self.feature_names, importance_throughput)),
                'training_samples': len(X)
            }
            
        except Exception as e:
            print(f"❌ Error training models: {e}")
            return None
    
    def save_models(self):
        """Save trained models to disk"""
        try:
            joblib.dump(self.model_first_token, 'model_first_token.pkl')
            joblib.dump(self.model_throughput, 'model_throughput.pkl')
            joblib.dump(self.scaler, 'scaler.pkl')
            print("💾 Models saved successfully")
        except Exception as e:
            print(f"❌ Error saving models: {e}")
    
    def load_models(self):
        """Load trained models from disk"""
        try:
            if os.path.exists('model_first_token.pkl'):
                self.model_first_token = joblib.load('model_first_token.pkl')
                self.model_throughput = joblib.load('model_throughput.pkl')
                self.scaler = joblib.load('scaler.pkl')
                self.model_trained = True
                print("📂 Models loaded successfully")
                return True
            return False
        except Exception as e:
            print(f"❌ Error loading models: {e}")
            return False
    
    def predict_performance(self, config):
        """Predict performance for a given configuration"""
        if not self.model_trained:
            raise ValueError("Models not trained. Call train_models() first.")
        
        # Prepare input
        X = np.array([[
            config['threads'],
            config['ctx_size'], 
            config['batch_size'],
            config['ubatch_size'],
            config['parallel'],
            config['n_gpu_layers']
        ]])
        
        # Scale input
        X_scaled = self.scaler.transform(X)
        
        # Predict
        first_token_pred = self.model_first_token.predict(X_scaled)[0]
        throughput_pred = self.model_throughput.predict(X_scaled)[0]
        
        return {
            'first_token_time_ms': max(50, first_token_pred),  # Minimum reasonable time
            'tokens_per_sec': max(1, throughput_pred),  # Minimum reasonable throughput
            'efficiency_score': self.calculate_efficiency_score(first_token_pred, throughput_pred)
        }
    
    def calculate_efficiency_score(self, first_token, throughput):
        """Calculate a composite efficiency score (0-100)"""
        # Normalize scores (lower first token = better, higher throughput = better)
        first_token_norm = max(0, 100 - (first_token / 10))  # 1000ms = 0 points
        throughput_norm = min(100, throughput * 2)  # 50 tokens/sec = 100 points
        
        # Weighted average: 60% first token, 40% throughput
        return (first_token_norm * 0.6 + throughput_norm * 0.4)
    
    def optimize_config(self, system_specs, priority='balanced'):
        """
        Find optimal configuration for given system specs
        
        system_specs = {
            'cpu_cores': int,
            'gpu_memory_gb': int,  
            'system_memory_gb': int,
            'gpu_compute_capability': str (optional)
        }
        
        priority = 'speed' | 'throughput' | 'balanced'
        """
        if not self.model_trained:
            if not self.load_models():
                print("⚠️  No trained models found. Training new models...")
                self.train_models()
        
        print(f"🎯 Optimizing config for system: {system_specs}")
        print(f"📋 Priority: {priority}")
        
        # Define search space based on system specs
        cpu_cores = system_specs.get('cpu_cores', 8)
        gpu_memory = system_specs.get('gpu_memory_gb', 8)
        system_memory = system_specs.get('system_memory_gb', 16)
        
        # Smart parameter ranges based on system capabilities
        param_ranges = {
            'threads': list(range(1, min(cpu_cores + 1, 17))),  # Up to CPU cores, max 16
            'ctx_size': [512, 1024, 2048, 4096, 8192][:3 if gpu_memory < 8 else 5],
            'batch_size': [128, 256, 512, 1024][:2 if gpu_memory < 6 else 4],
            'ubatch_size': [32, 64, 128, 256],
            'parallel': [1, 2, 4] if cpu_cores >= 4 else [1, 2],
            'n_gpu_layers': [100, 500, 1000] if gpu_memory >= 4 else [50, 100]
        }
        
        best_config = None
        best_score = -1
        configs_tested = 0
        
        print(f"🔍 Testing configurations...")
        
        # Grid search with smart sampling
        for threads in param_ranges['threads'][::2]:  # Sample every 2nd thread count
            for ctx_size in param_ranges['ctx_size']:
                for batch_size in param_ranges['batch_size']:
                    for ubatch_size in param_ranges['ubatch_size']:
                        for parallel in param_ranges['parallel']:
                            for n_gpu_layers in param_ranges['n_gpu_layers']:
                                
                                config = {
                                    'threads': threads,
                                    'ctx_size': ctx_size,
                                    'batch_size': batch_size,
                                    'ubatch_size': ubatch_size,
                                    'parallel': parallel,
                                    'n_gpu_layers': n_gpu_layers
                                }
                                
                                try:
                                    pred = self.predict_performance(config)
                                    
                                    # Calculate score based on priority
                                    if priority == 'speed':
                                        score = 1000 / pred['first_token_time_ms']  # Lower time = higher score
                                    elif priority == 'throughput':
                                        score = pred['tokens_per_sec']
                                    else:  # balanced
                                        score = pred['efficiency_score']
                                    
                                    if score > best_score:
                                        best_score = score
                                        best_config = config.copy()
                                        best_config['predicted_first_token'] = pred['first_token_time_ms']
                                        best_config['predicted_throughput'] = pred['tokens_per_sec']
                                        best_config['efficiency_score'] = pred['efficiency_score']
                                    
                                    configs_tested += 1
                                    
                                except Exception as e:
                                    continue
        
        print(f"✅ Tested {configs_tested} configurations")
        
        if best_config:
            print(f"\n🏆 OPTIMAL CONFIGURATION FOUND:")
            print(f"   Threads: {best_config['threads']}")
            print(f"   Context Size: {best_config['ctx_size']}")
            print(f"   Batch Size: {best_config['batch_size']}")
            print(f"   UBatch Size: {best_config['ubatch_size']}")
            print(f"   Parallel: {best_config['parallel']}")
            print(f"   GPU Layers: {best_config['n_gpu_layers']}")
            print(f"\n📊 PREDICTED PERFORMANCE:")
            print(f"   First Token Time: {best_config['predicted_first_token']:.0f}ms")
            print(f"   Throughput: {best_config['predicted_throughput']:.1f} tokens/sec")
            print(f"   Efficiency Score: {best_config['efficiency_score']:.1f}/100")
            
            # Add recommended additional settings
            best_config.update({
                'keep': min(1024, best_config['ctx_size'] // 2),
                'defrag_thold': 0.1,
                'mlock': gpu_memory >= 8  # Enable mlock if enough GPU memory
            })
            
        return best_config


def main():
    """Main function for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description="LLaMA.cpp Configuration Optimizer")
    parser.add_argument('--train', action='store_true', help='Train the ML models')
    parser.add_argument('--optimize', action='store_true', help='Optimize configuration')
    parser.add_argument('--cpu-cores', type=int, default=8, help='Number of CPU cores')
    parser.add_argument('--gpu-memory', type=int, default=8, help='GPU memory in GB')
    parser.add_argument('--system-memory', type=int, default=16, help='System memory in GB')
    parser.add_argument('--priority', choices=['speed', 'throughput', 'balanced'], 
                       default='balanced', help='Optimization priority')
    
    args = parser.parse_args()
    
    optimizer = LlamaConfigOptimizer()
    
    if args.train:
        result = optimizer.train_models()
        if result:
            print("\n✅ Training completed successfully!")
        else:
            print("\n❌ Training failed!")
            return
    
    if args.optimize:
        system_specs = {
            'cpu_cores': args.cpu_cores,
            'gpu_memory_gb': args.gpu_memory,
            'system_memory_gb': args.system_memory
        }
        
        config = optimizer.optimize_config(system_specs, args.priority)
        
        if config:
            print(f"\n📋 RECOMMENDED LLAMA.CPP COMMAND:")
            print(f"--threads {config['threads']} \\")
            print(f"--ctx-size {config['ctx_size']} \\")
            print(f"--batch-size {config['batch_size']} \\")
            print(f"--ubatch-size {config['ubatch_size']} \\")
            print(f"--parallel {config['parallel']} \\")
            print(f"--n-gpu-layers {config['n_gpu_layers']} \\")
            print(f"--keep {config['keep']} \\")
            print(f"--defrag-thold {config['defrag_thold']}")
            if config['mlock']:
                print("--mlock")


if __name__ == "__main__":
    main() 
