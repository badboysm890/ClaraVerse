# Deploying Agents

Transform your visual AI workflows into production-ready APIs and applications. Deploy agents as standalone services, integrate into existing systems, or share with your team.

## 🎯 Deployment Options

### **1. Export Formats**
- **JSON Export**: Portable workflow files for sharing
- **SDK Export**: Code-ready format for integration
- **API Deployment**: REST endpoints (coming soon)
- **Container Deployment**: Docker-ready packages (coming soon)

### **2. Integration Methods**
- **angela Flow SDK**: JavaScript/TypeScript library
- **REST API**: HTTP endpoints for any language
- **WebSocket**: Real-time streaming connections
- **Webhook**: Event-driven processing

## 📦 Export Your Agent

### **Step 1: Prepare Your Workflow**
1. **Test Thoroughly**: Ensure your workflow runs correctly
2. **Optimize Performance**: Reduce unnecessary nodes and API calls
3. **Configure Defaults**: Set appropriate default values for inputs
4. **Document Usage**: Add clear descriptions to inputs and outputs

### **Step 2: Export Process**
1. Open your workflow in Agent Studio
2. Click **"Export"** in the toolbar
3. Choose your export format:
   - **JSON Format**: For sharing and backup
   - **SDK Format**: For code integration

### **Export Options**

**JSON Format:**
```json
{
  "format": "angela-sdk",
  "version": "1.0.0",
  "flow": {
    "id": "workflow-123",
    "name": "Content Analyzer",
    "nodes": [...],
    "connections": [...],
    "settings": {...}
  },
  "customNodes": [...],
  "metadata": {
    "exportedAt": "2024-01-26T10:00:00Z",
    "exportedBy": "angela Agent Studio",
    "hasCustomNodes": false
  }
}
```

**SDK Format:**
```json
{
  "format": "angela-sdk",
  "flow": {...},
  "customNodes": [...],
  "documentation": {
    "name": "Content Analyzer",
    "description": "Analyzes text content and provides insights",
    "inputs": [...],
    "outputs": [...],
    "examples": [...]
  }
}
```

## 🛠️ SDK Integration

### **Installation**
```bash
npm install angela-flow-sdk
```

### **Basic Usage**
```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from './my-workflow.json';

const runner = new angelaFlowRunner();
const result = await runner.run(workflow, {
  input: 'Your text here'
});

console.log(result);
```

### **Advanced Configuration**
```javascript
const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 30000,
  maxRetries: 3,
  logLevel: 'info'
});

// Get workflow requirements
const requirements = runner.getRequiredInputs(workflow);
console.log('Required inputs:', requirements);

// Describe workflow
const description = runner.describe(workflow);
console.log('Workflow info:', description);
```

### **Error Handling**
```javascript
try {
  const result = await runner.run(workflow, inputs);
  console.log('Success:', result);
} catch (error) {
  console.error('Workflow failed:', error.message);
  
  // Get execution logs for debugging
  const logs = runner.getLogs();
  console.log('Execution logs:', logs);
}
```

## 🌐 REST API Deployment

### **Express.js Server Template**

**Basic Server:**
```javascript
import express from 'express';
import cors from 'cors';
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from './workflow.json';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize runner
const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 60000
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'angela Flow API',
    workflow: workflow.flow.name,
    timestamp: new Date().toISOString()
  });
});

// Workflow info endpoint
app.get('/info', (req, res) => {
  const info = runner.describe(workflow);
  const inputs = runner.getRequiredInputs(workflow);
  
  res.json({
    ...info,
    requiredInputs: inputs,
    endpoints: {
      execute: '/execute',
      info: '/info',
      health: '/health'
    }
  });
});

// Main execution endpoint
app.post('/execute', async (req, res) => {
  try {
    const result = await runner.run(workflow, req.body);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Execution failed:', error);
    
    res.status(400).json({
      success: false,
      error: error.message,
      logs: runner.getLogs(),
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Agent API running on port ${port}`);
  console.log(`📊 Info: http://localhost:${port}/info`);
  console.log(`💡 Health: http://localhost:${port}/health`);
});
```

### **Production Enhancements**

**Rate Limiting:**
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/execute', limiter);
```

**Authentication:**
```javascript
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.sendStatus(401);
  }
  
  // Verify token logic here
  if (isValidToken(token)) {
    next();
  } else {
    res.sendStatus(403);
  }
};

app.use('/execute', authenticateToken);
```

**Request Validation:**
```javascript
import Joi from 'joi';

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }
    next();
  };
};

// Define schema based on workflow inputs
const inputSchema = Joi.object({
  text: Joi.string().required(),
  options: Joi.object().optional()
});

app.post('/execute', validateRequest(inputSchema), async (req, res) => {
  // Execution logic
});
```

## 🐳 Container Deployment

### **Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]
```

### **Docker Compose**
```yaml
version: '3.8'

services:
  agent-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - LOG_LEVEL=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - agent-api
    restart: unless-stopped
```

### **Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-api
  template:
    metadata:
      labels:
        app: agent-api
    spec:
      containers:
      - name: agent-api
        image: your-registry/agent-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: agent-api-service
spec:
  selector:
    app: agent-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

## 🚀 Cloud Deployment

### **Vercel (Serverless)**
```javascript
// api/execute.js
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from '../workflow.json';

