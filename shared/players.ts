// Admin actions on players. Pure rules, shared by Cloud Functions, the site and tests.

import { MAX_PLAYERS, type PlayerStatus } from "./invite.ts";

export type PlayerAction = "approve" | "remove" | "reinstate";

export interface PlayerFacts {
  status: PlayerStatus;
  /** True when they accepted the current rules version. */
  rulesAccepted: boolean;
}

export type ActionCheck =
  | { ok: true; next: PlayerStatus }
  | { ok: false; error: string };

/**
 * What `action` does to a player, given how many seats are taken right now
 * (every player who isn't removed, this one included if they hold a seat).
 */
export function checkPlayerAction(
  player: PlayerFacts,
  action: PlayerAction,
  seatsTaken: number,
): ActionCheck {
  switch (action) {
    case "approve":
      if (player.status === "approved") return { ok: false, error: "Already approved." };
      if (player.status === "removed") {
        return { ok: false, error: "Reinstate this player first." };
      }
      if (!player.rulesAccepted) {
        return { ok: false, error: "They haven't accepted the house rules yet." };
      }
      return { ok: true, next: "approved" };

    case "remove":
      if (player.status === "removed") return { ok: false, error: "Already removed." };
      return { ok: true, next: "removed" };

    case "reinstate":
      if (player.status !== "removed") return { ok: false, error: "Only removed players can be reinstated." };
      if (seatsTaken >= MAX_PLAYERS) {
        return { ok: false, error: `All ${MAX_PLAYERS} seats are taken. Remove someone first.` };
      }
      // Back to the approval queue, so the admin approves them again on purpose.
      return { ok: true, next: "pending" };
  }
}

/** Sort order for the Players page: waiting on you first, then the board, then removed. */
export const STATUS_ORDER: Record<PlayerStatus, number> = { pending: 0, approved: 1, removed: 2 };
