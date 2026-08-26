import { CANVAS, FEEL, GEN, LANES } from "../data/constants";
import { HORIZON_Y, project, syncCamera } from "../game/camera";
import type { ThemePaint } from "../ui/theme";

/** Slab depth, and enough slabs to floor the camera's whole view. */
const DZ = 68;
const STEPS = Math.ceil(GEN.horizon / DZ);
const DEPTH = STEPS * DZ;
const W = LANES.width;
/** Chute half-widths, in lanes. Shared with the sim so the painted edge is the one you fall off. */
const FLOOR = FEEL.chuteFloor;
const WALL = FEEL.chuteWall;
/** Wall height and post overhang, in screen pixels at unit scale. */
const WALL_H = 34;
const POST_UP = 15;
const POST_GAP = 170;
const GUIDE_GAP = 104;
const GUIDE_LEN = 46;
const GUIDE_LINES = [-1.5, -0.5, 0.5, 1.5];
const ARROW_GAP = 210;
const ARROW_LEN = 44;

/** World z of the first grid slot at or behind the camera, so patterns stream past instead of sticking. */
function gridStart(cameraZ: number, gap: number, phase = 0): number {
  return Math.floor((cameraZ - phase) / gap) * gap + phase;
}

const shadeCache = new Map<string, string>();

