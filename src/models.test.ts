import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, builtinTranslator, pairFromSearch, pairOf } from "./models";

describe("language pairs", () => {
  it("keeps German to English as the default", () => {
    expect(pairOf(DEFAULT_SETTINGS).source.name).toBe("German");
    expect(builtinTranslator(DEFAULT_SETTINGS).id).toBe("Xenova/opus-mt-de-en");
  });

  it("uses a fast Persian model, with a clearer one on request", () => {
    const settings = { ...DEFAULT_SETTINGS, pair: "en-fa" as const };
    expect(pairOf(settings).source.whisper).toBeNull();
    expect(pairOf(settings).speech.base.id).toBe("Xenova/whisper-base.en");
    expect(builtinTranslator(settings).prefix).toBe(">>pes<<");
    expect(builtinTranslator({ ...settings, translation: "clear" }).tgtLang).toBe("pes_Arab");
    expect(pairOf(settings).maxSegmentMs).toBeLessThan(pairOf(DEFAULT_SETTINGS).maxSegmentMs);
  });

  it("reads the pair from a bookmark query", () => {
    expect(pairFromSearch("?pair=en-fa")).toBe("en-fa");
    expect(pairFromSearch("?pair=nope")).toBeNull();
  });
});
