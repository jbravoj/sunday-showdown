import { test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import {
  INVITE_ALPHABET,
  INVITE_TTL_MS,
  MAX_PLAYERS,
  checkInvitation,
  generateInviteCode,
  normalizeInviteCode,
  seatsTaken,
  validateDisplayName,
  type InvitationState,
} from "./invite.ts";
import { RULES, RULES_VERSION } from "./rules.ts";

test("alphabet has no look-alike characters and no repeats", () => {
  for (const ch of "01ILOS5") assert.ok(!INVITE_ALPHABET.includes(ch), ch);
  assert.equal(new Set(INVITE_ALPHABET).size, INVITE_ALPHABET.length);
});

test("generated codes are canonical and round-trip through normalize", () => {
  for (let i = 0; i < 500; i++) {
    const code = generateInviteCode(randomInt);
    assert.match(code, /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
    assert.equal(normalizeInviteCode(code), code);
    assert.equal(normalizeInviteCode(code.toLowerCase().replace("-", " ")), code);
  }
});

test("generateInviteCode rejects a broken random source", () => {
  assert.throws(() => generateInviteCode(() => INVITE_ALPHABET.length));
  assert.throws(() => generateInviteCode(() => -1));
});

test("normalizeInviteCode rejects wrong length and look-alikes", () => {
  assert.equal(normalizeInviteCode(""), null);
  assert.equal(normalizeInviteCode("ABCDE-FGHJ"), null);
  assert.equal(normalizeInviteCode("ABCDE-FGHJKM"), null);
  assert.equal(normalizeInviteCode("ABCDE-FGHJ0"), null); // zero
  assert.equal(normalizeInviteCode("ABCDE-FGHJO"), null); // letter O
  assert.equal(normalizeInviteCode("  abcde fghjk "), "ABCDE-FGHJK");
});

const NOW = Date.UTC(2027, 7, 1);
const fresh: InvitationState = {
  expiresAtMs: NOW + INVITE_TTL_MS,
  revoked: false,
  usedBy: null,
  email: null,
};

test("checkInvitation: fresh invite works for anyone", () => {
  assert.deepEqual(checkInvitation(fresh, NOW, "a@b.com"), { ok: true });
  assert.deepEqual(checkInvitation(fresh, NOW, null), { ok: true });
});

test("checkInvitation: used, revoked, expired", () => {
  assert.deepEqual(checkInvitation({ ...fresh, usedBy: "uid1" }, NOW, null), {
    ok: false,
    reason: "used",
  });
  assert.deepEqual(checkInvitation({ ...fresh, revoked: true, usedBy: "uid1" }, NOW, null), {
    ok: false,
    reason: "revoked",
  });
  assert.deepEqual(checkInvitation(fresh, fresh.expiresAtMs, null), {
    ok: false,
    reason: "expired",
  });
  assert.deepEqual(checkInvitation(fresh, fresh.expiresAtMs - 1, null), { ok: true });
});

test("checkInvitation: email-locked invite", () => {
  const locked = { ...fresh, email: "Louie@Example.com" };
  assert.deepEqual(checkInvitation(locked, NOW, "louie@example.com"), { ok: true });
  assert.deepEqual(checkInvitation(locked, NOW, "someone@else.com"), {
    ok: false,
    reason: "wrong-email",
  });
  assert.deepEqual(checkInvitation(locked, NOW, null), { ok: false, reason: "wrong-email" });
});

test("validateDisplayName accepts the group's real names, emoji included", () => {
  for (const n of ["Gilbert", "Too Tall", "OJ", "👻", "🐢", "Diaz"]) {
    assert.deepEqual(validateDisplayName(n), { ok: true, name: n });
  }
  assert.deepEqual(validateDisplayName("  Too   Tall "), { ok: true, name: "Too Tall" });
});

test("validateDisplayName rejects empty, long and markup", () => {
  assert.equal(validateDisplayName("   ").ok, false);
  assert.equal(validateDisplayName("x".repeat(17)).ok, false);
  assert.equal(validateDisplayName("🐢".repeat(16)).ok, true); // counts emoji as one each
  assert.equal(validateDisplayName("<b>Adam</b>").ok, false);
  assert.equal(validateDisplayName("Ad\u0000am").ok, false);
});

test("seatsTaken ignores removed players", () => {
  assert.equal(seatsTaken(["pending", "approved", "removed", "approved"]), 3);
  assert.equal(MAX_PLAYERS, 12);
});

test("rules are versioned and state the money correctly", () => {
  assert.ok(RULES_VERSION.length > 0);
  const text = RULES.flatMap((s) => s.items).join("\n");
  assert.match(text, /\$100 per week/);
  assert.match(text, /winner gets \$1,000; \$200 goes to running the site/);
  assert.match(text, /NO OT/);
  assert.match(text, /NO PAY • NO PLAY/);
});
