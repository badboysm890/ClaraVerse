import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import ChatPersistence from './ChatPersistence';

export interface ChatCheckpoint {
  id: string;
  timestamp: Date;
  userMessage: string;
  messages: any[];
  fileStates?: Record<string, string>; // File path -> content
  projectState?: any;
  metadata: {
    messageCount: number;
    lastToolUsed?: string;
    userQuery: string;
  };
}

interface CheckpointContextType {
  checkpoints: ChatCheckpoint[];
  createCheckpoint: (userMessage: string, messages: any[], fileStates?: Record<string, string>) => string;
  revertToCheckpoint: (checkpointId: string) => ChatCheckpoint | null;
  getCheckpoint: (checkpointId: string) => ChatCheckpoint | null;
  clearCheckpoints: () => void;
  getCheckpointByMessageId: (messageId: string) => ChatCheckpoint | null;
  loadProjectData: (projectId: string, projectName?: string) => void;
  setCurrentProject: (projectId: string, projectName?: string) => void;
}

const CheckpointContext = createContext<CheckpointContextType | null>(null);

export const useCheckpoints = () => {
  const context = useContext(CheckpointContext);
  if (!context) {
    throw new Error('useCheckpoints must be used within a CheckpointProvider');
  }
  return context;
};

interface CheckpointProviderProps {
  children: React.ReactNode;
}

export const CheckpointProvider: React.FC<CheckpointProviderProps> = ({ children }) => {
  const [checkpoints, setCheckpoints] = useState<ChatCheckpoint[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);

  const createCheckpoint = useCallback((
    userMessage: string, 
    messages: any[], 
    fileStates?: Record<string, string>
  ): string => {
    const checkpoint: ChatCheckpoint = {
      id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userMessage,
      messages: JSON.parse(JSON.stringify(messages)), // Deep clone
      fileStates: fileStates ? JSON.parse(JSON.stringify(fileStates)) : undefined,
      metadata: {
        messageCount: messages.length,
        lastToolUsed: messages
          .filter(m => m.tool_calls && m.tool_calls.length > 0)
          .pop()?.tool_calls?.[0]?.function?.name,
        userQuery: userMessage
      }
    };

    setCheckpoints(prev => {
      // Keep only last 20 checkpoints to prevent memory issues
      const newCheckpoints = [...prev, checkpoint];
      return newCheckpoints.slice(-20);
    });

    console.log('🔄 Created checkpoint:', checkpoint.id, 'for message:', userMessage.substring(0, 50));
    return checkpoint.id;
  }, []);

  const revertToCheckpoint = useCallback((checkpointId: string): ChatCheckpoint | null => {
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      console.error('Checkpoint not found:', checkpointId);
      return null;
    }

    // Remove all checkpoints after this one
    setCheckpoints(prev => prev.filter(cp => cp.timestamp <= checkpoint.timestamp));

    console.log('⏪ Reverted to checkpoint:', checkpointId, 'with', checkpoint.messages.length, 'messages');
    return checkpoint;
  }, [checkpoints]);

  const getCheckpoint = useCallback((checkpointId: string): ChatCheckpoint | null => {
    return checkpoints.find(cp => cp.id === checkpointId) || null;
  }, [checkpoints]);

  const getCheckpointByMessageId = useCallback((messageId: string): ChatCheckpoint | null => {
    // Find checkpoint that contains this message
    return checkpoints.find(cp => 
      cp.messages.some(msg => msg.id === messageId)
    ) || null;
  }, [checkpoints]);

  const clearCheckpoints = useCallback(() => {
    setCheckpoints([]);
    console.log('🗑️ Cleared all checkpoints');
  }, []);

  const loadProjectData = useCallback((projectId: string, projectName?: string) => {
    const savedData = ChatPersistence.loadChatData(projectId);
    if (savedData) {
      setCheckpoints(savedData.checkpoints);
      setMessages(savedData.messages);
      console.log('📖 Loaded project data for:', projectId);
    } else {
      setCheckpoints([]);
      setMessages([]);
      console.log('🆕 No saved data found for project:', projectId);
    }
    setCurrentProjectId(projectId);
    setCurrentProjectName(projectName || '');
  }, []);

  const setCurrentProject = useCallback((projectId: string, projectName?: string) => {
    // Save current project data before switching
    if (currentProjectId && (messages.length > 0 || checkpoints.length > 0)) {
      ChatPersistence.saveChatData(currentProjectId, messages, checkpoints, currentProjectName);
    }
    
    // Load new project data
    loadProjectData(projectId, projectName);
  }, [currentProjectId, currentProjectName, messages, checkpoints, loadProjectData]);

  // Auto-save when checkpoints or messages change
  useEffect(() => {
    if (currentProjectId && (messages.length > 0 || checkpoints.length > 0)) {
      ChatPersistence.autoSave(currentProjectId, messages, checkpoints, currentProjectName);
    }
  }, [currentProjectId, messages, checkpoints, currentProjectName]);

  const value: CheckpointContextType = {
    checkpoints,
    createCheckpoint,
    revertToCheckpoint,
    getCheckpoint,
    clearCheckpoints,
    getCheckpointByMessageId,
    loadProjectData,
    setCurrentProject
  };

  return (
    <CheckpointContext.Provider value={value}>
      {children}
    </CheckpointContext.Provider>
  );
};

export default CheckpointProvider; 
