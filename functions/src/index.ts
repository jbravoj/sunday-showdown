// Cloud Functions for Sunday Showdown.
// Every write that matters (invitations, player records, the audit log) goes
// through here. Firestore rules give clients read access only.

import { createHash, randomInt } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  INVITE_TTL_MS,
  MAX_PLAYERS,
  checkInvitation,
  generateInviteCode,
  normalizeInviteCode,
  seatsTaken,
  validateDisplayName,
  type PlayerStatus,
} from "../../shared/invite.ts";
import { RULES_VERSION } from "../../shared/rules.ts";
import { checkPlayerAction, type PlayerAction } from "../../shared/players.ts";
import {
  CURRENT_SEASON,
  SQUARE_IDS,
  applySquareOp,
  claimSquare,
  normalizeSquares,
  pickDeadline,
  renameSeat,
  seatAtRandom,
  squareOf,
  vacate,
  type SquareOp,
} from "../../shared/season.ts";
import { shuffleDigits } from "../../shared/game.ts";
import { findSundayNightGame, parseScoreboard, scoreboardUrl, type Team } from "../../shared/schedule.ts";
import {
  checkWeekOp,
  fullPayStart,
  isLockDue,
  isPaidFor,
  isValidWeek,
  lockSnapshot,
  weekId,
  type Payments,
  type Prepaid,
  type WeekState,
  type WeekOp,
  type WeekStatus,
} from "../../shared/week.ts";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { inviteMail, inviteRequestMail, playerJoinedMail } from "../../shared/notify.ts";
import { MAIL_SECRETS, sendMail } from "./mail.ts";
import { logger } from "firebase-functions/v2";

initializeApp();
// invoker "public": callable functions must be reachable from the site; each
// one checks the caller's sign-in and admin claim itself.
setGlobalOptions({ region: "us-central1", maxInstances: 5, invoker: "public" });

const db = getFirestore();
const invitations = db.collection("invitations");
const players = db.collection("players");
const auditLog = db.collection("auditLog");
const inviteRequests = db.collection("inviteRequests");
/** Public (signed-out visitors can read it): seats filled and whether sign-up is open. */
const siteStatusRef = db.collection("site").doc("status");
const seasonRef = db.collection("seasons").doc(CURRENT_SEASON);

// ---------- helpers ----------

/** Invitations are stored under a hash of the code so the database never holds a usable code. */
function inviteDocId(code: string): string {
  return createHash("sha256").update(`sunday-showdown-invite:${code}`).digest("hex");
}

