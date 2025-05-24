import React, { useEffect, useState } from 'react';
import {
  User,
  Bot,
  ChevronDown,
  ChevronUp,
  Brain,
  Copy,
  Check,
  Image as ImageIcon,
  X,
  RefreshCcw,
  Edit2,
  ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../db';
import { db } from '../../db';

interface ChatMessageProps {
  message: ChatMessage;
  showTokens: boolean;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onSendEdit?: (messageId: string, content: string) => void;
  canEdit?: boolean;
  canRetry?: boolean;
  isStreaming?: boolean;
}

// Custom hook to get the window width
const useWindowWidth = () => {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
};

interface ThinkingBlockProps {
  content: string;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Regex to capture thinking content
  const thinkingMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : '';

  if (!thinkingContent) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <Brain className="w-4 h-4" />
        <span>Thinking Process</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isExpanded && (
        <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinkingContent}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

const ImageGallery: React.FC<{ images: string[] }> = ({ images }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((image, index) => (
          <div
            key={index}
            className="relative group cursor-pointer"
            onClick={() => setSelectedImage(image)}
          >
            <img
              src={image}
              alt={`Uploaded ${index + 1}`}
              className="w-32 h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700 hover:border-sakura-500 dark:hover:border-sakura-500 transition-colors"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        ))}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] mx-2">
            <img
              src={selectedImage}
              alt="Full size preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Safely access electron clipboard API with TypeScript-friendly approach
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    // Try to use Electron's clipboard API first
    if (typeof window !== 'undefined' && window.electron && window.electron.clipboard) {
      window.electron.clipboard.writeText(text);
      return true;
    }
    
    // Try browser clipboard API
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Error using modern clipboard APIs:', error);
    
    // Fallback to legacy method
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed'; // Avoid scrolling
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (fallbackError) {
      console.error('All clipboard methods failed:', fallbackError);
      return false;
    }
  }
};

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  showTokens,
  onRetry,
  onSendEdit,
  canEdit = false,
  canRetry = false,
  isStreaming = false
}) => {
  const [userName, setUserName] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const windowWidth = useWindowWidth();

  useEffect(() => {
    const loadUserName = async () => {
      const personalInfo = await db.getPersonalInfo();
      if (personalInfo?.name) {
        setUserName(personalInfo.name);
      }
    };
    loadUserName();
  }, []);

  const handleCopyCode = async (code: string) => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleCopyMessage = async () => {
    // For assistant messages, strip out <think> blocks from the copied text
    const contentToCopy =
      message.role === 'assistant' && message.content.includes('<think>')
        ? message.content.split('</think>').pop()?.trim() || message.content
        : message.content;

    const success = await copyToClipboard(contentToCopy);
    if (success) {
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry(message.id);
    }
  };

  // Improved edit handler with better error handling
  const handleEdit = () => {
    if (isEditing) {
      // When in edit mode and button is clicked, send the edit
      if (onSendEdit) {
        console.log('Sending edit for message:', message.id);
        // Only proceed if content actually changed
        if (editContent !== message.content) {
          onSendEdit(message.id, editContent);
        }
        setIsEditing(false);
      }
    } else {
      // Enter edit mode
      setIsEditing(true);
      setEditContent(message.content);
    }
  };

  // Add cancel edit handler
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  // Add event listeners for textarea to detect changes and handle submit
  useEffect(() => {
    if (isEditing) {
      const handleEscapeKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancelEdit();
        }
      };
      
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [isEditing]);

  // Improved key handling
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (onSendEdit && editContent !== message.content) {
        console.log('Sending edit on Enter key press');
        onSendEdit(message.id, editContent);
        setIsEditing(false);
      } else {
        // Exit edit mode even if no changes
        setIsEditing(false);
      }
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const isAssistant = message.role === 'assistant';
  const hasThinkingBlock = isAssistant && message.content.includes('<think>');
  const messageContent = hasThinkingBlock
    ? message.content.split('</think>').pop()?.trim() || message.content
    : message.content;

  // Determine max width based on window size
  const computedMaxWidth = Math.min(window.innerWidth * 0.8, 900);

  return (
    <div className={`${isAssistant ? 'py-6' : 'flex flex-col items-end mb-4 group'}`}>
      <div
        className={`${
          isAssistant
            ? 'px-4'
            : 'rounded-2xl px-4 py-2.5 relative max-w-[85%] bg-sakura-500 text-white hover:bg-sakura-600 transition-colors mt-4'
        }`}
        style={{ maxWidth: isAssistant ? 'none' : computedMaxWidth }}
      >
        {/* Header (Icon + Name) - Only show for assistant */}
        {isAssistant && (
          <div className="flex items-center gap-1 mb-4 text-sm">
            <Bot className="w-4 h-4 text-black dark:text-white" />
            <span className="font-medium text-black dark:text-white">Clara</span>
          </div>
        )}

        {/* Message Content */}
        {isEditing ? (
          <div className="relative">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full p-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/30 text-base resize-none"
              rows={3}
              autoFocus
              placeholder="Edit your message..."
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1 rounded bg-white/10 text-white hover:bg-white/20 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                className="px-3 py-1 rounded bg-white/20 text-white hover:bg-white/30 transition-colors text-sm flex items-center gap-1"
              >
                <span>Send</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`prose-base dark:prose-invert max-w-none break-words ${isAssistant ? 'text-gray-800 dark:text-gray-200' : 'text-white'} text-[15px]`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ node, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeText = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <div className="relative my-2">
                        <pre 
                          className="p-3 rounded-md bg-[#1E1E1E] text-[#e5e7eb] overflow-x-auto whitespace-pre-wrap break-all"
                          style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}
                        >
                          <code className="language-plaintext font-mono">{codeText}</code>
                        </pre>
                        <button
                          onClick={() => handleCopyCode(codeText)}
                          className="absolute top-1 right-1 p-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy code"
                        >
                          {copiedCode === codeText ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  }
                  return (
                    <code
                      className={`font-mono ${isAssistant ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200' : 'bg-white/20 text-white'} px-1 py-0.5 rounded break-words whitespace-pre-wrap`}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                p: ({ node, children, ...props }) => (
                  <p className="my-1.5 leading-relaxed" {...props}>{children}</p>
                ),
                ul: ({ node, children, ...props }) => (
                  <ul className="list-disc pl-5 my-1.5 space-y-1" {...props}>{children}</ul>
                ),
                ol: ({ node, children, ...props }) => (
                  <ol className="list-decimal pl-5 my-1.5 space-y-1" {...props}>{children}</ol>
                ),
                li: ({ node, children, ...props }) => (
                  <li className="my-0.5 leading-relaxed" {...props}>{children}</li>
                ),
                blockquote: ({ node, children, ...props }) => (
                  <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 my-2 italic" {...props}>
                    {children}
                  </blockquote>
                ),
                h1: ({ node, children, ...props }) => (
                  <h1 className="text-xl font-bold my-2" {...props}>{children}</h1>
                ),
                h2: ({ node, children, ...props }) => (
                  <h2 className="text-lg font-bold my-2" {...props}>{children}</h2>
                ),
                h3: ({ node, children, ...props }) => (
                  <h3 className="text-base font-semibold my-1.5" {...props}>{children}</h3>
                ),
                a: ({ node, children, href, ...props }) => (
                  <a
                    href={href}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {messageContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Images */}
        {message.images && message.images.length > 0 && <ImageGallery images={message.images} />}

        {/* Footer (timestamp, tokens) - Only show for assistant */}
        {isAssistant && (
          <div className="flex items-center justify-between mt-4 text-xs">
            <div>
              {showTokens && <span className="opacity-70">{message.tokens} tokens</span>}
            </div>
            <div className="ml-auto">
              {!isStreaming && (
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <button
                    onClick={handleCopyMessage}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Copy message"
                  >
                    {copiedMessage ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {canRetry && (
                    <button
                      onClick={handleRetry}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Retry response"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover actions for user messages - outside the bubble */}
      {!isAssistant && (
        <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopyMessage}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-400"
            title="Copy message"
          >
            {copiedMessage ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {canEdit && (
            <button
              onClick={handleEdit}
              className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-400"
              title="Edit message"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
