import Board from "../Board.tsx";
import { useState } from "react";
import WeekView from "../WeekView.tsx";
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

/** Approved players' home: the season board with everyone's permanent square. */
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

  return (
    <>
      {current && weeks.length > 1 && (
        <div className="week-chips week-chips-player" role="list">
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

      {current ? (
        <WeekView week={current} liveSquares={squares} uid={uid} />
      ) : (
        <>
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

      <section className="card your-square">
        {mine ? (
          <>
            <div>
              <p className="label">Your square</p>
              <p className="matchup">
                {squareNumber(mine)} · {squares[mine]!.name}
              </p>
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

      <details className="card panel sample">
        <summary>How a week is decided</summary>
        <SampleWeek />
      </details>
    </>
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
