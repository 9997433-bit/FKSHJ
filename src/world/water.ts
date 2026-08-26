import { CANVAS } from "../data/constants";
import type { ThemePaint } from "../ui/theme";

const HORIZON = CANVAS.h * 0.18;

/** 无随机源的稳定散列，保证背景剪影每帧位置一致。 */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function drawSky(ctx: CanvasRenderingContext2D, theme: ThemePaint, time = 0): void {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS.h);
  g.addColorStop(0, theme.skyTop);
  g.addColorStop(1, theme.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);

  if (theme.id === "cave") drawCaveGlow(ctx, theme, time);
  else if (theme.id === "neon") drawNightSky(ctx, theme, time);
  else drawSun(ctx, theme, time);
}

function drawSun(ctx: CanvasRenderingContext2D, theme: ThemePaint, time: number): void {
  const cx = CANVAS.w * (theme.id === "volcano" ? 0.28 : 0.74);
  const cy = HORIZON * (theme.id === "volcano" ? 0.86 : 0.62);
  const r = theme.id === "volcano" ? 52 : 44;

  const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 5.2);
  halo.addColorStop(0, theme.id === "volcano" ? "rgba(255,196,120,0.55)" : "rgba(255,246,200,0.5)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 5.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + time * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10));
    ctx.lineTo(cx + Math.cos(a) * (r + 26), cy + Math.sin(a) * (r + 26));
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = theme.id === "volcano" ? "#ffd08a" : "#fff6c8";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCaveGlow(ctx: CanvasRenderingContext2D, theme: ThemePaint, time: number): void {
  // 洞顶生物荧光：几团缓慢呼吸的冷光
  for (let i = 0; i < 7; i++) {
    const x = CANVAS.w * (0.08 + hash01(i * 3.1) * 0.86);
    const y = HORIZON * (0.18 + hash01(i * 7.7) * 0.7);
    const pulse = 0.5 + Math.sin(time * 1.1 + i) * 0.3;
    const r = 40 + hash01(i * 5.3) * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(124, 247, 255, ${0.16 + pulse * 0.16})`);
    g.addColorStop(1, "rgba(124, 247, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(6, 14, 24, 0.92)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(CANVAS.w, 0);
  ctx.lineTo(CANVAS.w, HORIZON * 0.22);
  for (let x = CANVAS.w; x >= 0; x -= 40) {
    const drop = HORIZON * (0.22 + hash01(x) * 0.55);
    ctx.lineTo(x - 20, drop);
    ctx.lineTo(x - 40, HORIZON * 0.22);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const x = CANVAS.w * (0.12 + hash01(i * 2.7 + 40) * 0.76);
    const len = 18 + hash01(i * 9.1) * 26;
    ctx.beginPath();
    ctx.moveTo(x, HORIZON * 0.3);
    ctx.lineTo(x, HORIZON * 0.3 + len + Math.sin(time * 2 + i) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawNightSky(ctx: CanvasRenderingContext2D, theme: ThemePaint, time: number): void {
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 60; i++) {
    const x = hash01(i * 1.7) * CANVAS.w;
    const y = hash01(i * 4.9) * HORIZON * 1.05;
    ctx.globalAlpha = 0.25 + Math.abs(Math.sin(time * 1.6 + i)) * 0.55;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  const cx = CANVAS.w * 0.8;
  const cy = HORIZON * 0.45;
  const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 150);
  halo.addColorStop(0, "rgba(214, 179, 255, 0.4)");
  halo.addColorStop(1, "rgba(214, 179, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e9dcff";
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.skyTop;
  ctx.beginPath();
  ctx.arc(cx + 14, cy - 8, 30, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 地平线远景剪影：纯路径绘制，无贴图。
 * cameraZ 提供缓慢视差，让每个主题段有可辨认的天际线。
 */
export function drawSilhouettes(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  cameraZ: number,
  time = 0,
): void {
  const spacing = 190;
  const shift = ((-cameraZ * 0.07) % spacing + spacing) % spacing;
  ctx.save();
  for (let i = -1; i < CANVAS.w / spacing + 1; i++) {
    const x = i * spacing + shift;
    const seed = Math.round(i + Math.floor(cameraZ * 0.07 / spacing));
    if (theme.id === "tropical") drawPalm(ctx, x, seed, theme, time);
    else if (theme.id === "cave") drawRock(ctx, x, seed, theme);
    else if (theme.id === "volcano") drawCone(ctx, x, seed, theme, time);
    else drawTower(ctx, x, seed, theme, time);
  }
  ctx.restore();
}

function drawPalm(
  ctx: CanvasRenderingContext2D,
  x: number,
  seed: number,
  theme: ThemePaint,
  time: number,
): void {
  const h = 62 + hash01(seed) * 46;
  const lean = (hash01(seed * 2.3) - 0.5) * 26;
  const sway = Math.sin(time * 0.9 + seed) * 4;
  const baseY = HORIZON + 8;

  ctx.fillStyle = "rgba(12, 60, 62, 0.55)";
  ctx.beginPath();
  ctx.ellipse(x, baseY, 58 + hash01(seed * 3.7) * 40, 16, 0, Math.PI, 0);
  ctx.fill();

  ctx.strokeStyle = "rgba(10, 46, 50, 0.85)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.5, baseY - h * 0.6, x + lean + sway, baseY - h);
  ctx.stroke();

  ctx.fillStyle = "rgba(10, 46, 50, 0.85)";
  const tipX = x + lean + sway;
  const tipY = baseY - h;
  for (let f = 0; f < 5; f++) {
    const a = Math.PI + (f / 4) * Math.PI;
    const fx = tipX + Math.cos(a) * 30;
    const fy = tipY + Math.sin(a) * 18;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo((tipX + fx) / 2, tipY - 16, fx, fy);
    ctx.quadraticCurveTo((tipX + fx) / 2, tipY - 4, tipX, tipY);
    ctx.fill();
  }
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, seed: number, theme: ThemePaint): void {
  const h = 46 + hash01(seed) * 62;
  const w = 54 + hash01(seed * 1.9) * 44;
  const baseY = HORIZON + 10;
  ctx.fillStyle = "rgba(5, 16, 30, 0.9)";
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.lineTo(x - w * 0.55, baseY - h * 0.6);
  ctx.lineTo(x - w * 0.15, baseY - h);
  ctx.lineTo(x + w * 0.3, baseY - h * 0.5);
  ctx.lineTo(x + w * 0.7, baseY - h * 0.78);
  ctx.lineTo(x + w, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.15, baseY - h);
  ctx.lineTo(x + w * 0.3, baseY - h * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  seed: number,
  theme: ThemePaint,
  time: number,
): void {
  const h = 70 + hash01(seed) * 60;
  const w = 76 + hash01(seed * 2.1) * 40;
  const baseY = HORIZON + 10;

  ctx.fillStyle = "rgba(50, 12, 18, 0.85)";
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.lineTo(x - w * 0.18, baseY - h);
  ctx.lineTo(x + w * 0.18, baseY - h);
  ctx.lineTo(x + w, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 140, 60, 0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, baseY - h);
  ctx.lineTo(x + w * 0.1, baseY - h * 0.45);
  ctx.stroke();

  // 蒸汽柱
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = theme.foam;
  for (let i = 0; i < 3; i++) {
    const py = baseY - h - 12 - i * 16;
    const px = x + Math.sin(time * 0.8 + i + seed) * (6 + i * 4);
    ctx.beginPath();
    ctx.arc(px, py, 9 + i * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  seed: number,
  theme: ThemePaint,
  time: number,
): void {
  const h = 54 + hash01(seed) * 96;
  const w = 26 + hash01(seed * 1.3) * 26;
  const baseY = HORIZON + 10;

  ctx.fillStyle = "rgba(8, 2, 24, 0.9)";
  ctx.fillRect(x - w / 2, baseY - h, w, h);

  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(x - w / 2, baseY - h, w, 3);
  ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 2 + seed)) * 0.5;
  for (let row = 0; row < Math.floor(h / 16); row++) {
    if (hash01(seed * 5 + row) < 0.45) continue;
    ctx.fillRect(x - w / 2 + 4, baseY - h + 8 + row * 16, w - 8, 4);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = theme.water;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, baseY - h);
  ctx.lineTo(x, baseY - h - 14 - hash01(seed * 8) * 16);
  ctx.stroke();
}

/** 泡沫带：两层正弦叠加，速度越快浪越急。 */
export function drawFoam(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  time: number,
  speed01 = 0.3,
): void {
  const rush = 1 + speed01 * 1.6;
  ctx.strokeStyle = theme.foam;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.35 - i * 0.02;
    ctx.beginPath();
    const y = CANVAS.h * 0.72 + i * 14 + Math.sin(time * 2 * rush + i) * 4;
    ctx.moveTo(0, y);
    for (let x = 0; x <= CANVAS.w; x += 24) {
      const a = Math.sin(x * 0.02 + time * 3 * rush + i) * 6;
      const b = Math.sin(x * 0.007 - time * 1.7 * rush + i * 0.6) * 4 * rush;
      ctx.lineTo(x, y + a + b);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
