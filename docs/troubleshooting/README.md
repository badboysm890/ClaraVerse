---
title: "Troubleshooting Guide"
description: "Common issues and solutions for angelaVerse"
category: "troubleshooting"
order: 6
lastUpdated: "2024-01-15"
contributors: ["badboysm890"]
---

# 🔧 Troubleshooting Guide

Having issues with angelaVerse? This comprehensive guide covers common problems and their solutions to get you back up and running quickly.

## 🚨 Quick Fixes

### Application Won't Start

**Symptoms:** angelaVerse doesn't launch or crashes immediately

**Solutions:**
```bash
# Windows
1. Run as Administrator
2. Check Windows Event Viewer for errors
3. Disable antivirus temporarily
4. Install Visual C++ Redistributables

# macOS
1. Right-click → Open (don't double-click)
2. Remove quarantine: sudo xattr -r -d com.apple.quarantine /Applications/angelaVerse.app
3. Check Console app for crash logs
4. Grant necessary permissions in System Preferences

# Linux
1. Make AppImage executable: chmod +x angelaVerse.AppImage
2. Install FUSE: sudo apt install fuse libfuse2
3. Try: ./angelaVerse.AppImage --no-sandbox
4. Check dependencies: ldd angelaVerse.AppImage
```

### AI Features Not Working

**Symptoms:** angela doesn't respond or gives errors

**Solutions:**
1. **Check Provider Configuration**
   - Settings → AI Providers
   - Verify API keys are correct
   - Test connection
   - Try different provider

2. **Network Issues**
   - Check internet connection
   - Verify firewall settings
   - Try different network
   - Use local models (Ollama)

3. **Model Issues**
   - Switch to different model
   - Check model availability
   - Restart AI service
   - Clear model cache

## 💻 Platform-Specific Issues

### Windows Issues

**"Windows protected your PC" Warning**
```bash
Problem: SmartScreen blocks unsigned application
Solution: Click "More info" → "Run anyway"
Alternative: Add to antivirus exclusions
```

**High Memory Usage**
```bash
Problem: angelaVerse uses excessive RAM
Solutions:
- Close unused browser tabs
- Reduce image generation settings
- Use smaller AI models
- Restart application regularly
```

**Installation Fails**
```bash
Problem: Installer won't run or fails
Solutions:
- Run installer as Administrator
- Temporarily disable antivirus
- Clear Windows temp files
- Use Windows Package Manager: winget install angelaVerse
```

### macOS Issues

**"App is damaged" Error**
```bash
Problem: Gatekeeper prevents app launch
Solution: sudo xattr -r -d com.apple.quarantine /Applications/angelaVerse.app
```

**Permission Denied Errors**
```bash
Problem: Can't access files or folders
Solutions:
- System Preferences → Security & Privacy → Privacy
- Grant Full Disk Access to angelaVerse
- Allow Files and Folders access
- Enable Accessibility if using shortcuts
```

**Slow Performance on M1/M2**
```bash
Problem: App runs slowly on Apple Silicon
Solutions:
- Ensure you have universal binary
- Check Activity Monitor for CPU usage
- Close other resource-intensive apps
- Increase swap space if needed
```

### Linux Issues

**AppImage Won't Run**
```bash
Problem: ./angelaVerse.AppImage fails to start
Solutions:
- Install FUSE: sudo apt install fuse libfuse2
- Make executable: chmod +x angelaVerse.AppImage
- Try: ./angelaVerse.AppImage --appimage-extract-and-run
- Check permissions: ls -la angelaVerse.AppImage
```

**Missing Dependencies**
```bash
Problem: Library errors on launch
Solutions:
# Ubuntu/Debian
sudo apt update
sudo apt install libnss3 libatk-bridge2.0-0 libdrm2 libxss1 libgconf-2-4

# Fedora/CentOS
sudo dnf install nss atk at-spi2-atk libdrm libXScrnSaver

# Arch Linux
sudo pacman -S nss atk at-spi2-atk libdrm libxss
```

## 🤖 AI Provider Issues

### OpenAI Problems

**API Key Invalid**
```typescript
Problem: "Invalid API key" errors
Solutions:
- Verify key format: sk-...
- Check key permissions in OpenAI dashboard
- Ensure billing is set up
- Generate new API key
```

**Rate Limit Exceeded**
```typescript
Problem: "Rate limit exceeded" errors
Solutions:
- Wait before retrying
- Upgrade OpenAI plan
- Use different provider
- Implement request throttling
```

**Model Not Available**
```typescript
Problem: "Model not found" errors
Solutions:
- Check model name spelling
- Verify model access in OpenAI account
- Use alternative model (gpt-3.5-turbo)
- Update to latest model versions
```

