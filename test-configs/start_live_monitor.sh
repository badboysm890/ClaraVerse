#!/bin/bash

echo "🚀 Starting Live Correlation Monitor"
echo "📋 Installing visualization dependencies..."

# Install additional dependencies if needed
pip install -r requirements_viz.txt

echo ""
echo "🔴 Starting live monitor - this will open a matplotlib window"
echo "💡 The monitor will read from config_test_results_quick.csv"
echo "📊 Charts update every second as new results come in"
echo ""
echo "To stop: Close the matplotlib window or press Ctrl+C"
echo ""

# Start the monitor
python live_correlation_monitor.py 
