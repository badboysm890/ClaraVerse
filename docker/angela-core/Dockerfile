# angela Core (LlamaSwap) Docker Container
# Supports both CPU and GPU acceleration

# Multi-stage build for different compute backends
ARG COMPUTE_BACKEND=cpu
FROM ubuntu:22.04 AS gpu-base
FROM ubuntu:22.04 AS cpu-base

# Use appropriate base image based on compute backend
FROM ${COMPUTE_BACKEND}-base AS base

# Install system dependencies
RUN apt-get update -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false && apt-get install -y \
    curl \
    wget \
    build-essential \
    cmake \
    git \
    python3 \
    python3-pip \
    libssl-dev \
    pkg-config \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install NVIDIA utils if building for GPU
ARG COMPUTE_BACKEND
RUN if [ "$COMPUTE_BACKEND" = "gpu" ]; then \
        apt-get update && \
        apt-get install -y nvidia-utils-525 || \
        apt-get install -y nvidia-utils-470 || \
        echo "NVIDIA utils not available, GPU detection may be limited"; \
    fi

# Install Node.js 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Create app directory and user
RUN useradd -m -s /bin/bash angela
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy source code
COPY server.js ./

# Copy llamacpp binaries based on compute backend
ARG TARGETARCH
ARG COMPUTE_BACKEND
RUN mkdir -p /app/llamacpp-binaries

# Create necessary directories
RUN mkdir -p /app/models /app/config /app/logs
RUN chown -R angela:angela /app

# Set up model and config volumes
VOLUME ["/app/models", "/app/config"]

# Switch to non-root user
USER angela

# Environment variables
ENV NODE_ENV=production
ENV angela_MODELS_DIR=/app/models
ENV angela_CONFIG_DIR=/app/config
ENV angela_LOGS_DIR=/app/logs
ENV angela_PORT=8091

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${angela_PORT}/health || exit 1

# Expose port
EXPOSE 8091

# Start angela Core service
CMD ["node", "server.js"]
