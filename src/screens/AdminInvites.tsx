import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { api, db, errorMessage } from "../firebase.ts";
import { useInviteRequests } from "../session.ts";
import { INVITE_TTL_DAYS } from "../../shared/invite.ts";

interface Invitation {
  id: string;
  codeHint: string;
  note: string | null;
  email: string | null;
  createdAt: Timestamp | null;
  expiresAt: Timestamp;
  revoked: boolean;
  sentTo?: string | null;
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
  const [send, setSend] = useState(true);
  const [lock, setLock] = useState(false);
  const requests = useInviteRequests(true);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string; note: string; emailedTo: string | null; emailFailed: boolean } | null>(null);
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
      const to = email.trim();
      const res = await api.createInvitation({
        note: note.trim() || undefined,
        email: to || undefined,
        send: to !== "" && send,
        lock: to !== "" && lock,
      });
      setCreated({
        code: res.code,
        note: note.trim(),
        emailedTo: res.emailed ? to : null,
        emailFailed: to !== "" && send && !res.emailed,
      });
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

  async function answer(uid: string) {
    setRequestBusy(uid);
    setError(null);
    setCopied(false);
    try {
      const r = requests.find((x) => x.uid === uid);
      const res = await api.createInvitation({ requestUid: uid });
      setCreated({
        code: res.code,
        note: r?.displayName ?? "",
        emailedTo: res.emailed ? (r?.email ?? null) : null,
        emailFailed: !res.emailed,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRequestBusy(null);
    }
  }

  async function dismiss(uid: string) {
    setRequestBusy(uid);
    try {
      await api.dismissInviteRequest({ uid });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRequestBusy(null);
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeInvitation({ id });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const waiting = requests.filter((r) => r.status === "waiting");
  const answered = requests.filter((r) => r.status === "invited");

  return (
    <>
      {requests.length > 0 && (
        <section className="card panel">
          <h2>Asking for an invite</h2>
          <p className="hint">
            They signed up without a code. Send invite emails them a code and link; it isn't locked
            to their email, so they don't need to verify it first.
          </p>
          <ul className="request-list">
            {[...waiting, ...answered].map((r) => (
              <li key={r.uid}>
                <div>
                  <p className="invite-who">{r.displayName}</p>
                  <p className="hint">
                    {r.email}
                    {r.status === "invited" ? " · invite sent, not used yet" : ""}
                  </p>
                </div>
                <div className="request-actions">
                  <button className="btn btn-primary btn-small" disabled={requestBusy === r.uid} onClick={() => answer(r.uid)}>
                    {requestBusy === r.uid ? "Sending…" : r.status === "invited" ? "Send again" : "Send invite"}
                  </button>
                  <button className="btn btn-ghost btn-small" disabled={requestBusy === r.uid} onClick={() => dismiss(r.uid)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card panel">
        <h2>Invite a player</h2>
        <p>
          Each invite works once and expires after {INVITE_TTL_DAYS} days. Add their email and the
          site emails them the code, or leave it blank and share the link yourself.
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
            <span className="label">Their email (optional)</span>
            <input
              className="input"
              type="email"
              placeholder="louie@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {email.trim() !== "" && (
            <>
              <label className="check">
                <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
                Email them the invite
              </label>
              <label className="check">
                <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
                Only this email can use it (they'll have to verify their email first)
              </label>
            </>
          )}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Creating…" : email.trim() && send ? "Create and email invite" : "Create invite link"}
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
            {created.emailedTo && <p className="notice">Emailed to {created.emailedTo} ✓</p>}
            {created.emailFailed && (
              <p className="error">
                The email didn't go out (check the Gmail setup). Share the link yourself instead.
              </p>
            )}
            <p className="hint">
              {created.emailedTo ? "You can also share it yourself. " : "Send it now. "}
              For security the code isn't stored, so it can't be shown again.
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
                    {inv.email ? ` · only ${inv.email}` : ""}
                    {inv.sentTo && !inv.email ? ` · emailed to ${inv.sentTo}` : ""}
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
