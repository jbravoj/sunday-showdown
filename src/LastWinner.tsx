import { formatCents } from "../shared/game.ts";
import { squareNumber } from "../shared/season.ts";
import type { WeekBoard } from "./session.ts";

/** Strip beside the week heading: the most recent week's winner, or its rollover. */
export default function LastWinner({ week, uid }: { week: WeekBoard; uid: string }) {
  const r = week.result!;
  const score = `${week.away.short} ${r.awayScore}, ${week.home.short} ${r.homeScore}`;
  if (r.kind === "rollover") {
    return (
      <div className="last-win last-win-roll">
        <span className="last-win-icon" aria-hidden="true">↻</span>
        <div className="last-win-body">
          <p className="last-win-label">Week {week.week} · no winner</p>
          <p className="last-win-name">{formatCents(r.rolloverOutCents)} rolled over</p>
          <p className="last-win-score">{score}</p>
        </div>
      </div>
    );
  }
  const you = r.uid === uid;
  return (
    <div className="last-win">
      <span className="last-win-icon" aria-hidden="true">🏆</span>
      <div className="last-win-body">
        <p className="last-win-label">Week {week.week} winner{you ? " · that's you!" : ""}</p>
        <p className="last-win-name">
          {r.name ?? "Winner"}
          {r.squareId ? ` · Square ${squareNumber(r.squareId)}` : ""}
        </p>
        <p className="last-win-score">{score}</p>
      </div>
      <span className="last-win-amt">{formatCents(r.awardedCents)}</span>
    </div>
  );
}
