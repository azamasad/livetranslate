"""Save text. UTF-8, no BOM, the same layout as the browser exporter."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SavedLine:
    at_ms: int
    english: str
    persian: str


def format_clock(ms: int) -> str:
    total = max(0, ms // 1000)
    hours = total // 3600
    minutes = (total % 3600) // 60
    seconds = total % 60
    mm = f"{minutes:02d}"
    ss = f"{seconds:02d}"
    if hours:
        return f"{hours}:{mm}:{ss}"
    return f"{mm}:{ss}"


def transcript_to_text(lines: list[SavedLine]) -> str:
    blocks = []
    for line in lines:
        persian = line.persian.strip() if line.persian.strip() else "—"
        blocks.append(f"[{format_clock(line.at_ms)}]\nEN  {line.english.strip()}\nFA  {persian}")
    return "\n\n".join(blocks).strip()
