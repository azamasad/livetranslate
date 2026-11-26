import type {
  ComputeDevice,
  EngineEvent,
  ModelProgress,
  ReadyInfo,
  SpeechRequest,
  TranslateRequest,
} from "./protocol";

type Pending = {
  resolve: (value: { text: string; ready?: ReadyInfo }) => void;
  reject: (error: Error) => void;
  onPartial?: (text: string) => void;
};

class ModelWorker<Request extends { id: string }> {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  onProgress: ((progress: ModelProgress) => void) | null = null;

  constructor(private readonly create: () => Worker) {}

  allocateId(): string {
    this.nextId += 1;
    return String(this.nextId);
  }

  stop(message = "Stopped."): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error(message));
  }

  request(
    request: Request,
    onPartial?: (text: string) => void,
    transfer?: Transferable[],
  ): Promise<{ text: string; ready?: ReadyInfo }> {
    if (!this.worker) this.spawn();
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, onPartial });
      this.worker?.postMessage(request, transfer ?? []);
    });
  }

  private spawn(): void {
    const worker = this.create();
    worker.onmessage = (event: MessageEvent<EngineEvent>) => {
      this.onEvent(event.data);
    };
    worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || "The model worker stopped."));
    };
    this.worker = worker;
  }

  private onEvent(event: EngineEvent): void {
    if (event.type === "progress") {
      this.onProgress?.(event.progress);
      return;
    }
    if (event.type === "partial") {
      this.pending.get(event.id)?.onPartial?.(event.text);
      return;
    }
    const pending = this.pending.get(event.id);
    if (!pending) return;
    this.pending.delete(event.id);
    if (event.ok) pending.resolve({ text: event.text, ready: event.ready });
    else pending.reject(new Error(event.error));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export class Engine {
  private readonly port = new ModelWorker<SpeechRequest>(
    () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  );
  private key = "";
  private ready: ReadyInfo | null = null;

  set onProgress(listener: ((progress: ModelProgress) => void) | null) {
    this.port.onProgress = listener;
  }

  async load(options: { asrModel: string; device: ComputeDevice; language: string | null }): Promise<ReadyInfo> {
    const key = `${options.asrModel}|${options.device}|${options.language ?? ""}`;
    if (this.ready && this.key === key) return this.ready;
    this.port.stop("Restarting the models.");
    this.key = "";
    this.ready = null;
    const result = await this.port.request({
      type: "load",
      id: this.port.allocateId(),
      asrModel: options.asrModel,
      device: options.device,
      language: options.language,
    });
    const ready = result.ready ?? { device: "wasm" as const, note: "" };
    this.key = key;
    this.ready = ready;
    return ready;
  }

  transcribe(audio: Float32Array, sampleRate: number, onPartial?: (text: string) => void): Promise<string> {
    const id = this.port.allocateId();
    const payload: SpeechRequest = { type: "transcribe", id, audio, sampleRate };
    return this.port.request(payload, onPartial, [audio.buffer]).then((result) => result.text);
  }

  stop(): void {
    this.key = "";
    this.ready = null;
    this.port.stop("Stopped.");
  }
}

export class TranslateEngine {
  private readonly port = new ModelWorker<TranslateRequest>(
    () => new Worker(new URL("./translate-worker.ts", import.meta.url), { type: "module" }),
  );
  private readyKey = "";
  private loadingKey = "";
  private loading: Promise<void> | null = null;
  private ticket = 0;

  set onProgress(listener: ((progress: ModelProgress) => void) | null) {
    this.port.onProgress = listener;
  }

  ensure(options: { model: string; srcLang: string | null; tgtLang: string | null }): Promise<void> {
    const key = `${options.model}|${options.srcLang ?? ""}|${options.tgtLang ?? ""}`;
    if (this.readyKey === key) return Promise.resolve();
    if (this.loading && this.loadingKey === key) return this.loading;
    this.port.stop("Restarting the models.");
    this.readyKey = "";
    const ticket = ++this.ticket;
    this.loadingKey = key;
    const pending = this.port
      .request({
        type: "load",
        id: this.port.allocateId(),
        model: options.model,
        srcLang: options.srcLang,
        tgtLang: options.tgtLang,
      })
      .then(() => {
        if (ticket !== this.ticket) return;
        this.readyKey = key;
      })
      .catch((error: unknown) => {
        if (ticket !== this.ticket) return;
        this.loadingKey = "";
        throw error;
      })
      .finally(() => {
        if (ticket === this.ticket) this.loading = null;
      });
    this.loading = pending;
    return pending;
  }

  async translate(text: string, prefix: string): Promise<string> {
    if (this.loading) await this.loading;
    if (!this.readyKey) throw new Error("The built-in translator is not loaded.");
    const result = await this.port.request({
      type: "translate",
      id: this.port.allocateId(),
      text,
      prefix,
    });
    return result.text;
  }

  stop(): void {
    this.ticket += 1;
    this.readyKey = "";
    this.loadingKey = "";
    this.loading = null;
    this.port.stop("Stopped.");
  }
}
