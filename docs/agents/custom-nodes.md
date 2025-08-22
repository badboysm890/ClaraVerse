# Creating Custom Nodes

Extend Agent Studio with your own specialized functionality by creating custom nodes. Build reusable components that integrate seamlessly with existing workflows.

## 🎯 Overview

Custom nodes allow you to:
- **Extend functionality** beyond built-in nodes
- **Integrate external services** and APIs
- **Implement business logic** specific to your needs
- **Share components** across multiple workflows
- **Create libraries** of specialized tools

## 🚀 Getting Started

### **Step 1: Access Node Creator**
1. Open Agent Studio
2. Click **"Create Node"** in the toolbar
3. The Node Creator dialog opens

### **Step 2: Basic Configuration**
Configure your node's metadata:

**Node Metadata:**
- **Name**: Human-readable node name
- **Type**: Unique identifier (lowercase, hyphenated)
- **Description**: What the node does
- **Icon**: Emoji or Unicode character
- **Category**: custom, utility, integration, ai, data

**Example:**
```json
{
  "name": "Email Validator",
  "type": "email-validator",
  "description": "Validates email addresses using regex patterns",
  "icon": "📧",
  "category": "utility"
}
```

### **Step 3: Define Inputs and Outputs**

**Input Configuration:**
```json
{
  "id": "email",
  "name": "Email Address",
  "type": "string",
  "required": true,
  "description": "Email address to validate"
}
```

**Output Configuration:**
```json
{
  "id": "output",
  "name": "Is Valid",
  "type": "boolean",
  "description": "Whether the email is valid"
}
```

### **Step 4: Write Execution Code**
Implement your node's logic in JavaScript:

```javascript
function execute(inputs, properties, context) {
  const email = inputs.email || '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);
  
  context.log(`Validating email: ${email}`);
  
  return {
    output: isValid,
    email: email,
    status: isValid ? 'valid' : 'invalid'
  };
}
```

## 📖 Execution Function Reference

### **Function Signature**
```javascript
function execute(inputs, properties, context) {
  // Your implementation here
  return outputs;
}
```

### **Parameters**

**`inputs` (Object)**
- Contains all connected input values
- Keys match input port IDs
- Values depend on connected node outputs

**`properties` (Object)**
- Node configuration properties
- Set in the node properties panel
- Static values configured by user

**`context` (Object)**
- Execution environment and utilities
- Logging functions
- Error handling helpers

### **Return Value**
- Object with output port IDs as keys
- Values will be passed to connected nodes
- Must match defined output types

## 🛠️ Context API

### **Logging Functions**
```javascript
context.log(message, data);     // Info log
context.warn(message, data);    // Warning log
context.error(message, data);   // Error log
```

**Example:**
```javascript
context.log('Processing started', { email: inputs.email });
context.warn('Invalid format detected');
context.error('Validation failed', { error: error.message });
```

### **Utility Functions**
```javascript
// HTTP requests (future feature)
context.fetch(url, options);

// JSON utilities
context.parseJSON(text);
context.stringifyJSON(object);

// Validation helpers
context.validateEmail(email);
context.validateURL(url);
```

## 📝 Complete Examples

### **1. Text Processor Node**

**Configuration:**
```json
{
  "name": "Text Processor",
  "type": "text-processor",
  "description": "Advanced text processing with multiple operations",
  "icon": "✏️",
  "inputs": [
    {
      "id": "text",
      "name": "Input Text",
      "type": "string",
      "required": true
    },
    {
      "id": "operation",
      "name": "Operation",
      "type": "string",
      "required": true
    }
  ],
  "outputs": [
    {
      "id": "output",
      "name": "Processed Text",
      "type": "string"
    },
    {
      "id": "metadata",
      "name": "Processing Info",
      "type": "object"
    }
  ],
  "properties": [
    {
      "id": "preserveCase",
      "name": "Preserve Case",
      "type": "boolean",
      "default": false
    }
  ]
}
```

