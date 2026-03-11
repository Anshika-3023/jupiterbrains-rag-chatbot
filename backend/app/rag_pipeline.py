"""
rag_pipeline.py - Orchestrates the full RAG pipeline.

Flow:
  1. Embed the user's question.
  2. Search ChromaDB for top-k relevant chunks.
  3. Pass chunks + question to the Replicate LLM.
  4. Return the answer and source metadata.
"""

import logging

from app.llm_client import generate_answer
from app.vector_store import get_vector_store
from app.config import TOP_K_RESULTS

logger = logging.getLogger(__name__)


def run_rag_pipeline(question: str) -> dict:
    """
    Execute the full RAG pipeline for a user question.

    Args:
        question: Natural language question from the user.

    Returns:
        dict with keys:
          - answer  (str)       : LLM-generated answer
          - sources (list[str]) : Deduplicated list of source doc names
          - chunks  (list[dict]): Raw retrieved chunks (for debugging)
    """
    if not question.strip():
        return {
            "answer": "Please ask a question.",
            "sources": [],
            "chunks": [],
        }

    # ── Step 1: Vector retrieval ───────────────────────────────────────────────
    store = get_vector_store()

    if store.count() == 0:
        logger.error("Vector store is empty — run ingest_documents.py first.")
        return {
            "answer": (
                "The knowledge base is not yet populated. "
                "Please contact us via the form or book a call."
            ),
            "sources": [],
            "chunks": [],
        }

    chunks = store.similarity_search(question, k=TOP_K_RESULTS)
    logger.info(
        "Retrieved %d chunks for query: '%s…'",
        len(chunks),
        question[:60],
    )

    # ── Step 2: LLM generation ─────────────────────────────────────────────────
    answer = generate_answer(chunks, question)

    # ── Step 3: Collect unique source names ────────────────────────────────────
    sources = list(dict.fromkeys(c["source"] for c in chunks))

    return {
        "answer": answer,
        "sources": sources,
        "chunks": chunks,  # omitted from API response but useful for logging
    }
