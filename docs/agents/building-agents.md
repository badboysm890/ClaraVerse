# Building Your First Agent

This comprehensive tutorial will guide you through creating your first AI agent in Agent Studio, from basic concepts to advanced workflows.

## 🎯 What You'll Build

By the end of this tutorial, you'll have created a **Smart Content Analyzer** that:
- Accepts text input (articles, emails, documents)  
- Analyzes content with AI for sentiment and key points
- Generates a structured summary with actionable insights
- Outputs results in multiple formats

**Estimated Time**: 15-20 minutes

## 📋 Prerequisites

- Access to angelaVerse Agent Studio
- Basic understanding of workflows (input → process → output)
- An AI API endpoint configured (OpenAI, Ollama, or compatible)

## 🚀 Step 1: Create Your First Workflow

### **1.1 Access Agent Studio**
1. Open angelaVerse in your browser
2. Navigate to the **"Agents"** section in the sidebar
3. Click **"Create New Flow"**
4. Name your workflow: **"Smart Content Analyzer"**
5. Add description: **"Analyzes text content and provides insights"**
6. Choose an icon: 🧠
7. Click **"Create Flow"**

### **1.2 Understand the Interface**

![Agent Studio Interface](../assets/building-interface.png)

**Key Areas:**
- **Canvas (Center)**: Where you build your workflow
- **Node Library (Left)**: Available components to drag and drop
- **Properties Panel (Right)**: Configure selected nodes
- **Toolbar (Top)**: Save, test, export, and manage options
- **Execution Log (Right Panel)**: Monitor workflow execution

## 🧩 Step 2: Add Your First Nodes

### **2.1 Add an Input Node**
1. From the **Node Library**, find **"Input & Output"** section
2. Drag the **"Input"** node to the canvas
3. Click on the Input node to select it
4. In the **Properties Panel**, configure:
   - **Label**: "Content to Analyze"
   - **Description**: "Enter text content for analysis"
   - **Type**: Text
   - **Default Value**: "Sample article content..."

### **2.2 Add an LLM Chat Node**
1. From **"AI & Intelligence"** section, drag **"LLM Chat"** to the canvas
2. Place it to the right of the Input node
3. Configure the LLM node:
   - **API Base URL**: Your AI endpoint (e.g., `http://127.0.0.1:8091/v1`)
   - **API Key**: Your API key
   - **Model**: Your model name (e.g., `gemma3:4b`)
   - **Temperature**: 0.3 (for more focused responses)
   - **Max Tokens**: 500

### **2.3 Add an Output Node**
1. Drag an **"Output"** node to the right of the LLM node
2. This will display the final results

### **2.4 Connect the Nodes**
1. Click and drag from the **Output port** (right side) of the Input node
2. Connect to the **User Message port** (left side) of the LLM node
3. Connect the **Response port** of the LLM node to the **Input port** of the Output node

Your workflow should look like:
```
[Input] → [LLM Chat] → [Output]
```

## ⚙️ Step 3: Configure Advanced Settings

### **3.1 Set Up System Prompt**
1. Click on the **LLM Chat** node
2. In the **System Message** field, enter:

```
You are an expert content analyzer. Analyze the provided text and return a structured analysis including:

1. SENTIMENT: Overall emotional tone (Positive/Negative/Neutral)
2. KEY THEMES: Main topics discussed (max 3)
3. SUMMARY: 2-sentence overview
4. INSIGHTS: 2 actionable insights or recommendations
5. RELEVANCE SCORE: 1-10 rating of content quality/importance

Format your response clearly with headers and bullet points.
```

### **3.2 Test Your Basic Workflow**
1. Click **"Test Flow"** in the toolbar
2. In the Input field, enter:
```
"Our company's new product launch exceeded expectations with 50% higher sales than projected. Customer feedback has been overwhelmingly positive, particularly praising the innovative design and user-friendly interface. However, some customers reported minor issues with delivery times."
```
3. Click **"Run"** and observe the results in the Output node
4. Check the **Execution Log** for detailed processing information

## 🔧 Step 4: Enhance with Data Processing

Let's make our analyzer more sophisticated by adding structured output processing.

### **4.1 Add a Structured LLM Node**
1. Add a **"Structured LLM"** node between the LLM Chat and Output
2. Configure it to extract structured data:
   - **API Settings**: Same as LLM Chat node
   - **JSON Schema**: Define the output structure

```json
{
  "type": "object",
  "properties": {
    "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    "key_themes": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
    "summary": {"type": "string", "maxLength": 200},
    "insights": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
    "relevance_score": {"type": "integer", "minimum": 1, "maximum": 10}
  }
}
```

### **4.2 Add Text Processing**
1. Add a **"Combine Text"** node before the Structured LLM
2. This will combine the original analysis with formatting instructions
3. Configure:
   - **Text 1**: Connect from LLM Chat output
   - **Text 2**: Add static text: "Please format the above analysis as JSON according to the specified schema."
   - **Separator**: "\n\n"

Update your connections:
```
[Input] → [LLM Chat] → [Combine Text] → [Structured LLM] → [Output]
```

## 📊 Step 5: Add Conditional Logic

Let's add smart routing based on content length.

### **5.1 Add an If/Else Node**
1. Insert an **"If/Else"** node after the Input
2. Configure the condition to check text length:
   - **Condition**: `input.length > 1000`
   - **Description**: "Route to detailed analysis for long content"

