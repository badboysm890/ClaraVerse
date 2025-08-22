/**
 * Structured Tool Call Service
 * 
 * This service provides structured tool calling capabilities for models that don't support 
 * standard OpenAI-style tool calling. It uses structured text generation to simulate tool calls.
 */

import { angelaMessage, angelaAIConfig, angelaFileAttachment } from '../types/angela_assistant_types';
import { Tool } from '../db';
import { defaultTools, executeTool } from '../utils/angelaTools';
import { db } from '../db';
import { angelaMCPService } from './angelaMCPService';
import { angelaMemoryService } from './angelaMemoryService';

/**
 * Structured tool call result
 */
interface StructuredToolCall {
  toolName: string;
  arguments: Record<string, any>;
  reasoning: string;
}

/**
 * Structured tool execution result
 */
interface StructuredToolResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  reasoning?: string;
}

/**
 * Structured tool calling response
 */
interface StructuredToolResponse {
  content: string;
  toolCalls: StructuredToolCall[];
  needsToolExecution: boolean;
  reasoning: string;
}

/**
 * Service for handling structured tool calling with unsupported models
 */
export class StructuredToolCallService {
  private static instance: StructuredToolCallService;
  
  // Configuration flag to control structured output behavior
  // DEFAULT: Use native JSON Schema for structured outputs
  private forcePromptBasedStructuredOutputs: boolean = false;
  
  private constructor() {}

  /**
   * Helper method to safely serialize tool results to avoid [object Object] issues
   */
  private serializeToolResult(result: any): string {
    if (result === undefined || result === null) {
      return 'Tool executed successfully (no result returned)';
    }
    
    if (typeof result === 'string') {
      return result;
    }
    
    if (typeof result === 'object') {
      try {
        return JSON.stringify(result, null, 2);
      } catch (error) {
        return '[Object - could not serialize]';
      }
    }
    
    return String(result);
  }
  
  public static getInstance(): StructuredToolCallService {
    if (!StructuredToolCallService.instance) {
      StructuredToolCallService.instance = new StructuredToolCallService();
    }
    return StructuredToolCallService.instance;
  }

