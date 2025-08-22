#!/bin/bash

# angela Flow SDK Installation Script
# This script sets up the development environment and builds the SDK

echo "🌟 angela Flow SDK Installation"
echo "==============================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "14" ]; then
    echo "❌ Node.js version 14 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Navigate to SDK directory
if [ ! -d "sdk" ]; then
    echo "❌ SDK directory not found. Please run this script from the project root."
    exit 1
fi

cd sdk

echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "🔧 Building SDK..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Failed to build SDK"
    exit 1
fi

echo "🧪 Running tests..."
npm test

if [ $? -ne 0 ]; then
    echo "⚠️  Some tests failed, but SDK build completed"
else
    echo "✅ All tests passed"
fi

echo ""
echo "🎉 angela Flow SDK installation completed successfully!"
echo ""
echo "📁 SDK files are available in:"
echo "   • dist/angela-flow-sdk.umd.js (Browser)"
echo "   • dist/angela-flow-sdk.cjs.js (Node.js)"
echo "   • dist/angela-flow-sdk.esm.js (ES Modules)"
echo ""
echo "📚 Documentation:"
echo "   • README.md - Getting started guide"
echo "   • examples/ - Example usage"
echo ""
echo "🚀 Quick start:"
echo "   1. Export a flow from angela Agent Studio using 'SDK Export'"
echo "   2. Use the examples in examples/ directory"
echo "   3. Import and run flows in your JavaScript applications"
echo ""
echo "For more information, see the README.md file." 
