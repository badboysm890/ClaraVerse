#!/bin/bash
"""
Install Machine Learning Dependencies for Smart Configuration Tester
"""

echo "🚀 Installing ML dependencies for Smart Configuration Tester..."
echo "This will install scikit-learn and numpy for predictive modeling"
echo ""

# Check if pip is available
if ! command -v pip &> /dev/null; then
    echo "❌ pip not found. Please install pip first."
    exit 1
fi

# Install the required packages
echo "📦 Installing scikit-learn..."
pip install scikit-learn

echo "📦 Installing numpy..."
pip install numpy

echo "📦 Installing requests (if not already installed)..."
pip install requests

echo ""
echo "✅ Installation complete!"
echo ""
echo "🧠 You can now use the Smart Configuration Tester with ML predictions:"
echo "   python smart_config_tester.py --sample-size 30"
echo ""
echo "📊 The smart tester will:"
echo "   1. Test ~30 strategic configurations (5-10 minutes)"
echo "   2. Train ML models on the results"
echo "   3. Predict performance for hundreds of other configurations"
echo "   4. Show you the top predicted configurations"
echo "" 
