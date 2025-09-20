#!/bin/bash

# ClaraVerse Remote Deployment Script
# Deploys ClaraVerse server package to a remote server via SSH

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
REMOTE_USER=""
REMOTE_HOST=""
REMOTE_PORT="22"
SSH_KEY=""
DEPLOYMENT_PATH="/opt/claraverse"

# Usage information
usage() {
    echo "Usage: $0 -u USER -h HOST [-p PORT] [-k SSH_KEY] [-d DEPLOYMENT_PATH]"
    echo ""
    echo "Options:"
    echo "  -u USER             Remote username"
    echo "  -h HOST             Remote server hostname or IP"
    echo "  -p PORT             SSH port (default: 22)"
    echo "  -k SSH_KEY          Path to SSH private key (optional)"
    echo "  -d DEPLOYMENT_PATH  Remote deployment path (default: /opt/claraverse)"
    echo ""
    echo "Example:"
    echo "  $0 -u ubuntu -h 192.168.1.100 -k ~/.ssh/id_rsa"
    echo "  $0 -u root -h my-server.com -p 2222"
    exit 1
}

# Parse command line arguments
while getopts "u:h:p:k:d:?" opt; do
    case $opt in
        u) REMOTE_USER="$OPTARG" ;;
        h) REMOTE_HOST="$OPTARG" ;;
        p) REMOTE_PORT="$OPTARG" ;;
        k) SSH_KEY="$OPTARG" ;;
        d) DEPLOYMENT_PATH="$OPTARG" ;;
        ?) usage ;;
    esac
done

# Validate required parameters
if [ -z "$REMOTE_USER" ] || [ -z "$REMOTE_HOST" ]; then
    echo -e "${RED}Error: Remote user and host are required${NC}"
    usage
fi

# Build SSH command
SSH_CMD="ssh -p $REMOTE_PORT"
SCP_CMD="scp -P $REMOTE_PORT"
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $SSH_KEY"
    SCP_CMD="$SCP_CMD -i $SSH_KEY"
fi

SSH_TARGET="$REMOTE_USER@$REMOTE_HOST"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Test SSH connection
test_ssh_connection() {
    log "Testing SSH connection to $SSH_TARGET..."
    
    if $SSH_CMD $SSH_TARGET "echo 'SSH connection successful'" &> /dev/null; then
        log "✅ SSH connection successful"
    else
        error "❌ Failed to connect to $SSH_TARGET"
        echo "Please check:"
        echo "  - Server is running and accessible"
        echo "  - SSH credentials are correct"
        echo "  - SSH key permissions (chmod 600 if using key)"
        exit 1
    fi
}

# Create deployment directory on remote server
create_remote_directory() {
    log "Creating deployment directory: $DEPLOYMENT_PATH"
    
    $SSH_CMD $SSH_TARGET "sudo mkdir -p $DEPLOYMENT_PATH && sudo chown $REMOTE_USER:$REMOTE_USER $DEPLOYMENT_PATH"
    
    if [ $? -eq 0 ]; then
        log "✅ Deployment directory created"
    else
        error "❌ Failed to create deployment directory"
        exit 1
    fi
}

# Copy ClaraVerse server package to remote server
copy_server_package() {
    log "Copying ClaraVerse server package..."
    
    # Create a temporary archive of the server package
    local temp_archive="/tmp/claraverse-server-$(date +%s).tar.gz"
    
    # Get the directory containing this script
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local server_dir="$(dirname "$script_dir")"
    
    log "Creating archive from: $server_dir"
    tar -czf "$temp_archive" -C "$(dirname "$server_dir")" "$(basename "$server_dir")" --exclude="*.git*" --exclude="node_modules" --exclude="*.log"
    
    # Copy archive to remote server
    $SCP_CMD "$temp_archive" "$SSH_TARGET:$temp_archive"
    
    # Extract on remote server
    $SSH_CMD $SSH_TARGET "cd $DEPLOYMENT_PATH && tar -xzf $temp_archive --strip-components=1 && rm $temp_archive"
    
    # Clean up local archive
    rm "$temp_archive"
    
    if [ $? -eq 0 ]; then
        log "✅ Server package copied successfully"
    else
        error "❌ Failed to copy server package"
        exit 1
    fi
}

