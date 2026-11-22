import type { ComputeDevice, EngineEvent, EngineRequest, ModelProgress, ReadyInfo } from "./protocol";

type Pending = {
  resolve: (value: { text: string; ready?: ReadyInfo }) => void;
  reject: (error: Error) => void;
  onPartial?: (text: string) => void;
};

export class Engine {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private key = "";
  private ready: ReadyInfo | null = null;
  private nextId = 1;
  onProgress: ((progress: ModelProgress) => void) | null = null;

  async load(options: {
    asrModel: string;
    mtModel: string | null;
    device: ComputeDevice;
  }): Promise<ReadyInfo> {
    const key = `${options.asrModel}|${options.mtModel ?? ""}|${options.device}`;
    if (this.worker && this.ready && this.key === key) return this.ready;
    this.reset("Restarting the models.");
    this.spawn();
    const result = await this.request({
      type: "load",
      id: this.allocateId(),
      asrModel: options.asrModel,
      mtModel: options.mtModel,
      device: options.device,
    });
    const ready = result.ready ?? { device: "wasm" as const, note: "" };
    this.key = key;
    this.ready = ready;
    return ready;
  }

  transcribe(audio: Float32Array, sampleRate: number, onPartial?: (text: string) => void): Promise<string> {
    const id = this.allocateId();
    const payload: EngineRequest = { type: "transcribe", id, audio, sampleRate };
    return this.request(payload, onPartial, [audio.buffer]).then((result) => result.text);
  }

  translate(text: string): Promise<string> {
    return this.request({ type: "translate", id: this.allocateId(), text }).then((result) => result.text);
  }

  stop(): void {
    this.reset("Stopped.");
  }

  private spawn(): void {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<EngineEvent>) => {
      this.onEvent(event.data);
    };
    worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || "The speech worker stopped."));
    };
    this.worker = worker;
  }

  private reset(message: string): void {
    this.worker?.terminate();
    this.worker = null;
    this.key = "";
    this.ready = null;
    this.rejectAll(new Error(message));
  }

  private allocateId(): string {
    this.nextId += 1;
    return String(this.nextId);
  }

  private request(
    request: EngineRequest,
    onPartial?: (text: string) => void,
    transfer?: Transferable[],
  ): Promise<{ text: string; ready?: ReadyInfo }> {
    if (!this.worker) this.spawn();
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, onPartial });
      this.worker?.postMessage(request, transfer ?? []);
    });
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
