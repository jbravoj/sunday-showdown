import { useEffect, useMemo, useState } from "react";
import Board from "../Board.tsx";
import { computePrize, formatCents, resolveWeek, shuffleDigits } from "../../shared/game.ts";
import { SQUARE_IDS, emptySquares, seasonLayout, squareNumber } from "../../shared/season.ts";
import {
  REGULAR_SEASON_WEEKS,
  findSundayNightGame,
  parseScoreboard,
  scoreboardUrl,
  type Game,
} from "../../shared/schedule.ts";
import { CURRENT_SEASON } from "../../shared/season.ts";

// Simulator: runs a week end to end in the browser with dummy players.
// Nothing is saved and players never see it; it uses the same rules code as
// the real boards (shared/game.ts), so what you see here is what a real week
// would do.

const DUMMY_NAMES = [
  "Ace", "Blitz", "Cleats", "Dime", "Endzone", "Flea Flicker",
  "Gunslinger", "Hail Mary", "Iceman", "Juke", "Kickoff", "Lineman",
];
const WEEKS = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
const YEARS = [String(Number(CURRENT_SEASON) - 1), CURRENT_SEASON];

/** Uniform random integer in [0, n) from the browser's secure random source. */
function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

function dummySquares(count: number) {
  const s = emptySquares();
  SQUARE_IDS.slice(0, count).forEach((id, i) => (s[id] = { uid: `dummy${i}`, name: DUMMY_NAMES[i] }));
  return s;
}

