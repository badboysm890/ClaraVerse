#!/bin/bash

# Verification script for production builds
# This script builds the app and verifies that the binaries are properly packaged

set -e

echo "🔧 Building Clara for production..."
echo "================================="

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf release/

# Build the application
echo "📦 Building application..."
npm run electron:build

# Check if build succeeded
if [ ! -d "release" ]; then
  echo "❌ Build failed - no release directory found"
  exit 1
fi

# Find the built app (macOS)
APP_PATH=""
if [ -d "release/mac-arm64" ]; then
  APP_PATH=$(find release/mac-arm64 -name "*.app" -type d | head -1)
elif [ -d "release/mac" ]; then
  APP_PATH=$(find release/mac -name "*.app" -type d | head -1)
fi

if [ -z "$APP_PATH" ]; then
  echo "❌ Could not find built app"
  exit 1
fi

echo "✅ Built app found at: $APP_PATH"

# Check if binaries are included
BINARY_PATH="$APP_PATH/Contents/Resources/electron/llamacpp-binaries"
if [ ! -d "$BINARY_PATH" ]; then
  echo "❌ Binary directory not found in app bundle: $BINARY_PATH"
  exit 1
fi

echo "✅ Binary directory found: $BINARY_PATH"

# Check platform-specific directory
PLATFORM_PATH="$BINARY_PATH/darwin-arm64"
if [ ! -d "$PLATFORM_PATH" ]; then
  echo "❌ Platform-specific directory not found: $PLATFORM_PATH"
  exit 1
fi

echo "✅ Platform directory found: $PLATFORM_PATH"

# Check required binaries
REQUIRED_BINARIES=("llama-swap-darwin-arm64" "llama-server")
for binary in "${REQUIRED_BINARIES[@]}"; do
  BINARY_FILE="$PLATFORM_PATH/$binary"
  if [ ! -f "$BINARY_FILE" ]; then
    echo "❌ Required binary not found: $BINARY_FILE"
    exit 1
  fi
  
  if [ ! -x "$BINARY_FILE" ]; then
    echo "❌ Binary is not executable: $BINARY_FILE"
    exit 1
  fi
  
  echo "✅ Binary found and executable: $binary"
done

# List contents
echo ""
echo "📁 Binary directory contents:"
ls -la "$PLATFORM_PATH"

echo ""
echo "🎉 Build verification successful!"
echo ""
echo "To test the built app:"
echo "1. Install the app from release/ directory"
echo "2. Open the app"
echo "3. Go to Servers → LLM Service"
echo "4. Click 'Start' button"
echo "5. Verify it shows 'Service started successfully'" 