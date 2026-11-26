export type OllamaModel = {
  name: string;
  size: number;
};

export function parseOllamaTags(payload: unknown): OllamaModel[] {
  if (!payload || typeof payload !== "object" || !("models" in payload)) return [];
  const models = (payload as { models: unknown }).models;
  if (!Array.isArray(models)) return [];
  const found: OllamaModel[] = [];
  for (const item of models) {
    if (!item || typeof item !== "object" || !("name" in item)) continue;
    const name = (item as { name: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") continue;
    const size = "size" in item && typeof (item as { size: unknown }).size === "number" ? (item as { size: number }).size : 0;
    found.push({ name, size });
  }
  return found;
}

export function readOllamaTranslation(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Ollama sent an unexpected reply.");
  }
  if ("error" in payload && payload.error) {
    throw new Error(String(payload.error));
  }
  const message = "message" in payload ? payload.message : undefined;
  if (!message || typeof message !== "object" || !("content" in message)) {
    throw new Error("Ollama sent an unexpected reply.");
  }
  const content = String(message.content).trim();
  if (!content) throw new Error("Ollama returned an empty translation.");
  return content.replace(/^["“]|["”]$/g, "").trim();
}

export function ollamaTranslationRequest(
  model: string,
  text: string,
  languages: { source: string; target: string } = { source: "German", target: "English" },
): Record<string, unknown> {
  const script = languages.target === "Persian" ? " Write in Persian script." : "";
  return {
    model,
    stream: false,
    messages: [
      {
        role: "system",
        content: `You translate spoken ${languages.source} into natural ${languages.target} for live captions. Return only the ${languages.target} translation. Keep names as spoken. Do not add notes, quotes, or alternatives. If the ${languages.source} is a fragment, translate the fragment.${script}`,
      },
      { role: "user", content: text },
    ],
    options: { temperature: 0 },
    keep_alive: "30m",
  };
}

const OLLAMA_UNREACHABLE = "Ollama isn’t running at 127.0.0.1:11434, or this page can’t reach it. Start Ollama, or switch back to the built-in translator.";

export async function fetchOllamaModels(signal?: AbortSignal): Promise<OllamaModel[]> {
  let response: Response;
  try {
    response = await fetch("/ollama/api/tags", { signal });
  } catch {
    throw new Error(OLLAMA_UNREACHABLE);
  }
  if (!response.ok) throw new Error(OLLAMA_UNREACHABLE);
  return parseOllamaTags(await response.json());
}

export async function translateWithOllama(
  model: string,
  text: string,
  languages?: { source: string; target: string },
  signal?: AbortSignal,
): Promise<string> {
  if (!model.trim()) {
    throw new Error("Choose an Ollama model in Tuning. It has to be one you have already pulled.");
  }
  let response: Response;
  try {
    response = await fetch("/ollama/api/chat", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaTranslationRequest(model, text, languages)),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(OLLAMA_UNREACHABLE);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? String(payload.error)
        : `Ollama returned ${response.status}.`;
    throw new Error(message);
  }
  return readOllamaTranslation(payload);
}
