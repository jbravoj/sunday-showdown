import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { collection, doc, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase.ts";
import { normalizeInviteCode, type PlayerStatus } from "../shared/invite.ts";
import { CURRENT_SEASON, normalizeSquares, type Seat } from "../shared/season.ts";
import type { Team } from "../shared/schedule.ts";
import type { WeekStatus } from "../shared/week.ts";
import type { PrizeBreakdown } from "../shared/game.ts";

// ---------- local storage (wrapped: storage can throw in private modes) ----------

const CODE_KEY = "ss.inviteCode";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** The invite code from a #/join/CODE link, kept across the sign-in round trip. */
export function getSavedInviteCode(): string | null {
  return load(CODE_KEY);
}
export function clearSavedInviteCode(): void {
  save(CODE_KEY, null);
}

// ---------- hash routing ----------

/** Current route, e.g. "/", "/invites". Captures #/join/CODE links on the way. */
export function useRoute(): string {
  const read = () => {
    const path = window.location.hash.replace(/^#/, "") || "/";
    const join = path.match(/^\/join\/([^/?]+)/);
    if (join) {
      const code = normalizeInviteCode(decodeURIComponent(join[1]));
      if (code) save(CODE_KEY, code);
      return "/join";
    }
    return path;
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

// ---------- auth ----------

export interface AuthState {
  loading: boolean;
  user: User | null;
  isAdmin: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, isAdmin: false });
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) {
          setState({ loading: false, user: null, isAdmin: false });
          return;
        }
        const token = await user.getIdTokenResult();
        setState({ loading: false, user, isAdmin: token.claims.admin === true });
      }),
    [],
  );
  return state;
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

/** Creates the account and emails a verification link (needed only for email-locked invites). */
export async function createAccount(email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(cred.user);
  } catch {
    /* not fatal: they can still join with an unlocked invite */
  }
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** Picks up a just-verified email before calling the server. */
export async function refreshUser(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await user.reload();
  await user.getIdToken(true);
}

/** Firebase auth error codes, in plain words. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is wrong.";
    case "auth/email-already-in-use":
      return "There's already an account with that email. Sign in instead.";
    case "auth/weak-password":
      return "Use a password of at least 8 characters.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection.";
    default:
      return err instanceof Error ? err.message.replace(/^Firebase:\s*/, "") : "Something went wrong.";
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
  navigate("/");
}

// ---------- player record ----------

export interface Player {
  displayName: string;
  email: string;
  status: PlayerStatus;
  rulesVersion: string | null;
  joinedAt: Timestamp | null;
}

export type PlayerState =
  | { loading: true }
  | { loading: false; player: Player | null; error: string | null };

/** Live view of players/{uid}. */
export function usePlayer(uid: string | null): PlayerState {
  const [state, setState] = useState<PlayerState>({ loading: true });
  useEffect(() => {
    if (!uid) {
      setState({ loading: false, player: null, error: null });
      return;
    }
    setState({ loading: true });
    return onSnapshot(
      doc(db, "players", uid),
      (snap) =>
        setState({
          loading: false,
          player: snap.exists() ? (snap.data() as Player) : null,
          error: null,
        }),
      (err) => setState({ loading: false, player: null, error: err.message }),
    );
  }, [uid]);
  return state;
}

// ---------- season squares ----------

export type SeasonState =
  | { loading: true }
  | { loading: false; squares: Record<string, Seat | null>; error: string | null };

/** Live view of the current season's squares. Only call for approved players or the admin. */
export function useSeason(enabled: boolean): SeasonState {
  const [state, setState] = useState<SeasonState>({ loading: true });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "seasons", CURRENT_SEASON),
      (snap) =>
        setState({
          loading: false,
          squares: normalizeSquares(snap.exists() ? snap.get("squares") : null),
          error: null,
        }),
      (err) => setState({ loading: false, squares: normalizeSquares(null), error: err.message }),
    );
  }, [enabled]);
  return state;
}

// ---------- weekly boards ----------

export interface WeekBoard {
  id: string;
  week: number;
  status: WeekStatus;
  home: Team;
  away: Team;
  kickoff: Timestamp;
  source: string;
  /** Drawn at lock; null before. */
  topDigits: number[] | null;
  leftDigits: number[] | null;
  /** Who sat where when the board locked; null before. */
  squares: Record<string, Seat | null> | null;
  /** uid → paid, set by the admin until the board locks. */
  payments?: Record<string, boolean>;
  /** Frozen at lock. */
  paidSquareIds?: string[];
  prize?: PrizeBreakdown;
}

export type WeeksState =
  | { loading: true }
  | { loading: false; weeks: WeekBoard[]; error: string | null };

/**
 * Live list of this season's weekly boards, sorted by week. The admin sees
 * drafts too; players only see published boards.
 */
export function useWeeks(includeDrafts: boolean): WeeksState {
  const [state, setState] = useState<WeeksState>({ loading: true });
  useEffect(() => {
    const col = collection(db, "seasons", CURRENT_SEASON, "weeks");
    const q = includeDrafts ? col : query(col, where("status", "in", ["open", "locked"]));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          loading: false,
          error: null,
          weeks: snap.docs
            .map((d) => {
              const w = d.data();
              return {
                ...(w as Omit<WeekBoard, "id" | "squares">),
                id: d.id,
                squares: w.squares ? normalizeSquares(w.squares) : null,
              };
            })
            .sort((a, b) => a.week - b.week),
        }),
      (err) => setState({ loading: false, weeks: [], error: err.message }),
    );
  }, [includeDrafts]);
  return state;
}

/** "Sun, Nov 15 · 7:20 PM" in the viewer's own time zone. */
export function kickoffLabel(kickoff: Timestamp): string {
  const d = kickoff.toDate();
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${day} · ${time}`;
}