**Execution Code:**
```javascript
function execute(inputs, properties, context) {
  const text = inputs.text || '';
  const operation = inputs.operation || 'none';
  const preserveCase = properties.preserveCase || false;
  
  context.log(`Processing text with operation: ${operation}`);
  
  let result = text;
  let metadata = {
    originalLength: text.length,
    operation: operation,
    timestamp: new Date().toISOString()
  };
  
  try {
    switch (operation.toLowerCase()) {
      case 'uppercase':
        result = preserveCase ? text : text.toUpperCase();
        break;
        
      case 'lowercase':
        result = preserveCase ? text : text.toLowerCase();
        break;
        
      case 'reverse':
        result = text.split('').reverse().join('');
        break;
        
      case 'word-count':
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        result = words.length.toString();
        metadata.words = words;
        break;
        
      case 'remove-spaces':
        result = text.replace(/\s+/g, '');
        break;
        
      case 'capitalize':
        result = text.replace(/\b\w/g, l => l.toUpperCase());
        break;
        
      default:
        context.warn(`Unknown operation: ${operation}`);
        result = text;
    }
    
    metadata.processedLength = result.length;
    metadata.success = true;
    
    context.log('Processing completed successfully');
    
    return {
      output: result,
      metadata: metadata
    };
    
  } catch (error) {
    context.error('Processing failed', { error: error.message });
    
    return {
      output: text, // Return original on error
      metadata: {
        ...metadata,
        success: false,
        error: error.message
      }
    };
  }
}
```

### **2. API Client Node**

**Configuration:**
```json
{
  "name": "Weather API",
  "type": "weather-api",
  "description": "Fetch weather data for a location",
  "icon": "🌤️",
  "inputs": [
    {
      "id": "location",
      "name": "Location",
      "type": "string",
      "required": true
    }
  ],
  "outputs": [
    {
      "id": "weather",
      "name": "Weather Data",
      "type": "object"
    },
    {
      "id": "temperature",
      "name": "Temperature",
      "type": "number"
    }
  ],
  "properties": [
    {
      "id": "apiKey",
      "name": "API Key",
      "type": "string",
      "required": true,
      "secure": true
    },
    {
      "id": "units",
      "name": "Units",
      "type": "select",
      "options": ["metric", "imperial", "kelvin"],
      "default": "metric"
    }
  ]
}
```

**Execution Code:**
```javascript
async function execute(inputs, properties, context) {
  const location = inputs.location || '';
  const apiKey = properties.apiKey || '';
  const units = properties.units || 'metric';
  
  if (!apiKey) {
    context.error('API key is required');
    return {
      weather: null,
      temperature: null
    };
  }
  
  if (!location) {
    context.error('Location is required');
    return {
      weather: null,
      temperature: null
    };
  }
  
  context.log(`Fetching weather for: ${location}`);
  
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const weatherData = await response.json();
    
    context.log('Weather data fetched successfully');
    
    return {
      weather: weatherData,
      temperature: weatherData.main.temp
    };
    
  } catch (error) {
    context.error('Failed to fetch weather data', { 
      error: error.message,
      location: location 
    });
    
    return {
      weather: {
        error: error.message,
        location: location
      },
      temperature: null
    };
  }
}
```

### **3. Data Transformer Node**

**Configuration:**
```json
{
  "name": "JSON Transformer",
  "type": "json-transformer",
  "description": "Transform JSON data using custom mapping rules",
  "icon": "🔄",
  "inputs": [
    {
      "id": "data",
      "name": "Input Data",
      "type": "object",
      "required": true
    },
    {
      "id": "mapping",
      "name": "Mapping Rules",
      "type": "object",
      "required": true
    }
  ],
  "outputs": [
    {
      "id": "output",
      "name": "Transformed Data",
      "type": "object"
    },
    {
      "id": "stats",
      "name": "Transformation Stats",
      "type": "object"
    }
  ]
}
```

