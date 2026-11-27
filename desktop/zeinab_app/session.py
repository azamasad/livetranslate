"""Turns microphone chunks into one preview and one final per phrase.

Persian is requested only for a finished English line. A busy speech lane does not
receive a preview. Closing a phrase cancels an in-flight preview before the final.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from zeinab_engine.export import SavedLine
from zeinab_engine.segmenter import Segmenter

RATE = 16_000
PREVIEW_SECONDS = 2.5


@dataclass
class Line:
    id: int
    at_ms: int
    english: str = ""
    persian: str = ""
    live: bool = True
    persian_error: str = ""


@dataclass
class Session:
    engine: object
    segmenter: Segmenter = field(default_factory=lambda: Segmenter(RATE))
    lines: list[Line] = field(default_factory=list)
    listening: bool = False
    started_at_samples: int = 0
    heard_samples: int = 0
    _next_job: int = 1
    _preview_job: int | None = None
    _preview_line: int | None = None
    _speech_busy: bool = False
    calls: list[dict] = field(default_factory=list)

    def start(self) -> None:
        self.listening = True
        if self.started_at_samples == 0:
            self.started_at_samples = 1
        self.heard_samples = 0

    def stop(self) -> None:
        self.listening = False
        self._cancel_preview()
        self.segmenter.flush()
        final = self.segmenter.shift_final()
        if final is not None:
            self._finish(final.samples, final.id)

    def clear(self) -> None:
        self._cancel_preview()
        self.lines.clear()
        self.started_at_samples = 0
        self.heard_samples = 0

    def push(self, chunk: list[float]) -> None:
        if not self.listening:
            return
        self.segmenter.push(chunk)
        self.heard_samples += len(chunk)
        final = self.segmenter.shift_final()
        if final is not None:
            self._cancel_preview()
            self._finish(final.samples, final.id)
            return
        self._maybe_preview()

    def deliver_late(self, line_id: int, persian: str) -> None:
        for line in self.lines:
            if line.id == line_id and line.live is False and not line.persian:
                line.persian = persian
                return

    def _maybe_preview(self) -> None:
        if self._speech_busy or self._preview_line is not None:
            return
        if not self.segmenter.has_draft():
            return
        draft = self.segmenter.take_draft()
        if draft is None or len(draft.samples) < int(PREVIEW_SECONDS * RATE):
            return
        self._preview_line = draft.id
        self._preview_job = self._job()
        result = self._ask(
            {
                "lane": "speech",
                "id": self._preview_job,
                "line": draft.id,
                "kind": "preview",
                "pcm16k": "",
                "samples": draft.samples,
            }
        )
        if result.get("error") == "busy":
            self._preview_job = None
            self._preview_line = None
            return
        text = str(result.get("text", ""))
        if text:
            self._upsert_live(draft.id, text)

    def _finish(self, samples: list[float], line_id: int) -> None:
        job = self._job()
        result = self._ask(
            {
                "lane": "speech",
                "id": job,
                "line": line_id,
                "kind": "final",
                "pcm16k": "",
                "samples": samples,
            }
        )
        text = str(result.get("text", "")).strip()
        if not text:
            self._drop_empty(line_id)
            return
        line = self._upsert_live(line_id, text)
        line.live = False
        translated = self._ask({"lane": "translate", "id": self._job(), "line": line_id, "text": text})
        if translated.get("ok") and line_id in {item.id for item in self.lines}:
            line.persian = str(translated.get("text", ""))
        elif line_id in {item.id for item in self.lines}:
            line.persian_error = str(translated.get("error", "The translator returned nothing."))

    def _cancel_preview(self) -> None:
        if self._preview_job is None:
            return
        self._ask({"lane": "cancel", "id": self._preview_job, "line": self._preview_line})
        self._preview_job = None
        self._preview_line = None

    def _ask(self, message: dict) -> dict:
        self.calls.append({key: value for key, value in message.items() if key != "samples"})
        if message["lane"] == "speech":
            self._speech_busy = True
        result = self.engine.handle(message)  # type: ignore[attr-defined]
        if message["lane"] == "speech":
            self._speech_busy = False
        return result

    def _upsert_live(self, line_id: int, english: str) -> Line:
        for line in self.lines:
            if line.id == line_id:
                line.english = english
                return line
        line = Line(id=line_id, at_ms=int(self.heard_samples / RATE * 1000), english=english, live=True)
        self.lines.append(line)
        return line

    def _drop_empty(self, line_id: int) -> None:
        self.lines = [line for line in self.lines if line.id != line_id or line.english]

    def _job(self) -> int:
        job = self._next_job
        self._next_job += 1
        return job

    def saved_lines(self) -> list[SavedLine]:
        return [
            SavedLine(line.at_ms, line.english, line.persian)
            for line in self.lines
            if not line.live and line.english
        ]
