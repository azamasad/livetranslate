export const SPEECH_MODELS = {
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
} as const;

export type SpeechModelKey = keyof typeof SPEECH_MODELS;

export const TRANSLATION_MODEL = {
  id: "Xenova/opus-mt-de-en",
  detail: "About 110 MB, stored in this browser after the first download.",
} as const;

export type ListenSource = "tab" | "mic";
export type TranslatorEngine = "builtin" | "ollama";
export type ComputeDevice = "wasm" | "webgpu";

export type Settings = {
  source: ListenSource;
  model: SpeechModelKey;
  device: ComputeDevice;
  engine: TranslatorEngine;
  ollamaModel: string;
  translateLive: boolean;
  follow: boolean;
  sensitivity: number;
  silenceMs: number;
  textScale: number;
};

export const DEFAULT_SETTINGS: Settings = {
  source: "tab",
  model: "base",
  device: "wasm",
  engine: "builtin",
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

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    const record = parsed as Partial<Settings>;
    return {
      source: record.source === "mic" ? "mic" : "tab",
      model: isSpeechModel(record.model) ? record.model : DEFAULT_SETTINGS.model,
      device: record.device === "webgpu" ? "webgpu" : "wasm",
      engine: record.engine === "ollama" ? "ollama" : "builtin",
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
