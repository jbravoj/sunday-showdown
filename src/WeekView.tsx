import Board from "./Board.tsx";
import { kickoffLabel, type WeekBoard } from "./session.ts";
import { computePrize, formatCents } from "../shared/game.ts";
import { SQUARE_IDS, seasonLayout, squareOf, type Seat } from "../shared/season.ts";
import { lockDueMs, paidSquareIds, type Prepaid } from "../shared/week.ts";

const NO_DIGITS = Array.from({ length: 10 }, () => null);

/** Squares, paid squares and pot for a week: live before lock, frozen after. */
export function weekFigures(
  week: WeekBoard,
  liveSquares: Record<string, Seat | null>,
  prepaid: Prepaid = {},
) {
  const locked = week.status === "locked" && week.squares !== null;
  const squares = locked ? week.squares! : liveSquares;
  const paid = locked
    ? (week.paidSquareIds ?? [])
    : paidSquareIds(squares, week.payments ?? {}, prepaid, week.week);
  const seated = SQUARE_IDS.filter((id) => squares[id] !== null);
  const potCents = locked && week.prize ? week.prize.potCents : computePrize(paid.length, 0).potCents;
  return { locked, squares, paid, seated, potCents };
}

function lockTimeLabel(week: WeekBoard): string {
  const d = new Date(lockDueMs(week.kickoff.toMillis()));
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

type ViewProps = {
  week: WeekBoard;
  liveSquares: Record<string, Seat | null>;
  uid: string | null;
  /** Players marked fully paid (count as paid before lock). */
  prepaid?: Prepaid;
};

/** Matchup, kickoff, pot and the lock/status banner. */
export function WeekScoreCard({ week, liveSquares, prepaid }: Omit<ViewProps, "uid">) {
  const { locked, paid, seated, potCents } = weekFigures(week, liveSquares, prepaid);
  return (
    <>
      <section className="card scoreline">
        <div>
          <p className="label">
            <span className="week-prefix">Week {week.week} · </span>
            {kickoffLabel(week.kickoff)}
          </p>
          <p className="matchup">{week.away.short}</p>
          <p className="matchup">@ {week.home.short}</p>
        </div>
        <div className="pot">
          <p className="label">{locked ? "Pot" : "Pot so far"}</p>
          <p className="pot-amount">{formatCents(potCents)}</p>
          <p className="pot-note">
            {paid.length} of {seated.length} paid
          </p>
        </div>
      </section>

      <p className={`status-line status-${week.status}`}>
        {week.status === "draft" && "Draft · only you can see this"}
        {week.status === "open" && `Pay before the board locks ${lockTimeLabel(week)}. NO PAY • NO PLAY.`}
        {week.status === "locked" && "Locked · numbers drawn · payments final"}
      </p>
    </>
  );
}

/**
 * One week's board. Home team across the top, away team down the side.
 * Before lock it shows the live season squares and "?" numbers; after lock,
 * the squares, numbers and payments frozen at that moment.
 */
export function WeekBoardView({ week, liveSquares, uid, prepaid }: ViewProps) {
  const { locked, squares, paid, seated } = weekFigures(week, liveSquares, prepaid);
  const mine = uid ? squareOf(squares, uid) : null;
  const result = locked ? week.result : undefined;
  return (
    <>
      <Board
        winnerSquareId={result?.kind === "win" ? result.squareId : null}
        winnerAmount={result?.kind === "win" ? formatCents(result.awardedCents) : null}
        hotTopDigit={result ? result.homeScore % 10 : null}
        hotLeftDigit={result ? result.awayScore % 10 : null}
        layout={seasonLayout(squares)}
        topDigits={locked && week.topDigits ? week.topDigits : NO_DIGITS}
        leftDigits={locked && week.leftDigits ? week.leftDigits : NO_DIGITS}
        topTeam={`${week.home.short} (home)`}
        leftTeam={week.away.short}
        mySquareId={mine}
        openSquareIds={SQUARE_IDS.filter((id) => squares[id] === null)}
        unpaidSquareIds={locked ? seated.filter((id) => !paid.includes(id)) : []}
      />
      <p className="board-note">
        {locked
          ? `Last digit of the ${week.home.short} score across the top, ${week.away.short} down the side. End of regulation only.`
          : "The 0–9 numbers are drawn on the server when the board locks."}
      </p>
    </>
  );
}

/** Score card plus board, stacked (used on the admin Weeks page). */
export default function WeekView(props: ViewProps) {
  return (
    <>
      <WeekScoreCard week={props.week} liveSquares={props.liveSquares} prepaid={props.prepaid} />
      <WeekBoardView {...props} />
    </>
  );
}
