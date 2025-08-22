# Llama.cpp Configuration Performance Tester

This toolset automatically tests different llama-server configurations to find the optimal settings for your hardware and model.

## Features

- **Comprehensive Testing**: Tests all parameter combinations including GPU layers, context size, batch size, threads, etc.
- **Live CSV Updates**: Results are written to CSV in real-time as each test completes
- **Performance Metrics**: Captures first token time, total tokens per second, total time, and more
- **Error Handling**: Gracefully handles failed configurations and continues testing
- **Two Versions Available**:
  - `llama_config_tester.py`: Full comprehensive testing (thousands of combinations)
  - `llama_config_tester_quick.py`: Quick testing with reduced parameter set

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Optional for analysis:**
   ```bash
   pip install pandas
   ```

## Usage

### Quick Start (Recommended)

For faster testing with a smaller parameter set:

```bash
cd test-configs
python llama_config_tester_quick.py
```

### Comprehensive Testing

For exhaustive testing of all parameter combinations (may take hours):

```bash
cd test-configs
python llama_config_tester.py
```

## Configuration

Before running, verify the paths in the scripts match your setup:

```python
model_path = "/Users/badfy17g/.angela/llama-models/Qwen3-30B-A3B-Q4_K_M.gguf"
llama_server_path = "/Users/badfy17g/angelaVerse/electron/llamacpp-binaries/darwin-arm64/llama-server"
```

The scripts automatically check for alternative model paths from your config.yaml.

## Parameters Tested

### Quick Version Tests:
- **GPU Layers**: 0, 10, 1000 (CPU only, partial GPU, full GPU)
- **Context Size**: 1024, 2048, 4096
- **Batch Size**: 256, 512, 1024
- **Micro Batch Size**: 64, 128
- **Threads**: 6, 8
- **Parallel**: 1, 4
- **Keep**: 512, 1024
- **Memory Lock**: True, False

### Full Version Tests:
- **GPU Layers**: 0, 5, 10, 20, 50, 1000
- **Context Size**: 512, 1024, 2048, 4096, 8192
- **Batch Size**: 128, 256, 512, 1024, 2048
- **Micro Batch Size**: 32, 64, 128, 256
- **Threads**: 4, 6, 8, 12, 16
- **Parallel**: 1, 2, 4, 8
- **Keep**: 256, 512, 1024, 2048
- **Defrag Threshold**: 0.1, 0.2, 0.5
- **Memory Lock**: True, False

## Output

### CSV Columns

The generated CSV files contain the following columns:

- `timestamp`: When the test was run
- `test_id`: Sequential test number
- `n_gpu_layers`: Number of layers offloaded to GPU
- `ctx_size`: Context size
- `batch_size`: Batch size
- `ubatch_size`: Micro batch size
- `threads`: Number of threads
- `parallel`: Parallel processing level
- `keep`: Keep parameter
- `defrag_thold`: Defragmentation threshold
- `mlock`: Memory locking enabled
- `input_prompt`: Test prompt used
- `output_text`: Generated text (truncated)
- `first_token_time_ms`: Time to first token in milliseconds
- `total_tokens`: Total tokens generated
- `total_time_sec`: Total generation time in seconds
- `tokens_per_sec`: Tokens per second (key performance metric)
- `success`: Whether the test succeeded
- `error_message`: Error details if test failed

### Analysis

The quick version includes automatic analysis showing:
- Best performing configuration
- Average performance by GPU layer count
- Success rates

## Example Output

```
Starting quick configuration testing...
Total configurations to test: 72
Results will be saved to: config_test_results_quick.csv
------------------------------------------------------------

[1/72] GPU:0 CTX:1024 BATCH:256 THREADS:6
Test 1 ✓ - Tokens/sec: 15.42

[2/72] GPU:0 CTX:1024 BATCH:256 THREADS:8
Test 2 ✓ - Tokens/sec: 18.76

...

============================================================
QUICK ANALYSIS
============================================================
Best performing configuration:
  GPU Layers: 1000
  Context Size: 2048
  Batch Size: 512
  Threads: 8
  Tokens/sec: 45.23

Average tokens/sec by GPU layers:
  0 layers: 12.34 tokens/sec
  10 layers: 28.91 tokens/sec
  1000 layers: 42.15 tokens/sec
```

## Tips

1. **Start with Quick Version**: Use the quick version first to get an overview
2. **Monitor Resources**: Keep an eye on system resources during testing
3. **Interrupt Safely**: Use Ctrl+C to stop testing - it will clean up properly
4. **Custom Parameters**: Modify the parameter ranges in the scripts for your specific needs
5. **Multiple Models**: Run tests on different models to compare
6. **Hardware Optimization**: Results help optimize for your specific GPU/CPU setup

## Troubleshooting

### Common Issues

1. **Server won't start**: Check if model path and llama-server binary exist
2. **Port conflicts**: Ensure port 8081 is available
3. **Memory issues**: Reduce batch sizes or context sizes for low-memory systems
4. **GPU errors**: Try reducing n_gpu_layers if getting GPU-related errors

### Error Messages

- "Failed to start server": Usually path or model file issues
- HTTP errors: Network/server communication problems
- Timeout errors: Configuration too demanding for hardware

## Customization

You can modify the parameter ranges in the `get_parameter_combinations()` method to focus on specific configurations or add new parameters.

## Output Files

- `config_test_results.csv`: Full version results
- `config_test_results_quick.csv`: Quick version results

Both files are updated in real-time as tests complete, so you can monitor progress.

## Integration with Your Existing Setup

This testing suite is completely isolated and won't affect your current angela setup:

- **Separate Directory**: All files are in `test-configs/`
- **Different Ports**: Uses port 8081 (your current setup uses 9999)
- **Independent Process**: Starts/stops its own llama-server instances
- **No Config Changes**: Doesn't modify your existing config.yaml 
