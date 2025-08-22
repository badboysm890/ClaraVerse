// Token Limit Recovery Service
// Handles intelligent context compression and task continuation

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface ToolResult {
  name: string;
  content: string;
  args?: any;
}

interface TokenLimitError {
  message: string;
  tokensRequested: number;
  maxTokens: number;
  messagesTokens: number;
  completionTokens: number;
}

interface ProgressSummary {
  originalTask: string;
  progress: {
    completed: string[];
    currentState: string;
    nextSteps: string[];
    dataCollected: any;
    executionId: string;
    timestamp: number;
  };
}

interface RecoveryData {
  originalUserQuery: string;
  progressSummary: ProgressSummary;
  lastFourMessages: ChatMessage[];
  compressedContext: string;
  toolResults: ToolResult[];
  executionId: string;
  recoveryCount: number;
}

interface ExecutionTrace {
  id: string;
  timestamp: number;
  phase: 'original' | 'recovery' | 'completion';
  messages: ChatMessage[];
  tokenUsage: {
    estimated: number;
    actual?: number;
  };
  progressSummary?: ProgressSummary;
  results?: any;
  error?: string;
}

class TokenLimitRecoveryService {
  private static instance: TokenLimitRecoveryService;
  private dbName = 'angela_execution_traces';
  private db: IDBDatabase | null = null;
  private apiClient: any; // Will be injected

  static getInstance(): TokenLimitRecoveryService {
    if (!TokenLimitRecoveryService.instance) {
      TokenLimitRecoveryService.instance = new TokenLimitRecoveryService();
    }
    return TokenLimitRecoveryService.instance;
  }

  setApiClient(apiClient: any) {
    this.apiClient = apiClient;
  }

  // Initialize IndexedDB for execution tracking
  async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Execution traces store
        if (!db.objectStoreNames.contains('execution_traces')) {
          const traceStore = db.createObjectStore('execution_traces', { keyPath: 'id' });
          traceStore.createIndex('timestamp', 'timestamp');
          traceStore.createIndex('phase', 'phase');
        }
        
