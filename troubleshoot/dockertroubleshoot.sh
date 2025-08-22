#!/bin/bash

# angela Docker Troubleshooting & Fix Script for macOS
# This script diagnoses and fixes common Docker detection issues for angela

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

# Check if running on macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        print_error "This script is designed for macOS only."
        exit 1
    fi
    print_success "Running on macOS"
}

# Check Docker installation
check_docker_installation() {
    print_header "CHECKING DOCKER INSTALLATION"
    
    # Check for Docker Desktop
    if [[ -d "/Applications/Docker.app" ]]; then
        print_success "Docker Desktop found at /Applications/Docker.app"
        
        # Get Docker Desktop version
        if [[ -f "/Applications/Docker.app/Contents/Info.plist" ]]; then
            VERSION=$(defaults read /Applications/Docker.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo "Unknown")
            print_status "Docker Desktop version: $VERSION"
        fi
    else
        print_error "Docker Desktop not found in /Applications/"
        print_status "Installing Docker Desktop..."
        
        # Detect architecture
        ARCH=$(uname -m)
        if [[ "$ARCH" == "arm64" ]]; then
            DOCKER_URL="https://desktop.docker.com/mac/main/arm64/Docker.dmg"
        else
            DOCKER_URL="https://desktop.docker.com/mac/main/amd64/Docker.dmg"
        fi
        
        print_status "Download Docker Desktop from: $DOCKER_URL"
        print_warning "Please download and install Docker Desktop manually, then run this script again."
        exit 1
    fi
    
    # Check if Docker CLI is available
    if command -v docker >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version 2>/dev/null || echo "Unknown")
        print_success "Docker CLI available: $DOCKER_VERSION"
    else
        print_warning "Docker CLI not found in PATH"
        print_status "Adding Docker CLI to PATH..."
        
        # Check common Docker CLI locations
        DOCKER_PATHS=(
            "/usr/local/bin/docker"
            "/Applications/Docker.app/Contents/Resources/bin/docker"
        )
        
        for path in "${DOCKER_PATHS[@]}"; do
            if [[ -f "$path" ]]; then
                print_success "Found Docker CLI at: $path"
                export PATH="$(dirname $path):$PATH"
                break
            fi
        done
    fi
}

# Check Docker Desktop process
check_docker_process() {
    print_header "CHECKING DOCKER DESKTOP STATUS"
    
    # Check if Docker Desktop is running
    if pgrep -f "Docker Desktop" >/dev/null 2>&1; then
        print_success "Docker Desktop process is running"
    else
        print_warning "Docker Desktop process not found"
        print_status "Starting Docker Desktop..."
        
        open /Applications/Docker.app
        print_status "Waiting for Docker Desktop to start..."
        
        # Wait up to 60 seconds for Docker Desktop to start
        for i in {1..60}; do
            if pgrep -f "Docker Desktop" >/dev/null 2>&1; then
                print_success "Docker Desktop started successfully"
                break
            fi
            
            if [[ $i -eq 60 ]]; then
                print_error "Docker Desktop failed to start within 60 seconds"
                exit 1
            fi
            
            sleep 1
            echo -n "."
        done
        echo
    fi
    
    # Check Docker daemon specifically
    if pgrep -f "com.docker.hyperkit\|com.docker.virtualization" >/dev/null 2>&1; then
        print_success "Docker daemon is running"
    else
        print_warning "Docker daemon not detected, waiting for full startup..."
        sleep 10
    fi
}

