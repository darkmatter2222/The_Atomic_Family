#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  deploy.sh — Deploy the Atomic Family LLM container to GPU server
# ═══════════════════════════════════════════════════════════════════
#
#  Reads SSH credentials from ../.env and deploys the LLM service
#  as a Docker container with GPU access on the GPU server (RTX 3090).
#  Builds the image from the Dockerfile, then runs it.
#
#  Usage:  ./deploy.sh [build|start|stop|status|logs|deploy]
#    build  — Copy files & build Docker image on the server
#    start  — Start the container (build first if image missing)
#    stop   — Stop and remove the container
#    status — Check container status + GPU utilization
#    logs   — Tail the container logs
#    (no arg) — Full deploy: build + start
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

# ── Load .env ──────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)

SSH_USER="${SSH_USER:?SSH_USER not set in .env}"
SSH_HOST="${SSH_HOST:?SSH_HOST not set in .env}"
SSH_KEY="${SSH_KEY_PATH:-~/.ssh/id_rsa}"

LLM_MODEL="${LLM_MODEL:-Qwen/Qwen2.5-3B-Instruct}"
LLM_PORT="${LLM_PORT:-8001}"

CONTAINER_NAME="atomic-family-llm"
IMAGE_NAME="atomic-family-llm:latest"
REMOTE_DIR="/home/${SSH_USER}/atomic_family_llm"
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST}"
SCP_CMD="scp -i ${SSH_KEY} -o StrictHostKeyChecking=no"

echo "═══════════════════════════════════════════════════════════"
echo "  Atomic Family LLM — Docker Deployment"
echo "  Server:    ${SSH_USER}@${SSH_HOST}"
echo "  Model:     ${LLM_MODEL}"
echo "  Port:      ${LLM_PORT} (host) → 8000 (container)"
echo "  Container: ${CONTAINER_NAME}"
echo "═══════════════════════════════════════════════════════════"

# ── Functions ──────────────────────────────────────────────────────

do_build() {
    echo ""
    echo "▸ Creating remote directory..."
    $SSH_CMD "mkdir -p ${REMOTE_DIR}"

    echo "▸ Copying build context to server..."
    $SCP_CMD "${SCRIPT_DIR}/Dockerfile" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/Dockerfile"
    $SCP_CMD "${SCRIPT_DIR}/.dockerignore" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/.dockerignore"
    $SCP_CMD "${SCRIPT_DIR}/server.py" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/server.py"
    $SCP_CMD "${SCRIPT_DIR}/requirements.txt" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/requirements.txt"

    echo "▸ Building Docker image (this may take a few minutes)..."
    $SSH_CMD "cd ${REMOTE_DIR} && docker build -t ${IMAGE_NAME} ."
    echo "  ✓ Image built: ${IMAGE_NAME}"
}

do_start() {
    echo ""
    echo "▸ Starting container..."

    # Check if image exists
    if ! $SSH_CMD "docker image inspect ${IMAGE_NAME} > /dev/null 2>&1"; then
        echo "  Image not found, building first..."
        do_build
    fi

    # Stop existing container if running
    $SSH_CMD "docker rm -f ${CONTAINER_NAME} 2>/dev/null || true"
    sleep 1

    # Run the container with GPU access
    $SSH_CMD "docker run -d \
        --name ${CONTAINER_NAME} \
        --gpus all \
        --restart unless-stopped \
        -p ${LLM_PORT}:8000 \
        -v atomic-family-hf-cache:/root/.cache/huggingface \
        -e LLM_MODEL=${LLM_MODEL} \
        -e LLM_PORT=8000 \
        -e LLM_MAX_MODEL_LEN=4096 \
        -e LLM_GPU_MEMORY=0.85 \
        ${IMAGE_NAME}"

    echo "  Container started: ${CONTAINER_NAME}"
    echo ""
    echo "▸ Waiting for health check..."
    for i in {1..90}; do
        if $SSH_CMD "curl -sf http://localhost:${LLM_PORT}/health > /dev/null 2>&1"; then
            echo "  ✓ LLM server is ready on port ${LLM_PORT}!"
            exit 0
        fi
        sleep 2
        # Show progress every 10 iterations
        if (( i % 10 == 0 )); then
            echo "  ... still loading model (${i}s / ~180s)"
        fi
    done
    echo "  ⚠ Server didn't respond within 180 seconds."
    echo "  Check logs: $0 logs"
}

do_stop() {
    echo ""
    echo "▸ Stopping container..."
    $SSH_CMD "docker rm -f ${CONTAINER_NAME} 2>/dev/null && echo '  ✓ Container stopped and removed.' || echo '  No container running.'"
}

do_status() {
    echo ""
    echo "▸ Container status..."
    $SSH_CMD "docker ps -a --filter name=${CONTAINER_NAME} --format 'Name: {{.Names}}\nImage: {{.Image}}\nStatus: {{.Status}}\nPorts: {{.Ports}}' 2>/dev/null || echo '  Container not found.'"

    echo ""
    echo "▸ Health check..."
    $SSH_CMD "curl -s http://localhost:${LLM_PORT}/health 2>/dev/null || echo '  Not responding.'"

    echo ""
    echo "▸ GPU Status..."
    $SSH_CMD "nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || echo '  nvidia-smi not available'"
}

do_logs() {
    echo ""
    echo "▸ Container logs (last 50 lines)..."
    $SSH_CMD "docker logs --tail 50 ${CONTAINER_NAME} 2>&1"
}

# ── Main ───────────────────────────────────────────────────────────

case "${1:-deploy}" in
    build)
        do_build
        ;;
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    status)
        do_status
        ;;
    logs)
        do_logs
        ;;
    deploy)
        do_build
        do_start
        ;;
    *)
        echo "Usage: $0 [build|start|stop|status|logs|deploy]"
        exit 1
        ;;
esac

echo ""
echo "Done!"
