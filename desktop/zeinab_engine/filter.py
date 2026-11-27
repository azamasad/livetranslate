"""English cleanup shared with the browser page.

The rules match src/text/transcript.ts. A dropped line is not shown and not translated.
"""

from __future__ import annotations

import re

HALLUCINATIONS = [
    re.compile(r"untertitel", re.I),
    re.compile(r"amara\.org", re.I),
    re.compile(r"vielen dank (fürs|für's|furs) zuschauen", re.I),
    re.compile(r"thanks for watching", re.I),
    re.compile(r"thank you for watching", re.I),
    re.compile(r"bitte abonnieren", re.I),
    re.compile(r"sous[- ]?titr", re.I),
    re.compile(
        r"^\W*(musik|music|applaus|applause|gelächter|laughter|stille|silence|lacht|lachen|seufzer|räuspern)\W*$",
        re.I,
    ),
    re.compile(r"^(\[|\()?\s*(musik|music|applaus|applause|gelächter|laughter)\s*(\]|\))?$", re.I),
]

_PUNCT = re.compile(r"\s+([,.;:!?،؛؟])")
_WORD = re.compile(r"^[^\w]+|[^\w]+$", re.UNICODE)


def clean_transcript(raw: str) -> str:
    text = re.sub(r"\s+", " ", raw)
    text = _PUNCT.sub(r"\1", text)
    return text.strip()


def _normalize_word(word: str) -> str:
    return _WORD.sub("", word).lower()


def is_hallucination(text: str) -> bool:
    trimmed = text.strip()
    if len(trimmed) < 2:
        return True
    if any(pattern.search(trimmed) for pattern in HALLUCINATIONS):
        return True
    parts = [part.strip().lower() for part in re.split(r"[.!?]+", trimmed) if part.strip()]
    if len(parts) >= 3 and len(set(parts)) == 1 and len(parts[0]) < 24:
        return True
    return False


def strip_overlap(previous: str, nxt: str) -> str:
    prior = previous.strip()
    current = nxt.strip()
    if not current:
        return ""
    if not prior:
        return current
    prior_words = prior.split()
    next_words = current.split()
    prior_key = " ".join(_normalize_word(word) for word in prior_words)
    next_key = " ".join(_normalize_word(word) for word in next_words)
    if prior_key == next_key:
        return ""
    limit = min(8, len(prior_words), len(next_words))
    for count in range(limit, 2, -1):
        tail = " ".join(_normalize_word(word) for word in prior_words[-count:])
        head = " ".join(_normalize_word(word) for word in next_words[:count])
        if tail and tail == head:
            return " ".join(next_words[count:]).strip()
    return current


def present_transcript(raw: str, previous_final: str) -> str:
    cleaned = clean_transcript(raw)
    if not cleaned or is_hallucination(cleaned):
        return ""
    stripped = strip_overlap(previous_final, cleaned)
    if not stripped or is_hallucination(stripped):
        return ""
    return stripped
