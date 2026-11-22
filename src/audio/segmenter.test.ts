import { describe, expect, it } from "vitest";
import { SpeechSegmenter } from "./segmenter";

const RATE = 16_000;

function signal(ms: number, amplitude: number): Float32Array {
  const length = Math.round((ms / 1000) * RATE);
  return new Float32Array(length).fill(amplitude);
}

function feed(segmenter: SpeechSegmenter, ms: number, amplitude: number, stepMs = 100): void {
  let left = ms;
  while (left > 0) {
    const slice = Math.min(stepMs, left);
    segmenter.push(signal(slice, amplitude));
    left -= slice;
  }
}

function createSegmenter(overrides: Partial<ConstructorParameters<typeof SpeechSegmenter>[0]> = {}) {
  return new SpeechSegmenter({
    sampleRate: RATE,
    fixedThreshold: 0.05,
    minSpeechMs: 400,
    silenceMs: 300,
    maxSegmentMs: 1000,
    draftEveryMs: 500,
    preRollMs: 100,
    overlapMs: 100,
    ...overrides,
  });
}

describe("SpeechSegmenter", () => {
  it("ignores silence", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 1000, 0);
    expect(segmenter.shiftFinal()).toBeNull();
    expect(segmenter.hasDraft()).toBe(false);
  });

  it("emits one segment after speech and a pause", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 200, 0);
    feed(segmenter, 600, 0.4);
    feed(segmenter, 400, 0);
    const segment = segmenter.shiftFinal();
    expect(segment).not.toBeNull();
    expect(segment && segment.samples.length).toBeGreaterThan(RATE * 0.5);
    expect(segmenter.shiftFinal()).toBeNull();
  });

  it("drops a blip shorter than the minimum", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 100, 0.4);
    feed(segmenter, 400, 0);
    expect(segmenter.shiftFinal()).toBeNull();
  });

  it("splits a long stretch and keeps a little overlap", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 1500, 0.4);
    const first = segmenter.shiftFinal();
    expect(first).not.toBeNull();
    feed(segmenter, 400, 0);
    const second = segmenter.shiftFinal();
    expect(second).not.toBeNull();
    expect(first && second && first.id).not.toBe(second?.id);
  });

  it("offers a draft while speech continues", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 700, 0.4);
    expect(segmenter.hasDraft()).toBe(true);
    const draft = segmenter.takeDraft();
    expect(draft?.samples.length).toBeGreaterThan(RATE * 0.4);
    expect(segmenter.hasDraft()).toBe(false);
    expect(segmenter.shiftFinal()).toBeNull();
  });

  it("flushes the open phrase when listening stops", () => {
    const segmenter = createSegmenter();
    feed(segmenter, 500, 0.4);
    segmenter.flush();
    expect(segmenter.shiftFinal()?.id).toBe(1);
  });
});
