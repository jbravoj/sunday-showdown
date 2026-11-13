import { navigate, signOut, useAuth, usePlayer, useRoute } from "./session.ts";
import { RULES_VERSION } from "../shared/rules.ts";
import AdminInvites from "./screens/AdminInvites.tsx";
import AdminPlayers from "./screens/AdminPlayers.tsx";
import Home from "./screens/Home.tsx";
import Join from "./screens/Join.tsx";
import Pending from "./screens/Pending.tsx";
import Rules from "./screens/Rules.tsx";
import SignIn from "./screens/SignIn.tsx";

const ADMIN_TABS = [
  { path: "/", label: "Board" },
  { path: "/players", label: "Players" },
  { path: "/invites", label: "Invites" },
];

export default function App() {
  const route = useRoute();
  const auth = useAuth();
  const playerState = usePlayer(auth.user?.uid ?? null);
  const player = playerState.loading ? null : playerState.player;

  let screen;
  if (auth.loading || (auth.user && playerState.loading)) {
    screen = <p className="coming">Loading…</p>;
  } else if (!auth.user) {
    screen = <SignIn />;
  } else if (route === "/invites" && auth.isAdmin) {
    screen = <AdminInvites />;
  } else if (route === "/players" && auth.isAdmin) {
    screen = <AdminPlayers myUid={auth.user.uid} />;
  } else if (!playerState.loading && playerState.error) {
    screen = <p className="error">{playerState.error}</p>;
  } else if (!player) {
    screen = <Join suggestedName={auth.user.displayName ?? ""} />;
  } else if (player.status === "removed") {
    screen = (
      <section className="card panel">
        <h2>Not on the board</h2>
        <p>This account was removed from Sunday Showdown. Talk to the admin.</p>
      </section>
    );
  } else if (player.rulesVersion !== RULES_VERSION) {
    screen = <Rules updated={player.rulesVersion !== null} />;
  } else if (player.status === "pending") {
    screen = <Pending name={player.displayName} />;
  } else {
    screen = <Home />;
  }

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">Sunday Night Football Squares</p>
        <h1 className="title">
          <a href="#/">
            Sunday <span>Showdown</span>
          </a>
        </h1>
        <p className="motto">NO PAY • NO PLAY • NO OT</p>
      </header>

      {auth.user && (
        <nav className="userbar">
          <span className="userbar-name">{player?.displayName ?? auth.user.email}</span>
          {auth.isAdmin &&
            ADMIN_TABS.map((tab) => (
              <button
                key={tab.path}
                className={`link${route === tab.path ? " link-active" : ""}`}
                onClick={() => navigate(tab.path)}
              >
                {tab.label}
              </button>
            ))}
          <button className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      )}

      <main>{screen}</main>
    </div>
  );
}
