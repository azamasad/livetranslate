import { describe, expect, it } from "vitest";
import { resampleTo16k } from "./resample";

describe("resampleTo16k", () => {
  it("keeps audio that is already 16 kHz", () => {
    const input = Float32Array.from([0, 0.5, -0.5]);
    expect(resampleTo16k(input, 16000)).toBe(input);
  });

  it("turns three 48 kHz samples into one 16 kHz sample", () => {
    const input = Float32Array.from([0, 3, 6, 9, 12, 15]);
    const output = resampleTo16k(input, 48000);
    expect(output.length).toBe(2);
    expect(output[0]).toBeCloseTo(3);
    expect(output[1]).toBeCloseTo(12);
  });

  it("returns an empty buffer for an empty input", () => {
    expect(resampleTo16k(new Float32Array(), 48000)).toHaveLength(0);
  });
});
