import { formatClock } from "./transcript";
import type { Row } from "../tickets";

export function transcriptToText(rows: Row[], labels: { source: string; target: string } = { source: "DE", target: "EN" }): string {
  const blocks: string[] = [];
  for (const row of rows) {
    if (row.kind === "note") {
      blocks.push(row.text);
      continue;
    }
    const { ticket } = row;
    const translation = ticket.english.trim() ? ticket.english.trim() : "—";
    blocks.push(`[${formatClock(ticket.atMs)}]\n${labels.source}  ${ticket.german}\n${labels.target}  ${translation}`);
  }
  return blocks.join("\n\n").trim();
}
