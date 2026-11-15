"""JSON / streaming API consumed by the frontend.

Chat replies are streamed as newline-delimited JSON (NDJSON) events:

    {"type": "delta", "text": "..."}
    {"type": "done"}
    {"type": "error", "code": "...", "message": "...", "retryAfter": 10}

Errors that happen before the first token are returned as a normal JSON
response with an HTTP error status instead.
"""
from __future__ import annotations

import json
import logging
from typing import Iterator, Optional

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from ganesha.services import persona
from ganesha.services.chat_service import ChatService, ValidationError, parse_request
from ganesha.services.llm import ProviderError

log = logging.getLogger(__name__)
bp = Blueprint("api", __name__, url_prefix="/api")


def _event(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def error_response(code: str, message: str, status: int, retry_after: Optional[int] = None):
    body = {"error": {"code": code, "message": message}}
    if retry_after:
        body["error"]["retryAfter"] = retry_after
    response = jsonify(body)
    response.status_code = status
    if retry_after:
        response.headers["Retry-After"] = str(retry_after)
    return response


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/config")
def config():
    settings = current_app.config["SETTINGS"]
    return jsonify(
        {
            "greeting": persona.GREETING,
            "languages": settings.supported_languages,
            "maxMessageChars": settings.max_message_chars,
            "provider": {
                "name": settings.llm.label,
                "model": settings.llm.model,
                "configured": settings.llm.is_configured,
            },
        }
    )


@bp.post("/chat")
def chat():
    settings = current_app.config["SETTINGS"]
    service: ChatService = current_app.config["CHAT_SERVICE"]

    try:
        chat_request = parse_request(request.get_json(silent=True), settings)
    except ValidationError as exc:
        return error_response("invalid_request", str(exc), 400)

    redirect = service.guard(chat_request)
    if redirect:
        log.info("Message redirected by safety guard")
        return Response(
            _event({"type": "delta", "text": redirect}) + _event({"type": "done", "filtered": True}),
            mimetype="application/x-ndjson",
        )

    stream = service.stream_reply(chat_request)
    # Pull the first chunk eagerly so configuration, auth and rate-limit errors
    # become proper HTTP errors rather than a half-open stream.
    try:
        first_chunk = next(stream)
    except StopIteration:
        return error_response("empty_reply", "The AI returned an empty reply. Please try again.", 502)
    except ProviderError as exc:
        return error_response(exc.code, exc.message, exc.status, exc.retry_after)

    def generate() -> Iterator[str]:
        yield _event({"type": "delta", "text": first_chunk})
        try:
            for chunk in stream:
                yield _event({"type": "delta", "text": chunk})
        except ProviderError as exc:
            log.warning("Stream interrupted: %s", exc.message)
            yield _event({"type": "error", "code": exc.code, "message": exc.message})
            return
        yield _event({"type": "done"})

    return Response(
        stream_with_context(generate()),
        mimetype="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
