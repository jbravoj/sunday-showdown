import type { Cell, Layout } from "./game.ts";

// The board is a 5x5 checkerboard of 2x2 blocks on the 10x10 grid.
// Each player owns one white block (4 cells) for the whole season,
// matching the group's existing boards. 48 cells can win; 52 are black.

function block(blockRow: number, blockCol: number): Cell[] {
  const r = blockRow * 2;
  const c = blockCol * 2;
  return [
    { row: r, col: c },
    { row: r, col: c + 1 },
    { row: r + 1, col: c },
    { row: r + 1, col: c + 1 },
  ];
}

/** Default 2027 season layout. Square positions never change during a season. */
export const DEFAULT_LAYOUT: Layout = [
  { id: "sq02", label: "2 Gilbert", cells: block(0, 1) },
  { id: "sq04", label: "4 Israel", cells: block(0, 3) },
  { id: "sq06", label: "6 👻", cells: block(1, 0) },
  { id: "sq08", label: "8 Lonzy", cells: block(1, 2) },
  { id: "sq10", label: "10 Too Tall", cells: block(1, 4) },
  { id: "sq12", label: "12 Louie", cells: block(2, 1) },
  { id: "sq14", label: "14 OJ", cells: block(2, 3) },
  { id: "sq16", label: "16 David", cells: block(3, 0) },
  { id: "sq18", label: "18 🐢", cells: block(3, 2) },
  { id: "sq20", label: "20 Diaz", cells: block(3, 4) },
  { id: "sq22", label: "22 Adam", cells: block(4, 1) },
  { id: "sq24", label: "24 Gibby", cells: block(4, 3) },
];
