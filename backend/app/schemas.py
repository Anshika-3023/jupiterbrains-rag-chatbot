"""
schemas.py - Pydantic models for API request and response validation.
"""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming chat message from the user."""
    question: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The user's question",
        examples=["What industries do you support?"],
    )


class ChatResponse(BaseModel):
    """Response returned to the frontend."""
    answer: str = Field(..., description="Generated answer from the RAG pipeline")
    sources: list[str] = Field(
        default_factory=list,
        description="Source document names used to generate the answer",
    )


class HealthResponse(BaseModel):
    """Basic health-check response."""
    status: str
    vector_store_ready: bool
    documents_indexed: int
