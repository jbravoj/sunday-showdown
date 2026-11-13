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

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

const db = getFirestore();
const invitations = db.collection("invitations");
const players = db.collection("players");
const auditLog = db.collection("auditLog");

// ---------- helpers ----------

/** Invitations are stored under a hash of the code so the database never holds a usable code. */
function inviteDocId(code: string): string {
  return createHash("sha256").update(`sunday-showdown-invite:${code}`).digest("hex");
}

interface Caller {
  uid: string;
  email: string | null;
  isAdmin: boolean;
}

function requireUser(req: CallableRequest): Caller {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const token = auth.token;
  if (token.email_verified !== true || typeof token.email !== "string") {
    throw new HttpsError("failed-precondition", "Sign in with a verified email address.");
  }
  return { uid: auth.uid, email: token.email.toLowerCase(), isAdmin: token.admin === true };
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

    const check = checkInvitation(
      {
        expiresAtMs: (inviteSnap.get("expiresAt") as Timestamp).toMillis(),
        revoked: inviteSnap.get("revoked") === true,
        usedBy: (inviteSnap.get("usedBy") as string | null) ?? null,
        email: (inviteSnap.get("email") as string | null) ?? null,
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
