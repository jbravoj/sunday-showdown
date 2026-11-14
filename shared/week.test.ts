import { test } from "node:test";
import assert from "node:assert/strict";
import { easternTime, findSundayNightGame, parseScoreboard, scoreboardUrl } from "./schedule.ts";
import { checkWeekOp, isValidWeek, weekId } from "./week.ts";

// Trimmed from ESPN's real 2026 Week 10 scoreboard (fields we use only).
function ev(id: string, date: string, home: string[], away: string[], network: string) {
  return {
    id,
    date,
    competitions: [
      {
        competitors: [
          { homeAway: "home", team: { displayName: home[0], shortDisplayName: home[1], abbreviation: home[2] } },
          { homeAway: "away", team: { displayName: away[0], shortDisplayName: away[1], abbreviation: away[2] } },
        ],
        broadcasts: [{ names: [network] }],
      },
    ],
  };
}
const WEEK10 = {
  events: [
    ev("401873052", "2026-11-13T01:15Z", ["New York Giants", "Giants", "NYG"], ["Washington Commanders", "Commanders", "WSH"], "Prime Video"),
    ev("401873053", "2026-11-15T14:30Z", ["Detroit Lions", "Lions", "DET"], ["New England Patriots", "Patriots", "NE"], "Fox"),
    ev("401873063", "2026-11-15T21:25Z", ["Dallas Cowboys", "Cowboys", "DAL"], ["San Francisco 49ers", "49ers", "SF"], "Fox"),
    ev("401873064", "2026-11-16T01:20Z", ["Cincinnati Bengals", "Bengals", "CIN"], ["Pittsburgh Steelers", "Steelers", "PIT"], "NBC"),
    ev("401873065", "2026-11-17T01:15Z", ["Baltimore Ravens", "Ravens", "BAL"], ["Los Angeles Chargers", "Chargers", "LAC"], "ESPN"),
  ],
};

test("parses games with home/away teams and networks", () => {
  const games = parseScoreboard(WEEK10);
  assert.equal(games.length, 5);
  assert.deepEqual(games[3].home, { name: "Cincinnati Bengals", short: "Bengals", abbr: "CIN" });
  assert.equal(games[3].away.short, "Steelers");
  assert.equal(games[3].kickoff, "2026-11-16T01:20:00.000Z");
  assert.deepEqual(games[3].networks, ["NBC"]);
});

test("Sunday night game is Steelers at Bengals (not TNF, the London game, late window or MNF)", () => {
  const g = findSundayNightGame(parseScoreboard(WEEK10));
  assert.equal(g?.id, "401873064");
  assert.equal(g?.home.short, "Bengals");
});

test("Eastern time handles the UTC date rollover", () => {
  assert.deepEqual(easternTime("2026-11-16T01:20:00Z"), { weekday: "Sun", hour: 20 });
  // Early in the season it's daylight time: 00:20Z Monday = 8:20 PM Sunday EDT.
  assert.deepEqual(easternTime("2026-09-14T00:20:00Z"), { weekday: "Sun", hour: 20 });
});

test("no Sunday night game (or empty/junk feed) gives null", () => {
  assert.equal(findSundayNightGame(parseScoreboard({ events: WEEK10.events.slice(0, 3) })), null);
  assert.deepEqual(parseScoreboard(null), []);
  assert.deepEqual(parseScoreboard({ events: [{ id: 1 }, { id: "x", date: "nope", competitions: [] }] }), []);
});

test("prefers NBC when two games qualify", () => {
  const games = parseScoreboard({
    events: [
      ev("a", "2026-11-16T01:00Z", ["A", "A", "A"], ["B", "B", "B"], "Fox"),
      ev("b", "2026-11-16T01:20Z", ["C", "C", "C"], ["D", "D", "D"], "NBC"),
    ],
  });
  assert.equal(findSundayNightGame(games)?.id, "b");
});

test("scoreboard url", () => {
  assert.equal(
    scoreboardUrl("2027", 3),
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=3&dates=2027",
  );
});

test("week ids and range", () => {
  assert.equal(weekId(1), "w01");
  assert.equal(weekId(18), "w18");
  assert.ok(isValidWeek(1) && isValidWeek(18));
  assert.ok(!isValidWeek(0) && !isValidWeek(19) && !isValidWeek(2.5) && !isValidWeek("3"));
});

test("week status transitions", () => {
  assert.ok(checkWeekOp(null, "setMatchup").ok);
  assert.ok(checkWeekOp("draft", "setMatchup").ok);
  assert.ok(checkWeekOp("open", "setMatchup").ok);
  assert.ok(!checkWeekOp("locked", "setMatchup").ok);

  assert.ok(!checkWeekOp(null, "publish").ok);
  assert.ok(checkWeekOp("draft", "publish").ok);
  assert.ok(!checkWeekOp("open", "publish").ok);

  assert.ok(!checkWeekOp("draft", "lock").ok);
  assert.ok(checkWeekOp("open", "lock").ok);
  assert.ok(!checkWeekOp("locked", "lock").ok);

  assert.ok(checkWeekOp("draft", "delete").ok);
  assert.ok(checkWeekOp("open", "delete").ok);
  assert.ok(!checkWeekOp("locked", "delete").ok);
  assert.ok(!checkWeekOp(null, "delete").ok);
});
