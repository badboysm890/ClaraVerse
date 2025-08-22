#!/bin/bash

# angela MCP Server Build Script for All Platforms
# Builds for Windows, Linux, and macOS (Intel + Apple Silicon)

set -e  # Exit on any error

echo "🚀 Building angela Python MCP Server for All Platforms..."
echo "========================================================"

# Set the output directory
OUTPUT_DIR="../electron/mcp"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Function to build for a specific platform and architecture
build_for_platform() {
    local os=$1
    local arch=$2
    local output_name=$3
    local description=$4
    
    echo "📦 Building for $description ($os/$arch)..."
    
    # Set Go environment variables
    export GOOS=$os
    export GOARCH=$arch
    
    # Build the binary
    if go build -o "$OUTPUT_DIR/$output_name" python-mcp-server.go; then
        echo "✅ Successfully built $description"
        
        # Get file size
        local size=$(ls -lh "$OUTPUT_DIR/$output_name" | awk '{print $5}')
        echo "   📁 Output: $OUTPUT_DIR/$output_name ($size)"
    else
        echo "❌ Failed to build for $description"
        exit 1
    fi
    
    echo ""
}

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Error: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo "🔧 Go version: $GO_VERSION"
echo ""

# Build for Windows (64-bit)
build_for_platform "windows" "amd64" "python-mcp-server-windows.exe" "Windows (x64)"

# Build for Linux (64-bit)
build_for_platform "linux" "amd64" "python-mcp-server-linux" "Linux (x64)"

# Build for macOS Intel (64-bit)
build_for_platform "darwin" "amd64" "python-mcp-server-mac-intel" "macOS Intel (x64)"

# Build for macOS Apple Silicon (ARM64)
build_for_platform "darwin" "arm64" "python-mcp-server-mac-arm64" "macOS Apple Silicon (ARM64)"

# Create universal binary for macOS (Intel + ARM64)
echo "🔗 Creating universal binary for macOS (Intel + ARM64)..."
if command -v lipo &> /dev/null; then
    if lipo -create \
        "$OUTPUT_DIR/python-mcp-server-mac-intel" \
        "$OUTPUT_DIR/python-mcp-server-mac-arm64" \
        -output "$OUTPUT_DIR/python-mcp-server-mac-universal"; then
        
        echo "✅ Successfully created universal binary"
        
        # Get file size
        size=$(ls -lh "$OUTPUT_DIR/python-mcp-server-mac-universal" | awk '{print $5}')
        echo "   📁 Output: $OUTPUT_DIR/python-mcp-server-mac-universal ($size)"
    else
        echo "❌ Failed to create universal binary"
        exit 1
    fi
else
    echo "⚠️  Warning: lipo not found, skipping universal binary creation"
fi

echo ""
echo "🎉 Build completed successfully!"
echo "========================================================"
echo ""
echo "📋 Generated files:"
echo "   • $OUTPUT_DIR/python-mcp-server-windows.exe (Windows x64)"
echo "   • $OUTPUT_DIR/python-mcp-server-linux (Linux x64)"
echo "   • $OUTPUT_DIR/python-mcp-server-mac-intel (macOS Intel)"
echo "   • $OUTPUT_DIR/python-mcp-server-mac-arm64 (macOS Apple Silicon)"
if [ -f "$OUTPUT_DIR/python-mcp-server-mac-universal" ]; then
    echo "   • $OUTPUT_DIR/python-mcp-server-mac-universal (macOS Universal)"
fi
echo ""
echo "🔍 File details:"
ls -lh "$OUTPUT_DIR"/python-mcp-server-*

echo ""
echo "✨ All files are ready for Electron packaging!"
echo ""
echo "📝 Usage notes:"
echo "   • Windows: Use python-mcp-server-windows.exe"
echo "   • Linux: Use python-mcp-server-linux"
echo "   • macOS Intel: Use python-mcp-server-mac-intel"
echo "   • macOS Apple Silicon: Use python-mcp-server-mac-arm64"
echo "   • macOS Universal: Use python-mcp-server-mac-universal (recommended for distribution)" 
