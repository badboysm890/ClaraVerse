#!/bin/bash

echo "🧪 Test Building ComfyUI Docker Container with Custom Nodes..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the docker directory
cd "$SCRIPT_DIR"

echo "🔨 Building ComfyUI container locally (test build)..."
echo "   - Acly's ComfyUI Tooling Nodes"
echo "   - Jags111's Efficiency Nodes"
echo ""

# Build the container locally for testing
docker build \
  -f Dockerfile.comfyui \
  -t angela-comfyui-test:latest \
  .

if [ $? -eq 0 ]; then
  echo "✅ Test build successful!"
  echo ""
  echo "🚀 You can test it with:"
  echo "   docker run -p 8188:8188 angela-comfyui-test:latest"
  echo ""
  echo "📦 Included Custom Nodes:"
  echo "   ✅ ComfyUI Manager"
  echo "   ✅ ControlNet Auxiliary"
  echo "   ✅ ComfyUI Essentials"
  echo "   ✅ Custom Scripts"
  echo "   ✅ Acly's Tooling Nodes"
  echo "   ✅ Jags111's Efficiency Nodes"
  echo ""
  echo "🎯 If test works, run: ./build-and-push-comfyui.sh"
else
  echo "❌ Test build failed!"
  exit 1
fi 