interface Caller {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

/** Players sign in with email and password. The invite code is what proves they belong. */
function requireUser(req: CallableRequest): Caller {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const token = auth.token;
  if (typeof token.email !== "string") {
    throw new HttpsError("failed-precondition", "Sign in with an email address.");
  }
  return {
    uid: auth.uid,
    email: token.email.toLowerCase(),
    emailVerified: token.email_verified === true,
    isAdmin: token.admin === true,
  };
}

/** New players must prove they own their email before asking for or using an invite. */
function requireVerified(caller: Caller): void {
  if (!caller.emailVerified && !caller.isAdmin) {
    throw new HttpsError(
      "failed-precondition",
      "Verify your email first: tap the link we sent you, then try again.",
    );
  }
}

function requireAdmin(req: CallableRequest): Caller {
  const caller = requireUser(req);
  if (!caller.isAdmin) throw new HttpsError("permission-denied", "Admins only.");
  return caller;
}

function str(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", `${field} is required.`);
  if (value.length > maxLength) throw new HttpsError("invalid-argument", `${field} is too long.`);
  return value;
}

function optionalStr(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return str(value, field, maxLength).trim() || null;
}

function audit(
  tx: Transaction,
  actor: string,
  action: string,
  target: DocumentReference,
  details: Record<string, unknown> = {},
): void {
  tx.create(auditLog.doc(), {
    at: FieldValue.serverTimestamp(),
    actor,
    action,
    target: target.path,
    details,
  });
}

const INVITE_ERRORS = {
  used: "That invite has already been used.",
  revoked: "That invite was cancelled. Ask the admin for a new one.",
  expired: "That invite has expired. Ask the admin for a new one.",
  "wrong-email": "That invite is for a different email address.",
} as const;

// ---------- admin: invitations ----------

/**
 * Admin creates a one-time invite. Returns the code once; only its hash is
 * stored. Options:
 * - email + send: emails the code and link to that address.
 * - email + lock (the default when an email is given, for older clients):
 *   only that address can use it.
 * - requestUid: answers someone's invite request: uses their name and their
 *   verified email, emails them, and locks the code to that email.
 */
export const createInvitation = onCall({ secrets: MAIL_SECRETS }, async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  let note = optionalStr(data.note, "Note", 60);
  const emailRaw = optionalStr(data.email, "Email", 254);
  let email = emailRaw ? emailRaw.toLowerCase() : null;
  const requestUid = optionalStr(data.requestUid, "Request", 128);
  let send = data.send === true;
  let lock = data.lock === undefined ? email !== null : data.lock === true;

  let requestRef: DocumentReference | null = null;
  if (requestUid !== null) {
    requestRef = inviteRequests.doc(requestUid);
    const reqSnap = await requestRef.get();
    if (!reqSnap.exists) throw new HttpsError("not-found", "That request is gone. They may have joined already.");
    email = String(reqSnap.get("email"));
    note = note ?? (String(reqSnap.get("displayName") ?? "") || null);
    send = true;
    lock = true;
  }
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "That email address doesn't look right.");
  }
  if (send && email === null) throw new HttpsError("invalid-argument", "Add their email to send the invite.");

  const code = generateInviteCode(randomInt);
  const ref = invitations.doc(inviteDocId(code));
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);

  await db.runTransaction(async (tx) => {
    tx.create(ref, {
      codeHint: code.slice(-3),
      note,
      email: lock ? email : null,
      sentTo: send ? email : null,
      createdBy: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      revoked: false,
      revokedAt: null,
      usedBy: null,
      usedByName: null,
      usedAt: null,
    });
    if (requestRef) {
      tx.update(requestRef, { status: "invited", invitedAt: FieldValue.serverTimestamp(), invitationId: ref.id });
    }
    audit(tx, admin.uid, "invitation.create", ref, { note, email, lock, send, requestUid });
  });

  const emailed = send && email !== null ? await sendMail(inviteMail(code, note, expiresAt.toDate()), email) : false;
  return { id: ref.id, code, expiresAtMs: expiresAt.toMillis(), emailed };
});

/** Admin clears someone's invite request without sending one. */
export const dismissInviteRequest = onCall(async (req) => {
  const admin = requireAdmin(req);
  const uid = str((req.data as Record<string, unknown> | null)?.uid, "Request", 128);
  const ref = inviteRequests.doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    tx.delete(ref);
    audit(tx, admin.uid, "inviteRequest.dismiss", ref, { email: snap.get("email") });
  });
  return { ok: true };
});

/** Admin cancels an unused invite. */
export const revokeInvitation = onCall(async (req) => {
  const admin = requireAdmin(req);
  const id = str((req.data as Record<string, unknown> | null)?.id, "Invitation id", 64);
  if (!/^[0-9a-f]{64}$/.test(id)) throw new HttpsError("invalid-argument", "Bad invitation id.");
  const ref = invitations.doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Invitation not found.");
    if (snap.get("usedBy") !== null) {
      throw new HttpsError("failed-precondition", "That invite was already used.");
    }
    if (snap.get("revoked") === true) return;
    tx.update(ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() });
    audit(tx, admin.uid, "invitation.revoke", ref);
  });

  return { ok: true };
});

// ---------- players: registration ----------

/**
 * Signed in but no code: ask the admin for an invite. Emails the admin the
 * first time (and again if an earlier request was already answered).
 */
