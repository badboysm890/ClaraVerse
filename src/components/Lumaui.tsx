import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Code, Play, Square, Loader2, ExternalLink, FolderOpen, MessageSquare, Eye, EyeOff } from 'lucide-react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from '@xterm/xterm';
import { createLumaTools } from '../services/lumaTools';

// Components
import CreateProjectModal from './lumaui_components/CreateProjectModal';
import ProjectSelectionModal from './lumaui_components/ProjectSelectionModal';
import FileExplorer from './lumaui_components/FileExplorer';
import MonacoEditor from './lumaui_components/MonacoEditor';
import TerminalComponent from './lumaui_components/TerminalComponent';

import PreviewPane from './lumaui_components/PreviewPane';
import ChatWindow from './lumaui_components/ChatWindow';
import ResizeHandle from './lumaui_components/ResizeHandle';

// Hooks
import { useResizable } from '../hooks/useResizable';

// Types and Data
import { Project, FileNode } from '../types';
import { useIndexedDB } from '../hooks/useIndexedDB';
import { ProjectScaffolder, PROJECT_CONFIGS, ScaffoldProgress } from '../services/projectScaffolder';
import { LumaUIAPIClient } from './lumaui_components/services/lumaUIApiClient';
import { useProviders } from '../contexts/ProvidersContext';
import { db } from '../db';
import ChatPersistence from './lumaui_components/ChatPersistence';

// Providers
import { ProvidersProvider } from '../contexts/ProvidersContext';
import { CheckpointProvider } from './lumaui_components/CheckpointManager';

