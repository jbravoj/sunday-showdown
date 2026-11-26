import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./firebase.ts";
import { formatCents } from "../shared/game.ts";
import { resultHeadline } from "../shared/scoring.ts";
import { squareNumber } from "../shared/season.ts";
import type { WeekBoard } from "./session.ts";

/**
 * Admin → Weeks, locked board: the week's result. Scored automatically from
 * the NFL feed after the game (review it here), or entered by hand.
 */
export default function WeekResultPanel({ board }: { board: WeekBoard }) {
  const r = board.result;
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(r ? String(r.homeScore) : "");
  const [away, setAway] = useState(r ? String(r.awayScore) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(fn: () => Promise<{ summary: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      setNotice(res.summary);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || home === "" || away === "") {
      setError("Enter both scores as whole numbers.");
      return;
    }
    void call(() => api.manageWeek({ op: "score", week: board.week, homeScore: h, awayScore: a }));
  }

  const form = (
    <form className="result-form" onSubmit={onSave}>
      <p className="hint">End-of-regulation score (4 quarters; overtime doesn't count).</p>
      <div className="result-inputs">
        <label className="field">
          <span className="label">{board.away.short} (away)</span>
          <input className="input" inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="field">
          <span className="label">{board.home.short} (home)</span>
          <input className="input" inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <div className="result-actions">
        <button className="btn btn-primary btn-small" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save score"}
        </button>
        {r && (
          <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="result-panel">
      <h3 className="result-title">Result</h3>
      {r ? (
        <>
          <p className={`result-headline${r.kind === "win" ? " result-win" : " result-roll"}`}>
            {resultHeadline(r, formatCents)}
            {r.kind === "win" && r.squareId ? ` · square ${squareNumber(r.squareId)}` : ""}
          </p>
          <p className="hint">
            {board.away.short} {r.awayScore}, {board.home.short} {r.homeScore} · numbers {r.homeDigit} / {r.awayDigit}
            {r.kind === "rollover" && (r.reason === "unpaid" ? " · that square hadn't paid" : " · landed on a black cell")}
            {" · "}
            {r.source === "auto" ? "from the NFL feed" : "entered by hand"}
            {r.source === "auto" && (r.confirmed ? " · confirmed ✓" : " · not reviewed yet")}
          </p>
          {editing ? (
            form
          ) : (
            <div className="result-actions">
              {r.source === "auto" && !r.confirmed && (
                <button
                  className="btn btn-primary btn-small"
                  disabled={busy}
                  onClick={() => call(() => api.manageWeek({ op: "confirmResult", week: board.week }))}
                >
                  Looks right
                </button>
              )}
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setEditing(true)}>
                Fix score
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="hint">
            {board.gameId
              ? "Scored automatically from the NFL feed about 3 hours after kickoff, once the game is final. You can also enter it now."
              : "This matchup was typed in, so enter the final score yourself after the game."}
          </p>
          {form}
        </>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
}
