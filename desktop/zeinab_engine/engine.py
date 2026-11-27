"""zeinab-engine. One speech job at a time. Persian never blocks the next English job.

Models load only when a directory is given. Tests pass a fake recognizer.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import BinaryIO, Callable

from zeinab_engine.filter import present_transcript
from zeinab_engine.protocol import ProtocolError, read_frame, write_frame

NO_SPEECH = 0.6


@dataclass
class SpeechOutcome:
    text: str
    no_speech_prob: float = 0.0


class Engine:
    def __init__(
        self,
        recognize: Callable[[list[float]], SpeechOutcome] | None = None,
        translate: Callable[[str], str] | None = None,
    ) -> None:
        self.recognize = recognize
        self.translate = translate
        self.previous_final = ""
        self._cancel: set[int] = set()
        self._lock = threading.Lock()
        self._speech_busy = False
        self.dropped_audio = 0

    def cancel(self, job_id: int) -> None:
        with self._lock:
            self._cancel.add(job_id)

    def cancelled(self, job_id: int) -> bool:
        with self._lock:
            return job_id in self._cancel

    def handle(self, message: dict) -> dict:
        lane = message.get("lane")
        job_id = int(message.get("id", 0))
        line = message.get("line")
        if lane == "cancel":
            self.cancel(job_id)
            self.dropped_audio += 1
            return {"lane": "speech", "id": job_id, "line": line, "kind": "preview", "ok": False, "error": "cancelled"}
        if lane == "speech":
            return self._speech(message, job_id, line)
        if lane == "translate":
            return self._translate(message, job_id, line)
        return {"lane": lane or "speech", "id": job_id, "ok": False, "error": "unknown lane"}

    def _speech(self, message: dict, job_id: int, line: object) -> dict:
        kind = message.get("kind", "final")
        with self._lock:
            if self._speech_busy:
                return {
                    "lane": "speech",
                    "id": job_id,
                    "line": line,
                    "kind": kind,
                    "ok": False,
                    "error": "busy",
                }
            self._speech_busy = True
        try:
            if self.cancelled(job_id):
                return {"lane": "speech", "id": job_id, "line": line, "kind": kind, "ok": False, "error": "cancelled"}
            if self.recognize is None:
                return {
                    "lane": "speech",
                    "id": job_id,
                    "line": line,
                    "kind": kind,
                    "ok": False,
                    "error": "The speech model is not loaded yet.",
                }
            pcm = message.get("pcm16k")
            samples = _decode_pcm(pcm) if isinstance(pcm, str) else []
            if self.cancelled(job_id):
                samples.clear()
                return {"lane": "speech", "id": job_id, "line": line, "kind": kind, "ok": False, "error": "cancelled"}
            outcome = self.recognize(samples)
            samples.clear()
            if self.cancelled(job_id):
                return {"lane": "speech", "id": job_id, "line": line, "kind": kind, "ok": False, "error": "cancelled"}
            if outcome.no_speech_prob > NO_SPEECH:
                text = ""
            else:
                previous = "" if kind == "preview" else self.previous_final
                text = present_transcript(outcome.text, previous)
            if kind == "final" and text:
                self.previous_final = text
            return {"lane": "speech", "id": job_id, "line": line, "kind": kind, "ok": True, "text": text}
        finally:
            with self._lock:
                self._speech_busy = False

    def _translate(self, message: dict, job_id: int, line: object) -> dict:
        if self.cancelled(job_id):
            return {"lane": "translate", "id": job_id, "line": line, "ok": False, "error": "cancelled"}
        text = str(message.get("text", "")).strip()
        if self.translate is None:
            return {
                "lane": "translate",
                "id": job_id,
                "line": line,
                "ok": False,
                "error": "The Persian model is not loaded yet.",
            }
        if not text:
            return {"lane": "translate", "id": job_id, "line": line, "ok": False, "error": "The translator returned nothing."}
        persian = self.translate(text).strip()
        if not persian:
            return {"lane": "translate", "id": job_id, "line": line, "ok": False, "error": "The translator returned nothing."}
        return {"lane": "translate", "id": job_id, "line": line, "ok": True, "text": persian}


def serve(stdin: BinaryIO, stdout: BinaryIO, engine: Engine) -> None:
    while True:
        try:
            message = read_frame(stdin)
        except ProtocolError as exc:
            write_frame(stdout, {"lane": "log", "event": "error", "error": str(exc)})
            return
        if message is None:
            return
        if message.get("lane") == "log":
            continue
        result = engine.handle(message)
        write_frame(stdout, result)


def _decode_pcm(payload: str) -> list[float]:
    import base64
    import struct

    raw = base64.b64decode(payload.encode("ascii"), validate=False)
    count = len(raw) // 4
    return list(struct.unpack(f"<{count}f", raw[: count * 4]))
