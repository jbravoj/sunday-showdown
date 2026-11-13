// Permanent season squares. Pure rules, shared by Cloud Functions, the site and tests.
//
// The board is a 5x5 checkerboard of 2x2 blocks. Squares 1-12 are the white
// blocks, numbered left to right, top to bottom. Positions never change; only
// who sits in each square does (the admin can place, swap, clear or draw).

import type { Cell, Layout } from "./game.ts";

/** The season the site is running. */
export const CURRENT_SEASON = "2027";

export const SQUARE_COUNT = 12;

/** "sq01" … "sq12" */
export const SQUARE_IDS: readonly string[] = Array.from(
  { length: SQUARE_COUNT },
  (_, i) => `sq${String(i + 1).padStart(2, "0")}`,
);

/** 1 for "sq01". */
export function squareNumber(squareId: string): number {
  return Number(squareId.slice(2));
}

/** Block (row, col) of each square on the 5x5 block grid. */
export const SQUARE_BLOCKS: Readonly<Record<string, { row: number; col: number }>> = (() => {
  const out: Record<string, { row: number; col: number }> = {};
  let n = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if ((row + col) % 2 === 1) out[SQUARE_IDS[n++]] = { row, col };
    }
  }
  return out;
})();

function cellsOf(squareId: string): Cell[] {
  const { row, col } = SQUARE_BLOCKS[squareId];
  const r = row * 2;
  const c = col * 2;
  return [
    { row: r, col: c },
    { row: r, col: c + 1 },
    { row: r + 1, col: c },
    { row: r + 1, col: c + 1 },
  ];
}

/** Who sits in a square. `null` = open (an open square that comes up rolls the pot over). */
export interface Seat {
  uid: string;
  name: string;
}

export type Squares = Readonly<Record<string, Seat | null>>;

export function emptySquares(): Record<string, Seat | null> {
  return Object.fromEntries(SQUARE_IDS.map((id) => [id, null]));
}

/** Fills in any missing square ids so older or partial records read safely. */
export function normalizeSquares(raw: unknown): Record<string, Seat | null> {
  const out = emptySquares();
  if (raw && typeof raw === "object") {
    for (const id of SQUARE_IDS) {
      const v = (raw as Record<string, unknown>)[id] as Partial<Seat> | null | undefined;
      if (v && typeof v.uid === "string" && typeof v.name === "string") {
        out[id] = { uid: v.uid, name: v.name };
      }
    }
  }
  return out;
}

/** The square a player holds, if any. */
export function squareOf(squares: Squares, uid: string): string | null {
  return SQUARE_IDS.find((id) => squares[id]?.uid === uid) ?? null;
}

/** Board layout for the game rules: labels like "7 Louie", or "7 Open". */
export function seasonLayout(squares: Squares): Layout {
  return SQUARE_IDS.map((id) => ({
    id,
    label: `${squareNumber(id)} ${squares[id]?.name ?? "Open"}`,
    cells: cellsOf(id),
  }));
}

// ---------- admin operations ----------

export type SquareOp =
  /** Put a player in a square. If they already hold another square, the two squares swap. */
  | { op: "place"; squareId: string; uid: string }
  /** Empty a square. */
  | { op: "clear"; squareId: string }
  /** Fill every open square at random with approved players who don't have one. */
  | { op: "draw" };

export type OpResult =
  | { ok: true; squares: Record<string, Seat | null>; summary: string }
  | { ok: false; error: string };

/**
 * Applies an admin operation. `approved` is every approved player (uid → name).
 * `randomInt(n)` must return a uniformly random integer in [0, n); on the
 * server this is crypto.randomInt.
 */
export function applySquareOp(
  current: Squares,
  op: SquareOp,
  approved: ReadonlyMap<string, string>,
  randomInt: (maxExclusive: number) => number,
): OpResult {
  const squares = { ...normalizeSquares(current) };

  if (op.op === "draw") {
    const open = SQUARE_IDS.filter((id) => squares[id] === null);
    const seated = new Set(SQUARE_IDS.map((id) => squares[id]?.uid).filter(Boolean));
    const waiting = [...approved.keys()].filter((uid) => !seated.has(uid)).sort();
    if (open.length === 0) return { ok: false, error: "Every square is already filled." };
    if (waiting.length === 0) return { ok: false, error: "Every approved player already has a square." };
    // Fisher-Yates shuffle of the open squares, then seat players in order.
    for (let i = open.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      if (!Number.isInteger(j) || j < 0 || j > i) throw new Error(`randomInt(${i + 1}) returned ${j}`);
      [open[i], open[j]] = [open[j], open[i]];
    }
    const placed = Math.min(open.length, waiting.length);
    for (let k = 0; k < placed; k++) {
      squares[open[k]] = { uid: waiting[k], name: approved.get(waiting[k])! };
    }
    return { ok: true, squares, summary: `Drew ${placed} player${placed === 1 ? "" : "s"} into open squares.` };
  }

  if (!SQUARE_IDS.includes(op.squareId)) return { ok: false, error: "Unknown square." };
  const n = squareNumber(op.squareId);

  if (op.op === "clear") {
    const seat = squares[op.squareId];
    if (seat === null) return { ok: false, error: `Square ${n} is already open.` };
    squares[op.squareId] = null;
    return { ok: true, squares, summary: `Cleared square ${n} (was ${seat.name}).` };
  }

  // place
  const name = approved.get(op.uid);
  if (name === undefined) return { ok: false, error: "Only approved players can have a square." };
  const target = squares[op.squareId];
  if (target?.uid === op.uid) return { ok: false, error: `${name} is already in square ${n}.` };
  const from = squareOf(squares, op.uid);
  squares[op.squareId] = { uid: op.uid, name };
  if (from !== null) {
    // Swap: whoever was in the target square moves to the player's old square.
    squares[from] = target;
    return {
      ok: true,
      squares,
      summary: target
        ? `Swapped ${name} (now ${n}) and ${target.name} (now ${squareNumber(from)}).`
        : `Moved ${name} from square ${squareNumber(from)} to ${n}.`,
    };
  }
  return {
    ok: true,
    squares,
    summary: target ? `Put ${name} in square ${n}; ${target.name} no longer has a square.` : `Put ${name} in square ${n}.`,
  };
}

/** Empties any square held by `uid` (used when a player is removed). */
export function vacate(current: Squares, uid: string): Record<string, Seat | null> {
  const squares = normalizeSquares(current);
  for (const id of SQUARE_IDS) if (squares[id]?.uid === uid) squares[id] = null;
  return squares;
}

/** Updates the name shown on a player's square (used on rename). */
export function renameSeat(current: Squares, uid: string, name: string): Record<string, Seat | null> {
  const squares = normalizeSquares(current);
  for (const id of SQUARE_IDS) if (squares[id]?.uid === uid) squares[id] = { uid, name };
  return squares;
}
