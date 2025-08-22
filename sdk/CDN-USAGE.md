# angela Flow SDK - CDN Usage Guide

## 🚀 Quick Start

### Option 1: Use from npm CDN (Recommended)

```html
<!-- Latest version -->
<script src="https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js"></script>

<!-- Specific version -->
<script src="https://unpkg.com/angela-flow-sdk@1.4.0/dist/angela-flow-sdk.umd.js"></script>

<!-- Minified version -->
<script src="https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.min.js"></script>
```

### Option 2: Use from jsDelivr CDN

```html
<!-- Latest version -->
<script src="https://cdn.jsdelivr.net/npm/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js"></script>

<!-- Specific version -->
<script src="https://cdn.jsdelivr.net/npm/angela-flow-sdk@1.4.0/dist/angela-flow-sdk.umd.js"></script>

<!-- Minified version -->
<script src="https://cdn.jsdelivr.net/npm/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.min.js"></script>
```

## 📖 Basic Usage

### Initialize the SDK

```html
<!DOCTYPE html>
<html>
<head>
    <title>angela Flow SDK Example</title>
</head>
<body>
    <!-- Load the SDK -->
    <script src="https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js"></script>
    
    <script>
        // Initialize the flow runner
        const runner = new angelaFlowSDK.angelaFlowRunner({
            enableLogging: true,
            timeout: 30000
        });
        
        console.log('angela Flow SDK loaded!');
    </script>
</body>
</html>
```

### Execute a Simple Flow

```javascript
// Define a simple flow
const flow = {
    name: "Hello World Flow",
    version: "1.0.0",
    nodes: [
        {
            id: "input-1",
            type: "input",
            data: { 
                label: "Message Input", 
                inputType: "string", 
                defaultValue: "Hello" 
            }
        },
        {
            id: "combine-1",
            type: "combine-text",
            data: { 
                mode: "space", 
                addSpaces: true 
            }
        },
        {
            id: "output-1",
            type: "output",
            data: { 
                label: "Result" 
            }
        }
    ],
    connections: [
        { 
            source: "input-1", 
            target: "combine-1", 
            sourceHandle: "output", 
            targetHandle: "text1" 
        },
        { 
            source: "combine-1", 
            target: "output-1", 
            sourceHandle: "output", 
            targetHandle: "input" 
        }
    ]
};

// Execute the flow
runner.executeFlow(flow, {
    "Message Input": "Hello",
    "combine-1": { text2: "World!" }
})
.then(result => {
    console.log('Flow result:', result);
})
.catch(error => {
    console.error('Flow error:', error);
});
```

## 🔧 Available Nodes

### Input/Output Nodes
- **`input`** - Text, JSON, number, or boolean input
- **`output`** - Display results with formatting
- **`image-input`** - Process images as base64
- **`pdf-input`** - Extract text from PDF files
- **`file-upload`** - Universal file upload with multiple output formats

### Data Processing Nodes
- **`combine-text`** - Combine two text inputs with configurable separation
- **`json-parse`** - Parse JSON and extract fields with dot notation
- **`api-request`** - HTTP/REST API client with authentication

### Logic Nodes
- **`if-else`** - Conditional logic with JavaScript expressions

### AI Nodes
- **`llm`** - Large Language Model interface
- **`structured-llm`** - Generate structured JSON outputs
- **`whisper-transcription`** - Audio transcription using OpenAI Whisper

## 🌐 Browser-Specific Features

### File Upload Handling

```javascript
// Handle file uploads in the browser
const fileInput = document.getElementById('file-input');
const file = fileInput.files[0];

// Upload as base64
runner.handleFileUpload(file, { outputFormat: 'base64' })
    .then(base64Data => {
        console.log('File as base64:', base64Data);
    });

// Upload as text
runner.handleFileUpload(file, { outputFormat: 'text' })
    .then(textData => {
        console.log('File as text:', textData);
    });

// Upload as object URL
runner.handleFileUpload(file, { outputFormat: 'url' })
    .then(objectUrl => {
        console.log('Object URL:', objectUrl);
    });
```

### Flow Import/Export

```javascript
// Export a flow as downloadable file
angelaFlowSDK.BrowserUtils.downloadFlow(flowData, 'my-flow.json');

// Load flow from file input
const fileInput = document.getElementById('flow-file-input');
angelaFlowSDK.BrowserUtils.loadFlowFromFileInput(fileInput)
    .then(flowData => {
        console.log('Loaded flow:', flowData);
    });

// Load flow from URL
runner.loadFlowFromUrl('https://example.com/flow.json')
    .then(result => {
        console.log('Flow loaded from URL:', result);
    });
```

### Browser Information

```javascript
// Get browser information
const browserInfo = angelaFlowSDK.BrowserUtils.getBrowserInfo();
console.log('Browser:', browserInfo);

// Check if running in browser
const isBrowser = angelaFlowSDK.BrowserUtils.isBrowser();
console.log('Is browser:', isBrowser);
```

