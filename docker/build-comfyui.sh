#!/bin/bash

echo "🎨 Building ComfyUI Docker Container for angela..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📂 Script directory: $SCRIPT_DIR"
echo "📂 Project root: $PROJECT_ROOT"

# Change to the docker directory
cd "$SCRIPT_DIR"

echo "🔨 Building ComfyUI container..."
docker build \
  -f Dockerfile.comfyui \
  -t angela17verse/angela-comfyui:latest \
  -t angela17verse/angela-comfyui:$(date +%Y%m%d) \
  .

if [ $? -eq 0 ]; then
  echo "✅ ComfyUI container built successfully!"
  echo ""
  echo "🚀 You can now run it with:"
  echo "docker run -p 8188:8188 angela17verse/angela-comfyui:latest"
  echo ""
  echo "💡 Or start it through angela's interface"
else
  echo "❌ Build failed!"
  exit 1
fi 
