# Product requirements: Zeinab for Windows

Status: specification, before implementation.
Product name: Zeinab.
Platform: Windows 11, 64-bit, on the Lenovo laptop described in the [index](README.md).
Replaces: nothing. The browser page remains the lighter listener.

## 1. Problem

Zeinab needs to follow spoken English that is happening in the room, and read Persian beside it, on her own laptop. The browser page already does this shape: a microphone, English on the left, Persian on the right, no account, and no copy of the words kept unless someone clicks **Save text**.

The English on that page is not good enough. Balanced (`whisper-base.en`, about 80 MB, running inside Chrome) misses too much. Sharper (`whisper-small.en`, about 250 MB, still inside Chrome) was tried on this laptop and still was not convincing. The next Whisper size that fits inside Chrome, medium, is large enough that a line on this 4-core processor can take many seconds. A model of that size inside the browser would feel late rather than more trustworthy.

The speech model has to run as a normal program on the CPU, where a quantized large model can finish a phrase. The window she looks at is part of that program. She does not open Chrome to listen.

## 2. Who it is for

One person, on one laptop she controls.

She can double-click an installer and click through a Windows warning. She should not have to install Git, Node, Python, or a terminal. She should not have to leave a black window open while she listens.

Someone else may install it for her and may later collect a diagnostics file if a session goes wrong. That file is defined in the technical design. It does not contain what was said.

## 3. What she does

1. She runs the installer once. Windows SmartScreen will warn, because the program is not signed and is not from the Store. The install notes tell her to choose **More info**, then **Run anyway**.
2. The first launch downloads two model files and shows progress. When they are ready, the window says Zeinab is ready.
3. Later she opens Zeinab from the Start menu. The window comes up empty.
4. She presses **Start listening**. Windows may ask the first time whether desktop apps may use the microphone. She allows it.
5. She watches the meter. When someone speaks, English appears while they are still talking. When the phrase settles, Persian appears on that same line.
6. She presses **Stop** when she wants the microphone off.
7. If she wants a copy of the session, she presses **Save text** and picks a place. Otherwise she closes the window and the lines are gone.

## 4. Product rules

These are fixed for the first version.

- The pair is English to Persian. The window does not offer German.
- The microphone is how it hears. It listens to the room, including a television or a person who is not wearing a headset.
- There is one speech model: a CTranslate2 int8 conversion of `openai/whisper-large-v3-turbo`. There is no Fast / Balanced / Sharper picker. Those smaller models are why the browser page fell short, and offering them again invites a worse session.
- There is one translation model: a CTranslate2 int8 conversion of `facebook/nllb-200-distilled-600M`, from `eng_Latn` to `pes_Arab` (Western Persian, not Dari).
- English is shown as soon as that phrase is recognized. Persian is filled in afterwards and must not freeze the English column.
- Audio is not stored. Lines are kept in memory for the open window only.
- The only transcript file is the one **Save text** writes, and only after she chooses a path.
- Settings that may persist are the chosen microphone, the text size, whether the view follows the live line, and the pickup sensitivity.
- No account, no API key, and no telemetry.
- After the models are on disk, the program works with the network disconnected.
- The program does not open a network port.

## 5. What the window contains

The layout follows the browser page so the two products are recognizable as the same tool.

- The title is Zeinab.
- A status line and a level meter. The status is one of: **Ready**, **Microphone allowed**, **Microphone blocked**, **Preparing**, **Microphone on, no voice yet**, **Microphone is on**.
- **Start listening** and **Stop**. **Start listening** is available when the program is idle. **Stop** is available while it is listening. During model load the button is **Cancel**.
- Two columns. English is left to right. Persian is right to left, in a Persian-capable face (Vazirmatn, bundled with the app so the first offline launch can draw it).
- Each finished line shows both languages. A line still being heard shows English only, marked as live.
- **Follow the live line**. When it is on, the view stays on the newest line. When it is off, scrolling up holds the place.
- Text size: **Smaller**, **Reading**, **Larger**. The choice survives a restart.
- **Save text** and **Clear**. **Save text** is disabled when there are no lines. **Clear** asks for a second click before it removes the lines.
- **Tuning** holds pickup sensitivity only. It does not hold a model picker.
- A device menu lists input devices and remembers the last one.
- **Save diagnostics** is in a menu, not beside the transcript, so it is not pressed by accident during a talk.

Empty state, before the first **Start listening** of a window: a short example line so the columns are obvious, replaced as soon as a real line exists. The example is not saved and is not a real transcript.

