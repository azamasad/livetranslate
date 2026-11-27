# Test cases: Zeinab for Windows

Status: the plan for the program specified in the [PRD](prd.md) and the [technical design](technical-design.md). Revision 2. The program is not built, so none of these have been run.

## How to read a case

Each case has an id, the requirement it locks, a priority, and steps.

- **P0** blocks handing the program to her.
- **P1** blocks calling the program fit for a real conversation in the room.
- **P2** is a defect if it fails, and it can ship with the failure written down.

"The laptop" means her Lenovo, i7-8565U, 24 GB RAM, Windows 11. "The script" means the passage in [Fixture A](#fixture-a). A person reads it aloud. The scorer has the script in front of them and was not the only person who heard it.

Automated cases run on a development machine. They do not replace the laptop cases. A case marked **laptop** is manual. A case marked **auto** is a unit or integration test. A case marked **both** has an automated form and a laptop confirmation.

## Traceability

| Requirement | Cases |
| --- | --- |
| FR-1 per-user install | TC-01 |
| FR-2 first-launch download and hash | TC-02, TC-03, TC-20 |
| FR-3 offline relaunch | TC-04 |
| FR-4 columns and direction | TC-10 |
| FR-5 start, stop, start again | TC-11, TC-12 |
| FR-6 meter and silence versus voice | TC-13, TC-30 |
| FR-7 live English, Persian after the phrase | TC-14, TC-32 |
| FR-8 English is not blocked by Persian | TC-15 |
| FR-9 Save text | TC-16 |
| FR-10 lines do not survive a restart | TC-17 |
| FR-11 log contents | TC-18, TC-40 |
| FR-12 diagnostics file | TC-19, TC-40 |
| FR-13 bad hash | TC-20 |
| FR-14 uninstall | TC-05 |
| FR-15 microphone permission | TC-21 |
| FR-16 device lost | TC-22 |
| FR-17 hallucinations dropped | TC-41, TC-42 |
| FR-18 Stop is quick | TC-12 |
| FR-19 no listening port | TC-43 |
| FR-20 version in About | TC-08 |
| FR-21 close releases the microphone | TC-07 |
| FR-22 cancel a download | TC-06 |
| 1 meter English target | TC-31, checklist below |
| 3 meter English target | TC-33 |
| Persian target | TC-32 |
| 30 minute memory | TC-34 |
| Low disk | TC-23 |

## Install and files

### TC-01 Per-user install

- Priority: P0. Where: laptop.
- Preconditions: the account is a normal user. `Zeinab` is not already installed. The installer and `INSTALL.txt` are on the Desktop.
- Steps:
  1. Read `INSTALL.txt`.
  2. Open `Zeinab-setup.exe`.
  3. On the SmartScreen warning, choose **More info**, then **Run anyway**.
  4. Finish the installer. Do not use an administrator prompt if one appears. Cancel and fail the case if the only way forward is an admin password.
  5. Open the Start menu and launch Zeinab.
- Expected: a Zeinab window opens. Task Manager shows the window process running as her user. No PowerShell window is required. Chrome is not opened.

### TC-02 First launch downloads the pinned models

- Priority: P0. Where: laptop, network on.
- Preconditions: `%LOCALAPPDATA%\Zeinab\models` is absent. The manifest in the build is complete.
- Steps:
  1. Launch Zeinab.
  2. Watch the progress until the window says it is ready.
  3. Disconnect the network.
  4. Press **Start listening**, say one short sentence, press **Stop**.
- Expected: progress shows each file and a fraction of bytes. **Start listening** stays disabled until both models verify. After verification, the sentence produces an English line while offline. The model directories exist only under `%LOCALAPPDATA%\Zeinab\models`.

### TC-03 A restarted download does not keep a bad partial file

- Priority: P1. Where: laptop.
- Steps:
  1. Start the first launch.
  2. Kill the process halfway through the first large file.
  3. Launch Zeinab again and let it finish.
- Expected: the window recovers and reaches ready. Every file that is loaded matches the manifest SHA-256. A temporary download name is not left behind next to the finished model.

### TC-04 Offline launch after a successful download

- Priority: P0. Where: laptop.
- Preconditions: TC-02 has passed. The network is off before the process starts. Confirm that with a failed load of a public page in a browser.
- Steps: launch Zeinab from the Start menu.
- Expected: the ready window appears without attempting a download. **Start listening** is enabled.

### TC-05 Uninstall leaves models unless asked

- Priority: P1. Where: laptop.
- Steps:
  1. Uninstall Zeinab and leave **Also delete Zeinab's models and settings** unticked.
  2. Confirm `%LOCALAPPDATA%\Zeinab\models` is still there and `%LOCALAPPDATA%\Zeinab\app` is gone.
  3. Install again. Launch with the network off.
  4. Uninstall again with the checkbox ticked.
- Expected: the second install does not re-download. After the checked uninstall, `%LOCALAPPDATA%\Zeinab` is gone.

## Window

### TC-06 Cancel leaves no half-model

- Priority: P0. Where: laptop.
- Steps:
  1. Start the first launch and wait until bytes are moving.
  2. Press **Cancel**.
  3. Launch Zeinab again and let the download finish.
- Expected: after **Cancel**, **Start listening** is not available. No file that failed its hash is loaded. The second launch reaches ready, and every loaded file matches the manifest.

### TC-07 Closing the window releases the microphone

- Priority: P0. Where: laptop.
- Steps: start listening, then close the window with the system close button. Try to record a short clip in another app. Launch Zeinab again.
- Expected: the other app can use the microphone. The new window has no lines from the previous session.

### TC-08 About shows the build

- Priority: P1. Where: laptop.
- Steps: open **About**. Compare the version with the version named in the test note and the installer file name.
- Expected: the three match. Both model ids are shown.

### TC-10 Columns

- Priority: P0. Where: both.
- Steps: open the ready window. Inspect the empty-state example and one real line from Fixture A.
- Expected: English is on the left, left to right, `lang=en`. Persian is on the right, right to left, `lang=fa`. Persian letters are drawn with the bundled face, with the network off, so a missing system font is not what made them visible.

### TC-11 Start and stop

- Priority: P0. Where: laptop.
- Steps:
  1. Press **Start listening**.
  2. Speak, and confirm a line appears.
  3. Press **Stop**.
  4. Speak again and confirm no new line appears.
  5. Press **Start listening** again and speak.
- Expected: the status moves from ready, to a microphone status, to idle on **Stop**, then back to a microphone status. The second start hears the new sentence. The microphone is released on **Stop** (Windows sound settings no longer shows Zeinab as using it, or a second recorder can take the device).

### TC-12 Stop returns within 300 ms

- Priority: P0. Where: both.
- Steps: start listening, begin a sentence, and press **Stop** while a translation is still pending if one is visible as pending.
- Expected: the button is **Start listening** again within 300 ms. No Persian result arrives afterwards for the cancelled line. Lines that were already finished stay.

### TC-13 Meter and the quiet status

- Priority: P1. Where: laptop.
- Steps:
  1. Start listening in a quiet room. Wait 10 seconds.
  2. Speak at a normal volume about 1 meter away.
- Expected: the quiet stretch shows **Microphone on, no voice yet** and the meter is low. During speech the status is **Microphone is on** and the meter moves. The quiet stretch adds no line.

### TC-14 Partials then a finished pair

- Priority: P0. Where: laptop.
- Steps: read the first sentence of Fixture A slowly.
- Expected: if English appears before the reader finishes, it is marked unfinished, there is only one such reading, and it occupies the same line as the finished English. Persian appears only after the line closes. A phrase shorter than 2.5 seconds may show no provisional reading at all. That is a pass.

### TC-15 A slow Persian line does not stall the next English line

- Priority: P0. Where: both.
- Steps: read two Fixture A sentences with a short pause between them. On the automated side, delay the translate lane by 3 seconds in a test double.
- Expected: the second English line becomes visible while the first line's Persian is still empty. The first Persian cell then fills in on the first line, not on the second.

### TC-16 Save text

- Priority: P0. Where: both.
- Steps:
  1. Produce two finished lines.
  2. Press **Save text**. Choose a new folder and accept the default name.
  3. Open the file in an editor that shows encoding.
- Expected: the button was disabled before any lines existed. The file is UTF-8 without a BOM, named `zeinab.txt`. Each finished line has a `[mm:ss]` clock, an `EN` line, and an `FA` line. Persian is intact. The empty-state example is not in the file.

### TC-17 A new window is empty

- Priority: P0. Where: laptop.
- Steps: produce lines, close the window, launch Zeinab again.
- Expected: no previous English or Persian is on screen. Text size and the microphone choice match the previous session.

### TC-18 The log stays free of the words

- Priority: P0. Where: both.
- Steps:
  1. Delete the log files.
  2. Start listening and say: `purple telescope 4821`.
  3. Wait until the English line shows those words, or until recognition finishes if it missed them. If recognition missed them, type is not a substitute. Repeat once, closer to the microphone. If the line still misses them, fail TC-31's spirit for this utterance and still scan the log.
  4. Press **Stop**. Open `%LOCALAPPDATA%\Zeinab\logs\`.
- Expected: the log contains start and stop events and durations. It does not contain `purple`, `telescope`, `4821`, or a base64 run longer than 80 characters.

### TC-19 Diagnostics file

- Priority: P0. Where: laptop.
- Preconditions: TC-18's sentence was spoken in this session.
- Steps: choose **Save diagnostics** and write `zeinab-diagnostics.txt` to the Desktop. Search it for the same tokens as TC-18.
- Expected: the file includes the app version, the Windows version, the CPU, the microphone name, both model ids, and checksums. It does not include the spoken tokens, audio, or the **Save text** path.

## Failure and permission

### TC-20 A flipped byte is rejected

- Priority: P0. Where: auto, and once on the laptop.
- Steps:
  1. After a good download, flip one byte inside the Whisper model directory.
  2. Launch Zeinab.
- Expected: listening stays disabled. The window says the speech model has to be downloaded again. The bad file is not loaded. Restoring the download reaches ready, and the restored file matches the manifest.

### TC-21 Microphone blocked in Windows

- Priority: P0. Where: laptop.
- Steps: in Settings, Privacy and security, Microphone, turn off access for desktop apps. Launch Zeinab and press **Start listening**. Then turn access back on and start again.
- Expected: the first attempt shows **Microphone blocked** and names that settings page. No line appears. No error dialog is the only explanation. After access is on, a sentence is heard.

### TC-22 The microphone disappears

- Priority: P1. Where: laptop.
- Steps: start listening with a USB headset as the selected device. Unplug it while a finished line is on screen.
- Expected: listening stops. The status says the microphone was disconnected. The finished line remains. The built-in microphone can be selected and a new start works.

### TC-23 Not enough disk

- Priority: P2. Where: auto with a fake volume, or laptop only if it can be done without filling the real disk.
- Steps: report free space under 3 GB to the downloader and start a first launch.
- Expected: no multi-gigabyte download starts. The window says how much free space it needs. The partial models directory is empty or absent.

### TC-24 Engine crash

- Priority: P1. Where: auto.
- Steps: kill `zeinab-engine` while the window is listening.
- Expected: the window says the listener stopped, returns to idle, and keeps finished lines. The next **Start listening** starts a new engine and hears a new sentence.

### TC-25 Translate failure keeps the English

- Priority: P1. Where: auto.
- Steps: force the translate lane to return an empty string for one line, then a normal result for the next.
- Expected: the first line keeps its English and shows that Persian failed for that line. The second line gets Persian. Listening has not stopped.

## Accuracy and latency on the laptop

Do these in a quiet room, television off, after TC-04 so the network is not part of the timing. Time English from the end of the spoken sentence to the finished English line. Time Persian from that English line to the Persian text. Use a stopwatch. Write the seconds into the test note. One pass is not enough: read Fixture A three times and record all three.

### TC-30 Two minutes of silence

- Priority: P0. Where: laptop.
- Steps: start listening. Leave the room quiet for 2 minutes. Do not type or play media.
- Expected: zero lines. The status stays **Microphone on, no voice yet** except for brief meter bumps if the room makes a noise, and those bumps still add no line.

### TC-31 One meter, scripted English

- Priority: P0. Where: laptop.
- Steps: sit about 1 meter from the laptop. Read Fixture A at a conversational pace, three times, with a pause between sentences.
- Expected: nine timings, three readings of three sentences. The median is 6 seconds or less. None is over 10 seconds. Each sentence passes the [checklist](#scoring-checklist). Record all nine numbers. If the median is also 3 seconds or less, write that down. It is not required for a pass.

### TC-32 Persian follows the finished English

- Priority: P0. Where: laptop.
- Preconditions: TC-31.
- Steps: for each finished line in TC-31, time the Persian cell.
- Expected: for each of the nine finished lines, Persian arrives within 4 seconds of the finished English. The Persian is in Arabic script, right to left. A Persian reader marks each line **same**, **related**, or **wrong** using the checklist. At least two sentences in each reading are **same**, and none is **wrong** on the name or the number. Record the nine timings and keep one `zeinab.txt` from this run.

### TC-33 Three meters

- Priority: P1. Where: laptop.
- Steps: repeat Fixture A once from about 3 meters, same room, television off.
- Expected: record the English exactly as shown. The names and the action of each sentence are still recognizable. If they are not, the case fails and the note says the program is not claimed to work across the room. The 1 meter result still stands.

### TC-34 Half an hour

- Priority: P1. Where: laptop.
- Steps: start listening. For 30 minutes, alternate a minute of quiet with a short sentence. Note the process memory just after the models are loaded, at 15 minutes, and at 30 minutes.
- Expected: the window still starts and stops. Memory at 30 minutes is less than 300 MB above the post-load number. The log has grown only by events, and a search for a unique sentence spoken near the end obeys TC-18.

### TC-36 Television on

- Priority: P1. Where: laptop.
- Steps: play a television or a video with speech at a normal room volume, about 2 meters from the laptop. Read sentence 1 of Fixture A once from 1 meter.
- Expected: write down the English exactly. This case records whether a second voice in the room destroys the line. A failure does not by itself block hand-over. The note says so in those words.

### TC-35 Fast talk

- Priority: P1. Where: laptop.
- Steps: read the third Fixture A sentence quickly, the way a meeting speeds up, from 1 meter.
- Expected: record the English. Missing function words are allowed. If the sentence's action is gone, record it as a known limit of this CPU and this model. Do not "fix" the note by switching to a smaller model.

## Automatic engine cases

These use a WAV fixture checked into the repo when the desktop tree exists, 16 kHz mono, generated from the first Fixture A sentence by a speech synthesizer. They run when the model files are present. They skip, with a visible skip, when the models are not downloaded. A skip is not a pass of TC-31.

### TC-40 The unique-token scan is automated

- Priority: P0. Where: auto.
- Steps: feed the engine a WAV of `purple telescope 4821` if a synthetic WAV is available, otherwise call the log writer with a fake recognition result that includes that sentence and assert the writer refuses to store it. Also assert the writer refuses PCM.
- Expected: the on-disk log and a generated diagnostics string lack the three tokens.

### TC-41 Hallucinations

- Priority: P0. Where: auto.
- Steps: pass these finished strings through the filter that guards the window: `Thanks for watching`, `thanks for watching.`, `Music`, `[Applause]`, and `okay. okay. okay.`.
- Expected: none of them become a line and none are sent to the translate lane.

### TC-42 A real short sentence survives the filter

- Priority: P0. Where: auto.
- Steps: pass `The meeting starts at three.`
- Expected: the line is kept, and the translate lane receives that string unchanged.

### TC-43 No listening socket

- Priority: P0. Where: auto on Windows, and once on the laptop.
- Steps: with Zeinab ready and again while listening, list TCP and UDP listeners for the Zeinab processes.
- Expected: no listening socket. The engine's parent is the window process, and its standard streams are pipes.

### TC-44 Late result after Clear

- Priority: P1. Where: auto.
- Steps: finish a line, hold the Persian result, press **Clear** (second click), then deliver the held result.
- Expected: the window stays empty. The late Persian is not appended as a new line.

### TC-45 Overlap trim

- Priority: P1. Where: auto.
- Steps: finish `we meet Mona at the station`, then finish a phrase whose first four words are the same and whose tail is `before three`.
- Expected: one line ends in the first sentence, and the next line is the new tail, not a second copy of the shared words.

### TC-46 Settings round-trip

- Priority: P1. Where: auto.
- Steps: write settings for a fake device id, text scale 1.22, follow off, sensitivity 5. Read them back with a missing file and with a file that has an extra unknown field.
- Expected: the known fields load. A missing file yields the defaults: follow on, scale 1, sensitivity 3.5, no device id. The unknown field is ignored. Nothing in the file is a transcript.

### TC-47 Manifest host lock

- Priority: P0. Where: auto.
- Steps: point one manifest URL at `http://example.com/model.bin`, and another at `https://example.com/model.bin`.
- Expected: both are rejected before any connection. The downloader's allow list is exactly the hosts written in the real manifest.

### TC-49 The speech lane stays single-file

- Priority: P0. Where: auto.
- Steps:
  1. With a speech job already in flight, offer a preview of the open phrase.
  2. In a second run, let a preview be in flight, then close the phrase.
- Expected: the busy lane does not accept the preview. Closing the phrase cancels that preview id before the final audio is sent. The translate lane receives the final text and does not receive the preview text.

### TC-48 Cancel drops audio

- Priority: P0. Where: auto.
- Steps: queue a speech job, send cancel, then inspect the engine's in-memory phrase buffer.
- Expected: the buffer for that id is released. No file appears under `%LOCALAPPDATA%\Zeinab` other than settings and logs.

## Scoring checklist

Score finished English only. Provisional words are not scored. Function words (`is`, `the`, `and`, `at`, `we`, `will`) are not scored.

| Sentence | Passes when these are present |
| --- | --- |
| Mona is coming from Shiraz at 3. | A name a listener accepts as Mona. A place a listener accepts as Shiraz (`Shiraz` or `Sheraz`). A coming or arrival. The number 3. |
| The meeting starts at 14 hundred, and we will take questions after. | The meeting. A start. A time a listener accepts as 14:00 (`14`, `1400`, `fourteen hundred`). Questions. |
| Please send the notes to the group before you leave the room. | At least four of: send, notes, group, leave, room. |

Persian, marked by someone who reads Persian:

- **Same**: a listener gets the same people, place, number, and action.
- **Related**: the topic is recognizable and a name or number is wrong or missing.
- **Wrong**: a listener would act on a different fact.

**Related** fails the name-and-number rule in TC-32. **Wrong** fails TC-32.

## Fixture A

Read each sentence as its own phrase. Pause about two seconds between them.

1. Mona is coming from Shiraz at 3.
2. The meeting starts at 14 hundred, and we will take questions after.
3. Please send the notes to the group before you leave the room.

The automated WAV, when it is added, is sentence 1 only, so a synthetic voice can be compared without pretending it is the laptop test.

## What a test note contains

For a laptop run, keep one note next to the build number:

- installer version and the manifest ids
- Windows build, and whether SmartScreen appeared
- all nine TC-31 timings, their median, and the checklist result for each sentence
- all nine TC-32 timings, and each Persian mark: same, related, or wrong
- the TC-33 transcript, copied from the window
- the TC-30 result
- the TC-34 memory numbers
- one line stating that TC-18 and TC-19 were searched, and what was searched for

That note is how we decide the hand-over bar in the PRD. A run without those numbers is not a pass.