# Install Docker and dependencies on remote server
install_dependencies() {
    log "Installing Docker and dependencies on remote server..."
    
    $SSH_CMD $SSH_TARGET "cd $DEPLOYMENT_PATH && chmod +x scripts/install.sh && sudo scripts/install.sh"
    
    if [ $? -eq 0 ]; then
        log "✅ Dependencies installed successfully"
    else
        error "❌ Failed to install dependencies"
        exit 1
    fi
}

# Start ClaraVerse services
start_services() {
    log "Starting ClaraVerse services..."
    
    $SSH_CMD $SSH_TARGET "cd $DEPLOYMENT_PATH && sudo docker compose up -d"
    
    if [ $? -eq 0 ]; then
        log "✅ Services started successfully"
    else
        error "❌ Failed to start services"
        exit 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    log "Waiting for services to become ready..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if $SSH_CMD $SSH_TARGET "curl -f http://localhost/health" &> /dev/null; then
            log "✅ All services are ready!"
            return 0
        fi
        
        echo -n "."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    warn "Services are taking longer than expected to start"
    return 1
}

# Get remote server info
get_server_info() {
    log "Getting server information..."
    
    # Get server IP
    SERVER_IP=$($SSH_CMD $SSH_TARGET "curl -s https://api.ipify.org" 2>/dev/null || echo "$REMOTE_HOST")
    
    # Get GPU info
    GPU_INFO=$($SSH_CMD $SSH_TARGET "nvidia-smi --query-gpu=name --format=csv,noheader,nounits" 2>/dev/null || echo "No GPU detected")
    
    # Get Docker info
    DOCKER_VERSION=$($SSH_CMD $SSH_TARGET "docker --version" 2>/dev/null || echo "Unknown")
    
    # Get container status
    CONTAINER_STATUS=$($SSH_CMD $SSH_TARGET "cd $DEPLOYMENT_PATH && docker compose ps --format table" 2>/dev/null || echo "Unable to get status")
}

# Display deployment results
show_deployment_results() {
    echo ""
    echo -e "${GREEN}🎉 ClaraVerse Remote Deployment Complete!${NC}"
    echo "=============================================="
    echo ""
    echo -e "${BLUE}Server Information:${NC}"
    echo "  🖥️  Server IP:     $SERVER_IP"
    echo "  🎮 GPU:           $GPU_INFO"
    echo "  🐳 Docker:        $DOCKER_VERSION"
    echo ""
    echo -e "${BLUE}Access your ClaraVerse server at:${NC}"
    echo "  🌐 Dashboard:     http://$SERVER_IP"
    echo "  🎨 ComfyUI:       http://$SERVER_IP/comfyui/"
    echo "  🔧 n8n:           http://$SERVER_IP/n8n/"
    echo "  🐍 API Docs:      http://$SERVER_IP/api/docs"
    echo ""
    echo -e "${YELLOW}Remote Management Commands:${NC}"
    echo "  📊 Check status:  ssh $SSH_TARGET 'cd $DEPLOYMENT_PATH && docker compose ps'"
    echo "  📝 View logs:     ssh $SSH_TARGET 'cd $DEPLOYMENT_PATH && docker compose logs -f'"
    echo "  🔄 Restart:       ssh $SSH_TARGET 'cd $DEPLOYMENT_PATH && docker compose restart'"
    echo "  ⏹️  Stop:          ssh $SSH_TARGET 'cd $DEPLOYMENT_PATH && docker compose down'"
    echo ""
    echo -e "${GREEN}Container Status:${NC}"
    echo "$CONTAINER_STATUS"
    echo ""
}

# Main deployment flow
main() {
    echo -e "${BLUE}🚀 ClaraVerse Remote Deployment${NC}"
    echo "================================="
    echo "Target: $SSH_TARGET:$REMOTE_PORT"
    echo "Path:   $DEPLOYMENT_PATH"
    echo ""
    
    test_ssh_connection
    create_remote_directory
    copy_server_package
    install_dependencies
    start_services
    wait_for_services
    get_server_info
    show_deployment_results
    
    log "Deployment completed successfully!"
}

# Run main function
main "$@"