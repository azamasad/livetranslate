import { describe, expect, it } from "vitest";
import { transcriptToText } from "./export";
import type { Row } from "../tickets";

describe("transcriptToText", () => {
  it("writes the German line and the English line under one time", () => {
    const rows: Row[] = [
      {
        kind: "line",
        ticket: {
          id: 1,
          atMs: 12_000,
          german: "Guten Abend.",
          english: "Good evening.",
          phase: "final",
          translation: "done",
          translatedFrom: "Guten Abend.",
        },
      },
    ];
    expect(transcriptToText(rows)).toBe("[00:12]\nDE  Guten Abend.\nEN  Good evening.");
  });
});
