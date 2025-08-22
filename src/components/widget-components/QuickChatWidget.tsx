import React, { useState, useEffect } from 'react';
import { XCircle, Send, Bot, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface QuickChatWidgetProps {
  id: string;
  onRemove: (id: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface WidgetConfig {
  ollamaUrl: string;
  model: string;
  systemPrompt: string;
  prePrompt: string;
}

const QuickChatWidget: React.FC<QuickChatWidgetProps> = ({ id, onRemove }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<WidgetConfig>({ 
    ollamaUrl: '', 
    model: 'llama2',
    systemPrompt: '',
    prePrompt: ''
  });
  const [isConfigured, setIsConfigured] = useState(false);

  // Configuration stored in localStorage
  const storageKey = `quick_chat_widget_${id}`;

  // Load configuration from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem(storageKey);
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.ollamaUrl && config.model) {
          setConfig({
            ...config,
            systemPrompt: config.systemPrompt || '',
            prePrompt: config.prePrompt || ''
          });
          setIsConfigured(true);
        }
      } catch (err) {
        console.error('Error loading quick chat widget config:', err);
      }
    }
  }, [storageKey]);

  // Save configuration to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(config));
  }, [config, storageKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Prepare messages array with system prompt and pre-prompt if they exist
      const apiMessages: ChatMessage[] = [];
      
      // Add system prompt if available
      if (config.systemPrompt.trim()) {
        apiMessages.push({ role: 'system', content: config.systemPrompt.trim() });
      }
      
      // Add conversation history
      apiMessages.push(...messages);
      
      // Add pre-prompt if available
      if (config.prePrompt.trim()) {
        apiMessages.push({ role: 'user', content: config.prePrompt.trim() + "\n\n" + userMessage.content });
      } else {
        apiMessages.push(userMessage);
      }

      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: apiMessages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantMessage = {
        role: 'assistant' as const,
        content: ''
      };
      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (!data.done) {
              assistantMessage.content += data.message?.content || '';
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = { ...assistantMessage };
                return newMessages;
              });
            }
          } catch (e) {
            console.error('Error parsing JSON:', e);
          }
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to get response from Ollama');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = () => {
    if (config.ollamaUrl.trim()) {
      setIsConfigured(true);
    }
  };

  return (
    <div className="glassmorphic rounded-2xl p-4 sm:p-6 animate-fadeIn relative group h-full flex flex-col">
      <button
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors opacity-0 group-hover:opacity-100"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="p-1.5 sm:p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
          <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
        </div>
        <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Quick Chat</h3>
      </div>

      {!isConfigured ? (
        <div className="space-y-3 sm:space-y-4 flex-grow">
          <input
            type="text"
            placeholder="Enter Ollama base URL (e.g., http://localhost:11434)"
            value={config.ollamaUrl}
            onChange={(e) => setConfig(prev => ({ ...prev, ollamaUrl: e.target.value }))}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Model (e.g., llama2, mistral, etc.)"
            value={config.model}
            onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            placeholder="System prompt (optional)"
            value={config.systemPrompt}
            onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
          />
          <textarea
            placeholder="Pre-prompt (will be added before each user message, optional)"
            value={config.prePrompt}
            onChange={(e) => setConfig(prev => ({ ...prev, prePrompt: e.target.value }))}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
          />
          <button
            onClick={handleSaveConfig}
            className="w-full px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            Save and Start Chat
          </button>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0">
          <div className="flex-grow overflow-y-auto space-y-2 sm:space-y-3 mb-3 sm:mb-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`p-2 sm:p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 ml-auto' 
                    : 'bg-gray-100 dark:bg-gray-800/50'
                } max-w-[80%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center justify-center py-2">
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 animate-spin" />
              </div>
            )}
            {error && (
              <div className="text-red-500 text-xs sm:text-sm text-center py-2">{error}</div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 mt-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              type="submit"
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !input.trim()}
            >
              <Send className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuickChatWidget;
