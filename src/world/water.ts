import { CANVAS } from "../data/constants";
import type { ThemePaint } from "../ui/theme";

export function drawSky(ctx: CanvasRenderingContext2D, theme: ThemePaint): void {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS.h);
  g.addColorStop(0, theme.skyTop);
  g.addColorStop(1, theme.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
}

export function drawFoam(
  ctx: CanvasRenderingContext2D,
  theme: ThemePaint,
  time: number,
): void {
  ctx.strokeStyle = theme.foam;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const y = CANVAS.h * 0.72 + i * 14 + Math.sin(time * 2 + i) * 4;
    ctx.moveTo(0, y);
    for (let x = 0; x <= CANVAS.w; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + time * 3 + i) * 6);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
