# 🧠 Smart Configuration Tester

**Get optimal llama.cpp configurations in 5-10 minutes instead of hours!**

## 🎯 What It Does

Instead of testing 800+ configurations (which takes hours), the Smart Tester:

1. **Strategic Sampling** (5-10 minutes): Tests only ~30 carefully chosen configurations
2. **ML Prediction** (instant): Uses machine learning to predict performance of hundreds of other configurations  
3. **Results**: Shows you the top predicted configurations without testing them all

## 🚀 Quick Start

### 1. Install Dependencies
```bash
./install_ml_deps.sh
```

### 2. Run Smart Testing
```bash
python smart_config_tester.py --sample-size 30
```

### 3. View Results
- Check terminal output for best configurations
- Open dashboard: http://localhost:5002
- Results saved to: `smart_config_results.csv`

## ⚙️ Options

```bash
# Test fewer configurations (faster, less accurate)
python smart_config_tester.py --sample-size 20

# Test more configurations (slower, more accurate) 
python smart_config_tester.py --sample-size 50
```

## 📊 How It Works

### Phase 1: Strategic Sampling
- Tests **corner cases** (high-performance, CPU-only, low-resource, large-context)
- Tests **random samples** across the parameter space
- Measures actual performance for each configuration

### Phase 2: ML Prediction  
- Trains **Random Forest models** on the measured data
- Predicts performance for **all possible configurations**
- Ranks configurations by predicted performance

## 🎯 Sample Output

```
🏆 Top Predicted Configurations:
#1 Predicted Performance:
  🎯 First Token: 145.2ms
  📊 Throughput: 28.4 tokens/sec
  ⚙️  Config: threads=8, ctx=4096, batch=1024, gpu=1000

#2 Predicted Performance:
  🎯 First Token: 152.1ms  
  📊 Throughput: 27.8 tokens/sec
  ⚙️  Config: threads=6, ctx=2048, batch=512, gpu=1000
```

## 📈 Dashboard Integration

The smart tester integrates with the existing dashboard:
- **Measured results** are marked as "measured" 
- **Predicted results** are marked as "predicted"
- **Hover tooltips** show full configuration details
- **Real-time updates** as tests run

## 🔧 Configuration

Edit paths in `smart_config_tester.py`:
```python
model_path = "/path/to/your/model.gguf"
llama_server_path = "/path/to/llama-server" 
```

## 🧪 Compared to Other Testers

| Tester | Configurations | Time | Accuracy |
|--------|---------------|------|----------|
| Full Tester | 800+ | 6+ hours | 100% |
| Quick Tester | 864 | 7+ hours | 100% |
| **Smart Tester** | **30 + predictions** | **5-10 minutes** | **~85%** |

## 🎉 Benefits

- ⏱️ **90% time savings** - minutes instead of hours
- 🎯 **Smart sampling** - tests the most informative configurations
- 🔮 **Predictive power** - estimates performance without testing
- 📊 **Same dashboard** - integrates with existing visualization
- 🧠 **Gets smarter** - more data = better predictions

## 🔍 When to Use

- **Quick optimization** - Find good configs fast
- **Exploration** - Understand parameter relationships  
- **Resource limited** - Don't have hours for full testing
- **Iterative tuning** - Test, predict, refine

For ultimate accuracy, use the full tester. For speed and efficiency, use the smart tester! 
