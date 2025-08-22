---
title: "Getting Started with angelaVerse"
description: "Quick start guide to set up angelaVerse"
category: "getting-started"
order: 1
lastUpdated: "2024-01-15"
contributors: ["badboysm890"]
---

# 🚀 Getting Started with angelaVerse

Welcome to angelaVerse! This guide will help you get up and running with your complete AI development suite in just a few minutes.

## 🎯 What You'll Learn

- How to download and install angelaVerse
- Initial setup and configuration
- Your first AI conversation with angela
- Creating your first web project with LumaUI
- Overview of all available features

## 📋 System Requirements

### Minimum Requirements
- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **RAM**: 8GB (16GB recommended for optimal performance)
- **Storage**: 5GB available disk space
- **Internet**: Required for initial setup and optional cloud AI providers

### Recommended for Best Experience
- **RAM**: 16GB+ for smooth operation with multiple features
- **GPU**: NVIDIA GPU with 6GB+ VRAM for local image generation
- **Storage**: SSD with 10GB+ free space
- **CPU**: Modern multi-core processor (Intel i5/AMD Ryzen 5 or better)

## ⚡ Quick Installation

### Option 1: Download Pre-built Release (Recommended)

1. **Visit the Releases Page**
   - Go to [GitHub Releases](https://github.com/badboysm890/angelaverse/releases)
   - Download the latest version for your platform:
     - `angelaVerse-win-x64.exe` (Windows)
     - `angelaVerse-mac-universal.dmg` (macOS)
     - `angelaVerse-linux-x64.AppImage` (Linux)

2. **Install the Application**
   - **Windows**: Run the `.exe` installer and follow the setup wizard
   - **macOS**: Open the `.dmg` file and drag angelaVerse to Applications
   - **Linux**: Make the `.AppImage` executable and run it

3. **Launch angelaVerse**
   - Find angelaVerse in your applications menu
   - On first launch, you'll see the onboarding screen

### Option 2: Build from Source

If you prefer to build from source or want to contribute:

```bash
# Clone the repository
git clone https://github.com/badboysm890/angelaverse.git
cd angelaverse

# Install dependencies
npm install

# Run one of the following:

# Start development server
npm run dev

# To live reload the app when you pull the latest code
npm run electron:dev:hot

# Or build for production
npm run build
npm run electron:build
```

## 🎨 First-Time Setup

### 1. Welcome & Onboarding

When you first launch angelaVerse, you'll be greeted with an onboarding flow:

1. **Welcome Screen**: Introduction to angelaVerse capabilities
2. **Personal Information**: Enter your name for personalization
3. **Privacy Preferences**: Configure your privacy settings
4. **AI Provider Setup**: Configure your preferred AI services (optional)

### 2. Configure AI Providers (Optional)

angelaVerse works great out of the box, but you can enhance it with AI providers:

**For Local AI (Recommended):**
- Install [Ollama](https://ollama.ai) for local LLM inference
- angelaVerse will auto-detect Ollama if installed

**For Cloud AI (Optional):**
- OpenAI API key for GPT models
- Anthropic API key for Claude models
- OpenRouter API key for multiple model access

**To configure providers:**
1. Go to **Settings** → **AI Providers**
2. Add your API keys
3. Test the connection
4. Set your preferred default model

## 🏠 Dashboard Overview

After setup, you'll land on the Dashboard - your command center:

### Default Widgets
- **Welcome Widget**: Personalized greeting and quick actions
- **Privacy Widget**: Information about local-first approach
- **What's New**: Latest features and updates

### Customization Options
- **Add Widgets**: Click the `+` button to add new widgets
- **Resize**: Drag widget corners to resize
- **Rearrange**: Drag widgets to reorder
- **Remove**: Right-click widgets for context menu options

## 🤖 Your First Chat with angela

Let's start with a simple conversation:

1. **Navigate to angela Assistant**
   - Click **"Chat"** in the sidebar
   - Or use the Quick Chat widget on the Dashboard

2. **Start a Conversation**
   ```
   Hello angela! Can you explain what you can help me with?
   ```

3. **Try Some Commands**
   ```
   Can you analyze this code snippet and suggest improvements?
   
   Can you create a simple React component for a todo item?
   
   Help me understand how async/await works in JavaScript
   ```

4. **Explore Advanced Features**
   - Upload files for analysis
   - Use voice input (if enabled)
   - Try autonomous mode for complex tasks

## 💻 Create Your First Web Project

Let's build something with LumaUI:

### 1. Open LumaUI
- Click **"Code"** in the sidebar
- You'll see the project selection screen

### 2. Create a New Project
- Click **"Create New Project"**
- Choose a template (e.g., "React + Vite + Tailwind")
- Enter project name: `my-first-app`
- Click **"Create Project"**

### 3. Start the Project
- Click **"Start Project"** 
- Wait for dependencies to install
- Your development environment is ready!

### 4. Explore the Interface
- **File Explorer**: Browse and edit files
- **Monaco Editor**: VS Code-quality code editing
- **Live Preview**: See changes in real-time
- **Terminal**: Full Node.js terminal access
- **AI Chat**: Get coding help without leaving the editor

### 5. Make Your First Edit
- Open `src/App.tsx`
- Change the title text
- Watch the preview update instantly!

## 🎨 Try Image Generation (Optional)

If you have a compatible GPU:

1. **Navigate to Image Generation**
   - Click **"Images"** in the sidebar

2. **Generate Your First Image**
   - Enter a prompt: `"A beautiful sunset over mountains"`
   - Choose your preferred model
   - Click **"Generate"**

3. **Explore Advanced Features**
   - Try different models (SDXL, SD 1.5, Flux)
   - Experiment with different settings
   - Use the Gallery to organize your creations

## 🔧 Explore Automation

### N8N Workflows
1. Click **"Workflows"** in the sidebar
2. Browse the template library
3. Create your first automation workflow

### Agent Studio
1. Click **"Agents"** in the sidebar
2. Create a custom AI agent
3. Design workflows with the visual builder

## 🎯 Next Steps

Now that you're set up, explore these advanced features:

### 🚀 For Developers
- **Smart Scaffolding**: Let AI generate complete applications
- **Multi-file editing**: Work on complex projects
- **Git integration**: Version control your projects
- **Deployment**: Deploy your apps to various platforms

### 🎨 For Creators
- **Advanced prompting**: Master image generation techniques
- **Custom models**: Install and use specialized AI models
- **Batch generation**: Create multiple variations
- **Post-processing**: Enhance your generated images

### ⚡ For Automation Enthusiasts
- **Complex workflows**: Build sophisticated automation
- **API integrations**: Connect to external services
- **Scheduled tasks**: Automate recurring processes
- **Custom agents**: Create specialized AI assistants

## 🆘 Getting Help

### Built-in Resources
- **Help Section**: Press `F1` or click **Help** in the sidebar
- **Debug Tools**: Advanced diagnostics in **Settings** → **Debug**
- **Documentation**: Complete guides for every feature

### Community Support
- **Discord**: Join our active community for real-time help
- **Reddit**: Browse discussions and share your creations
- **GitHub Issues**: Report bugs and request features

### Tips for Success
1. **Start Simple**: Begin with basic features and gradually explore advanced capabilities
2. **Experiment Freely**: angelaVerse runs locally - feel free to try anything!
3. **Join the Community**: Connect with other users for tips and inspiration
4. **Stay Updated**: Check for updates regularly for new features

---

## 🎉 You're Ready!

Congratulations! You now have angelaVerse set up and ready for your AI-powered development journey. Whether you're coding, creating, or automating, angelaVerse has the tools you need.

**Ready to dive deeper?** Check out our detailed feature guides:
- [LumaUI Web Development](../features/lumaui.md)
- [angela Assistant Guide](../features/angela-assistant.md)
- [AI Features Overview](../ai-features/README.md)

*Happy creating with angelaVerse! 🚀* 
