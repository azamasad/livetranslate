# Nebenbei

Nebenbei listens to spoken German and shows it as lines you can read at your own pace. The original stays on the left. English sits on the right.

Speech recognition and the built-in translation run in the browser. There is no API key. The audio is not sent to a transcription service. The first start downloads the models from Hugging Face into the browser cache. Later starts reuse that copy.

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

Lines stay on the page. Scroll up to reread, and the live edge waits until you come back. **Follow the live line** turns that off. **Translate as I listen** can be turned off too: each finished line then has its own Translate button. Click the German to correct a misheard word, and the English is redone.

If the text lags the voice, switch the speech model to **Fast** in Tuning. **Sharper** is slower and steadier on fast or noisy speech.

## Ollama

The built-in translator is a German-to-English model, which is the right default for live lines. If you already run [Ollama](https://ollama.com), Tuning can send the English side there instead. Start Ollama first. Nebenbei talks to it only through this local page, at `127.0.0.1:11434`.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
```
