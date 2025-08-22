#!/bin/bash

echo "🚀 Starting Beautiful Performance Dashboard"
echo "==============================================="

# Install dependencies
echo "📦 Installing dashboard dependencies..."
pip install -r requirements_dashboard.txt

echo ""
echo "🌐 Starting web dashboard server..."
echo "💡 The dashboard will be available at:"
echo "   http://localhost:5002"
echo ""
echo "📊 This dashboard shows:"
echo "   • Real-time performance charts"
echo "   • Live statistics"
echo "   • Best configuration tracking"
echo "   • Beautiful visualizations with Chart.js"
echo ""
echo "To stop: Press Ctrl+C"
echo "==============================================="
echo ""

# Start the dashboard server
python3 dashboard_server.py 
