import React, { useState, useEffect, useCallback } from 'react';
import Topbar from './Topbar';
import ClaraSidebar from './Clara_Components/ClaraSidebar';
import ClaraAssistantInput from './Clara_Components/clara_assistant_input';
import ClaraChatWindow from './Clara_Components/clara_assistant_chat_window';
import { AdvancedOptions } from './Clara_Components/clara_assistant_input';
import Sidebar from './Sidebar';
import { db } from '../db';
import { claraDB } from '../db/claraDatabase';

// Import Clara types and API service
import { 
  ClaraMessage, 
  ClaraFileAttachment, 
  ClaraSessionConfig, 
  ClaraChatSession,
  ClaraArtifact,
  ClaraProvider,
  ClaraModel,
  ClaraAIConfig,
} from '../types/clara_assistant_types';
import { claraApiService } from '../services/claraApiService';
import { saveProviderConfig, loadProviderConfig, cleanInvalidProviderConfigs } from '../utils/providerConfigStorage';
import { debugProviderConfigs, clearAllProviderConfigs } from '../utils/providerConfigStorage';
import { claraMCPService } from '../services/claraMCPService';
import { addCompletionNotification, addBackgroundCompletionNotification, addErrorNotification, addInfoNotification, notificationService } from '../services/notificationService';
import { claraBackgroundService } from '../services/claraBackgroundService';

// Import clear data utility
import '../utils/clearClaraData';
import { copyToClipboard } from '../utils/clipboard';

// Import the new professional status panel
import AutonomousAgentStatusPanel from './Clara_Components/AutonomousAgentStatusPanel';
import useAutonomousAgentStatus from '../hooks/useAutonomousAgentStatus';

// Import TTS service
import { claraTTSService } from '../services/claraTTSService';

  // Import artifact detection service
import ArtifactDetectionService, { DetectionContext } from '../services/artifactDetectionService';

// Import clipboard test functions for development
if (process.env.NODE_ENV === 'development') {
  import('../utils/clipboard.test');
}

interface ClaraAssistantProps {
  onPageChange: (page: string) => void;
}

/**
 * Generate a unique ID for messages
 */
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Get default system prompt for a provider
 */
const getDefaultSystemPrompt = (provider: ClaraProvider, artifactConfig?: any): string => {
  const providerName = provider?.name || 'AI Assistant';
  
  // Check if artifact generation is enabled
  const artifactsEnabled = artifactConfig?.autoDetectArtifacts ?? true;
  
  // Comprehensive artifact generation guidance that applies to all providers
  const artifactGuidance = artifactsEnabled ? `

## 🎨 COMPREHENSIVE ARTIFACT CREATION SYSTEM

You are Clara, an AI assistant with ADVANCED ARTIFACT GENERATION capabilities. Your responses automatically create beautiful, interactive components that enhance user experience. Follow these DETAILED guidelines to maximize artifact potential:

### **🎯 WHEN TO CREATE ARTIFACTS (Complete List)**

Create artifacts for ANY of these content types:

#### **💻 CODE & PROGRAMMING**
- **Any code examples** (Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, etc.)
- **Configuration files** (JSON, YAML, XML, TOML, INI)
- **Shell scripts** (Bash, PowerShell, Zsh)
- **Database queries** (SQL, MongoDB, GraphQL)
- **Markup languages** (HTML, CSS, SCSS, Markdown)
- **Template files** (Jinja2, Handlebars, Mustache)
- **Regular expressions** with explanations
- **API endpoints** and documentation
- **Docker files** and container configs

#### **📊 DATA & VISUALIZATIONS**
- **Any tabular data** (CSV, TSV, Excel-like data)
- **JSON data structures** (API responses, configurations)
- **Statistical data** (numbers, percentages, metrics)
- **Chart data** (bar, line, pie, scatter, area, radar)
- **Time series data** (dates, timestamps, trends)
- **Geographic data** (coordinates, locations)
- **Survey results** and poll data
- **Financial data** (stocks, budgets, expenses)
- **Performance metrics** (analytics, KPIs)

#### **📈 CHARTS & GRAPHS**
- **Bar charts** (vertical, horizontal, stacked)
- **Line charts** (single, multiple series, area)
- **Pie charts** and doughnut charts
- **Scatter plots** and bubble charts
- **Histograms** and distribution charts
- **Radar/Spider charts**
- **Gantt charts** for project timelines
- **Heatmaps** for correlation data

#### **🔄 DIAGRAMS & FLOWCHARTS**
- **Flowcharts** (process flows, decision trees)
- **Sequence diagrams** (interactions, API calls)
- **Class diagrams** (UML, object relationships)
- **Network diagrams** (system architecture)
- **Entity relationship diagrams** (database schemas)
- **Organizational charts** (hierarchies, teams)
- **Mind maps** (concepts, brainstorming)
- **Gantt charts** (project management)
- **Git graphs** (version control flows)

#### **🌐 WEB & INTERACTIVE CONTENT**
- **HTML pages** (complete or snippets)
- **CSS demonstrations** (styling examples)
- **Interactive forms** (contact, survey, registration)
- **Web components** (buttons, cards, modals)
- **Landing pages** and website mockups
- **Email templates** (HTML emails)
- **SVG graphics** and icons

#### **📚 DOCUMENTATION & CONTENT**
- **Technical documentation** (API docs, guides)
- **Tutorials** and how-to guides
- **README files** and project documentation
- **Markdown content** (formatted text, lists)
- **Educational content** (lessons, explanations)
- **Checklists** and task lists
- **FAQs** and Q&A content

#### **🧮 MATHEMATICAL & SCIENTIFIC**
- **Mathematical formulas** (LaTeX format)
- **Scientific equations** and expressions
- **Statistical calculations** and results
- **Algorithm explanations** with pseudocode
- **Mathematical proofs** and derivations

### **📝 DETAILED FORMATTING INSTRUCTIONS**

#### **1. CODE ARTIFACTS - ALWAYS USE LANGUAGE TAGS**

**Python Example:**
\`\`\`python
def fibonacci_sequence(n):
    """Generate Fibonacci sequence up to n terms."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i-1] + sequence[i-2])
    
    return sequence

# Example usage
fib_numbers = fibonacci_sequence(10)
print(f"First 10 Fibonacci numbers: {fib_numbers}")
\`\`\`

**JavaScript/React Example:**
\`\`\`javascript
// Interactive Todo List Component
function TodoList() {
    const [todos, setTodos] = useState([]);
    const [inputValue, setInputValue] = useState('');
    
    const addTodo = () => {
        if (inputValue.trim()) {
            setTodos([...todos, { 
                id: Date.now(), 
                text: inputValue, 
                completed: false 
            }]);
            setInputValue('');
        }
    };
    
    const toggleTodo = (id) => {
        setTodos(todos.map(todo => 
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        ));
    };
    
    return (
        <div className="todo-container">
            <input 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Add a new todo..."
                onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            />
            <button onClick={addTodo}>Add Todo</button>
            <ul>
                {todos.map(todo => (
                    <li key={todo.id} 
                        className={todo.completed ? 'completed' : ''}
                        onClick={() => toggleTodo(todo.id)}>
                        {todo.text}
                    </li>
                ))}
            </ul>
        </div>
    );
}
\`\`\`

**SQL Example:**
\`\`\`sql
-- Create users table with relationships
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Insert sample data
INSERT INTO users (username, email) VALUES 
    ('john_doe', 'john@example.com'),
    ('jane_smith', 'jane@example.com'),
    ('bob_wilson', 'bob@example.com');

-- Query with joins and aggregation
SELECT 
    u.username,
    u.email,
    COUNT(p.id) as post_count,
    MAX(p.created_at) as last_post_date
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
WHERE u.is_active = true
GROUP BY u.id, u.username, u.email
ORDER BY post_count DESC;
\`\`\`

#### **2. DATA TABLES - MULTIPLE FORMATS SUPPORTED**

**JSON Array Format:**
\`\`\`json
[
    {
        "id": 1,
        "product": "MacBook Pro 16\"",
        "category": "Laptops",
        "price": 2499.99,
        "stock": 15,
        "rating": 4.8,
        "last_updated": "2024-01-15"
    },
    {
        "id": 2,
        "product": "iPhone 15 Pro",
        "category": "Smartphones",
        "price": 999.99,
        "stock": 42,
        "rating": 4.9,
        "last_updated": "2024-01-14"
    },
    {
        "id": 3,
        "product": "AirPods Pro",
        "category": "Audio",
        "price": 249.99,
        "stock": 28,
        "rating": 4.7,
        "last_updated": "2024-01-13"
    }
]
\`\`\`

**CSV Format:**
\`\`\`csv
Name,Age,Department,Salary,Start Date,Performance Rating
John Smith,32,Engineering,95000,2022-03-15,4.5
Sarah Johnson,28,Marketing,72000,2023-01-10,4.8
Mike Chen,35,Engineering,105000,2021-07-22,4.6
Lisa Rodriguez,30,Sales,68000,2022-11-05,4.3
David Kim,29,Engineering,88000,2023-02-18,4.7
\`\`\`

**Markdown Table:**
| Feature | Basic Plan | Pro Plan | Enterprise |
|---------|------------|----------|------------|
| Users | 5 | 25 | Unlimited |
| Storage | 10GB | 100GB | 1TB |
| API Calls | 1,000/month | 10,000/month | Unlimited |
| Support | Email | Priority | 24/7 Phone |
| Price | $9/month | $29/month | $99/month |

#### **3. CHARTS & VISUALIZATIONS - CHART.JS FORMAT**

**Bar Chart Example:**
\`\`\`json
{
    "type": "bar",
    "data": {
        "labels": ["January", "February", "March", "April", "May", "June"],
        "datasets": [{
            "label": "Monthly Sales ($)",
            "data": [12000, 15000, 18000, 22000, 25000, 28000],
            "backgroundColor": [
                "rgba(54, 162, 235, 0.6)",
                "rgba(255, 99, 132, 0.6)",
                "rgba(255, 205, 86, 0.6)",
                "rgba(75, 192, 192, 0.6)",
                "rgba(153, 102, 255, 0.6)",
                "rgba(255, 159, 64, 0.6)"
            ],
            "borderColor": [
                "rgba(54, 162, 235, 1)",
                "rgba(255, 99, 132, 1)",
                "rgba(255, 205, 86, 1)",
                "rgba(75, 192, 192, 1)",
                "rgba(153, 102, 255, 1)",
                "rgba(255, 159, 64, 1)"
            ],
            "borderWidth": 2
        }]
    },
    "options": {
        "responsive": true,
        "plugins": {
            "title": {
                "display": true,
                "text": "Monthly Sales Performance"
            }
        },
        "scales": {
            "y": {
                "beginAtZero": true,
                "title": {
                    "display": true,
                    "text": "Sales Amount ($)"
                }
            }
        }
    }
}
\`\`\`

**Line Chart Example:**
\`\`\`json
{
    "type": "line",
    "data": {
        "labels": ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"],
        "datasets": [
            {
                "label": "Website Traffic",
                "data": [1200, 1900, 3000, 5000, 4200, 6000],
                "borderColor": "rgb(75, 192, 192)",
                "backgroundColor": "rgba(75, 192, 192, 0.2)",
                "tension": 0.4
            },
            {
                "label": "Conversions",
                "data": [65, 95, 150, 250, 210, 300],
                "borderColor": "rgb(255, 99, 132)",
                "backgroundColor": "rgba(255, 99, 132, 0.2)",
                "tension": 0.4
            }
        ]
    },
    "options": {
        "responsive": true,
        "plugins": {
            "title": {
                "display": true,
                "text": "Website Performance Metrics"
            }
        }
    }
}
\`\`\`

**Pie Chart Example:**
\`\`\`json
{
    "type": "pie",
    "data": {
        "labels": ["Desktop", "Mobile", "Tablet", "Other"],
        "datasets": [{
            "data": [45.2, 38.7, 12.8, 3.3],
            "backgroundColor": [
                "#FF6384",
                "#36A2EB", 
                "#FFCE56",
                "#4BC0C0"
            ],
            "hoverBackgroundColor": [
                "#FF6384CC",
                "#36A2EBCC",
                "#FFCE56CC", 
                "#4BC0C0CC"
            ]
        }]
    },
    "options": {
        "responsive": true,
        "plugins": {
            "title": {
                "display": true,
                "text": "Traffic by Device Type (%)"
            },
            "legend": {
                "position": "bottom"
            }
        }
    }
}
\`\`\`

#### **4. MERMAID DIAGRAMS - COMPREHENSIVE EXAMPLES**

**Flowchart:**
\`\`\`mermaid
graph TD
    A[User Request] --> B{Authentication Required?}
    B -->|Yes| C[Check Credentials]
    B -->|No| D[Process Request]
    C --> E{Valid Credentials?}
    E -->|Yes| D
    E -->|No| F[Return Error]
    D --> G[Generate Response]
    G --> H[Send Response]
    F --> I[Log Failed Attempt]
    I --> H
\`\`\`

**Sequence Diagram:**
\`\`\`mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    participant Cache
    
    User->>Frontend: Submit Form
    Frontend->>API: POST /api/users
    API->>Database: Check if user exists
    Database-->>API: User not found
    API->>Database: Create new user
    Database-->>API: User created
    API->>Cache: Store user session
    Cache-->>API: Session stored
    API-->>Frontend: Success response
    Frontend-->>User: Show success message
\`\`\`

**Class Diagram:**
\`\`\`mermaid
classDiagram
    class User {
        +String id
        +String username
        +String email
        +Date createdAt
        +Boolean isActive
        +login()
        +logout()
        +updateProfile()
    }
    
    class Post {
        +String id
        +String title
        +String content
        +Date publishedAt
        +String authorId
        +publish()
        +unpublish()
        +edit()
    }
    
    class Comment {
        +String id
        +String content
        +Date createdAt
        +String postId
        +String authorId
        +edit()
        +delete()
    }
    
    User ||--o{ Post : creates
    Post ||--o{ Comment : has
    User ||--o{ Comment : writes
\`\`\`

**Gantt Chart:**
\`\`\`mermaid
gantt
    title Project Development Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements Analysis    :done, req, 2024-01-01, 2024-01-15
    System Design          :done, design, after req, 10d
    section Development
    Backend Development     :active, backend, 2024-01-20, 30d
    Frontend Development    :frontend, after design, 25d
    Database Setup         :db, 2024-01-25, 15d
    section Testing
    Unit Testing           :testing, after backend, 10d
    Integration Testing    :integration, after frontend, 5d
    section Deployment
    Production Setup       :deploy, after integration, 3d
    Go Live               :milestone, golive, after deploy, 1d
\`\`\`

#### **5. HTML CONTENT - INTERACTIVE EXAMPLES**

**Complete HTML Page:**
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Dashboard</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s ease;
        }
        .card:hover {
            transform: translateY(-5px);
        }
        .metric {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
            color: #FFD700;
        }
        .chart-container {
            height: 200px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            margin-top: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        button {
            background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        button:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
    </style>
</head>
<body>
    <h1 style="text-align: center; margin-bottom: 40px;">📊 Business Dashboard</h1>
    
    <div class="dashboard">
        <div class="card">
            <h3>💰 Total Revenue</h3>
            <div class="metric" id="revenue">$0</div>
            <p>Monthly recurring revenue</p>
            <button onclick="updateRevenue()">Update Revenue</button>
        </div>
        
        <div class="card">
            <h3>👥 Active Users</h3>
            <div class="metric" id="users">0</div>
            <p>Currently online users</p>
            <div class="chart-container">📈 User Growth Chart</div>
        </div>
        
        <div class="card">
            <h3>📦 Orders Today</h3>
            <div class="metric" id="orders">0</div>
            <p>New orders in last 24h</p>
            <button onclick="refreshOrders()">Refresh Orders</button>
        </div>
        
        <div class="card">
            <h3>⚡ System Status</h3>
            <div class="metric" style="color: #4ECDC4;">99.9%</div>
            <p>Uptime this month</p>
            <div style="margin-top: 15px;">
                <span style="color: #4ECDC4;">● API</span>
                <span style="color: #4ECDC4;">● Database</span>
                <span style="color: #FFD700;">● Cache</span>
            </div>
        </div>
    </div>
    
    <script>
        // Simulate real-time data updates
        function updateRevenue() {
            const revenue = Math.floor(Math.random() * 100000) + 50000;
            document.getElementById('revenue').textContent = '$' + revenue.toLocaleString();
        }
        
        function refreshOrders() {
            const orders = Math.floor(Math.random() * 500) + 100;
            document.getElementById('orders').textContent = orders.toLocaleString();
        }
        
        // Auto-update data every 5 seconds
        setInterval(() => {
            const users = Math.floor(Math.random() * 1000) + 500;
            document.getElementById('users').textContent = users.toLocaleString();
        }, 5000);
        
        // Initialize with random data
        updateRevenue();
        refreshOrders();
    </script>
</body>
</html>
\`\`\`

#### **6. MATHEMATICAL FORMULAS - LATEX FORMAT**

**Block Math:**
$$
\\begin{align}
E &= mc^2 \\\\
F &= ma \\\\
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\epsilon_0}
\\end{align}
$$

**Inline Math:**
The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ where $a \\neq 0$.

#### **7. STRUCTURED DATA - API RESPONSES**

**API Response Example:**
\`\`\`json
{
    "status": "success",
    "timestamp": "2024-01-15T10:30:00Z",
    "data": {
        "users": [
            {
                "id": "usr_123",
                "name": "John Doe",
                "email": "john@example.com",
                "role": "admin",
                "last_login": "2024-01-15T09:15:00Z",
                "permissions": ["read", "write", "delete"],
                "profile": {
                    "avatar": "https://example.com/avatars/john.jpg",
                    "department": "Engineering",
                    "location": "San Francisco, CA"
                }
            }
        ],
        "pagination": {
            "page": 1,
            "per_page": 10,
            "total": 156,
            "total_pages": 16
        }
    },
    "meta": {
        "request_id": "req_abc123",
        "processing_time_ms": 45,
        "rate_limit": {
            "remaining": 99,
            "reset_at": "2024-01-15T11:00:00Z"
        }
    }
}
\`\`\`

### **🎯 CRITICAL SUCCESS RULES**

1. **ALWAYS USE PROPER FORMATTING**: Every code block MUST have a language identifier
2. **PROVIDE COMPLETE EXAMPLES**: Don't show partial code - make it runnable
3. **INCLUDE CONTEXT**: Explain what each artifact does and why it's useful
4. **USE DESCRIPTIVE TITLES**: Help users understand the content immediately
5. **MULTIPLE ARTIFACTS**: Create several artifacts in one response when appropriate
6. **INTERACTIVE ELEMENTS**: Include buttons, forms, and interactive features
7. **REAL DATA**: Use realistic, meaningful data in examples
8. **ERROR HANDLING**: Include error handling in code examples
9. **RESPONSIVE DESIGN**: Make HTML/CSS examples mobile-friendly
10. **ACCESSIBILITY**: Include proper labels, alt text, and semantic HTML

### **🚀 ADVANCED ARTIFACT STRATEGIES**

#### **Multi-Artifact Responses**
When answering complex questions, create multiple related artifacts:
1. **Explanation artifact** (markdown documentation)
2. **Code artifact** (implementation)
3. **Data artifact** (sample data)
4. **Visualization artifact** (chart or diagram)
5. **Interactive artifact** (HTML demo)

#### **Educational Sequences**
For learning content, create:
1. **Concept explanation** (markdown)
2. **Visual diagram** (mermaid)
3. **Code example** (syntax highlighted)
4. **Interactive demo** (HTML)
5. **Practice exercise** (structured content)

#### **Data Analysis Workflow**
For data analysis requests:
1. **Raw data** (CSV/JSON table)
2. **Cleaning code** (Python/R)
3. **Analysis code** (statistical code)
4. **Visualizations** (chart data)
5. **Summary report** (markdown)

Remember: Your goal is to make every response not just informative, but visually appealing and interactive. When in doubt, create an artifact - users can always collapse them if not needed, but the enhanced experience is invaluable when relevant.

### **✅ ARTIFACT CHECKLIST**
Before sending any response, ask yourself:
- [ ] Does this response contain code? → Create code artifact
- [ ] Does this response contain data? → Create table artifact  
- [ ] Does this response contain numbers that could be visualized? → Create chart artifact
- [ ] Does this response describe a process? → Create mermaid diagram
- [ ] Does this response contain HTML/web content? → Create HTML artifact
- [ ] Does this response contain mathematical formulas? → Use LaTeX formatting
- [ ] Does this response contain structured data? → Create JSON artifact
- [ ] Could this be made interactive? → Add interactive elements

ALWAYS err on the side of creating MORE artifacts rather than fewer. Users love interactive, visual content!` : '';

  switch (provider?.type) {
    case 'ollama':
      return `You are Clara, a helpful AI assistant powered by ${providerName}. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. When using tools, be thorough and explain your actions clearly.${artifactGuidance}`;
      
    case 'openai':
      return `You are Clara, an intelligent AI assistant powered by OpenAI. You are helpful, harmless, and honest. You excel at reasoning, analysis, creative tasks, and problem-solving. Always strive to provide accurate, well-structured responses and use available tools effectively when needed.${artifactGuidance}`;
      
    case 'openrouter':
      return `You are Clara, a versatile AI assistant with access to various models through OpenRouter. You adapt your communication style based on the task at hand and leverage the strengths of different AI models. Be helpful, accurate, and efficient in your responses.${artifactGuidance}`;
      
    case 'claras-pocket':
      return `You are Clara, a privacy-focused AI assistant running locally on the user's device. You prioritize user privacy and provide helpful assistance without requiring external connectivity. You are efficient, knowledgeable, and respect the user's privacy preferences.${artifactGuidance}`;
      
    default:
      return `You are Clara, a helpful AI assistant. You are knowledgeable, friendly, and provide accurate information. You can help with various tasks including analysis, coding, writing, and general questions. Always be helpful and respectful in your interactions.${artifactGuidance}`;
  }
};