  /**
   * Generate JSON Schema for structured tool calling (OpenAI native format)
   */
  public generateToolCallSchema(tools: Tool[]): any {
    // Create enum of available tool names
    const toolNames = tools.map(tool => tool.name);
    
    // Create dynamic properties for tool arguments based on available tools
    const toolArgumentsSchema = {
      type: "object",
      properties: {} as Record<string, any>,
      additionalProperties: true // Allow any additional properties for flexibility
    };

    // Add properties for each tool's parameters
    tools.forEach(tool => {
      tool.parameters.forEach(param => {
        if (!toolArgumentsSchema.properties[param.name]) {
          toolArgumentsSchema.properties[param.name] = {
            type: param.type.toLowerCase(),
            description: param.description
          };
        }
      });
    });

    return {
      name: "structured_tool_calls",
      description: "Structured tool calling response with reasoning and tool execution details",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: {
            type: "string",
            description: "Brief explanation of your approach and reasoning"
          },
          toolCalls: {
            type: "array",
            description: "Array of tool calls to execute",
            items: {
              type: "object",
              properties: {
                toolName: {
                  type: "string",
                  description: "The exact name of the tool to call",
                  enum: toolNames
                },
                arguments: {
                  type: "object",
                  description: "Arguments to pass to the tool",
                  additionalProperties: true // Allow flexible arguments
                },
                reasoning: {
                  type: "string",
                  description: "Explanation of why this specific tool is being used"
                }
              },
              required: ["toolName", "arguments", "reasoning"],
              additionalProperties: false
            }
          },
          needsToolExecution: {
            type: "boolean",
            description: "Whether the tool calls should be executed"
          }
        },
        required: ["reasoning", "toolCalls", "needsToolExecution"],
        additionalProperties: false
      }
    };
  }

  /**
   * Check if provider supports native JSON Schema structured outputs
   * DEFAULT: Use native JSON Schema for most providers
   */
  public supportsNativeStructuredOutputs(providerId?: string): boolean {
    // Check configuration flag first
    if (this.forcePromptBasedStructuredOutputs) {
      return false;
    }
    
    // DEFAULT: Use native JSON Schema for most providers
    // Only exclude providers that definitely don't support it
    const unsupportedProviders = ['ollama-local', 'llamacpp'];
    
    // If no provider specified, assume supported
    if (!providerId) {
      return true;
    }
    
    // Check if provider is explicitly unsupported
    if (unsupportedProviders.includes(providerId.toLowerCase())) {
      return false;
    }
    
    // Default to supporting native JSON Schema
    return true;
  }

  /**
   * Control structured output mode (native JSON Schema is default)
   */
  public setForcePromptBasedMode(force: boolean): void {
    this.forcePromptBasedStructuredOutputs = force;
    console.log(`🔄 Structured tool calling mode: ${force ? 'Prompt-based (forced)' : 'Native JSON Schema (default)'}`);
  }

  /**
   * Get current structured output mode
   */
  public getStructuredOutputMode(): 'forced-prompt' | 'native-json-schema' {
    return this.forcePromptBasedStructuredOutputs ? 'forced-prompt' : 'native-json-schema';
  }

  /**
   * Enhanced structured tool calling with native JSON Schema support
   */
  public async executeStructuredToolCallingWithSchema(
    client: any,
    modelId: string,
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string
  ): Promise<{ response: string; toolCalls: StructuredToolCall[]; needsToolExecution: boolean; reasoning: string }> {
    
    const supportsNativeSchema = this.supportsNativeStructuredOutputs(currentProviderId);
    
    if (supportsNativeSchema) {
      console.log('🔄 Using native JSON Schema structured outputs (default)');
      return this.executeWithNativeSchema(
        client, modelId, message, tools, config, attachments, 
        systemPrompt, conversationHistory, onContentChunk
      );
    } else {
      console.log('🔄 Falling back to prompt-based structured outputs');
      return this.executeWithPromptEngineering(
        client, modelId, message, tools, config, attachments,
        systemPrompt, conversationHistory, onContentChunk
      );
    }
  }

  /**
   * Execute structured tool calling using native JSON Schema
   */
  private async executeWithNativeSchema(
    client: any,
    modelId: string, 
    message: string,
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void
  ): Promise<{ response: string; toolCalls: StructuredToolCall[]; needsToolExecution: boolean; reasoning: string }> {
    
    // Generate the JSON schema
    const jsonSchema = this.generateToolCallSchema(tools);
    
    // Build enhanced system prompt for native structured outputs
    const enhancedSystemPrompt = this.buildNativeStructuredPrompt(tools, systemPrompt);
    
    // Build conversation messages
    const messages = this.buildConversationMessages(
      enhancedSystemPrompt,
      message,
      attachments,
      conversationHistory
    );

    const options = {
      temperature: config.parameters.temperature,
      max_tokens: config.parameters.maxTokens,
      top_p: config.parameters.topP,
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema
      }
    };

    try {
      // Execute API call with native structured output
      const apiResponse = await client.sendChat(modelId, messages, options);
      const rawResponse = apiResponse.message?.content || '';
      
      if (onContentChunk && rawResponse) {
        onContentChunk(rawResponse);
      }

      // Parse the structured JSON response
      let structuredData;
      try {
        structuredData = JSON.parse(rawResponse);
      } catch (parseError) {
        console.error('Failed to parse native structured output:', parseError);
        throw new Error(`Invalid JSON response from structured output: ${rawResponse}`);
      }

      return {
        response: structuredData.reasoning || rawResponse,
        toolCalls: structuredData.toolCalls || [],
        needsToolExecution: structuredData.needsToolExecution || false,
        reasoning: structuredData.reasoning || ''
      };

    } catch (error) {
      console.error('Native structured output failed, falling back to prompt engineering:', error);
      // Fallback to prompt engineering if native fails
      return this.executeWithPromptEngineering(
        client, modelId, message, tools, config, attachments,
        systemPrompt, conversationHistory, onContentChunk
      );
    }
  }

  /**
   * Execute structured tool calling using prompt engineering (fallback)
   */
  private async executeWithPromptEngineering(
    client: any,
    modelId: string,
    message: string, 
    tools: Tool[],
    config: angelaAIConfig,
    attachments: angelaFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: angelaMessage[],
    onContentChunk?: (content: string) => void
  ): Promise<{ response: string; toolCalls: StructuredToolCall[]; needsToolExecution: boolean; reasoning: string }> {
    
    // Use existing prompt engineering approach
    const structuredPrompt = this.generateStructuredToolPrompt(
      message, tools, config, conversationHistory
    );
    
    const messages = this.buildConversationMessages(
      structuredPrompt, message, attachments, conversationHistory
    );

    const options = {
      temperature: config.parameters.temperature,
      max_tokens: config.parameters.maxTokens,
      top_p: config.parameters.topP
    };

    const apiResponse = await client.sendChat(modelId, messages, options);
    const response = apiResponse.message?.content || '';
    
    if (onContentChunk && response) {
      onContentChunk(response);
    }

    // Parse using existing method
    const structuredResponse = this.parseStructuredResponse(response);
    
    return {
      response: structuredResponse.content,
      toolCalls: structuredResponse.toolCalls,
      needsToolExecution: structuredResponse.needsToolExecution,
      reasoning: structuredResponse.reasoning
    };
  }

  /**
   * Build system prompt optimized for native structured outputs
   */
  private buildNativeStructuredPrompt(tools: Tool[], originalSystemPrompt?: string): string {
    const toolsDescription = this.formatToolsForPrompt(tools);
    
    return `You are angela, an autonomous AI agent. Your task is to accomplish user requests using available tools.

${originalSystemPrompt || ''}

AVAILABLE TOOLS:
${toolsDescription}

INSTRUCTIONS:
- Analyze the user's request carefully
- Determine which tools (if any) are needed to accomplish the task
- Provide clear reasoning for your approach
- If tools are needed, specify exactly which tools to use and why
- If no tools are needed, explain why and provide a direct response

RESPONSE FORMAT:
You must respond with a JSON object containing:
- reasoning: Your analysis and approach
- toolCalls: Array of tools to execute (empty if no tools needed)
- needsToolExecution: true if tools should be executed, false otherwise

Be thorough, accurate, and helpful in your responses.`;
  }

  /**
   * Build conversation messages for API call
   */
  private buildConversationMessages(
    systemPrompt: string,
    message: string,
    attachments: angelaFileAttachment[],
    conversationHistory?: angelaMessage[]
  ): any[] {
    const messages: any[] = [];
    
    // Add system prompt
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      const historyMessages = conversationHistory.slice(-10); // Last 10 messages
      for (const historyMessage of historyMessages) {
        messages.push({
          role: historyMessage.role,
          content: historyMessage.content
        });
      }
    }

    // Add current user message
    const userMessage: any = {
      role: 'user',
      content: message
    };

    // Add images if any attachments are images
    const imageAttachments = attachments.filter(att => att.type === 'image');
    if (imageAttachments.length > 0) {
      userMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
    }

    messages.push(userMessage);
    
    return messages;
  }

  /**
   * Generate structured tool calling prompt
   */
  public generateStructuredToolPrompt(
    userMessage: string,
    tools: Tool[],
    config: angelaAIConfig,
    conversationHistory?: angelaMessage[],
    memoryContext?: string
  ): string {
    const toolsDescription = this.formatToolsForPrompt(tools);
    
    // Check if the task appears to be already completed based on memory context
    const hasCompletedTask = this.isTaskAlreadyCompleted(userMessage, memoryContext);
    
    let systemPrompt = `You are angela, an autonomous AI agent. ACCOMPLISH THE TASK using structured tool calls.

STRUCTURED TOOL FORMAT:
\`\`\`json
{
  "reasoning": "Brief explanation of your approach",
  "toolCalls": [
    {
      "toolName": "exact_tool_name",
      "arguments": {"param": "value"},
      "reasoning": "Why this tool"
    }
  ],
  "needsToolExecution": true
}
\`\`\`

AVAILABLE TOOLS:
${toolsDescription}

AGENT MINDSET:
- Use tools for EVERYTHING - no exceptions
- If one tool fails, try others immediately
- Chain tools together creatively
- Never give up - exhaust all possibilities
- Be resourceful and persistent
- Learn from failures and adapt

EXECUTION RULES:
1. ALWAYS use tools when they can help
2. Try alternative tools if one fails
3. Combine tools for complex tasks
4. Keep trying until success or all options exhausted
5. Use exact tool names and parameters`;

    // Add specific instruction if task appears completed
    if (hasCompletedTask) {
      systemPrompt += `
6. TASK COMPLETION CHECK: This request may be fulfilled. Review previous results before executing new tools.`;
    }

    return systemPrompt;
  }

  /**
   * Check if a task appears to be already completed based on memory context
   */
  private isTaskAlreadyCompleted(userMessage: string, memoryContext?: string): boolean {
    if (!memoryContext) {
      return false;
    }

    // Check if memory context contains successful tool execution and follow-up response
    const hasSuccessfulToolExecution = memoryContext.includes('✅ Success') && 
                                     memoryContext.includes('follow_up_response');
    
    // Check if the user message appears to be asking for the same thing that was already done
    const commonCompletionPatterns = [
      'list the files',
      'show me the files',
      'what files are',
      'directory contents',
      'folder contents'
    ];
    
    const requestLooksComplete = commonCompletionPatterns.some(pattern => 
      userMessage.toLowerCase().includes(pattern.toLowerCase())
    ) && hasSuccessfulToolExecution;

    return requestLooksComplete;
  }

  /**
   * Parse structured tool response from model
   */
  public parseStructuredResponse(response: string): StructuredToolResponse {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
    
    if (!jsonMatch) {
      // No structured format found, treat as regular response
      return {
        content: response,
        toolCalls: [],
        needsToolExecution: false,
        reasoning: ''
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      
      // Validate the structure
      if (!parsed.toolCalls || !Array.isArray(parsed.toolCalls)) {
        return {
          content: response,
          toolCalls: [],
          needsToolExecution: false,
          reasoning: parsed.reasoning || ''
        };
      }

      // Validate each tool call
      const validToolCalls: StructuredToolCall[] = [];
      for (const toolCall of parsed.toolCalls) {
        if (toolCall.toolName && typeof toolCall.toolName === 'string') {
          validToolCalls.push({
            toolName: toolCall.toolName,
            arguments: toolCall.arguments || {},
            reasoning: toolCall.reasoning || ''
          });
        }
      }

      return {
        content: response.replace(jsonMatch[0], '').trim(),
        toolCalls: validToolCalls,
        needsToolExecution: parsed.needsToolExecution === true,
        reasoning: parsed.reasoning || ''
      };

    } catch (error) {
      console.warn('Failed to parse structured tool response:', error);
      return {
        content: response,
        toolCalls: [],
        needsToolExecution: false,
        reasoning: ''
      };
    }
  }

  /**
   * Execute structured tool calls
   */
  public async executeStructuredToolCalls(
    toolCalls: StructuredToolCall[],
    onProgress?: (message: string) => void
  ): Promise<StructuredToolResult[]> {
    const results: StructuredToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        if (onProgress) {
          onProgress(`🔧 Executing ${toolCall.toolName}...`);
        }

        const result = await this.executeStructuredTool(toolCall);
        results.push(result);

        if (onProgress) {
          const status = result.success ? '✅' : '❌';
          onProgress(`${status} ${toolCall.toolName} ${result.success ? 'completed' : 'failed'}`);
        }

      } catch (error) {
        results.push({
          toolName: toolCall.toolName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          reasoning: toolCall.reasoning
        });

        if (onProgress) {
          onProgress(`❌ ${toolCall.toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return results;
  }

  /**
   * Execute a single structured tool call
   */
  private async executeStructuredTool(toolCall: StructuredToolCall): Promise<StructuredToolResult> {
    const { toolName, arguments: args, reasoning } = toolCall;

    console.log(`🔧 Executing structured tool: ${toolName} with args:`, args);

    // Check if it's an MCP tool
    if (toolName.startsWith('mcp_')) {
      try {
        // Special handling for tools with dummy parameters
        let processedArgs = args;
        
        // Handle tools that have dummy parameters (like mcp_python-tools_open and mcp_python-tools_ls)
        if (toolName === 'mcp_python-tools_open' || toolName === 'mcp_python-tools_ls') {
          // These tools expect a random_string parameter as a dummy
          processedArgs = { random_string: 'dummy' };
          console.log(`🔧 Using dummy parameters for ${toolName}:`, processedArgs);
        }

        console.log(`🔍 [STRUCTURED-MCP] Parsing tool name: ${toolName}`);
        console.log(`🔍 [STRUCTURED-MCP] Name parts after removing 'mcp_': ${toolName.substring(4).split('_')}`);
        
        // Enhanced parsing with multiple patterns
        const parsedTool = this.parseStructuredMCPToolName(toolName);
        
        const mcpToolCall = {
          callId: `structured_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          server: parsedTool.server,
          name: parsedTool.name,
          arguments: processedArgs
        };

        console.log(`🔍 [STRUCTURED-MCP] Parsed server: ${parsedTool.server}, tool: ${parsedTool.name}`);
        console.log(`📡 Sending MCP tool call:`, mcpToolCall);
        const mcpResult = await angelaMCPService.executeToolCall(mcpToolCall);
        console.log(`📥 MCP tool result:`, mcpResult);
        
        return {
          toolName,
          success: mcpResult.success,
          result: mcpResult.content,
          error: mcpResult.error,
          reasoning
        };

      } catch (error) {
        console.error(`❌ MCP tool execution error for ${toolName}:`, error);
        return {
          toolName,
          success: false,
          error: error instanceof Error ? error.message : 'MCP tool execution failed',
          reasoning
        };
      }
    }

    // Check angela default tools
    const angelaTool = defaultTools.find(tool => tool.name === toolName || tool.id === toolName);
    if (angelaTool) {
      try {
        console.log(`🛠️ Executing angela tool: ${angelaTool.name}`);
        const result = await executeTool(angelaTool.id, args);
        console.log(`✅ angela tool result:`, result);
        
        return {
          toolName,
          success: result.success,
          result: result.result,
          error: result.error,
          reasoning
        };
      } catch (error) {
        console.error(`❌ angela tool execution error for ${toolName}:`, error);
        return {
          toolName,
          success: false,
          error: error instanceof Error ? error.message : 'angela tool execution failed',
          reasoning
        };
      }
    }

    // Check database tools
    const dbTools = await db.getEnabledTools();
    const dbTool = dbTools.find(tool => tool.name === toolName);
    
    if (dbTool) {
      try {
        console.log(`🗄️ Executing database tool: ${dbTool.name}`);
        const funcBody = `return (async () => {
          ${dbTool.implementation}
          return await implementation(args);
        })();`;
        const testFunc = new Function('args', funcBody);
        const result = await testFunc(args);
        console.log(`✅ Database tool result:`, result);
        
        return {
          toolName,
          success: true,
          result,
          reasoning
        };
      } catch (error) {
        console.error(`❌ Database tool execution error for ${toolName}:`, error);
        return {
          toolName,
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
          reasoning
        };
      }
    }

    // Tool not found
    console.error(`❌ Tool not found: ${toolName}`);
    return {
      toolName,
      success: false,
      error: `Tool '${toolName}' not found`,
      reasoning
    };
  }

  /**
   * Generate follow-up prompt with tool results
   */
  public generateFollowUpPrompt(
    originalMessage: string,
    toolResults: StructuredToolResult[],
    reasoning: string
  ): string {
    const resultsText = toolResults.map(result => {
      if (result.success) {
        let resultText = '';
        if (result.result !== undefined && result.result !== null) {
          resultText = this.serializeToolResult(result.result);
        } else {
          resultText = 'Tool executed successfully (no result returned)';
        }
        return `✅ ${result.toolName}: ${resultText}`;
      } else {
        return `❌ ${result.toolName}: ${result.error || 'Failed'}`;
      }
    }).join('\n\n');

    return `**TOOL EXECUTION RESULTS**

Original request: ${originalMessage}

Your reasoning: ${reasoning}

Tool execution results:
${resultsText}

**INSTRUCTIONS:**
Based on the tool execution results above, please provide a comprehensive response to the user's original request. Incorporate the tool results naturally into your response. Do not use the structured JSON format in your response - just provide a natural, helpful answer based on the results.

If any tools failed, acknowledge the failures and provide alternative suggestions or partial results where possible.`;
  }

  /**
   * Format tools for prompt
   */
  private formatToolsForPrompt(tools: Tool[]): string {
    if (tools.length === 0) {
      return 'No tools available';
    }

    return tools.map(tool => {
      const requiredParams = tool.parameters.filter(p => p.required);
      const optionalParams = tool.parameters.filter(p => !p.required);
      
      let paramsText = '';
      if (requiredParams.length > 0 || optionalParams.length > 0) {
        const requiredText = requiredParams.map(p => `${p.name}: ${p.type}`);
        const optionalText = optionalParams.map(p => `${p.name}?: ${p.type}`);
        const allParams = [...requiredText, ...optionalText];
        paramsText = `\n  Parameters: ${allParams.join(', ')}`;
      } else {
        paramsText = '\n  Parameters: (no parameters required - use empty object {})';
      }
      
      return `• ${tool.name}: ${tool.description}${paramsText}`;
    }).join('\n');
  }

  /**
   * Format conversation history for context
   */
  private formatConversationHistory(history?: angelaMessage[]): string {
    if (!history || history.length === 0) {
      return 'No previous conversation context';
    }

    // Take last 5 messages for context
    const recentHistory = history.slice(-5);
    
    return recentHistory.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    }).join('\n');
  }

  /**
   * Check if a model supports structured tool calling
   */
  public supportsStructuredCalling(modelName: string): boolean {
    // This can be extended to check specific models
    // For now, assume most models can handle structured text generation
    return true;
  }

  /**
   * Get structured calling capabilities info
   */
  public getCapabilitiesInfo(): string {
    return `Structured Tool Calling enables tool usage with models that don't support standard OpenAI tool calling. 
    
How it works:
• Uses structured text generation to simulate tool calls
• Model generates JSON-formatted tool requests
• Tools are executed and results fed back to the model
• Compatible with most text generation models
• Maintains conversation context and reasoning

This is ideal for local models, older models, or specialized models that don't have built-in tool calling support.`;
  }

  /**
   * Validate tool availability for structured calling
   */
  public async validateToolsForStructuredCalling(tools: Tool[]): Promise<{
    supported: Tool[];
    unsupported: Tool[];
    warnings: string[];
  }> {
    const supported: Tool[] = [];
    const unsupported: Tool[] = [];
    const warnings: string[] = [];

    for (const tool of tools) {
      // Most tools should work with structured calling
      if (tool.implementation === 'mcp') {
        // MCP tools need special handling
        if (angelaMCPService.isReady()) {
          supported.push(tool);
        } else {
          unsupported.push(tool);
          warnings.push(`MCP tool ${tool.name} requires MCP service to be running`);
        }
      } else {
        supported.push(tool);
      }
    }

    return { supported, unsupported, warnings };
  }

  /**
   * Parse structured MCP tool name with improved pattern matching
   */
  private parseStructuredMCPToolName(toolName: string): { server: string; name: string } {
    if (!toolName.startsWith('mcp_')) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }

    const withoutPrefix = toolName.substring(4); // Remove 'mcp_'
    const parts = withoutPrefix.split('_');
    
    console.log(`🔍 [STRUCTURED-MCP] Parsing parts: ${JSON.stringify(parts)}`);

    // Pattern 1: Standard format mcp_SERVER_TOOL (e.g., mcp_github_search)
    if (parts.length >= 2) {
      const server = parts[0];
      const name = parts.slice(1).join('_');
      
      // Check if this looks like a valid pattern
      if (server && name) {
        console.log(`🔍 [STRUCTURED-MCP] Pattern 1 - Server: '${server}', Tool: '${name}'`);
        return { server, name };
      }
    }

    // Pattern 2: Compound server names (e.g., mcp_MCP_DOCKER_search)
    if (parts.length >= 3) {
      // Try different server/tool combinations
      const combinations = [
        // Most specific first
        { server: parts.slice(0, 2).join('_'), name: parts.slice(2).join('_') }, // MCP_DOCKER:search
        { server: parts[0], name: parts.slice(1).join('_') }, // MCP:DOCKER_search
      ];

      for (const combo of combinations) {
        if (combo.server && combo.name) {
          console.log(`🔍 [STRUCTURED-MCP] Pattern 2 - Trying Server: '${combo.server}', Tool: '${combo.name}'`);
          return combo;
        }
      }
    }

    // Fallback: Use original simple parsing
    console.log(`🔍 [STRUCTURED-MCP] Using fallback parsing for: ${toolName}`);
    return {
      server: parts[0] || 'unknown',
      name: parts.slice(1).join('_') || 'unknown'
    };
  }
}

// Export singleton instance
export const structuredToolCallService = StructuredToolCallService.getInstance(); 
