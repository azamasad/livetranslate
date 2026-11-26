import { pipeline, type TranslationPipeline } from "@huggingface/transformers";
import type { EngineEvent, ModelProgress, TranslateRequest } from "./protocol";
import { configureRuntime } from "./runtime";
import { cleanTranslation, translationInput } from "../translate/text";

type WorkerScope = {
  onmessage: ((event: MessageEvent<TranslateRequest>) => void) | null;
  postMessage: (message: EngineEvent) => void;
};

const scope = self as unknown as WorkerScope;

function post(event: EngineEvent): void {
  scope.postMessage(event);
}

configureRuntime("translate");

let translator: TranslationPipeline | null = null;
let srcLang: string | null = null;
let tgtLang: string | null = null;
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
  options: { device: "wasm"; dtype: "q8"; progress_callback: typeof reportProgress },
) => Promise<unknown>;

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

async function handle(request: TranslateRequest): Promise<void> {
  if (request.type === "load") {
    srcLang = request.srcLang;
    tgtLang = request.tgtLang;
    translator = await loadTranslator(request.model);
    post({ type: "result", id: request.id, ok: true, text: "" });
    return;
  }

  if (!translator) throw new Error("The built-in translator is not loaded.");
  const input = translationInput(request.text, request.prefix);
  const options: { max_new_tokens: number; src_lang?: string; tgt_lang?: string } = { max_new_tokens: 160 };
  if (srcLang && tgtLang) {
    options.src_lang = srcLang;
    options.tgt_lang = tgtLang;
  }
  const output = await translator(input, options as Parameters<TranslationPipeline>[1]);
  const text = cleanTranslation(readTranslation(output));
  if (!text) throw new Error("The translator returned nothing.");
  post({ type: "result", id: request.id, ok: true, text });
}

scope.onmessage = (event: MessageEvent<TranslateRequest>) => {
  const request = event.data;
  chain = chain
    .then(() => handle(request))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The model failed.";
      post({ type: "result", id: request.id, ok: false, error: message });
    });
};
