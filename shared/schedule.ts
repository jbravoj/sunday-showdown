// Finding the Sunday Night Football game in ESPN's public NFL scoreboard feed:
// https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=N&dates=YYYY
// Pure parsing only; the Cloud Function does the fetch.

export const REGULAR_SEASON_WEEKS = 18;

export function scoreboardUrl(year: string, week: number): string {
  return `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${year}`;
}

export interface Team {
  /** "Cincinnati Bengals" */
  name: string;
  /** "Bengals" */
  short: string;
  /** "CIN" */
  abbr: string;
}

export interface Game {
  id: string;
  /** ISO kickoff time. */
  kickoff: string;
  home: Team;
  away: Team;
  networks: string[];
}

function team(c: unknown): Team | null {
  const t = (c as { team?: Record<string, unknown> } | null)?.team;
  if (!t || typeof t.displayName !== "string") return null;
  return {
    name: t.displayName,
    short: typeof t.shortDisplayName === "string" ? t.shortDisplayName : t.displayName,
    abbr: typeof t.abbreviation === "string" ? t.abbreviation : "",
  };
}

/** Pulls the games out of a scoreboard response, skipping anything malformed. */
export function parseScoreboard(json: unknown): Game[] {
  const events = (json as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(events)) return [];
  const games: Game[] = [];
  for (const e of events as Record<string, unknown>[]) {
    const comp = (e.competitions as Record<string, unknown>[] | undefined)?.[0];
    const competitors = comp?.competitors as Record<string, unknown>[] | undefined;
    if (typeof e.id !== "string" || typeof e.date !== "string" || !competitors) continue;
    const home = team(competitors.find((c) => c.homeAway === "home"));
    const away = team(competitors.find((c) => c.homeAway === "away"));
    if (!home || !away || Number.isNaN(Date.parse(e.date))) continue;
    const networks = ((comp?.broadcasts as { names?: string[] }[] | undefined) ?? []).flatMap(
      (b) => b.names ?? [],
    );
    games.push({ id: e.id, kickoff: new Date(e.date).toISOString(), home, away, networks });
  }
  return games;
}

/** Weekday and hour of a moment in US Eastern time. */
export function easternTime(iso: string): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? -1),
  };
}

/**
 * The week's Sunday night game: kicks off on a Sunday at 7 PM Eastern or later.
 * If there are several, prefer the one on NBC (the Sunday Night Football network).
 */
export function findSundayNightGame(games: readonly Game[]): Game | null {
  const candidates = games.filter((g) => {
    const { weekday, hour } = easternTime(g.kickoff);
    return weekday === "Sun" && hour >= 19;
  });
  if (candidates.length === 0) return null;
  return candidates.find((g) => g.networks.includes("NBC")) ?? candidates[0];
}
