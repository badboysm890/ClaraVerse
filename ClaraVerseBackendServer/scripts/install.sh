#!/bin/bash

# ClaraVerse Remote Server Installer - Linux/Mac
# This script installs Docker, sets up GPU support, and deploys ClaraVerse services

set -e

echo "🚀 ClaraVerse Remote Server Installation"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}=================================================================================${NC}"
echo -e "${BLUE}                            [SERVICE SELECTION]                              ${NC}"
echo -e "${BLUE}=================================================================================${NC}"
echo ""
echo -e "Please select which services you want to deploy:"
echo ""
echo -e "${CYAN}   [1] ComfyUI          ${NC}- AI Image Generation (Port 8188)"
echo -e "${CYAN}   [2] Python Backend   ${NC}- Core AI Processing APIs (Port 5001)"
echo -e "${CYAN}   [3] n8n Workflows    ${NC}- Automation Platform (Port 5678)"
echo -e "${CYAN}   [A] All Services     ${NC}- Deploy everything (Recommended)"
echo ""

DEPLOY_COMFYUI=false
DEPLOY_PYTHON=false
DEPLOY_N8N=false

while true; do
    echo -e "${YELLOW}Select services (e.g., 1,3 or A for all): ${NC}"
    read -r SERVICE_CHOICE
    
    if [[ "${SERVICE_CHOICE^^}" == "A" ]]; then
        DEPLOY_COMFYUI=true
        DEPLOY_PYTHON=true
        DEPLOY_N8N=true
        echo -e "${GREEN}[*] All services selected for deployment${NC}"
        break
    fi
    
    if [[ -z "$SERVICE_CHOICE" ]]; then
        continue
    fi
    
    # Parse individual service selections
    if [[ "$SERVICE_CHOICE" == *"1"* ]]; then
        DEPLOY_COMFYUI=true
    fi
    if [[ "$SERVICE_CHOICE" == *"2"* ]]; then
        DEPLOY_PYTHON=true
    fi
    if [[ "$SERVICE_CHOICE" == *"3"* ]]; then
        DEPLOY_N8N=true
    fi
    
    if [[ "$DEPLOY_COMFYUI" == false && "$DEPLOY_PYTHON" == false && "$DEPLOY_N8N" == false ]]; then
        echo -e "${RED}[!] No valid services selected. Please try again.${NC}"
        continue
    fi
    
    break
done

echo ""
echo "Selected services:"
if [[ "$DEPLOY_COMFYUI" == true ]]; then
    echo -e "${GREEN}  ✓ ComfyUI${NC}"
fi
if [[ "$DEPLOY_PYTHON" == true ]]; then
    echo -e "${GREEN}  ✓ Python Backend${NC}"
fi
if [[ "$DEPLOY_N8N" == true ]]; then
    echo -e "${GREEN}  ✓ n8n Workflows${NC}"
fi
echo ""
sleep 2

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        warn "Running as root. This is not recommended for production."
    fi
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if [ -f /etc/debian_version ]; then
            DISTRO="debian"
        elif [ -f /etc/redhat-release ]; then
            DISTRO="redhat"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    log "Detected OS: $OS ($DISTRO)"
}

# Install Docker
install_docker() {
    log "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        log "Docker is already installed"
        docker --version
        return
    fi
    
    if [ "$OS" == "linux" ]; then
        if [ "$DISTRO" == "debian" ]; then
            # Ubuntu/Debian
            sudo apt-get update
            sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        elif [ "$DISTRO" == "redhat" ]; then
            # CentOS/RHEL/Rocky
            sudo yum install -y yum-utils
            sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        fi
        
        # Start Docker service
        sudo systemctl start docker
        sudo systemctl enable docker
        
        # Add current user to docker group (requires logout/login)
        sudo usermod -aG docker $USER
        warn "Please logout and login again for Docker group membership to take effect"
        
    elif [ "$OS" == "macos" ]; then
        error "Please install Docker Desktop for Mac manually from https://docs.docker.com/desktop/mac/install/"
        exit 1
    fi
    
    log "Docker installation completed"
}

# Install NVIDIA Container Toolkit
install_nvidia_support() {
    log "Checking for NVIDIA GPU support..."
    
    # Check if nvidia-smi is available
    if ! command -v nvidia-smi &> /dev/null; then
        warn "nvidia-smi not found. Skipping GPU support setup."
        warn "If you have an NVIDIA GPU, please install NVIDIA drivers first."
        return
    fi
    
    log "NVIDIA GPU detected. Installing NVIDIA Container Toolkit..."
    
    if [ "$OS" == "linux" ]; then
        if [ "$DISTRO" == "debian" ]; then
            # Ubuntu/Debian
            distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
            && curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
            && curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
               sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
               sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
            sudo apt-get update
            sudo apt-get install -y nvidia-container-toolkit
        elif [ "$DISTRO" == "redhat" ]; then
            # CentOS/RHEL/Rocky
            distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
            && curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/nvidia-container-toolkit.repo | \
               sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
            sudo yum install -y nvidia-container-toolkit
        fi
        
        # Configure Docker daemon
        sudo nvidia-ctk runtime configure --runtime=docker
        sudo systemctl restart docker
        
        log "NVIDIA Container Toolkit installed successfully"
        
        # Test GPU access
        if sudo docker run --rm --gpus all nvidia/cuda:11.0.3-base-ubuntu20.04 nvidia-smi; then
            log "✅ GPU support is working correctly"
        else
            warn "GPU test failed. GPU support may not be working properly."
        fi
    fi
}

