/**
 * angelaBrainDashboard.tsx
 * 
 * angela's Brain Memory Dashboard - Minimalist friendship & memory system
 * Simple, elegant UI following Dashboard design patterns
 */

import React, { useState, useEffect } from 'react';
import { 
  Brain, Sparkles, User, MessageSquare, Settings, Heart,
  Clock
} from 'lucide-react';
import { angelaSweetMemoryAPI } from '../angelaSweetMemory';
import type { UserMemoryProfile } from '../angelaSweetMemory';

// ==================== INTERFACES ====================

interface FriendshipLevel {
  level: number;
  title: string;
  emoji: string;
  description: string;
  minPoints: number;
  maxMemories: number;
  learningSpeed: number;
  unlocks: string[];
}

const FRIENDSHIP_LEVELS: FriendshipLevel[] = [
  {
    level: 1,
    title: "Stranger",
    emoji: "👋",
    description: "Just met, learning the basics about you",
    minPoints: 0,
    maxMemories: 10,
    learningSpeed: 1.0,
    unlocks: ["Basic conversations"]
  },
  {
    level: 2,
    title: "Acquaintance",
    emoji: "😊",
    description: "Getting to know your basic preferences",
    minPoints: 100,
    maxMemories: 25,
    learningSpeed: 1.1,
    unlocks: ["Work context", "Basic preferences"]
  },
  {
    level: 3,
    title: "Friend",
    emoji: "😄",
    description: "Understanding your style and habits",
    minPoints: 300,
    maxMemories: 50,
    learningSpeed: 1.3,
    unlocks: ["Personal insights", "Pattern recognition"]
  },
  {
    level: 4,
    title: "Close Friend",
    emoji: "🤗",
    description: "Deep understanding of your preferences and needs",
    minPoints: 700,
    maxMemories: 100,
    learningSpeed: 1.5,
    unlocks: ["Proactive assistance", "Emotional understanding"]
  },
  {
    level: 5,
    title: "Best Friend",
    emoji: "💖",
    description: "Almost mind-reading level of understanding!",
    minPoints: 1500,
    maxMemories: 200,
    learningSpeed: 1.8,
    unlocks: ["Predictive assistance", "Complete sync"]
  }
];

interface MemoryCard {
  id: string;
  category: string;
  title: string;
  content: string;
  confidence: number;
  frequency: string;
  lastUpdated: Date;
  icon: React.ReactNode;
  source: string;
}

// ==================== HELPER FUNCTIONS ====================

const calculateFriendshipPoints = (profile: UserMemoryProfile | null): number => {
  if (!profile) return 0;
  
  let points = 0;
  
  // Knowledge points
  const knowledgeCount = countTotalMemories(profile);
  points += knowledgeCount * 8;
  
  // Time factor
  const daysActive = calculateDaysTogether(profile);
  points += Math.floor(daysActive * 3);
  
  // Quality bonus
  const avgConfidence = profile.metadata?.confidenceLevel || 0;
  points += Math.floor(avgConfidence * 150);
  
  // Diversity bonus
  const categories = getCategoryCount(profile);
  points += categories * 25;
  
  // Version bonus
  const versionBonus = Math.min((profile.version || 1) * 5, 100);
  points += versionBonus;
  
  return Math.floor(points);
};

const countTotalMemories = (profile: UserMemoryProfile | null): number => {
  if (!profile) return 0;
  
  let count = 0;
  
  if (profile.coreIdentity) {
    Object.values(profile.coreIdentity).forEach(value => {
      if (value && value !== 'unknown' && value !== '') {
        if (Array.isArray(value)) count += value.length;
        else count += 1;
      }
    });
  }
  
  ['personalCharacteristics', 'preferences', 'interactions', 'context', 'emotional', 'practical'].forEach(category => {
    const section = profile[category as keyof UserMemoryProfile];
    if (section && typeof section === 'object') {
      count += Object.keys(section).length;
    }
  });
  
  return count;
};

