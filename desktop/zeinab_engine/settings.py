"""Settings that may persist. Lines never go in this file."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class Settings:
    microphone_id: str = ""
    text_scale: float = 1.0
    follow: bool = True
    sensitivity: float = 3.5

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2) + "\n"


def load_settings(path: Path) -> Settings:
    if not path.exists():
        return Settings()
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return Settings()
    scale = raw.get("text_scale", 1.0)
    sensitivity = raw.get("sensitivity", 3.5)
    if not isinstance(scale, (int, float)) or scale not in (0.9, 1, 1.22):
        scale = 1.0
    if not isinstance(sensitivity, (int, float)) or not 1.5 <= float(sensitivity) <= 8:
        sensitivity = 3.5
    microphone = raw.get("microphone_id", "")
    return Settings(
        microphone_id=microphone if isinstance(microphone, str) else "",
        text_scale=float(scale),
        follow=bool(raw.get("follow", True)),
        sensitivity=float(sensitivity),
    )


def save_settings(path: Path, settings: Settings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(settings.to_json(), encoding="utf-8")
