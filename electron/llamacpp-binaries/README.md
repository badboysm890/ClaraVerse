# llama-swap-proxy Usage Guide

This guide explains how to use the llama-swap service with the provided scripts.

## Platform Support

llama-swap-proxy supports multiple platforms:

- **macOS**: Uses the darwin-arm64 binary
- **Linux**: Uses the linux-amd64 binary
- **Windows**: Uses the windows-amd64.exe binary

The run script automatically detects your operating system and uses the appropriate binary and configuration.

## Setup

The configuration for llama-swap is defined in:
- **macOS/Linux**: `config.yaml`
- **Windows**: `config-windows.yaml`

Three models are currently configured:

1. **llama3:1b** - Llama 3.2 1B Instruct model
2. **tinyllama:1.1b** - TinyLlama 1.1B Chat model
3. **qwen3:0.6b** - Qwen3 0.6B model
4. **qwen-vl:7b** - Qwen2.5 VL 7B Multimodal model
5. **gemma3:4b** - Gemma 3.4B Multimodal model

Additionally, **gpt-3.5-turbo** is configured as an alias for the llama3 model.

## Running the Service

The `run.sh` script provides an easy way to manage the llama-swap service.

### Commands

```bash
# Start the service
./run.sh start

# Stop the service
./run.sh stop

# Restart the service
./run.sh restart

# Check the service status and available models
./run.sh status

# View the service logs
./run.sh logs
```

### Windows-Specific Notes

When running on Windows:
- A default `config-windows.yaml` will be created if it doesn't exist
- Model paths use Windows path format with double backslashes (`C:\\path\\to\\models\\`)
- PowerShell is used for process management and log viewing

### Service Details

- The service runs on port 8091 by default
- API endpoint: http://localhost:8091
- Logs are stored in llama-swap.log


## API Examples

### Listing Models

```bash
curl http://localhost:8091/v1/models
```

### Chat Completion

```bash
curl -s http://localhost:8091/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer no-key" \
    -d '{"model":"llama3","messages": [{"role": "user","content": "Tell me a joke"}]}'
```

### Using Model Aliases

You can use the alias "gpt-3.5-turbo" which points to the llama3 model:

```bash
curl -s http://localhost:8091/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer no-key" \
    -d '{"model":"gpt-3.5-turbo","messages": [{"role": "user","content": "Hello, how are you?"}]}'
```

## Customization

To modify the configuration:

1. Edit the appropriate config file for your platform:
   - macOS/Linux: `config.yaml`
   - Windows: `config-windows.yaml`
2. Add new models to the `models` section and if its a multimodal model, add the `mmproj` path to the `mmproj` section
3. Restart the service with `./run.sh restart`

You can add new models, change model paths, or update the configuration parameters as needed. 

### Windows Configuration Example

For Windows, use path format with double backslashes:

```yaml
models:
  - name: llama3
    path: C:\\path\\to\\models\\llama-3-8b.gguf
    max_tokens: 2048
    context_size: 4096
    visible_to_users: true
``` 