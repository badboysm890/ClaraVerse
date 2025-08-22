/**
 * angela Memory Service
 * 
 * Temporary memory system that stores tool results in localStorage
 * for use during reflection and refinement phases of autonomous agent execution.
 * Memory is cleared after each session completion.
 */

export interface MemoryToolResult {
  id: string;
  toolName: string;
  timestamp: number;
  success: boolean;
  result: any;
  error?: string;
  metadata?: {
    type?: string;
    server?: string;
    toolName?: string;
    [key: string]: any;
  };
}

export interface MemorySession {
  sessionId: string;
  userId: string;
  startTime: number;
  toolResults: MemoryToolResult[];
  lastUpdated: number;
}

class angelaMemoryService {
  private static instance: angelaMemoryService;
  private readonly MEMORY_KEY = 'angela-temp-memory';
  private readonly MAX_MEMORY_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private currentSessionId: string | null = null;

  private constructor() {
    this.cleanup();
  }

  public static getInstance(): angelaMemoryService {
    if (!angelaMemoryService.instance) {
      angelaMemoryService.instance = new angelaMemoryService();
    }
    return angelaMemoryService.instance;
  }

  /**
   * Start a new memory session
   */
  public startSession(sessionId: string, userId: string = 'default'): void {
    console.log('🧠 Starting memory session:', sessionId);
    
    this.currentSessionId = sessionId;
    
    const memory = this.getMemory();
    const existingSession = memory.sessions.find(s => s.sessionId === sessionId);
    
    if (!existingSession) {
      const newSession: MemorySession = {
        sessionId,
        userId,
        startTime: Date.now(),
        toolResults: [],
        lastUpdated: Date.now()
      };
      
      memory.sessions.push(newSession);
      this.saveMemory(memory);
      
      console.log('🧠 Created new memory session:', sessionId);
    } else {
      console.log('🧠 Resumed existing memory session:', sessionId);
    }
  }

  /**
   * Store a tool result in memory
   */
  public storeToolResult(toolResult: {
    toolName: string;
    success: boolean;
    result: any;
    error?: string;
    metadata?: any;
  }): void {
    if (!this.currentSessionId) {
      console.warn('🧠 No active memory session - cannot store tool result');
      return;
    }

    const memoryResult: MemoryToolResult = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolName: toolResult.toolName,
      timestamp: Date.now(),
      success: toolResult.success,
      result: toolResult.result,
      error: toolResult.error,
      metadata: toolResult.metadata
    };

    const memory = this.getMemory();
    const session = memory.sessions.find(s => s.sessionId === this.currentSessionId);
    
