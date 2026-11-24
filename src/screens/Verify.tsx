import { useEffect, useState } from "react";
import { authErrorMessage, checkVerified, sendVerification, signOut } from "../session.ts";

const RESEND_WAIT_S = 60;

/**
 * Signed up but the email isn't verified yet. Nothing else (invite code,
 * invite requests) opens until it is. Checks on its own every few seconds
 * and whenever they come back to the tab, so tapping the link in the email
 * is enough.
 */
export default function Verify({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") checkVerified().catch(() => undefined);
    };
    const timer = window.setInterval(check, 4000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function onCheck() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!(await checkVerified())) {
        setNotice("Not verified yet. Tap the link in the email, then try again.");
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    try {
      await sendVerification();
      setNotice(`Sent again to ${email}.`);
      setWait(RESEND_WAIT_S);
    } catch (err) {
      setError(authErrorMessage(err));
      setWait(RESEND_WAIT_S);
    }
  }

  return (
    <section className="card panel verify">
      <span className="verify-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
      <h2>Verify your email</h2>
      <p>
        We sent a link to <b>{email}</b>. Tap it, then come back here. Once you're verified, the
        admin is notified and sends your invite code.
      </p>
      <p className="hint">
        Not there? Check Spam and Promotions. It comes from
        noreply@sunday-showdown-fe8ec.firebaseapp.com.
      </p>
      <div className="stack">
        <button className="btn btn-primary" disabled={busy} onClick={onCheck}>
          {busy ? "Checking…" : "I've verified it"}
        </button>
        <button className="btn" disabled={wait > 0} onClick={onResend}>
          {wait > 0 ? `Resend email (${wait}s)` : "Resend email"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="auth-links">
        <button className="link" onClick={() => signOut()}>
          Wrong email? Sign out and start over
        </button>
      </div>
    </section>
  );
}
