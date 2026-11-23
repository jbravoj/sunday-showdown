import { navigate, useInviteRequests, usePendingPlayers } from "./session.ts";

/**
 * Banner across the top of every admin page while someone is waiting on the
 * admin: asked for an invite, or joined and needs approval. Goes away once
 * each one is handled.
 */
export default function AdminAlerts({ route }: { route: string }) {
  const requests = useInviteRequests(true).filter((r) => r.status === "waiting");
  const pending = usePendingPlayers(true);
  if (requests.length === 0 && pending.length === 0) return null;

  const items: { key: string; text: string; action: string; path: string }[] = [
    ...requests.map((r) => ({
      key: `r-${r.uid}`,
      text: `${r.displayName} wants an invite`,
      action: "Send invite",
      path: "/invites",
    })),
    ...pending.map((p) => ({
      key: `p-${p.uid}`,
      text: p.readyToApprove ? `${p.displayName} joined · ready to approve` : `${p.displayName} joined · reading the house rules`,
      action: "Review",
      path: "/players",
    })),
  ];
  const total = items.length;

  return (
    <section className="admin-alert" role="status" aria-live="polite">
      <span className="admin-alert-bell" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="admin-alert-count">{total}</span>
      </span>
      <ul className="admin-alert-list">
        {items.map((it) => (
          <li key={it.key}>
            <span className="admin-alert-text">{it.text}</span>
            {route !== it.path && (
              <a
                className="admin-alert-action"
                href={`#${it.path}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(it.path);
                }}
              >
                {it.action} →
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
