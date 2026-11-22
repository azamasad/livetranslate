import { rms } from "./rms";

export type SpeechSegment = {
  id: number;
  samples: Float32Array;
  sampleRate: number;
};

export type SegmenterConfig = {
  sampleRate: number;
  sensitivity: number;
  minSpeechMs: number;
  silenceMs: number;
  maxSegmentMs: number;
  draftEveryMs: number;
  preRollMs: number;
  overlapMs: number;
  /** When set, the adaptive noise floor is ignored. Useful in tests. */
  fixedThreshold?: number;
};

const DEFAULTS = {
  minSpeechMs: 450,
  silenceMs: 700,
  maxSegmentMs: 8000,
  draftEveryMs: 2000,
  preRollMs: 240,
  overlapMs: 320,
  sensitivity: 3.5,
};

function msToSamples(ms: number, sampleRate: number): number {
  return Math.max(1, Math.round((ms / 1000) * sampleRate));
}

function concat(parts: Float32Array[]): Float32Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function trimTrailingSilence(samples: Float32Array, sampleRate: number, threshold: number): Float32Array {
  const window = Math.max(1, Math.round(sampleRate * 0.02));
  let end = samples.length;
  while (end > window) {
    let sum = 0;
    for (let i = end - window; i < end; i += 1) {
      const sample = samples[i] ?? 0;
      sum += sample * sample;
    }
    if (Math.sqrt(sum / window) >= threshold * 0.6) break;
    end -= window;
  }
  const keep = Math.round(sampleRate * 0.12);
  end = Math.min(samples.length, end + keep);
  if (end >= samples.length - window) return samples;
  return samples.slice(0, Math.max(end, window));
}

export class SpeechSegmenter {
  private readonly sampleRate: number;
  private sensitivity: number;
  private silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly maxSegmentMs: number;
  private readonly draftEveryMs: number;
  private readonly preRollMs: number;
  private readonly overlapMs: number;
  private readonly fixedThreshold: number | undefined;

  private noise = 0.012;
  private buffer: Float32Array[] = [];
  private bufferSamples = 0;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private speaking = false;
  private silenceSamples = 0;
  private speechSamples = 0;
  private sinceDraftSamples = 0;
  private openId = 1;
  private pending: SpeechSegment[] = [];

  constructor(config: Partial<SegmenterConfig> & { sampleRate: number }) {
    this.sampleRate = config.sampleRate;
    this.sensitivity = config.sensitivity ?? DEFAULTS.sensitivity;
    this.silenceMs = config.silenceMs ?? DEFAULTS.silenceMs;
    this.minSpeechMs = config.minSpeechMs ?? DEFAULTS.minSpeechMs;
    this.maxSegmentMs = config.maxSegmentMs ?? DEFAULTS.maxSegmentMs;
    this.draftEveryMs = config.draftEveryMs ?? DEFAULTS.draftEveryMs;
    this.preRollMs = config.preRollMs ?? DEFAULTS.preRollMs;
    this.overlapMs = config.overlapMs ?? DEFAULTS.overlapMs;
    this.fixedThreshold = config.fixedThreshold;
  }

  update(partial: { sensitivity?: number; silenceMs?: number }): void {
    if (partial.sensitivity !== undefined) this.sensitivity = partial.sensitivity;
    if (partial.silenceMs !== undefined) this.silenceMs = partial.silenceMs;
  }

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    const energy = rms(chunk);
    const voiced = energy >= this.threshold();

    if (!this.speaking) {
      this.noise = this.noise * 0.95 + energy * 0.05;
      this.pushPreRoll(chunk);
      if (voiced) this.beginFromPreRoll(chunk.length);
      return;
    }

    this.buffer.push(chunk);
    this.bufferSamples += chunk.length;
    this.speechSamples += chunk.length;
    this.sinceDraftSamples += chunk.length;
    this.silenceSamples = voiced ? 0 : this.silenceSamples + chunk.length;