export const requestInvite = onCall({ secrets: MAIL_SECRETS }, async (req) => {
  const caller = requireUser(req);
  requireVerified(caller);
  const nameCheck = validateDisplayName(str((req.data as Record<string, unknown> | null)?.displayName, "Name", 100));
  if (!nameCheck.ok) throw new HttpsError("invalid-argument", nameCheck.error);
  const displayName = nameCheck.name;
  const ref = inviteRequests.doc(caller.uid);

  const isNew = await db.runTransaction(async (tx) => {
    const [playerSnap, reqSnap, allPlayers] = await Promise.all([
      tx.get(players.doc(caller.uid)),
      tx.get(ref),
      tx.get(players),
    ]);
    if (playerSnap.exists) throw new HttpsError("already-exists", "You're already registered.");
    if (seatsTaken(allPlayers.docs.map((d) => d.get("status") as PlayerStatus)) >= MAX_PLAYERS) {
      throw new HttpsError("resource-exhausted", `All ${MAX_PLAYERS} seats are taken. Sign-ups are closed.`);
    }
    if (reqSnap.exists && reqSnap.get("status") === "waiting") {
      tx.update(ref, { displayName });
      return false;
    }
    tx.set(ref, {
      email: caller.email,
      displayName,
      status: "waiting",
      requestedAt: FieldValue.serverTimestamp(),
      invitedAt: null,
      invitationId: null,
    });
    audit(tx, caller.uid, "inviteRequest.create", ref, { displayName });
    return true;
  });

  if (isNew) await sendMail(inviteRequestMail(displayName, caller.email));
  return { ok: true };
});

/**
 * A signed-in player redeems an invite code and picks the name for their
 * square. Creates their player record as "pending" (admin approves in Phase 3).
 */
export const redeemInvitation = onCall({ secrets: MAIL_SECRETS }, async (req) => {
  const caller = requireUser(req);
  requireVerified(caller);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const code = normalizeInviteCode(str(data.code, "Invite code", 40));
  if (code === null) throw new HttpsError("invalid-argument", "That invite code isn't valid.");
  const nameCheck = validateDisplayName(str(data.displayName, "Name", 100));
  if (!nameCheck.ok) throw new HttpsError("invalid-argument", nameCheck.error);
  const displayName = nameCheck.name;

  const inviteRef = invitations.doc(inviteDocId(code));
  const playerRef = players.doc(caller.uid);

  const joined = await db.runTransaction(async (tx) => {
    const [inviteSnap, playerSnap, allPlayers] = await Promise.all([
      tx.get(inviteRef),
      tx.get(playerRef),
      tx.get(players),
    ]);

    if (!inviteSnap.exists) throw new HttpsError("not-found", "That invite code isn't valid.");

    if (playerSnap.exists) {
      // Retrying after a dropped connection: already done.
      if (inviteSnap.get("usedBy") === caller.uid) return false;
      const status = playerSnap.get("status") as PlayerStatus;
      throw new HttpsError(
        "already-exists",
        status === "removed"
          ? "This account was removed from the board. Talk to the admin."
          : "You're already registered.",
      );
    }

    const lockedEmail = (inviteSnap.get("email") as string | null) ?? null;
    const check = checkInvitation(
      {
        expiresAtMs: (inviteSnap.get("expiresAt") as Timestamp).toMillis(),
        revoked: inviteSnap.get("revoked") === true,
        usedBy: (inviteSnap.get("usedBy") as string | null) ?? null,
        email: lockedEmail,
      },
      Date.now(),
      caller.email,
    );
    if (!check.ok) throw new HttpsError("failed-precondition", INVITE_ERRORS[check.reason]);

    const statuses = allPlayers.docs.map((d) => d.get("status") as PlayerStatus);
    if (seatsTaken(statuses) >= MAX_PLAYERS) {
      throw new HttpsError("resource-exhausted", `All ${MAX_PLAYERS} seats are taken.`);
    }

    const nameTaken = allPlayers.docs.some(
      (d) =>
        d.get("status") !== "removed" &&
        String(d.get("displayName")).toLowerCase() === displayName.toLowerCase(),
    );
    if (nameTaken) throw new HttpsError("already-exists", "Someone already has that name.");

    tx.create(playerRef, {
      displayName,
      email: caller.email,
      status: "pending" satisfies PlayerStatus,
      invitationId: inviteRef.id,
      joinedAt: FieldValue.serverTimestamp(),
      rulesVersion: null,
      rulesAcceptedAt: null,
    });
    tx.update(inviteRef, {
      usedBy: caller.uid,
      usedByName: displayName,
      usedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(inviteRequests.doc(caller.uid));
    audit(tx, caller.uid, "player.register", playerRef, { displayName });
    return true;
  });

  if (joined) await sendMail(playerJoinedMail(displayName, caller.email));
  return { ok: true };
});

/** A registered player accepts the current version of the house rules. */
export const acceptRules = onCall(async (req) => {
  const caller = requireUser(req);
  const version = str((req.data as Record<string, unknown> | null)?.version, "Rules version", 20);
  if (version !== RULES_VERSION) {
    throw new HttpsError("failed-precondition", "The rules were updated. Reload and read them again.");
  }
  const playerRef = players.doc(caller.uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(playerRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "Redeem your invite first.");
    if (snap.get("status") === "removed") {
      throw new HttpsError("permission-denied", "This account was removed from the board.");
    }
    if (snap.get("rulesVersion") === RULES_VERSION) return;
    tx.update(playerRef, {
      rulesVersion: RULES_VERSION,
      rulesAcceptedAt: FieldValue.serverTimestamp(),
    });
    audit(tx, caller.uid, "player.acceptRules", playerRef, { version: RULES_VERSION });
  });

  return { ok: true };
});

// ---------- admin: player management ----------

const PLAYER_ACTIONS: readonly PlayerAction[] = ["approve", "remove", "reinstate"];

function playerId(value: unknown): string {
  const uid = str(value, "Player id", 128);
  if (!/^[A-Za-z0-9_-]+$/.test(uid)) throw new HttpsError("invalid-argument", "Bad player id.");
  return uid;
}

/** Admin approves, removes or reinstates a player. */
export const setPlayerStatus = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const uid = playerId(data.uid);
  const action = data.action as PlayerAction;
  if (!PLAYER_ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown action.");
  const playerRef = players.doc(uid);

  await db.runTransaction(async (tx) => {
    const [snap, allPlayers, season] = await Promise.all([
      tx.get(playerRef),
      tx.get(players),
      tx.get(seasonRef),
    ]);
    if (!snap.exists) throw new HttpsError("not-found", "Player not found.");
    const status = snap.get("status") as PlayerStatus;
    const seats = seatsTaken(allPlayers.docs.map((d) => d.get("status") as PlayerStatus));
    const check = checkPlayerAction(
      { status, rulesAccepted: snap.get("rulesVersion") === RULES_VERSION },
      action,
      seats,
    );
    if (!check.ok) throw new HttpsError("failed-precondition", check.error);

    const stamp = FieldValue.serverTimestamp();
    tx.update(playerRef, {
      status: check.next,
      ...(action === "approve" ? { approvedAt: stamp, approvedBy: admin.uid } : {}),
      ...(action === "remove" ? { removedAt: stamp, removedBy: admin.uid } : {}),
      ...(action === "reinstate" ? { reinstatedAt: stamp } : {}),
      // Newly approved players get 24 hours to pick their own square.
      ...(check.next === "approved" ? { pickWindowFrom: stamp } : {}),
    });
    audit(tx, admin.uid, `player.${action}`, playerRef, { from: status, to: check.next });
    // A removed player's square goes open; the admin can seat a replacement.
    if (action === "remove" && season.exists) {
      tx.update(seasonRef, {
        squares: vacate(normalizeSquares(season.get("squares")), uid),
        updatedAt: stamp,
      });
    }
  });

  return { ok: true };
});

