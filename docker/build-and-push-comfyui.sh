#!/bin/bash

echo "🎨 Building and Pushing ComfyUI Docker Container for angela..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📂 Script directory: $SCRIPT_DIR"
echo "📂 Project root: $PROJECT_ROOT"

# Change to the docker directory
cd "$SCRIPT_DIR"

# Get current date for versioning
DATE_TAG=$(date +%Y%m%d)
LATEST_TAG="latest"

# Docker Hub repository name
REPO_NAME="angela17verse/angela-comfyui"

echo "🔨 Building ComfyUI container with custom nodes..."
echo "   - Acly's ComfyUI Tooling Nodes"
echo "   - Jags111's Efficiency Nodes"
echo ""

# Build the container with multiple tags
docker build \
  -f Dockerfile.comfyui \
  -t ${REPO_NAME}:${LATEST_TAG} \
  -t ${REPO_NAME}:${DATE_TAG} \
  -t ${REPO_NAME}:with-custom-nodes \
  .

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ ComfyUI container built successfully!"
echo ""

# Check if user is logged into Docker Hub
echo "🔐 Checking Docker Hub authentication..."
if ! docker info | grep -q "Username:"; then
  echo "⚠️  You need to log in to Docker Hub first:"
  echo "   docker login"
  echo ""
  read -p "Would you like to log in now? (y/n): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker login
    if [ $? -ne 0 ]; then
      echo "❌ Docker login failed!"
      exit 1
    fi
  else
    echo "❌ Cannot push without Docker Hub authentication"
    exit 1
  fi
fi

echo "🚀 Pushing to Docker Hub..."
echo "   Repository: ${REPO_NAME}"
echo "   Tags: ${LATEST_TAG}, ${DATE_TAG}, with-custom-nodes"
echo ""

# Push all tags
echo "📤 Pushing latest tag..."
docker push ${REPO_NAME}:${LATEST_TAG}

echo "📤 Pushing date tag..."
docker push ${REPO_NAME}:${DATE_TAG}

echo "📤 Pushing custom nodes tag..."
docker push ${REPO_NAME}:with-custom-nodes

if [ $? -eq 0 ]; then
  echo ""
  echo "🎉 Successfully pushed ComfyUI container to Docker Hub!"
  echo ""
  echo "📋 Available tags:"
  echo "   - ${REPO_NAME}:latest"
  echo "   - ${REPO_NAME}:${DATE_TAG}"
  echo "   - ${REPO_NAME}:with-custom-nodes"
  echo ""
  echo "🔗 Docker Hub: https://hub.docker.com/r/angela17verse/angela-comfyui"
  echo ""
  echo "🚀 Users can now pull with:"
  echo "   docker pull ${REPO_NAME}:latest"
  echo ""
  echo "📦 Included Custom Nodes:"
  echo "   ✅ ComfyUI Manager (ltdrdata/ComfyUI-Manager)"
  echo "   ✅ ControlNet Auxiliary (Fannovel16/comfyui_controlnet_aux)"
  echo "   ✅ ComfyUI Essentials (cubiq/ComfyUI_essentials)"
  echo "   ✅ Custom Scripts (pythongosssss/ComfyUI-Custom-Scripts)"
  echo "   ✅ Acly's Tooling Nodes (Acly/comfyui-tooling-nodes)"
  echo "   ✅ Jags111's Efficiency Nodes (jags111/efficiency-nodes-comfyui)"
else
  echo "❌ Push failed!"
  exit 1
fi 
