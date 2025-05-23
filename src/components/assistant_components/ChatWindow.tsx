import React from 'react';
import { Bot, ArrowDown, Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '../../db';

interface ChatWindowProps {
  messages: ChatMessageType[];
  showScrollButton: boolean;
  scrollToBottom: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  onNewChat: () => void;
  isStreaming: boolean;
  showTokens: boolean;
  onRetryMessage: (messageId: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onSendEdit: (messageId: string, content: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  showScrollButton,
  scrollToBottom,
  messagesEndRef,
  chatContainerRef,
  onNewChat,
  isStreaming,
  showTokens,
  onRetryMessage,
  onEditMessage,
  onSendEdit
}) => {
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-sakura-100 dark:bg-sakura-100/10 flex items-center justify-center mb-4">
        <Bot className="w-8 h-8 text-sakura-500" />
      </div>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Start a New Conversation
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        Begin your journey with Clara. Ask questions, get help with tasks, or just have a friendly chat.
      </p>
      <button
        onClick={onNewChat}
        className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors flex items-center gap-2"
      >
        <Bot className="w-5 h-5" />
        Start New Chat
      </button>
    </div>
  );

  return (
    <div 
      ref={chatContainerRef}
      className="flex-1 overflow-y-auto relative scroll-smooth"
    >
      {messages.length === 0 ? renderEmptyState() : (
        <div className="max-w-3xl mx-auto">
          {messages.map((message, index) => (
            <ChatMessage 
              key={message.id} 
              message={message} 
              showTokens={showTokens}
              onRetry={onRetryMessage}
              onEdit={onEditMessage}
              onSendEdit={onSendEdit}
              canEdit={index === messages.length - 2 && message.role === 'user'} 
              canRetry={index === messages.length - 1 && message.role === 'assistant'} 
              isStreaming={isStreaming && index === messages.length - 1}
            />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-sakura-500 mt-2 px-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Clara is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {showScrollButton && (
        <button
          onClick={() => scrollToBottom()}
          className="fixed bottom-24 right-8 p-2 bg-sakura-500 text-white rounded-full shadow-lg hover:bg-sakura-600 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default ChatWindow;
