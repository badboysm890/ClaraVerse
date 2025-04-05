import React, { useState, useEffect } from 'react';
import { MessageSquare, Archive, Star, Trash2, Settings, ChevronRight, Plus, Sparkles } from 'lucide-react';
import type { Chat } from '../db';
import { db } from '../db';
import logo from '../assets/logo.png';
import WhatsNewModal from './assistant_components/WhatsNewModal';

interface AssistantSidebarProps {
  activeChat: string | null;
  onChatSelect: (id: string | null) => void;
  chats: Chat[];
  onOpenSettings: () => void;
  onNavigateHome: () => void;
}

const AssistantSidebar = ({ 
  activeChat, 
  onChatSelect, 
  chats, 
  onOpenSettings,
  onNavigateHome
}: AssistantSidebarProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [shouldGlow, setShouldGlow] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<{ chatId: string; type: 'star' | 'archive' | 'delete' } | null>(null);
  const [counts, setCounts] = useState({
    archived: 0,
    starred: 0,
    deleted: 0
  });
  const [localChats, setLocalChats] = useState<Chat[]>([]);

  useEffect(() => {
    setLocalChats(chats || []);
  }, [chats]);

  useEffect(() => {
    const allChats = localChats || [];
    setCounts({
      archived: allChats.filter(chat => chat.is_archived && !chat.is_deleted).length,
      starred: allChats.filter(chat => chat.is_starred && !chat.is_deleted && !chat.is_archived).length,
      deleted: allChats.filter(chat => chat.is_deleted).length
    });
  }, [localChats]);

  useEffect(() => {
    // Check if we should show the glow effect
    const lastDismissed = localStorage.getItem('whats_new_dismissed');
    // const releaseDate = new Date('2024-03-19').getTime();
    const now = new Date().getTime();

    if (lastDismissed) {
      const daysSinceDismissed = (now - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
      setShouldGlow(daysSinceDismissed >= 5); // Only show after 5 days have passed
    } else {
      setShouldGlow(true); // Show if never dismissed before
    }
  }, []);

  const handleWhatsNewClick = () => {
    setShowWhatsNew(true);
    localStorage.setItem('whats_new_dismissed', Date.now().toString());
    setShouldGlow(false);
  };

  const handleChatAction = async (chatId: string, action: 'archive' | 'star' | 'delete', e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionInProgress) return;
    
    setActionInProgress({ chatId, type: action });
    
    try {
      const chat = await db.getChat(chatId);
      if (!chat) return;

      const updates: Partial<Chat> = {};
      
      switch (action) {
        case 'archive':
          updates.is_archived = !chat.is_archived;
          if (updates.is_archived) {
            updates.is_starred = false;
          }
          break;
        case 'star':
          updates.is_starred = !chat.is_starred;
          if (chat.is_archived) {
            updates.is_archived = false;
          }
          break;
        case 'delete':
          updates.is_deleted = true;
          updates.is_starred = false;
          updates.is_archived = false;
          break;
      }

      await db.updateChat(chatId, updates);
      
      if (action === 'delete' && chatId === activeChat) {
        onChatSelect(null);
      }

      setLocalChats(prevChats => 
        prevChats.map(c => 
          c.id === chatId ? {...c, ...updates} : c
        )
      );
    } catch (error) {
      console.error('Error updating chat:', error);
    } finally {
      setTimeout(() => {
        setActionInProgress(null);
      }, 300);
    }
  };

  const handleNewChat = async () => {
    const chatId = await db.createChat('New Chat');
    onChatSelect(chatId);
    setLocalChats(await db.getRecentChats());
  };

  const filteredChats = localChats.filter(chat => {
    if (showArchived) return chat.is_archived && !chat.is_deleted;
    if (showStarred) return chat.is_starred && !chat.is_deleted && !chat.is_archived;
    if (showDeleted) return chat.is_deleted;
    return !chat.is_archived && !chat.is_deleted && !chat.is_starred;
  });

  const renderBadge = (count: number) => {
    if (count === 0) return null;
    return (
      <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-sakura-100 dark:bg-sakura-100/10 text-sakura-500">
        {count}
      </span>
    );
  };

  const renderActionButton = (chatId: string, action: 'star' | 'archive' | 'delete', chat: Chat) => {
    const isInProgress = actionInProgress?.chatId === chatId && actionInProgress?.type === action;
    
    const getIcon = () => {
      if (isInProgress) return <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />;
      switch (action) {
        case 'star':
          return <Star className={`w-3 h-3 ${chat.is_starred ? 'text-yellow-400 fill-yellow-400' : ''}`} />;
        case 'archive':
          return <Archive className={`w-3 h-3 ${chat.is_archived ? 'text-blue-400' : ''}`} />;
        case 'delete':
          return <Trash2 className="w-3 h-3 text-red-400" />;
      }
    };

    return (
      <button
        onClick={(e) => handleChatAction(chatId, action, e)}
        className={`p-1 rounded transition-all transform ${
          isInProgress ? 'scale-110' : 'hover:scale-110'
        } ${
          action === 'delete' 
            ? 'hover:bg-red-100 dark:hover:bg-red-900/20' 
            : 'hover:bg-sakura-100 dark:hover:bg-sakura-100/10'
        }`}
        title={
          action === 'star' ? (chat.is_starred ? 'Unstar' : 'Star') :
          action === 'archive' ? (chat.is_archived ? 'Unarchive' : 'Archive') :
          'Delete'
        }
        disabled={isInProgress}
      >
        {getIcon()}
      </button>
    );
  };

  const menuItems = [
    { icon: Star, label: 'Starred', onClick: () => setShowStarred(!showStarred), active: showStarred, count: counts.starred },
    { icon: Archive, label: 'Archived', onClick: () => setShowArchived(!showArchived), active: showArchived, count: counts.archived },
    { icon: Trash2, label: 'Trash', onClick: () => setShowDeleted(!showDeleted), active: showDeleted, count: counts.deleted },
    { 
      icon: Sparkles, 
      label: "What's New", 
      onClick: handleWhatsNewClick,
      active: false,
      glow: shouldGlow 
    },
    { icon: Settings, label: 'Settings', onClick: onOpenSettings }
  ];

  return (
    <>
      <div
        className={`glassmorphic h-full flex flex-col gap-6 transition-all duration-300 ease-in-out ${
          isExpanded ? 'w-64 sidebar-expanded' : 'w-20'
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className={`flex items-center py-4 ${
          isExpanded ? 'px-4 justify-start gap-3' : 'justify-center'
        }`}>
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src={logo} alt="Clara Logo" className="w-8 h-8 flex-shrink-0" />
            <h1 
              className={`text-2xl font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap overflow-hidden transition-all duration-300 ${
                isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              }`}
            >
              Clara
            </h1>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-2">
          <button
            onClick={handleNewChat}
            className={`w-full flex items-center rounded-lg transition-colors bg-sakura-500 hover:bg-sakura-600 text-white ${
              isExpanded ? 'px-4 py-2 justify-start gap-2' : 'h-10 justify-center'
            }`}
          >
            <Plus className="w-5 h-5" />
            {isExpanded && <span>New Chat</span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredChats.length > 0 ? (
            <div className="px-2 space-y-0.5">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => onChatSelect(chat.id)}
                  className={`w-full flex items-center gap-2 py-2 rounded-lg transition-colors group relative cursor-pointer ${
                    isExpanded ? 'px-3' : 'justify-center px-0'
                  } ${
                    activeChat === chat.id && isExpanded
                      ? 'bg-sakura-100 text-sakura-500 dark:bg-sakura-100/10'
                      : isExpanded 
                        ? 'text-gray-700 dark:text-gray-300 hover:bg-sakura-50 dark:hover:bg-sakura-100/5'
                        : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <MessageSquare className="sidebar-icon flex-shrink-0" />
                  {isExpanded && (
                    <div className="flex-1 text-left overflow-hidden min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {chat.title}
                        </span>
                        {chat.is_starred && (
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(chat.updated_at).toLocaleDateString()}
                          {chat.is_archived && (
                            <Archive className="w-3 h-3 text-blue-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {renderActionButton(chat.id, 'star', chat)}
                          {renderActionButton(chat.id, 'archive', chat)}
                          {renderActionButton(chat.id, 'delete', chat)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            isExpanded && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-gray-500 dark:text-gray-400">
                <MessageSquare className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-sm">
                  {showArchived ? 'No archived chats' :
                   showStarred ? 'No starred chats' :
                   showDeleted ? 'No deleted chats' :
                   'No chats yet. Start a new conversation!'}
                </p>
              </div>
            )
          )}
        </div>

        <div className="mt-auto px-2 pb-4">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className={`w-full flex items-center rounded-lg transition-colors ${
                item.active
                  ? 'bg-sakura-100 text-sakura-500 dark:bg-sakura-100/10'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-sakura-50 dark:hover:bg-sakura-100/5'
              } ${
                isExpanded ? 'px-4 py-2 justify-start gap-2' : 'h-10 justify-center'
              } ${
                item.glow ? 'animate-glow' : ''
              }`}
              style={item.glow ? {
                boxShadow: '0 0 10px rgba(244, 114, 182, 0.5), 0 0 20px rgba(244, 114, 182, 0.3), 0 0 30px rgba(244, 114, 182, 0.2)'
              } : undefined}
            >
              <item.icon className="w-5 h-5" />
              {isExpanded && (
                <>
                  <span>{item.label}</span>
                  {item.count !== undefined && renderBadge(item.count)}
                </>
              )}
            </button>
          ))}
        </div>

        <div 
          className={`absolute top-1/2 -right-3 transform -translate-y-1/2 transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          <div className="bg-sakura-500 rounded-full p-1 shadow-lg cursor-pointer">
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      <WhatsNewModal 
        isOpen={showWhatsNew} 
        onClose={() => setShowWhatsNew(false)} 
      />
    </>
  );
};

export default AssistantSidebar;