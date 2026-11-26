export function translationInput(text: string, prefix: string): string {
  const body = text.trim();
  if (!prefix) return body;
  return `${prefix} ${body}`;
}

export function cleanTranslation(raw: string): string {
  return raw
    .replace(/^>>[a-z0-9_]+<<\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
