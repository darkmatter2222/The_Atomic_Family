#!/usr/bin/env python3
"""
The Atomic Family — LLM Inference Server
=========================================
Wraps vLLM to serve Qwen 2.5 3B Instruct with an OpenAI-compatible API.
Adds a /health endpoint and configurable parameters via environment variables.

Usage (on GPU server):
    python server.py

Or via vLLM's built-in server:
    python -m vllm.entrypoints.openai.api_server \
        --model Qwen/Qwen2.5-3B-Instruct \
        --host 0.0.0.0 --port 8000 \
        --max-model-len 4096 \
        --gpu-memory-utilization 0.85

Environment variables:
    LLM_MODEL          Model name on HuggingFace (default: Qwen/Qwen2.5-3B-Instruct)
    LLM_PORT           Port to listen on (default: 8000)
    LLM_MAX_MODEL_LEN  Max context length (default: 4096)
    LLM_GPU_MEMORY     GPU memory utilization 0-1 (default: 0.85)
"""

import os
import sys
import json
import time
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("atomic-llm")

# ── Configuration ──────────────────────────────────────────────────
MODEL_NAME     = os.environ.get("LLM_MODEL", "Qwen/Qwen2.5-3B-Instruct")
PORT           = int(os.environ.get("LLM_PORT", 8000))
MAX_MODEL_LEN  = int(os.environ.get("LLM_MAX_MODEL_LEN", 4096))
GPU_MEMORY     = float(os.environ.get("LLM_GPU_MEMORY", 0.85))
HOST           = os.environ.get("LLM_HOST_BIND", "0.0.0.0")

# ── Try to import vLLM ─────────────────────────────────────────────
try:
    from vllm import LLM, SamplingParams
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    VLLM_AVAILABLE = True
except ImportError as e:
    logger.warning(f"vLLM not available ({e}). Install with: pip install vllm")
    VLLM_AVAILABLE = False

# ═══════════════════════════════════════════════════════════════════
#  FastAPI App
# ═══════════════════════════════════════════════════════════════════

if VLLM_AVAILABLE:
    app = FastAPI(title="Atomic Family LLM", version="1.0.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    # ── Load model ─────────────────────────────────────────────────
    logger.info(f"Loading model: {MODEL_NAME} (max_len={MAX_MODEL_LEN}, gpu_mem={GPU_MEMORY})")
    llm = LLM(
        model=MODEL_NAME,
        max_model_len=MAX_MODEL_LEN,
        gpu_memory_utilization=GPU_MEMORY,
        trust_remote_code=True,
        dtype="half",
    )
    logger.info("Model loaded successfully!")

    # ── Request / Response schemas ─────────────────────────────────

    class ChatMessage(BaseModel):
        role: str
        content: str

    class ChatCompletionRequest(BaseModel):
        model: Optional[str] = MODEL_NAME
        messages: list[ChatMessage]
        temperature: Optional[float] = 0.7
        max_tokens: Optional[int] = 512
        top_p: Optional[float] = 0.9
        stop: Optional[list[str]] = None

    class CompletionRequest(BaseModel):
        model: Optional[str] = MODEL_NAME
        prompt: str
        temperature: Optional[float] = 0.7
        max_tokens: Optional[int] = 512
        top_p: Optional[float] = 0.9
        stop: Optional[list[str]] = None

    # ── Endpoints ──────────────────────────────────────────────────

    @app.get("/health")
    async def health():
        return {"status": "ok", "model": MODEL_NAME, "timestamp": time.time()}

    @app.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [{"id": MODEL_NAME, "object": "model", "owned_by": "local"}]
        }

    @app.post("/v1/chat/completions")
    async def chat_completions(request: ChatCompletionRequest):
        """OpenAI-compatible chat completions endpoint."""
        try:
            # Build prompt from messages using Qwen chat template
            prompt_parts = []
            for msg in request.messages:
                if msg.role == "system":
                    prompt_parts.append(f"<|im_start|>system\n{msg.content}<|im_end|>")
                elif msg.role == "user":
                    prompt_parts.append(f"<|im_start|>user\n{msg.content}<|im_end|>")
                elif msg.role == "assistant":
                    prompt_parts.append(f"<|im_start|>assistant\n{msg.content}<|im_end|>")
            prompt_parts.append("<|im_start|>assistant\n")
            full_prompt = "\n".join(prompt_parts)

            sampling_params = SamplingParams(
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                stop=request.stop or ["<|im_end|>", "<|im_start|>"],
            )

            outputs = llm.generate([full_prompt], sampling_params)
            generated_text = outputs[0].outputs[0].text.strip()

            return {
                "id": f"chatcmpl-{int(time.time()*1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": MODEL_NAME,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": generated_text},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": len(full_prompt.split()),
                    "completion_tokens": len(generated_text.split()),
                    "total_tokens": len(full_prompt.split()) + len(generated_text.split())
                }
            }
        except Exception as e:
            logger.error(f"Chat completion error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/v1/completions")
    async def completions(request: CompletionRequest):
        """OpenAI-compatible text completions endpoint."""
        try:
            sampling_params = SamplingParams(
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                stop=request.stop or ["<|im_end|>"],
            )

            outputs = llm.generate([request.prompt], sampling_params)
            generated_text = outputs[0].outputs[0].text.strip()

            return {
                "id": f"cmpl-{int(time.time()*1000)}",
                "object": "text_completion",
                "created": int(time.time()),
                "model": MODEL_NAME,
                "choices": [{
                    "text": generated_text,
                    "index": 0,
                    "finish_reason": "stop"
                }]
            }
        except Exception as e:
            logger.error(f"Completion error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ── Main ───────────────────────────────────────────────────────
    if __name__ == "__main__":
        logger.info(f"Starting Atomic Family LLM server on {HOST}:{PORT}")
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")

else:
    # Fallback: print instructions if vLLM is not installed
    if __name__ == "__main__":
        print("=" * 60)
        print("  Atomic Family LLM Server — Setup Required")
        print("=" * 60)
        print()
        print("vLLM is not installed. To set up:")
        print()
        print("  1. Create a virtual environment:")
        print("     python -m venv venv")
        print("     source venv/bin/activate")
        print()
        print("  2. Install requirements:")
        print("     pip install -r requirements.txt")
        print()
        print("  3. Run this server:")
        print("     python server.py")
        print()
        print("  Or use vLLM's built-in server directly:")
        print(f"     python -m vllm.entrypoints.openai.api_server \\")
        print(f"         --model {MODEL_NAME} \\")
        print(f"         --host 0.0.0.0 --port {PORT} \\")
        print(f"         --max-model-len {MAX_MODEL_LEN}")
        print()
        sys.exit(1)
