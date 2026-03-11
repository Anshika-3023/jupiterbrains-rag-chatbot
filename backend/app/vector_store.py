"""
vector_store.py - ChromaDB vector store management.

Compatible with chromadb 0.5.x (uses PersistentClient).
"""

import logging
from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer

from app.config import (
    CHROMA_COLLECTION_NAME,
    CHROMA_PERSIST_DIR,
    EMBEDDING_MODEL,
    TOP_K_RESULTS,
)

logger = logging.getLogger(__name__)


class VectorStore:
    """Wrapper around ChromaDB for document storage and retrieval."""

    def __init__(self) -> None:
        self._embedding_model = SentenceTransformer(EMBEDDING_MODEL)

        # chromadb 0.5.x API
        self._client = chromadb.PersistentClient(path=str(CHROMA_PERSIST_DIR))

        self._collection = self._client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "VectorStore ready — collection '%s', %d chunks indexed.",
            CHROMA_COLLECTION_NAME,
            self._collection.count(),
        )

    # ── Public helpers ─────────────────────────────────────────────────────────

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of text strings."""
        return self._embedding_model.encode(texts, show_progress_bar=False).tolist()

    def add_documents(
        self,
        chunks: list[str],
        metadatas: list[dict[str, Any]],
        ids: list[str],
    ) -> None:
        """Add pre-chunked documents to the collection."""
        embeddings = self.embed(chunks)
        self._collection.upsert(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
        logger.info("Upserted %d chunks into ChromaDB.", len(chunks))

    def similarity_search(self, query: str, k: int = TOP_K_RESULTS) -> list[dict]:
        """
        Search for the k most relevant chunks.

        Returns a list of dicts with keys:
          - text      (str)  : chunk content
          - source    (str)  : source filename
          - distance  (float): cosine distance (lower = more similar)
        """
        query_embedding = self.embed([query])[0]
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )

        hits: list[dict] = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            hits.append(
                {
                    "text": doc,
                    "source": meta.get("source", "unknown"),
                    "distance": dist,
                }
            )
        return hits

    def count(self) -> int:
        """Return the number of indexed chunks."""
        return self._collection.count()

    def reset(self) -> None:
        """Delete and recreate the collection (use with care)."""
        self._client.delete_collection(CHROMA_COLLECTION_NAME)
        self._collection = self._client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.warning("Collection '%s' has been reset.", CHROMA_COLLECTION_NAME)


# Module-level singleton
_store_instance: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Return the shared VectorStore instance (lazy initialisation)."""
    global _store_instance
    if _store_instance is None:
        _store_instance = VectorStore()
    return _store_instance