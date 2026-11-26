import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, PAIRS, builtinTranslator, pairFromSearch, pairOf } from "./models";

describe("language pairs", () => {
  it("starts on English to Persian through the microphone", () => {
    expect(DEFAULT_SETTINGS.source).toBe("mic");
    expect(pairOf(DEFAULT_SETTINGS).target.name).toBe("Persian");
    expect(builtinTranslator(DEFAULT_SETTINGS).tgtLang).toBe("pes_Arab");
  });

  it("starts English to Persian on the clearer model", () => {
    const settings = { ...DEFAULT_SETTINGS, pair: "en-fa" as const };
    expect(pairOf(settings).source.whisper).toBeNull();
    expect(pairOf(settings).speech.base.id).toBe("Xenova/whisper-base.en");
    expect(builtinTranslator(settings).tgtLang).toBe("pes_Arab");
    expect(builtinTranslator({ ...settings, translation: "quick" }).prefix).toBe(">>pes<<");
    expect(pairOf(settings).maxSegmentMs).toBeLessThan(PAIRS["de-en"].maxSegmentMs);
  });

  it("reads the pair from a bookmark query", () => {
    expect(pairFromSearch("?pair=en-fa")).toBe("en-fa");
    expect(pairFromSearch("?pair=nope")).toBeNull();
  });
});
