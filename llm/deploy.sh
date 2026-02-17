#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  deploy.sh — Deploy the Atomic Family LLM to the GPU server
# ═══════════════════════════════════════════════════════════════════
#
#  Reads SSH credentials from ../.env and deploys the LLM service
#  to the GPU server (RTX 3090). Downloads Qwen 2.5 3B Instruct
#  and starts the vLLM inference server.
#
#  Usage:  ./deploy.sh [start|stop|status|setup]
#    setup  — Install dependencies and download model (first time)
#    start  — Start the LLM server
#    stop   — Stop the LLM server
#    status — Check if the server is running
#    (no arg) — Full deploy: setup + start
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
LLM_PORT="${LLM_PORT:-8000}"

REMOTE_DIR="/home/${SSH_USER}/atomic_family_llm"
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST}"
SCP_CMD="scp -i ${SSH_KEY} -o StrictHostKeyChecking=no"

echo "═══════════════════════════════════════════════════════════"
echo "  Atomic Family LLM Deployment"
echo "  Server: ${SSH_USER}@${SSH_HOST}"
echo "  Model:  ${LLM_MODEL}"
echo "  Port:   ${LLM_PORT}"
echo "═══════════════════════════════════════════════════════════"

# ── Functions ──────────────────────────────────────────────────────

do_setup() {
    echo ""
    echo "▸ Creating remote directory..."
    $SSH_CMD "mkdir -p ${REMOTE_DIR}"

    echo "▸ Copying files to server..."
    $SCP_CMD "${SCRIPT_DIR}/server.py" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/server.py"
    $SCP_CMD "${SCRIPT_DIR}/requirements.txt" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/requirements.txt"
    $SCP_CMD "${SCRIPT_DIR}/start.sh" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/start.sh"

    echo "▸ Setting up Python virtual environment..."
    $SSH_CMD << 'SETUP_EOF'
        cd ~/atomic_family_llm
        
        # Create venv if it doesn't exist
        if [ ! -d "venv" ]; then
            echo "  Creating virtual environment..."
            python3 -m venv venv
        fi
        
        # Activate and install
        source venv/bin/activate
        echo "  Installing/updating requirements..."
        pip install --upgrade pip -q
        pip install -r requirements.txt -q
        
        echo "  Pre-downloading model..."
        python3 -c "
from huggingface_hub import snapshot_download
import os
model = os.environ.get('LLM_MODEL', 'Qwen/Qwen2.5-3B-Instruct')
print(f'  Downloading {model}...')
snapshot_download(model, cache_dir=os.path.expanduser('~/.cache/huggingface'))
print('  Model download complete!')
"
        
        chmod +x start.sh
        echo "  Setup complete!"
SETUP_EOF
}

do_start() {
    echo ""
    echo "▸ Starting LLM server..."
    $SSH_CMD << EOF
        cd ~/atomic_family_llm
        
        # Kill existing server if running
        pkill -f "atomic_family_llm/venv.*server.py" 2>/dev/null || true
        sleep 1
        
        # Start server in background with nohup
        source venv/bin/activate
        export LLM_MODEL="${LLM_MODEL}"
        export LLM_PORT="${LLM_PORT}"
        export LLM_MAX_MODEL_LEN=4096
        export LLM_GPU_MEMORY=0.85
        
        nohup python server.py > server.log 2>&1 &
        echo "  Server started (PID: \$!)"
        echo "  Logs: ${REMOTE_DIR}/server.log"
        
        # Wait for health check
        echo "  Waiting for server to be ready..."
        for i in {1..60}; do
            if curl -s http://localhost:${LLM_PORT}/health > /dev/null 2>&1; then
                echo "  ✓ Server is ready on port ${LLM_PORT}!"
                exit 0
            fi
            sleep 2
        done
        echo "  ⚠ Server didn't respond within 120 seconds."
        echo "  Check logs: tail -f ${REMOTE_DIR}/server.log"
EOF
}

do_stop() {
    echo ""
    echo "▸ Stopping LLM server..."
    $SSH_CMD "pkill -f 'atomic_family_llm/venv.*server.py' 2>/dev/null && echo '  Server stopped.' || echo '  No server running.'"
}

do_status() {
    echo ""
    echo "▸ Checking server status..."
    $SSH_CMD << EOF
        if pgrep -f "atomic_family_llm/venv.*server.py" > /dev/null 2>&1; then
            PID=\$(pgrep -f "atomic_family_llm/venv.*server.py")
            echo "  Server is RUNNING (PID: \$PID)"
            echo "  Health check:"
            curl -s http://localhost:${LLM_PORT}/health 2>/dev/null || echo "  (not responding yet)"
        else
            echo "  Server is NOT running."
        fi
        
        # GPU status
        echo ""
        echo "  GPU Status:"
        nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || echo "  nvidia-smi not available"
EOF
}

# ── Main ───────────────────────────────────────────────────────────

case "${1:-deploy}" in
    setup)
        do_setup
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
    deploy)
        do_setup
        do_start
        ;;
    *)
        echo "Usage: $0 [setup|start|stop|status|deploy]"
        exit 1
        ;;
esac

echo ""
echo "Done!"
