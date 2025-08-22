# angela Core Docker Containerization

This guide explains how to run the angela Core (LlamaSwap) service in a Docker container with GPU support, replacing the Electron-based IPC communication with HTTP API calls.

## Overview

The angela Core service has been containerized to provide:
- GPU acceleration (NVIDIA CUDA) when available
- CPU fallback for non-GPU systems
- HTTP API replacing IPC communication
- OpenAI-compatible endpoints
- Proper model management and scanning
- Health monitoring and logging

## Quick Start

### 1. Using Docker Compose (Recommended)

```bash
# Start the service
cd docker/angela-core
docker-compose up -d

# Check logs
docker-compose logs -f angela-core

# Stop the service
docker-compose down
```

### 2. Using Management Scripts

**Windows:**
```cmd
cd docker\angela-core
angela-core.bat start
angela-core.bat status
angela-core.bat stop
```

**Linux/macOS:**
```bash
cd docker/angela-core
./angela-core.sh start
./angela-core.sh status
./angela-core.sh stop
```

### 3. Manual Docker Commands

```bash
# Build the image
docker build -t angela-core:latest .

# Run with GPU support (if available)
docker run -d --name angela-core \
  --gpus all \
  -p 8091:8091 \
  -v ~/models:/app/models \
  angela-core:latest

# Run CPU-only
docker run -d --name angela-core \
  -p 8091:8091 \
  -v ~/models:/app/models \
  angela-core:latest
```

## Configuration

### Environment Variables

- `angela_GPU_ENABLED`: Enable GPU support (default: auto-detect)
- `angela_MODEL_PATH`: Path to models directory (default: `/app/models`)
- `angela_PORT`: HTTP server port (default: `8091`)
- `angela_LOG_LEVEL`: Log level (default: `info`)

### Volume Mounts

- `/app/models`: Mount your local models directory
- `/app/config`: Mount custom configuration files (optional)
- `/app/logs`: Mount for persistent logs (optional)

## API Endpoints

### Service Management

- `GET /health` - Health check
- `GET /status` - Service status
- `POST /start` - Start the service
- `POST /stop` - Stop the service
- `POST /restart` - Restart the service

### Model Management

- `GET /models` - List available models
- `POST /models/scan` - Scan for new models
- `GET /models/{id}` - Get model information

### Configuration

- `GET /config` - Get current configuration
- `POST /config` - Update configuration
- `POST /config/generate` - Generate new configuration

### GPU Information

- `GET /gpu` - Get GPU information and diagnostics

### Logs

- `GET /logs` - Get service logs

### OpenAI-Compatible Endpoints

- `GET /v1/models` - List models (OpenAI format)
- `POST /v1/completions` - Text completions
- `POST /v1/chat/completions` - Chat completions
- `POST /v1/embeddings` - Generate embeddings

## Client Integration

### Using the HTTP Client

```typescript
import { angelaCoreClient } from '../src/services/angelaCoreClient';

const client = new angelaCoreClient('http://localhost:8091');

// Start the service
await client.startService();

// Get status
const status = await client.getStatus();

// List models
const models = await client.getModels();

// Create chat completion
const response = await client.createChatCompletion({
  model: 'your-model',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Using the IPC Compatibility Layer

For gradual migration from IPC to HTTP:

```typescript
import { angelaCoreIPCAdapter } from '../src/services/angelaCoreClient';

// These work exactly like the old IPC calls
const status = await angelaCoreIPCAdapter.getLlamaSwapStatus();
const models = await angelaCoreIPCAdapter.getLlamaSwapModels();
await angelaCoreIPCAdapter.startLlamaSwap();
```

## Migrating from IPC

### Step 1: Start the Docker Service

Ensure the angela Core Docker service is running before starting your Electron app.

### Step 2: Update Electron Main Process

Replace IPC handlers with HTTP client calls:

```typescript
// Before (IPC)
ipcMain.handle('llamaSwap:getStatus', async () => {
  return llamaSwapService.getStatus();
});

