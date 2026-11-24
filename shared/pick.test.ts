import { test } from "node:test";
import assert from "node:assert/strict";
import { claimSquare, emptySquares, pickDeadline, PICK_WINDOW_MS, seatAtRandom } from "./season.ts";

test("a player can claim an open square once", () => {
  const first = claimSquare(emptySquares(), "u1", "Pelon", "sq07");
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.deepEqual(first.squares.sq07, { uid: "u1", name: "Pelon" });
  assert.equal(first.summary, "Pelon picked square 7.");

  const again = claimSquare(first.squares, "u1", "Pelon", "sq03");
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.error, /already in square 7/);
});

test("a taken or unknown square can't be claimed", () => {
  const squares = { ...emptySquares(), sq07: { uid: "u2", name: "Lonzy" } };
  const taken = claimSquare(squares, "u1", "Pelon", "sq07");
  assert.equal(taken.ok, false);
  if (!taken.ok) assert.equal(taken.error, "Square 7 was just taken. Pick another.");
  assert.equal(claimSquare(squares, "u1", "Pelon", "sq13").ok, false);
});

test("random seating picks only open squares", () => {
  const squares = emptySquares();
  for (const id of Object.keys(squares)) if (id !== "sq04" && id !== "sq09") squares[id] = { uid: id, name: id };
  const last = seatAtRandom(squares, "u1", "Pelon", (n) => n - 1);
  assert.ok(last.ok);
  if (last.ok) assert.deepEqual(last.squares.sq09, { uid: "u1", name: "Pelon" });
  const firstOpen = seatAtRandom(squares, "u1", "Pelon", () => 0);
  if (firstOpen.ok) assert.deepEqual(firstOpen.squares.sq04, { uid: "u1", name: "Pelon" });
});

test("random seating refuses when seated or full", () => {
  const seated = { ...emptySquares(), sq01: { uid: "u1", name: "Pelon" } };
  assert.equal(seatAtRandom(seated, "u1", "Pelon", () => 0).ok, false);
  const full = emptySquares();
  for (const id of Object.keys(full)) full[id] = { uid: id, name: id };
  assert.equal(seatAtRandom(full, "u1", "Pelon", () => 0).ok, false);
});

test("the pick deadline is 24 hours after approval", () => {
  assert.equal(PICK_WINDOW_MS, 86_400_000);
  assert.equal(pickDeadline(1_000), 86_401_000);
});
