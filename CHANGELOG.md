# Changelog

All notable changes to angela will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 0.1.4

### 🚧 In Development
- Multi-user support with authentication
- Cloud deployment templates for AWS/GCP/Azure
- Plugin system for custom AI tools
- Enhanced N8N workflow integration

---

## [0.1.3] - 2024-12-22

### 🎉 Major Milestone: Complete Docker Transformation
angelaVerse has undergone a **revolutionary transformation** from an Electron desktop application to a **Docker-powered web application** similar to OpenWebUI, while maintaining complete privacy and local execution.

### 🚀 Major Features Added
- **🐳 Docker-First Architecture**: Complete Docker Compose setup with 7 integrated services
- **🔧 LumaUI: Complete Web Development Environment**: WebContainer integration with Monaco Editor
- **🧠 Enhanced AI Capabilities**: Dynamic token allocation (16k-128k) with autonomous execution
- **🎨 Advanced Preview System**: Dual preview modes with console integration

### ✨ New Features
- **Docker Services Stack**: angela Web UI, Backend API, LlamaSwap, N8N, ComfyUI, Redis, PostgreSQL
- **LumaUI Development**: Project templates, AI code generation, terminal integration, file management
- **Smart AI Integration**: Precision editing modes, tool call limits, error recovery

### 🛠️ Technical Improvements
- **Performance & Reliability**: Fixed race conditions, optimized token usage, enhanced error handling
- **Developer Experience**: TypeScript integration, hot reload, debugging tools
- **Architecture Enhancements**: Service isolation, health monitoring, scalability

### 🐛 Critical Bug Fixes
- **Docker Conversion**: Removed Electron dependencies, fixed console errors
- **LumaUI Stability**: Fixed WebContainer remounting, auto mode loops, file sync issues
- **AI Integration**: Fixed tool schema validation, token limits, conversation history

### 🔧 Breaking Changes
- **Migration from Electron to Docker**: Desktop app discontinued, now web application
- **New Installation**: Use Docker Compose instead of app installers
- **LumaUI Interface**: WebContainer-based projects, enhanced AI chat, auto-save behavior

---

## [0.1.2] - 2024-05-30

### 🚀 Major Features Added
- **Custom Model Path Management**: Added support for custom download paths for model downloads
- **Enhanced Local Storage Management**: Improved storage handling and configuration
- **SDK for Users**: Added comprehensive SDK for developers to build on angela
- **Granular Configuration System**: Enhanced settings with more detailed configuration options
- **Multi-Platform Optimizations**: Tested and optimized for Linux, improved Windows compatibility
- **Server Management Integration**: Moved servers to settings for better organization

### ✨ New Features
- **Custom Download Path Support**: Users can now specify custom paths for model downloads
- **Enhanced MCP Diagnosis**: Added support for nvm node versions in PATH for MCP diagnosis
- **Linux 64-bit CPU Binaries**: Added dedicated binaries for Linux 64-bit systems
- **Windows CUDA Binaries**: Added CUDA support for Windows users
- **Call, TTS, and STT Integration**: Added text-to-speech and speech-to-text capabilities
- **Enhanced Python Backend**: Improved stability and performance of the Python backend
- **Provider Management**: Added comprehensive provider management functionality in settings

### 🛠️ Improvements
- **Security Enhancements**: Fixed security issues with exposed API keys and vulnerable dependencies
- **UI/UX Improvements**: Multiple quality-of-life improvements across the interface
- **Performance Optimizations**: Enhanced performance across multiple components
- **Documentation Updates**: Updated README and documentation for better clarity
- **Build System Improvements**: Enhanced build processes and dependency management

### 🐛 Bug Fixes
- **Dependency Vulnerabilities**: Fixed multiple security vulnerabilities in dependencies
- **API Key Exposure**: Resolved issues with exposed API keys
- **Model Management**: Fixed various bugs in model downloading and management
- **UI Responsiveness**: Fixed various UI responsiveness issues
- **Cross-Platform Compatibility**: Resolved platform-specific issues

### 🔧 Technical Improvements
- **Code Quality**: Refactored multiple components for better maintainability
- **Build Process**: Enhanced build and deployment processes
- **Testing**: Improved testing coverage and reliability
- **Documentation**: Enhanced code documentation and user guides

---

## [0.1.1] - 2024-05-20

### 🚀 Major Features Added
- **Electron Integration**: Full desktop application support with native features
- **Image Generation Support**: Comprehensive image generation capabilities
- **Node-Based Workflow System**: Visual workflow builder with drag-and-drop functionality
- **App Creator Enhancement**: Complete refactoring of the node registration mechanism

