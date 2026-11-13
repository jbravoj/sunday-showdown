// The house rules every player must accept before taking a seat.
// Bump RULES_VERSION whenever the wording changes in a way players should
// re-accept; anyone on an older version is sent back to the rules page.

import { CONTRIBUTION_CENTS, computePrize, formatCents } from "./game.ts";
import { MAX_PLAYERS } from "./invite.ts";

export const RULES_VERSION = "2027.1";

export interface RuleSection {
  title: string;
  items: readonly string[];
}

const BUY_IN = formatCents(CONTRIBUTION_CENTS);
const FULL = computePrize(MAX_PLAYERS, 0);

export const RULES: readonly RuleSection[] = [
  {
    title: "The commitment",
    items: [
      `${MAX_PLAYERS} players, one game a week: the Sunday Night Football game.`,
      "You're in for the whole NFL regular season, every week.",
      "Membership is by invitation only and must be approved by the admin.",
    ],
  },
  {
    title: "Your square",
    items: [
      "You get one square (a 2×2 block on the board) for the entire season. It never moves.",
      "The other blocks on the board are black and can't win.",
    ],
  },
  {
    title: "Money",
    items: [
      `Buy-in is ${BUY_IN} per week, paid to the admin before the board locks.`,
      `When all ${MAX_PLAYERS} pay, the winner gets ${formatCents(FULL.prizeCents)}; ${formatCents(FULL.supportCents)} goes to running the site.`,
      "NO PAY • NO PLAY. A square not marked paid when the board locks can't win that week.",
    ],
  },
  {
    title: "Picking the winner",
    items: [
      "Each week the 0–9 numbers on both sides of the board are shuffled at random by the server.",
      "The winning cell is where the last digit of each team's score crosses.",
      "NO OT. Only the score at the end of regulation (4th quarter) counts. Overtime never counts.",
      "If the winning cell lands on a black block or an unpaid square, the whole pot rolls over to next week.",
    ],
  },
  {
    title: "Fair play",
    items: [
      "Boards, payments and results are recorded on the server and logged. Nobody can edit a board after it locks.",
      "The admin's call is final on anything these rules don't cover.",
    ],
  },
];
