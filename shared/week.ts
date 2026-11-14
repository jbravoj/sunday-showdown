// Weekly boards. Pure rules, shared by Cloud Functions, the site and tests.
//
//   draft  → the admin set up the matchup; players can't see it yet
//   open   → published; players see the matchup, numbers still hidden
//   locked → numbers drawn and who-sits-where frozen; can't be undone
//
// Phase 6 adds payments and locks boards automatically; Phase 7 adds scores.

import { REGULAR_SEASON_WEEKS } from "./schedule.ts";

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
