# Technical design: Zeinab for Windows

Status: specification, before implementation. Revision 2.
Companion: [product requirements](prd.md), [test cases](test-cases.md).

## 1. Shape

Zeinab is a per-user Windows application with its own window. Speech and translation run in a worker process on the CPU. The window never loads those models. The browser page in this repository is a different program and is not modified by this design.

```
┌─────────────────────────────┐         stdin / stdout          ┌──────────────────────────┐
│  Zeinab window              │  length-prefixed JSON frames    │  zeinab-engine           │
│  Tauri 2 + WebView2         │ ───────────────────────────────▶│  one process             │
│  transcript, meter, buttons │ ◀───────────────────────────────│  capture is in the window│
└─────────────────────────────┘                                 │  CTranslate2: Whisper    │
                                                                │  CTranslate2: NLLB       │
                                                                └──────────────────────────┘
```

Capture stays in the window process so **Stop** can release the microphone without waiting for a model. The speech lane runs one job at a time. The window sends a finished phrase when the speaker pauses. It may also send one provisional slice of a phrase that is still open, and only when the speech lane is idle. The engine returns English text. The window sends Persian only for a finished line. A Persian job never occupies the speech lane.

There is no HTTP server and no localhost port. The test suite checks that the process has no listening socket.

## 2. Why this stack

| Piece | Choice | Reason |
| --- | --- | --- |
| Window | Tauri 2, WebView2, React | Windows 11 already has WebView2. The transcript layout can follow the current page. The webview does not run the models. |
| Speech | CTranslate2, int8, `openai/whisper-large-v3-turbo` | One native runtime for both models. Turbo is the large English model with a 4-layer decoder, which is the size this 4-core CPU can plausibly run live. int8 is the quantization. |
| Persian | CTranslate2, int8, `facebook/nllb-200-distilled-600M` | Same family already chosen for the browser page, where the smaller Marian model did not produce usable Persian. Direction is `eng_Latn` to `pes_Arab`. |
| Audio | WASAPI shared mode, default format, resampled to 16 kHz mono | This is the ordinary Windows capture path. Exclusive mode is avoided so other apps can still play sound. |
| Install | Tauri's per-user NSIS bundle | No administrator password. No Git, Node, or Python on her machine. |

whisper.cpp was considered. It is a strong speech runtime and a second native stack beside CTranslate2. One runtime is the smaller installer and the smaller thing to debug on a machine we cannot sit in front of every day.

The UHD 620 is not a target. WebGPU was already unreliable for the browser build. The engine requests CPU and four threads.

## 3. Threads

The i7-8565U has 4 cores and 8 hardware threads.

- Whisper: 4 threads.
- NLLB: 2 threads.
- The window process does not run either model.

Four Whisper threads leave room for the window and for Persian. If a measured session on this laptop misses the English timing gate while the CPU is idle, the speech thread count may be raised to 6 in a later build. That change waits for the measurement.

`condition_on_previous_text` is off. Live phrases must not be pulled toward whatever the model said a minute ago.

## 4. Audio path

1. Open the selected WASAPI capture device in shared mode.
2. Read float frames at the device mix format.
3. Downmix to mono and resample to 16 kHz with a linear resampler. Quality of the resampler matters less than a stable rate. The implementation records the device rate in the log once per start.
4. Compute a short RMS for the meter, about 20 times a second.
5. Segment with the same rules as `SpeechSegmenter` in the browser page. The noise floor starts at 0.012 RMS. The threshold is `clamp(noise × sensitivity, 0.006, 0.2)`. Sensitivity defaults to 3.5 and may be set from 1.5 to 8. A higher number accepts quieter speech. Silence that closes a phrase is 700 ms. Speech shorter than 450 ms is discarded. A 240 ms pre-roll is kept. A phrase is forced closed at 8 seconds, which is longer than the browser page's 4.5 second English cap so a clause is not cut in half before turbo sees it.
6. While a phrase is open and has already passed 2.5 seconds, and the speech lane is idle, the window may send that audio once with `"kind": "preview"`. If the lane is busy, no preview is sent. A second preview of the same phrase is not sent. When the phrase closes, the window sends the full audio with `"kind": "final"`. A preview still running for that line is cancelled first.

On **Stop**, capture ends, queued audio is dropped, and the current engine job is cancelled.

Windows privacy: a failed start because microphone access is denied maps to **Microphone blocked**, with the sentence that desktop-app microphone access is in Settings, Privacy and security, Microphone.

Device loss mid-session maps to FR-16. The lines already drawn stay.

## 5. Speech

The engine loads Whisper once and keeps it for the life of the process.

For each phrase:

- Language is English and the task is transcribe. Turbo is a multilingual checkpoint, so the language is passed in. Beam size 1. Temperature 0. The engine's own voice-activity trim is off, because the window already cut the phrase.
- `no_speech_prob` above 0.6 discards the phrase. A discarded preview clears the provisional words and leaves the line open. A discarded final closes the line with no text and does not call Persian.
- The hallucination filter from `src/text/transcript.ts` is applied to the English string before it is shown and before it is sent for translation. The same helper is the specification: repeated short clauses, "thanks for watching", and a bare music or applause caption are dropped.
- Overlap with the previous finished line is trimmed with the same 3-to-8 word rule as `stripOverlap`.

