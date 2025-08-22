# SDK Integration Guide

Learn how to integrate angela Flow SDK v2.0 into your applications. Execute AI workflows with just a few lines of code, with automatic input detection and error handling.

## 🚀 Quick Start

### **Installation**
```bash
npm install angela-flow-sdk
```

### **Basic Usage (3 Lines)**
```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';

const runner = new angelaFlowRunner();
const result = await runner.run(workflow, { input: 'Hello World!' });
console.log(result);
```

That's it! The SDK automatically handles:
- ✅ Input detection and validation
- ✅ Custom node registration
- ✅ Execution order optimization
- ✅ Error handling and logging

## 📖 Complete API Reference

### **angelaFlowRunner Class**

**Constructor:**
```javascript
const runner = new angelaFlowRunner(options);
```

**Options:**
```javascript
{
  enableLogging: true,        // Enable execution logs
  logLevel: 'info',          // log, info, warn, error
  timeout: 30000,            // Execution timeout (ms)
  maxRetries: 3,             // Auto-retry failed operations
  customNodeTimeout: 10000   // Custom node execution timeout
}
```

### **Core Methods**

#### **`run(workflow, inputs)` - Execute Workflow**
Main execution method with automatic input handling.

```javascript
const result = await runner.run(workflow, inputs);
```

**Parameters:**
- `workflow` (Object): Exported workflow from angela Studio
- `inputs` (Object): Input values for the workflow

**Returns:** Object with workflow outputs

**Example:**
```javascript
const workflow = {
  "format": "angela-sdk",
  "flow": {
    "nodes": [...],
    "connections": [...]
  }
};

const result = await runner.run(workflow, {
  'user-input': 'Analyze this text content',
  'temperature': 0.7
});

console.log(result);
// {
//   'output-1': { output: 'Analysis complete...' },
//   'Result': { output: 'Analysis complete...' }
// }
```

#### **`getRequiredInputs(workflow)` - Analyze Input Requirements**
Discover what inputs a workflow needs before execution.

```javascript
const inputs = runner.getRequiredInputs(workflow);
```

**Returns:**
```javascript
[
  {
    id: 'user-message',
    name: 'User Message',
    type: 'text',
    required: true,
    description: 'Message from the user',
    example: 'Hello world',
    defaultValue: undefined
  },
  {
    id: 'system-prompt',
    name: 'System Prompt',
    type: 'text',
    required: false,
    description: 'System instructions',
    example: 'You are a helpful assistant',
    defaultValue: 'You are a helpful assistant'
  }
]
```

#### **`describe(workflow)` - Get Workflow Information**
Get comprehensive information about a workflow.

```javascript
const description = runner.describe(workflow);
```

**Returns:**
```javascript
{
  name: 'Content Analyzer',
  description: 'Analyzes text content and provides insights',
  inputs: [...],           // Required inputs
  outputs: [...],          // Output descriptions
  nodeCount: 5,
  hasAI: true,
  hasCustomNodes: false,
  aiModels: ['gpt-4'],
  complexity: 'Medium'     // Simple, Medium, Complex, Advanced
}
```

#### **`registerCustomNode(nodeDefinition)` - Add Custom Nodes**
Register custom nodes for use in workflows.

```javascript
runner.registerCustomNode({
  type: 'email-validator',
  name: 'Email Validator',
  executionCode: `
    function execute(inputs, properties, context) {
      const email = inputs.email || '';
      const isValid = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
      return { output: isValid, email: email };
    }
  `
});
```

### **Utility Methods**

#### **`getLogs()` - Get Execution Logs**
```javascript
const logs = runner.getLogs();
// Array of log entries with timestamps and details
```

#### **`clearLogs()` - Clear Execution Logs**
```javascript
runner.clearLogs();
```

## 🎯 Usage Patterns

### **1. Simple Execution**
For straightforward workflows with known inputs:

