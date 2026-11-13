import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onIdTokenChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase.ts";
import { normalizeInviteCode, type PlayerStatus } from "../shared/invite.ts";

// ---------- local storage (wrapped: storage can throw in private modes) ----------

const EMAIL_KEY = "ss.emailForSignIn";
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

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

/** Emails a one-tap sign-in link. No passwords to forget. */
export async function sendEmailLink(email: string): Promise<void> {
  const url = window.location.origin + window.location.pathname;
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  save(EMAIL_KEY, email);
}

/** True when the page was opened from a sign-in email. */
export function isEmailLinkLanding(): boolean {
  return isSignInWithEmailLink(auth, window.location.href);
}

/** Email saved when the link was requested on this device, if any. */
export function emailForLink(): string | null {
  return load(EMAIL_KEY);
}

export async function completeEmailLink(email: string): Promise<void> {
  await signInWithEmailLink(auth, email, window.location.href);
  save(EMAIL_KEY, null);
  // Strip the one-time sign-in parameters from the address bar.
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
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
