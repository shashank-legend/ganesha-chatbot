"""Business logic for one chat turn: validate, guard, build the prompt, call the provider."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, List, Optional

from ganesha.config import Settings
from ganesha.services import persona, safety
from ganesha.services.llm import ChatMessage, ChatProvider

ALLOWED_ROLES = {"user", "assistant"}


class ValidationError(ValueError):
    """Raised when the client sends a malformed chat request."""


@dataclass(frozen=True)
class ChatRequest:
    history: List[ChatMessage]  # previous turns, oldest first, already trimmed
    message: str  # the new user message
    language: Optional[str]


def parse_request(payload: Any, settings: Settings) -> ChatRequest:
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")

    raw_messages = payload.get("messages")
    if not isinstance(raw_messages, list) or not raw_messages:
        raise ValidationError("'messages' must be a non-empty list.")

    messages: List[ChatMessage] = []
    for item in raw_messages:
        if not isinstance(item, dict):
            raise ValidationError("Each message must be an object with 'role' and 'content'.")
        role, content = item.get("role"), item.get("content")
        if role not in ALLOWED_ROLES or not isinstance(content, str):
            raise ValidationError("Messages need a role of 'user' or 'assistant' and text content.")
        content = safety.sanitize(content)
        if not content:
            continue
        if len(content) > settings.max_message_chars:
            raise ValidationError(f"Messages are limited to {settings.max_message_chars} characters.")
        messages.append(ChatMessage(role, content))

    if not messages or messages[-1].role != "user":
        raise ValidationError("The last message must be a non-empty user message.")

    language = payload.get("language")
    if language is not None and language not in settings.supported_languages:
        raise ValidationError("Unsupported language.")
    if language == "auto":
        language = None

    *history, latest = messages
    history = history[-settings.max_history_messages:]
    return ChatRequest(history=history, message=latest.content, language=language)


class ChatService:
    def __init__(self, provider: ChatProvider):
        self.provider = provider

    def guard(self, request: ChatRequest) -> Optional[str]:
        """Return a canned reply if the message is redirected by the safety guard."""
        return safety.check_message(request.message)

    def build_messages(self, request: ChatRequest) -> List[ChatMessage]:
        system = ChatMessage("system", persona.build_system_prompt(request.language))
        return [system, *request.history, ChatMessage("user", request.message)]

    def stream_reply(self, request: ChatRequest) -> Iterator[str]:
        return self.provider.stream_chat(self.build_messages(request))
