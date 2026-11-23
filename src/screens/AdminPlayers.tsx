import { useEffect, useState } from "react";
import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import { api, db, errorMessage } from "../firebase.ts";
import {
  DISPLAY_NAME_MAX,
  MAX_PLAYERS,
  seatsTaken,
  validateDisplayName,
  type PlayerStatus,
} from "../../shared/invite.ts";
import { STATUS_ORDER, type PlayerAction } from "../../shared/players.ts";
import { RULES_VERSION } from "../../shared/rules.ts";
import AdminSquares from "./AdminSquares.tsx";
import { SeasonBalance } from "./Home.tsx";
import { useSeason, useWeeks } from "../session.ts";
import { fullPayStart, seasonTally } from "../../shared/week.ts";

interface PlayerRow {
  uid: string;
  displayName: string;
  email: string;
  status: PlayerStatus;
  rulesVersion: string | null;
  joinedAt: Timestamp | null;
}

const SECTION_TITLES: Record<PlayerStatus, string> = {
  pending: "Waiting for approval",
  approved: "On the board",
  removed: "Removed",
};

function shortDate(ts: Timestamp | null): string {
  return ts ? ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export default function AdminPlayers({ myUid }: { myUid: string }) {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState<string | null>(null);
  const weeksState = useWeeks(true);
  const season = useSeason(true);
  const weeks = weeksState.loading ? [] : weeksState.weeks;
  const prepaid = season.loading ? {} : season.prepaid;

  useEffect(
    () =>
      onSnapshot(
        collection(db, "players"),
        (snap) =>
          setRows(
            snap.docs
              .map((d) => ({ uid: d.id, ...d.data() }) as PlayerRow)
              .sort(
                (a, b) =>
                  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
                  a.displayName.localeCompare(b.displayName),
              ),
          ),
        (err) => setListError(err.message),
      ),
    [],
  );

  async function run(uid: string, action: () => Promise<unknown>) {
    setBusyUid(uid);
    setError(null);
    setNotice(null);
    setConfirmFull(null);
    try {
      const res = await action();
      const summary = (res as { summary?: string } | undefined)?.summary;
      if (summary) setNotice(summary);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUid(null);
    }
  }

  function act(uid: string, action: PlayerAction) {
    setConfirmRemove(null);
    void run(uid, () => api.setPlayerStatus({ uid, action }));
  }

  function saveName() {
    if (!editing) return;
    const check = validateDisplayName(editing.name);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const { uid } = editing;
    void run(uid, async () => {
      await api.renamePlayer({ uid, displayName: check.name });
      setEditing(null);
    });
  }

  const seats = rows ? seatsTaken(rows.map((r) => r.status)) : 0;
  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <>
      <section className="card panel">
        <div className="players-head">
          <h2>Players</h2>
          <p className="seat-count">
            <strong>{seats}</strong> / {MAX_PLAYERS} seats
          </p>
        </div>
        <p>
          {pendingCount > 0
            ? `${pendingCount} waiting on you. Players must accept the house rules before you can approve them.`
            : "Everyone who redeemed an invite shows up here. Removing a player frees their seat."}
        </p>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {listError && <p className="error">{listError}</p>}
        {rows === null && !listError && <p className="hint">Loading…</p>}
        {rows?.length === 0 && <p className="hint">No players yet. Send some invites.</p>}
      </section>

      {rows && rows.some((r) => r.status === "approved") && (
        <AdminSquares
          approved={rows
            .filter((r) => r.status === "approved")
            .map((r) => ({ uid: r.uid, displayName: r.displayName }))}
        />
      )}

      {(["pending", "approved", "removed"] as const).map((status) => {
        const group = rows?.filter((r) => r.status === status) ?? [];
        if (group.length === 0) return null;
        return (
          <section key={status} className="card panel">
            <h3 className="section-title">
              {SECTION_TITLES[status]} <span className="hint">({group.length})</span>
            </h3>
            <ul className="player-list">
              {group.map((p) => {
                const busy = busyUid === p.uid;
                const rulesOk = p.rulesVersion === RULES_VERSION;
                const isMe = p.uid === myUid;
                return (
                  <li key={p.uid} className={status === "removed" ? "invite-closed" : ""}>
                    <div className="player-info">
                      {editing?.uid === p.uid ? (
                        <form
                          className="rename"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveName();
                          }}
                        >
                          <input
                            className="input"
                            autoFocus
                            maxLength={DISPLAY_NAME_MAX * 2}
                            value={editing.name}
                            onChange={(e) => setEditing({ uid: p.uid, name: e.target.value })}
                          />
                          <button className="btn btn-small btn-primary" disabled={busy} type="submit">
                            Save
                          </button>
                          <button
                            className="btn btn-small btn-ghost"
                            type="button"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <p className="invite-who">
                          {p.displayName}
                          {isMe && <span className="tag">You</span>}
                          {status !== "removed" && (
                            <button
                              className="link link-small"
                              onClick={() => setEditing({ uid: p.uid, name: p.displayName })}
                            >
                              Rename
                            </button>
                          )}
                        </p>
                      )}
                      <p className="hint">
                        {p.email}
                        {p.joinedAt ? ` · joined ${shortDate(p.joinedAt)}` : ""}
                      </p>
                      {status === "pending" && (
                        <p className={rulesOk ? "hint ok" : "hint warn"}>
                          {rulesOk ? "✓ Accepted the rules" : "Hasn't accepted the rules yet"}
                        </p>
                      )}
                      {status === "approved" && !rulesOk && (
                        <p className="hint warn">Needs to accept the updated rules</p>
                      )}
                      {status === "approved" &&
                        (() => {
                          const tally = seasonTally(p.uid, weeks, prepaid);
                          const start = fullPayStart(p.uid, weeks);
                          const covers = start === null ? 0 : 18 - start + 1;
                          return (
                            <div className="player-money">
                              <SeasonBalance
                                paidCents={tally.paidCents}
                                leftCents={tally.leftCents}
                                fullyPaidFrom={tally.fullyPaidFrom}
                              />
                              {tally.fullyPaidFrom !== null ? (
                                <button
                                  className="link link-small"
                                  disabled={busy}
                                  onClick={() => run(p.uid, () => api.markFullyPaid({ uid: p.uid, undo: true }))}
                                >
                                  Undo fully paid
                                </button>
                              ) : start !== null && tally.leftCents > 0 ? (
                                confirmFull === p.uid ? (
                                  <div className="confirm-row">
                                    <button
                                      className="btn btn-small btn-primary"
                                      disabled={busy}
                                      onClick={() => run(p.uid, () => api.markFullyPaid({ uid: p.uid }))}
                                    >
                                      Confirm: weeks {start}–18 (${covers * 100})
                                    </button>
                                    <button className="btn btn-small btn-ghost" onClick={() => setConfirmFull(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="btn btn-small btn-ghost"
                                    disabled={busy}
                                    onClick={() => setConfirmFull(p.uid)}
                                  >
                                    Mark fully paid
                                  </button>
                                )
                              ) : null}
                            </div>
                          );
                        })()}
                    </div>

                    <div className="player-actions">
                      {status === "pending" && (
                        <button
                          className="btn btn-small btn-primary"
                          disabled={busy || !rulesOk}
                          onClick={() => act(p.uid, "approve")}
                        >
                          Approve
                        </button>
                      )}
                      {status !== "removed" &&
                        (confirmRemove === p.uid ? (
                          <>
                            <button
                              className="btn btn-small btn-danger"
                              disabled={busy}
                              onClick={() => act(p.uid, "remove")}
                            >
                              {isMe ? "Remove me" : "Confirm"}
                            </button>
                            <button
                              className="btn btn-small btn-ghost"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-small btn-ghost"
                            disabled={busy}
                            onClick={() => setConfirmRemove(p.uid)}
                          >
                            Remove
                          </button>
                        ))}
                      {status === "removed" && (
                        <button
                          className="btn btn-small"
                          disabled={busy || seats >= MAX_PLAYERS}
                          onClick={() => act(p.uid, "reinstate")}
                        >
                          Reinstate
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