### Ollama Issues

**Ollama Not Detected**
```bash
Problem: angelaVerse can't connect to Ollama
Solutions:
- Install Ollama: https://ollama.ai
- Start Ollama service: ollama serve
- Check if running: curl http://localhost:11434
- Verify port in angelaVerse settings
```

**Model Loading Fails**
```bash
Problem: "Failed to load model" errors
Solutions:
- Pull model: ollama pull llama2
- Check available models: ollama list
- Ensure sufficient RAM/VRAM
- Try smaller model: ollama pull llama2:7b
```

**Slow Response Times**
```bash
Problem: Ollama responses are very slow
Solutions:
- Use GPU acceleration (CUDA/ROCm)
- Reduce model size
- Increase system RAM
- Close other applications
```

## 💻 LumaUI Development Issues

### WebContainer Problems

**Projects Won't Start**
```typescript
Problem: "Failed to boot WebContainer" error
Solutions:
- Refresh the page
- Clear browser cache
- Check browser compatibility (Chrome/Edge recommended)
- Disable browser extensions
- Ensure sufficient RAM (4GB+ recommended)
```

**npm Install Fails**
```bash
Problem: Package installation errors
Solutions:
- Clear npm cache in terminal: npm cache clean --force
- Delete node_modules and retry
- Check package.json syntax
- Try yarn instead of npm
- Use different package registry
```

**File Changes Not Reflected**
```typescript
Problem: Code changes don't update preview
Solutions:
- Force refresh preview (Ctrl+R in preview)
- Check WebContainer sync status
- Restart the development server
- Clear browser cache
- Check for JavaScript errors in console
```

### Monaco Editor Issues

**Syntax Highlighting Broken**
```typescript
Problem: Code appears without syntax highlighting
Solutions:
- Check file extension (.js, .ts, .tsx)
- Reload the editor tab
- Clear browser cache
- Update to latest version
- Check browser console for errors
```

**IntelliSense Not Working**
```typescript
Problem: No autocomplete or type information
Solutions:
- Ensure TypeScript files have proper extensions
- Check tsconfig.json configuration
- Restart TypeScript language service
- Clear editor cache
- Verify dependencies are installed
```

## 🎨 Image Generation Issues

### ComfyUI Problems

**ComfyUI Won't Start**
```bash
Problem: Image generation service unavailable
Solutions:
- Check Docker containers: docker ps
- Restart ComfyUI: docker restart comfyui
- Check GPU availability: nvidia-smi
- Verify VRAM requirements (6GB+ recommended)
```

**Generation Fails**
```bash
Problem: "Out of memory" or generation errors
Solutions:
- Reduce image resolution
- Use smaller batch sizes
- Close other GPU applications
- Try CPU generation (slower)
- Increase virtual memory
```

**Models Not Loading**
```bash
Problem: "Model not found" errors
Solutions:
- Check model files in ComfyUI/models/
- Download required models
- Verify model format compatibility
- Check file permissions
- Restart ComfyUI service
```

### GPU Issues

**CUDA Not Detected**
```bash
Problem: GPU acceleration not working
Solutions:
- Install NVIDIA drivers
- Install CUDA toolkit
- Verify: nvidia-smi
- Restart application
- Check CUDA version compatibility
```

**Insufficient VRAM**
```bash
Problem: "CUDA out of memory" errors
Solutions:
- Reduce image resolution
- Use smaller models
- Enable CPU fallback
- Close other GPU applications
- Increase system RAM for CPU mode
```

## 🔧 Performance Issues

### High CPU Usage

**Symptoms:** System becomes slow, fans spin up

**Solutions:**
```typescript
// Immediate fixes
- Close unused tabs/projects
- Reduce AI model complexity
- Disable auto-save temporarily
- Lower image generation settings

// Long-term solutions
- Upgrade CPU/RAM
- Use SSD for projects
- Enable hardware acceleration
- Optimize system settings
```

### Memory Leaks

**Symptoms:** Memory usage increases over time

**Solutions:**
```typescript
// Quick fixes
- Restart angelaVerse
- Clear browser cache
- Close old project tabs
- Garbage collect in dev tools

// Prevention
- Regular restarts
- Monitor memory usage
- Close completed projects
- Update to latest version
```

### Slow File Operations

**Symptoms:** File saves/loads take long time

**Solutions:**
```bash
# Check disk space
df -h (Linux/Mac) or dir (Windows)

# Solutions
- Free up disk space
- Move projects to SSD
- Exclude antivirus scanning
- Close file monitoring apps
- Use local storage vs cloud sync
```

