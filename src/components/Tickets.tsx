import { useEffect, useState } from "react";
import type { Row, Ticket } from "../tickets";
import { formatClock } from "../text/transcript";

type TicketsProps = {
  rows: Row[];
  translateLive: boolean;
  onEdit: (id: number, german: string) => void;
  onTranslate: (id: number, german: string) => void;
};

export function Tickets({ rows, translateLive, onEdit, onTranslate }: TicketsProps) {
  if (rows.length === 0) return null;
  return (
    <div className="tickets">
      {rows.map((row) =>
        row.kind === "note" ? (
          <p key={row.id} className="session-note">
            {row.text}
          </p>
        ) : (
          <TicketCard
            key={row.ticket.id}
            ticket={row.ticket}
            translateLive={translateLive}
            onEdit={onEdit}
            onTranslate={onTranslate}
          />
        ),
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  translateLive,
  onEdit,
  onTranslate,
}: {
  ticket: Ticket;
  translateLive: boolean;
  onEdit: (id: number, german: string) => void;
  onTranslate: (id: number, german: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ticket.german);
  const live = ticket.phase === "draft";

  useEffect(() => {
    if (!editing) setDraft(ticket.german);
  }, [editing, ticket.german]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== ticket.german) onEdit(ticket.id, next);
  }

  return (
    <article className={live ? "ticket is-live" : "ticket"}>
      <div className="german-side">
        <div className="ticket-meta">
          <time dateTime={`PT${Math.round(ticket.atMs / 1000)}S`}>{formatClock(ticket.atMs)}</time>
          {live ? <span className="live-tag">Live</span> : null}
          <span className="ticket-actions">
            {live ? null : (
              <button type="button" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(
                  ticket.english ? `${ticket.german}\n${ticket.english}` : ticket.german,
                );
              }}
            >
              Copy
            </button>
          </span>
        </div>
        {editing ? (
          <textarea
            lang="de"
            className="german-edit"
            value={draft}
            aria-label="Correct the German"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(ticket.german);
                setEditing(false);
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commit();
            }}
            autoFocus
          />
        ) : (
          <p lang="de" className="german">
            {ticket.german}
            {live ? <span className="caret" aria-hidden="true" /> : null}
          </p>
        )}
      </div>
      <div className="english-side">
        <p className="side-kicker">English</p>
        {ticket.english ? (
          <p lang="en" className="english">
            {ticket.english}
          </p>
        ) : (
          <EnglishPending
            ticket={ticket}
            translateLive={translateLive}
            onTranslate={() => onTranslate(ticket.id, ticket.german)}
          />
        )}
      </div>
    </article>
  );
}

function EnglishPending({
  ticket,
  translateLive,
  onTranslate,
}: {
  ticket: Ticket;
  translateLive: boolean;
  onTranslate: () => void;
}) {
  if (ticket.translation === "error") {
    return (
      <div className="english-pending">
        <p className="english-error">{ticket.translationError ?? "The translation failed."}</p>
        <button type="button" onClick={onTranslate}>
          Try again
        </button>
      </div>
    );
  }
  if (ticket.translation === "pending" || (translateLive && ticket.phase === "final")) {
    return <p className="english-wait">Translating…</p>;
  }
  if (ticket.phase === "draft") {
    return <p className="english-wait">English follows when the phrase settles.</p>;
  }
  return (
    <div className="english-pending">
      <button type="button" onClick={onTranslate}>
        Translate
      </button>
    </div>
  );
}
