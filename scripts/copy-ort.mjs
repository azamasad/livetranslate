import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/@huggingface/transformers/dist");
const destination = join(root, "public/ort");
const files = ["ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"];

mkdirSync(destination, { recursive: true });
for (const name of files) {
  copyFileSync(join(source, name), join(destination, name));
}
