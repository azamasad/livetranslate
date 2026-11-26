import { env } from "@huggingface/transformers";

type WorkerScope = {
  crossOriginIsolated: boolean;
  location: { href: string };
};

export function configureRuntime(role: "speech" | "translate"): void {
  const scope = self as unknown as WorkerScope;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const cores = navigator.hardwareConcurrency || 4;
  const threads = scope.crossOriginIsolated
    ? role === "speech"
      ? Math.min(4, Math.max(1, cores - 2))
      : Math.min(2, Math.max(1, Math.floor(cores / 4)))
    : 1;
  const ortBase = new URL(`${import.meta.env.BASE_URL}ort/`, scope.location.href).href;
  const backend = env.backends.onnx as {
    wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: string };
  };
  backend.wasm = {
    ...(backend.wasm ?? {}),
    wasmPaths: ortBase,
    numThreads: threads,
    proxy: false,
  };
}
