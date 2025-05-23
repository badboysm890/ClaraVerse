#!/bin/bash

# llama-swap run script
# Usage: ./run.sh [start|stop|status|restart|logs]

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin*)    
        LLAMA_SWAP_BIN="./llama-swap-darwin-arm64"
        CONFIG_FILE="./config.yaml"
        ;;
    Linux*)     
        LLAMA_SWAP_BIN="./llama-swap-linux-amd64"
        CONFIG_FILE="./config.yaml"
        ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
        LLAMA_SWAP_BIN="./llama-swap-windows-amd64.exe"
        CONFIG_FILE="./config-windows.yaml"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Configuration
PORT="8091"
LOG_FILE="llama-swap.log"

# Check if the binary exists
if [ ! -f "$LLAMA_SWAP_BIN" ]; then
    echo "Error: $LLAMA_SWAP_BIN not found!"
    exit 1
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found!"
    if [ "$CONFIG_FILE" = "./config-windows.yaml" ]; then
        echo "Creating default Windows config file..."
        cat > "$CONFIG_FILE" << EOL
# llama-swap Windows configuration
models:
  - name: llama3
    path: C:\\path\\to\\models\\llama-3-8b.gguf
    max_tokens: 2048
    context_size: 4096
    visible_to_users: true
    stop_words: []
    
  - name: llama3-instruct
    path: C:\\path\\to\\models\\llama-3-8b-instruct.gguf
    max_tokens: 2048
    context_size: 4096
    visible_to_users: true
    stop_words: []

# Windows-specific logging configuration
log_level: info
cache_dir: C:\\Users\\username\\AppData\\Local\\llama-swap\\cache
EOL
        echo "Default $CONFIG_FILE created. Please edit with your actual model paths."
    else
        echo "Please create a configuration file at $CONFIG_FILE"
        exit 1
    fi
fi

# Ensure executable permissions (not needed for Windows)
if [ "$OS" != "MINGW"* ] && [ "$OS" != "MSYS"* ] && [ "$OS" != "CYGWIN"* ] && [ "$OS" != "Windows_NT" ]; then
    chmod +x "$LLAMA_SWAP_BIN"
fi

# Get the PID of running llama-swap process
get_pid() {
    if [ "$OS" = "MINGW"* ] || [ "$OS" = "MSYS"* ] || [ "$OS" = "CYGWIN"* ] || [ "$OS" = "Windows_NT" ]; then
        # Windows method (requires PowerShell)
        TASK_INFO=$(powershell -Command "Get-Process | Where-Object {\\$_.Path -like '*llama-swap-windows*'} | Select-Object -ExpandProperty Id" 2>/dev/null)
        echo "$TASK_INFO"
    else
        # Unix/Linux/macOS method
        pgrep -f "$LLAMA_SWAP_BIN"
    fi
}

# Start the llama-swap service
start_service() {
    if [ -n "$(get_pid)" ]; then
        echo "llama-swap is already running!"
        return
    fi
    
    echo "Starting llama-swap service..."
    
    if [ "$OS" = "MINGW"* ] || [ "$OS" = "MSYS"* ] || [ "$OS" = "CYGWIN"* ] || [ "$OS" = "Windows_NT" ]; then
        # Windows method
        powershell -Command "Start-Process -FilePath \"$LLAMA_SWAP_BIN\" -ArgumentList \"--config $CONFIG_FILE --listen :$PORT\" -WindowStyle Hidden -RedirectStandardOutput $LOG_FILE -RedirectStandardError $LOG_FILE"
    else
        # Unix/Linux/macOS method
        nohup $LLAMA_SWAP_BIN --config $CONFIG_FILE --listen :$PORT > $LOG_FILE 2>&1 &
    fi
    
    # Wait a moment for the service to start
    sleep 3
    
    # Check if service started successfully
    if [ -n "$(get_pid)" ]; then
        echo "llama-swap service started successfully on port $PORT"
        echo "You can access the API at http://localhost:$PORT"
        echo "Check logs with './run.sh logs'"
    else
        echo "Failed to start llama-swap service. Check $LOG_FILE for details."
    fi
}

# Stop the llama-swap service
stop_service() {
    PID=$(get_pid)
    if [ -z "$PID" ]; then
        echo "llama-swap is not running!"
        return
    fi
    
    echo "Stopping llama-swap service..."
    
    if [ "$OS" = "MINGW"* ] || [ "$OS" = "MSYS"* ] || [ "$OS" = "CYGWIN"* ] || [ "$OS" = "Windows_NT" ]; then
        # Windows method
        powershell -Command "Stop-Process -Id $PID -Force"
    else
        # Unix/Linux/macOS method
        kill $PID
    fi
    
    # Wait for the process to terminate
    sleep 2
    
    if [ -z "$(get_pid)" ]; then
        echo "llama-swap service stopped successfully"
    else
        echo "Failed to stop llama-swap service."
        if [ "$OS" = "MINGW"* ] || [ "$OS" = "MSYS"* ] || [ "$OS" = "CYGWIN"* ] || [ "$OS" = "Windows_NT" ]; then
            echo "Try force killing with 'taskkill /F /PID $PID'"
        else
            echo "Try force killing with 'kill -9 $PID'"
        fi
    fi
}

# Check the status of the llama-swap service
check_status() {
    PID=$(get_pid)
    if [ -z "$PID" ]; then
        echo "llama-swap is not running"
        return
    fi
    
    echo "llama-swap is running with PID $PID"
    # Check if API is responding
    if curl -s "http://localhost:$PORT/v1/models" > /dev/null 2>&1; then
        echo "API is responding at http://localhost:$PORT"
        echo "Available models:"
        curl -s "http://localhost:$PORT/v1/models" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | while read -r model; do
            echo "  - $model"
        done
    else
        echo "Warning: llama-swap process is running but API is not responding"
        echo "Make sure curl is installed and accessible"
    fi
}

# View logs
view_logs() {
    if [ -f "$LOG_FILE" ]; then
        if [ "$OS" = "MINGW"* ] || [ "$OS" = "MSYS"* ] || [ "$OS" = "CYGWIN"* ] || [ "$OS" = "Windows_NT" ]; then
            # Windows method
            powershell -Command "Get-Content -Path $LOG_FILE -Wait"
        else
            # Unix/Linux/macOS method
            tail -f $LOG_FILE
        fi
    else
        echo "Log file not found: $LOG_FILE"
    fi
}

# Main command processing
case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        sleep 2
        start_service
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac

exit 0 