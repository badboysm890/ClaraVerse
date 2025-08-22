#!/bin/bash
# angela Core Docker Build and Run Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="angela_core"
IMAGE_NAME="angela-core"
DEFAULT_PORT=8091
MODELS_PATH="./models"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect GPU support
detect_gpu() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        nvidia-smi >/dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "gpu"
            return
        fi
    fi
    
    # Check for AMD GPU (placeholder)
    # if command -v rocm-smi >/dev/null 2>&1; then
    #     echo "rocm"
    #     return
    # fi
    
    echo "cpu"
}

# Check Docker and Docker Compose
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    log_success "Dependencies check passed"
}

# Build the container
build() {
    local compute_backend=${1:-$(detect_gpu)}
    
    log_info "Building angela Core container with ${compute_backend} support..."
    
    # Set environment variable for build
    export COMPUTE_BACKEND=${compute_backend}
    
    # Build using docker-compose
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml build
    else
        docker compose -f docker/angela-core/docker-compose.yml build
    fi
    
    log_success "Build completed"
}

# Run the container
run() {
    local compute_backend=${1:-$(detect_gpu)}
    local models_path=${2:-$MODELS_PATH}
    
    log_info "Starting angela Core with ${compute_backend} support..."
    log_info "Models path: ${models_path}"
    
    # Create models directory if it doesn't exist
    mkdir -p "${models_path}"
    
    # Set environment variables
    export COMPUTE_BACKEND=${compute_backend}
    export angela_MODELS_PATH=$(realpath "${models_path}")
    
    # Run using docker-compose
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml up -d
    else
        docker compose -f docker/angela-core/docker-compose.yml up -d
    fi
    
    log_success "angela Core started successfully"
    log_info "API available at: http://localhost:${DEFAULT_PORT}"
    log_info "Health check: http://localhost:${DEFAULT_PORT}/health"
    
    # Show logs
    sleep 2
    log_info "Showing startup logs..."
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml logs --tail=20 angela-core
    else
        docker compose -f docker/angela-core/docker-compose.yml logs --tail=20 angela-core
    fi
}

# Stop the container
stop() {
    log_info "Stopping angela Core..."
    
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml down
    else
        docker compose -f docker/angela-core/docker-compose.yml down
    fi
    
    log_success "angela Core stopped"
}

# Show status
status() {
    log_info "angela Core status:"
    
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml ps
    else
        docker compose -f docker/angela-core/docker-compose.yml ps
    fi
    
    # Check if service is responding
    if curl -f -s http://localhost:${DEFAULT_PORT}/health >/dev/null 2>&1; then
        log_success "Service is healthy and responding"
        curl -s http://localhost:${DEFAULT_PORT}/health | jq . 2>/dev/null || echo
    else
        log_warning "Service is not responding to health checks"
    fi
}

# Show logs
logs() {
    local lines=${1:-50}
    
    log_info "Showing angela Core logs (last ${lines} lines)..."
    
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose -f docker/angela-core/docker-compose.yml logs --tail=${lines} -f angela-core
    else
        docker compose -f docker/angela-core/docker-compose.yml logs --tail=${lines} -f angela-core
    fi
}

# Update the container
update() {
    log_info "Updating angela Core..."
    
    # Pull latest changes (if using git)
    if [ -d ".git" ]; then
        git pull
    fi
    
    # Rebuild and restart
    build "$@"
    stop
    run "$@"
    
    log_success "Update completed"
}

# Show usage
usage() {
    echo "angela Core Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build [cpu|gpu]     Build the container (auto-detects GPU if not specified)"
    echo "  run [cpu|gpu] [models_path]  Run the container"
    echo "  stop                Stop the container"
    echo "  restart             Restart the container"
    echo "  status              Show container status"
    echo "  logs [lines]        Show container logs"
    echo "  update              Update and restart the container"
    echo "  clean               Remove containers and images"
    echo ""
    echo "Examples:"
    echo "  $0 build gpu        # Build with GPU support"
    echo "  $0 run cpu ./models # Run with CPU and custom models path"
    echo "  $0 logs 100         # Show last 100 log lines"
    echo ""
    echo "Current GPU detection: $(detect_gpu)"
}

# Clean up
clean() {
    log_info "Cleaning up angela Core containers and images..."
    
    # Stop containers
    stop 2>/dev/null || true
    
    # Remove containers
    docker rm -f ${CONTAINER_NAME} 2>/dev/null || true
    
    # Remove images
    docker rmi ${IMAGE_NAME} 2>/dev/null || true
    docker system prune -f
    
    log_success "Cleanup completed"
}

# Main script
main() {
    case "${1:-usage}" in
        build)
            check_dependencies
            build "$2"
            ;;
        run)
            check_dependencies
            run "$2" "$3"
            ;;
        stop)
            stop
            ;;
        restart)
            stop
            run "$2" "$3"
            ;;
        status)
            status
            ;;
        logs)
            logs "$2"
            ;;
        update)
            check_dependencies
            update "$2" "$3"
            ;;
        clean)
            clean
            ;;
        *)
            usage
            ;;
    esac
}

# Run main function with all arguments
main "$@"
