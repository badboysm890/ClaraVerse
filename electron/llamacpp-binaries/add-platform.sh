#!/bin/bash

# Helper script for adding new platform support to llama-swap
# Usage: ./add-platform.sh <platform-arch> <binary-source-dir>
# Example: ./add-platform.sh linux-x64 /path/to/linux/binaries

set -e

PLATFORM_ARCH="$1"
SOURCE_DIR="$2"

if [ -z "$PLATFORM_ARCH" ] || [ -z "$SOURCE_DIR" ]; then
    echo "Usage: $0 <platform-arch> <binary-source-dir>"
    echo "Example: $0 linux-x64 /path/to/linux/binaries"
    echo ""
    echo "Supported platform-arch values:"
    echo "  - darwin-x64 (macOS Intel)"
    echo "  - linux-x64 (Linux x64)"
    echo "  - linux-arm64 (Linux ARM64)"
    echo "  - win32-x64 (Windows x64)"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory '$SOURCE_DIR' does not exist"
    exit 1
fi

PLATFORM_DIR="$PLATFORM_ARCH"
TARGET_DIR="./$PLATFORM_DIR"

echo "Adding platform support for: $PLATFORM_ARCH"
echo "Source directory: $SOURCE_DIR"
echo "Target directory: $TARGET_DIR"

# Create platform directory
mkdir -p "$TARGET_DIR"

# Determine expected binary names based on platform
case "$PLATFORM_ARCH" in
    "darwin-x64")
        SWAP_BINARY="llama-swap-darwin-x64"
        SERVER_BINARY="llama-server"
        LIB_PATTERN="*.dylib"
        SHADER_PATTERN="*.metal"
        ;;
    "linux-x64")
        SWAP_BINARY="llama-swap-linux-x64"
        SERVER_BINARY="llama-server"
        LIB_PATTERN="*.so"
        SHADER_PATTERN=""
        ;;
    "linux-arm64")
        SWAP_BINARY="llama-swap-linux-arm64"
        SERVER_BINARY="llama-server"
        LIB_PATTERN="*.so"
        SHADER_PATTERN=""
        ;;
    "win32-x64")
        SWAP_BINARY="llama-swap-win32-x64.exe"
        SERVER_BINARY="llama-server.exe"
        LIB_PATTERN="*.dll"
        SHADER_PATTERN=""
        ;;
    *)
        echo "Error: Unsupported platform-arch: $PLATFORM_ARCH"
        exit 1
        ;;
esac

# Copy binaries
echo "Copying binaries..."
if [ -f "$SOURCE_DIR/$SWAP_BINARY" ]; then
    cp "$SOURCE_DIR/$SWAP_BINARY" "$TARGET_DIR/"
    echo "  ✅ $SWAP_BINARY"
else
    echo "  ❌ $SWAP_BINARY not found in source directory"
fi

if [ -f "$SOURCE_DIR/$SERVER_BINARY" ]; then
    cp "$SOURCE_DIR/$SERVER_BINARY" "$TARGET_DIR/"
    echo "  ✅ $SERVER_BINARY"
else
    echo "  ❌ $SERVER_BINARY not found in source directory"
fi

# Copy libraries
echo "Copying libraries..."
if [ -n "$LIB_PATTERN" ]; then
    LIB_COUNT=$(find "$SOURCE_DIR" -maxdepth 1 -name "$LIB_PATTERN" | wc -l)
    if [ "$LIB_COUNT" -gt 0 ]; then
        cp "$SOURCE_DIR"/$LIB_PATTERN "$TARGET_DIR/" 2>/dev/null || true
        echo "  ✅ Copied $LIB_COUNT library files"
    else
        echo "  ⚠️  No library files found matching $LIB_PATTERN"
    fi
fi

# Copy headers
echo "Copying headers..."
HEADER_COUNT=$(find "$SOURCE_DIR" -maxdepth 1 -name "*.h" | wc -l)
if [ "$HEADER_COUNT" -gt 0 ]; then
    cp "$SOURCE_DIR"/*.h "$TARGET_DIR/" 2>/dev/null || true
    echo "  ✅ Copied $HEADER_COUNT header files"
else
    echo "  ⚠️  No header files found"
fi

# Copy shaders (if applicable)
if [ -n "$SHADER_PATTERN" ]; then
    echo "Copying shaders..."
    SHADER_COUNT=$(find "$SOURCE_DIR" -maxdepth 1 -name "$SHADER_PATTERN" | wc -l)
    if [ "$SHADER_COUNT" -gt 0 ]; then
        cp "$SOURCE_DIR"/$SHADER_PATTERN "$TARGET_DIR/" 2>/dev/null || true
        echo "  ✅ Copied $SHADER_COUNT shader files"
    else
        echo "  ⚠️  No shader files found matching $SHADER_PATTERN"
    fi
fi

# Make binaries executable
echo "Setting executable permissions..."
chmod +x "$TARGET_DIR/$SWAP_BINARY" 2>/dev/null || true
chmod +x "$TARGET_DIR/$SERVER_BINARY" 2>/dev/null || true

echo ""
echo "Platform setup complete for $PLATFORM_ARCH!"
echo ""
echo "Next steps:"
echo "1. Update platformManager.cjs:"
echo "   - Set 'supported: true' for '$PLATFORM_ARCH' in getSupportedPlatforms()"
echo "2. Test the platform:"
echo "   - Run: node -e \"const LlamaSwapService = require('./llamaSwapService.cjs'); const service = new LlamaSwapService(); console.log(service.getPlatformInfo());\""
echo "3. Validate binaries:"
echo "   - Run: node -e \"const LlamaSwapService = require('./llamaSwapService.cjs'); const service = new LlamaSwapService(); service.validateBinaries().then(() => console.log('✅ Success')).catch(console.error);\""
echo ""
echo "Directory contents:"
ls -la "$TARGET_DIR" 