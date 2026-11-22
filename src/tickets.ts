export type TranslationState = "idle" | "pending" | "done" | "error";

export type Ticket = {
  id: number;
  atMs: number;
  german: string;
  english: string;
  phase: "draft" | "final";
  translation: TranslationState;
  translationError?: string;
  translatedFrom?: string;
};

export type Row =
  | { kind: "note"; id: string; text: string }
  | { kind: "line"; ticket: Ticket };

export type TicketAction =
  | { type: "session"; text: string }
  | { type: "draft"; id: number; atMs: number; german: string }
  | { type: "final"; id: number; atMs: number; german: string }
  | { type: "drop"; id: number }
  | { type: "edit"; id: number; german: string }
  | { type: "translate-start"; id: number }
  | { type: "translate-done"; id: number; english: string; from: string }
  | { type: "translate-error"; id: number; message: string }
  | { type: "clear" };

const MAX_LINES = 400;

function blankTicket(id: number, atMs: number, german: string, phase: Ticket["phase"]): Ticket {
  return {
    id,
    atMs,
    german,
    english: "",
    phase,
    translation: "idle",
  };
}

function trimRows(rows: Row[]): Row[] {
  const lineCount = rows.filter((row) => row.kind === "line").length;
  if (lineCount <= MAX_LINES) return rows;
  let extra = lineCount - MAX_LINES;
  return rows.filter((row) => {
    if (extra > 0 && row.kind === "line" && row.ticket.phase === "final") {
      extra -= 1;
      return false;
    }
    return true;
  });
}

function mapTicket(rows: Row[], id: number, update: (ticket: Ticket) => Ticket): Row[] {
  return rows.map((row) => {
    if (row.kind !== "line" || row.ticket.id !== id) return row;
    return { kind: "line", ticket: update(row.ticket) };
  });
}

export function reduceRows(state: Row[], action: TicketAction): Row[] {
  switch (action.type) {
    case "clear":
      return [];
    case "session": {
      if (state.length === 0) return state;
      return [...state, { kind: "note", id: `note-${action.text}-${state.length}`, text: action.text }];
    }
    case "drop":
      return state.filter((row) => row.kind !== "line" || row.ticket.id !== action.id || row.ticket.phase === "final");
    case "draft": {
      if (!action.german.trim()) return state;
      const existing = state.find((row) => row.kind === "line" && row.ticket.id === action.id);
      if (existing?.kind === "line" && existing.ticket.phase === "final") return state;
      const withoutStaleDrafts = state.filter(
        (row) => row.kind !== "line" || row.ticket.phase !== "draft" || row.ticket.id === action.id,
      );
      if (existing?.kind === "line") {
        return mapTicket(withoutStaleDrafts, action.id, (ticket) => ({
          ...ticket,
          german: action.german,
        }));
      }
      return trimRows([
        ...withoutStaleDrafts,
        { kind: "line", ticket: blankTicket(action.id, action.atMs, action.german, "draft") },
      ]);
    }
    case "final": {
      if (!action.german.trim()) {
        return state.filter((row) => row.kind !== "line" || row.ticket.id !== action.id || row.ticket.phase === "final");
      }
      const existing = state.find((row) => row.kind === "line" && row.ticket.id === action.id);
      if (existing?.kind === "line") {
        return mapTicket(state, action.id, (ticket) => ({
          ...ticket,
          german: action.german,
          phase: "final",
          atMs: ticket.atMs || action.atMs,
        }));
      }
      const withoutDrafts = state.filter((row) => row.kind !== "line" || row.ticket.phase !== "draft");
      return trimRows([
        ...withoutDrafts,
        { kind: "line", ticket: blankTicket(action.id, action.atMs, action.german, "final") },
      ]);
    }
    case "edit":
      return mapTicket(state, action.id, (ticket) => {
        if (ticket.phase !== "final" || ticket.german === action.german) return ticket;
        return {
          ...ticket,
          german: action.german,
          english: "",
          translation: "idle",
          translatedFrom: undefined,
          translationError: undefined,
        };
      });
    case "translate-start":
      return mapTicket(state, action.id, (ticket) => ({
        ...ticket,
        translation: "pending",
        translationError: undefined,
      }));
    case "translate-done":
      return mapTicket(state, action.id, (ticket) => {
        if (ticket.german.trim() !== action.from.trim()) return ticket;
        return {
          ...ticket,
          english: action.english,
          translation: "done",
          translatedFrom: action.from,
          translationError: undefined,
        };
      });
    case "translate-error":
      return mapTicket(state, action.id, (ticket) => ({
        ...ticket,
        translation: "error",
        translationError: action.message,
      }));
    default:
      return state;
  }
}

export function latestFinalGerman(rows: Row[]): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.kind === "line" && row.ticket.phase === "final" && row.ticket.german) {
      return row.ticket.german;
    }
  }
  return "";
}
