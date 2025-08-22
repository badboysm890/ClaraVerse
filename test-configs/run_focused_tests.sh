#!/bin/bash

echo "🎯 Starting Focused First Token Performance Tests"
echo "=================================================="

# Check if dashboard is running
if curl -s http://localhost:5002/api/health > /dev/null 2>&1; then
    echo "✅ Dashboard is already running"
else
    echo "🚀 Starting dashboard server in background..."
    python3 dashboard_server.py &
    DASHBOARD_PID=$!
    sleep 3
    echo "📊 Dashboard available at: http://localhost:5002"
fi

echo ""
echo "🧪 Starting focused first token tests..."
echo "⏱️  This will test ~600 configurations focused on first token speed"
echo "🎯 Results will be combined with existing data in the dashboard"
echo ""
echo "📈 Monitor progress at: http://localhost:5002"
echo "Press Ctrl+C to stop tests"
echo "=================================================="
echo ""

# Make the script executable and run it
chmod +x focused_first_token_tests.py

# Run the focused tests
python3 focused_first_token_tests.py

echo ""
echo "🎉 Focused tests completed!"
echo "📊 View results at: http://localhost:5002"
echo "🎯 Look for configurations with best first token times!" 