const getCategoryCount = (profile: UserMemoryProfile | null): number => {
  if (!profile) return 0;
  
  let categories = 0;
  
  if (profile.coreIdentity && Object.keys(profile.coreIdentity).length > 0) categories++;
  if (profile.personalCharacteristics && Object.keys(profile.personalCharacteristics).length > 0) categories++;
  if (profile.preferences && Object.keys(profile.preferences).length > 0) categories++;
  if (profile.interactions && Object.keys(profile.interactions).length > 0) categories++;
  if (profile.context && Object.keys(profile.context).length > 0) categories++;
  if (profile.emotional && Object.keys(profile.emotional).length > 0) categories++;
  if (profile.practical && Object.keys(profile.practical).length > 0) categories++;
  
  return categories;
};

const calculateFriendshipLevel = (points: number): FriendshipLevel => {
  for (let i = FRIENDSHIP_LEVELS.length - 1; i >= 0; i--) {
    if (points >= FRIENDSHIP_LEVELS[i].minPoints) {
      return FRIENDSHIP_LEVELS[i];
    }
  }
  return FRIENDSHIP_LEVELS[0];
};

const calculateLevelProgress = (points: number): { current: FriendshipLevel; next: FriendshipLevel | null; progressPercent: number } => {
  const current = calculateFriendshipLevel(points);
  const currentIndex = FRIENDSHIP_LEVELS.findIndex(level => level.level === current.level);
  const next = currentIndex < FRIENDSHIP_LEVELS.length - 1 ? FRIENDSHIP_LEVELS[currentIndex + 1] : null;
  
  if (!next) {
    return { current, next: null, progressPercent: 100 };
  }
  
  const pointsInCurrentLevel = points - current.minPoints;
  const pointsNeededForNextLevel = next.minPoints - current.minPoints;
  const progressPercent = Math.min(100, (pointsInCurrentLevel / pointsNeededForNextLevel) * 100);
  
  return { current, next, progressPercent };
};

const calculateDaysTogether = (profile: UserMemoryProfile | null): number => {
  if (!profile?.createdAt) return 0;
  const createdDate = new Date(profile.createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
};

const getMemoryCards = (profile: UserMemoryProfile | null): MemoryCard[] => {
  if (!profile) return [];
  
  const cards: MemoryCard[] = [];
  
  // Core Identity Cards
  if (profile.coreIdentity) {
    Object.entries(profile.coreIdentity).forEach(([key, value]) => {
      if (value && value !== 'unknown') {
        let displayValue = value;
        let confidence = 0.9;
        
        if (typeof value === 'object' && value !== null) {
          const keys = Object.keys(value);
          const hasNumberedKeys = keys.some(k => !isNaN(Number(k)));
          
          if (hasNumberedKeys && value.value) {
            displayValue = value.value;
            confidence = value.confidence || 0.9;
          } else if (value.value !== undefined) {
            displayValue = value.value;
            confidence = value.confidence || 0.9;
          }
        }
        
        if (displayValue && displayValue !== 'unknown') {
          cards.push({
            id: `core-${key}`,
            category: 'Identity',
            title: formatTitle(key),
            content: formatValue(displayValue),
            confidence: confidence,
            frequency: 'constant',
            lastUpdated: new Date(profile.updatedAt),
            icon: <User className="w-4 h-4" />,
            source: 'core'
          });
        }
      }
    });
  }
  
  // Dynamic sections
  const dynamicSections = [
    { key: 'personalCharacteristics', icon: <Sparkles className="w-4 h-4" />, category: 'Personality' },
    { key: 'preferences', icon: <Settings className="w-4 h-4" />, category: 'Preferences' },
    { key: 'context', icon: <MessageSquare className="w-4 h-4" />, category: 'Context' },
    { key: 'emotional', icon: <Heart className="w-4 h-4" />, category: 'Emotions' },
    { key: 'interactions', icon: <MessageSquare className="w-4 h-4" />, category: 'Interactions' },
    { key: 'practical', icon: <Settings className="w-4 h-4" />, category: 'Practical' }
  ];
  
  dynamicSections.forEach(section => {
    const sectionData = profile[section.key as keyof UserMemoryProfile];
    if (sectionData && typeof sectionData === 'object') {
      Object.entries(sectionData).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
          // Extract title and content with better parsing
          const title = value.category || formatTitle(key);
          let content = value.details || value.value || value;
          
          // If content is still an object or JSON string, format it properly
          if (typeof content === 'object' || 
              (typeof content === 'string' && 
               ((content.startsWith('{') && content.endsWith('}')) || 
                (content.startsWith('[') && content.endsWith(']'))))) {
            content = formatValue(content);
          }
          
          cards.push({
            id: `${section.key}-${key}`,
            category: section.category,
            title: title,
            content: String(content),
            confidence: value.confidence || 0.7,
            frequency: value.frequency || 'occasional',
            lastUpdated: new Date(profile.updatedAt),
            icon: section.icon,
            source: section.key
          });
        }
      });
    }
  });
  
  return cards.sort((a, b) => b.confidence - a.confidence);
};

