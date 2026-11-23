// "Game ticket" share image for a locked week: a 1080x1080 JPG drawn in the
// browser with the week's team colors and the official team logos from the
// NFL schedule feed. Admin → Weeks → Share image.

import { formatCents } from "../shared/game.ts";
import { SQUARE_IDS, seasonLayout, squareNumber, type Seat } from "../shared/season.ts";
import type { Team } from "../shared/schedule.ts";

export interface TicketData {
  week: number;
  kickoff: Date;
  home: Team;
  away: Team;
  squares: Record<string, Seat | null>;
  topDigits: number[];
  leftDigits: number[];
  potCents: number;
  paidCount: number;
  seatedCount: number;
  unpaidSquareIds: string[];
  /** Once the game is final (Phase 7). */
  winner?: { squareId: string; amountCents: number } | null;
}

const SIZE = 1080;
const INK = "#0E0D2A";
const ORANGE = "#FF7A1A";
const PEACH = "#FFB27A";
const MUTED = "#A3ABD6";
const DISPLAY = '"Exo 2", "Arial Narrow", sans-serif';
const BODY = 'Inter, system-ui, sans-serif';

// ---------- helpers ----------

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** A team color that shows up on a dark ticket: the main color, or the alternate if the main is near-black. */
export function displayColor(team: Team, fallback: string): string {
  const options = [team.color, team.alt].filter((c): c is string => !!c);
  return options.find((c) => luminance(c) > 0.06) ?? fallback;
}

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text with letter spacing (canvas letterSpacing isn't everywhere yet). */
function spaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center" = "left",
) {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - width / 2 : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxPx: number, maxWidth: number) {
  let px = maxPx;
  ctx.font = font(px);
  while (px > 10 && ctx.measureText(text).width > maxWidth) {
    px -= 1;
    ctx.font = font(px);
  }
  return px;
}

