// Tool handling utilities for Assistant

export interface ToolResult {
  name: string;
  result: string;
}

// Format a tool for OpenAI's function calling format
export function formatToolForOpenAI(tool: any) {
  return {
    ...tool,
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce((acc: any, param: any) => {
          acc[param.name] = {
            type: param.type.toLowerCase(),
            description: param.description
          };
          return acc;
        }, {}),
        required: tool.parameters
          .filter((param: any) => param.required)
          .map((param: any) => param.name)
      }
    }
  };
}

// Execute a tool's implementation safely
export async function executeToolImplementation(tool: any, args: any): Promise<any> {
  try {
    // Create a safe execution environment for the tool
    const func = new Function('args', `\n${tool.implementation}\nreturn implementation(args);`);
    return await func(args);
  } catch (implError: unknown) {
    return {
      error: `Error executing ${tool.name}: ${implError instanceof Error ? implError.message : String(implError)}`
    };
  }
} 
