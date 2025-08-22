#!/usr/bin/env python3
"""
Dashboard Server for Live Performance Monitoring

Serves the HTML dashboard and provides API endpoints for real-time data.
"""

from flask import Flask, jsonify, render_template_string, send_from_directory, request
import pandas as pd
import os
import json
from datetime import datetime
import threading
import time

# Import the optimizer
try:
    from config_optimizer import LlamaConfigOptimizer
    OPTIMIZER_AVAILABLE = True
except ImportError:
    OPTIMIZER_AVAILABLE = False
    print("⚠️  Configuration optimizer not available. Install scikit-learn to enable optimization features.")

app = Flask(__name__)

class DataManager:
    def __init__(self, csv_file="config_test_results.csv"):
        self.csv_files = [
            csv_file,
            "config_test_results_quick.csv",  # Quick test results
            "smart_config_results.csv",  # Smart test results
            "focused_first_token_results.csv"  # Also check for focused results
        ]
        self.last_modified = {}
        self.cached_data = None
        self.lock = threading.Lock()
        
    def get_data(self):
        """Get current data from all available CSV files, using cache if files haven't changed"""
        try:
            # Check which files exist and their modification times
            current_files = {}
            for csv_file in self.csv_files:
                if os.path.exists(csv_file):
                    current_files[csv_file] = os.path.getmtime(csv_file)
            
            if not current_files:
                print("❌ No CSV files found")
                return {"tests": [], "last_update": None}
            
            with self.lock:
                # Check if any file has been modified
                files_changed = False
                for csv_file, mod_time in current_files.items():
                    if csv_file not in self.last_modified or mod_time > self.last_modified[csv_file]:
                        files_changed = True
                        break
                
                if not files_changed and self.cached_data:
                    return self.cached_data
                
                # Read fresh data from all files
                all_tests = []
                
                for csv_file in current_files.keys():
                    try:
                        print(f"📊 Reading {csv_file}...")
                        # First try to read with comma separation (default)
                        df = pd.read_csv(csv_file, on_bad_lines='skip')
                        
                        # If that fails or has only one column, try pipe separation
                        if len(df.columns) == 1:
                            df = pd.read_csv(csv_file, sep='|', on_bad_lines='skip')
                        
                        print(f"📋 Found {len(df)} rows and {len(df.columns)} columns in {csv_file}")
                        print(f"📝 Columns: {list(df.columns)}")
                        
                        if len(df) > 0:
                            # Convert to list of dictionaries
                            tests = df.to_dict('records')
                            
                            # Clean up data types and handle missing values
                            for test in tests:
                                for key, value in test.items():
                                    if pd.isna(value):
                                        test[key] = None
                                    elif isinstance(value, str) and value.strip() == '':
                                        test[key] = None
                                    elif key in ['first_token_time_ms', 'tokens_per_sec', 'total_time_sec', 'threads', 'ctx_size', 'batch_size', 'ubatch_size', 'parallel', 'n_gpu_layers']:
                                        try:
                                            test[key] = float(value) if value is not None else 0.0
                                        except (ValueError, TypeError):
                                            test[key] = 0.0
                                    elif key == 'success':
                                        test[key] = str(value).lower() in ['true', '1', 'yes', 'on']
                                
                                # Add source file info
                                test['source_file'] = csv_file
                            
                            all_tests.extend(tests)
                            print(f"✅ Loaded {len(tests)} tests from {csv_file}")
                            
                            # Show a sample of the data for debugging
                            if tests:
                                sample_test = tests[0]
                                print(f"📊 Sample test data: {sample_test}")
                        
                    except Exception as e:
                        print(f"❌ Error reading {csv_file}: {e}")
                        continue
                
                # Sort by test_id if available, otherwise by timestamp
                if all_tests:
                    if 'test_id' in all_tests[0]:
                        all_tests.sort(key=lambda x: x.get('test_id', 0))
                    else:
                        all_tests.sort(key=lambda x: x.get('timestamp', ''))
                
                successful_tests = [t for t in all_tests if t.get('success', False)]
                
                self.cached_data = {
                    "tests": all_tests,
                    "last_update": datetime.now().isoformat(),
                    "total_tests": len(all_tests),
                    "successful_tests": len(successful_tests),
                    "source_files": list(current_files.keys())
                }
                
                print(f"📈 Cache updated: {len(all_tests)} total tests, {len(successful_tests)} successful")
                
                # Update modification times
                self.last_modified = current_files
                
                return self.cached_data
                    
        except Exception as e:
            print(f"❌ Error in get_data: {e}")
            return {"tests": [], "last_update": None, "error": str(e)}

# Global data manager and optimizer
data_manager = DataManager()
if OPTIMIZER_AVAILABLE:
    optimizer = LlamaConfigOptimizer()