const LumaUICore: React.FC = () => {
  // Provider context (currently unused but available for future features)
  const { } = useProviders();
  
  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSelectionModalOpen, setIsProjectSelectionModalOpen] = useState(false);
  const [webContainer, setWebContainer] = useState<WebContainer | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'terminal'>('editor');
  const [scaffoldProgress, setScaffoldProgress] = useState<ScaffoldProgress | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  
  // Resizable panels (using percentages)
  const leftPanel = useResizable({ 
    initialPercentage: 25, 
    minPercentage: 15, 
    maxPercentage: 50, 
    direction: 'horizontal' 
  });
  
  const rightPanel = useResizable({ 
    initialPercentage: 40, 
    minPercentage: 25, 
    maxPercentage: 60, 
    direction: 'horizontal',
    reverse: true // Right panel needs inverted drag behavior
  });

  // Debug logs for resize functionality
  useEffect(() => {
    console.log('🔧 RESIZE DEBUG - Left Panel:', {
      percentage: leftPanel.percentage,
      isResizing: leftPanel.isResizing
    });
  }, [leftPanel.percentage, leftPanel.isResizing]);

  useEffect(() => {
    console.log('🔧 RESIZE DEBUG - Right Panel:', {
      percentage: rightPanel.percentage,
      isResizing: rightPanel.isResizing
    });
  }, [rightPanel.percentage, rightPanel.isResizing]);
  
  // Removed terminal panel resizing since it's now integrated with tabs

  // Calculate middle panel percentage
  const middlePanelPercentage = 100 - leftPanel.percentage - rightPanel.percentage;
  
  // Debug middle panel calculation
  useEffect(() => {
    console.log('🔧 RESIZE DEBUG - Middle Panel:', {
      percentage: middlePanelPercentage,
      leftPanel: leftPanel.percentage,
      rightPanel: rightPanel.percentage,
      total: leftPanel.percentage + rightPanel.percentage + middlePanelPercentage
    });
  }, [middlePanelPercentage, leftPanel.percentage, rightPanel.percentage]);
  
  // Refs
  const terminalRef = useRef<Terminal | null>(null);
  const runningProcessesRef = useRef<any[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Database hook
  const { saveProjectToDB, loadProjectsFromDB, loadProjectFilesFromDB, deleteProjectFromDB } = useIndexedDB();

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      const savedProjects = await loadProjectsFromDB();
      setProjects(savedProjects);
      
      // Only show the project selection modal if no project is currently selected
      // This prevents the modal from opening when a project is already loaded
      if (!selectedProject) {
        setIsProjectSelectionModalOpen(true);
      }
    };
    loadProjects();
  }, [loadProjectsFromDB, selectedProject]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
    
  // Utility functions
  const writeToTerminal = (data: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(data);
    }
  };

  const buildFileTreeFromContainer = async (container: WebContainer, basePath = ''): Promise<FileNode[]> => {
    try {
      const entries = await container.fs.readdir(basePath || '/', { withFileTypes: true });
    const nodes: FileNode[] = [];
    
      for (const entry of entries) {
        // Skip common build/cache directories
        if (['node_modules', '.git', 'dist', 'build', '.next', '.vscode'].includes(entry.name)) {
          continue;
        }
        
        const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
        if (entry.isDirectory()) {
          const children = await buildFileTreeFromContainer(container, fullPath);
        nodes.push({
            name: entry.name,
            type: 'directory',
            children,
            path: fullPath
        });
        } else {
          try {
            const content = await container.fs.readFile(fullPath, 'utf-8');
        nodes.push({
              name: entry.name,
              type: 'file',
              content: content,
              path: fullPath
        });
          } catch (error) {
            console.warn(`Could not read file ${fullPath}:`, error);
          }
      }
    }
    
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Error building file tree:', error);
      return [];
    }
  };

  // Project handlers
  const handleCreateProject = async (name: string, configId: string) => {
    // Check WebContainer compatibility
    if (!window.crossOriginIsolated) {
      const errorMsg = `WebContainer requires cross-origin isolation to run properly.
      
For development, you can serve your app with:
- npm run dev (if using Vite with proper headers)
- Or serve with headers: Cross-Origin-Embedder-Policy: require-corp and Cross-Origin-Opener-Policy: same-origin

This is a browser security requirement for WebContainer.`;
      
      writeToTerminal('\x1b[31m❌ Cross-Origin Isolation Required\x1b[0m\n');
      writeToTerminal('\x1b[33m' + errorMsg + '\x1b[0m\n');
      alert(errorMsg);
      return;
    }

    const config = PROJECT_CONFIGS[configId];
    if (!config) {
      throw new Error(`Unknown project configuration: ${configId}`);
    }

    // Switch to terminal tab during creation
    setActiveTab('terminal');

    const newProject: Project = {
      id: `project-${Date.now()}`,
      name,
      framework: configId as any,
      status: 'idle',
      createdAt: new Date()
    };
    
    let container: WebContainer | null = null;
    let previousContainer: WebContainer | null = webContainer;
    
    try {
      // Clear terminal and start fresh
      if (terminalRef.current) {
        terminalRef.current.clear();
      }
      
      // Stop existing project if running (WebContainer can only have one instance)
      if (previousContainer) {
        writeToTerminal('\x1b[36m💡 Note: WebContainer allows only one instance at a time\x1b[0m\n');
        writeToTerminal('\x1b[33m🛑 Stopping existing project to create new one...\x1b[0m\n');
        
        if (selectedProject) {
          // Update the current project status
          const updatedProject = { ...selectedProject, status: 'idle' as const, previewUrl: undefined };
          setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
          setSelectedProject(updatedProject);
        }
        
        // Clean up running processes
        if (runningProcessesRef.current.length > 0) {
          writeToTerminal('\x1b[33m⏹️ Terminating existing processes...\x1b[0m\n');
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
              }
            } catch (error) {
              console.log('Error killing process during project creation:', error);
            }
          }
          runningProcessesRef.current = [];
        }
        
        // Teardown existing container
        try {
          await previousContainer.teardown();
          writeToTerminal('\x1b[32m✅ Previous WebContainer cleaned up\x1b[0m\n');
        } catch (cleanupError) {
          writeToTerminal('\x1b[33m⚠️ Warning: Error cleaning up previous container, proceeding anyway...\x1b[0m\n');
        }
        
        setWebContainer(null);
        
        // Wait a moment for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Initialize WebContainer for scaffolding
      writeToTerminal('\x1b[36m🚀 Initializing project scaffolder...\x1b[0m\n');
      writeToTerminal('\x1b[33m📋 Project: ' + name + '\x1b[0m\n');
      writeToTerminal('\x1b[33m📋 Template: ' + config.name + '\x1b[0m\n');
      writeToTerminal('\x1b[90m📋 Cross-Origin Isolation: ✅ Available\x1b[0m\n\n');
      
      container = await WebContainer.boot();
      writeToTerminal('\x1b[32m✅ WebContainer booted successfully\x1b[0m\n');
      
      // Create scaffolder and run project setup
      const scaffolder = new ProjectScaffolder(container, writeToTerminal);
      
      const success = await scaffolder.scaffoldProject(config, name, (progress) => {
        setScaffoldProgress(progress);
        writeToTerminal(`\x1b[36m📊 Progress: ${progress.currentStep}/${progress.totalSteps} - ${progress.stepName}\x1b[0m\n`);
      });
      
      if (!success) {
        writeToTerminal('\x1b[31m❌ Project scaffolding failed - check output above for details\x1b[0m\n');
        throw new Error('Project scaffolding failed - check terminal output for details');
      }
      
      // Build file tree from the scaffolded project
      writeToTerminal('\x1b[33m📁 Building file tree...\x1b[0m\n');
      const fileNodes = await buildFileTreeFromContainer(container);
      
      if (fileNodes.length === 0) {
        writeToTerminal('\x1b[31m❌ No files found in scaffolded project\x1b[0m\n');
        throw new Error('No files found in scaffolded project');
      }
      
      writeToTerminal(`\x1b[32m✅ Found ${fileNodes.length} files/directories\x1b[0m\n`);
      
      // Save to database
      writeToTerminal('\x1b[33m💾 Saving project to database...\x1b[0m\n');
      await saveProjectToDB(newProject, fileNodes);
      
      // Update state
    setProjects(prev => [newProject, ...prev]);
      setSelectedProject(newProject);
      setFiles(fileNodes);
      setSelectedFile(null);
      setSelectedFileContent('');
      setIsCreateModalOpen(false);
      setIsProjectSelectionModalOpen(false);
      
      writeToTerminal('\x1b[32m🎉 Project created and ready!\x1b[0m\n');
      writeToTerminal('\x1b[36m💡 You can now start the project using the Start button\x1b[0m\n\n');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to create project:', error);
      writeToTerminal(`\x1b[31m❌ Project creation failed: ${errorMessage}\x1b[0m\n`);
      writeToTerminal('\x1b[31m🔍 Check the error details above for more information\x1b[0m\n\n');
      throw error;
    } finally {
      // Clean up scaffolding container
      if (container) {
        try {
          await container.teardown();
          writeToTerminal('\x1b[33m🧹 Scaffolding container cleaned up\x1b[0m\n');
        } catch (cleanupError) {
          console.warn('Error cleaning up scaffolding container:', cleanupError);
          writeToTerminal('\x1b[33m⚠️ Warning: Could not clean up scaffolding container\x1b[0m\n');
        }
      }
      setScaffoldProgress(null);
    }
  };

  const handleProjectSelect = async (project: Project) => {
    // Immediately close modal to prevent any UI flicker
    setIsProjectSelectionModalOpen(false);
    
    // Clear terminal for new project
    if (terminalRef.current) {
      terminalRef.current.clear();
    }
    
    writeToTerminal(`\x1b[36m🔄 Switching to project: ${project.name}\x1b[0m\n`);
    
    // Force cleanup any existing WebContainer instance before switching
    if (webContainer || selectedProject) {
      writeToTerminal('\x1b[33m🛑 Stopping current project and cleaning up containers...\x1b[0m\n');
      
      if (selectedProject) {
        // Update the current project status to idle
        const updatedCurrentProject = { ...selectedProject, status: 'idle' as const, previewUrl: undefined };
        setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedCurrentProject : p));
      }
      
      // Clean up running processes
      if (runningProcessesRef.current.length > 0) {
        writeToTerminal('\x1b[33m⏹️ Terminating existing processes...\x1b[0m\n');
        for (const process of runningProcessesRef.current) {
          try {
            if (process && process.kill) {
              process.kill();
            }
          } catch (error) {
            console.log('Error killing process during project switch:', error);
          }
        }
        runningProcessesRef.current = [];
      }
      
      // Teardown existing container
      if (webContainer) {
        try {
          await webContainer.teardown();
          writeToTerminal('\x1b[32m✅ Previous WebContainer cleaned up\x1b[0m\n');
        } catch (cleanupError) {
          writeToTerminal('\x1b[33m⚠️ Warning: Error cleaning up previous container, proceeding anyway...\x1b[0m\n');
        }
        setWebContainer(null);
      }
      
      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setSelectedProject(project);
    
    writeToTerminal(`\x1b[33m📂 Loading project files from database...\x1b[0m\n`);
    
    const savedFiles = await loadProjectFilesFromDB(project.id);
    writeToTerminal(`\x1b[32m✅ Loaded ${savedFiles.length} files from database\x1b[0m\n`);
    
    if (savedFiles.length > 0) {
      setFiles(savedFiles);
      // Log some file details for debugging
      const fileCount = savedFiles.filter(f => f.type === 'file').length;
      const dirCount = savedFiles.filter(f => f.type === 'directory').length;
      writeToTerminal(`\x1b[90m   Files: ${fileCount}, Directories: ${dirCount}\x1b[0m\n`);
      
      // Check if package.json exists
      const hasPackageJson = savedFiles.some(f => f.name === 'package.json' && f.type === 'file');
      writeToTerminal(`\x1b[90m   package.json present: ${hasPackageJson ? '✅' : '❌'}\x1b[0m\n`);
    } else {
      writeToTerminal(`\x1b[31m❌ No files found in database for project ${project.id}\x1b[0m\n`);
      return;
    }
    
    setSelectedFile(null);
    setSelectedFileContent('');
    
    writeToTerminal('\x1b[36m💡 Project switched successfully. Use the Start button to run the project.\x1b[0m\n\n');
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      writeToTerminal(`\x1b[33m🗑️ Deleting project: ${project.name}\x1b[0m\n`);
      
      // If the project to be deleted is currently selected, handle cleanup
      if (selectedProject && selectedProject.id === project.id) {
        writeToTerminal('\x1b[33m🛑 Stopping and cleaning up current project...\x1b[0m\n');
        
        // Clean up running processes
        if (runningProcessesRef.current.length > 0) {
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
              }
            } catch (error) {
              console.log('Error killing process during project deletion:', error);
            }
          }
          runningProcessesRef.current = [];
        }
        
        // Teardown existing container
        if (webContainer) {
          try {
            await webContainer.teardown();
            writeToTerminal('\x1b[32m✅ WebContainer cleaned up\x1b[0m\n');
          } catch (cleanupError) {
            writeToTerminal('\x1b[33m⚠️ Warning: Error cleaning up container\x1b[0m\n');
          }
          setWebContainer(null);
        }
        
        // Clear UI state
        setSelectedProject(null);
        setFiles([]);
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Delete from database
      await deleteProjectFromDB(project.id);
      
      // Delete associated chat data
      ChatPersistence.deleteChatData(project.id);
      writeToTerminal(`\x1b[32m✅ Chat data cleared for project\x1b[0m\n`);
      
      // Update projects list
      setProjects(prev => prev.filter(p => p.id !== project.id));
      
      writeToTerminal(`\x1b[32m✅ Project "${project.name}" deleted successfully\x1b[0m\n`);
      
      // If no projects left, close the modal
      if (projects.length === 1) {
        setIsProjectSelectionModalOpen(false);
      }
      
    } catch (error) {
      console.error('Failed to delete project:', error);
      writeToTerminal(`\x1b[31m❌ Failed to delete project: ${error}\x1b[0m\n`);
      throw error; // Re-throw so the modal can handle the error
    }
  };

  const startProject = async (project: Project, projectFiles?: FileNode[]) => {
    return startProjectWithFiles(project, projectFiles || files);
  };

  const startProjectWithFiles = async (project: Project, projectFiles: FileNode[]) => {
    if (!window.crossOriginIsolated) {
      alert('WebContainer requires cross-origin isolation to run. Please serve the app with proper headers.');
      return;
    }
    
    setIsStarting(true);
    runningProcessesRef.current = [];
    
    try {
      writeToTerminal('\x1b[36m🚀 Starting project...\x1b[0m\n');
      
      // Force cleanup any existing WebContainer instance
      if (webContainer) {
        writeToTerminal('\x1b[33m🧹 Cleaning up existing WebContainer instance...\x1b[0m\n');
        try {
          await webContainer.teardown();
        } catch (cleanupError) {
          writeToTerminal('\x1b[33m⚠️ Warning: Error during cleanup, forcing new instance...\x1b[0m\n');
        }
        setWebContainer(null);
      }
      
      // Try to boot new WebContainer with retry logic
      let container: WebContainer;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          writeToTerminal(`\x1b[33m🔧 Attempting to boot WebContainer (attempt ${retryCount + 1}/${maxRetries})...\x1b[0m\n`);
          container = await WebContainer.boot();
          break;
        } catch (bootError) {
          retryCount++;
          writeToTerminal(`\x1b[31m❌ Boot attempt ${retryCount} failed: ${bootError}\x1b[0m\n, Try Hard Reshing Please`);
          
          if (retryCount < maxRetries) {
            writeToTerminal('\x1b[33m⏳ Waiting 2 seconds before retry...\x1b[0m\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Force global cleanup if needed
            if (bootError instanceof Error && bootError.message.includes('single WebContainer instance')) {
              writeToTerminal('\x1b[33m🔨 Attempting to force cleanup existing instances...\x1b[0m\n');
              // Give extra time for cleanup
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } else {
            throw new Error(`Failed to boot WebContainer after ${maxRetries} attempts: ${bootError}`);
          }
        }
      }
      
      setWebContainer(container!);
      writeToTerminal('\x1b[32m✅ WebContainer initialized successfully\x1b[0m\n');
      
      // Debug: Check files array before creating structure
      writeToTerminal(`\x1b[90m🔍 Debug: projectFiles array contains ${projectFiles.length} items\x1b[0m\n`);
      if (projectFiles.length === 0) {
        writeToTerminal(`\x1b[31m❌ CRITICAL: No files to mount! This will cause package.json not found error.\x1b[0m\n`);
        throw new Error('No files available to mount to WebContainer. Project data may be corrupted.');
      }
      
      // List top-level files for debugging
      const topLevelFiles = projectFiles.filter(f => f.type === 'file').map(f => f.name);
      const topLevelDirs = projectFiles.filter(f => f.type === 'directory').map(f => f.name);
      writeToTerminal(`\x1b[90m   Top-level files: [${topLevelFiles.join(', ')}]\x1b[0m\n`);
      writeToTerminal(`\x1b[90m   Top-level directories: [${topLevelDirs.join(', ')}]\x1b[0m\n`);
      
      // Recreate the project structure from our saved files with error handling
      const createFileStructure = async (nodes: FileNode[], basePath = '') => {
        for (const node of nodes) {
          const fullPath = basePath ? `${basePath}/${node.name}` : node.name;
          
          try {
            if (node.type === 'directory' && node.children) {
              await container!.fs.mkdir(fullPath, { recursive: true });
              writeToTerminal(`\x1b[90m📁 Created directory: ${fullPath}\x1b[0m\n`);
              await createFileStructure(node.children, fullPath);
            } else if (node.type === 'file' && node.content !== undefined) {
              // Ensure directory exists
              const dirPath = fullPath.split('/').slice(0, -1).join('/');
              if (dirPath) {
                await container!.fs.mkdir(dirPath, { recursive: true });
              }
              await container!.fs.writeFile(fullPath, node.content);
              writeToTerminal(`\x1b[90m📄 Created file: ${fullPath} (${node.content.length} bytes)\x1b[0m\n`);
              
              // For package.json, add extra verification
              if (node.name === 'package.json') {
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                const verification = await container!.fs.readFile(fullPath, 'utf-8');
                if (verification !== node.content) {
                  writeToTerminal(`\x1b[33m⚠️ package.json write verification failed, retrying...\x1b[0m\n`);
                  await container!.fs.writeFile(fullPath, node.content);
                }
                writeToTerminal(`\x1b[32m✅ package.json successfully created and verified\x1b[0m\n`);
              }
            }
          } catch (error) {
            writeToTerminal(`\x1b[31m❌ Failed to create ${fullPath}: ${error}\x1b[0m\n`);
            throw error;
          }
        }
      };
      
      await createFileStructure(projectFiles);
      writeToTerminal('\x1b[32m✅ Project files mounted\x1b[0m\n');
      
      // Verify critical files are accessible before proceeding
      writeToTerminal('\x1b[33m🔍 Verifying project files...\x1b[0m\n');
      
      const verifyFiles = async (retryCount = 0): Promise<void> => {
        const maxRetries = 5;
        const retryDelay = 500; // Start with 500ms, increase each retry
        
        try {
          // Check if package.json exists and is readable
          const packageJson = await container!.fs.readFile('package.json', 'utf-8');
          if (!packageJson || packageJson.trim().length === 0) {
            throw new Error('package.json is empty or unreadable');
          }
          
          // Verify we can parse it as JSON
          JSON.parse(packageJson);
          writeToTerminal('\x1b[32m✅ package.json verified\x1b[0m\n');
          
          // Check working directory
          const currentDir = await container!.fs.readdir('.');
          writeToTerminal(`\x1b[32m✅ Working directory contains ${currentDir.length} items\x1b[0m\n`);
          
        } catch (error) {
          if (retryCount < maxRetries) {
            const delay = retryDelay * (retryCount + 1); // Exponential backoff
            writeToTerminal(`\x1b[33m⏳ File verification failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying in ${delay}ms...\x1b[0m\n`);
            writeToTerminal(`\x1b[90m   Error: ${error}\x1b[0m\n`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return verifyFiles(retryCount + 1);
          } else {
            throw new Error(`File verification failed after ${maxRetries + 1} attempts: ${error}`);
          }
        }
      };
      
      await verifyFiles();
      
      // Install dependencies with retry logic
      writeToTerminal('\x1b[33m📦 Installing dependencies...\x1b[0m\n');
      
      const installWithRetry = async (retryCount = 0): Promise<void> => {
        const maxRetries = 3;
        
        try {
          const installProcess = await container!.spawn('npm', ['install']);
          installProcess.output.pipeTo(new WritableStream({
            write(data) { writeToTerminal(data); }
          }));
          
          const installExitCode = await installProcess.exit;
          if (installExitCode !== 0) {
            throw new Error(`npm install failed with exit code ${installExitCode}`);
          }
          
        } catch (error) {
          if (retryCount < maxRetries) {
            writeToTerminal(`\x1b[33m⏳ npm install failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...\x1b[0m\n`);
            writeToTerminal(`\x1b[90m   Error: ${error}\x1b[0m\n`);
            
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            return installWithRetry(retryCount + 1);
          } else {
            throw error;
          }
        }
      };
      
      await installWithRetry();
      
      writeToTerminal('\x1b[32m✅ Dependencies installed\x1b[0m\n');
      
      // Determine start command based on project type
      const isViteBasedProject = ['react-vite-tailwind', 'vue-vite', 'svelte-kit'].includes(project.framework);
      
      if (isViteBasedProject) {
        writeToTerminal('\x1b[33m🏃 Starting development server...\x1b[0m\n');
        const devProcess = await container!.spawn('npm', ['run', 'dev']);
        runningProcessesRef.current.push(devProcess);
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) { writeToTerminal(data); }
        }));
        
        container!.on('server-ready', (port, url) => {
          writeToTerminal(`\x1b[32m🌐 Server ready at: ${url}\x1b[0m\n`);
          writeToTerminal(`\x1b[36m💡 Framework: ${project.framework} running on port ${port}\x1b[0m\n`);
          const updatedProject = { ...project, status: 'running' as const, previewUrl: url };
          setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
          setSelectedProject(updatedProject);
        });
      } else {
        // For non-Vite projects (vanilla HTML, etc.)
        writeToTerminal('\x1b[33m🌐 Starting static server...\x1b[0m\n');
        const devProcess = await container!.spawn('npm', ['run', 'dev']);
        runningProcessesRef.current.push(devProcess);
        
        devProcess.output.pipeTo(new WritableStream({
          write(data) { writeToTerminal(data); }
        }));
        
        // For static projects, construct URL (serve typically uses port 3000)
        setTimeout(() => {
          const url = `${window.location.protocol}//${window.location.hostname}:3000`;
          writeToTerminal(`\x1b[32m🌐 Static server ready at: ${url}\x1b[0m\n`);
          const updatedProject = { ...project, status: 'running' as const, previewUrl: url };
          setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
          setSelectedProject(updatedProject);
        }, 3000);
      }
      
    } catch (error) {
      console.error('Failed to start project:', error);
      writeToTerminal(`\x1b[31m❌ Error: ${error}\x1b[0m\n`);
      writeToTerminal('\x1b[31m🔧 Try stopping all projects and starting fresh if the issue persists\x1b[0m\n');
      const updatedProject = { ...project, status: 'error' as const };
      setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
      setSelectedProject(updatedProject);
      
      // Ensure cleanup on error
      if (webContainer) {
        try {
          await webContainer.teardown();
          setWebContainer(null);
          writeToTerminal('\x1b[33m🧹 Cleaned up WebContainer after error\x1b[0m\n');
        } catch (cleanupError) {
          console.warn('Error during error cleanup:', cleanupError);
          setWebContainer(null);
        }
      }
    } finally {
      setIsStarting(false);
    }
  };

  const stopProject = async (project: Project) => {
    writeToTerminal('\x1b[33m🛑 Stopping project...\x1b[0m\n');
    
    if (webContainer) {
      try {
        writeToTerminal('\x1b[33m⏹️ Terminating processes...\x1b[0m\n');
        
        if (runningProcessesRef.current.length > 0) {
          for (const process of runningProcessesRef.current) {
            try {
              if (process && process.kill) {
                process.kill();
                writeToTerminal('\x1b[33m⚡ Process terminated\x1b[0m\n');
              }
            } catch (error) {
              console.log('Error killing process:', error);
            }
          }
          runningProcessesRef.current = [];
        }
        
      await webContainer.teardown();
      setWebContainer(null);
        
        writeToTerminal('\x1b[32m✅ WebContainer stopped successfully\x1b[0m\n');
        writeToTerminal('\x1b[36m💤 Project is now idle\x1b[0m\n\n');
        
      } catch (error) {
        console.error('Error stopping WebContainer:', error);
        writeToTerminal(`\x1b[31m❌ Error stopping project: ${error}\x1b[0m\n`);
        setWebContainer(null);
        runningProcessesRef.current = [];
      }
    }
    
    const updatedProject = { ...project, status: 'idle' as const, previewUrl: undefined };
      setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
        setSelectedProject(updatedProject);
  };

  // Function to refresh file tree from WebContainer
  const refreshFileTree = useCallback(async () => {
    if (webContainer && selectedProject) {
      try {
        writeToTerminal('\x1b[33m🔄 Refreshing file tree...\x1b[0m\n');
        const updatedFiles = await buildFileTreeFromContainer(webContainer);
        setFiles(updatedFiles);
        
        // Auto-save updated project state
        if (selectedProject) {
          await saveProjectToDB(selectedProject, updatedFiles);
        }
        
        writeToTerminal(`\x1b[32m✅ File tree refreshed: ${updatedFiles.length} items\x1b[0m\n`);
      } catch (error) {
        console.error('Failed to refresh file tree:', error);
        writeToTerminal(`\x1b[31m❌ Failed to refresh file tree: ${error}\x1b[0m\n`);
      }
    }
  }, [webContainer, selectedProject, saveProjectToDB, writeToTerminal]);

  // Debounced auto-save function
  const debouncedSave = useCallback(async (content: string, filePath: string, projectFiles: FileNode[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (selectedProject) {
          await saveProjectToDB(selectedProject, projectFiles);
          writeToTerminal(`\x1b[32m💾 Auto-saved: ${filePath}\x1b[0m\n`);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        writeToTerminal(`\x1b[31m❌ Auto-save failed: ${filePath}\x1b[0m\n`);
      }
    }, 1000); // 1 second debounce
  }, [selectedProject, saveProjectToDB, writeToTerminal]);

  // File handlers
  const handleFileSelect = (path: string, content: string) => {
    setSelectedFile(path);
    setSelectedFileContent(content);
  };

  const handleFileContentChange = async (content: string) => {
    setSelectedFileContent(content);
    
    // Update WebContainer immediately
    if (webContainer && selectedFile) {
      try {
        await webContainer.fs.writeFile(selectedFile, content);
      } catch (error) {
        console.warn('Failed to write to WebContainer:', error);
      }
    }
    
    // Update local state
    const updateFileContent = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === selectedFile) {
          return { ...node, content };
        }
        if (node.children) {
          return { ...node, children: updateFileContent(node.children) };
        }
        return node;
      });
    };
    
    const updatedFiles = updateFileContent(files);
    setFiles(updatedFiles);

    // Auto-save with debouncing
    if (selectedFile) {
      debouncedSave(content, selectedFile, updatedFiles);
    }
  };

  const handleToggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // File operation handlers
  const handleCreateFile = async (parentPath: string, fileName: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
      
      // Create the file with empty content
      await webContainer.fs.writeFile(fullPath, '');
      writeToTerminal(`\x1b[32m✅ Created file: ${fullPath}\x1b[0m\n`);
      
      // Refresh file tree
      await refreshFileTree();
      
      // Auto-select the new file
      handleFileSelect(fullPath, '');
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to create file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleCreateFolder = async (parentPath: string, folderName: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      
      // Create the directory
      await webContainer.fs.mkdir(fullPath, { recursive: true });
      writeToTerminal(`\x1b[32m✅ Created folder: ${fullPath}\x1b[0m\n`);
      
      // Refresh file tree and expand the parent folder
      await refreshFileTree();
      setExpandedFolders(prev => new Set([...prev, parentPath, fullPath]));
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to create folder: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDeleteFile = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      console.log(`🗑️ Attempting to delete file: ${path}`);
      await webContainer.fs.rm(path);
      writeToTerminal(`\x1b[32m✅ Deleted file: ${path}\x1b[0m\n`);
      
      // Clear selection if deleted file was selected
      if (selectedFile === path) {
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Refresh file tree
      console.log('🔄 Refreshing file tree after deletion...');
      await refreshFileTree();
      console.log('✅ File tree refreshed');
    } catch (error) {
      console.error('❌ Delete file error:', error);
      writeToTerminal(`\x1b[31m❌ Failed to delete file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDeleteFolder = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      await webContainer.fs.rm(path, { recursive: true });
      writeToTerminal(`\x1b[32m✅ Deleted folder: ${path}\x1b[0m\n`);
      
      // Clear selection if deleted folder contained selected file
      if (selectedFile?.startsWith(path)) {
        setSelectedFile(null);
        setSelectedFileContent('');
      }
      
      // Remove from expanded folders
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        newSet.delete(path);
        // Also remove any child folders
        for (const expandedPath of prev) {
          if (expandedPath.startsWith(path + '/')) {
            newSet.delete(expandedPath);
          }
        }
        return newSet;
      });
      
      // Refresh file tree
      await refreshFileTree();
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to delete folder: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleRenameFile = async (oldPath: string, newPath: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read the current content
      const content = await webContainer.fs.readFile(oldPath, 'utf-8');
      
      // Create the new file
      await webContainer.fs.writeFile(newPath, content);
      
      // Delete the old file
      await webContainer.fs.rm(oldPath);
      
      writeToTerminal(`\x1b[32m✅ Renamed: ${oldPath} → ${newPath}\x1b[0m\n`);
      
      // Update selection if renamed file was selected
      if (selectedFile === oldPath) {
        setSelectedFile(newPath);
      }
      
      // Refresh file tree
      await refreshFileTree();
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to rename file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  const handleDuplicateFile = async (path: string) => {
    if (!webContainer) {
      writeToTerminal('\x1b[31m❌ WebContainer not available\x1b[0m\n');
      return;
    }

    try {
      // Read the current content
      const content = await webContainer.fs.readFile(path, 'utf-8');
      
      // Generate new filename
      const pathParts = path.split('/');
      const fileName = pathParts.pop() || '';
      const dir = pathParts.join('/');
      
      const nameParts = fileName.split('.');
      const ext = nameParts.length > 1 ? nameParts.pop() : '';
      const baseName = nameParts.join('.');
      
      const newFileName = ext ? `${baseName}_copy.${ext}` : `${baseName}_copy`;
      const newPath = dir ? `${dir}/${newFileName}` : newFileName;
      
      // Create the duplicate
      await webContainer.fs.writeFile(newPath, content);
      
      writeToTerminal(`\x1b[32m✅ Duplicated: ${path} → ${newPath}\x1b[0m\n`);
      
      // Refresh file tree
      await refreshFileTree();
      
      // Auto-select the new file
      handleFileSelect(newPath, content);
    } catch (error) {
      writeToTerminal(`\x1b[31m❌ Failed to duplicate file: ${error}\x1b[0m\n`);
      throw error;
    }
  };

  // Create LumaTools instance for AI operations (after all handlers are defined)
  const lumaTools = useMemo(() => {
    const tools = createLumaTools({
      webContainer,
      files,
      onFilesUpdate: setFiles,
      onFileSelect: handleFileSelect,
      onTerminalWrite: writeToTerminal,
      workingDirectory: selectedProject?.name || '.',
      onRefreshFileTree: refreshFileTree
    });
    
    return tools;
  }, [webContainer, files, selectedProject?.name, handleFileSelect, writeToTerminal, refreshFileTree]);

  return (
    <div className="h-[89vh] bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 overflow-hidden relative">
      {/* Wallpaper Background */}
      {wallpaperUrl && (
        <div 
          className="absolute top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Content with relative z-index */}
      <div className="relative z-10 h-full">
        {/* Scaffold Progress - Overlay */}
        {scaffoldProgress && !scaffoldProgress.isComplete && (
          <div className="absolute top-4 left-4 right-4 z-50 p-4 glassmorphic rounded-xl border border-white/30 dark:border-gray-700/50 shadow-xl backdrop-blur-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-sakura-800 dark:text-sakura-200">
                {scaffoldProgress.stepName}
              </span>
              <span className="text-xs px-2 py-1 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full font-medium">
                {scaffoldProgress.currentStep}/{scaffoldProgress.totalSteps}
              </span>
            </div>
            <div className="w-full bg-sakura-100 dark:bg-sakura-900/20 rounded-full h-2.5 mb-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-sakura-500 to-pink-500 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                style={{ width: `${(scaffoldProgress.currentStep / scaffoldProgress.totalSteps) * 100}%` }}
              ></div>
            </div>
            <p className="text-xs text-sakura-600 dark:text-sakura-400 leading-relaxed">
              {scaffoldProgress.stepDescription}
            </p>
          </div>
        )}
      
              {/* Main Layout */}
        <div className="h-full flex flex-col">
          {/* Enhanced Header - Glassmorphic Design */}
          {selectedProject && (
            <div className="glassmorphic border-b border-white/20 dark:border-gray-700/50 shrink-0 h-12 flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gradient-to-r from-sakura-500 to-pink-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {selectedProject.name}
                  </span>
                  {selectedProject.status === 'running' && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                      Running
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsProjectSelectionModalOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 hover:text-sakura-600 dark:hover:text-sakura-400 rounded-lg transition-colors"
                  >
                    <FolderOpen className="w-3 h-3" />
                    Switch
                  </button>
                  
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-lg hover:from-sakura-600 hover:to-pink-600 transition-all shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {selectedProject.status === 'running' && (
                  <button
                    onClick={() => stopProject(selectedProject)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-sm"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                )}
                
                {selectedProject.status === 'running' ? (
                  <button
                    onClick={() => startProject(selectedProject)}
                    disabled={isStarting}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {isStarting ? 'Starting...' : 'Start'}
                  </button>
                ) : (
                  <button
                    onClick={() => startProject(selectedProject)}
                    disabled={isStarting}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {isStarting ? 'Starting...' : 'Start'}
                  </button>
                )}
                
                {selectedProject.previewUrl && (
                  <button
                    onClick={() => window.open(selectedProject.previewUrl, '_blank')}
                    className="p-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Main Content Area - Three Panel Layout */}
        <div 
          ref={(el) => {
            // Store reference for resize calculations
            if (el) {
              el.setAttribute('data-resize-container', 'true');
            }
          }}
          className={`flex overflow-hidden ${selectedProject ? 'h-[calc(89vh-2rem)]' : 'h-[89vh]'}`}
        >
          {/* Project Content */}
          <div className="flex flex-1 overflow-hidden h-full">
      {selectedProject ? (
            <>
              {/* Left Panel - File Explorer Only */}
              <div 
                className="flex flex-col glassmorphic border-r border-white/20 dark:border-gray-700/50 h-full"
                style={{ 
                  width: `${leftPanel.percentage}%`,
                  backgroundColor: leftPanel.isResizing ? 'rgba(254, 226, 226, 0.3)' : '' // Debug: translucent red tint when resizing
                }}
                onMouseEnter={() => console.log('🔧 RESIZE DEBUG - Left panel hover, width:', `${leftPanel.percentage}%`)}
              >
                {/* Explorer Header */}
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 glassmorphic-card border-b border-white/20 dark:border-gray-700/50 shrink-0 h-10">
                  <FolderOpen className="w-4 h-4 text-sakura-500" />
                  <span>Explorer</span>
                  <div className="ml-auto text-xs px-2 py-0.5 bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-300 rounded-full">
                    {files.length}
                  </div>
                </div>

                {/* File Explorer Content */}
                <div className="flex-1 overflow-auto min-h-0 p-2">
                                  <FileExplorer
                  files={files}
                  selectedFile={selectedFile}
                  onFileSelect={handleFileSelect}
                  expandedFolders={expandedFolders}
                  onToggleFolder={handleToggleFolder}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFile={handleDeleteFile}
                  onDeleteFolder={handleDeleteFolder}
                  onRenameFile={handleRenameFile}
                  onDuplicateFile={handleDuplicateFile}
                />
                </div>
              </div>

              {/* Left Panel Resize Handle */}
              <ResizeHandle
                direction="horizontal"
                onMouseDown={(e) => {
                  console.log('🔧 RESIZE DEBUG - Left resize handle clicked', e);
                  leftPanel.startResize(e);
                }}
                isResizing={leftPanel.isResizing}
              />
          
          {/* Center Panel - Tabbed Interface */}
              <div 
                className="min-w-0 glassmorphic flex flex-col h-full"
                style={{ width: `${middlePanelPercentage}%` }}
              >
                {/* Tab Headers */}
                <div className="flex items-center border-b border-white/20 dark:border-gray-700/50 glassmorphic-card shrink-0 h-10">
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 h-full transition-all ${
                      activeTab === 'editor'
                        ? 'border-sakura-500 text-sakura-600 dark:text-sakura-400 bg-gradient-to-b from-sakura-50 to-transparent dark:from-sakura-900/20 dark:to-transparent'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                    }`}
                  >
                    <Code className="w-4 h-4" />
                    <span>Editor</span>
                  </button>
                  
                  {selectedProject && (
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 h-full transition-all ${
                        activeTab === 'preview'
                          ? 'border-sakura-500 text-sakura-600 dark:text-sakura-400 bg-gradient-to-b from-sakura-50 to-transparent dark:from-sakura-900/20 dark:to-transparent'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      <span>Preview</span>
                      {selectedProject.status === 'running' && (
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm"></div>
                      )}
                    </button>
                  )}
                  
                  <button
                    onClick={() => setActiveTab('terminal')}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 h-full transition-all ${
                      activeTab === 'terminal'
                        ? 'border-sakura-500 text-sakura-600 dark:text-sakura-400 bg-gradient-to-b from-sakura-50 to-transparent dark:from-sakura-900/20 dark:to-transparent'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Terminal</span>
                  </button>
                </div>
                
                {/* Tab Content */}
                <div className="flex-1 overflow-hidden min-h-0">
                  {activeTab === 'editor' && (
                    <MonacoEditor
                      content={selectedFileContent}
                      fileName={selectedFile || 'No file selected'}
                      onChange={handleFileContentChange}
                      isPreviewVisible={false}
                      onTogglePreview={() => setActiveTab('preview')}
                      showPreviewToggle={selectedProject !== null}
                      projectFiles={files}
                      webContainer={webContainer}
                    />
                  )}
                  
                  {activeTab === 'preview' && selectedProject && (
                    <PreviewPane
                      project={selectedProject}
                      isStarting={isStarting}
                      onStartProject={startProject}
                    />
                  )}
                  
                  {activeTab === 'terminal' && (
                    <TerminalComponent
                      webContainer={webContainer}
                      isVisible={true}
                      onToggle={() => setActiveTab('editor')}
                      terminalRef={terminalRef}
                    />
                  )}
                </div>
              </div>

              {/* Right Panel Resize Handle */}
              <ResizeHandle
                direction="horizontal"
                onMouseDown={(e) => {
                  console.log('🔧 RESIZE DEBUG - Right resize handle clicked', e);
                  rightPanel.startResize(e);
                }}
                isResizing={rightPanel.isResizing}
              />
          
                        {/* Chat Panel */}
              <div 
                className="glassmorphic border-l border-white/20 dark:border-gray-700/50 h-full overflow-hidden"
                style={{ 
                  width: `${rightPanel.percentage}%`,
                  backgroundColor: rightPanel.isResizing ? 'rgba(254, 226, 226, 0.3)' : '' // Debug: translucent red tint when resizing
                }}
                onMouseEnter={() => console.log('🔧 RESIZE DEBUG - Right panel hover, width:', `${rightPanel.percentage}%`)}
              >
                <ChatWindow
                  selectedFile={selectedFile}
                  fileContent={selectedFileContent}
                  files={files}
                  onFileContentChange={handleFileContentChange}
                  onFileSelect={handleFileSelect}
                  workingDirectory={selectedProject?.name || '.'}
                  lumaTools={lumaTools}
                  projectId={selectedProject?.id}
                  projectName={selectedProject?.name}
                  refreshFileTree={refreshFileTree}
                />
                </div>
            </>
            ) : (
              <>
                {/* Left Panel - Empty Explorer */}
                <div 
                  className="flex flex-col glassmorphic border-r border-white/20 dark:border-gray-700/50 h-full"
                  style={{ width: `${leftPanel.percentage}%` }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 glassmorphic-card border-b border-white/20 dark:border-gray-700/50 shrink-0 h-10">
                    <FolderOpen className="w-4 h-4 text-gray-400" />
                    <span>Explorer</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-4 min-h-0">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center opacity-50">
                        <FolderOpen className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        No project open
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Left Panel Resize Handle */}
                <ResizeHandle
                  direction="horizontal"
                  onMouseDown={(e) => {
                    console.log('🔧 RESIZE DEBUG - Left resize handle clicked (no project)', e);
                    leftPanel.startResize(e);
                  }}
                  isResizing={leftPanel.isResizing}
                />
                
                {/* Center Welcome Area - Tabbed Interface */}
                <div 
                  className="min-w-0 glassmorphic flex flex-col h-full"
                  style={{ width: `${middlePanelPercentage}%` }}
                >
                  {/* Tab Headers */}
                  <div className="flex items-center border-b border-white/20 dark:border-gray-700/50 glassmorphic-card shrink-0 h-10">
                    <button
                      onClick={() => setActiveTab('editor')}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 h-full transition-all ${
                        activeTab === 'editor'
                          ? 'border-sakura-500 text-sakura-600 dark:text-sakura-400 bg-gradient-to-b from-sakura-50 to-transparent dark:from-sakura-900/20 dark:to-transparent'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      <span>Editor</span>
                    </button>
                    
                    <button
                      onClick={() => setActiveTab('terminal')}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 h-full transition-all ${
                        activeTab === 'terminal'
                          ? 'border-sakura-500 text-sakura-600 dark:text-sakura-400 bg-gradient-to-b from-sakura-50 to-transparent dark:from-sakura-900/20 dark:to-transparent'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Terminal</span>
                    </button>
                  </div>
                  
                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden min-h-0">
                    {activeTab === 'editor' && (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center shadow-lg">
                            <Code className="w-10 h-10 text-sakura-600 dark:text-sakura-400" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                            Welcome to LumaUI
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                            Create powerful web applications with our intuitive project builder. Get started by creating your first project.
                          </p>
                          <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sakura-500 to-pink-500 text-white rounded-xl hover:from-sakura-600 hover:to-pink-600 transition-all mx-auto text-sm font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                          >
                            <Plus className="w-4 h-4" />
                            Create New Project
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {activeTab === 'terminal' && (
                      <TerminalComponent
                        webContainer={webContainer}
                        isVisible={true}
                        onToggle={() => setActiveTab('editor')}
                        terminalRef={terminalRef}
                      />
                    )}
                  </div>
                </div>
                
                {/* Right Panel Resize Handle */}
                <ResizeHandle
                  direction="horizontal"
                  onMouseDown={(e) => {
                    console.log('🔧 RESIZE DEBUG - Right resize handle clicked (no project)', e);
                    rightPanel.startResize(e);
                  }}
                  isResizing={rightPanel.isResizing}
                />
                
                {/* Right Panel - Chat (even without project) */}
                <div 
                  className="glassmorphic border-l border-white/20 dark:border-gray-700/50 h-full overflow-hidden"
                  style={{ width: `${rightPanel.percentage}%` }}
                >
                  <ChatWindow
                    selectedFile={null}
                    fileContent=""
                    files={[]}
                    onFileContentChange={() => {}}
                    onFileSelect={() => {}}
                    workingDirectory="."
                    projectId="no-project"
                    projectName="No Project"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Project Selection Modal */}
      <ProjectSelectionModal
        isOpen={isProjectSelectionModalOpen}
        projects={projects}
        onSelectProject={handleProjectSelect}
        onDeleteProject={handleDeleteProject}
        onCreateNew={() => {
          setIsProjectSelectionModalOpen(false);
          setIsCreateModalOpen(true);
        }}
        onClose={() => setIsProjectSelectionModalOpen(false)}
      />

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          // Only reopen selection modal if user explicitly closed create modal 
          // AND no project is currently selected AND there are existing projects
          // Don't reopen if a project was just selected
          const shouldReopenSelection = !selectedProject && projects.length > 0 && !isProjectSelectionModalOpen;
          if (shouldReopenSelection) {
            setIsProjectSelectionModalOpen(true);
          }
        }}
        onCreateProject={handleCreateProject}
      />
      </div>
    </div>
  );
};

// Main Lumaui component wrapped with providers
const Lumaui: React.FC = () => {
  return (
    <ProvidersProvider>
      <CheckpointProvider>
        <LumaUICore />
      </CheckpointProvider>
    </ProvidersProvider>
  );
};

export default Lumaui; 
