import Board from "./Board.tsx";
import { kickoffLabel, type WeekBoard } from "./session.ts";
import { SQUARE_IDS, seasonLayout, squareOf, type Seat } from "../shared/season.ts";

const NO_DIGITS = Array.from({ length: 10 }, () => null);

const STATUS_TEXT = {
  draft: "Draft · only you can see this",
  open: "Numbers drawn when the board locks",
  locked: "Locked · numbers drawn",
} as const;

/**
 * One week's board. Home team across the top, away team down the side.
 * Before lock it shows the live season squares and "?" numbers; after lock,
 * the squares and numbers frozen at that moment.
 */
export default function WeekView(props: {
  week: WeekBoard;
  liveSquares: Record<string, Seat | null>;
  uid: string | null;
}) {
  const { week, liveSquares, uid } = props;
  const locked = week.status === "locked" && week.squares !== null;
  const squares = locked ? week.squares! : liveSquares;
  const mine = uid ? squareOf(squares, uid) : null;

  return (
    <>
      <section className="card scoreline">
        <div>
          <p className="label">
            Week {week.week} · {kickoffLabel(week.kickoff)}
          </p>
          <p className="matchup">{week.away.short}</p>
          <p className="matchup">@ {week.home.short}</p>
        </div>
        <span className={`status-pill status-${week.status}`}>{STATUS_TEXT[week.status]}</span>
      </section>

      <Board
        layout={seasonLayout(squares)}
        topDigits={locked && week.topDigits ? week.topDigits : NO_DIGITS}
        leftDigits={locked && week.leftDigits ? week.leftDigits : NO_DIGITS}
        topTeam={`${week.home.short} (home)`}
        leftTeam={week.away.short}
        mySquareId={mine}
        openSquareIds={SQUARE_IDS.filter((id) => squares[id] === null)}
      />
      <p className="board-note">
        {locked
          ? `Last digit of the ${week.home.short} score across the top, ${week.away.short} down the side. End of regulation only.`
          : "The 0–9 numbers are drawn on the server when the board locks."}
      </p>
    </>
  );
}
