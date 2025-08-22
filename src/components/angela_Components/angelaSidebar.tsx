import React, { useState, useEffect } from 'react';
import { MessageSquare, Archive, Star, Trash2, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { angelaChatSession } from '../../types/angela_assistant_types';

interface angelaSidebarProps {
  sessions?: angelaChatSession[];
  currentSessionId?: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMoreSessions?: boolean;
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  onSessionAction?: (sessionId: string, action: 'star' | 'archive' | 'delete') => void;
  onLoadMore?: () => void;
}

const angelaSidebar: React.FC<angelaSidebarProps> = ({
  sessions = [],
  currentSessionId,
  isLoading = false,
  isLoadingMore = false,
  hasMoreSessions = false,
  onSelectSession = () => {},
  onNewChat = () => {},
  onSessionAction = () => {},
  onLoadMore = () => {}
}) => {
  // Load initial expanded state from localStorage, default to true (expanded)
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('angela-sidebar-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // Track if user manually collapsed it - if so, don't auto-expand on hover
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(() => {
    const saved = localStorage.getItem('angela-sidebar-manually-collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });
  
  const [filter, setFilter] = useState<'all' | 'starred' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Save expanded state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('angela-sidebar-expanded', JSON.stringify(isExpanded));
  }, [isExpanded]);

  // Save manually collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('angela-sidebar-manually-collapsed', JSON.stringify(isManuallyCollapsed));
  }, [isManuallyCollapsed]);

  // Toggle sidebar expanded state - when user manually toggles
  const toggleSidebar = () => {
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);
    
    // If user manually collapses, mark as manually collapsed
    // If user manually expands, unmark manual collapse
    setIsManuallyCollapsed(!newExpandedState);
  };

  // Handle mouse enter - only expand if not manually collapsed
  const handleMouseEnter = () => {
    if (!isManuallyCollapsed) {
      setIsExpanded(true);
    }
  };

  // Handle mouse leave - only collapse if not manually expanded or if it was manually collapsed
  const handleMouseLeave = () => {
    if (isManuallyCollapsed) {
      setIsExpanded(false);
    }
  };

  // Filter sessions based on current filter and search
  const filteredSessions = sessions.filter(session => {
    // Apply filter
    if (filter === 'starred' && !session.isStarred) return false;
    if (filter === 'archived' && !session.isArchived) return false;
    if (filter === 'all' && session.isArchived) return false; // Don't show archived in 'all'

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return session.title.toLowerCase().includes(query) ||
             session.messages.some(msg => msg.content.toLowerCase().includes(query));
    }

    return true;
  });

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getMessageCount = (session: angelaChatSession) => {
    // Use messageCount if available (from light loading), otherwise use messages.length
    const count = session.messageCount ?? session.messages?.length ?? 0;
    

    
    return count;
  };

  const getLastMessagePreview = (session: angelaChatSession) => {
    // If we have a message count but no loaded messages (light loading), show generic message
    const messageCount = getMessageCount(session);
    if (messageCount > 0 && (!session.messages || session.messages.length === 0)) {
      return 'Chat conversation'; // Generic preview for light-loaded sessions
    }
    
    // If no messages at all
    if (!session.messages || session.messages.length === 0) return 'No messages yet';
    
    // Get the last message content
    const lastMessage = session.messages[session.messages.length - 1];
    if (!lastMessage || !lastMessage.content) return 'No messages yet';
    const preview = lastMessage.content.slice(0, 50);
    return preview + (lastMessage.content.length > 50 ? '...' : '');
  };

  // Skeleton loading component
  const SessionSkeleton = () => (
    <div className="flex items-start gap-3 py-3 rounded-lg px-3 animate-pulse">
      <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded flex-shrink-0 mt-0.5"></div>
      <div className="flex-1 min-w-0">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    </div>
  );

  return (
    <div
      className={`glassmorphic h-full flex flex-col transition-all duration-300 z-[10000] ${isExpanded ? 'w-80' : 'w-16'}`}
      style={{ minWidth: isExpanded ? '20rem' : '4rem', maxWidth: isExpanded ? '20rem' : '4rem' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isExpanded ? (
        <>
          {/* Header with Toggle Button */}
          <div className="flex items-center py-4 px-4 justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Chat Histories</h2>
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Collapse sidebar"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/20 dark:bg-gray-800/50 rounded-lg border border-gray-200/30 dark:border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-sakura-500/30 text-sm"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 pb-2">
            <div className="flex space-x-1 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg p-1">
              {(['all', 'starred', 'archived'] as const).map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption)}
                  className={`flex-1 py-1 px-2 rounded-md text-xs font-medium transition-colors ${
                    filter === filterOption
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* New Chat Button */}
          <div className="px-2 pb-4">
            <button 
              onClick={onNewChat}
              className="w-full flex items-center rounded-lg transition-colors bg-sakura-500 hover:bg-sakura-600 text-white px-4 py-2 justify-start gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>New Chat</span>
            </button>
          </div>

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="px-2 space-y-1">
                {/* Show skeleton loaders while loading */}
                {Array.from({ length: 6 }).map((_, index) => (
                  <SessionSkeleton key={index} />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No chats found' : 
                 filter === 'starred' ? 'No starred chats' :
                 filter === 'archived' ? 'No archived chats' : 
                 'No chats yet'}
              </div>
            ) : (
              <div className="px-2 space-y-1">
                {filteredSessions.map(session => (
                  <div 
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`flex items-start gap-3 py-3 rounded-lg transition-colors group relative cursor-pointer px-3 ${
                      currentSessionId === session.id
                        ? 'bg-sakura-50 dark:bg-sakura-100/10 border border-sakura-200 dark:border-sakura-500/30'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-sakura-50 dark:hover:bg-sakura-100/10'
                    }`}
                  >
                    <MessageSquare className="w-5 h-5 text-gray-700 dark:text-gray-300 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-left overflow-hidden min-w-0">
                      <div className="flex items-start justify-between">
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate block">
                          {session.title}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onSessionAction(session.id, 'star');
                            }}
                            className="p-1 hover:bg-sakura-100 dark:hover:bg-sakura-100/20 rounded transition-colors" 
                            title={session.isStarred ? "Unstar" : "Star"}
                          >
                            <Star className={`w-3 h-3 ${session.isStarred ? 'text-yellow-500 fill-current' : 'text-gray-500 dark:text-gray-400 hover:text-sakura-500'}`} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onSessionAction(session.id, 'archive');
                            }}
                            className="p-1 hover:bg-sakura-100 dark:hover:bg-sakura-100/20 rounded transition-colors" 
                            title={session.isArchived ? "Unarchive" : "Archive"}
                          >
                            <Archive className={`w-3 h-3 ${session.isArchived ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-sakura-500'}`} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this chat?')) {
                                onSessionAction(session.id, 'delete');
                              }
                            }}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-100/20 rounded transition-colors" 
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-gray-500 dark:text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {getLastMessagePreview(session)}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <span>{formatDate(session.updatedAt)}</span>
                            <span>•</span>
                            <span>{getMessageCount(session)} messages</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Load More Button */}
                {hasMoreSessions && (
                  <div className="px-3 py-2">
                    <button
                      onClick={onLoadMore}
                      disabled={isLoadingMore}
                      className="w-full py-2 px-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          Loading more...
                        </div>
                      ) : (
                        'Load more chats'
                      )}
                    </button>
                  </div>
                )}
                
                {/* Loading more skeleton */}
                {isLoadingMore && (
                  <div className="space-y-1">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <SessionSkeleton key={`loading-${index}`} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Stats */}
          <div className="mt-auto p-4 border-t border-gray-200/30 dark:border-gray-700/50">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {filteredSessions.length} of {sessions.length} chats
            </div>
          </div>
        </>
      ) : (
        /* Collapsed State - Toggle button at top, title centered */
        <div className="h-full flex flex-col">
          {/* Toggle button at top */}
          <div className="flex justify-center py-4">
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Expand sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          
          {/* Centered title */}
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs font-semibold tracking-widest text-gray-700 dark:text-gray-300 rotate-180" style={{ writingMode: 'vertical-rl' }}>
              Chat Histories
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default angelaSidebar; 
