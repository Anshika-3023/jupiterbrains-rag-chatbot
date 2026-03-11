"""
llm_client.py - Groq LLM client.

Sends the retrieved context + user question to a Groq-hosted model
(default: llama-3.3-70b-versatile) and returns the generated answer.

Groq uses an OpenAI-compatible API, so the groq SDK mirrors openai exactly.
Get your API key at: https://console.groq.com/keys
"""

import logging

from groq import Groq, APIError, AuthenticationError, RateLimitError

from app.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    LLM_MAX_TOKENS,
    LLM_TEMPERATURE,
    SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


def _get_client() -> Groq:
    """Initialise and return an authenticated Groq client."""
    if not GROQ_API_KEY:
        raise EnvironmentError(
            "GROQ_API_KEY is not set. "
            "Add it to your .env file. Get a free key at https://console.groq.com/keys"
        )
    return Groq(api_key=GROQ_API_KEY)


def build_messages(context_chunks: list[dict], question: str) -> list[dict]:
    """
    Build the messages list for the Groq chat completion call.

    Uses the standard OpenAI-style system / user message format.
    Context chunks are formatted into the user message body.
    """
    # Build numbered context block from retrieved chunks
    context_parts = []
    for i, chunk in enumerate(context_chunks, 1):
        source = chunk.get("source", "unknown")
        text = chunk.get("text", "").strip()
        context_parts.append(f"[{i}] (Source: {source})\n{text}")

    context_block = "\n\n".join(context_parts)

    user_content = (
        f"<context>\n{context_block}\n</context>\n\n"
        f"Question: {question}\n\n"
        f"Reply in 2-3 sentences max. Be direct and specific — no generic filler."
    )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_content},
    ]


def generate_answer(context_chunks: list[dict], question: str) -> str:
    """
    Call the Groq API and return the LLM-generated answer.

    Args:
        context_chunks: List of retrieved chunk dicts (text, source, distance).
        question:       The user's natural language question.

    Returns:
        The answer as a plain string.

    Raises:
        RuntimeError: On any Groq API or authentication failure.
    """
    client = _get_client()
    messages = build_messages(context_chunks, question)

    logger.debug("Sending request to Groq model '%s' …", GROQ_MODEL)

    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            max_tokens=LLM_MAX_TOKENS,
            temperature=LLM_TEMPERATURE,
            top_p=0.9,
            stream=False,
        )

        answer = completion.choices[0].message.content.strip()

        if not answer:
            answer = (
                "I don't have enough information to answer that. "
                "Please fill out our contact form or book a call with our team."
            )

        logger.debug(
            "Groq response received. Tokens used — prompt: %d, completion: %d",
            completion.usage.prompt_tokens,
            completion.usage.completion_tokens,
        )

        return answer

    except AuthenticationError as exc:
        logger.error("Groq authentication failed — check GROQ_API_KEY: %s", exc)
        raise RuntimeError(
            "LLM authentication failed. Please verify your GROQ_API_KEY."
        ) from exc

    except RateLimitError as exc:
        logger.warning("Groq rate limit hit: %s", exc)
        raise RuntimeError(
            "The AI service is temporarily busy. Please try again in a moment."
        ) from exc

    except APIError as exc:
        logger.error("Groq API error: %s", exc)
        raise RuntimeError(f"LLM generation failed: {exc}") from exc

    except Exception as exc:
        logger.exception("Unexpected error calling Groq: %s", exc)
        raise
