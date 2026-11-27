# Technical design: Zeinab for Windows

Status: specification, before implementation.
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

Capture stays in the window process so **Stop** can release the microphone without waiting for a model. The window sends 16 kHz mono PCM for a closed phrase, and may send a partial phrase no more than twice a second. The engine returns English text. The window then sends that finished English string for Persian. The two requests use different lanes inside the engine, so a Persian job cannot sit in front of the next English job.

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

Four Whisper threads leave room for the window and for Persian. If a measured session on this laptop shows Whisper missing the 3 second target while the CPU is idle, the speech thread count may be raised to 6 in a later build. That change is a measured follow-up, not the first setting.

`condition_on_previous_text` is off. Live phrases must not be pulled toward whatever the model said a minute ago.

## 4. Audio path

1. Open the selected WASAPI capture device in shared mode.
2. Read float frames at the device mix format.
3. Downmix to mono and resample to 16 kHz with a linear resampler. Quality of the resampler matters less than a stable rate. The implementation records the device rate in the log once per start.
4. Compute a short RMS for the meter, about 20 times a second.
5. Close a phrase when the level stays under the pickup threshold for 700 ms, or when the phrase reaches 12 seconds, whichever comes first. Phrases shorter than 250 ms are discarded.
6. Pickup maps to the same idea as the browser page: a sensitivity number from 1.5 to 8, default 3.5, where a higher number accepts quieter speech. The exact RMS cut for 3.5 is fixed in code and covered by a unit test with a synthetic tone.

On **Stop**, capture ends, queued audio is dropped, and the current engine job is cancelled.

Windows privacy: a failed start because microphone access is denied maps to **Microphone blocked**, with the sentence that desktop-app microphone access is in Settings, Privacy and security, Microphone.

Device loss mid-session maps to FR-16. The lines already drawn stay.

## 5. Speech

The engine loads Whisper once and keeps it for the life of the process.

For each phrase:

- Language is English. The model is the multilingual turbo checkpoint used as English-only by passing the language explicitly. Turbo accepts a language. This is different from `whisper-*.en` in the browser, which rejects a language flag.
- Beam size 1. Temperature 0. This is the live setting. A slower beam search is out of scope.
- `no_speech_prob` above 0.6 discards the phrase.
- The hallucination filter from `src/text/transcript.ts` is applied to the English string before it is shown and before it is sent for translation. The same helper is the specification: repeated short clauses, "thanks for watching", and a bare music or applause caption are dropped.
- Overlap with the previous finished line is trimmed with the same 3-to-8 word rule as `stripOverlap`.

Partials may be rough. They are replaced by the finished English for that phrase. Persian is requested only for the finished string, and only when that string is non-empty after the filter.

## 6. Persian

NLLB is loaded once, in the same engine process, on its own lane.

- Source language `eng_Latn`, target `pes_Arab`.
- Maximum new tokens 160, matching the browser translator.
- The input is the finished English line, trimmed. There is no `>>pes<<` prefix. That prefix belongs to the Marian model the browser page keeps as Quick Persian, which this program does not ship.
- An empty result is an error on that line. The English stays, and the Persian cell says the translation failed for that line. Listening continues.
- A line that is superseded because she pressed **Stop** or **Clear** is not written into the window when the late result arrives.

## 7. Window and the engine protocol

Frames are length-prefixed UTF-8 JSON on the engine's stdin and stdout. One direction, one request at a time per lane. Lanes are `speech` and `translate`.

Window to engine:

```json
{ "lane": "speech", "id": 12, "pcm16k": "<base64 of float32 little-endian>" }
{ "lane": "translate", "id": 9, "text": "The meeting starts at three." }
{ "lane": "cancel", "id": 12 }
```

Engine to window:

```json
{ "lane": "speech", "id": 12, "ok": true, "text": "The meeting starts at three." }
{ "lane": "translate", "id": 9, "ok": true, "text": "جلسه ساعت سه شروع میشه." }
{ "lane": "speech", "id": 12, "ok": false, "error": "The speech model returned nothing." }
```

Audio is base64 only across this pipe, and only for the phrase just closed. It is not written to the log. A large phrase is bounded by the 12 second cut: 16 kHz float32 for 12 seconds is about 768 KB before base64.

The engine's first message after load is `ready`, with the model ids and the checksums it actually loaded. The window refuses to enable **Start listening** until that message matches the manifest.

If the engine process exits, the window reports that Zeinab's listener stopped, returns to idle, and can start the engine again on the next **Start listening**. Lines already on screen stay.

## 8. Files

All paths are under `%LOCALAPPDATA%\Zeinab\`.

| Path | Contents |
| --- | --- |
| `app\` | The installed program, owned by the installer. |
| `models\whisper-large-v3-turbo-int8\` | CTranslate2 model directory. |
| `models\nllb-200-distilled-600M-int8\` | CTranslate2 model directory. |
| `models\manifest.json` | Pinned URLs, byte sizes, and SHA-256 for every file. Checked into the app, not downloaded. |
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

The clock is the time since **Start listening**, `mm:ss`, and `h:mm:ss` after an hour. A missing Persian cell is the em dash `—`, same as the browser exporter.

## 9. Model manifest

The manifest is source, reviewed with the code. Each entry has:

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
| Turbo int8 still misses the 3 second bar on this CPU | Record the measured delay. The hand-over bar fails. The follow-up is thread count, then a shorter beam, not a silent switch back to the small model. |
| Across the room, the words are still poor | The 3 meter result is written down. The microphone placement is part of the note she gets. A different model is not promised as the fix. |
| SmartScreen or antivirus blocks the installer or `zeinab-engine` | The install note is the mitigation for SmartScreen. If an antivirus quarantines the engine, that is a release blocker and is recorded with the product name of the antivirus. |
| CTranslate2's Windows build is large | Accept it if the app still installs per-user and starts offline. Revisit only if the installer cannot be copied onto this laptop. |
| WebView2 is missing | Windows 11 includes it. If the probe fails, the window says to install the WebView2 runtime from Microsoft and stops. It does not fall back to opening Chrome. |
| A late Persian result lands on a cleared screen | Results carry the line id. The window drops an id it no longer has. |

## 14. Build

The desktop program will live in `desktop/` when implementation starts. This document does not add that tree.

Release artifacts for a hand-over build:

- `Zeinab-setup.exe`, the per-user installer
- `INSTALL.txt`
- a checksum file for the installer itself

The engine and the window are built on a Windows x64 runner, or cross-compiled and then smoke-tested on her laptop. A Linux build of the engine may be used for the scripted WAV tests in CI. Passing those tests does not replace the laptop pass in the test plan.
