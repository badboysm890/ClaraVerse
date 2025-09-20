# ClaraVerse Remote Server

A simple deployment package for hosting ClaraVerse services on remote servers with direct port access.

## 🚀 One-Command Installation

**Windows, Linux, or macOS:**
```bash
python install.py
```

That's it! The installer will guide you through everything.

## 📋 Prerequisites

- **Python 3.6+** (comes pre-installed on most systems)
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Internet connection** (for downloading containers)

## 🎯 What You Get

The installer lets you choose which services to deploy:

- **ComfyUI** (Port 8188): AI image generation and workflows
- **Python Backend** (Port 5001): Core AI processing and APIs  
- **n8n** (Port 5678): Workflow automation platform

## 🎨 Beautiful Interactive Installation

The Python installer provides:
- ✨ **Colorful terminal interface** with progress bars
- 🔍 **Automatic system detection** (Docker, GPU, OS)
- ⚙️ **Interactive service selection** - pick what you need
- 🏥 **Health monitoring** - ensures everything starts correctly
- 🌐 **Auto browser opening** to your deployed services

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Remote Server                 │
│                                         │
│  ComfyUI        →  Port 8188           │
│  Python Backend →  Port 5001           │
│  n8n           →  Port 5678           │
│                                         │
│  Direct access to each service:         │
│  http://server:8188  (ComfyUI)         │
│  http://server:5001  (Python API)      │
│  http://server:5678  (n8n)             │
└─────────────────────────────────────────┘
```

## 💡 Usage Examples

**Deploy everything:**
```bash
python install.py
# Select "A" for all services
```

**Deploy only ComfyUI:**
```bash
python install.py  
# Select "1" when prompted
```

**Deploy ComfyUI + n8n:**
```bash
python install.py
# Select "1,3" when prompted
```

## GPU Support

- **NVIDIA CUDA**: Automatically detected and enabled
- **CPU Fallback**: Works without GPU
- **Windows**: Supports both CUDA and CPU modes

## Requirements

- Docker with GPU support (for NVIDIA)
- 8GB+ RAM (16GB+ recommended with GPU)
- 50GB+ storage for models
- Open ports: 80, 443 (or custom ports)