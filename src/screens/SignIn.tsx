import { useState, type FormEvent } from "react";
import {
  completeEmailLink,
  emailForLink,
  getSavedInviteCode,
  isEmailLinkLanding,
  sendEmailLink,
  signInWithGoogle,
} from "../session.ts";
import { errorMessage } from "../firebase.ts";

export default function SignIn() {
  const landing = isEmailLinkLanding();
  const invited = getSavedInviteCode() !== null;
  const [email, setEmail] = useState(landing ? (emailForLink() ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      const msg = errorMessage(err);
      if (!/popup-closed|cancelled-popup/.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function onEmail(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    if (landing) {
      void run(() => completeEmailLink(value));
    } else {
      void run(async () => {
        await sendEmailLink(value);
        setSentTo(value);
      });
    }
  }

  if (sentTo) {
    return (
      <section className="card panel">
        <h2>Check your email</h2>
        <p>
          We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device to finish
          signing in.
        </p>
        <button className="btn btn-ghost" onClick={() => setSentTo(null)}>
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <section className="card panel">
      {landing ? (
        <>
          <h2>Confirm your email</h2>
          <p>Enter the email address the sign-in link was sent to.</p>
        </>
      ) : (
        <>
          <h2>{invited ? "You're invited" : "Sign in"}</h2>
          <p>
            {invited
              ? "Sign in to claim your seat on the board."
              : "Sunday Showdown is invite-only. Sign in, or open the invite link the admin sent you."}
          </p>
          <button className="btn btn-gold" disabled={busy} onClick={() => run(signInWithGoogle)}>
            Continue with Google
          </button>
          <p className="divider">or get a sign-in link by email</p>
        </>
      )}

      <form onSubmit={onEmail} className="stack">
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
        <button className={landing ? "btn btn-gold" : "btn"} disabled={busy} type="submit">
          {landing ? "Sign in" : "Email me a link"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