### ✨ New Features
- **Clipboard Node**: Added clipboard functionality for workflows
- **Concatenation Tool**: New tool for string concatenation in workflows
- **Visual App Runner**: Enhanced app runner with chat UI and horizontal image+text inputs
- **Image Handling**: Improved image handling in nodes with runtime image replacement
- **Auto-Save Functionality**: Added automatic saving for user work
- **Template System**: Added templates for image generation

### 🛠️ Improvements
- **UI/UX Enhancements**: Multiple quality-of-life improvements
- **Code Highlighting**: Removed syntax highlighting and border styling from code blocks for cleaner appearance
- **App Deletion Process**: Moved app deletion to AppCreator with improved deletion process
- **Workflow Integration**: Enhanced workflow system with better node management

### 🐛 Bug Fixes
- **Image Node Issues**: Fixed image handling bugs in workflow nodes
- **UI Responsiveness**: Resolved various UI layout issues
- **Workflow Execution**: Fixed bugs in workflow execution engine

### 🔧 Technical Improvements
- **Code Refactoring**: Major refactoring of the complete node register mechanism
- **Component Architecture**: Improved component structure for better maintainability
- **Build System**: Enhanced build processes for Electron integration

---

## [0.1.0] - 2024-05-01

### 🎉 Initial Release
- **Core Chat Interface**: Basic AI chat functionality with local LLM support
- **Privacy-First Architecture**: Complete local processing with no cloud dependencies
- **Multi-Provider Support**: Support for various AI model providers
- **Basic UI Framework**: Initial user interface with essential features
- **Local Storage**: Client-side data storage system
- **Open Source Foundation**: MIT licensed with full source code availability

### ✨ Initial Features
- **Local AI Chat**: Chat with AI models running locally
- **Model Management**: Basic model loading and management
- **Responsive Design**: Mobile and desktop responsive interface
- **Settings System**: Basic configuration and settings management
- **File Handling**: Initial file upload and processing capabilities

### 🔧 Technical Foundation
- **React Frontend**: Built with modern React and TypeScript
- **Electron Support**: Desktop application framework
- **Vite Build System**: Fast development and build processes
- **Local Storage API**: IndexedDB integration for local data persistence
- **Modular Architecture**: Component-based architecture for extensibility

---

## Installation & Upgrade Guide

### Fresh Installation
```bash
# Clone the repository
git clone https://github.com/badboysm890/angelaVerse.git
cd angelaVerse

# Install dependencies
npm install

# Run development server
npm run dev

# Or run desktop application
npm run electron:dev
```

### Upgrading from Previous Versions
```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm install

# Rebuild application
npm run build
```

### Docker Installation
```bash
# Run with Docker
docker run -p 8069:8069 angela-ollama:latest
```

---

## Breaking Changes

### From 0.1.0 to 0.1.1
- **Node System**: Complete refactoring of the node registration system
- **Image Handling**: Changes to image processing pipeline
- **App Creator**: Significant changes to app creation workflow

### From 0.1.1 to 0.1.2
- **Settings Structure**: Server settings moved to new location
- **Model Paths**: Custom model path configuration added
- **Storage Management**: Enhanced local storage structure

---

## Migration Guide

### Migrating to 0.1.2
1. **Settings Update**: Check your server settings as they have been reorganized
2. **Model Paths**: Configure custom model download paths if needed
3. **Dependencies**: Update all dependencies using `npm install`
4. **Storage**: Clear local storage if experiencing issues (use clear_storage.js)

---

## Known Issues

### Current Known Issues (0.1.2)
- Some legacy workflow configurations may need manual updating
- Windows users may need to run as administrator for certain model downloads
- macOS users need to manually approve unsigned applications

### Workarounds
- **macOS App Damage Warning**: Right-click app and select "Open", then approve in System Preferences
- **Windows Admin Rights**: Run as administrator if model downloads fail
- **Linux Permissions**: Ensure proper permissions for model storage directories

---

## Support & Feedback

- **Email**: [praveensm890@gmail.com](mailto:praveensm890@gmail.com)
- **GitHub Issues**: [Report bugs and request features](https://github.com/badboysm890/angelaVerse/issues)
- **Discussions**: [Join community discussions](https://github.com/badboysm890/angelaVerse/discussions)

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

---

*For more information, visit the [angela Documentation](https://github.com/badboysm890/angelaVerse) or join our community discussions.* 
