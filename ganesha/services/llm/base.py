"""Provider-agnostic interface for chat-completion models.

Any AI provider can be plugged into the chatbot by implementing
:class:`ChatProvider`. The rest of the app only depends on this interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator, List, Optional


@dataclass(frozen=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class ProviderError(Exception):
    """Raised when the AI provider cannot produce a reply.

    ``code`` is a stable machine-readable value that the frontend uses to show
    a helpful message. ``retry_after`` is set (in seconds) for rate limits.
    """

    def __init__(self, code: str, message: str, status: int = 502, retry_after: Optional[int] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retry_after = retry_after


class ChatProvider(ABC):
    name: str = "provider"

    @abstractmethod
    def stream_chat(self, messages: List[ChatMessage]) -> Iterator[str]:
        """Yield the reply incrementally as text chunks."""

    def complete_chat(self, messages: List[ChatMessage]) -> str:
        """Return the full reply (default: join the stream)."""
        return "".join(self.stream_chat(messages))