# Check Docker socket locations
check_docker_sockets() {
    print_header "CHECKING DOCKER SOCKET LOCATIONS"
    
    # angela's socket search order (from dockerSetup.cjs)
    SOCKET_PATHS=(
        "$HOME/.docker/desktop/docker.sock"
        "$HOME/.docker/docker.sock"
        "/var/run/docker.sock"
        "/run/docker.sock"
        "$HOME/.colima/docker.sock"
        "$HOME/.rd/docker.sock"
    )
    
    WORKING_SOCKET=""
    
    for socket in "${SOCKET_PATHS[@]}"; do
        print_status "Checking socket: $socket"
        
        if [[ -S "$socket" ]]; then
            print_success "Socket exists: $socket"
            
            # Test socket permissions
            if [[ -r "$socket" && -w "$socket" ]]; then
                print_success "Socket has correct permissions"
                
                # Test Docker connectivity through this socket
                if DOCKER_HOST="unix://$socket" docker info >/dev/null 2>&1; then
                    print_success "Socket is working: $socket"
                    WORKING_SOCKET="$socket"
                    break
                else
                    print_warning "Socket exists but Docker connection failed: $socket"
                fi
            else
                print_warning "Socket has permission issues: $socket"
                print_status "Socket permissions: $(ls -la "$socket" 2>/dev/null || echo 'Cannot read permissions')"
            fi
        else
            print_warning "Socket not found: $socket"
        fi
    done
    
    if [[ -n "$WORKING_SOCKET" ]]; then
        print_success "Found working Docker socket: $WORKING_SOCKET"
        export DOCKER_HOST="unix://$WORKING_SOCKET"
    else
        print_error "No working Docker socket found"
        return 1
    fi
}

# Test Docker connectivity
test_docker_connectivity() {
    print_header "TESTING DOCKER CONNECTIVITY"
    
    # Test docker info
    print_status "Testing 'docker info'..."
    if docker info >/dev/null 2>&1; then
        print_success "Docker info command successful"
        
        # Get basic Docker info
        DOCKER_INFO=$(docker info --format "{{.ServerVersion}}" 2>/dev/null || echo "Unknown")
        print_status "Docker server version: $DOCKER_INFO"
        
        CONTAINERS=$(docker ps -q | wc -l | tr -d ' ')
        print_status "Running containers: $CONTAINERS"
        
        IMAGES=$(docker images -q | wc -l | tr -d ' ')
        print_status "Local images: $IMAGES"
    else
        print_error "Docker info command failed"
        docker info 2>&1 | head -5
        return 1
    fi
    
    # Test docker ps
    print_status "Testing 'docker ps'..."
    if docker ps >/dev/null 2>&1; then
        print_success "Docker ps command successful"
    else
        print_error "Docker ps command failed"
        return 1
    fi
    
    # Test docker version
    print_status "Testing 'docker version'..."
    if docker version >/dev/null 2>&1; then
        print_success "Docker version command successful"
        CLIENT_VERSION=$(docker version --format '{{.Client.Version}}' 2>/dev/null || echo "Unknown")
        SERVER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "Unknown")
        print_status "Client version: $CLIENT_VERSION"
        print_status "Server version: $SERVER_VERSION"
    else
        print_error "Docker version command failed"
        return 1
    fi
}