A preview is shown as unfinished English and is never sent to Persian. The final result replaces it on the same `line` id. Persian is requested only for a non-empty final. Running turbo on a growing buffer several times a second is out of the design: on this 4-core CPU that queue would push the finished line past the timing gate.

## 6. Persian

NLLB is loaded once, in the same engine process, on its own lane.

- Source language `eng_Latn`, target `pes_Arab`.
- Maximum new tokens 160, matching the browser translator.
- The input is the finished English line, trimmed. There is no `>>pes<<` prefix. That prefix belongs to the Marian model the browser page keeps as Quick Persian, which this program does not ship.
- An empty result is an error on that line. The English stays, and the Persian cell says the translation failed for that line. Listening continues.
- A line that is superseded because she pressed **Stop** or **Clear** is not written into the window when the late result arrives.

## 7. Window and the engine protocol

Frames are a 4-byte little-endian length followed by UTF-8 JSON, on the engine's stdin and stdout. A frame larger than 2,000,000 bytes is a protocol error and the window restarts the engine. The speech lane has one job in flight. The translate lane has its own queue and does not block speech. Cancel applies to one id.

Window to engine:

```json
{ "lane": "speech", "id": 12, "line": 4, "kind": "preview", "pcm16k": "<base64 of float32 little-endian>" }
{ "lane": "speech", "id": 13, "line": 4, "kind": "final", "pcm16k": "<base64 of float32 little-endian>" }
{ "lane": "translate", "id": 14, "line": 4, "text": "The meeting starts at three." }
{ "lane": "cancel", "id": 12 }
```

Engine to window:

```json
{ "lane": "speech", "id": 13, "line": 4, "kind": "final", "ok": true, "text": "The meeting starts at three." }
{ "lane": "translate", "id": 14, "line": 4, "ok": true, "text": "جلسه ساعت سه شروع میشه." }
{ "lane": "speech", "id": 12, "line": 4, "kind": "preview", "ok": false, "error": "cancelled" }
```

`kind` is `preview` or `final`. The window ignores a result whose `line` is no longer on screen, and it ignores a preview that arrives after the final for that line. Audio crosses this pipe as base64 and is not written to the log. An 8 second phrase is 16 kHz float32, about 512 KB before base64.

The engine also emits log events on stdout, on a `log` lane, with the fields allowed in section 10. It does not print recognized text or audio to stderr. Stderr is crash text only, and diagnostics include at most the last 20 stderr lines after dropping any line longer than 200 characters.

The window starts the engine after the files verify, as part of launch, so **Start listening** does not pay the model load. The engine's first message is `ready`, with the model ids and the checksums it loaded. **Start listening** stays disabled until that message matches the manifest.

If the engine process exits, the window reports that Zeinab's listener stopped, returns to idle, and can start the engine again on the next **Start listening**. Lines already on screen stay.

## 8. Files

