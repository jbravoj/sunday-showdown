import SquarePicker from "../SquarePicker.tsx";
import Board from "../Board.tsx";
import { useState } from "react";
import { WeekBoardView, WeekScoreCard, weekFigures } from "../WeekView.tsx";
import { PAYMENT_LINKS } from "../paymentLinks.ts";
import WinnerBanner from "../WinnerBanner.tsx";
import { SEASON_TOTAL_CENTS, isPaidFor, seasonTally } from "../../shared/week.ts";
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
export default function Home({ uid, pickFromMs = null }: { uid: string; pickFromMs?: number | null }) {
  const season = useSeason(true);
  const weeksState = useWeeks(false);
  const [picked, setPicked] = useState<number | null>(null);

  if (season.loading || weeksState.loading) return <p className="coming">Loading…</p>;
  if (season.error) return <p className="error">{season.error}</p>;

  const { squares, prepaid } = season;
  const weeks = weeksState.weeks;
  // Latest published week by default; players can flip back to earlier ones.
  const current = weeks.find((w) => w.week === picked) ?? weeks[weeks.length - 1] ?? null;
  // ‹ › step through the weeks that have been posted.
  const at = current ? weeks.indexOf(current) : -1;
  const prevWeek = at > 0 ? weeks[at - 1] : null;
  const nextWeek = at >= 0 && at < weeks.length - 1 ? weeks[at + 1] : null;
  const filled = SQUARE_IDS.filter((id) => squares[id] !== null).length;
  const open = SQUARE_IDS.filter((id) => squares[id] === null);
  const mine = squareOf(squares, uid);
  // Paid status for the week on screen (frozen once it locks).
  const fig = current ? weekFigures(current, squares, prepaid) : null;
  const weekSquare = fig ? squareOf(fig.squares, uid) : null;
  const paidThisWeek = fig && weekSquare ? fig.paid.includes(weekSquare) : null;
  // A locked week froze who sat where; show the square from that week, and
  // mention the current one if the admin has moved this player since.
  const shown = fig?.locked ? weekSquare : mine;
  const shownSquares = fig?.locked ? fig.squares : squares;
  const movedTo = fig?.locked && mine && mine !== weekSquare ? mine : null;
  // The week players pay for: the latest published week that hasn't locked,
  // whichever week is on screen.
  const payWeek = [...weeks].reverse().find((w) => w.status === "open") ?? null;
  // Banner: the most recent week that has a result, if it had a winner.
  const lastResult = [...weeks].reverse().find((w) => w.result) ?? null;
  const winWeek = lastResult?.result?.kind === "win" && lastResult.squares ? lastResult : null;
  const winSeat = winWeek ? winWeek.squares![winWeek.result!.squareId!] : null;
  const paidForPayWeek = payWeek ? isPaidFor(uid, payWeek.week, payWeek.payments ?? {}, prepaid) : false;
  const tally = seasonTally(uid, weeks, prepaid);

  return (
    <div className="home-grid">
      {winWeek && winSeat && (
        <div className="area-banner">
          <WinnerBanner
            id={`${CURRENT_SEASON}-${winWeek.id}`}
            weekLabel={`Week ${winWeek.week}`}
            name={winSeat.name}
            squareNumber={squareNumber(winWeek.result!.squareId!)}
            amount={formatCents(winWeek.result!.awardedCents)}
            isYou={winSeat.uid === uid}
            detail={`${winWeek.away.short} ${winWeek.result!.awayScore}, ${winWeek.home.short} ${winWeek.result!.homeScore}`}
          />
        </div>
      )}
      <div className="area-title week-heading">
        {current ? (
          <>
            <h1 className="week-kicker">Week {current.week}</h1>
            <p className="page-title week-matchup">
              {current.away.short} @ {current.home.short}
            </p>
            <div className="week-nav">
              <button
                type="button"
                className="week-arrow"
                disabled={!prevWeek}
                aria-label={prevWeek ? `Week ${prevWeek.week}` : "No earlier week"}
                onClick={() => prevWeek && setPicked(prevWeek.week)}
              >
                ‹
              </button>
              <button
                type="button"
                className="week-arrow"
                disabled={!nextWeek}
                aria-label={nextWeek ? `Week ${nextWeek.week}` : "No later week"}
                onClick={() => nextWeek && setPicked(nextWeek.week)}
              >
                ›
              </button>
              <span className={`status-pill status-${current.status}`}>
                {current.status === "locked"
                  ? "Locked · numbers drawn"
                  : current.status === "open"
                    ? "Open · numbers drawn at lock"
                    : "Draft"}
              </span>
            </div>
          </>
        ) : (
          <h1 className="page-title">{CURRENT_SEASON} season board</h1>
        )}
      </div>

      <div className="area-score">
        {current ? (
          <WeekScoreCard week={current} liveSquares={squares} prepaid={prepaid} />
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
          <WeekBoardView week={current} liveSquares={squares} uid={uid} prepaid={prepaid} />
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
        {shown ? (
          <>
            <div>
              <div className="your-square-head">
                <div>
                  <p className="label">{fig?.locked ? `Your square · week ${current!.week}` : "Your square"}</p>
                  <p className="matchup">
                    {squareNumber(shown)} · {shownSquares[shown]!.name}
                  </p>
                </div>
                <span className="square-badge">{squareNumber(shown)}</span>
              </div>
              {current && paidThisWeek !== null && (
                <p className={paidThisWeek ? "paid-pill paid-yes" : "paid-pill paid-no"}>
                  Week {current.week}: {paidThisWeek ? "Paid" : "Not paid"}
                </p>
              )}
              <PayBox
                payWeek={payWeek?.week ?? null}
                paid={paidForPayWeek}
                hasSquare={mine !== null}
              />
              <SeasonBalance paidCents={tally.paidCents} leftCents={tally.leftCents} fullyPaidFrom={tally.fullyPaidFrom} />
              <p className="hint">
                Row {SQUARE_BLOCKS[shown].row + 1}, column {SQUARE_BLOCKS[shown].col + 1} on the
                board.{" "}
                {movedTo
                  ? `You're in square ${squareNumber(movedTo)} from now on.`
                  : "It's yours all season."}
              </p>
            </div>
          </>
        ) : (
          <div>
            <p className="label">Your square</p>
            {fig?.locked && mine ? (
              <p className="hint">
                You didn't have a square when week {current!.week} locked. You're in square{" "}
                {squareNumber(mine)} now.
              </p>
            ) : (
              <SquarePicker squares={squares} pickFromMs={pickFromMs} />
            )}
            <PayBox payWeek={payWeek?.week ?? null} paid={false} hasSquare={mine !== null} />
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

/**
 * Pay buttons on the Your square card. Always visible so players know where
 * to pay; live only while a week is open and they haven't been marked paid.
 */
function PayBox(props: { payWeek: number | null; paid: boolean; hasSquare: boolean }) {
  const { payWeek, paid, hasSquare } = props;
  if (payWeek !== null && paid) {
    return <p className="paid-pill paid-yes">Week {payWeek}: Paid ✓</p>;
  }
  const live = payWeek !== null && hasSquare;
  return (
    <div className="pay-links">
      {PAYMENT_LINKS.map((link) =>
        live ? (
          <a key={link.href} className="btn btn-primary pay-link" href={link.href}>
            {link.label} · Week {payWeek}
          </a>
        ) : (
          <span key={link.href} className="btn btn-primary pay-link pay-link-off" aria-disabled="true">
            {link.label}
          </span>
        ),
      )}
      <p className="hint">
        {!hasSquare
          ? "Paying opens once you have a square."
          : payWeek === null
            ? "Payment opens when next week's board is posted."
            : `${PAYMENT_LINKS[0]?.hint ?? ""} The admin marks you paid once it comes through.`}
      </p>
    </div>
  );
}

/** Season money: paid in so far and what's left of the $1,800 season. */
export function SeasonBalance(props: { paidCents: number; leftCents: number; fullyPaidFrom: number | null }) {
  const pct = Math.round((props.paidCents / SEASON_TOTAL_CENTS) * 100);
  return (
    <div className="balance">
      <div className="balance-row">
        <span>
          Season paid <strong>{formatCents(props.paidCents)}</strong>
        </span>
        <span>
          {props.leftCents === 0 ? (
            <strong className="balance-done">Fully paid ✓</strong>
          ) : (
            <>
              Left <strong>{formatCents(props.leftCents)}</strong>
            </>
          )}
        </span>
      </div>
      <div
        className="balance-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Season paid"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      {props.fullyPaidFrom !== null && (
        <p className="hint">Paid up through week 18 (covered from week {props.fullyPaidFrom}).</p>
      )}
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
        winnerAmount={outcome.kind === "win" ? formatCents(outcome.awardedCents) : null}
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
