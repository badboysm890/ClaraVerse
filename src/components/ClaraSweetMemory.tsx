/**
 * ClaraSweetMemory.tsx
 * 
 * Sweet Memories Feature for ClaraVerse
 * Automatically extracts and stores user information from conversations
 * when streaming responses are reasonably fast (>10 tokens/second) and requests are reasonable in size.
 * 
 * This component operates independently from the main Clara assistant flow,
 * using OpenAI-compatible structured output for reliable data extraction.
 */

import { useEffect, useRef } from 'react';
import { indexedDBService } from '../services/indexedDB';
import { claraApiService } from '../services/claraApiService';
import { claraProviderService } from '../services/claraProviderService';
import type { ClaraMessage, ClaraAIConfig } from '../types/clara_assistant_types';
import { claraMemoryToastService } from '../services/claraMemoryToastService';

// ==================== MEMORY DATA INTERFACES ====================

export interface CoreIdentityInfo {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  nicknames?: string[];
  preferredName?: string;
  email?: string;
  phone?: string;
  age?: number;
  location?: string;
  occupation?: string;
  relationshipStatus?: string;
}

export interface PersonalCharacteristics {
  personalityTraits?: string[];
  communicationStyle?: 'formal' | 'informal' | 'casual' | 'professional';
  humorType?: string[];
  interests?: string[];
  hobbies?: string[];
  values?: string[];
  beliefs?: string[];
  goals?: {
    shortTerm?: string[];
    longTerm?: string[];
  };
}

export interface PreferencesAndBehavior {
  communicationPreferences?: {
    responseStyle?: 'detailed' | 'concise' | 'balanced';
    preferredChannels?: string[];
    responseTime?: 'immediate' | 'within_hours' | 'within_day';
  };
  decisionMakingStyle?: 'analytical' | 'intuitive' | 'collaborative' | 'independent';
  workStyle?: {
    environment?: 'remote' | 'office' | 'hybrid';
    meetingPreferences?: string[];
    productivityPatterns?: string[];
  };
  lifestylePreferences?: {
    diet?: string[];
    exercise?: string[];
    travel?: string[];
    entertainment?: string[];
  };
}

export interface RelationshipContext {
  relationshipType?: 'friend' | 'colleague' | 'family' | 'client' | 'acquaintance';
  relationshipHistory?: string[];
  connectionStrength?: 'close' | 'moderate' | 'distant';
  mutualConnections?: string[];
  sharedExperiences?: string[];
}

export interface InteractionHistory {
  conversationTopics?: string[];
  expertiseAreas?: string[];
  frequentQuestions?: string[];
  emotionalContext?: string[];
  supportNeeds?: string[];
}

export interface ContextualInfo {
  currentLifeSituation?: string[];
  availabilityPatterns?: string[];
  professionalContext?: {
    role?: string;
    company?: string;
    industry?: string;
    responsibilities?: string[];
  };
  lifeStage?: 'student' | 'early_career' | 'established' | 'retired' | 'transitioning';
}

export interface EmotionalAndSocialIntel {
  emotionalPatterns?: string[];
  stressTriggers?: string[];
  supportSystems?: string[];
  socialDynamics?: string[];
  boundaries?: string[];
}

export interface PracticalInfo {
  importantDates?: {
    birthday?: string;
    anniversaries?: string[];
    milestones?: string[];
  };
  dependencies?: string[];
  skills?: string[];
  resources?: string[];
  timeZone?: string;
}

export interface MemoryMetadata {
  confidenceLevel: number; // 0-1, how confident we are about this information
  source: 'direct_conversation' | 'observation' | 'inference';
  extractedAt: string; // ISO timestamp
  lastUpdated: string; // ISO timestamp
  relevanceScore: number; // 0-1, how important this information is
  sessionId?: string;
  messageId?: string;
}