@app.route('/')
def dashboard():
    """Serve the main dashboard"""
    try:
        with open('dashboard.html', 'r') as f:
            return f.read()
    except FileNotFoundError:
        return """
        <h1>Dashboard Error</h1>
        <p>dashboard.html not found. Make sure the dashboard.html file is in the same directory as this server.</p>
        <p>Current directory: {}</p>
        """.format(os.getcwd()), 404

@app.route('/api/data')
def get_data():
    """API endpoint to get current test data"""
    try:
        data = data_manager.get_data()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e), "tests": []}), 500

@app.route('/api/status')
def get_status():
    """API endpoint to get server status"""
    existing_files = [f for f in data_manager.csv_files if os.path.exists(f)]
    return jsonify({
        "status": "running",
        "timestamp": datetime.now().isoformat(),
        "csv_files": data_manager.csv_files,
        "existing_files": existing_files,
        "csv_exists": len(existing_files) > 0,
        "optimizer_available": OPTIMIZER_AVAILABLE
    })

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/api/optimize', methods=['POST'])
def optimize_config():
    """API endpoint to get optimal configuration for given system specs"""
    if not OPTIMIZER_AVAILABLE:
        return jsonify({"error": "Optimizer not available. Install scikit-learn to enable optimization."}), 400
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Get system specs from request
        system_specs = {
            'cpu_cores': data.get('cpu_cores', 8),
            'gpu_memory_gb': data.get('gpu_memory_gb', 8),
            'system_memory_gb': data.get('system_memory_gb', 16)
        }
        
        priority = data.get('priority', 'balanced')
        
        # Train model if not already trained
        if not optimizer.model_trained:
            if not optimizer.load_models():
                print("🧠 Training new models...")
                result = optimizer.train_models()
                if not result:
                    return jsonify({"error": "Failed to train optimization models"}), 500
        
        # Get optimal configuration
        config = optimizer.optimize_config(system_specs, priority)
        
        if not config:
            return jsonify({"error": "Failed to find optimal configuration"}), 500
        
        return jsonify({
            "optimal_config": config,
            "system_specs": system_specs,
            "priority": priority,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Error in optimize_config: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/train-optimizer', methods=['POST'])
def train_optimizer():
    """API endpoint to train the optimization models"""
    if not OPTIMIZER_AVAILABLE:
        return jsonify({"error": "Optimizer not available. Install scikit-learn to enable optimization."}), 400
    
    try:
        print("🧠 Training optimization models...")
        result = optimizer.train_models()
        
        if result:
            return jsonify({
                "success": True,
                "training_results": result,
                "timestamp": datetime.now().isoformat()
            })
        else:
            return jsonify({"error": "Training failed"}), 500
            
    except Exception as e:
        print(f"❌ Error training optimizer: {e}")
        return jsonify({"error": str(e)}), 500

def monitor_csv_file():
    """Background thread to monitor CSV file changes"""
    print(f"📊 Monitoring CSV files: {', '.join(data_manager.csv_files)}")
    
    while True:
        try:
            if all(os.path.exists(csv_file) for csv_file in data_manager.csv_files):
                # Just trigger a data refresh by calling get_data
                data_manager.get_data()
            time.sleep(1)  # Check every second
        except Exception as e:
            print(f"Error in monitor thread: {e}")
            time.sleep(5)  # Wait longer on error

def main():
    """Main function to start the server"""
    print("🚀 Starting Performance Dashboard Server")
    print("-" * 50)
    
    # Check if dashboard.html exists
    if not os.path.exists('dashboard.html'):
        print("❌ Error: dashboard.html not found!")
        print("   Make sure dashboard.html is in the same directory as this server.")
        return
    
    # Check if any CSV files exist or create empty ones
    if not any(os.path.exists(csv_file) for csv_file in data_manager.csv_files):
        print(f"⏳ Waiting for CSV files: {', '.join(data_manager.csv_files)}")
        print("   The dashboard will show data once the test starts generating results.")
    else:
        print(f"✅ Found CSV files: {', '.join(data_manager.csv_files)}")
    
    # Start background monitor thread
    monitor_thread = threading.Thread(target=monitor_csv_file, daemon=True)
    monitor_thread.start()
    
    print(f"\n🌐 Dashboard will be available at:")
    print(f"   http://localhost:5002")
    print(f"   http://127.0.0.1:5002")
    print(f"\n📊 API endpoints:")
    print(f"   http://localhost:5002/api/data - Get test data")
    print(f"   http://localhost:5002/api/status - Get server status")
    print(f"   http://localhost:5002/api/health - Health check")
    print(f"\n💡 Open the URL in your browser to see the live dashboard!")
    print("-" * 50)
    
    try:
        # Start Flask server
        app.run(
            host='0.0.0.0',
            port=5002,
            debug=True,  # Set to True for development
            threaded=True,
            use_reloader=False  # Disable reloader to prevent double startup
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main() 
