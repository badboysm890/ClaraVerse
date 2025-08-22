import { WebContainer } from '@webcontainer/api';
import phaserSnakeGameConfig from '../components/scaffolding_templates/phaser_snake_game';

export interface ProjectScaffoldConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  setupSteps: ScaffoldStep[];
}

export interface ScaffoldStep {
  name: string;
  description: string;
  command: string;
  args: string[];
  workingDir?: string;
  timeout?: number;
  successMessage?: string;
  errorMessage?: string;
}

export interface ScaffoldProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepDescription: string;
  isComplete: boolean;
  error?: string;
}

export class ProjectScaffolder {
  private webContainer: WebContainer;
  private writeToTerminal: (data: string) => void;

  constructor(webContainer: WebContainer, writeToTerminal: (data: string) => void) {
    this.webContainer = webContainer;
    this.writeToTerminal = writeToTerminal;
  }

  async scaffoldProject(
    config: ProjectScaffoldConfig,
    projectName: string,
    onProgress?: (progress: ScaffoldProgress) => void
  ): Promise<boolean> {
    try {
      this.writeToTerminal(`\x1b[36m🚀 Scaffolding ${config.name} project: ${projectName}\x1b[0m\n`);
      this.writeToTerminal(`\x1b[33m📋 Steps to execute: ${config.setupSteps.length}\x1b[0m\n\n`);
      
      for (let i = 0; i < config.setupSteps.length; i++) {
        const step = config.setupSteps[i];
        
        // Report progress
        if (onProgress) {
          onProgress({
            currentStep: i + 1,
            totalSteps: config.setupSteps.length,
            stepName: step.name,
            stepDescription: step.description,
            isComplete: false
          });
        }

        this.writeToTerminal(`\x1b[33m📦 Step ${i + 1}/${config.setupSteps.length}: ${step.description}\x1b[0m\n`);
        this.writeToTerminal(`\x1b[90m   Command: ${step.command} ${step.args.join(' ')}\x1b[0m\n`);
        
        try {
          // Execute the command
          this.writeToTerminal('\x1b[90m   Starting command...\x1b[0m\n');
          
          const process = await this.webContainer.spawn(step.command, step.args, {
            cwd: step.workingDir || '/'
          });

          // Stream output to terminal with prefixing
          let outputBuffer = '';
          process.output.pipeTo(new WritableStream({
            write: (data) => {
              outputBuffer += data;
              // Add prefix to each line for better readability
              const lines = data.split('\n');
              lines.forEach((line, index) => {
                if (line.trim() && index < lines.length - 1) {
                  this.writeToTerminal(`\x1b[90m   │ \x1b[0m${line}\n`);
                } else if (line.trim()) {
                  this.writeToTerminal(`\x1b[90m   │ \x1b[0m${line}`);
                }
              });
            }
          }));

          // Wait for completion with timeout
          this.writeToTerminal('\x1b[90m   Waiting for completion...\x1b[0m\n');
          
          const exitCode = await Promise.race([
            process.exit,
            new Promise<number>((_, reject) => 
              setTimeout(() => reject(new Error(`Command timeout after ${step.timeout || 120000}ms`)), step.timeout || 120000)
            )
          ]);

          if (exitCode !== 0) {
            this.writeToTerminal(`\x1b[31m   ❌ Command failed with exit code ${exitCode}\x1b[0m\n`);
            this.writeToTerminal(`\x1b[31m   📋 Command output:\x1b[0m\n${outputBuffer}\n`);
            throw new Error(`Command failed with exit code ${exitCode}`);
          }

          // Success message
          const message = step.successMessage || `✅ ${step.name} completed`;
          this.writeToTerminal(`\x1b[32m   ${message}\x1b[0m\n\n`);

        } catch (error) {
          const errorMsg = step.errorMessage || `❌ Failed: ${step.name}`;
          const errorDetails = error instanceof Error ? error.message : String(error);
          
          this.writeToTerminal(`\x1b[31m   ${errorMsg}\x1b[0m\n`);
          this.writeToTerminal(`\x1b[31m   Error details: ${errorDetails}\x1b[0m\n`);
          this.writeToTerminal(`\x1b[31m   Working directory: ${step.workingDir || '/'}\x1b[0m\n`);
          this.writeToTerminal(`\x1b[31m   Command: ${step.command} ${step.args.join(' ')}\x1b[0m\n\n`);
          
          if (onProgress) {
            onProgress({
              currentStep: i + 1,
              totalSteps: config.setupSteps.length,
              stepName: step.name,
              stepDescription: step.description,
              isComplete: false,
              error: errorDetails
            });
          }
          
          return false;
        }
      }

      // Final success
      if (onProgress) {
        onProgress({
          currentStep: config.setupSteps.length,
          totalSteps: config.setupSteps.length,
          stepName: 'Complete',
          stepDescription: 'Project setup complete',
          isComplete: true
        });
      }

      this.writeToTerminal(`\x1b[32m🎉 All steps completed successfully!\x1b[0m\n`);
      this.writeToTerminal(`\x1b[32m📁 Project ${projectName} scaffolded successfully\x1b[0m\n\n`);
      return true;

    } catch (error) {
      const errorDetails = error instanceof Error ? error.message : String(error);
      this.writeToTerminal(`\x1b[31m❌ Project scaffolding failed: ${errorDetails}\x1b[0m\n`);
      this.writeToTerminal(`\x1b[31m🔍 Check the step-by-step output above for more details\x1b[0m\n\n`);
      return false;
    }
  }
}

