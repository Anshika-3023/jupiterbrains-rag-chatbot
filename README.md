# JupiterBrains RAG Chatbot

A **production-ready Retrieval Augmented Generation (RAG) chatbot** for the JupiterBrains website. Answers visitor questions using company documentation via semantic search + LLM generation.

---

## Architecture

```
User Question
     │
     ▼
Chat Widget (any HTML page)
     │  HTTP POST /chat
     ▼
FastAPI Backend (Python 3.11)
     │
     ├─► Query Embedding  (sentence-transformers · all-MiniLM-L6-v2)
     │
     ├─► Vector Search    (ChromaDB · cosine similarity · top-4 chunks)
     │
     ├─► Prompt Assembly  (system prompt + retrieved context + question)
     │
     ├─► LLM Generation   (Groq API → llama-3.3-70b-versatile)
     │
     └─► JSON Response    { answer, sources }
```

| Layer | Technology |
|---|---|
| Backend API | FastAPI 0.111 + Uvicorn |
| RAG framework | LangChain |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Vector DB | ChromaDB (persistent, cosine similarity) |
| LLM | **Groq API** → `llama-3.3-70b-versatile` |
| Deployment | Docker + Docker Compose |
| Frontend | Vanilla JS widget (CORS-ready, future Framer-compatible) |

---

## Project Structure

```
rag-company-chatbot/
├── data/                          # Source DOCX knowledge base
│   ├── Company___positioning.docx
│   ├── FAQs.docx
│   ├── Implementation___timelines.docx
│   ├── Industries___use_cases.docx
│   ├── Internal_bot_playbook.docx
│   ├── Overview.docx
│   ├── products.docx
│   ├── Startup___partner_programs.docx
│   └── Tech___security.docx
├── backend/
│   └── app/
│       ├── __init__.py
│       ├── main.py                # FastAPI app & routes
│       ├── config.py              # All env-based configuration
│       ├── schemas.py             # Pydantic request/response models
│       ├── ingest_documents.py    # One-time ingestion pipeline
│       ├── vector_store.py        # ChromaDB wrapper
│       ├── llm_client.py          # Groq API client
│       └── rag_pipeline.py        # Retrieval + generation orchestrator
├── frontend/
│   ├── chat-widget.js             # Self-contained chat UI
│   └── chat-widget.css            # Widget styles
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── chroma_db/                     # Auto-created: persisted vector store
├── .env.example                   # Copy to .env and fill in values
├── requirements.txt
└── README.md
```

---

## Environment Variables

```bash
cp .env.example .env
# Edit .env — at minimum set GROQ_API_KEY
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | — | Your Groq API key |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model to use |
| `EMBEDDING_MODEL` | No | `all-MiniLM-L6-v2` | Sentence-transformers model |
| `CHROMA_COLLECTION` | No | `jupiterbrains_docs` | ChromaDB collection name |
| `CHUNK_SIZE` | No | `500` | Characters per chunk |
| `CHUNK_OVERLAP` | No | `80` | Overlap between chunks |
| `TOP_K` | No | `4` | Chunks retrieved per query |
| `LLM_MAX_TOKENS` | No | `512` | Max tokens in LLM response |
| `LLM_TEMPERATURE` | No | `0.2` | LLM temperature |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |

**Get your free Groq API key:** https://console.groq.com/keys

**Available Groq models:**
- `llama-3.3-70b-versatile` — best quality (default)
- `llama-3.1-8b-instant` — fastest / lowest latency
- `mixtral-8x7b-32768` — best for long context
- `gemma2-9b-it` — lightweight alternative

---

## Quick Start (Local Development)

```bash
# 1. Set up environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# → edit .env and add your GROQ_API_KEY

# 2. Ingest documents (run once, or after updating docs)
cd backend
python app/ingest_documents.py

# 3. Start the API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API available at `http://localhost:8000`
Interactive docs at `http://localhost:8000/docs`

---

## Docker Deployment

### Build and run

```bash
docker build -t jupiterbrains-rag-chatbot -f docker/Dockerfile .

docker run -p 8000:8000 \
  -e GROQ_API_KEY=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 \
  -v $(pwd)/chroma_db:/app/chroma_db \
  jupiterbrains-rag-chatbot
```

### Docker Compose (recommended)

