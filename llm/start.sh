#!/usr/bin/env bash
# Quick-start script for running on the GPU server directly.
# Usage: cd ~/atomic_family_llm && ./start.sh

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

export LLM_MODEL="${LLM_MODEL:-Qwen/Qwen2.5-3B-Instruct}"
export LLM_PORT="${LLM_PORT:-8000}"
export LLM_MAX_MODEL_LEN="${LLM_MAX_MODEL_LEN:-4096}"
export LLM_GPU_MEMORY="${LLM_GPU_MEMORY:-0.85}"

echo "Starting Atomic Family LLM..."
echo "  Model: ${LLM_MODEL}"
echo "  Port:  ${LLM_PORT}"

source venv/bin/activate
python server.py
