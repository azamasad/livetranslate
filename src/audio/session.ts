import type { Engine } from "../engine/client";
import { presentTranscript } from "../text/transcript";
import { rms } from "./rms";
import { openCapture, type CaptureHandle } from "./capture";
import { SpeechSegmenter, type SpeechSegment } from "./segmenter";

export type SessionHandlers = {
  onPartial: (id: number, atMs: number, german: string) => void;
  onDraft: (id: number, atMs: number, german: string) => void;
  onFinal: (id: number, atMs: number, german: string) => void;
  onLevel: (level: number) => void;
  onBacklog: (ms: number) => void;
  onQuiet: (quiet: boolean) => void;
  onEnded: () => void;
  onError: (message: string) => void;
};

export type SessionTuning = {
  sensitivity: number;
  silenceMs: number;
  maxSegmentMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Transcription failed.";
}

export class ListenSession {
  private token = 0;
  private running = false;
  private startedAt = 0;
  private lastFinal = "";
  private seen = new Map<number, number>();
  private segmenter: SpeechSegmenter | null = null;
  private capture: CaptureHandle | null = null;
  private loopPromise: Promise<void> | null = null;
  private level = 0;
  private peak = 0;
  private quiet = false;
  private backlog = 0;
  private endedBound: (() => void) | null = null;
  private endedTrack: MediaStreamTrack | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly handlers: SessionHandlers,
  ) {}

  async start(stream: MediaStream, tuning: SessionTuning): Promise<void> {
    await this.stop();
    const token = ++this.token;
    this.running = true;
    this.startedAt = performance.now();
    this.lastFinal = "";
    this.seen.clear();
    this.level = 0;
    this.peak = 0;
    this.quiet = false;
    this.backlog = 0;

    try {
      this.capture = await openCapture(stream, (samples) => {
        if (token !== this.token) return;
        this.onSamples(samples);
      });
    } catch (error) {
      this.running = false;
      throw error;
    }

    if (token !== this.token || !this.running) {
      this.capture.stop();
      this.capture = null;
      return;
    }

    this.segmenter = new SpeechSegmenter({
      sampleRate: this.capture.sampleRate,
      sensitivity: tuning.sensitivity,
      silenceMs: tuning.silenceMs,
      ...(tuning.maxSegmentMs ? { maxSegmentMs: tuning.maxSegmentMs } : {}),
    });

    const track = stream.getAudioTracks()[0] ?? null;
    if (track) {
      this.endedTrack = track;
      this.endedBound = () => {
        if (token === this.token && this.running) this.handlers.onEnded();
      };
      track.addEventListener("ended", this.endedBound);
    }

    this.loopPromise = this.loop(token);
  }

  update(tuning: SessionTuning): void {
    this.segmenter?.update(tuning);
  }

  async stop(): Promise<void> {
    if (!this.running && !this.capture && !this.loopPromise) return;
    this.token += 1;
    this.segmenter?.flush();
    this.running = false;
    this.detachTrack();
    this.capture?.stop();
    this.capture = null;
    const loop = this.loopPromise;
    this.loopPromise = null;
    await loop;
    this.segmenter = null;
    this.handlers.onLevel(0);
    this.handlers.onQuiet(false);
    this.handlers.onBacklog(0);
  }

  private detachTrack(): void {
    if (this.endedTrack && this.endedBound) {
      this.endedTrack.removeEventListener("ended", this.endedBound);
    }
    this.endedTrack = null;
    this.endedBound = null;
  }

  private onSamples(samples: Float32Array): void {
    const energy = rms(samples);
    this.level = this.level * 0.55 + Math.min(1, energy * 4) * 0.45;
    this.handlers.onLevel(this.level);
    this.peak = Math.max(this.peak, energy);
    const elapsed = performance.now() - this.startedAt;
    const quiet = elapsed > 6000 && this.peak < 0.008;
    if (quiet !== this.quiet) {
      this.quiet = quiet;
      this.handlers.onQuiet(quiet);
    }
    this.segmenter?.push(samples);
  }

  private at(id: number): number {
    const existing = this.seen.get(id);
    if (existing !== undefined) return existing;
    const atMs = Math.max(0, performance.now() - this.startedAt);
    this.seen.set(id, atMs);
    return atMs;
  }

  private async loop(token: number): Promise<void> {
    const segmenter = this.segmenter;
    if (!segmenter) return;
    let skipDrafts = false;

    while (token === this.token && segmenter === this.segmenter) {
      const finalSegment = segmenter.shiftFinal();
      if (finalSegment) {
        skipDrafts = await this.transcribe(finalSegment, true);
        continue;
      }
      if (!this.running) break;
      if (!skipDrafts && segmenter.hasDraft()) {
        const draft = segmenter.takeDraft();
        if (draft) {
          skipDrafts = await this.transcribe(draft, false);
          continue;
        }
      }
      const backlog = segmenter.backlogMs();
      if (Math.abs(backlog - this.backlog) > 400) {
        this.backlog = backlog;
        this.handlers.onBacklog(backlog);
      }
      await sleep(80);
    }
  }

  private async transcribe(segment: SpeechSegment, final: boolean): Promise<boolean> {
    const audioMs = (segment.samples.length / segment.sampleRate) * 1000;
    const started = performance.now();
    let raw = "";
    try {
      raw = await this.engine.transcribe(segment.samples, segment.sampleRate, (partial) => {
        const text = presentTranscript(partial, this.lastFinal);
        if (!text) return;
        this.handlers.onPartial(segment.id, this.at(segment.id), text);
      });
    } catch (error) {
      if (this.running) this.handlers.onError(errorMessage(error));
      return true;
    }

    const text = presentTranscript(raw, this.lastFinal);
    const atMs = this.at(segment.id);
    if (final) {
      if (text) this.lastFinal = text;
      this.handlers.onFinal(segment.id, atMs, text);
    } else if (text) {
      this.handlers.onDraft(segment.id, atMs, text);
    }
    return performance.now() - started > audioMs * 0.9;
  }
}