## 6. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | The installer is per-user. It completes without an administrator password on this laptop. |
| FR-2 | The first launch downloads the two pinned models, shows bytes received, and becomes ready only after each file matches the pinned SHA-256. |
| FR-3 | A later launch with the network disconnected reaches the ready window when those files are already present and match. |
| FR-4 | English is the left column, `lang=en`, left to right. Persian is the right column, `lang=fa`, right to left. |
| FR-5 | **Start listening** captures from the selected input. **Stop** releases it. A second start works in the same window. |
| FR-6 | While listening, the meter moves with the room, and the status distinguishes silence from voice. |
| FR-7 | A phrase still in progress can update the English cell. Persian for that line waits until the phrase is finished. |
| FR-8 | A finished English line stays visible if Persian is still working. A new English phrase can start during that wait. |
| FR-9 | **Save text** writes UTF-8, with a timestamp, `EN`, and `FA` for each finished line, to a path she chooses. The default file name is `zeinab.txt`. |
| FR-10 | Closing the window and opening it again shows no previous lines. |
| FR-11 | The diagnostic log records start, stop, device, model ids, durations, and errors. It does not record audio, English, or Persian. |
| FR-12 | **Save diagnostics** produces a file a person can send later. That file follows the same exclusion as the log. |
| FR-13 | The program loads a model only after the SHA-256 matches the pin. A mismatch deletes the bad file and says the download has to be repeated. |
| FR-14 | Uninstall removes the program. It leaves models and settings unless she ticks **Also delete Zeinab's models and settings**. |
| FR-15 | If Windows has disabled microphone access for desktop apps, **Start listening** explains where to allow it and does not pretend to be listening. |
| FR-16 | If the selected device disappears while listening, listening stops, the lines already on screen stay, and the status says the microphone was disconnected. |
| FR-17 | Known Whisper silence-hallucinations ("thanks for watching", a bare "music", the same short clause repeated) are dropped and are not translated. |
| FR-18 | **Stop** returns the window to idle within 300 ms of the click, even if a translation is still running. That translation is discarded. |
| FR-19 | The program does not listen on a TCP or UDP port. |

## 7. Privacy

| Data | Where it lives | When it disappears |
| --- | --- | --- |
| Microphone audio | Process memory, in short chunks while listening | When the chunk has been recognized, and always on **Stop** or exit |
| Lines on screen | Process memory | **Clear**, or exit |
| `zeinab.txt` | The folder she picked | Only when she deletes that file |
| Settings | `%LOCALAPPDATA%\Zeinab\settings.json` | Uninstall with the delete option, or when she deletes the file |
| Models | `%LOCALAPPDATA%\Zeinab\models\` | Uninstall with the delete option |
| Diagnostic log | `%LOCALAPPDATA%\Zeinab\logs\` | Rotation, or the uninstall delete option |

The model download is the only planned network use. The request is HTTPS to the host pinned in the model manifest. The body of that transfer is model bytes, not audio and not lines.

## 8. Targets to measure on this laptop

These are acceptance targets for the first build. They are not measurements. The browser page's Persian timing (about one to two and a half seconds a sentence on a different, faster machine) is background only and is not a claim about this program.

| Target | Bar |
| --- | --- |
| English, quiet room, clear voice about 1 meter from the laptop, sentence under 8 seconds | After she stops speaking, the finished English line is on screen within 3 seconds. A reader who knows the script can recover the sentence. Small function words may differ. Names and numbers in the script match. |
| Same setup at about 3 meters, television off | The line may miss more function words. The names and the action of the sentence are still recognizable. If they are not, the result is recorded and the build is not described as ready for across-the-room use. |
| Persian | Once English for that line is final, Persian is filled in within 4 seconds for a sentence under about 30 English words. |
| Quiet room, nobody speaking, 2 minutes | No line appears. Whisper must not invent a paragraph from silence. |
| 30 minutes of listening | Memory growth after the models are loaded stays under 300 MB. |
| Ready window, network off | **Start listening** still runs. |

A failure of the 1 meter English target blocks handing the program over. A failure of the 3 meter target does not, and it is written down so the limitation is known.

## 9. Out of scope for the first version

- A German pair, a model picker, or Ollama.
- Capturing a browser tab or system loopback. The room microphone is the source.
- GPU inference on the UHD 620.
- An account, an auto-updater that fetches code, or a crash report that leaves the machine.
- A signed installer. Signing can be added later if a certificate exists. Until then the SmartScreen step is part of the install instructions.
- Keeping a transcript history automatically.

## 10. Hand-over bar

The first build is ready to give her when:

- The installer and the offline relaunch pass on her laptop.
- The 1 meter English target and the Persian target pass on a scripted passage read in that room.
- The silence test produces no invented lines.
- A unique sentence spoken in the test does not appear in the log or in the diagnostics file.
- **Save text** is the only file that contains that sentence, and only after the button is used.

Until those are true, the browser page remains the program she actually uses.
