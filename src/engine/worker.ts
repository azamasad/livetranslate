import { env, pipeline, TextStreamer, type AutomaticSpeechRecognitionPipeline, type TranslationPipeline } from "@huggingface/transformers";
import { resampleTo16k } from "../audio/resample";
import type { ComputeDevice, EngineEvent, EngineRequest, ModelProgress } from "./protocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage: (message: EngineEvent) => void;
  crossOriginIsolated: boolean;
};

const scope = self as unknown as WorkerScope;

function post(event: EngineEvent): void {
  scope.postMessage(event);
}

function configureRuntime(): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const threads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const ortBase = new URL(`${import.meta.env.BASE_URL}ort/`, scopeLocation()).href;
  const backend = env.backends.onnx as {
    wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: string };
  };
  backend.wasm = {
    ...(backend.wasm ?? {}),
    wasmPaths: ortBase,
    numThreads: threads,
    proxy: false,
  };
}

function scopeLocation(): string {
  return (self as unknown as { location: { href: string } }).location.href;
}

configureRuntime();

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let translator: TranslationPipeline | null = null;
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

function loadTranslator(model: string): Promise<TranslationPipeline> {
  return createPipeline("translation", model, {
    device: "wasm",
    dtype: "q8",
    progress_callback: reportProgress,
  }) as Promise<TranslationPipeline>;
}

function readTranslation(output: unknown): string {
  const row: unknown = Array.isArray(output) ? output[0] : output;
  const item: unknown = Array.isArray(row) ? row[0] : row;
  if (item && typeof item === "object" && "translation_text" in item) {
    const text = (item as { translation_text: unknown }).translation_text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

async function handle(request: EngineRequest): Promise<void> {
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

    translator = request.mtModel ? await loadTranslator(request.mtModel) : null;

    post({ type: "result", id: request.id, ok: true, text: "", ready: { device, note } });
    return;
  }

  if (request.type === "transcribe") {
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
      language: "german",
      task: "transcribe",
      max_new_tokens: 128,
      streamer,
    });
    if (timer !== null) clearTimeout(timer);
    const text = Array.isArray(output) ? output[0]?.text ?? "" : output.text;
    post({ type: "result", id: request.id, ok: true, text });
    return;
  }

  if (!translator) throw new Error("The built-in translator is not loaded.");
  if (request.type !== "translate") return;
  const output = await translator(request.text);
  post({
    type: "result",
    id: request.id,
    ok: true,
    text: readTranslation(output),
  });
}

scope.onmessage = (event: MessageEvent<EngineRequest>) => {
  const request = event.data;
  chain = chain
    .then(() => handle(request))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The model failed.";
      post({ type: "result", id: request.id, ok: false, error: message });
    });
};
