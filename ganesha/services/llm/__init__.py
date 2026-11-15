"""AI provider abstraction.

``create_provider`` is the single place that decides which implementation is
used, so switching providers only requires changing environment variables.
"""
from __future__ import annotations

from ganesha.config import LLMSettings
from .base import ChatMessage, ChatProvider, ProviderError
from .openai_compatible import OpenAICompatibleProvider


def create_provider(settings: LLMSettings) -> ChatProvider:
    # All supported providers currently speak the OpenAI wire format. A provider
    # with a different API would get its own ChatProvider subclass here.
    return OpenAICompatibleProvider(settings)


__all__ = ["ChatMessage", "ChatProvider", "ProviderError", "create_provider"]
