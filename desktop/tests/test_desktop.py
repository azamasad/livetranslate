import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import pytest

from zeinab_app.session import RATE, Session
from zeinab_engine.engine import Engine, SpeechOutcome, serve
from zeinab_engine.export import SavedLine, transcript_to_text
from zeinab_engine.filter import is_hallucination, present_transcript, strip_overlap
from zeinab_engine.log import DiagnosticLog, LogRefusal, format_event
from zeinab_engine.manifest import ManifestError, assert_allowed, manifest_is_complete, ModelFile
from zeinab_engine.protocol import ProtocolError, read_frame, write_frame
from zeinab_engine.segmenter import Segmenter
from zeinab_engine.settings import Settings, load_settings, save_settings


def signal(ms: int, amplitude: float, rate: int = RATE) -> list[float]:
    return [amplitude] * round(ms / 1000 * rate)


def feed(segmenter: Segmenter, ms: int, amplitude: float, step_ms: int = 100) -> None:
    left = ms
    while left > 0:
        piece = min(step_ms, left)
        segmenter.push(signal(piece, amplitude))
        left -= piece


def test_segmenter_ignores_silence() -> None:
    segmenter = Segmenter(RATE, fixed_threshold=0.05, min_speech_ms=400, silence_ms=300, max_segment_ms=1000)
    feed(segmenter, 1000, 0)
    assert segmenter.shift_final() is None
    assert segmenter.has_draft() is False


def test_segmenter_emits_after_pause() -> None:
    segmenter = Segmenter(
        RATE,
        fixed_threshold=0.05,
        min_speech_ms=400,
        silence_ms=300,
        max_segment_ms=5000,
        draft_every_ms=5000,
    )
    feed(segmenter, 200, 0)
    feed(segmenter, 600, 0.4)
    feed(segmenter, 400, 0)
    segment = segmenter.shift_final()
    assert segment is not None
    assert len(segment.samples) > RATE * 0.5


def test_segmenter_drops_a_blip() -> None:
    segmenter = Segmenter(RATE, fixed_threshold=0.05, min_speech_ms=400, silence_ms=300)
    feed(segmenter, 100, 0.4)
    feed(segmenter, 400, 0)
    assert segmenter.shift_final() is None


def test_hallucinations_are_dropped() -> None:
    for text in ["Thanks for watching", "thanks for watching.", "Music", "[Applause]", "okay. okay. okay."]:
        assert is_hallucination(text)


def test_real_sentence_survives() -> None:
    assert present_transcript("The meeting starts at three.", "") == "The meeting starts at three."


def test_overlap_trim() -> None:
    trimmed = strip_overlap("we meet Mona at the station", "we meet Mona at the station before three")
    assert trimmed == "before three"


def test_log_refuses_the_sentence_and_audio() -> None:
    line = format_event("start", microphone="Built-in", phrase_ms=800, infer_ms=400)
    assert "purple" not in line
    with pytest.raises(LogRefusal):
        format_event("start", text="purple telescope 4821")
    with pytest.raises(LogRefusal):
        format_event("start", pcm16k="A" * 90)


def test_log_file_round_trip(tmp_path: Path) -> None:
    log = DiagnosticLog(tmp_path / "zeinab.log")
    log.write("start", microphone="Built-in")
    assert "Built-in" in log.tail()[0]
    with pytest.raises(LogRefusal):
        log.write("start", text="purple telescope 4821")
    assert "purple" not in log.path.read_text(encoding="utf-8")


def test_manifest_rejects_unlisted_hosts() -> None:
    with pytest.raises(ManifestError):
        assert_allowed("http://huggingface.co/model.bin", {"huggingface.co"})
    with pytest.raises(ManifestError):
        assert_allowed("https://example.com/model.bin", {"huggingface.co"})
    assert_allowed("https://huggingface.co/org/model", {"huggingface.co"})
    assert manifest_is_complete([]) is False
    assert (
        manifest_is_complete([ModelFile("a", "https://huggingface.co/a", "abc", 10), ModelFile("b", "https://huggingface.co/b", "", 10)])
        is False
    )


