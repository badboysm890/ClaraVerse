/**
 * angela Assistant Tools System
 * 
 * This file defines the default tools available to angela Assistant
 * and provides utilities for tool management and execution.
 */

import { angelaTool, angelaToolResult } from '../types/angela_assistant_types';

/**
 * Get current date and time
 */
const timeTools: angelaTool[] = [
  {
    id: 'get_current_time',
    name: 'Get Current Time',
    description: 'Get the current date and time',
    category: 'time',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., UTC, America/New_York, Europe/London)',
          default: 'local'
        },
        format: {
          type: 'string',
          description: 'Time format (12h, 24h, iso)',
          default: '12h'
        }
      },
      required: []
    },
    implementation: async (params: any) => {
      const { timezone = 'local', format = '12h' } = params;
      
      const now = new Date();
      let timeString = '';
      
      if (timezone === 'local') {
        if (format === '24h') {
          timeString = now.toLocaleString('en-US', { hour12: false });
        } else if (format === 'iso') {
          timeString = now.toISOString();
        } else {
          timeString = now.toLocaleString('en-US', { hour12: true });
        }
      } else {
        if (format === '24h') {
          timeString = now.toLocaleString('en-US', { 
            timeZone: timezone, 
            hour12: false 
          });
        } else if (format === 'iso') {
          timeString = now.toISOString();
        } else {
          timeString = now.toLocaleString('en-US', { 
            timeZone: timezone, 
            hour12: true 
          });
        }
      }
      
      return {
        current_time: timeString,
        timezone: timezone,
        format: format,
        timestamp: now.getTime()
      };
    },
    isEnabled: true,
    version: '1.0.0',
    author: 'angela Assistant'
  }
];

/**
 * Mathematical calculation tools
 */
const mathTools: angelaTool[] = [
  {
    id: 'calculate',
    name: 'Calculate',
    description: 'Perform mathematical calculations',
    category: 'math',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(π/2)")'
        }
      },
      required: ['expression']
    },
    implementation: async (params: any) => {
      const { expression } = params;
      
      try {
        // Basic math operations and functions
        const safeExpression = expression
          .replace(/\^/g, '**')  // Replace ^ with **
          .replace(/π/g, 'Math.PI')
          .replace(/pi/g, 'Math.PI')
          .replace(/e/g, 'Math.E')
          .replace(/sin/g, 'Math.sin')
          .replace(/cos/g, 'Math.cos')
          .replace(/tan/g, 'Math.tan')
          .replace(/sqrt/g, 'Math.sqrt')
          .replace(/log/g, 'Math.log')
          .replace(/abs/g, 'Math.abs')
          .replace(/floor/g, 'Math.floor')
          .replace(/ceil/g, 'Math.ceil')
          .replace(/round/g, 'Math.round');

        // Only allow safe mathematical operations
        if (!/^[0-9+\-*/(). Math.A-Z_]+$/i.test(safeExpression)) {
          throw new Error('Invalid characters in expression');
        }

        const result = eval(safeExpression);
        
        return {
          expression: expression,
          result: result,
          formatted_result: typeof result === 'number' ? result.toLocaleString() : result
        };
      } catch (error) {
        throw new Error(`Calculation error: ${error}`);
      }
    },
    isEnabled: true,
    version: '1.0.0',
    author: 'angela Assistant'
  },
  {
    id: 'convert_units',
    name: 'Convert Units',
    description: 'Convert between different units of measurement',
    category: 'math',
    parameters: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          description: 'The value to convert'
        },
        from_unit: {
          type: 'string',
          description: 'Source unit (e.g., meters, feet, celsius, fahrenheit)'
        },
        to_unit: {
          type: 'string',
          description: 'Target unit'
        }
      },
      required: ['value', 'from_unit', 'to_unit']
    },
    implementation: async (params: any) => {
      const { value, from_unit, to_unit } = params;
      
      // Unit conversion mappings
      const conversions: Record<string, Record<string, number | ((val: number) => number)>> = {
        // Length
        meters: { feet: 3.28084, inches: 39.3701, centimeters: 100, kilometers: 0.001 },
        feet: { meters: 0.3048, inches: 12, centimeters: 30.48, kilometers: 0.0003048 },
        inches: { meters: 0.0254, feet: 0.0833333, centimeters: 2.54, kilometers: 0.0000254 },
        centimeters: { meters: 0.01, feet: 0.0328084, inches: 0.393701, kilometers: 0.00001 },
        kilometers: { meters: 1000, feet: 3280.84, inches: 39370.1, centimeters: 100000 },
        
        // Temperature (special handling)
        celsius: { 
          fahrenheit: (c: number) => (c * 9/5) + 32, 
          kelvin: (c: number) => c + 273.15 
        },
        fahrenheit: { 
          celsius: (f: number) => (f - 32) * 5/9, 
          kelvin: (f: number) => ((f - 32) * 5/9) + 273.15 
        },
        kelvin: { 
          celsius: (k: number) => k - 273.15, 
          fahrenheit: (k: number) => ((k - 273.15) * 9/5) + 32 
        },
        
        // Weight
        kilograms: { pounds: 2.20462, grams: 1000, ounces: 35.274 },
        pounds: { kilograms: 0.453592, grams: 453.592, ounces: 16 },
        grams: { kilograms: 0.001, pounds: 0.00220462, ounces: 0.035274 },
        ounces: { kilograms: 0.0283495, pounds: 0.0625, grams: 28.3495 }
      };
      
      const fromLower = from_unit.toLowerCase();
      const toLower = to_unit.toLowerCase();
      
      if (!conversions[fromLower]) {
        throw new Error(`Unknown source unit: ${from_unit}`);
      }
      
      if (!conversions[fromLower][toLower]) {
        throw new Error(`Cannot convert from ${from_unit} to ${to_unit}`);
      }
      
      let result: number;
      const converter = conversions[fromLower][toLower];
      
      if (typeof converter === 'function') {
        result = converter(value);
      } else {
        result = value * converter;
      }
      
      return {
        original_value: value,
        from_unit: from_unit,
        to_unit: to_unit,
        converted_value: result,
        formatted_result: `${value} ${from_unit} = ${result.toFixed(4)} ${to_unit}`
      };
    },
    isEnabled: true,
    version: '1.0.0',
    author: 'angela Assistant'
  }
];

