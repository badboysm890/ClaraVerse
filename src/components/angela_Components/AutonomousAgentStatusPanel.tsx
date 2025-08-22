/**
 * Autonomous Agent Status Panel Component
 * 
 * A professional animated UI component that displays the status of autonomous agent
 * tool calling operations using GSAP animations and proper icons instead of emojis.
 * 
 * Features:
 * - Smooth GSAP animations for state transitions
 * - Professional icon-based status indicators
 * - Real-time progress tracking
 * - Tool execution visualization
 * - Planning and execution phases
 */

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { 
  Brain, 
  Cog, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Pause,
  Settings,
  FileText,
  Terminal,
  Search,
  Globe,
  Code,
  Database,
  Zap,
  Target,
  TrendingUp,
  Clock,
  Activity,
  Square,
  Loader,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

// Types for the status panel
export interface AutonomousAgentStatus {
  isActive: boolean;
  phase: 'initializing' | 'planning' | 'executing' | 'reflecting' | 'completed' | 'error' | 'paused';
  message: string;
  progress: number;
  currentStep: number;
  totalSteps: number;
  toolsLoaded: number;
  executionPlan: string[];
  currentTool?: string;
}

export interface ToolExecution {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  description: string;
  startTime?: Date;
  endTime?: Date;
  result?: string;
}

interface AutonomousAgentStatusPanelProps {
  status: AutonomousAgentStatus;
  toolExecutions: ToolExecution[];
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onComplete?: () => void;
  className?: string;
}

// Tool icon mapping
const TOOL_ICONS: Record<string, React.ComponentType<any>> = {
  'file': FileText,
  'terminal': Terminal,
  'search': Search,
  'web': Globe,
  'code': Code,
  'database': Database,
  'default': Cog
};

// Phase configurations
const PHASE_CONFIG = {
  initializing: {
    icon: Loader,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    title: 'Initializing'
  },
  planning: {
    icon: Brain,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    title: 'Planning'
  },
  executing: {
    icon: Zap,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    title: 'Executing'
  },
  reflecting: {
    icon: TrendingUp,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    title: 'Reflecting'
  },
  paused: {
    icon: Pause,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    title: 'Paused'
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    title: 'Completed'
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    title: 'Error'
  }
};

const AutonomousAgentStatusPanel: React.FC<AutonomousAgentStatusPanelProps> = ({
  status,
  toolExecutions = [],
  onPause,
  onResume,
  onStop,
  onComplete,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const phaseIconRef = useRef<HTMLDivElement>(null);
  const toolListRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [animationTimeline, setAnimationTimeline] = useState<gsap.core.Timeline | null>(null);

  // Track how long the agent has been running
  const [startTime] = useState(Date.now());
  const [showManualComplete, setShowManualComplete] = useState(false);

  const phaseConfig = PHASE_CONFIG[status.phase];
  const PhaseIcon = phaseConfig.icon;

  // Initialize GSAP timeline
  useEffect(() => {
    const tl = gsap.timeline({ paused: true });
    setAnimationTimeline(tl);
    
    return () => {
      tl.kill();
    };
  }, []);

  // Animate phase transitions
  useEffect(() => {
    if (!animationTimeline || !phaseIconRef.current || !containerRef.current) return;

    animationTimeline.clear();

    // Container entrance animation
    animationTimeline
      .fromTo(containerRef.current, 
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
      )
      // Phase icon animation
      .fromTo(phaseIconRef.current,
        { scale: 0, rotation: -180 },
        { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(1.7)" },
        "-=0.3"
      );

    // Phase-specific animations
    if (status.phase === 'executing') {
      // Pulsing animation for execution
      animationTimeline.to(phaseIconRef.current, {
        scale: 1.1,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: "power2.inOut"
      });
    } else if (status.phase === 'planning') {
      // Gentle rotation for planning
      animationTimeline.to(phaseIconRef.current, {
        rotation: 360,
        duration: 3,
        repeat: -1,
        ease: "none"
      });
    } else if (status.phase === 'completed') {
      // Success bounce followed by fade out preparation
      animationTimeline
        .to(phaseIconRef.current, {
          scale: 1.2,
          duration: 0.3,
          ease: "back.out(1.7)",
          yoyo: true,
          repeat: 1
        })
        .to(containerRef.current, {
          borderColor: "rgb(34, 197, 94)",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          duration: 0.5,
          ease: "power2.out"
        }, "-=0.3");
    }

    animationTimeline.play();
  }, [status.phase, animationTimeline]);

  // Handle fade-out animation when status becomes inactive
  useEffect(() => {
    if (!status.isActive && containerRef.current && animationTimeline) {
      // Fade out the entire panel
      gsap.to(containerRef.current, {
        opacity: 0,
        y: -20,
        scale: 0.95,
        duration: 0.6,
        ease: "power2.inOut"
      });
    }
  }, [status.isActive, animationTimeline]);

  // Animate progress bar
  useEffect(() => {
    if (!progressBarRef.current) return;

    gsap.to(progressBarRef.current, {
      width: `${status.progress}%`,
      duration: 0.8,
      ease: "power2.out"
    });
  }, [status.progress]);

  // Animate tool list updates
  useEffect(() => {
    if (!toolListRef.current) return;

    const toolElements = toolListRef.current.children;
    gsap.fromTo(toolElements, 
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.4, stagger: 0.1, ease: "power2.out" }
    );
  }, [toolExecutions]);

  // Check if agent has been running for more than 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (status.isActive && status.phase !== 'completed' && status.phase !== 'error') {
        setShowManualComplete(true);
      }
    }, 10000); // Show manual complete button after 10 seconds

    return () => clearTimeout(timer);
  }, [status.isActive, status.phase]);

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
    
    if (toolListRef.current) {
      gsap.to(toolListRef.current, {
        height: isExpanded ? 0 : 'auto',
        opacity: isExpanded ? 0 : 1,
        duration: 0.4,
        ease: "power2.inOut"
      });
    }
  };

  if (!status.isActive) return null;

  return (
    <div 
      ref={containerRef}
      className={`
        relative overflow-hidden rounded-xl border-2 transition-all duration-300 ease-out
        bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm
        border-gray-200 dark:border-gray-700
        shadow-lg hover:shadow-xl dark:shadow-gray-900/20
        ${phaseConfig.borderColor}
        ${className}
      `}
      style={{
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 p-4">
        {/* Phase Info */}
        <div className="flex items-center space-x-3">
          {/* Phase Icon */}
          <div 
            ref={phaseIconRef}
            className={`
              w-10 h-10 rounded-lg flex items-center justify-center
              ${phaseConfig.bgColor} ${phaseConfig.borderColor} border
              shadow-sm
            `}
          >
            <PhaseIcon className={`w-5 h-5 ${phaseConfig.color}`} />
          </div>
          
          {/* Phase Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {phaseConfig.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {status.message}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
          {status.totalSteps > 0 && (
            <div className="flex items-center space-x-1">
              <TrendingUp className="w-4 h-4" />
              <span>{status.currentStep}/{status.totalSteps} steps</span>
            </div>
          )}
          
          {status.toolsLoaded > 0 && (
            <div className="flex items-center space-x-1">
              <Settings className="w-4 h-4" />
              <span>{status.toolsLoaded} tools loaded</span>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center space-x-2">
          {status.phase === 'executing' && onPause && (
            <button
              onClick={onPause}
              className="p-2 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors duration-200"
              title="Pause execution"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          
          {status.phase === 'paused' && onResume && (
            <button
              onClick={onResume}
              className="p-2 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors duration-200"
              title="Resume execution"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {/* Manual Complete Button - shows after 10 seconds */}
          {showManualComplete && onComplete && (
            <button
              onClick={onComplete}
              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200"
              title="Mark as completed"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          
          {onStop && (
            <button
              onClick={onStop}
              className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
              title="Stop execution"
            >
              <Square className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleToggleExpanded}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors duration-200"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {status.totalSteps > 0 && (
        <div className="mb-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Progress
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {status.currentStep}/{status.totalSteps} steps
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              ref={progressBarRef}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${phaseConfig.color.replace('text-', 'bg-')}`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expandable Content */}
      {isExpanded && (
        <div className="space-y-4 px-4 pb-4">
          {/* Execution Plan */}
          {status.executionPlan && status.executionPlan.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center">
                <Brain className="w-4 h-4 mr-2 text-purple-600 dark:text-purple-400" />
                Execution Plan
              </h4>
              <div className="space-y-2">
                {status.executionPlan.map((step, index) => (
                  <div 
                    key={index}
                    className={`
                      flex items-start space-x-3 p-3 rounded-lg border
                      ${index < status.currentStep 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                        : index === status.currentStep 
                          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' 
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                      }
                    `}
                  >
                    <div className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                      ${index < status.currentStep 
                        ? 'bg-green-600 dark:bg-green-500 text-white' 
                        : index === status.currentStep 
                          ? 'bg-orange-600 dark:bg-orange-500 text-white' 
                          : 'bg-gray-400 dark:bg-gray-600 text-white'
                      }
                    `}>
                      {index < status.currentStep ? '✓' : index + 1}
                    </div>
                    <span className={`
                      text-sm flex-1
                      ${index < status.currentStep 
                        ? 'text-green-800 dark:text-green-200' 
                        : index === status.currentStep 
                          ? 'text-orange-800 dark:text-orange-200' 
                          : 'text-gray-600 dark:text-gray-400'
                      }
                    `}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tools Summary */}
          {status.toolsLoaded > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                <Activity className="w-4 h-4" />
                <span>{status.toolsLoaded} tools loaded</span>
              </div>
            </div>
          )}

          {/* Tool Executions */}
          {toolExecutions && toolExecutions.length > 0 && (
            <div 
              ref={toolListRef}
              className="space-y-2"
            >
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center">
                <Settings className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                Tool Executions
              </h4>
              {toolExecutions.map((tool) => (
                <div 
                  key={tool.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border transition-all duration-200
                    ${tool.status === 'completed' 
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                      : tool.status === 'error' 
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`
                      w-6 h-6 rounded-full flex items-center justify-center
                      ${tool.status === 'completed' 
                        ? 'bg-green-600 dark:bg-green-500' 
                        : tool.status === 'error' 
                          ? 'bg-red-600 dark:bg-red-500' 
                          : 'bg-blue-600 dark:bg-blue-500'
                      }
                    `}>
                      {tool.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : tool.status === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-white" />
                      ) : (
                        <Activity className="w-4 h-4 text-white animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className={`
                        text-sm font-medium
                        ${tool.status === 'completed' 
                          ? 'text-green-800 dark:text-green-200' 
                          : tool.status === 'error' 
                            ? 'text-red-800 dark:text-red-200' 
                            : 'text-blue-800 dark:text-blue-200'
                        }
                      `}>
                        {tool.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {tool.description}
                      </div>
                    </div>
                  </div>
                  
                  {tool.result && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {tool.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutonomousAgentStatusPanel; 
