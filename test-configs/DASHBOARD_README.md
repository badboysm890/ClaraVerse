# 🚀 Beautiful Performance Dashboard

A modern, real-time web dashboard for monitoring llama.cpp configuration testing performance. This replaces the old matplotlib-based monitor with a sleek, interactive web interface using Chart.js.

![Dashboard Preview](https://img.shields.io/badge/Status-Live%20Updates-brightgreen)
![Tech Stack](https://img.shields.io/badge/Tech-HTML%2BCSS%2BChart.js%2BFlask-blue)

## ✨ Features

### 🎨 Beautiful Modern Interface
- **Gradient backgrounds** with glassmorphism effects
- **Responsive design** that works on all screen sizes
- **Smooth animations** and interactive charts
- **Real-time status indicators** with pulsing animations

### 📊 Live Performance Monitoring
- **Performance over time** - Line chart showing tokens/sec progression
- **Speed vs Latency** - Scatter plot revealing optimal balance points
- **Thread impact analysis** - Bar chart showing thread count effects
- **Parameter correlations** - Horizontal bar chart of configuration impacts

### 📈 Real-Time Statistics
- **Total tests completed** with live counter
- **Best performance achieved** with highlight
- **Average performance** across all tests
- **Success rate percentage** for reliability tracking
- **Last update timestamp** for freshness indication

### 🏆 Best Configuration Tracking
- **Dynamic best config card** that appears when data is available
- **Visual config breakdown** showing optimal parameters
- **Performance highlight** with actual tokens/sec achieved

## 🚀 Quick Start

### Option 1: One-Command Start
```bash
./start_dashboard.sh
```

### Option 2: Manual Start
```bash
# Install dependencies
pip install -r requirements_dashboard.txt

# Start the server
python dashboard_server.py
```

### 3. Open Your Browser
Navigate to: **http://localhost:5000**

## 🔧 How It Works

### Backend (Python Flask)
- **Flask server** serves the dashboard and API endpoints
- **Real-time data monitoring** with file change detection
- **Efficient caching** to prevent excessive CSV reads
- **Thread-safe data access** for concurrent requests

### Frontend (HTML/CSS/JavaScript)
- **Chart.js charts** for beautiful, interactive visualizations
- **Vanilla JavaScript** for real-time updates (no heavy frameworks)
- **Modern CSS** with gradients, blur effects, and animations
- **Responsive grid layout** that adapts to screen size

### Data Flow
```
CSV File → Flask Server → REST API → Dashboard → Live Charts
    ↑            ↑           ↑          ↑           ↑
  Tests     File Monitor   JSON    JavaScript   Chart.js
```

## 📊 Chart Types

### 1. Performance Over Time
- **Type**: Line chart with area fill
- **Shows**: Tokens/sec progression across tests
- **Features**: Smooth curves, gradient fill, responsive

### 2. Speed vs Latency
- **Type**: Scatter plot
- **Shows**: First token time vs tokens/sec relationship
- **Features**: Color-coded points, trend identification

### 3. Thread Performance Impact
- **Type**: Bar chart with gradients
- **Shows**: Average performance by thread count
- **Features**: Value labels, error bars (when applicable)

### 4. Parameter Correlations
- **Type**: Horizontal bar chart
- **Shows**: Which parameters most affect performance
- **Features**: Color-coded positive/negative correlations

## 🛠 API Endpoints

### Main Endpoints
- `GET /` - Dashboard home page
- `GET /api/data` - Get current test data (JSON)
- `GET /api/status` - Server status information
- `GET /api/health` - Health check endpoint

### Example API Response
```json
{
  "tests": [
    {
      "threads": 8,
      "ctx_size": 4096,
      "parallel": 4,
      "batch_size": 512,
      "tokens_per_sec": 45.67,
      "success": true
    }
  ],
  "last_update": "2024-01-15T10:30:45",
  "total_tests": 25,
  "successful_tests": 23
}
```

## 🎯 Usage Scenarios

### Scenario 1: Live Monitoring During Tests
1. Start your configuration tests with `./llama_config_tester_quick.py`
2. In another terminal: `./start_dashboard.sh`
3. Open browser to `http://localhost:5000`
4. Watch real-time performance as tests complete

### Scenario 2: Post-Test Analysis
1. After tests complete, start dashboard: `./start_dashboard.sh`
2. Review all charts and statistics
3. Identify best configurations from the "Best Config" card
4. Analyze correlations to understand parameter impacts

### Scenario 3: Long-Running Test Monitoring
1. Start dashboard before beginning extensive tests
2. Keep browser tab open to monitor progress
3. Dashboard updates every 2 seconds automatically
4. No need to refresh - everything updates live

## 🎨 Customization

### Color Scheme
The dashboard uses a modern purple-blue gradient theme:
- **Primary**: `#667eea` (soft blue)
- **Secondary**: `#764ba2` (purple)
- **Success**: `#10b981` (green)
- **Error**: `#ef4444` (red)

### Chart Customization
All charts can be customized by modifying the Chart.js configurations in `dashboard.html`:
- Colors, gradients, and animations
- Chart types and data visualization
- Responsive breakpoints
- Update intervals

## 🔧 Technical Details

### Dependencies
- **Flask**: Web framework for Python backend
- **Pandas**: CSV data processing
- **Chart.js**: Modern charting library
- **CSS Grid & Flexbox**: Responsive layouts

### Performance Optimizations
- **File change detection** - Only reads CSV when modified
- **Data caching** - Prevents redundant file operations
- **Efficient updates** - Charts update with minimal redraw
- **Background monitoring** - Non-blocking file watching

### Browser Compatibility
- **Chrome/Edge**: Full support with all animations
- **Firefox**: Full support
- **Safari**: Full support (some blur effects may vary)
- **Mobile browsers**: Responsive design works on all devices

## 🆚 vs Old Matplotlib Monitor

| Feature | Old Monitor | New Dashboard |
|---------|-------------|---------------|
| **Interface** | Basic matplotlib window | Modern web interface |
| **Responsiveness** | Fixed window size | Fully responsive |
| **Interactivity** | Limited | Interactive charts |
| **Aesthetics** | Basic plots | Beautiful gradients & animations |
| **Accessibility** | Desktop only | Works on any device |
| **Performance** | Heavy GUI | Lightweight web |
| **Customization** | Code changes required | Easy CSS/JS modifications |

## 🚨 Troubleshooting

### Dashboard won't start
```bash
# Check if dashboard.html exists
ls -la dashboard.html

# Install dependencies
pip install -r requirements_dashboard.txt
```

### No data showing
```bash
# Check if CSV file exists
ls -la config_test_results_quick.csv

# Check server logs for errors
# Look for error messages in terminal
```

### Port already in use
```python
# Edit dashboard_server.py line ~140
app.run(port=5001)  # Change from 5000 to 5001
```

### Charts not updating
- Check browser console for JavaScript errors
- Verify CSV file is being updated by tests
- Refresh browser page

## 📱 Mobile Support

The dashboard is fully responsive and works beautifully on mobile devices:
- **Tablet**: Side-by-side chart layout
- **Phone**: Stacked single-column layout
- **Touch**: All interactive elements are touch-friendly

## 🎯 Future Enhancements

Potential improvements for future versions:
- **Dark/Light theme toggle**
- **Export charts as images**
- **Historical data comparison**
- **Alert notifications for performance thresholds**
- **Multi-model testing support**
- **Configuration recommendation engine**

---

## 💡 Pro Tips

1. **Keep it running**: Start the dashboard before your tests for full data capture
2. **Multiple windows**: Open multiple browser tabs to different chart focuses
3. **Mobile monitoring**: Check progress on your phone while tests run
4. **Screenshot results**: Capture the best config card for documentation
5. **API integration**: Use the `/api/data` endpoint for custom analysis tools

Enjoy your beautiful, real-time performance monitoring! 🚀✨ 
