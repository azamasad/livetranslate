export type ComputeDevice = "wasm" | "webgpu";

export type ModelProgress = {
  status: string;
  name: string;
  file: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export type ReadyInfo = {
  device: ComputeDevice;
  note: string;
};

export type EngineRequest =
  | { type: "load"; id: string; asrModel: string; mtModel: string | null; device: ComputeDevice }
  | { type: "transcribe"; id: string; audio: Float32Array; sampleRate: number }
  | { type: "translate"; id: string; text: string };

export type EngineEvent =
  | { type: "progress"; progress: ModelProgress }
  | { type: "partial"; id: string; text: string }
  | { type: "result"; id: string; ok: true; text: string; ready?: ReadyInfo }
  | { type: "result"; id: string; ok: false; error: string };

export type ProgressGroup = {
  label: string;
  progress: number;
  loaded: number;
  total: number;
};

export function progressLabel(name: string): string {
  if (name.includes("whisper")) return "German speech";
  if (name.includes("opus")) return "English translation";
  if (!name) return "Model files";
  return "Model files";
}

export function groupProgress(items: Iterable<ModelProgress>): ProgressGroup[] {
  const groups = new Map<string, { loaded: number; total: number }>();
  for (const item of items) {
    if (!item.file || !item.total || item.total <= 0) continue;
    const label = progressLabel(item.name);
    const group = groups.get(label) ?? { loaded: 0, total: 0 };
    group.loaded += Math.min(item.total, item.loaded ?? 0);
    group.total += item.total;
    groups.set(label, group);
  }
  return [...groups.entries()].map(([label, group]) => ({
    label,
    loaded: group.loaded,
    total: group.total,
    progress: group.total === 0 ? 0 : Math.round((group.loaded / group.total) * 100),
  }));
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}
