import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../firebase.ts";
import { clearSavedInviteCode, getSavedInviteCode, refreshUser } from "../session.ts";
import {
  DISPLAY_NAME_MAX,
  normalizeInviteCode,
  validateDisplayName,
} from "../../shared/invite.ts";

/** Signed in, no player record yet: redeem an invite and pick a name. */
export default function Join({ suggestedName }: { suggestedName: string }) {
  const [code, setCode] = useState(getSavedInviteCode() ?? "");
  const [name, setName] = useState(suggestedName.split(" ")[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const canonical = normalizeInviteCode(code);
    if (!canonical) {
      setError("Invite codes look like K7QM4-XR9TB.");
      return;
    }
    const nameCheck = validateDisplayName(name);
    if (!nameCheck.ok) {
      setError(nameCheck.error);
      return;
    }
    setBusy(true);
    try {
      await refreshUser();
      await api.redeemInvitation({ code: canonical, displayName: nameCheck.name });
      clearSavedInviteCode();
      // The live player record moves the app on to the rules page.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card panel">
      <h2>Claim your seat</h2>
      <p>Enter your invite code and the name you want on your square.</p>
      <form onSubmit={onSubmit} className="stack">
        <label className="field">
          <span className="label">Invite code</span>
          <input
            className="input input-code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="K7QM4-XR9TB"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="label">Name on your square</span>
          <input
            className="input"
            maxLength={DISPLAY_NAME_MAX * 2}
            placeholder="Too Tall"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <span className="hint">Up to {DISPLAY_NAME_MAX} characters. Emoji welcome.</span>
        </label>
        <button className="btn btn-gold" disabled={busy} type="submit">
          {busy ? "Joining…" : "Join Sunday Showdown"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
