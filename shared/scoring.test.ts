import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeaderboard, resultHeadline, scoreLockedWeek, type LockedWeek } from "./scoring.ts";
import { emptySquares } from "./season.ts";
import { formatCents } from "./game.ts";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function lockedWeek(paid: string[]): LockedWeek {
  const squares = emptySquares();
  squares.sq01 = { uid: "u1", name: "Lonzy" };
  squares.sq02 = { uid: "u2", name: "Gibby" };
  return { squares, topDigits: DIGITS, leftDigits: DIGITS, paidSquareIds: paid, potCents: 100_000 };
}

// With digits 0-9 in order, square 1 covers home digits 2-3 × away digits 0-1.
test("a paid square on the winning cell takes the pot", () => {
  const r = scoreLockedWeek(lockedWeek(["sq01", "sq02"]), 22, 10, "auto");
  assert.equal(r.kind, "win");
  assert.equal(r.squareId, "sq01");
  assert.equal(r.uid, "u1");
  assert.equal(r.name, "Lonzy");
  assert.equal(r.awardedCents, 100_000);
  assert.equal(r.rolloverOutCents, 0);
  assert.deepEqual([r.homeDigit, r.awayDigit], [2, 0]);
  assert.equal(r.source, "auto");
  assert.equal(resultHeadline(r, formatCents), "Lonzy wins $1,000");
});

test("an unpaid square rolls the pot over", () => {
  const r = scoreLockedWeek(lockedWeek(["sq02"]), 13, 21, "manual");
  assert.equal(r.kind, "rollover");
  assert.equal(r.reason, "unpaid");
  assert.equal(r.squareId, "sq01");
  assert.equal(r.awardedCents, 0);
  assert.equal(r.rolloverOutCents, 100_000);
  assert.equal(resultHeadline(r, formatCents), "No winner · $1,000 rolls over");
});

test("a black cell rolls the pot over with no square", () => {
  const r = scoreLockedWeek(lockedWeek(["sq01", "sq02"]), 10, 20, "auto");
  assert.equal(r.kind, "rollover");
  assert.equal(r.reason, "inactive");
  assert.equal(r.squareId, null);
  assert.equal(r.uid, null);
});

test("bad scores are refused", () => {
  assert.throws(() => scoreLockedWeek(lockedWeek([]), -1, 3, "manual"));
  assert.throws(() => scoreLockedWeek(lockedWeek([]), 3.5, 3, "manual"));
  assert.throws(() => scoreLockedWeek(lockedWeek([]), 200, 3, "manual"));
});

test("leaderboard ranks by money won and totals the season", () => {
  const squares = emptySquares();
  squares.sq01 = { uid: "u1", name: "Lonzy" };
  squares.sq02 = { uid: "u2", name: "Gibby" };
  squares.sq03 = { uid: "u3", name: "OJ" };
  const win = (uid: string, name: string, cents: number) => ({
    kind: "win" as const, uid, name, squareId: null, awardedCents: cents, rolloverOutCents: 0,
  });
  const weeks = [
    { week: 1, payments: { u1: true, u2: true, u3: true }, result: win("u2", "Gibby", 100_000) },
    { week: 2, payments: { u1: true, u2: true }, result: { kind: "rollover" as const, uid: null, name: null, squareId: "sq03", awardedCents: 0, rolloverOutCents: 83_333 } },
    { week: 3, payments: { u1: true, u2: true, u3: true }, result: win("u1", "Lonzy", 183_333) },
    { week: 4, payments: { u1: true }, result: win("gone", "Ex Player", 50_000) },
    { week: 5, payments: { u1: true } },
  ];
  const lb = buildLeaderboard(squares, weeks, { u3: 10 });
  assert.deepEqual(lb.standings.map((s) => s.name), ["Lonzy", "Gibby", "Ex Player", "OJ"]);
  assert.deepEqual(lb.standings.map((s) => s.rank), [1, 2, 3, null]);
  const lonzy = lb.standings[0];
  assert.equal(lonzy.squareId, "sq01");
  assert.equal(lonzy.wins, 1);
  assert.equal(lonzy.paidInCents, 5 * 10_000); // weeks 1-5
  assert.equal(lonzy.netCents, 183_333 - 50_000);
  const oj = lb.standings[3];
  assert.equal(oj.paidInCents, (2 + 9) * 10_000); // weeks 1, 3, and fully paid 10-18
  assert.equal(lb.standings[2].squareId, null);
  assert.equal(lb.paidOutCents, 333_333);
  assert.equal(lb.rollovers, 1);
  assert.equal(lb.biggestPotCents, 183_333);
  assert.equal(lb.throughWeek, 4);
});

test("empty season", () => {
  const lb = buildLeaderboard(emptySquares(), []);
  assert.equal(lb.standings.length, 0);
  assert.equal(lb.throughWeek, null);
});
