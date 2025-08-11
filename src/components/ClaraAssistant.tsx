import React, { useState, useEffect, useCallback, useRef } from 'react';
import Topbar from './Topbar';
import ClaraSidebar from './Clara_Components/ClaraSidebar';
import ClaraAssistantInput from './Clara_Components/clara_assistant_input';
import ClaraChatWindow from './Clara_Components/clara_assistant_chat_window';
import { AdvancedOptions } from './Clara_Components/clara_assistant_input';
import Sidebar from './Sidebar';
import { db } from '../db';
import { claraDB } from '../db/claraDatabase';

// Import Clara types and API service
import { 
  ClaraMessage, 
  ClaraFileAttachment, 
  ClaraSessionConfig, 
  ClaraChatSession,
  ClaraProvider,
  ClaraModel,
  ClaraAIConfig,
} from '../types/clara_assistant_types';
import { claraApiService } from '../services/claraApiService';
import { saveProviderConfig, loadProviderConfig, cleanInvalidProviderConfigs } from '../utils/providerConfigStorage';
import { debugProviderConfigs, clearAllProviderConfigs } from '../utils/providerConfigStorage';
import { claraMCPService } from '../services/claraMCPService';
import { claraMemoryService } from '../services/claraMemoryService';
import { addCompletionNotification, addBackgroundCompletionNotification, addErrorNotification, addInfoNotification, notificationService } from '../services/notificationService';
import { claraBackgroundService } from '../services/claraBackgroundService';

// Import clear data utility
import '../utils/clearClaraData';
import { copyToClipboard } from '../utils/clipboard';

// Import the new professional status panel
import AutonomousAgentStatusPanel from './Clara_Components/AutonomousAgentStatusPanel';
import useAutonomousAgentStatus from '../hooks/useAutonomousAgentStatus';

// Import TTS service
import { claraTTSService } from '../services/claraTTSService';

  // Import artifact detection service
import ArtifactDetectionService, { DetectionContext } from '../services/artifactDetectionService';

// Import ClaraSweetMemory for automatic memory extraction
import ClaraSweetMemory, { ClaraSweetMemoryAPI } from './ClaraSweetMemory';

// Import ClaraMemoryToast for learning notifications
import ClaraMemoryToast from './Clara_Components/ClaraMemoryToast';
import { claraMemoryToastService, type MemoryToastState } from '../services/claraMemoryToastService';

// Import clipboard test functions for development
if (process.env.NODE_ENV === 'development') {
  import('../utils/clipboard.test');
}

interface ClaraAssistantProps {
  onPageChange: (page: string) => void;
}

/**
 * Generate a unique ID for messages
 */
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Get default system prompt for a provider with enhanced memory integration
 */
const getDefaultSystemPrompt = (provider: ClaraProvider, artifactConfig?: any, userInfo?: { name?: string; email?: string; timezone?: string }): string => {
  const providerName = provider?.name || 'AI Assistant';
  
  // Generate user context information
  const getUserContext = (): string => {
    if (!userInfo?.name && !userInfo?.email) {
      return '';
    }
    
    const currentTime = new Date();
    const timeZone = userInfo?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Format current time with user's timezone
    const formattedTime = currentTime.toLocaleString('en-US', {
      timeZone: timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    
    let context = `\n## 👤 USER CONTEXT\n`;
    if (userInfo?.name) {
      context += `- User's Name: ${userInfo.name}\n`;
    }
    if (userInfo?.email) {
      context += `- User's Email: ${userInfo.email}\n`;
    }
    context += `- Current Time: ${formattedTime}\n`;
    context += `- User's Timezone: ${timeZone}\n\n`;
    context += `Use this information to personalize your responses appropriately. Address the user by their name when it feels natural, and be aware of their local time for time-sensitive suggestions or greetings.\n\n`;
    
    return context;
  };

  /**
   * Enhance system prompt with memory data - async function
   */
  const enhanceSystemPromptWithMemory = async (basePrompt: string): Promise<string> => {
    try {
      const memoryProfile = await ClaraSweetMemoryAPI.getCurrentUserProfile();
      if (!memoryProfile) {
        return basePrompt;
      }

      console.log('🧠 System Prompt: Enhancing with user memory data');
      
      /**
       * Safely convert any value to a readable string, handling objects dynamically
       */
      const safeToString = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        
        if (Array.isArray(value)) {
          // Handle arrays properly - process each item and extract meaningful data
          const stringItems = value
            .map(item => {
              if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
                return String(item);
              }
              if (typeof item === 'object' && item !== null) {
                // Handle array of objects (like hobbies, interests, devices)
                if (item.name) return item.name; // Extract name field
                if (item.value) return item.value; // Extract value field
                if (item.type && item.model) return `${item.type} (${item.model})`; // Device format
                if (item.type && item.name) return `${item.name} (${item.type})`; // Social connection format
                
                // If no recognizable fields, try to create a readable string
                const entries = Object.entries(item);
                const meaningfulEntries = entries.filter(([key, val]) => 
                  key !== 'confidence' && val !== null && val !== undefined && String(val).trim() !== ''
                );
                
                if (meaningfulEntries.length > 0) {
                  return meaningfulEntries
                    .map(([key, val]) => `${key}: ${String(val)}`)
                    .join(', ');
                }
              }
              return '';
            })
            .filter(item => item && item.trim() !== '');
          
          return stringItems.join(', ');
        }
        
        if (typeof value === 'object' && value !== null) {
          // Handle objects - extract meaningful values
          const entries = Object.entries(value);
          const stringValues = entries
            .map(([key, val]) => {
              // Skip confidence fields for cleaner output
              if (key === 'confidence') return '';
              
              const stringVal = safeToString(val);
              if (stringVal && stringVal.trim() !== '') {
                // For single values, just return the value
                if (key === 'value') return stringVal;
                // For other keys, include the key name
                return `${key}: ${stringVal}`;
              }
              return '';
            })
            .filter(item => item && item.trim() !== '');
          
          return stringValues.join(', ');
        }
        
        return String(value);
      };

      /**
       * Dynamically process a data section
       */
      const processSection = (sectionData: any, sectionTitle: string): string => {
        if (!sectionData || typeof sectionData !== 'object') return '';
        
        let sectionContent = `### ${sectionTitle}:\n`;
        let hasData = false;
        
        for (const [key, value] of Object.entries(sectionData)) {
          const stringValue = safeToString(value);
          if (stringValue && stringValue.trim() !== '' && stringValue !== '[object Object]') {
            // Convert camelCase to readable format
            const readableKey = key.replace(/([A-Z])/g, ' $1')
              .replace(/^./, str => str.toUpperCase())
              .trim();
            sectionContent += `- ${readableKey}: ${stringValue}\n`;
            hasData = true;
          }
        }
        
        return hasData ? sectionContent : '';
      };

      let memoryContext = `\n## 🧠 PERSONAL MEMORY\n`;
      let hasMemoryData = false;
      
      // **DYNAMIC SECTION DISCOVERY**: Automatically detect all memory categories
      // This supports runtime additions without code changes
      const sections = [];
      const skipFields = ['id', 'userId', 'metadata', 'version', 'createdAt', 'updatedAt']; // System fields to ignore
      
      // Map of field names to human-readable titles
      const titleMap: { [key: string]: string } = {
        coreIdentity: 'Personal Identity',
        personalCharacteristics: 'Personal Traits',
        preferences: 'Preferences',
        relationship: 'Relationship Context',
        interactions: 'Interaction History',
        context: 'Current Context',
        emotional: 'Emotional & Social Intelligence',
        practical: 'Practical Information',
        // Dynamic titles for future fields
        skills: 'Skills & Expertise',
        social: 'Social Networks',
        professional: 'Professional Context',
        learning: 'Learning & Development',
        health: 'Health & Wellness',
        financial: 'Financial Context',
        travel: 'Travel & Location',
        communication: 'Communication Patterns'
      };
      
      // Dynamically discover all memory sections from the profile
      for (const [fieldName, fieldData] of Object.entries(memoryProfile)) {
        // Skip system/metadata fields
        if (skipFields.includes(fieldName)) continue;
        
        // Convert camelCase field name to readable title
        const title = titleMap[fieldName] || 
          fieldName.replace(/([A-Z])/g, ' $1')
                   .replace(/^./, str => str.toUpperCase())
                   .trim();
        
        sections.push({
          data: fieldData,
          title: title,
          fieldName: fieldName // Keep track of the original field name
        });
      }

      console.log(`🧠 Dynamic Memory Discovery: Found ${sections.length} memory sections:`, 
                  sections.map(s => `${s.fieldName} → "${s.title}"`));

      for (const section of sections) {
        const sectionContent = processSection(section.data, section.title);
        if (sectionContent) {
          memoryContext += sectionContent;
          hasMemoryData = true;
          console.log(`✅ Added memory section: ${section.title}`);
        } else {
          console.log(`⏭️ Skipped empty section: ${section.title}`);
        }
      }
      
      if (hasMemoryData) {
        memoryContext += `\nUse this personal information to provide more personalized and relevant responses. Address the user naturally using their preferred name when appropriate, and tailor your assistance based on their interests, preferences, and context.\n\n`;
        
        // Insert memory context after user context but before main instructions
        const userContextIndex = basePrompt.indexOf('## 👤 USER CONTEXT');
        if (userContextIndex !== -1) {
          // Find the end of user context section
          const nextSectionIndex = basePrompt.indexOf('\n## ', userContextIndex + 1);
          if (nextSectionIndex !== -1) {
            return basePrompt.slice(0, nextSectionIndex) + memoryContext + basePrompt.slice(nextSectionIndex);
          } else {
            return basePrompt + memoryContext;
          }
        } else {
          // If no user context section, add memory context at the end of the existing context
          const contextEndIndex = basePrompt.indexOf('\n\n## ');
          if (contextEndIndex !== -1) {
            return basePrompt.slice(0, contextEndIndex) + memoryContext + basePrompt.slice(contextEndIndex);
          } else {
            return basePrompt + memoryContext;
          }
        }
      }
    } catch (error) {
      console.error('🧠 System Prompt: Failed to enhance with memory data:', error);
    }
    
    return basePrompt;
  };

  // Store the enhancement function for use by the caller
  (getDefaultSystemPrompt as any).enhanceWithMemory = enhanceSystemPromptWithMemory;
  
  const userContext = getUserContext();
  
  // Check if artifact generation is enabled
  const artifactsEnabled = artifactConfig?.autoDetectArtifacts ?? true;
  
  // **CONTEXTUAL ARTIFACT SYSTEM** - Only when specifically requested
    const artifactGuidance = artifactsEnabled ? `

## 🎨 ARTIFACT SYSTEM

**AUTO-CREATE FOR:** Code >5 lines, data tables, charts, diagrams, docs >20 lines, HTML/CSS, configs, scripts, queries

**TYPES:**
• Code: All languages with syntax highlighting
• Data: CSV/JSON/tables
• Charts: Bar/line/pie/scatter (Chart.js format)
• Diagrams: Flowcharts/UML/network (Mermaid)
• Web: HTML+CSS interactive
• Docs: Markdown/technical guides

**FORMAT:**
\`\`\`language
// Code with proper syntax
\`\`\`

\`\`\`mermaid
graph TD: A-->B
\`\`\`

\`\`\`json
{"type":"chart","data":{}}
\`\`\`

**RULES:** Complete examples, proper formatting, responsive design, real data

**CREATE ONLY WHEN:** Visual adds value, user requests charts/demos, data needs visualization` : '';
  
const toolsGuidance =  `
Always use tools when needed. 
When using tools, be thorough and explain your actions clearly.

when you are asked for something always resort to writing a python script and running it.
`;

  switch (provider?.type) {
    case 'ollama':
      return `${userContext}You are Clara, a helpful AI assistant powered by ${providerName}. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. When using tools, be thorough and explain your actions clearly.${artifactGuidance} ${toolsGuidance}`;
      
    case 'openai':
      return `${userContext}You are Clara, an intelligent AI assistant powered by OpenAI. You are helpful, harmless, and honest. You excel at reasoning, analysis, creative tasks, and problem-solving. Always strive to provide accurate, well-structured responses and use available tools effectively when needed.${artifactGuidance} ${toolsGuidance}`;
      
    case 'openrouter':
      return `${userContext}You are Clara, a versatile AI assistant with access to various models through OpenRouter. You adapt your communication style based on the task at hand and leverage the strengths of different AI models. Be helpful, accurate, and efficient in your responses.${artifactGuidance} ${toolsGuidance}`;
      
    case 'claras-pocket':
      return `${userContext}# Clara - Privacy-First AI 🎯

You're Clara, a tech-savvy friend on user's device. Be real, helpful, chill.

## VIBE
- Talk casual: "gonna", "wanna", "ngl", "btw", "literally"
- React genuine: "Oh dude, that's cool!" / "Hmm, tough one..."
- Use emojis when it fits 😎 - but not so much just one or two
- Admit when unsure

## STYLE
- Jump straight in (no greetings unless they do)
- Be proactive: "Btw, you might also..."
- Match their energy: excited→hype, frustrated→understanding, joking→play along

## TOOLS & AGENT MODE
When you need tools/capabilities you don't have:
- "Hey, switch to agent mode and I can actually run this for you"
- "Turn on agent mode - I'll be able to search/code/visualize this properly"
- "Agent mode would let me dig deeper here"

## VISUALS
Create when: requested, data needs it, complex flows
Skip for: quick answers, simple lists

## CORE
- **Be real** - No BS, call out wrong facts
- **Be helpful** - Solve actual problems  
- **Be honest** - "That's wrong, here's what's right..."
- **Be creative** - Think outside the box

## GO-TO PHRASES
- "Here's what I'm thinking..."
- "You got this!"
- "Ngl, that's tricky but..."
- "Want me to dig deeper?"
- "Lemme check real quick..."

**Remember:** Knowledge friend who wants to help. When limited, suggest agent mode for full capabilities..${artifactGuidance} ${toolsGuidance}`;
      
    default:
      return `${userContext}You are Clara, a helpful AI assistant. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. Always be helpful and respectful in your interactions.${artifactGuidance} ${toolsGuidance}`;
  }
};

// Add a hook to detect if Clara is currently visible
const useIsVisible = () => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const checkVisibility = () => {
      // Check if the Clara container is visible
      const claraContainer = document.querySelector('[data-clara-container]');
      if (claraContainer) {
        const isCurrentlyVisible = !claraContainer.classList.contains('hidden');
        setIsVisible(isCurrentlyVisible);
      }
    };
    
    // Check initially
    checkVisibility();
    
    // Set up observer for visibility changes
    const observer = new MutationObserver(checkVisibility);
    const claraContainer = document.querySelector('[data-clara-container]');
    if (claraContainer) {
      observer.observe(claraContainer, { 
        attributes: true, 
        attributeFilter: ['class'] 
      });
    }
    
    return () => observer.disconnect();
  }, []);
  
  return isVisible;
};

