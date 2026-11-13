import { useState } from "react";
import { api, errorMessage } from "../firebase.ts";
import { RULES, RULES_VERSION } from "../../shared/rules.ts";

/** The house rules, read-only. Also shown on the Pending screen. */
export function RulesList() {
  return (
    <div className="rules">
      {RULES.map((section) => (
        <div key={section.title} className="rules-section">
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="hint">Rules version {RULES_VERSION}</p>
    </div>
  );
}

/** Registered player who hasn't accepted the current rules yet. */
export default function Rules({ updated }: { updated: boolean }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api.acceptRules({ version: RULES_VERSION });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card panel">
      <h2>House rules</h2>
      <p>
        {updated
          ? "The rules have changed since you last agreed. Read them and accept to keep playing."
          : "Read these before you take your seat."}
      </p>
      <RulesList />
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I've read the rules and I'm in for the whole season.</span>
      </label>
      <button className="btn btn-primary" disabled={!agreed || busy} onClick={accept}>
        {busy ? "Saving…" : "Accept rules"}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
