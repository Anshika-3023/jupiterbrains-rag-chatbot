"""
schemas.py - Pydantic models for request/response validation.
"""

from pydantic import BaseModel, Field, EmailStr


class ChatRequest(BaseModel):
    """Incoming chat message — now includes user email to save history."""
    question: str = Field(..., min_length=1, max_length=2000)
    email:    str = Field(default="", description="User email for saving chat history")


class ChatResponse(BaseModel):
    answer:  str       = Field(...)
    sources: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status:              str
    vector_store_ready:  bool
    documents_indexed:   int


class SaveEmailRequest(BaseModel):
    email: EmailStr
    name:  str = Field(default="")


class SaveEmailResponse(BaseModel):
    success: bool
    message: str