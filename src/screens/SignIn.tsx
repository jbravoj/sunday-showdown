import { useState, type FormEvent } from "react";
import {
  authErrorMessage,
  createAccount,
  getSavedInviteCode,
  resetPassword,
  signIn,
} from "../session.ts";

type Mode = "signin" | "signup" | "reset";

const MIN_PASSWORD = 8;

export default function SignIn() {
  const invited = getSavedInviteCode() !== null;
  // Someone arriving from an invite link most likely needs a new account.
  const [mode, setMode] = useState<Mode>(invited ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirm("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const addr = email.trim();
    if (mode === "signup") {
      if (password.length < MIN_PASSWORD) {
        setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signin") await signIn(addr, password);
      else if (mode === "signup") await createAccount(addr, password);
      else {
        await resetPassword(addr);
        setNotice(`If there's an account for ${addr}, a reset link is on its way.`);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "reset" ? "Reset password" : mode === "signup" ? "Create your account" : "Sign in";
  const blurb =
    mode === "reset"
      ? "Enter your email and we'll send you a link to set a new password."
      : invited
        ? "You're invited. Create an account (or sign in) to claim your seat."
        : mode === "signup"
          ? "You'll need an invite code from the admin after this."
          : "Sunday Showdown is invite-only. Sign in, or open the invite link the admin sent you.";

  return (
    <section className="card panel">
      <h2>{heading}</h2>
      <p>{blurb}</p>

      <form onSubmit={onSubmit} className="stack">
        <label className="field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        {mode !== "reset" && (
          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        )}

        {mode === "signup" && (
          <label className="field">
            <span className="label">Confirm password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <span className="hint">At least {MIN_PASSWORD} characters.</span>
          </label>
        )}

        <button className="btn btn-gold" disabled={busy} type="submit">
          {busy
            ? "One sec…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Send reset link"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="auth-links">
        {mode === "signin" && (
          <>
            <button className="link" onClick={() => switchTo("signup")}>
              New here? Create an account
            </button>
            <button className="link" onClick={() => switchTo("reset")}>
              Forgot password?
            </button>
          </>
        )}
        {mode !== "signin" && (
          <button className="link" onClick={() => switchTo("signin")}>
            {mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
          </button>
        )}
      </div>
    </section>
  );
}
