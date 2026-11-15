"""Tests for the OpenAI-compatible HTTP provider using a fake requests session."""
import json
from dataclasses import replace

import pytest
import requests

from ganesha.config import load_llm_settings
from ganesha.services.llm import ChatMessage, ProviderError
from ganesha.services.llm.openai_compatible import OpenAICompatibleProvider

from .conftest import make_settings

MESSAGES = [ChatMessage("system", "be kind"), ChatMessage("user", "hi")]


class FakeResponse:
    def __init__(self, status=200, lines=(), body=None, headers=None):
        self.status_code = status
        self._lines = list(lines)
        self._body = body
        self.headers = headers or {}
        self.text = json.dumps(body) if body is not None else ""
        self.closed = False

    def iter_lines(self, chunk_size=512, decode_unicode=False):
        for line in self._lines:
            if isinstance(line, Exception):
                raise line
            yield line if decode_unicode else line.encode("utf-8")

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, response=None, exc=None):
        self.response = response
        self.exc = exc
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.exc:
            raise self.exc
        return self.response


def sse(*deltas):
    lines = [f"data: {json.dumps({'choices': [{'delta': {'content': d}}]})}" for d in deltas]
    return lines + ["", ": keep-alive comment", "data: [DONE]"]


def provider_with(response=None, exc=None, **settings_overrides):
    settings = replace(make_settings().llm, **settings_overrides)
    session = FakeSession(response, exc)
    return OpenAICompatibleProvider(settings, session=session), session


def test_streams_text_chunks_and_sends_expected_request():
    provider, session = provider_with(FakeResponse(lines=sse("Nam", "aste")))
    assert list(provider.stream_chat(MESSAGES)) == ["Nam", "aste"]

    url, kwargs = session.calls[0]
    assert url == "https://example.test/v1/chat/completions"
    assert kwargs["headers"]["Authorization"] == "Bearer test-key"
    assert kwargs["json"]["model"] == "test-model"
    assert kwargs["json"]["stream"] is True
    assert kwargs["json"]["messages"][1] == {"role": "user", "content": "hi"}
    assert kwargs["timeout"] == (10, 5)


def test_complete_chat_joins_stream():
    provider, _ = provider_with(FakeResponse(lines=sse("a", "b", "c")))
    assert provider.complete_chat(MESSAGES) == "abc"


def test_missing_api_key_raises_not_configured():
    provider, session = provider_with(api_key=None)
    with pytest.raises(ProviderError) as info:
        list(provider.stream_chat(MESSAGES))
    assert info.value.code == "not_configured"
    assert session.calls == []


@pytest.mark.parametrize(
    "status, code",
    [(429, "rate_limited"), (401, "auth"), (403, "auth"), (400, "bad_request"), (500, "upstream"), (503, "upstream")],
)
def test_http_errors_are_mapped(status, code):
    provider, _ = provider_with(FakeResponse(status=status, body={"error": {"message": "nope"}}, headers={"retry-after": "7"}))
    with pytest.raises(ProviderError) as info:
        list(provider.stream_chat(MESSAGES))
    assert info.value.code == code
    if status == 429:
        assert info.value.retry_after == 7
        assert info.value.status == 429


def test_timeout_and_network_errors():
    provider, _ = provider_with(exc=requests.Timeout())
    with pytest.raises(ProviderError) as info:
        list(provider.stream_chat(MESSAGES))
    assert info.value.code == "timeout"

    provider, _ = provider_with(exc=requests.ConnectionError())
    with pytest.raises(ProviderError) as info:
        list(provider.stream_chat(MESSAGES))
    assert info.value.code == "network"


def test_error_event_inside_stream():
    lines = sse("ok")[:1] + ['data: {"error": {"message": "overloaded"}}']
    provider, _ = provider_with(FakeResponse(lines=lines))
    stream = provider.stream_chat(MESSAGES)
    assert next(stream) == "ok"
    with pytest.raises(ProviderError) as info:
        next(stream)
    assert "overloaded" in info.value.message


def test_connection_drop_mid_stream():
    response = FakeResponse(lines=sse("ok")[:1] + [requests.ConnectionError()])
    provider, _ = provider_with(response)
    with pytest.raises(ProviderError) as info:
        list(provider.stream_chat(MESSAGES))
    assert info.value.code == "network"
    assert response.closed


def test_settings_from_environment(monkeypatch):
    for var in ["LLM_PROVIDER", "LLM_MODEL", "LLM_BASE_URL", "LLM_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"]:
        monkeypatch.delenv(var, raising=False)

    monkeypatch.setenv("GROQ_API_KEY", " abc ")
    groq = load_llm_settings()
    assert groq.provider == "groq"
    assert groq.base_url == "https://api.groq.com/openai/v1"
    assert groq.model == "openai/gpt-oss-120b"
    assert groq.api_key == "abc"
    assert groq.is_configured

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "g")
    gemini = load_llm_settings()
    assert gemini.base_url.startswith("https://generativelanguage.googleapis.com")
    assert not gemini.is_configured  # model must be chosen explicitly

    monkeypatch.setenv("LLM_PROVIDER", "nope")
    with pytest.raises(ValueError):
        load_llm_settings()


def test_stream_without_charset_is_decoded_as_utf8():
    """Regression: Groq sends 'text/event-stream' with no charset; requests would default to Latin-1."""
    import io

    body = "".join(f"{line}\n" for line in sse("Namaste 🙏 ", "व्यास ", "Mahābhārata"))
    real = requests.Response()
    real.status_code = 200
    real.headers["Content-Type"] = "text/event-stream"
    real.raw = io.BytesIO(body.encode("utf-8"))
    provider, _ = provider_with(real)
    assert "".join(provider.stream_chat(MESSAGES)) == "Namaste 🙏 व्यास Mahābhārata"
