import { test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import {
  SQUARE_BLOCKS,
  SQUARE_IDS,
  applySquareOp,
  emptySquares,
  normalizeSquares,
  renameSeat,
  seasonLayout,
  squareOf,
  vacate,
} from "./season.ts";
import { resolveWeek } from "./game.ts";
import { DEFAULT_LAYOUT } from "./layout.ts";

const approved = new Map([
  ["u1", "Gilbert"],
  ["u2", "Israel"],
  ["u3", "Lonzy"],
]);
const noRandom = () => {
  throw new Error("not used");
};

test("12 squares on the white blocks, in the same spots as the 2026 board", () => {
  assert.equal(SQUARE_IDS.length, 12);
  assert.equal(SQUARE_IDS[0], "sq01");
  assert.equal(SQUARE_IDS[11], "sq12");
  const layout = seasonLayout(emptySquares());
  // Old board numbered the same blocks 2, 4, … 24.
  layout.forEach((sq, i) => assert.deepEqual(sq.cells, DEFAULT_LAYOUT[i].cells));
  for (const { row, col } of Object.values(SQUARE_BLOCKS)) assert.equal((row + col) % 2, 1);
});

test("labels show the number and name, or Open", () => {
  const s = emptySquares();
  s.sq07 = { uid: "u1", name: "Louie" };
  const layout = seasonLayout(s);
  assert.equal(layout[6].label, "7 Louie");
  assert.equal(layout[0].label, "1 Open");
});

test("an open square that comes up rolls the pot over", () => {
  const s = emptySquares();
  // Week 4 2026 digits land on the block that is now square 11.
  const out = resolveWeek({
    layout: seasonLayout(s),
    topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
    leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
    topScore: 32,
    leftScore: 26,
    paidSquareIds: [], // nobody sits there, so nobody paid for it
    potCents: 100_000,
  });
  assert.equal(out.kind, "rollover");
  assert.equal(out.squareId, "sq11");
});

test("place into an open square", () => {
  const r = applySquareOp(emptySquares(), { op: "place", squareId: "sq03", uid: "u1" }, approved, noRandom);
  assert.ok(r.ok);
  assert.deepEqual(r.squares.sq03, { uid: "u1", name: "Gilbert" });
});

test("place someone who already has a square swaps the two", () => {
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  s.sq02 = { uid: "u2", name: "Israel" };
  const r = applySquareOp(s, { op: "place", squareId: "sq02", uid: "u1" }, approved, noRandom);
  assert.ok(r.ok);
  assert.equal(r.squares.sq02?.uid, "u1");
  assert.equal(r.squares.sq01?.uid, "u2");
  assert.match(r.summary, /Swapped/);
});

test("moving into an open square leaves the old one open", () => {
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  const r = applySquareOp(s, { op: "place", squareId: "sq05", uid: "u1" }, approved, noRandom);
  assert.ok(r.ok);
  assert.equal(r.squares.sq01, null);
  assert.equal(r.squares.sq05?.uid, "u1");
});

test("placing an unseated player over someone bumps them off the board", () => {
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  const r = applySquareOp(s, { op: "place", squareId: "sq01", uid: "u2" }, approved, noRandom);
  assert.ok(r.ok);
  assert.equal(r.squares.sq01?.uid, "u2");
  assert.equal(squareOf(r.squares, "u1"), null);
});

test("place rejects unapproved players, unknown squares, no-ops", () => {
  assert.equal(applySquareOp(emptySquares(), { op: "place", squareId: "sq01", uid: "nope" }, approved, noRandom).ok, false);
  assert.equal(applySquareOp(emptySquares(), { op: "place", squareId: "sq13", uid: "u1" }, approved, noRandom).ok, false);
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  assert.equal(applySquareOp(s, { op: "place", squareId: "sq01", uid: "u1" }, approved, noRandom).ok, false);
});

test("clear", () => {
  const s = emptySquares();
  s.sq04 = { uid: "u1", name: "Gilbert" };
  const r = applySquareOp(s, { op: "clear", squareId: "sq04" }, approved, noRandom);
  assert.ok(r.ok);
  assert.equal(r.squares.sq04, null);
  assert.equal(applySquareOp(emptySquares(), { op: "clear", squareId: "sq04" }, approved, noRandom).ok, false);
});

test("draw seats every unseated approved player in an open square, once each", () => {
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  for (let trial = 0; trial < 50; trial++) {
    const r = applySquareOp(s, { op: "draw" }, approved, randomInt);
    assert.ok(r.ok);
    assert.equal(r.squares.sq01?.uid, "u1"); // existing seats untouched
    const uids = SQUARE_IDS.map((id) => r.squares[id]?.uid).filter(Boolean);
    assert.deepEqual([...uids].sort(), ["u1", "u2", "u3"]);
  }
});

test("draw spreads players across squares (not always the same spot)", () => {
  const spots = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const r = applySquareOp(emptySquares(), { op: "draw" }, new Map([["u1", "A"]]), randomInt);
    assert.ok(r.ok);
    spots.add(squareOf(r.squares, "u1")!);
  }
  assert.ok(spots.size >= 10, `only landed in ${spots.size} squares`);
});

test("draw with nothing to do", () => {
  const full = emptySquares();
  SQUARE_IDS.forEach((id, i) => (full[id] = { uid: `x${i}`, name: `P${i}` }));
  assert.equal(applySquareOp(full, { op: "draw" }, approved, randomInt).ok, false);
  const s = emptySquares();
  s.sq01 = { uid: "u1", name: "Gilbert" };
  assert.equal(applySquareOp(s, { op: "draw" }, new Map([["u1", "Gilbert"]]), randomInt).ok, false);
});

test("vacate and renameSeat", () => {
  const s = emptySquares();
  s.sq09 = { uid: "u1", name: "Gilbert" };
  assert.equal(vacate(s, "u1").sq09, null);
  assert.deepEqual(renameSeat(s, "u1", "Gil").sq09, { uid: "u1", name: "Gil" });
  assert.equal(renameSeat(s, "u2", "X").sq09?.name, "Gilbert");
});

test("normalizeSquares tolerates missing and junk entries", () => {
  const n = normalizeSquares({ sq01: { uid: "u1", name: "A" }, sq02: "junk", sq99: { uid: "z", name: "Z" } });
  assert.equal(Object.keys(n).length, 12);
  assert.deepEqual(n.sq01, { uid: "u1", name: "A" });
  assert.equal(n.sq02, null);
  assert.equal(normalizeSquares(undefined).sq05, null);
});
