import { useState, useCallback, useEffect } from 'react';
import { LiteProjectFile } from '../LumaUILite';
import { Message } from './LumaUILiteChatWindow';
import ChatPersistence, { LumaUILiteCheckpoint } from './LumaUILiteChatPersistence';

export const useLumaUILiteCheckpoints = (
  projectId: string,
  initialMessages: Message[],
  initialProjectFiles: LiteProjectFile[]
) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [checkpoints, setCheckpoints] = useState<LumaUILiteCheckpoint[]>([]);

  useEffect(() => {
    if (projectId) {
      const loadData = async () => {
        try {
          const savedData = await ChatPersistence.loadChatData(projectId);
          if (savedData && savedData.messages.length > 0) {
            setMessages(savedData.messages);
            setCheckpoints(savedData.checkpoints);
          } else {
            setMessages(initialMessages);
            setCheckpoints([]);
          }
        } catch (error) {
          console.error('Error loading chat data:', error);
          setMessages(initialMessages);
          setCheckpoints([]);
        }
      };
      loadData();
    }
  }, [projectId]); // Remove initialMessages from dependency array to prevent infinite loop

  useEffect(() => {
    if (projectId) {
      const saveData = async () => {
        try {
          await ChatPersistence.saveChatData(projectId, messages, checkpoints);
        } catch (error) {
          console.error('Error saving chat data:', error);
        }
      };
      saveData();
    }
  }, [projectId, messages, checkpoints]);



  const createCheckpoint = useCallback((userQuery: string, currentMessages: Message[], currentProjectFiles: LiteProjectFile[]) => {
    const newCheckpoint: LumaUILiteCheckpoint = {
      id: `cp-lite-${Date.now()}`,
      timestamp: new Date(),
      messages: JSON.parse(JSON.stringify(currentMessages)),
      projectFiles: JSON.parse(JSON.stringify(currentProjectFiles)),
      metadata: {
        messageCount: currentMessages.length,
        userQuery: userQuery,
      },
    };
    setCheckpoints(prev => [...prev, newCheckpoint]);
    return newCheckpoint.id;
  }, []);

  const revertToCheckpoint = useCallback((checkpointId: string) => {
    const checkpoint = checkpoints.find(c => c.id === checkpointId);
    if (checkpoint) {
      setMessages(checkpoint.messages);
      setCheckpoints(prev => prev.filter(c => new Date(c.timestamp) <= new Date(checkpoint.timestamp)));
      return checkpoint;
    }
    return null;
  }, [checkpoints]);
  
  const getCheckpointForMessage = (messageId: string): LumaUILiteCheckpoint | undefined => {
    return checkpoints.find(c => c.messages.some(m => m.id === messageId));
  };
  
  const isLatestCheckpoint = (checkpointId: string): boolean => {
    if (checkpoints.length === 0) return false;
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    return latestCheckpoint.id === checkpointId;
  };

  const clearHistory = useCallback(async () => {
    setMessages(initialMessages);
    setCheckpoints([]);
    try {
      await ChatPersistence.deleteChatData(projectId);
    } catch (error) {
      console.error('Error deleting chat data:', error);
    }
  }, [projectId, initialMessages]);

  return {
    messages,
    setMessages,
    checkpoints,
    createCheckpoint,
    revertToCheckpoint,
    clearHistory,
    getCheckpointForMessage,
    isLatestCheckpoint,
  };
}; 
