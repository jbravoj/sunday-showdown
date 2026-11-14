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
  normalizeSquares,
  renameSeat,
  vacate,
  type SquareOp,
} from "../../shared/season.ts";
import { shuffleDigits } from "../../shared/game.ts";
import { findSundayNightGame, parseScoreboard, scoreboardUrl, type Team } from "../../shared/schedule.ts";
import { checkWeekOp, isValidWeek, weekId, type WeekOp, type WeekStatus } from "../../shared/week.ts";

initializeApp();
// invoker "public": callable functions must be reachable from the site; each
// one checks the caller's sign-in and admin claim itself.
setGlobalOptions({ region: "us-central1", maxInstances: 5, invoker: "public" });

const db = getFirestore();
const invitations = db.collection("invitations");
const players = db.collection("players");
const auditLog = db.collection("auditLog");
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

/** Admin creates a one-time invite. Returns the code once; only its hash is stored. */
export const createInvitation = onCall(async (req) => {
  const admin = requireAdmin(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const note = optionalStr(data.note, "Note", 60);
  const emailRaw = optionalStr(data.email, "Email", 254);
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "That email address doesn't look right.");
  }

  const code = generateInviteCode(randomInt);
  const ref = invitations.doc(inviteDocId(code));
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);

  await db.runTransaction(async (tx) => {
    tx.create(ref, {
      codeHint: code.slice(-3),
      note,
      email,
      createdBy: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      revoked: false,
      revokedAt: null,
      usedBy: null,
      usedByName: null,
      usedAt: null,
    });
    audit(tx, admin.uid, "invitation.create", ref, { note, email });
  });

  return { id: ref.id, code, expiresAtMs: expiresAt.toMillis() };
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
 * A signed-in player redeems an invite code and picks the name for their
 * square. Creates their player record as "pending" (admin approves in Phase 3).
 */
export const redeemInvitation = onCall(async (req) => {
  const caller = requireUser(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const code = normalizeInviteCode(str(data.code, "Invite code", 40));
  if (code === null) throw new HttpsError("invalid-argument", "That invite code isn't valid.");
  const nameCheck = validateDisplayName(str(data.displayName, "Name", 100));
  if (!nameCheck.ok) throw new HttpsError("invalid-argument", nameCheck.error);
  const displayName = nameCheck.name;

  const inviteRef = invitations.doc(inviteDocId(code));
  const playerRef = players.doc(caller.uid);

  await db.runTransaction(async (tx) => {
    const [inviteSnap, playerSnap, allPlayers] = await Promise.all([
      tx.get(inviteRef),
      tx.get(playerRef),
      tx.get(players),
    ]);

    if (!inviteSnap.exists) throw new HttpsError("not-found", "That invite code isn't valid.");

    if (playerSnap.exists) {
      // Retrying after a dropped connection: already done.
      if (inviteSnap.get("usedBy") === caller.uid) return;
      const status = playerSnap.get("status") as PlayerStatus;
      throw new HttpsError(
        "already-exists",
        status === "removed"
          ? "This account was removed from the board. Talk to the admin."
          : "You're already registered.",
      );
    }

    const lockedEmail = (inviteSnap.get("email") as string | null) ?? null;
    // An email-locked invite only counts an address the player has proven they own.
    if (lockedEmail !== null && !caller.emailVerified) {
      throw new HttpsError(
        "failed-precondition",
        "This invite is locked to an email address. Verify your email first: use the link we sent you, then try again.",
      );
    }
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
    audit(tx, caller.uid, "player.register", playerRef, { displayName });
  });

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

// ---------- admin: weekly boards ----------

function teamArg(value: unknown, field: string): Team {
  const name = str(value, field, 40).trim();
  if (!name) throw new HttpsError("invalid-argument", `${field} is required.`);
  const short = name.split(" ").pop() ?? name;
  return { name, short, abbr: "" };
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
    // lock: draw numbers on the server and freeze the squares as they are right now.
    const topDigits = shuffleDigits(randomInt);
    const leftDigits = shuffleDigits(randomInt);
    const squares = normalizeSquares(season.get("squares"));
    tx.update(ref, {
      status: "locked",
      topDigits,
      leftDigits,
      squares,
      lockedAt: FieldValue.serverTimestamp(),
      lockedBy: admin.uid,
    });
    audit(tx, admin.uid, "week.lock", ref, { week, topDigits, leftDigits });
    return `Week ${week} is locked and the numbers are drawn.`;
  });

  return { ok: true, summary };
});
