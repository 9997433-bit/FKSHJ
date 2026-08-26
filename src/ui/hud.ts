import { CANVAS } from "../data/constants";
import type { ThemePaint } from "./theme";

export type HudInfo = {
  score: number;
  distance: number;
  combo: number;
  hp: number;
  theme: ThemePaint;
  speed: number;
};

export function drawHud(ctx: CanvasRenderingContext2D, info: HudInfo): void {
  ctx.save();
  ctx.font = "700 22px Trebuchet MS, sans-serif";
  ctx.fillStyle = "rgba(4,20,28,0.45)";
  roundRect(ctx, 18, 16, 300, 92, 14);
  ctx.fill();
  ctx.fillStyle = "#f4fffd";
  ctx.fillText(`分数  ${Math.floor(info.score)}`, 34, 46);
  ctx.fillText(`距离  ${Math.floor(info.distance)}m`, 34, 76);
  ctx.fillStyle = info.theme.accent;
  ctx.fillText(info.theme.name, 210, 46);
  if (info.combo > 1) {
    ctx.fillStyle = "#ff5dab";
    ctx.fillText(`连击 x${info.combo}`, 210, 76);
  }

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.fillStyle = i < info.hp ? "#ff6b9a" : "rgba(255,255,255,0.18)";
    ctx.arc(CANVAS.w - 40 - i * 34, 40, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "14px Trebuchet MS, sans-serif";
  ctx.fillText("A/D 换道 · 空格跳跃 · P 暂停", 18, CANVAS.h - 18);
  ctx.restore();
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
