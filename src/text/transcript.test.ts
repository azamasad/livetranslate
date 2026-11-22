import { describe, expect, it } from "vitest";
import { formatClock, isHallucination, presentTranscript, stripOverlap } from "./transcript";

describe("presentTranscript", () => {
  it("trims whisper's leading space and empty punctuation", () => {
    expect(presentTranscript("  Guten Abend.  ", "")).toBe("Guten Abend.");
  });

  it("drops known silence hallucinations", () => {
    expect(presentTranscript("Untertitel der Amara.org-Community", "")).toBe("");
    expect(presentTranscript("Vielen Dank fürs Zuschauen.", "")).toBe("");
    expect(presentTranscript("[Musik]", "")).toBe("");
    expect(presentTranscript("(lacht)", "")).toBe("");
    expect(presentTranscript("Danke. Danke. Danke.", "")).toBe("");
  });

  it("keeps a short real answer", () => {
    expect(presentTranscript("Ja, genau.", "")).toBe("Ja, genau.");
  });
});

describe("stripOverlap", () => {
  it("removes the words repeated from the previous line", () => {
    expect(
      stripOverlap(
        "Wir beginnen mit den Nachrichten aus Berlin",
        "Nachrichten aus Berlin und sprechen dann über das Wetter",
      ),
    ).toBe("und sprechen dann über das Wetter");
  });

  it("drops a line that only repeats the previous one", () => {
    expect(stripOverlap("Guten Abend zusammen.", "Guten Abend zusammen.")).toBe("");
  });

  it("keeps a new sentence that shares no tail", () => {
    expect(stripOverlap("Guten Abend.", "Heute ist Dienstag.")).toBe("Heute ist Dienstag.");
  });
});

describe("isHallucination", () => {
  it("rejects blank text", () => {
    expect(isHallucination(" . ")).toBe(true);
  });
});

describe("formatClock", () => {
  it("formats minutes and hours", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(12_400)).toBe("00:12");
    expect(formatClock(3_661_000)).toBe("1:01:01");
  });
});
