# Zeinab desktop

A window of its own for English beside Persian. It is not the browser page, and it does not open a network port.

This build runs the engine and the window from source. The per-user installer in the specification is still produced on a Windows machine. The checks in `tests/` run here.

```bash
cd desktop
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest
.venv/bin/python -m zeinab_app
```

On Windows the same commands use `py -3` and `.venv\Scripts\`. The window uses the system web view (WebView2 on Windows). Models are loaded only when `ZEINAB_WHISPER` and `ZEINAB_NLLB` point at pinned CTranslate2 directories. Until those hashes are in the manifest, listening stays off and the tests exercise the phrase cutter, the filters, the log, and the engine protocol.

Speech is Whisper large-v3-turbo, int8. Persian is NLLB 200 distilled 600M, int8, English to Western Persian. Audio and lines stay in memory. The log records timings and errors, and it refuses transcript text.
