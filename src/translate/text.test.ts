import { describe, expect, it } from "vitest";
import { cleanTranslation, translationInput } from "./text";

describe("translation text", () => {
  it("marks Persian for the multilingual model and strips an echoed tag", () => {
    expect(translationInput("Let's start.", ">>pes<<")).toBe(">>pes<< Let's start.");
    expect(cleanTranslation(">>pes<<  بیایید شروع کنیم. ")).toBe("بیایید شروع کنیم.");
  });

  it("leaves a direct translation untouched", () => {
    expect(translationInput("Guten Abend.", "")).toBe("Guten Abend.");
    expect(cleanTranslation("Good evening.")).toBe("Good evening.");
  });
});
