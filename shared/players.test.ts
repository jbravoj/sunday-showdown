import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPlayerAction } from "./players.ts";

const pending = { status: "pending" as const, rulesAccepted: true };
const approved = { status: "approved" as const, rulesAccepted: true };
const removed = { status: "removed" as const, rulesAccepted: true };

test("approve: pending player who accepted the rules", () => {
  assert.deepEqual(checkPlayerAction(pending, "approve", 5), { ok: true, next: "approved" });
});

test("approve: blocked until rules are accepted", () => {
  const r = checkPlayerAction({ ...pending, rulesAccepted: false }, "approve", 5);
  assert.equal(r.ok, false);
});

test("approve: not for approved or removed players", () => {
  assert.equal(checkPlayerAction(approved, "approve", 5).ok, false);
  assert.equal(checkPlayerAction(removed, "approve", 5).ok, false);
});

test("remove: works from pending or approved, not twice", () => {
  assert.deepEqual(checkPlayerAction(pending, "remove", 12), { ok: true, next: "removed" });
  assert.deepEqual(checkPlayerAction(approved, "remove", 12), { ok: true, next: "removed" });
  assert.equal(checkPlayerAction(removed, "remove", 12).ok, false);
});

test("reinstate: back to pending only if a seat is free", () => {
  assert.deepEqual(checkPlayerAction(removed, "reinstate", 11), { ok: true, next: "pending" });
  assert.equal(checkPlayerAction(removed, "reinstate", 12).ok, false);
  assert.equal(checkPlayerAction(pending, "reinstate", 5).ok, false);
});
