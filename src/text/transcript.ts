const HALLUCINATIONS: RegExp[] = [
  /untertitel/i,
  /amara\.org/i,
  /vielen dank (fürs|für's|furs) zuschauen/i,
  /thanks for watching/i,
  /thank you for watching/i,
  /bitte abonnieren/i,
  /sous[- ]?titr/i,
  /^\W*(musik|music|applaus|applause|gelächter|laughter|stille|silence|lacht|lachen|seufzer|räuspern)\W*$/i,
  /^(\[|\()?\s*(musik|music|applaus|applause|gelächter|laughter)\s*(\]|\))?$/i,
];

export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?،؛؟])/g, "$1")
    .trim();
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function isHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  if (HALLUCINATIONS.some((pattern) => pattern.test(trimmed))) return true;

  const parts = trimmed
    .split(/[.!?]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (parts.length >= 3 && new Set(parts).size === 1 && (parts[0]?.length ?? 0) < 24) {
    return true;
  }
  return false;
}

/** Drop a repeated tail when the next phrase overlaps the previous one. */
export function stripOverlap(previous: string, next: string): string {
  const prior = previous.trim();
  const current = next.trim();
  if (!current) return "";
  if (!prior) return current;

  const priorWords = prior.split(/\s+/);
  const nextWords = current.split(/\s+/);
  const priorKey = priorWords.map(normalizeWord).join(" ");
  const nextKey = nextWords.map(normalizeWord).join(" ");
  if (priorKey === nextKey) return "";

  const max = Math.min(8, priorWords.length, nextWords.length);
  for (let count = max; count >= 3; count -= 1) {
    const tail = priorWords.slice(-count).map(normalizeWord).join(" ");
    const head = nextWords.slice(0, count).map(normalizeWord).join(" ");
    if (tail.length > 0 && tail === head) {
      return nextWords.slice(count).join(" ").trim();
    }
  }
  return current;
}

export function presentTranscript(raw: string, previousFinal: string): string {
  const cleaned = cleanTranscript(raw);
  if (!cleaned || isHallucination(cleaned)) return "";
  const stripped = stripOverlap(previousFinal, cleaned);
  if (!stripped || isHallucination(stripped)) return "";
  return stripped;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}
