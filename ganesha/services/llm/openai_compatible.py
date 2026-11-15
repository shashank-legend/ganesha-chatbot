"""Chat provider for any OpenAI-compatible ``/chat/completions`` endpoint.

Groq, Google Gemini (OpenAI compatibility layer) and OpenRouter all expose the
same request/response shape, so one small HTTP client covers all of them
without pulling in a vendor SDK.
"""
from __future__ import annotations

import json
import logging
from typing import Iterator, List, Optional

import requests

from ganesha.config import LLMSettings
from .base import ChatMessage, ChatProvider, ProviderError

log = logging.getLogger(__name__)


def _retry_after_seconds(response: requests.Response) -> Optional[int]:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return max(1, int(float(raw)))
    except ValueError:
        return None


def _error_detail(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        return str(err.get("message", ""))[:200]
    if isinstance(body, list) and body and isinstance(body[0], dict):  # Gemini sometimes wraps errors in a list
        inner = body[0].get("error", {})
        return str(inner.get("message", ""))[:200]
    return str(err or body)[:200]


class OpenAICompatibleProvider(ChatProvider):
    def __init__(self, settings: LLMSettings, session: Optional[requests.Session] = None):
        self.settings = settings
        self.name = settings.provider
        self._session = session or requests.Session()

    # -- public API -------------------------------------------------------
    def stream_chat(self, messages: List[ChatMessage]) -> Iterator[str]:
        response = self._post(messages, stream=True)
        try:
            yield from self._iter_sse(response)
        finally:
            response.close()

    # -- internals --------------------------------------------------------
    def _post(self, messages: List[ChatMessage], stream: bool) -> requests.Response:
        if not self.settings.api_key:
            raise ProviderError(
                "not_configured",
                f"No API key configured for {self.settings.label}. "
                "Copy .env.example to .env and add your key.",
                status=503,
            )
        if not self.settings.model:
            raise ProviderError("not_configured", "LLM_MODEL is not set for this provider.", status=503)

        payload = {
            "model": self.settings.model,
            "messages": [m.to_dict() for m in messages],
            "temperature": self.settings.temperature,
            "max_tokens": self.settings.max_tokens,
            "stream": stream,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.base_url}/chat/completions"

        try:
            response = self._session.post(
                url,
                json=payload,
                headers=headers,
                stream=stream,
                timeout=(10, self.settings.timeout_seconds),
            )
        except requests.Timeout as exc:
            raise ProviderError("timeout", "The AI service took too long to respond.", status=504) from exc
        except requests.RequestException as exc:
            log.warning("Network error talking to %s: %s", self.settings.label, exc)
            raise ProviderError("network", "Could not reach the AI service.", status=502) from exc

        if response.status_code == 200:
            return response

        detail = _error_detail(response)
        log.warning("%s returned HTTP %s: %s", self.settings.label, response.status_code, detail)
        status = response.status_code
        response.close()

        if status == 429:
            raise ProviderError(
                "rate_limited",
                "Too many requests right now. Please wait a moment and try again.",
                status=429,
                retry_after=_retry_after_seconds(response),
            )
        if status in (401, 403):
            raise ProviderError("auth", "The AI provider rejected the API key. Check your .env file.", status=502)
        if status == 400:
            raise ProviderError("bad_request", f"The AI provider rejected the request: {detail}", status=502)
        raise ProviderError("upstream", "The AI service is having trouble. Please try again shortly.", status=502)

    def _iter_sse(self, response: requests.Response) -> Iterator[str]:
        """Parse a Server-Sent Events stream of chat-completion chunks."""
        try:
            # chunk_size=None yields data as soon as it arrives instead of buffering 512 bytes.
            # Lines are decoded as UTF-8 explicitly: SSE is always UTF-8, but providers send
            # "text/event-stream" without a charset, and requests would fall back to Latin-1
            # (garbling emoji and non-English text such as Hindi).
            for raw_bytes in response.iter_lines(chunk_size=None):
                raw_line = raw_bytes.decode("utf-8", errors="replace") if isinstance(raw_bytes, bytes) else raw_bytes
                if not raw_line or not raw_line.startswith("data:"):
                    continue
                data = raw_line[len("data:"):].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    log.debug("Skipping malformed SSE line: %r", data[:80])
                    continue
                if isinstance(chunk, dict) and chunk.get("error"):
                    message = chunk["error"].get("message", "stream error") if isinstance(chunk["error"], dict) else str(chunk["error"])
                    raise ProviderError("upstream", f"The AI service reported an error: {message}")
                for choice in chunk.get("choices", []):
                    text = (choice.get("delta") or {}).get("content")
                    if text:
                        yield text
        except requests.Timeout as exc:
            raise ProviderError("timeout", "The AI service stopped responding mid-reply.", status=504) from exc
        except requests.RequestException as exc:
            raise ProviderError("network", "The connection to the AI service was interrupted.") from exc
