import type { Layout } from "../shared/game.ts";

interface BoardProps {
  layout: Layout;
  topDigits: readonly number[];
  leftDigits: readonly number[];
  topTeam: string;
  leftTeam: string;
  /** Square to highlight as the winner, if any. */
  winnerSquareId?: string | null;
  /** Squares to mark NOT PAID. */
  unpaidSquareIds?: readonly string[];
}

/** Splits "22 Adam" into ["22", "Adam"]. */
function splitLabel(label: string): [string, string] {
  const i = label.indexOf(" ");
  return i === -1 ? ["", label] : [label.slice(0, i), label.slice(i + 1)];
}

export default function Board(props: BoardProps) {
  const { layout, topDigits, leftDigits, winnerSquareId, unpaidSquareIds = [] } = props;

  // One tile per 2x2 block: the player's square, or a black block.
  const tiles = [];
  for (let br = 0; br < 5; br++) {
    for (let bc = 0; bc < 5; bc++) {
      const square = layout.find((s) =>
        s.cells.some((c) => c.row === br * 2 && c.col === bc * 2),
      );
      const style = { gridRow: `${2 + br * 2} / span 2`, gridColumn: `${2 + bc * 2} / span 2` };
      if (!square) {
        tiles.push(<div key={`b${br}${bc}`} className="tile tile-black" style={style} />);
        continue;
      }
      const [num, name] = splitLabel(square.label);
      const isWinner = square.id === winnerSquareId;
      const isUnpaid = unpaidSquareIds.includes(square.id);
      tiles.push(
        <div
          key={square.id}
          className={`tile tile-player${isWinner ? " tile-winner" : ""}${isUnpaid ? " tile-unpaid" : ""}`}
          style={style}
        >
          <span className="tile-num">{num}.</span>
          <span className="tile-name">{name}</span>
          {isUnpaid && <span className="tile-flag">NOT PAID</span>}
          {isWinner && <span className="tile-flag tile-flag-win">WINNER</span>}
        </div>,
      );
    }
  }

  return (
    <div className="board-wrap">
      <div className="team-top">{props.topTeam}</div>
      <div className="board-row">
        <div className="team-left">{props.leftTeam}</div>
        <div className="board" role="grid" aria-label="Squares board">
          <div className="corner" />
          {topDigits.map((d, i) => (
            <div key={`t${i}`} className="digit" style={{ gridRow: 1, gridColumn: 2 + i }}>
              {d}
            </div>
          ))}
          {leftDigits.map((d, i) => (
            <div key={`l${i}`} className="digit" style={{ gridRow: 2 + i, gridColumn: 1 }}>
              {d}
            </div>
          ))}
          {tiles}
        </div>
      </div>
    </div>
  );
}
