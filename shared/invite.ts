// Invitation and registration rules for Sunday Showdown.
// Pure functions only, shared by Cloud Functions, the site and tests.

/** Seats on the board. Registration closes once this many players hold a seat. */
export const MAX_PLAYERS = 12;

/** Invite links stop working after this many days. */
export const INVITE_TTL_DAYS = 14;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Letters and digits that can't be mixed up when read aloud or typed on a
 * phone: no 0/O, 1/I/L, or 5/S. 29 symbols, 10 characters -> ~48 bits.
 */
export const INVITE_ALPHABET = "2346789ABCDEFGHJKMNPQRTUVWXYZ";
export const INVITE_CODE_LENGTH = 10;

/**
 * Random invite code in canonical form, e.g. "K7QM4-XR9TB".
 * `randomInt(n)` must return a uniformly random integer in [0, n);
 * on the server this is crypto.randomInt.
 */
export function generateInviteCode(randomInt: (maxExclusive: number) => number): string {
  let raw = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const j = randomInt(INVITE_ALPHABET.length);
    if (!Number.isInteger(j) || j < 0 || j >= INVITE_ALPHABET.length) {
      throw new Error(`randomInt(${INVITE_ALPHABET.length}) returned ${j}`);
    }
    raw += INVITE_ALPHABET[j];
  }
  return formatInviteCode(raw);
}

/** "K7QM4XR9TB" -> "K7QM4-XR9TB" */
export function formatInviteCode(raw: string): string {
  const half = INVITE_CODE_LENGTH / 2;
  return `${raw.slice(0, half)}-${raw.slice(half)}`;
}

/**
 * Turns whatever a player typed or pasted into the canonical code, or null if
 * it can't be a valid code. Case, spaces and dashes don't matter.
 */
export function normalizeInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  if (raw.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of raw) {
    if (!INVITE_ALPHABET.includes(ch)) return null;
  }
  return formatInviteCode(raw);
}

/** What the server stores about an invitation (keyed by a hash of the code, never the code). */
export interface InvitationState {
  expiresAtMs: number;
  revoked: boolean;
  usedBy: string | null;
  /** If set, only an account with this email can use the invite. */
  email: string | null;
}

export type InviteCheck =
  | { ok: true }
  | { ok: false; reason: "used" | "revoked" | "expired" | "wrong-email" };

export function checkInvitation(
  invite: InvitationState,
  nowMs: number,
  accountEmail: string | null,
): InviteCheck {
  if (invite.revoked) return { ok: false, reason: "revoked" };
  if (invite.usedBy !== null) return { ok: false, reason: "used" };
  if (nowMs >= invite.expiresAtMs) return { ok: false, reason: "expired" };
  if (invite.email !== null) {
    if (accountEmail === null || accountEmail.toLowerCase() !== invite.email.toLowerCase()) {
      return { ok: false, reason: "wrong-email" };
    }
  }
  return { ok: true };
}

export const DISPLAY_NAME_MAX = 16;

/**
 * Cleans up a display name (what shows on the player's square), or returns an
 * error message. Emoji are fine: the group already has 👻 and 🐢.
 */
export function validateDisplayName(
  input: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.normalize("NFC").trim().replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(name)) {
    return { ok: false, error: "Name has characters that aren't allowed." };
  }
  const length = [...name].length;
  if (length < 1) return { ok: false, error: "Enter a name for your square." };
  if (length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, name };
}

/** Lifecycle of a player account. Phase 3 adds approval and removal by the admin. */
export type PlayerStatus = "pending" | "approved" | "removed";

/** Seats count every player who hasn't been removed, including those awaiting approval. */
export function seatsTaken(statuses: readonly PlayerStatus[]): number {
  return statuses.filter((s) => s !== "removed").length;
}
