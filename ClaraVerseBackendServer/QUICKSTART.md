# ClaraVerse Remote Server - Quick Start

Deploy ClaraVerse services (ComfyUI + Python Backend + n8n) on any server with one command!

## 🚀 Super Quick Start

**Any Platform (Windows, Linux, macOS):**
```bash
python install.py
```

The installer will:
1. ✅ Check your system (Docker, GPU, etc.)
2. 🎯 Let you choose which services to deploy
3. 📦 Download and start the selected services
4. 🏥 Monitor health and show you the URLs
5. 🌐 Open your browser to the services

## 📱 Installation Examples

### Deploy Everything (Recommended)
```bash
python install.py
# When prompted, select: A
```

### Deploy Only ComfyUI
```bash
python install.py
# When prompted, select: 1
```

### Deploy ComfyUI + n8n Automation
```bash
python install.py
# When prompted, select: 1,3
```

## 📦 What Gets Deployed

- **ComfyUI**: AI image generation interface (Port 8188)
- **Python Backend**: Core AI processing APIs (Port 5001)
- **n8n**: Workflow automation platform (Port 5678)

## 🌐 Access Points

After deployment, access your services directly at:

- **ComfyUI**: `http://your-server-ip:8188`
- **Python Backend**: `http://your-server-ip:5001`
- **n8n**: `http://your-server-ip:5678`

## ⚙️ Configuration

### Default Credentials
- **n8n**: `admin / clara123` (change in docker-compose.yml)

### GPU Support
- Automatically detects NVIDIA GPUs
- Falls back to CPU if no GPU available
- Works on Windows, Linux, and macOS

### Ports
- **ComfyUI**: 8188
- **Python Backend**: 5001
- **n8n**: 5678

## 🔧 Management

### Check Status
```bash
docker compose ps
```

### View Logs
```bash
docker compose logs -f
```

### Restart Services
```bash
docker compose restart
```

### Stop All Services
```bash
docker compose down
```

### Update Images
```bash
docker compose pull
docker compose up -d
```

## 📋 System Requirements

### Minimum
- 4GB RAM
- 20GB storage
- Docker with Compose support

### Recommended
- 8GB+ RAM
- 50GB+ storage (for AI models)
- NVIDIA GPU with 6GB+ VRAM
- Ubuntu 20.04+ or Windows 10+ with WSL2

## 🐛 Troubleshooting

### Services Won't Start
1. Check Docker is running: `docker info`
2. Check logs: `docker compose logs`
3. Verify ports aren't in use: `netstat -tulpn`

### GPU Not Detected
1. Install NVIDIA drivers
2. Install NVIDIA Container Toolkit
3. Restart Docker daemon
4. Test: `docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu20.04 nvidia-smi`

### Can't Access Services
1. Check firewall settings
2. Verify service health: `curl http://localhost/health`
3. Check container status: `docker compose ps`

## 🔒 Security Notes

- Change default n8n password
- Use HTTPS in production
- Configure firewall rules
- Regular security updates

## 📞 Support

For issues and support:
1. Check logs: `docker compose logs`
2. Verify system requirements
3. Check firewall and network settings