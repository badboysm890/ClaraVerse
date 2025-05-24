# Llama-swap Integration

## Overview

Clara now includes an integrated llama-swap service that provides a single OpenAI-compatible API endpoint for managing multiple local LLM models. This replaces the previous Ollama dependency and provides better control over model loading and resource management.

## What is llama-swap?

llama-swap is a lightweight proxy server that automatically switches between different llama.cpp models based on the model requested in the API call. It provides:

- ✅ OpenAI-compatible API endpoints (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`)
- ✅ Automatic model swapping based on request
- ✅ Configurable model timeout (TTL)
- ✅ Single port operation (8091 by default)
- ✅ Dynamic configuration based on available models

## Features

### Automatic Model Discovery
The service automatically scans for `.gguf` model files in:
- `~/.clara/llama-models/` (user models)
- `electron/llamacpp-binaries/models/` (bundled models)

### Dynamic Configuration
When the service starts, it generates a configuration file based on available models. Each model gets:
- A descriptive name based on the filename
- OpenAI-compatible aliases (e.g., `gpt-3.5-turbo`, `gpt-4`)
- Automatic timeout settings
- Resource management through model swapping

### Web Interface
Access the llama-swap management interface through:
1. Navigate to the "Servers" page in Clara
2. Click the "LLM Service" button
3. Manage the service status and view available models

## Usage

### Starting the Service
The llama-swap service starts automatically when Clara launches. You can also manually control it:

- **Start**: Click the "Start" button in the LLM Service interface
- **Stop**: Click the "Stop" button  
- **Restart**: Click the "Restart" button
- **Regenerate Config**: Click "Regenerate Config" to rescan for new models

### API Access
Once running, the service is available at `http://localhost:8091` with OpenAI-compatible endpoints:

```javascript
// Example usage
const response = await fetch('http://localhost:8091/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer no-key-needed'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo', // This will map to an available local model
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ]
  })
});
```

### Adding New Models
1. Place `.gguf` model files in `~/.clara/llama-models/`
2. Click "Regenerate Config" in the LLM Service interface
3. Restart the service to load the new configuration

## Model Naming Convention

Models are automatically named based on their filenames:
- `llama-3.2-1b-instruct-q4_k_m.gguf` → `llama3.2:1b-instruct`
- `tinyllama-1.1b-chat-v1.0.Q4_K_S.gguf` → `tinyllama1.1:b-chat`

## OpenAI Aliases

Common models automatically get OpenAI-compatible aliases:
- Small models (1B parameters) → `gpt-3.5-turbo`
- Larger models (4B+ parameters) → `gpt-4`
- Instruct/Chat models → `text-davinci-003`

## Troubleshooting

### Service Won't Start
1. Check if the llama-swap binary exists in `electron/llamacpp-binaries/`
2. Ensure models are present in the models directories
3. Check the logs in the developer console

### No Models Available
1. Add `.gguf` model files to `~/.clara/llama-models/`
2. Click "Regenerate Config"
3. Restart the service

### API Not Responding
1. Verify the service is running (green status indicator)
2. Check the port (default: 8091)
3. Ensure no firewall is blocking the port

## Model Management

### Recommended Models
For optimal performance, consider these model sizes:
- **Small/Fast**: 1B-3B parameters (e.g., TinyLlama, Qwen-1.8B)
- **Balanced**: 7B-13B parameters (e.g., Llama-3-8B, Mistral-7B)
- **Large/Slow**: 30B+ parameters (for high-quality responses)

### Model Sources
Download models from:
- [Hugging Face](https://huggingface.co/models?filter=gguf)
- [TheBloke's GGUF models](https://huggingface.co/TheBloke)
- [Ollama model library](https://ollama.ai/library) (convert to GGUF)

## Configuration

The service automatically generates `config.yaml` with:
```yaml
healthCheckTimeout: 30
logLevel: info
models:
  "model-name":
    proxy: "http://127.0.0.1:9999"
    cmd: |
      "/path/to/llama-server"
      -m "/path/to/model.gguf"
      --port 9999
    ttl: 300
    aliases:
      - "gpt-3.5-turbo"
groups:
  "default_group":
    swap: true
    exclusive: true
    members:
      - "model-name"
```

## Benefits over Ollama

1. **Single API Point**: One endpoint for all models
2. **Better Resource Management**: Automatic model swapping reduces memory usage
3. **OpenAI Compatibility**: Direct replacement for OpenAI API calls
4. **Local Control**: Full control over model loading and configuration
5. **No External Dependencies**: Everything runs locally within Clara 