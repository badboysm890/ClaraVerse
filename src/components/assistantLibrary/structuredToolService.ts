import { v4 as uuidv4 } from 'uuid';
import type { Tool } from '../../db';
import type { AssistantOllamaClient, ChatMessage, ChatRole } from '../../utils';
import { 
  createStructuredToolSchema, 
  createStructuredToolPrompt, 
  extractToolCalls 
} from './structuredToolCalling';

export interface StructuredToolServiceOptions {
  client: AssistantOllamaClient;
  tools: Tool[];
  model: string;
  executeToolImplementation: (tool: Tool, args: any) => Promise<any>;
}

export class StructuredToolService {
  private client: AssistantOllamaClient;
  private tools: Tool[];
  private model: string;
  private executeToolImplementation: (tool: Tool, args: any) => Promise<any>;

  constructor(options: StructuredToolServiceOptions) {
    this.client = options.client;
    this.tools = options.tools;
    this.model = options.model;
    this.executeToolImplementation = options.executeToolImplementation;
  }

  /**
   * Process a user message with structured tool calling
   * @param messages Chat history
   * @param options Request options
   * @returns List of generated messages (including tool calls and responses)
   */
  public async processWithStructuredTools(
    messages: ChatMessage[],
    options: any = {}
  ): Promise<{
    messages: ChatMessage[];
    content: string;
    tokens: number;
  }> {
    // 1. Create the schema for structured output
    const schema = createStructuredToolSchema(this.tools);
    
    // 2. Add system prompt with tool descriptions
    const systemPrompt = createStructuredToolPrompt(this.tools);
    const messagesWithSystem = [
      { role: 'system' as ChatRole, content: systemPrompt },
      ...messages
    ];

    // 3. Send request to Ollama with structured format
    const response = await this.client.sendStructuredChat(
      this.model,
      messagesWithSystem,
      schema,
      options
    );

    console.log("Structured response:", response);
    
    // 4. Extract tool calls from response
    let responseContent = '';
    let responseTokens = 0;
    
    if (response?.message?.content) {
      responseContent = response.message.content;
      responseTokens = response.eval_count || 0;
    }
    
    const structuredResponse = JSON.parse(responseContent);
    const toolCalls = extractToolCalls(structuredResponse, this.tools);
    
    // 5. Process tool calls if any
    const generatedMessages: ChatMessage[] = [];
    
    // Add assistant's initial response
    generatedMessages.push({
      role: 'assistant',
      content: structuredResponse.answer
    });
    
    // If there are tool calls, process them
    if (toolCalls.length > 0) {
      // Execute each tool call
      for (const toolCall of toolCalls) {
        const tool = this.tools.find(t => t.name === toolCall.tool_name);
        if (!tool) continue;
        
        // Log the tool call
        generatedMessages.push({
          role: 'assistant',
          content: `Using tool: ${tool.name}\nReasoning: ${toolCall.reasoning || 'No reasoning provided'}`
        });
        
        try {
          // Execute the tool
          const result = await this.executeToolImplementation(tool, toolCall.tool_arguments);
          
          // Add tool response
          generatedMessages.push({
            role: 'tool' as ChatRole,
            name: tool.name,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          });
        } catch (error) {
          // Handle tool execution error
          generatedMessages.push({
            role: 'tool' as ChatRole,
            name: tool.name,
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
      
      // Generate a final response that incorporates the tool results
      const finalMessages = [
        ...messagesWithSystem,
        ...generatedMessages
      ];
      
      const finalResponse = await this.client.sendChat(
        this.model,
        finalMessages,
        { temperature: options.temperature || 0.7 }
      );
      
      if (finalResponse?.message?.content) {
        // Add the final response after tool execution
        generatedMessages.push({
          role: 'assistant',
          content: finalResponse.message.content
        });
        
        // Update the final content and tokens
        responseContent = finalResponse.message.content;
        responseTokens += finalResponse.eval_count || 0;
      }
    }
    
    return {
      messages: generatedMessages,
      content: responseContent || structuredResponse.answer,
      tokens: responseTokens
    };
  }
  
  /**
   * Stream a response with structured tool calling
   * @param messages Chat history
   * @param options Request options
   * @param onMessage Callback for streaming messages
   */
  public async processWithStructuredToolsStreaming(
    messages: ChatMessage[],
    options: any = {},
    onMessage: (content: string, tokens: number) => void
  ): Promise<{
    messages: ChatMessage[];
    content: string;
    tokens: number;
  }> {
    // Not implementing streaming for now - will fall back to non-streaming mode
    // This would be more complex as we'd need to:
    // 1. Stream the initial response
    // 2. Parse JSON as it comes in (challenging)
    // 3. Execute tools
    // 4. Stream final response
    return this.processWithStructuredTools(messages, options);
  }
} 
