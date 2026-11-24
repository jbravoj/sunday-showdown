import { useState } from "react";
import { api, errorMessage } from "./firebase.ts";
import { SQUARE_IDS, pickDeadline, squareNumber, type Seat } from "../shared/season.ts";

/**
 * Approved but no square yet: pick one of the open squares. First pick is
 * final. If they don't pick within 24 hours of approval (or before a board
 * locks), the site picks a random open square for them.
 */
export default function SquarePicker({
  squares,
  pickFromMs,
}: {
  squares: Readonly<Record<string, Seat | null>>;
  pickFromMs: number | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = SQUARE_IDS.filter((id) => squares[id] === null);
  const deadline = pickFromMs !== null ? new Date(pickDeadline(pickFromMs)) : null;
  // If the pick was just taken by someone else, drop it.
  const pick = selected && squares[selected] === null ? selected : null;

  async function onTake() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await api.pickSquare({ squareId: pick });
      // The live season board moves this card on to "Your square".
    } catch (err) {
      setError(errorMessage(err));
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  if (open.length === 0) {
    return <p className="hint">Every square is taken right now. The admin will sort out your seat.</p>;
  }

  return (
    <div className="picker">
      <h3 className="picker-title">Pick your square</h3>
      <p className="hint">
        It's yours all season, and your first pick is final.
        {deadline && (
          <>
            {" "}
            Pick by{" "}
            <b>
              {deadline.toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </b>{" "}
            or the site picks a random open square for you.
          </>
        )}
      </p>
      <div className="picker-grid" role="radiogroup" aria-label="Open squares">
        {SQUARE_IDS.map((id) => {
          const seat = squares[id];
          const isPick = pick === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isPick}
              className={`picker-square${seat ? " picker-taken" : ""}${isPick ? " picker-picked" : ""}`}
              disabled={seat !== null || busy}
              onClick={() => {
                setError(null);
                setSelected(id);
              }}
            >
              <span className="picker-num">{squareNumber(id)}</span>
              <span className="picker-name">{seat ? seat.name : "Open"}</span>
            </button>
          );
        })}
      </div>
      {pick ? (
        <div className="picker-confirm">
          <button className="btn btn-primary" disabled={busy} onClick={onTake}>
            {busy ? "Saving…" : `Take square ${squareNumber(pick)}`}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>
            Cancel
          </button>
          <p className="hint">This can't be changed later. Only the admin can move you.</p>
        </div>
      ) : (
        <p className="hint picker-tip">Tap an open square to choose it.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
