"""Lightweight input guard for a family-friendly festival booth.

The original project blocked any message containing words such as "hate", which
also blocked genuine worries like "I hate how anxious I feel". This version
only redirects clearly political or deliberately disrespectful requests and
leaves everything else to the model's system prompt.
"""
from __future__ import annotations

import re
from typing import Optional

_POLITICAL = re.compile(
    r"\b(politics?|political|politicians?|elections?|ballot|political part(y|ies)|"
    r"vote for|voting for|which party)\b",
    re.IGNORECASE,
)

_DISRESPECT = re.compile(
    r"\b(insult|mock|make fun of|roast|abuse)\b.{0,40}\b(god|gods|religion|religions|hindus?|muslims?|"
    r"christians?|sikhs?|jains?|buddhists?|jews?|community|caste)\b",
    re.IGNORECASE,
)

POLITICAL_REDIRECT = (
    "My big ears are always open, dear friend, but I stay away from politics and elections. "
    "Shall we talk instead about what is on your heart, or a small step you can take today?"
)

DISRESPECT_REDIRECT = (
    "Every path to the divine deserves respect, so I will not make fun of any faith or community. "
    "Is there something troubling you that I can help you think through?"
)


def check_message(text: str) -> Optional[str]:
    """Return a gentle redirect reply if the message should not reach the model."""
    if _DISRESPECT.search(text):
        return DISRESPECT_REDIRECT
    if _POLITICAL.search(text):
        return POLITICAL_REDIRECT
    return None


def sanitize(text: str) -> str:
    """Normalise user input: strip control characters and surrounding whitespace."""
    cleaned = "".join(ch for ch in text if ch in "\n\t" or ord(ch) >= 32)
    return cleaned.strip()
