# Zeinab

Zeinab listens and shows each phrase as a line you can read at your own pace. The original stays on the left. The translation sits on the right.

Two pairs are built in:

- **German → English**
- **English → Persian**, for following fast spoken English. Open [http://127.0.0.1:5173/?pair=en-fa](http://127.0.0.1:5173/?pair=en-fa) once and that choice stays.

Speech recognition and the built-in translation run in the browser. There is no API key. The audio and the lines are not sent anywhere, and they are not saved. Close the tab and they are gone. The only thing the browser remembers is the settings you picked, such as the language pair and the text size. The first start downloads the model files from Hugging Face into this browser. That download is the model, not the audio. Later starts reuse that copy. English and Persian run in separate workers, so a slow translation does not freeze the transcript.

**Save text** writes a file only when you click it. That file stays on this computer.

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

Choose **English → Persian** at the top, then **Microphone** if the English is in the room, or **Video tab** if it is playing in the browser. **Balanced** speech and **Clearer Persian** are the ones to start with. The English line shows up while the person is still talking. Persian is filled in when the phrase settles, and on a regular laptop that can take a few seconds.

**Quick Persian** is smaller and faster. The wording is rougher. Use it if the Persian falls too far behind.

The first English start downloads about 80 MB for speech and about 900 MB for Clearer Persian. Quick Persian is about 120 MB. Chrome or Edge is the browser to use.

## Ollama

The built-in translator is the right default for live lines. If you already run [Ollama](https://ollama.com), Tuning can send the translation there instead. Start Ollama first. Zeinab talks to it only on this computer, at `127.0.0.1:11434`. A small model is the one that can keep up.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
```