# Check environment variables
check_environment() {
    print_header "CHECKING ENVIRONMENT VARIABLES"
    
    # Check DOCKER_HOST
    if [[ -n "$DOCKER_HOST" ]]; then
        print_status "DOCKER_HOST is set: $DOCKER_HOST"
        
        # Validate DOCKER_HOST format
        if [[ "$DOCKER_HOST" =~ ^unix:// ]]; then
            SOCKET_PATH="${DOCKER_HOST#unix://}"
            if [[ -S "$SOCKET_PATH" ]]; then
                print_success "DOCKER_HOST socket exists and is valid"
            else
                print_warning "DOCKER_HOST points to non-existent socket: $SOCKET_PATH"
                print_status "Unsetting DOCKER_HOST to use default detection"
                unset DOCKER_HOST
            fi
        else
            print_warning "DOCKER_HOST has unexpected format: $DOCKER_HOST"
        fi
    else
        print_status "DOCKER_HOST not set (using default detection)"
    fi
    
    # Check PATH
    print_status "Checking PATH for Docker..."
    if command -v docker >/dev/null 2>&1; then
        DOCKER_PATH=$(which docker)
        print_success "Docker found in PATH: $DOCKER_PATH"
    else
        print_warning "Docker not found in PATH"
        print_status "Current PATH: $PATH"
    fi
}

# Test angela-specific Docker operations
test_angela_operations() {
    print_header "TESTING angela-SPECIFIC DOCKER OPERATIONS"
    
    # Test network creation (angela creates angela_network)
    print_status "Testing Docker network operations..."
    
    # Check if angela_network exists
    if docker network ls --format "{{.Name}}" | grep -q "^angela_network$"; then
        print_success "angela network already exists"
    else
        print_status "Creating angela network..."
        if docker network create angela_network >/dev/null 2>&1; then
            print_success "Created angela network successfully"
            
            # Clean up test network
            docker network rm angela_network >/dev/null 2>&1
            print_status "Cleaned up test network"
        else
            print_error "Failed to create angela network"
            return 1
        fi
    fi
    
    # Test image pulling (test with small image)
    print_status "Testing Docker image operations..."
    if docker pull hello-world >/dev/null 2>&1; then
        print_success "Docker image pull successful"
        
        # Clean up test image
        docker rmi hello-world >/dev/null 2>&1
        print_status "Cleaned up test image"
    else
        print_error "Docker image pull failed"
        return 1
    fi
    
    # Test container operations
    print_status "Testing Docker container operations..."
    if docker run --rm hello-world >/dev/null 2>&1; then
        print_success "Docker container run successful"
    else
        print_error "Docker container run failed"
        return 1
    fi
}

# Check angela's specific ports
check_angela_ports() {
    print_header "CHECKING angela SERVICE PORTS"
    
    angela_PORTS=(
        "5001:angela Python Backend"
        "5678:angela N8N"
        "11434:Ollama (if installed)"
    )
    
    for port_info in "${angela_PORTS[@]}"; do
        PORT="${port_info%%:*}"
        SERVICE="${port_info##*:}"
        
        print_status "Checking port $PORT ($SERVICE)..."
        
        if lsof -i ":$PORT" >/dev/null 2>&1; then
            PROCESS=$(lsof -i ":$PORT" -t | head -1)
            PROCESS_NAME=$(ps -p "$PROCESS" -o comm= 2>/dev/null || echo "Unknown")
            print_warning "Port $PORT is in use by: $PROCESS_NAME (PID: $PROCESS)"
        else
            print_success "Port $PORT is available"
        fi
    done
}

# Fix Docker Desktop issues
fix_docker_desktop() {
    print_header "FIXING DOCKER DESKTOP ISSUES"
    
    print_status "Attempting to fix Docker Desktop issues..."
    
    # Kill all Docker processes
    print_status "Stopping Docker Desktop..."
    pkill -f "Docker Desktop" >/dev/null 2>&1 || true
    pkill -f "com.docker" >/dev/null 2>&1 || true
    
    # Wait for processes to stop
    sleep 5
    
    # Remove problematic files (if they exist)
    print_status "Cleaning Docker Desktop state..."
    
    CLEANUP_PATHS=(
        "$HOME/.docker/daemon.json.backup"
        "$HOME/.docker/desktop/docker.sock.backup"
    )
    
    for path in "${CLEANUP_PATHS[@]}"; do
        if [[ -f "$path" ]]; then
            rm -f "$path"
            print_status "Removed: $path"
        fi
    done
    
    # Restart Docker Desktop
    print_status "Restarting Docker Desktop..."
    open /Applications/Docker.app
    
    # Wait for Docker Desktop to fully start
    print_status "Waiting for Docker Desktop to fully initialize..."
    
    for i in {1..120}; do
        if docker info >/dev/null 2>&1; then
            print_success "Docker Desktop restarted successfully"
            return 0
        fi
        
        if [[ $((i % 10)) -eq 0 ]]; then
            print_status "Still waiting... ($i/120 seconds)"
        fi
        
        sleep 1
    done
    
    print_error "Docker Desktop failed to start within 2 minutes"
    return 1
}

# Main troubleshooting function
run_full_diagnosis() {
    print_header "angela DOCKER TROUBLESHOOTING DIAGNOSTIC"
    
    local issues_found=0
    
    # Run all checks
    check_macos || ((issues_found++))
    check_docker_installation || ((issues_found++))
    check_docker_process || ((issues_found++))
    check_environment || ((issues_found++))
    
    if ! check_docker_sockets; then
        print_warning "Socket issues detected, attempting to fix..."
        if fix_docker_desktop; then
            print_success "Docker Desktop restart completed"
            sleep 5
            check_docker_sockets || ((issues_found++))
        else
            ((issues_found++))
        fi
    fi
    
    test_docker_connectivity || ((issues_found++))
    test_angela_operations || ((issues_found++))
    check_angela_ports || true  # Don't count port conflicts as failures
    
    return $issues_found
}

# Generate fix recommendations
generate_recommendations() {
    local issues_count=$1
    
    print_header "RECOMMENDATIONS"
    
    if [[ $issues_count -eq 0 ]]; then
        print_success "All checks passed! Docker is working correctly for angela."
        print_status "You can now start angela and Docker services should work properly."
    else
        print_warning "Found $issues_count issue(s). Here are the recommended fixes:"
        
        echo -e "\n${YELLOW}Manual Fixes to Try:${NC}"
        echo "1. Completely quit Docker Desktop (Cmd+Q)"
        echo "2. Restart Docker Desktop from Applications"
        echo "3. Wait for the whale icon to become stable in the menu bar"
        echo "4. Run this script again: ./angela-docker-fix.sh"
        echo ""
        echo "5. If issues persist, try:"
        echo "   - Docker Desktop → Settings → Reset to Factory Defaults"
        echo "   - Restart your Mac"
        echo "   - Reinstall Docker Desktop"
        echo ""
        echo "6. Check System Preferences → Security & Privacy → Firewall"
        echo "   - Ensure Docker Desktop is allowed network access"
        echo ""
        echo "7. For advanced troubleshooting:"
        echo "   - Check Console.app for Docker-related errors"
        echo "   - Run 'docker system events' to monitor Docker daemon"
    fi
}

# Interactive mode
interactive_mode() {
    print_header "angela DOCKER INTERACTIVE TROUBLESHOOTER"
    
    echo "This script will help diagnose and fix Docker issues for angela on macOS."
    echo ""
    echo "What would you like to do?"
    echo "1) Run full diagnosis"
    echo "2) Quick fix (restart Docker Desktop)"
    echo "3) Check Docker status only"
    echo "4) Test angela operations only"
    echo "5) Exit"
    echo ""
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1)
            run_full_diagnosis
            issues_count=$?
            generate_recommendations $issues_count
            ;;
        2)
            fix_docker_desktop
            ;;
        3)
            check_docker_installation
            check_docker_process
            test_docker_connectivity
            ;;
        4)
            test_angela_operations
            check_angela_ports
            ;;
        5)
            print_status "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
}

# Main script execution
main() {
    # Check if running with arguments
    if [[ $# -eq 0 ]]; then
        interactive_mode
    else
        case "$1" in
            --auto|--full)
                run_full_diagnosis
                issues_count=$?
                generate_recommendations $issues_count
                ;;
            --fix|--restart)
                fix_docker_desktop
                ;;
            --check)
                test_docker_connectivity
                ;;
            --angela)
                test_angela_operations
                check_angela_ports
                ;;
            --help|-h)
                echo "angela Docker Troubleshooting Script"
                echo ""
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --auto, --full    Run full diagnosis and recommendations"
                echo "  --fix, --restart  Quick fix: restart Docker Desktop"
                echo "  --check          Check Docker connectivity only"
                echo "  --angela          Test angela-specific operations only"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Interactive mode (no options): Guided troubleshooting menu"
                ;;
            *)
                print_error "Unknown option: $1"
                print_status "Use --help for usage information"
                exit 1
                ;;
        esac
    fi
}

# Run main function with all arguments
main "$@"
