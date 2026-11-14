import { useState, type FormEvent } from "react";
import WeekView, { weekFigures } from "../WeekView.tsx";
import { api, errorMessage } from "../firebase.ts";
import { useSeason, useWeeks, type WeekBoard } from "../session.ts";
import { CURRENT_SEASON, SQUARE_IDS, squareNumber, type Seat } from "../../shared/season.ts";
import { formatCents } from "../../shared/game.ts";
import { LOCK_LEAD_MINUTES } from "../../shared/week.ts";
import { REGULAR_SEASON_WEEKS } from "../../shared/schedule.ts";

const WEEKS = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
const TEST_YEAR = Number(CURRENT_SEASON) - 1;

function defaultWeek(weeks: WeekBoard[]): number {
  // The first week that isn't locked yet, else the last one.
  const done = new Set(weeks.filter((w) => w.status === "locked").map((w) => w.week));
  return WEEKS.find((n) => !done.has(n)) ?? REGULAR_SEASON_WEEKS;
}

export default function AdminWeeks() {
  const weeksState = useWeeks(true);
  const season = useSeason(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useTestYear, setUseTestYear] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manual, setManual] = useState({ away: "", home: "", kickoff: "" });

  if (weeksState.loading || season.loading) return <p className="coming">Loading…</p>;
  const weeks = weeksState.weeks;
  const selected = picked ?? defaultWeek(weeks);
  const board = weeks.find((w) => w.week === selected) ?? null;

  function choose(n: number) {
    setPicked(n);
    setMessage(null);
    setError(null);
    setConfirmLock(false);
    setConfirmDelete(false);
  }

  async function run(call: () => Promise<{ summary: string }>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setConfirmLock(false);
    setConfirmDelete(false);
    try {
      setMessage((await call()).summary);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function fetchMatchup() {
    // A board set up from a test schedule refreshes from that same schedule.
    const year = board?.source.startsWith("espn-")
      ? Number(board.source.slice(5))
      : !board && useTestYear
        ? TEST_YEAR
        : undefined;
    void run(() =>
      api.manageWeek({ op: "fetch", week: selected, ...(year ? { scheduleYear: year } : {}) }),
    );
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const kickoff = new Date(manual.kickoff);
    if (Number.isNaN(kickoff.getTime())) {
      setError("Pick the kickoff date and time.");
      return;
    }
    void run(() =>
      api.manageWeek({
        op: "manual",
        week: selected,
        home: manual.home,
        away: manual.away,
        kickoff: kickoff.toISOString(),
      }),
    );
  }

  const statusOf = (n: number) => weeks.find((w) => w.week === n)?.status ?? "none";

  return (
    <>
      <section className="card panel">
        <h2>Weekly boards</h2>
        <p>
          Set up each week's Sunday night game. The home team goes across the top. Players see the
          board once you publish it. Boards lock on their own {LOCK_LEAD_MINUTES} minutes before
          kickoff (or when you lock them): the numbers are drawn and payments become final.
        </p>
        <div className="week-chips" role="list">
          {WEEKS.map((n) => (
            <button
              key={n}
              role="listitem"
              className={`week-chip week-${statusOf(n)}${n === selected ? " week-chip-on" : ""}`}
              aria-pressed={n === selected}
              aria-label={`Week ${n}, ${statusOf(n) === "none" ? "not set up" : statusOf(n)}`}
              onClick={() => choose(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="hint week-legend">
          <span className="dot dot-draft" /> Draft <span className="dot dot-open" /> Published{" "}
          <span className="dot dot-locked" /> Locked
        </p>
        {weeksState.error && <p className="error">{weeksState.error}</p>}
      </section>

      {message && <p className="notice notice-block">{message}</p>}
      {error && <p className="error error-block">{error}</p>}

      {board ? (
        <>
          <WeekView week={board} liveSquares={season.squares} uid={null} />

          <Payments
            board={board}
            liveSquares={season.squares}
            busy={busy}
            onToggle={(uid, paid) => run(() => api.setPayment({ week: selected, uid, paid }))}
          />

          <section className="card panel week-actions">
            {board.source !== "espn" && (
              <p className="hint">
                {board.source === "manual"
                  ? "Matchup entered by hand."
                  : `Test matchup from the ${board.source.replace("espn-", "")} schedule.`}
              </p>
            )}

            {board.status === "draft" && (
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.manageWeek({ op: "publish", week: selected }))}>
                Publish to players
              </button>
            )}

            {board.status === "open" &&
              (confirmLock ? (
                <div className="confirm">
                  <p>
                    Lock week {selected}? The numbers get drawn and the squares freeze as they are now.
                    This can't be undone.
                  </p>
                  <div className="confirm-row">
                    <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.manageWeek({ op: "lock", week: selected }))}>
                      Lock & draw numbers
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmLock(false)}>
                      Not yet
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={() => setConfirmLock(true)}>
                  Lock & draw numbers
                </button>
              ))}

            {board.status !== "locked" && (
              <div className="secondary-actions">
                <button className="btn btn-ghost btn-small" disabled={busy} onClick={fetchMatchup}>
                  Refresh matchup
                </button>
                {confirmDelete ? (
                  <>
                    <button className="btn btn-danger btn-small" disabled={busy} onClick={() => run(() => api.manageWeek({ op: "delete", week: selected }))}>
                      Delete week {selected}
                    </button>
                    <button className="btn btn-ghost btn-small" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                )}
              </div>
            )}
            {board.status === "locked" && (
              <p className="hint">Locked boards are permanent. Scores and the winner come in a later phase.</p>
            )}
          </section>
        </>
      ) : (
        <section className="card panel">
          <h2>Set up week {selected}</h2>
          <p>Pull the Sunday night game from the NFL schedule.</p>
          <div className="stack">
            <button className="btn btn-primary" disabled={busy} onClick={fetchMatchup}>
              {busy ? "Looking it up…" : "Get the Sunday night matchup"}
            </button>
            <label className="check check-tight">
              <input type="checkbox" checked={useTestYear} onChange={(e) => setUseTestYear(e.target.checked)} />
              <span>
                Testing: use the {TEST_YEAR} schedule (the {CURRENT_SEASON} schedule comes out in the
                spring)
              </span>
            </label>
          </div>

          <details className="manual">
            <summary>Or enter the teams by hand</summary>
            <form className="stack" onSubmit={submitManual}>
              <label className="field">
                <span className="label">Away team</span>
                <input className="input" required maxLength={40} placeholder="Pittsburgh Steelers" value={manual.away} onChange={(e) => setManual({ ...manual, away: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Home team (goes on top)</span>
                <input className="input" required maxLength={40} placeholder="Cincinnati Bengals" value={manual.home} onChange={(e) => setManual({ ...manual, home: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Kickoff (your time)</span>
                <input className="input" type="datetime-local" required value={manual.kickoff} onChange={(e) => setManual({ ...manual, kickoff: e.target.value })} />
              </label>
              <button className="btn" disabled={busy} type="submit">
                Save matchup
              </button>
            </form>
          </details>
        </section>
      )}
    </>
  );
}

/** Who paid this week. Editable until the board locks, then frozen. */
function Payments(props: {
  board: WeekBoard;
  liveSquares: Record<string, Seat | null>;
  busy: boolean;
  onToggle: (uid: string, paid: boolean) => void;
}) {
  const { board, liveSquares, busy, onToggle } = props;
  const { locked, squares, paid, seated, potCents } = weekFigures(board, liveSquares);

  return (
    <section className="card panel">
      <div className="players-head">
        <h2>Payments</h2>
        <p className="seat-count">
          <strong>{paid.length}</strong> / {seated.length} paid
        </p>
      </div>
      <p>
        {locked
          ? `Final for week ${board.week}. Pot ${formatCents(potCents)}.`
          : `Tap to mark who's paid the $100. Pot so far ${formatCents(potCents)}. Anyone not marked paid when the board locks can't win this week.`}
      </p>
      {seated.length === 0 && <p className="hint">No one has a square yet. Assign squares on the Players page.</p>}
      <ul className="pay-list">
        {SQUARE_IDS.filter((id) => squares[id] !== null).map((id) => {
          const seat = squares[id]!;
          const isPaid = paid.includes(id);
          return (
            <li key={id}>
              <span className="square-badge square-badge-small">{squareNumber(id)}</span>
              <span className="pay-name">{seat.name}</span>
              {locked ? (
                <span className={isPaid ? "paid-pill paid-yes" : "paid-pill paid-no"}>
                  {isPaid ? "Paid" : "Not paid"}
                </span>
              ) : (
                <button
                  className={isPaid ? "btn btn-small btn-primary pay-btn" : "btn btn-small btn-ghost pay-btn"}
                  disabled={busy}
                  aria-pressed={isPaid}
                  onClick={() => onToggle(seat.uid, !isPaid)}
                >
                  {isPaid ? "Paid ✓" : "Mark paid"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
