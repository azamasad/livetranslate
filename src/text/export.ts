import { formatClock } from "./transcript";
import type { Row } from "../tickets";

export function transcriptToText(rows: Row[]): string {
  const blocks: string[] = [];
  for (const row of rows) {
    if (row.kind === "note") {
      blocks.push(row.text);
      continue;
    }
    const { ticket } = row;
    const english = ticket.english.trim() ? ticket.english.trim() : "—";
    blocks.push(`[${formatClock(ticket.atMs)}]\nDE  ${ticket.german}\nEN  ${english}`);
  }
  return blocks.join("\n\n").trim();
}