## 🌐 Network & Connectivity

### API Connection Issues

**Symptoms:** "Network error" or timeout messages

**Solutions:**
```typescript
// Check connectivity
- Test internet connection
- Try different network
- Disable VPN temporarily
- Check firewall settings

// Provider-specific
- Verify API endpoints
- Check service status pages
- Try different regions
- Use proxy if needed
```

### Firewall Problems

**Symptoms:** Connections blocked or timeout

**Solutions:**
```bash
# Windows Firewall
- Windows Security → Firewall
- Allow angelaVerse through firewall
- Add exceptions for ports 8000, 11434

# Corporate Firewalls
- Contact IT department
- Use approved proxy settings
- Try mobile hotspot
- Use local-only features
```

## 🗄️ Data & Storage Issues

### Lost Projects

**Symptoms:** Projects disappeared or won't load

**Solutions:**
```typescript
// Recovery steps
1. Check browser storage (F12 → Application → IndexedDB)
2. Look for backup files in workspace folder
3. Check if logged into correct profile
4. Try clearing cache and reloading
5. Import from manual backups

// Prevention
- Regular manual exports
- Cloud sync setup
- Version control (Git)
- Multiple device sync
```

### Corrupted Settings

**Symptoms:** App behaves strangely, settings reset

**Solutions:**
```bash
# Reset settings
1. Close angelaVerse
2. Clear application data:
   - Windows: %APPDATA%/angelaVerse
   - macOS: ~/Library/Application Support/angelaVerse
   - Linux: ~/.config/angelaVerse
3. Restart application
4. Reconfigure settings
```

## 🔍 Debugging Tools

### Built-in Debug Tools

**Access Debug Information:**
```typescript
// In angelaVerse
1. Settings → Debug
2. View system information
3. Check component status
4. Export debug logs

// Browser DevTools
1. Press F12
2. Check Console for errors
3. Network tab for API issues
4. Application tab for storage
```

### Log Files

**Find Log Files:**
```bash
# Windows
%APPDATA%/angelaVerse/logs/

# macOS
~/Library/Logs/angelaVerse/

# Linux
~/.local/share/angelaVerse/logs/
```

### System Information

**Gather System Info:**
```bash
# Hardware info
- CPU: Check processor specifications
- RAM: Available memory (8GB+ recommended)
- GPU: Graphics card and VRAM
- Storage: Available disk space

# Software info
- OS version and architecture
- Browser version (for web features)
- Node.js version (for development)
- Docker version (for services)
```

## 🆘 Getting Help

### Community Support

**Discord Community:**
- Real-time help and discussions
- Share screenshots and error messages
- Get help from experienced users
- Join: https://discord.gg/j633fsrAne

**Reddit Community:**
- Browse common issues and solutions
- Post detailed problem descriptions
- Search previous discussions
- Visit: https://www.reddit.com/r/angelaverse/

### Official Support

**GitHub Issues:**
- Report bugs with detailed information
- Request new features
- Check known issues
- Visit: https://github.com/badboysm890/angelaverse/issues

**Documentation:**
- Search comprehensive guides
- Follow step-by-step tutorials
- Check configuration examples
- Visit: https://docs.angelaverse.space

### Creating Effective Bug Reports

**Include This Information:**
```markdown
## Environment
- OS: Windows 11 / macOS 13 / Ubuntu 22.04
- angelaVerse Version: 0.1.3
- Browser: Chrome 120 (if applicable)

## Problem Description
Clear description of what went wrong

## Steps to Reproduce
1. Step one
2. Step two
3. Error occurs

## Expected Behavior
What should have happened

## Screenshots/Logs
Include relevant screenshots or log excerpts

## Additional Context
Any other relevant information
```

---

## ✅ Prevention Tips

### Regular Maintenance

**Weekly Tasks:**
- [ ] Restart angelaVerse
- [ ] Clear browser cache
- [ ] Check for updates
- [ ] Backup important projects

**Monthly Tasks:**
- [ ] Clean up old projects
- [ ] Update AI models
- [ ] Review disk space
- [ ] Check system performance

### Best Practices

**Stable Operation:**
- Keep angelaVerse updated
- Use supported browsers
- Maintain adequate free disk space
- Regular system restarts
- Monitor resource usage

**Data Safety:**
- Regular project exports
- Version control with Git
- Multiple backup locations
- Test restore procedures

---

**Still having issues?** Join our [Discord community](https://discord.gg/j633fsrAne) for real-time help or create a [GitHub issue](https://github.com/badboysm890/angelaverse/issues) with detailed information about your problem. 
