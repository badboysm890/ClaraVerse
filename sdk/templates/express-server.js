/**
 * angela Flow SDK - Express.js Server Template
 * This template demonstrates how to deploy angela workflows as REST APIs
 */

import express from 'express';
import cors from 'cors';
import { angelaFlowRunner } from 'angela-flow-sdk';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Global workflow runner
const runner = new angelaFlowRunner({
  enableLogging: true,
  timeout: 60000
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'angela Flow API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main execution endpoint
app.post('/execute', async (req, res) => {
  try {
    const { workflow, inputs = {}, options = {} } = req.body;
    
    if (!workflow) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is required'
      });
    }

    console.log(`📋 Executing workflow: ${workflow.name || 'Unnamed'}`);
    
    const startTime = Date.now();
    const result = await runner.execute(workflow, inputs);
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      result,
      metadata: {
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        workflow: workflow.name || 'Unnamed'
      }
    });
    
  } catch (error) {
    console.error('❌ Workflow execution failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Workflow validation endpoint
app.post('/validate', async (req, res) => {
  try {
    const { workflow } = req.body;
    
    if (!workflow) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is required'
      });
    }
    
    // Basic validation by attempting to normalize
    const testRunner = new angelaFlowRunner({ enableLogging: false });
    const normalizedFlow = testRunner.normalizeFlow(workflow);
    testRunner.validateFlow(normalizedFlow);
    
    res.json({
      success: true,
      valid: true,
      metadata: {
        nodeCount: normalizedFlow.nodes.length,
        connectionCount: normalizedFlow.connections.length,
        hasCustomNodes: (normalizedFlow.customNodes && normalizedFlow.customNodes.length > 0)
      }
    });
    
  } catch (error) {
    res.json({
      success: true,
      valid: false,
      error: error.message
    });
  }
});

// Execution logs endpoint
app.get('/logs', (req, res) => {
  const logs = runner.getLogs();
  res.json({
    success: true,
    logs: logs.slice(-100), // Last 100 logs
    count: logs.length
  });
});

// Clear logs endpoint
app.delete('/logs', (req, res) => {
  runner.clearLogs();
  res.json({
    success: true,
    message: 'Logs cleared'
  });
});

// Batch execution endpoint
app.post('/execute/batch', async (req, res) => {
  try {
    const { workflow, inputSets = [], options = {} } = req.body;
    
    if (!workflow) {
      return res.status(400).json({
        success: false,
        error: 'Workflow is required'
      });
    }
    
    if (!Array.isArray(inputSets) || inputSets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'InputSets array is required'
      });
    }
    
    console.log(`📋 Batch executing workflow: ${workflow.name || 'Unnamed'} (${inputSets.length} items)`);
    
    const startTime = Date.now();
    const results = [];
    const concurrency = options.concurrency || 3;
    
    // Process in batches
    for (let i = 0; i < inputSets.length; i += concurrency) {
      const batch = inputSets.slice(i, i + concurrency);
      const batchPromises = batch.map(async (inputs, index) => {
        try {
          const result = await runner.execute(workflow, inputs);
          return { success: true, result, index: i + index };
        } catch (error) {
          return { success: false, error: error.message, index: i + index };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      results,
      metadata: {
        total: inputSets.length,
        successful: successCount,
        failed: inputSets.length - successCount,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Batch execution failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Workflow info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: 'angela Flow API Server',
    version: '2.0.0',
    sdk: 'angela-flow-sdk@2.0.0',
    features: [
      'Workflow execution',
      'Batch processing',
      'Custom nodes',
      'Health monitoring',
      'Execution logs'
    ],
    endpoints: {
      'POST /execute': 'Execute a workflow',
      'POST /execute/batch': 'Execute workflow with multiple input sets',
      'POST /validate': 'Validate workflow structure',
      'GET /health': 'Health check',
      'GET /logs': 'Get execution logs',
      'DELETE /logs': 'Clear execution logs',
      'GET /info': 'Service information'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'POST /execute',
      'POST /execute/batch', 
      'POST /validate',
      'GET /health',
      'GET /logs',
      'DELETE /logs',
      'GET /info'
    ]
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 angela Flow API Server running on port ${port}`);
  console.log(`📖 API Documentation: http://localhost:${port}/info`);
  console.log(`💚 Health Check: http://localhost:${port}/health`);
  console.log(`📊 Ready to execute angela workflows!`);
});

export default app; 
