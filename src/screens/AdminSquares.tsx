import { useState } from "react";
import Board from "../Board.tsx";
import { api, errorMessage } from "../firebase.ts";
import { useSeason } from "../session.ts";
import {
  CURRENT_SEASON,
  SQUARE_IDS,
  seasonLayout,
  squareNumber,
  squareOf,
} from "../../shared/season.ts";

export interface ApprovedPlayer {
  uid: string;
  displayName: string;
}

const NO_DIGITS = Array.from({ length: 10 }, () => null);

/**
 * Admin control for the season's 12 permanent squares. Picking a player for a
 * square seats them there; if they already had a square, the two swap.
 */
export default function AdminSquares({ approved }: { approved: readonly ApprovedPlayer[] }) {
  const season = useSeason(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (season.loading) return null;
  const { squares } = season;

  const sorted = [...approved].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const unseated = sorted.filter((p) => squareOf(squares, p.uid) === null);
  const open = SQUARE_IDS.filter((id) => squares[id] === null);
  const canDraw = open.length > 0 && unseated.length > 0;

  async function run(call: () => Promise<{ summary: string }>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage((await call()).summary);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card panel">
      <div className="players-head">
        <h2>Squares</h2>
        <p className="seat-count">
          <strong>{12 - open.length}</strong> / 12 filled
        </p>
      </div>
      <p>
        Each approved player gets one square for the {CURRENT_SEASON} season. Pick a player for a
        square to seat them; picking someone who already has a square swaps the two.
      </p>

      {season.error && <p className="error">{season.error}</p>}

      <Board
        layout={seasonLayout(squares)}
        topDigits={NO_DIGITS}
        leftDigits={NO_DIGITS}
        topTeam="Team TBD"
        leftTeam="Team TBD"
        openSquareIds={open}
      />

      <div className="draw-row">
        <button
          className="btn btn-primary"
          disabled={busy || !canDraw}
          onClick={() => run(() => api.manageSquares({ op: "draw" }))}
        >
          Random draw
        </button>
        <p className="hint">
          {canDraw
            ? `Seats ${Math.min(open.length, unseated.length)} unassigned player${
                Math.min(open.length, unseated.length) === 1 ? "" : "s"
              } in open squares at random. Squares already filled stay put.`
            : unseated.length === 0
              ? "Every approved player has a square."
              : "Every square is filled."}
        </p>
      </div>

      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      <ul className="square-list">
        {SQUARE_IDS.map((id) => {
          const seat = squares[id];
          return (
            <li key={id}>
              <span className="square-badge square-badge-small">{squareNumber(id)}</span>
              <label className="square-pick">
                <span className="visually-hidden">Player in square {squareNumber(id)}</span>
                <select
                  className="input"
                  disabled={busy}
                  value={seat?.uid ?? ""}
                  onChange={(e) => {
                    const uid = e.target.value;
                    if (uid) void run(() => api.manageSquares({ op: "place", squareId: id, uid }));
                  }}
                >
                  <option value="">Open</option>
                  {sorted.map((p) => {
                    const at = squareOf(squares, p.uid);
                    return (
                      <option key={p.uid} value={p.uid}>
                        {p.displayName}
                        {at && at !== id ? ` (in square ${squareNumber(at)})` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              {seat && (
                <button
                  className="btn btn-small btn-ghost"
                  disabled={busy}
                  onClick={() => run(() => api.manageSquares({ op: "clear", squareId: id }))}
                >
                  Clear
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {unseated.length > 0 && (
        <p className="hint">Without a square: {unseated.map((p) => p.displayName).join(", ")}</p>
      )}
    </section>
  );
}