    const silenceLimit = msToSamples(this.silenceMs, this.sampleRate);
    const maxSamples = msToSamples(this.maxSegmentMs, this.sampleRate);

    if (this.silenceSamples >= silenceLimit) {
      this.closeOnSilence();
      return;
    }
    if (this.bufferSamples >= maxSamples) {
      this.emitFinal(true);
    }
  }

  hasDraft(): boolean {
    if (!this.speaking) return false;
    const minSamples = msToSamples(this.minSpeechMs, this.sampleRate);
    const draftEvery = msToSamples(this.draftEveryMs, this.sampleRate);
    return this.bufferSamples >= minSamples && this.sinceDraftSamples >= draftEvery;
  }

  takeDraft(): SpeechSegment | null {
    if (!this.hasDraft()) return null;
    this.sinceDraftSamples = 0;
    return {
      id: this.openId,
      samples: concat(this.buffer),
      sampleRate: this.sampleRate,
    };
  }

  shiftFinal(): SpeechSegment | null {
    return this.pending.shift() ?? null;
  }

  backlogMs(): number {
    let samples = 0;
    for (const segment of this.pending) samples += segment.samples.length;
    return (samples / this.sampleRate) * 1000;
  }

  flush(): void {
    if (!this.speaking) return;
    const minSamples = msToSamples(this.minSpeechMs, this.sampleRate);
    const voiced = this.speechSamples - this.silenceSamples;
    if (voiced >= minSamples) this.emitFinal(false);
    else this.resetOpen();
  }

  private threshold(): number {
    if (this.fixedThreshold !== undefined) return this.fixedThreshold;
    return Math.min(0.2, Math.max(0.006, this.noise * this.sensitivity));
  }

  private pushPreRoll(chunk: Float32Array): void {
    this.preRoll.push(chunk);
    this.preRollSamples += chunk.length;
    const max = msToSamples(this.preRollMs, this.sampleRate);
    while (this.preRollSamples > max && this.preRoll.length > 1) {
      const removed = this.preRoll.shift();
      if (!removed) break;
      this.preRollSamples -= removed.length;
    }
  }

  private beginFromPreRoll(voicedSamples: number): void {
    this.buffer = this.preRoll;
    this.bufferSamples = this.preRollSamples;
    this.preRoll = [];
    this.preRollSamples = 0;
    this.speaking = true;
    this.silenceSamples = 0;
    this.speechSamples = voicedSamples;
    this.sinceDraftSamples = 0;
  }

  private closeOnSilence(): void {
    const minSamples = msToSamples(this.minSpeechMs, this.sampleRate);
    const voiced = this.bufferSamples - this.silenceSamples;
    if (voiced < minSamples) {
      this.resetOpen();
      return;
    }
    this.emitFinal(false);
  }

  private emitFinal(keepOverlap: boolean): void {
    const full = concat(this.buffer);
    const trimmed = trimTrailingSilence(full, this.sampleRate, this.threshold());
    if (trimmed.length > 0) {
      this.pending.push({
        id: this.openId,
        samples: trimmed,
        sampleRate: this.sampleRate,
      });
    }
    const overlapSamples = msToSamples(this.overlapMs, this.sampleRate);
    const tail = keepOverlap && full.length > overlapSamples ? full.slice(full.length - overlapSamples) : null;
    this.resetOpen();
    if (tail && tail.length > 0) {
      this.buffer = [tail];
      this.bufferSamples = tail.length;
      this.speaking = true;
      this.speechSamples = tail.length;
      this.sinceDraftSamples = 0;
    }
  }

  private resetOpen(): void {
    this.buffer = [];
    this.bufferSamples = 0;
    this.silenceSamples = 0;
    this.speechSamples = 0;
    this.sinceDraftSamples = 0;
    this.speaking = false;
    this.openId += 1;
  }
}
