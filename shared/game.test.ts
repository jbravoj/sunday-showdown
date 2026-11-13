import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePrize,
  formatCents,
  isDigitPermutation,
  resolveWeek,
  shuffleDigits,
  squareAt,
} from "./game.ts";
import { DEFAULT_LAYOUT } from "./layout.ts";

const ALL_PAID = DEFAULT_LAYOUT.map((s) => s.id);

// ---- Real 2026 boards from the group, checked against the official box scores ----

test("Week 4 2026: Panthers 32 (top), Lions 26 (left) -> Adam wins $2,000", () => {
  const out = resolveWeek({
    layout: DEFAULT_LAYOUT,
    topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
    leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
    topScore: 32,
    leftScore: 26,
    paidSquareIds: ALL_PAID,
    potCents: 200_000,
  });
  assert.equal(out.kind, "win");
  assert.equal(out.label, "22 Adam");
  assert.equal(out.awardedCents, 200_000);
  assert.equal(out.rolloverOutCents, 0);
});

test("Week 6 2026: Packers 23 (top), Cowboys 13 (left) -> black square, $1,000 rolls over", () => {
  const out = resolveWeek({
    layout: DEFAULT_LAYOUT,
    topDigits: [5, 8, 0, 6, 2, 4, 9, 1, 7, 3],
    leftDigits: [2, 7, 5, 8, 3, 1, 9, 0, 4, 6],
    topScore: 23,
    leftScore: 13,
    paidSquareIds: ALL_PAID,
    potCents: 100_000,
  });
  assert.equal(out.kind, "rollover");
  assert.equal(out.kind === "rollover" && out.reason, "inactive");
  assert.deepEqual(out.cell, { row: 4, col: 9 });
  assert.equal(out.rolloverOutCents, 100_000);
});

test("Week 7 2026: Seahawks 20 (top), Chiefs 3 (left) -> black square, $2,000 rolls over", () => {
  const out = resolveWeek({
    layout: DEFAULT_LAYOUT,
    topDigits: [9, 0, 6, 8, 5, 2, 1, 7, 4, 3],
    leftDigits: [3, 9, 1, 6, 4, 5, 0, 2, 8, 7],
    topScore: 20,
    leftScore: 3,
    paidSquareIds: ALL_PAID,
    potCents: 200_000,
  });
  assert.equal(out.kind, "rollover");
  assert.deepEqual(out.cell, { row: 0, col: 1 });
  assert.equal(out.rolloverOutCents, 200_000);
});

test("Unpaid square: Week 4 with Adam not paid -> no winner, pot rolls over", () => {
  const out = resolveWeek({
    layout: DEFAULT_LAYOUT,
    topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
    leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
    topScore: 32,
    leftScore: 26,
    paidSquareIds: ALL_PAID.filter((id) => id !== "sq22"),
    potCents: 191_667,
  });
  assert.equal(out.kind, "rollover");
  assert.equal(out.kind === "rollover" && out.reason, "unpaid");
  assert.equal(out.label, "22 Adam");
  assert.equal(out.rolloverOutCents, 191_667);
});

test("Rejects bad scores and bad digit rows", () => {
  const base = {
    layout: DEFAULT_LAYOUT,
    topDigits: [3, 1, 7, 2, 9, 6, 8, 5, 0, 4],
    leftDigits: [0, 1, 2, 9, 5, 4, 7, 3, 8, 6],
    topScore: 32,
    leftScore: 26,
    paidSquareIds: ALL_PAID,
    potCents: 100_000,
  };
  assert.throws(() => resolveWeek({ ...base, topScore: -1 }));
  assert.throws(() => resolveWeek({ ...base, leftScore: 2.5 }));
  assert.throws(() => resolveWeek({ ...base, topDigits: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8] }));
});

// ---- Layout ----

test("Layout: 12 squares, 4 cells each, 48 winning cells, no overlaps, checkerboard", () => {
  assert.equal(DEFAULT_LAYOUT.length, 12);
  const keys = new Set<string>();
  for (const sq of DEFAULT_LAYOUT) {
    assert.equal(sq.cells.length, 4);
    for (const c of sq.cells) {
      assert.ok(c.row >= 0 && c.row < 10 && c.col >= 0 && c.col < 10);
      assert.equal((Math.floor(c.row / 2) + Math.floor(c.col / 2)) % 2, 1, `${sq.label} on a black block`);
      keys.add(`${c.row},${c.col}`);
    }
  }
  assert.equal(keys.size, 48);
  assert.equal(squareAt(DEFAULT_LAYOUT, { row: 0, col: 0 }), null);
  assert.equal(squareAt(DEFAULT_LAYOUT, { row: 3, col: 1 })?.label, "6 👻");
});

// ---- Prize math ----

test("Prize: 5/6 to the winner, 1/6 to support, in whole cents", () => {
  const cases: Array<[number, number, number]> = [
    [12, 100_000, 20_000],
    [11, 91_667, 18_333],
    [10, 83_333, 16_667],
    [9, 75_000, 15_000],
    [1, 8_333, 1_667],
    [0, 0, 0],
  ];
  for (const [paid, prize, support] of cases) {
    const p = computePrize(paid, 0);
    assert.equal(p.prizeCents, prize, `${paid} paid prize`);
    assert.equal(p.supportCents, support, `${paid} paid support`);
    assert.equal(p.prizeCents + p.supportCents, p.contributionsCents);
  }
});

test("Prize: rollover is added in full, no support taken from it", () => {
  const p = computePrize(12, 300_000);
  assert.equal(p.supportCents, 20_000);
  assert.equal(p.potCents, 400_000);
});

test("Rollover chain from the spec: $1,000 -> $2,000 -> $3,000", () => {
  let rollover = 0;
  const pots: number[] = [];
  for (let week = 0; week < 3; week++) {
    const p = computePrize(12, rollover);
    pots.push(p.potCents);
    rollover = p.potCents; // no winner
  }
  assert.deepEqual(pots, [100_000, 200_000, 300_000]);
});

// ---- Shuffle ----

test("Shuffle always returns a permutation of 0-9", () => {
  for (let i = 0; i < 1000; i++) {
    assert.ok(isDigitPermutation(shuffleDigits((n) => Math.floor(Math.random() * n))));
  }
});

test("Shuffle rejects a broken random source", () => {
  assert.throws(() => shuffleDigits(() => 99));
});

test("Shuffle is roughly uniform", () => {
  const counts = Array.from({ length: 10 }, () => new Array(10).fill(0));
  const runs = 20_000;
  for (let i = 0; i < runs; i++) {
    shuffleDigits((n) => Math.floor(Math.random() * n)).forEach((d, pos) => counts[pos][d]++);
  }
  for (const row of counts) for (const n of row) assert.ok(n > runs * 0.08 && n < runs * 0.12);
});

test("formatCents", () => {
  assert.equal(formatCents(100_000), "$1,000");
  assert.equal(formatCents(91_667), "$916.67");
  assert.equal(formatCents(5), "$0.05");
});
