// Structured output-based tool calling approach for Ollama models

import type { Tool } from '../../db';

// Define structure for tool calls
export interface StructuredToolCall {
  tool_name: string;
  tool_arguments: Record<string, any>;
  reasoning: string;
}

export interface StructuredResponse {
  answer: string;
  tool_calls: StructuredToolCall[];
}

/**
 * Creates a structured output schema for Ollama to follow when tools are provided
 * @param tools List of available tools
 * @returns JSON schema object for structured output
 */
export function createStructuredToolSchema(tools: Tool[]): any {
  // Base schema with answer field and tool_calls array
  const schema = {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'The response to the user query'
      },
      tool_calls: {
        type: 'array',
        description: 'Array of tool calls to execute',
        items: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'The name of the tool to call',
              enum: tools.map(tool => tool.name)
            },
            tool_arguments: {
              type: 'object',
              description: 'The arguments to pass to the tool',
              properties: {} // Initialize empty properties object
            },
            reasoning: {
              type: 'string',
              description: 'Explanation of why this tool is being called'
            }
          },
          required: ['tool_name', 'tool_arguments']
        }
      }
    },
    required: ['answer']
  };

  // Add tool-specific argument schemas
  for (const tool of tools) {
    const toolName = tool.name;
    // Add validation for each tool's parameters
    const properties: Record<string, any> = {};

    for (const param of tool.parameters) {
      properties[param.name] = {
        type: param.type.toLowerCase(),
        description: param.description
      };
    }

    // Add this to the schema
    schema.properties.tool_calls.items.properties.tool_arguments.properties = properties;
  }

  return schema;
}

/**
 * Extracts and validates tool calls from a structured response
 * @param response Structured response from Ollama
 * @param tools Available tools
 * @returns Validated and extracted tool calls
 */
export function extractToolCalls(
  response: StructuredResponse | string,
  tools: Tool[]
): StructuredToolCall[] {
  // Handle string responses - try to parse JSON
  if (typeof response === 'string') {
    try {
      // Find JSON object in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        response = JSON.parse(jsonMatch[0]) as StructuredResponse;
      } else {
        console.warn('No JSON object found in response');
        return [];
      }
    } catch (error) {
      console.error('Failed to parse structured response:', error);
      return [];
    }
  }

  // Extract tool calls
  const toolCalls = response.tool_calls || [];
  
  // Validate each tool call
  return toolCalls.filter(call => {
    const tool = tools.find(t => t.name === call.tool_name);
    if (!tool) {
      console.warn(`Tool ${call.tool_name} not found`);
      return false;
    }
    
    // Validate parameters
    const requiredParams = tool.parameters.filter(p => p.required).map(p => p.name);
    const missingParams = requiredParams.filter(p => !(p in call.tool_arguments));
    
    if (missingParams.length > 0) {
      console.warn(`Missing required parameters for tool ${call.tool_name}: ${missingParams.join(', ')}`);
      return false;
    }
    
    return true;
  });
}

/**
 * Creates the system prompt for structured tool calling
 * @param tools List of available tools
 * @returns System prompt string
 */
export function createStructuredToolPrompt(tools: Tool[]): string {
  const toolDescriptions = tools.map(tool => {
    const parameterDescriptions = tool.parameters.map(param => {
      return `  - ${param.name}${param.required ? ' (required)' : ''}: ${param.description} (${param.type})`;
    }).join('\n');

    return `Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parameterDescriptions}`;
  }).join('\n\n');

  return `You have access to the following tools. When a tool needs to be used, respond with a structured JSON object.

Available Tools:
${toolDescriptions}

When you need to use tools, format your response as a JSON object with these fields:
{
  "answer": "Your response to the user",
  "tool_calls": [
    {
      "tool_name": "name_of_tool",
      "tool_arguments": {
        "param1": "value1",
        "param2": "value2"
      },
      "reasoning": "Why you're calling this tool"
    }
  ]
}

Only include the "tool_calls" array when you need to use tools. When no tools are needed, simply respond with:
{
  "answer": "Your response to the user"
}`;
} 
