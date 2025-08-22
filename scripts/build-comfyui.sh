#!/bin/bash

# ComfyUI Docker Build Script for angela
set -e

echo "🎨 Building angela ComfyUI Docker Image..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    DOCKER_ARCH="amd64"
elif [[ "$ARCH" == "arm64" ]] || [[ "$ARCH" == "aarch64" ]]; then
    DOCKER_ARCH="arm64"
else
    echo "⚠️  Unsupported architecture: $ARCH"
    exit 1
fi

echo "🔧 Detected architecture: $ARCH (Docker: $DOCKER_ARCH)"

# Set image name with architecture tag
IMAGE_NAME="angela17verse/angela-comfyui"
TAG="latest-$DOCKER_ARCH"
FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"

echo "🏗️  Building Docker image: $FULL_IMAGE_NAME"

# Build the Docker image
docker build \
    --platform linux/$DOCKER_ARCH \
    --file docker/Dockerfile.comfyui \
    --tag "$FULL_IMAGE_NAME" \
    --tag "$IMAGE_NAME:latest" \
    .

if [ $? -eq 0 ]; then
    echo "✅ ComfyUI Docker image built successfully!"
    echo "📦 Image: $FULL_IMAGE_NAME"
    
    # Show image size
    echo "📏 Image size:"
    docker images "$IMAGE_NAME" | head -2
    
    echo ""
    echo "🚀 You can now start angela and use the bundled ComfyUI!"
    echo "   • ComfyUI will be available at http://localhost:8188"
    echo "   • Access ComfyUI Manager through the Image Generation page"
    echo "   • First startup may take a few minutes to download models"
else
    echo "❌ Failed to build ComfyUI Docker image"
    exit 1
fi

# Optional: Test the image
read -p "🧪 Do you want to test the image now? (y/N): " test_image
if [[ "$test_image" =~ ^[Yy]$ ]]; then
    echo "🧪 Testing ComfyUI container..."
    
    # Stop any existing container
    docker stop angela_comfyui_test 2>/dev/null || true
    docker rm angela_comfyui_test 2>/dev/null || true
    
    # Run test container
    echo "🔄 Starting test container..."
    docker run -d \
        --name angela_comfyui_test \
        --platform linux/$DOCKER_ARCH \
        -p 8188:8188 \
        --gpus all \
        "$FULL_IMAGE_NAME"
    
    echo "⏳ Waiting for ComfyUI to start (30 seconds)..."
    sleep 30
    
    # Test if ComfyUI is responding
    if curl -s -f http://localhost:8188/ > /dev/null; then
        echo "✅ ComfyUI is running successfully!"
        echo "🌐 Access it at: http://localhost:8188"
        echo ""
        echo "🛑 To stop the test container:"
        echo "   docker stop angela_comfyui_test && docker rm angela_comfyui_test"
    else
        echo "❌ ComfyUI test failed - container may still be starting"
        echo "📋 Check logs with: docker logs angela_comfyui_test"
    fi
fi 
