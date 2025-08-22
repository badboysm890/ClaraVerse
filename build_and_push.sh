#!/bin/bash
set -e

# Configuration
IMAGE_NAME="angela17verse/angela-interpreter"
TAG="latest"
DOCKERFILE_PATH="./angela_interpreter_dockerstuff/Dockerfile"  # Updated path to Dockerfile

# Login to Docker Hub - uncomment and run manually if not logged in
# docker login -u angela17verse

# Clean up any existing builder instances
docker buildx ls | grep -q multiarch-builder && docker buildx rm multiarch-builder || true
docker context rm multiarch-context 2>/dev/null || true

# Create a new context and builder
docker context create multiarch-context 2>/dev/null || true
docker buildx create --name multiarch-builder --driver docker-container --driver-opt network=host --use multiarch-context

# Build for multiple platforms and push to Docker Hub
echo "Building and pushing multi-architecture image: ${IMAGE_NAME}:${TAG}"
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ${IMAGE_NAME}:${TAG} \
  --push \
  -f ${DOCKERFILE_PATH} .

echo "Successfully built and pushed ${IMAGE_NAME}:${TAG} for multiple architectures"

# Optional: List the supported architectures of the pushed image
echo "Listing supported architectures:"
docker buildx imagetools inspect ${IMAGE_NAME}:${TAG}

# Clean up
docker buildx rm multiarch-builder
docker context rm multiarch-context

echo "Build and push completed successfully!" 