/** Admin changes the name shown on a player's square. */
export const renamePlayer = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const uid = playerId(data.uid);
  const nameCheck = validateDisplayName(str(data.displayName, "Name", 100));
  if (!nameCheck.ok) throw new HttpsError("invalid-argument", nameCheck.error);
  const displayName = nameCheck.name;
  const playerRef = players.doc(uid);

  await db.runTransaction(async (tx) => {
    const [snap, allPlayers, season] = await Promise.all([
      tx.get(playerRef),
      tx.get(players),
      tx.get(seasonRef),
    ]);
    if (!snap.exists) throw new HttpsError("not-found", "Player not found.");
    const before = String(snap.get("displayName"));
    if (before === displayName) return;
    const taken = allPlayers.docs.some(
      (d) =>
        d.id !== uid &&
        d.get("status") !== "removed" &&
        String(d.get("displayName")).toLowerCase() === displayName.toLowerCase(),
    );
    if (taken) throw new HttpsError("already-exists", "Someone already has that name.");
    tx.update(playerRef, { displayName });
    if (season.exists) {
      tx.update(seasonRef, {
        squares: renameSeat(normalizeSquares(season.get("squares")), uid, displayName),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    audit(tx, admin.uid, "player.rename", playerRef, { from: before, to: displayName });
  });

  return { ok: true };
});

// ---------- admin: season squares ----------

/**
 * Admin places, swaps, clears or randomly draws players into the season's
 * 12 permanent squares. Placing a player who already has a square swaps them.
 */
export const manageSquares = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  let op: SquareOp;
  if (data.op === "draw") {
    op = { op: "draw" };
  } else if (data.op === "clear" || data.op === "place") {
    const squareId = str(data.squareId, "Square", 8);
    if (!SQUARE_IDS.includes(squareId)) throw new HttpsError("invalid-argument", "Unknown square.");
    op = data.op === "clear" ? { op: "clear", squareId } : { op: "place", squareId, uid: playerId(data.uid) };
  } else {
    throw new HttpsError("invalid-argument", "Unknown operation.");
  }

  const summary = await db.runTransaction(async (tx) => {
    const [season, approvedSnap] = await Promise.all([
      tx.get(seasonRef),
      tx.get(players.where("status", "==", "approved")),
    ]);
    const approved = new Map(approvedSnap.docs.map((d) => [d.id, String(d.get("displayName"))]));
    const result = applySquareOp(normalizeSquares(season.get("squares")), op, approved, randomInt);
    if (!result.ok) throw new HttpsError("failed-precondition", result.error);

    tx.set(
      seasonRef,
      {
        year: Number(CURRENT_SEASON),
        squares: result.squares,
        updatedAt: FieldValue.serverTimestamp(),
        ...(season.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    audit(tx, admin.uid, `squares.${op.op}`, seasonRef, { ...op, summary: result.summary });
    return result.summary;
  });

  return { ok: true, summary };
});

/**
 * An approved player without a square picks one of the open squares. First
 * pick is final: after that only the admin can move them.
 */
export const pickSquare = onCall(async (req) => {
  const caller = requireUser(req);
  const squareId = str((req.data as Record<string, unknown> | null)?.squareId, "Square", 8);
  const playerRef = players.doc(caller.uid);

  const summary = await db.runTransaction(async (tx) => {
    const [season, player] = await Promise.all([tx.get(seasonRef), tx.get(playerRef)]);
    if (!player.exists || player.get("status") !== "approved") {
      throw new HttpsError("permission-denied", "Only approved players can pick a square.");
    }
    const name = String(player.get("displayName"));
    const result = claimSquare(normalizeSquares(season.get("squares")), caller.uid, name, squareId);
    if (!result.ok) throw new HttpsError("failed-precondition", result.error);
    tx.set(
      seasonRef,
      {
        year: Number(CURRENT_SEASON),
        squares: result.squares,
        updatedAt: FieldValue.serverTimestamp(),
        ...(season.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    tx.update(playerRef, { squarePickedAt: FieldValue.serverTimestamp() });
    audit(tx, caller.uid, "squares.pick", seasonRef, { squareId, summary: result.summary });
    return result.summary;
  });

  return { ok: true, summary };
});

/**
 * Seats approved players who haven't picked: anyone whose 24 hours are up,
 * or everyone unseated when a board is about to lock (so they're on it).
 */
async function seatOverduePlayers(now: number, beforeLock: boolean): Promise<void> {
  await db.runTransaction(async (tx) => {
    const [season, approvedSnap] = await Promise.all([
      tx.get(seasonRef),
      tx.get(players.where("status", "==", "approved")),
    ]);
    let squares = normalizeSquares(season.get("squares"));
    const placed: string[] = [];
    const waiting = approvedSnap.docs
      .filter((d) => squareOf(squares, d.id) === null)
      .map((d) => {
        const from = (d.get("pickWindowFrom") ?? d.get("approvedAt")) as Timestamp | undefined;
        return { uid: d.id, name: String(d.get("displayName")), due: from ? pickDeadline(from.toMillis()) : 0 };
      })
      .filter((p) => beforeLock || p.due <= now)
      .sort((a, b) => a.due - b.due);
    for (const p of waiting) {
      const result = seatAtRandom(squares, p.uid, p.name, randomInt);
      if (!result.ok) break; // board's full
      squares = result.squares;
      placed.push(result.summary);
    }
    if (placed.length === 0) return;
    tx.set(seasonRef, { squares, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    audit(tx, "system", "squares.autoPick", seasonRef, { placed, beforeLock });
  });
}

// ---------- admin: weekly boards ----------

/**
 * Locks a board inside a transaction: draws both rows of numbers on the
 * server, and freezes who sits where, who paid and the prize. Permanent.
 * `actor` is the admin's uid, or "system" for the auto-lock job.
 */
function lockInTx(
  tx: Transaction,
  ref: DocumentReference,
  weekSnap: DocumentSnapshot,
  seasonSnap: DocumentSnapshot,
  actor: string,
): void {
  const topDigits = shuffleDigits(randomInt);
  const leftDigits = shuffleDigits(randomInt);
  const squares = normalizeSquares(seasonSnap.get("squares"));
  const payments = (weekSnap.get("payments") ?? {}) as Payments;
  const rolloverInCents = Number(weekSnap.get("rolloverInCents") ?? 0); // Phase 7 fills this in
  const prepaid = (seasonSnap.get("prepaid") ?? {}) as Prepaid;
  const snapshot = lockSnapshot(squares, payments, rolloverInCents, prepaid, Number(weekSnap.get("week")));
  const wasDraft = weekSnap.get("status") === "draft";
  tx.update(ref, {
    status: "locked",
    topDigits,
    leftDigits,
    squares,
    paidSquareIds: snapshot.paidSquareIds,
    payments: snapshot.payments,
    prize: snapshot.prize,
    lockedAt: FieldValue.serverTimestamp(),
    lockedBy: actor,
    ...(wasDraft ? { publishedAt: FieldValue.serverTimestamp() } : {}),
  });
  audit(tx, actor, "week.lock", ref, {
    week: weekSnap.get("week"),
    topDigits,
    leftDigits,
    paidSquareIds: snapshot.paidSquareIds,
    potCents: snapshot.prize.potCents,
  });
}

function teamArg(value: unknown, field: string): Team {
  const name = str(value, field, 40).trim();
  if (!name) throw new HttpsError("invalid-argument", `${field} is required.`);
  const short = name.split(" ").pop() ?? name;
  return { name, short, abbr: "", color: null, alt: null, logo: null };
}

/**
 * Admin sets up and runs a week's board.
 *   fetch   – pull the Sunday night matchup from ESPN's schedule (home team on top)
 *   manual  – type the matchup in (fallback when the feed has nothing)
 *   publish – show the board to players (numbers still hidden)
 *   lock    – draw both rows of numbers and freeze who sits where; permanent
 *   delete  – remove a board that isn't locked
 */
export const manageWeek = onCall({ timeoutSeconds: 30 }, async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const week = data.week;
  if (!isValidWeek(week)) throw new HttpsError("invalid-argument", "Pick a week from 1 to 18.");
  const op = data.op;
  const ref = seasonRef.collection("weeks").doc(weekId(week));

  if (op === "fetch" || op === "manual") {
    let matchup: { home: Team; away: Team; kickoff: Timestamp; gameId: string | null; source: string };
    if (op === "fetch") {
      // Testing only: borrow a past season's schedule before the real one is out.
      const year = data.scheduleYear === undefined ? CURRENT_SEASON : String(data.scheduleYear);
      if (!/^20\d\d$/.test(year)) throw new HttpsError("invalid-argument", "Bad schedule year.");
      let json: unknown;
      try {
        const res = await fetch(scoreboardUrl(year, week), { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } catch (err) {
        throw new HttpsError("unavailable", `Couldn't reach the NFL schedule (${String(err)}). Try again or enter the teams by hand.`);
      }
      const game = findSundayNightGame(parseScoreboard(json));
      if (!game) {
        throw new HttpsError(
          "not-found",
          `No Sunday night game found for week ${week} of ${year} yet. Enter the teams by hand.`,
        );
      }
      matchup = {
        home: game.home,
        away: game.away,
        kickoff: Timestamp.fromDate(new Date(game.kickoff)),
        gameId: game.id,
        source: year === CURRENT_SEASON ? "espn" : `espn-${year}`,
      };
    } else {
      const kickoffMs = Date.parse(str(data.kickoff, "Kickoff", 40));
      if (Number.isNaN(kickoffMs)) throw new HttpsError("invalid-argument", "Kickoff time isn't valid.");
      matchup = {
        home: teamArg(data.home, "Home team"),
        away: teamArg(data.away, "Away team"),
        kickoff: Timestamp.fromMillis(kickoffMs),
        gameId: null,
        source: "manual",
      };
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const status = snap.exists ? (snap.get("status") as WeekStatus) : null;
      const check = checkWeekOp(status, "setMatchup");
      if (!check.ok) throw new HttpsError("failed-precondition", check.error);
      tx.set(
        ref,
        {
          week,
          season: CURRENT_SEASON,
          ...matchup,
          status: status ?? "draft",
          updatedAt: FieldValue.serverTimestamp(),
          ...(snap.exists
            ? {}
            : { createdAt: FieldValue.serverTimestamp(), topDigits: null, leftDigits: null, squares: null }),
        },
        { merge: true },
      );
      audit(tx, admin.uid, "week.setMatchup", ref, {
        week,
        home: matchup.home.name,
        away: matchup.away.name,
        source: matchup.source,
      });
    });
    return { ok: true, summary: `Week ${week}: ${matchup.away.short} at ${matchup.home.short}.` };
  }

  if (op !== "publish" && op !== "lock" && op !== "delete") {
    throw new HttpsError("invalid-argument", "Unknown operation.");
  }
  // Anyone approved who hasn't picked gets a random square before the lock.
  if (op === "lock") await seatOverduePlayers(Date.now(), true);

  const summary = await db.runTransaction(async (tx) => {
    const [snap, season] = await Promise.all([tx.get(ref), tx.get(seasonRef)]);
    const status = snap.exists ? (snap.get("status") as WeekStatus) : null;
    const check = checkWeekOp(status, op as WeekOp);
    if (!check.ok) throw new HttpsError("failed-precondition", check.error);

    if (op === "publish") {
      tx.update(ref, { status: "open", publishedAt: FieldValue.serverTimestamp() });
      audit(tx, admin.uid, "week.publish", ref, { week });
      return `Week ${week} is live for players.`;
    }
    if (op === "delete") {
      tx.delete(ref);
      audit(tx, admin.uid, "week.delete", ref, { week });
      return `Deleted the week ${week} board.`;
    }
    lockInTx(tx, ref, snap, season, admin.uid);
    return `Week ${week} is locked and the numbers are drawn.`;
  });

  return { ok: true, summary };
});

/** Admin marks a player paid or not paid for a week. Freezes when the board locks. */
export const setPayment = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  if (!isValidWeek(data.week)) throw new HttpsError("invalid-argument", "Pick a week from 1 to 18.");
  const week = data.week;
  const uid = playerId(data.uid);
  if (typeof data.paid !== "boolean") throw new HttpsError("invalid-argument", "paid must be true or false.");
  const paid = data.paid;
  const ref = seasonRef.collection("weeks").doc(weekId(week));

  const summary = await db.runTransaction(async (tx) => {
    const [snap, season] = await Promise.all([tx.get(ref), tx.get(seasonRef)]);
    if (!snap.exists) throw new HttpsError("not-found", `Set up week ${week} first.`);
    if (snap.get("status") === "locked") {
      throw new HttpsError("failed-precondition", "This board is locked; payments are final.");
    }
    const seat = Object.values(normalizeSquares(season.get("squares"))).find((s) => s?.uid === uid);
    if (!seat) throw new HttpsError("failed-precondition", "That player doesn't have a square.");
    const prepaid = (season.get("prepaid") ?? {}) as Prepaid;
    if (!paid && isPaidFor(uid, week, {}, prepaid)) {
      throw new HttpsError(
        "failed-precondition",
        `${seat.name} is marked fully paid from week ${prepaid[uid]}. Undo that on the Players page first.`,
      );
    }
    tx.update(ref, { [`payments.${uid}`]: paid, updatedAt: FieldValue.serverTimestamp() });
    audit(tx, admin.uid, "payment.set", ref, { week, uid, name: seat.name, paid });
    return `${seat.name}: ${paid ? "paid" : "not paid"} for week ${week}.`;
  });

  return { ok: true, summary };
});

/**
 * Every 5 minutes: lock any board whose kickoff is 30 minutes away or less.
 * A board still in draft locks too (and becomes visible), so a forgotten
 * publish can't stall the week.
 */
export const autoLockBoards = onSchedule(
  { schedule: "every 5 minutes", timeZone: "America/Chicago", retryCount: 1 },
  async () => {
    const pending = await seasonRef.collection("weeks").where("status", "in", ["draft", "open"]).get();
    const now = Date.now();
    const lockingSoon = pending.docs.some((d) => {
      const kickoff = d.get("kickoff") as Timestamp | undefined;
      return !!kickoff && isLockDue(d.get("status") as WeekStatus, kickoff.toMillis(), now);
    });
    try {
      await seatOverduePlayers(now, lockingSoon);
    } catch (err) {
      logger.error("Auto-pick failed", err);
    }
    // Keeps the public seat count right even if a player change was missed.
    try {
      await refreshSiteStatus();
    } catch (err) {
      logger.error("Site status refresh failed", err);
    }
    for (const doc of pending.docs) {
      const kickoff = doc.get("kickoff") as Timestamp | undefined;
      if (!kickoff || !isLockDue(doc.get("status") as WeekStatus, kickoff.toMillis(), now)) continue;
      try {
        await db.runTransaction(async (tx) => {
          const [snap, season] = await Promise.all([tx.get(doc.ref), tx.get(seasonRef)]);
          // Re-check inside the transaction: the admin may have just locked it.
          if (!snap.exists || snap.get("status") === "locked") return;
          lockInTx(tx, doc.ref, snap, season, "system");
        });
        logger.info(`Auto-locked ${doc.id}`);
      } catch (err) {
        logger.error(`Auto-lock failed for ${doc.id}`, err);
      }
    }
  },
);

/**
 * Admin marks a player fully paid for the rest of the season (or undoes it).
 * Covers the open week if they haven't paid it (else the next week) through
 * week 18, including weeks that aren't posted yet. Locked weeks already have
 * their payments written in, so undoing never changes a locked week.
 */
export const markFullyPaid = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const uid = playerId(data.uid);
  const undo = data.undo === true;
  const weeksCol = seasonRef.collection("weeks");

  const summary = await db.runTransaction(async (tx) => {
    const [season, playerSnap, weeksSnap] = await Promise.all([
      tx.get(seasonRef),
      tx.get(players.doc(uid)),
      tx.get(weeksCol),
    ]);
    if (!playerSnap.exists) throw new HttpsError("not-found", "Player not found.");
    const name = String(playerSnap.get("displayName"));
    const prepaid = { ...((season.get("prepaid") ?? {}) as Record<string, number>) };

    if (undo) {
      if (prepaid[uid] === undefined) throw new HttpsError("failed-precondition", `${name} isn't marked fully paid.`);
      const from = prepaid[uid];
      // A merge can't remove a map key; delete it explicitly.
      tx.update(seasonRef, { [`prepaid.${uid}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      audit(tx, admin.uid, "payment.fullyPaid.undo", players.doc(uid), { from });
      return `${name} is no longer marked fully paid. Weeks that already locked stay as they were.`;
    }

    if (playerSnap.get("status") !== "approved") {
      throw new HttpsError("failed-precondition", "Only approved players can be marked fully paid.");
    }
    if (prepaid[uid] !== undefined) {
      throw new HttpsError("failed-precondition", `${name} is already fully paid from week ${prepaid[uid]}.`);
    }
    const weeks: WeekState[] = weeksSnap.docs.map((d) => ({
      week: Number(d.get("week")),
      status: d.get("status") as WeekStatus,
      payments: (d.get("payments") ?? {}) as Payments,
    }));
    const from = fullPayStart(uid, weeks);
    if (from === null) throw new HttpsError("failed-precondition", "There are no weeks left to cover.");
    tx.set(seasonRef, { prepaid: { [uid]: from }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const weeksCovered = 18 - from + 1;
    audit(tx, admin.uid, "payment.fullyPaid", players.doc(uid), { from, weeksCovered });
    return `${name} is fully paid: weeks ${from}–18 (${weeksCovered} week${weeksCovered === 1 ? "" : "s"}, $${weeksCovered * 100}).`;
  });

  return { ok: true, summary };
});

// ---------- public site status ----------

/**
 * Whenever a player record changes, recount the seats and publish whether
 * sign-up is open. All 12 taken → the sign-up option disappears; a removal
 * opens it again.
 */
export const updateSiteStatus = onDocumentWritten("players/{uid}", async () => {
  await refreshSiteStatus();
});

/** Recounts seats taken and publishes whether sign-up is open. */
async function refreshSiteStatus(): Promise<void> {
  const all = await players.get();
  const taken = seatsTaken(all.docs.map((d) => d.get("status") as PlayerStatus));
  await siteStatusRef.set(
    { seatsTaken: taken, maxPlayers: MAX_PLAYERS, signupsOpen: taken < MAX_PLAYERS, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