    if (session) {
      session.toolResults.push(memoryResult);
      session.lastUpdated = Date.now();
      this.saveMemory(memory);
      
      console.log(`🧠 Stored tool result: ${toolResult.toolName} (success: ${toolResult.success})`);
    } else {
      console.warn('🧠 Session not found for storing tool result:', this.currentSessionId);
    }
  }

  /**
   * Get all tool results for the current session
   */
  public getSessionToolResults(): MemoryToolResult[] {
    if (!this.currentSessionId) {
      return [];
    }

    const memory = this.getMemory();
    const session = memory.sessions.find(s => s.sessionId === this.currentSessionId);
    
    return session?.toolResults || [];
  }

  /**
   * Generate memory context for reflection/refinement
   */
  public generateMemoryContext(): string {
    const toolResults = this.getSessionToolResults();
    
    if (toolResults.length === 0) {
      return '';
    }

    console.log(`🧠 Generating memory context with ${toolResults.length} tool results`);

    let memoryContext = '\n\n## 🧠 MEMORY CONTEXT - Previous Tool Results\n\n';
    memoryContext += 'The following tool results were executed during this session:\n\n';

    toolResults.forEach((result, index) => {
      memoryContext += `### Tool ${index + 1}: ${result.toolName}\n`;
      memoryContext += `- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
      memoryContext += `- **Time**: ${new Date(result.timestamp).toLocaleTimeString()}\n`;
      
      if (result.success && result.result) {
        // Format the result based on its type
        let formattedResult = '';
        
        if (typeof result.result === 'string') {
          // Truncate long strings
          formattedResult = result.result.length > 200 
            ? result.result.substring(0, 200) + '...'
            : result.result;
        } else if (typeof result.result === 'object') {
          try {
            formattedResult = JSON.stringify(result.result, null, 2);
            // Truncate long JSON
            if (formattedResult.length > 300) {
              formattedResult = formattedResult.substring(0, 300) + '...';
            }
          } catch (e) {
            formattedResult = '[Object - could not stringify]';
          }
        } else {
          formattedResult = String(result.result);
        }
        
        memoryContext += `- **Result**: ${formattedResult}\n`;
      }
      
      if (!result.success && result.error) {
        memoryContext += `- **Error**: ${result.error}\n`;
      }
      
      if (result.metadata?.type) {
        memoryContext += `- **Type**: ${result.metadata.type}\n`;
      }
      
      memoryContext += '\n';
    });

    memoryContext += '**Use this context to provide accurate and informed responses about what was accomplished.**\n\n';
    
    return memoryContext;
  }

  /**
   * Clear memory for the current session
   */
  public clearCurrentSession(): void {
    if (!this.currentSessionId) {
      return;
    }

    const memory = this.getMemory();
    memory.sessions = memory.sessions.filter(s => s.sessionId !== this.currentSessionId);
    this.saveMemory(memory);
    
    console.log('🧠 Cleared memory for session:', this.currentSessionId);
    this.currentSessionId = null;
  }

  /**
   * Clear all memory
   */
  public clearAllMemory(): void {
    localStorage.removeItem(this.MEMORY_KEY);
    this.currentSessionId = null;
    console.log('🧠 Cleared all memory');
  }

  /**
   * Get memory statistics
   */
  public getMemoryStats(): {
    totalSessions: number;
    totalToolResults: number;
    currentSessionResults: number;
    oldestSession?: Date;
    newestSession?: Date;
  } {
    const memory = this.getMemory();
    const currentResults = this.getSessionToolResults();
    
    let totalToolResults = 0;
    let oldestTime = Infinity;
    let newestTime = 0;
    
    memory.sessions.forEach(session => {
      totalToolResults += session.toolResults.length;
      if (session.startTime < oldestTime) oldestTime = session.startTime;
      if (session.lastUpdated > newestTime) newestTime = session.lastUpdated;
    });

    return {
      totalSessions: memory.sessions.length,
      totalToolResults,
      currentSessionResults: currentResults.length,
      oldestSession: oldestTime !== Infinity ? new Date(oldestTime) : undefined,
      newestSession: newestTime > 0 ? new Date(newestTime) : undefined
    };
  }

  /**
   * Get memory from localStorage
   */
  private getMemory(): { sessions: MemorySession[] } {
    try {
      const stored = localStorage.getItem(this.MEMORY_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('🧠 Failed to parse memory from localStorage:', error);
    }
    
    return { sessions: [] };
  }

  /**
   * Save memory to localStorage
   */
  private saveMemory(memory: { sessions: MemorySession[] }): void {
    try {
      localStorage.setItem(this.MEMORY_KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('🧠 Failed to save memory to localStorage:', error);
    }
  }

  /**
   * Cleanup old memory entries
   */
  private cleanup(): void {
    const memory = this.getMemory();
    const now = Date.now();
    
    const validSessions = memory.sessions.filter(session => {
      const age = now - session.lastUpdated;
      return age < this.MAX_MEMORY_AGE;
    });
    
    if (validSessions.length !== memory.sessions.length) {
      console.log(`🧠 Cleaned up ${memory.sessions.length - validSessions.length} old memory sessions`);
      this.saveMemory({ sessions: validSessions });
    }
  }

  /**
   * Debug function to inspect memory
   */
  public debugMemory(): void {
    const memory = this.getMemory();
    const stats = this.getMemoryStats();
    
    console.log('🧠 === MEMORY DEBUG INFO ===');
    console.log('Current Session ID:', this.currentSessionId);
    console.log('Memory Stats:', stats);
    console.log('All Sessions:', memory.sessions.map(s => ({
      id: s.sessionId,
      toolCount: s.toolResults.length,
      lastUpdated: new Date(s.lastUpdated).toLocaleString()
    })));
    
    if (this.currentSessionId) {
      const currentResults = this.getSessionToolResults();
      console.log('Current Session Tools:', currentResults.map(r => ({
        tool: r.toolName,
        success: r.success,
        time: new Date(r.timestamp).toLocaleTimeString()
      })));
    }
  }

  /**
   * Check if a tool was recently executed successfully
   */
  public hasRecentSuccessfulExecution(toolName: string, withinMinutes: number = 5): boolean {
    const toolResults = this.getSessionToolResults();
    const cutoffTime = Date.now() - (withinMinutes * 60 * 1000);
    
    const recentSuccessfulExecution = toolResults.find(result => 
      result.toolName === toolName && 
      result.success && 
      result.timestamp > cutoffTime
    );
    
    if (recentSuccessfulExecution) {
      console.log(`🔍 Found recent successful execution of ${toolName} at ${new Date(recentSuccessfulExecution.timestamp).toLocaleTimeString()}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get the last successful result for a specific tool
   */
  public getLastSuccessfulResult(toolName: string): MemoryToolResult | null {
    const toolResults = this.getSessionToolResults();
    
    // Find the most recent successful execution of this tool
    const successfulResults = toolResults
      .filter(result => result.toolName === toolName && result.success)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return successfulResults.length > 0 ? successfulResults[0] : null;
  }

  /**
   * Check if the current request appears to be a duplicate based on recent tool executions
   */
  public isDuplicateRequest(userMessage: string): { isDuplicate: boolean; lastResult?: MemoryToolResult } {
    const toolResults = this.getSessionToolResults();
    const recentTime = Date.now() - (5 * 60 * 1000); // 5 minutes
    
    // Check for recent successful tool executions
    const recentSuccessfulTools = toolResults.filter(result => 
      result.success && 
      result.timestamp > recentTime &&
      result.toolName !== 'user_message' &&
      result.toolName !== 'model_response' &&
      result.toolName !== 'follow_up_response'
    );
    
    if (recentSuccessfulTools.length === 0) {
      return { isDuplicate: false };
    }
    
    // Check if the user message matches patterns that were recently fulfilled
    const fileListingPatterns = [
      'list the files',
      'show me the files',
      'what files are',
      'directory contents',
      'folder contents',
      'ls',
      'dir'
    ];
    
    const isFileListingRequest = fileListingPatterns.some(pattern => 
      userMessage.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isFileListingRequest) {
      const recentFileListingTool = recentSuccessfulTools.find(result => 
        result.toolName === 'mcp_python-tools_sh' || 
        result.toolName === 'mcp_python-tools_ls'
      );
      
      if (recentFileListingTool) {
        console.log(`🔍 Detected duplicate file listing request - tool ${recentFileListingTool.toolName} executed at ${new Date(recentFileListingTool.timestamp).toLocaleTimeString()}`);
        return { 
          isDuplicate: true, 
          lastResult: recentFileListingTool 
        };
      }
    }
    
    return { isDuplicate: false };
  }
}

// Export singleton instance
export const angelaMemoryService = angelaMemoryService.getInstance(); 