// Project configurations
export const PROJECT_CONFIGS: Record<string, ProjectScaffoldConfig> = {
  'react-vite-tailwind': {
    id: 'react-vite-tailwind',
    name: 'React + Vite + Tailwind',
    description: 'Modern React app with Vite and Tailwind CSS',
    icon: '⚛️',
    category: 'React',
    setupSteps: [
      {
        name: 'create-vite',
        description: 'Creating Vite React TypeScript project...',
        command: 'npx',
        args: ['--yes', 'create-vite@latest', '.', '--template', 'react-ts'],
        successMessage: '✅ Vite project created',
        timeout: 120000
      },
      {
        name: 'fix-plugin-react-version',
        description: 'Ensure latest @vitejs/plugin-react is installed',
        command: 'npm',
        args: ['install', '@vitejs/plugin-react@latest'],
        successMessage: '✅ @vitejs/plugin-react updated',
        timeout: 60000
      },
      {
        name: 'install-deps',
        description: 'Installing project dependencies...',
        command: 'npm',
        args: ['install'],
        successMessage: '✅ Dependencies installed',
        timeout: 180000
      },
      {
        name: 'install-tailwind',
        description: 'Installing Tailwind CSS...',
        command: 'npm',
        args: ['install', '-D', 'tailwindcss@^3.4.0', 'postcss', 'autoprefixer'],
        successMessage: '✅ Tailwind CSS installed',
        timeout: 120000
      },
      {
        name: 'init-tailwind',
        description: 'Initializing Tailwind configuration...',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          
          try {
            console.log('🎨 Creating Tailwind CSS configuration...');
            
            // Create tailwind.config.js
            const tailwindConfig = \`/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [],
}\`;
            
            fs.writeFileSync('tailwind.config.js', tailwindConfig);
            console.log('✅ tailwind.config.js created');
            
            // Create postcss.config.js
            const postcssConfig = \`export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}\`;
            
            fs.writeFileSync('postcss.config.js', postcssConfig);
            console.log('✅ postcss.config.js created');
            
            console.log('🎯 Tailwind CSS initialization complete!');
          } catch (error) {
            console.error('❌ Tailwind init error:', error.message);
            process.exit(1);
          }
        `],
        successMessage: '✅ Tailwind configuration created',
        timeout: 30000
      },
      {
        name: 'configure-tailwind',
        description: 'Configuring Tailwind CSS...',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          
          try {
            console.log('📝 Updating Tailwind configuration...');
            
            // Update tailwind.config.js
            const tailwindConfig = \`/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [],
}\`;
            
            fs.writeFileSync('tailwind.config.js', tailwindConfig);
            console.log('✅ Tailwind config updated');
            
            console.log('📝 Updating CSS file...');
            
            // Update src/index.css
            const indexCss = \`@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
  }
  
  body {
    @apply antialiased;
  }
}

@layer components {
  .btn-primary {
    @apply bg-primary-500 hover:bg-primary-600 text-white font-bold py-2 px-4 rounded transition-colors duration-200;
  }
  
  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
}\`;
            
            fs.writeFileSync('src/index.css', indexCss);
            console.log('✅ CSS updated');
            
            console.log('🎯 Tailwind CSS configuration complete!');
          } catch (error) {
            console.error('❌ Configuration error:', error.message);
            process.exit(1);
          }
        `],
        successMessage: '✅ Tailwind CSS configured',
        timeout: 30000
      },
      {
        name: 'update-app',
        description: 'Creating demo App component with Tailwind...',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          
          try {
            const appTsx = \`import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-8 text-center">
          <div className="uppercase tracking-wide text-sm text-indigo-500 font-semibold mb-4">
            React + Vite + Tailwind CSS
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Welcome to React!
          </h1>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-6">
              <button 
                onClick={() => setCount((count) => count + 1)}
                className="bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 transform hover:scale-105"
              >
                Count is {count}
              </button>
            </div>
            <p className="text-gray-600 text-sm">
              Edit <code className="bg-gray-100 px-2 py-1 rounded text-primary-600 font-mono">src/App.tsx</code> and save to test HMR
            </p>
            <div className="flex justify-center space-x-4 mt-6">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                React 18
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Vite
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Tailwind CSS
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                TypeScript
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App\`;
            
            fs.writeFileSync('src/App.tsx', appTsx);
            console.log('✅ App.tsx updated');
            
            const appCss = \`/* Additional custom styles can go here */
/* Tailwind utilities will handle most styling */

/* Custom animations */
@keyframes pulse-slow {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse-slow {
  animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Custom component styles */
.gradient-text {
  background: linear-gradient(45deg, #3b82f6, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}\`;
            
            fs.writeFileSync('src/App.css', appCss);
            console.log('✅ App.css updated');
          } catch (error) {
            console.error('❌ App creation error:', error.message);
            process.exit(1);
          }
        `],
        successMessage: '✅ Demo app with Tailwind created',
        timeout: 30000
      }
    ]
  },

  'vanilla-tailwind': {
    id: 'vanilla-tailwind',
    name: 'Vanilla + Tailwind',
    description: 'Pure HTML, CSS, JavaScript with Tailwind CSS',
    icon: '🌟',
    category: 'Vanilla',
    setupSteps: [
      {
        name: 'create-structure',
        description: 'Creating project structure...',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          
          try {
            console.log('📁 Creating vanilla project structure...');
            
            // Create package.json
            const packageJson = {
              "name": "vanilla-tailwind-app",
              "version": "1.0.0",
              "description": "Vanilla HTML/CSS/JS app with Tailwind CSS",
              "main": "index.html",
              "scripts": {
                "dev": "serve . -p 3000",
                "build": "echo 'No build step needed for vanilla project'",
                "preview": "serve . -p 3000"
              },
              "devDependencies": {
                "serve": "^14.2.0"
              },
              "keywords": ["vanilla", "html", "css", "javascript", "tailwind"],
              "author": "",
              "license": "MIT"
            };
            
            fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
            console.log('✅ package.json created');
            
            // Create index.html
            const indexHtml = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vanilla + Tailwind App</title>
    <link rel="stylesheet" href="./styles.css">
</head>
<body class="bg-gray-50 dark:bg-gray-900 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <header class="text-center mb-12">
            <h1 class="text-4xl font-bold text-gray-800 dark:text-white mb-4">
                🌟 Vanilla + Tailwind
            </h1>
            <p class="text-xl text-gray-600 dark:text-gray-300">
                Pure HTML, CSS, JavaScript with Tailwind CSS
            </p>
        </header>

        <!-- Main Content -->
        <main class="max-w-4xl mx-auto">
            <!-- Welcome Card -->
            <div class="card mb-8">
                <h2 class="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
                    Welcome to Your Vanilla App! 👋
                </h2>
                <p class="text-gray-600 dark:text-gray-300 mb-6">
                    This is a simple HTML/CSS/JavaScript application enhanced with Tailwind CSS for beautiful styling.
                </p>
                <button id="welcomeBtn" class="btn-primary">
                    Click me!
                </button>
            </div>

            <!-- Features Grid -->
            <div class="grid md:grid-cols-3 gap-6 mb-8">
                <div class="card">
                    <div class="text-3xl mb-4">⚡</div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Fast</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">
                        No build process needed. Just open and start coding!
                    </p>
                </div>
                
                <div class="card">
                    <div class="text-3xl mb-4">🎨</div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Beautiful</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">
                        Tailwind CSS provides utility-first styling.
                    </p>
                </div>
                
                <div class="card">
                    <div class="text-3xl mb-4">🔧</div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Simple</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">
                        Pure vanilla JavaScript. No frameworks required.
                    </p>
                </div>
            </div>

            <!-- Interactive Demo -->
            <div class="card">
                <h3 class="text-xl font-semibold text-gray-800 dark:text-white mb-4">Interactive Demo</h3>
                <div class="space-y-4">
                    <div>
                        <label for="nameInput" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Enter your name:
                        </label>
                        <input 
                            type="text" 
                            id="nameInput" 
                            placeholder="Your name..."
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        >
                    </div>
                    <button id="greetBtn" class="btn-secondary">
                        Greet Me
                    </button>
                    <div id="greetingResult" class="text-lg font-medium text-blue-600 dark:text-blue-400"></div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="text-center mt-12 py-6 border-t border-gray-200 dark:border-gray-700">
            <p class="text-gray-500 dark:text-gray-400">
                Built with ❤️ using Vanilla JavaScript + Tailwind CSS
            </p>
        </footer>
    </div>

    <script src="./script.js"></script>
</body>
</html>\`;
            
            fs.writeFileSync('index.html', indexHtml);
            console.log('✅ index.html created');
            
            console.log('🎯 Project structure created successfully!');
          } catch (error) {
            console.error('❌ Structure creation error:', error.message);
            process.exit(1);
          }
        `],
        successMessage: '✅ Project structure created',
        timeout: 30000
      },
      {
        name: 'install-deps',
        description: 'Installing project dependencies...',
        command: 'npm',
        args: ['install'],
        successMessage: '✅ Dependencies installed',
        timeout: 120000
      },
      {
        name: 'install-tailwind',
        description: 'Installing Tailwind CSS...',
        command: 'npm',
        args: ['install', '-D', 'tailwindcss@^3.4.0', 'postcss', 'autoprefixer'],
        successMessage: '✅ Tailwind CSS installed',
        timeout: 120000
      },
      {
        name: 'init-tailwind',
        description: 'Initializing Tailwind configuration...',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          
          try {
            console.log('🎨 Creating Tailwind CSS configuration...');
            
            // Create tailwind.config.js
            const tailwindConfig = \`/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./*.js",
    "./src/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [],
};\`;
            
            fs.writeFileSync('tailwind.config.js', tailwindConfig);
            console.log('✅ tailwind.config.js created');
            
            // Create postcss.config.js
            const postcssConfig = \`module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};\`;
            
            fs.writeFileSync('postcss.config.js', postcssConfig);
            console.log('✅ postcss.config.js created');
            
            console.log('🎯 Tailwind CSS initialization complete!');
          } catch (error) {
            console.error('❌ Tailwind init error:', error.message);
            process.exit(1);
          }
        `],
        successMessage: '✅ Tailwind configuration created',
        timeout: 30000
      },
      {
        name: 'create-css-js',
        description: 'Creating CSS and JavaScript files...',
        command: 'node',
        args: ['-e', 'const fs=require("fs");fs.writeFileSync("styles.css","@tailwind base;\\n@tailwind components;\\n@tailwind utilities;\\n\\n@layer components {\\n  .btn { @apply font-bold py-2 px-4 rounded-lg transition-all duration-200 cursor-pointer; }\\n  .btn-primary { @apply bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5; }\\n  .btn-secondary { @apply bg-gray-500 hover:bg-gray-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5; }\\n  .card { @apply bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow duration-300; }\\n}");fs.writeFileSync("script.js","// Vanilla JavaScript with Tailwind CSS\\nconsole.log(\\"🚀 Vanilla + Tailwind app loaded!\\");\\n\\ndocument.addEventListener(\\"DOMContentLoaded\\", function() {\\n    const welcomeBtn = document.getElementById(\\"welcomeBtn\\");\\n    const greetBtn = document.getElementById(\\"greetBtn\\");\\n    const nameInput = document.getElementById(\\"nameInput\\");\\n    const greetingResult = document.getElementById(\\"greetingResult\\");\\n    \\n    let clickCount = 0;\\n    \\n    if (welcomeBtn) {\\n        welcomeBtn.addEventListener(\\"click\\", function() {\\n            clickCount++;\\n            const messages = [\\"👋 Hello there!\\", \\"🎉 Thanks for clicking!\\", \\"✨ You are awesome!\\", \\"🚀 Keep exploring!\\"];\\n            const randomMessage = messages[Math.floor(Math.random() * messages.length)];\\n            showNotification(randomMessage + \\" (Click #\\" + clickCount + \\")\\");\\n            welcomeBtn.classList.add(\\"animate-pulse\\");\\n            setTimeout(() => welcomeBtn.classList.remove(\\"animate-pulse\\"), 1000);\\n        });\\n    }\\n    \\n    if (greetBtn && nameInput && greetingResult) {\\n        greetBtn.addEventListener(\\"click\\", function() {\\n            const name = nameInput.value.trim();\\n            if (name) {\\n                greetingResult.textContent = \\"🌟 Hello, \\" + name + \\"! Welcome to vanilla JavaScript!\\";\\n            } else {\\n                greetingResult.textContent = \\"👋 Please enter your name first!\\";\\n            }\\n        });\\n    }\\n});\\n\\nfunction showNotification(message) {\\n    const notification = document.createElement(\\"div\\");\\n    notification.className = \\"fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50\\";\\n    notification.textContent = message;\\n    document.body.appendChild(notification);\\n    setTimeout(() => document.body.removeChild(notification), 3000);\\n}");console.log("✅ CSS and JavaScript files created");'],
        successMessage: '✅ CSS and JavaScript files created',
        timeout: 30000
      },
      {
        name: 'build-tailwind',
        description: 'Building Tailwind CSS...',
        command: 'npx',
        args: ['tailwindcss', '-i', './styles.css', '-o', './styles.css', '--watch=false'],
        successMessage: '✅ Tailwind CSS built',
        timeout: 60000
      }
    ]
  },
  'phaser-snake-game': phaserSnakeGameConfig,
}; 
