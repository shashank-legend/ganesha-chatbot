from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator, List, Optional

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ganesha import create_app  # noqa: E402
from ganesha.config import LLMSettings, Settings  # noqa: E402
from ganesha.services.llm import ChatMessage, ChatProvider, ProviderError  # noqa: E402


class FakeProvider(ChatProvider):
    """Records the prompt it receives and replays scripted chunks."""

    name = "fake"

    def __init__(self, chunks: Optional[List[str]] = None, error: Optional[ProviderError] = None, fail_after: Optional[int] = None):
        self.chunks = chunks if chunks is not None else ["Namaste", ", friend!"]
        self.error = error
        self.fail_after = fail_after
        self.calls: List[List[ChatMessage]] = []

    def stream_chat(self, messages: List[ChatMessage]) -> Iterator[str]:
        self.calls.append(messages)
        if self.error and self.fail_after is None:
            raise self.error
        for i, chunk in enumerate(self.chunks):
            if self.fail_after is not None and i == self.fail_after:
                raise self.error
            yield chunk


def make_settings(**overrides) -> Settings:
    llm = LLMSettings(
        provider="groq",
        label="Groq",
        base_url="https://example.test/v1",
        model="test-model",
        api_key="test-key",
        temperature=0.5,
        max_tokens=100,
        timeout_seconds=5,
    )
    return Settings(llm=llm, **overrides)


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(provider):
    app = create_app(settings=make_settings(max_message_chars=200, max_history_messages=4), provider=provider)
    app.testing = True
    return app.test_client()
