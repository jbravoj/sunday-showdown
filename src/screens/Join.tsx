import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../firebase.ts";
import {
  clearSavedInviteCode,
  getSavedInviteCode,
  refreshUser,
  useMyInviteRequest,
  useSiteStatus,
} from "../session.ts";
import {
  DISPLAY_NAME_MAX,
  normalizeInviteCode,
  validateDisplayName,
} from "../../shared/invite.ts";

/** Signed in, no player record yet: redeem an invite and pick a name. */
export default function Join({ suggestedName, uid }: { suggestedName: string; uid: string }) {
  const [code, setCode] = useState(getSavedInviteCode() ?? "");
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myRequest = useMyInviteRequest(uid);
  const [asking, setAsking] = useState(false);
  const [autoAsked, setAutoAsked] = useState(false);
  const site = useSiteStatus();
  const full = site?.signupsOpen === false;

  async function ask(displayName: string) {
    setAsking(true);
    try {
      await refreshUser();
      await api.requestInvite({ displayName });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAsking(false);
    }
  }

  // Verified and no code in hand: let the admin know right away, using the
  // name they gave at sign-up.
  useEffect(() => {
    if (full || autoAsked || myRequest !== null || getSavedInviteCode()) return;
    const check = validateDisplayName(suggestedName);
    if (!check.ok) return;
    setAutoAsked(true);
    void ask(check.name);
  }, [myRequest, autoAsked, suggestedName, full]);

  async function onRequest() {
    setError(null);
    const nameCheck = validateDisplayName(name);
    if (!nameCheck.ok) {
      setError(`${nameCheck.error} (Fill in the name you want on your square first.)`);
      return;
    }
    await ask(nameCheck.name);
  }

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
      {myRequest?.status === "waiting" && (
        <div className="request-status">
          <p>
            <b>Email verified ✓</b> The admin's been notified. Your invite code will come to{" "}
            {myRequest.email} (check Spam if you don't see it).
          </p>
        </div>
      )}
      {myRequest?.status === "invited" && (
        <div className="request-status">
          <p>
            <b>Your invite is in your email.</b> Open it and tap Claim your seat, or type the code
            below.
          </p>
        </div>
      )}
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
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Joining…" : "Join Sunday Showdown"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {full && myRequest?.status !== "invited" && (
        <div className="request-status">
          <p>
            <b>All {site?.maxPlayers ?? 12} seats are filled.</b> Sign-ups are closed for now. If a seat
            opens up, the admin can send you an invite.
          </p>
        </div>
      )}
      {!full && myRequest === null && !asking && (
        <div className="join-request">
          <p className="hint">No invite code? Ask the admin for one. They'll get a notice right away.</p>
          <button className="btn" type="button" disabled={asking} onClick={onRequest}>
            Request an invite
          </button>
        </div>
      )}
    </section>
  );
}