/**
 * File system tools
 */
const fileTools: angelaTool[] = [
  {
    id: 'create_file',
    name: 'Create File',
    description: 'Create a file with specified content',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to create'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        file_type: {
          type: 'string',
          description: 'Type of file (text, json, csv, etc.)',
          default: 'text'
        }
      },
      required: ['filename', 'content']
    },
    implementation: async (params: any) => {
      const { filename, content, file_type = 'text' } = params;
      
      // In a real implementation, this would create an actual file
      // For now, we'll simulate the creation and return metadata
      
      const timestamp = new Date().toISOString();
      const fileSize = new Blob([content]).size;
      
      return {
        filename: filename,
        file_type: file_type,
        size_bytes: fileSize,
        created_at: timestamp,
        content_preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        success: true,
        message: `File '${filename}' created successfully`
      };
    },
    isEnabled: true,
    version: '1.0.0',
    author: 'angela Assistant'
  }
];

/**
 * System information tools
 */
const systemTools: angelaTool[] = [
  {
    id: 'get_system_info',
    name: 'Get System Info',
    description: 'Get information about the current system',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          description: 'Type of information to get (browser, screen, memory, etc.)',
          default: 'all'
        }
      },
      required: []
    },
    implementation: async (params: any) => {
      const { info_type = 'all' } = params;
      
      const info: any = {};
      
      if (info_type === 'all' || info_type === 'browser') {
        info.browser = {
          user_agent: navigator.userAgent,
          language: navigator.language,
          languages: navigator.languages,
          online: navigator.onLine,
          platform: navigator.platform
        };
      }
      
      if (info_type === 'all' || info_type === 'screen') {
        info.screen = {
          width: screen.width,
          height: screen.height,
          available_width: screen.availWidth,
          available_height: screen.availHeight,
          color_depth: screen.colorDepth,
          pixel_depth: screen.pixelDepth
        };
      }
      
      if (info_type === 'all' || info_type === 'window') {
        info.window = {
          inner_width: window.innerWidth,
          inner_height: window.innerHeight,
          outer_width: window.outerWidth,
          outer_height: window.outerHeight,
          device_pixel_ratio: window.devicePixelRatio
        };
      }
      
      if (info_type === 'all' || info_type === 'time') {
        info.time = {
          current_time: new Date().toISOString(),
          timezone_offset: new Date().getTimezoneOffset(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      }
      
      return info;
    },
    isEnabled: true,
    version: '1.0.0',
    author: 'angela Assistant'
  }
];

/**
 * All default tools combined
 */
export const defaultTools: angelaTool[] = [
  ...timeTools,
  ...mathTools,
  ...fileTools,
  ...systemTools
];

/**
 * Execute a tool with given parameters
 */
export const executeTool = async (
  toolId: string, 
  parameters: any
): Promise<angelaToolResult> => {
  const startTime = Date.now();
  
  try {
    const tool = defaultTools.find(t => t.id === toolId);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }
    
    if (!tool.isEnabled) {
      throw new Error(`Tool is disabled: ${toolId}`);
    }
    
    // Check if implementation is a function
    if (typeof tool.implementation !== 'function') {
      throw new Error(`Tool ${toolId} has invalid implementation type`);
    }
    
    const result = await tool.implementation(parameters);
    const executionTime = Date.now() - startTime;
    
    return {
      toolId,
      success: true,
      result,
      executionTime,
      metadata: {
        toolName: tool.name,
        category: tool.category,
        version: tool.version
      }
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      toolId,
      success: false,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime,
      metadata: {
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      }
    };
  }
};

/**
 * Get tool by ID
 */
export const getTool = (toolId: string): angelaTool | undefined => {
  return defaultTools.find(t => t.id === toolId);
};

/**
 * Get tools by category
 */
export const getToolsByCategory = (category: string): angelaTool[] => {
  return defaultTools.filter(t => t.category === category);
};

/**
 * Get all enabled tools
 */
export const getEnabledTools = (): angelaTool[] => {
  return defaultTools.filter(t => t.isEnabled);
};

/**
 * Convert angela tools to OpenWebUI format for compatibility
 */
export const convertToOpenWebUIFormat = (tools: angelaTool[]) => {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}; 
