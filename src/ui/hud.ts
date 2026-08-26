import { CANVAS, PLAYER, SPEED } from "../data/constants";
import type { ThemePaint } from "./theme";

export type HudInfo = {
  score: number;
  distance: number;
  combo: number;
  hp: number;
  theme: ThemePaint;
  speed: number;
  /** 秒。缺省时 HUD 用 performance.now() 自计时（仅用于动画）。 */
  time?: number;
};

const PANEL_BACK = "rgba(4, 20, 28, 0.45)";
const POP_MS = 0.35;

// HUD 动画状态（单实例即可）：连击弹跳、掉血脉冲
let lastCombo = 0;
let comboPopAt = -Infinity;
let lastHp: number = PLAYER.maxHp;
let hpPulseAt = -Infinity;

export function drawHud(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const now = info.time ?? performance.now() / 1000;
  if (info.combo > lastCombo) comboPopAt = now;
  lastCombo = info.combo;
  if (info.hp < lastHp) hpPulseAt = now;
  lastHp = info.hp;

  ctx.save();
  drawScorePanel(ctx, info);
  drawCombo(ctx, info, now);
  drawHearts(ctx, info, now);
  drawThemeBadge(ctx, info);
  drawSpeedBar(ctx, info);

  ctx.fillStyle = withAlpha(info.theme.ink, 0.55);
  ctx.font = "14px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("A/D 换道 · 空格跳跃 · P 暂停", 18, CANVAS.h - 18);
  ctx.restore();
}

function drawScorePanel(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  ctx.fillStyle = PANEL_BACK;
  roundRect(ctx, 18, 16, 236, 92, 14);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = info.theme.ink;
  ctx.font = "800 30px Trebuchet MS, sans-serif";
  ctx.fillText(`${Math.floor(info.score)}`, 34, 52);
  ctx.font = "700 16px Trebuchet MS, sans-serif";
  ctx.fillStyle = withAlpha(info.theme.ink, 0.7);
  ctx.fillText("分数", 34, 72);
  ctx.fillStyle = info.theme.coin;
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.fillText(`${Math.floor(info.distance)}m`, 150, 52);
  ctx.fillStyle = withAlpha(info.theme.ink, 0.7);
  ctx.font = "700 16px Trebuchet MS, sans-serif";
  ctx.fillText("距离", 150, 72);
}

function drawCombo(ctx: CanvasRenderingContext2D, info: HudInfo, now: number): void {
  if (info.combo <= 1) return;
  // 弹跳缩放：得分瞬间放大后回弹，衰减 POP_MS 秒
  const t = Math.min(1, (now - comboPopAt) / POP_MS);
  const pop = 1 + 0.45 * (1 - t) * (1 - t);
  const cx = 18 + 70;
  const cy = 142;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.fillStyle = PANEL_BACK;
  roundRect(ctx, -70, -20, 140, 40, 20);
  ctx.fill();
  ctx.strokeStyle = withAlpha(info.theme.accent, 0.85);
  ctx.lineWidth = 2;
  roundRect(ctx, -70, -20, 140, 40, 20);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = info.theme.accent;
  ctx.font = "800 22px Trebuchet MS, sans-serif";
  ctx.fillText(`连击 x${info.combo}`, 0, 8);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawHearts(ctx: CanvasRenderingContext2D, info: HudInfo, now: number): void {
  const pulse = Math.max(0, 1 - (now - hpPulseAt) / 0.45);
  const lowHp = info.hp <= 1;
  const w = PLAYER.maxHp * 36 + 20;
  const x0 = CANVAS.w - 18 - w;
  ctx.fillStyle = PANEL_BACK;
  roundRect(ctx, x0, 18, w, 44, 14);
  ctx.fill();
  for (let i = 0; i < PLAYER.maxHp; i++) {
    const cx = x0 + 28 + i * 36;
    const cy = 40;
    const alive = i < info.hp;
    const breath = lowHp && alive ? 1 + 0.12 * Math.sin(now * 7) : 1;
    const r = 11 * breath * (1 + 0.3 * pulse);
    heartPath(ctx, cx, cy, r);
    if (alive) {
      ctx.fillStyle = lowHp ? info.theme.danger : info.theme.hp;
      ctx.fill();
    } else {
      ctx.strokeStyle = withAlpha(info.theme.ink, 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawThemeBadge(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const w = 118;
  const x0 = CANVAS.w - 18 - w;
  ctx.fillStyle = PANEL_BACK;
  roundRect(ctx, x0, 70, w, 34, 17);
  ctx.fill();
  ctx.fillStyle = info.theme.accent;
  ctx.beginPath();
  ctx.arc(x0 + 20, 87, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = info.theme.ink;
  ctx.font = "700 17px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(info.theme.name, x0 + 34, 93);
}

function drawSpeedBar(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  const x = 18;
  const y = CANVAS.h - 56;
  const w = 220;
  const h = 12;
  const frac = Math.max(0, Math.min(1, info.speed / SPEED.max));
  const boosting = info.speed > SPEED.base * 1.25;

  ctx.fillStyle = withAlpha(info.theme.ink, 0.6);
  ctx.font = "700 13px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("速度", x, y - 6);

  ctx.fillStyle = PANEL_BACK;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  if (frac > 0.02) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, info.theme.accent);
    g.addColorStop(1, boosting ? info.theme.danger : info.theme.coin);
    ctx.fillStyle = g;
    roundRect(ctx, x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }

  // 基础速度刻度线
  const baseX = x + w * (SPEED.base / SPEED.max);
  ctx.strokeStyle = withAlpha(info.theme.ink, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(baseX, y - 3);
  ctx.lineTo(baseX, y + h + 3);
  ctx.stroke();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - 1.4 * r, y + 0.1 * r, x - 1.1 * r, y - 1.1 * r, x, y - 0.35 * r);
  ctx.bezierCurveTo(x + 1.1 * r, y - 1.1 * r, x + 1.4 * r, y + 0.1 * r, x, y + r);
  ctx.closePath();
}

function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