export default function AdminSim() {
  const [year, setYear] = useState(YEARS[0]);
  const [week, setWeek] = useState(10);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [seated, setSeated] = useState(12);
  const [unpaid, setUnpaid] = useState<Set<string>>(new Set());
  const [digits, setDigits] = useState(() => ({ top: shuffleDigits(randomInt), left: shuffleDigits(randomInt) }));
  const [manual, setManual] = useState<{ home: string; away: string }>({ home: "", away: "" });
  const [rolloverIn, setRolloverIn] = useState(0);

  // Look up the Sunday night game whenever the week or year changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLookupError(null);
    setGame(null);
    fetch(scoreboardUrl(year, week))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        const g = findSundayNightGame(parseScoreboard(json));
        setGame(g);
        if (!g) setLookupError(`No Sunday night game found for week ${week} of ${year}.`);
      })
      .catch((err) => !cancelled && setLookupError(`Couldn't reach the NFL schedule (${String(err)}).`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [year, week]);

  const squares = useMemo(() => dummySquares(seated), [seated]);
  const seatedIds = SQUARE_IDS.slice(0, seated);
  const paidIds = seatedIds.filter((id) => !unpaid.has(id));

  // Real regulation score for finished games; typed-in score otherwise.
  const real = game?.regulation ?? null;
  const homeScore = real ? real.home : manual.home === "" ? null : Number(manual.home);
  const awayScore = real ? real.away : manual.away === "" ? null : Number(manual.away);
  const haveScore =
    homeScore !== null && awayScore !== null && Number.isInteger(homeScore) && Number.isInteger(awayScore) && homeScore >= 0 && awayScore >= 0;

  const prize = computePrize(paidIds.length, rolloverIn);
  const layout = seasonLayout(squares);
  const outcome = haveScore
    ? resolveWeek({
        layout,
        topDigits: digits.top,
        leftDigits: digits.left,
        topScore: homeScore!,
        leftScore: awayScore!,
        paidSquareIds: paidIds,
        potCents: prize.potCents,
      })
    : null;

  const homeName = game?.home.short ?? "Home";
  const awayName = game?.away.short ?? "Away";

  function togglePaid(id: string) {
    setUnpaid((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function randomPayments() {
    setUnpaid(new Set(seatedIds.filter(() => randomInt(4) === 0))); // ~1 in 4 skips
  }

  function randomScore() {
    // Plausible NFL regulation scores.
    const pts = [0, 3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 38];
    setManual({ home: String(pts[randomInt(pts.length)]), away: String(pts[randomInt(pts.length)]) });
  }

  function nextWeek() {
    if (outcome) setRolloverIn(outcome.rolloverOutCents);
    setWeek((w) => Math.min(REGULAR_SEASON_WEEKS, w + 1));
    setManual({ home: "", away: "" });
    setDigits({ top: shuffleDigits(randomInt), left: shuffleDigits(randomInt) });
  }

  return (
    <>
      <section className="card panel sim-banner">
        <h2>Simulator</h2>
        <p>
          Run any week with 12 dummy players. Nothing is saved and players can't see it. It uses
          the same rules as real boards, so you can check a past week's result or try a future one.
        </p>
      </section>

      <section className="card panel">
        <div className="sim-row">
          <label className="field">
            <span className="label">Season</span>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Week</span>
            <select className="input" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
              {WEEKS.map((n) => (
                <option key={n} value={n}>
                  Week {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Players</span>
            <select
              className="input"
              value={seated}
              onChange={(e) => {
                setSeated(Number(e.target.value));
                setUnpaid(new Set());
              }}
            >
              {[12, 11, 10, 9, 8, 6].map((n) => (
                <option key={n} value={n}>
                  {n} seated{n < 12 ? ` (${12 - n} open)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Rollover in ($)</span>
            <input
              className="input"
              type="number"
              min={0}
              step={100}
              value={rolloverIn / 100}
              onChange={(e) => setRolloverIn(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))}
            />
          </label>
        </div>

        <div className="sim-game">
          {loading && <p className="hint">Looking up the game…</p>}
          {lookupError && <p className="error">{lookupError} Using generic team names.</p>}
          {game && (
            <p className="sim-matchup">
              <strong>{game.away.short}</strong> @ <strong>{game.home.short}</strong>
              <span className="hint">
                {" "}
                · {new Date(game.kickoff).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {real ? ` · final, end of regulation ${awayName} ${real.away}, ${homeName} ${real.home}` : " · not played yet"}
              </span>
            </p>
          )}
        </div>

        {!real && (
          <div className="sim-row sim-scores">
            <label className="field">
              <span className="label">{homeName} (home) score</span>
              <input className="input" type="number" min={0} inputMode="numeric" value={manual.home} onChange={(e) => setManual({ ...manual, home: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">{awayName} score</span>
              <input className="input" type="number" min={0} inputMode="numeric" value={manual.away} onChange={(e) => setManual({ ...manual, away: e.target.value })} />
            </label>
            <button className="btn btn-small" onClick={randomScore}>
              Random score
            </button>
          </div>
        )}

        <div className="secondary-actions sim-actions">
          <button className="btn btn-small" onClick={() => setDigits({ top: shuffleDigits(randomInt), left: shuffleDigits(randomInt) })}>
            Redraw numbers
          </button>
          <button className="btn btn-small" onClick={() => setUnpaid(new Set())}>
            Everyone paid
          </button>
          <button className="btn btn-small" onClick={randomPayments}>
            Random payments
          </button>
        </div>
      </section>

      <section className="card panel">
        <div className="players-head">
          <h2>Payments</h2>
          <p className="seat-count">
            <strong>{paidIds.length}</strong> / {seated} paid
          </p>
        </div>
        <p>Tap a player to flip paid / not paid.</p>
        <div className="sim-pay">
          {seatedIds.map((id) => {
            const isPaid = !unpaid.has(id);
            return (
              <button key={id} className={isPaid ? "sim-chip sim-paid" : "sim-chip"} aria-pressed={isPaid} onClick={() => togglePaid(id)}>
                {squareNumber(id)} · {squares[id]!.name}
                <span>{isPaid ? "Paid" : "Not paid"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`card panel sim-result${outcome?.kind === "win" ? " sim-win" : ""}`}>
        {!outcome && <p className="hint">Enter a score (or tap Random score) to see who wins.</p>}
        {outcome?.kind === "win" && (
          <>
            <p className="label">Winner</p>
            <h2>{outcome.label.replace(/^(\d+) /, "Square $1 · ")}</h2>
            <p>
              Last digits {outcome.topDigit} ({homeName}) and {outcome.leftDigit} ({awayName}).
              Wins <strong>{formatCents(outcome.awardedCents)}</strong>.
            </p>
          </>
        )}
        {outcome?.kind === "rollover" && (
          <>
            <p className="label">No winner · rollover</p>
            <h2>{formatCents(outcome.rolloverOutCents)} rolls to next week</h2>
            <p>
              Last digits {outcome.topDigit} ({homeName}) and {outcome.leftDigit} ({awayName}) land on{" "}
              {!outcome.squareId
                ? "a black block"
                : squares[outcome.squareId] === null
                  ? `square ${squareNumber(outcome.squareId)}, which is open`
                  : `square ${squareNumber(outcome.squareId)} (${squares[outcome.squareId]!.name}), who didn't pay`}
              .
            </p>
          </>
        )}
        <dl className="sim-money">
          <div><dt>Paid in</dt><dd>{formatCents(prize.contributionsCents)}</dd></div>
          <div><dt>Site support</dt><dd>{formatCents(prize.supportCents)}</dd></div>
          <div><dt>Prize this week</dt><dd>{formatCents(prize.prizeCents)}</dd></div>
          <div><dt>Rollover in</dt><dd>{formatCents(rolloverIn)}</dd></div>
          <div><dt>Pot</dt><dd>{formatCents(prize.potCents)}</dd></div>
        </dl>
        {outcome && week < REGULAR_SEASON_WEEKS && (
          <button className="btn btn-primary" onClick={nextWeek}>
            Next week{outcome.rolloverOutCents > 0 ? ` (carry ${formatCents(outcome.rolloverOutCents)})` : ""}
          </button>
        )}
      </section>

      <Board
        layout={layout}
        topDigits={digits.top}
        leftDigits={digits.left}
        topTeam={`${homeName} (home)`}
        leftTeam={awayName}
        winnerSquareId={outcome?.kind === "win" ? outcome.squareId : null}
        hotTopDigit={outcome ? outcome.topDigit : null}
        hotLeftDigit={outcome ? outcome.leftDigit : null}
        openSquareIds={SQUARE_IDS.filter((id) => squares[id] === null)}
        unpaidSquareIds={seatedIds.filter((id) => unpaid.has(id))}
      />
    </>
  );
}