All paths are under `%LOCALAPPDATA%\Zeinab\`.

| Path | Contents |
| --- | --- |
| `app\` | The installed program, owned by the installer. |
| `models\whisper-large-v3-turbo-int8\` | CTranslate2 model directory. |
| `models\nllb-200-distilled-600M-int8\` | CTranslate2 model directory. |
| `models\verified.json` | Written by the app after a hash check: model id and SHA-256. Not a substitute for the manifest. |
| `settings.json` | Microphone id, text size, follow flag, sensitivity. No lines. |
| `logs\zeinab.log` | Diagnostics. Rotated at 2 MB, three files kept. |

`settings.json` example:

```json
{
  "microphoneId": "{0.0.1.00000000}.{device-guid}",
  "textScale": 1,
  "follow": true,
  "sensitivity": 3.5
}
```

**Save text** uses the Windows save dialog. Encoding is UTF-8 with no BOM. The body matches the browser exporter:

```
[mm:ss]
EN  The meeting starts at three.
FA  جلسه ساعت سه شروع میشه.
```

The clock is the time since the first **Start listening** of this window. **Stop** and a later **Start listening** do not reset it, so a saved file stays in order. **Clear** resets it. The format is `mm:ss`, and `h:mm:ss` after an hour. A missing Persian cell is `—`, the same character the browser exporter uses.

## 9. Model manifest

The manifest ships inside the app, as source reviewed with the code. It is not downloaded and it is not the file under `models\`. Each entry has:

- a stable id (`whisper-large-v3-turbo-int8`, `nllb-200-distilled-600M-int8`)
- the HTTPS URL of each file
- the byte length
- the SHA-256

The first implementation writes the manifest only after the files have been converted and hashed. This document does not invent those hashes. A build without a complete manifest does not download anything and does not enable listening.

Download rules:

- HTTPS only. Certificate validation stays on.
- The only hosts allowed are the hosts named in the manifest. A URL elsewhere is a hard error.
- The file is written to a temporary name in the model directory, hashed, then renamed into place. A failed hash deletes the temporary file.
- A second launch skips a file whose hash already matches.
- The window shows the file name and the fraction of bytes. It does not show a URL with a query string if one ever exists.

Expected weight, as a budget rather than a measured size: speech plus Persian weights together stay under 2 GB on disk. Turbo int8 is the larger of the two. The 24 GB of RAM is enough to hold both. The disk on this laptop had hundreds of gigabytes free when it was last described, so the budget is not a disk-space risk. The test still checks free space before downloading and stops with a clear message if under 3 GB remains.

## 10. Log and diagnostics

Each log line is UTC time, level, and a short event. Allowed fields: event name, microphone endpoint name, model id, phrase duration in milliseconds, inference duration in milliseconds, thread counts, Windows build number, app version, error message from our own code.

Forbidden in the log, the diagnostics file, and any exception string we construct:

- PCM or base64 audio
- recognized English
- Persian
- the path she chose for **Save text**, if that path might be personal; the log may say "save text wrote a file" with the byte count only

**Save diagnostics** writes one UTF-8 text file she chooses. It contains the app version, the Windows version, the CPU name, the selected microphone name, the model ids and the checksums loaded, and the last 200 log lines. The same forbidden fields apply. A test speaks the sentence `purple telescope 4821` and asserts that neither the log nor this file contains `purple`, `telescope`, or `4821`.

## 11. Install, update, uninstall

- Per-user NSIS, shortcut in the Start menu named Zeinab.
- Install directory under `%LOCALAPPDATA%\Zeinab\app`.
- The installer does not download models. First launch does, so a failed download can be retried without running the installer again.
- There is no auto-update. A new build is a new installer. It replaces `app\` and leaves `models\` and `settings.json` in place when the manifest ids are unchanged.
- Uninstall removes `app\` and the Start menu shortcut. The optional checkbox removes the whole `%LOCALAPPDATA%\Zeinab` directory.
- The program is unsigned until a certificate exists. The install note, shipped as `INSTALL.txt` next to the installer and as the first screen of the installer, says that Windows will warn and that **More info** then **Run anyway** is the expected step.

## 12. Relationship to the browser page

| | Browser page | This program |
| --- | --- | --- |
| How it starts | PowerShell, then Chrome on port 5173 | Start menu |
| English model | `whisper-base.en` by default, `whisper-small.en` if she picks Sharper | `whisper-large-v3-turbo` int8 only |
| Persian | NLLB in the page, or the rough quick model | NLLB int8 only |
| Where models run | Chrome, WebAssembly | `zeinab-engine`, CPU |
| Lines | Tab memory, `localStorage` holds settings only | Process memory, `settings.json` holds settings only |
| German | Available | Not in this version |

Shared behavior worth keeping identical, so a test written for one is readable for the other: column order, RTL Persian, **Save text** layout, hallucination filtering, and the rule that Persian waits for a finished line.

## 13. Risks

| Risk | What we will do |
| --- | --- |
| Turbo int8 misses the 6 second median on this CPU | Record every Fixture A timing. The hand-over bar fails. The follow-up is the thread count. The build does not quietly switch back to the small model. |
| Across the room, the words are still poor | The 3 meter result is written down. The microphone placement is part of the note she gets. A different model is not promised as the fix. |
| SmartScreen or antivirus blocks the installer or `zeinab-engine` | The install note is the mitigation for SmartScreen. If an antivirus quarantines the engine, that is a release blocker and is recorded with the product name of the antivirus. |
| CTranslate2's Windows build is large | Accept it if the app still installs per-user and starts offline. Revisit only if the installer cannot be copied onto this laptop. |
| WebView2 is missing | Windows 11 includes it. If the probe fails, the window says to install the WebView2 runtime from Microsoft and stops. It does not fall back to opening Chrome. |
| A late Persian result lands on a cleared screen | Results carry the line id. The window drops an id it no longer has. |

## 14. Decisions in revision 2

- Trusted English is the decode that starts when the phrase closes. A preview is one idle-lane job per open phrase, after 2.5 seconds, and it is never translated. A continuous decode of the growing buffer was dropped because it would stack jobs on this CPU.
- The hand-over gate is a 6 second median and a 10 second cap on Fixture A, scored with a checklist. A 3 second median is recorded and is not required. The earlier 3 second line was a wish made before any timing on this processor.
- Phrase length, silence, and the noise threshold match the browser segmenter. The forced close is 8 seconds.
- The manifest is part of the app. `models\verified.json` is only a local record of a check that already used the manifest.

## 15. Build

The desktop program will live in `desktop/` when implementation starts. This document does not add that tree.

Release artifacts for a hand-over build:

- `Zeinab-setup.exe`, the per-user installer
- `INSTALL.txt`
- a checksum file for the installer itself

The engine and the window are built on a Windows x64 runner, or cross-compiled and then smoke-tested on her laptop. A Linux build of the engine may be used for the scripted WAV tests in CI. Passing those tests does not replace the laptop pass in the test plan.
