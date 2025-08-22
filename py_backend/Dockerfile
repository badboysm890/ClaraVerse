FROM python:3.11-slim

# Add labels for the image
LABEL org.opencontainers.image.title="angela Backend"
LABEL org.opencontainers.image.description="angela AI Assistant Backend Service"
LABEL org.opencontainers.image.authors="angela Team"
LABEL org.opencontainers.image.source="https://github.com/angela17verse/angela"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="angela"
LABEL org.opencontainers.image.version="1.0.0"

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

# install uv for pip
RUN pip install uv

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies with platform-specific optimizations
RUN uv pip install -r requirements.txt --system && \
    rm -rf /root/.cache/pip/*

# Install spaCy and download the English model explicitly
RUN uv pip install spacy>=3.4.0 --system && \
    python -m spacy download en_core_web_sm && \
    python -c "import spacy; nlp = spacy.load('en_core_web_sm'); print('✅ spaCy model loaded successfully')" && \
    rm -rf /root/.cache/pip/*

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV HOST="0.0.0.0" \
    PORT=5000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NUMPY_ALLOCATE_DEFAULT=0

# Create a non-root user
RUN useradd -m -r -u 1000 angela && \
    chown -R angela:angela /app

# Switch to non-root user
USER angela

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Run the application with environment variables
CMD ["sh", "-c", "python main.py --host $HOST --port $PORT"] 