**Execution Code:**
```javascript
function execute(inputs, properties, context) {
  const data = inputs.data || {};
  const mapping = inputs.mapping || {};
  
  context.log('Starting JSON transformation');
  
  const stats = {
    fieldsProcessed: 0,
    fieldsCreated: 0,
    errors: []
  };
  
  const result = {};
  
  try {
    // Process each mapping rule
    for (const [targetPath, sourcePath] of Object.entries(mapping)) {
      stats.fieldsProcessed++;
      
      try {
        const value = getNestedValue(data, sourcePath);
        setNestedValue(result, targetPath, value);
        stats.fieldsCreated++;
        
      } catch (error) {
        stats.errors.push({
          targetPath,
          sourcePath,
          error: error.message
        });
        context.warn(`Mapping failed: ${sourcePath} -> ${targetPath}`, {
          error: error.message
        });
      }
    }
    
    context.log('Transformation completed', stats);
    
    return {
      output: result,
      stats: stats
    };
    
  } catch (error) {
    context.error('Transformation failed', { error: error.message });
    
    return {
      output: {},
      stats: {
        ...stats,
        success: false,
        error: error.message
      }
    };
  }
}

// Helper function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      return current[key];
    }
    return undefined;
  }, obj);
}

// Helper function to set nested object values
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  
  target[lastKey] = value;
}
```

## 🔧 Property Types

### **Basic Types**
```javascript
// String input
{
  "id": "message",
  "name": "Message",
  "type": "string",
  "default": "Hello World"
}

// Number input
{
  "id": "count",
  "name": "Count",
  "type": "number",
  "default": 1,
  "min": 0,
  "max": 100
}

// Boolean checkbox
{
  "id": "enabled",
  "name": "Enabled",
  "type": "boolean",
  "default": true
}
```

### **Advanced Types**
```javascript
// Select dropdown
{
  "id": "mode",
  "name": "Processing Mode",
  "type": "select",
  "options": ["fast", "accurate", "balanced"],
  "default": "balanced"
}

// Multi-line text
{
  "id": "template",
  "name": "Template",
  "type": "textarea",
  "rows": 5,
  "placeholder": "Enter template..."
}

// Secure input (passwords, API keys)
{
  "id": "apiKey",
  "name": "API Key",
  "type": "string",
  "secure": true,
  "placeholder": "Enter your API key"
}

// JSON object editor
{
  "id": "config",
  "name": "Configuration",
  "type": "json",
  "default": {}
}
```

## 🎨 Best Practices

### **Code Organization**
```javascript
function execute(inputs, properties, context) {
  // 1. Input validation
  const validated = validateInputs(inputs, properties);
  if (!validated.valid) {
    return handleError(validated.error, context);
  }
  
  // 2. Main processing
  const result = processData(validated.data, context);
  
  // 3. Output formatting
  return formatOutput(result);
}

function validateInputs(inputs, properties) {
  // Validation logic
}

function processData(data, context) {
  // Main logic
}

function formatOutput(result) {
  // Output formatting
}

function handleError(error, context) {
  context.error(error.message);
  return { output: null, error: error.message };
}
```

### **Error Handling**
```javascript
function execute(inputs, properties, context) {
  try {
    // Main logic here
    
    if (someCondition) {
      context.warn('Potential issue detected');
    }
    
    return {
      output: result,
      success: true
    };
    
  } catch (error) {
    context.error('Operation failed', {
      error: error.message,
      stack: error.stack,
      inputs: inputs
    });
    
    // Return safe fallback
    return {
      output: null,
      success: false,
      error: error.message
    };
  }
}
```

### **Performance Tips**
```javascript
function execute(inputs, properties, context) {
  const startTime = Date.now();
  
  // Your processing logic
  
  const duration = Date.now() - startTime;
  context.log(`Processing completed in ${duration}ms`);
  
  // Use caching for expensive operations
  if (properties.cacheEnabled) {
    // Implement caching logic
  }
  
  return result;
}
```

