"""Ganesha Guide — a Ganesha-inspired AI chatbot (Flask application factory)."""
from __future__ import annotations

import logging
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, request
from werkzeug.exceptions import HTTPException

from ganesha.config import Settings, load_settings
from ganesha.routes import api_bp, pages_bp
from ganesha.services.chat_service import ChatService
from ganesha.services.llm import ChatProvider, create_provider


def create_app(settings: Optional[Settings] = None, provider: Optional[ChatProvider] = None) -> Flask:
    """Build the Flask app. ``settings`` and ``provider`` can be injected for tests."""
    if settings is None:
        load_dotenv()
        settings = load_settings()

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    log = logging.getLogger("ganesha")

    app = Flask(__name__)
    app.config["SETTINGS"] = settings
    app.config["CHAT_SERVICE"] = ChatService(provider or create_provider(settings.llm))
    app.config["MAX_CONTENT_LENGTH"] = 256 * 1024  # reject oversized request bodies

    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)

    from ganesha.routes.api import error_response

    @app.errorhandler(HTTPException)
    def handle_http_error(exc: HTTPException):
        if request.path.startswith("/api/"):
            return error_response(exc.name.lower().replace(" ", "_"), exc.description or exc.name, exc.code or 500)
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected(exc: Exception):
        log.exception("Unhandled error")
        return error_response("internal", "Something went wrong on the server.", 500)

    if settings.llm.is_configured:
        log.info("Using %s model %s", settings.llm.label, settings.llm.model)
    else:
        log.warning("AI provider %s is not configured. Add an API key to .env (see .env.example).", settings.llm.label)

    return app
