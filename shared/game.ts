// Core game rules for Sunday Showdown.
// Pure functions only (no Firebase, no browser APIs) so the same code runs in
// Cloud Functions, in the site, and in tests. All money is integer cents.

/** A position on the 10x10 board. row = index on the left axis, col = index on the top axis. */
export interface Cell {
  row: number;
  col: number;
}

/** One player's permanent square: a label and the board cells it covers. */
export interface Square {
  id: string;
  label: string;
  cells: readonly Cell[];
}

export type Layout = readonly Square[];

export const BOARD_SIZE = 10;
/** Weekly contribution per square: $100. */
export const CONTRIBUTION_CENTS = 10_000;

/** True when `digits` contains each of 0-9 exactly once. */
export function isDigitPermutation(digits: readonly number[]): boolean {
  if (digits.length !== BOARD_SIZE) return false;
  const seen = new Set<number>();
  for (const d of digits) {
    if (!Number.isInteger(d) || d < 0 || d > 9 || seen.has(d)) return false;
    seen.add(d);
  }
  return true;
}

/**
 * Fisher-Yates shuffle of 0-9.
 * `randomInt(n)` must return a uniformly random integer in [0, n).
 * On the server this is backed by crypto.randomInt.
 */
export function shuffleDigits(randomInt: (maxExclusive: number) => number): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`randomInt(${i + 1}) returned ${j}`);
    }
    const tmp = digits[i];
    digits[i] = digits[j];
    digits[j] = tmp;
  }
  return digits;
}

function assertScore(score: number, name: string): void {
  if (!Number.isInteger(score) || score < 0) {
    throw new Error(`${name} must be a non-negative whole number, got ${score}`);
  }
}

/**
 * The winning cell for a game. Scores must be the END-OF-REGULATION scores
 * (after the 4th quarter). Overtime points never count.
 */
export function winningCell(
  topDigits: readonly number[],
  leftDigits: readonly number[],
  topScore: number,
  leftScore: number,
): Cell {
  if (!isDigitPermutation(topDigits)) throw new Error("topDigits is not a permutation of 0-9");
  if (!isDigitPermutation(leftDigits)) throw new Error("leftDigits is not a permutation of 0-9");
  assertScore(topScore, "topScore");
  assertScore(leftScore, "leftScore");
  return {
    row: leftDigits.indexOf(leftScore % 10),
    col: topDigits.indexOf(topScore % 10),
  };
}

/** The square covering `cell`, or null for a black (inactive) cell. */
export function squareAt(layout: Layout, cell: Cell): Square | null {
  for (const square of layout) {
    if (square.cells.some((c) => c.row === cell.row && c.col === cell.col)) return square;
  }
  return null;
}

export interface PrizeBreakdown {
  paidCount: number;
  contributionsCents: number;
  /** 5/6 of contributions, rounded to the nearest cent. */
  prizeCents: number;
  /** The remaining cents (1/6). */
  supportCents: number;
  rolloverInCents: number;
  /** prize + rollover. Support is never taken from the rollover. */
  potCents: number;
}

export function computePrize(paidCount: number, rolloverInCents: number): PrizeBreakdown {
  if (!Number.isInteger(paidCount) || paidCount < 0) throw new Error(`bad paidCount ${paidCount}`);
  if (!Number.isInteger(rolloverInCents) || rolloverInCents < 0) {
    throw new Error(`bad rolloverInCents ${rolloverInCents}`);
  }
  const contributionsCents = paidCount * CONTRIBUTION_CENTS;
  // Round half up in integer math: floor((c * 5 + 3) / 6).
  const prizeCents = Math.floor((contributionsCents * 5 + 3) / 6);
  const supportCents = contributionsCents - prizeCents;
  return {
    paidCount,
    contributionsCents,
    prizeCents,
    supportCents,
    rolloverInCents,
    potCents: prizeCents + rolloverInCents,
  };
}

export type WeekOutcome =
  | {
      kind: "win";
      cell: Cell;
      topDigit: number;
      leftDigit: number;
      squareId: string;
      label: string;
      awardedCents: number;
      rolloverOutCents: 0;
    }
  | {
      kind: "rollover";
      reason: "inactive" | "unpaid";
      cell: Cell;
      topDigit: number;
      leftDigit: number;
      squareId: string | null;
      label: string | null;
      awardedCents: 0;
      rolloverOutCents: number;
    };

export interface ResolveWeekInput {
  layout: Layout;
  topDigits: readonly number[];
  leftDigits: readonly number[];
  /** End-of-regulation score of the team on the top axis. */
  topScore: number;
  /** End-of-regulation score of the team on the left axis. */
  leftScore: number;
  /** Squares marked paid when the board locked. */
  paidSquareIds: readonly string[];
  potCents: number;
}

/** Decide the week: a paid square wins the whole pot, otherwise the whole pot rolls over. */
export function resolveWeek(input: ResolveWeekInput): WeekOutcome {
  const cell = winningCell(input.topDigits, input.leftDigits, input.topScore, input.leftScore);
  const topDigit = input.topScore % 10;
  const leftDigit = input.leftScore % 10;
  const square = squareAt(input.layout, cell);
  if (square && input.paidSquareIds.includes(square.id)) {
    return {
      kind: "win",
      cell,
      topDigit,
      leftDigit,
      squareId: square.id,
      label: square.label,
      awardedCents: input.potCents,
      rolloverOutCents: 0,
    };
  }
  return {
    kind: "rollover",
    reason: square ? "unpaid" : "inactive",
    cell,
    topDigit,
    leftDigit,
    squareId: square ? square.id : null,
    label: square ? square.label : null,
    awardedCents: 0,
    rolloverOutCents: input.potCents,
  };
}

/** "$1,000" / "$916.67" */
export function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = dollars.toLocaleString("en-US");
  return rest === 0 ? `$${whole}` : `$${whole}.${String(rest).padStart(2, "0")}`;
}