const formatTitle = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/([A-Z])/g, ' $1');
};

const formatValue = (value: any): string => {
  // Helper function to parse JSON string and extract meaningful content
  const parseJsonString = (str: string): string => {
    try {
      const parsed = JSON.parse(str);
      return formatParsedObject(parsed);
    } catch {
      // If it's not valid JSON, return as is
      return str;
    }
  };

  // Helper function to format parsed objects into readable text
  const formatParsedObject = (obj: any): string => {
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    
    if (Array.isArray(obj)) {
      return obj.map(item => formatParsedObject(item)).join(', ');
    }
    
    if (typeof obj === 'object' && obj !== null) {
      // Extract known meaningful fields first
      if (obj.value !== undefined) return String(obj.value);
      if (obj.details !== undefined) return String(obj.details);
      if (obj.category !== undefined) return String(obj.category);
      if (obj.name !== undefined) return String(obj.name);
      if (obj.title !== undefined) return String(obj.title);
      
      // For location objects
      if (obj.city || obj.state || obj.country) {
        const parts = [];
        if (obj.city) parts.push(obj.city);
        if (obj.state) parts.push(obj.state);
        if (obj.country) parts.push(obj.country);
        return parts.join(', ');
      }
      
      // For company/employer objects
      if (obj.company || obj.currentEmployer) {
        return obj.company || obj.currentEmployer;
      }
      
      // For preference objects
      if (obj.preferredFollowUpDay || obj.preferredMethod) {
        const parts = [];
        if (obj.preferredFollowUpDay) parts.push(`Follow-up: ${obj.preferredFollowUpDay}`);
        if (obj.preferredMethod) parts.push(`Method: ${obj.preferredMethod}`);
        return parts.join(', ');
      }
      
      // For interest/intent objects
      if (obj.interest !== undefined || obj.intent !== undefined) {
        return obj.interest !== undefined ? 
          (obj.interest ? 'Interested' : 'Not interested') :
          (obj.intent ? 'Has intent' : 'No intent');
      }
      
      // Generic key-value formatting for other objects
      const entries = Object.entries(obj).filter(([key, val]) => 
        val !== null && val !== undefined && val !== '' && key !== 'confidence'
      );
      
      if (entries.length === 0) return 'No details available';
      
      if (entries.length === 1) {
        const [, val] = entries[0];
        return typeof val === 'object' ? formatParsedObject(val) : String(val);
      }
      
      // Multiple key-value pairs - format nicely
      return entries.map(([key, val]) => {
        const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        const formattedVal = typeof val === 'object' ? formatParsedObject(val) : String(val);
        return `${formattedKey}: ${formattedVal}`;
      }).join(', ');
    }
    
    return String(obj);
  };

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'object') {
        return formatParsedObject(item);
      }
      if (typeof item === 'string' && (item.startsWith('{') || item.startsWith('['))) {
        return parseJsonString(item);
      }
      return String(item);
    }).join(', ');
  }
  
  // Handle objects
  if (typeof value === 'object' && value !== null) {
    return formatParsedObject(value);
  }
  
  // Handle strings that might be JSON
  if (typeof value === 'string') {
    // Check if it looks like JSON
    if ((value.startsWith('{') && value.endsWith('}')) || 
        (value.startsWith('[') && value.endsWith(']'))) {
      return parseJsonString(value);
    }
    return value;
  }
  
  // Handle primitives
  return String(value);
};