const runner = new angelaFlowRunner();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const result = await runner.run(workflow, req.body);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}
```

**vercel.json:**
```json
{
  "functions": {
    "api/execute.js": {
      "maxDuration": 60
    }
  }
}
```

### **AWS Lambda**
```javascript
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from './workflow.json';

const runner = new angelaFlowRunner();

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const result = await runner.run(workflow, body);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        result: result
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
```

### **Google Cloud Functions**
```javascript
import functions from '@google-cloud/functions-framework';
import { angelaFlowRunner } from 'angela-flow-sdk';
import workflow from './workflow.json';

const runner = new angelaFlowRunner();

functions.http('executeWorkflow', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  try {
    const result = await runner.run(workflow, req.body);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

## 📊 Monitoring & Analytics

### **Basic Logging**
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'agent-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'agent-combined.log' })
  ]
});

// In your endpoint
app.post('/execute', async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info('Workflow execution started', {
      workflow: workflow.flow.name,
      inputs: Object.keys(req.body),
      timestamp: new Date().toISOString()
    });
    
    const result = await runner.run(workflow, req.body);
    const duration = Date.now() - startTime;
    
    logger.info('Workflow execution completed', {
      duration: duration,
      success: true
    });
    
    res.json({ success: true, result, duration });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Workflow execution failed', {
      error: error.message,
      duration: duration,
      inputs: req.body
    });
    
    res.status(400).json({ success: false, error: error.message });
  }
});
```

### **Metrics Collection**
```javascript
import prometheus from 'prom-client';

// Create metrics
const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const workflowExecutionDuration = new prometheus.Histogram({
  name: 'workflow_execution_duration_seconds',
  help: 'Duration of workflow execution',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

const workflowExecutions = new prometheus.Counter({
  name: 'workflow_executions_total',
  help: 'Total number of workflow executions',
  labelNames: ['workflow', 'status']
});

// Middleware to collect metrics
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    
    httpRequestsTotal
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .inc();
  });
  
  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  const metrics = await prometheus.register.metrics();
  res.send(metrics);
});
```

## 🔒 Security Best Practices

### **API Security**
```javascript
import helmet from 'helmet';
import compression from 'compression';

// Security middleware
app.use(helmet());
app.use(compression());

// Input sanitization
import DOMPurify from 'isomorphic-dompurify';

const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

function sanitizeObject(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = DOMPurify.sanitize(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
```

### **Environment Configuration**
```javascript
// config.js
export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY
  },
  database: {
    url: process.env.DATABASE_URL
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*']
  }
};

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Required environment variable ${envVar} is not set`);
  }
}
```

## 📈 Performance Optimization

### **Caching**
```javascript
import NodeCache from 'node-cache';

const cache = new NodeCache({ 
  stdTTL: 600, // 10 minutes
  checkperiod: 120 // Check for expired keys every 2 minutes
});

app.post('/execute', async (req, res) => {
  // Create cache key from inputs
  const cacheKey = JSON.stringify(req.body);
  
  // Check cache first
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    return res.json({
      success: true,
      result: cachedResult,
      cached: true
    });
  }
  
  try {
    const result = await runner.run(workflow, req.body);
    
    // Cache the result
    cache.set(cacheKey, result);
    
    res.json({ success: true, result, cached: false });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

### **Connection Pooling**
```javascript
// For database connections
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// For HTTP requests
import { Agent } from 'https';

const httpsAgent = new Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});
```

## 🔄 CI/CD Pipeline

### **GitHub Actions**
```yaml
name: Deploy Agent API

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: |
          # Your deployment script here
          docker build -t agent-api .
          docker push your-registry/agent-api:latest
```

### **Deployment Script**
```bash
#!/bin/bash
set -e

echo "Starting deployment..."

# Build and test
npm ci
npm run test
npm run build

# Build Docker image
docker build -t agent-api:latest .

# Tag for registry
docker tag agent-api:latest your-registry/agent-api:latest

# Push to registry
docker push your-registry/agent-api:latest

# Deploy to Kubernetes
kubectl apply -f k8s/
kubectl set image deployment/agent-api agent-api=your-registry/agent-api:latest

echo "Deployment completed!"
```

---

## 🎯 Deployment Checklist

**Pre-Deployment:**
- [ ] Workflow tested thoroughly in Agent Studio
- [ ] All API endpoints configured correctly
- [ ] Input validation implemented
- [ ] Error handling tested
- [ ] Performance optimized

**Security:**
- [ ] Authentication implemented
- [ ] Rate limiting configured
- [ ] Input sanitization enabled
- [ ] HTTPS enforced
- [ ] Environment variables secured

**Monitoring:**
- [ ] Logging configured
- [ ] Metrics collection enabled
- [ ] Health checks implemented
- [ ] Alerting set up
- [ ] Performance monitoring active

**Production:**
- [ ] Load testing completed
- [ ] Backup strategy in place
- [ ] CI/CD pipeline configured
- [ ] Documentation updated
- [ ] Team trained on operations

---

**Ready to deploy your first agent?** Start with the basic Express.js template and gradually add production features! 🚀

**Need help with deployment?** Check out our **[SDK Integration guide](sdk-usage.md)** for more examples! 💡 
