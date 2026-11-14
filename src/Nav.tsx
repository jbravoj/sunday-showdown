import { useState, type ReactNode } from "react";
import { navigate, signOut } from "./session.ts";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  board: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </Icon>
  ),
  results: (
    <Icon>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </Icon>
  ),
  rules: (
    <Icon>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </Icon>
  ),
  players: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Icon>
  ),
  invites: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Icon>
  ),
  menu: (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
};

interface Tab {
  path: string;
  label: string;
  icon: string;
}

const PLAYER_TABS: Tab[] = [
  { path: "/", label: "Board", icon: "board" },
  { path: "/results", label: "Results", icon: "results" },
  { path: "/rules", label: "Rules", icon: "rules" },
];

const ADMIN_TAB: Tab = { path: "/weeks", label: "Admin", icon: "players" };

/** Admin pages, reached from the one Admin tab. */
export const ADMIN_PAGES = [
  { path: "/weeks", label: "Weeks" },
  { path: "/players", label: "Players" },
  { path: "/invites", label: "Invites" },
];

export function isAdminRoute(route: string): boolean {
  return ADMIN_PAGES.some((p) => p.path === route);
}

/** Segmented control across the top of every admin page. */
export function AdminSubnav({ route }: { route: string }) {
  return (
    <nav className="subnav" aria-label="Admin">
      {ADMIN_PAGES.map((p) => (
        <a
          key={p.path}
          href={`#${p.path}`}
          className={route === p.path ? "subnav-item subnav-active" : "subnav-item"}
          aria-current={route === p.path ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(p.path);
          }}
        >
          {p.label}
        </a>
      ))}
    </nav>
  );
}

/** Wordmark on the left; when signed in, a menu button with the account and Sign out. */
export function TopBar(props: { signedIn: boolean; name: string | null; email: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <a className="wordmark" href="#/">
        <span className="eyebrow">SNF Squares</span>
        <span className="title">
          Sunday <span>Showdown</span>
        </span>
      </a>
      {props.signedIn && (
        <div className="menu">
          <button
            className="icon-btn"
            aria-label="Account menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {ICONS.menu}
          </button>
          {open && (
            <>
              <button
                className="menu-backdrop"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div className="menu-sheet" role="menu">
                {props.name && <p className="menu-name">{props.name}</p>}
                {props.email && <p className="hint">{props.email}</p>}
                <button
                  className="btn btn-ghost"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

/** Thumb-reach tab bar fixed to the bottom of the screen. */
export function TabBar({ route, isAdmin }: { route: string; isAdmin: boolean }) {
  const tabs = isAdmin ? [...PLAYER_TABS, ADMIN_TAB] : PLAYER_TABS;
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tab) => {
          const active = tab === ADMIN_TAB ? isAdminRoute(route) : route === tab.path;
          return (
            <a
              key={tab.path}
              href={`#${tab.path}`}
              className={active ? "tab tab-active" : "tab"}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(tab.path);
              }}
            >
              {ICONS[tab.icon]}
              <span>{tab.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
