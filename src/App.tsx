import { useAuth, usePlayer, useRoute } from "./session.ts";
import { TabBar, TopBar } from "./Nav.tsx";
import { RULES_VERSION } from "../shared/rules.ts";
import AdminInvites from "./screens/AdminInvites.tsx";
import AdminPlayers from "./screens/AdminPlayers.tsx";
import Home from "./screens/Home.tsx";
import Join from "./screens/Join.tsx";
import Pending from "./screens/Pending.tsx";
import Rules, { RulesList } from "./screens/Rules.tsx";
import SignIn from "./screens/SignIn.tsx";

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
  } else if (route === "/rules") {
    screen = (
      <section className="card panel">
        <h2>House rules</h2>
        <p>You agreed to these when you joined.</p>
        <RulesList />
      </section>
    );
  } else if (route === "/results") {
    screen = (
      <section className="card panel">
        <h2>Results</h2>
        <p>Every week's winner and rollover will be listed here once the 2027 season starts.</p>
      </section>
    );
  } else {
    screen = <Home />;
  }

  return (
    <div className={auth.user ? "page page-tabs" : "page"}>
      <TopBar
        signedIn={auth.user !== null}
        name={player?.displayName ?? null}
        email={auth.user?.email ?? null}
      />
      {auth.user && <p className="motto">NO PAY • NO PLAY • NO OT</p>}

      <main>{screen}</main>

      {auth.user && <TabBar route={route} isAdmin={auth.isAdmin} />}
    </div>
  );
}
