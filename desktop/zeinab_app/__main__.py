"""Zeinab's window. It does not open a port. Chrome is not involved."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from zeinab_app.session import Session
from zeinab_engine.engine import Engine, SpeechOutcome
from zeinab_engine.export import transcript_to_text
from zeinab_engine.log import DiagnosticLog
from zeinab_engine.settings import load_settings, save_settings


def data_dir() -> Path:
    if os.name == "nt":
        root = os.environ.get("LOCALAPPDATA")
        if root:
            return Path(root) / "Zeinab"
    return Path.home() / ".local" / "share" / "Zeinab"


class App:
    def __init__(self) -> None:
        root = data_dir()
        root.mkdir(parents=True, exist_ok=True)
        self.log = DiagnosticLog(root / "logs" / "zeinab.log")
        self.settings_path = root / "settings.json"
        self.settings = load_settings(self.settings_path)
        whisper = os.environ.get("ZEINAB_WHISPER", "")
        nllb = os.environ.get("ZEINAB_NLLB", "")
        self.models_ready = bool(whisper and nllb and Path(whisper).exists() and Path(nllb).exists())
        self.engine = Engine(
            recognize=_load_speech(whisper) if self.models_ready else None,
            translate=_load_persian(nllb) if self.models_ready else None,
        )
        self.session = Session(engine=self.engine)
        self.session.segmenter.sensitivity = self.settings.sensitivity
        self.status = "Microphone allowed" if self.models_ready else "The speech model has to be downloaded again."
        self.button = "Start listening" if self.models_ready else "Retry"
        self.level = 0.0
        self.confirm_clear = False
        self.log.write("launch", version="0.1.0")

    def snapshot(self) -> dict:
        lines = [
            {
                "id": line.id,
                "english": line.english,
                "persian": line.persian,
                "persianError": line.persian_error,
                "live": line.live,
            }
            for line in self.session.lines
        ]
        return {
            "status": self.status,
            "button": self.button,
            "listening": self.session.listening,
            "level": self.level,
            "canSave": any(not line.live and line.english for line in self.session.lines),
            "lines": lines,
        }

    def primary(self) -> dict:
        if not self.models_ready:
            self.status = "The speech model has to be downloaded again."
            self.button = "Retry"
            return self.snapshot()
        if self.session.listening:
            self.session.stop()
            self.status = "Microphone allowed"
            self.button = "Start listening"
            self.level = 0.0
            self.log.write("stop")
        else:
            self.session.start()
            self.status = "Microphone on, no voice yet"
            self.button = "Stop"
            self.log.write("start", microphone=self.settings.microphone_id or "default")
        return self.snapshot()

    def clear_lines(self) -> dict:
        if not self.confirm_clear:
            self.confirm_clear = True
            return self.snapshot()
        self.session.clear()
        self.confirm_clear = False
        self.log.write("clear")
        return self.snapshot()

    def save_text(self) -> str:
        body = transcript_to_text(self.session.saved_lines())
        self.log.write("save", bytes=len(body.encode("utf-8")))
        return body

    def save_diagnostics(self) -> str:
        tail = "\n".join(self.log.tail())
        return "\n".join(
            [
                "Zeinab 0.1.0",
                f"sensitivity {self.settings.sensitivity}",
                "models pinned" if self.models_ready else "models not pinned",
                tail,
            ]
        )

    def about(self) -> str:
        return "Zeinab 0.1.0. English: whisper-large-v3-turbo int8. Persian: nllb-200-distilled-600M int8."

    def shutdown(self) -> None:
        if self.session.listening:
            self.session.stop()
        save_settings(self.settings_path, self.settings)
        self.log.write("exit")


def _load_speech(path: str):
    from faster_whisper import WhisperModel

    model = WhisperModel(path, device="cpu", compute_type="int8", cpu_threads=4)

    def recognize(samples: list[float]) -> SpeechOutcome:
        segments, info = model.transcribe(
            samples,
            language="en",
            beam_size=1,
            temperature=0.0,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text for segment in segments)
        no_speech = getattr(info, "no_speech_prob", 0.0) or 0.0
        return SpeechOutcome(text, float(no_speech))

    return recognize


def _load_persian(path: str):
    import ctranslate2
    import sentencepiece as spm

    translator = ctranslate2.Translator(path, device="cpu", inter_threads=1, intra_threads=2)
    processor = spm.SentencePieceProcessor()
    processor.Load(str(Path(path) / "sentencepiece.bpe.model"))

    def translate(text: str) -> str:
        tokens = processor.Encode(text, out_type=str)
        result = translator.translate_batch([["eng_Latn", *tokens, "</s>"]], target_prefix=[["pes_Arab"]])
        hypothesis = result[0].hypotheses[0]
        words = [token for token in hypothesis if token not in {"pes_Arab", "</s>", "<s>"}]
        return processor.Decode(words).strip()

    return translate


def main() -> None:
    app = App()
    if "--self-check" in sys.argv:
        snapshot = app.primary()
        if snapshot["listening"]:
            raise SystemExit("listening started without a check")
        print(snapshot["status"])
        return
    try:
        import webview
    except ImportError:
        print("Zeinab's window needs pywebview. Install desktop/requirements.txt.", file=sys.stderr)
        sys.exit(1)
    html = (Path(__file__).with_name("ui.html")).read_text(encoding="utf-8")
    window = webview.create_window("Zeinab", html=html, js_api=app, width=980, height=720)
    webview.start()
    app.shutdown()
    del window


if __name__ == "__main__":
    main()