### **Testing Custom Nodes**
```javascript
// Include test data in your node
function execute(inputs, properties, context) {
  // Add debug mode
  if (properties.debugMode) {
    context.log('Debug: Input data', inputs);
    context.log('Debug: Properties', properties);
  }
  
  // Validate inputs thoroughly
  if (!inputs.requiredField) {
    context.error('Required field missing: requiredField');
    return { output: null };
  }
  
  // Your logic here
}
```

## 🚀 Advanced Features

### **Async Operations**
```javascript
async function execute(inputs, properties, context) {
  context.log('Starting async operation');
  
  try {
    // Parallel processing
    const [result1, result2] = await Promise.all([
      processA(inputs.dataA),
      processB(inputs.dataB)
    ]);
    
    // Sequential processing
    const step1 = await firstStep(inputs);
    const step2 = await secondStep(step1);
    
    return {
      output: step2,
      metadata: { result1, result2 }
    };
    
  } catch (error) {
    context.error('Async operation failed', { error: error.message });
    return { output: null };
  }
}
```

### **State Management**
```javascript
// Use properties for persistent state
function execute(inputs, properties, context) {
  // Initialize state if not exists
  let state = properties.internalState || { counter: 0, cache: {} };
  
  // Update state
  state.counter++;
  state.cache[inputs.key] = inputs.value;
  
  // Clean up old cache entries
  if (Object.keys(state.cache).length > 100) {
    const entries = Object.entries(state.cache);
    state.cache = Object.fromEntries(entries.slice(-50));
  }
  
  // Note: State changes aren't automatically persisted
  // You would need external storage for true persistence
  
  return {
    output: processWithState(inputs, state),
    debugInfo: { counter: state.counter }
  };
}
```

### **Integration Patterns**
```javascript
// External service integration
async function execute(inputs, properties, context) {
  const client = createServiceClient(properties.apiKey);
  
  try {
    const response = await client.callAPI({
      method: 'POST',
      endpoint: '/process',
      data: inputs.data
    });
    
    return {
      output: response.result,
      metadata: {
        requestId: response.requestId,
        cost: response.usage.cost
      }
    };
    
  } catch (error) {
    if (error.code === 'RATE_LIMITED') {
      context.warn('Rate limit hit, using cached result');
      return getCachedResult(inputs);
    }
    
    throw error;
  }
}
```

## 📦 Packaging and Sharing

### **Export Node Definition**
1. Complete your custom node
2. Click **"Export Node"** in the Node Creator
3. Save as `.json` file for sharing

### **Import Custom Nodes**
1. Click **"Import Node"** in Agent Studio
2. Select the `.json` file
3. Node appears in Custom Nodes section

### **Node Library Template**
```json
{
  "name": "My Custom Node",
  "type": "my-custom-node",
  "version": "1.0.0",
  "description": "Does something amazing",
  "author": "Your Name",
  "icon": "⚡",
  "category": "custom",
  "inputs": [...],
  "outputs": [...],
  "properties": [...],
  "executionCode": "function execute(inputs, properties, context) { ... }",
  "examples": [
    {
      "name": "Basic Usage",
      "inputs": { "text": "Hello World" },
      "properties": { "mode": "simple" },
      "expectedOutput": { "output": "Processed: Hello World" }
    }
  ],
  "documentation": {
    "usage": "Use this node to...",
    "examples": "See examples section",
    "limitations": "This node cannot..."
  }
}
```

## 🎯 Publishing Guidelines

### **Node Quality Checklist**
- [ ] Clear, descriptive name and description
- [ ] Proper input/output typing
- [ ] Comprehensive error handling
- [ ] Performance optimization
- [ ] Documentation and examples
- [ ] Testing with various inputs
- [ ] Security considerations

### **Security Best Practices**
- Validate all inputs thoroughly
- Sanitize data before external API calls
- Use secure properties for sensitive data
- Avoid exposing internal system information
- Implement rate limiting for external calls

---

**Ready to build your first custom node?** Start with a simple example and gradually add complexity! 🚀

**Need help?** Check out our **[Node Library Reference](node-library.md)** for inspiration! 💡 
