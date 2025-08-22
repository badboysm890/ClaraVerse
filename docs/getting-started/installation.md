---
title: "Installation Guide"
description: "Detailed installation instructions for all platforms"
category: "getting-started"
order: 2
lastUpdated: "2024-01-15"
contributors: ["badboysm890"]
---

# 📦 Installation Guide

This comprehensive guide covers all installation methods for angelaVerse across different platforms and use cases.

## 🎯 Installation Options

- **[Pre-built Releases](#-pre-built-releases)** - Recommended for most users
- **[Build from Source](#-build-from-source)** - For developers and customization
- **[Docker Deployment](#-docker-deployment)** - For containerized environments
- **[Development Setup](#-development-setup)** - For contributors

---

## 🚀 Pre-built Releases

### Windows Installation

**System Requirements:**
- Windows 10 (1903) or later
- 8GB RAM (16GB recommended)
- 5GB free disk space

**Installation Steps:**

1. **Download the Installer**
   ```
   https://github.com/badboysm890/angelaverse/releases/latest
   → angelaVerse-win-x64.exe
   ```

2. **Run the Installer**
   - Right-click the downloaded file
   - Select "Run as administrator" (if prompted)
   - Follow the installation wizard

3. **Security Warnings**
   - Windows may show "Windows protected your PC"
   - Click "More info" → "Run anyway"
   - This is normal for unsigned applications

4. **First Launch**
   - Find angelaVerse in Start Menu
   - Pin to taskbar for easy access
   - Complete the onboarding process

**Troubleshooting Windows:**
- **Antivirus blocking**: Add angelaVerse to your antivirus exceptions
- **Installation fails**: Run installer as administrator
- **App won't start**: Check Windows Event Viewer for detailed errors

---

### macOS Installation

**System Requirements:**
- macOS 10.15 (Catalina) or later
- 8GB RAM (16GB recommended)
- 5GB free disk space
- Intel or Apple Silicon (Universal binary)

**Installation Steps:**

1. **Download the DMG**
   ```
   https://github.com/badboysm890/angelaverse/releases/latest
   → angelaVerse-mac-universal.dmg
   ```

2. **Install the Application**
   - Open the downloaded `.dmg` file
   - Drag angelaVerse to the Applications folder
   - Eject the DMG when complete

3. **Security Permissions**
   - First launch: Right-click → "Open"
   - macOS will ask permission to run unsigned app
   - Click "Open" to confirm

4. **Grant Permissions**
   - **Accessibility**: For global shortcuts (optional)
   - **Files and Folders**: For project access
   - **Network**: For AI provider connections

**Troubleshooting macOS:**
- **"Cannot be opened" error**: Use right-click → Open instead of double-click
- **Gatekeeper blocking**: System Preferences → Security → Allow anyway
- **Permission issues**: System Preferences → Privacy → Grant required permissions

---

### Linux Installation

**System Requirements:**
- Ubuntu 18.04+ / Fedora 32+ / Other modern distributions
- 8GB RAM (16GB recommended)
- 5GB free disk space
- X11 or Wayland display server

**Installation Steps:**

1. **Download AppImage**
   ```bash
   wget https://github.com/badboysm890/angelaverse/releases/latest/download/angelaVerse-linux-x64.AppImage
   ```

2. **Make Executable**
   ```bash
   chmod +x angelaVerse-linux-x64.AppImage
   ```

3. **Run the Application**
   ```bash
   ./angelaVerse-linux-x64.AppImage
   ```

4. **Optional: Desktop Integration**
   ```bash
   # Create desktop entry
   ./angelaVerse-linux-x64.AppImage --appimage-extract
   cp squashfs-root/angelaVerse.desktop ~/.local/share/applications/
   cp squashfs-root/angelaVerse.png ~/.local/share/icons/
   ```

**Troubleshooting Linux:**
- **FUSE missing**: `sudo apt install fuse` (Ubuntu/Debian)
- **Sandboxing issues**: Run with `--no-sandbox` flag
- **Permission errors**: Ensure AppImage has execute permissions

---

## 🛠️ Build from Source

### Prerequisites

**Required Software:**
- **Node.js**: 18.x or later
- **npm**: 8.x or later (or yarn/pnpm)
- **Git**: For cloning the repository
- **Python**: 3.8+ (for native dependencies)

**Platform-Specific Requirements:**

**Windows:**
```powershell
# Install Windows Build Tools
npm install -g windows-build-tools
```

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install build-essential libnss3-dev libatk-bridge2.0-dev libdrm2-dev

# Fedora/CentOS
sudo dnf install make gcc gcc-c++ nss-devel atk-devel
```

### Build Process

1. **Clone Repository**
   ```bash
   git clone https://github.com/badboysm890/angelaverse.git
   cd angelaverse
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Development Build**
   ```bash
   # Start development server
   npm run dev
   
   # In another terminal, start Electron
   npm run electron:dev
   ```

4. **Production Build**
   ```bash
   # Build for current platform
   npm run build
   npm run electron:build
   
   # Build for specific platforms
   npm run electron:build:win
   npm run electron:build:mac
   npm run electron:build:linux
   ```

5. **Find Built Applications**
   ```
   dist/
   ├── win-unpacked/          # Windows executable
   ├── mac/                   # macOS app bundle
   ├── linux-unpacked/        # Linux executable
   └── *.exe, *.dmg, *.AppImage  # Installers
   ```

---

## 🐳 Docker Deployment

angelaVerse can be deployed as a web application using Docker:

### Quick Start with Docker Compose

1. **Create docker-compose.yml**
   ```yaml
   version: '3.8'
   services:
     angelaverse:
       image: ghcr.io/badboysm890/angelaverse:latest
       ports:
         - "3000:3000"
       volumes:
         - angelaverse_data:/app/data
         - angelaverse_models:/app/models
       environment:
         - NODE_ENV=production
         - PORT=3000
   
   volumes:
     angelaverse_data:
     angelaverse_models:
   ```

2. **Start the Services**
   ```bash
   docker-compose up -d
   ```

3. **Access angelaVerse**
   ```
   http://localhost:3000
   ```

### Full Stack Deployment

For a complete setup with all services:

```bash
# Clone the repository
git clone https://github.com/badboysm890/angelaverse.git
cd angelaverse

# Start all services
./start-angela.sh
```

This includes:
- **angela Web UI** (Port 3000)
- **angela Backend** (Port 8000)
- **N8N** (Port 5678)
- **ComfyUI** (Port 8188)
- **Redis** (Port 6379)
- **PostgreSQL** (Port 5432)

---

## 💻 Development Setup

### For Contributors

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/angelaverse.git
   cd angelaverse
   git remote add upstream https://github.com/badboysm890/angelaverse.git
   ```

2. **Install Dependencies**
   ```bash
   npm install
   cd py_backend && pip install -r requirements.txt
   ```

3. **Start Development Environment**
   ```bash
   # Terminal 1: Frontend
   npm run dev
   
   # Terminal 2: Electron
   npm run electron:dev
   
   # Terminal 3: Python Backend
   cd py_backend && python main.py
   ```

4. **Development Tools**
   ```bash
   # Run tests
   npm test
   
   # Lint code
   npm run lint
   
   # Format code
   npm run format
   ```

### Environment Variables

Create `.env` file in project root:

```bash
# AI Provider APIs (Optional)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
OPENROUTER_API_KEY=your_openrouter_key

# Development Settings
NODE_ENV=development
ELECTRON_DEV=true
PYTHON_BACKEND_PORT=8000

# Logging
LOG_LEVEL=debug
```

---

## 🔧 Post-Installation Setup

### 1. AI Provider Configuration

**Local AI (Recommended):**
1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull llama2`
3. angelaVerse will auto-detect Ollama

**Cloud AI (Optional):**
1. Go to Settings → AI Providers
2. Add your API keys
3. Test connections
4. Set default models

### 2. Image Generation Setup

**For NVIDIA GPUs:**
1. Install [NVIDIA Docker](https://github.com/NVIDIA/nvidia-docker) (Docker deployment)
2. Or install CUDA drivers (local installation)
3. ComfyUI will automatically use GPU acceleration

**For CPU-only:**
- Image generation will work but be significantly slower
- Consider cloud services for better performance

### 3. Workspace Configuration

1. **Set Workspace Directory**
   - Settings → General → Workspace Path
   - Choose a dedicated folder for projects

2. **Configure Auto-Save**
   - Settings → Editor → Auto-save interval
   - Recommended: 30 seconds

3. **Set Default Templates**
   - Settings → LumaUI → Default Project Template
   - Popular choice: React + Vite + Tailwind

---

## 🚨 Common Issues

### Installation Problems

**Issue: "App is damaged and can't be opened" (macOS)**
```bash
# Remove quarantine flag
sudo xattr -r -d com.apple.quarantine /Applications/angelaVerse.app
```

**Issue: "DLL missing" errors (Windows)**
- Install Microsoft Visual C++ Redistributables
- Download from Microsoft website

**Issue: AppImage won't run (Linux)**
```bash
# Install FUSE
sudo apt install fuse libfuse2

# Or run with --appimage-extract-and-run
./angelaVerse-linux-x64.AppImage --appimage-extract-and-run
```

### Performance Issues

**High Memory Usage:**
- Close unused tabs in LumaUI
- Reduce image generation batch size
- Lower AI model size (use smaller Ollama models)

**Slow Startup:**
- Disable unused features in Settings
- Check antivirus real-time scanning
- Move workspace to SSD if possible

---

## 🆙 Updates

### Automatic Updates
- angelaVerse checks for updates on startup
- Notifications appear when updates are available
- Updates download automatically in background

### Manual Updates
1. Download latest release
2. Install over existing installation
3. User data and settings are preserved

### Development Updates
```bash
git pull upstream main
npm install
npm run build
```

---

## ✅ Verification

After installation, verify everything works:

1. **Basic Functionality**
   - [ ] Application launches successfully
   - [ ] Dashboard loads with default widgets
   - [ ] Settings menu accessible

2. **AI Features**
   - [ ] Chat with angela works
   - [ ] AI providers connect (if configured)
   - [ ] File upload and analysis works

3. **Development Features**
   - [ ] LumaUI creates and runs projects
   - [ ] Monaco editor loads correctly
   - [ ] Terminal functions properly

4. **Optional Features**
   - [ ] Image generation works (if GPU available)
   - [ ] N8N workflows accessible
   - [ ] Agent Studio loads

---

 
