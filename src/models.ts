export type SpeechModelKey = "tiny" | "base" | "small";
export type PairId = "de-en" | "en-fa";
export type ListenSource = "tab" | "mic";
export type TranslatorEngine = "builtin" | "ollama";
export type TranslationKind = "quick" | "clear";
export type ComputeDevice = "wasm" | "webgpu";

export type SpeechChoice = {
  id: string;
  label: string;
  detail: string;
};

export type TranslatorChoice = {
  id: string;
  label: string;
  detail: string;
  prefix?: string;
  srcLang?: string;
  tgtLang?: string;
};

export type CaptionLanguage = {
  name: string;
  lang: string;
  code: string;
  dir: "ltr" | "rtl";
  whisper: string | null;
};

export type LanguagePair = {
  id: PairId;
  label: string;
  tagline: string;
  title: string;
  hint: string;
  source: CaptionLanguage;
  target: CaptionLanguage;
  speech: Record<SpeechModelKey, SpeechChoice>;
  quick: TranslatorChoice;
  clear: TranslatorChoice | null;
  maxSegmentMs: number;
  example: { source: string; target: string };
};

const GERMAN_SPEECH: Record<SpeechModelKey, SpeechChoice> = {
  tiny: {
    id: "Xenova/whisper-tiny",
    label: "Fast",
    detail: "About 40 MB. Quicker, and a bit rougher on names and fast speech.",
  },
  base: {
    id: "Xenova/whisper-base",
    label: "Balanced",
    detail: "About 80 MB. The one to start with.",
  },
  small: {
    id: "Xenova/whisper-small",
    label: "Sharper",
    detail: "About 250 MB. Steadier when the voice is fast, quiet, or crowded.",
  },
};

const ENGLISH_SPEECH: Record<SpeechModelKey, SpeechChoice> = {
  tiny: {
    id: "Xenova/whisper-tiny.en",
    label: "Fast",
    detail: "About 40 MB. Keeps up with quick English on a normal laptop. Rougher on names.",
  },
  base: {
    id: "Xenova/whisper-base.en",
    label: "Balanced",
    detail: "About 80 MB. The one to start with for English.",
  },
  small: {
    id: "Xenova/whisper-small.en",
    label: "Sharper",
    detail: "About 250 MB. Clearer, but a regular laptop falls behind fast talk.",
  },
};

export const PAIRS: Record<PairId, LanguagePair> = {
  "de-en": {
    id: "de-en",
    label: "German → English",
    tagline: "Live German, with English beside it.",
    title: "Nebenbei — live German beside English",
    hint: "",
    source: { name: "German", lang: "de", code: "DE", dir: "ltr", whisper: "german" },
    target: { name: "English", lang: "en", code: "EN", dir: "ltr", whisper: null },
    speech: GERMAN_SPEECH,
    quick: {
      id: "Xenova/opus-mt-de-en",
      label: "Built in",
      detail: "A German-to-English model in this browser. About 110 MB the first time.",
    },
    clear: null,
    maxSegmentMs: 8000,
    example: {
      source: "Guten Abend, willkommen zur heutigen Sendung. Wir beginnen mit den Nachrichten aus Berlin.",
      target: "Good evening, welcome to today’s broadcast. We begin with the news from Berlin.",
    },
  },
  "en-fa": {
    id: "en-fa",
    label: "English → Persian",
    tagline: "Live English, with Persian beside it.",
    title: "Nebenbei — live English beside Persian",
    hint: "English appears as it is heard. Persian is added when the phrase settles. On a normal laptop, Balanced speech and Quick Persian stay closest to a fast voice.",
    source: { name: "English", lang: "en", code: "EN", dir: "ltr", whisper: null },
    target: { name: "Persian", lang: "fa", code: "FA", dir: "rtl", whisper: null },
    speech: ENGLISH_SPEECH,
    quick: {
      id: "Xenova/opus-mt-en-mul",
      label: "Quick Persian",
      detail: "About 120 MB. Plain Persian that keeps up with the voice.",
      prefix: ">>pes<<",
    },
    clear: {
      id: "Xenova/nllb-200-distilled-600M",
      label: "Clearer Persian",
      detail: "About 900 MB. More natural Persian. On a regular laptop it trails the English by a few lines. The English itself stays live.",
      srcLang: "eng_Latn",
      tgtLang: "pes_Arab",
    },
    maxSegmentMs: 4500,
    example: {
      source: "Let's start with a short update, and then I'll take your questions.",
      target: "بیایید با یک گزارش کوتاه شروع کنیم، بعد سؤال‌هایتان را می‌گیرم.",
    },
  },
};

export type Settings = {
  pair: PairId;
  source: ListenSource;
  model: SpeechModelKey;
  device: ComputeDevice;
  engine: TranslatorEngine;
  translation: TranslationKind;
  ollamaModel: string;
  translateLive: boolean;
  follow: boolean;
  sensitivity: number;
  silenceMs: number;
  textScale: number;
};

export const DEFAULT_SETTINGS: Settings = {
  pair: "de-en",
  source: "tab",
  model: "base",
  device: "wasm",
  engine: "builtin",
  translation: "quick",
  ollamaModel: "",
  translateLive: true,
  follow: true,
  sensitivity: 3.5,
  silenceMs: 700,
  textScale: 1,
};

const STORAGE_KEY = "nebenbei-settings-v1";

function isSpeechModel(value: unknown): value is SpeechModelKey {
  return value === "tiny" || value === "base" || value === "small";
}

export function pairOf(settings: Settings): LanguagePair {
  return PAIRS[settings.pair];
}

export function builtinTranslator(settings: Settings): TranslatorChoice {
  const pair = PAIRS[settings.pair];
  if (settings.translation === "clear" && pair.clear) return pair.clear;
  return pair.quick;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    const record = parsed as Partial<Settings>;
    return {
      pair: record.pair === "en-fa" ? "en-fa" : "de-en",
      source: record.source === "mic" ? "mic" : "tab",
      model: isSpeechModel(record.model) ? record.model : DEFAULT_SETTINGS.model,
      device: record.device === "webgpu" ? "webgpu" : "wasm",
      engine: record.engine === "ollama" ? "ollama" : "builtin",
      translation: record.translation === "clear" ? "clear" : "quick",
      ollamaModel: typeof record.ollamaModel === "string" ? record.ollamaModel : "",
      translateLive: record.translateLive !== false,
      follow: record.follow !== false,
      sensitivity:
        typeof record.sensitivity === "number" && record.sensitivity >= 1.5 && record.sensitivity <= 8
          ? record.sensitivity
          : DEFAULT_SETTINGS.sensitivity,
      silenceMs:
        typeof record.silenceMs === "number" && record.silenceMs >= 350 && record.silenceMs <= 1400
          ? record.silenceMs
          : DEFAULT_SETTINGS.silenceMs,
      textScale:
        typeof record.textScale === "number" && record.textScale >= 0.85 && record.textScale <= 1.45
          ? record.textScale
          : DEFAULT_SETTINGS.textScale,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function pairFromSearch(search: string): PairId | null {
  const value = new URLSearchParams(search).get("pair");
  if (value === "en-fa" || value === "de-en") return value;
  return null;
}
