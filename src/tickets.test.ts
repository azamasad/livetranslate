import { describe, expect, it } from "vitest";
import { reduceRows } from "./tickets";

describe("reduceRows", () => {
  it("turns a draft into a finished line without changing its start time", () => {
    const drafted = reduceRows([], { type: "draft", id: 4, atMs: 1200, german: "Guten" });
    const finished = reduceRows(drafted, { type: "final", id: 4, atMs: 4000, german: "Guten Abend." });
    expect(finished).toHaveLength(1);
    const row = finished[0];
    expect(row?.kind).toBe("line");
    if (row?.kind === "line") {
      expect(row.ticket.phase).toBe("final");
      expect(row.ticket.german).toBe("Guten Abend.");
      expect(row.ticket.atMs).toBe(1200);
    }
  });

  it("ignores a late draft after the line is finished", () => {
    const finished = reduceRows([], { type: "final", id: 2, atMs: 500, german: "Heute." });
    const next = reduceRows(finished, { type: "draft", id: 2, atMs: 500, german: "Heute. Extra" });
    expect(next).toEqual(finished);
  });

  it("does not apply a translation for German that has since changed", () => {
    let rows = reduceRows([], { type: "final", id: 1, atMs: 0, german: "Alt." });
    rows = reduceRows(rows, { type: "edit", id: 1, german: "Neu." });
    rows = reduceRows(rows, { type: "translate-done", id: 1, english: "Old.", from: "Alt." });
    const row = rows[0];
    if (row?.kind === "line") {
      expect(row.ticket.german).toBe("Neu.");
      expect(row.ticket.english).toBe("");
    }
  });

  it("drops an empty final and clears a leftover draft", () => {
    const drafted = reduceRows([], { type: "draft", id: 3, atMs: 0, german: "Hm" });
    expect(reduceRows(drafted, { type: "final", id: 3, atMs: 0, german: "" })).toEqual([]);
  });
});