export interface UserMemoryProfile {
  id: string;
  userId: string; // email or unique identifier
  coreIdentity: CoreIdentityInfo;
  personalCharacteristics: PersonalCharacteristics;
  preferences: PreferencesAndBehavior;
  relationship: RelationshipContext;
  interactions: InteractionHistory;
  context: ContextualInfo;
  emotional: EmotionalAndSocialIntel;
  practical: PracticalInfo;
  metadata: MemoryMetadata;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== EXTRACTION INTERFACES ====================

interface MemoryExtractionResponse {
  hasMemoryData: boolean;
  extractedMemory?: Partial<UserMemoryProfile>;
  confidence: number;
  reasoning?: string;
}

// ==================== CONSTANTS ====================

const TOKEN_SPEED_THRESHOLD = 10; // tokens per second
const MAX_REQUEST_SIZE = 2000; // characters - avoid processing large requests
const MIN_CONFIDENCE_THRESHOLD = 0.3;
const EXTRACTION_TIMEOUT = 30000; // 30 seconds max for memory extraction (increased from 10s)
const RATE_LIMIT_INTERVAL = 2000; // 2 seconds between extractions (reduced from 60 seconds)

// ==================== MEMORY EXTRACTION PROMPT ====================

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction AI that analyzes conversations to extract personal information about users.

Your task is to analyze a user's message and conversation context to extract meaningful personal information that would be helpful for future interactions.

EXTRACTION RULES:
1. Only extract information explicitly mentioned or clearly implied by the user
2. Do not make wild assumptions or inferences beyond reasonable confidence
3. Focus on stable, long-term information rather than temporary states
4. Assign confidence levels based on how explicitly the information was stated
5. Categorize information appropriately into the provided schema
6. If no meaningful memory data is found, return hasMemoryData: false

CONFIDENCE LEVELS:
- 0.9-1.0: Explicitly stated facts ("My name is John", "I work at Google")
- 0.7-0.9: Strong implications ("I'm heading to my office" implies employed)
- 0.5-0.7: Reasonable inferences ("I love hiking" suggests outdoor interests)
- 0.3-0.5: Weak inferences (uncertain implications)
- 0.0-0.3: Speculation (should generally be avoided)

FOCUS AREAS:
- Personal identity (name, location, occupation)
- Interests and hobbies
- Communication preferences
- Work and life context
- Relationships and social connections
- Values and beliefs
- Goals and aspirations

Respond with a structured JSON object following the MemoryExtractionResponse interface.`;

// ==================== MAIN COMPONENT ====================`;

// ==================== MEMORY EXTRACTION SCHEMA ====================

const MEMORY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    hasMemoryData: {
      type: "boolean",
      description: "Whether any meaningful memory data was extracted"
    },
    extractedMemory: {
      type: "object",
      description: "Extracted memory information",
      properties: {
        coreIdentity: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            nicknames: { type: "array", items: { type: "string" } },
            preferredName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            age: { type: "number" },
            location: { type: "string" },
            occupation: { type: "string" },
            relationshipStatus: { type: "string" }
          }
        },
        personalCharacteristics: {
          type: "object",
          properties: {
            personalityTraits: { type: "array", items: { type: "string" } },
            communicationStyle: { 
              type: "string", 
              enum: ["formal", "informal", "casual", "professional"] 
            },
            humorType: { type: "array", items: { type: "string" } },
            interests: { type: "array", items: { type: "string" } },
            hobbies: { type: "array", items: { type: "string" } },
            values: { type: "array", items: { type: "string" } },
            beliefs: { type: "array", items: { type: "string" } },
            goals: {
              type: "object",
              properties: {
                shortTerm: { type: "array", items: { type: "string" } },
                longTerm: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        preferences: {
          type: "object",
          properties: {
            communicationPreferences: {
              type: "object",
              properties: {
                responseStyle: { 
                  type: "string", 
                  enum: ["detailed", "concise", "balanced"] 
                },
                preferredChannels: { type: "array", items: { type: "string" } },
                responseTime: { 
                  type: "string", 
                  enum: ["immediate", "within_hours", "within_day"] 
                }
              }
            },
            decisionMakingStyle: { 
              type: "string", 
              enum: ["analytical", "intuitive", "collaborative", "independent"] 
            },
            workStyle: {
              type: "object",
              properties: {
                environment: { 
                  type: "string", 
                  enum: ["remote", "office", "hybrid"] 
                },
                meetingPreferences: { type: "array", items: { type: "string" } },
                productivityPatterns: { type: "array", items: { type: "string" } }
              }
            },
            lifestylePreferences: {
              type: "object",
              properties: {
                diet: { type: "array", items: { type: "string" } },
                exercise: { type: "array", items: { type: "string" } },
                travel: { type: "array", items: { type: "string" } },
                entertainment: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        interactions: {
          type: "object",
          properties: {
            conversationTopics: { type: "array", items: { type: "string" } },
            expertiseAreas: { type: "array", items: { type: "string" } },
            frequentQuestions: { type: "array", items: { type: "string" } },
            emotionalContext: { type: "array", items: { type: "string" } },
            supportNeeds: { type: "array", items: { type: "string" } }
          }
        },
        context: {
          type: "object",
          properties: {
            currentLifeSituation: { type: "array", items: { type: "string" } },
            availabilityPatterns: { type: "array", items: { type: "string" } },
            professionalContext: {
              type: "object",
              properties: {
                role: { type: "string" },
                company: { type: "string" },
                industry: { type: "string" },
                responsibilities: { type: "array", items: { type: "string" } }
              }
            },
            lifeStage: { 
              type: "string", 
              enum: ["student", "early_career", "established", "retired", "transitioning"] 
            }
          }
        },
        practical: {
          type: "object",
          properties: {
            importantDates: {
              type: "object",
              properties: {
                birthday: { type: "string" },
                anniversaries: { type: "array", items: { type: "string" } },
                milestones: { type: "array", items: { type: "string" } }
              }
            },
            skills: { type: "array", items: { type: "string" } },
            resources: { type: "array", items: { type: "string" } },
            timeZone: { type: "string" }
          }
        }
      }
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Overall confidence level of the extraction"
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of what was extracted and why"
    }
  },
  required: ["hasMemoryData", "confidence"]
};
// ==================== MAIN COMPONENT ====================

interface ClaraSweetMemoryProps {
  isEnabled?: boolean;
  onMemoryExtracted?: (profile: UserMemoryProfile) => void;
  onError?: (error: string) => void;
}

const ClaraSweetMemory: React.FC<ClaraSweetMemoryProps> = ({
  isEnabled = true,
  onMemoryExtracted,
  onError
}) => {
  const processingRef = useRef<Set<string>>(new Set());
  const lastProcessedRef = useRef<number>(0);

  // ==================== CORE FUNCTIONALITY ====================

  /**
   * Initialize the memory store in IndexedDB (using settings store)
   */
  const initializeMemoryStore = async (): Promise<void> => {
    try {
      // Check if settings store exists - memory uses settings store with prefixed keys
      await indexedDBService.getAll('settings');
    } catch (error) {
      console.log('🧠 Memory store will be created on first use');
    }
  };

  /**
   * Check if we should process this interaction for memory extraction
   */
  const shouldProcessMemory = (
    userMessage: string,
    assistantMessage: ClaraMessage,
    tokenSpeed: number
  ): boolean => {
    // Check if feature is enabled
    if (!isEnabled) {
      console.log('🧠 DEBUG: Feature disabled');
      return false;
    }

    // Check token speed threshold
    if (tokenSpeed < TOKEN_SPEED_THRESHOLD) {
      console.log(`🧠 DEBUG: Token speed ${tokenSpeed.toFixed(1)} tk/s below threshold ${TOKEN_SPEED_THRESHOLD}`);
      return false;
    }

    // Check request size to avoid processing large requests (might contain others' data)
    if (userMessage.length > MAX_REQUEST_SIZE) {
      console.log(`🧠 DEBUG: Request too large (${userMessage.length} chars), skipping memory extraction`);
      return false;
    }

    // Check if we're already processing this message
    const messageId = assistantMessage.id;
    if (processingRef.current.has(messageId)) {
      console.log('🧠 DEBUG: Already processing this message:', messageId);
      return false;
    }

    // Rate limiting - reduced to allow more frequent memory extraction in conversations
    const now = Date.now();
    if (now - lastProcessedRef.current < RATE_LIMIT_INTERVAL) {
      console.log(`🧠 DEBUG: Rate limiting memory extraction (last processed: ${lastProcessedRef.current}, now: ${now}, interval: ${RATE_LIMIT_INTERVAL}ms)`);
      return false;
    }

    console.log('🧠 DEBUG: All checks passed - should process memory');
    return true;
  };

  /**
   * Fuzzy string matching for key names with tolerance for typos/variations
   */
  const fuzzyKeyMatch = (target: string, candidates: string[], threshold: number = 0.05): string | null => {
    const calculateSimilarity = (str1: string, str2: string): number => {
      const longer = str1.length > str2.length ? str1 : str2;
      const shorter = str1.length > str2.length ? str2 : str1;
      
      if (longer.length === 0) return 1.0;
      
      const editDistance = (s1: string, s2: string): number => {
        const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
        
        for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= s2.length; j++) {
          for (let i = 1; i <= s1.length; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
              matrix[j][i - 1] + 1,
              matrix[j - 1][i] + 1,
              matrix[j - 1][i - 1] + cost
            );
          }
        }
        
        return matrix[s2.length][s1.length];
      };
      
      return (longer.length - editDistance(shorter, longer)) / longer.length;
    };

    let bestMatch = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const similarity = calculateSimilarity(target.toLowerCase(), candidate.toLowerCase());
      if (similarity >= (1 - threshold) && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = candidate;
      }
    }
    
    return bestMatch;
  };

  /**
   * Extract and normalize JSON response with fuzzy key matching for common variations
   */
  const extractJSONFromResponse = (response: any): MemoryExtractionResponse | null => {
    console.log('🧠 DEBUG: extractJSONFromResponse called with:', typeof response, response);
    
    let parsedData: any = null;
    
    // Step 1: Extract raw JSON from various response formats
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      // Check if it's wrapped in a response object
      if (response.content) {
        parsedData = extractJSONFromResponse(response.content);
        if (parsedData) return parsedData;
      }
      if (response.message) {
        parsedData = extractJSONFromResponse(response.message);
        if (parsedData) return parsedData;
      }
      // Use the object directly
      parsedData = response;
    } else if (typeof response === 'string') {
      console.log('🧠 DEBUG: Attempting to extract JSON from string response');
      
      // First, try direct JSON parse
      try {
        parsedData = JSON.parse(response);
        console.log('🧠 DEBUG: Direct JSON parse successful');
      } catch (e) {
        console.log('🧠 DEBUG: Direct JSON parse failed, trying extraction methods');
        
        // Look for JSON blocks in markdown
        const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
          try {
            parsedData = JSON.parse(jsonBlockMatch[1]);
            console.log('🧠 DEBUG: JSON block extraction successful');
          } catch (e) {
            console.log('🧠 DEBUG: JSON block parse failed');
          }
        }
        
        // Look for JSON objects in the text
        if (!parsedData) {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedData = JSON.parse(jsonMatch[0]);
              console.log('🧠 DEBUG: JSON object extraction successful');
            } catch (e) {
              console.log('🧠 DEBUG: JSON object parse failed');
            }
          }
        }
        
        // If the model returned conversational text instead of JSON, reject it
        if (!parsedData && (response.toLowerCase().includes('i apologize') || 
            response.toLowerCase().includes('i cannot') ||
            response.toLowerCase().includes('unable to generate'))) {
          console.error('🧠 ERROR: Model returned conversational text instead of JSON:', response);
          throw new Error('Model does not support structured output - returned conversational text');
        }
      }
    }
    
    if (!parsedData || typeof parsedData !== 'object') {
      console.error('🧠 ERROR: Could not extract valid JSON from response');
      return null;
    }
    
    console.log('🧠 DEBUG: Extracted raw JSON data:', parsedData);
    
    // Step 2: Transform AI output to canonical structure with flexible field mapping
    const transformToCanonicalStructure = (data: any): any => {
      const transformed: any = {};
      
      console.log('🧠 DEBUG: Transforming data with keys:', Object.keys(data));
      
      // 🔧 CRITICAL FIX: Handle extractedInformation array format first
      if (data.extractedInformation && Array.isArray(data.extractedInformation)) {
        console.log('🧠 DEBUG: Processing extractedInformation array with', data.extractedInformation.length, 'items');
        
        // Process each extracted information item
        data.extractedInformation.forEach((item: any, index: number) => {
          console.log(`🧠 DEBUG: Processing item ${index}:`, item);
          
          if (item.category && item.data) {
            // Map categories to our canonical structure
            const category = item.category.toLowerCase();
            let targetSection = 'personalCharacteristics'; // Default section
            
            if (category.includes('interest') || category.includes('hobby') || category.includes('like')) {
              targetSection = 'personalCharacteristics';
              if (!transformed[targetSection]) transformed[targetSection] = {};
              if (!transformed[targetSection].interests) transformed[targetSection].interests = [];
              transformed[targetSection].interests.push(item.data);
              console.log(`🧠 MAPPED: "${item.data}" → ${targetSection}.interests`);
            } else if (category.includes('preference') || category.includes('favorite')) {
              targetSection = 'preferences';
              if (!transformed[targetSection]) transformed[targetSection] = {};
              transformed[targetSection][category] = item.data;
              console.log(`🧠 MAPPED: "${item.data}" → ${targetSection}.${category}`);
            } else if (category.includes('identity') || category.includes('personal')) {
              targetSection = 'coreIdentity';
              if (!transformed[targetSection]) transformed[targetSection] = {};
              transformed[targetSection][category] = item.data;
              console.log(`🧠 MAPPED: "${item.data}" → ${targetSection}.${category}`);
            } else {
              // Default to personalCharacteristics for other categories
              if (!transformed[targetSection]) transformed[targetSection] = {};
              transformed[targetSection][category] = item.data;
              console.log(`🧠 MAPPED: "${item.data}" → ${targetSection}.${category} (default)`);
            }
          }
        });
        
        console.log('🧠 DEBUG: After processing extractedInformation array:', transformed);
      }
      
      // Map AI structure variations to our canonical structure
      const mappings = {
        // AI Output → Our Structure
        'personalIdentity': 'coreIdentity',
        'personalInfo': 'coreIdentity', 
        'identity': 'coreIdentity',
        'basic': 'coreIdentity',
        
        'characteristics': 'personalCharacteristics',
        'personality': 'personalCharacteristics',
        'traits': 'personalCharacteristics',
        'interestsAndHobbies': 'personalCharacteristics',
        'interests': 'personalCharacteristics', // Map interests to personalCharacteristics
        
        'preferences': 'preferences',
        'likes': 'preferences',
        'favorites': 'preferences',
        
        'relationships': 'relationship',
        'family': 'relationship',
        'social': 'relationship',
        
        'interactions': 'interactions',
        'communication': 'interactions',
        
        'context': 'context',
        'background': 'context',
        'situation': 'context',
        'workContext': 'practical', // Map work context to practical info
        
        'emotional': 'emotional',
        'emotions': 'emotional',
        'feelings': 'emotional',
        
        'practical': 'practical',
        'logistics': 'practical',
        'details': 'practical',
        'technology': 'practical' // Map technology info to practical
      };
      
      // Transform each section with flexible field handling
      for (const [aiKey, canonicalKey] of Object.entries(mappings)) {
        if (data[aiKey]) {
          console.log(`🧠 TRANSFORM: ${aiKey} → ${canonicalKey}:`, data[aiKey]);
          if (!transformed[canonicalKey]) {
            transformed[canonicalKey] = {};
          }
          
          // Smart merging: Handle different data structures
          const aiData = data[aiKey];
          
          if (aiKey === 'interests' && typeof aiData === 'object') {
            // Map interests to personalCharacteristics.interests
            if (!transformed[canonicalKey].interests) {
              transformed[canonicalKey].interests = [];
            }
            
            // Handle various interest formats
            if (Array.isArray(aiData)) {
              transformed[canonicalKey].interests.push(...aiData);
            } else if (typeof aiData === 'object') {
              // Extract interest categories
              Object.keys(aiData).forEach(category => {
                transformed[canonicalKey].interests.push(category);
                if (Array.isArray(aiData[category])) {
                  aiData[category].forEach((item: any) => {
                    if (typeof item === 'string') {
                      transformed[canonicalKey].interests.push(item);
                    } else if (item.category) {
                      transformed[canonicalKey].interests.push(item.category);
                    }
                  });
                }
              });
            }
          } else if (aiKey === 'workContext' || aiKey === 'technology') {
            // Map to practical info with specific fields
            Object.keys(aiData).forEach(subKey => {
              const fieldName = `${aiKey}_${subKey}`; // e.g., "workContext_hardware"
              transformed[canonicalKey][fieldName] = aiData[subKey];
            });
          } else if (aiKey === 'personalIdentity') {
            // Handle devices and other personal info
            Object.keys(aiData).forEach(subKey => {
              if (subKey === 'devices') {
                transformed[canonicalKey]['personalDevices'] = aiData[subKey];
              } else {
                transformed[canonicalKey][subKey] = aiData[subKey];
              }
            });
          } else {
            // Standard merge for other fields
            transformed[canonicalKey] = { ...transformed[canonicalKey], ...aiData };
          }
        }
      }
      
      // Also include any data that already matches our canonical structure
      const canonicalKeys = ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'];
      for (const key of canonicalKeys) {
        if (data[key]) {
          console.log(`🧠 CANONICAL: Using existing ${key}:`, data[key]);
          transformed[key] = { ...transformed[key], ...data[key] };
        }
      }
      
      console.log('🧠 DEBUG: Transformed canonical structure:', transformed);
      return transformed;
    };
    
    // NEW: Recursively flatten objects of the form { value, confidence } -> value
    const flattenValueConfidence = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => flattenValueConfidence(item));
      }
      if (obj && typeof obj === 'object') {
        // If this object looks like { value: X, confidence: Y }, return X
        const keys = Object.keys(obj);
        if (('value' in obj) && ('confidence' in obj) && keys.length <= 2) {
          return flattenValueConfidence(obj.value);
        }
        const result: any = {};
        for (const key of keys) {
          result[key] = flattenValueConfidence(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    // Step 3: Normalize the structure with fuzzy key matching
    const normalizeMemoryData = (data: any): MemoryExtractionResponse => {
      const keys = Object.keys(data);
      console.log('🧠 DEBUG: Available keys for fuzzy matching:', keys);
      
      // Find hasMemoryData or similar
      const hasMemoryDataKey = fuzzyKeyMatch('hasMemoryData', keys) || 'hasMemoryData';
      const providedHasMemoryData = data[hasMemoryDataKey];
      
      // Determine extracted memory payload
      const canonicalKeys = ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'];
      const hasCanonicalTopLevel = canonicalKeys.some(k => k in data);
      
      // Prefer explicit extractedMemory if present, otherwise use top-level canonical sections
      const memoryDataVariations = ['extractedMemory', 'memoryData', 'memory', 'userData', 'userInfo', 'data'];
      const memoryDataKey = keys.find(k => fuzzyKeyMatch('extractedMemory', [k]) || memoryDataVariations.some(variation => fuzzyKeyMatch(variation, [k], 0.1)))
        || (hasCanonicalTopLevel ? '__top_level__' : 'extractedMemory');
      
      console.log('🧠 DEBUG: Using memory data key:', memoryDataKey, 'from available keys:', keys);
      
      let rawExtractedMemory: any = {};
      if (memoryDataKey === '__top_level__') {
        // Build object from canonical sections present at top level
        rawExtractedMemory = {};
        for (const key of canonicalKeys) {
          if (key in data) rawExtractedMemory[key] = data[key];
        }
      } else {
        rawExtractedMemory = data[memoryDataKey] || {};
      }
      
      // Transform AI structure to canonical structure
      let extractedMemory = transformToCanonicalStructure(rawExtractedMemory);
      
      // Flatten { value, confidence } pairs to raw values
      extractedMemory = flattenValueConfidence(extractedMemory);
      
      // Determine confidence
      const confidenceKey = fuzzyKeyMatch('confidence', keys) || 'confidence';
      let confidence = data[confidenceKey];
      if (confidence === undefined && data.metadata && typeof data.metadata.confidenceLevel === 'number') {
        confidence = data.metadata.confidenceLevel;
      }
      if (typeof confidence !== 'number') {
        confidence = 0.5;
      }
      
      // Reasoning if any
      const reasoningKey = fuzzyKeyMatch('reasoning', keys) || 'reasoning';
      const reasoning = data[reasoningKey];
      
      // Compute hasMemoryData: require actual data; respect explicit false
      const hasData = Object.values(extractedMemory || {}).some(section => section && typeof section === 'object' && Object.keys(section).length > 0);
      const hasMemoryData = hasData && providedHasMemoryData !== false;
      
      const result: MemoryExtractionResponse = {
        hasMemoryData,
        extractedMemory,
        confidence,
        reasoning
      };
      
      console.log('🧠 DEBUG: Normalized memory extraction response:', result);
      return result;
    };
    
    return normalizeMemoryData(parsedData);
  };

  /**
   * Extract memory data using structured output with retry logic
   */
  const extractMemoryData = async (
    userMessage: string,
    conversationContext: string[],
    currentUserInfo?: Partial<UserMemoryProfile>,
    aiConfig?: ClaraAIConfig,
    retryAttempt = 0
  ): Promise<MemoryExtractionResponse | null> => {
    const maxRetries = 2; // Maximum number of retry attempts
    const baseDelay = 2000; // Base delay for exponential backoff
    
    try {
      // Format extraction prompt
      const extractionPrompt = `Please analyze this conversation and extract any personal information about the user.

USER MESSAGE: "${userMessage}"

CONVERSATION CONTEXT: ${conversationContext.length > 0 ? conversationContext.join('\n') : 'No previous context'}

CURRENT USER INFO: ${currentUserInfo ? JSON.stringify(currentUserInfo, null, 2) : 'No existing profile'}

Extract and categorize any personal information according to the provided schema. Focus on information that would be helpful for future conversations.`;

      // Get current AI configuration dynamically
      const currentAIConfig = aiConfig;
      if (!currentAIConfig) {
        console.warn('⚠️ No AI configuration available for memory extraction');
        return null;
      }

      // Create structured output config based on current provider/model
      const extractionConfig: ClaraAIConfig = {
        provider: currentAIConfig.provider,
        models: {
          text: currentAIConfig.models.text || 'Qwen3-0.6B-Q8_0.gguf',
          vision: currentAIConfig.models.vision || 'Qwen3-0.6B-Q8_0.gguf'
        },
        parameters: {
          temperature: 0.1, // Low temperature for consistent extraction
          maxTokens: 4000,
          topP: 1.0,
          topK: 40,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          repetitionPenalty: 1.0,
          minP: 0.0,
          typicalP: 1.0,
          seed: null,
          stop: []
        },
        features: {
          enableTools: false,
          enableRAG: false,
          enableStreaming: false, // Disable streaming for structured output
          enableVision: false,
          autoModelSelection: false,
          enableMCP: false,
          enableStructuredToolCalling: true, // Force structured output ALWAYS
          enableNativeJSONSchema: true // Force native JSON schema ALWAYS
        },
        autonomousAgent: {
          enabled: false,
          maxRetries: 1,
          retryDelay: 1000,
          enableSelfCorrection: false,
          enableToolGuidance: false,
          enableProgressTracking: false,
          maxToolCalls: 1,
          confidenceThreshold: 0.7,
          enableChainOfThought: false,
          enableErrorLearning: false
        }
      };

      // Send extraction request with timeout using structured output
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Memory extraction timeout after ${EXTRACTION_TIMEOUT/1000} seconds - this may indicate the model is taking too long to process the request or the server is overloaded`)), EXTRACTION_TIMEOUT)
      );

      // Get the appropriate client for structured output
      const provider = claraProviderService.getCurrentProvider();
      const client = claraProviderService.getCurrentClient();
      
      if (!client || !provider) {
        throw new Error('No provider/client available for memory extraction');
      }

      // Prepare messages for structured output
      const messages = [
        { role: 'system' as const, content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user' as const, content: extractionPrompt }
      ];

      // Use structured output - FORCE native structured calling for ALL providers
      let extractionPromise: Promise<any>;
      
      console.log('🧠 DEBUG: FORCING native structured output for memory extraction:');
      console.log('  - Provider type:', provider.type);
      console.log('  - Model:', currentAIConfig.models.text);
      console.log('  - enableStructuredToolCalling:', extractionConfig.features.enableStructuredToolCalling);
      console.log('  - enableNativeJSONSchema:', extractionConfig.features.enableNativeJSONSchema);
      
      if (provider.type === 'ollama' && 'sendStructuredChat' in client) {
        // Use Ollama's structured output
        console.log('🧠 Using Ollama sendStructuredChat method');
        extractionPromise = (client as any).sendStructuredChat(
          currentAIConfig.models.text,
          messages,
          MEMORY_EXTRACTION_SCHEMA,
          { temperature: 0.1, max_tokens: 1000 }
        );
      } else if ((provider.type === 'openai' || provider.type === 'openrouter') && 'sendChatWithStructuredOutput' in client) {
        // Use OpenAI/OpenRouter structured output
        console.log('🧠 Using OpenAI/OpenRouter sendChatWithStructuredOutput method');
        extractionPromise = (client as any).sendChatWithStructuredOutput(
          currentAIConfig.models.text,
          messages,
          {
            temperature: 0.1,
            max_tokens: 1000,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "memory_extraction",
                schema: MEMORY_EXTRACTION_SCHEMA
              }
            }
          }
        );
      } else {
        // If no structured output available, use Clara API with forced structured config
        console.log('🧠 Using Clara API with FORCED structured output configuration');
        console.log('🧠 WARNING: Provider may not support true structured output - forcing via config');
        
        // Use Clara API service which should respect the structured output config
        extractionPromise = claraApiService.sendChatMessage(
          extractionPrompt,
          extractionConfig, // This has structured output enabled
          [], // No attachments
          MEMORY_EXTRACTION_SYSTEM_PROMPT,
          [] // No conversation history for extraction
        );
      }

      console.log('🧠 DEBUG: About to make API call with selected method');
      const result = await Promise.race([extractionPromise, timeoutPromise]);
      console.log('🧠 DEBUG: API call completed, processing response...');

      // Use the robust JSON extraction function
      const extractionResult = extractJSONFromResponse(result);
      
      if (!extractionResult) {
        console.error('🧠 ERROR: Failed to extract valid memory data from response');
        return null;
      }
      
      // 🔍 DEBUG: Log extracted memory data
      console.log('🧠 DEBUG: Raw API response:', result.content || result);
      console.log('🧠 DEBUG: Parsed extraction result:', {
        hasMemoryData: extractionResult.hasMemoryData,
        confidence: extractionResult.confidence,
        reasoning: extractionResult.reasoning,
        extractedMemory: extractionResult.extractedMemory
      });
      
      if (extractionResult.hasMemoryData && extractionResult.extractedMemory) {
        console.log('🧠 DEBUG: Extracted memory sections:');
        if (extractionResult.extractedMemory.coreIdentity) {
          console.log('  - Core Identity:', extractionResult.extractedMemory.coreIdentity);
        }
        if (extractionResult.extractedMemory.personalCharacteristics) {
          console.log('  - Personal Characteristics:', extractionResult.extractedMemory.personalCharacteristics);
        }
        if (extractionResult.extractedMemory.preferences) {
          console.log('  - Preferences:', extractionResult.extractedMemory.preferences);
        }
        if (extractionResult.extractedMemory.interactions) {
          console.log('  - Interactions:', extractionResult.extractedMemory.interactions);
        }
        if (extractionResult.extractedMemory.context) {
          console.log('  - Context:', extractionResult.extractedMemory.context);
        }
        if (extractionResult.extractedMemory.practical) {
          console.log('  - Practical Info:', extractionResult.extractedMemory.practical);
        }
      }
      
      return extractionResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🧠 Memory extraction failed:', errorMessage);
      
      // Retry logic for timeouts and temporary failures
      if (retryAttempt < maxRetries && (
        errorMessage.includes('timeout') ||
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('overloaded')
      )) {
        const delay = baseDelay * Math.pow(2, retryAttempt); // Exponential backoff
        console.log(`🧠 Retrying memory extraction in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries + 1})...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return extractMemoryData(userMessage, conversationContext, currentUserInfo, aiConfig, retryAttempt + 1);
      }
      
      return null;
    }
  };

  /**
   * Get existing user memory profile from settings store
   */
  const getUserMemoryProfile = async (userId: string): Promise<UserMemoryProfile | null> => {
    try {
      const key = `clara_user_memory_${userId}`;
      
      // 🔍 DEBUG: Log retrieval attempt
      console.log('🧠 DEBUG: Attempting to retrieve memory profile:');
      console.log('  - Storage key:', key);
      console.log('  - User ID:', userId);
      
      const result = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', key);
      
      if (result?.value) {
        console.log('🧠 DEBUG: ✅ FOUND existing memory profile:');
        console.log('  - Profile ID:', result.value.id);
        console.log('  - Profile version:', result.value.version);
        console.log('  - Created at:', result.value.createdAt);
        console.log('  - Last updated:', result.value.updatedAt);
        console.log('  - Confidence level:', result.value.metadata.confidenceLevel);
        console.log('  - Core identity data:', Object.keys(result.value.coreIdentity).length > 0 ? result.value.coreIdentity : 'empty');
        console.log('  - Personal characteristics:', Object.keys(result.value.personalCharacteristics).length > 0 ? result.value.personalCharacteristics : 'empty');
        console.log('  - Preferences data:', Object.keys(result.value.preferences).length > 0 ? result.value.preferences : 'empty');
        console.log('  - Full profile:', JSON.stringify(result.value, null, 2));
        return result.value;
      } else {
        console.log('🧠 DEBUG: ❌ NO existing memory profile found for user:', userId);
        
        // 🔍 DEBUG: List all memory keys to see what's actually stored
        try {
          const allSettings = await indexedDBService.getAll<{ key: string; value: any }>('settings');
          const memoryKeys = allSettings
            .filter(item => item.key.startsWith('clara_user_memory_'))
            .map(item => item.key);
          console.log('🧠 DEBUG: All memory keys in storage:', memoryKeys);
          if (memoryKeys.length === 0) {
            console.log('🧠 DEBUG: No memory profiles exist in storage yet');
          }
        } catch (listError) {
          console.error('🧠 DEBUG: Failed to list existing memory keys:', listError);
        }
        
        return null;
      }
    } catch (error) {
      console.error('🧠 ❌ FAILED to get user memory profile:', error);
      return null;
    }
  };

  /**
   * Merge new memory data with existing profile
   */
  const mergeMemoryData = (
    existing: UserMemoryProfile | null,
    extracted: Partial<UserMemoryProfile>,
    confidence: number
  ): UserMemoryProfile => {
    const now = new Date().toISOString();
    // 🔍 FIX: Always use 'current_user' as the consistent user ID for single-user app
    const userId = 'current_user';

    const baseProfile: UserMemoryProfile = existing || {
      id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      coreIdentity: {},
      personalCharacteristics: {},
      preferences: {},
      relationship: {},
      interactions: {},
      context: {},
      emotional: {},
      practical: {},
      metadata: {
        confidenceLevel: confidence,
        source: 'direct_conversation',
        extractedAt: now,
        lastUpdated: now,
        relevanceScore: 0.8
      },
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    // Deep merge function for arrays and objects with smart limits
    const deepMerge = (target: any, source: any, path: string = ''): any => {
      if (!source) return target;
      if (!target) return source;

      // 🔧 SMART ARRAY MERGING: Handle arrays with size limits and deduplication
      if (Array.isArray(source)) {
        const targetArray = Array.isArray(target) ? target : [];
        
        // Define limits for different array types
        const arrayLimits: { [key: string]: number } = {
          'hobbies': 10,
          'interests': 10,
          'favorites': 8,
          'skills': 15,
          'friends': 20,
          'family': 15,
          'goals': 12,
          'recentEvents': 20,
          'significantEvents': 15,
          'topics': 25,
          'projects': 10
        };
        
        // Get limit based on path context
        const contextKey = path.toLowerCase();
        const limit = Object.keys(arrayLimits).find(key => contextKey.includes(key));
        const maxItems = limit ? arrayLimits[limit] : 20; // Default limit
        
        console.log(`🧠 MERGE: Array at '${path}' - existing: ${targetArray.length}, new: ${source.length}, limit: ${maxItems}`);
        
        // Combine and deduplicate
        const combined = [...targetArray];
        const newItemsAdded = [];
        
        for (const newItem of source) {
          // Check if item already exists (case-insensitive for strings)
          const exists = combined.some(existingItem => {
            if (typeof existingItem === 'string' && typeof newItem === 'string') {
              return existingItem.toLowerCase() === newItem.toLowerCase();
            }
            return JSON.stringify(existingItem) === JSON.stringify(newItem);
          });
          
          if (!exists) {
            combined.push(newItem);
            newItemsAdded.push(newItem);
          }
        }
        
        // Apply limit - keep most recent items
        const result = combined.slice(-maxItems);
        console.log(`🧠 MERGE: Array result for '${path}' - final count: ${result.length}, new items added:`, newItemsAdded);
        return result;
      }

      if (typeof source === 'object' && source !== null) {
        const result = { ...target };
        for (const key in source) {
          if (source[key] !== null && source[key] !== undefined) {
            const currentPath = path ? `${path}.${key}` : key;
            result[key] = deepMerge(result[key], source[key], currentPath);
          }
        }
        return result;
      }

      // For primitive values, prefer newer data but preserve important existing data
      if (target && typeof target === 'string' && typeof source === 'string') {
        // If they're different, prefer the new one but log the change
        if (target !== source) {
          console.log(`🧠 MERGE: Updating '${path}' from '${target}' to '${source}'`);
        }
      }

      return source;
    };

    // Merge each section with detailed logging
    console.log('🧠 MERGE: Starting profile merge process...');
    console.log('🧠 MERGE: Existing profile sections:', Object.keys(baseProfile).filter(k => 
      ['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'].includes(k)
    ));
    console.log('🧠 MERGE: New data sections:', Object.keys(extracted || {}));
    
    const mergedProfile: UserMemoryProfile = {
      ...baseProfile,
      coreIdentity: deepMerge(baseProfile.coreIdentity, extracted.coreIdentity, 'coreIdentity'),
      personalCharacteristics: deepMerge(baseProfile.personalCharacteristics, extracted.personalCharacteristics, 'personalCharacteristics'),
      preferences: deepMerge(baseProfile.preferences, extracted.preferences, 'preferences'),
      relationship: deepMerge(baseProfile.relationship, extracted.relationship, 'relationship'),
      interactions: deepMerge(baseProfile.interactions, extracted.interactions, 'interactions'),
      context: deepMerge(baseProfile.context, extracted.context, 'context'),
      emotional: deepMerge(baseProfile.emotional, extracted.emotional, 'emotional'),
      practical: deepMerge(baseProfile.practical, extracted.practical, 'practical'),
      metadata: {
        ...baseProfile.metadata,
        confidenceLevel: Math.max(baseProfile.metadata.confidenceLevel, confidence),
        lastUpdated: now,
        relevanceScore: Math.min(1.0, baseProfile.metadata.relevanceScore + 0.1)
      },
      version: baseProfile.version + 1,
      updatedAt: now
    };

    console.log('🧠 MERGE: Merge completed. Profile version:', baseProfile.version, '→', mergedProfile.version);
    console.log('🧠 MERGE: Final profile sections with data:');
    Object.keys(mergedProfile).forEach(key => {
      if (['coreIdentity', 'personalCharacteristics', 'preferences', 'relationship', 'interactions', 'context', 'emotional', 'practical'].includes(key)) {
        const sectionData = mergedProfile[key as keyof UserMemoryProfile];
        if (sectionData && typeof sectionData === 'object' && Object.keys(sectionData).length > 0) {
          console.log(`  ✓ ${key}:`, Object.keys(sectionData).length, 'fields');
        }
      }
    });

    return mergedProfile;
  };

  /**
   * Save memory profile to IndexedDB settings store
   */
  const saveMemoryProfile = async (profile: UserMemoryProfile): Promise<void> => {
    try {
      const key = `clara_user_memory_${profile.userId}`;
      
      // 🔍 DEBUG: Log what we're about to save
      console.log('🧠 DEBUG: Saving memory profile to IndexedDB:');
      console.log('  - Storage key:', key);
      console.log('  - Profile ID:', profile.id);
      console.log('  - Profile version:', profile.version);
      console.log('  - User ID:', profile.userId);
      console.log('  - Confidence level:', profile.metadata.confidenceLevel);
      console.log('  - Total data sections:', Object.keys(profile).filter(k => 
        ['coreIdentity', 'personalCharacteristics', 'preferences', 'interactions', 'context', 'practical'].includes(k) &&
        profile[k as keyof UserMemoryProfile] && 
        Object.keys(profile[k as keyof UserMemoryProfile] as object).length > 0
      ).length);
      console.log('  - Full profile data:', JSON.stringify(profile, null, 2));
      
      await indexedDBService.put('settings', { key, value: profile });
      
      console.log(`🧠 ✅ SUCCESSFULLY saved memory profile for user: ${profile.userId}`);
      
      // 🔍 DEBUG: Verify the save by immediately reading it back
      try {
        const verification = await indexedDBService.get<{ key: string; value: UserMemoryProfile }>('settings', key);
        if (verification?.value) {
          console.log('🧠 DEBUG: ✅ VERIFICATION: Successfully retrieved saved profile');
          console.log('  - Retrieved profile ID:', verification.value.id);
          console.log('  - Retrieved version:', verification.value.version);
          console.log('  - Retrieved hobbies:', verification.value.personalCharacteristics?.hobbies);
          console.log('  - Data integrity check:', JSON.stringify(verification.value) === JSON.stringify(profile) ? 'PASSED' : 'FAILED');
        } else {
          console.error('🧠 DEBUG: ❌ VERIFICATION FAILED: Could not retrieve saved profile');
        }
      } catch (verifyError) {
        console.error('🧠 DEBUG: ❌ VERIFICATION ERROR:', verifyError);
      }
      
    } catch (error) {
      console.error('🧠 ❌ FAILED to save memory profile:', error);
      throw error;
    }
  };

  /**
   * Main memory processing function
   */
  const processMemory = async (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = [],
    aiConfig?: ClaraAIConfig
  ): Promise<void> => {
    const messageId = assistantMessage.id;

    try {
      console.log('🧠 Starting memory extraction for message:', messageId);

      // Get token speed from message metadata
      const tokenSpeed = assistantMessage.metadata?.timings?.predicted_per_second || 0;

      // 🔍 DEBUG: Log processing decision details BEFORE marking as processing
      console.log('🧠 DEBUG: Processing decision check:');
      console.log('  - Token speed:', tokenSpeed, 'tokens/sec (threshold:', TOKEN_SPEED_THRESHOLD, ')');
      console.log('  - Message length:', userMessage.length, 'chars (max:', MAX_REQUEST_SIZE, ')');
      console.log('  - Feature enabled:', isEnabled);
      console.log('  - Already processing:', processingRef.current.has(messageId));
      console.log('  - Time since last:', Date.now() - lastProcessedRef.current, `ms (min: ${RATE_LIMIT_INTERVAL})`);

      // Check if we should process this interaction BEFORE marking as processing
      if (!shouldProcessMemory(userMessage, assistantMessage, tokenSpeed)) {
        console.log('🧠 DEBUG: Skipping memory extraction - failed shouldProcessMemory check');
        return;
      }

      console.log('🧠 DEBUG: Passed shouldProcessMemory check - proceeding with extraction');

      // NOW mark as processing after validation passes
      processingRef.current.add(messageId);
      lastProcessedRef.current = Date.now();

      // Prepare conversation context (last 3 messages for context)
      const contextMessages = conversationHistory
        .slice(-3)
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content);

      // Get current user profile (using consistent user ID for single-user app)
      const currentUserId = 'current_user';
      let existingProfile = await getUserMemoryProfile(currentUserId);
      
      // 🔍 MIGRATION: Check if there's old data under 'anonymous' and migrate it
      if (!existingProfile) {
        console.log('🧠 DEBUG: No profile found for current_user, checking for legacy anonymous profile...');
        const legacyProfile = await getUserMemoryProfile('anonymous');
        if (legacyProfile) {
          console.log('🧠 DEBUG: Found legacy anonymous profile, migrating to current_user...');
          // Update the user ID and save under new key
          legacyProfile.userId = currentUserId;
          legacyProfile.version += 1;
          legacyProfile.updatedAt = new Date().toISOString();
          legacyProfile.metadata.lastUpdated = new Date().toISOString();
          
          // Save under new key
          await saveMemoryProfile(legacyProfile);
          
          // Delete old anonymous key
          try {
            await indexedDBService.delete('settings', 'clara_user_memory_anonymous');
            console.log('🧠 DEBUG: ✅ Successfully migrated anonymous profile to current_user and deleted old data');
          } catch (deleteError) {
            console.warn('🧠 DEBUG: Could not delete old anonymous profile:', deleteError);
          }
          
          existingProfile = legacyProfile;
        }
      }

      // Extract memory data
      const extractionResult = await extractMemoryData(
        userMessage,
        contextMessages,
        existingProfile || undefined,
        aiConfig
      );

      // 🔍 DEBUG: Log extraction input and result
      console.log('🧠 DEBUG: Memory extraction input:');
      console.log('  - User message length:', userMessage.length);
      console.log('  - User message preview:', userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : ''));
      console.log('  - Context messages count:', contextMessages.length);
      console.log('  - Has existing profile:', !!existingProfile);
      console.log('  - AI provider:', aiConfig?.provider);
      console.log('  - AI model:', aiConfig?.models?.text);

      if (!extractionResult || !extractionResult.hasMemoryData) {
        console.log('🧠 No memory data extracted from conversation', extractionResult);
        return;
      }

      // 🔍 DEBUG: Log extraction success details
      console.log('🧠 DEBUG: Memory extraction successful!');
      console.log('  - Confidence:', extractionResult.confidence);
      console.log('  - Has extracted memory:', !!extractionResult.extractedMemory);
      console.log('  - Reasoning:', extractionResult.reasoning);

      // Check confidence threshold
      if (extractionResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
        console.log(`🧠 Extraction confidence ${extractionResult.confidence} below threshold ${MIN_CONFIDENCE_THRESHOLD}`);
        return;
      }

      // Merge with existing profile
      const mergedProfile = mergeMemoryData(
        existingProfile,
        extractionResult.extractedMemory!,
        extractionResult.confidence
      );

      // 🔍 DEBUG: Log profile merging details
      console.log('🧠 DEBUG: Profile merging details:');
      console.log('  - Existing profile version:', existingProfile?.version || 'none');
      console.log('  - New profile version:', mergedProfile.version);
      console.log('  - Merged sections with data:');
      
      const sectionsWithData = [];
      if (Object.keys(mergedProfile.coreIdentity).length > 0) {
        sectionsWithData.push('coreIdentity');
        console.log('    ✓ Core Identity:', mergedProfile.coreIdentity);
      }
      if (Object.keys(mergedProfile.personalCharacteristics).length > 0) {
        sectionsWithData.push('personalCharacteristics');
        console.log('    ✓ Personal Characteristics:', mergedProfile.personalCharacteristics);
      }
      if (Object.keys(mergedProfile.preferences).length > 0) {
        sectionsWithData.push('preferences');
        console.log('    ✓ Preferences:', mergedProfile.preferences);
      }
      if (Object.keys(mergedProfile.interactions).length > 0) {
        sectionsWithData.push('interactions');
        console.log('    ✓ Interactions:', mergedProfile.interactions);
      }
      if (Object.keys(mergedProfile.context).length > 0) {
        sectionsWithData.push('context');
        console.log('    ✓ Context:', mergedProfile.context);
      }
      if (Object.keys(mergedProfile.practical).length > 0) {
        sectionsWithData.push('practical');
        console.log('    ✓ Practical Info:', mergedProfile.practical);
      }
      
      console.log(`🧠 DEBUG: Total sections with data: ${sectionsWithData.length}`, sectionsWithData);

      // Skip saving if there is no meaningful data to persist
      if (sectionsWithData.length === 0) {
        console.log('🧠 DEBUG: No non-empty memory sections detected. Skipping save to avoid empty profile updates.');
        return;
      }

      // Add session context  
      mergedProfile.metadata.messageId = messageId;

      // Save to IndexedDB
      await saveMemoryProfile(mergedProfile);

      // Notify about successful extraction
      onMemoryExtracted?.(mergedProfile);

      // ✨ NEW: Try to show memory learning toast
      try {
        const toastShown = claraMemoryToastService.showMemoryToast(mergedProfile);
        if (toastShown) {
          console.log('🧠 ✨ Memory toast shown for new learning');
        }
      } catch (toastError) {
        console.warn('🧠 Failed to show memory toast:', toastError);
        // Don't let toast errors affect memory extraction
      }

      console.log('🧠 Memory extraction completed successfully', {
        confidence: extractionResult.confidence,
        reasoning: extractionResult.reasoning,
        profileVersion: mergedProfile.version,
        totalDataSections: sectionsWithData.length,
        extractedSections: sectionsWithData,
        userId: mergedProfile.userId,
        profileId: mergedProfile.id
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🧠 Memory processing failed:', errorMessage);
      onError?.(errorMessage);
    } finally {
      // Remove from processing set
      processingRef.current.delete(messageId);
    }
  };

  // ==================== PUBLIC API ====================

  /**
   * Manually trigger memory extraction (for external use)
   */
  const extractMemoryFromConversation = async (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = []
  ): Promise<UserMemoryProfile | null> => {
    try {
      await processMemory(userMessage, assistantMessage, conversationHistory);
      const userId = 'current_user';
      return await getUserMemoryProfile(userId);
    } catch (error) {
      console.error('🧠 Manual memory extraction failed:', error);
      return null;
    }
  };

  /**
   * Get current user memory profile
   */
  const getCurrentUserProfile = async (): Promise<UserMemoryProfile | null> => {
    const userId = 'current_user';
    console.log('🧠 DEBUG: getCurrentUserProfile called for userId:', userId);
    const profile = await getUserMemoryProfile(userId);
    
    if (profile) {
      console.log('🧠 DEBUG: getCurrentUserProfile - FOUND profile:');
      console.log('  - Profile summary:', {
        id: profile.id,
        version: profile.version,
        userId: profile.userId,
        confidence: profile.metadata.confidenceLevel,
        sectionsWithData: Object.keys(profile).filter(k => 
          ['coreIdentity', 'personalCharacteristics', 'preferences', 'interactions', 'context', 'practical'].includes(k) &&
          profile[k as keyof UserMemoryProfile] && 
          Object.keys(profile[k as keyof UserMemoryProfile] as object).length > 0
        )
      });
    } else {
      console.log('🧠 DEBUG: getCurrentUserProfile - NO profile found');
    }
    
    return profile;
  };

  /**
   * Clear user memory
   */
  const clearUserMemory = async (userId: string = 'current_user'): Promise<void> => {
    try {
      const key = `clara_user_memory_${userId}`;
      await indexedDBService.delete('settings', key);
      console.log(`🧠 Cleared memory for user: ${userId}`);
    } catch (error) {
      console.error('🧠 Failed to clear user memory:', error);
    }
  };

  /**
   * Get memory statistics
   */
  const getMemoryStats = async (): Promise<{
    totalProfiles: number;
    totalMemoryEntries: number;
    averageConfidence: number;
    lastUpdated?: string;
  }> => {
    try {
      console.log('🧠 DEBUG: getMemoryStats called - analyzing all memory data...');
      
      const allSettings = await indexedDBService.getAll<{ key: string; value: any }>('settings');
      console.log('🧠 DEBUG: Total settings entries:', allSettings.length);
      
      const memorySettings = allSettings.filter(item => item.key.startsWith('clara_user_memory_'));
      console.log('🧠 DEBUG: Memory-related settings:', memorySettings.length);
      console.log('🧠 DEBUG: Memory keys found:', memorySettings.map(item => item.key));
      
      const profiles = memorySettings.map(item => item.value as UserMemoryProfile);
      
      // 🔍 DEBUG: Log each profile found
      profiles.forEach((profile, index) => {
        console.log(`🧠 DEBUG: Profile ${index + 1}:`, {
          id: profile.id,
          userId: profile.userId,
          version: profile.version,
          confidence: profile.metadata.confidenceLevel,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          coreIdentityKeys: Object.keys(profile.coreIdentity || {}),
          personalCharacteristicsKeys: Object.keys(profile.personalCharacteristics || {}),
          preferencesKeys: Object.keys(profile.preferences || {}),
          interactionsKeys: Object.keys(profile.interactions || {}),
          contextKeys: Object.keys(profile.context || {}),
          practicalKeys: Object.keys(profile.practical || {}),
          hobbies: profile.personalCharacteristics?.hobbies,
          fullProfile: profile
        });
      });
      
      const totalProfiles = profiles.length;
      const totalMemoryEntries = profiles.reduce((sum, profile) => {
        // Count non-empty memory sections
        const sections = [
          profile.coreIdentity,
          profile.personalCharacteristics,
          profile.preferences,
          profile.relationship,
          profile.interactions,
          profile.context,
          profile.emotional,
          profile.practical
        ];
        return sum + sections.filter(section => 
          section && Object.keys(section).length > 0
        ).length;
      }, 0);

      const averageConfidence = profiles.length > 0
        ? profiles.reduce((sum, p) => sum + (p.metadata.confidenceLevel || 0), 0) / profiles.length
        : 0;

      const lastUpdated = profiles.length > 0
        ? profiles.reduce((latest, p) => 
            new Date(p.metadata.lastUpdated) > new Date(latest) ? p.metadata.lastUpdated : latest
          , profiles[0].metadata.lastUpdated)
        : undefined;

      const stats = {
        totalProfiles,
        totalMemoryEntries,
        averageConfidence,
        lastUpdated
      };
      
      console.log('🧠 DEBUG: Memory statistics summary:', stats);
      
      return stats;
    } catch (error) {
      console.error('🧠 ❌ FAILED to get memory stats:', error);
      return {
        totalProfiles: 0,
        totalMemoryEntries: 0,
        averageConfidence: 0
      };
    }
  };

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    if (isEnabled) {
      initializeMemoryStore().catch(error => {
        console.error('🧠 Failed to initialize memory store:', error);
      });
    }
  }, [isEnabled]);

  // ==================== COMPONENT INTERFACE ====================

  // Expose functions for external use
  (ClaraSweetMemory as any).extractMemoryFromConversation = extractMemoryFromConversation;
  (ClaraSweetMemory as any).getCurrentUserProfile = getCurrentUserProfile;
  (ClaraSweetMemory as any).clearUserMemory = clearUserMemory;
  (ClaraSweetMemory as any).getMemoryStats = getMemoryStats;
  (ClaraSweetMemory as any).processMemory = processMemory;

  // This component doesn't render anything - it's a pure service component
  return null;
};

// ==================== EXPORTS ====================

export default ClaraSweetMemory;

// Export utility functions for external use
export const ClaraSweetMemoryAPI = {
  extractMemoryFromConversation: (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = []
  ) => (ClaraSweetMemory as any).extractMemoryFromConversation?.(userMessage, assistantMessage, conversationHistory),
  
  getCurrentUserProfile: () => (ClaraSweetMemory as any).getCurrentUserProfile?.(),
  
  clearUserMemory: (userId?: string) => (ClaraSweetMemory as any).clearUserMemory?.(userId),
  
  getMemoryStats: () => (ClaraSweetMemory as any).getMemoryStats?.(),
  
  processMemory: (
    userMessage: string,
    assistantMessage: ClaraMessage,
    conversationHistory: ClaraMessage[] = [],
    aiConfig?: ClaraAIConfig
  ) => (ClaraSweetMemory as any).processMemory?.(userMessage, assistantMessage, conversationHistory, aiConfig)
};
