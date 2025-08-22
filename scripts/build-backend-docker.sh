#!/bin/bash

# Exit on any error
set -e

# Change to the backend directory
cd "$(dirname "$0")/../py_backend"

# Check if user is logged in to Docker Hub
if ! docker info 2>/dev/null | grep -q "Username: angela17verse"; then
    echo "Please log in to Docker Hub first"
    docker login -u angela17verse
fi

# Create and use buildx builder if it doesn't exist
if ! docker buildx ls | grep -q "angelabuilder"; then
    echo "Creating buildx builder..."
    docker buildx create --name angelabuilder --use
fi

# Build and push for both architectures
echo "Building and pushing Docker image..."
docker buildx build --platform linux/amd64,linux/arm64 \
    -t angela17verse/angela-backend:latest \
    -t angela17verse/angela-backend:1.0.0 \
    --push .

echo "Docker image built and pushed successfully!" 
