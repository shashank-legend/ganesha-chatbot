"""Centralised application configuration.

All settings come from environment variables (optionally loaded from a local
``.env`` file). Nothing secret is ever hardcoded here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, Optional

# Known OpenAI-compatible providers with genuinely usable free tiers.
# Base URLs are taken from each provider's official documentation.
PROVIDER_PRESETS: Dict[str, Dict[str, str]] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "openai/gpt-oss-120b",
        "key_env": "GROQ_API_KEY",
        "label": "Groq",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "",  # model names change often; set LLM_MODEL explicitly
        "key_env": "GEMINI_API_KEY",
        "label": "Google Gemini",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "",  # pick any ':free' model id, e.g. from openrouter.ai/models
        "key_env": "OPENROUTER_API_KEY",
        "label": "OpenRouter",
    },
}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer, got {raw!r}") from exc


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be a number, got {raw!r}") from exc


@dataclass(frozen=True)
class LLMSettings:
    provider: str
    label: str
    base_url: str
    model: str
    api_key: Optional[str]
    temperature: float
    max_tokens: int
    timeout_seconds: float

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.model and self.base_url)


@dataclass(frozen=True)
class Settings:
    llm: LLMSettings
    # Conversation limits (input validation / cost control)
    max_message_chars: int = 4000
    max_history_messages: int = 20
    log_level: str = "INFO"
    supported_languages: Dict[str, str] = field(
        default_factory=lambda: {
            "auto": "Auto language",
            "en": "English",
            "hi": "Hindi",
            "mr": "Marathi",
            "ta": "Tamil",
        }
    )


def load_llm_settings() -> LLMSettings:
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
    preset = PROVIDER_PRESETS.get(provider)

    if preset is None and provider != "custom":
        known = ", ".join(sorted(list(PROVIDER_PRESETS) + ["custom"]))
        raise ValueError(f"Unknown LLM_PROVIDER {provider!r}. Choose one of: {known}")

    preset = preset or {"base_url": "", "default_model": "", "key_env": "LLM_API_KEY", "label": "Custom"}

    api_key = os.getenv(preset["key_env"]) or os.getenv("LLM_API_KEY")
    return LLMSettings(
        provider=provider,
        label=preset["label"],
        base_url=(os.getenv("LLM_BASE_URL") or preset["base_url"]).rstrip("/"),
        model=os.getenv("LLM_MODEL") or preset["default_model"],
        api_key=api_key.strip() if api_key else None,
        temperature=_env_float("LLM_TEMPERATURE", 0.7),
        max_tokens=_env_int("LLM_MAX_TOKENS", 800),
        timeout_seconds=_env_float("LLM_TIMEOUT_SECONDS", 30.0),
    )


def load_settings() -> Settings:
    return Settings(
        llm=load_llm_settings(),
        max_message_chars=_env_int("MAX_MESSAGE_CHARS", 4000),
        max_history_messages=_env_int("MAX_HISTORY_MESSAGES", 20),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
