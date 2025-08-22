# angela Flow SDK v2.0 - Developer Guide 🚀

## The EASIEST Way to Run AI Workflows

**TL;DR:** Just 3 lines to run any angela Studio workflow!

```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';

const runner = new angelaFlowRunner();
const result = await runner.run(myWorkflow, { input: 'Hello!' });
console.log(result); // Done! ✨
```

---

## 🎯 **Problem Solved**

**Before (Complex):**
- Figure out what inputs a workflow needs
- Handle missing inputs manually  
- Parse complex workflow structures
- Write validation logic
- Handle errors gracefully

**After (Simple):**
- Import workflow JSON
- Call `runner.run(workflow, inputs)`
- Get results immediately

---

## 📋 **Auto Input Detection**

### **1. Analyze Any Workflow**

```javascript
const runner = new angelaFlowRunner();

// Get what inputs this workflow needs
const inputs = runner.getRequiredInputs(workflow);
console.log(inputs);
// [
//   {
//     id: 'user-message',
//     name: 'User Message', 
//     type: 'text',
//     required: true,
//     description: 'Message from the user',
//     example: 'Hello world'
//   },
//   {
//     id: 'system-prompt',
//     name: 'System Prompt',
//     type: 'text', 
//     required: false,
//     defaultValue: 'You are a helpful assistant',
//     example: 'Hello world'
//   }
// ]
```

### **2. Describe Workflow**

```javascript
const description = runner.describe(workflow);
console.log(description);
// {
//   name: 'AI Chat Assistant',
//   description: 'Processes user messages with AI',
//   inputs: [...], 
//   outputs: [...],
//   nodeCount: 5,
//   hasAI: true,
//   complexity: 'Medium'
// }
```

---

## 🚀 **Super Simple Execution**

### **Option 1: Provide All Inputs**
```javascript
const result = await runner.run(workflow, {
  'user-message': 'What is AI?',
  'system-prompt': 'Answer briefly' 
});
```

### **Option 2: Let SDK Handle Defaults**
```javascript
const result = await runner.run(workflow, {
  'user-message': 'What is AI?'
  // SDK uses default for system-prompt
});
```

### **Option 3: Get Helpful Errors**
```javascript
try {
  await runner.run(workflow, {}); // Missing required inputs
} catch (error) {
  console.log(error.message);
  // Missing required inputs:
  // - User Message (text): Message from the user
  // 
  // Please provide these inputs when calling run(workflow, inputs)
}
```

---

## 🎨 **Custom Nodes Work Too**

```javascript
// Your workflow exported from angela Studio with custom nodes
const workflowWithCustomNodes = {
  // ... your workflow JSON
  customNodes: [
    // ... your custom node definitions  
  ]
};

// SDK automatically registers and uses custom nodes
const result = await runner.run(workflowWithCustomNodes, inputs);
// Custom nodes work seamlessly! ✨
```

---

## 🔧 **Production API Example**

**Express.js Server (5 minutes setup):**

```javascript
import express from 'express';
import { angelaFlowRunner } from 'angela-flow-sdk';
import myWorkflow from './my-workflow.json';

const app = express();
app.use(express.json());

const runner = new angelaFlowRunner();

// Auto-generate API endpoint
app.post('/process', async (req, res) => {
  try {
    // SDK handles all the complexity
    const result = await runner.run(myWorkflow, req.body);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Auto-generate documentation endpoint
app.get('/docs', (req, res) => {
  const docs = runner.describe(myWorkflow);
  res.json(docs);
});

app.listen(3000, () => {
  console.log('🚀 AI workflow API running on port 3000');
});
```

---

## 💡 **Real-World Examples**

### **Example 1: Document Processor**
```javascript
// Workflow: PDF → Extract Text → Summarize → Output
const workflow = await import('./document-processor.json');

const result = await runner.run(workflow, {
  'pdf-file': pdfBuffer,
  'summary-length': 'short'
});

console.log(result.summary);
```

### **Example 2: Email Classifier**  
```javascript
// Workflow: Email → AI Analysis → Classification → Route
const workflow = await import('./email-classifier.json');

const result = await runner.run(workflow, {
  'email-content': emailBody,
  'sender': emailSender
});

console.log(result.category); // 'urgent', 'spam', 'normal'
```

### **Example 3: Image Analyzer**
```javascript
// Workflow: Image → AI Vision → Description → Tags  
const workflow = await import('./image-analyzer.json');

const result = await runner.run(workflow, {
  'image-data': base64Image
});

console.log(result.description, result.tags);
```

---

## ⚡ **Performance & Features**

- **Zero Config** - Works immediately
- **Auto Validation** - Catches errors early
- **Smart Logging** - Detailed execution logs
- **Browser + Node** - Universal compatibility  
- **TypeScript Ready** - Full type support
- **Custom Nodes** - Extensible architecture
- **Production Ready** - Error handling & retries

---

## 🎯 **Summary**

**For developers, it's incredibly simple:**

1. **Export** your workflow from angela Studio  
2. **Import** it into your app
3. **Run** it with the SDK

**That's it!** No complex setup, no learning curve, no boilerplate.

The SDK handles:
- ✅ Input detection and validation
- ✅ Default value management  
- ✅ Error handling and helpful messages
- ✅ Custom node registration
- ✅ Execution order optimization
- ✅ Result formatting

**Your job:** Build amazing AI applications.  
**SDK's job:** Handle all the complexity.

---

## 🚀 **Get Started Now**

```bash
npm install angela-flow-sdk
```

```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';

const runner = new angelaFlowRunner();
const result = await runner.run(workflow, inputs);
// You're done! 🎉
```

**Happy building!** 🎯 
