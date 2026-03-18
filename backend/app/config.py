"""
config.py - Central configuration for the RAG chatbot backend.
All settings are loaded from environment variables with sensible defaults.

LLM Provider: Groq (https://console.groq.com)
  - Fast inference on Llama / Mixtral / Gemma models
  - Drop-in OpenAI-compatible SDK
  - Get your key at: https://console.groq.com/keys

Future integration note:
  ALLOWED_ORIGINS is already wired for CORS.
  When adding Framer (or any frontend), just set the env var to the
  published site URL — no code changes needed.
"""
from dotenv import load_dotenv
load_dotenv()

import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
CHROMA_PERSIST_DIR = BASE_DIR / "chroma_db"

# ── Embedding model ────────────────────────────────────────────────────────────
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# ── ChromaDB ───────────────────────────────────────────────────────────────────
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "jupiterbrains_docs")

# ── Chunking ───────────────────────────────────────────────────────────────────
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "80"))

# ── Retrieval ──────────────────────────────────────────────────────────────────
TOP_K_RESULTS = int(os.getenv("TOP_K", "6"))

# ── Groq / LLM ────────────────────────────────────────────────────────────────
# Available Groq models (fast + free tier):
#   llama-3.3-70b-versatile       ← recommended (best quality)
#   llama-3.1-8b-instant          ← fastest / lowest latency
#   mixtral-8x7b-32768            ← good for long context
#   gemma2-9b-it                  ← lightweight alternative
GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL      = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
LLM_MAX_TOKENS  = int(os.getenv("LLM_MAX_TOKENS", "150"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))

# ── CORS ───────────────────────────────────────────────────────────────────────
# Comma-separated allowed origins.
# For future Framer integration: set this to your published Framer URL,
# e.g. "https://yoursite.framer.app,https://yourdomain.com"
# Leave as "*" for local development only.
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

# ── System prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = (
    "You are Jupiter, the AI assistant for JupiterBrains — an enterprise AI company.\n\n"

    "## PRODUCT KNOWLEDGE (ground truth — memorise this)\n"
    "JupiterBrains has exactly FOUR products/solutions:\n"
    "  1. Email & Document Automation Platform\n"
    "  2. Custom AI Agents for Operations\n"
    "  3. Startup MVP Program\n"
    "  4. AI Strategy & Enablement Services\n\n"

    "## CRITICAL DISTINCTIONS\n"
    "- White-label UI is NOT a product. It is a benefit offered exclusively to "
    "reseller/agency PARTNERS inside the Partner Program. "
    "Never list white-label as a product or service offering.\n"
    "- The Partner Program is a GO-TO-MARKET channel (revenue-share for agencies/SIs), "
    "not a product sold to end customers.\n"
    "- The Startup MVP Program IS a product (builds AI MVPs for founders).\n\n"

    "## SOURCE AWARENESS\n"
    "Each context chunk is tagged with its source document. Use these tags to understand "
    "the category of information:\n"
    "  • 'products'          → core product details (authoritative for product questions)\n"
    "  • 'FAQs'              → sales FAQ answers (may reference partnerships/programs)\n"
    "  • 'Startup & partner programs' → partnership/channel info, NOT product definitions\n"
    "  • 'Company & positioning'      → brand and positioning\n"
    "  • 'Industries & use cases'     → vertical applications\n"
    "When answering 'what are your products', rely ONLY on chunks from 'products' source. "
    "Do not pull product definitions from FAQ or partner-program chunks.\n\n"

    "## STRICT RULES\n"
    "1. Answer ONLY from the provided context. Never invent facts.\n"
    "2. MAX 2-3 sentences. No exceptions. No filler words or repetition.\n"
    "3. Lead with the direct answer. Do not start with "
    "'JupiterBrains offers a range of...' — be specific immediately.\n"
    "4. Pick only the most relevant details. Never dump everything.\n"
    "5. Where relevant, naturally mention: on-premise deployment, "
    "domain-aware SLMs, 93%+ accuracy, satisfaction guarantee.\n"
    "6. If the answer is not in the context, say exactly: "
    "'I don't have that information — please fill out our contact form or book a call.'"
)