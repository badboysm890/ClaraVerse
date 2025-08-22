# angela ComfyUI Docker Container

A comprehensive ComfyUI Docker container for the angela AI ecosystem, pre-configured with essential custom nodes and optimizations.

## 🎨 What's Included

### Core Components
- **ComfyUI**: Latest version from the official repository
- **PyTorch with CUDA**: Pre-installed for GPU acceleration (CUDA 11.8)
- **Python 3.x**: Optimized environment with all dependencies

### 📦 Pre-installed Custom Nodes

| Node | Repository | Description |
|------|------------|-------------|
| **ComfyUI Manager** | `ltdrdata/ComfyUI-Manager` | Essential node management and package installation |
| **ControlNet Auxiliary** | `Fannovel16/comfyui_controlnet_aux` | ControlNet preprocessing nodes |
| **ComfyUI Essentials** | `cubiq/ComfyUI_essentials` | Essential utility nodes |
| **Custom Scripts** | `pythongosssss/ComfyUI-Custom-Scripts` | UI enhancements and workflow tools |
| **Acly's Tooling Nodes** | `Acly/comfyui-tooling-nodes` | Professional tooling and utility nodes |
| **Jags111's Efficiency Nodes** | `jags111/efficiency-nodes-comfyui` | Performance and workflow efficiency nodes |

## 🚀 Quick Start

### Basic Usage
```bash
docker pull angela17verse/angela-comfyui:latest
docker run -p 8188:8188 angela17verse/angela-comfyui:latest
```

### With GPU Support
```bash
docker run --gpus all -p 8188:8188 angela17verse/angela-comfyui:latest
```

### With Persistent Data
```bash
docker run --gpus all \
  -p 8188:8188 \
  -v $(pwd)/models:/app/ComfyUI/models \
  -v $(pwd)/output:/app/ComfyUI/output \
  -v $(pwd)/input:/app/ComfyUI/input \
  angela17verse/angela-comfyui:latest
```

## 📋 Available Tags

- `latest` - Latest stable build
- `with-custom-nodes` - Same as latest, explicitly tagged for custom nodes
- `YYYYMMDD` - Date-specific builds for version tracking

## 🔧 Configuration

### Environment Variables
- `COMFYUI_HOST`: Host interface (default: 0.0.0.0)
- `COMFYUI_PORT`: Port number (default: 8188)
- `COMFYUI_ARGS`: Additional ComfyUI arguments

### Volume Mounts
- `/app/ComfyUI/models` - Model files (checkpoints, VAE, LoRA, etc.)
- `/app/ComfyUI/output` - Generated images and videos
- `/app/ComfyUI/input` - Input images for processing
- `/app/ComfyUI/custom_nodes` - Additional custom nodes
- `/app/ComfyUI/user` - User settings and workflows

## 🏃‍♂️ Docker Compose Example

```yaml
version: '3.8'
services:
  comfyui:
    image: angela17verse/angela-comfyui:latest
    ports:
      - "8188:8188"
    volumes:
      - ./models:/app/ComfyUI/models
      - ./output:/app/ComfyUI/output
      - ./input:/app/ComfyUI/input
      - ./workflows:/app/ComfyUI/user
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - COMFYUI_HOST=0.0.0.0
      - COMFYUI_PORT=8188
    restart: unless-stopped
```

## 🎯 Features

### Performance Optimizations
- Pre-compiled PyTorch with CUDA support
- Optimized Python environment
- Pre-installed dependencies to reduce startup time
- Multi-stage build for smaller image size

### Developer-Friendly
- Health check endpoint for monitoring
- Proper logging and error handling
- Volume-friendly custom nodes directory
- Easy integration with angela ecosystem

### Production Ready
- Based on Ubuntu 22.04 LTS
- Security-conscious build process
- Proper signal handling for graceful shutdown
- Resource-efficient operation

## 🛠️ Development

### Building Locally
```bash
git clone https://github.com/your-repo/angelaverse
cd angelaverse/docker
./test-build-comfyui.sh  # or test-build-comfyui.bat on Windows
```

### Custom Node Development
The container supports easy custom node development:

```bash
docker run -it --gpus all \
  -p 8188:8188 \
  -v $(pwd)/my-custom-nodes:/app/ComfyUI/custom_nodes/my-custom-nodes \
  angela17verse/angela-comfyui:latest
```

## 🔗 Integration with angela

This container is optimized for use within the angela AI ecosystem:

- **angela Desktop**: Automatic container management
- **angela Web**: Direct integration via API
- **angela Workflows**: Pre-configured workflow templates
- **angela Models**: Shared model management

## 📊 System Requirements

### Minimum Requirements
- **RAM**: 8GB (16GB recommended)
- **Storage**: 10GB free space
- **CPU**: Multi-core processor
- **GPU**: Optional but recommended (NVIDIA with CUDA support)

### Recommended Requirements
- **RAM**: 16GB+ for large models
- **Storage**: 50GB+ for model storage
- **GPU**: NVIDIA RTX 30/40 series or better
- **VRAM**: 8GB+ for high-resolution generation

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/angelaverse/issues)
- **Discord**: [angela Community](https://discord.gg/angelaverse)
- **Documentation**: [angela Docs](https://docs.angelaverse.space)

## 📄 License

This container includes software under various licenses:
- ComfyUI: GPL-3.0
- Custom nodes: Various (see individual repositories)
- Container configuration: MIT

---

**Built with ❤️ for the angela AI community** 
