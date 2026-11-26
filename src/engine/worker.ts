import { pipeline, TextStreamer, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { resampleTo16k } from "../audio/resample";
import type { ComputeDevice, EngineEvent, ModelProgress, SpeechRequest } from "./protocol";
import { configureRuntime } from "./runtime";

type WorkerScope = {
  onmessage: ((event: MessageEvent<SpeechRequest>) => void) | null;
  postMessage: (message: EngineEvent) => void;
};

const scope = self as unknown as WorkerScope;

function post(event: EngineEvent): void {
  scope.postMessage(event);
}

configureRuntime("speech");

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let asrLanguage: string | null = null;
let chain: Promise<void> = Promise.resolve();

function reportProgress(info: {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}): void {
  const progress: ModelProgress = {
    status: info.status,
    name: info.name ?? "",
    file: info.file ?? "",
    progress: info.progress,
    loaded: info.loaded,
    total: info.total,
  };
  post({ type: "progress", progress });
}

const createPipeline = pipeline as (
  task: string,
  model: string,
  options: { device: ComputeDevice; dtype: "q8"; progress_callback: typeof reportProgress },
) => Promise<unknown>;

function loadAsr(model: string, device: ComputeDevice): Promise<AutomaticSpeechRecognitionPipeline> {
  return createPipeline("automatic-speech-recognition", model, {
    device,
    dtype: "q8",
    progress_callback: reportProgress,
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
}

async function handle(request: SpeechRequest): Promise<void> {
  if (request.type === "load") {
    let device: ComputeDevice = "wasm";
    let note = "";
    if (request.device === "webgpu") {
      try {
        asr = await loadAsr(request.asrModel, "webgpu");
        device = "webgpu";
      } catch {
        note = "The graphics chip could not run the speech model, so this session uses the CPU.";
        asr = await loadAsr(request.asrModel, "wasm");
      }
    } else {
      asr = await loadAsr(request.asrModel, "wasm");
    }
    asrLanguage = request.language;

    post({ type: "result", id: request.id, ok: true, text: "", ready: { device, note } });
    return;
  }

  if (!asr) throw new Error("The speech model is not loaded yet.");
  const audio = resampleTo16k(request.audio, request.sampleRate);
  if (audio.length < 16000 * 0.25) {
    post({ type: "result", id: request.id, ok: true, text: "" });
    return;
  }

  let accumulated = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const streamer = new TextStreamer(asr.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece) => {
      accumulated += piece;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        post({ type: "partial", id: request.id, text: accumulated });
      }, 70);
    },
  });

  const output = await asr(audio, {
    ...(asrLanguage ? { language: asrLanguage, task: "transcribe" as const } : {}),
    max_new_tokens: 128,
    streamer,
  });
  if (timer !== null) clearTimeout(timer);
  const text = Array.isArray(output) ? output[0]?.text ?? "" : output.text;
  post({ type: "result", id: request.id, ok: true, text });
}

scope.onmessage = (event: MessageEvent<SpeechRequest>) => {
  const request = event.data;
  chain = chain
    .then(() => handle(request))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The model failed.";
      post({ type: "result", id: request.id, ok: false, error: message });
    });
};
