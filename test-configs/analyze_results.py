#!/usr/bin/env python3
"""
Llama.cpp Configuration Results Analyzer

This script analyzes the CSV results from configuration testing
and provides detailed insights and recommendations.
"""

import pandas as pd
import sys
import os
from typing import Optional

def analyze_csv_results(csv_file: str):
    """Analyze the CSV results and provide insights"""
    
    if not os.path.exists(csv_file):
        print(f"Error: CSV file '{csv_file}' not found")
        return
    
    try:
        df = pd.read_csv(csv_file)
        print(f"Loaded {len(df)} test results from {csv_file}")
        print("=" * 80)
        
        # Basic statistics
        successful_tests = df[df['success'] == True]
        failed_tests = df[df['success'] == False]
        
        print(f"\nOVERALL RESULTS:")
        print(f"  Total tests: {len(df)}")
        print(f"  Successful: {len(successful_tests)} ({len(successful_tests)/len(df)*100:.1f}%)")
        print(f"  Failed: {len(failed_tests)} ({len(failed_tests)/len(df)*100:.1f}%)")
        
        if len(successful_tests) == 0:
            print("\nNo successful tests found!")
            return
        
        # Performance analysis
        print(f"\nPERFORMANCE METRICS:")
        print(f"  Best tokens/sec: {successful_tests['tokens_per_sec'].max():.2f}")
        print(f"  Average tokens/sec: {successful_tests['tokens_per_sec'].mean():.2f}")
        print(f"  Worst tokens/sec: {successful_tests['tokens_per_sec'].min():.2f}")
        print(f"  Standard deviation: {successful_tests['tokens_per_sec'].std():.2f}")
        
        # Best configuration
        best_config = successful_tests.loc[successful_tests['tokens_per_sec'].idxmax()]
        print(f"\nBEST PERFORMING CONFIGURATION:")
        print(f"  Test ID: {best_config['test_id']}")
        print(f"  Tokens/sec: {best_config['tokens_per_sec']:.2f}")
        print(f"  GPU Layers: {best_config['n_gpu_layers']}")
        print(f"  Context Size: {best_config['ctx_size']}")
        print(f"  Batch Size: {best_config['batch_size']}")
        print(f"  Micro Batch: {best_config['ubatch_size']}")
        print(f"  Threads: {best_config['threads']}")
        print(f"  Parallel: {best_config['parallel']}")
        print(f"  Keep: {best_config['keep']}")
        print(f"  Memory Lock: {best_config['mlock']}")
        print(f"  First Token (ms): {best_config['first_token_time_ms']:.1f}")
        
        # Analysis by parameter
        print(f"\nPERFORMANCE BY GPU LAYERS:")
        gpu_analysis = successful_tests.groupby('n_gpu_layers').agg({
            'tokens_per_sec': ['mean', 'max', 'count']
        }).round(2)
        gpu_analysis.columns = ['Avg_TPS', 'Max_TPS', 'Count']
        print(gpu_analysis.to_string())
        
        print(f"\nPERFORMANCE BY CONTEXT SIZE:")
        ctx_analysis = successful_tests.groupby('ctx_size').agg({
            'tokens_per_sec': ['mean', 'max', 'count']
        }).round(2)
        ctx_analysis.columns = ['Avg_TPS', 'Max_TPS', 'Count']
        print(ctx_analysis.to_string())
        
        print(f"\nPERFORMANCE BY BATCH SIZE:")
        batch_analysis = successful_tests.groupby('batch_size').agg({
            'tokens_per_sec': ['mean', 'max', 'count']
        }).round(2)
        batch_analysis.columns = ['Avg_TPS', 'Max_TPS', 'Count']
        print(batch_analysis.to_string())
        
        print(f"\nPERFORMANCE BY THREAD COUNT:")
        thread_analysis = successful_tests.groupby('threads').agg({
            'tokens_per_sec': ['mean', 'max', 'count']
        }).round(2)
        thread_analysis.columns = ['Avg_TPS', 'Max_TPS', 'Count']
        print(thread_analysis.to_string())
        
        # Top 5 configurations
        print(f"\nTOP 5 CONFIGURATIONS:")
        top_5 = successful_tests.nlargest(5, 'tokens_per_sec')[
            ['test_id', 'n_gpu_layers', 'ctx_size', 'batch_size', 'threads', 'tokens_per_sec']
        ]
        print(top_5.to_string(index=False))
        
        # Memory lock analysis
        if 'mlock' in successful_tests.columns:
            print(f"\nMEMORY LOCK IMPACT:")
            mlock_analysis = successful_tests.groupby('mlock')['tokens_per_sec'].agg(['mean', 'count']).round(2)
            print(mlock_analysis.to_string())
        
        # Failure analysis
        if len(failed_tests) > 0:
            print(f"\nFAILURE ANALYSIS:")
            print(f"Common failure reasons:")
            failure_reasons = failed_tests['error_message'].value_counts().head(5)
            for reason, count in failure_reasons.items():
                print(f"  '{reason}': {count} times")
        
        # Recommendations
        print(f"\nRECOMMENDATIONS:")
        
        # GPU layers recommendation
        best_gpu_layers = successful_tests.groupby('n_gpu_layers')['tokens_per_sec'].mean().idxmax()
        print(f"  • Optimal GPU layers: {best_gpu_layers}")
        
        # Context size recommendation
        best_ctx_size = successful_tests.groupby('ctx_size')['tokens_per_sec'].mean().idxmax()
        print(f"  • Optimal context size: {best_ctx_size}")
        
        # Batch size recommendation
        best_batch_size = successful_tests.groupby('batch_size')['tokens_per_sec'].mean().idxmax()
        print(f"  • Optimal batch size: {best_batch_size}")
        
        # Thread recommendation
        best_threads = successful_tests.groupby('threads')['tokens_per_sec'].mean().idxmax()
        print(f"  • Optimal thread count: {best_threads}")
        
        # Generate llama-server command
        print(f"\nRECOMMENDED LLAMA-SERVER COMMAND:")
        cmd = f"""llama-server \\
    -m YOUR_MODEL.gguf \\
    --port 8081 \\
    --jinja \\
    --n-gpu-layers {int(best_config['n_gpu_layers'])} \\
    --threads {int(best_config['threads'])} \\
    --ctx-size {int(best_config['ctx_size'])} \\
    --batch-size {int(best_config['batch_size'])} \\
    --ubatch-size {int(best_config['ubatch_size'])} \\
    --keep {int(best_config['keep'])} \\
    --defrag-thold {best_config['defrag_thold']} \\
    --parallel {int(best_config['parallel'])}"""
        
        if best_config['mlock']:
            cmd += " \\\n    --mlock"
        
        print(cmd)
        
    except Exception as e:
        print(f"Error analyzing CSV: {e}")

def main():
    """Main function"""
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    else:
        # Look for default CSV files
        quick_csv = "config_test_results_quick.csv"
        full_csv = "config_test_results.csv"
        
        if os.path.exists(quick_csv):
            csv_file = quick_csv
        elif os.path.exists(full_csv):
            csv_file = full_csv
        else:
            print("Usage: python analyze_results.py [csv_file]")
            print("No CSV files found in current directory.")
            print("Run the config tester first to generate results.")
            return
    
    print(f"Analyzing results from: {csv_file}")
    analyze_csv_results(csv_file)

if __name__ == "__main__":
    main() 