```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from './my-workflow.json';

const runner = new angelaFlowRunner();

async function processText(text) {
  const result = await runner.run(workflow, {
    'text-input': text
  });
  
  return result.output;
}

const analysis = await processText('Sample text to analyze');
console.log(analysis);
```

### **2. Dynamic Input Detection**
For workflows with unknown input requirements:

```javascript
async function executeWorkflow(workflow, userInputs = {}) {
  const runner = new angelaFlowRunner();
  
  // Discover what inputs are needed
  const requiredInputs = runner.getRequiredInputs(workflow);
  
  // Check for missing required inputs
  const missingInputs = requiredInputs.filter(input => 
    input.required && !userInputs[input.id] && !userInputs[input.name]
  );
  
  if (missingInputs.length > 0) {
    console.log('Missing required inputs:');
    missingInputs.forEach(input => {
      console.log(`- ${input.name} (${input.type}): ${input.description}`);
    });
    return null;
  }
  
  // Execute with validation passed
  return await runner.run(workflow, userInputs);
}
```

### **3. Error Handling and Retry**
Robust execution with comprehensive error handling:

```javascript
async function executeWithRetry(workflow, inputs, maxRetries = 3) {
  const runner = new angelaFlowRunner({
    enableLogging: true,
    timeout: 60000
  });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Execution attempt ${attempt}/${maxRetries}`);
      
      const result = await runner.run(workflow, inputs);
      console.log('✅ Execution successful');
      return result;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        // Log execution details for debugging
        const logs = runner.getLogs();
        console.log('Execution logs:', logs);
        throw new Error(`Workflow failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

### **4. Batch Processing**
Process multiple inputs efficiently:

```javascript
async function processBatch(workflow, inputsArray) {
  const runner = new angelaFlowRunner();
  const results = [];
  
  // Process in parallel (be mindful of rate limits)
  const promises = inputsArray.map(async (inputs, index) => {
    try {
      const result = await runner.run(workflow, inputs);
      return { index, success: true, result };
    } catch (error) {
      return { index, success: false, error: error.message };
    }
  });
  
  const batchResults = await Promise.all(promises);
  
  // Separate successful and failed results
  const successful = batchResults.filter(r => r.success);
  const failed = batchResults.filter(r => !r.success);
  
  console.log(`Batch completed: ${successful.length} success, ${failed.length} failed`);
  
  return {
    successful: successful.map(r => r.result),
    failed: failed.map(r => ({ index: r.index, error: r.error }))
  };
}

// Usage
const inputs = [
  { 'text': 'First document to analyze' },
  { 'text': 'Second document to analyze' },
  { 'text': 'Third document to analyze' }
];

const batchResult = await processBatch(workflow, inputs);
```

### **5. Streaming and Progress**
Monitor execution progress for long-running workflows:

```javascript
class ProgressTracker {
  constructor(runner) {
    this.runner = runner;
    this.startTime = null;
    this.nodeCount = 0;
  }
  
  async executeWithProgress(workflow, inputs, onProgress) {
    this.startTime = Date.now();
    this.nodeCount = workflow.flow.nodes.length;
    
    // Monitor logs for progress updates
    const originalRun = this.runner.run.bind(this.runner);
    
    try {
      const result = await originalRun(workflow, inputs);
      
      // Get final logs for progress calculation
      const logs = this.runner.getLogs();
      const completedNodes = logs.filter(log => 
        log.message.includes('Completed:')
      ).length;
      
      onProgress({
        progress: 100,
        completed: completedNodes,
        total: this.nodeCount,
        duration: Date.now() - this.startTime,
        status: 'completed'
      });
      
      return result;
      
    } catch (error) {
      onProgress({
        progress: -1,
        status: 'failed',
        error: error.message,
        duration: Date.now() - this.startTime
      });
      throw error;
    }
  }
}

// Usage
const tracker = new ProgressTracker(runner);

await tracker.executeWithProgress(workflow, inputs, (progress) => {
  console.log(`Progress: ${progress.progress}% (${progress.completed}/${progress.total} nodes)`);
  
  if (progress.status === 'completed') {
    console.log(`✅ Completed in ${progress.duration}ms`);
  } else if (progress.status === 'failed') {
    console.log(`❌ Failed: ${progress.error}`);
  }
});
```

## 🔧 Advanced Configuration

### **Custom Node Integration**
```javascript
const runner = new angelaFlowRunner();

// Register multiple custom nodes
const customNodes = [
  {
    type: 'data-validator',
    name: 'Data Validator',
    executionCode: `
      function execute(inputs, properties, context) {
        const data = inputs.data;
        const schema = properties.schema;
        
        // Validation logic here
        const isValid = validateAgainstSchema(data, schema);
        
        return {
          output: isValid,
          data: data,
          errors: isValid ? [] : getValidationErrors(data, schema)
        };
      }
    `
  },
  {
    type: 'api-client',
    name: 'API Client',
    executionCode: `
      async function execute(inputs, properties, context) {
        const url = inputs.url;
        const method = properties.method || 'GET';
        const headers = properties.headers || {};
        
        try {
          const response = await fetch(url, { method, headers });
          const data = await response.json();
          
          return {
            output: data,
            status: response.status,
            success: response.ok
          };
        } catch (error) {
          context.error('API request failed', { error: error.message });
          return {
            output: null,
            success: false,
            error: error.message
          };
        }
      }
    `
  }
];

// Register all custom nodes
customNodes.forEach(node => runner.registerCustomNode(node));
```

### **Environment-Specific Configuration**
```javascript
// config.js
export function createRunner(environment = 'development') {
  const configs = {
    development: {
      enableLogging: true,
      logLevel: 'debug',
      timeout: 10000,
      maxRetries: 1
    },
    
    production: {
      enableLogging: true,
      logLevel: 'error',
      timeout: 30000,
      maxRetries: 3
    },
    
    testing: {
      enableLogging: false,
      timeout: 5000,
      maxRetries: 0
    }
  };
  
  return new angelaFlowRunner(configs[environment]);
}

// Usage
import { createRunner } from './config.js';

const runner = createRunner(process.env.NODE_ENV);
```

## 🎨 Framework Integration

### **Express.js Middleware**
```javascript
import express from 'express';
import { angelaFlowRunner } from 'angela-flow-sdk';

function createWorkflowMiddleware(workflow) {
  const runner = new angelaFlowRunner({
    enableLogging: true,
    timeout: 30000
  });
  
  return async (req, res, next) => {
    try {
      // Extract inputs from request
      const inputs = {
        ...req.body,
        ...req.query,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };
      
      // Execute workflow
      const result = await runner.run(workflow, inputs);
      
      // Attach result to request
      req.workflowResult = result;
      next();
      
    } catch (error) {
      res.status(400).json({
        error: error.message,
        logs: runner.getLogs()
      });
    }
  };
}

// Usage
const app = express();
app.use(express.json());

app.post('/analyze', 
  createWorkflowMiddleware(analysisWorkflow),
  (req, res) => {
    res.json({
      success: true,
      analysis: req.workflowResult
    });
  }
);
```

### **React Integration**
```javascript
import React, { useState, useCallback } from 'react';
import { angelaFlowRunner } from 'angela-flow-sdk';

function WorkflowExecutor({ workflow }) {
  const [runner] = useState(() => new angelaFlowRunner());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const executeWorkflow = useCallback(async (inputs) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await runner.run(workflow, inputs);
      setResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runner, workflow]);
  
  const requiredInputs = runner.getRequiredInputs(workflow);
  
  return (
    <div>
      <h3>Workflow: {workflow.flow.name}</h3>
      
      {/* Input form */}
      <form onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const inputs = Object.fromEntries(formData);
        executeWorkflow(inputs);
      }}>
        {requiredInputs.map(input => (
          <div key={input.id}>
            <label>{input.name}</label>
            <input
              name={input.id}
              type={input.type === 'number' ? 'number' : 'text'}
              required={input.required}
              placeholder={input.example}
            />
          </div>
        ))}
        
        <button type="submit" disabled={loading}>
          {loading ? 'Executing...' : 'Execute Workflow'}
        </button>
      </form>
      
      {/* Results */}
      {error && <div className="error">Error: {error}</div>}
      {result && (
        <div className="result">
          <h4>Result:</h4>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

### **Next.js API Route**
```javascript
// pages/api/workflow/[id].js
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflows from '../../../workflows/index.js';

const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 60000
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  const workflow = workflows[id];
  
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  
  try {
    const result = await runner.run(workflow, req.body);
    
    res.json({
      success: true,
      workflowId: id,
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      workflowId: id,
      error: error.message,
      logs: runner.getLogs()
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
```

## 📊 Performance Optimization

### **Connection Pooling for AI APIs**
```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';

class OptimizedRunner extends angelaFlowRunner {
  constructor(options = {}) {
    super({
      ...options,
      // Custom HTTP agent for connection pooling
      httpAgent: new (require('https').Agent)({
        keepAlive: true,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 30000
      })
    });
  }
}

const runner = new OptimizedRunner();
```

### **Caching Results**
```javascript
import NodeCache from 'node-cache';

class CachedRunner {
  constructor() {
    this.runner = new angelaFlowRunner();
    this.cache = new NodeCache({ 
      stdTTL: 600, // 10 minutes
      checkperiod: 120 
    });
  }
  
  async run(workflow, inputs) {
    // Create cache key
    const cacheKey = this.createCacheKey(workflow, inputs);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }
    
    // Execute and cache
    const result = await this.runner.run(workflow, inputs);
    this.cache.set(cacheKey, result);
    
    return { ...result, fromCache: false };
  }
  
  createCacheKey(workflow, inputs) {
    const workflowHash = workflow.flow.id || JSON.stringify(workflow).slice(0, 50);
    const inputsHash = JSON.stringify(inputs);
    return `${workflowHash}:${inputsHash}`;
  }
}
```

## 🔍 Debugging and Testing

### **Test Utilities**
```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';

export class WorkflowTester {
  constructor() {
    this.runner = new angelaFlowRunner({
      enableLogging: true,
      logLevel: 'debug'
    });
  }
  
  async test(workflow, testCases) {
    const results = [];
    
    for (const testCase of testCases) {
      const { name, inputs, expectedOutput, shouldFail = false } = testCase;
      
      try {
        const result = await this.runner.run(workflow, inputs);
        
        const passed = shouldFail ? false : this.validateOutput(result, expectedOutput);
        
        results.push({
          name,
          passed,
          result,
          error: null,
          logs: this.runner.getLogs()
        });
        
      } catch (error) {
        const passed = shouldFail;
        
        results.push({
          name,
          passed,
          result: null,
          error: error.message,
          logs: this.runner.getLogs()
        });
      }
      
      this.runner.clearLogs();
    }
    
    return results;
  }
  
  validateOutput(actual, expected) {
    // Simple validation - can be enhanced
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
}

// Usage
const tester = new WorkflowTester();

const testResults = await tester.test(workflow, [
  {
    name: 'Basic text analysis',
    inputs: { text: 'Sample text' },
    expectedOutput: { analysis: 'positive' }
  },
  {
    name: 'Empty input should fail',
    inputs: {},
    shouldFail: true
  }
]);

console.log(`Tests passed: ${testResults.filter(r => r.passed).length}/${testResults.length}`);
```

### **Debugging Workflow Execution**
```javascript
function debugWorkflow(workflow, inputs) {
  const runner = new angelaFlowRunner({
    enableLogging: true,
    logLevel: 'debug'
  });
  
  console.log('🔍 Debugging workflow execution...');
  
  // Analyze workflow first
  const description = runner.describe(workflow);
  console.log('📊 Workflow Info:', description);
  
  const requiredInputs = runner.getRequiredInputs(workflow);
  console.log('📥 Required Inputs:', requiredInputs);
  
  // Validate inputs
  const missingInputs = requiredInputs.filter(input => 
    input.required && !inputs[input.id] && !inputs[input.name]
  );
  
  if (missingInputs.length > 0) {
    console.log('❌ Missing inputs:', missingInputs.map(i => i.name));
    return;
  }
  
  // Execute with detailed logging
  return runner.run(workflow, inputs)
    .then(result => {
      console.log('✅ Execution successful');
      console.log('📤 Result:', result);
      
      const logs = runner.getLogs();
      console.log('📋 Execution logs:');
      logs.forEach(log => {
        console.log(`  ${log.level}: ${log.message}`);
      });
      
      return result;
    })
    .catch(error => {
      console.log('❌ Execution failed:', error.message);
      
      const logs = runner.getLogs();
      console.log('📋 Error logs:');
      logs.forEach(log => {
        console.log(`  ${log.level}: ${log.message}`);
      });
      
      throw error;
    });
}
```

## 📚 Examples Repository

### **Content Analysis Workflow**
```javascript
// content-analyzer.js
import { angelaFlowRunner } from 'angela-flow-sdk';
import contentWorkflow from './workflows/content-analyzer.json';

export async function analyzeContent(text, options = {}) {
  const runner = new angelaFlowRunner();
  
  const result = await runner.run(contentWorkflow, {
    'content-input': text,
    'analysis-type': options.type || 'comprehensive',
    'language': options.language || 'en'
  });
  
  return {
    sentiment: result.sentiment?.output,
    keywords: result.keywords?.output,
    summary: result.summary?.output,
    score: result.score?.output
  };
}

// Usage
const analysis = await analyzeContent(
  'This is a great product with excellent features!',
  { type: 'sentiment', language: 'en' }
);
```

### **Document Processing Pipeline**
```javascript
// document-processor.js
import { angelaFlowRunner } from 'angela-flow-sdk';
import documentWorkflow from './workflows/document-processor.json';

export class DocumentProcessor {
  constructor() {
    this.runner = new angelaFlowRunner({
      timeout: 120000, // 2 minutes for large documents
      enableLogging: true
    });
  }
  
  async processDocument(documentPath, options = {}) {
    const result = await this.runner.run(documentWorkflow, {
      'document-path': documentPath,
      'extract-images': options.extractImages || false,
      'output-format': options.format || 'markdown'
    });
    
    return {
      content: result.content?.output,
      metadata: result.metadata?.output,
      images: result.images?.output || [],
      processingTime: result.timing?.output
    };
  }
}
```

---

## 🎯 Best Practices

1. **Always handle errors** - Workflows can fail for many reasons
2. **Validate inputs** - Use `getRequiredInputs()` to check requirements
3. **Enable logging** - Essential for debugging complex workflows  
4. **Use timeouts** - Prevent hanging on long-running operations
5. **Cache results** - Improve performance for repeated operations
6. **Test thoroughly** - Create comprehensive test suites
7. **Monitor performance** - Track execution times and optimize

## 🆘 Troubleshooting

**Common Issues:**

1. **"Missing required inputs"** - Use `getRequiredInputs()` to check what's needed
2. **"Custom node not found"** - Ensure custom nodes are registered before execution
3. **"Execution timeout"** - Increase timeout or optimize workflow
4. **"Invalid workflow format"** - Check workflow was exported correctly from angela Studio

**Getting Help:**
- Check execution logs with `runner.getLogs()`
- Use `runner.describe()` to understand workflow structure
- Enable debug logging for detailed information

---

**Ready to integrate angela Flow SDK?** Start with the basic examples and gradually add advanced features! 🚀 
