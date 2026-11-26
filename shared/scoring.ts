// Scoring a locked week and building the season leaderboard. Pure, so the
// Cloud Functions (which record results) and the site (which shows them)
// use the same math, and it can be tested.

import { resolveWeek } from "./game.ts";
import { SQUARE_IDS, normalizeSquares, seasonLayout, squareNumber, type Seat } from "./season.ts";
import { seasonTally, type Payments, type Prepaid } from "./week.ts";

/** What gets stored on a week once its game is over. Home = top row, away = side. */
export interface WeekResult {
  kind: "win" | "rollover";
  /** Why it rolled over: the winning cell is black, or its square didn't pay. */
  reason: "inactive" | "unpaid" | null;
  squareId: string | null;
  uid: string | null;
  name: string | null;
  homeScore: number;
  awayScore: number;
  homeDigit: number;
  awayDigit: number;
  awardedCents: number;
  rolloverOutCents: number;
  /** auto = from the NFL feed; manual = entered by the admin. */
  source: "auto" | "manual";
}

/** The parts of a locked week that decide its result. */
export interface LockedWeek {
  squares: Readonly<Record<string, Seat | null>>;
  topDigits: readonly number[];
  leftDigits: readonly number[];
  paidSquareIds: readonly string[];
  potCents: number;
}

export const MAX_SCORE = 199;

export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}

/** Decides a locked week from the end-of-regulation score (no overtime). */
export function scoreLockedWeek(
  week: LockedWeek,
  homeScore: number,
  awayScore: number,
  source: WeekResult["source"],
): WeekResult {
  if (!isValidScore(homeScore) || !isValidScore(awayScore)) throw new Error("Scores must be whole numbers 0-199.");
  const squares = normalizeSquares(week.squares);
  const outcome = resolveWeek({
    layout: seasonLayout(squares),
    topDigits: week.topDigits,
    leftDigits: week.leftDigits,
    topScore: homeScore,
    leftScore: awayScore,
    paidSquareIds: week.paidSquareIds,
    potCents: week.potCents,
  });
  const seat = outcome.squareId ? squares[outcome.squareId] : null;
  return {
    kind: outcome.kind,
    reason: outcome.kind === "rollover" ? outcome.reason : null,
    squareId: outcome.squareId,
    uid: seat?.uid ?? null,
    name: seat?.name ?? null,
    homeScore,
    awayScore,
    homeDigit: outcome.topDigit,
    awayDigit: outcome.leftDigit,
    awardedCents: outcome.awardedCents,
    rolloverOutCents: outcome.rolloverOutCents,
    source,
  };
}

/** One line of the result in words: "Lonzy wins $1,000" / "No winner · $1,000 rolls over". */
export function resultHeadline(r: Pick<WeekResult, "kind" | "name" | "squareId" | "awardedCents" | "rolloverOutCents">, money: (c: number) => string): string {
  if (r.kind === "win") return `${r.name ?? `Square ${r.squareId ? squareNumber(r.squareId) : "?"}`} wins ${money(r.awardedCents)}`;
  return `No winner · ${money(r.rolloverOutCents)} rolls over`;
}

// ---------- leaderboard ----------

export interface LeaderboardWeek {
  week: number;
  payments?: Payments;
  result?: Pick<WeekResult, "kind" | "uid" | "name" | "squareId" | "awardedCents" | "rolloverOutCents"> | null;
}

export interface Standing {
  uid: string;
  name: string;
  /** Their current square, if they still have one. */
  squareId: string | null;
  wins: number;
  wonCents: number;
  paidInCents: number;
  /** won − paid in */
  netCents: number;
  /** 1, 2, 3… for anyone who has won; null for the rest (shown as "–"). */
  rank: number | null;
}

export interface Leaderboard {
  standings: Standing[];
  paidOutCents: number;
  rollovers: number;
  biggestPotCents: number;
  /** Last week with a result, or null before any. */
  throughWeek: number | null;
}

/**
 * Season standings: everyone seated now, plus anyone who won before losing
 * their seat. Sorted by money won, then wins, then square number.
 */
export function buildLeaderboard(
  squares: Readonly<Record<string, Seat | null>>,
  weeks: readonly LeaderboardWeek[],
  prepaid: Prepaid = {},
): Leaderboard {
  const seats = normalizeSquares(squares);
  const rows = new Map<string, Standing>();
  const add = (uid: string, name: string, squareId: string | null) => {
    if (!rows.has(uid)) {
      rows.set(uid, { uid, name, squareId, wins: 0, wonCents: 0, paidInCents: 0, netCents: 0, rank: null });
    }
    return rows.get(uid)!;
  };
  for (const id of SQUARE_IDS) {
    const seat = seats[id];
    if (seat) add(seat.uid, seat.name, id);
  }

  let paidOutCents = 0;
  let rollovers = 0;
  let biggestPotCents = 0;
  let throughWeek: number | null = null;
  for (const w of weeks) {
    const r = w.result;
    if (!r) continue;
    throughWeek = throughWeek === null ? w.week : Math.max(throughWeek, w.week);
    if (r.kind === "win") {
      paidOutCents += r.awardedCents;
      biggestPotCents = Math.max(biggestPotCents, r.awardedCents);
      if (r.uid) {
        const row = add(r.uid, r.name ?? "Former player", null);
        row.wins += 1;
        row.wonCents += r.awardedCents;
      }
    } else {
      rollovers += 1;
      biggestPotCents = Math.max(biggestPotCents, r.rolloverOutCents);
    }
  }

  const tallyWeeks = weeks.map((w) => ({ week: w.week, payments: w.payments }));
  for (const row of rows.values()) {
    row.paidInCents = seasonTally(row.uid, tallyWeeks, prepaid).paidCents;
    row.netCents = row.wonCents - row.paidInCents;
  }

  const standings = [...rows.values()].sort(
    (a, b) =>
      b.wonCents - a.wonCents ||
      b.wins - a.wins ||
      (a.squareId ? squareNumber(a.squareId) : 99) - (b.squareId ? squareNumber(b.squareId) : 99),
  );
  let rank = 0;
  for (const s of standings) if (s.wonCents > 0) s.rank = ++rank;

  return { standings, paidOutCents, rollovers, biggestPotCents, throughWeek };
}