// After (HTTP)
ipcMain.handle('llamaSwap:getStatus', async () => {
  return angelaCoreIPCAdapter.getLlamaSwapStatus();
});
```

### Step 3: Update Frontend Components

The frontend components don't need changes - they still use the same IPC calls through the renderer process.

### Step 4: Remove Old Service (Optional)

Once everything is working, you can remove the old `llamaSwapService.cjs` and related IPC handlers.

## GPU Support

### Requirements

- NVIDIA GPU with CUDA support
- Docker with GPU support (`nvidia-docker2`)
- NVIDIA Container Toolkit

### Verification

```bash
# Check if GPU is detected
curl http://localhost:8091/gpu

# Expected response:
{
  "gpu": {
    "available": true,
    "vendor": "NVIDIA",
    "memory": "8GB",
    "compute": "8.6"
  }
}
```

### Troubleshooting GPU

1. **GPU not detected:**
   ```bash
   # Check NVIDIA Docker support
   docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu20.04 nvidia-smi
   ```

2. **Service falls back to CPU:**
   - Check container logs: `docker logs angela-core`
   - Verify GPU memory availability
   - Ensure model fits in GPU memory

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:8091/health
```

Expected responses:
- `{ "status": "healthy", "service": "running" }` - Service is ready
- `{ "status": "starting", "service": "initializing" }` - Service is starting
- `{ "status": "unhealthy", "error": "..." }` - Service has issues

### Docker Health Checks

The container includes built-in health checks:

```bash
# Check container health
docker ps
# HEALTH column shows: healthy, unhealthy, or starting
```

## Logging

### Container Logs

```bash
# View logs
docker logs angela-core

# Follow logs
docker logs -f angela-core

# Get last 100 lines
docker logs --tail 100 angela-core
```

### Log Levels

- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information

Set via environment variable:
```bash
docker run -e angela_LOG_LEVEL=debug angela-core:latest
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Change port
   docker run -p 8092:8091 angela-core:latest
   ```

2. **Models not found:**
   ```bash
   # Check volume mount
   docker run -v /path/to/your/models:/app/models angela-core:latest
   ```

3. **Permission errors:**
   ```bash
   # Fix permissions
   sudo chown -R $USER:$USER /path/to/models
   ```

4. **Service not starting:**
   ```bash
   # Check logs
   docker logs angela-core
   
   # Check health
   curl http://localhost:8091/health
   ```

### Debug Mode

Run with debug logging:

```bash
docker run -e angela_LOG_LEVEL=debug angela-core:latest
```

### Manual Testing

```bash
# Test all endpoints
curl http://localhost:8091/health
curl http://localhost:8091/status
curl http://localhost:8091/models
curl http://localhost:8091/gpu
curl http://localhost:8091/v1/models
```

## Performance Optimization

### GPU Memory Management

The service automatically manages GPU memory:
- Loads models on-demand
- Unloads unused models
- Falls back to CPU if GPU memory is full

### CPU Performance

For CPU-only deployments:
- Increase container CPU limits
- Use models optimized for CPU inference
- Consider using quantized models

### Container Resources

```yaml
# docker-compose.yml
services:
  angela-core:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G
```

## Security Considerations

### Network Security

- The service runs on localhost by default
- For remote access, use proper authentication
- Consider using reverse proxy with SSL

### File System Security

- Models directory should have appropriate permissions
- Container runs as non-root user
- Use read-only volumes when possible

### API Security

The current implementation doesn't include authentication. For production use:

1. Add API key authentication
2. Use HTTPS/TLS encryption
3. Implement rate limiting
4. Add request validation

## Development

### Building Custom Images

```bash
# Build with custom tag
docker build -t angela-core:custom .

# Build for specific platform
docker buildx build --platform linux/amd64,linux/arm64 -t angela-core:multi .
```

### Development Mode

```bash
# Mount source code for development
docker run -v $(pwd):/app/src angela-core:latest
```

### Testing

```bash
# Run tests in container
docker run --rm angela-core:latest npm test

# Run specific test
docker run --rm angela-core:latest npm run test:gpu
```

This completes the angela Core containerization setup. The service is now ready to replace the Electron-based IPC communication with HTTP API calls while maintaining all the original functionality including GPU support, model management, and health monitoring.
