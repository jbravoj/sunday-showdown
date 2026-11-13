import Board from "../Board.tsx";
import { DEFAULT_LAYOUT } from "../../shared/layout.ts";
import { computePrize, formatCents, resolveWeek } from "../../shared/game.ts";

// Approved players' home. Until weekly boards arrive (Phase 5) it shows a
// real past board (2026 Week 4) run through the same rules code as the server.
const SAMPLE = {
  topTeam: "Panthers",
  leftTeam: "Lions",
  topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
  leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
  topScore: 32,
  leftScore: 26,
};

export default function Home() {
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
    <>
      <section className="card scoreline">
        <div>
          <p className="label">Sample board · 2026 Week 4</p>
          <p className="matchup">
            {SAMPLE.topTeam} {SAMPLE.topScore} – {SAMPLE.leftTeam} {SAMPLE.leftScore}
          </p>
        </div>
        <div className="pot">
          <p className="label">Q4 pot</p>
          <p className="pot-amount">{formatCents(prize.potCents)}</p>
        </div>
      </section>

      <Board
        layout={DEFAULT_LAYOUT}
        topDigits={SAMPLE.topDigits}
        leftDigits={SAMPLE.leftDigits}
        topTeam={SAMPLE.topTeam}
        leftTeam={SAMPLE.leftTeam}
        winnerSquareId={outcome.kind === "win" ? outcome.squareId : null}
      />

      <section className="card result">
        {outcome.kind === "win" ? (
          <p>
            Digits {outcome.topDigit} and {outcome.leftDigit} land on{" "}
            <strong>{outcome.label}</strong>, who wins{" "}
            <strong>{formatCents(outcome.awardedCents)}</strong>.
          </p>
        ) : (
          <p>No winner. {formatCents(outcome.rolloverOutCents)} rolls over.</p>
        )}
      </section>

      <p className="coming">Weekly boards arrive for the 2027 season</p>
    </>
  );
}
