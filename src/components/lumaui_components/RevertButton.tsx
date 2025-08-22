import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import { gsap } from 'gsap';
import { useCheckpoints } from './CheckpointManager';

interface RevertButtonProps {
  messageId: string;
  onRevert: (checkpointId: string) => void;
  className?: string;
}

const RevertButton: React.FC<RevertButtonProps> = ({ 
  messageId, 
  onRevert, 
  className = '' 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const { getCheckpointByMessageId, checkpoints } = useCheckpoints();

  const checkpoint = getCheckpointByMessageId(messageId);
  const shouldShow = checkpoint && checkpoint !== checkpoints[checkpoints.length - 1];

  useEffect(() => {
    if (showConfirm && confirmRef.current) {
      gsap.fromTo(confirmRef.current, 
        { 
          opacity: 0, 
          scale: 0.8, 
          y: 10 
        },
        { 
          opacity: 1, 
          scale: 1, 
          y: 0, 
          duration: 0.3, 
          ease: "back.out(1.7)" 
        }
      );
    }
  }, [showConfirm]);

  useEffect(() => {
    if (isHovered && buttonRef.current) {
      gsap.to(buttonRef.current, {
        scale: 1.05,
        duration: 0.2,
        ease: "power2.out"
      });
    } else if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        scale: 1,
        duration: 0.2,
        ease: "power2.out"
      });
    }
  }, [isHovered]);

  const handleRevert = () => {
    if (!checkpoint) return;
    
    // Animate button success
    if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        scale: 1.2,
        duration: 0.1,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          onRevert(checkpoint.id);
          setShowConfirm(false);
        }
      });
    }
  };

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

  // Don't render anything if no checkpoint or if it's the latest checkpoint
  if (!shouldShow || !checkpoint) {
    return null;
  }

  return (
    <div className={`relative inline-block ${className}`}>
      {!showConfirm ? (
        <div
          ref={buttonRef}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setShowConfirm(true)}
          className="group cursor-pointer p-1.5 rounded-lg glassmorphic-card border border-white/20 dark:border-gray-600/30 hover:border-amber-300/50 dark:hover:border-amber-500/50 transition-all duration-200 hover:shadow-md"
          title={`Revert to checkpoint from ${formatTime(checkpoint.timestamp)}`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-gray-400 group-hover:text-amber-500 transition-colors duration-200" />
        </div>
      ) : (
        <div
          ref={confirmRef}
          className="absolute right-0 top-0 z-10 min-w-[200px] p-3 glassmorphic-card border border-amber-200/50 dark:border-amber-700/50 rounded-lg shadow-lg backdrop-blur-md"
        >
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                Revert to checkpoint?
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                This will restore the conversation to:
              </div>
              <div className="text-xs glassmorphic-card border border-white/20 dark:border-gray-600/30 rounded p-2 mb-3">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatTime(checkpoint.timestamp)}
                  </span>
                </div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">
                  "{checkpoint.userMessage.length > 40 
                    ? checkpoint.userMessage.substring(0, 40) + '...' 
                    : checkpoint.userMessage}"
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {checkpoint.metadata.messageCount} messages
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleRevert}
              className="flex-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Revert
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 glassmorphic-card border border-white/30 dark:border-gray-600/30 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xs font-medium rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevertButton; 