function dashed(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** Official logo, or a team-color disc with the abbreviation if the logo can't load. */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  team: Team,
  color: string,
  cx: number,
  cy: number,
  size: number,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (img) {
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = luminance(color) > 0.35 ? "#111" : "#fff";
    ctx.font = `italic 900 ${Math.round(size / 3.2)}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(team.abbr || team.short.slice(0, 3).toUpperCase(), cx, cy + 2);
  }
  ctx.restore();
}

// ---------- render ----------

export async function renderTicket(data: TicketData): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`italic 900 44px "Exo 2"`),
    document.fonts.load(`italic 800 20px "Exo 2"`),
    document.fonts.load(`800 16px Inter`),
    document.fonts.load(`600 16px Inter`),
  ]).catch(() => undefined);

  const [homeLogo, awayLogo] = await Promise.all([loadImage(data.home.logo), loadImage(data.away.logo)]);
  const homeColor = displayColor(data.home, ORANGE);
  const awayColor = displayColor(data.away, "#3D8BFF");

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // Diagonal team-color split (home top-left, away bottom-right) with a dark band between.
  ctx.fillStyle = homeColor;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = awayColor;
  ctx.beginPath();
  ctx.moveTo(SIZE, 0);
  ctx.lineTo(SIZE, SIZE);
  ctx.lineTo(0, SIZE);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#0B0B2B";
  ctx.lineWidth = 80;
  ctx.beginPath();
  ctx.moveTo(SIZE + 40, -40);
  ctx.lineTo(-40, SIZE + 40);
  ctx.stroke();

  // Big faint logos in the corners.
  drawLogo(ctx, homeLogo, data.home, homeColor, 150, 150, 380, 0.22);
  drawLogo(ctx, awayLogo, data.away, awayColor, SIZE - 150, SIZE - 150, 380, 0.22);

  // The ticket.
  const T = { x: 34, y: 34, w: SIZE - 68, h: SIZE - 68 };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, T.x, T.y, T.w, T.h, 26);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, T.x, T.y, T.w, T.h, 26);
  ctx.clip();

  // Header band.
  const hdrH = 160;
  const band = ctx.createLinearGradient(T.x, 0, T.x + T.w, 0);
  band.addColorStop(0, "rgba(255,122,26,0.20)");
  band.addColorStop(1, "rgba(90,72,245,0.20)");
  ctx.fillStyle = band;
  ctx.fillRect(T.x, T.y, T.w, hdrH);
  drawLogo(ctx, awayLogo, data.away, awayColor, T.x + 90, T.y + hdrH / 2, 112);
  drawLogo(ctx, homeLogo, data.home, homeColor, T.x + T.w - 90, T.y + hdrH / 2, 112);

  ctx.fillStyle = PEACH;
  ctx.font = `800 15px ${BODY}`;
  spaced(ctx, "ADMIT ONE · SUNDAY SHOWDOWN", SIZE / 2, T.y + 42, 4.5, "center");

  const title = `${data.away.short} @ ${data.home.short}`.toUpperCase();
  const tpx = fitFont(ctx, title, (px) => `italic 900 ${px}px ${DISPLAY}`, 50, T.w - 300);
  const chrome = ctx.createLinearGradient(0, T.y + 60, 0, T.y + 60 + tpx);
  chrome.addColorStop(0, "#FFFFFF");
  chrome.addColorStop(0.45, "#C9D3E6");
  chrome.addColorStop(0.55, "#8C97B0");
  chrome.addColorStop(1, "#E9EEF7");
  ctx.fillStyle = chrome;
  ctx.textAlign = "center";
  ctx.fillText(title, SIZE / 2, T.y + 58 + tpx * 0.85);
  ctx.fillStyle = "#C9D0F0";
  ctx.font = `600 18px ${BODY}`;
  const day = data.kickoff.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = data.kickoff.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  ctx.fillText(`Week ${data.week} · ${day} · ${time}`, SIZE / 2, T.y + hdrH - 22);
  dashed(ctx, T.x + 26, T.y + hdrH, T.x + T.w - 26);

  // Board.
  const boardW = 600;
  const side = 40;
  const gap = 4;
  const cell = (boardW - side - gap * 10) / 10;
  const bx = (SIZE - boardW) / 2 + 10;
  const by = T.y + hdrH + 56;
  ctx.font = `800 13px ${BODY}`;
  ctx.textAlign = "left";
  ctx.fillStyle = homeColor;
  spaced(ctx, `${data.home.short.toUpperCase()} (HOME) →`, bx + side + gap, by - 14, 2.5);

  const col = (i: number) => bx + side + gap + i * (cell + gap);
  const row = (i: number) => by + side + gap + i * (cell + gap);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 10; i++) {
    for (const [x, y, d] of [
      [col(i), by, data.topDigits[i]],
      [bx, row(i), data.leftDigits[i]],
    ] as const) {
      const w = x === bx ? side : cell;
      const h = y === by ? side : cell;
      roundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 ${Math.round(side * 0.5)}px ${BODY}`;
      ctx.fillText(String(d), x + w / 2, y + h / 2 + 1);
    }
  }

  const layout = seasonLayout(data.squares);
  for (let br = 0; br < 5; br++) {
    for (let bc = 0; bc < 5; bc++) {
      const x = col(bc * 2);
      const y = row(br * 2);
      const s = cell * 2 + gap;
      const sq = layout.find((q) => q.cells.some((c) => c.row === br * 2 && c.col === bc * 2));
      roundRect(ctx, x, y, s, s, 10);
      if (!sq) {
        ctx.fillStyle = "#070818";
        ctx.fill();
        continue;
      }
      const seat = data.squares[sq.id];
      const isWinner = data.winner?.squareId === sq.id;
      const unpaid = data.unpaidSquareIds.includes(sq.id);
      if (isWinner) {
        const g = ctx.createLinearGradient(x, y, x + s, y + s);
        g.addColorStop(0, ORANGE);
        g.addColorStop(1, "#FFB21A");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = seat ? "#EEF2FF" : "rgba(255,255,255,0.06)";
      }
      ctx.fill();
      if (unpaid && !isWinner) {
        ctx.strokeStyle = "#FF4D6D";
        ctx.lineWidth = 3;
        roundRect(ctx, x + 1.5, y + 1.5, s - 3, s - 3, 9);
        ctx.stroke();
      }
      const ink = seat ? "#0B0D24" : MUTED;
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `700 12px ${BODY}`;
      ctx.fillText(`${squareNumber(sq.id)}.`, x + 7, y + 6);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const name = seat?.name ?? "Open";
      // Emoji-only names (👻, 🐢) draw small at text size; give them room.
      const emojiOnly = /^\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(name);
      const npx = fitFont(ctx, name, (px) => `800 ${px}px ${BODY}`, emojiOnly ? 40 : 18, s - 12);
      ctx.fillText(name, x + s / 2, y + s / 2 + (isWinner ? -6 : 2));
      if (isWinner && data.winner) {
        ctx.font = `italic 900 ${Math.max(12, npx - 2)}px ${DISPLAY}`;
        ctx.fillText(formatCents(data.winner.amountCents), x + s / 2, y + s / 2 + npx);
      } else if (unpaid) {
        ctx.font = `800 9px ${BODY}`;
        ctx.fillStyle = "#FF4D6D";
        ctx.fillText("NOT PAID", x + s / 2, y + s - 10);
      }
    }
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `800 13px ${BODY}`;
  ctx.fillStyle = awayColor;
  const boardBottom = row(9) + cell;
  spaced(ctx, `${data.away.short.toUpperCase()} ↓`, bx + side + gap, boardBottom + 24, 2.5);

  // Stub.
  const stubY = T.y + T.h - 150;
  dashed(ctx, T.x + 26, stubY, T.x + T.w - 26);
  const colW = (T.w - 52) / 3;
  const stub: [string, string, boolean][] = [
    ["SECTION", `WEEK ${data.week}`, false],
    [data.winner ? "WON" : "POT", formatCents(data.winner?.amountCents ?? data.potCents), true],
    ["SEATS PAID", `${data.paidCount} / ${data.seatedCount}`, false],
  ];
  stub.forEach(([label, value, hot], i) => {
    const cx = T.x + 26 + colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = `800 12px ${BODY}`;
    spaced(ctx, label, cx, stubY + 34, 3, "center");
    if (hot) {
      const g = ctx.createLinearGradient(0, stubY + 44, 0, stubY + 88);
      g.addColorStop(0, "#FFD08A");
      g.addColorStop(1, ORANGE);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = "#FFFFFF";
    }
    ctx.font = `italic 900 ${hot ? 40 : 34}px ${DISPLAY}`;
    ctx.fillText(value, cx, stubY + 82);
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(T.x + 26 + colW * i, stubY + 14, 1, 80);
    }
  });

  // Footer band.
  ctx.fillStyle = "rgba(255,122,26,0.08)";
  ctx.fillRect(T.x, T.y + T.h - 44, T.w, 44);
  ctx.fillStyle = PEACH;
  ctx.font = `800 14px ${BODY}`;
  const winnerSeat = data.winner ? data.squares[data.winner.squareId] : null;
  const footer = winnerSeat
    ? `WINNER: ${winnerSeat.name.toUpperCase()} · SQUARE ${squareNumber(data.winner!.squareId)}`
    : "BOARD LOCKED · NO PAY • NO PLAY • NO OT";
  spaced(ctx, footer, SIZE / 2, T.y + T.h - 17, 4, "center");
  ctx.restore();

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), "image/jpeg", 0.92),
  );
}

/** Opens the phone share sheet with the image, or downloads it on a computer. */
export async function shareTicket(data: TicketData): Promise<"shared" | "downloaded"> {
  const blob = await renderTicket(data);
  const fileName = `sunday-showdown-week-${data.week}.jpg`;
  const file = new File([blob], fileName, { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: `Sunday Showdown · Week ${data.week}` });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

/** Squares in a locked week that weren't paid. */
export function unpaidIn(squares: Record<string, Seat | null>, paid: readonly string[]): string[] {
  return SQUARE_IDS.filter((id) => squares[id] !== null && !paid.includes(id));
}