// ==================== MAIN COMPONENT ====================

const angelaBrainDashboard: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserMemoryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMemoryData = async () => {
      setIsLoading(true);
      try {
        const profile = await angelaSweetMemoryAPI.getCurrentUserProfile();
        setUserProfile(profile);
        console.log('🧠 Dashboard - Loaded profile:', profile);
      } catch (error) {
        console.error('Failed to load memory data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMemoryData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Brain className="w-16 h-16 text-gray-400 animate-pulse mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Loading angela's memories...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gathering our friendship data
          </p>
        </div>
      </div>
    );
  }

  // Calculate dynamic values
  const friendshipPoints = calculateFriendshipPoints(userProfile);
  const levelProgress = calculateLevelProgress(friendshipPoints);
  const friendshipLevel = levelProgress.current;
  const nextLevel = levelProgress.next;
  const progressPercent = levelProgress.progressPercent;
  const daysTogether = calculateDaysTogether(userProfile);
  const memoryCount = countTotalMemories(userProfile);
  const memoryCards = getMemoryCards(userProfile);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Clean Header */}
      <div className="p-8 text-center border-b border-gray-200 dark:border-gray-800">
        <div className="inline-flex items-center justify-center gap-4 mb-6">
          <div className="glassmorphic rounded-xl p-3 shadow-lg">
            <Brain className="w-8 h-8 text-gray-700 dark:text-gray-300" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">
              angela's Brain
            </h1>
          </div>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Our friendship journey and shared memories
        </p>
      </div>

      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* Friendship Level Card */}
        <div className="glassmorphic rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">{friendshipLevel.emoji}</div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                Level {friendshipLevel.level}: {friendshipLevel.title}
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md mx-auto">
                {friendshipLevel.description}
              </p>
            </div>
            
            {/* Progress Bar */}
            {nextLevel && (
              <div className="mt-8 space-y-4">
                <div className="flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                  <span>Progress to {nextLevel.title}</span>
                  <span className="text-gray-800 dark:text-gray-200 font-bold">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gray-800 dark:bg-gray-300 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                
                <p className="text-sm text-gray-500 dark:text-gray-400 glassmorphic rounded-lg px-4 py-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{friendshipPoints}</span> points • 
                  Need <span className="font-semibold text-gray-700 dark:text-gray-300">{nextLevel.minPoints - friendshipPoints}</span> more to level up
                </p>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-6 mt-8">
              <div className="glassmorphic rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1">{friendshipPoints}</div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Friendship Points</div>
              </div>
              
              <div className="glassmorphic rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1">{daysTogether}</div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Days Together</div>
              </div>
              
              <div className="glassmorphic rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1">{memoryCount}</div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Memories</div>
              </div>
            </div>
          </div>

          {/* Unlocked Features */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-800 dark:bg-gray-200 flex items-center justify-center text-white dark:text-gray-900 font-bold text-sm">
                ✓
              </div>
              Unlocked Features
            </h3>
            <div className="flex flex-wrap gap-3">
              {friendshipLevel.unlocks.map((unlock, index) => (
                <span
                  key={index}
                  className="px-4 py-2 glassmorphic text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium border border-gray-200 dark:border-gray-700"
                >
                  {unlock}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Memory Cards Section */}
        <div className="glassmorphic rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 mb-8">
            <div className="glassmorphic rounded-xl p-3">
              <Sparkles className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Memory Cards
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {memoryCards.length} memories stored
              </p>
            </div>
          </div>
          
          {memoryCards.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {memoryCards.map((card) => (
                <div 
                  key={card.id}
                  className="glassmorphic rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {card.icon}
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">
                          {card.title}
                        </h4>
                        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium">{card.category}</span>
                          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {Math.round(card.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4 line-clamp-3">
                    {card.content}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{card.frequency}</span>
                    </div>
                    <span>
                      {new Date(card.lastUpdated).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h4 className="text-xl font-bold text-gray-600 dark:text-gray-400 mb-2">
                No memories yet
              </h4>
              <p className="text-gray-500 dark:text-gray-500">
                Start chatting with angela to create some memories!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default angelaBrainDashboard;