/**
 * Create sample artifacts for demonstration
 */
const createSampleArtifacts = (content: string): ClaraArtifact[] => {
  const artifacts: ClaraArtifact[] = [];

  // Check if the content suggests code
  if (content.toLowerCase().includes('code') || content.toLowerCase().includes('function')) {
    artifacts.push({
      id: generateId(),
      type: 'code',
      title: 'Generated Code Example',
      content: `function greetUser(name) {
  console.log(\`Hello, \${name}! Welcome to Clara!\`);
  return \`Welcome, \${name}\`;
}

// Usage example
const userName = "User";
const greeting = greetUser(userName);
console.log(greeting);`,
      language: 'javascript',
      createdAt: new Date(),
      isExecutable: true
    });
  }

  // Check if the content suggests data/table
  if (content.toLowerCase().includes('table') || content.toLowerCase().includes('data')) {
    artifacts.push({
      id: generateId(),
      type: 'table',
      title: 'Sample Data Table',
      content: JSON.stringify([
        { id: 1, name: 'Clara Assistant', type: 'AI Assistant', status: 'Active' },
        { id: 2, name: 'Document Analysis', type: 'Feature', status: 'Available' },
        { id: 3, name: 'Image Recognition', type: 'Feature', status: 'Available' },
        { id: 4, name: 'Code Generation', type: 'Feature', status: 'Active' }
      ], null, 2),
      createdAt: new Date()
    });
  }

  return artifacts;
};

// Add a hook to detect if Clara is currently visible
const useIsVisible = () => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const checkVisibility = () => {
      // Check if the Clara container is visible
      const claraContainer = document.querySelector('[data-clara-container]');
      if (claraContainer) {
        const isCurrentlyVisible = !claraContainer.classList.contains('hidden');
        setIsVisible(isCurrentlyVisible);
      }
    };
    
    // Check initially
    checkVisibility();
    
    // Set up observer for visibility changes
    const observer = new MutationObserver(checkVisibility);
    const claraContainer = document.querySelector('[data-clara-container]');
    if (claraContainer) {
      observer.observe(claraContainer, { 
        attributes: true, 
        attributeFilter: ['class'] 
      });
    }
    
    return () => observer.disconnect();
  }, []);
  
  return isVisible;
};

