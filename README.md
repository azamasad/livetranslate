# Zeinab

Zeinab listens and shows each phrase as a line you can read at your own pace. The original stays on the left. The translation sits on the right.

Two pairs are built in:

- **German → English**
- **English → Persian**, for following fast spoken English. Open [http://127.0.0.1:5173/?pair=en-fa](http://127.0.0.1:5173/?pair=en-fa) once and that choice stays.

Speech recognition and the built-in translation run in the browser. There is no API key. The audio and the lines are not sent anywhere, and they are not saved. Close the tab and they are gone. The only thing the browser remembers is the settings you picked, such as the language pair and the text size. The first start downloads the model files from Hugging Face into this browser. That download is the model, not the audio. Later starts reuse that copy. English and Persian run in separate workers, so a slow translation does not freeze the transcript.

**Save text** writes a file only when you click it. That file stays on this computer.

## On a Windows laptop

Two files, both in this folder:

1. **Install Zeinab.cmd** — open this once. It installs Git and Node if they are missing, copies the program onto the Desktop, and says **Zeinab is installed**.
2. **Zeinab.cmd** — open this whenever you want to listen. It opens the page that is already the app: **Start listening**, **Stop**, the microphone, English on the left, and Persian on the right.

The black window that stays open is what keeps the page alive. Close it when you are finished. If Windows asks whether Node may use the network, allow it. The page only talks to this computer. If Chrome never asks for the microphone, turn it on in Windows Settings under Privacy and security, Microphone, and allow desktop apps, then allow Chrome.

## Run it

```bash
pnpm install
pnpm start
```

Open the address Vite prints, usually http://127.0.0.1:5173. Chrome or Edge is the reliable choice for sharing a tab.

## Listen to a video

1. Play the video in a browser tab.
2. Choose **Video tab** and press **Start listening**.
3. Pick that tab and turn on **Share tab audio**.

The video keeps playing where it is. This page only reads the sound. A shared tab is much clearer than holding a microphone up to the speakers. The microphone is there for when the sound is in the room.

## Read it when you want

Lines stay on the page. Scroll up to reread, and the live edge waits until you come back. **Follow the live line** turns that off. **Translate as I listen** can be turned off too: each finished line then has its own Translate button. Correct a misheard word on the left, and the translation is redone.

If the text lags the voice, switch the speech model to **Fast** in Tuning. **Sharper** is slower and steadier on fast or noisy speech.

## English to Persian

Choose **English → Persian**. That selects the microphone, so speech in the room is heard even when it is not playing on the laptop. Chrome asks for the microphone. Allow it. **Video tab** is there for a video playing in the browser. **Balanced** speech and **Clearer Persian** are the ones to start with. The English line shows up while the person is still talking. Persian is filled in when the phrase settles, and on a regular laptop that can take a few seconds.

**Quick Persian** is smaller and faster. The wording is rougher. Use it if the Persian falls too far behind.

The first English start downloads about 80 MB for speech and about 900 MB for Clearer Persian. Quick Persian is about 120 MB. Chrome or Edge is the browser to use.

## Ollama

The built-in translator is the right default for live lines. If you already run [Ollama](https://ollama.com), Tuning can send the translation there instead. Start Ollama first. Zeinab talks to it only on this computer, at `127.0.0.1:11434`. A small model is the one that can keep up.

## Desktop program

A separate Windows program, with its own window and a larger English model, is specified and not built yet. The page above stays the one the PowerShell command starts. The specification is in [docs/desktop](docs/desktop/README.md): the product requirements, the technical design, and the test cases that have to pass on the laptop before that program is handed over.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
```
