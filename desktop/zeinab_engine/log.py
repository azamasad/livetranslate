"""Diagnostic log. Transcripts, translations, and audio are refused."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ALLOWED = {
    "event",
    "microphone",
    "model",
    "phrase_ms",
    "infer_ms",
    "threads",
    "windows_build",
    "version",
    "error",
    "bytes",
}
FORBIDDEN_KEYS = {"text", "pcm", "pcm16k", "english", "persian", "audio", "transcript", "path"}
_LONG_B64 = re.compile(r"[A-Za-z0-9+/=]{81,}")


class LogRefusal(Exception):
    pass


def format_event(event: str, **fields: object) -> str:
    unknown = set(fields) - ALLOWED
    if unknown:
        raise LogRefusal(f"field is not allowed: {', '.join(sorted(unknown))}")
    banned = FORBIDDEN_KEYS.intersection(fields)
    if banned:
        raise LogRefusal("transcript fields are not logged")
    payload = {"event": event, **fields}
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    if _LONG_B64.search(line):
        raise LogRefusal("audio-like data is not logged")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{stamp} info {line}\n"


class DiagnosticLog:
    def __init__(self, path: Path, max_bytes: int = 2_000_000, keep: int = 3) -> None:
        self.path = path
        self.max_bytes = max_bytes
        self.keep = keep
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event: str, **fields: object) -> None:
        line = format_event(event, **fields)
        self._rotate()
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line)

    def tail(self, limit: int = 200) -> list[str]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()
        return lines[-limit:]

    def _rotate(self) -> None:
        if not self.path.exists() or self.path.stat().st_size < self.max_bytes:
            return
        oldest = self.path.with_name(f"{self.path.name}.{self.keep}")
        if oldest.exists():
            oldest.unlink()
        for index in range(self.keep - 1, 0, -1):
            source = self.path.with_name(f"{self.path.name}.{index}")
            target = self.path.with_name(f"{self.path.name}.{index + 1}")
            if source.exists():
                source.rename(target)
        self.path.rename(self.path.with_name(f"{self.path.name}.1"))
