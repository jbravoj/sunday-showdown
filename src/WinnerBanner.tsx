import { useState } from "react";

const KEY = "ss.closedWinnerBanner";

function wasClosed(id: string): boolean {
  try {
    return localStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}

/**
 * Celebration banner for a week's winner. Stays up until closed; closing is
 * remembered per result (`id`), so the next winner shows again.
 */
export default function WinnerBanner(props: {
  /** Unique per result, e.g. "2027-w05". Omit to make it non-closable (Simulator). */
  id?: string;
  weekLabel: string;
  name: string;
  squareNumber: number;
  amount: string;
  isYou: boolean;
  /** Extra line, e.g. the score. */
  detail?: string;
}) {
  const { id } = props;
  const [closed, setClosed] = useState(() => (id ? wasClosed(id) : false));
  if (closed) return null;

  function close() {
    setClosed(true);
    try {
      if (id) localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className={`winner-banner${props.isYou ? " winner-banner-you" : ""}`} role="status" aria-live="polite">
      <span className="winner-trophy" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
        </svg>
      </span>
      <div className="winner-text">
        <p className="winner-kicker">{props.weekLabel} winner</p>
        <p className="winner-headline">
          {props.isYou ? "You won " : `${props.name} wins `}
          <span className="winner-amount">{props.amount}</span>
        </p>
        <p className="winner-detail">
          Square {props.squareNumber}
          {props.isYou ? ` · ${props.name}` : ""}
          {props.detail ? ` · ${props.detail}` : ""}
        </p>
      </div>
      {id && (
        <button className="winner-close" aria-label="Close winner banner" onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </section>
  );
}