def test_settings_defaults_and_unknown_fields(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    assert load_settings(path) == Settings()
    path.write_text('{"text_scale": 1.22, "follow": false, "sensitivity": 5, "lines": ["secret"]}', encoding="utf-8")
    loaded = load_settings(path)
    assert loaded.text_scale == 1.22
    assert loaded.follow is False
    assert loaded.sensitivity == 5.0
    assert "secret" not in loaded.to_json()
    save_settings(path, loaded)
    assert "secret" not in path.read_text(encoding="utf-8")


def test_save_text_layout() -> None:
    body = transcript_to_text([SavedLine(1000, "The meeting starts at three.", "جلسه ساعت سه شروع میشه.")])
    assert body.startswith("[00:01]\nEN  The meeting starts at three.\nFA  جلسه")
    missing = transcript_to_text([SavedLine(0, "Hello.", "")])
    assert missing.endswith("FA  —")


def test_engine_drops_hallucination_and_keeps_english_when_persian_fails() -> None:
    engine = Engine(recognize=lambda _samples: SpeechOutcome("Thanks for watching."), translate=lambda _text: "")
    speech = engine.handle({"lane": "speech", "id": 1, "line": 1, "kind": "final", "pcm16k": ""})
    assert speech["text"] == ""
    engine.recognize = lambda _samples: SpeechOutcome("The meeting starts at three.")
    speech = engine.handle({"lane": "speech", "id": 2, "line": 2, "kind": "final", "pcm16k": ""})
    assert speech["text"] == "The meeting starts at three."
    persian = engine.handle({"lane": "translate", "id": 3, "line": 2, "text": speech["text"]})
    assert persian["ok"] is False
    assert "nothing" in persian["error"]


def test_engine_rejects_a_second_speech_job_while_busy() -> None:
    def recognize(_samples: list[float]) -> SpeechOutcome:
        nested = engine.handle({"lane": "speech", "id": 2, "line": 2, "kind": "preview", "pcm16k": ""})
        assert nested["error"] == "busy"
        return SpeechOutcome("The meeting starts at three.")

    engine = Engine(recognize=recognize, translate=lambda text: text)
    result = engine.handle({"lane": "speech", "id": 1, "line": 1, "kind": "final", "pcm16k": ""})
    assert result["text"] == "The meeting starts at three."


def test_protocol_round_trip_and_oversize() -> None:
    stream = BytesIO()
    write_frame(stream, {"lane": "translate", "id": 4, "text": "The meeting starts at three."})
    stream.seek(0)
    assert read_frame(stream)["text"].startswith("The meeting")
    bad = BytesIO()
    bad.write((2_000_001).to_bytes(4, "little"))
    bad.seek(0)
    with pytest.raises(ProtocolError):
        read_frame(bad)


class FakeEngine:
    def __init__(self) -> None:
        self.busy = False
        self.kinds: list[str] = []
        self.translated: list[str] = []

    def handle(self, message: dict) -> dict:
        lane = message["lane"]
        if lane == "speech" and self.busy:
            return {"ok": False, "error": "busy", "text": ""}
        if lane == "cancel":
            self.kinds.append("cancel")
            return {"ok": False, "error": "cancelled"}
        if lane == "speech":
            self.kinds.append(message["kind"])
            text = "a provisional reading of the phrase" if message["kind"] == "preview" else "Mona is coming from Shiraz at 3."
            return {"ok": True, "text": text}
        if lane == "translate":
            self.translated.append(message["text"])
            return {"ok": True, "text": "مونا از شیراز ساعت سه می‌آید."}
        return {"ok": False, "error": "unknown"}


def pump(session: Session, ms: int, amplitude: float) -> None:
    left = ms
    while left > 0:
        piece = min(100, left)
        session.push(signal(piece, amplitude))
        left -= piece


def test_session_sends_one_preview_then_a_final_and_persian() -> None:
    fake = FakeEngine()
    session = Session(engine=fake)
    session.segmenter.fixed_threshold = 0.05
    session.start()
    pump(session, 2600, 0.4)
    assert session.calls[0]["kind"] == "preview"
    assert session.lines[0].live is True
    pump(session, 800, 0)
    kinds = [call.get("kind") for call in session.calls]
    assert kinds.count("preview") == 1
    assert "final" in kinds
    assert fake.translated == ["Mona is coming from Shiraz at 3."]
    assert session.lines[0].persian.startswith("مونا")
    assert session.lines[0].live is False


def test_session_does_not_preview_while_busy_and_cancels_before_final() -> None:
    fake = FakeEngine()
    session = Session(engine=fake)
    session.segmenter.fixed_threshold = 0.05
    session.start()
    session._speech_busy = True
    pump(session, 2600, 0.4)
    assert all(call.get("kind") != "preview" for call in session.calls)
    session._speech_busy = False
    session._preview_job = 7
    session._preview_line = 1
    pump(session, 800, 0)
    lanes = [call["lane"] for call in session.calls]
    assert lanes.index("cancel") < lanes.index("speech")
    assert "a provisional reading" not in fake.translated


def test_clear_drops_a_late_persian_result() -> None:
    fake = FakeEngine()
    session = Session(engine=fake)
    session.segmenter.fixed_threshold = 0.05
    session.start()
    pump(session, 600, 0.4)
    pump(session, 800, 0)
    line_id = session.lines[0].id
    session.clear()
    session.deliver_late(line_id, "نباید دیده شود")
    assert session.lines == []


def test_engine_process_has_no_listening_socket() -> None:
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.Popen(
        [sys.executable, "-m", "zeinab_engine"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        cwd=root,
    )
    assert proc.stdin is not None and proc.stdout is not None
    try:
        write_frame(proc.stdin, {"lane": "speech", "id": 1, "line": 1, "kind": "final", "pcm16k": ""})
        reply = read_frame(proc.stdout)
        assert reply is not None
        assert _listening_sockets(proc.pid) == []
    finally:
        proc.kill()
        proc.wait(timeout=5)


def test_window_stays_idle_until_models_are_pinned(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.delenv("ZEINAB_WHISPER", raising=False)
    monkeypatch.delenv("ZEINAB_NLLB", raising=False)
    from zeinab_app.__main__ import App

    app = App()
    snapshot = app.primary()
    assert snapshot["listening"] is False
    assert snapshot["button"] == "Retry"
    assert "downloaded again" in snapshot["status"]


def test_save_text_from_the_window_records_bytes_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    from zeinab_app.__main__ import App

    app = App()
    app.session.lines.append(
        __import__("zeinab_app.session", fromlist=["Line"]).Line(
            id=1, at_ms=0, english="purple telescope 4821", persian="بنفش", live=False
        )
    )
    body = app.save_text()
    assert "purple telescope 4821" in body
    log_text = app.log.path.read_text(encoding="utf-8")
    assert "purple" not in log_text
    assert "4821" not in log_text
    diagnostics = app.save_diagnostics()
    assert "purple" not in diagnostics


def _listening_sockets(pid: int) -> list[str]:
    listening: set[str] = set()
    for name in ("tcp", "tcp6", "udp", "udp6"):
        path = Path(f"/proc/net/{name}")
        if not path.exists():
            continue
        for line in path.read_text().splitlines()[1:]:
            parts = line.split()
            state = parts[3]
            if name.startswith("tcp") and state != "0A":
                continue
            listening.add(parts[9])
    found = []
    fd_dir = Path(f"/proc/{pid}/fd")
    for entry in fd_dir.iterdir():
        try:
            target = os.readlink(entry)
        except OSError:
            continue
        if target.startswith("socket:["):
            inode = target[8:-1]
            if inode in listening:
                found.append(inode)
    return found
