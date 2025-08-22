# Node Library Reference

Complete documentation for all available nodes in Agent Studio. Each node is a reusable component that performs specific tasks in your AI workflows.

## 📚 Quick Reference

| Category | Nodes | Description |
|----------|-------|-------------|
| **[Input & Output](#input--output)** | 5 nodes | Data entry and result display |
| **[Data Processing](#data-processing)** | 4 nodes | Transform and manipulate data |
| **[Logic & Control](#logic--control)** | 1 node | Decision making and flow control |
| **[AI & Intelligence](#ai--intelligence)** | 3 nodes | Artificial intelligence processing |
| **[Custom Nodes](#custom-nodes)** | Unlimited | User-created components |

---

## 🔗 Input & Output

### 📥 **Input Node**
**Purpose**: Accept user input to start workflows

**Configuration:**
- **Label**: Display name for the input field
- **Type**: text, number, email, url, json, boolean
- **Default Value**: Pre-filled value (optional)
- **Description**: Help text for users
- **Required**: Whether input is mandatory

**Outputs:**
- `output` (any): The input value

**Use Cases:**
- User message input for chatbots
- Document upload for analysis
- Configuration parameters
- Dynamic content generation

**Example Configuration:**
```json
{
  "label": "User Question",
  "type": "text",
  "defaultValue": "How can I help you today?",
  "description": "Enter your question or request"
}
```

---

### 📤 **Output Node**
**Purpose**: Display final results with formatting options

**Configuration:**
- **Format**: auto, text, json, html, markdown
- **Label**: Display name for the output
- **Description**: Context about the result

**Inputs:**
- `input` (any): Value to display

**Features:**
- Auto-formatting based on data type
- JSON syntax highlighting
- Markdown rendering
- Copy-to-clipboard functionality

**Use Cases:**
- Final workflow results
- Debugging intermediate values
- User-facing responses
- API endpoint results

---

### 🖼️ **Image Input Node**
**Purpose**: Upload and process images as base64 data

**Configuration:**
- **Max File Size**: Upload limit (default: 10MB)
- **Accepted Formats**: JPG, PNG, GIF, WebP
- **Auto-resize**: Optimize for AI processing
- **Quality**: Compression level (1-100)

**Outputs:**
- `output` (string): Base64 encoded image data
- `metadata` (object): File info (size, type, dimensions)

**Features:**
- Automatic format conversion
- Image resizing for AI models
- Preview thumbnail
- File validation

**Use Cases:**
- Image analysis with AI vision models
- Document scanning and OCR
- Visual content processing
- Photo editing workflows

---

### 📄 **PDF Input Node** 
**Purpose**: Upload PDF files and extract text content

**Configuration:**
- **Extract Mode**: text-only, text-with-metadata, pages
- **Max File Size**: Upload limit (default: 25MB)
- **Page Range**: Specific pages to process (optional)

**Outputs:**
- `text` (string): Extracted text content
- `metadata` (object): Document info (pages, size, title)
- `pages` (array): Text content per page

**Features:**
- Multi-page text extraction
- Metadata preservation
- Page-by-page processing
- Error handling for corrupted files

**Use Cases:**
- Document analysis and summarization
- Content extraction for AI processing
- Research paper analysis
- Legal document review

---

### 📁 **File Upload Node**
**Purpose**: Universal file upload with configurable output formats

**Configuration:**
- **Output Format**: binary, base64, text, json
- **Max File Size**: Upload limit
- **Accepted Types**: File type restrictions
- **Encoding**: Text file encoding (UTF-8, ASCII, etc.)

**Outputs:**
- `output` (varies): File content in specified format
- `metadata` (object): File information
- `filename` (string): Original filename

**Features:**
- Universal file type support
- Multiple output formats
- File validation and size checking
- Metadata extraction

**Use Cases:**
- Data file processing (CSV, JSON, XML)
- Configuration file loading
- Binary data handling
- Document workflow automation

---

## 🔧 Data Processing

### 📝 **Static Text Node**
**Purpose**: Provide fixed text content for workflows

**Configuration:**
- **Text Content**: The static text to output
- **Format**: plain, markdown, html, template
- **Variables**: Template variable substitution

**Outputs:**
- `output` (string): The configured text content

**Features:**
- Template variable support (`{{variable}}`)
- Multi-line text editing
- Format preservation
- Unicode support

**Use Cases:**
- System prompts for AI models
- Email templates
- Instructions and documentation
- Default values and constants

**Template Example:**
```
Hello {{name}}, welcome to {{service}}!
Your account has been created successfully.
```

---

### 🔗 **Combine Text Node**
**Purpose**: Merge multiple text inputs with configurable separation

**Configuration:**
- **Separator**: Text to insert between inputs
- **Mode**: concatenate, merge, template
- **Trim Whitespace**: Remove extra spaces
- **Empty Handling**: skip, include, placeholder

**Inputs:**
- `text1` (string): First text input
- `text2` (string): Second text input

**Outputs:**
- `output` (string): Combined text result

**Features:**
- Smart space handling
- Multiple combination modes
- Empty value handling
- Custom separators

**Use Cases:**
- Prompt building for AI models
- Message composition
- Data formatting
- Content aggregation

**Examples:**
```
Mode: concatenate, Separator: " - "
Input1: "Hello" + Input2: "World" = "Hello - World"

Mode: template, Template: "{{text1}} says: {{text2}}"
Input1: "Alice" + Input2: "Hi there!" = "Alice says: Hi there!"
```

---

### 🔧 **JSON Parser Node**
**Purpose**: Parse JSON and extract specific fields using dot notation

**Configuration:**
- **Field Path**: Dot notation path to extract (e.g., `user.profile.name`)
- **Default Value**: Fallback if field not found
- **Validation**: JSON schema validation
- **Error Handling**: strict, permissive, fallback

**Inputs:**
- `input` (string/object): JSON data to parse

**Outputs:**
- `output` (any): Extracted field value
- `parsed` (object): Full parsed JSON object
- `error` (string): Error message if parsing fails

**Features:**
- Dot notation field extraction
- Array index support (`items[0].name`)
- Error handling and validation
- Type preservation

**Use Cases:**
- API response processing
- Configuration extraction
- Data transformation
- Field validation

**Examples:**
```json
Input: {"user": {"profile": {"name": "Alice", "age": 25}}}
Path: "user.profile.name" → Output: "Alice"
Path: "user.profile" → Output: {"name": "Alice", "age": 25}
```

---

### 🌐 **API Request Node**
**Purpose**: Production-grade HTTP/REST API client

**Configuration:**
- **Method**: GET, POST, PUT, DELETE, PATCH
- **URL**: API endpoint (supports variables)
- **Headers**: Custom HTTP headers
- **Authentication**: None, Bearer, Basic, API Key
- **Body**: Request payload (JSON, form, raw)
- **Timeout**: Request timeout (default: 30s)
- **Retry**: Auto-retry on failure (0-5 times)

**Inputs:**
- `url` (string): Dynamic URL override
- `body` (any): Dynamic request body
- `headers` (object): Additional headers

**Outputs:**
- `response` (any): Response body (auto-parsed)
- `status` (number): HTTP status code
- `headers` (object): Response headers
- `error` (string): Error message if request fails

**Features:**
- Full HTTP method support
- Authentication handling
- Automatic JSON parsing
- Error handling and retries
- Variable substitution in URLs

**Use Cases:**
- External API integration
- Data fetching and submission
- Webhook calling
- Service orchestration

**Configuration Example:**
```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": {
    "Authorization": "Bearer {{token}}",
    "Content-Type": "application/json"
  },
  "body": {
    "name": "{{username}}",
    "email": "{{email}}"
  }
}
```

---

## 🧠 Logic & Control

### 🔀 **If/Else Node**
**Purpose**: Conditional logic with JavaScript expressions

**Configuration:**
- **Condition**: JavaScript expression to evaluate
- **Description**: Human-readable condition description
- **Variables**: Available variables for the condition

**Inputs:**
- `input` (any): Data to evaluate in the condition

**Outputs:**
- `true` (any): Output when condition is true
- `false` (any): Output when condition is false

**Features:**
- Full JavaScript expression support
- Variable access in conditions
- Type checking and validation
- Error handling for invalid expressions

**Use Cases:**
- Content routing based on criteria
- Data validation and filtering
- Workflow branching
- Business logic implementation

**Expression Examples:**
```javascript
// Text length check
input.length > 100

// Number comparison
input.score >= 85

// Array operations
input.tags.includes('urgent')

// Object property check
input.user && input.user.role === 'admin'

// Complex conditions
input.price > 100 && input.category === 'electronics'
```

---

## 🤖 AI & Intelligence

### 🧠 **LLM Chat Node**
**Purpose**: Large Language Model interface for text and vision tasks

**Configuration:**
- **API Base URL**: OpenAI-compatible endpoint
- **API Key**: Authentication token
- **Model**: Model name (GPT-4, Claude, Gemma, etc.)
- **Temperature**: Creativity level (0.0 - 2.0)
- **Max Tokens**: Response length limit
- **Top P**: Nucleus sampling parameter
- **System Message**: Default system prompt

**Inputs:**
- `user` (string): User message/prompt
- `system` (string): System prompt override
- `context` (string): Additional context to prepend
- `memory` (array): Conversation history
- `image` (string): Base64 image for vision models

**Outputs:**
- `response` (string): AI-generated response
- `usage` (object): Token usage and cost information

**Features:**
- Multi-modal support (text + images)
- Conversation memory management
- Cost tracking and optimization
- Streaming responses (future)
- Custom model support

**Use Cases:**
- Chatbots and conversational AI
- Content generation and writing
- Code generation and review
- Image analysis and description
- Language translation

**System Prompt Examples:**
```
# Content Writer
You are a professional content writer. Create engaging, SEO-optimized content based on the user's requirements.

# Code Reviewer  
You are a senior software engineer. Review code for bugs, performance issues, and best practices.

# Data Analyst
You are a data analyst. Analyze the provided data and provide insights with visualizations.
```

---

### 📊 **Structured LLM Node**
**Purpose**: Generate structured JSON output with any OpenAI-compatible API

**Configuration:**
- **API Settings**: Same as LLM Chat node
- **JSON Schema**: Define expected output structure
- **Validation**: Strict schema enforcement
- **Retry Logic**: Auto-retry on invalid JSON
- **Fallback**: Default values for failed generation

**Inputs:**
- `prompt` (string): Generation prompt
- `schema` (object): Dynamic schema override
- `examples` (array): Example outputs for few-shot learning

**Outputs:**
- `output` (object): Structured JSON result
- `raw` (string): Raw AI response before parsing
- `valid` (boolean): Whether output matches schema

**Features:**
- Universal API compatibility (OpenAI, Ollama, etc.)
- Automatic fallback strategies
- JSON validation and repair
- Schema-driven generation
- Few-shot learning support

**Use Cases:**
- Data extraction from unstructured text
- Form filling and data entry
- API response generation
- Structured content creation
- Database record generation

**Schema Example:**
```json
{
  "type": "object",
  "properties": {
    "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    "keywords": {"type": "array", "items": {"type": "string"}},
    "summary": {"type": "string", "maxLength": 200}
  },
  "required": ["sentiment", "confidence"]
}
```

---

### 🎙️ **Whisper Transcription Node**
**Purpose**: Transcribe binary audio data using OpenAI Whisper

**Configuration:**
- **API Base URL**: Whisper-compatible endpoint
- **API Key**: Authentication token
- **Model**: whisper-1, whisper-large, etc.
- **Language**: Target language (auto-detect if empty)
- **Response Format**: text, json, srt, vtt
- **Temperature**: Sampling randomness for transcription

**Inputs:**
- `audio` (binary): Audio file data
- `language` (string): Override language detection
- `prompt` (string): Context prompt for better accuracy

**Outputs:**
- `text` (string): Transcribed text content
- `language` (string): Detected language
- `segments` (array): Timestamped segments (if JSON format)

**Features:**
- Multi-format audio support (MP3, WAV, M4A, etc.)
- Language auto-detection
- Timestamped transcription
- Context-aware processing
- High accuracy transcription

**Use Cases:**
- Meeting transcription and notes
- Podcast and video processing
- Voice command processing
- Audio content analysis
- Accessibility features

**Supported Formats:**
- MP3, MP4, MPEG, MPGA
- M4A, WAV, WEBM
- Maximum file size: 25MB

---

## 🎨 Custom Nodes

### 🛠️ **Creating Custom Nodes**

Custom nodes allow you to extend Agent Studio with specialized functionality tailored to your specific needs.

**How to Create:**
1. Click **"Create Node"** in the toolbar
2. Define node metadata (name, description, icon)
3. Configure input and output ports
4. Write JavaScript execution code
5. Test and save your custom node

**Node Structure:**
```javascript
// Custom node execution function
function execute(inputs, properties, context) {
  // Access inputs
  const userInput = inputs.text || '';
  const config = properties.apiKey || '';
  
  // Your custom logic here
  const result = processData(userInput, config);
  
  // Log information
  context.log('Processing completed');
  
  // Return outputs
  return {
    output: result,
    metadata: { processed: true }
  };
}
```

**Features:**
- Full JavaScript execution environment
- Secure sandboxed execution
- Access to inputs and properties
- Logging and debugging support
- Error handling and validation

### **Custom Node Examples**

**1. Email Validator:**
```javascript
function execute(inputs, properties, context) {
  const email = inputs.email || '';
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = regex.test(email);
  
  return {
    output: isValid,
    email: email,
    status: isValid ? 'valid' : 'invalid'
  };
}
```

**2. Text Sentiment Analyzer:**
```javascript
function execute(inputs, properties, context) {
  const text = inputs.text || '';
  
  // Simple sentiment analysis
  const positiveWords = ['good', 'great', 'excellent', 'amazing'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible'];
  
  const words = text.toLowerCase().split(/\s+/);
  const positive = words.filter(w => positiveWords.includes(w)).length;
  const negative = words.filter(w => negativeWords.includes(w)).length;
  
  let sentiment = 'neutral';
  if (positive > negative) sentiment = 'positive';
  if (negative > positive) sentiment = 'negative';
  
  return {
    output: sentiment,
    confidence: Math.abs(positive - negative) / words.length,
    details: { positive, negative, total: words.length }
  };
}
```

**3. URL Content Fetcher:**
```javascript
async function execute(inputs, properties, context) {
  const url = inputs.url || '';
  
  try {
    const response = await fetch(url);
    const content = await response.text();
    
    return {
      output: content,
      status: response.status,
      headers: Object.fromEntries(response.headers)
    };
  } catch (error) {
    context.error('Failed to fetch URL: ' + error.message);
    return {
      output: null,
      error: error.message
    };
  }
}
```

**Best Practices:**
- **Error Handling**: Always handle potential errors gracefully
- **Input Validation**: Check input types and values
- **Performance**: Avoid blocking operations when possible
- **Logging**: Use context.log() for debugging information
- **Documentation**: Add clear descriptions and examples

---

## 🔍 Node Selection Guide

### **By Use Case**

**Text Processing:**
- Input + Combine Text + Static Text
- LLM Chat for generation
- JSON Parser for extraction

**Data Analysis:**
- Input + API Request + Structured LLM
- JSON Parser + If/Else for routing
- Multiple outputs for different formats

**File Processing:**
- File Upload + PDF Input + Image Input
- Custom nodes for specialized formats
- API Request for external processing

**AI Workflows:**
- Input + LLM Chat + Output (basic)
- Structured LLM for data extraction
- Whisper for audio processing

### **Performance Considerations**

**Fast Nodes** (<10ms):
- Input/Output nodes
- Static Text, Combine Text
- JSON Parser, If/Else

**Medium Nodes** (100-500ms):
- API Request (depends on endpoint)
- File processing nodes
- Custom nodes (depends on logic)

**Slow Nodes** (1-10s):
- LLM Chat (depends on model)
- Structured LLM
- Whisper Transcription

### **Cost Considerations**

**Free Nodes:**
- All data processing nodes
- Logic and control nodes
- Custom nodes (local processing)

**API Cost Nodes:**
- LLM Chat (per token)
- Structured LLM (per token)
- Whisper Transcription (per minute)

## 📖 Advanced Usage

### **Node Chaining Patterns**

**Sequential Processing:**
```
Input → Process → AI → Parse → Output
```

**Parallel Processing:**
```
Input → Split → [Process A] → Combine → Output
          └─> [Process B] ─┘
```

**Conditional Routing:**
```
Input → If/Else → [Path A] → Output A
            └──> [Path B] → Output B
```

### **Error Handling Strategies**

1. **Validation Nodes**: Check inputs before expensive operations
2. **Fallback Paths**: Alternative processing for failures
3. **Try/Catch Patterns**: Use If/Else for error detection
4. **Default Values**: Configure fallbacks in node properties

### **Optimization Tips**

1. **Cache Static Data**: Use Static Text for repeated values
2. **Batch Processing**: Combine multiple operations where possible
3. **Conditional Execution**: Use If/Else to avoid unnecessary processing
4. **Token Management**: Optimize AI prompts for cost efficiency

---

**Need more help?** Check out our **[Building Guide](building-agents.md)** for step-by-step tutorials! 🚀 
