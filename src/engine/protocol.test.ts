import { describe, expect, it } from "vitest";
import { formatBytes, groupProgress } from "./protocol";

describe("groupProgress", () => {
  it("sums the latest file sizes by model family", () => {
    const groups = groupProgress([
      { status: "progress", name: "Xenova/whisper-base", file: "encoder.onnx", loaded: 5_000_000, total: 10_000_000 },
      { status: "progress", name: "Xenova/opus-mt-de-en", file: "decoder.onnx", loaded: 2_000_000, total: 4_000_000 },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["German speech", "English translation"]);
    expect(groups[0]?.progress).toBe(50);
  });

  it("names the English and Persian models", () => {
    const groups = groupProgress([
      { status: "progress", name: "Xenova/whisper-base.en", file: "encoder.onnx", loaded: 1, total: 2 },
      { status: "progress", name: "Xenova/opus-mt-en-mul", file: "decoder.onnx", loaded: 1, total: 2 },
      { status: "progress", name: "Xenova/nllb-200-distilled-600M", file: "encoder.onnx", loaded: 1, total: 4 },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["English speech", "Persian translation"]);
  });
});

describe("formatBytes", () => {
  it("prints megabytes", () => {
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
  });
});
