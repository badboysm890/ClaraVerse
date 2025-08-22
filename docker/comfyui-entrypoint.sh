#!/bin/bash

# ComfyUI Entrypoint Script for angela
set -e

echo "🎨 Starting ComfyUI for angela..."

# Set working directory
cd /app/ComfyUI

# Check if we have GPU support and upgrade PyTorch if needed
if command -v nvidia-smi &> /dev/null && nvidia-smi &> /dev/null 2>&1; then
    echo "✅ NVIDIA GPU detected, verifying CUDA PyTorch..."
    
    # Verify CUDA PyTorch is working (should already be installed from Dockerfile)
    if python3 -c "import torch; print('CUDA available:', torch.cuda.is_available()); exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
        echo "✅ CUDA PyTorch is working correctly"
        CUDA_VERSION=$(python3 -c "import torch; print(torch.version.cuda)" 2>/dev/null || echo "unknown")
        echo "   CUDA version: $CUDA_VERSION"
        export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
        COMFYUI_ARGS=""
    else
        echo "⚠️  CUDA PyTorch not working, falling back to CPU mode"
        export CUDA_VISIBLE_DEVICES=""
        COMFYUI_ARGS="--cpu"
    fi
else
    echo "⚠️  No NVIDIA GPU detected, using CPU mode"
    export CUDA_VISIBLE_DEVICES=""
    # Force CPU mode for ComfyUI
    COMFYUI_ARGS="--cpu"
fi

# Handle custom nodes: copy built-in nodes if volume is empty
echo "🔧 Checking custom node dependencies..."

# Check if custom_nodes directory is empty (due to volume mount)
if [ -d "custom_nodes" ] && [ -z "$(ls -A custom_nodes 2>/dev/null)" ]; then
    echo "📦 Copying built-in custom nodes to persistent volume..."
    
    # Copy built-in custom nodes from a backup location to the mounted volume
    # We need to rebuild the image with custom nodes in a different location first
    if [ -d "/app/ComfyUI_custom_nodes_backup" ]; then
        cp -r /app/ComfyUI_custom_nodes_backup/* custom_nodes/
        echo "✅ Built-in custom nodes copied successfully"
    else
        echo "📥 Installing ComfyUI-Manager..."
        cd custom_nodes
        git clone https://github.com/ltdrdata/ComfyUI-Manager.git
        cd ..
    fi
fi

# Install dependencies for custom nodes
if [ -d "custom_nodes" ]; then
    for node_dir in custom_nodes/*/; do
        if [ -f "${node_dir}requirements.txt" ] && [ ! -f "${node_dir}.deps_installed" ]; then
            echo "Installing dependencies for $(basename "$node_dir")"
            pip3 install -r "${node_dir}requirements.txt" --no-cache-dir || true
            touch "${node_dir}.deps_installed"
        fi
    done
fi

# Create extra_model_paths.yaml for easy model management
cat > extra_model_paths.yaml << EOF
# angela ComfyUI Model Paths Configuration
angela:
    base_path: /app/ComfyUI/
    
    checkpoints: models/checkpoints/
    vae: models/vae/
    loras: models/loras/
    controlnet: models/controlnet/
    clip: models/clip/
    unet: models/unet/
    upscale_models: models/upscale_models/
    
    # Custom paths for angela integration
    embeddings: models/embeddings/
    hypernetworks: models/hypernetworks/
    style_models: models/style_models/
    t2i_adapter: models/t2i_adapter/
EOF

echo "🚀 Starting ComfyUI server..."
echo "    • Port: 8188"
echo "    • Listen: 0.0.0.0"  
echo "    • GPU Support: $([ -n "$CUDA_VISIBLE_DEVICES" ] && echo "Enabled" || echo "Disabled")"
echo "    • Mode: $([ "$COMFYUI_ARGS" = "--cpu" ] && echo "CPU Only" || echo "GPU/CPU Auto")"

# Start ComfyUI with angela-optimized settings
exec python3 main.py \
    --listen 0.0.0.0 \
    --port 8188 \
    --enable-cors-header \
    --extra-model-paths-config extra_model_paths.yaml \
    --disable-metadata \
    $COMFYUI_ARGS 