```bash
# Create docker/.env
echo "GROQ_API_KEY=your_key_here" > docker/.env

docker compose -f docker/docker-compose.yml up -d --build

# Ingest docs into the running container
docker compose -f docker/docker-compose.yml exec rag-chatbot \
  python backend/app/ingest_documents.py
```

---

## Data Ingestion

The pipeline (`ingest_documents.py`) does:
1. **Load** all `.docx` files from `/data`
2. **Extract** paragraph text via `python-docx`
3. **Chunk** with `RecursiveCharacterTextSplitter` (500 chars, 80 overlap)
4. **Embed** with `all-MiniLM-L6-v2` (384-dim vectors)
5. **Store** in ChromaDB with stable MD5-based IDs (idempotent upsert)

```bash
python app/ingest_documents.py           # Normal ingest (skips duplicates)
python app/ingest_documents.py --reset   # Wipe collection and re-ingest
```

---

## API Reference

### `GET /health`
```json
{
  "status": "ok",
  "vector_store_ready": true,
  "documents_indexed": 312
}
```

### `POST /chat`
**Request:**
```json
{ "question": "What industries do you support?" }
```
**Response:**
```json
{
  "answer": "JupiterBrains serves BFSI, healthcare, logistics, government, and HR/marketing with domain-aware SLMs deployed fully on-premise...",
  "sources": ["Industries & use cases", "Overview"]
}
```

---

## Frontend Widget

The widget (`frontend/chat-widget.js` + `chat-widget.css`) is a self-contained floating chat UI. Drop it into any HTML page:

```html
<link rel="stylesheet" href="./chat-widget.css">
<script>
  window.JBChatConfig = {
    apiUrl: "https://YOUR_BACKEND_URL"
  };
</script>
<script src="./chat-widget.js" defer></script>
```

**Config options:**

| Option | Default | Description |
|---|---|---|
| `apiUrl` | `http://localhost:8000` | Backend URL |
| `botName` | `Jupiter` | Name shown in header |
| `botSubtitle` | `JupiterBrains AI Assistant` | Subtitle in header |
| `welcomeMessage` | (default greeting) | First message shown |
| `suggestions` | (4 chips) | Quick-question buttons |
| `showSources` | `false` | Show source doc names under answers |

**Programmatic control:**
```javascript
window.JBChat.open()             // Open the chat window
window.JBChat.close()            // Close the chat window
window.JBChat.send("How does pricing work?")  // Send a message
```

---

## Future Framer Integration

The backend and widget are already built for seamless Framer integration when ready. Steps:

1. Deploy the backend to a public URL (Railway, Render, Fly.io, VPS, etc.)
2. Host `chat-widget.js` and `chat-widget.css` on a CDN
3. Set `ALLOWED_ORIGINS=https://yoursite.framer.app` in backend `.env`
4. In Framer, add an **Embed** component and paste:

```html
<link rel="stylesheet" href="https://YOUR_CDN/chat-widget.css">
<script>
  window.JBChatConfig = { apiUrl: "https://YOUR_BACKEND_URL" };
</script>
<script src="https://YOUR_CDN/chat-widget.js" defer></script>
```

No code changes needed — the CORS headers, widget API, and response format are all already Framer-compatible.

---

## Troubleshooting

**`GROQ_API_KEY is not set`**
Add the key to `.env`. Get one free at https://console.groq.com/keys.

**`Vector store is empty`**
Run `python app/ingest_documents.py` before starting the server.

**CORS errors**
Set `ALLOWED_ORIGINS` to your exact frontend URL in `.env`.

**Slow first response**
The embedding model (~90 MB) downloads on first use. Subsequent calls are fast.

**Docker volume permission error**
```bash
sudo chown -R 1000:1000 ./chroma_db
```

---

## Production Checklist

- [ ] Set `GROQ_API_KEY` via a secrets manager (not plain .env)
- [ ] Set `ALLOWED_ORIGINS` to exact domain(s) — never `*` in production
- [ ] Use HTTPS on the backend (Nginx/Caddy reverse proxy)
- [ ] Add rate limiting on `/chat` (Nginx or WAF)
- [ ] Set up monitoring (Sentry, Datadog, etc.)
- [ ] Automate re-ingestion on doc updates (CI/CD webhook)

---

## License

MIT © JupiterBrains
