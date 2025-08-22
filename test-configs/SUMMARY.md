# Llama.cpp Configuration Testing Solution - Summary

## What We've Built

You now have a complete, isolated testing suite for finding the optimal llama.cpp configuration for your hardware. This solution systematically tests different parameter combinations and provides comprehensive performance reports.

## Files Created

### Core Scripts
1. **`llama_config_tester.py`** - Full comprehensive testing
   - Tests thousands of parameter combinations
   - Exhaustive analysis (may take hours to complete)
   - Best for thorough optimization

2. **`llama_config_tester_quick.py`** - Quick testing version
   - Tests ~72 parameter combinations
   - Fast results (typically 30-60 minutes)
   - Recommended for initial optimization

3. **`analyze_results.py`** - Results analyzer
   - Detailed analysis of CSV results
   - Performance insights and recommendations
   - Generates optimized llama-server commands

### Supporting Files
- **`requirements.txt`** - Python dependencies
- **`README.md`** - Comprehensive documentation
- **`SUMMARY.md`** - This summary file

## Key Features

### Automated Testing
- **Complete Isolation**: Runs in its own directory, won't interfere with your existing setup
- **Live CSV Updates**: Results are written in real-time as each test completes
- **Error Handling**: Gracefully handles failed configurations and continues testing
- **Safe Interruption**: Use Ctrl+C to stop - it cleans up properly

### Comprehensive Metrics
Each test records:
- **Performance**: Tokens per second, first token time, total time
- **Configuration**: All llama-server parameters used
- **Output**: Generated text and success status
- **Timestamps**: When each test was completed

### Parameter Coverage
The quick version tests these key parameters:
- **GPU Layers**: 0 (CPU only), 10 (partial), 1000 (full GPU)
- **Context Sizes**: 1024, 2048, 4096 tokens
- **Batch Sizes**: 256, 512, 1024
- **Thread Counts**: 6, 8
- **Memory Options**: With/without memory locking

## Usage Workflow

### 1. Quick Start (Recommended)
```bash
cd test-configs
python llama_config_tester_quick.py
```

### 2. Analyze Results
```bash
python analyze_results.py
```

### 3. Apply Optimal Configuration
The analyzer will provide you with the exact llama-server command to use.

## Sample Output

The scripts provide real-time feedback:
```
[15/72] GPU:10 CTX:2048 BATCH:512 THREADS:8
Test 15 ✓ - Tokens/sec: 32.45

[16/72] GPU:1000 CTX:1024 BATCH:256 THREADS:6
Test 16 ✓ - Tokens/sec: 28.91
```

And comprehensive analysis:
```
BEST PERFORMING CONFIGURATION:
  GPU Layers: 1000
  Context Size: 2048
  Batch Size: 512
  Threads: 8
  Tokens/sec: 45.23

RECOMMENDED LLAMA-SERVER COMMAND:
llama-server \
    -m YOUR_MODEL.gguf \
    --port 8080 \
    --jinja \
    --n-gpu-layers 1000 \
    --threads 8 \
    --ctx-size 2048 \
    --batch-size 512 \
    ...
```

## Benefits

### Performance Optimization
- **Find Your Sweet Spot**: Discover the optimal configuration for your specific hardware
- **Measurable Results**: Get exact tokens/sec measurements for each configuration
- **Hardware-Specific**: Results are tailored to your GPU, CPU, and memory setup

### Time Savings
- **Automated Testing**: No manual trial and error
- **Comprehensive Coverage**: Tests combinations you might never try manually
- **Quick Iteration**: Fast feedback loop for optimization

### Data-Driven Decisions
- **CSV Reports**: Complete data for further analysis
- **Trend Analysis**: See how different parameters affect performance
- **Reproducible Results**: Exact configurations that can be reused

## Integration with Your Existing Setup

This testing suite is completely isolated and won't affect your current angela setup:

- **Separate Directory**: All files are in `test-configs/`
- **Different Ports**: Uses port 8080 (your current setup uses 9999)
- **Independent Process**: Starts/stops its own llama-server instances
- **No Config Changes**: Doesn't modify your existing config.yaml

Once you find the optimal configuration, you can update your main config.yaml with the best parameters.

## Next Steps

1. **Run Quick Test**: Start with `llama_config_tester_quick.py`
2. **Analyze Results**: Use `analyze_results.py` to get recommendations
3. **Apply Settings**: Update your main configuration with optimal parameters
4. **Optional Full Test**: Run comprehensive testing if needed
5. **Monitor Performance**: Compare real-world performance with your optimized settings

## Customization

You can easily customize the testing parameters by modifying the `param_ranges` dictionary in either script to focus on specific configurations or add new parameters you want to test.

The solution is designed to be both powerful and user-friendly, giving you the data you need to maximize your llama.cpp performance! 
