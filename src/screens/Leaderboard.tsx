import { formatCents } from "../../shared/game.ts";
import { buildLeaderboard, type Standing } from "../../shared/scoring.ts";
import { CURRENT_SEASON, squareNumber } from "../../shared/season.ts";
import { useSeason, useWeeks, type WeekBoard } from "../session.ts";

/**
 * Season leaderboard: totals, a podium for the top three money winners,
 * everyone's standings, and every week's result.
 */
export default function Leaderboard({ uid }: { uid: string }) {
  const season = useSeason(true);
  const weeksState = useWeeks(false);
  if (season.loading || weeksState.loading) return <p className="coming">Loading…</p>;
  if (season.error) return <p className="error">{season.error}</p>;

  const weeks = weeksState.weeks;
  const lb = buildLeaderboard(season.squares, weeks, season.prepaid);
  const podium = lb.standings.filter((s) => s.rank !== null).slice(0, 3);

  return (
    <div className="lb">
      <header className="lb-head">
        <div>
          <h1 className="lb-title">Leaderboard</h1>
          <p className="lb-sub">
            {CURRENT_SEASON} season · {lb.throughWeek ? `through week ${lb.throughWeek}` : "no results yet"}
          </p>
        </div>
        <div className="lb-stats">
          <Stat label="Paid out" value={formatCents(lb.paidOutCents)} />
          <Stat label="Rollovers" value={String(lb.rollovers)} />
          <Stat label="Biggest pot" value={formatCents(lb.biggestPotCents)} />
        </div>
      </header>

      {podium.length > 0 ? (
        <div className="lb-podium">
          {/* 2nd, 1st, 3rd so 1st sits in the middle */}
          {[podium[1], podium[0], podium[2]].map((s, i) =>
            s ? <Podium key={s.uid} s={s} place={s.rank!} /> : <div key={`empty-${i}`} />,
          )}
        </div>
      ) : (
        <p className="lb-empty">The podium fills in after the first week is scored.</p>
      )}

      <div className="lb-cols">
        <section className="lb-card">
          <h2>Standings</h2>
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Won</th>
                <th className="lb-wide">Paid in</th>
                <th className="lb-wide">Net</th>
              </tr>
            </thead>
            <tbody>
              {lb.standings.map((s) => (
                <tr key={s.uid} className={s.uid === uid ? "lb-you" : undefined}>
                  <td className="lb-rank">{s.rank ?? "–"}</td>
                  <td>
                    <span className="lb-chip">{s.squareId ? squareNumber(s.squareId) : "–"}</span>
                    <b>{s.name}</b>
                    {s.uid === uid && <span className="lb-you-tag">YOU</span>}
                  </td>
                  <td>{s.wins}</td>
                  <td className="lb-money">{formatCents(s.wonCents)}</td>
                  <td className="lb-wide">{formatCents(s.paidInCents)}</td>
                  <td className={`lb-wide ${s.netCents > 0 ? "lb-pos" : s.netCents < 0 ? "lb-neg" : "lb-zero"}`}>
                    {s.netCents > 0 ? "+" : s.netCents < 0 ? "−" : ""}
                    {formatCents(Math.abs(s.netCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="lb-card">
          <h2>Week by week</h2>
          {weeks.length === 0 && <p className="hint">No weeks posted yet.</p>}
          {[...weeks].reverse().map((w) => (
            <WeekRow key={w.id} w={w} topWeek={lb.throughWeek} />
          ))}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="lb-stat">
      <p className="lb-label">{label}</p>
      <b>{value}</b>
    </div>
  );
}

function Podium({ s, place }: { s: Standing; place: number }) {
  return (
    <div className={`lb-pod lb-pod-${place}`}>
      <span className="lb-medal">{place}</span>
      <p className="lb-pod-name">{s.name}</p>
      <p className="lb-pod-sq">{s.squareId ? `Square ${squareNumber(s.squareId)}` : "Former player"}</p>
      <p className="lb-pod-amt">{formatCents(s.wonCents)}</p>
      <p className="lb-pod-wins">
        {s.wins} win{s.wins === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function WeekRow({ w, topWeek }: { w: WeekBoard; topWeek: number | null }) {
  const r = w.result;
  const matchup = `${w.away.short} @ ${w.home.short}`;
  if (!r) {
    return (
      <div className="lb-week">
        <span className="lb-week-n">{w.week}</span>
        <div>
          <p className="lb-week-t">{matchup}</p>
          <p className="lb-week-m">{w.status === "locked" ? "Locked · waiting on the final" : "Open · this week"}</p>
        </div>
        <span className="lb-week-a lb-label">{w.status === "locked" ? "In play" : "This week"}</span>
      </div>
    );
  }
  const detail = `${matchup} · ${w.away.short} ${r.awayScore}, ${w.home.short} ${r.homeScore} · ${r.homeDigit} / ${r.awayDigit}`;
  if (r.kind === "rollover") {
    return (
      <div className="lb-week lb-week-roll">
        <span className="lb-week-n">{w.week}</span>
        <div>
          <p className="lb-week-t">No winner</p>
          <p className="lb-week-m">{detail}</p>
        </div>
        <span className="lb-week-a">Rolled over</span>
      </div>
    );
  }
  return (
    <div className={`lb-week${w.week === topWeek ? " lb-week-top" : ""}`}>
      <span className="lb-week-n">{w.week}</span>
      <div>
        <p className="lb-week-t">
          {r.name ?? "Winner"}
          {r.squareId ? ` · Sq ${squareNumber(r.squareId)}` : ""}
        </p>
        <p className="lb-week-m">{detail}</p>
      </div>
      <span className="lb-week-a">{formatCents(r.awardedCents)}</span>
    </div>
  );
}
