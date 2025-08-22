/**
 * Custom hook for managing autonomous agent status and tool executions
 * 
 * This hook provides state management and utilities for tracking the autonomous
 * agent's progress, tool executions, and phase transitions.
 */

import { useState, useCallback, useRef } from 'react';
import { AutonomousAgentStatus, ToolExecution } from '../components/angela_Components/AutonomousAgentStatusPanel';

interface UseAutonomousAgentStatusReturn {
  status: AutonomousAgentStatus;
  toolExecutions: ToolExecution[];
  
  // Status management
  startAgent: (totalSteps?: number) => void;
  updatePhase: (phase: AutonomousAgentStatus['phase'], message?: string) => void;
  updateProgress: (currentStep: number, message?: string) => void;
  setToolsLoaded: (count: number) => void;
  setExecutionPlan: (plan: string[]) => void;
  completeAgent: (message?: string, autoHideDelay?: number) => void;
  errorAgent: (message: string) => void;
  stopAgent: () => void;
  
  // Tool execution management
  startToolExecution: (toolName: string, description: string) => string;
  updateToolExecution: (id: string, updates: Partial<ToolExecution>) => void;
  completeToolExecution: (id: string, result?: string) => void;
  errorToolExecution: (id: string, error: string) => void;
  clearToolExecutions: () => void;
  
  // Utilities
  isActive: boolean;
  reset: () => void;
}

const useAutonomousAgentStatus = (): UseAutonomousAgentStatusReturn => {
  const [status, setStatus] = useState<AutonomousAgentStatus>({
    phase: 'initializing',
    currentStep: 0,
    totalSteps: 0,
    toolsLoaded: 0,
    progress: 0,
    message: 'Ready to start',
    isActive: false,
    executionPlan: []
  });

  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const toolIdCounter = useRef(0);

  // Status management functions
  const startAgent = useCallback((totalSteps: number = 5) => {
    setStatus(prev => ({
      ...prev,
      phase: 'initializing',
      currentStep: 0,
      totalSteps,
      progress: 0,
      message: 'Initializing autonomous agent...',
      isActive: true
    }));
    setToolExecutions([]);
  }, []);

  const updatePhase = useCallback((phase: AutonomousAgentStatus['phase'], message?: string) => {
    setStatus(prev => ({
      ...prev,
      phase,
      message: message || getDefaultPhaseMessage(phase)
    }));
  }, []);

  const updateProgress = useCallback((currentStep: number, message?: string) => {
    setStatus(prev => {
      const progress = prev.totalSteps > 0 ? Math.round((currentStep / prev.totalSteps) * 100) : 0;
      return {
        ...prev,
        currentStep,
        progress: Math.min(progress, 100),
        message: message || prev.message
      };
    });
  }, []);

  const setToolsLoaded = useCallback((count: number) => {
    setStatus(prev => ({
      ...prev,
      toolsLoaded: count,
      message: count > 0 ? `${count} tools loaded and ready` : 'No tools available'
    }));
  }, []);

  const setExecutionPlan = useCallback((plan: string[]) => {
    setStatus(prev => ({
      ...prev,
      executionPlan: plan,
      totalSteps: plan.length,
      message: `Execution plan created with ${plan.length} steps`
    }));
  }, []);

  const completeAgent = useCallback((message?: string, autoHideDelay: number = 3000) => {
    setStatus(prev => ({
      ...prev,
      phase: 'completed',
      progress: 100,
      message: message || 'Task completed successfully'
    }));

    // Auto-hide the status panel after completion animation
    if (autoHideDelay === 0) {
      // Hide immediately if delay is 0
      setStatus(prev => ({
        ...prev,
        isActive: false
      }));
    } else {
      setTimeout(() => {
        setStatus(prev => ({
          ...prev,
          isActive: false
        }));
      }, autoHideDelay);
    }
  }, []);

  const errorAgent = useCallback((message: string) => {
    setStatus(prev => ({
      ...prev,
      phase: 'error',
      message,
      isActive: false
    }));
  }, []);

  const stopAgent = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      isActive: false,
      message: 'Agent stopped by user'
    }));
  }, []);

  // Tool execution management functions
  const startToolExecution = useCallback((toolName: string, description: string): string => {
    const id = `tool-${++toolIdCounter.current}`;
    const newExecution: ToolExecution = {
      id,
      name: toolName,
      status: 'executing',
      description,
      startTime: new Date()
    };

    setToolExecutions(prev => [...prev, newExecution]);
    
    // Update status to show current tool
    setStatus(prev => ({
      ...prev,
      currentTool: toolName,
      message: `Executing ${toolName.replace(/_/g, ' ')}...`
    }));

    return id;
  }, []);

  const updateToolExecution = useCallback((id: string, updates: Partial<ToolExecution>) => {
    setToolExecutions(prev => prev.map(tool => 
      tool.id === id ? { ...tool, ...updates } : tool
    ));
  }, []);

  const completeToolExecution = useCallback((id: string, result?: string) => {
    setToolExecutions(prev => prev.map(tool => 
      tool.id === id 
        ? { 
            ...tool, 
            status: 'completed' as const, 
            endTime: new Date(),
            result 
          } 
        : tool
    ));
  }, []);

  const errorToolExecution = useCallback((id: string, error: string) => {
    setToolExecutions(prev => prev.map(tool => 
      tool.id === id 
        ? { 
            ...tool, 
            status: 'error' as const, 
            endTime: new Date(),
            result: error 
          } 
        : tool
    ));
  }, []);

  const clearToolExecutions = useCallback(() => {
    setToolExecutions([]);
  }, []);

  // Utilities
  const reset = useCallback(() => {
    setStatus({
      phase: 'initializing',
      currentStep: 0,
      totalSteps: 0,
      toolsLoaded: 0,
      progress: 0,
      message: 'Ready to start',
      isActive: false,
      executionPlan: []
    });
    setToolExecutions([]);
    toolIdCounter.current = 0;
  }, []);

  return {
    status,
    toolExecutions,
    
    // Status management
    startAgent,
    updatePhase,
    updateProgress,
    setToolsLoaded,
    setExecutionPlan,
    completeAgent,
    errorAgent,
    stopAgent,
    
    // Tool execution management
    startToolExecution,
    updateToolExecution,
    completeToolExecution,
    errorToolExecution,
    clearToolExecutions,
    
    // Utilities
    isActive: status.isActive,
    reset
  };
};

// Helper function to get default messages for phases
const getDefaultPhaseMessage = (phase: AutonomousAgentStatus['phase']): string => {
  switch (phase) {
    case 'initializing':
      return 'Initializing autonomous agent...';
    case 'planning':
      return 'Analyzing requirements and creating execution plan...';
    case 'executing':
      return 'Executing tools and operations...';
    case 'reflecting':
      return 'Analyzing results and determining next steps...';
    case 'completed':
      return 'Task completed successfully';
    case 'error':
      return 'An error occurred during execution';
    default:
      return 'Processing...';
  }
};

export default useAutonomousAgentStatus; 
