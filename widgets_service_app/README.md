# angelaVerse Widget Service

A Go-based microservice that provides real-time system monitoring data for angelaVerse widgets, including GPU usage, CPU stats, memory usage, and more.

## Features

- **GPU Monitoring**: Real-time GPU usage, memory, temperature, and power draw (NVIDIA & AMD support)
- **CPU & Memory Stats**: System performance monitoring
- **Network & Disk I/O**: Track resource usage
- **Process Monitoring**: Monitor AI/ML related processes
- **WebSocket API**: Real-time data streaming
- **REST API**: Traditional HTTP endpoints
- **Cross-Platform**: Windows, Linux, macOS support

## Prerequisites

- Go 1.21 or higher
- For GPU monitoring:
  - **NVIDIA**: `nvidia-smi` command available in PATH
  - **AMD**: `rocm-smi` command available in PATH (optional)

## Building

### Windows
```bash
.\build.bat
```

### Linux/macOS
```bash
chmod +x build.sh
./build.sh
```

### Manual Build
```bash
# Install dependencies
go mod download

# Build for current platform
go build -ldflags="-s -w" -o widgets-service-windows.exe main.go enhanced_pdf_processor.go

# Or build for specific platform and both files
GOOS=windows GOARCH=amd64 go build -o widgets-service-windows.exe main.go enhanced_pdf_processor.go
GOOS=linux GOARCH=amd64 go build  -o widgets-service-linux main.go enhanced_pdf_processor.go
GOOS=darwin GOARCH=amd64 go build -o widgets-service-macos main.go enhanced_pdf_processor.go
```

## Running

### Direct Execution
```bash
# Default port (8765)
./widgets-service

# Custom port
./widgets-service 8766
```

### API Endpoints

#### REST API
- `GET /api/health` - Service health check
- `GET /api/stats` - Complete system statistics
- `GET /api/stats/cpu` - CPU statistics only
- `GET /api/stats/memory` - Memory statistics only
- `GET /api/stats/gpu` - GPU statistics only
- `GET /api/stats/disk` - Disk usage statistics
- `GET /api/stats/network` - Network I/O statistics
- `GET /api/stats/processes` - Process statistics


#### WebSocket
- `WS /ws/stats` - Real-time system statistics stream

### Integration with angelaVerse

The service is automatically managed by angelaVerse:

1. **Auto-Start**: Service starts when widgets requiring it are added
2. **Auto-Stop**: Service stops when no monitoring widgets are active
3. **Resource Efficient**: Only runs when needed

#### Supported Widgets
- `gpu-monitor` - GPU usage monitoring
- `system-monitor` - Complete system monitoring
- `process-monitor` - Process monitoring

## API Response Format

### System Stats Response
```json
{
  "cpu": {
    "usage": 45.2,
    "cores": 8,
    "frequency": 3200.5,
    "temperature": 65.0
  },
  "memory": {
    "total": 17179869184,
    "available": 8589934592,
    "used": 8589934592,
    "usedPercent": 50.0,
    "swap": {
      "total": 4294967296,
      "used": 1073741824,
      "usedPercent": 25.0
    }
  },
  "gpu": [
    {
      "name": "NVIDIA GeForce RTX 4090",
      "usage": 85.5,
      "memory": {
        "total": 25769803776,
        "used": 12884901888,
        "free": 12884901888,
        "usedPercent": 50.0
      },
      "temperature": 72.0,
      "fanSpeed": 65,
      "powerDraw": 350.5,
      "clockCore": 1920,
      "clockMemory": 9751
    }
  ],
  "disk": [
    {
      "device": "C:",
      "mountpoint": "C:\\",
      "fstype": "NTFS",
      "total": 1073741824000,
      "free": 536870912000,
      "used": 536870912000,
      "usedPercent": 50.0
    }
  ],
  "network": {
    "bytesSent": 1048576,
    "bytesRecv": 2097152,
    "packetsSent": 1024,
    "packetsRecv": 2048
  },
  "processes": [
    {
      "pid": 1234,
      "name": "python.exe",
      "cpu": 25.5,
      "memory": 15.2,
      "status": "R"
    }
  ],
  "uptime": 86400,
  "timestamp": "2025-07-31T12:00:00Z"
}
```

## Troubleshooting

### Service Won't Start
1. Check if port 8765 is available
2. Ensure executable has proper permissions
3. Check logs for error messages

### GPU Detection Issues
- **NVIDIA**: Ensure `nvidia-smi` is installed and in PATH
- **AMD**: Install ROCm tools for `rocm-smi` support
- **Integrated**: Some integrated GPUs may not be fully supported

### Permission Issues (Linux/macOS)
```bash
chmod +x widgets-service-linux  # or widgets-service-macos
```

### Port Conflicts
```bash
# Use different port
./widgets-service 8766
```

## Development

### Adding New Metrics
1. Add new struct fields to the appropriate `Stats` struct
2. Implement collection logic in the corresponding `collect*Stats()` function
3. Update API documentation

### Testing
```bash
# Install dependencies
go mod download

# Run tests (when available)
go test ./...

# Test REST API
curl http://localhost:8765/api/health
curl http://localhost:8765/api/stats/gpu

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c ws://localhost:8765/ws/stats
```

## Performance

- **Low CPU Usage**: Typically <1% CPU usage
- **Minimal Memory**: ~10-20MB RAM usage
- **Efficient Polling**: 2-second intervals for real-time updates
- **Smart Shutdown**: Auto-stops when not needed

## Security

- **Local Only**: Service binds to localhost by default
- **No Authentication**: Designed for local development use
- **CORS Enabled**: Allows frontend connections

For production deployments, consider adding:
- Authentication middleware
- Rate limiting
- HTTPS/WSS support
- Network access controls

## License

Part of the angelaVerse project.