## 📝 Complete Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>angela Flow SDK - Complete Example</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 5px; cursor: pointer; }
        .output { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 5px; font-family: monospace; white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>angela Flow SDK Example</h1>
    
    <button onclick="runTextFlow()">Run Text Processing Flow</button>
    <button onclick="runAPIFlow()">Run API Request Flow</button>
    <button onclick="validateFlow()">Validate Flow</button>
    
    <div id="output" class="output">Click a button to see results...</div>

    <!-- Load angela Flow SDK -->
    <script src="https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js"></script>
    
    <script>
        const output = document.getElementById('output');
        const runner = new angelaFlowSDK.angelaFlowRunner({ enableLogging: true });
        
        function log(message) {
            output.textContent += new Date().toLocaleTimeString() + ': ' + message + '\n';
        }
        
        function runTextFlow() {
            output.textContent = '';
            log('Running text processing flow...');
            
            const flow = {
                name: "Text Processing",
                version: "1.0.0",
                nodes: [
                    {
                        id: "input-1",
                        type: "input",
                        data: { label: "First Name", inputType: "string", defaultValue: "angela" }
                    },
                    {
                        id: "input-2", 
                        type: "input",
                        data: { label: "Last Name", inputType: "string", defaultValue: "AI" }
                    },
                    {
                        id: "combine-1",
                        type: "combine-text",
                        data: { mode: "space" }
                    },
                    {
                        id: "output-1",
                        type: "output",
                        data: { label: "Full Name" }
                    }
                ],
                connections: [
                    { source: "input-1", target: "combine-1", sourceHandle: "output", targetHandle: "text1" },
                    { source: "input-2", target: "combine-1", sourceHandle: "output", targetHandle: "text2" },
                    { source: "combine-1", target: "output-1", sourceHandle: "output", targetHandle: "input" }
                ]
            };
            
            runner.executeFlow(flow, {})
                .then(result => {
                    log('Success! Result: ' + JSON.stringify(result, null, 2));
                })
                .catch(error => {
                    log('Error: ' + error.message);
                });
        }
        
        function runAPIFlow() {
            output.textContent = '';
            log('Running API request flow...');
            
            const flow = {
                name: "API Request",
                version: "1.0.0", 
                nodes: [
                    {
                        id: "api-1",
                        type: "api-request",
                        data: {
                            url: "https://jsonplaceholder.typicode.com/posts/1",
                            method: "GET"
                        }
                    },
                    {
                        id: "json-1",
                        type: "json-parse",
                        data: { field: "title" }
                    },
                    {
                        id: "output-1",
                        type: "output",
                        data: { label: "Post Title" }
                    }
                ],
                connections: [
                    { source: "api-1", target: "json-1", sourceHandle: "output", targetHandle: "input" },
                    { source: "json-1", target: "output-1", sourceHandle: "output", targetHandle: "input" }
                ]
            };
            
            runner.executeFlow(flow, {})
                .then(result => {
                    log('Success! Result: ' + JSON.stringify(result, null, 2));
                })
                .catch(error => {
                    log('Error: ' + error.message);
                });
        }
        
        function validateFlow() {
            output.textContent = '';
            log('Validating flow...');
            
            const flow = {
                name: "Test Flow",
                nodes: [
                    { id: "input-1", type: "input", data: { label: "Test" } },
                    { id: "output-1", type: "output", data: { label: "Result" } }
                ],
                connections: [
                    { source: "input-1", target: "output-1", sourceHandle: "output", targetHandle: "input" }
                ]
            };
            
            const validation = angelaFlowSDK.validateFlow(flow);
            log('Validation result: ' + JSON.stringify(validation, null, 2));
        }
        
        log('angela Flow SDK loaded and ready!');
    </script>
</body>
</html>
```

## 🔗 CDN Links Summary

### unpkg (Recommended)
- **Latest**: `https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js`
- **Minified**: `https://unpkg.com/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.min.js`
- **Specific Version**: `https://unpkg.com/angela-flow-sdk@1.4.0/dist/angela-flow-sdk.umd.js`

### jsDelivr
- **Latest**: `https://cdn.jsdelivr.net/npm/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.js`
- **Minified**: `https://cdn.jsdelivr.net/npm/angela-flow-sdk@latest/dist/angela-flow-sdk.umd.min.js`
- **Specific Version**: `https://cdn.jsdelivr.net/npm/angela-flow-sdk@1.4.0/dist/angela-flow-sdk.umd.js`

## 📚 API Reference

### angelaFlowSDK.angelaFlowRunner
- `new angelaFlowRunner(options)` - Create a new flow runner
- `executeFlow(flowData, inputs)` - Execute a flow with inputs
- `validateFlow(flowData)` - Validate flow structure
- `loadFlowFromUrl(url)` - Load flow from URL
- `handleFileUpload(file, options)` - Handle browser file uploads

### angelaFlowSDK.BrowserUtils
- `isBrowser()` - Check if running in browser
- `getBrowserInfo()` - Get browser information
- `downloadFlow(flowData, filename)` - Download flow as file
- `loadFlowFromFileInput(fileInput)` - Load flow from file input

### angelaFlowSDK Utilities
- `createFlowRunner(options)` - Create flow runner instance
- `validateFlow(flowData)` - Standalone flow validation

## 🎯 Use Cases

1. **Interactive Demos** - Embed flow execution in documentation
2. **Prototyping** - Quick testing of flow logic without Node.js
3. **Client-Side Processing** - Run flows entirely in the browser
4. **Educational Tools** - Teaching AI workflow concepts
5. **Integration Testing** - Validate flows before server deployment

## 🔒 Security Notes

- File uploads are processed locally in the browser
- No data is sent to external servers unless explicitly configured
- API requests respect CORS policies
- All processing happens client-side for privacy

## 📦 Bundle Size

- **UMD**: ~109KB (uncompressed)
- **UMD Minified**: ~45KB (compressed)
- **Gzipped**: ~12KB (estimated)

Perfect for modern web applications! 🚀 
