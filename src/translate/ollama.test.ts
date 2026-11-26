import { describe, expect, it } from "vitest";
import { ollamaTranslationRequest, parseOllamaTags, readOllamaTranslation } from "./ollama";

describe("parseOllamaTags", () => {
  it("reads model names and skips broken entries", () => {
    expect(
      parseOllamaTags({
        models: [{ name: "llama3.2:latest", size: 20 }, { name: "" }, { nope: true }, null],
      }),
    ).toEqual([{ name: "llama3.2:latest", size: 20 }]);
  });

  it("returns nothing for an unexpected payload", () => {
    expect(parseOllamaTags(null)).toEqual([]);
    expect(parseOllamaTags({ models: "nope" })).toEqual([]);
  });
});

describe("readOllamaTranslation", () => {
  it("returns the message text without wrapping quotes", () => {
    expect(readOllamaTranslation({ message: { content: '"Good evening."' } })).toBe("Good evening.");
  });

  it("surfaces an Ollama error", () => {
    expect(() => readOllamaTranslation({ error: "model not found" })).toThrow(/model not found/);
  });
});

describe("ollamaTranslationRequest", () => {
  it("asks for the translation only", () => {
    const body = ollamaTranslationRequest("qwen2.5:3b", "Guten Abend.");
    expect(body.model).toBe("qwen2.5:3b");
    expect(body.stream).toBe(false);
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[1]?.content).toBe("Guten Abend.");
    expect(messages[0]?.content).toContain("spoken German");
  });

  it("asks for Persian script when that is the target", () => {
    const body = ollamaTranslationRequest("aya-expanse:8b", "Let's start.", { source: "English", target: "Persian" });
    const messages = body.messages as { content: string }[];
    expect(messages[0]?.content).toContain("Persian script");
    expect(messages[1]?.content).toBe("Let's start.");
  });
});
