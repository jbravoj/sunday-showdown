import type { ReactNode } from "react";
import { formatCents } from "../shared/game.ts";
import { squareNumber } from "../shared/season.ts";
import type { WeekBoard } from "./session.ts";

/**
 * The "split ticket" beside the week heading: the prize on the stub, the
 * winner on the right. Three states: this week's prize before any result,
 * the latest winner, or the latest rollover.
 */
function Ticket({
  tone,
  label,
  amount,
  rightLabel,
  name,
  sub,
  tag,
  hotTag = false,
}: {
  tone: "next" | "won" | "roll";
  label: string;
  amount: string;
  rightLabel: string;
  name: ReactNode;
  sub: string;
  tag: string | null;
  hotTag?: boolean;
}) {
  return (
    <div className={`ticket ticket-${tone}`}>
      <div className="ticket-stub">
        <p className="ticket-label">{label}</p>
        <p className="ticket-amt">{amount}</p>
      </div>
      <span className="ticket-notch ticket-notch-top" aria-hidden="true" />
      <span className="ticket-notch ticket-notch-bottom" aria-hidden="true" />
      <div className="ticket-main">
        <p className="ticket-label">{rightLabel}</p>
        <p className="ticket-name">{name}</p>
        <p className="ticket-sub">{sub}</p>
        {tag && <span className={`ticket-tag${hotTag ? " ticket-tag-hot" : ""}`}>{tag}</span>}
      </div>
    </div>
  );
}

/** Before any week has a result: this week's prize, winner to be crowned. */
export function UpNext({
  week,
  potCents,
  paid,
  seated,
}: {
  week: WeekBoard;
  potCents: number;
  paid: number;
  seated: number;
}) {
  const day = week.kickoff.toDate().toLocaleDateString("en-US", { weekday: "long" });
  return (
    <Ticket
      tone="next"
      label={`Week ${week.week} prize`}
      amount={formatCents(potCents)}
      rightLabel="Winner"
      name="To be crowned"
      sub={`${day} night · ${week.away.short} @ ${week.home.short}`}
      tag={seated > 0 ? `${paid} of ${seated} paid` : null}
    />
  );
}

/** The most recent week's result: its winner, or the pot that rolled over. */
export default function LastWinner({ week, uid }: { week: WeekBoard; uid: string }) {
  const r = week.result!;
  const score =
    r.awayScore >= r.homeScore
      ? `${week.away.short} ${r.awayScore}, ${week.home.short} ${r.homeScore}`
      : `${week.home.short} ${r.homeScore}, ${week.away.short} ${r.awayScore}`;
  if (r.kind === "rollover") {
    return (
      <Ticket
        tone="roll"
        label={`Week ${week.week} · rollover`}
        amount={formatCents(r.rolloverOutCents)}
        rightLabel="No winner"
        name="Pot rolls over"
        sub={score}
        tag={
          r.reason === "unpaid" && r.squareId
            ? `Square ${squareNumber(r.squareId)} hadn't paid`
            : "Landed on a black square"
        }
      />
    );
  }
  const you = r.uid === uid;
  return (
    <Ticket
      tone="won"
      label={`Week ${week.week} · won`}
      amount={formatCents(r.awardedCents)}
      rightLabel={you ? "Winner · that's you!" : "Winner"}
      name={
        <>
          {r.name ?? "Winner"} <span aria-hidden="true">🏆</span>
        </>
      }
      sub={score}
      tag={r.squareId ? `Square ${squareNumber(r.squareId)}` : null}
      hotTag
    />
  );
}
