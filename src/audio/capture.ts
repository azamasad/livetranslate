import type { ListenSource } from "../models";

export type CaptureHandle = {
  sampleRate: number;
  stop: () => void;
};

export async function acquireAudio(source: ListenSource): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("Open this app from the local address npm start prints. The browser only shares audio from there.");
  }
  if (!navigator.mediaDevices) {
    throw new Error("This browser can’t share audio. Chrome or Edge can.");
  }

  try {
    if (source === "mic") {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: false },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: false },
            channelCount: { ideal: 1 },
          },
          video: false,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "OverconstrainedError") {
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
        throw error;
      }
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "That share has no audio. In the share dialog, turn on “Share tab audio”. A browser tab works better than the whole screen.",
      );
    }
    return stream;
  } catch (error) {
    if (error instanceof Error && /share has no audio|Open this app|can’t share audio/.test(error.message)) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error(
        source === "mic"
          ? "Microphone permission was blocked. Allow it for this page in the address bar, then start again."
          : "Sharing was cancelled. Start again and leave “Share tab audio” on.",
      );
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("No microphone was found.");
    }
    if (error instanceof DOMException && error.name === "NotSupportedError") {
      throw new Error("This browser can’t share tab audio. Use the microphone, or open the page in Chrome or Edge.");
    }
    throw error instanceof Error ? error : new Error("Could not open the audio.");
  }
}

export async function openCapture(
  stream: MediaStream,
  onSamples: (samples: Float32Array) => void,
): Promise<CaptureHandle> {
  const context = new AudioContext();
  await context.resume();
  await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "capture-processor");
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onSamples(event.data);
  };
  source.connect(node);

  return {
    sampleRate: context.sampleRate,
    stop: () => {
      node.port.onmessage = null;
      node.disconnect();
      source.disconnect();
      void context.close();
    },
  };
}
