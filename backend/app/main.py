"""
main.py - FastAPI application entry point.

Endpoints:
  GET  /health  — health check + vector store status
  POST /chat    — main RAG chat endpoint
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ALLOWED_ORIGINS
from app.rag_pipeline import run_rag_pipeline
from app.schemas import ChatRequest, ChatResponse, HealthResponse
from app.vector_store import get_vector_store

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("main")


# ── Lifespan (startup / shutdown) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up the vector store on startup."""
    logger.info("Starting up — initialising vector store …")
    store = get_vector_store()
    logger.info("Vector store ready. %d chunks indexed.", store.count())
    yield
    logger.info("Shutting down.")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="JupiterBrains RAG Chatbot API",
    description="Retrieval-Augmented Generation chatbot powered by ChromaDB + Replicate.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Global error handler ───────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again later."},
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check():
    """Return API health status and vector store info."""
    store = get_vector_store()
    count = store.count()
    return HealthResponse(
        status="ok",
        vector_store_ready=count > 0,
        documents_indexed=count,
    )


@app.post("/chat", response_model=ChatResponse, tags=["chat"])
async def chat(request: ChatRequest):
    """
    Main RAG chat endpoint.

    Accepts a user question, retrieves relevant chunks from ChromaDB,
    generates an answer via Replicate, and returns it.
    """
    logger.info("Chat request: '%s'", request.question[:80])

    try:
        result = run_rag_pipeline(request.question)
    except RuntimeError as exc:
        # LLM or retrieval error — return a user-friendly 503
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
    )
