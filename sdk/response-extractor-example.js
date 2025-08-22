/**
 * Response Extractor Node for Agent Studio
 * 
 * This custom node extracts the actual response from complex LLM outputs
 * Copy this code into a new custom node in Agent Studio
 */

const responseExtractorNode = {
  id: 'response-extractor',
  type: 'response-extractor',
  name: 'Response Extractor',
  description: 'Extracts the actual response from complex LLM output objects',
  category: 'Data Processing',
  icon: '🔍',
  inputs: [
    {
      id: 'llmOutput',
      name: 'LLM Output',
      dataType: 'object',
      required: true,
      description: 'Complex LLM output object'
    }
  ],
  outputs: [
    {
      id: 'response',
      name: 'Response',
      dataType: 'string',
      description: 'Extracted response text'
    }
  ],
  properties: [
    {
      id: 'fallbackText',
      name: 'Fallback Text',
      type: 'string',
      defaultValue: 'No response found',
      description: 'Text to return if no response is found'
    }
  ],
  executionCode: `
    async function execute(inputs, properties, context) {
      const llmOutput = inputs.llmOutput;
      const fallbackText = properties.fallbackText || 'No response found';
      
      context.log('Processing LLM output:', typeof llmOutput);
      
      try {
        // If input is already a string, return it
        if (typeof llmOutput === 'string') {
          return { response: llmOutput };
        }
        
        // If input is not an object, convert to string
        if (!llmOutput || typeof llmOutput !== 'object') {
          return { response: String(llmOutput || fallbackText) };
        }
        
        // Strategy 1: Look for a direct 'response' field
        if (llmOutput.response) {
          context.log('Found direct response field');
          return { response: llmOutput.response };
        }
        
        // Strategy 2: Look for response in nested objects
        for (const key in llmOutput) {
          if (llmOutput[key] && typeof llmOutput[key] === 'object') {
            if (llmOutput[key].response) {
              context.log('Found response in nested object:', key);
              return { response: llmOutput[key].response };
            }
          }
        }
        
        // Strategy 3: Look for the last string value (often the final response)
        const stringValues = [];
        for (const key in llmOutput) {
          if (typeof llmOutput[key] === 'string') {
            stringValues.push(llmOutput[key]);
          }
        }
        
        if (stringValues.length > 0) {
          const lastResponse = stringValues[stringValues.length - 1];
          context.log('Using last string value as response');
          return { response: lastResponse };
        }
        
        // Strategy 4: Look for common response field names
        const commonFields = ['text', 'content', 'message', 'output', 'result'];
        for (const field of commonFields) {
          if (llmOutput[field]) {
            context.log('Found response in field:', field);
            return { response: String(llmOutput[field]) };
          }
        }
        
        // Strategy 5: Return JSON string as fallback
        context.log('No response found, returning JSON string');
        return { response: JSON.stringify(llmOutput) };
        
      } catch (error) {
        context.error('Error extracting response:', error.message);
        return { response: fallbackText };
      }
    }
  `,
  metadata: {
    author: 'angela Flow SDK',
    version: '1.0.0',
    tags: ['data-processing', 'response', 'extraction', 'llm']
  }
};

console.log('Response Extractor Node Definition:');
console.log('=====================================');
console.log('Copy this into Agent Studio as a new custom node:');
console.log('');
console.log(JSON.stringify(responseExtractorNode, null, 2));
console.log('');
console.log('Usage in Agent Studio:');
console.log('1. Create new custom node');
console.log('2. Copy the above JSON definition');
console.log('3. Use: LLM Node → Response Extractor → Output Node'); 
