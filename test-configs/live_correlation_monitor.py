#!/usr/bin/env python3
"""
Live Correlation Matrix Monitor

Monitors the test results CSV file and shows live correlation analysis
between configuration parameters and performance metrics.
"""

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import time
import os
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class LiveCorrelationMonitor:
    def __init__(self, csv_file="config_test_results_quick.csv"):
        self.csv_file = csv_file
        self.last_size = 0
        self.fig, self.axes = plt.subplots(2, 2, figsize=(15, 12))
        self.fig.suptitle('Live Performance Correlation Analysis', fontsize=16)
        
        # Configure matplotlib for interactive mode
        plt.ion()
        plt.show()
        
        # Key columns for analysis
        self.performance_cols = ['tokens_per_sec', 'total_time_sec', 'first_token_time_ms']
        self.config_cols = ['threads', 'ctx_size', 'parallel', 'batch_size', 'ubatch_size', 'n_gpu_layers']
        
    def safe_read_csv(self):
        """Safely read the CSV file without interfering with the test"""
        try:
            if not os.path.exists(self.csv_file):
                return None
            
            # Check if file has grown
            current_size = os.path.getsize(self.csv_file)
            if current_size <= self.last_size:
                return None
            
            self.last_size = current_size
            
            # Read with pipe separator
            df = pd.read_csv(self.csv_file, sep='|', on_bad_lines='skip')
            
            # Filter only successful tests
            if 'success' in df.columns:
                df = df[df['success'] == True]
            
            if len(df) < 2:
                return None
                
            return df
            
        except Exception as e:
            print(f"Error reading CSV: {e}")
            return None
    
    def create_correlation_heatmap(self, df, ax, title):
        """Create correlation heatmap"""
        ax.clear()
        
        # Select numeric columns for correlation
        numeric_cols = self.config_cols + self.performance_cols
        available_cols = [col for col in numeric_cols if col in df.columns]
        
        if len(available_cols) < 2:
            ax.text(0.5, 0.5, 'Insufficient data', ha='center', va='center', transform=ax.transAxes)
            ax.set_title(title)
            return
        
        corr_data = df[available_cols].corr()
        
        # Create heatmap
        sns.heatmap(corr_data, annot=True, cmap='RdYlBu_r', center=0, 
                   square=True, ax=ax, cbar_kws={'shrink': 0.8}, fmt='.2f')
        ax.set_title(title)
        
    def create_performance_scatter(self, df, ax):
        """Create scatter plot of key performance metrics"""
        ax.clear()
        
        if 'tokens_per_sec' not in df.columns or 'first_token_time_ms' not in df.columns:
            ax.text(0.5, 0.5, 'Waiting for performance data...', ha='center', va='center', transform=ax.transAxes)
            ax.set_title('Performance Scatter')
            return
        
        # Color by threads
        if 'threads' in df.columns:
            scatter = ax.scatter(df['first_token_time_ms'], df['tokens_per_sec'], 
                               c=df['threads'], cmap='viridis', alpha=0.7, s=60)
            plt.colorbar(scatter, ax=ax, label='Threads')
        else:
            ax.scatter(df['first_token_time_ms'], df['tokens_per_sec'], alpha=0.7)
        
        ax.set_xlabel('First Token Time (ms)')
        ax.set_ylabel('Tokens per Second')
        ax.set_title('Performance: Speed vs Latency')
        ax.grid(True, alpha=0.3)
    
    def create_config_impact(self, df, ax):
        """Show impact of different configurations on performance"""
        ax.clear()
        
        if 'tokens_per_sec' not in df.columns:
            ax.text(0.5, 0.5, 'Waiting for data...', ha='center', va='center', transform=ax.transAxes)
            ax.set_title('Configuration Impact')
            return
        
        # Group by threads and show average performance
        if 'threads' in df.columns and len(df) > 1:
            thread_perf = df.groupby('threads')['tokens_per_sec'].agg(['mean', 'std']).reset_index()
            
            if len(thread_perf) > 1:
                bars = ax.bar(thread_perf['threads'], thread_perf['mean'], 
                             yerr=thread_perf['std'], capsize=5, alpha=0.7)
                ax.set_xlabel('Thread Count')
                ax.set_ylabel('Average Tokens/sec')
                ax.set_title('Performance by Thread Count')
                ax.grid(True, alpha=0.3)
                
                # Add value labels on bars
                for bar, mean_val in zip(bars, thread_perf['mean']):
                    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                           f'{mean_val:.1f}', ha='center', va='bottom')
            else:
                ax.text(0.5, 0.5, 'Need more thread variations', ha='center', va='center', transform=ax.transAxes)
        else:
            ax.text(0.5, 0.5, 'Analyzing thread impact...', ha='center', va='center', transform=ax.transAxes)
        
        ax.set_title('Configuration Impact on Performance')
    
    def create_trend_analysis(self, df, ax):
        """Show performance trends over time"""
        ax.clear()
        
        if len(df) < 3:
            ax.text(0.5, 0.5, f'Collecting data... ({len(df)} tests completed)', 
                   ha='center', va='center', transform=ax.transAxes)
            ax.set_title('Performance Trends')
            return
        
        # Plot tokens_per_sec over test progression
        if 'test_id' in df.columns and 'tokens_per_sec' in df.columns:
            ax.plot(df['test_id'], df['tokens_per_sec'], 'o-', alpha=0.7, linewidth=2)
            ax.set_xlabel('Test Number')
            ax.set_ylabel('Tokens per Second')
            ax.set_title('Performance Over Test Progression')
            ax.grid(True, alpha=0.3)
            
            # Add trend line
            if len(df) > 3:
                z = np.polyfit(df['test_id'], df['tokens_per_sec'], 1)
                p = np.poly1d(z)
                ax.plot(df['test_id'], p(df['test_id']), "--", alpha=0.8, color='red')
                
                # Show current best
                best_perf = df['tokens_per_sec'].max()
                ax.axhline(y=best_perf, color='green', linestyle=':', alpha=0.7, 
                          label=f'Best: {best_perf:.2f}')
                ax.legend()
        
    def update_display(self, df):
        """Update all plots with new data"""
        try:
            # Main correlation heatmap
            self.create_correlation_heatmap(df, self.axes[0,0], 'Parameter Correlations')
            
            # Performance scatter
            self.create_performance_scatter(df, self.axes[0,1])
            
            # Configuration impact
            self.create_config_impact(df, self.axes[1,0])
            
            # Trend analysis
            self.create_trend_analysis(df, self.axes[1,1])
            
            # Add summary text
            self.fig.suptitle(f'Live Performance Analysis - {len(df)} tests completed - {datetime.now().strftime("%H:%M:%S")}', 
                             fontsize=16)
            
            plt.tight_layout()
            plt.draw()
            plt.pause(0.1)
            
        except Exception as e:
            print(f"Error updating display: {e}")
    
    def print_summary(self, df):
        """Print summary statistics to console"""
        if len(df) < 2:
            return
            
        print(f"\n{'='*60}")
        print(f"LIVE ANALYSIS UPDATE - {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'='*60}")
        print(f"Tests completed: {len(df)}")
        
        if 'tokens_per_sec' in df.columns:
            print(f"Best performance: {df['tokens_per_sec'].max():.2f} tokens/sec")
            print(f"Average performance: {df['tokens_per_sec'].mean():.2f} tokens/sec")
            
            # Show best config so far
            best_idx = df['tokens_per_sec'].idxmax()
            best_row = df.loc[best_idx]
            print(f"\nCurrent best configuration:")
            for col in ['threads', 'ctx_size', 'parallel', 'batch_size', 'n_gpu_layers']:
                if col in best_row:
                    print(f"  {col}: {best_row[col]}")
            print(f"  Performance: {best_row['tokens_per_sec']:.2f} tokens/sec")
    
    def run(self):
        """Main monitoring loop"""
        print("🔴 LIVE CORRELATION MONITOR STARTED")
        print(f"📊 Monitoring: {self.csv_file}")
        print("📈 Charts will update as new test results come in...")
        print("💡 Close the matplotlib window to stop monitoring")
        print("-" * 60)
        
        update_count = 0
        
        try:
            while plt.get_fignums():  # Continue while window is open
                df = self.safe_read_csv()
                
                if df is not None and len(df) > 0:
                    self.update_display(df)
                    
                    # Print summary every 5 updates
                    if update_count % 5 == 0:
                        self.print_summary(df)
                    
                    update_count += 1
                
                time.sleep(1)  # Update every second
                
        except KeyboardInterrupt:
            print("\n🛑 Monitor stopped by user")
        except Exception as e:
            print(f"❌ Monitor error: {e}")
        finally:
            plt.close('all')
            print("📊 Live monitor closed")

def main():
    """Main function"""
    # Check if CSV file exists or wait for it
    csv_file = "config_test_results_quick.csv"
    
    if not os.path.exists(csv_file):
        print(f"⏳ Waiting for test results file: {csv_file}")
        print("💡 Make sure the test is running in another terminal")
        
        # Wait for file to appear
        while not os.path.exists(csv_file):
            time.sleep(2)
            print(".", end="", flush=True)
        print(f"\n✅ Found {csv_file}!")
    
    monitor = LiveCorrelationMonitor(csv_file)
    monitor.run()

if __name__ == "__main__":
    main() 
