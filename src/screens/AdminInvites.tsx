import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { api, db, errorMessage } from "../firebase.ts";
import { INVITE_TTL_DAYS } from "../../shared/invite.ts";

interface Invitation {
  id: string;
  codeHint: string;
  note: string | null;
  email: string | null;
  createdAt: Timestamp | null;
  expiresAt: Timestamp;
  revoked: boolean;
  usedBy: string | null;
  usedByName: string | null;
}

function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/join/${code}`;
}

function statusOf(inv: Invitation): { text: string; open: boolean } {
  if (inv.usedBy) return { text: `Used by ${inv.usedByName ?? "a player"}`, open: false };
  if (inv.revoked) return { text: "Cancelled", open: false };
  if (inv.expiresAt.toMillis() <= Date.now()) return { text: "Expired", open: false };
  const date = inv.expiresAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: `Open · expires ${date}`, open: true };
}

export default function AdminInvites() {
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string; note: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "invitations"), orderBy("createdAt", "desc")),
        (snap) => setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitation)),
        (err) => setListError(err.message),
      ),
    [],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createInvitation({
        note: note.trim() || undefined,
        email: email.trim() || undefined,
      });
      setCreated({ code: res.code, note: note.trim() });
      setNote("");
      setEmail("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function share(code: string) {
    const url = inviteLink(code);
    const text = "You're invited to Sunday Showdown. NO PAY • NO PLAY • NO OT";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sunday Showdown invite", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* share sheet dismissed */
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeInvitation({ id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <section className="card panel">
        <h2>Invite a player</h2>
        <p>
          Each invite works once and expires after {INVITE_TTL_DAYS} days. Lock it to an email
          address if you want only that person to be able to use it.
        </p>
        <form onSubmit={onCreate} className="stack">
          <label className="field">
            <span className="label">Who's it for (just for you)</span>
            <input
              className="input"
              maxLength={60}
              placeholder="Louie"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Lock to email (optional)</span>
            <input
              className="input"
              type="email"
              placeholder="louie@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn btn-gold" disabled={busy} type="submit">
            {busy ? "Creating…" : "Create invite link"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        {created && (
          <div className="invite-created">
            <p className="label">Invite{created.note ? ` for ${created.note}` : ""}</p>
            <p className="invite-code">{created.code}</p>
            <p className="invite-link">{inviteLink(created.code)}</p>
            <button className="btn" onClick={() => share(created.code)}>
              {copied ? "Link copied" : "Share link"}
            </button>
            <p className="hint">
              Send it now. For security the code isn't stored, so it can't be shown again.
            </p>
          </div>
        )}
      </section>

      <section className="card panel">
        <h2>Invites</h2>
        {listError && <p className="error">{listError}</p>}
        {invites === null && !listError && <p className="hint">Loading…</p>}
        {invites?.length === 0 && <p className="hint">No invites yet.</p>}
        <ul className="invite-list">
          {invites?.map((inv) => {
            const status = statusOf(inv);
            return (
              <li key={inv.id} className={status.open ? "" : "invite-closed"}>
                <div>
                  <p className="invite-who">
                    {inv.note || "Invite"} <span className="hint">…{inv.codeHint}</span>
                  </p>
                  <p className="hint">
                    {status.text}
                    {inv.email ? ` · ${inv.email}` : ""}
                  </p>
                </div>
                {status.open && (
                  <button className="btn btn-ghost btn-small" onClick={() => revoke(inv.id)}>
                    Cancel
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