/** Blend a #rrggbb toward black or white, so a lit wall costs one fill instead of two. */
function shade(color: string, toward: 0 | 255, amount: number): string {
  const key = `${color}|${toward}|${amount}`;
  const cached = shadeCache.get(key);
  if (cached) return cached;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const rgb = parseInt(match[1], 16);
  const out = `#${[(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]
    .map((c) => Math.round(c + (toward - c) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
  // Theme cross-fades mint a fresh colour every frame, so the cache needs a ceiling.
  if (shadeCache.size > 64) shadeCache.clear();
  shadeCache.set(key, out);
  return out;
}

function quad(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  cameraZ: number,
  theme: ThemePaint,
  time: number,
): void {
  syncCamera(cameraZ, time);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawChute(ctx, cameraZ, theme, time);
  drawLaneGuides(ctx, cameraZ, theme);
  drawFlowArrows(ctx, cameraZ, theme, time);
  drawRails(ctx, cameraZ, theme);
  drawHaze(ctx, theme);
  ctx.restore();
}

/** Water floor plus the two banked walls, painted far to near so the near slabs win. */
function drawChute(
  ctx: CanvasRenderingContext2D,
  cameraZ: number,
  theme: ThemePaint,
  time: number,
): void {
  const first = gridStart(cameraZ, DZ);
  // Light falls from the right, so the two walls carry different tints.
  const wallShadow = shade(theme.waterDeep, 0, 0.16);
  const wallLit = shade(theme.waterDeep, 255, 0.12);
  // A whisker of contrast between slabs: enough to read as flow, not as a ladder.
  const ripple = shade(theme.water, 0, 0.12);
  for (let i = STEPS; i >= 0; i--) {
    const z0 = first + i * DZ - cameraZ;
    const z1 = z0 + DZ;
    const fl0 = project(-FLOOR * W, z0);
    const fr0 = project(FLOOR * W, z0);
    const fl1 = project(-FLOOR * W, z1);
    const fr1 = project(FLOOR * W, z1);
    const wl0 = project(-WALL * W, z0);
    const wr0 = project(WALL * W, z0);
    const wl1 = project(-WALL * W, z1);
    const wr1 = project(WALL * W, z1);
    const lipL0 = wl0.y - WALL_H * wl0.s;
    const lipL1 = wl1.y - WALL_H * wl1.s;
    const lipR0 = wr0.y - WALL_H * wr0.s;
    const lipR1 = wr1.y - WALL_H * wr1.s;

    ctx.fillStyle = wallShadow;
    quad(ctx, fl0.x, fl0.y, wl0.x, lipL0, wl1.x, lipL1, fl1.x, fl1.y);
    ctx.fillStyle = wallLit;
    quad(ctx, fr0.x, fr0.y, wr0.x, lipR0, wr1.x, lipR1, fr1.x, fr1.y);

    ctx.fillStyle = (first / DZ + i) % 2 === 0 ? theme.water : ripple;
    quad(ctx, fl0.x, fl0.y, fr0.x, fr0.y, fr1.x, fr1.y, fl1.x, fl1.y);

    // Foam boils along the waterline where the flow meets the walls.
    const boil = 0.16 + 0.14 * Math.sin(time * 3.1 + z0 * 0.03);
    ctx.globalAlpha = boil * Math.min(1, fl0.s * 1.4);
    ctx.strokeStyle = theme.foam;
    ctx.lineWidth = Math.max(1, 3 * fl0.s);
    ctx.beginPath();
    ctx.moveTo(fl0.x, fl0.y);
    ctx.lineTo(fl1.x, fl1.y);
    ctx.moveTo(fr0.x, fr0.y);
    ctx.lineTo(fr1.x, fr1.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Dashes on the lane seams: the clearest read on which of the five lanes you are in. */
function drawLaneGuides(ctx: CanvasRenderingContext2D, cameraZ: number, theme: ThemePaint): void {
  const start = gridStart(cameraZ, GUIDE_GAP);
  ctx.strokeStyle = theme.foam;
  for (let k = 0; k * GUIDE_GAP <= DEPTH * 0.8; k++) {
    const rel = start + k * GUIDE_GAP - cameraZ;
    if (rel + GUIDE_LEN < 0) continue;
    for (const line of GUIDE_LINES) {
      const a = project(line * W, Math.max(0, rel));
      const b = project(line * W, rel + GUIDE_LEN);
      ctx.globalAlpha = 0.06 + 0.26 * a.s;
      ctx.lineWidth = Math.max(1, 5 * a.s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Chevrons pointing downhill, pulsing in waves so the water reads as moving even at rest. */
function drawFlowArrows(
  ctx: CanvasRenderingContext2D,
  cameraZ: number,
  theme: ThemePaint,
  time: number,
): void {
  ctx.strokeStyle = theme.foam;
  for (let lane = LANES.min; lane <= LANES.max; lane++) {
    const phase = (lane - LANES.min) * 42;
    const start = gridStart(cameraZ, ARROW_GAP, phase);
    for (let k = 0; k * ARROW_GAP <= DEPTH * 0.7; k++) {
      const rel = start + k * ARROW_GAP - cameraZ;
      if (rel < 24) continue;
      const tip = project(lane * W, rel);
      const tail = project(lane * W, rel + ARROW_LEN);
      const wing = 22 * tip.s;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 - rel * 0.012);
      ctx.globalAlpha = (0.1 + 0.3 * pulse) * Math.min(1, tip.s * 1.2);
      ctx.lineWidth = Math.max(1, 4 * tip.s);
      ctx.beginPath();
      ctx.moveTo(tail.x - wing, tail.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(tail.x + wing, tail.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The lip rail on both walls, with posts every few metres for a parallax speed cue. */
function drawRails(ctx: CanvasRenderingContext2D, cameraZ: number, theme: ThemePaint): void {
  const first = gridStart(cameraZ, DZ);
  ctx.strokeStyle = theme.rail;
  for (const side of [-WALL, WALL]) {
    for (let i = STEPS; i > 0; i--) {
      const z0 = first + i * DZ - cameraZ;
      const a = project(side * W, z0 - DZ);
      const b = project(side * W, z0);
      ctx.lineWidth = Math.max(1.5, 7 * a.s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - WALL_H * a.s);
      ctx.lineTo(b.x, b.y - WALL_H * b.s);
      ctx.stroke();
    }
  }

  const postStart = gridStart(cameraZ, POST_GAP);
  for (let k = 0; k * POST_GAP <= DEPTH * 0.75; k++) {
    const rel = postStart + k * POST_GAP - cameraZ;
    if (rel < 8) continue;
    for (const side of [-WALL, WALL]) {
      const p = project(side * W, rel);
      const top = p.y - (WALL_H + POST_UP) * p.s;
      const w = Math.max(1.2, 7 * p.s);
      ctx.globalAlpha = Math.min(1, 0.4 + p.s);
      ctx.fillStyle = theme.rail;
      ctx.fillRect(p.x - w * 0.5, top, w, p.y - top);
      ctx.fillStyle = theme.accent;
      ctx.fillRect(p.x - w * 0.9, top, w * 1.8, Math.max(1, 3 * p.s));
    }
  }
  ctx.globalAlpha = 1;
}

function drawHaze(ctx: CanvasRenderingContext2D, theme: ThemePaint): void {
  ctx.fillStyle = theme.fog;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h * 0.28);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = theme.foam;
  ctx.fillRect(0, HORIZON_Y - 26, CANVAS.w, 52);
  ctx.globalAlpha = 1;
}