### **5.2 Create Two Processing Paths**
1. **Long Content Path**: Full analysis with detailed processing
2. **Short Content Path**: Quick analysis with essential insights only

### **5.3 Configure Routing Logic**
- **True Output** (long content) → Detailed LLM analysis
- **False Output** (short content) → Quick LLM analysis

## 🎨 Step 6: Add Multiple Output Formats

### **6.1 Add Output Variants**
1. Create multiple output nodes:
   - **JSON Output**: Structured data for API consumption
   - **Human-Readable Output**: Formatted text for reading
   - **Summary Output**: Key points only

### **6.2 Use JSON Parser**
1. Add **"JSON Parser"** nodes to extract specific fields
2. Configure field extraction:
   - `sentiment` for quick status
   - `summary` for executive overview
   - `insights` for actionable items

## 🧪 Step 7: Test and Debug

### **7.1 Comprehensive Testing**
Test with various content types:

**Short Text (< 1000 chars):**
```
"Great meeting today! Our team is excited about the new project direction."
```

**Long Text (> 1000 chars):**
```
"The quarterly business review revealed significant growth across all product lines. Revenue increased by 32% compared to the same period last year, driven primarily by strong performance in our SaaS offerings and successful expansion into European markets. Customer acquisition costs have decreased by 18% while customer lifetime value has improved by 25%, indicating more efficient marketing strategies and better product-market fit. However, we've identified several areas for improvement, including customer support response times and the need for more robust analytics capabilities. The development team has proposed a comprehensive roadmap for Q4 that addresses these concerns while maintaining our aggressive growth trajectory."
```

### **7.2 Monitor Execution Logs**
1. Open the **Execution Log** panel
2. Run your workflow and observe:
   - Node execution order
   - Processing times
   - Data flow between nodes
   - Any errors or warnings

### **7.3 Performance Optimization**
- Check node execution times
- Optimize AI prompts for faster responses
- Adjust token limits for cost efficiency

## 📦 Step 8: Save and Export

### **8.1 Save Your Workflow**
1. Click **"Save"** in the toolbar
2. Your workflow is automatically saved with version history
3. Use **Ctrl+S** (Cmd+S) for quick saving

### **8.2 Export Options**
1. **JSON Export**: For sharing or backup
   - Click **"Export"** → **"JSON Format"**
   - Save the `.json` file for later import

2. **SDK Export**: For integration in applications
   - Click **"Export"** → **"SDK Format"**
   - Generates code-ready format with documentation

## 🚀 Step 9: Advanced Features

### **9.1 Custom Nodes**
Create specialized nodes for your specific use case:
1. Click **"Create Node"** in the toolbar
2. Define custom processing logic
3. Add to your workflow

### **9.2 Workflow Templates**
Save your completed workflow as a template:
1. Go to **"Workflows"** manager
2. Select your workflow
3. Click **"Save as Template"**
4. Share with your team

## 🎯 Final Workflow Structure

Your completed **Smart Content Analyzer** should look like:

```
[Input] 
   ↓
[If/Else: Length Check]
   ├─ True → [Detailed LLM] → [Structured Output] → [JSON Parser] → [Multiple Outputs]
   └─ False → [Quick LLM] → [Simple Output]
```

## 💡 Best Practices

### **Workflow Design**
- **Start Simple**: Begin with basic input → AI → output
- **Test Iteratively**: Test after each major addition
- **Use Clear Names**: Name nodes descriptively
- **Document Logic**: Add descriptions to complex nodes

### **Performance**
- **Optimize Prompts**: Use specific, concise instructions
- **Manage Tokens**: Set appropriate limits for cost control
- **Cache Results**: Use static nodes for repeated data
- **Monitor Costs**: Track AI API usage

### **Error Handling**
- **Validate Inputs**: Check data formats early
- **Handle Failures**: Plan for AI API timeouts
- **Provide Fallbacks**: Alternative processing paths
- **Log Everything**: Use execution logs for debugging

## 🔍 Troubleshooting

### **Common Issues**

**1. Nodes Not Connecting**
- Ensure port types match (text to text, JSON to JSON)
- Check for circular dependencies
- Verify node execution order

**2. AI API Errors**
- Verify API endpoint is accessible
- Check API key permissions
- Ensure model name is correct
- Monitor rate limits

**3. Performance Issues**
- Reduce token limits for faster processing
- Optimize prompt length
- Use caching for repeated operations

**4. Unexpected Results**
- Review AI prompts for clarity
- Check input data formatting
- Validate JSON schemas
- Monitor execution logs

## 🎊 Congratulations!

You've successfully built your first AI agent! Your **Smart Content Analyzer** can now:

✅ Accept various types of text content  
✅ Perform intelligent analysis with AI  
✅ Route processing based on content characteristics  
✅ Generate structured outputs  
✅ Provide multiple result formats  

## 🚀 Next Steps

**Explore Advanced Features:**
- **[Node Library Reference](node-library.md)**: Discover all available components
- **[Custom Nodes](custom-nodes.md)**: Build specialized functionality  
- **[Deployment Guide](deployment.md)**: Deploy your agent as an API
- **[SDK Integration](sdk-usage.md)**: Use your agent in applications

**Join the Community:**
- Share your workflow in the gallery
- Get feedback from other builders
- Explore community templates
- Contribute to the knowledge base

**Happy building!** 🎯 
