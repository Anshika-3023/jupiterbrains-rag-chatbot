"""
ingest_documents.py - Document ingestion pipeline.

Steps:
  1. Load all DOCX files from the /data directory.
  2. Extract plain text from each document.
  3. Split into overlapping chunks.
  4. Generate embeddings.
  5. Store in ChromaDB.

Usage:
    python ingest_documents.py            # ingest all docs (skip if already indexed)
    python ingest_documents.py --reset    # wipe collection and re-ingest
"""

import argparse
import hashlib
import logging
import sys
from pathlib import Path

from docx import Document as DocxDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Allow running as a standalone script from backend/app/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import CHUNK_OVERLAP, CHUNK_SIZE, DATA_DIR
from app.vector_store import get_vector_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("ingest")


# ── Helpers ────────────────────────────────────────────────────────────────────


def extract_text_from_docx(path: Path) -> str:
    """Extract all paragraph text from a DOCX file."""
    doc = DocxDocument(str(path))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def chunk_text(text: str, source: str) -> list[dict]:
    """Split text into overlapping chunks; attach source metadata."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    raw_chunks = splitter.split_text(text)

    chunks = []
    for idx, chunk in enumerate(raw_chunks):
        chunk_id = hashlib.md5(f"{source}::{idx}::{chunk[:60]}".encode()).hexdigest()
        chunks.append(
            {
                "id": chunk_id,
                "text": chunk,
                "metadata": {"source": source, "chunk_index": idx},
            }
        )
    return chunks


# ── Main pipeline ──────────────────────────────────────────────────────────────


def ingest(reset: bool = False) -> None:
    store = get_vector_store()

    if reset:
        logger.info("Resetting vector store …")
        store.reset()

    docx_files = sorted(DATA_DIR.glob("*.docx"))
    if not docx_files:
        logger.error("No DOCX files found in %s", DATA_DIR)
        sys.exit(1)

    all_texts: list[str] = []
    all_metadatas: list[dict] = []
    all_ids: list[str] = []

    for docx_path in docx_files:
        source_name = docx_path.stem.replace("___", " & ").replace("_", " ")
        logger.info("Processing: %s", source_name)

        try:
            text = extract_text_from_docx(docx_path)
        except Exception as exc:
            logger.warning("Failed to read %s: %s", docx_path.name, exc)
            continue

        if not text.strip():
            logger.warning("Empty document: %s — skipping.", docx_path.name)
            continue

        chunks = chunk_text(text, source_name)
        for chunk in chunks:
            all_texts.append(chunk["text"])
            all_metadatas.append(chunk["metadata"])
            all_ids.append(chunk["id"])

        logger.info("  → %d chunks from '%s'", len(chunks), source_name)

    if not all_texts:
        logger.error("No text extracted from any document. Aborting.")
        sys.exit(1)

    # ChromaDB upsert is idempotent when IDs are stable (MD5 of content)
    logger.info("Storing %d total chunks in ChromaDB …", len(all_texts))
    store.add_documents(all_texts, all_metadatas, all_ids)
    logger.info("✅ Ingestion complete. Total indexed: %d", store.count())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest DOCX documents into ChromaDB")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Wipe the existing collection before ingesting",
    )
    args = parser.parse_args()
    ingest(reset=args.reset)
