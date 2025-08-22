import React, { useState, useRef, useEffect } from 'react';
import { History, Clock, MessageSquare, RotateCcw, ChevronDown } from 'lucide-react';
import { gsap } from 'gsap';
import { useCheckpoints } from './CheckpointManager';

interface CheckpointHistoryProps {
  onRevert: (checkpointId: string) => void;
}

const CheckpointHistory: React.FC<CheckpointHistoryProps> = ({ onRevert }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { checkpoints } = useCheckpoints();

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      gsap.fromTo(dropdownRef.current,
        {
          opacity: 0,
          scale: 0.95,
          y: -10
        },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.2,
          ease: "power2.out"
        }
      );
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const formatTime = (date: Date | string | number | undefined) => {
  if (!date) return '';
  
  let dateObj: Date;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    return '';
  }
  
  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return 'Today';
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isYesterday) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleRevert = (checkpointId: string) => {
    onRevert(checkpointId);
    setIsOpen(false);
  };

  if (checkpoints.length === 0) {
    return null;
  }

  // Group checkpoints by date
  const groupedCheckpoints = checkpoints.reduce((groups: Record<string, typeof checkpoints>, checkpoint) => {
    const dateKey = formatDate(checkpoint.timestamp);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(checkpoint);
    return groups;
  }, {});

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 glassmorphic-card border border-white/30 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:text-sakura-500 dark:hover:text-sakura-400 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-105"
        title={`${checkpoints.length} checkpoint${checkpoints.length === 1 ? '' : 's'} available`}
      >
        <History className="w-4 h-4" />
        <span className="text-xs font-medium">{checkpoints.length}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto glassmorphic-card border border-white/30 dark:border-gray-700/50 rounded-xl shadow-xl backdrop-blur-md z-50"
        >
          <div className="p-3 border-b border-white/20 dark:border-gray-600/30">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sakura-500" />
              <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                Checkpoint History
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Revert to any previous conversation state
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            {Object.entries(groupedCheckpoints)
              .sort(([, a], [, b]) => b[0].timestamp.getTime() - a[0].timestamp.getTime())
              .map(([dateGroup, dateCheckpoints]) => (
                <div key={dateGroup} className="border-b border-white/10 dark:border-gray-600/20 last:border-b-0">
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50">
                    {dateGroup}
                  </div>
                  
                  {dateCheckpoints
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .map((checkpoint, index) => {
                      const isLatest = index === 0 && dateGroup === formatDate(new Date());
                      
                      return (
                        <div
                          key={checkpoint.id}
                          className={`group px-3 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer ${
                            isLatest ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          onClick={() => !isLatest && handleRevert(checkpoint.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-sakura-400 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                              <Clock className="w-4 h-4 text-white" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {formatTime(checkpoint.timestamp)}
                                  </span>
                                  {isLatest && (
                                    <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">
                                      Current
                                    </span>
                                  )}
                                </div>
                                
                                {!isLatest && (
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <RotateCcw className="w-3 h-3 text-amber-500" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="text-sm text-gray-800 dark:text-gray-200 font-medium mb-1">
                                {checkpoint.userMessage.length > 60
                                  ? checkpoint.userMessage.substring(0, 60) + '...'
                                  : checkpoint.userMessage}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{checkpoint.metadata.messageCount} messages</span>
                                {checkpoint.metadata.lastToolUsed && (
                                  <>
                                    <span>•</span>
                                    <span>{checkpoint.metadata.lastToolUsed}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
          </div>

          {checkpoints.length === 0 && (
            <div className="p-6 text-center">
              <History className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No checkpoints available
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CheckpointHistory; 