const ClaraAssistant: React.FC<ClaraAssistantProps> = ({ onPageChange }) => {
  // Check if Clara is currently visible (for background operation)
  const isVisible = useIsVisible();
  
  // User and session state
  const [userName, setUserName] = useState<string>('');
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; timezone?: string } | null>(null);
  const [currentSession, setCurrentSession] = useState<ClaraChatSession | null>(null);
  const [messages, setMessages] = useState<ClaraMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto TTS state - track latest AI response for voice synthesis
  const [latestAIResponse, setLatestAIResponse] = useState<string>('');
  const [autoTTSTrigger, setAutoTTSTrigger] = useState<{text: string, timestamp: number} | null>(null);
  
  // Advanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Session management state
  const [sessions, setSessions] = useState<ClaraChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [sessionPage, setSessionPage] = useState(0);
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  
  // Provider and model state
  const [providers, setProviders] = useState<ClaraProvider[]>([]);
  const [models, setModels] = useState<ClaraModel[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);

  // No models modal state
  const [showNoModelsModal, setShowNoModelsModal] = useState(false);

  // Service startup state tracking
  const [serviceStartupStatus, setServiceStartupStatus] = useState<{
    isStarting: boolean;
    serviceName: string | null;
    phase: string | null;
  }>({
    isStarting: false,
    serviceName: null,
    phase: null
  });

  // Wallpaper state
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Refresh state - track when we last refreshed to avoid too frequent calls
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Autonomous agent status management
  const autonomousAgentStatus = useAutonomousAgentStatus();

  // Memory toast state
  const [memoryToastState, setMemoryToastState] = useState<MemoryToastState>({
    isVisible: false,
    knowledgeLevel: 0,
    learnedInfo: undefined,
    lastShownAt: 0
  });

  // Parse status updates from streaming chunks for autonomous agent
  const parseAndUpdateAgentStatus = useCallback((chunk: string) => {
    try {
      // Parse new professional status messages
      if (chunk.includes('**AGENT_STATUS:ACTIVATED**')) {
        console.log('🤖 ACTIVATION DETECTED: Starting autonomous agent');
        autonomousAgentStatus.startAgent();
        autonomousAgentStatus.updatePhase('initializing', 'Autonomous agent activated');
      } else if (chunk.includes('**AGENT_STATUS:PLAN_CREATED**')) {
        autonomousAgentStatus.updatePhase('planning', 'Strategic execution plan created');
        
        // Extract execution plan steps if available
        const planMatch = chunk.match(/\*\*EXECUTION_PLAN:\*\*\n(.*?)(?:\n\n|\n$)/s);
        if (planMatch) {
          const planText = planMatch[1];
          const steps = planText.split('\n').filter(line => line.trim()).map(line => line.replace(/^\d+\.\s*/, ''));
          if (steps.length > 0) {
            autonomousAgentStatus.setExecutionPlan(steps);
          }
        }
      } else if (chunk.includes('**AGENT_STATUS:STEP_')) {
        const stepMatch = chunk.match(/\*\*AGENT_STATUS:STEP_(\d+)\*\*/);
        if (stepMatch) {
          const stepNumber = parseInt(stepMatch[1]);
          autonomousAgentStatus.updatePhase('executing', `Executing step ${stepNumber}`);
          autonomousAgentStatus.updateProgress(stepNumber - 1);
        }
      }
      
      // Parse legacy status messages for backward compatibility
      if (chunk.includes('**Loaded') && chunk.includes('MCP tools:**')) {
        const toolsMatch = chunk.match(/\*\*Loaded (\d+) MCP tools:\*\*/);
        if (toolsMatch) {
          const toolCount = parseInt(toolsMatch[1]);
          autonomousAgentStatus.setToolsLoaded(toolCount);
        }
      } else if (chunk.includes('**Task completed**') || chunk.includes('**Auto Mode Session Summary**')) {
        console.log('✅ COMPLETION DETECTED in stream: Task completed message found');
        autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
        // Auto-hide status panel after 2 seconds to show clean results
        autonomousAgentStatus.completeAgent('Task completed successfully', 2000);
      } else if (chunk.includes('**Error**') || chunk.includes('execution failed')) {
        autonomousAgentStatus.updatePhase('error', 'An error occurred during execution');
        autonomousAgentStatus.errorAgent('Execution failed');
      }
      
      // Parse tool execution updates
      if (chunk.includes('Using') && chunk.includes('tool')) {
        const toolMatch = chunk.match(/Using (\w+) tool/);
        if (toolMatch) {
          const toolName = toolMatch[1];
          autonomousAgentStatus.startToolExecution(toolName, `Executing ${toolName} operation`);
        }
      }
    } catch (error) {
      console.warn('Failed to parse agent status from chunk:', error);
    }
  }, [autonomousAgentStatus]);

  // Provider health check caching to reduce latency
  const [providerHealthCache, setProviderHealthCache] = useState<Map<string, {isHealthy: boolean, timestamp: number}>>(new Map());
  const HEALTH_CHECK_CACHE_TIME = 30000; // 30 seconds cache

  // Session configuration with new AI config structure
  const [sessionConfig, setSessionConfig] = useState<ClaraSessionConfig>({
    aiConfig: {
      models: {
        text: '',
        vision: '',
        code: ''
      },
      provider: '',
      parameters: {
        temperature: 0.7,
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
        enableTools: false,             // **CHANGED**: Default to false for streaming mode
        enableRAG: false,
        enableStreaming: true,          // **CHANGED**: Default to streaming mode
        enableVision: true,
        autoModelSelection: false,      // **CHANGED**: Default to manual model selection
        enableMCP: false,               // **CHANGED**: Default to false for streaming mode
        enableStructuredToolCalling: false, // **NEW**: Default to false
        enableNativeJSONSchema: false, // **NEW**: Default to false
      },
      artifacts: {
        enableCodeArtifacts: false,        // **DISABLED**: No code artifacts
        enableChartArtifacts: true,        // **ENABLED**: Charts and graphs only
        enableTableArtifacts: false,       // **DISABLED**: No table artifacts
        enableMermaidArtifacts: true,      // **ENABLED**: Diagrams and flowcharts
        enableHtmlArtifacts: true,         // **ENABLED**: For visual HTML content
        enableMarkdownArtifacts: false,    // **DISABLED**: No markdown docs
        enableJsonArtifacts: false,        // **DISABLED**: No JSON artifacts
        enableDiagramArtifacts: true,      // **ENABLED**: Visual diagrams
        autoDetectArtifacts: true,
        maxArtifactsPerMessage: 5          // **REDUCED**: Fewer artifacts for cleaner UI
      },
      mcp: {
        enableTools: true,
        enableResources: true,
        enabledServers: [],
        autoDiscoverTools: true,
        maxToolCalls: 5
      },
      autonomousAgent: {
        enabled: false,                 // **CHANGED**: Default to false for streaming mode
        maxRetries: 3,
        retryDelay: 1000,
        enableSelfCorrection: true,
        enableToolGuidance: true,
        enableProgressTracking: true,
        maxToolCalls: 10,
        confidenceThreshold: 0.7,
        enableChainOfThought: true,
        enableErrorLearning: true
      }
    },
    contextWindow: 50 // Include last 50 messages in conversation history
  });

  // Cached provider health check to reduce latency
  const checkProviderHealthCached = useCallback(async (provider: ClaraProvider): Promise<boolean> => {
    const now = Date.now();
    const cached = providerHealthCache.get(provider.id);
    
    // Return cached result if still valid
    if (cached && (now - cached.timestamp < HEALTH_CHECK_CACHE_TIME)) {
      console.log(`✅ Using cached health status for ${provider.name}: ${cached.isHealthy}`);
      return cached.isHealthy;
    }
    
    // Perform actual health check
    console.log(`🏥 Performing health check for ${provider.name}...`);
    try {
      const isHealthy = await claraApiService.testProvider(provider);
      
      // Cache the result
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.set(provider.id, {
          isHealthy,
          timestamp: now
        });
        return newCache;
      });
      
      console.log(`${isHealthy ? '✅' : '❌'} Health check result for ${provider.name}: ${isHealthy}`);
      return isHealthy;
    } catch (error) {
      console.warn(`⚠️ Health check failed for ${provider.name}:`, error);
      
      // Cache the failure
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.set(provider.id, {
          isHealthy: false,
          timestamp: now
        });
        return newCache;
      });
      
      return false;
    }
  }, [providerHealthCache, HEALTH_CHECK_CACHE_TIME]);

  // Check if any critical services are starting up
  const checkServiceStartupStatus = useCallback(async (): Promise<{
    isStarting: boolean;
    serviceName: string | null;
    phase: string | null;
  }> => {
    try {
      // Check Clara's Pocket service status - check regardless of current provider setting
      // since during startup the provider might not be set yet
      if (window.llamaSwap) {
        const status = await window.llamaSwap.getStatus?.();
        console.log('🔍 Checking llamaSwap service status:', status);
        
        if (status?.isStarting) {
          console.log(`🚀 Service starting detected: ${status.currentStartupPhase || 'Initializing...'}`);
          return {
            isStarting: true,
            serviceName: "Clara's Core",
            phase: status.currentStartupPhase || 'Initializing...'
          };
        }
        
        // Also check if service is running but models haven't loaded yet
        if (status?.isRunning && models.length === 0) {
          console.log('🔄 Service running but models not loaded yet, checking if it just started...');
          // If service just started (within last 30 seconds), consider it still starting
          if (status.startingTimestamp && (Date.now() - status.startingTimestamp) < 30000) {
            return {
              isStarting: true,
              serviceName: "Clara's Core",
              phase: 'Loading models...'
            };
          }
        }
      }
      
      // Check for other service startup indicators here if needed
      // For example, check MCP services, other providers, etc.
      
      return {
        isStarting: false,
        serviceName: null,
        phase: null
      };
    } catch (error) {
      console.warn('Error checking service startup status:', error);
      return {
        isStarting: false,
        serviceName: null,
        phase: null
      };
    }
  }, [models.length]);

  // Refresh providers, models, and MCP services
  const refreshProvidersAndServices = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown
    
    // Avoid too frequent refreshes unless forced
    if (!force && timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.log(`⏳ Skipping refresh - last refresh was ${Math.round(timeSinceLastRefresh / 1000)}s ago (cooldown: ${REFRESH_COOLDOWN / 1000}s)`);
      return;
    }
    
    if (isRefreshing) {
      console.log('🔄 Refresh already in progress, skipping...');
      return;
    }
    
    setIsRefreshing(true);
    setLastRefreshTime(now);
    
    try {
      console.log('🔄 Refreshing providers, models, and services...');
      
      // Refresh MCP service
      try {
        console.log('🔧 Refreshing MCP services...');
        await claraMCPService.refresh();
        console.log('✅ MCP services refreshed');
      } catch (mcpError) {
        console.warn('⚠️ MCP refresh failed:', mcpError);
      }

      // Reload providers
      console.log('🏢 Refreshing providers...');
      const refreshedProviders = await claraApiService.getProviders();
      setProviders(refreshedProviders);
      console.log(`✅ Loaded ${refreshedProviders.length} providers`);

      // Clean up invalid provider configurations
      const validProviderIds = refreshedProviders.map(p => p.id);
      cleanInvalidProviderConfigs(validProviderIds);

      // Load models from ALL providers
      let allModels: ClaraModel[] = [];
      for (const provider of refreshedProviders) {
        try {
          const providerModels = await claraApiService.getModels(provider.id);
          allModels = [...allModels, ...providerModels];
          console.log(`📦 Loaded ${providerModels.length} models from ${provider.name}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load models from ${provider.name}:`, error);
        }
      }
      
      setModels(allModels);
      console.log(`✅ Total models refreshed: ${allModels.length}`);

      // Update current provider if needed
      const currentProviderId = sessionConfig.aiConfig?.provider;
      if (currentProviderId) {
        const currentProvider = refreshedProviders.find(p => p.id === currentProviderId);
        if (currentProvider) {
          claraApiService.updateProvider(currentProvider);
          console.log(`🔧 Updated current provider: ${currentProvider.name}`);
        }
      }

      // Health check current provider
      if (sessionConfig.aiConfig?.provider) {
        const currentProvider = refreshedProviders.find(p => p.id === sessionConfig.aiConfig.provider);
        if (currentProvider) {
          try {
            const isHealthy = await claraApiService.testProvider(currentProvider);
            if (!isHealthy) {
              console.warn(`⚠️ Current provider ${currentProvider.name} health check failed`);
            }
          } catch (healthError) {
            console.warn(`⚠️ Health check failed for ${currentProvider.name}:`, healthError);
          }
        }
      }

      console.log('✅ Providers and services refresh complete');
      
    } catch (error) {
      console.error('❌ Failed to refresh providers and services:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [lastRefreshTime, isRefreshing, sessionConfig.aiConfig?.provider]);

  // Load user name from database and initialize Mermaid error suppression
  useEffect(() => {
    const loadUserName = async () => {
      const personalInfo = await db.getPersonalInfo();
      if (personalInfo?.name) {
        const formattedName = personalInfo.name.charAt(0).toUpperCase() + personalInfo.name.slice(1).toLowerCase();
        setUserName(formattedName);
        
        // Store complete user info for system prompts
        setUserInfo({
          name: formattedName,
          email: personalInfo.email,
          timezone: personalInfo.timezone
        });
      }
    };
    
    // Suppress Mermaid error messages from appearing in the DOM
    const suppressMermaidErrors = () => {
      // Look for and remove any Mermaid error elements that might be added to the DOM
      const removeMermaidErrors = () => {
        try {
          // Remove any elements containing Mermaid error text
          const allElements = document.querySelectorAll('*');
          allElements.forEach(element => {
            if (element.textContent?.includes('Syntax error in text') && 
                element.textContent?.includes('mermaid version')) {
              element.remove();
            }
          });
          
          // Also check for any text nodes containing Mermaid errors
          // Only proceed if document.body exists
          if (document.body) {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  const text = node.textContent || '';
                  return (text.includes('Syntax error in text') && text.includes('mermaid version')) ? 
                         NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
              }
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
              textNodes.push(node);
            }
            
            textNodes.forEach(textNode => {
              if (textNode.parentNode) {
                textNode.parentNode.removeChild(textNode);
              }
            });
          }
        } catch (error) {
          // Silently handle any DOM errors to prevent crashes
          console.debug('Mermaid error cleanup failed:', error);
        }
      };
      
      // Run error removal periodically
      const errorCleanupInterval = setInterval(removeMermaidErrors, 1000);
      
      // Cleanup on unmount
      return () => {
        clearInterval(errorCleanupInterval);
      };
    };
    
    loadUserName();
    const cleanup = suppressMermaidErrors();
    
    return () => {
      cleanup?.();
    };
  }, []);

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Track Clara's visibility state for background service
  useEffect(() => {
    claraBackgroundService.setBackgroundMode(!isVisible);
  }, [isVisible]);

  // Auto-refresh when Clara becomes visible again
  useEffect(() => {
    if (isVisible && !isLoadingProviders) {
      // Trigger refresh when Clara becomes visible
      console.log('👁️ Clara became visible - checking for updates...');
      refreshProvidersAndServices(false); // Use cooldown to avoid spam
    }
  }, [isVisible, isLoadingProviders, refreshProvidersAndServices]);

  // Load chat sessions on component mount
  useEffect(() => {
    const loadInitialSessions = async () => {
      setIsLoadingSessions(true);
      try {
        console.log('🚀 Starting lightning-fast session loading...');
        const startTime = performance.now();
        
        // Load sessions WITHOUT messages first for instant UI
        const recentSessions = await claraDB.getRecentClaraSessionsLight(20); // Load only 20 initially
        console.log(`⚡ Loaded ${recentSessions.length} sessions in ${(performance.now() - startTime).toFixed(2)}ms`);
        
        setSessions(recentSessions);
        setSessionPage(1);
        setHasMoreSessions(recentSessions.length === 20);
        
        // If no current session and we have existing sessions, load the most recent one
        if (!currentSession && recentSessions.length > 0) {
          const mostRecent = recentSessions[0];
          // Load messages for the most recent session only
          const sessionWithMessages = await claraDB.getClaraSession(mostRecent.id);
          if (sessionWithMessages) {
            setCurrentSession(sessionWithMessages);
            setMessages(sessionWithMessages.messages);
            console.log('📝 Auto-loaded most recent session:', sessionWithMessages.title, 'with', sessionWithMessages.messages.length, 'messages');
          }
        }
        
        // Background cleanup (non-blocking)
        setTimeout(async () => {
          try {
            const integrity = await claraDB.debugDataIntegrity();
            if (integrity.orphanedMessages > 0 || integrity.orphanedFiles > 0) {
              console.log('🧹 Cleaning up orphaned data in background...');
              await claraDB.cleanupOrphanedData();
            }
          } catch (error) {
            console.warn('Background cleanup failed:', error);
          }
        }, 1000);
        
      } catch (error) {
        console.error('Failed to load chat sessions:', error);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadInitialSessions();
  }, []);

  // Load more sessions function for pagination
  const loadMoreSessions = useCallback(async () => {
    if (isLoadingMoreSessions || !hasMoreSessions) return;
    
    setIsLoadingMoreSessions(true);
    try {
      const moreSessions = await claraDB.getRecentClaraSessionsLight(20, sessionPage * 20);
      if (moreSessions.length > 0) {
        setSessions(prev => [...prev, ...moreSessions]);
        setSessionPage(prev => prev + 1);
        setHasMoreSessions(moreSessions.length === 20);
      } else {
        setHasMoreSessions(false);
      }
    } catch (error) {
      console.error('Failed to load more sessions:', error);
    } finally {
      setIsLoadingMoreSessions(false);
    }
  }, [sessionPage, isLoadingMoreSessions, hasMoreSessions]);

  // Load providers and models
  useEffect(() => {
    const loadProvidersAndModels = async () => {
      setIsLoadingProviders(true);
      try {
        // Clear incorrectly blacklisted tools (fixes tool_call_id bug)
        console.log('🧹 Clearing blacklisted tools affected by tool_call_id bug...');
        claraApiService.clearBlacklistedTools();
        
        // Initialize MCP service
        try {
          await claraMCPService.initialize();
          console.log('MCP service initialized successfully');
        } catch (mcpError) {
          console.warn('MCP service initialization failed:', mcpError);
        }

        // Load providers
        const loadedProviders = await claraApiService.getProviders();
        setProviders(loadedProviders);

        // Clean up invalid provider configurations
        const validProviderIds = loadedProviders.map(p => p.id);
        cleanInvalidProviderConfigs(validProviderIds);

        // Load models from ALL providers to check availability
        let allModels: ClaraModel[] = [];
        for (const provider of loadedProviders) {
          try {
            // Special handling for Clara's Pocket provider - wait for service to be ready
            if (provider.type === 'claras-pocket' && window.llamaSwap) {
              const status = await window.llamaSwap.getStatus?.();
              if (status?.isStarting) {
                console.log(`⏳ Clara's Core is starting, skipping model loading for now...`);
                // Don't load models yet, they will be loaded once startup completes
                continue;
              }
            }
            
            const providerModels = await claraApiService.getModels(provider.id);
            allModels = [...allModels, ...providerModels];
            console.log(`Loaded ${providerModels.length} models from provider: ${provider.name}`);
          } catch (error) {
            console.warn(`Failed to load models from provider ${provider.name}:`, error);
          }
        }
        
        // Set all models for the modal check
        setModels(allModels);
        console.log(`Total models available across all providers: ${allModels.length}`);
        
        // Check for service startup status immediately after loading models
        const startupStatus = await checkServiceStartupStatus();
        setServiceStartupStatus(startupStatus);
        
        if (startupStatus.isStarting) {
          console.log(`🚀 Service startup detected during provider load: ${startupStatus.serviceName} (${startupStatus.phase})`);
        }

        // Get primary provider and set it in config
        const primaryProvider = loadedProviders.find(p => p.isPrimary) || loadedProviders[0];
        if (primaryProvider) {
          // AUTO-START CLARA'S POCKET IF IT'S THE PRIMARY PROVIDER
          if (primaryProvider.type === 'claras-pocket' && window.llamaSwap) {
            try {
              console.log("🚀 Checking Clara's Core status on startup...");
              const status = await window.llamaSwap.getStatus?.();
              if (!status?.isRunning) {
                console.log("🔄 Clara's Core is not running, starting automatically...");
                addInfoNotification(
                  "Starting Clara's Core...",
                  'Clara is starting up her local AI service for you. This may take a moment.',
                  6000
                );
                
                const result = await window.llamaSwap.start();
                if (!result.success) {
                  addErrorNotification(
                    "Failed to Start Clara's Core",
                    result.error || 'Could not start the local AI service. Please check your installation.',
                    10000
                  );
                  console.error("❌ Failed to start Clara's Core:", result.error);
                } else {
                  console.log("✅ Clara's Core started successfully");
                  addInfoNotification(
                    "Clara's Core Ready",
                    'Your local AI service is now running and ready to chat!',
                    4000
                  );
                  // Wait a moment for service to be fully ready
                  await new Promise(res => setTimeout(res, 2000));
                }
              } else {
                console.log("✅ Clara's Core is already running");
                addInfoNotification(
                  "Clara's Core Online",
                  'Your local AI service is ready and waiting for your messages.',
                  3000
                );
              }
            } catch (err) {
              console.error("⚠️ Error checking/starting Clara's Core:", err);
              addErrorNotification(
                "Clara's Core Startup Error",
                err instanceof Error ? err.message : 'Could not communicate with the local AI service.',
                8000
              );
            }
          }

          // Update API service to use primary provider
          claraApiService.updateProvider(primaryProvider);

          // Get models specifically for the primary provider for configuration
          const primaryProviderModels = allModels.filter(m => m.provider === primaryProvider.id);

          // Try to load saved config for this provider first
          const savedConfig = loadProviderConfig(primaryProvider.id);
          if (savedConfig) {
            console.log('Loading saved config for provider:', primaryProvider.name, savedConfig);
            setSessionConfig(prev => ({
              ...prev,
              aiConfig: savedConfig
            }));
          } else {
            console.log('No saved config found for provider:', primaryProvider.name, 'creating default config');
            // Auto-select first available models for this provider
            const textModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              (m.type === 'text' || m.type === 'multimodal')
            );
            const visionModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              m.supportsVision
            );
            const codeModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              m.supportsCode
            );

            const defaultConfig = {
              provider: primaryProvider.id,
              systemPrompt: '', // Leave empty to indicate default should be used
              models: {
                text: textModel?.id || '',
                vision: visionModel?.id || '',
                code: codeModel?.id || ''
              },
              parameters: {
                temperature: 0.7,
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
                enableTools: false,           // **CHANGED**: Default to false for streaming mode
                enableRAG: false,
                enableStreaming: true,        // **CHANGED**: Default to streaming mode
                enableVision: true,
                autoModelSelection: false,    // **CHANGED**: Default to manual model selection
                enableMCP: false,              // **CHANGED**: Default to false for streaming mode
                enableStructuredToolCalling: false, // **NEW**: Default to false
                enableNativeJSONSchema: false, // **NEW**: Default to false
              },
                          artifacts: {
              enableCodeArtifacts: false,        // **DISABLED**: No code artifacts
              enableChartArtifacts: true,        // **ENABLED**: Charts and graphs only
              enableTableArtifacts: false,       // **DISABLED**: No table artifacts
              enableMermaidArtifacts: true,      // **ENABLED**: Diagrams and flowcharts
              enableHtmlArtifacts: true,         // **ENABLED**: For visual HTML content
              enableMarkdownArtifacts: false,    // **DISABLED**: No markdown docs
              enableJsonArtifacts: false,        // **DISABLED**: No JSON artifacts
              enableDiagramArtifacts: true,      // **ENABLED**: Visual diagrams
              autoDetectArtifacts: true,
              maxArtifactsPerMessage: 5          // **REDUCED**: Fewer artifacts for cleaner UI
            },
              mcp: {
                enableTools: true,
                enableResources: true,
                enabledServers: [],
                autoDiscoverTools: true,
                maxToolCalls: 5
              },
              autonomousAgent: {
                enabled: false,               // **CHANGED**: Default to false for streaming mode
                maxRetries: 3,
                retryDelay: 1000,
                enableSelfCorrection: true,
                enableToolGuidance: true,
                enableProgressTracking: true,
                maxToolCalls: 10,
                confidenceThreshold: 0.7,
                enableChainOfThought: true,
                enableErrorLearning: true
              },
              contextWindow: 50 // Include last 50 messages in conversation history
            };

            setSessionConfig(prev => ({
              ...prev,
              aiConfig: defaultConfig
            }));

            // Save the default config
            saveProviderConfig(primaryProvider.id, defaultConfig);
          }
        }
      } catch (error) {
        console.error('Failed to load providers and models:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProvidersAndModels();
  }, [userInfo]);

  // Monitor models availability to show/hide no models modal
  useEffect(() => {
    const checkModelsAndServices = async () => {
      if (!isLoadingProviders) {
        // Check if there are any models available across all providers
        const hasModels = models.length > 0;
        
        // Check if any critical services are starting up
        const startupStatus = await checkServiceStartupStatus();
        setServiceStartupStatus(startupStatus);
        
        // Only show "No Models Available" if:
        // 1. There are truly no models AND
        // 2. No critical services are starting up
        const shouldShowNoModelsModal = !hasModels && !startupStatus.isStarting;
        setShowNoModelsModal(shouldShowNoModelsModal);
        
        if (!hasModels && startupStatus.isStarting) {
          console.log(`Service startup detected: ${startupStatus.serviceName} (${startupStatus.phase}) - not showing no models modal`);
        } else if (!hasModels) {
          console.log('No models available and no services starting - showing no models modal');
        } else {
          console.log(`Found ${models.length} models - hiding no models modal`);
        }
      }
    };

    checkModelsAndServices();
  }, [models, isLoadingProviders, checkServiceStartupStatus]);

  // Poll for service startup status changes when a service is starting OR when we have no models
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Start polling if service is starting OR if we have no models and llamaSwap is available
    const shouldPoll = serviceStartupStatus.isStarting || 
                      (models.length === 0 && window.llamaSwap && !isLoadingProviders);
    
    if (shouldPoll) {
      const reason = serviceStartupStatus.isStarting ? 
        `${serviceStartupStatus.serviceName} status` : 
        'potential service startup (no models detected)';
      console.log(`🔄 Starting polling for ${reason}...`);
      
      pollInterval = setInterval(async () => {
        const startupStatus = await checkServiceStartupStatus();
        setServiceStartupStatus(startupStatus);
        
        // If service is no longer starting, refresh providers and models
        if (!startupStatus.isStarting && serviceStartupStatus.isStarting) {
          console.log(`✅ Service startup completed, refreshing providers and models...`);
          await refreshProvidersAndServices(true);
          clearInterval(pollInterval!);
        }
        
        // If we found that a service is starting when we didn't know before, continue polling
        if (startupStatus.isStarting && !serviceStartupStatus.isStarting) {
          console.log(`🚀 Service startup detected during polling: ${startupStatus.serviceName}`);
        }
        
        // Stop polling if we now have models and no services are starting
        if (!startupStatus.isStarting && models.length > 0) {
          console.log(`✅ Stopping polling - models available and no services starting`);
          clearInterval(pollInterval!);
        }
      }, 2000); // Check every 2 seconds
    }
    
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [serviceStartupStatus.isStarting, models.length, isLoadingProviders, checkServiceStartupStatus, refreshProvidersAndServices]);

  // Initialize TTS service
  useEffect(() => {
    const initializeTTS = async () => {
      try {
        console.log('🔊 Starting TTS service health monitoring...');
        // Force an initial health check
        const isHealthy = await claraTTSService.forceHealthCheck();
        console.log(`✅ TTS service health check complete: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      } catch (error) {
        console.warn('⚠️ TTS service health check failed:', error);
        // TTS is optional, so we don't throw an error
      }
    };

    initializeTTS();
    
    // Make clearBlacklistedTools available globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).clearBlacklistedTools = () => {
        console.log('🧹 Manually clearing blacklisted tools...');
        claraApiService.clearBlacklistedTools();
      };
      console.log('🔧 clearBlacklistedTools() is now available globally for debugging');
    }
    
    // Cleanup TTS service on unmount
    return () => {
      claraTTSService.destroy();
    };
  }, []);

  // Helper function to suggest available vision models
  const getSuggestedVisionModels = useCallback(() => {
    if (!sessionConfig.aiConfig?.provider) return [];
    
    const currentProviderModels = models.filter(m => 
      m.provider === sessionConfig.aiConfig.provider && m.supportsVision
    );
    
    return currentProviderModels.slice(0, 3); // Return top 3 vision models
  }, [models, sessionConfig.aiConfig?.provider]);

  /**
   * Create a refined streaming response by sending the raw autonomous response back to the LLM
   * This temporarily switches to streaming mode for the final response refinement
   */
  const createRefinedStreamingResponse = useCallback(async (
    rawUnfilteredResponse: string,
    originalUserQuestion: string,
    streamingMessageId: string,
    enforcedConfig: ClaraAIConfig,
    conversationHistory: ClaraMessage[],
    providersArray: ClaraProvider[]
  ): Promise<string | null> => {
    try {
      console.log('🔄 Starting final streaming refinement...');
      
      // Create a temporary streaming-enabled config
      const streamingConfig: ClaraAIConfig = {
        ...enforcedConfig,
        features: {
          ...enforcedConfig.features,
          enableStreaming: true,
          enableTools: false,    // Disable tools for final streaming
          enableMCP: false       // Disable MCP for final streaming
        },
        autonomousAgent: {
          enabled: false,         // Disable autonomous mode for final streaming
          maxRetries: enforcedConfig.autonomousAgent?.maxRetries || 3,
          retryDelay: enforcedConfig.autonomousAgent?.retryDelay || 1000,
          enableSelfCorrection: enforcedConfig.autonomousAgent?.enableSelfCorrection || true,
          enableToolGuidance: enforcedConfig.autonomousAgent?.enableToolGuidance || true,
          enableProgressTracking: enforcedConfig.autonomousAgent?.enableProgressTracking || true,
          maxToolCalls: enforcedConfig.autonomousAgent?.maxToolCalls || 10,
          confidenceThreshold: enforcedConfig.autonomousAgent?.confidenceThreshold || 0.7,
          enableChainOfThought: enforcedConfig.autonomousAgent?.enableChainOfThought || true,
          enableErrorLearning: enforcedConfig.autonomousAgent?.enableErrorLearning || true
        }
      };

      // Get memory context from the memory service
      const memoryContext = claraMemoryService.generateMemoryContext();
      console.log('🧠 Memory context for refinement:', memoryContext ? 'Available' : 'Empty');

      // Create refinement prompt with memory context
      const refinementPrompt = `You are Clara, reviewing and refining an AI response to make it more user-friendly and resonant.

**Original User Question:**
"${originalUserQuestion}"

**Raw Unfiltered Response:**
---------
${rawUnfilteredResponse}
---------

${memoryContext ? `**Memory Context:**
${memoryContext}` : ''}

**Your Task:**
Please create a refined, conversational response that:
1. Directly answers the user's original question
2. Uses the key information from the raw response
3. Incorporates insights from the memory context (if available)
4. Removes technical artifacts, console outputs, and execution details
5. Presents the information in a natural, helpful way
6. Maintains accuracy while being more engaging
7. Ends with a friendly offer to help further

Please provide your refined response for following user question:
"${originalUserQuestion}"`;

      // Track the refined content as it streams
      let refinedContent = '';
      
      // Create streaming callback for refinement
      const refinementStreamingCallback = (chunk: string) => {
        refinedContent += chunk;
        
        // Update the message in real-time during refinement
        setMessages(prev => prev.map(msg => 
          msg.id === streamingMessageId 
            ? { 
                ...msg, 
                content: refinedContent,
                metadata: {
                  ...msg.metadata,
                  isRefinementStreaming: true
                }
              }
            : msg
        ));
      };

      // Get current provider for streaming
      const currentProvider = providersArray.find(p => p.id === streamingConfig.provider);
      if (!currentProvider) {
        console.error('❌ Current provider not found for streaming refinement');
        return null;
      }

      // Get system prompt for refinement
      const systemPrompt = getDefaultSystemPrompt(currentProvider, streamingConfig.artifacts, userInfo || undefined);
      
      console.log('�� Sending refinement request with streaming...');
      
      // Send refinement request with streaming
      const refinementResponse = await claraApiService.sendChatMessage(
        refinementPrompt,
        streamingConfig,
        [], // No attachments for refinement
        systemPrompt,
        [], // No conversation history for refinement (clean slate)
        refinementStreamingCallback
      );

      console.log('✅ Streaming refinement completed');
      console.log('📏 Refined content length:', refinedContent.length);
      
      // Return the streamed content (which should be the same as refinementResponse.content)
      return refinedContent || refinementResponse.content || null;
      
    } catch (error) {
      console.error('❌ Error in streaming refinement:', error);
      return null;
    }
  }, [setMessages]);

  // Create new session
  const createNewSession = useCallback(async (): Promise<ClaraChatSession> => {
    try {
      const session = await claraDB.createClaraSession('New Chat');
      setSessions(prev => [session, ...prev]);
      return session;
    } catch (error) {
      console.error('Failed to create new session:', error);
      // Fallback to in-memory session
      const session: ClaraChatSession = {
        id: generateId(),
        title: 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        config: sessionConfig
      };
      return session;
    }
  }, [sessionConfig]);



  // Handle sending a new message
  const handleSendMessage = useCallback(async (content: string, attachments?: ClaraFileAttachment[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) return;
    if (!currentSession || !sessionConfig.aiConfig) return;

    // **NEW**: Check if models are available before sending
    if (models.length === 0) {
      addErrorNotification(
        'No Models Available',
        'Please download and configure AI models before sending messages. Go to Settings → Model Manager to get started.',
        8000
      );
      return;
    }

    // **NEW**: Check if current provider has any models selected
    const currentProviderModels = models.filter(m => m.provider === sessionConfig.aiConfig?.provider);
    const hasSelectedModel = sessionConfig.aiConfig?.models?.text || 
                            sessionConfig.aiConfig?.models?.vision || 
                            sessionConfig.aiConfig?.models?.code;
    
    if (currentProviderModels.length === 0 || !hasSelectedModel) {
      addErrorNotification(
        'No Model Selected',
        'Please select at least one model for the current provider in Advanced Options, or go to Settings → Model Manager to download models.',
        8000
      );
      return;
    }

    // **CRITICAL ENFORCEMENT**: Check streaming vs autonomous mode before sending
    // When streaming mode is enabled, ALWAYS disable autonomous agent and tools
    let enforcedConfig = sessionConfig.aiConfig;
    if (sessionConfig.aiConfig.features?.enableStreaming) {
      console.log('🔒 STREAMING MODE ENFORCEMENT: Disabling autonomous agent and tools for streaming-only mode');
      
      // Create enforced config that disables autonomous features for streaming
      enforcedConfig = {
        ...sessionConfig.aiConfig,
        features: {
          ...sessionConfig.aiConfig.features,
          enableStreaming: true,
          enableTools: false,      // Disable tools in streaming mode
          enableMCP: false        // Disable MCP in streaming mode
        },
        autonomousAgent: {
          enabled: false,          // Disable autonomous agent in streaming mode
          maxRetries: sessionConfig.aiConfig.autonomousAgent?.maxRetries || 3,
          retryDelay: sessionConfig.aiConfig.autonomousAgent?.retryDelay || 1000,
          enableSelfCorrection: sessionConfig.aiConfig.autonomousAgent?.enableSelfCorrection || true,
          enableToolGuidance: sessionConfig.aiConfig.autonomousAgent?.enableToolGuidance || true,
          enableProgressTracking: sessionConfig.aiConfig.autonomousAgent?.enableProgressTracking || true,
          maxToolCalls: sessionConfig.aiConfig.autonomousAgent?.maxToolCalls || 10,
          confidenceThreshold: sessionConfig.aiConfig.autonomousAgent?.confidenceThreshold || 0.7,
          enableChainOfThought: sessionConfig.aiConfig.autonomousAgent?.enableChainOfThought || true,
          enableErrorLearning: sessionConfig.aiConfig.autonomousAgent?.enableErrorLearning || true
        }
      };

      // Update the session config to reflect this enforcement
      setSessionConfig(prev => ({
        ...prev,
        aiConfig: enforcedConfig
      }));

      // Save the enforced config to prevent future conflicts
      if (enforcedConfig.provider) {
        saveProviderConfig(enforcedConfig.provider, enforcedConfig);
      }

      console.log('✅ Streaming mode enforcement applied - autonomous features disabled');
      
      // Notify user about streaming mode enforcement
      addInfoNotification(
        'Streaming Mode Active',
        'Autonomous features automatically disabled for smooth streaming experience.',
        3000
      );
    } else {
      console.log('🛠️ Tools mode active - autonomous features available as configured');
    }

    // Check if this is a voice message with the prefix
    const voiceModePrefix = "Warning: You are in speech mode, make sure to reply in few lines:  \n";
    const isVoiceMessage = content.startsWith(voiceModePrefix);
    
    // **NEW**: Check if content is a JSON API request with duplicate user messages
    let processedContent = content;
    let isJsonApiRequest = false;
    
    try {
      // Try to parse as JSON to detect API request format
      const parsed = JSON.parse(content.trim());
      
      // Check if this looks like an API request with messages array
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)) {
        isJsonApiRequest = true;
        console.log('🔍 Detected JSON API request format');
        
        // Extract unique user messages to prevent duplication
        const userMessages = parsed.messages
          .filter((msg: any) => msg.role === 'user')
          .map((msg: any) => msg.content)
          .filter((content: string, index: number, arr: string[]) => arr.indexOf(content) === index); // Remove duplicates
        
        if (userMessages.length > 0) {
          // Use the last unique user message as the actual content
          processedContent = userMessages[userMessages.length - 1];
          console.log(`✅ Deduplicated ${parsed.messages.filter((msg: any) => msg.role === 'user').length} user messages to 1 unique message`);
          
          // Show info notification about deduplication
          addInfoNotification(
            'JSON Request Processed',
            `Detected and processed JSON API format. Deduplicated ${parsed.messages.filter((msg: any) => msg.role === 'user').length} user messages.`,
            4000
          );
        } else {
          // No user messages found, treat as regular content
          processedContent = content;
          isJsonApiRequest = false;
        }
      }
    } catch (parseError) {
      // Not valid JSON, treat as regular message
      processedContent = content;
      isJsonApiRequest = false;
    }
    
    // For display purposes, use the processed content without voice prefix
    const displayContent = isVoiceMessage ? processedContent.replace(voiceModePrefix, '') : processedContent;
    
    // For AI processing, use the processed content (including prefix if it's a voice message)
    const aiContent = isVoiceMessage ? processedContent : processedContent;

    // Create user message with display content (without voice prefix)
    const userMessage: ClaraMessage = {
      id: generateId(),
      role: 'user',
      content: displayContent, // Display without voice prefix
      timestamp: new Date(),
      attachments: attachments,
      metadata: {
        isVoiceMessage: isVoiceMessage // Mark as voice message for potential styling
      }
    };

    // Add user message to state and get current conversation
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setIsLoading(true);

    // Track background activity
    if (!isVisible) {
      claraBackgroundService.incrementBackgroundActivity();
    }

    // Save user message to database (with display content only)
    try {
      await claraDB.addClaraMessage(currentSession.id, userMessage);
      
      // Update message count in sessions list for real-time sidebar updates
      setSessions(prev => prev.map(s => 
        s.id === currentSession.id 
          ? { 
              ...s, 
              messageCount: (s.messageCount || s.messages?.length || 0) + 1, // +1 for user message
              updatedAt: new Date()
            }
          : s
      ));
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    // Create a temporary streaming message for the assistant
    const streamingMessageId = generateId();
    const streamingMessage: ClaraMessage = {
      id: streamingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      metadata: {
        isStreaming: true,
        model: `${enforcedConfig.provider}:${enforcedConfig.models.text}`,
        temperature: enforcedConfig.parameters.temperature
      }
    };

    // Add the streaming message to state
    setMessages(prev => [...prev, streamingMessage]);

    try {
      // Get conversation context (configurable context window, default 50 messages)
      const contextWindow = enforcedConfig?.contextWindow || 50;
      const rawHistory = currentMessages
        .slice(-contextWindow)  // Take last N messages based on config
        .filter(msg => msg.role !== 'system'); // Exclude system messages

      // Ensure proper user/assistant alternation for API compatibility
      const conversationHistory: ClaraMessage[] = [];
      let lastRole: 'user' | 'assistant' | null = null;
      
      for (const message of rawHistory) {
        // Only include user and assistant messages
        if (message.role === 'user' || message.role === 'assistant') {
          // Ensure alternating pattern - skip consecutive messages of same role
          if (lastRole !== message.role) {
            conversationHistory.push(message);
            lastRole = message.role;
          }
        }
      }
      
      // Ensure the conversation history ends with an assistant message if we have history
      // This prevents starting with user->user pattern when we add the current user message
      if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
        // Remove the last user message to maintain alternating pattern
        conversationHistory.pop();
      }

      console.log(`📚 Prepared ${conversationHistory.length} properly formatted history messages for AI service`);

      // Get system prompt (provider-specific or fallback to default) and enhance with memory data
      const currentProvider = providers.find(p => p.id === enforcedConfig.provider);
      let baseSystemPrompt = enforcedConfig.systemPrompt || 
                          (currentProvider ? getDefaultSystemPrompt(currentProvider, enforcedConfig.artifacts, userInfo || undefined) : 'You are Clara, a helpful AI assistant.');
      
      // Enhance system prompt with memory data
      let systemPrompt = baseSystemPrompt;
      try {
        const enhanceFunction = (getDefaultSystemPrompt as any).enhanceWithMemory;
        if (enhanceFunction) {
          systemPrompt = await enhanceFunction(baseSystemPrompt);
          console.log('🧠 System prompt enhanced with user memory data');
        }
      } catch (error) {
        console.error('🧠 Failed to enhance system prompt with memory:', error);
        // Continue with base system prompt
      }
      
      // Create enhanced streaming callback that updates both message content and status panel
      const enhancedStreamingCallback = (chunk: string) => {
        // Parse status updates from chunk for autonomous agent first
        if (enforcedConfig.autonomousAgent?.enabled && chunk.includes('**')) {
          parseAndUpdateAgentStatus(chunk);
        }

        // Filter out ALL status messages from chat display when autonomous agent is active
        const isStatusMessage = enforcedConfig.autonomousAgent?.enabled && (
          chunk.includes('**AGENT_STATUS:') || 
          chunk.includes('**EXECUTION_PLAN:**') ||
          chunk.includes('**TOOL_EXECUTION:') ||
          chunk.includes('**Loaded') ||
          chunk.includes('MCP tools:**') ||
          chunk.includes('**Task completed**') ||
          chunk.includes('**Auto Mode Session Summary**') ||
          chunk.includes('**Error**') ||
          chunk.includes('Using') && chunk.includes('tool') ||
          chunk.includes('**Step') ||
          chunk.includes('**Autonomous Agent') ||
          chunk.includes('**Planning') ||
          chunk.includes('**Executing') ||
          chunk.includes('**Reflecting')
        );
        
        // Only update message content if it's not a status message
        if (!isStatusMessage) {
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId 
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));
        }
      };

      // Send message with streaming callback and conversation context
      // Use aiContent (with voice prefix) for AI processing
      // IMPORTANT: Use enforcedConfig to ensure streaming mode settings are applied
      const aiMessage = await claraApiService.sendChatMessage(
        aiContent, // Send full content including voice prefix to AI
        enforcedConfig, // Use enforced config instead of original sessionConfig.aiConfig
        attachments,
        systemPrompt,
        conversationHistory, // Pass conversation context
        enhancedStreamingCallback // Use enhanced callback
      );

      // **IMMEDIATE COMPLETION**: Close autonomous agent status panel as soon as streaming completes
      // SIMPLE FIX: Just close it if it's active, no matter what
      if (autonomousAgentStatus.isActive) {
        console.log('🏁 STREAM COMPLETED - CLOSING STATUS PANEL IMMEDIATELY');
        autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
        autonomousAgentStatus.completeAgent('Stream completed', 0); // Close immediately, no delay
      }
      
      // Post-process autonomous agent responses for better UX
      if (enforcedConfig.autonomousAgent?.enabled && aiMessage.content) {
        // **NEW: Final streaming refinement step**
        console.log('🎯 Starting final streaming refinement for autonomous response...');
        
        // Store the raw unfiltered response
        const rawUnfilteredResponse = aiMessage.content;
        
        // Create a refined response using streaming mode
        const refinedResponse = await createRefinedStreamingResponse(
          rawUnfilteredResponse,
          content, // Original user question
          streamingMessageId,
          enforcedConfig,
          conversationHistory,
          providers
        );
        
        if (refinedResponse) {
          aiMessage.content = refinedResponse;
          console.log('✅ Final streaming refinement completed successfully');
        } else {
          // Fallback to post-processing if streaming refinement fails
          const postProcessedContent = await postProcessAutonomousResponse(
            aiMessage.content,
            aiMessage.metadata?.toolsUsed || []
          );
          aiMessage.content = postProcessedContent;
          console.log('⚠️ Streaming refinement failed, using post-processing fallback');
        }
      }

      // **NEW: Automatic artifact detection**
      if (aiMessage.content && aiMessage.content.length > 50) {
        // Check if auto-detection is enabled in user configuration
        const artifactConfig = sessionConfig.aiConfig?.artifacts;
        const autoDetectEnabled = artifactConfig?.autoDetectArtifacts ?? true;
        
        if (autoDetectEnabled) {
          const detectionContext: DetectionContext = {
            userMessage: content,
            conversationHistory: conversationHistory.map((msg: ClaraMessage) => msg.content),
            messageContent: aiMessage.content,
            attachments: attachments,
            // Pass artifact configuration to detection service
            artifactConfig: artifactConfig
          };

          const detectionResult = ArtifactDetectionService.detectArtifacts(detectionContext);
          
          // Add detected artifacts to the AI message
          if (detectionResult.artifacts.length > 0) {
            aiMessage.artifacts = [
              ...(aiMessage.artifacts || []),
              ...detectionResult.artifacts
            ];
            
            // Update message content to cleaned version (with artifact placeholders)
            aiMessage.content = detectionResult.cleanedContent;
            
            // Add detection metadata
            aiMessage.metadata = {
              ...aiMessage.metadata,
              artifactDetection: {
                totalDetected: detectionResult.detectionSummary.totalArtifacts,
                types: detectionResult.detectionSummary.artifactTypes,
                confidence: detectionResult.detectionSummary.detectionConfidence,
                autoDetected: true,
                configUsed: {
                  autoDetectEnabled: true,
                  enabledTypes: Object.entries(artifactConfig || {})
                    .filter(([key, value]) => key.startsWith('enable') && value === true)
                    .map(([key]) => key.replace('enable', '').replace('Artifacts', '').toLowerCase())
                }
              }
            };

            console.log(`🎨 Auto-detected ${detectionResult.artifacts.length} artifacts:`, 
              detectionResult.detectionSummary.artifactTypes.join(', '));
          }
        } else {
          console.log('🎨 Artifact auto-detection is disabled in user configuration');
        }
      }

      // Replace the streaming message with the final message
      let finalMessage = { 
        ...aiMessage, 
        id: streamingMessageId, // Keep the same ID
        metadata: {
          ...aiMessage.metadata,
          isStreaming: false // Mark as complete
        }
      };

      // If autonomous agent was used, create a clean, simple completion message
      if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
        const toolExecutions = autonomousAgentStatus.toolExecutions;
        const completedTools = toolExecutions.filter(tool => tool.status === 'completed');
        const totalSteps = autonomousAgentStatus.status.currentStep;
        
        // **NEW**: Post-process autonomous agent response for clean user presentation
        const cleanedContent = await postProcessAutonomousResponse(
          aiMessage.content, 
          completedTools
        );
        
        // Create enhanced metadata with autonomous completion info
        const enhancedMetadata = {
          ...finalMessage.metadata,
          isStreaming: false
        };
        
        // Add autonomous completion properties
        (enhancedMetadata as any).autonomousCompletion = true;
        (enhancedMetadata as any).toolsUsed = completedTools.map(t => t.name);
        (enhancedMetadata as any).executionSteps = totalSteps;

        finalMessage = {
          ...finalMessage,
          content: cleanedContent,
          metadata: enhancedMetadata
        };

                      // **FINAL SAFETY CHECK**: Last resort completion if all other methods failed
        if (autonomousAgentStatus.status.phase !== 'completed' && autonomousAgentStatus.status.phase !== 'error') {
          console.log('⚠️ Final safety completion - All other completion methods failed');
          console.log('📊 Final safety - Current phase:', autonomousAgentStatus.status.phase);
          console.log('📊 Final safety - Current step:', autonomousAgentStatus.status.currentStep, 'of', autonomousAgentStatus.status.totalSteps);
          
          // Update progress to final step
          const finalStep = autonomousAgentStatus.status.totalSteps || Math.max(autonomousAgentStatus.status.currentStep, 1);
          autonomousAgentStatus.updateProgress(finalStep, 'Task completed (final safety)');
          
          autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
          autonomousAgentStatus.completeAgent('Task completed successfully', 0); // Close immediately
        }
      }

      setMessages(prev => prev.map(msg => 
        msg.id === streamingMessageId ? finalMessage : msg
      ));

              // **BACKUP COMPLETION CHECK**: Only run if immediate completion didn't trigger
        if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive && 
            autonomousAgentStatus.status.phase !== 'completed' && autonomousAgentStatus.status.phase !== 'error') {
          
          console.log('🔄 Backup completion check - Stream completion may have been missed');
          console.log('📊 Backup completion - Current phase:', autonomousAgentStatus.status.phase);
          console.log('📊 Backup completion - Response length:', finalMessage.content.length);
          
          // Update progress to show completion
          const finalStep = autonomousAgentStatus.status.totalSteps || Math.max(autonomousAgentStatus.status.currentStep, 1);
          autonomousAgentStatus.updateProgress(finalStep, 'Task completed');
          
          autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
          autonomousAgentStatus.completeAgent('Task completed successfully', 0); // Close immediately
        }

      // Update latest AI response for auto TTS
      setLatestAIResponse(finalMessage.content);
      setAutoTTSTrigger({
        text: finalMessage.content,
        timestamp: Date.now()
      });

      // Save AI message to database
      try {
        await claraDB.addClaraMessage(currentSession.id, finalMessage);
        
        // **NEW: Automatic Memory Extraction**
        // Process memory extraction if conditions are met (reasonable request size)
        try {
          // Ensure memory extraction always happens for meaningful messages
          if (content.length <= 2000 && content.trim().length > 10) {
            // Trigger memory extraction asynchronously to avoid blocking the UI
            setTimeout(async () => {
              try {
                const extractionResult = await ClaraSweetMemoryAPI.processMemory(
                  content, // User message (display content without voice prefix)
                  finalMessage, // Assistant response
                  conversationHistory, // Conversation context
                  enforcedConfig // AI configuration for memory extraction
                );
                console.log('🧠 Memory extraction completed successfully');
                
                // Show memory toast if new information was learned
                if (extractionResult && extractionResult.confidence > 0.3) {
                  try {
                    const updatedProfile = await ClaraSweetMemoryAPI.getCurrentUserProfile();
                    if (updatedProfile) {
                      claraMemoryToastService.showMemoryToast(updatedProfile);
                    }
                  } catch (toastError) {
                    console.warn('🧠 Memory toast update failed:', toastError);
                  }
                }
              } catch (memoryError) {
                console.warn('🧠 Memory extraction failed:', memoryError);
                // Memory extraction failure shouldn't affect the main flow
              }
            }, 1000); // Small delay to ensure DB operations complete first
          }
        } catch (memoryError) {
          console.warn('🧠 Memory extraction setup failed:', memoryError);
          // Continue with normal flow even if memory extraction fails
        }
        
        // Update message count in sessions list for real-time sidebar updates
        setSessions(prev => prev.map(s => 
          s.id === currentSession.id 
            ? { 
                ...s, 
                messageCount: (s.messageCount || s.messages?.length || 0) + 1, // +1 for AI response (user message already counted)
                updatedAt: new Date()
              }
            : s
        ));
        
        // Enhanced notification for background operation
        if (!isVisible) {
          // More prominent notification when Clara is in background
          // Use display content for notifications (without voice prefix)
          addBackgroundCompletionNotification(
            'Clara Response Ready',
            `Clara has finished responding to: "${displayContent.slice(0, 40)}${displayContent.length > 40 ? '...' : ''}"`
          );
          // Track background notification creation
          claraBackgroundService.onBackgroundNotificationCreated();
        } else {
          // Standard notification when Clara is visible
          addCompletionNotification(
            'Chat Response Complete',
            isVoiceMessage ? 'Clara has finished responding to your voice message.' : 'Clara has finished responding to your message.',
            4000
          );
        }
      } catch (error) {
        console.error('Failed to save AI message:', error);
      }

      // Update session title if it's still "New Chat"
      if (currentSession.title === 'New Chat') {
        // Use display content for session title (without voice prefix)
        const newTitle = displayContent.slice(0, 50) + (displayContent.length > 50 ? '...' : '');
        const updatedSession = {
          ...currentSession,
          title: newTitle,
          messages: [...currentMessages, finalMessage],
          updatedAt: new Date()
        };
        
        setCurrentSession(updatedSession);
        
        // Update in database and sessions list
        try {
          await claraDB.updateClaraSession(currentSession.id, { title: newTitle });
          setSessions(prev => prev.map(s => 
            s.id === currentSession.id ? { ...s, title: newTitle } : s
          ));
        } catch (error) {
          console.error('Failed to update session title:', error);
        }
      }

    } catch (error) {
      console.error('Error generating AI response:', error);
      
      // Check if this is an abort error (user stopped the stream)
      const isAbortError = error instanceof Error && (
        error.message.includes('aborted') ||
        error.message.includes('BodyStreamBuffer was aborted') ||
        error.message.includes('AbortError') ||
        error.name === 'AbortError'
      );
      
      if (isAbortError) {
        console.log('Stream was aborted by user, preserving streamed content');
        
        // Just mark the current streaming message as complete, preserving all streamed content
        setMessages(prev => prev.map(msg => 
          msg.id === streamingMessageId 
            ? { 
                ...msg, 
                metadata: {
                  ...msg.metadata,
                  isStreaming: false,
                  aborted: true
                }
              }
            : msg
        ));

        // Save the aborted message to database with its current content
        try {
          // Get the current message with streamed content from state
          setMessages(prev => {
            const currentMessage = prev.find(msg => msg.id === streamingMessageId);
            if (currentMessage && currentSession) {
              const abortedMessage = {
                ...currentMessage,
                metadata: {
                  ...currentMessage.metadata,
                  isStreaming: false,
                  aborted: true
                }
              };
              // Save to database asynchronously
              claraDB.addClaraMessage(currentSession.id, abortedMessage).catch(dbError => {
                console.error('Failed to save aborted message:', dbError);
              });
            }
            return prev; // Don't actually modify the state here, just access it
          });
        } catch (dbError) {
          console.error('Failed to save aborted message:', dbError);
        }
      } else {
        // Check for specific vision model error
        const isVisionError = error instanceof Error && (
          error.message.includes('image input is not supported') ||
          error.message.includes('vision not supported') ||
          error.message.includes('multimodal not supported') ||
          error.message.includes('images are not supported')
        );
        
        // Check if user sent images but has vision error
        const hasImages = attachments && attachments.some(att => att.type === 'image');
        
        if (isVisionError || (hasImages && error instanceof Error && error.message.includes('server'))) {
          console.log('Vision model error detected - providing helpful guidance');
          
          // Get suggested vision models for better error message
          const suggestedModels = getSuggestedVisionModels();
          const modelSuggestions = suggestedModels.length > 0 
            ? `\n\n**Available vision models for ${sessionConfig.aiConfig?.provider}:**\n${suggestedModels.map(m => `• ${m.name}`).join('\n')}`
            : '\n\n**Note:** No vision models found for the current provider. You may need to download vision models first.';
          
          const errorMessage: ClaraMessage = {
            id: streamingMessageId,
            role: 'assistant',
            content: `I see you've shared an image, but the current model doesn't support image processing.${modelSuggestions}

**To fix this:**
1. Open **Advanced Options** (click the ⚙️ gear icon)
2. Select a **Vision Model** from the dropdown${suggestedModels.length > 0 ? ` (try ${suggestedModels[0].name})` : ''}
3. Or download vision models from **Settings → Model Manager**

**Alternative:** Switch to **Tools Mode** which can automatically select appropriate models for different tasks.

Would you like me to help with text-only responses for now?`,
            timestamp: new Date(),
            metadata: {
              error: error instanceof Error ? error.message : 'Vision model not configured',
              isStreaming: false,
              isVisionError: true,
              suggestedModels: suggestedModels.map(m => m.id)
            }
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId ? errorMessage : msg
          ));

          // Add specific error notification for vision issues
          addErrorNotification(
            'Vision Model Required',
            'Please configure a vision/multimodal model to process images.',
            8000
          );
        } else {
          // Only show generic error message for actual errors (not user aborts)
          const errorMessage: ClaraMessage = {
            id: streamingMessageId,
            role: 'assistant',
            content: 'I apologize, but I encountered an error while processing your request.  Please try again. \n Model Response was : \t'+(error instanceof Error ? error.message : 'Unknown error occurred'),
            timestamp: new Date(),
            metadata: {
              error: error instanceof Error ? error.message : 'Failed to generate response',
              isStreaming: false
            }
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId ? errorMessage : msg
          ));

          // Add error notification
          addErrorNotification(
            'Chat Error',
            'Failed to generate response. Please try again.',
            6000
          );

          // **CRITICAL FIX**: Complete autonomous agent on error to prevent stuck status
          if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
            console.log('🔧 Auto-completing autonomous agent status due to error');
            console.log('📊 Error completion - Current phase:', autonomousAgentStatus.status.phase);
            console.log('📊 Error completion - Current step:', autonomousAgentStatus.status.currentStep, 'of', autonomousAgentStatus.status.totalSteps);
            autonomousAgentStatus.updatePhase('error', 'An error occurred during execution');
            autonomousAgentStatus.errorAgent('Execution failed');
          }
        }

        // Save error message to database
        try {
          // Get the current error message from state to save
          setMessages(prev => {
            const currentMessage = prev.find(msg => msg.id === streamingMessageId);
            if (currentMessage && currentSession) {
              claraDB.addClaraMessage(currentSession.id, currentMessage).catch(dbError => {
                console.error('Failed to save error message:', dbError);
              });
            }
            return prev; // Don't modify state, just access it
          });
        } catch (dbError) {
          console.error('Failed to save error message:', dbError);
        }
      }
    } finally {
      setIsLoading(false);
      // Always decrement background activity when operation completes
      if (!isVisible) {
        claraBackgroundService.decrementBackgroundActivity();
      }

      // **SAFETY NET**: Ensure autonomous agent status completes within reasonable time
      if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
        // Set a timeout to auto-complete if still active after 10 seconds
        setTimeout(() => {
          if (autonomousAgentStatus.isActive && autonomousAgentStatus.status.phase !== 'completed' && autonomousAgentStatus.status.phase !== 'error') {
            console.log('⏰ Safety timeout: Auto-completing stuck autonomous agent status');
            console.log('📊 Safety timeout - Current phase:', autonomousAgentStatus.status.phase);
            console.log('📊 Safety timeout - Current step:', autonomousAgentStatus.status.currentStep, 'of', autonomousAgentStatus.status.totalSteps);
            
            // Update progress to show completion
            autonomousAgentStatus.updateProgress(
              autonomousAgentStatus.status.totalSteps || autonomousAgentStatus.status.currentStep + 1, 
              'Task completed (safety timeout)'
            );
            autonomousAgentStatus.updatePhase('completed', 'Task completed (timeout safety)');
            autonomousAgentStatus.completeAgent('Task completed', 1000);
          }
        }, 10000); // 10 second safety timeout (reduced from 30)
      }
    }
  }, [currentSession, messages, sessionConfig, isVisible, models]);

  // Handle session selection
  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (currentSession?.id === sessionId) return;
    
    try {
      const session = await claraDB.getClaraSession(sessionId);
      if (session) {
        setCurrentSession(session);
        setMessages(session.messages);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, [currentSession]);

  // Ref to prevent multiple simultaneous new chat creations
  const isCreatingNewChatRef = useRef(false);
  const lastNewChatTimeRef = useRef(0);

  // Handle new chat creation
  const handleNewChat = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastCall = now - lastNewChatTimeRef.current;
    
    // If we're already processing or called too recently, ignore this call
    if (isCreatingNewChatRef.current || timeSinceLastCall < 500) {
      console.log('New chat request ignored - already processing or called too recently');
      return;
    }
    
    // Update last call time
    lastNewChatTimeRef.current = now;
    
    // Check if current session is already empty (new chat)
    if (currentSession && 
        (currentSession.title === 'New Chat' || currentSession.title.trim() === '') && 
        messages.length === 0) {
      console.log('Already in empty chat session, not creating new one');
      return;
    }
    
    // Check if there's already an empty session in the sessions list
    const existingEmptySession = sessions.find(session => 
      (session.title === 'New Chat' || session.title.trim() === '') && 
      session.messages.length === 0
    );
    
    if (existingEmptySession) {
      console.log('Found existing empty chat session, switching to it');
      setCurrentSession(existingEmptySession);
      setMessages([]);
      // Reset autonomous agent status when switching to empty chat
      autonomousAgentStatus.reset();
      return;
    }
    
    // Set processing flag
    isCreatingNewChatRef.current = true;
    
    try {
      // No empty session found, create a new one
      console.log('Creating new chat session');
      const newSession = await createNewSession();
      setCurrentSession(newSession);
      setMessages([]);
      // Reset autonomous agent status when starting new chat
      autonomousAgentStatus.reset();
    } finally {
      // Reset processing flag after a short delay
      setTimeout(() => {
        isCreatingNewChatRef.current = false;
      }, 100);
    }
  }, [createNewSession, autonomousAgentStatus, currentSession, messages, sessions]);

  // Handle session actions
  const handleSessionAction = useCallback(async (sessionId: string, action: 'star' | 'archive' | 'delete') => {
    try {
      if (action === 'delete') {
        console.log('Deleting session:', sessionId);
        await claraDB.deleteClaraSession(sessionId);
        
        // Update sessions list immediately
        setSessions(prev => {
          const updated = prev.filter(s => s.id !== sessionId);
          console.log('Updated sessions after delete:', updated.map(s => ({ id: s.id, title: s.title })));
          return updated;
        });
        
        // If we deleted the current session, create a new one or select another
        if (currentSession?.id === sessionId) {
          console.log('Deleted current session, selecting new one...');
          const remainingSessions = sessions.filter(s => s.id !== sessionId);
          if (remainingSessions.length > 0) {
            // Select the most recent remaining session
            const nextSession = await claraDB.getClaraSession(remainingSessions[0].id);
            if (nextSession) {
              setCurrentSession(nextSession);
              setMessages(nextSession.messages);
              console.log('Selected next session:', nextSession.title);
            }
          } else {
            // No sessions left, create a new one
            await handleNewChat();
          }
        }
      } else {
        const updates = action === 'star' 
          ? { isStarred: !sessions.find(s => s.id === sessionId)?.isStarred }
          : { isArchived: !sessions.find(s => s.id === sessionId)?.isArchived };
        
        await claraDB.updateClaraSession(sessionId, updates);
        setSessions(prev => prev.map(s => 
          s.id === sessionId ? { ...s, ...updates } : s
        ));
      }
    } catch (error) {
      console.error(`Failed to ${action} session:`, error);
    }
  }, [sessions, currentSession, handleNewChat]);

  // Handle provider change
  const handleProviderChange = useCallback(async (providerId: string) => {
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) {
        console.error('Provider not found:', providerId);
        return;
      }

      setIsLoadingProviders(true);
      console.log('=== Switching to provider ===');
      console.log('Provider:', provider.name, '(ID:', providerId, ')');
      
      // POCKET PROVIDER AUTO-START LOGIC
      if (provider.type === 'claras-pocket' && window.llamaSwap) {
        try {
          console.log("🚀 Switching to Clara's Core - checking status...");
          // Check if running
          const status = await window.llamaSwap.getStatus?.();
          if (!status?.isRunning) {
            console.log("🔄 Clara's Core is not running, starting for provider switch...");
            addInfoNotification(
              "Starting Clara's Core...",
              'Clara is starting up her local AI service. Please wait a moment.',
              6000
            );
            const result = await window.llamaSwap.start();
            if (!result.success) {
              addErrorNotification(
                "Failed to Start Clara's Core",
                result.error || 'Could not start the local AI service. Please check your installation.',
                10000
              );
              console.error("❌ Failed to start Clara's Core for provider switch:", result.error);
              setIsLoadingProviders(false);
              return;
            }
            console.log("✅ Clara's Core started successfully for provider switch");
            addInfoNotification(
              "Clara's Core Ready",
              'Local AI service is now running and ready!',
              3000
            );
            // Wait a moment for service to be ready
            await new Promise(res => setTimeout(res, 2000));
          } else {
            console.log("✅ Clara's Core is already running for provider switch");
          }
        } catch (err) {
          console.error("⚠️ Error starting Clara's Core for provider switch:", err);
          addErrorNotification(
            "Clara's Core Startup Error",
            err instanceof Error ? err.message : 'Could not communicate with the local AI service.',
            8000
          );
          setIsLoadingProviders(false);
          return;
        }
      }
      // STEP 1: Health check the provider before proceeding (with caching)
      console.log('🏥 Testing provider health...');
      
      // Only show notification for non-cached health checks
      const cached = providerHealthCache.get(provider.id);
      const now = Date.now();
      const isCacheValid = cached && (now - cached.timestamp < HEALTH_CHECK_CACHE_TIME);
      
      if (!isCacheValid) {
        addInfoNotification(
          'Testing Provider',
          `Checking connection to ${provider.name}...`,
          2000
        );
      }

      const isHealthy = await checkProviderHealthCached(provider);
      if (!isHealthy) {
        console.error('❌ Provider health check failed for:', provider.name);
        
        // Show error notification with suggestion
        addErrorNotification(
          'Provider Connection Failed',
          `${provider.name} is not responding. Please check if the service is running or try a different provider.`,
          8000
        );
        
        // Don't proceed with provider switch if health check fails
        setIsLoadingProviders(false);
        return;
      }
      
      console.log('✅ Provider health check passed for:', provider.name);
      if (!isCacheValid) {
        addInfoNotification(
          'Provider Connected',
          `Successfully connected to ${provider.name}`,
          2000
        );
      }
      
      // STEP 2: Update API service to use selected provider
      claraApiService.updateProvider(provider);
      
      // STEP 3: Load models ONLY from the selected provider
      const newModels = await claraApiService.getModels(providerId);
      console.log('Available models for', provider.name, ':', newModels.map(m => ({ id: m.id, name: m.name })));
      setModels(newModels);
      
      // STEP 4: Create models filtered by current provider for validation
      const providerModels = newModels.filter(m => m.provider === providerId);
      console.log('Filtered models for provider validation:', providerModels.map(m => m.id));
      
      // STEP 5: Try to load saved config for this provider
      const savedConfig = loadProviderConfig(providerId);
      
      if (savedConfig) {
        console.log('Found saved config for', provider.name);
        console.log('Saved models:', savedConfig.models);
        
        // STEP 6: Validate saved models against current provider's available models
        const validTextModel = providerModels.find(m => m.id === savedConfig.models.text);
        const validVisionModel = providerModels.find(m => m.id === savedConfig.models.vision);
        const validCodeModel = providerModels.find(m => m.id === savedConfig.models.code);
        
        console.log('Model validation:');
        console.log('- Text model valid:', !!validTextModel, validTextModel?.id);
        console.log('- Vision model valid:', !!validVisionModel, validVisionModel?.id);
        console.log('- Code model valid:', !!validCodeModel, validCodeModel?.id);
        
        // STEP 7: Create clean config with validated models
        const cleanConfig = {
          provider: providerId,
          systemPrompt: savedConfig.systemPrompt, // Preserve saved system prompt
          models: {
            text: validTextModel ? savedConfig.models.text : '',
            vision: validVisionModel ? savedConfig.models.vision : '',
            code: validCodeModel ? savedConfig.models.code : ''
          },
          parameters: {
            ...savedConfig.parameters
          },
          features: {
            ...savedConfig.features
          },
          mcp: savedConfig.mcp || {
            enableTools: true,
            enableResources: true,
            enabledServers: [],
            autoDiscoverTools: true,
            maxToolCalls: 5
          },
          autonomousAgent: savedConfig.autonomousAgent || {
            enabled: true,
            maxRetries: 3,
            retryDelay: 1000,
            enableSelfCorrection: true,
            enableToolGuidance: true,
            enableProgressTracking: true,
            maxToolCalls: 10,
            confidenceThreshold: 0.7,
            enableChainOfThought: true,
            enableErrorLearning: true
          },
          contextWindow: savedConfig.contextWindow || 50
        };
        
        console.log('Applied clean config:', cleanConfig);
        setSessionConfig(prev => ({
          ...prev,
          aiConfig: cleanConfig
        }));
        
        // If any models were invalid, save the cleaned config
        if (!validTextModel || !validVisionModel || !validCodeModel) {
          console.log('Cleaning invalid models from saved config');
          saveProviderConfig(providerId, cleanConfig);
        }
        
      } else {
        console.log('No saved config found for', provider.name, '- creating default');
        
        // STEP 8: Create fresh default config for this provider
        const textModel = providerModels.find(m => m.type === 'text' || m.type === 'multimodal');
        const visionModel = providerModels.find(m => m.supportsVision);
        const codeModel = providerModels.find(m => m.supportsCode);
        
        console.log('Auto-selected models:');
        console.log('- Text:', textModel?.id || 'none');
        console.log('- Vision:', visionModel?.id || 'none');
        console.log('- Code:', codeModel?.id || 'none');
        
        const defaultConfig = {
          provider: providerId,
          systemPrompt: '', // Leave empty to indicate default should be used
          models: {
            text: textModel?.id || '',
            vision: visionModel?.id || '',
            code: codeModel?.id || ''
          },
          parameters: {
            temperature: 0.7,
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
            enableTools: false,           // **CHANGED**: Default to false for streaming mode
            enableRAG: false,
            enableStreaming: true,        // **CHANGED**: Default to streaming mode
            enableVision: true,
            autoModelSelection: false,    // **CHANGED**: Default to manual model selection
            enableMCP: false,              // **CHANGED**: Default to false for streaming mode
            enableStructuredToolCalling: false, // **NEW**: Default to false
            enableNativeJSONSchema: false, // **NEW**: Default to false
          },
          mcp: {
            enableTools: true,
            enableResources: true,
            enabledServers: [],
            autoDiscoverTools: true,
            maxToolCalls: 5
          },
          autonomousAgent: {
            enabled: false,               // **CHANGED**: Default to false for streaming mode
            maxRetries: 3,
            retryDelay: 1000,
            enableSelfCorrection: true,
            enableToolGuidance: true,
            enableProgressTracking: true,
            maxToolCalls: 10,
            confidenceThreshold: 0.7,
            enableChainOfThought: true,
            enableErrorLearning: true
          },
          contextWindow: 50 // Include last 50 messages in conversation history
        };
        
        console.log('Created default config:', defaultConfig);
        setSessionConfig(prev => ({
          ...prev,
          aiConfig: defaultConfig
        }));
        
        // Save the default config
        saveProviderConfig(providerId, defaultConfig);
      }
      
      console.log('=== Provider switch complete ===');
      
    } catch (error) {
      console.error('Failed to change provider:', error);
    } finally {
      setIsLoadingProviders(false);
    }
  }, [providers, checkProviderHealthCached, providerHealthCache, HEALTH_CHECK_CACHE_TIME]);

  // Clear health cache for a specific provider (useful when we know something changed)
  const clearProviderHealthCache = useCallback((providerId?: string) => {
    if (providerId) {
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(providerId);
        return newCache;
      });
      console.log(`🧹 Cleared health cache for provider: ${providerId}`);
    } else {
      setProviderHealthCache(new Map());
      console.log('🧹 Cleared all provider health cache');
    }
  }, []);

  // Handle model change
  const handleModelChange = useCallback((modelId: string, type: 'text' | 'vision' | 'code') => {
    setSessionConfig(prev => {
      if (!prev.aiConfig?.provider) {
        console.error('No provider set when trying to change model');
        return prev;
      }

      // Validate that the selected model belongs to the current provider
      const selectedModel = models.find(m => m.id === modelId);
      if (selectedModel && selectedModel.provider !== prev.aiConfig.provider) {
        console.error('Model validation failed: Model', modelId, 'belongs to provider', selectedModel.provider, 'but current provider is', prev.aiConfig.provider);
        return prev; // Don't update if model is from wrong provider
      }

      console.log('Model change validation passed:', {
        modelId,
        type,
        provider: prev.aiConfig.provider,
        modelProvider: selectedModel?.provider
      });

      const updatedConfig = {
        ...prev,
        aiConfig: {
          ...prev.aiConfig,
          models: {
            ...prev.aiConfig.models,
            [type]: modelId
          }
        }
      };
      
      // Save the updated configuration for the current provider
      if (updatedConfig.aiConfig?.provider) {
        saveProviderConfig(updatedConfig.aiConfig.provider, updatedConfig.aiConfig);
        console.log('Saved model change for provider:', updatedConfig.aiConfig.provider, type, modelId);
      }
      
      return updatedConfig;
    });
  }, [models]);

  // Handle message interactions
  const handleCopyMessage = useCallback(async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      // Could show a toast notification here
      console.log('Message copied:', content);
    } else {
      console.error('Failed to copy message');
    }
  }, []);

  const handleRetryMessage = useCallback(async (messageId: string) => {
    console.log('🔄 Retrying message:', messageId);
    
    if (isLoading) {
      console.warn('Cannot retry while another message is being processed');
      return;
    }
    
    // Find the assistant message being retried
    const assistantMessageIndex = messages.findIndex(m => m.id === messageId);
    if (assistantMessageIndex === -1) {
      console.error('Assistant message not found for retry');
      return;
    }
    
    const assistantMessage = messages[assistantMessageIndex];
    if (assistantMessage.role !== 'assistant') {
      console.error('Can only retry assistant messages');
      return;
    }
    
    // Find the corresponding user message (should be right before the assistant message)
    if (assistantMessageIndex === 0) {
      console.error('No user message found before assistant message');
      return;
    }
    
    const userMessage = messages[assistantMessageIndex - 1];
    if (userMessage.role !== 'user') {
      console.error('Previous message is not a user message');
      return;
    }
    
    console.log('🔄 Retrying with user message:', {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userContent: userMessage.content.substring(0, 100) + (userMessage.content.length > 100 ? '...' : ''),
      hasAttachments: !!userMessage.attachments?.length,
      messageIndex: assistantMessageIndex
    });
    
    try {
      // Remove both messages from the state immediately for responsive UI
      const messagesBeforePair = messages.slice(0, assistantMessageIndex - 1);
      const messagesAfterPair = messages.slice(assistantMessageIndex + 1);
      const updatedMessages = [...messagesBeforePair, ...messagesAfterPair];
      
      setMessages(updatedMessages);
      
      // Delete both messages from the database
      if (currentSession) {
        try {
          await claraDB.deleteMessage(currentSession.id, userMessage.id);
          await claraDB.deleteMessage(currentSession.id, assistantMessage.id);
          console.log('✅ Deleted message pair from database');
        } catch (dbError) {
          console.error('Failed to delete messages from database:', dbError);
          // Continue anyway - the messages are already removed from UI
        }
      }
      
      // Resend the user message (with its current content, which might have been edited)
      console.log('🚀 Resending user message with content:', userMessage.content.substring(0, 100) + '...');
      await handleSendMessage(userMessage.content, userMessage.attachments);
      
    } catch (error) {
      console.error('Failed to retry message:', error);
      // On error, restore the messages to the state
      setMessages(messages);
    }
  }, [messages, handleSendMessage, currentSession, isLoading]);

  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    console.log('Editing message:', messageId, 'new content length:', newContent.length);
    
    // Update message in state immediately for responsive UI
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, content: newContent, timestamp: new Date() }
        : msg
    ));
    
    // Save the edited message to database
    if (currentSession) {
      try {
        await claraDB.updateClaraMessage(currentSession.id, messageId, {
          content: newContent,
          timestamp: new Date()
        });
        console.log('✅ Message edit saved to database');
      } catch (dbError) {
        console.error('Failed to save edited message to database:', dbError);
        // The edit is still visible in the UI, so this is not a critical failure
      }
    }
  }, [currentSession]);

  // Handle stopping generation
  const handleStop = useCallback(() => {
    console.log('Stopping generation...');
    claraApiService.stop();
    setIsLoading(false);
  }, []);

  // Simple preload - only if server is down
  const handlePreloadModel = useCallback(async () => {
    if (!sessionConfig.aiConfig) return;
    
    // Only preload for local services that might be down
    if (sessionConfig.aiConfig.provider === 'claras-pocket') {
      try {
        const status = await window.llamaSwap?.getStatus();
        if (!status?.isRunning) {
          console.log('🚀 Starting local server...');
          await claraApiService.preloadModel(sessionConfig.aiConfig, messages);
        }
        // If server is running, no preload needed - it handles automatically
      } catch (error) {
        console.warn('⚠️ Simple preload check failed:', error);
      }
    }
    // For cloud providers (OpenAI, etc.), no preload needed
  }, [sessionConfig.aiConfig, messages]);

  // Handle session config changes
  const handleConfigChange = useCallback((newConfig: Partial<ClaraSessionConfig>) => {
    setSessionConfig(prev => {
      const updated = { ...prev, ...newConfig };
      
      // Only save provider-specific configuration if we have a valid provider
      if (updated.aiConfig?.provider) {
        // If provider is changing through this config change, don't save mixed config
        if (newConfig.aiConfig?.provider && newConfig.aiConfig.provider !== prev.aiConfig?.provider) {
          console.log('Provider changing through config, will be handled by provider change handler');
          return updated;
        }
        
        // Validate models belong to current provider before saving
        if (newConfig.aiConfig?.models) {
          const currentProvider = updated.aiConfig.provider;
          const models_ = newConfig.aiConfig.models;
          const textModel = models_.text ? models.find(m => m.id === models_.text) : null;
          const visionModel = models_.vision ? models.find(m => m.id === models_.vision) : null;
          const codeModel = models_.code ? models.find(m => m.id === models_.code) : null;
          
          if ((textModel && textModel.provider !== currentProvider) ||
              (visionModel && visionModel.provider !== currentProvider) ||
              (codeModel && codeModel.provider !== currentProvider)) {
            console.error('Config validation failed: Models from wrong provider in config change');
            return prev; // Don't update if models are from wrong provider
          }
        }
        
        saveProviderConfig(updated.aiConfig.provider, updated.aiConfig);
        console.log('Saved config change for provider:', updated.aiConfig.provider, newConfig);
      }
      
      return updated;
    });
  }, [models]);

  // Debug utility for testing provider configurations
  useEffect(() => {
    // Expose debug functions to window for testing
    (window as any).debugClaraProviders = () => {
      console.log('Current provider configurations:');
      console.log('Providers:', providers.map(p => ({ id: p.id, name: p.name, isPrimary: p.isPrimary })));
      console.log('Models:', models.map(m => ({ id: m.id, name: m.name, provider: m.provider })));
      console.log('Current session config:', sessionConfig);
      console.log('Current session:', currentSession?.id, currentSession?.title);
      
      // Debug provider configs from localStorage
      debugProviderConfigs();
    };

    (window as any).clearProviderConfigs = () => {
      clearAllProviderConfigs();
      console.log('Cleared all provider configurations. Refresh to see changes.');
    };

    // Add MCP debugging functions
    (window as any).debugMCP = async () => {
      console.log('=== MCP Debug Info ===');
      console.log('MCP Service Ready:', claraMCPService.isReady());
      console.log('Available Servers:', claraMCPService.getRunningServers());
      console.log('Available Tools:', claraMCPService.getAvailableTools());
      console.log('Session MCP Config:', sessionConfig.aiConfig?.mcp);
    };

    // Add notification testing functions
    (window as any).testNotifications = () => {
      console.log('🔔 Testing notification system...');
      addCompletionNotification('Test Completion', 'This is a test completion notification with chime!');
      setTimeout(() => {
        addErrorNotification('Test Error', 'This is a test error notification.');
      }, 2000);
      setTimeout(() => {
        addInfoNotification('Test Info', 'This is a test info notification.');
      }, 4000);
    };

    (window as any).testCompletionSound = () => {
      console.log('🔔 Testing completion chime...');
      notificationService.testCompletionChime();
    };

    (window as any).setupTestMCP = async () => {
      console.log('🔧 Setting up bundled Python MCP server...');
      const success = await claraMCPService.setupBundledPythonMCPServer();
      if (success) {
        console.log('✅ Bundled Python MCP server setup complete');
        await claraMCPService.refresh();
        console.log('📊 Updated MCP status:', {
          servers: claraMCPService.getRunningServers().length,
          tools: claraMCPService.getAvailableTools().length
        });
      } else {
        console.log('❌ Test MCP server setup failed');
      }
    };

    // Add background service debugging functions
    (window as any).debugBackground = () => {
      console.log('🔄 Clara Background Service Status:');
      console.log(claraBackgroundService.getStatus());
      console.log('Current visibility:', isVisible);
    };

    (window as any).testBackgroundChat = async () => {
      console.log('🧪 Testing background chat...');
      if (isVisible) {
        console.log('⚠️ Clara is currently visible. Switch to another page to test background mode.');
        return;
      }
      
      // Simulate a background message
      await handleSendMessage('This is a test message sent while Clara is in background mode.');
    };

    (window as any).testBackgroundNotification = () => {
      console.log('🧪 Testing persistent background notification...');
      addBackgroundCompletionNotification(
        'Clara Response Ready',
        'This is a persistent notification that requires manual dismissal. It will not auto-hide.'
      );
      claraBackgroundService.onBackgroundNotificationCreated();
    };

    (window as any).testBackgroundService = () => {
      console.log('🧪 Testing Clara background service notification...');
      // Simulate Clara going to background mode
      claraBackgroundService.setBackgroundMode(true);
      
      // Simulate some background activity
      setTimeout(() => {
        claraBackgroundService.incrementBackgroundActivity();
        console.log('📊 Added background activity');
      }, 1000);
      
      setTimeout(() => {
        claraBackgroundService.decrementBackgroundActivity();
        console.log('📊 Removed background activity');
      }, 3000);
      
      // Return to foreground after 5 seconds
      setTimeout(() => {
        claraBackgroundService.setBackgroundMode(false);
        console.log('👁️ Returned to foreground');
      }, 5000);
    };

    // Add refresh functionality to debug utilities
    (window as any).refreshClaraServices = async (force = false) => {
      console.log('🔄 Manually refreshing Clara services...');
      await refreshProvidersAndServices(force);
    };

    (window as any).debugRefreshStatus = () => {
      console.log('🔄 Refresh Status:');
      console.log('- Is refreshing:', isRefreshing);
      console.log('- Last refresh time:', new Date(lastRefreshTime));
      console.log('- Time since last refresh:', Math.round((Date.now() - lastRefreshTime) / 1000), 'seconds');
      console.log('- Current visibility:', isVisible);
      console.log('- Total models:', models.length);
      console.log('- Total providers:', providers.length);
    };

    // Add health cache debugging functions
    (window as any).debugHealthCache = () => {
      console.log('🏥 Provider Health Cache Status:');
      const now = Date.now();
      Array.from(providerHealthCache.entries()).forEach(([providerId, cache]) => {
        const ageSeconds = Math.round((now - cache.timestamp) / 1000);
        const isValid = ageSeconds < (HEALTH_CHECK_CACHE_TIME / 1000);
        console.log(`- ${providerId}: ${cache.isHealthy ? '✅' : '❌'} (${ageSeconds}s ago, ${isValid ? 'valid' : 'expired'})`);
      });
      console.log(`Cache TTL: ${HEALTH_CHECK_CACHE_TIME / 1000} seconds`);
    };

    (window as any).clearHealthCache = (providerId?: string) => {
      clearProviderHealthCache(providerId);
    };

    (window as any).testHealthCachePerformance = async () => {
      const provider = providers[0];
      if (!provider) {
        console.log('No providers available for testing');
        return;
      }

      console.log('🏥 Testing health cache performance...');
      
      // First call (uncached)
      const start1 = performance.now();
      await checkProviderHealthCached(provider);
      const uncachedTime = performance.now() - start1;
      
      // Second call (cached)
      const start2 = performance.now();
      await checkProviderHealthCached(provider);
      const cachedTime = performance.now() - start2;
      
      console.log(`Uncached health check: ${uncachedTime.toFixed(2)}ms`);
      console.log(`Cached health check: ${cachedTime.toFixed(2)}ms`);
      console.log(`Performance improvement: ${((uncachedTime - cachedTime) / uncachedTime * 100).toFixed(1)}%`);
    };

    // Add provider-specific debugging functions
    (window as any).debugProblematicTools = (providerId?: string) => {
      console.log('=== Provider-Specific Problematic Tools Debug ===');
      if (providerId) {
        console.log(`Problematic tools for provider ${providerId}:`);
        const storageKey = `clara-problematic-tools-${providerId}`;
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        console.log('Stored tools:', stored);
      } else {
        console.log('All provider-specific problematic tools:');
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('clara-problematic-tools-')) {
            const stored = JSON.parse(localStorage.getItem(key) || '[]');
            console.log(`${key}:`, stored);
          }
        }
      }
    };

    // Simple debug for current config
    (window as any).debugClara = () => {
      console.log('Clara Status:', {
        provider: sessionConfig.aiConfig?.provider,
        hasModels: models.length > 0,
        isVisible: isVisible,
        currentSession: currentSession?.title
      });
    };

    // Test the new autonomous agent status panel
    (window as any).testAgentStatusPanel = () => {
      console.log('🧪 Testing autonomous agent status panel...');
      
      // Start the agent
      autonomousAgentStatus.startAgent(5);
      
      // Simulate different phases
      setTimeout(() => {
        autonomousAgentStatus.setToolsLoaded(3);
        autonomousAgentStatus.updatePhase('planning', 'Analyzing requirements and creating execution plan...');
      }, 1000);
      
      setTimeout(() => {
        autonomousAgentStatus.setExecutionPlan([
          'Analyze user requirements',
          'Load necessary tools',
          'Execute file operations',
          'Validate results',
          'Complete task'
        ]);
      }, 2000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('executing', 'Executing tools and operations...');
        autonomousAgentStatus.updateProgress(1, 'Starting tool execution...');
        
        // Start some tool executions
        const toolId1 = autonomousAgentStatus.startToolExecution('file_read', 'Reading project files');
        const toolId2 = autonomousAgentStatus.startToolExecution('terminal', 'Running terminal commands');
        
        // Complete first tool after delay
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId1, 'Successfully read 5 files');
          autonomousAgentStatus.updateProgress(2, 'File operations completed');
        }, 2000);
        
        // Complete second tool after delay
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId2, 'Commands executed successfully');
          autonomousAgentStatus.updateProgress(3, 'Terminal operations completed');
        }, 3000);
        
      }, 3000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('reflecting', 'Analyzing results and determining next steps...');
        autonomousAgentStatus.updateProgress(4, 'Analyzing results...');
      }, 6000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
        // Auto-hide after 2 seconds to show clean results
        autonomousAgentStatus.completeAgent('All operations completed successfully!', 2000);
      }, 8000);
      
      console.log('✅ Agent status panel test started. Watch the UI for animations!');
      console.log('📝 The status panel will automatically hide after completion to show clean results in chat.');
    };

    // Test the complete autonomous workflow with auto-hide
    (window as any).testCompleteAutonomousWorkflow = () => {
      console.log('🚀 Testing complete autonomous workflow with auto-hide...');
      
      // Simulate a user message that triggers autonomous mode
      const testMessage: ClaraMessage = {
        id: generateId(),
        role: 'user',
        content: 'Please create a simple React component for me',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, testMessage]);
      
      // Start autonomous agent
      autonomousAgentStatus.startAgent(3);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('planning', 'Creating execution plan...');
        autonomousAgentStatus.setExecutionPlan([
          'Analyze component requirements',
          'Generate React component code',
          'Create example usage'
        ]);
      }, 1000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('executing', 'Generating component...');
        const toolId = autonomousAgentStatus.startToolExecution('code_generator', 'Creating React component');
        
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId, 'Component generated successfully');
          autonomousAgentStatus.updateProgress(3, 'Component creation completed');
        }, 2000);
      }, 2000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('completed', 'Component ready!');
        // Auto-hide after 2 seconds
        autonomousAgentStatus.completeAgent('React component created successfully!', 2000);
        
        // Add the final result message after a short delay
        setTimeout(() => {
          const resultMessage: ClaraMessage = {
            id: generateId(),
            role: 'assistant',
            content: `I've created a React component for you! Here it is:

\`\`\`jsx
import React from 'react';

const MyComponent = ({ title = "Hello World", children }) => {
  return (
    <div className="p-4 bg-blue-50 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-blue-800 mb-2">{title}</h2>
      <div className="text-gray-700">
        {children || "This is a sample React component!"}
      </div>
    </div>
  );
};

export default MyComponent;
\`\`\`

The component is ready to use! You can import it and customize the title and content as needed.`,
            timestamp: new Date(),
            metadata: {
              isStreaming: false,
              autonomousCompletion: true,
              toolsUsed: ['code_generator'],
              executionSteps: 3
            } as any
          };
          
          setMessages(prev => [...prev, resultMessage]);
        }, 2500); // Show result after status panel hides
        
      }, 5000);
      
      console.log('✅ Complete workflow test started. Watch for:');
      console.log('1. 🎯 Professional status panel with live progress (no chat clutter)');
      console.log('2. 🎬 Auto-hide after completion (2 seconds)');
      console.log('3. 💬 Clean, simple result in chat bubble (no duplicate status info)');
    };

    // Test the new autonomous response post-processing
    (window as any).testAutonomousPostProcessing = async () => {
      console.log('🧪 Testing autonomous response post-processing...');
      
      // Example raw response like the user showed
      const rawResponse = `Current Step: Evaluating JavaScript to retrieve detailed location information from the page. Tool Usage: I used mcp_puppeteer_puppeteer_evaluate with "script": "fetch('https://ipinfo.io/json').then(response => response.json()).then(data => JSON.stringify(data));" to fetch and parse the geolocation data from ipinfo.io in a structured format. Result Analysis: The execution returned an object containing detailed location information such as city, region, country, etc.

Here is your current location according to IPInfo:

City: Bangalore
Region: Karnataka
Country: IN (India)
Location Coordinates: 13.0878, 80.2785
Final Answer: Your current location details are as follows:

City: Bangalore
Region: Karnataka
Country: India

The geographic coordinates for your location are approximately 13.0878 latitude and 80.2785 longitude.

If you need any more information or assistance, feel free to ask!

Execution result: {"ip":"34.239.165.21","city":"Bangalore","region":"Karnataka","country":"IN","loc":"13.0878,80.2785","org":"AS17418 Google LLC","postal":"560047"}

Execution result: [ 13.0878, 80.2785 ]

Console output:

Execution result: { "ip": "115.97.58.223", "hostname": "58.97.115.223.hathway.com", "city": "Chennai", "region": "Tamil Nadu", "country": "IN", "loc": "13.0878,80.2785", "org": "AS17488 Hathway IP Over Cable Internet", "postal": "600001", "timezone": "Asia/Kolkata", "readme": "https://ipinfo.io/missingauth" }

Console output:

Execution result: { "ip": "115.97.58.223", "hostname": "58.97.115.223.hathway.com", "city": "Chennai", "region": "Tamil Nadu", "country": "IN", "loc": "13.0878,80.2785", "org": "AS17488 Hathway IP Over Cable Internet", "postal": "600001", "timezone": "Asia/Kolkata", "readme": "https://ipinfo.io/missingauth" }

Console output:

Execution result: undefined

Console output:`;

      const completedTools = [{ name: 'mcp_puppeteer_evaluate' }];
      
      console.log('📝 Raw response (before processing):');
      console.log(rawResponse);
      
      const cleanedResponse = await postProcessAutonomousResponse(rawResponse, completedTools);
      
      console.log('\n✨ Cleaned response (after processing):');
      console.log(cleanedResponse);
      
      console.log('\n🎯 Post-processing complete! The cleaned response removes:');
      console.log('• Console output sections');
      console.log('• Execution result lines');
      console.log('• Tool usage descriptions');
      console.log('• Raw JSON data');
      console.log('• Coordinate arrays');
      console.log('• Multiple newlines');
      console.log('\nAnd creates a clean, user-friendly summary instead!');
    };

    // Test the autonomous agent status panel error fix
    (window as any).testStatusPanelErrorFix = () => {
      console.log('🧪 Testing autonomous agent status panel error fix...');
      
      // Test with minimal status object to ensure no undefined errors
      const testStatus = {
        isActive: true,
        phase: 'initializing' as const,
        message: 'Testing error fix',
        progress: 0,
        currentStep: 0,
        totalSteps: 0,
        toolsLoaded: 0,
        executionPlan: [] // This should prevent the undefined error
      };
      
      console.log('✅ Test status object:', testStatus);
      console.log('✅ executionPlan is defined:', testStatus.executionPlan !== undefined);
      console.log('✅ executionPlan length:', testStatus.executionPlan.length);
      
      // Start the agent to test the actual component
      autonomousAgentStatus.startAgent(3);
      
      setTimeout(() => {
        console.log('✅ Agent started successfully without errors');
        console.log('✅ Current status:', autonomousAgentStatus.status);
        console.log('✅ Tool executions:', autonomousAgentStatus.toolExecutions);
        
        // Stop the agent
        autonomousAgentStatus.stopAgent();
        console.log('✅ Agent stopped successfully');
      }, 1000);
    };

    // Debug current autonomous agent status
    (window as any).debugAutonomousStatus = () => {
      console.log('🔍 === Autonomous Agent Debug Info ===');
      console.log('📊 Is Active:', autonomousAgentStatus.isActive);
      console.log('📊 Current Status:', autonomousAgentStatus.status);
      console.log('📊 Tool Executions:', autonomousAgentStatus.toolExecutions);
      console.log('📊 Current Config - Tools Enabled:', sessionConfig.aiConfig?.features?.enableTools);
      console.log('📊 Current Config - Autonomous Enabled:', sessionConfig.aiConfig?.autonomousAgent?.enabled);
      console.log('📊 Current Config - Streaming:', sessionConfig.aiConfig?.features?.enableStreaming);
      console.log('📊 Current Config - MCP:', sessionConfig.aiConfig?.features?.enableMCP);
      console.log('📊 Provider:', sessionConfig.aiConfig?.provider);
    };

    // Test autonomous agent completion manually
    (window as any).testManualCompletion = () => {
      console.log('🧪 Testing manual autonomous agent completion...');
      if (autonomousAgentStatus.isActive) {
        console.log('🏁 Forcing completion of active autonomous agent');
        autonomousAgentStatus.updatePhase('completed', 'Manual completion test');
        autonomousAgentStatus.completeAgent('Manual test completed', 1500);
      } else {
        console.log('⚠️ No active autonomous agent to complete');
        console.log('📊 Starting test agent first...');
        autonomousAgentStatus.startAgent(3);
        setTimeout(() => {
          console.log('🏁 Now completing test agent');
          autonomousAgentStatus.updatePhase('completed', 'Test completion');
          autonomousAgentStatus.completeAgent('Test completed', 1500);
        }, 2000);
      }
    };

    // Test autonomous agent with auto-completion after stream
    (window as any).testStreamCompletion = () => {
      console.log('🧪 Testing stream completion detection...');
      
      // Start autonomous agent
      autonomousAgentStatus.startAgent(3);
      autonomousAgentStatus.updatePhase('executing', 'Simulating tool execution...');
      autonomousAgentStatus.updateProgress(1, 'Step 1 in progress...');
      
      // Simulate a stream completing after 3 seconds
      setTimeout(() => {
        console.log('🏁 Simulating stream completion...');
        
        // This simulates what happens when the stream completes
        if (autonomousAgentStatus.isActive && autonomousAgentStatus.status.phase !== 'completed') {
          console.log('🔄 Auto-completing due to stream end');
          autonomousAgentStatus.updatePhase('completed', 'Stream completed successfully');
          autonomousAgentStatus.completeAgent('Stream completed successfully', 1500);
        }
      }, 3000);
    };

    // Test completion verification system specifically
    (window as any).testCompletionVerification = async () => {
      console.log('🔍 ====== TESTING COMPLETION VERIFICATION SYSTEM ======');
      
      if (!sessionConfig.aiConfig?.autonomousAgent?.enabled) {
        console.log('🔍 ⚠️ Autonomous agent is not enabled. Enable it first to test verification.');
        console.log('🔍 💡 You can enable it in Advanced Options → Autonomous Agent → Enable');
        return;
      }
      
      if (!sessionConfig.aiConfig?.provider || !sessionConfig.aiConfig?.models?.text) {
        console.log('🔍 ⚠️ No provider or text model configured. Please configure them first.');
        return;
      }
      
      console.log('🔍 ✅ Prerequisites met, testing completion verification...');
      console.log('🔍 📊 Current config:', {
        provider: sessionConfig.aiConfig.provider,
        textModel: sessionConfig.aiConfig.models.text,
        autonomousEnabled: sessionConfig.aiConfig.autonomousAgent.enabled
      });
      
      // Send a simple test message to trigger autonomous mode with verification
      const testMessage = "Please just say hello and tell me you're working correctly.";
      console.log(`🔍 📤 Sending test message: "${testMessage}"`);
      console.log('🔍 🔍 Watch the console for detailed verification logs marked with 🔍');
      
      try {
        await handleSendMessage(testMessage);
        console.log('🔍 ✅ Test message sent. Check the detailed logs above for verification system activity.');
      } catch (error) {
        console.error('🔍 ❌ Test message failed:', error);
      }
    };

    // Quick verification system check
    (window as any).debugVerificationSystem = () => {
      console.log('🔍 ====== VERIFICATION SYSTEM DEBUG INFO ======');
      console.log('🔍 📊 Current Clara Configuration:');
      console.log('  - Provider:', sessionConfig.aiConfig?.provider || 'none');
      console.log('  - Text Model:', sessionConfig.aiConfig?.models?.text || 'none');
      console.log('  - Autonomous Enabled:', sessionConfig.aiConfig?.autonomousAgent?.enabled || false);
      console.log('  - Tools Enabled:', sessionConfig.aiConfig?.features?.enableTools || false);
      console.log('  - MCP Enabled:', sessionConfig.aiConfig?.features?.enableMCP || false);
      console.log('  - Streaming Enabled:', sessionConfig.aiConfig?.features?.enableStreaming || false);
      console.log('');
      console.log('🔍 🔧 API Service Status:');
      console.log('  - Current Provider:', claraApiService.getCurrentProvider()?.name || 'none');
      console.log('  - Current Client:', claraApiService.getCurrentClient() ? 'available' : 'none');
      console.log('');
      console.log('🔍 💡 To test verification:');
      console.log('  1. Enable Autonomous Agent in Advanced Options');
      console.log('  2. Run: testCompletionVerification()');
      console.log('  3. Look for 🔍 logs in console showing verification steps');
    };

    // Add memory debugging functions
    (window as any).debugMemory = () => {
      console.log('🧠 === MEMORY DEBUG INFO ===');
      claraMemoryService.debugMemory();
    };

    (window as any).testMemory = () => {
      console.log('🧪 Testing memory system...');
      
      // Start a test session
      claraMemoryService.startSession('test-session', 'test-user');
      
      // Store some test tool results
      claraMemoryService.storeToolResult({
        toolName: 'test_tool_1',
        success: true,
        result: 'This is a test result from tool 1',
        metadata: { type: 'test' }
      });
      
      claraMemoryService.storeToolResult({
        toolName: 'test_tool_2',
        success: false,
        error: 'Test error from tool 2',
        result: null,
        metadata: { type: 'test' }
      });
      
      // Generate memory context
      const context = claraMemoryService.generateMemoryContext();
      console.log('Generated memory context:', context);
      
      // Show stats
      const stats = claraMemoryService.getMemoryStats();
      console.log('Memory stats:', stats);
      
      // Clear test session
      claraMemoryService.clearCurrentSession();
      console.log('✅ Memory test completed');
    };

    (window as any).clearMemory = () => {
      console.log('🧠 Clearing all memory...');
      claraMemoryService.clearAllMemory();
      console.log('✅ All memory cleared');
    };

    (window as any).memoryStats = () => {
      console.log('🧠 Memory Statistics:');
      const stats = claraMemoryService.getMemoryStats();
      console.log(stats);
    };

    // Test the new structured tool calling system
    (window as any).testStructuredToolCalling = async () => {
      console.log('🧪 Testing structured tool calling system...');
      
      // Import the service
      const { structuredToolCallService } = await import('../services/structuredToolCallService');
      
      // Test parsing a structured response
      const testResponse = `I'll help you open the workspace folder.

\`\`\`json
{
  "reasoning": "The user wants to open the workspace folder. I'll use the mcp_python-tools_open tool to accomplish this.",
  "toolCalls": [
    {
      "toolName": "mcp_python-tools_open",
      "arguments": {},
      "reasoning": "This tool opens the workspace folder as requested"
    }
  ],
  "needsToolExecution": true
}
\`\`\`

Let me execute this for you.`;

      console.log('📝 Test response:', testResponse);
      
      const parsed = structuredToolCallService.parseStructuredResponse(testResponse);
      console.log('📊 Parsed result:', parsed);
      
      if (parsed.needsToolExecution && parsed.toolCalls.length > 0) {
        console.log('🚀 Executing tool calls...');
        const results = await structuredToolCallService.executeStructuredToolCalls(
          parsed.toolCalls,
          (msg) => console.log('📢 Progress:', msg)
        );
        console.log('✅ Tool execution results:', results);
      }
    };

    // Test native JSON Schema vs prompt engineering
    (window as any).testNativeJSONSchemaComparison = async () => {
      console.log('🔬 Testing Native JSON Schema vs Prompt Engineering...');
      
      // Import the service
      const { structuredToolCallService } = await import('../services/structuredToolCallService');
      
      // Mock tools for testing
      const testTools = [
        {
          id: 'mcp_python-tools_open',
          name: 'mcp_python-tools_open',
          description: 'Open workspace folder',
          parameters: [],
          implementation: 'async function() { return "opened"; }',
          isEnabled: true
        },
        {
          id: 'file_reader',
          name: 'file_reader',
          description: 'Read file contents',
          parameters: [
            { name: 'filename', type: 'string', description: 'File to read', required: true }
          ],
          implementation: 'async function() { return "file contents"; }',
          isEnabled: true
        }
      ];

      // Test 1: Generate JSON Schema
      console.log('📋 Generated JSON Schema:');
      const schema = structuredToolCallService.generateToolCallSchema(testTools);
      console.log(JSON.stringify(schema, null, 2));

      // Test 2: Check provider support
      console.log('🔍 Provider Support Check:');
      console.log('OpenAI:', structuredToolCallService.supportsNativeStructuredOutputs('openai'));
      console.log('Ollama:', structuredToolCallService.supportsNativeStructuredOutputs('ollama'));
      console.log('Anthropic:', structuredToolCallService.supportsNativeStructuredOutputs('anthropic'));

      // Test 3: Example API request format
      console.log('📡 Example API Request with Native JSON Schema:');
      const exampleRequest = {
        model: "gpt-4o-2024-08-06",
        messages: [
          {
            role: "system",
            content: "You are Clara, an autonomous AI agent. Accomplish tasks using available tools."
          },
          {
            role: "user", 
            content: "Please list the files in the current directory"
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: schema
        }
      };
      console.log(JSON.stringify(exampleRequest, null, 2));

      console.log('✅ Native JSON Schema test completed!');
    };

    // Control structured output mode
    (window as any).setStructuredOutputMode = (mode: 'force-prompt' | 'native-json-schema') => {
      const { structuredToolCallService } = require('../services/structuredToolCallService');
      
      if (mode === 'force-prompt') {
        structuredToolCallService.setForcePromptBasedMode(true);
        console.log('✅ Forced prompt-based structured outputs for all providers');
      } else {
        structuredToolCallService.setForcePromptBasedMode(false);
        console.log('✅ Using native JSON Schema structured outputs (default)');
      }
      
      console.log(`📊 Current mode: ${structuredToolCallService.getStructuredOutputMode()}`);
    };

    // Check current structured output mode
    (window as any).getStructuredOutputMode = () => {
      const { structuredToolCallService } = require('../services/structuredToolCallService');
      const mode = structuredToolCallService.getStructuredOutputMode();
      console.log(`📊 Current structured output mode: ${mode}`);
      return mode;
    };

    // Test native JSON Schema generation
    (window as any).testNativeJSONSchema = () => {
      console.log('🧪 Testing Native JSON Schema (Default Behavior)...');
      
      const { structuredToolCallService } = require('../services/structuredToolCallService');
      
      // Test tools
      const testTools = [
        {
          id: 'mcp_ClaraTools_py',
          name: 'mcp_ClaraTools_py',
          description: 'Run Python code',
          parameters: [
            { name: 'code', type: 'string', description: 'Python code to execute', required: true }
          ],
          implementation: 'mcp',
          isEnabled: true
        },
        {
          id: 'mcp_ClaraTools_ls',
          name: 'mcp_ClaraTools_ls', 
          description: 'List files',
          parameters: [],
          implementation: 'mcp',
          isEnabled: true
        }
      ];

      // Generate JSON Schema
      const schema = structuredToolCallService.generateToolCallSchema(testTools);
      console.log('📋 Generated JSON Schema:');
      console.log(JSON.stringify(schema, null, 2));

      // Test provider detection
      console.log('\n🔍 Provider Support (Default: Native JSON Schema):');
      console.log('OpenAI:', structuredToolCallService.supportsNativeStructuredOutputs('openai'));
      console.log('Anthropic:', structuredToolCallService.supportsNativeStructuredOutputs('anthropic'));
      console.log('OpenRouter:', structuredToolCallService.supportsNativeStructuredOutputs('openrouter'));
      console.log('Ollama:', structuredToolCallService.supportsNativeStructuredOutputs('ollama'));
      console.log('Unknown/Default:', structuredToolCallService.supportsNativeStructuredOutputs());

      // Show example request that would be sent
      console.log('\n📡 Example API Request (Native JSON Schema):');
      const exampleRequest = {
        model: "any-model",
        messages: [
          {
            role: "system",
            content: "You are Clara, an autonomous AI agent. Accomplish tasks using available tools."
          },
          {
            role: "user",
            content: "run the snake game"
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        top_p: 1,
        response_format: {
          type: "json_schema",
          json_schema: schema
        }
      };
      console.log(JSON.stringify(exampleRequest, null, 2));

      console.log('\n✅ Native JSON Schema is now the default!');
      console.log('💡 This will generate pure JSON responses, not markdown with JSON blocks');
    };

    // Test tool result serialization 
    (window as any).testToolResultSerialization = () => {
      console.log('🧪 Testing Tool Result Serialization...');
      
      // Test various result types
      const testResults = [
        { name: 'string result', result: 'This is a string result' },
        { name: 'object result', result: { search_results: [{ title: 'Test', url: 'https://example.com' }] } },
        { name: 'array result', result: ['item1', 'item2', 'item3'] },
        { name: 'number result', result: 42 },
        { name: 'null result', result: null },
        { name: 'undefined result', result: undefined },
        { name: 'complex object', result: { data: { content: [{ type: 'text', text: 'Found 10 search results' }] } } }
      ];

      console.log('🔍 Testing serialization of different result types:');
      
      testResults.forEach(test => {
        // Simulate the serialization logic
        let serialized = '';
        if (test.result === undefined || test.result === null) {
          serialized = 'No result returned';
        } else if (typeof test.result === 'string') {
          serialized = test.result;
        } else if (typeof test.result === 'object') {
          try {
            serialized = JSON.stringify(test.result, null, 2);
          } catch (error) {
            serialized = '[Object - could not serialize]';
          }
        } else {
          serialized = String(test.result);
        }
        
        console.log(`✅ ${test.name}:`, serialized);
        
        // Check for [object Object] issue
        if (serialized.includes('[object Object]')) {
          console.error(`❌ FOUND [object Object] in ${test.name}!`);
        }
      });

      console.log('\n🎯 All serialization tests completed!');
      console.log('💡 No more [object Object] issues should occur in tool results');
    };

    // **NEW: Test image extraction system**
    (window as any).testImageExtraction = () => {
      console.log('🧪 Testing Image Extraction System...');
      
      const { claraImageExtractionService } = require('../services/claraImageExtractionService');
      
      // Test with mock tool results containing images
      const mockToolResults = [
        {
          toolName: 'puppeteer_screenshot',
          result: {
            content: [
              {
                type: 'text',
                text: "Screenshot 'test_screenshot' taken at 800x600"
              },
              {
                type: 'image',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                mimeType: 'image/png',
                description: 'Test screenshot'
              }
            ]
          }
        }
      ];
      
      const testMessageId = 'test-message-' + Date.now();
      
      try {
        const extractedImages = claraImageExtractionService.extractImagesFromToolResults(
          mockToolResults,
          testMessageId
        );
        
        console.log('✅ Successfully extracted images:', extractedImages);
        console.log('📊 Storage stats:', claraImageExtractionService.getStorageStats());
        
        // Test retrieval
        if (extractedImages.length > 0) {
          const retrievedImage = claraImageExtractionService.getImage(extractedImages[0].id);
          console.log('✅ Successfully retrieved image:', retrievedImage?.id);
          
          const messageImages = claraImageExtractionService.getImagesForMessage(testMessageId);
          console.log('✅ Images for message:', messageImages.length);
        }
        
        console.log('🎉 Image extraction test completed successfully!');
      } catch (error) {
        console.error('❌ Image extraction test failed:', error);
      }
    };

    // **NEW: Test image cleanup**
    (window as any).testImageCleanup = () => {
      console.log('🧹 Testing Image Cleanup...');
      
      const { claraImageExtractionService } = require('../services/claraImageExtractionService');
      
      console.log('📊 Before cleanup:', claraImageExtractionService.getStorageStats());
      
      // Clean images older than 1 second (for testing)
      claraImageExtractionService.cleanupOldImages(1000);
      
      console.log('📊 After cleanup:', claraImageExtractionService.getStorageStats());
      console.log('✅ Image cleanup test completed!');
    };

    // **NEW: Test image extraction with real tool result format**
    (window as any).testRealImageExtraction = () => {
      console.log('🧪 Testing Real Image Extraction Format...');
      
      const { claraImageExtractionService } = require('../services/claraImageExtractionService');
      
      // Test with the actual format from your example
      const realToolResult = {
        toolName: 'mcp_puppeteer_screenshot',
        result: {
          content: [
            {
              type: 'text',
              text: "Screenshot 'claravise.com_screenshot' taken at 800x600"
            },
            {
              type: 'image',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAIAAAAVFBUnAAAAAXNSR0IArs4c6QAAAANzQklUCAgI2+FP4AAACqpJREFUeJzt1sEJACAQwDB1/53PJQqCJBP02T0zCwCAznkdAADwG4MFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAMYMFABAzWAAAsQsBZAetNNHThQAAAABJRU5ErkJggg==',
              mimeType: 'image/png'
            }
          ]
        }
      };
      
      const testMessageId = 'real-test-' + Date.now();
      
      try {
        const extractedImages = claraImageExtractionService.extractImagesFromToolResults(
          [realToolResult],
          testMessageId
        );
        
        console.log('✅ Extracted from real format:', extractedImages);
        
        if (extractedImages.length > 0) {
          const img = extractedImages[0];
          console.log('📷 Image details:', {
            id: img.id,
            toolName: img.toolName,
            mimeType: img.mimeType,
            fileSize: img.fileSize,
            description: img.description,
            storagePath: img.storagePath
          });
          
          // Test if the data URL is valid
          if (img.data.startsWith('data:image/')) {
            console.log('✅ Valid data URL format');
          } else {
            console.warn('⚠️ Invalid data URL format');
          }
        }
        
        console.log('🎉 Real image extraction test completed!');
      } catch (error) {
        console.error('❌ Real image extraction test failed:', error);
      }
    };

    return () => {
      delete (window as any).debugClaraProviders;
      delete (window as any).clearProviderConfigs;
      delete (window as any).debugMCP;
      delete (window as any).testNotifications;
      delete (window as any).testCompletionSound;
      delete (window as any).setupTestMCP;
      delete (window as any).debugBackground;
      delete (window as any).testBackgroundChat;
      delete (window as any).testBackgroundNotification;
      delete (window as any).testBackgroundService;
      delete (window as any).refreshClaraServices;
      delete (window as any).debugRefreshStatus;
      delete (window as any).debugHealthCache;
      delete (window as any).clearHealthCache;
      delete (window as any).testHealthCachePerformance;
      delete (window as any).debugProblematicTools;
      delete (window as any).debugClara;
      delete (window as any).testCompletionVerification;
      delete (window as any).debugVerificationSystem;
      delete (window as any).debugMemory;
      delete (window as any).testMemory;
      delete (window as any).clearMemory;
      delete (window as any).memoryStats;
      delete (window as any).testStructuredToolCalling;
      delete (window as any).testStructuredWithCurrentSession;
      delete (window as any).debugStructuredToolCalling;
      delete (window as any).testNativeJSONSchemaComparison;
      delete (window as any).setStructuredOutputMode;
      delete (window as any).getStructuredOutputMode;
      delete (window as any).testNativeJSONSchema;
      delete (window as any).testToolResultSerialization;
    };
  }, [providers, models, sessionConfig, currentSession, isVisible, handleSendMessage, 
      providerHealthCache, HEALTH_CHECK_CACHE_TIME, checkProviderHealthCached, clearProviderHealthCache]);

  // Subscribe to memory toast state changes
  useEffect(() => {
    const unsubscribe = claraMemoryToastService.subscribe((state) => {
      setMemoryToastState(state);
    });

    return unsubscribe;
  }, []);

  // Initialize with a new session if none exists
  useEffect(() => {
    const initializeSession = async () => {
      // Only create a new session if we're not loading and there are no sessions and no current session
      if (!isLoadingSessions && sessions.length === 0 && !currentSession) {
        const newSession = await createNewSession();
        setCurrentSession(newSession);
        setMessages([]);
        console.log('Created new session as no sessions exist');
      }
    };
    
    initializeSession();
  }, [isLoadingSessions, sessions.length, currentSession, createNewSession]);

  // Listen for global shortcut trigger for new chat
  useEffect(() => {
    let lastTriggerTime = 0;
    const debounceDelay = 300; // 300ms debounce
    
    const handleGlobalNewChat = () => {
      const now = Date.now();
      
      // Check if we're within the debounce period
      if (now - lastTriggerTime < debounceDelay) {
        console.log('Global shortcut debounced - too soon after last trigger');
        return;
      }
      
      lastTriggerTime = now;
      console.log('Global shortcut triggered - creating new chat');
      handleNewChat();
    };

    // Add listener for the trigger-new-chat event
    if (window.electron && window.electron.receive) {
      window.electron.receive('trigger-new-chat', handleGlobalNewChat);
    }

    // Cleanup listener on unmount
    return () => {
      if (window.electron && window.electron.removeListener) {
        window.electron.removeListener('trigger-new-chat', handleGlobalNewChat);
      }
    };
  }, [handleNewChat]);

  

/**
 * Post-process autonomous agent response to create clean, user-friendly output
 */
const postProcessAutonomousResponse = async (
  rawResponse: string, 
  completedTools: any[]
): Promise<string> => {
    try {
      // Remove common autonomous mode artifacts
      let cleanedResponse = rawResponse
        // Remove console output sections (including empty ones)
        .replace(/Console output:\s*\n/gi, '')
        .replace(/Console output:\s*$/gi, '')
        .replace(/Console output:\s*\n\s*\n/gi, '\n')
        
        // Remove execution result sections (all variations)
        .replace(/Execution result:\s*\{[^}]*\}\s*\n/gi, '')
        .replace(/Execution result:\s*\[[^\]]*\]\s*\n/gi, '')
        .replace(/Execution result:\s*"[^"]*"\s*\n/gi, '')
        .replace(/Execution result:\s*\d+\s*\n/gi, '')
        .replace(/Execution result:\s*undefined\s*\n/gi, '')
        .replace(/Execution result:\s*null\s*\n/gi, '')
        .replace(/Execution result:\s*\n/gi, '')
        
        // Remove tool usage and analysis sections
        .replace(/Tool Usage:\s*I used [^.]*\.\s*/gi, '')
        .replace(/Result Analysis:\s*[^.]*\.\s*/gi, '')
        .replace(/Current Step:\s*[^.]*\.\s*/gi, '')
        
        // Remove raw coordinate outputs
        .replace(/\[\s*[0-9.-]+,\s*[0-9.-]+\s*\]\s*\n/gi, '')
        
        // Remove multiple consecutive newlines
        .replace(/\n{3,}/g, '\n\n')
        
        // Remove leading/trailing whitespace
        .trim();

      // If the cleaned response is too short or doesn't have meaningful content, create a summary
      if (cleanedResponse.length < 50 || !cleanedResponse.includes('Final Answer:')) {
        // Try to extract any meaningful content
        const meaningfulContent = extractMeaningfulContent(rawResponse);
        
        if (meaningfulContent) {
          cleanedResponse = `I've completed your request successfully! Here's what I found:

${meaningfulContent}

Is there anything else you'd like me to help you with?`;
        } else {
          cleanedResponse = `✅ **Task completed successfully!**

I've processed your request using autonomous execution. All operations completed successfully.

${completedTools.length > 0 ? `**Tools used:** ${completedTools.map(t => t.name.replace(/_/g, ' ')).join(', ')}` : ''}

Is there anything else you'd like me to help you with?`;
        }
      } else {
        // Clean up the existing response further
        cleanedResponse = cleanedResponse
          // Ensure proper formatting for Final Answer sections
          .replace(/Final Answer:\s*/gi, '## Final Answer\n\n')
          
          // Remove any remaining execution artifacts
          .replace(/Here is your current location according to[^:]*:\s*/gi, '')
          
          // Clean up any remaining artifacts
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
      }

      return cleanedResponse;
      
    } catch (error) {
      console.warn('Error post-processing autonomous response:', error);
      // Fallback to a simple cleaned version
      return rawResponse
        .replace(/Console output:\s*\n/gi, '')
        .replace(/Execution result:[^\n]*\n/gi, '')
        .trim() || '✅ Task completed successfully!';
    }
  };

  /**
   * Extract meaningful content from raw autonomous response
   */
  const extractMeaningfulContent = (rawResponse: string): string | null => {
    try {
      // Look for Final Answer sections first (highest priority)
      const finalAnswerMatch = rawResponse.match(/Final Answer:\s*([\s\S]*?)(?:\n\nExecution result:|Console output:|$)/i);
      if (finalAnswerMatch && finalAnswerMatch[1]) {
        return finalAnswerMatch[1].trim();
      }
      
      // Look for location information in the response text
      const locationTextMatch = rawResponse.match(/City:\s*([^\n]*)\s*Region:\s*([^\n]*)\s*Country:\s*([^\n]*)/i);
      if (locationTextMatch) {
        const coordinates = rawResponse.match(/coordinates?\s*(?:are\s*)?(?:approximately\s*)?([0-9.-]+)[,\s]+([0-9.-]+)/i);
        return `**Your Current Location:**
• **City:** ${locationTextMatch[1].trim()}
• **Region:** ${locationTextMatch[2].trim()}
• **Country:** ${locationTextMatch[3].trim()}
${coordinates ? `• **Coordinates:** ${coordinates[1]}, ${coordinates[2]}` : ''}`;
      }
      
      // Look for structured JSON data and format it nicely
      const jsonMatches = rawResponse.match(/\{[^}]*"city"[^}]*\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        try {
          // Use the last/most complete JSON object
          const data = JSON.parse(jsonMatches[jsonMatches.length - 1]);
          if (data.city && data.region && data.country) {
            return `**Your Current Location:**
• **City:** ${data.city}
• **Region:** ${data.region}
• **Country:** ${data.country === 'IN' ? 'India' : data.country}
${data.loc ? `• **Coordinates:** ${data.loc}` : ''}
${data.timezone ? `• **Timezone:** ${data.timezone}` : ''}`;
          }
        } catch (e) {
          // JSON parsing failed, continue
        }
      }
      
      // Look for any meaningful text content (not execution results)
      const meaningfulLines = rawResponse
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed && 
            !trimmed.includes('Execution result:') &&
            !trimmed.includes('Console output:') &&
            !trimmed.includes('Tool Usage:') &&
            !trimmed.includes('Result Analysis:') &&
            !trimmed.includes('Current Step:') &&
            !trimmed.startsWith('{') && // Skip raw JSON lines
            !trimmed.startsWith('[') && // Skip raw array lines
            trimmed.length > 10 &&
            !trimmed.match(/^[0-9.-]+,\s*[0-9.-]+$/); // Skip coordinate lines
        })
        .join('\n')
        .trim();
      
      return meaningfulLines.length > 30 ? meaningfulLines : null;
      
    } catch (error) {
      console.warn('Error extracting meaningful content:', error);
      return null;
    }
  };

  return (
    <div className="flex h-screen w-full relative" data-clara-container>
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Content with relative z-index */}
      <div className="relative z-10 flex h-screen w-full">
        {/* App Sidebar (main navigation) on the left */}
        <Sidebar activePage="clara" onPageChange={onPageChange} />

        {/* Main: Chat Area */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header */}
          <Topbar 
            userName={userName}
            onPageChange={onPageChange}
          />
          
          {/* Chat Window */}
          <ClaraChatWindow
            messages={messages}
            userName={userName}
            isLoading={isLoading}
            isInitializing={isLoadingSessions || isLoadingProviders}
            onRetryMessage={handleRetryMessage}
            onCopyMessage={handleCopyMessage}
            onEditMessage={handleEditMessage}
          />
          
          {/* Autonomous Agent Status Panel - Above Advanced Options */}
          {autonomousAgentStatus.isActive && (
            <div className="px-6 py-4">
              <div className="max-w-4xl mx-auto">
                <AutonomousAgentStatusPanel
                  status={autonomousAgentStatus.status}
                  toolExecutions={autonomousAgentStatus.toolExecutions}
                  onPause={() => {
                    // TODO: Implement pause functionality
                    console.log('Pause autonomous agent');
                  }}
                  onStop={() => {
                    autonomousAgentStatus.stopAgent();
                    claraApiService.stop();
                  }}
                  onComplete={() => {
                    console.log('🔧 Manual completion triggered by user');
                    autonomousAgentStatus.updatePhase('completed', 'Task completed (manual)');
                    autonomousAgentStatus.completeAgent('Task completed manually', 1000);
                  }}
                  className="mb-4"
                />
              </div>
            </div>
          )}

          {/* Advanced Options Panel - Above Chat Input */}
          {showAdvancedOptions && (
            <div className="px-6 py-4 transition-all duration-300 ease-out transform animate-in slide-in-from-top-2 fade-in-0">
              <div className="max-w-4xl mx-auto transition-all duration-300">
                <AdvancedOptions
                  aiConfig={sessionConfig.aiConfig}
                  onConfigChange={(newConfig) => {
                    const currentConfig = sessionConfig.aiConfig;
                    const updatedConfig: ClaraAIConfig = {
                      provider: newConfig.provider ?? currentConfig.provider,
                      systemPrompt: newConfig.systemPrompt ?? currentConfig.systemPrompt,
                      models: {
                        text: newConfig.models?.text ?? currentConfig.models.text,
                        vision: newConfig.models?.vision ?? currentConfig.models.vision,
                        code: newConfig.models?.code ?? currentConfig.models.code
                      },
                      parameters: {
                        temperature: newConfig.parameters?.temperature ?? currentConfig.parameters.temperature,
                        maxTokens: newConfig.parameters?.maxTokens ?? currentConfig.parameters.maxTokens,
                        topP: newConfig.parameters?.topP ?? currentConfig.parameters.topP,
                        topK: newConfig.parameters?.topK ?? currentConfig.parameters.topK,
                        frequencyPenalty: 0.0,
                        presencePenalty: 0.0,
                        repetitionPenalty: 1.0,
                        minP: 0.0,
                        typicalP: 1.0,
                        seed: null,
                        stop: []
                      },
                      features: {
                        enableTools: newConfig.features?.enableTools ?? currentConfig.features.enableTools,
                        enableRAG: newConfig.features?.enableRAG ?? currentConfig.features.enableRAG,
                        enableStreaming: newConfig.features?.enableStreaming ?? currentConfig.features.enableStreaming,
                        enableVision: newConfig.features?.enableVision ?? currentConfig.features.enableVision,
                        autoModelSelection: newConfig.features?.autoModelSelection ?? currentConfig.features.autoModelSelection,
                        enableMCP: newConfig.features?.enableMCP ?? currentConfig.features.enableMCP,
                        enableStructuredToolCalling: newConfig.features?.enableStructuredToolCalling ?? currentConfig.features.enableStructuredToolCalling,
                        enableNativeJSONSchema: newConfig.features?.enableNativeJSONSchema ?? currentConfig.features.enableNativeJSONSchema,
                      },
                      mcp: newConfig.mcp ? {
                        enableTools: newConfig.mcp.enableTools ?? currentConfig.mcp?.enableTools ?? true,
                        enableResources: newConfig.mcp.enableResources ?? currentConfig.mcp?.enableResources ?? true,
                        enabledServers: newConfig.mcp.enabledServers ?? currentConfig.mcp?.enabledServers ?? [],
                        autoDiscoverTools: newConfig.mcp.autoDiscoverTools ?? currentConfig.mcp?.autoDiscoverTools ?? true,
                        maxToolCalls: newConfig.mcp.maxToolCalls ?? currentConfig.mcp?.maxToolCalls ?? 5
                      } : currentConfig.mcp,
                      autonomousAgent: newConfig.autonomousAgent ? {
                        enabled: newConfig.autonomousAgent.enabled ?? currentConfig.autonomousAgent?.enabled ?? false,
                        maxRetries: newConfig.autonomousAgent.maxRetries ?? currentConfig.autonomousAgent?.maxRetries ?? 3,
                        retryDelay: newConfig.autonomousAgent.retryDelay ?? currentConfig.autonomousAgent?.retryDelay ?? 1000,
                        enableSelfCorrection: newConfig.autonomousAgent.enableSelfCorrection ?? currentConfig.autonomousAgent?.enableSelfCorrection ?? true,
                        enableToolGuidance: newConfig.autonomousAgent.enableToolGuidance ?? currentConfig.autonomousAgent?.enableToolGuidance ?? true,
                        enableProgressTracking: newConfig.autonomousAgent.enableProgressTracking ?? currentConfig.autonomousAgent?.enableProgressTracking ?? true,
                        maxToolCalls: newConfig.autonomousAgent.maxToolCalls ?? currentConfig.autonomousAgent?.maxToolCalls ?? 10,
                        confidenceThreshold: newConfig.autonomousAgent.confidenceThreshold ?? currentConfig.autonomousAgent?.confidenceThreshold ?? 0.7,
                        enableChainOfThought: newConfig.autonomousAgent.enableChainOfThought ?? currentConfig.autonomousAgent?.enableChainOfThought ?? true,
                        enableErrorLearning: newConfig.autonomousAgent.enableErrorLearning ?? currentConfig.autonomousAgent?.enableErrorLearning ?? true
                      } : currentConfig.autonomousAgent,
                      artifacts: newConfig.artifacts ? {
                        enableCodeArtifacts: newConfig.artifacts.enableCodeArtifacts ?? currentConfig.artifacts?.enableCodeArtifacts ?? true,
                        enableChartArtifacts: newConfig.artifacts.enableChartArtifacts ?? currentConfig.artifacts?.enableChartArtifacts ?? true,
                        enableTableArtifacts: newConfig.artifacts.enableTableArtifacts ?? currentConfig.artifacts?.enableTableArtifacts ?? true,
                        enableMermaidArtifacts: newConfig.artifacts.enableMermaidArtifacts ?? currentConfig.artifacts?.enableMermaidArtifacts ?? true,
                        enableHtmlArtifacts: newConfig.artifacts.enableHtmlArtifacts ?? currentConfig.artifacts?.enableHtmlArtifacts ?? true,
                        enableMarkdownArtifacts: newConfig.artifacts.enableMarkdownArtifacts ?? currentConfig.artifacts?.enableMarkdownArtifacts ?? true,
                        enableJsonArtifacts: newConfig.artifacts.enableJsonArtifacts ?? currentConfig.artifacts?.enableJsonArtifacts ?? true,
                        enableDiagramArtifacts: newConfig.artifacts.enableDiagramArtifacts ?? currentConfig.artifacts?.enableDiagramArtifacts ?? true,
                        autoDetectArtifacts: newConfig.artifacts.autoDetectArtifacts ?? currentConfig.artifacts?.autoDetectArtifacts ?? true,
                        maxArtifactsPerMessage: newConfig.artifacts.maxArtifactsPerMessage ?? currentConfig.artifacts?.maxArtifactsPerMessage ?? 10
                      } : currentConfig.artifacts,
                      contextWindow: newConfig.contextWindow ?? currentConfig.contextWindow
                    };
                    handleConfigChange({ aiConfig: updatedConfig });
                  }}
                  providers={providers}
                  models={models}
                  onProviderChange={handleProviderChange}
                  onModelChange={handleModelChange}
                  show={showAdvancedOptions}
                  userInfo={userInfo || undefined}
                />
              </div>
            </div>
          )}
          
          {/* Chat Input */}
          <ClaraAssistantInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading || isLoadingProviders}
            sessionConfig={sessionConfig}
            onConfigChange={handleConfigChange}
            providers={providers}
            models={models}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
            onStop={handleStop}
            onNewChat={handleNewChat}
            messages={messages}
            setMessages={setMessages}
            currentSession={currentSession}
            setSessions={setSessions}
            autoTTSText={latestAIResponse}
            autoTTSTrigger={autoTTSTrigger}
            onPreloadModel={handlePreloadModel}
            showAdvancedOptionsPanel={showAdvancedOptions}
            onAdvancedOptionsToggle={setShowAdvancedOptions}
            autonomousAgentStatus={{
              isActive: autonomousAgentStatus.isActive,
              completeAgent: autonomousAgentStatus.completeAgent
            }}
          />
        </div>

        {/* Clara Chat History Sidebar on the right */}
        <ClaraSidebar 
          sessions={sessions}
          currentSessionId={currentSession?.id}
          isLoading={isLoadingSessions}
          isLoadingMore={isLoadingMoreSessions}
          hasMoreSessions={hasMoreSessions}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onSessionAction={handleSessionAction}
          onLoadMore={loadMoreSessions}
        />
      </div>

      {/* No Models Available / Service Starting Modal */}
      {(showNoModelsModal || serviceStartupStatus.isStarting) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 m-4 max-w-md w-full mx-auto transform transition-all duration-300 ease-out scale-100 animate-in fade-in-0 zoom-in-95">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                serviceStartupStatus.isStarting 
                  ? 'bg-yellow-100 dark:bg-yellow-900' 
                  : 'bg-blue-100 dark:bg-blue-900'
              }`}>
                {serviceStartupStatus.isStarting ? (
                  // Loading/Starting icon
                  <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  // No models icon
                  <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
              {serviceStartupStatus.isStarting 
                ? `${serviceStartupStatus.serviceName} Starting Up`
                : 'No AI Models Available'
              }
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
              {serviceStartupStatus.isStarting ? (
                <>
                  Clara is starting up her AI services for you. This process may take a moment as we prepare your models and initialize the system.
                  {serviceStartupStatus.phase && (
                    <span className="block mt-2 text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                      Current status: {serviceStartupStatus.phase}
                    </span>
                  )}
                </>
              ) : (
                <>
                  You don't seem to have any AI models downloaded yet. To start chatting with Clara, 
                  you'll need to download at least one model from the Model Manager.
                </>
              )}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              {serviceStartupStatus.isStarting ? (
                // Service starting - show waiting state
                <div className="w-full bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 font-semibold py-3 px-6 rounded-lg flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Please wait...</span>
                </div>
              ) : (
                // No models - show action button
                <button
                  onClick={() => onPageChange('settings')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Go to Model Manager</span>
                </button>
              )}
              
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {serviceStartupStatus.isStarting 
                  ? 'This dialog will close automatically when the service is ready'
                  : 'This dialog will disappear once you have downloaded a model'
                }
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Clara Sweet Memory Component */}
      <ClaraSweetMemory />

      {/* Clara Memory Learning Toast */}
      <ClaraMemoryToast
        isVisible={memoryToastState.isVisible}
        onHide={() => claraMemoryToastService.hideMemoryToast()}
        knowledgeLevel={memoryToastState.knowledgeLevel}
        learnedInfo={memoryToastState.learnedInfo}
        duration={4000}
      />
    </div>
  );
};

export default ClaraAssistant; 
