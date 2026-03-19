"""
main.py - FastAPI application.

Endpoints:
  GET  /health         — health check
  POST /save-email     — save user email
  POST /chat           — RAG chat (also saves message history)
  GET  /emails         — admin: all users + message counts
  GET  /chats          — admin: all chats grouped by user
  GET  /chats/{email}  — admin: chat history for one user
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ALLOWED_ORIGINS
from app.database import (
    init_db, save_email, get_all_emails,
    save_message, get_chat_history, get_all_chats,
)
from app.rag_pipeline import run_rag_pipeline
from app.schemas import (
    ChatRequest, ChatResponse, HealthResponse,
    SaveEmailRequest, SaveEmailResponse,
)
from app.vector_store import get_vector_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up …")
    store = get_vector_store()
    logger.info("Vector store: %d chunks indexed.", store.count())
    init_db()
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="JupiterBrains RAG Chatbot API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_error(request: Request, exc: Exception):
    import traceback
    logger.exception("Unhandled: %s", exc)
    return JSONResponse(status_code=500, content={"detail": traceback.format_exc()})


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check():
    store = get_vector_store()
    count = store.count()
    return HealthResponse(status="ok", vector_store_ready=count > 0, documents_indexed=count)


@app.post("/save-email", response_model=SaveEmailResponse, tags=["users"])
async def capture_email(req: SaveEmailRequest):
    """Save user email when they open the chat."""
    saved = save_email(email=str(req.email), name=req.name)
    return SaveEmailResponse(
        success=True,
        message="Welcome! You can now start chatting." if saved else "Welcome back!",
    )


@app.post("/chat", response_model=ChatResponse, tags=["chat"])
async def chat(req: ChatRequest):
    """
    RAG chat endpoint.
    Saves both user question and bot answer to chat_messages table.
    """
    logger.info("Chat [%s]: '%s'", req.email or "anonymous", req.question[:60])

    try:
        result = run_rag_pipeline(req.question)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    answer  = result["answer"]
    sources = result["sources"]

    # Save chat history if email provided
    if req.email and "@" in req.email:
        save_message(email=req.email, role="user",    message=req.question)
        save_message(email=req.email, role="bot",     message=answer, sources=sources)

    return ChatResponse(answer=answer, sources=sources)


# ── Admin endpoints ─────────────────────────────────────────────────────────────

@app.get("/emails", tags=["admin"])
async def list_emails():
    """All users with total message counts."""
    users = get_all_emails()
    return {"total_users": len(users), "users": users}


@app.get("/chats", tags=["admin"])
async def list_all_chats():
    """All chat conversations grouped by user email."""
    chats = get_all_chats()
    return {"total_users": len(chats), "chats": chats}


@app.get("/chats/{email}", tags=["admin"])
async def get_user_chat(email: str):
    """Full chat history for a specific user email."""
    messages = get_chat_history(email)
    if not messages:
        raise HTTPException(status_code=404, detail="No chat history found for this email.")
    return {
        "email":          email,
        "total_messages": len(messages),
        "messages":       messages,
    }