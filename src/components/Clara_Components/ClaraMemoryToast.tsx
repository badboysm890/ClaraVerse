/**
 * ClaraMemoryToast.tsx
 * 
 * A cute, non-intrusive toast notification that appears when Clara learns something new about the user.
 * Features Clara's animated face, progress indicator, and delightful messages.
 * Includes a 1-minute cooldown to prevent spam.
 */

import React, { useState, useEffect } from 'react';
import { Brain, Heart, Sparkles, Star } from 'lucide-react';

// Import Clara face images using correct relative path
import CuriousImage from '../claraFaces/Curious.png';
import InterestedImage from '../claraFaces/Interested.png';
import HappyImage from '../claraFaces/Happy.png';
import DelightedImage from '../claraFaces/Delighted.png';
import LearningImage from '../claraFaces/learning.png';

// ==================== INTERFACES ====================

interface ClaraMemoryToastProps {
  isVisible: boolean;
  onHide: () => void;
  knowledgeLevel?: number; // 0-100, how much Clara knows about the user
  learnedInfo?: string; // Brief description of what was learned
  duration?: number; // How long to show the toast (default 4000ms)
}

// ==================== CONSTANTS ====================

const LEARNING_PHRASES = [
  "I learned something new about you! 🌟",
  "Your story is becoming clearer to me! ✨",
  "Another piece of your puzzle discovered! 🧩",
  "I'm getting to know you better! 💫",
  "Filed away in my sweet memories! 🗂️",
  "Your personality is fascinating! 🎭",
  "Adding to my understanding of you! 📚",
  "Every detail makes you more unique! 🦄",
  "Building our connection, one memory at a time! 🌉",
  "Your individuality shines through! ⭐"
];

// Clara face images array - easily replaceable with actual image paths
const CLARA_FACE_IMAGES = [
  // Using actual Clara face images from claraFaces folder
  CuriousImage,
  InterestedImage, 
  HappyImage,
  DelightedImage,
  LearningImage
];

// Debug logging for imported images
console.log('🎨 Clara Face Images Imported:', {
  CuriousImage,
  InterestedImage,
  HappyImage,
  DelightedImage,
  LearningImage,
  CLARA_FACE_IMAGES
});

const getRandomPhrase = (): string => {
  return LEARNING_PHRASES[Math.floor(Math.random() * LEARNING_PHRASES.length)];
};

const getClaraFaceImage = (expression: string): string => {
  // Map expressions to face images
  const faceMap: { [key: string]: number } = {
    'curious': 0,
    'interested': 1,
    'happy': 2,
    'delighted': 3,
    'learning': 4
  };
  return CLARA_FACE_IMAGES[faceMap[expression] || 0];
};

// ==================== CLARA FACE COMPONENT ====================