# Create directories and set permissions
setup_directories() {
    log "Setting up directories..."
    
    # Create data directories
    mkdir -p ./data/{comfyui,python,n8n}
    mkdir -p ./logs
    
    # Set proper permissions
    chmod 755 ./data
    chmod 755 ./logs
    
    log "Directories created successfully"
}

# Generate GPU-aware docker-compose configuration
generate_compose_config() {
    log "Generating Docker Compose configuration..."
    
    # Check if GPU support is available
    GPU_AVAILABLE=false
    if command -v nvidia-smi &> /dev/null && sudo docker run --rm --gpus all nvidia/cuda:11.0.3-base-ubuntu20.04 nvidia-smi &> /dev/null; then
        GPU_AVAILABLE=true
        log "GPU support enabled"
    else
        warn "No GPU support detected. Running in CPU mode."
    fi
    
    # Create CPU-only version if no GPU
    if [ "$GPU_AVAILABLE" = false ]; then
        log "Creating CPU-only configuration..."
        
        # Remove GPU-specific configurations
        sed -i.bak '/runtime: nvidia/d' docker-compose.yml
        sed -i.bak '/NVIDIA_VISIBLE_DEVICES/d' docker-compose.yml
        sed -i.bak '/CUDA_VISIBLE_DEVICES/d' docker-compose.yml
        sed -i.bak '/PYTORCH_CUDA_ALLOC_CONF/d' docker-compose.yml
        sed -i.bak '/CUDA_LAUNCH_BLOCKING/d' docker-compose.yml
        sed -i.bak '/TORCH_CUDNN_V8_API_ENABLED/d' docker-compose.yml
        sed -i.bak '/CUDA_MODULE_LOADING/d' docker-compose.yml
        sed -i.bak '/CUDA_CACHE_DISABLE/d' docker-compose.yml
        sed -i.bak '/WHISPER_CUDA/d' docker-compose.yml
        sed -i.bak 's/FASTER_WHISPER_DEVICE=cuda/FASTER_WHISPER_DEVICE=cpu/' docker-compose.yml
        sed -i.bak '/COMFYUI_.*=/d' docker-compose.yml
    fi
    
    log "Docker Compose configuration ready"
}

# Deploy ClaraVerse services
deploy_services() {
    log "Deploying selected ClaraVerse services..."
    
    # Build service list based on selections
    SERVICES=""
    if [[ "$DEPLOY_COMFYUI" == true ]]; then
        SERVICES="$SERVICES clara_comfyui"
    fi
    if [[ "$DEPLOY_PYTHON" == true ]]; then
        SERVICES="$SERVICES clara_python"
    fi
    if [[ "$DEPLOY_N8N" == true ]]; then
        SERVICES="$SERVICES clara_n8n"
    fi
    
    log "Services to deploy:$SERVICES"
    
    # Pull latest images for selected services
    log "Pulling Docker images for selected services..."
    sudo docker compose pull$SERVICES
    
    # Start selected services
    log "Starting selected services..."
    sudo docker compose up -d$SERVICES
    
    log "Selected services deployed successfully"
}

# Wait for services to be healthy
wait_for_services() {
    log "Waiting for selected services to become healthy..."
    
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local healthy=true
        
        # Check health of selected services
        if [[ "$DEPLOY_COMFYUI" == true ]]; then
            if ! curl -f http://localhost:8188/ &> /dev/null; then
                healthy=false
            fi
        fi
        
        if [[ "$DEPLOY_PYTHON" == true ]]; then
            if ! curl -f http://localhost:5001/health &> /dev/null; then
                healthy=false
            fi
        fi
        
        if [[ "$DEPLOY_N8N" == true ]]; then
            if ! curl -f http://localhost:5678/healthz &> /dev/null; then
                healthy=false
            fi
        fi
        
        if [[ "$healthy" == true ]]; then
            log "✅ All selected services are healthy!"
            break
        fi
        
        echo -n "."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -eq $max_attempts ]; then
        warn "Services are taking longer than expected to start. Check logs with: docker compose logs"
    fi
}

# Display success message
show_success() {
    echo ""
    echo -e "${GREEN}🎉 ClaraVerse Remote Server Installation Complete!${NC}"
    echo "=============================================="
    echo ""
    echo -e "${BLUE}Access your selected services at:${NC}"
    
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    
    if [[ "$DEPLOY_COMFYUI" == true ]]; then
        echo "  🎨 ComfyUI:        http://$server_ip:8188"
    fi
    if [[ "$DEPLOY_PYTHON" == true ]]; then
        echo "  � Python Backend: http://$server_ip:5001"
    fi
    if [[ "$DEPLOY_N8N" == true ]]; then
        echo "  � n8n:           http://$server_ip:5678"
    fi
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  📊 Check status: docker compose ps"
    echo "  📝 View logs:    docker compose logs -f"
    echo "  🔄 Restart:      docker compose restart"
    echo "  ⏹️  Stop:         docker compose down"
    echo ""
}

# Main installation flow
main() {
    log "Starting ClaraVerse Remote Server installation..."
    
    check_root
    detect_os
    install_docker
    install_nvidia_support
    setup_directories
    generate_compose_config
    deploy_services
    wait_for_services
    show_success
    
    log "Installation completed successfully!"
}

# Run main function
main "$@"