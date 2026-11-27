"""Phrase cutter. The numbers match SpeechSegmenter in the browser page.

Production defaults close a phrase after 700 ms of quiet, ignore blips under 450 ms,
keep 240 ms of pre-roll, and force a close at 8 seconds.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


def _rms(samples: list[float]) -> float:
    if not samples:
        return 0.0
    total = 0.0
    for sample in samples:
        total += sample * sample
    return math.sqrt(total / len(samples))


def _ms_to_samples(ms: int, sample_rate: int) -> int:
    return max(1, round(ms / 1000 * sample_rate))


@dataclass
class SpeechSegment:
    id: int
    samples: list[float]
    sample_rate: int


@dataclass
class Segmenter:
    sample_rate: int
    sensitivity: float = 3.5
    silence_ms: int = 700
    min_speech_ms: int = 450
    max_segment_ms: int = 8000
    draft_every_ms: int = 2500
    pre_roll_ms: int = 240
    overlap_ms: int = 320
    fixed_threshold: float | None = None
    noise: float = 0.012
    _buffer: list[list[float]] = field(default_factory=list)
    _buffer_samples: int = 0
    _pre_roll: list[list[float]] = field(default_factory=list)
    _pre_roll_samples: int = 0
    _speaking: bool = False
    _silence_samples: int = 0
    _speech_samples: int = 0
    _since_draft_samples: int = 0
    _open_id: int = 1
    _pending: list[SpeechSegment] = field(default_factory=list)

    def push(self, chunk: list[float]) -> None:
        if not chunk:
            return
        energy = _rms(chunk)
        voiced = energy >= self._threshold()
        if not self._speaking:
            self.noise = self.noise * 0.95 + energy * 0.05
            self._push_pre_roll(chunk)
            if voiced:
                self._begin_from_pre_roll(len(chunk))
            return
        self._buffer.append(chunk)
        self._buffer_samples += len(chunk)
        self._speech_samples += len(chunk)
        self._since_draft_samples += len(chunk)
        self._silence_samples = 0 if voiced else self._silence_samples + len(chunk)
        if self._silence_samples >= _ms_to_samples(self.silence_ms, self.sample_rate):
            self._close_on_silence()
            return
        if self._buffer_samples >= _ms_to_samples(self.max_segment_ms, self.sample_rate):
            self._emit_final(True)

    def has_draft(self) -> bool:
        if not self._speaking:
            return False
        min_samples = _ms_to_samples(self.min_speech_ms, self.sample_rate)
        draft_every = _ms_to_samples(self.draft_every_ms, self.sample_rate)
        return self._buffer_samples >= min_samples and self._since_draft_samples >= draft_every

    def take_draft(self) -> SpeechSegment | None:
        if not self.has_draft():
            return None
        self._since_draft_samples = 0
        return SpeechSegment(self._open_id, _concat(self._buffer), self.sample_rate)

    def shift_final(self) -> SpeechSegment | None:
        if not self._pending:
            return None
        return self._pending.pop(0)

    def flush(self) -> None:
        if not self._speaking:
            return
        min_samples = _ms_to_samples(self.min_speech_ms, self.sample_rate)
        voiced = self._speech_samples - self._silence_samples
        if voiced >= min_samples:
            self._emit_final(False)
        else:
            self._reset_open()

    def _threshold(self) -> float:
        if self.fixed_threshold is not None:
            return self.fixed_threshold
        return min(0.2, max(0.006, self.noise * self.sensitivity))

    def _push_pre_roll(self, chunk: list[float]) -> None:
        self._pre_roll.append(chunk)
        self._pre_roll_samples += len(chunk)
        limit = _ms_to_samples(self.pre_roll_ms, self.sample_rate)
        while self._pre_roll_samples > limit and len(self._pre_roll) > 1:
            removed = self._pre_roll.pop(0)
            self._pre_roll_samples -= len(removed)

    def _begin_from_pre_roll(self, voiced_samples: int) -> None:
        self._buffer = self._pre_roll
        self._buffer_samples = self._pre_roll_samples
        self._pre_roll = []
        self._pre_roll_samples = 0
        self._speaking = True
        self._silence_samples = 0
        self._speech_samples = voiced_samples
        self._since_draft_samples = 0

    def _close_on_silence(self) -> None:
        min_samples = _ms_to_samples(self.min_speech_ms, self.sample_rate)
        voiced = self._buffer_samples - self._silence_samples
        if voiced < min_samples:
            self._reset_open()
            return
        self._emit_final(False)

    def _emit_final(self, keep_overlap: bool) -> None:
        full = _concat(self._buffer)
        trimmed = _trim_trailing_silence(full, self.sample_rate, self._threshold())
        if trimmed:
            self._pending.append(SpeechSegment(self._open_id, trimmed, self.sample_rate))
        overlap = _ms_to_samples(self.overlap_ms, self.sample_rate)
        tail = full[-overlap:] if keep_overlap and len(full) > overlap else None
        self._reset_open()
        if tail:
            self._buffer = [tail]
            self._buffer_samples = len(tail)
            self._speaking = True
            self._speech_samples = len(tail)
            self._since_draft_samples = 0

    def _reset_open(self) -> None:
        self._buffer = []
        self._buffer_samples = 0
        self._silence_samples = 0
        self._speech_samples = 0
        self._since_draft_samples = 0
        self._speaking = False
        self._open_id += 1


def _concat(parts: list[list[float]]) -> list[float]:
    out: list[float] = []
    for part in parts:
        out.extend(part)
    return out


def _trim_trailing_silence(samples: list[float], sample_rate: int, threshold: float) -> list[float]:
    window = max(1, round(sample_rate * 0.02))
    end = len(samples)
    while end > window:
        if _rms(samples[end - window : end]) >= threshold * 0.6:
            break
        end -= window
    keep = round(sample_rate * 0.12)
    end = min(len(samples), end + keep)
    if end >= len(samples) - window:
        return samples
    return samples[: max(end, window)]