const ClaraFace: React.FC<{ 
  isLearning: boolean;
  knowledgeLevel: number;
}> = ({ isLearning, knowledgeLevel }) => {
  const [blinkState, setBlinkState] = useState(false);
  const [sparklePosition, setSparklePosition] = useState({ x: 0, y: 0 });

  // Blinking animation
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 2000 + Math.random() * 3000); // Random blink every 2-5 seconds

    return () => clearInterval(blinkInterval);
  }, []);

  // Sparkle animation
  useEffect(() => {
    if (isLearning) {
      const sparkleInterval = setInterval(() => {
        setSparklePosition({
          x: Math.random() * 40 - 20, // Random position around the face
          y: Math.random() * 40 - 20
        });
      }, 500);

      return () => clearInterval(sparkleInterval);
    }
  }, [isLearning]);

  // Calculate face expression based on knowledge level
  const getExpression = () => {
    if (knowledgeLevel < 20) return 'curious';
    if (knowledgeLevel < 50) return 'interested';
    if (knowledgeLevel < 80) return 'happy';
    return 'delighted';
  };

  const expression = getExpression();
  const faceImagePath = getClaraFaceImage(isLearning ? 'learning' : expression);

  // Debug logging
  console.log('🎨 Clara Face Debug:', {
    expression,
    isLearning,
    faceImagePath,
    knowledgeLevel
  });

  return (
    <div className="relative w-12 h-12">
      {/* Main face container - Image-based face */}
      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800 shadow-lg">
        <img 
          src={faceImagePath}
          alt={`Clara ${expression}`}
          className={`w-full h-full object-cover transition-all duration-300 ${isLearning ? 'animate-pulse' : ''}`}
          onLoad={() => {
            console.log('✅ Clara face image loaded successfully:', faceImagePath);
          }}
          onError={(e) => {
            console.error('❌ Clara face image failed to load:', faceImagePath);
            console.error('Error details:', e);
            // Fallback to generated face if image fails to load
            e.currentTarget.style.display = 'none';
            const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallbackElement) {
              fallbackElement.classList.remove('hidden');
              console.log('🔄 Switching to fallback generated face');
            }
          }}
        />
        
        {/* Fallback generated face - hidden by default */}
        <div className={`
          hidden absolute inset-0 w-12 h-12 rounded-full transition-all duration-300
          ${expression === 'curious' ? 'bg-gradient-to-br from-blue-400 to-blue-500' : ''}
          ${expression === 'interested' ? 'bg-gradient-to-br from-purple-400 to-purple-500' : ''}
          ${expression === 'happy' ? 'bg-gradient-to-br from-pink-400 to-pink-500' : ''}
          ${expression === 'delighted' ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : ''}
          ${isLearning ? 'animate-pulse' : ''}
        `}>
          
          {/* Eyes */}
          <div className="absolute top-3 left-3 w-2 h-2 bg-white rounded-full transition-all duration-150">
            {blinkState && <div className="w-full h-0.5 bg-gray-800 mt-0.5"></div>}
            {!blinkState && <div className="w-0.5 h-0.5 bg-gray-800 rounded-full mt-0.5 ml-0.5"></div>}
          </div>
          <div className="absolute top-3 right-3 w-2 h-2 bg-white rounded-full transition-all duration-150">
            {blinkState && <div className="w-full h-0.5 bg-gray-800 mt-0.5"></div>}
            {!blinkState && <div className="w-0.5 h-0.5 bg-gray-800 rounded-full mt-0.5 ml-0.5"></div>}
          </div>

          {/* Mouth */}
          <div className={`
            absolute bottom-3 left-1/2 transform -translate-x-1/2 transition-all duration-300
            ${expression === 'curious' ? 'w-2 h-1 border-b-2 border-white rounded-full' : ''}
            ${expression === 'interested' ? 'w-3 h-1.5 border-b-2 border-white rounded-full' : ''}
            ${expression === 'happy' ? 'w-4 h-2 border-b-2 border-white rounded-full' : ''}
            ${expression === 'delighted' ? 'w-5 h-2.5 border-2 border-white rounded-full bg-white/20' : ''}
          `}></div>

          {/* Cheek blush for happy expressions */}
          {(expression === 'happy' || expression === 'delighted') && (
            <>
              <div className="absolute top-5 left-1 w-1.5 h-1 bg-white/30 rounded-full"></div>
              <div className="absolute top-5 right-1 w-1.5 h-1 bg-white/30 rounded-full"></div>
            </>
          )}
        </div>

        {/* Learning indicator - brain icon overlay */}
        {isLearning && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-700 rounded-full shadow-md flex items-center justify-center">
            <Brain className="w-2.5 h-2.5 text-blue-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* Sparkles around the face when learning */}
      {isLearning && (
        <>
          <Sparkles 
            className={`absolute w-3 h-3 text-yellow-300 animate-ping transition-all duration-500`}
            style={{
              top: `${20 + sparklePosition.y}px`,
              left: `${20 + sparklePosition.x}px`
            }}
          />
          <Star 
            className={`absolute w-2 h-2 text-pink-300 animate-pulse`}
            style={{
              top: `${15 - sparklePosition.y}px`,
              right: `${15 - sparklePosition.x}px`
            }}
          />
        </>
      )}
    </div>
  );
};

// ==================== PROGRESS BAR COMPONENT ====================

