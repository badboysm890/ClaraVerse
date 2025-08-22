import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { 
  FileText, 
  Edit3, 
  Eye, 
  FolderOpen, 
  Terminal, 
  Package, 
  Info,
  Loader2,
  CheckCircle,
  XCircle,
  Code,
  Sparkles
} from 'lucide-react';

interface ToolExecution {
  id: string;
  toolName: string;
  parameters: any;
  status: 'starting' | 'executing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
}

interface LiveToolExecutionProps {
  currentExecution?: ToolExecution | null;
  isVisible: boolean;
  onComplete?: () => void;
}

const TOOL_ICONS: Record<string, React.ComponentType<any>> = {
  create_file: FileText,
  edit_file: Edit3,
  read_file: Eye,
  list_files: FolderOpen,
  get_all_files: FolderOpen,
  run_command: Terminal,
  install_package: Package,
  get_project_info: Info,
  default: Code
};

const TOOL_DESCRIPTIONS: Record<string, (params: any) => string> = {
  create_file: (params) => `Creating ${params.path}`,
  edit_file: (params) => `Editing ${params.path}`,
  read_file: (params) => `Reading ${params.path}`,
  list_files: (params) => `Listing ${params.path || 'project files'}`,
  get_all_files: () => `Getting project structure`,
  run_command: (params) => `Running: ${params.command}`,
  install_package: (params) => `Installing ${params.package}`,
  get_project_info: () => `Getting project info`,
  default: (params) => `Executing tool`
};

const LiveToolExecution: React.FC<LiveToolExecutionProps> = ({
  currentExecution,
  isVisible,
  onComplete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState('');
  const tlRef = useRef<gsap.core.Timeline>();

  // Create floating particles
  useEffect(() => {
    if (!particlesRef.current) return;

    const particles = Array.from({ length: 8 }, (_, i) => {
      const particle = document.createElement('div');
      particle.className = 'absolute w-1 h-1 bg-sakura-400 rounded-full';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';
      particlesRef.current!.appendChild(particle);

      gsap.to(particle, {
        x: Math.random() * 40 - 20,
        y: Math.random() * 40 - 20,
        opacity: Math.random() * 0.7 + 0.3,
        scale: Math.random() * 0.8 + 0.6,
        duration: Math.random() * 3 + 2,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut",
        delay: Math.random() * 2
      });

      return particle;
    });

    return () => {
      particles.forEach(p => p.remove());
    };
  }, [currentExecution]);

  // Main animation timeline
  useEffect(() => {
    if (!currentExecution || !isVisible) return;

    const tl = gsap.timeline({
      onComplete: () => {
        if (currentExecution.status === 'completed' || currentExecution.status === 'error') {
          setTimeout(() => {
            onComplete?.();
          }, 2000);
        }
      }
    });

    tlRef.current = tl;

    // Get tool info
    const IconComponent = TOOL_ICONS[currentExecution.toolName] || TOOL_ICONS.default;
    const description = TOOL_DESCRIPTIONS[currentExecution.toolName]?.(currentExecution.parameters) || 
                      TOOL_DESCRIPTIONS.default(currentExecution.parameters);

    // Set initial states
    gsap.set(containerRef.current, { opacity: 0, scale: 0.8, y: 20 });
    gsap.set(iconRef.current, { scale: 0, rotation: -180 });
    gsap.set(textRef.current, { opacity: 0, y: 10 });
    gsap.set(progressRef.current, { scaleX: 0 });

    // Entrance animation
    tl.to(containerRef.current, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.5,
      ease: "back.out(1.7)"
    })
    .to(iconRef.current, {
      scale: 1,
      rotation: 0,
      duration: 0.6,
      ease: "back.out(1.7)"
    }, "-=0.3")
    .to(textRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: "power2.out"
    }, "-=0.3");

    // Status-based animations
    if (currentExecution.status === 'executing') {
      // Typewriter effect for text
      setDisplayText('');
      const chars = description.split('');
      chars.forEach((char, i) => {
        setTimeout(() => {
          setDisplayText(prev => prev + char);
        }, i * 50);
      });

      // Pulsing icon
      tl.to(iconRef.current, {
        scale: 1.1,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      }, "-=0.2");

      // Progress bar
      tl.to(progressRef.current, {
        scaleX: 0.7,
        duration: 2,
        ease: "power2.out"
      }, "-=0.4");

    } else if (currentExecution.status === 'completed') {
      setDisplayText(description + ' ✓');
      
      // Success animation
      tl.to(iconRef.current, {
        scale: 1.2,
        duration: 0.3,
        ease: "back.out(1.7)",
        yoyo: true,
        repeat: 1
      })
      .to(progressRef.current, {
        scaleX: 1,
        duration: 0.5,
        ease: "power2.out"
      }, "-=0.4")
      .to(containerRef.current, {
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        duration: 0.5,
        ease: "power2.out"
      }, "-=0.3");

    } else if (currentExecution.status === 'error') {
      setDisplayText(description + ' ✗');
      
      // Error animation
      tl.to(iconRef.current, {
        x: -5,
        duration: 0.1,
        repeat: 5,
        yoyo: true,
        ease: "power2.inOut"
      })
      .to(containerRef.current, {
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        duration: 0.5,
        ease: "power2.out"
      }, "-=0.3");
    }

    return () => {
      tl.kill();
    };
  }, [currentExecution, isVisible, onComplete]);

  if (!currentExecution || !isVisible) return null;

  const IconComponent = TOOL_ICONS[currentExecution.toolName] || TOOL_ICONS.default;

  return (
    <div 
      ref={containerRef}
      className="relative glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl p-4 mx-4 mb-4 overflow-hidden backdrop-blur-md"
    >
      {/* Particles background */}
      <div ref={particlesRef} className="absolute inset-0 pointer-events-none opacity-60" />
      
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-sakura-500/10 to-pink-500/10 animate-pulse" />
      
      {/* Content */}
      <div className="relative z-10 flex items-center gap-4">
        {/* Animated icon */}
        <div 
          ref={iconRef}
          className="w-10 h-10 bg-gradient-to-br from-sakura-400 to-pink-500 rounded-lg flex items-center justify-center shadow-lg"
        >
          <IconComponent className="w-5 h-5 text-white" />
        </div>
        
        {/* Tool description */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              angela is working
            </span>
            <Sparkles className="w-4 h-4 text-sakura-500 animate-pulse" />
          </div>
          
          <div 
            ref={textRef}
            className="text-sm text-gray-600 dark:text-gray-400 font-mono"
          >
            {displayText}
            {currentExecution.status === 'executing' && (
              <span className="animate-pulse">|</span>
            )}
          </div>
          
          {/* Progress bar */}
          <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
            <div 
              ref={progressRef}
              className="h-full bg-gradient-to-r from-sakura-400 to-pink-500 rounded-full origin-left"
            />
          </div>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center">
          {currentExecution.status === 'executing' && (
            <Loader2 className="w-5 h-5 text-sakura-500 animate-spin" />
          )}
          {currentExecution.status === 'completed' && (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          {currentExecution.status === 'error' && (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
        </div>
      </div>
      
      {/* Execution details */}
      {currentExecution.parameters && (
        <div className="mt-3 p-2 bg-black/20 dark:bg-white/5 rounded-lg">
          <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono overflow-hidden">
            {JSON.stringify(currentExecution.parameters, null, 2).substring(0, 200)}
            {JSON.stringify(currentExecution.parameters, null, 2).length > 200 ? '...' : ''}
          </pre>
        </div>
      )}
    </div>
  );
};

export default LiveToolExecution; 