        // Results store for persistence
        if (!db.objectStoreNames.contains('execution_results')) {
          const resultStore = db.createObjectStore('execution_results', { keyPath: 'executionId' });
          resultStore.createIndex('timestamp', 'timestamp');
          resultStore.createIndex('taskType', 'taskType');
        }
      };
    });
  }

  // Store execution trace in IndexedDB
  async storeExecutionTrace(trace: ExecutionTrace): Promise<void> {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['execution_traces'], 'readwrite');
      const store = transaction.objectStore('execution_traces');
      const request = store.put(trace);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`📊 [TRACE] Stored execution trace: ${trace.id} (${trace.phase})`);
        resolve();
      };
    });
  }

  // Store execution results persistently
  async storeExecutionResult(executionId: string, taskType: string, results: any): Promise<void> {
    if (!this.db) await this.initializeDB();
    
    const resultData = {
      executionId,
      taskType,
      results,
      timestamp: Date.now(),
      status: 'completed'
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['execution_results'], 'readwrite');
      const store = transaction.objectStore('execution_results');
      const request = store.put(resultData);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`💾 [RESULT] Stored execution result: ${executionId}`);
        resolve();
      };
    });
  }

  // Retrieve execution results
  async getExecutionResult(executionId: string): Promise<any> {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['execution_results'], 'readonly');
      const store = transaction.objectStore('execution_results');
      const request = store.get(executionId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // Main error detection and recovery handler
  async handleTokenLimitError(
    error: TokenLimitError, 
    messages: ChatMessage[], 
    executionId?: string
  ): Promise<ChatMessage[]> {
    console.log("🔄 [RECOVERY] Initiating intelligent context compression...");
    
    const currentExecutionId = executionId || this.generateExecutionId();
    
    // Store original execution trace
    await this.storeExecutionTrace({
      id: `${currentExecutionId}_original`,
      timestamp: Date.now(),
      phase: 'original',
      messages: messages,
      tokenUsage: {
        estimated: error.tokensRequested,
        actual: error.tokensRequested
      },
      error: error.message
    });

    // Extract recovery data
    const recovery = await this.extractRecoveryData(messages, currentExecutionId);
    
    // Generate progress summary
    const progressSummary = await this.createProgressSummary(recovery.toolResults, messages);
    recovery.progressSummary = progressSummary;
    
    // Compress older context using LLM
    const compressedContext = await this.compressOlderMessagesWithLLM(
      messages.slice(0, -4)
    );
    recovery.compressedContext = compressedContext;
    
    // Reconstruct context
    const reconstructedMessages = await this.reconstructContext(recovery);
    
    // Store recovery trace
    await this.storeExecutionTrace({
      id: `${currentExecutionId}_recovery`,
      timestamp: Date.now(),
      phase: 'recovery',
      messages: reconstructedMessages,
      tokenUsage: {
        estimated: this.estimateTokenCount(reconstructedMessages)
      },
      progressSummary: progressSummary
    });
    
    console.log(`✅ [RECOVERY] Context compressed from ${messages.length} to ${reconstructedMessages.length} messages`);
    console.log(`📊 [RECOVERY] Token reduction: ${error.tokensRequested} → ${this.estimateTokenCount(reconstructedMessages)}`);
    
    return reconstructedMessages;
  }

  // Extract recovery data from messages
  private async extractRecoveryData(messages: ChatMessage[], executionId: string): Promise<RecoveryData> {
    const originalUserQuery = this.extractOriginalUserQuery(messages);
    const toolResults = this.extractToolResults(messages);
    const lastFourMessages = messages.slice(-4);
    
    return {
      originalUserQuery,
      progressSummary: {} as ProgressSummary, // Will be filled later
      lastFourMessages,
      compressedContext: '', // Will be filled later
      toolResults,
      executionId,
      recoveryCount: this.countPreviousRecoveries(messages)
    };
  }

  // Create structured progress summary
  private async createProgressSummary(toolResults: any[], messages: ChatMessage[]): Promise<ProgressSummary> {
    const originalTask = this.extractOriginalUserQuery(messages);
    const executionId = this.generateExecutionId();
    
    // Analyze tool results to determine progress
    const completedActions = [];
    const dataCollected = {
      commenterList: [],
      postsIdentified: [],
      profilesAccessed: [],
      errors: []
    };
    
    // Process tool results
    for (const result of toolResults) {
      if (result.name === 'mcp_browsermcp_browser_navigate') {
        completedActions.push(`✅ Navigated to: ${result.args?.url || 'page'}`);
      } else if (result.name === 'mcp_browsermcp_browser_snapshot') {
        completedActions.push(`✅ Captured page structure`);
      } else if (result.name === 'mcp_browsermcp_browser_click') {
        completedActions.push(`✅ Clicked: ${result.args?.element || 'element'}`);
      }
      
      // Extract discovered data
      if (result.content && typeof result.content === 'string') {
        const linkMatches = result.content.match(/linkedin\.com\/in\/[\w-]+/g);
        if (linkMatches) {
          dataCollected.profilesAccessed.push(...linkMatches);
        }
        
        const commentMatches = result.content.match(/(\d+)\s*comments?/g);
        if (commentMatches) {
          dataCollected.postsIdentified.push(...commentMatches);
        }
      }
    }
    
    // Determine current state and next steps
    const currentState = this.determineCurrentState(messages, toolResults);
    const nextSteps = this.generateNextSteps(currentState, originalTask);
    
    return {
      originalTask,
      progress: {
        completed: completedActions,
        currentState,
        nextSteps,
        dataCollected,
        executionId,
        timestamp: Date.now()
      }
    };
  }

  // LLM-based context compression
  private async compressOlderMessagesWithLLM(olderMessages: ChatMessage[]): Promise<string> {
    if (!this.apiClient) {
      throw new Error("API client not initialized for compression");
    }
    
    const compressionPrompt = `
    Compress this conversation history into essential information only (max 2000 tokens).
    
    FOCUS ON:
    - Tool results and discovered data
    - Important navigation steps
    - User intent and goals
    - Current execution state
    - Key discoveries and elements found
    
    REMOVE:
    - Redundant page snapshots
    - Repetitive tool calls
    - Verbose HTML content
    - Excessive debug information
    
    PRESERVE:
    - LinkedIn profile URLs
    - Post IDs and comment counts
    - Successful navigation steps
    - Error learnings
    
    Original conversation: ${JSON.stringify(olderMessages.slice(-20))} // Only last 20 to avoid token limits
    
    Return a concise summary that preserves essential context for continuing the task.
    `;
    
    try {
      const response = await this.apiClient.sendChat([
        { 
          role: "system", 
          content: "You are a context compression specialist. Compress conversations while preserving essential information." 
        },
        { role: "user", content: compressionPrompt }
      ], {
        max_tokens: 2000,
        model: "gpt-4o-mini" // Use cheaper model for compression
      });
      
      return response.message?.content || "Context compression failed";
    } catch (error) {
      console.warn("⚠️ [COMPRESSION] LLM compression failed, using fallback");
      return this.fallbackCompression(olderMessages);
    }
  }

  // Fallback compression without LLM
  private fallbackCompression(olderMessages: ChatMessage[]): string {
    const summary = {
      userRequests: olderMessages.filter(m => m.role === 'user').length,
      toolCalls: olderMessages.filter(m => m.tool_calls?.length > 0).length,
      navigations: olderMessages.filter(m => 
        m.content?.includes('browser_navigate') || 
        m.content?.includes('linkedin.com')
      ).length,
      keyFindings: "Context compressed due to token limits. Continuing LinkedIn commenter extraction task."
    };
    
    return JSON.stringify(summary);
  }

  // Reconstruct context with compressed history
  private async reconstructContext(recovery: RecoveryData): Promise<ChatMessage[]> {
    const newSystemPrompt = `
    You are angela, continuing an autonomous agent task after intelligent context compression.
    
    ORIGINAL USER REQUEST: ${recovery.originalUserQuery}
    
    PROGRESS SUMMARY: ${JSON.stringify(recovery.progressSummary, null, 2)}
    
    COMPRESSED CONTEXT: ${recovery.compressedContext}
    
    EXECUTION ID: ${recovery.executionId}
    RECOVERY COUNT: ${recovery.recoveryCount}
    
    CURRENT STATE: Continue the task from where you left off. You have the essential context needed.
    Focus on completing the original request efficiently.
    
    Available tools: Browser navigation, clicking, typing, taking snapshots, memory operations.
    `;
    
    // CRITICAL: Validate and fix tool_calls/tool response pairing
    const validatedLastMessages = this.validateAndFixToolSequence(recovery.lastFourMessages);
    
    const reconstructedMessages: ChatMessage[] = [
      { role: "system", content: newSystemPrompt },
      { role: "user", content: recovery.originalUserQuery },
      { 
        role: "assistant", 
        content: `🔄 **Task Continuation** (Execution: ${recovery.executionId}, Recovery: ${recovery.recoveryCount + 1})

**Progress So Far:**
${recovery.progressSummary.progress.completed.join('\n')}

**Current State:** ${recovery.progressSummary.progress.currentState}

**Next Steps:** ${recovery.progressSummary.progress.nextSteps[0]}

Continuing autonomous execution...`
      },
      ...validatedLastMessages
    ];
    
    console.log(`🔧 [RECOVERY] Validated message sequence - ${recovery.lastFourMessages.length} → ${validatedLastMessages.length} messages`);
    
    // Final validation of the entire message sequence
    const finalValidatedMessages = this.validateEntireMessageSequence(reconstructedMessages);
    
    return finalValidatedMessages;
  }

  // Validate and fix tool_calls/tool response sequence
  private validateAndFixToolSequence(messages: ChatMessage[]): ChatMessage[] {
    const validatedMessages: ChatMessage[] = [];
    const pendingToolCalls: Set<string> = new Set();
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.role === 'assistant' && message.tool_calls?.length) {
        // Assistant message with tool calls - add it and track the tool call IDs
        validatedMessages.push(message);
        message.tool_calls.forEach(toolCall => {
          if (toolCall.id) {
            pendingToolCalls.add(toolCall.id);
          }
        });
        console.log(`🔧 [VALIDATION] Added assistant message with ${message.tool_calls.length} tool calls`);
      } else if (message.role === 'tool' && message.tool_call_id) {
        // Tool response - only add if it has a corresponding tool call
        if (pendingToolCalls.has(message.tool_call_id)) {
          validatedMessages.push(message);
          pendingToolCalls.delete(message.tool_call_id);
          console.log(`🔧 [VALIDATION] Added tool response for call ID: ${message.tool_call_id}`);
        } else {
          console.warn(`🚫 [VALIDATION] Skipping orphaned tool response: ${message.tool_call_id}`);
        }
      } else if (message.role === 'user' || message.role === 'system') {
        // User/system messages are always valid
        validatedMessages.push(message);
        console.log(`🔧 [VALIDATION] Added ${message.role} message`);
      } else if (message.role === 'assistant' && !message.tool_calls?.length) {
        // Regular assistant message without tool calls
        validatedMessages.push(message);
        console.log(`🔧 [VALIDATION] Added assistant message without tool calls`);
      } else {
        console.warn(`🚫 [VALIDATION] Skipping invalid message:`, { role: message.role, hasToolCalls: !!message.tool_calls?.length, toolCallId: message.tool_call_id });
      }
    }
    
    // Warn about any remaining pending tool calls
    if (pendingToolCalls.size > 0) {
      console.warn(`⚠️ [VALIDATION] ${pendingToolCalls.size} tool calls without responses:`, Array.from(pendingToolCalls));
    }
    
    return validatedMessages;
  }

  // Validate entire message sequence for OpenAI API compliance
  private validateEntireMessageSequence(messages: ChatMessage[]): ChatMessage[] {
    console.log(`🔧 [FINAL-VALIDATION] Validating ${messages.length} messages for OpenAI API compliance`);
    
    // Two-pass validation: first pass to identify valid tool call/response pairs
    const toolCallToResponse: Map<string, ChatMessage> = new Map();
    const messageToToolCalls: Map<ChatMessage, string[]> = new Map();
    
    // First pass: map tool calls to their responses
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.role === 'assistant' && message.tool_calls?.length) {
        const toolCallIds = message.tool_calls.map(tc => tc.id).filter(id => id);
        messageToToolCalls.set(message, toolCallIds);
      } else if (message.role === 'tool' && message.tool_call_id) {
        toolCallToResponse.set(message.tool_call_id, message);
      }
    }
    
    // Second pass: build valid message sequence
    const validatedMessages: ChatMessage[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.role === 'system' || message.role === 'user') {
        // System and user messages are always valid
        validatedMessages.push(message);
        console.log(`🔧 [FINAL-VALIDATION] Added ${message.role} message`);
      } else if (message.role === 'assistant' && !message.tool_calls?.length) {
        // Assistant messages without tool calls are valid
        validatedMessages.push(message);
        console.log(`🔧 [FINAL-VALIDATION] Added assistant message without tool calls`);
      } else if (message.role === 'assistant' && message.tool_calls?.length) {
        // Assistant message with tool calls - only include if ALL tool calls have responses
        const toolCallIds = messageToToolCalls.get(message) || [];
        const hasAllResponses = toolCallIds.every(id => toolCallToResponse.has(id));
        
        if (hasAllResponses) {
          validatedMessages.push(message);
          console.log(`🔧 [FINAL-VALIDATION] Added assistant message with ${toolCallIds.length} tool calls`);
          
          // Add the corresponding tool responses
          toolCallIds.forEach(toolCallId => {
            const response = toolCallToResponse.get(toolCallId);
            if (response) {
              validatedMessages.push(response);
              console.log(`🔧 [FINAL-VALIDATION] Added tool response for ${toolCallId}`);
            }
          });
        } else {
          console.warn(`🚫 [FINAL-VALIDATION] Skipping assistant message with unmatched tool calls:`, toolCallIds);
        }
      } else if (message.role === 'tool') {
        // Tool messages are handled above when processing assistant messages
        // Skip them here to avoid duplicates
        continue;
      } else {
        console.warn(`🚫 [FINAL-VALIDATION] Skipping invalid message:`, { role: message.role, hasToolCalls: !!message.tool_calls?.length });
      }
    }
    
    console.log(`✅ [FINAL-VALIDATION] Message sequence validated: ${messages.length} → ${validatedMessages.length} messages`);
    
    return validatedMessages;
  }

  // Utility methods
  private extractOriginalUserQuery(messages: ChatMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    return userMessages[0]?.content || "Unknown task";
  }

  private extractToolResults(messages: ChatMessage[]): any[] {
    return messages
      .filter(m => m.role === 'tool')
      .map(m => ({
        name: m.name,
        content: m.content,
        args: this.parseToolArgs(m, messages)
      }));
  }

  private parseToolArgs(message: ChatMessage, messages: ChatMessage[]): any {
    // Extract tool arguments from message context
    const messageIndex = messages.findIndex(m => m === message);
    if (messageIndex > 0) {
      const prevMessage = messages[messageIndex - 1];
      if (prevMessage?.tool_calls?.[0]?.function?.arguments) {
        try {
          return JSON.parse(prevMessage.tool_calls[0].function.arguments);
        } catch {}
      }
    }
    return {};
  }

  private determineCurrentState(messages: ChatMessage[], toolResults: any[]): string {
    const lastToolResult = toolResults[toolResults.length - 1];
    
    if (lastToolResult?.name === 'mcp_browsermcp_browser_navigate') {
      return "On LinkedIn profile page, ready to access posts";
    } else if (lastToolResult?.name === 'mcp_browsermcp_browser_click') {
      return "Navigated within LinkedIn interface";
    } else if (lastToolResult?.name === 'mcp_browsermcp_browser_snapshot') {
      return "Page structure captured, ready for next action";
    }
    
    return "In progress on LinkedIn task";
  }

  private generateNextSteps(currentState: string, originalTask: string): string[] {
    if (originalTask.toLowerCase().includes('commenter')) {
      return [
        "🔄 Click on first post to expand comments",
        "🔄 Extract commenter names and profile links",
        "🔄 Navigate through multiple posts to gather required data",
        "🔄 Compile final list of commenters"
      ];
    }
    
    return ["🔄 Continue autonomous execution"];
  }

  private countPreviousRecoveries(messages: ChatMessage[]): number {
    return messages.filter(m => 
      m.content?.includes('Task Continuation') || 
      m.content?.includes('Recovery')
    ).length;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateTokenCount(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + Math.ceil(content.length / 4); // Rough estimate: 4 chars per token
    }, 0);
  }

  // Public method to get execution traces for debugging
  async getExecutionTraces(limit: number = 10): Promise<ExecutionTrace[]> {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['execution_traces'], 'readonly');
      const store = transaction.objectStore('execution_traces');
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      
      const traces: ExecutionTrace[] = [];
      let count = 0;
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && count < limit) {
          traces.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(traces);
        }
      };
    });
  }

  // Public method to get all execution results
  async getAllExecutionResults(): Promise<any[]> {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['execution_results'], 'readonly');
      const store = transaction.objectStore('execution_results');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

export { TokenLimitRecoveryService, type TokenLimitError, type ProgressSummary, type ExecutionTrace }; 
