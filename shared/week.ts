// Weekly boards. Pure rules, shared by Cloud Functions, the site and tests.
//
//   draft  → the admin set up the matchup; players can't see it yet
//   open   → published; players see the matchup, numbers still hidden
//   locked → numbers drawn and who-sits-where frozen; can't be undone
//
// Phase 6 adds payments and locks boards automatically; Phase 7 adds scores.

import { REGULAR_SEASON_WEEKS } from "./schedule.ts";
import { computePrize, type PrizeBreakdown } from "./game.ts";
import { SQUARE_IDS, type Squares } from "./season.ts";

export type WeekStatus = "draft" | "open" | "locked";

/** Firestore id for a week: "w01" … "w18". */
export function weekId(week: number): string {
  return `w${String(week).padStart(2, "0")}`;
}

export function isValidWeek(week: unknown): week is number {
  return Number.isInteger(week) && (week as number) >= 1 && (week as number) <= REGULAR_SEASON_WEEKS;
}

export type WeekOp = "setMatchup" | "publish" | "lock" | "delete";

/** Can `op` run on a week in `status` (null = no board yet)? */
export function checkWeekOp(status: WeekStatus | null, op: WeekOp): { ok: true } | { ok: false; error: string } {
  switch (op) {
    case "setMatchup":
      return status === "locked"
        ? { ok: false, error: "This board is locked; the matchup can't change." }
        : { ok: true };
    case "publish":
      if (status === null) return { ok: false, error: "Set up the matchup first." };
      return status === "draft" ? { ok: true } : { ok: false, error: "Already published." };
    case "lock":
      if (status === "open") return { ok: true };
      if (status === "locked") return { ok: false, error: "Already locked." };
      return { ok: false, error: "Publish the board before locking it." };
    case "delete":
      if (status === null) return { ok: false, error: "There's no board for that week." };
      return status === "locked"
        ? { ok: false, error: "Locked boards are part of the record and can't be deleted." }
        : { ok: true };
  }
}

// ---------- payments and locking (Phase 6) ----------


/** Boards lock themselves this long before kickoff. */
export const LOCK_LEAD_MINUTES = 30;

export function lockDueMs(kickoffMs: number): number {
  return kickoffMs - LOCK_LEAD_MINUTES * 60_000;
}

/** Should the auto-lock job lock this board now? Drafts lock too, so a forgotten publish can't stall a week. */
export function isLockDue(status: WeekStatus, kickoffMs: number, nowMs: number): boolean {
  return status !== "locked" && nowMs >= lockDueMs(kickoffMs);
}

/** Payments for a week: uid → paid. Keyed by player, so swapping squares keeps who paid. */
export type Payments = Readonly<Record<string, boolean>>;

/**
 * Players marked fully paid: uid → first week covered. They count as paid for
 * that week and every later week of the regular season.
 */
export type Prepaid = Readonly<Record<string, number>>;

export function isPaidFor(uid: string, week: number, payments: Payments, prepaid: Prepaid = {}): boolean {
  if (payments[uid] === true) return true;
  const from = prepaid[uid];
  return typeof from === "number" && week >= from;
}

/** Squares whose current occupant has paid for `week`. */
export function paidSquareIds(
  squares: Squares,
  payments: Payments,
  prepaid: Prepaid = {},
  week = 0,
): string[] {
  return SQUARE_IDS.filter((id) => {
    const seat = squares[id];
    return seat !== null && isPaidFor(seat.uid, week, payments, prepaid);
  });
}

/** Everything frozen onto a board at lock time. */
export interface LockSnapshot {
  paidSquareIds: string[];
  prize: PrizeBreakdown;
  /** Payments with any fully-paid credit written in, so the locked week stands on its own. */
  payments: Record<string, boolean>;
}

export function lockSnapshot(
  squares: Squares,
  payments: Payments,
  rolloverInCents: number,
  prepaid: Prepaid = {},
  week = 0,
): LockSnapshot {
  const paid = paidSquareIds(squares, payments, prepaid, week);
  const merged: Record<string, boolean> = { ...payments };
  for (const id of paid) merged[squares[id]!.uid] = true;
  return { paidSquareIds: paid, prize: computePrize(paid.length, rolloverInCents), payments: merged };
}

// ---------- season balances ----------

export const WEEKLY_BUY_IN_CENTS = 10_000;
export const SEASON_TOTAL_CENTS = REGULAR_SEASON_WEEKS * WEEKLY_BUY_IN_CENTS;

export interface WeekPayments {
  week: number;
  payments?: Payments;
}

export interface SeasonTally {
  paidWeeks: number[];
  paidCents: number;
  leftCents: number;
  fullyPaidFrom: number | null;
}

/**
 * What a player has paid this season: every week marked paid on its board,
 * plus every week covered by "fully paid" (including weeks not posted yet).
 */
export function seasonTally(uid: string, weeks: readonly WeekPayments[], prepaid: Prepaid = {}): SeasonTally {
  const byWeek = new Map(weeks.map((w) => [w.week, w.payments ?? {}]));
  const paidWeeks: number[] = [];
  for (let n = 1; n <= REGULAR_SEASON_WEEKS; n++) {
    if (isPaidFor(uid, n, byWeek.get(n) ?? {}, prepaid)) paidWeeks.push(n);
  }
  const paidCents = paidWeeks.length * WEEKLY_BUY_IN_CENTS;
  return {
    paidWeeks,
    paidCents,
    leftCents: SEASON_TOTAL_CENTS - paidCents,
    fullyPaidFrom: typeof prepaid[uid] === "number" ? prepaid[uid] : null,
  };
}

export interface WeekState extends WeekPayments {
  status: WeekStatus;
}

/**
 * First week "Mark fully paid" covers: the open week if they haven't paid it,
 * else the week after; with no open week, the week after the last locked one.
 * Null when there's nothing left to cover.
 */
export function fullPayStart(uid: string, weeks: readonly WeekState[]): number | null {
  const open = weeks.filter((w) => w.status !== "locked").map((w) => w.week).sort((a, b) => a - b);
  const locked = weeks.filter((w) => w.status === "locked").map((w) => w.week);
  let start: number;
  if (open.length > 0) {
    const first = weeks.find((w) => w.week === open[0])!;
    start = first.payments?.[uid] === true ? open[0] + 1 : open[0];
  } else {
    start = (locked.length ? Math.max(...locked) : 0) + 1;
  }
  return start > REGULAR_SEASON_WEEKS ? null : start;
}
