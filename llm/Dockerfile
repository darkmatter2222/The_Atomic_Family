# ═══════════════════════════════════════════════════════════════════
#  Atomic Family LLM — Docker image for vLLM + Qwen 2.5 3B Instruct
# ═══════════════════════════════════════════════════════════════════
#  Build:  docker build -t atomic-family-llm .
#  Run:    docker run -d --gpus all -p 8001:8000 --name atomic-family-llm atomic-family-llm
# ═══════════════════════════════════════════════════════════════════

FROM nvidia/cuda:12.4.0-devel-ubuntu22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.12 and essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    curl wget git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy the server code
COPY server.py .

# Environment variables (can be overridden at runtime)
ENV LLM_MODEL=Qwen/Qwen2.5-3B-Instruct
ENV LLM_PORT=8000
ENV LLM_MAX_MODEL_LEN=4096
ENV LLM_GPU_MEMORY=0.85
ENV LLM_HOST_BIND=0.0.0.0

# Expose the inference port (internal)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Model is downloaded at runtime using a mounted volume for the HuggingFace cache.
# This keeps the image small and allows model changes without rebuilding.

CMD ["python3", "server.py"]
