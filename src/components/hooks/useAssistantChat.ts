import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, Tool } from '../../db';
import type { ChatRole } from '../../utils';
import { StructuredToolService } from '../assistantLibrary/structuredToolService';

// Add any other imports needed (e.g., getAppropriateModel, checkModelImageSupport, etc.)

interface UseAssistantChatProps {
  client: any;
  selectedModel: string;
  db: any;
  modelSelectionConfig: any;
  tools: Tool[];
  useAllTools: boolean;
  selectedTool: Tool | null;
  images: Array<{ preview: string; base64: string; id: string }>;
  setImages: React.Dispatch<React.SetStateAction<Array<{ preview: string; base64: string; id: string }>>>;
  ragEnabled: boolean;
  temporaryDocs: any[];
  pythonPort: number | null;
  setSelectedModel: (model: string) => void;
  setChats: (chats: any[]) => void;
  activeChat: string | null;
  setActiveChat: (id: string | null) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  executeToolImplementation: any;
  formatToolForOpenAI: any;
  getAppropriateModel: any;
  checkModelImageSupport: any;
  findImageSupportedModel: any;
  searchDocuments: any;
  useStructuredToolCalling?: boolean;
  isStreaming: boolean;
}

export function useAssistantChat({
  client,
  selectedModel,
  db,
  modelSelectionConfig,
  tools,
  useAllTools,
  selectedTool,
  images,
  setImages,
  ragEnabled,
  temporaryDocs,
  pythonPort,
  setSelectedModel,
  setChats,
  activeChat,
  setActiveChat,
  scrollToBottom,
  executeToolImplementation,
  formatToolForOpenAI,
  getAppropriateModel,
  checkModelImageSupport,
  findImageSupportedModel,
  searchDocuments,
  useStructuredToolCalling = false,
  isStreaming,
}: UseAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const getContextMessages = (messages: ChatMessage[], useTool: boolean = false): ChatMessage[] => {
    if (useTool) {
      return messages.slice(-1);
    }
    return messages.slice(-20); // MAX_CONTEXT_MESSAGES
  };

  const formatMessagesForModel = async (
    messages: ChatMessage[], 
    userQuery?: string
  ): Promise<{ role: string; content: string }[]> => {
    // Get system prompt first
    const systemPrompt = await db.getSystemPrompt();
    let combinedSystemPrompt = systemPrompt || '';
    
    // Add RAG context to system prompt if available
    if (userQuery && (temporaryDocs.length > 0 || ragEnabled) && pythonPort) {
      const results = await searchDocuments(userQuery, pythonPort, temporaryDocs, ragEnabled);
      if (results && results.results && results.results.length > 0) {
        const contextFromSearch = results.results.map((r: any) => r.content).join('\n\n');
        const ragContext = `Context from knowledge base:\n${contextFromSearch}\n\nUse this context to inform your responses when relevant, but do not explicitly mention that you're using this context unless asked.`;
        
        if (combinedSystemPrompt) {
          combinedSystemPrompt = `${ragContext}\n\n${combinedSystemPrompt}`;
        } else {
          combinedSystemPrompt = ragContext;
        }
      }
    }
    
    const formattedMessages = [];
    if (combinedSystemPrompt) {
      formattedMessages.push({
        role: 'system',
        content: combinedSystemPrompt
      });
    }
    formattedMessages.push(
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    );
    return formattedMessages;
  };

  const handleSend = async () => {
    if (!input.trim() || !client || !selectedModel || isProcessing) return;
    const context = {
      hasImages: images.length > 0,
      hasTool: !!selectedTool || useAllTools,
      hasRag: ragEnabled || temporaryDocs.length > 0
    };
    const modelToUse = getAppropriateModel(modelSelectionConfig, selectedModel, context);
    let actualModelToUse = modelToUse;
    if (modelSelectionConfig.mode === 'manual' && images.length > 0 && !checkModelImageSupport(modelToUse)) {
      const imageModel = findImageSupportedModel();
      if (imageModel) {
        actualModelToUse = imageModel;
        setSelectedModel(imageModel);
      }
    }
    const originalModel = selectedModel;
    let currentChatId = activeChat;
    if (!currentChatId) {
      const chatName = input.length > 50 ? input.slice(0, 50) + '...' : input;
      currentChatId = await db.createChat(chatName);
      setActiveChat(currentChatId);
    } else {
      const currentChats = await db.getRecentChats();
      const thisChat = currentChats.find((c: any) => c.id === currentChatId);
      if (thisChat && thisChat.title === 'New Chat') {
        const newTitle = input.length > 50 ? input.slice(0, 50) + '...' : input;
        await db.updateChat(currentChatId, { title: newTitle });
        const updatedChats = await db.getRecentChats();
        setChats(updatedChats);
      }
    }
    const userMessage: ChatMessage = {
      id: uuidv4(),
      chat_id: currentChatId || '',
      content: input,
      role: 'user' as ChatRole,
      timestamp: Date.now(),
      tokens: 0,
      images: images.map((img: any) => img.preview)
    };
    await db.addMessage(
      currentChatId,
      userMessage.content,
      userMessage.role,
      0,
      userMessage.images
    );
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setImages([]);
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      chat_id: currentChatId || '',
      content: '',
      role: 'assistant' as ChatRole,
      timestamp: Date.now(),
      tokens: 0
    };
    try {
      setIsProcessing(true);
      const startTime = performance.now();
      setMessages((prev) => [...prev, assistantMessage]);
      const chatOptions: any = {
        temperature: 0.7,
        top_p: 0.9
      };

      if (images.length > 0) {
        try {
          if (isStreaming) {
            const response = await client.generateWithImages(
              actualModelToUse,
              input,
              images.map((img: any) => img.base64),
              chatOptions
            );
            const content = response.response || '';
            const tokens = response.eval_count || 0;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content, tokens } : msg
              )
            );
            await db.addMessage(currentChatId, content, 'assistant', tokens);
          } else {
            const response = await client.generateWithImages(
              actualModelToUse,
              input,
              images.map((img: any) => img.base64),
              chatOptions
            );
            const content = response.response || '';
            const tokens = response.eval_count || 0;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content, tokens } : msg
              )
            );
            await db.addMessage(currentChatId, content, 'assistant', tokens);
          }
          if (modelSelectionConfig.mode === 'manual' && originalModel !== actualModelToUse) {
            setSelectedModel(originalModel);
          }
          await db.updateModelUsage(actualModelToUse, performance.now() - startTime);
          await db.updateUsage('response_time', performance.now() - startTime);
          return;
        } catch (error) {
          console.error('Image generation error:', error);
          throw error;
        }
      }

      const contextMessages = getContextMessages([...messages, userMessage], !!selectedTool);
      let userContentWithContext = userMessage.content;
      const formattedMessages: any[] = [];
      
      // Get system prompt first
      const systemPrompt = await db.getSystemPrompt();
      let combinedSystemPrompt = systemPrompt || '';
      
      // Add RAG context to system prompt if available
      if ((temporaryDocs.length > 0 || ragEnabled) && pythonPort) {
        const results = await searchDocuments(input, pythonPort, temporaryDocs, ragEnabled);
        if (results && results.results && results.results.length > 0) {
          const contextFromSearch = results.results.map((r: any) => r.content).join('\n\n');
          const ragContext = `Context from knowledge base:\n${contextFromSearch}\n\nUse this context to inform your responses when relevant, but do not explicitly mention that you're using this context unless asked.`;
          
          if (combinedSystemPrompt) {
            combinedSystemPrompt = `${ragContext}\n\n${combinedSystemPrompt}`;
          } else {
            combinedSystemPrompt = ragContext;
          }
        }
      }

      // Add the combined system prompt as a single system message
      if (combinedSystemPrompt) {
        formattedMessages.push({ role: 'system' as ChatRole, content: combinedSystemPrompt });
      }

      contextMessages.forEach((msg: ChatMessage, index: number) => {
        if (index === contextMessages.length - 1 && msg.role === 'user') {
          formattedMessages.push({
            role: 'user' as ChatRole,
            content: userContentWithContext
          });
        } else {
          formattedMessages.push({
            role: (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user') as ChatRole,
            content: msg.content
          });
        }
      });

      if (selectedTool || useAllTools) {
        const toolsToUse = useAllTools ? tools : selectedTool ? [selectedTool] : [];

        const response = await client.sendChat(
          actualModelToUse,
          formattedMessages,
          chatOptions,
          toolsToUse
        );

        if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
          const toolResults = [];
          for (const toolCall of response.message.tool_calls) {
            const toolArgs = typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments;
            const selectedTool = tools.find((t: any) => t.name === toolCall.function.name);
            if (!selectedTool) {
              console.error(`Tool ${toolCall.function.name} not found`);
              continue;
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content: `Clara is using tool - ${selectedTool.name}...` } : msg
              )
            );
            let toolResult: any = await executeToolImplementation(selectedTool, toolArgs);
            toolResults.push({
              role: 'tool' as ChatRole,
              content: JSON.stringify(toolResult),
              name: toolCall.function.name
            });
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: `Clara is working on summarizing the results...` } : msg
            )
          );

          const messagesWithToolResults = [
            ...formattedMessages,
            {
              role: 'assistant' as ChatRole,
              content: response.message.content || '',
              tool_calls: response.message.tool_calls
            },
            ...toolResults
          ];

          const finalResponse = await client.sendChat(
            actualModelToUse,
            messagesWithToolResults,
            { temperature: 0.7, top_p: 0.9 }
          );

          const content = finalResponse.message?.content || 'Error: No content received after tool execution';
          const tokens = finalResponse.usage?.total_tokens || 0;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content, tokens } : msg
            )
          );
          await db.addMessage(currentChatId, content, 'assistant', tokens);
        } else {
          const content = response.message?.content || 'No response content';
          const tokens = response.usage?.total_tokens || 0;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content, tokens } : msg
            )
          );
          await db.addMessage(currentChatId, content, 'assistant', tokens);
        }
      } else {
        let responseContent = '';
        let responseTokens = 0;
        
        if (isStreaming) {
          for await (const chunk of client.streamChat(actualModelToUse, formattedMessages, chatOptions)) {
            if (chunk.message?.content) {
              responseContent += chunk.message.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id ? { ...msg, content: responseContent } : msg
                )
              );
              scrollToBottom();
            }
          }
          responseTokens = 0;
        } else {
          const response = await client.sendChat(actualModelToUse, formattedMessages, chatOptions);
          responseContent = response.message?.content || '';
          responseTokens = response.usage?.total_tokens || 0;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
            )
          );
        }
        await db.addMessage(currentChatId, responseContent, 'assistant', responseTokens);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      await db.updateModelUsage(actualModelToUse, duration);
      await db.updateUsage('response_time', duration);
      scrollToBottom();
    } catch (error) {
      let errorContent;
      try {
        if (typeof error === 'object' && error !== null && 'message' in error) {
          try {
            const parsedError = JSON.parse((error as Error).message);
            errorContent = `Error Response:\n\`\`\`json\n${JSON.stringify(parsedError, null, 2)}\n\`\`\``;
          } catch {
            errorContent = `Error: ${(error as Error).message}`;
          }
        } else {
          errorContent = `Error: ${String(error)}`;
        }
      } catch {
        errorContent = `Error: ${String(error)}`;
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, content: errorContent } : msg
        )
      );
      await db.addMessage(currentChatId, errorContent, 'assistant', 0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex < 0 || !client || !selectedModel) return;
    const updatedMessage = {
      ...messages[messageIndex],
      content: newContent
    };
    setMessages((prev) => [...prev.slice(0, messageIndex), updatedMessage]);
    await db.updateMessage(messageId, {
      content: newContent
    });
    try {
      setIsProcessing(true);
      const startTime = performance.now();
      const contextMessages = getContextMessages([...messages.slice(0, messageIndex), updatedMessage]);
      const formattedMessages = await formatMessagesForModel(contextMessages, updatedMessage.content);
      const context = {
        hasImages: contextMessages.some((msg) => msg.images && msg.images.length > 0),
        hasTool: false,
        hasRag: ragEnabled || temporaryDocs.length > 0
      };
      const modelToUse = getAppropriateModel(modelSelectionConfig, selectedModel, context);
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        chat_id: activeChat!,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        tokens: 0
      };
      setMessages((prev) => [...prev.slice(0, messageIndex + 1), assistantMessage]);
      let responseContent = '';
      let responseTokens = 0;
      if (isStreaming) {
        for await (const chunk of client.streamChat(modelToUse, formattedMessages)) {
          if (chunk.message?.content) {
            responseContent += chunk.message.content;
            responseTokens = chunk.eval_count || responseTokens;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
              )
            );
            scrollToBottom();
          }
        }
      } else {
        const response = await client.sendChat(modelToUse, formattedMessages);
        responseContent = response.message?.content || '';
        responseTokens = response.usage?.total_tokens || 0;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
          )
        );
      }
      await db.addMessage(activeChat!, responseContent, 'assistant', responseTokens);
      const endTime = performance.now();
      const duration = endTime - startTime;
      await db.updateModelUsage(modelToUse, duration);
      await db.updateUsage('response_time', duration);
    } catch (error: any) {
      const errorContent = error.message || 'An unexpected error occurred';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.role === 'assistant' ? { ...msg, content: `Error: ${errorContent}` } : msg
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendEdit = async (messageId: string, newContent: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex < 0 || !client || !selectedModel || !activeChat) return;
    if (messages[messageIndex].content === newContent) {
      return;
    }
    try {
      setIsProcessing(true);
      const startTime = performance.now();
      const updatedMessage = {
        ...messages[messageIndex],
        content: newContent,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev.slice(0, messageIndex), updatedMessage]);
      try {
        await db.deleteMessage(messageId).catch((e: any) => {});
        await db.addMessage(
          activeChat,
          newContent,
          'user',
          updatedMessage.tokens || 0,
          updatedMessage.images
        );
      } catch (dbError) {}
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        chat_id: activeChat,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        tokens: 0
      };
      setMessages((prev) => [...prev, assistantMessage]);
      const contextMessages = getContextMessages([...messages.slice(0, messageIndex), updatedMessage]);
      const formattedMessages = await formatMessagesForModel(contextMessages, updatedMessage.content);
      const context = {
        hasImages: contextMessages.some((msg) => msg.images && msg.images.length > 0),
        hasTool: false,
        hasRag: ragEnabled || temporaryDocs.length > 0
      };
      const modelToUse = getAppropriateModel(modelSelectionConfig, selectedModel, context);
      let responseContent = '';
      let responseTokens = 0;
      if (isStreaming) {
        for await (const chunk of client.streamChat(modelToUse, formattedMessages)) {
          if (chunk.message?.content) {
            responseContent += chunk.message.content;
            responseTokens = chunk.eval_count || responseTokens;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
              )
            );
            scrollToBottom();
          }
        }
      } else {
        const response = await client.sendChat(modelToUse, formattedMessages);
        responseContent = response.message?.content || '';
        responseTokens = response.usage?.total_tokens || 0;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
          )
        );
      }
      await db.addMessage(activeChat, responseContent, 'assistant', responseTokens);
      const endTime = performance.now();
      const duration = endTime - startTime;
      await db.updateModelUsage(modelToUse, duration);
      await db.updateUsage('response_time', duration);
    } catch (error: any) {
      const errorContent = error.message || 'An unexpected error occurred';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.role === 'assistant' ? { ...msg, content: `Error: ${errorContent}` } : msg
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex < 0 || !client || !selectedModel || !activeChat) return;
    const messagesToKeep = messages.slice(0, messageIndex);
    setMessages(messagesToKeep);
    try {
      setIsProcessing(true);
      const startTime = performance.now();
      const contextMessages = getContextMessages(messagesToKeep);
      const lastUserMessage = contextMessages.slice().reverse().find(msg => msg.role === 'user');
      const formattedMessages = await formatMessagesForModel(contextMessages, lastUserMessage?.content);
      const context = {
        hasImages: contextMessages.some((msg) => msg.images && msg.images.length > 0),
        hasTool: false,
        hasRag: ragEnabled || temporaryDocs.length > 0
      };
      const modelToUse = getAppropriateModel(modelSelectionConfig, selectedModel, context);
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        chat_id: activeChat,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        tokens: 0
      };
      setMessages((prev) => [...prev, assistantMessage]);
      let responseContent = '';
      let responseTokens = 0;
      if (isStreaming) {
        for await (const chunk of client.streamChat(modelToUse, formattedMessages)) {
          if (chunk.message?.content) {
            responseContent += chunk.message.content;
            responseTokens = chunk.eval_count || responseTokens;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
              )
            );
            scrollToBottom();
          }
        }
      } else {
        const response = await client.sendChat(modelToUse, formattedMessages);
        responseContent = response.message?.content || '';
        responseTokens = response.usage?.total_tokens || 0;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, content: responseContent, tokens: responseTokens } : msg
          )
        );
      }
      await db.addMessage(activeChat, responseContent, 'assistant', responseTokens);
      const endTime = performance.now();
      const duration = endTime - startTime;
      await db.updateModelUsage(modelToUse, duration);
      await db.updateUsage('response_time', duration);
    } catch (error: any) {
      const errorContent = error.message || 'An unexpected error occurred';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.role === 'assistant' ? { ...msg, content: `Error: ${errorContent}` } : msg
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isProcessing,
    handleSend,
    handleEditMessage,
    handleSendEdit,
    handleRetryMessage,
    getContextMessages,
    formatMessagesForModel,
  };
} 