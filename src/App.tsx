import Board from "./Board.tsx";
import { DEFAULT_LAYOUT } from "../shared/layout.ts";
import { computePrize, formatCents, resolveWeek } from "../shared/game.ts";

// Phase 1 placeholder: renders a real past board (2026 Week 4) through the
// same rules code the server will use, to prove the pieces fit together.
const SAMPLE = {
  topTeam: "Panthers",
  leftTeam: "Lions",
  topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
  leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
  topScore: 32,
  leftScore: 26,
};

export default function App() {
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
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">Sunday Night Football Squares</p>
        <h1 className="title">
          Sunday <span>Showdown</span>
        </h1>
        <p className="motto">NO PAY • NO PLAY • NO OT</p>
      </header>

      <main>
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

        <p className="coming">Invite-only · launching for the 2027 season</p>
      </main>
    </div>
  );
}