const KnowledgeProgress: React.FC<{
  level: number;
  isAnimating: boolean;
}> = ({ level, isAnimating }) => {
  const [displayLevel, setDisplayLevel] = useState(level);

  useEffect(() => {
    if (isAnimating) {
      // Animate the progress bar filling up
      const startLevel = Math.max(0, level - 5); // Start slightly lower for animation
      let currentLevel = startLevel;
      
      const animation = setInterval(() => {
        currentLevel += 0.5;
        setDisplayLevel(Math.min(currentLevel, level));
        
        if (currentLevel >= level) {
          clearInterval(animation);
        }
      }, 20);

      return () => clearInterval(animation);
    } else {
      setDisplayLevel(level);
    }
  }, [level, isAnimating]);

  const getProgressColor = () => {
    if (displayLevel < 20) return 'from-blue-400 to-blue-500';
    if (displayLevel < 50) return 'from-purple-400 to-purple-500';
    if (displayLevel < 80) return 'from-pink-400 to-pink-500';
    return 'from-yellow-400 to-orange-500';
  };

  const getKnowledgeLabel = () => {
    if (displayLevel < 20) return 'Getting to know you';
    if (displayLevel < 50) return 'Learning about you';
    if (displayLevel < 80) return 'Understanding you well';
    return 'Know you deeply';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-300">
          {getKnowledgeLabel()}
        </span>
        <span className="text-xs text-gray-400">
          {Math.round(displayLevel)}%
        </span>
      </div>
      
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${getProgressColor()} transition-all duration-500 ease-out relative`}
          style={{ width: `${displayLevel}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN TOAST COMPONENT ====================

const ClaraMemoryToast: React.FC<ClaraMemoryToastProps> = ({
  isVisible,
  onHide,
  knowledgeLevel = 25,
  learnedInfo,
  duration = 6000 // 🎨 Design testing: Longer duration to see animations (was 4000)
}) => {
  const [phrase, setPhrase] = useState(getRandomPhrase());
  const [isLeaving, setIsLeaving] = useState(false);

  // Generate a new phrase when the toast becomes visible
  useEffect(() => {
    if (isVisible) {
      setPhrase(getRandomPhrase());
      setIsLeaving(false);
    }
  }, [isVisible]);

  // Auto-hide after duration
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        setIsLeaving(true);
        setTimeout(onHide, 300); // Give time for exit animation
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onHide]);

  // Don't render if not visible
  if (!isVisible && !isLeaving) {
    return null;
  }

  return (
    <div 
      className={`
        fixed bottom-6 right-6 z-[9999] max-w-sm transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'}
      `}
      style={{ transformOrigin: 'bottom right' }}
    >
      {/* Main toast container - Dark theme */}
      <div className="bg-black/95 backdrop-blur-xl rounded-2xl shadow-2xl p-4 min-w-[280px]">
        
        {/* Header with Clara's face */}
        <div className="flex items-start gap-3 mb-3">
          <ClaraFace 
            isLearning={isVisible && !isLeaving}
            knowledgeLevel={knowledgeLevel}
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm text-white">
                Clara's Memory
              </h4>
              <Heart className="w-3 h-3 text-pink-400 animate-pulse" />
              {/* 🎨 Design debug: Refresh button */}
              <button 
                onClick={() => window.location.reload()}
                className="ml-auto w-4 h-4 text-gray-400 hover:text-gray-300 transition-colors"
                title="🎨 Design Debug: Refresh for new variation"
              >
                🔄
              </button>
            </div>
            
            <p className="text-sm text-gray-300 leading-relaxed">
              {phrase}
            </p>
            
            {/* Learned info preview */}
            {learnedInfo && (
              <p className="text-xs text-gray-400 mt-1 italic">
                "{learnedInfo}"
              </p>
            )}
          </div>
        </div>

        {/* Knowledge progress bar */}
        <KnowledgeProgress 
          level={knowledgeLevel}
          isAnimating={isVisible && !isLeaving}
        />

        {/* Cute footer message */}
        <div className="mt-3 pt-2 border-t border-gray-700/30">
          <p className="text-xs text-center text-gray-400">
            Building our friendship, one memory at a time 💫
          </p>
        </div>
      </div>

      {/* Floating decoration elements - Grey dots */}
      <div className="absolute -top-2 -right-2 w-4 h-4 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full animate-bounce shadow-lg" 
           style={{ animationDelay: '0s', animationDuration: '2s' }}></div>
      <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full animate-bounce shadow-lg" 
           style={{ animationDelay: '1s', animationDuration: '2.5s' }}></div>
    </div>
  );
};

export default ClaraMemoryToast;

// Export types for external use
export type { ClaraMemoryToastProps };
