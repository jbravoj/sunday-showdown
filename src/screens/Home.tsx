import Board from "../Board.tsx";
import { useState } from "react";
import { WeekBoardView, WeekScoreCard, weekFigures } from "../WeekView.tsx";
import { PAYMENT_LINKS } from "../paymentLinks.ts";
import { useSeason, useWeeks } from "../session.ts";
import { DEFAULT_LAYOUT } from "../../shared/layout.ts";
import { computePrize, formatCents, resolveWeek } from "../../shared/game.ts";
import {
  CURRENT_SEASON,
  SQUARE_IDS,
  SQUARE_BLOCKS,
  seasonLayout,
  squareNumber,
  squareOf,
} from "../../shared/season.ts";

const NO_DIGITS = Array.from({ length: 10 }, () => null);

/**
 * Approved players' home. One grid: stacked on phones; on desktop the board
 * sits on the left with the score, your square and payments on the right.
 */
export default function Home({ uid }: { uid: string }) {
  const season = useSeason(true);
  const weeksState = useWeeks(false);
  const [picked, setPicked] = useState<number | null>(null);

  if (season.loading || weeksState.loading) return <p className="coming">Loading…</p>;
  if (season.error) return <p className="error">{season.error}</p>;

  const { squares } = season;
  const weeks = weeksState.weeks;
  // Latest published week by default; players can flip back to earlier ones.
  const current = weeks.find((w) => w.week === picked) ?? weeks[weeks.length - 1] ?? null;
  const filled = SQUARE_IDS.filter((id) => squares[id] !== null).length;
  const open = SQUARE_IDS.filter((id) => squares[id] === null);
  const mine = squareOf(squares, uid);
  // Paid status for the week on screen (frozen once it locks).
  const fig = current ? weekFigures(current, squares) : null;
  const weekSquare = fig ? squareOf(fig.squares, uid) : null;
  const paidThisWeek = fig && weekSquare ? fig.paid.includes(weekSquare) : null;

  return (
    <div className="home-grid">
      <div className="area-title">
        <h1 className="page-title">
          {current
            ? `Week ${current.week} · ${current.away.short} @ ${current.home.short}`
            : `${CURRENT_SEASON} season board`}
        </h1>
        {current && (
          <span className={`status-pill status-${current.status}`}>
            {current.status === "locked"
              ? "Locked · numbers drawn"
              : current.status === "open"
                ? "Open · numbers drawn at lock"
                : "Draft"}
          </span>
        )}
      </div>

      {current && weeks.length > 1 && (
        <div className="area-weeks week-chips week-chips-player" role="list">
          {weeks.map((w) => (
            <button
              key={w.id}
              role="listitem"
              className={`week-chip${w.week === current.week ? " week-chip-on" : ""}`}
              aria-pressed={w.week === current.week}
              aria-label={`Week ${w.week}`}
              onClick={() => setPicked(w.week)}
            >
              {w.week}
            </button>
          ))}
        </div>
      )}

      <div className="area-score">
        {current ? (
          <WeekScoreCard week={current} liveSquares={squares} />
        ) : (
          <section className="card scoreline">
            <div>
              <p className="label">{CURRENT_SEASON} season</p>
              <p className="matchup">The board</p>
            </div>
            <div className="pot">
              <p className="label">Squares</p>
              <p className="pot-amount">
                {filled}
                <span className="pot-of">/12</span>
              </p>
            </div>
          </section>
        )}
      </div>

      <div className="area-board">
        {current ? (
          <WeekBoardView week={current} liveSquares={squares} uid={uid} />
        ) : (
          <>
            <Board
              layout={seasonLayout(squares)}
              topDigits={NO_DIGITS}
              leftDigits={NO_DIGITS}
              topTeam="Team TBD"
              leftTeam="Team TBD"
              mySquareId={mine}
              openSquareIds={open}
            />
            <p className="board-note">
              Numbers 0–9 are shuffled for each week's game. The teams and numbers go up here every
              Sunday.
            </p>
          </>
        )}
      </div>

      <section className="area-square card your-square">
        {mine ? (
          <>
            <div>
              <p className="label">Your square</p>
              <p className="matchup">
                {squareNumber(mine)} · {squares[mine]!.name}
              </p>
              {current && paidThisWeek !== null && (
                <p className={paidThisWeek ? "paid-pill paid-yes" : "paid-pill paid-no"}>
                  Week {current.week}: {paidThisWeek ? "Paid" : "Not paid"}
                </p>
              )}
              {current && current.status !== "locked" && paidThisWeek === false && (
                <div className="pay-links">
                  {PAYMENT_LINKS.map((link) => (
                    <a key={link.href} className="btn btn-primary pay-link" href={link.href}>
                      {link.label}
                    </a>
                  ))}
                  {PAYMENT_LINKS.map((link) =>
                    link.hint ? (
                      <p key={`${link.href}-hint`} className="hint">
                        {link.hint} The admin marks you paid once it comes through.
                      </p>
                    ) : null,
                  )}
                </div>
              )}
              <p className="hint">
                Row {SQUARE_BLOCKS[mine].row + 1}, column {SQUARE_BLOCKS[mine].col + 1} on the
                board. It's yours all season.
              </p>
            </div>
            <span className="square-badge">{squareNumber(mine)}</span>
          </>
        ) : (
          <div>
            <p className="label">Your square</p>
            <p className="hint">The admin hasn't assigned your square yet. Check back soon.</p>
          </div>
        )}
      </section>

      {current && fig && fig.seated.length > 0 && (
        <section className="area-paid card">
          <div className="players-head">
            <p className="label">{fig.locked ? "Paid (final)" : "Paid this week"}</p>
            <p className="seat-count">
              <strong>{fig.paid.length}</strong> / {fig.seated.length}
            </p>
          </div>
          <ul className="paid-grid">
            {fig.seated.map((id) => {
              const isPaid = fig.paid.includes(id);
              return (
                <li key={id} className={isPaid ? "is-paid" : "is-unpaid"}>
                  <span className="paid-dot" aria-hidden="true" />
                  <span className="paid-num">{squareNumber(id)}</span>
                  <span className="paid-name">{fig.squares[id]!.name}</span>
                  <span className="visually-hidden">{isPaid ? "paid" : "not paid"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <details className="area-sample card panel sample">
        <summary>How a week is decided</summary>
        <SampleWeek />
      </details>
    </div>
  );
}

// A real past board (2026 Week 4) run through the same rules code as the server.
const SAMPLE = {
  topTeam: "Panthers",
  leftTeam: "Lions",
  topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
  leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
  topScore: 32,
  leftScore: 26,
};

function SampleWeek() {
  const prize = computePrize(12, 100_000);
  const outcome = resolveWeek({
    layout: DEFAULT_LAYOUT,
    topDigits: SAMPLE.topDigits,
    leftDigits: SAMPLE.leftDigits,
    topScore: SAMPLE.topScore,
    leftScore: SAMPLE.leftScore,
    paidSquareIds: DEFAULT_LAYOUT.map((s) => s.id),
    potCents: prize.potCents,
  });

  return (
    <div className="sample-body">
      <p className="hint">
        2026 Week 4: {SAMPLE.topTeam} {SAMPLE.topScore}, {SAMPLE.leftTeam} {SAMPLE.leftScore}{" "}
        (end of regulation). Pot {formatCents(prize.potCents)}, including a{" "}
        {formatCents(prize.rolloverInCents)} rollover.
      </p>
      <Board
        layout={DEFAULT_LAYOUT}
        topDigits={SAMPLE.topDigits}
        leftDigits={SAMPLE.leftDigits}
        topTeam={SAMPLE.topTeam}
        leftTeam={SAMPLE.leftTeam}
        winnerSquareId={outcome.kind === "win" ? outcome.squareId : null}
        hotTopDigit={outcome.topDigit}
        hotLeftDigit={outcome.leftDigit}
      />
      {outcome.kind === "win" && (
        <p className="hint">
          Last digits {outcome.topDigit} and {outcome.leftDigit} cross on{" "}
          <strong>{outcome.label}</strong>, who wins {formatCents(outcome.awardedCents)}.
        </p>
      )}
    </div>
  );
}