const ClaraAssistant: React.FC<ClaraAssistantProps> = ({ onPageChange }) => {
  // Check if Clara is currently visible (for background operation)
  const isVisible = useIsVisible();
  
  // User and session state
  const [userName, setUserName] = useState<string>('');
  const [currentSession, setCurrentSession] = useState<ClaraChatSession | null>(null);
  const [messages, setMessages] = useState<ClaraMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto TTS state - track latest AI response for voice synthesis
  const [latestAIResponse, setLatestAIResponse] = useState<string>('');
  const [autoTTSTrigger, setAutoTTSTrigger] = useState<{text: string, timestamp: number} | null>(null);
  
  // Advanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Session management state
  const [sessions, setSessions] = useState<ClaraChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [sessionPage, setSessionPage] = useState(0);
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  
  // Provider and model state
  const [providers, setProviders] = useState<ClaraProvider[]>([]);
  const [models, setModels] = useState<ClaraModel[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);

  // No models modal state
  const [showNoModelsModal, setShowNoModelsModal] = useState(false);

  // Wallpaper state
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Refresh state - track when we last refreshed to avoid too frequent calls
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Autonomous agent status management
  const autonomousAgentStatus = useAutonomousAgentStatus();

  // Parse status updates from streaming chunks for autonomous agent
  const parseAndUpdateAgentStatus = useCallback((chunk: string) => {
    try {
      // Parse new professional status messages
      if (chunk.includes('**AGENT_STATUS:ACTIVATED**')) {
        autonomousAgentStatus.startAgent();
        autonomousAgentStatus.updatePhase('initializing', 'Autonomous agent activated');
      } else if (chunk.includes('**AGENT_STATUS:PLAN_CREATED**')) {
        autonomousAgentStatus.updatePhase('planning', 'Strategic execution plan created');
        
        // Extract execution plan steps if available
        const planMatch = chunk.match(/\*\*EXECUTION_PLAN:\*\*\n(.*?)(?:\n\n|\n$)/s);
        if (planMatch) {
          const planText = planMatch[1];
          const steps = planText.split('\n').filter(line => line.trim()).map(line => line.replace(/^\d+\.\s*/, ''));
          if (steps.length > 0) {
            autonomousAgentStatus.setExecutionPlan(steps);
          }
        }
      } else if (chunk.includes('**AGENT_STATUS:STEP_')) {
        const stepMatch = chunk.match(/\*\*AGENT_STATUS:STEP_(\d+)\*\*/);
        if (stepMatch) {
          const stepNumber = parseInt(stepMatch[1]);
          autonomousAgentStatus.updatePhase('executing', `Executing step ${stepNumber}`);
          autonomousAgentStatus.updateProgress(stepNumber - 1);
        }
      }
      
      // Parse legacy status messages for backward compatibility
      if (chunk.includes('**Loaded') && chunk.includes('MCP tools:**')) {
        const toolsMatch = chunk.match(/\*\*Loaded (\d+) MCP tools:\*\*/);
        if (toolsMatch) {
          const toolCount = parseInt(toolsMatch[1]);
          autonomousAgentStatus.setToolsLoaded(toolCount);
        }
      } else if (chunk.includes('**Task completed**') || chunk.includes('**Auto Mode Session Summary**')) {
        autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
        // Auto-hide status panel after 2 seconds to show clean results
        autonomousAgentStatus.completeAgent('Task completed successfully', 2000);
      } else if (chunk.includes('**Error**') || chunk.includes('execution failed')) {
        autonomousAgentStatus.updatePhase('error', 'An error occurred during execution');
        autonomousAgentStatus.errorAgent('Execution failed');
      }
      
      // Parse tool execution updates
      if (chunk.includes('Using') && chunk.includes('tool')) {
        const toolMatch = chunk.match(/Using (\w+) tool/);
        if (toolMatch) {
          const toolName = toolMatch[1];
          autonomousAgentStatus.startToolExecution(toolName, `Executing ${toolName} operation`);
        }
      }
    } catch (error) {
      console.warn('Failed to parse agent status from chunk:', error);
    }
  }, [autonomousAgentStatus]);

  // Provider health check caching to reduce latency
  const [providerHealthCache, setProviderHealthCache] = useState<Map<string, {isHealthy: boolean, timestamp: number}>>(new Map());
  const HEALTH_CHECK_CACHE_TIME = 30000; // 30 seconds cache

  // Session configuration with new AI config structure
  const [sessionConfig, setSessionConfig] = useState<ClaraSessionConfig>({
    aiConfig: {
      models: {
        text: '',
        vision: '',
        code: ''
      },
      provider: '',
      parameters: {
        temperature: 0.7,
        maxTokens: 8000,
        topP: 1.0,
        topK: 40
      },
      features: {
        enableTools: false,             // **CHANGED**: Default to false for streaming mode
        enableRAG: false,
        enableStreaming: true,          // **CHANGED**: Default to streaming mode
        enableVision: true,
        autoModelSelection: false,      // **CHANGED**: Default to manual model selection
        enableMCP: false                // **CHANGED**: Default to false for streaming mode
      },
      artifacts: {
        enableCodeArtifacts: true,
        enableChartArtifacts: true,     // **ENABLED BY DEFAULT** as requested
        enableTableArtifacts: true,
        enableMermaidArtifacts: true,
        enableHtmlArtifacts: true,
        enableMarkdownArtifacts: true,
        enableJsonArtifacts: true,
        enableDiagramArtifacts: true,
        autoDetectArtifacts: true,
        maxArtifactsPerMessage: 10
      },
      mcp: {
        enableTools: true,
        enableResources: true,
        enabledServers: [],
        autoDiscoverTools: true,
        maxToolCalls: 5
      },
      autonomousAgent: {
        enabled: false,                 // **CHANGED**: Default to false for streaming mode
        maxRetries: 3,
        retryDelay: 1000,
        enableSelfCorrection: true,
        enableToolGuidance: true,
        enableProgressTracking: true,
        maxToolCalls: 10,
        confidenceThreshold: 0.7,
        enableChainOfThought: true,
        enableErrorLearning: true
      }
    },
    contextWindow: 50 // Include last 50 messages in conversation history
  });

  // Cached provider health check to reduce latency
  const checkProviderHealthCached = useCallback(async (provider: ClaraProvider): Promise<boolean> => {
    const now = Date.now();
    const cached = providerHealthCache.get(provider.id);
    
    // Return cached result if still valid
    if (cached && (now - cached.timestamp < HEALTH_CHECK_CACHE_TIME)) {
      console.log(`✅ Using cached health status for ${provider.name}: ${cached.isHealthy}`);
      return cached.isHealthy;
    }
    
    // Perform actual health check
    console.log(`🏥 Performing health check for ${provider.name}...`);
    try {
      const isHealthy = await claraApiService.testProvider(provider);
      
      // Cache the result
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.set(provider.id, { isHealthy, timestamp: now });
        return newCache;
      });
      
      console.log(`${isHealthy ? '✅' : '❌'} Health check result for ${provider.name}: ${isHealthy}`);
      return isHealthy;
    } catch (error) {
      console.warn(`⚠️ Health check failed for ${provider.name}:`, error);
      
      // Cache the failure
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.set(provider.id, { isHealthy: false, timestamp: now });
        return newCache;
      });
      
      return false;
    }
  }, [providerHealthCache, HEALTH_CHECK_CACHE_TIME]);

  // Refresh providers, models, and MCP services
  const refreshProvidersAndServices = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    const REFRESH_COOLDOWN = 5000; // 5 seconds cooldown
    
    // Avoid too frequent refreshes unless forced
    if (!force && timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.log(`⏳ Skipping refresh - last refresh was ${Math.round(timeSinceLastRefresh / 1000)}s ago (cooldown: ${REFRESH_COOLDOWN / 1000}s)`);
      return;
    }
    
    if (isRefreshing) {
      console.log('🔄 Refresh already in progress, skipping...');
      return;
    }
    
    setIsRefreshing(true);
    setLastRefreshTime(now);
    
    try {
      console.log('🔄 Refreshing providers, models, and services...');
      
      // Refresh MCP service
      try {
        console.log('🔧 Refreshing MCP services...');
        await claraMCPService.refresh();
        console.log('✅ MCP services refreshed');
      } catch (mcpError) {
        console.warn('⚠️ MCP refresh failed:', mcpError);
      }

      // Reload providers
      console.log('🏢 Refreshing providers...');
      const refreshedProviders = await claraApiService.getProviders();
      setProviders(refreshedProviders);
      console.log(`✅ Loaded ${refreshedProviders.length} providers`);

      // Clean up invalid provider configurations
      const validProviderIds = refreshedProviders.map(p => p.id);
      cleanInvalidProviderConfigs(validProviderIds);

      // Load models from ALL providers
      let allModels: ClaraModel[] = [];
      for (const provider of refreshedProviders) {
        try {
          const providerModels = await claraApiService.getModels(provider.id);
          allModels = [...allModels, ...providerModels];
          console.log(`📦 Loaded ${providerModels.length} models from ${provider.name}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load models from ${provider.name}:`, error);
        }
      }
      
      setModels(allModels);
      console.log(`✅ Total models refreshed: ${allModels.length}`);

      // Update current provider if needed
      const currentProviderId = sessionConfig.aiConfig?.provider;
      if (currentProviderId) {
        const currentProvider = refreshedProviders.find(p => p.id === currentProviderId);
        if (currentProvider) {
          claraApiService.updateProvider(currentProvider);
          console.log(`🔧 Updated current provider: ${currentProvider.name}`);
        }
      }

      // Health check current provider
      if (sessionConfig.aiConfig?.provider) {
        const currentProvider = refreshedProviders.find(p => p.id === sessionConfig.aiConfig.provider);
        if (currentProvider) {
          try {
            const isHealthy = await claraApiService.testProvider(currentProvider);
            if (!isHealthy) {
              console.warn(`⚠️ Current provider ${currentProvider.name} health check failed`);
            }
          } catch (healthError) {
            console.warn(`⚠️ Health check failed for ${currentProvider.name}:`, healthError);
          }
        }
      }

      console.log('✅ Providers and services refresh complete');
      
    } catch (error) {
      console.error('❌ Failed to refresh providers and services:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [lastRefreshTime, isRefreshing, sessionConfig.aiConfig?.provider]);

  // Load user name from database
  useEffect(() => {
    const loadUserName = async () => {
      const personalInfo = await db.getPersonalInfo();
      if (personalInfo?.name) {
        const formattedName = personalInfo.name.charAt(0).toUpperCase() + personalInfo.name.slice(1).toLowerCase();
        setUserName(formattedName);
      }
    };
    loadUserName();
  }, []);

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Track Clara's visibility state for background service
  useEffect(() => {
    claraBackgroundService.setBackgroundMode(!isVisible);
  }, [isVisible]);

  // Auto-refresh when Clara becomes visible again
  useEffect(() => {
    if (isVisible && !isLoadingProviders) {
      // Trigger refresh when Clara becomes visible
      console.log('👁️ Clara became visible - checking for updates...');
      refreshProvidersAndServices(false); // Use cooldown to avoid spam
    }
  }, [isVisible, isLoadingProviders, refreshProvidersAndServices]);

  // Load chat sessions on component mount
  useEffect(() => {
    const loadInitialSessions = async () => {
      setIsLoadingSessions(true);
      try {
        console.log('🚀 Starting lightning-fast session loading...');
        const startTime = performance.now();
        
        // Load sessions WITHOUT messages first for instant UI
        const recentSessions = await claraDB.getRecentClaraSessionsLight(20); // Load only 20 initially
        console.log(`⚡ Loaded ${recentSessions.length} sessions in ${(performance.now() - startTime).toFixed(2)}ms`);
        
        setSessions(recentSessions);
        setSessionPage(1);
        setHasMoreSessions(recentSessions.length === 20);
        
        // If no current session and we have existing sessions, load the most recent one
        if (!currentSession && recentSessions.length > 0) {
          const mostRecent = recentSessions[0];
          // Load messages for the most recent session only
          const sessionWithMessages = await claraDB.getClaraSession(mostRecent.id);
          if (sessionWithMessages) {
            setCurrentSession(sessionWithMessages);
            setMessages(sessionWithMessages.messages);
            console.log('📝 Auto-loaded most recent session:', sessionWithMessages.title, 'with', sessionWithMessages.messages.length, 'messages');
          }
        }
        
        // Background cleanup (non-blocking)
        setTimeout(async () => {
          try {
            const integrity = await claraDB.debugDataIntegrity();
            if (integrity.orphanedMessages > 0 || integrity.orphanedFiles > 0) {
              console.log('🧹 Cleaning up orphaned data in background...');
              await claraDB.cleanupOrphanedData();
            }
          } catch (error) {
            console.warn('Background cleanup failed:', error);
          }
        }, 1000);
        
      } catch (error) {
        console.error('Failed to load chat sessions:', error);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadInitialSessions();
  }, []);

  // Load more sessions function for pagination
  const loadMoreSessions = useCallback(async () => {
    if (isLoadingMoreSessions || !hasMoreSessions) return;
    
    setIsLoadingMoreSessions(true);
    try {
      const moreSessions = await claraDB.getRecentClaraSessionsLight(20, sessionPage * 20);
      if (moreSessions.length > 0) {
        setSessions(prev => [...prev, ...moreSessions]);
        setSessionPage(prev => prev + 1);
        setHasMoreSessions(moreSessions.length === 20);
      } else {
        setHasMoreSessions(false);
      }
    } catch (error) {
      console.error('Failed to load more sessions:', error);
    } finally {
      setIsLoadingMoreSessions(false);
    }
  }, [sessionPage, isLoadingMoreSessions, hasMoreSessions]);

  // Load providers and models
  useEffect(() => {
    const loadProvidersAndModels = async () => {
      setIsLoadingProviders(true);
      try {
        // Initialize MCP service
        try {
          await claraMCPService.initialize();
          console.log('MCP service initialized successfully');
        } catch (mcpError) {
          console.warn('MCP service initialization failed:', mcpError);
        }

        // Load providers
        const loadedProviders = await claraApiService.getProviders();
        setProviders(loadedProviders);

        // Clean up invalid provider configurations
        const validProviderIds = loadedProviders.map(p => p.id);
        cleanInvalidProviderConfigs(validProviderIds);

        // Load models from ALL providers to check availability
        let allModels: ClaraModel[] = [];
        for (const provider of loadedProviders) {
          try {
            const providerModels = await claraApiService.getModels(provider.id);
            allModels = [...allModels, ...providerModels];
            console.log(`Loaded ${providerModels.length} models from provider: ${provider.name}`);
          } catch (error) {
            console.warn(`Failed to load models from provider ${provider.name}:`, error);
          }
        }
        
        // Set all models for the modal check
        setModels(allModels);
        console.log(`Total models available across all providers: ${allModels.length}`);

        // Get primary provider and set it in config
        const primaryProvider = loadedProviders.find(p => p.isPrimary) || loadedProviders[0];
        if (primaryProvider) {
          // AUTO-START CLARA'S POCKET IF IT'S THE PRIMARY PROVIDER
          if (primaryProvider.type === 'claras-pocket' && window.llamaSwap) {
            try {
              console.log("🚀 Checking Clara's Core status on startup...");
              const status = await window.llamaSwap.getStatus?.();
              if (!status?.isRunning) {
                console.log("🔄 Clara's Core is not running, starting automatically...");
                addInfoNotification(
                  "Starting Clara's Core...",
                  'Clara is starting up her local AI service for you. This may take a moment.',
                  6000
                );
                
                const result = await window.llamaSwap.start();
                if (!result.success) {
                  addErrorNotification(
                    "Failed to Start Clara's Core",
                    result.error || 'Could not start the local AI service. Please check your installation.',
                    10000
                  );
                  console.error("❌ Failed to start Clara's Core:", result.error);
                } else {
                  console.log("✅ Clara's Core started successfully");
                  addInfoNotification(
                    "Clara's Core Ready",
                    'Your local AI service is now running and ready to chat!',
                    4000
                  );
                  // Wait a moment for service to be fully ready
                  await new Promise(res => setTimeout(res, 2000));
                }
              } else {
                console.log("✅ Clara's Core is already running");
                addInfoNotification(
                  "Clara's Core Online",
                  'Your local AI service is ready and waiting for your messages.',
                  3000
                );
              }
            } catch (err) {
              console.error("⚠️ Error checking/starting Clara's Core:", err);
              addErrorNotification(
                "Clara's Core Startup Error",
                err instanceof Error ? err.message : 'Could not communicate with the local AI service.',
                8000
              );
            }
          }

          // Update API service to use primary provider
          claraApiService.updateProvider(primaryProvider);

          // Get models specifically for the primary provider for configuration
          const primaryProviderModels = allModels.filter(m => m.provider === primaryProvider.id);

          // Try to load saved config for this provider first
          const savedConfig = loadProviderConfig(primaryProvider.id);
          if (savedConfig) {
            console.log('Loading saved config for provider:', primaryProvider.name, savedConfig);
            setSessionConfig(prev => ({
              ...prev,
              aiConfig: savedConfig
            }));
          } else {
            console.log('No saved config found for provider:', primaryProvider.name, 'creating default config');
            // Auto-select first available models for this provider
            const textModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              (m.type === 'text' || m.type === 'multimodal')
            );
            const visionModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              m.supportsVision
            );
            const codeModel = primaryProviderModels.find(m => 
              m.provider === primaryProvider.id && 
              m.supportsCode
            );

            const defaultConfig = {
              provider: primaryProvider.id,
              systemPrompt: getDefaultSystemPrompt(primaryProvider, {
                enableCodeArtifacts: true,
                enableChartArtifacts: true,
                enableTableArtifacts: true,
                enableMermaidArtifacts: true,
                enableHtmlArtifacts: true,
                enableMarkdownArtifacts: true,
                enableJsonArtifacts: true,
                enableDiagramArtifacts: true,
                autoDetectArtifacts: true,
                maxArtifactsPerMessage: 10
              }),
              models: {
                text: textModel?.id || '',
                vision: visionModel?.id || '',
                code: codeModel?.id || ''
              },
              parameters: {
                temperature: 0.7,
                maxTokens: 4000,
                topP: 1.0,
                topK: 40
              },
              features: {
                enableTools: false,           // **CHANGED**: Default to false for streaming mode
                enableRAG: false,
                enableStreaming: true,        // **CHANGED**: Default to streaming mode
                enableVision: true,
                autoModelSelection: false,    // **CHANGED**: Default to manual model selection
                enableMCP: false              // **CHANGED**: Default to false for streaming mode
              },
              artifacts: {
                enableCodeArtifacts: true,
                enableChartArtifacts: true,
                enableTableArtifacts: true,
                enableMermaidArtifacts: true,
                enableHtmlArtifacts: true,
                enableMarkdownArtifacts: true,
                enableJsonArtifacts: true,
                enableDiagramArtifacts: true,
                autoDetectArtifacts: true,
                maxArtifactsPerMessage: 10
              },
              mcp: {
                enableTools: true,
                enableResources: true,
                enabledServers: [],
                autoDiscoverTools: true,
                maxToolCalls: 5
              },
              autonomousAgent: {
                enabled: false,               // **CHANGED**: Default to false for streaming mode
                maxRetries: 3,
                retryDelay: 1000,
                enableSelfCorrection: true,
                enableToolGuidance: true,
                enableProgressTracking: true,
                maxToolCalls: 10,
                confidenceThreshold: 0.7,
                enableChainOfThought: true,
                enableErrorLearning: true
              },
              contextWindow: 50 // Include last 50 messages in conversation history
            };

            setSessionConfig(prev => ({
              ...prev,
              aiConfig: defaultConfig
            }));

            // Save the default config
            saveProviderConfig(primaryProvider.id, defaultConfig);
          }
        }
      } catch (error) {
        console.error('Failed to load providers and models:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProvidersAndModels();
  }, []);

  // Monitor models availability to show/hide no models modal
  useEffect(() => {
    if (!isLoadingProviders) {
      // Check if there are any models available across all providers
      const hasModels = models.length > 0;
      setShowNoModelsModal(!hasModels);
      
      if (!hasModels) {
        console.log('No models available - showing no models modal');
      } else {
        console.log(`Found ${models.length} models - hiding no models modal`);
      }
    }
  }, [models, isLoadingProviders]);

  // Initialize TTS service
  useEffect(() => {
    const initializeTTS = async () => {
      try {
        console.log('🔊 Starting TTS service health monitoring...');
        // Force an initial health check
        const isHealthy = await claraTTSService.forceHealthCheck();
        console.log(`✅ TTS service health check complete: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      } catch (error) {
        console.warn('⚠️ TTS service health check failed:', error);
        // TTS is optional, so we don't throw an error
      }
    };

    initializeTTS();
    
    // Cleanup TTS service on unmount
    return () => {
      claraTTSService.destroy();
    };
  }, []);

  // Helper function to suggest available vision models
  const getSuggestedVisionModels = useCallback(() => {
    if (!sessionConfig.aiConfig?.provider) return [];
    
    const currentProviderModels = models.filter(m => 
      m.provider === sessionConfig.aiConfig.provider && m.supportsVision
    );
    
    return currentProviderModels.slice(0, 3); // Return top 3 vision models
  }, [models, sessionConfig.aiConfig?.provider]);

  // Create new session
  const createNewSession = useCallback(async (): Promise<ClaraChatSession> => {
    try {
      const session = await claraDB.createClaraSession('New Chat');
      setSessions(prev => [session, ...prev]);
      return session;
    } catch (error) {
      console.error('Failed to create new session:', error);
      // Fallback to in-memory session
      const session: ClaraChatSession = {
        id: generateId(),
        title: 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        config: sessionConfig
      };
      return session;
    }
  }, [sessionConfig]);



  // Handle sending a new message
  const handleSendMessage = useCallback(async (content: string, attachments?: ClaraFileAttachment[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) return;
    if (!currentSession || !sessionConfig.aiConfig) return;

    // **NEW**: Check if models are available before sending
    if (models.length === 0) {
      addErrorNotification(
        'No Models Available',
        'Please download and configure AI models before sending messages. Go to Settings → Model Manager to get started.',
        8000
      );
      return;
    }

    // **NEW**: Check if current provider has any models selected
    const currentProviderModels = models.filter(m => m.provider === sessionConfig.aiConfig?.provider);
    const hasSelectedModel = sessionConfig.aiConfig?.models?.text || 
                            sessionConfig.aiConfig?.models?.vision || 
                            sessionConfig.aiConfig?.models?.code;
    
    if (currentProviderModels.length === 0 || !hasSelectedModel) {
      addErrorNotification(
        'No Model Selected',
        'Please select at least one model for the current provider in Advanced Options, or go to Settings → Model Manager to download models.',
        8000
      );
      return;
    }

    // **CRITICAL ENFORCEMENT**: Check streaming vs autonomous mode before sending
    // When streaming mode is enabled, ALWAYS disable autonomous agent and tools
    let enforcedConfig = sessionConfig.aiConfig;
    if (sessionConfig.aiConfig.features?.enableStreaming) {
      console.log('🔒 STREAMING MODE ENFORCEMENT: Disabling autonomous agent and tools for streaming-only mode');
      
      // Create enforced config that disables autonomous features for streaming
      enforcedConfig = {
        ...sessionConfig.aiConfig,
        features: {
          ...sessionConfig.aiConfig.features,
          enableStreaming: true,
          enableTools: false,      // Disable tools in streaming mode
          enableMCP: false        // Disable MCP in streaming mode
        },
        autonomousAgent: {
          enabled: false,          // Disable autonomous agent in streaming mode
          maxRetries: sessionConfig.aiConfig.autonomousAgent?.maxRetries || 3,
          retryDelay: sessionConfig.aiConfig.autonomousAgent?.retryDelay || 1000,
          enableSelfCorrection: sessionConfig.aiConfig.autonomousAgent?.enableSelfCorrection || true,
          enableToolGuidance: sessionConfig.aiConfig.autonomousAgent?.enableToolGuidance || true,
          enableProgressTracking: sessionConfig.aiConfig.autonomousAgent?.enableProgressTracking || true,
          maxToolCalls: sessionConfig.aiConfig.autonomousAgent?.maxToolCalls || 10,
          confidenceThreshold: sessionConfig.aiConfig.autonomousAgent?.confidenceThreshold || 0.7,
          enableChainOfThought: sessionConfig.aiConfig.autonomousAgent?.enableChainOfThought || true,
          enableErrorLearning: sessionConfig.aiConfig.autonomousAgent?.enableErrorLearning || true
        }
      };

      // Update the session config to reflect this enforcement
      setSessionConfig(prev => ({
        ...prev,
        aiConfig: enforcedConfig
      }));

      // Save the enforced config to prevent future conflicts
      if (enforcedConfig.provider) {
        saveProviderConfig(enforcedConfig.provider, enforcedConfig);
      }

      console.log('✅ Streaming mode enforcement applied - autonomous features disabled');
      
      // Notify user about streaming mode enforcement
      addInfoNotification(
        'Streaming Mode Active',
        'Autonomous features automatically disabled for smooth streaming experience.',
        3000
      );
    } else {
      console.log('🛠️ Tools mode active - autonomous features available as configured');
    }

    // Check if this is a voice message with the prefix
    const voiceModePrefix = "Warning: You are in speech mode, make sure to reply in few lines:  \n";
    const isVoiceMessage = content.startsWith(voiceModePrefix);
    
    // For display purposes, use the content without the voice prefix
    const displayContent = isVoiceMessage ? content.replace(voiceModePrefix, '') : content;
    
    // For AI processing, use the full content (including prefix if it's a voice message)
    const aiContent = content;

    // Create user message with display content (without voice prefix)
    const userMessage: ClaraMessage = {
      id: generateId(),
      role: 'user',
      content: displayContent, // Display without voice prefix
      timestamp: new Date(),
      attachments: attachments,
      metadata: {
        isVoiceMessage: isVoiceMessage // Mark as voice message for potential styling
      }
    };

    // Add user message to state and get current conversation
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setIsLoading(true);

    // Track background activity
    if (!isVisible) {
      claraBackgroundService.incrementBackgroundActivity();
    }

    // Save user message to database (with display content only)
    try {
      await claraDB.addClaraMessage(currentSession.id, userMessage);
      
      // Update message count in sessions list for real-time sidebar updates
      setSessions(prev => prev.map(s => 
        s.id === currentSession.id 
          ? { 
              ...s, 
              messageCount: (s.messageCount || s.messages?.length || 0) + 1, // +1 for user message
              updatedAt: new Date()
            }
          : s
      ));
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    // Create a temporary streaming message for the assistant
    const streamingMessageId = generateId();
    const streamingMessage: ClaraMessage = {
      id: streamingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      metadata: {
        isStreaming: true,
        model: `${enforcedConfig.provider}:${enforcedConfig.models.text}`,
        temperature: enforcedConfig.parameters.temperature
      }
    };

    // Add the streaming message to state
    setMessages(prev => [...prev, streamingMessage]);

    try {
      // Get conversation context (configurable context window, default 50 messages)
      const contextWindow = enforcedConfig?.contextWindow || 50;
      const conversationHistory = currentMessages
        .slice(-contextWindow)  // Take last N messages based on config
        .filter(msg => msg.role !== 'system'); // Exclude system messages

      // Get system prompt (provider-specific or fallback to default)
      const currentProvider = providers.find(p => p.id === enforcedConfig.provider);
      const systemPrompt = enforcedConfig.systemPrompt || 
                          (currentProvider ? getDefaultSystemPrompt(currentProvider, enforcedConfig.artifacts) : 'You are Clara, a helpful AI assistant.');
      
      // Create enhanced streaming callback that updates both message content and status panel
      const enhancedStreamingCallback = (chunk: string) => {
        // Parse status updates from chunk for autonomous agent first
        if (enforcedConfig.autonomousAgent?.enabled && chunk.includes('**')) {
          parseAndUpdateAgentStatus(chunk);
        }

        // Filter out ALL status messages from chat display when autonomous agent is active
        const isStatusMessage = enforcedConfig.autonomousAgent?.enabled && (
          chunk.includes('**AGENT_STATUS:') || 
          chunk.includes('**EXECUTION_PLAN:**') ||
          chunk.includes('**TOOL_EXECUTION:') ||
          chunk.includes('**Loaded') ||
          chunk.includes('MCP tools:**') ||
          chunk.includes('**Task completed**') ||
          chunk.includes('**Auto Mode Session Summary**') ||
          chunk.includes('**Error**') ||
          chunk.includes('Using') && chunk.includes('tool') ||
          chunk.includes('**Step') ||
          chunk.includes('**Autonomous Agent') ||
          chunk.includes('**Planning') ||
          chunk.includes('**Executing') ||
          chunk.includes('**Reflecting')
        );
        
        // Only update message content if it's not a status message
        if (!isStatusMessage) {
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId 
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));
        }
      };

      // Send message with streaming callback and conversation context
      // Use aiContent (with voice prefix) for AI processing
      // IMPORTANT: Use enforcedConfig to ensure streaming mode settings are applied
      const aiMessage = await claraApiService.sendChatMessage(
        aiContent, // Send full content including voice prefix to AI
        enforcedConfig, // Use enforced config instead of original sessionConfig.aiConfig
        attachments,
        systemPrompt,
        conversationHistory, // Pass conversation context
        enhancedStreamingCallback // Use enhanced callback
      );
      
      // Post-process autonomous agent responses for better UX
      if (enforcedConfig.autonomousAgent?.enabled && aiMessage.content) {
        const postProcessedContent = await postProcessAutonomousResponse(
          aiMessage.content,
          content, // Original user request
          aiMessage.metadata?.toolsUsed || []
        );
        aiMessage.content = postProcessedContent;
      }

      // **NEW: Automatic artifact detection**
      if (aiMessage.content && aiMessage.content.length > 50) {
        // Check if auto-detection is enabled in user configuration
        const artifactConfig = sessionConfig.aiConfig?.artifacts;
        const autoDetectEnabled = artifactConfig?.autoDetectArtifacts ?? true;
        
        if (autoDetectEnabled) {
          const detectionContext: DetectionContext = {
            userMessage: content,
            conversationHistory: conversationHistory.map((msg: ClaraMessage) => msg.content),
            messageContent: aiMessage.content,
            attachments: attachments,
            // Pass artifact configuration to detection service
            artifactConfig: artifactConfig
          };

          const detectionResult = ArtifactDetectionService.detectArtifacts(detectionContext);
          
          // Add detected artifacts to the AI message
          if (detectionResult.artifacts.length > 0) {
            aiMessage.artifacts = [
              ...(aiMessage.artifacts || []),
              ...detectionResult.artifacts
            ];
            
            // Update message content to cleaned version (with artifact placeholders)
            aiMessage.content = detectionResult.cleanedContent;
            
            // Add detection metadata
            aiMessage.metadata = {
              ...aiMessage.metadata,
              artifactDetection: {
                totalDetected: detectionResult.detectionSummary.totalArtifacts,
                types: detectionResult.detectionSummary.artifactTypes,
                confidence: detectionResult.detectionSummary.detectionConfidence,
                autoDetected: true,
                configUsed: {
                  autoDetectEnabled: true,
                  enabledTypes: Object.entries(artifactConfig || {})
                    .filter(([key, value]) => key.startsWith('enable') && value === true)
                    .map(([key]) => key.replace('enable', '').replace('Artifacts', '').toLowerCase())
                }
              }
            };

            console.log(`🎨 Auto-detected ${detectionResult.artifacts.length} artifacts:`, 
              detectionResult.detectionSummary.artifactTypes.join(', '));
          }
        } else {
          console.log('🎨 Artifact auto-detection is disabled in user configuration');
        }
      }

      // Replace the streaming message with the final message
      let finalMessage = { 
        ...aiMessage, 
        id: streamingMessageId, // Keep the same ID
        metadata: {
          ...aiMessage.metadata,
          isStreaming: false // Mark as complete
        }
      };

      // If autonomous agent was used, create a clean, simple completion message
      if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
        const toolExecutions = autonomousAgentStatus.toolExecutions;
        const completedTools = toolExecutions.filter(tool => tool.status === 'completed');
        const totalSteps = autonomousAgentStatus.status.currentStep;
        
        // **NEW**: Post-process autonomous agent response for clean user presentation
        const cleanedContent = await postProcessAutonomousResponse(
          aiMessage.content, 
          currentMessages[currentMessages.length - 1]?.content || '', // Get the last user message
          completedTools
        );
        
        // Create enhanced metadata with autonomous completion info
        const enhancedMetadata = {
          ...finalMessage.metadata,
          isStreaming: false
        };
        
        // Add autonomous completion properties
        (enhancedMetadata as any).autonomousCompletion = true;
        (enhancedMetadata as any).toolsUsed = completedTools.map(t => t.name);
        (enhancedMetadata as any).executionSteps = totalSteps;

        finalMessage = {
          ...finalMessage,
          content: cleanedContent,
          metadata: enhancedMetadata
        };

        // **CRITICAL FIX**: Always complete the autonomous agent when AI message is finalized
        // This ensures the status panel completes even if completion markers weren't detected in stream
        if (autonomousAgentStatus.status.phase !== 'completed') {
          console.log('🔧 Auto-completing autonomous agent status (completion markers not detected in stream)');
          autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
          // Auto-hide status panel after 2 seconds to show clean results
          autonomousAgentStatus.completeAgent('Task completed successfully', 2000);
        }
      }

      setMessages(prev => prev.map(msg => 
        msg.id === streamingMessageId ? finalMessage : msg
      ));

      // Update latest AI response for auto TTS
      setLatestAIResponse(finalMessage.content);
      setAutoTTSTrigger({
        text: finalMessage.content,
        timestamp: Date.now()
      });

      // Save AI message to database
      try {
        await claraDB.addClaraMessage(currentSession.id, finalMessage);
        
        // Update message count in sessions list for real-time sidebar updates
        setSessions(prev => prev.map(s => 
          s.id === currentSession.id 
            ? { 
                ...s, 
                messageCount: (s.messageCount || s.messages?.length || 0) + 1, // +1 for AI response (user message already counted)
                updatedAt: new Date()
              }
            : s
        ));
        
        // Enhanced notification for background operation
        if (!isVisible) {
          // More prominent notification when Clara is in background
          // Use display content for notifications (without voice prefix)
          addBackgroundCompletionNotification(
            'Clara Response Ready',
            `Clara has finished responding to: "${displayContent.slice(0, 40)}${displayContent.length > 40 ? '...' : ''}"`
          );
          // Track background notification creation
          claraBackgroundService.onBackgroundNotificationCreated();
        } else {
          // Standard notification when Clara is visible
          addCompletionNotification(
            'Chat Response Complete',
            isVoiceMessage ? 'Clara has finished responding to your voice message.' : 'Clara has finished responding to your message.',
            4000
          );
        }
      } catch (error) {
        console.error('Failed to save AI message:', error);
      }

      // Update session title if it's still "New Chat"
      if (currentSession.title === 'New Chat') {
        // Use display content for session title (without voice prefix)
        const newTitle = displayContent.slice(0, 50) + (displayContent.length > 50 ? '...' : '');
        const updatedSession = {
          ...currentSession,
          title: newTitle,
          messages: [...currentMessages, finalMessage],
          updatedAt: new Date()
        };
        
        setCurrentSession(updatedSession);
        
        // Update in database and sessions list
        try {
          await claraDB.updateClaraSession(currentSession.id, { title: newTitle });
          setSessions(prev => prev.map(s => 
            s.id === currentSession.id ? { ...s, title: newTitle } : s
          ));
        } catch (error) {
          console.error('Failed to update session title:', error);
        }
      }

    } catch (error) {
      console.error('Error generating AI response:', error);
      
      // Check if this is an abort error (user stopped the stream)
      const isAbortError = error instanceof Error && (
        error.message.includes('aborted') ||
        error.message.includes('BodyStreamBuffer was aborted') ||
        error.message.includes('AbortError') ||
        error.name === 'AbortError'
      );
      
      if (isAbortError) {
        console.log('Stream was aborted by user, preserving streamed content');
        
        // Just mark the current streaming message as complete, preserving all streamed content
        setMessages(prev => prev.map(msg => 
          msg.id === streamingMessageId 
            ? { 
                ...msg, 
                metadata: {
                  ...msg.metadata,
                  isStreaming: false,
                  aborted: true
                }
              }
            : msg
        ));

        // Save the aborted message to database with its current content
        try {
          // Get the current message with streamed content from state
          setMessages(prev => {
            const currentMessage = prev.find(msg => msg.id === streamingMessageId);
            if (currentMessage && currentSession) {
              const abortedMessage = {
                ...currentMessage,
                metadata: {
                  ...currentMessage.metadata,
                  isStreaming: false,
                  aborted: true
                }
              };
              // Save to database asynchronously
              claraDB.addClaraMessage(currentSession.id, abortedMessage).catch(dbError => {
                console.error('Failed to save aborted message:', dbError);
              });
            }
            return prev; // Don't actually modify the state here, just access it
          });
        } catch (dbError) {
          console.error('Failed to save aborted message:', dbError);
        }
      } else {
        // Check for specific vision model error
        const isVisionError = error instanceof Error && (
          error.message.includes('image input is not supported') ||
          error.message.includes('vision not supported') ||
          error.message.includes('multimodal not supported') ||
          error.message.includes('images are not supported')
        );
        
        // Check if user sent images but has vision error
        const hasImages = attachments && attachments.some(att => att.type === 'image');
        
        if (isVisionError || (hasImages && error instanceof Error && error.message.includes('server'))) {
          console.log('Vision model error detected - providing helpful guidance');
          
          // Get suggested vision models for better error message
          const suggestedModels = getSuggestedVisionModels();
          const modelSuggestions = suggestedModels.length > 0 
            ? `\n\n**Available vision models for ${sessionConfig.aiConfig?.provider}:**\n${suggestedModels.map(m => `• ${m.name}`).join('\n')}`
            : '\n\n**Note:** No vision models found for the current provider. You may need to download vision models first.';
          
          const errorMessage: ClaraMessage = {
            id: streamingMessageId,
            role: 'assistant',
            content: `I see you've shared an image, but the current model doesn't support image processing.${modelSuggestions}

**To fix this:**
1. Open **Advanced Options** (click the ⚙️ gear icon)
2. Select a **Vision Model** from the dropdown${suggestedModels.length > 0 ? ` (try ${suggestedModels[0].name})` : ''}
3. Or download vision models from **Settings → Model Manager**

**Alternative:** Switch to **Tools Mode** which can automatically select appropriate models for different tasks.

Would you like me to help with text-only responses for now?`,
            timestamp: new Date(),
            metadata: {
              error: error instanceof Error ? error.message : 'Vision model not configured',
              isStreaming: false,
              isVisionError: true,
              suggestedModels: suggestedModels.map(m => m.id)
            }
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId ? errorMessage : msg
          ));

          // Add specific error notification for vision issues
          addErrorNotification(
            'Vision Model Required',
            'Please configure a vision/multimodal model to process images.',
            8000
          );
        } else {
          // Only show generic error message for actual errors (not user aborts)
          const errorMessage: ClaraMessage = {
            id: streamingMessageId,
            role: 'assistant',
            content: 'I apologize, but I encountered an error while processing your request.  Please try again. \n Model Response was : \t'+(error instanceof Error ? error.message : 'Unknown error occurred'),
            timestamp: new Date(),
            metadata: {
              error: error instanceof Error ? error.message : 'Failed to generate response',
              isStreaming: false
            }
          };
          
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageId ? errorMessage : msg
          ));

          // Add error notification
          addErrorNotification(
            'Chat Error',
            'Failed to generate response. Please try again.',
            6000
          );

          // **CRITICAL FIX**: Complete autonomous agent on error to prevent stuck status
          if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
            console.log('🔧 Auto-completing autonomous agent status due to error');
            autonomousAgentStatus.updatePhase('error', 'An error occurred during execution');
            autonomousAgentStatus.errorAgent('Execution failed');
          }
        }

        // Save error message to database
        try {
          // Get the current error message from state to save
          setMessages(prev => {
            const currentMessage = prev.find(msg => msg.id === streamingMessageId);
            if (currentMessage && currentSession) {
              claraDB.addClaraMessage(currentSession.id, currentMessage).catch(dbError => {
                console.error('Failed to save error message:', dbError);
              });
            }
            return prev; // Don't modify state, just access it
          });
        } catch (dbError) {
          console.error('Failed to save error message:', dbError);
        }
      }
    } finally {
      setIsLoading(false);
      // Always decrement background activity when operation completes
      if (!isVisible) {
        claraBackgroundService.decrementBackgroundActivity();
      }

      // **SAFETY NET**: Ensure autonomous agent status completes within reasonable time
      if (enforcedConfig.autonomousAgent?.enabled && autonomousAgentStatus.isActive) {
        // Set a timeout to auto-complete if still active after 30 seconds
        setTimeout(() => {
          if (autonomousAgentStatus.isActive && autonomousAgentStatus.status.phase !== 'completed') {
            console.log('⏰ Safety timeout: Auto-completing stuck autonomous agent status');
            autonomousAgentStatus.updatePhase('completed', 'Task completed (timeout safety)');
            autonomousAgentStatus.completeAgent('Task completed', 1000);
          }
        }, 30000); // 30 second safety timeout
      }
    }
  }, [currentSession, messages, sessionConfig, isVisible, models]);

  // Handle session selection
  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (currentSession?.id === sessionId) return;
    
    try {
      const session = await claraDB.getClaraSession(sessionId);
      if (session) {
        setCurrentSession(session);
        setMessages(session.messages);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, [currentSession]);

  // Handle new chat creation
  const handleNewChat = useCallback(async () => {
    const newSession = await createNewSession();
    setCurrentSession(newSession);
    setMessages([]);
    // Reset autonomous agent status when starting new chat
    autonomousAgentStatus.reset();
  }, [createNewSession, autonomousAgentStatus]);

  // Handle session actions
  const handleSessionAction = useCallback(async (sessionId: string, action: 'star' | 'archive' | 'delete') => {
    try {
      if (action === 'delete') {
        console.log('Deleting session:', sessionId);
        await claraDB.deleteClaraSession(sessionId);
        
        // Update sessions list immediately
        setSessions(prev => {
          const updated = prev.filter(s => s.id !== sessionId);
          console.log('Updated sessions after delete:', updated.map(s => ({ id: s.id, title: s.title })));
          return updated;
        });
        
        // If we deleted the current session, create a new one or select another
        if (currentSession?.id === sessionId) {
          console.log('Deleted current session, selecting new one...');
          const remainingSessions = sessions.filter(s => s.id !== sessionId);
          if (remainingSessions.length > 0) {
            // Select the most recent remaining session
            const nextSession = await claraDB.getClaraSession(remainingSessions[0].id);
            if (nextSession) {
              setCurrentSession(nextSession);
              setMessages(nextSession.messages);
              console.log('Selected next session:', nextSession.title);
            }
          } else {
            // No sessions left, create a new one
            await handleNewChat();
          }
        }
      } else {
        const updates = action === 'star' 
          ? { isStarred: !sessions.find(s => s.id === sessionId)?.isStarred }
          : { isArchived: !sessions.find(s => s.id === sessionId)?.isArchived };
        
        await claraDB.updateClaraSession(sessionId, updates);
        setSessions(prev => prev.map(s => 
          s.id === sessionId ? { ...s, ...updates } : s
        ));
      }
    } catch (error) {
      console.error(`Failed to ${action} session:`, error);
    }
  }, [sessions, currentSession, handleNewChat]);

  // Handle provider change
  const handleProviderChange = useCallback(async (providerId: string) => {
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) {
        console.error('Provider not found:', providerId);
        return;
      }

      setIsLoadingProviders(true);
      console.log('=== Switching to provider ===');
      console.log('Provider:', provider.name, '(ID:', providerId, ')');
      
      // POCKET PROVIDER AUTO-START LOGIC
      if (provider.type === 'claras-pocket' && window.llamaSwap) {
        try {
          console.log("🚀 Switching to Clara's Core - checking status...");
          // Check if running
          const status = await window.llamaSwap.getStatus?.();
          if (!status?.isRunning) {
            console.log("🔄 Clara's Core is not running, starting for provider switch...");
            addInfoNotification(
              "Starting Clara's Core...",
              'Clara is starting up her local AI service. Please wait a moment.',
              6000
            );
            const result = await window.llamaSwap.start();
            if (!result.success) {
              addErrorNotification(
                "Failed to Start Clara's Core",
                result.error || 'Could not start the local AI service. Please check your installation.',
                10000
              );
              console.error("❌ Failed to start Clara's Core for provider switch:", result.error);
              setIsLoadingProviders(false);
              return;
            }
            console.log("✅ Clara's Core started successfully for provider switch");
            addInfoNotification(
              "Clara's Core Ready",
              'Local AI service is now running and ready!',
              3000
            );
            // Wait a moment for service to be ready
            await new Promise(res => setTimeout(res, 2000));
          } else {
            console.log("✅ Clara's Core is already running for provider switch");
          }
        } catch (err) {
          console.error("⚠️ Error starting Clara's Core for provider switch:", err);
          addErrorNotification(
            "Clara's Core Startup Error",
            err instanceof Error ? err.message : 'Could not communicate with the local AI service.',
            8000
          );
          setIsLoadingProviders(false);
          return;
        }
      }
      // STEP 1: Health check the provider before proceeding (with caching)
      console.log('🏥 Testing provider health...');
      
      // Only show notification for non-cached health checks
      const cached = providerHealthCache.get(provider.id);
      const now = Date.now();
      const isCacheValid = cached && (now - cached.timestamp < HEALTH_CHECK_CACHE_TIME);
      
      if (!isCacheValid) {
        addInfoNotification(
          'Testing Provider',
          `Checking connection to ${provider.name}...`,
          2000
        );
      }

      const isHealthy = await checkProviderHealthCached(provider);
      if (!isHealthy) {
        console.error('❌ Provider health check failed for:', provider.name);
        
        // Show error notification with suggestion
        addErrorNotification(
          'Provider Connection Failed',
          `${provider.name} is not responding. Please check if the service is running or try a different provider.`,
          8000
        );
        
        // Don't proceed with provider switch if health check fails
        setIsLoadingProviders(false);
        return;
      }
      
      console.log('✅ Provider health check passed for:', provider.name);
      if (!isCacheValid) {
        addInfoNotification(
          'Provider Connected',
          `Successfully connected to ${provider.name}`,
          2000
        );
      }
      
      // STEP 2: Update API service to use selected provider
      claraApiService.updateProvider(provider);
      
      // STEP 3: Load models ONLY from the selected provider
      const newModels = await claraApiService.getModels(providerId);
      console.log('Available models for', provider.name, ':', newModels.map(m => ({ id: m.id, name: m.name })));
      setModels(newModels);
      
      // STEP 4: Create models filtered by current provider for validation
      const providerModels = newModels.filter(m => m.provider === providerId);
      console.log('Filtered models for provider validation:', providerModels.map(m => m.id));
      
      // STEP 5: Try to load saved config for this provider
      const savedConfig = loadProviderConfig(providerId);
      
      if (savedConfig) {
        console.log('Found saved config for', provider.name);
        console.log('Saved models:', savedConfig.models);
        
        // STEP 6: Validate saved models against current provider's available models
        const validTextModel = providerModels.find(m => m.id === savedConfig.models.text);
        const validVisionModel = providerModels.find(m => m.id === savedConfig.models.vision);
        const validCodeModel = providerModels.find(m => m.id === savedConfig.models.code);
        
        console.log('Model validation:');
        console.log('- Text model valid:', !!validTextModel, validTextModel?.id);
        console.log('- Vision model valid:', !!validVisionModel, validVisionModel?.id);
        console.log('- Code model valid:', !!validCodeModel, validCodeModel?.id);
        
        // STEP 7: Create clean config with validated models
        const cleanConfig = {
          provider: providerId,
          systemPrompt: savedConfig.systemPrompt, // Preserve saved system prompt
          models: {
            text: validTextModel ? savedConfig.models.text : '',
            vision: validVisionModel ? savedConfig.models.vision : '',
            code: validCodeModel ? savedConfig.models.code : ''
          },
          parameters: {
            ...savedConfig.parameters
          },
          features: {
            ...savedConfig.features
          },
          mcp: savedConfig.mcp || {
            enableTools: true,
            enableResources: true,
            enabledServers: [],
            autoDiscoverTools: true,
            maxToolCalls: 5
          },
          autonomousAgent: savedConfig.autonomousAgent || {
            enabled: true,
            maxRetries: 3,
            retryDelay: 1000,
            enableSelfCorrection: true,
            enableToolGuidance: true,
            enableProgressTracking: true,
            maxToolCalls: 10,
            confidenceThreshold: 0.7,
            enableChainOfThought: true,
            enableErrorLearning: true
          },
          contextWindow: savedConfig.contextWindow || 50
        };
        
        console.log('Applied clean config:', cleanConfig);
        setSessionConfig(prev => ({
          ...prev,
          aiConfig: cleanConfig
        }));
        
        // If any models were invalid, save the cleaned config
        if (!validTextModel || !validVisionModel || !validCodeModel) {
          console.log('Cleaning invalid models from saved config');
          saveProviderConfig(providerId, cleanConfig);
        }
        
      } else {
        console.log('No saved config found for', provider.name, '- creating default');
        
        // STEP 8: Create fresh default config for this provider
        const textModel = providerModels.find(m => m.type === 'text' || m.type === 'multimodal');
        const visionModel = providerModels.find(m => m.supportsVision);
        const codeModel = providerModels.find(m => m.supportsCode);
        
        console.log('Auto-selected models:');
        console.log('- Text:', textModel?.id || 'none');
        console.log('- Vision:', visionModel?.id || 'none');
        console.log('- Code:', codeModel?.id || 'none');
        
        const defaultConfig = {
          provider: providerId,
          systemPrompt: getDefaultSystemPrompt(provider, {
            enableCodeArtifacts: true,
            enableChartArtifacts: true,
            enableTableArtifacts: true,
            enableMermaidArtifacts: true,
            enableHtmlArtifacts: true,
            enableMarkdownArtifacts: true,
            enableJsonArtifacts: true,
            enableDiagramArtifacts: true,
            autoDetectArtifacts: true,
            maxArtifactsPerMessage: 10
          }),
          models: {
            text: textModel?.id || '',
            vision: visionModel?.id || '',
            code: codeModel?.id || ''
          },
          parameters: {
            temperature: 0.7,
            maxTokens: 4000,
            topP: 1.0,
            topK: 40
          },
          features: {
            enableTools: false,           // **CHANGED**: Default to false for streaming mode
            enableRAG: false,
            enableStreaming: true,        // **CHANGED**: Default to streaming mode
            enableVision: true,
            autoModelSelection: false,    // **CHANGED**: Default to manual model selection
            enableMCP: false              // **CHANGED**: Default to false for streaming mode
          },
          mcp: {
            enableTools: true,
            enableResources: true,
            enabledServers: [],
            autoDiscoverTools: true,
            maxToolCalls: 5
          },
          autonomousAgent: {
            enabled: false,               // **CHANGED**: Default to false for streaming mode
            maxRetries: 3,
            retryDelay: 1000,
            enableSelfCorrection: true,
            enableToolGuidance: true,
            enableProgressTracking: true,
            maxToolCalls: 10,
            confidenceThreshold: 0.7,
            enableChainOfThought: true,
            enableErrorLearning: true
          },
          contextWindow: 50 // Include last 50 messages in conversation history
        };
        
        console.log('Created default config:', defaultConfig);
        setSessionConfig(prev => ({
          ...prev,
          aiConfig: defaultConfig
        }));
        
        // Save the default config
        saveProviderConfig(providerId, defaultConfig);
      }
      
      console.log('=== Provider switch complete ===');
      
    } catch (error) {
      console.error('Failed to change provider:', error);
    } finally {
      setIsLoadingProviders(false);
    }
  }, [providers, checkProviderHealthCached, providerHealthCache, HEALTH_CHECK_CACHE_TIME]);

  // Clear health cache for a specific provider (useful when we know something changed)
  const clearProviderHealthCache = useCallback((providerId?: string) => {
    if (providerId) {
      setProviderHealthCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(providerId);
        return newCache;
      });
      console.log(`🧹 Cleared health cache for provider: ${providerId}`);
    } else {
      setProviderHealthCache(new Map());
      console.log('🧹 Cleared all provider health cache');
    }
  }, []);

  // Handle model change
  const handleModelChange = useCallback((modelId: string, type: 'text' | 'vision' | 'code') => {
    setSessionConfig(prev => {
      if (!prev.aiConfig?.provider) {
        console.error('No provider set when trying to change model');
        return prev;
      }

      // Validate that the selected model belongs to the current provider
      const selectedModel = models.find(m => m.id === modelId);
      if (selectedModel && selectedModel.provider !== prev.aiConfig.provider) {
        console.error('Model validation failed: Model', modelId, 'belongs to provider', selectedModel.provider, 'but current provider is', prev.aiConfig.provider);
        return prev; // Don't update if model is from wrong provider
      }

      console.log('Model change validation passed:', {
        modelId,
        type,
        provider: prev.aiConfig.provider,
        modelProvider: selectedModel?.provider
      });

      const updatedConfig = {
        ...prev,
        aiConfig: {
          ...prev.aiConfig,
          models: {
            ...prev.aiConfig.models,
            [type]: modelId
          }
        }
      };
      
      // Save the updated configuration for the current provider
      if (updatedConfig.aiConfig?.provider) {
        saveProviderConfig(updatedConfig.aiConfig.provider, updatedConfig.aiConfig);
        console.log('Saved model change for provider:', updatedConfig.aiConfig.provider, type, modelId);
      }
      
      return updatedConfig;
    });
  }, [models]);

  // Handle message interactions
  const handleCopyMessage = useCallback(async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      // Could show a toast notification here
      console.log('Message copied:', content);
    } else {
      console.error('Failed to copy message');
    }
  }, []);

  const handleRetryMessage = useCallback((messageId: string) => {
    console.log('Retrying message:', messageId);
    // Implementation for retrying failed messages
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex > 0) {
      const previousMessage = messages[messageIndex - 1];
      if (previousMessage.role === 'user') {
        handleSendMessage(previousMessage.content, previousMessage.attachments);
      }
    }
  }, [messages, handleSendMessage]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    console.log('Editing message:', messageId, newContent);
    // Implementation for editing messages
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, content: newContent, timestamp: new Date() }
        : msg
    ));
  }, []);

  // Handle stopping generation
  const handleStop = useCallback(() => {
    console.log('Stopping generation...');
    claraApiService.stop();
    setIsLoading(false);
  }, []);

  // Simple preload - only if server is down
  const handlePreloadModel = useCallback(async () => {
    if (!sessionConfig.aiConfig) return;
    
    // Only preload for local services that might be down
    if (sessionConfig.aiConfig.provider === 'claras-pocket') {
      try {
        const status = await window.llamaSwap?.getStatus();
        if (!status?.isRunning) {
          console.log('🚀 Starting local server...');
          await claraApiService.preloadModel(sessionConfig.aiConfig, messages);
        }
        // If server is running, no preload needed - it handles automatically
      } catch (error) {
        console.warn('⚠️ Simple preload check failed:', error);
      }
    }
    // For cloud providers (OpenAI, etc.), no preload needed
  }, [sessionConfig.aiConfig, messages]);

  // Handle session config changes
  const handleConfigChange = useCallback((newConfig: Partial<ClaraSessionConfig>) => {
    setSessionConfig(prev => {
      const updated = { ...prev, ...newConfig };
      
      // Only save provider-specific configuration if we have a valid provider
      if (updated.aiConfig?.provider) {
        // If provider is changing through this config change, don't save mixed config
        if (newConfig.aiConfig?.provider && newConfig.aiConfig.provider !== prev.aiConfig?.provider) {
          console.log('Provider changing through config, will be handled by provider change handler');
          return updated;
        }
        
        // Validate models belong to current provider before saving
        if (newConfig.aiConfig?.models) {
          const currentProvider = updated.aiConfig.provider;
          const models_ = newConfig.aiConfig.models;
          const textModel = models_.text ? models.find(m => m.id === models_.text) : null;
          const visionModel = models_.vision ? models.find(m => m.id === models_.vision) : null;
          const codeModel = models_.code ? models.find(m => m.id === models_.code) : null;
          
          if ((textModel && textModel.provider !== currentProvider) ||
              (visionModel && visionModel.provider !== currentProvider) ||
              (codeModel && codeModel.provider !== currentProvider)) {
            console.error('Config validation failed: Models from wrong provider in config change');
            return prev; // Don't update if models are from wrong provider
          }
        }
        
        saveProviderConfig(updated.aiConfig.provider, updated.aiConfig);
        console.log('Saved config change for provider:', updated.aiConfig.provider, newConfig);
      }
      
      return updated;
    });
  }, [models]);

  // Debug utility for testing provider configurations
  useEffect(() => {
    // Expose debug functions to window for testing
    (window as any).debugClaraProviders = () => {
      console.log('Current provider configurations:');
      console.log('Providers:', providers.map(p => ({ id: p.id, name: p.name, isPrimary: p.isPrimary })));
      console.log('Models:', models.map(m => ({ id: m.id, name: m.name, provider: m.provider })));
      console.log('Current session config:', sessionConfig);
      console.log('Current session:', currentSession?.id, currentSession?.title);
      
      // Debug provider configs from localStorage
      debugProviderConfigs();
    };

    (window as any).clearProviderConfigs = () => {
      clearAllProviderConfigs();
      console.log('Cleared all provider configurations. Refresh to see changes.');
    };

    // Add MCP debugging functions
    (window as any).debugMCP = async () => {
      console.log('=== MCP Debug Info ===');
      console.log('MCP Service Ready:', claraMCPService.isReady());
      console.log('Available Servers:', claraMCPService.getRunningServers());
      console.log('Available Tools:', claraMCPService.getAvailableTools());
      console.log('Session MCP Config:', sessionConfig.aiConfig?.mcp);
    };

    // Add notification testing functions
    (window as any).testNotifications = () => {
      console.log('🔔 Testing notification system...');
      addCompletionNotification('Test Completion', 'This is a test completion notification with chime!');
      setTimeout(() => {
        addErrorNotification('Test Error', 'This is a test error notification.');
      }, 2000);
      setTimeout(() => {
        addInfoNotification('Test Info', 'This is a test info notification.');
      }, 4000);
    };

    (window as any).testCompletionSound = () => {
      console.log('🔔 Testing completion chime...');
      notificationService.testCompletionChime();
    };

    (window as any).setupTestMCP = async () => {
      console.log('🔧 Setting up test MCP server...');
      const success = await claraMCPService.setupTestGitHubServer();
      if (success) {
        console.log('✅ Test MCP server setup complete');
        await claraMCPService.refresh();
        console.log('📊 Updated MCP status:', {
          servers: claraMCPService.getRunningServers().length,
          tools: claraMCPService.getAvailableTools().length
        });
      } else {
        console.log('❌ Test MCP server setup failed');
      }
    };

    // Add background service debugging functions
    (window as any).debugBackground = () => {
      console.log('🔄 Clara Background Service Status:');
      console.log(claraBackgroundService.getStatus());
      console.log('Current visibility:', isVisible);
    };

    (window as any).testBackgroundChat = async () => {
      console.log('🧪 Testing background chat...');
      if (isVisible) {
        console.log('⚠️ Clara is currently visible. Switch to another page to test background mode.');
        return;
      }
      
      // Simulate a background message
      await handleSendMessage('This is a test message sent while Clara is in background mode.');
    };

    (window as any).testBackgroundNotification = () => {
      console.log('🧪 Testing persistent background notification...');
      addBackgroundCompletionNotification(
        'Clara Response Ready',
        'This is a persistent notification that requires manual dismissal. It will not auto-hide.'
      );
      claraBackgroundService.onBackgroundNotificationCreated();
    };

    (window as any).testBackgroundService = () => {
      console.log('🧪 Testing Clara background service notification...');
      // Simulate Clara going to background mode
      claraBackgroundService.setBackgroundMode(true);
      
      // Simulate some background activity
      setTimeout(() => {
        claraBackgroundService.incrementBackgroundActivity();
        console.log('📊 Added background activity');
      }, 1000);
      
      setTimeout(() => {
        claraBackgroundService.decrementBackgroundActivity();
        console.log('📊 Removed background activity');
      }, 3000);
      
      // Return to foreground after 5 seconds
      setTimeout(() => {
        claraBackgroundService.setBackgroundMode(false);
        console.log('👁️ Returned to foreground');
      }, 5000);
    };

    // Add refresh functionality to debug utilities
    (window as any).refreshClaraServices = async (force = false) => {
      console.log('🔄 Manually refreshing Clara services...');
      await refreshProvidersAndServices(force);
    };

    (window as any).debugRefreshStatus = () => {
      console.log('🔄 Refresh Status:');
      console.log('- Is refreshing:', isRefreshing);
      console.log('- Last refresh time:', new Date(lastRefreshTime));
      console.log('- Time since last refresh:', Math.round((Date.now() - lastRefreshTime) / 1000), 'seconds');
      console.log('- Current visibility:', isVisible);
      console.log('- Total models:', models.length);
      console.log('- Total providers:', providers.length);
    };

    // Add health cache debugging functions
    (window as any).debugHealthCache = () => {
      console.log('🏥 Provider Health Cache Status:');
      const now = Date.now();
      Array.from(providerHealthCache.entries()).forEach(([providerId, cache]) => {
        const ageSeconds = Math.round((now - cache.timestamp) / 1000);
        const isValid = ageSeconds < (HEALTH_CHECK_CACHE_TIME / 1000);
        console.log(`- ${providerId}: ${cache.isHealthy ? '✅' : '❌'} (${ageSeconds}s ago, ${isValid ? 'valid' : 'expired'})`);
      });
      console.log(`Cache TTL: ${HEALTH_CHECK_CACHE_TIME / 1000} seconds`);
    };

    (window as any).clearHealthCache = (providerId?: string) => {
      clearProviderHealthCache(providerId);
    };

    (window as any).testHealthCachePerformance = async () => {
      const provider = providers[0];
      if (!provider) {
        console.log('No providers available for testing');
        return;
      }

      console.log('🏥 Testing health cache performance...');
      
      // First call (uncached)
      const start1 = performance.now();
      await checkProviderHealthCached(provider);
      const uncachedTime = performance.now() - start1;
      
      // Second call (cached)
      const start2 = performance.now();
      await checkProviderHealthCached(provider);
      const cachedTime = performance.now() - start2;
      
      console.log(`Uncached health check: ${uncachedTime.toFixed(2)}ms`);
      console.log(`Cached health check: ${cachedTime.toFixed(2)}ms`);
      console.log(`Performance improvement: ${((uncachedTime - cachedTime) / uncachedTime * 100).toFixed(1)}%`);
    };

    // Add provider-specific debugging functions
    (window as any).debugProblematicTools = (providerId?: string) => {
      console.log('=== Provider-Specific Problematic Tools Debug ===');
      if (providerId) {
        console.log(`Problematic tools for provider ${providerId}:`);
        const storageKey = `clara-problematic-tools-${providerId}`;
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        console.log('Stored tools:', stored);
      } else {
        console.log('All provider-specific problematic tools:');
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('clara-problematic-tools-')) {
            const stored = JSON.parse(localStorage.getItem(key) || '[]');
            console.log(`${key}:`, stored);
          }
        }
      }
    };

    // Simple debug for current config
    (window as any).debugClara = () => {
      console.log('Clara Status:', {
        provider: sessionConfig.aiConfig?.provider,
        hasModels: models.length > 0,
        isVisible: isVisible,
        currentSession: currentSession?.title
      });
    };

    // Test the new autonomous agent status panel
    (window as any).testAgentStatusPanel = () => {
      console.log('🧪 Testing autonomous agent status panel...');
      
      // Start the agent
      autonomousAgentStatus.startAgent(5);
      
      // Simulate different phases
      setTimeout(() => {
        autonomousAgentStatus.setToolsLoaded(3);
        autonomousAgentStatus.updatePhase('planning', 'Analyzing requirements and creating execution plan...');
      }, 1000);
      
      setTimeout(() => {
        autonomousAgentStatus.setExecutionPlan([
          'Analyze user requirements',
          'Load necessary tools',
          'Execute file operations',
          'Validate results',
          'Complete task'
        ]);
      }, 2000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('executing', 'Executing tools and operations...');
        autonomousAgentStatus.updateProgress(1, 'Starting tool execution...');
        
        // Start some tool executions
        const toolId1 = autonomousAgentStatus.startToolExecution('file_read', 'Reading project files');
        const toolId2 = autonomousAgentStatus.startToolExecution('terminal', 'Running terminal commands');
        
        // Complete first tool after delay
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId1, 'Successfully read 5 files');
          autonomousAgentStatus.updateProgress(2, 'File operations completed');
        }, 2000);
        
        // Complete second tool after delay
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId2, 'Commands executed successfully');
          autonomousAgentStatus.updateProgress(3, 'Terminal operations completed');
        }, 3000);
        
      }, 3000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('reflecting', 'Analyzing results and determining next steps...');
        autonomousAgentStatus.updateProgress(4, 'Analyzing results...');
      }, 6000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('completed', 'Task completed successfully');
        // Auto-hide after 2 seconds to show clean results
        autonomousAgentStatus.completeAgent('All operations completed successfully!', 2000);
      }, 8000);
      
      console.log('✅ Agent status panel test started. Watch the UI for animations!');
      console.log('📝 The status panel will automatically hide after completion to show clean results in chat.');
    };

    // Test the complete autonomous workflow with auto-hide
    (window as any).testCompleteAutonomousWorkflow = () => {
      console.log('🚀 Testing complete autonomous workflow with auto-hide...');
      
      // Simulate a user message that triggers autonomous mode
      const testMessage: ClaraMessage = {
        id: generateId(),
        role: 'user',
        content: 'Please create a simple React component for me',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, testMessage]);
      
      // Start autonomous agent
      autonomousAgentStatus.startAgent(3);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('planning', 'Creating execution plan...');
        autonomousAgentStatus.setExecutionPlan([
          'Analyze component requirements',
          'Generate React component code',
          'Create example usage'
        ]);
      }, 1000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('executing', 'Generating component...');
        const toolId = autonomousAgentStatus.startToolExecution('code_generator', 'Creating React component');
        
        setTimeout(() => {
          autonomousAgentStatus.completeToolExecution(toolId, 'Component generated successfully');
          autonomousAgentStatus.updateProgress(3, 'Component creation completed');
        }, 2000);
      }, 2000);
      
      setTimeout(() => {
        autonomousAgentStatus.updatePhase('completed', 'Component ready!');
        // Auto-hide after 2 seconds
        autonomousAgentStatus.completeAgent('React component created successfully!', 2000);
        
        // Add the final result message after a short delay
        setTimeout(() => {
          const resultMessage: ClaraMessage = {
            id: generateId(),
            role: 'assistant',
            content: `I've created a React component for you! Here it is:

\`\`\`jsx
import React from 'react';

const MyComponent = ({ title = "Hello World", children }) => {
  return (
    <div className="p-4 bg-blue-50 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-blue-800 mb-2">{title}</h2>
      <div className="text-gray-700">
        {children || "This is a sample React component!"}
      </div>
    </div>
  );
};

export default MyComponent;
\`\`\`

The component is ready to use! You can import it and customize the title and content as needed.`,
            timestamp: new Date(),
            metadata: {
              isStreaming: false,
              autonomousCompletion: true,
              toolsUsed: ['code_generator'],
              executionSteps: 3
            } as any
          };
          
          setMessages(prev => [...prev, resultMessage]);
        }, 2500); // Show result after status panel hides
        
      }, 5000);
      
      console.log('✅ Complete workflow test started. Watch for:');
      console.log('1. 🎯 Professional status panel with live progress (no chat clutter)');
      console.log('2. 🎬 Auto-hide after completion (2 seconds)');
      console.log('3. 💬 Clean, simple result in chat bubble (no duplicate status info)');
    };

    // Test the new autonomous response post-processing
    (window as any).testAutonomousPostProcessing = async () => {
      console.log('🧪 Testing autonomous response post-processing...');
      
      // Example raw response like the user showed
      const rawResponse = `Current Step: Evaluating JavaScript to retrieve detailed location information from the page. Tool Usage: I used mcp_puppeteer_puppeteer_evaluate with "script": "fetch('https://ipinfo.io/json').then(response => response.json()).then(data => JSON.stringify(data));" to fetch and parse the geolocation data from ipinfo.io in a structured format. Result Analysis: The execution returned an object containing detailed location information such as city, region, country, etc.

Here is your current location according to IPInfo:

City: Bangalore
Region: Karnataka
Country: IN (India)
Location Coordinates: 13.0878, 80.2785
Final Answer: Your current location details are as follows:

City: Bangalore
Region: Karnataka
Country: India

The geographic coordinates for your location are approximately 13.0878 latitude and 80.2785 longitude.

If you need any more information or assistance, feel free to ask!

Execution result: {"ip":"34.239.165.21","city":"Bangalore","region":"Karnataka","country":"IN","loc":"13.0878,80.2785","org":"AS17418 Google LLC","postal":"560047"}

Execution result: [ 13.0878, 80.2785 ]

Console output:

Execution result: { "ip": "115.97.58.223", "hostname": "58.97.115.223.hathway.com", "city": "Chennai", "region": "Tamil Nadu", "country": "IN", "loc": "13.0878,80.2785", "org": "AS17488 Hathway IP Over Cable Internet", "postal": "600001", "timezone": "Asia/Kolkata", "readme": "https://ipinfo.io/missingauth" }

Console output:

Execution result: { "ip": "115.97.58.223", "hostname": "58.97.115.223.hathway.com", "city": "Chennai", "region": "Tamil Nadu", "country": "IN", "loc": "13.0878,80.2785", "org": "AS17488 Hathway IP Over Cable Internet", "postal": "600001", "timezone": "Asia/Kolkata", "readme": "https://ipinfo.io/missingauth" }

Console output:

Execution result: undefined

Console output:`;

      const userRequest = "What's my current location?";
      const completedTools = [{ name: 'mcp_puppeteer_evaluate' }];
      
      console.log('📝 Raw response (before processing):');
      console.log(rawResponse);
      
      const cleanedResponse = await postProcessAutonomousResponse(rawResponse, userRequest, completedTools);
      
      console.log('\n✨ Cleaned response (after processing):');
      console.log(cleanedResponse);
      
      console.log('\n🎯 Post-processing complete! The cleaned response removes:');
      console.log('• Console output sections');
      console.log('• Execution result lines');
      console.log('• Tool usage descriptions');
      console.log('• Raw JSON data');
      console.log('• Coordinate arrays');
      console.log('• Multiple newlines');
      console.log('\nAnd creates a clean, user-friendly summary instead!');
    };

    // Test the autonomous agent status panel error fix
    (window as any).testStatusPanelErrorFix = () => {
      console.log('🧪 Testing autonomous agent status panel error fix...');
      
      // Test with minimal status object to ensure no undefined errors
      const testStatus = {
        isActive: true,
        phase: 'initializing' as const,
        message: 'Testing error fix',
        progress: 0,
        currentStep: 0,
        totalSteps: 0,
        toolsLoaded: 0,
        executionPlan: [] // This should prevent the undefined error
      };
      
      console.log('✅ Test status object:', testStatus);
      console.log('✅ executionPlan is defined:', testStatus.executionPlan !== undefined);
      console.log('✅ executionPlan length:', testStatus.executionPlan.length);
      
      // Start the agent to test the actual component
      autonomousAgentStatus.startAgent(3);
      
      setTimeout(() => {
        console.log('✅ Agent started successfully without errors');
        console.log('✅ Current status:', autonomousAgentStatus.status);
        console.log('✅ Tool executions:', autonomousAgentStatus.toolExecutions);
        
        // Stop the agent
        autonomousAgentStatus.stopAgent();
        console.log('✅ Agent stopped successfully');
      }, 1000);
    };

    return () => {
      delete (window as any).debugClaraProviders;
      delete (window as any).clearProviderConfigs;
      delete (window as any).debugMCP;
      delete (window as any).testNotifications;
      delete (window as any).testCompletionSound;
      delete (window as any).setupTestMCP;
      delete (window as any).debugBackground;
      delete (window as any).testBackgroundChat;
      delete (window as any).testBackgroundNotification;
      delete (window as any).testBackgroundService;
      delete (window as any).refreshClaraServices;
      delete (window as any).debugRefreshStatus;
      delete (window as any).debugHealthCache;
      delete (window as any).clearHealthCache;
      delete (window as any).testHealthCachePerformance;
      delete (window as any).debugProblematicTools;
      delete (window as any).debugClara;
    };
  }, [providers, models, sessionConfig, currentSession, isVisible, handleSendMessage, 
      providerHealthCache, HEALTH_CHECK_CACHE_TIME, checkProviderHealthCached, clearProviderHealthCache]);

  // Initialize with a new session if none exists
  useEffect(() => {
    const initializeSession = async () => {
      // Only create a new session if we're not loading and there are no sessions and no current session
      if (!isLoadingSessions && sessions.length === 0 && !currentSession) {
        const newSession = await createNewSession();
        setCurrentSession(newSession);
        setMessages([]);
        console.log('Created new session as no sessions exist');
      }
    };
    
    initializeSession();
  }, [isLoadingSessions, sessions.length, currentSession, createNewSession]);

  /**
   * Post-process autonomous agent response to create clean, user-friendly output
   */
  const postProcessAutonomousResponse = async (
    rawResponse: string, 
    userRequest: string, 
    completedTools: any[]
  ): Promise<string> => {
    try {
      // Remove common autonomous mode artifacts
      let cleanedResponse = rawResponse
        // Remove console output sections (including empty ones)
        .replace(/Console output:\s*\n/gi, '')
        .replace(/Console output:\s*$/gi, '')
        .replace(/Console output:\s*\n\s*\n/gi, '\n')
        
        // Remove execution result sections (all variations)
        .replace(/Execution result:\s*\{[^}]*\}\s*\n/gi, '')
        .replace(/Execution result:\s*\[[^\]]*\]\s*\n/gi, '')
        .replace(/Execution result:\s*"[^"]*"\s*\n/gi, '')
        .replace(/Execution result:\s*\d+\s*\n/gi, '')
        .replace(/Execution result:\s*undefined\s*\n/gi, '')
        .replace(/Execution result:\s*null\s*\n/gi, '')
        .replace(/Execution result:\s*\n/gi, '')
        
        // Remove tool usage and analysis sections
        .replace(/Tool Usage:\s*I used [^.]*\.\s*/gi, '')
        .replace(/Result Analysis:\s*[^.]*\.\s*/gi, '')
        .replace(/Current Step:\s*[^.]*\.\s*/gi, '')
        
        // Remove raw coordinate outputs
        .replace(/\[\s*[0-9.-]+,\s*[0-9.-]+\s*\]\s*\n/gi, '')
        
        // Remove multiple consecutive newlines
        .replace(/\n{3,}/g, '\n\n')
        
        // Remove leading/trailing whitespace
        .trim();

      // If the cleaned response is too short or doesn't have meaningful content, create a summary
      if (cleanedResponse.length < 50 || !cleanedResponse.includes('Final Answer:')) {
        // Try to extract any meaningful content
        const meaningfulContent = extractMeaningfulContent(rawResponse);
        
        if (meaningfulContent) {
          cleanedResponse = `I've completed your request successfully! Here's what I found:

${meaningfulContent}

Is there anything else you'd like me to help you with?`;
        } else {
          cleanedResponse = `✅ **Task completed successfully!**

I've processed your request using autonomous execution. All operations completed successfully.

${completedTools.length > 0 ? `**Tools used:** ${completedTools.map(t => t.name.replace(/_/g, ' ')).join(', ')}` : ''}

Is there anything else you'd like me to help you with?`;
        }
      } else {
        // Clean up the existing response further
        cleanedResponse = cleanedResponse
          // Ensure proper formatting for Final Answer sections
          .replace(/Final Answer:\s*/gi, '## Final Answer\n\n')
          
          // Remove any remaining execution artifacts
          .replace(/Here is your current location according to[^:]*:\s*/gi, '')
          
          // Clean up any remaining artifacts
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
      }

      return cleanedResponse;
      
    } catch (error) {
      console.warn('Error post-processing autonomous response:', error);
      // Fallback to a simple cleaned version
      return rawResponse
        .replace(/Console output:\s*\n/gi, '')
        .replace(/Execution result:[^\n]*\n/gi, '')
        .trim() || '✅ Task completed successfully!';
    }
  };

  /**
   * Extract meaningful content from raw autonomous response
   */
  const extractMeaningfulContent = (rawResponse: string): string | null => {
    try {
      // Look for Final Answer sections first (highest priority)
      const finalAnswerMatch = rawResponse.match(/Final Answer:\s*([\s\S]*?)(?:\n\nExecution result:|Console output:|$)/i);
      if (finalAnswerMatch && finalAnswerMatch[1]) {
        return finalAnswerMatch[1].trim();
      }
      
      // Look for location information in the response text
      const locationTextMatch = rawResponse.match(/City:\s*([^\n]*)\s*Region:\s*([^\n]*)\s*Country:\s*([^\n]*)/i);
      if (locationTextMatch) {
        const coordinates = rawResponse.match(/coordinates?\s*(?:are\s*)?(?:approximately\s*)?([0-9.-]+)[,\s]+([0-9.-]+)/i);
        return `**Your Current Location:**
• **City:** ${locationTextMatch[1].trim()}
• **Region:** ${locationTextMatch[2].trim()}
• **Country:** ${locationTextMatch[3].trim()}
${coordinates ? `• **Coordinates:** ${coordinates[1]}, ${coordinates[2]}` : ''}`;
      }
      
      // Look for structured JSON data and format it nicely
      const jsonMatches = rawResponse.match(/\{[^}]*"city"[^}]*\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        try {
          // Use the last/most complete JSON object
          const data = JSON.parse(jsonMatches[jsonMatches.length - 1]);
          if (data.city && data.region && data.country) {
            return `**Your Current Location:**
• **City:** ${data.city}
• **Region:** ${data.region}
• **Country:** ${data.country === 'IN' ? 'India' : data.country}
${data.loc ? `• **Coordinates:** ${data.loc}` : ''}
${data.timezone ? `• **Timezone:** ${data.timezone}` : ''}`;
          }
        } catch (e) {
          // JSON parsing failed, continue
        }
      }
      
      // Look for any meaningful text content (not execution results)
      const meaningfulLines = rawResponse
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed && 
            !trimmed.includes('Execution result:') &&
            !trimmed.includes('Console output:') &&
            !trimmed.includes('Tool Usage:') &&
            !trimmed.includes('Result Analysis:') &&
            !trimmed.includes('Current Step:') &&
            !trimmed.startsWith('{') && // Skip raw JSON lines
            !trimmed.startsWith('[') && // Skip raw array lines
            trimmed.length > 10 &&
            !trimmed.match(/^[0-9.-]+,\s*[0-9.-]+$/); // Skip coordinate lines
        })
        .join('\n')
        .trim();
      
      return meaningfulLines.length > 30 ? meaningfulLines : null;
      
    } catch (error) {
      console.warn('Error extracting meaningful content:', error);
      return null;
    }
  };

  return (
    <div className="flex h-screen w-full relative" data-clara-container>
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="absolute top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Content with relative z-index */}
      <div className="relative z-10 flex h-screen w-full">
        {/* App Sidebar (main navigation) on the left */}
        <Sidebar activePage="clara" onPageChange={onPageChange} />

        {/* Main: Chat Area */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header */}
          <Topbar 
            userName={userName}
            onPageChange={onPageChange}
          />
          
          {/* Chat Window */}
          <ClaraChatWindow
            messages={messages}
            userName={userName}
            isLoading={isLoading}
            isInitializing={isLoadingSessions || isLoadingProviders}
            onRetryMessage={handleRetryMessage}
            onCopyMessage={handleCopyMessage}
            onEditMessage={handleEditMessage}
          />
          
          {/* Autonomous Agent Status Panel - Above Advanced Options */}
          {autonomousAgentStatus.isActive && (
            <div className="px-6 py-4">
              <div className="max-w-4xl mx-auto">
                <AutonomousAgentStatusPanel
                  status={autonomousAgentStatus.status}
                  toolExecutions={autonomousAgentStatus.toolExecutions}
                  onPause={() => {
                    // TODO: Implement pause functionality
                    console.log('Pause autonomous agent');
                  }}
                  onStop={() => {
                    autonomousAgentStatus.stopAgent();
                    claraApiService.stop();
                  }}
                  onComplete={() => {
                    console.log('🔧 Manual completion triggered by user');
                    autonomousAgentStatus.updatePhase('completed', 'Task completed (manual)');
                    autonomousAgentStatus.completeAgent('Task completed manually', 1000);
                  }}
                  className="mb-4"
                />
              </div>
            </div>
          )}

          {/* Advanced Options Panel - Above Chat Input */}
          {showAdvancedOptions && (
            <div className="px-6 py-4 transition-all duration-300 ease-out transform animate-in slide-in-from-top-2 fade-in-0">
              <div className="max-w-4xl mx-auto transition-all duration-300">
                <AdvancedOptions
                  aiConfig={sessionConfig.aiConfig}
                  onConfigChange={(newConfig) => {
                    const currentConfig = sessionConfig.aiConfig;
                    const updatedConfig: ClaraAIConfig = {
                      provider: newConfig.provider ?? currentConfig.provider,
                      systemPrompt: newConfig.systemPrompt ?? currentConfig.systemPrompt,
                      models: {
                        text: newConfig.models?.text ?? currentConfig.models.text,
                        vision: newConfig.models?.vision ?? currentConfig.models.vision,
                        code: newConfig.models?.code ?? currentConfig.models.code
                      },
                      parameters: {
                        temperature: newConfig.parameters?.temperature ?? currentConfig.parameters.temperature,
                        maxTokens: newConfig.parameters?.maxTokens ?? currentConfig.parameters.maxTokens,
                        topP: newConfig.parameters?.topP ?? currentConfig.parameters.topP,
                        topK: newConfig.parameters?.topK ?? currentConfig.parameters.topK
                      },
                      features: {
                        enableTools: newConfig.features?.enableTools ?? currentConfig.features.enableTools,
                        enableRAG: newConfig.features?.enableRAG ?? currentConfig.features.enableRAG,
                        enableStreaming: newConfig.features?.enableStreaming ?? currentConfig.features.enableStreaming,
                        enableVision: newConfig.features?.enableVision ?? currentConfig.features.enableVision,
                        autoModelSelection: newConfig.features?.autoModelSelection ?? currentConfig.features.autoModelSelection,
                        enableMCP: newConfig.features?.enableMCP ?? currentConfig.features.enableMCP
                      },
                      mcp: newConfig.mcp ? {
                        enableTools: newConfig.mcp.enableTools ?? currentConfig.mcp?.enableTools ?? true,
                        enableResources: newConfig.mcp.enableResources ?? currentConfig.mcp?.enableResources ?? true,
                        enabledServers: newConfig.mcp.enabledServers ?? currentConfig.mcp?.enabledServers ?? [],
                        autoDiscoverTools: newConfig.mcp.autoDiscoverTools ?? currentConfig.mcp?.autoDiscoverTools ?? true,
                        maxToolCalls: newConfig.mcp.maxToolCalls ?? currentConfig.mcp?.maxToolCalls ?? 5
                      } : currentConfig.mcp,
                      autonomousAgent: newConfig.autonomousAgent ? {
                        enabled: newConfig.autonomousAgent.enabled ?? currentConfig.autonomousAgent?.enabled ?? false,
                        maxRetries: newConfig.autonomousAgent.maxRetries ?? currentConfig.autonomousAgent?.maxRetries ?? 3,
                        retryDelay: newConfig.autonomousAgent.retryDelay ?? currentConfig.autonomousAgent?.retryDelay ?? 1000,
                        enableSelfCorrection: newConfig.autonomousAgent.enableSelfCorrection ?? currentConfig.autonomousAgent?.enableSelfCorrection ?? true,
                        enableToolGuidance: newConfig.autonomousAgent.enableToolGuidance ?? currentConfig.autonomousAgent?.enableToolGuidance ?? true,
                        enableProgressTracking: newConfig.autonomousAgent.enableProgressTracking ?? currentConfig.autonomousAgent?.enableProgressTracking ?? true,
                        maxToolCalls: newConfig.autonomousAgent.maxToolCalls ?? currentConfig.autonomousAgent?.maxToolCalls ?? 10,
                        confidenceThreshold: newConfig.autonomousAgent.confidenceThreshold ?? currentConfig.autonomousAgent?.confidenceThreshold ?? 0.7,
                        enableChainOfThought: newConfig.autonomousAgent.enableChainOfThought ?? currentConfig.autonomousAgent?.enableChainOfThought ?? true,
                        enableErrorLearning: newConfig.autonomousAgent.enableErrorLearning ?? currentConfig.autonomousAgent?.enableErrorLearning ?? true
                      } : currentConfig.autonomousAgent,
                      artifacts: newConfig.artifacts ? {
                        enableCodeArtifacts: newConfig.artifacts.enableCodeArtifacts ?? currentConfig.artifacts?.enableCodeArtifacts ?? true,
                        enableChartArtifacts: newConfig.artifacts.enableChartArtifacts ?? currentConfig.artifacts?.enableChartArtifacts ?? true,
                        enableTableArtifacts: newConfig.artifacts.enableTableArtifacts ?? currentConfig.artifacts?.enableTableArtifacts ?? true,
                        enableMermaidArtifacts: newConfig.artifacts.enableMermaidArtifacts ?? currentConfig.artifacts?.enableMermaidArtifacts ?? true,
                        enableHtmlArtifacts: newConfig.artifacts.enableHtmlArtifacts ?? currentConfig.artifacts?.enableHtmlArtifacts ?? true,
                        enableMarkdownArtifacts: newConfig.artifacts.enableMarkdownArtifacts ?? currentConfig.artifacts?.enableMarkdownArtifacts ?? true,
                        enableJsonArtifacts: newConfig.artifacts.enableJsonArtifacts ?? currentConfig.artifacts?.enableJsonArtifacts ?? true,
                        enableDiagramArtifacts: newConfig.artifacts.enableDiagramArtifacts ?? currentConfig.artifacts?.enableDiagramArtifacts ?? true,
                        autoDetectArtifacts: newConfig.artifacts.autoDetectArtifacts ?? currentConfig.artifacts?.autoDetectArtifacts ?? true,
                        maxArtifactsPerMessage: newConfig.artifacts.maxArtifactsPerMessage ?? currentConfig.artifacts?.maxArtifactsPerMessage ?? 10
                      } : currentConfig.artifacts,
                      contextWindow: newConfig.contextWindow ?? currentConfig.contextWindow
                    };
                    handleConfigChange({ aiConfig: updatedConfig });
                  }}
                  providers={providers}
                  models={models}
                  onProviderChange={handleProviderChange}
                  onModelChange={handleModelChange}
                  show={showAdvancedOptions}
                />
              </div>
            </div>
          )}
          
          {/* Chat Input */}
          <ClaraAssistantInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading || isLoadingProviders}
            sessionConfig={sessionConfig}
            onConfigChange={handleConfigChange}
            providers={providers}
            models={models}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
            onStop={handleStop}
            onNewChat={handleNewChat}
            autoTTSText={latestAIResponse}
            autoTTSTrigger={autoTTSTrigger}
            onPreloadModel={handlePreloadModel}
            showAdvancedOptionsPanel={showAdvancedOptions}
            onAdvancedOptionsToggle={setShowAdvancedOptions}
          />
        </div>

        {/* Clara Chat History Sidebar on the right */}
        <ClaraSidebar 
          sessions={sessions}
          currentSessionId={currentSession?.id}
          isLoading={isLoadingSessions}
          isLoadingMore={isLoadingMoreSessions}
          hasMoreSessions={hasMoreSessions}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onSessionAction={handleSessionAction}
          onLoadMore={loadMoreSessions}
        />
      </div>

      {/* No Models Available Modal */}
      {showNoModelsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 m-4 max-w-md w-full mx-auto transform transition-all duration-300 ease-out scale-100 animate-in fade-in-0 zoom-in-95">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
              No AI Models Available
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
              You don't seem to have any AI models downloaded yet. To start chatting with Clara, 
              you'll need to download at least one model from the Model Manager.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              <button
                onClick={() => onPageChange('settings')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Go to Model Manager</span>
              </button>
              
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                This dialog will disappear once you have downloaded a model
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaraAssistant; 
