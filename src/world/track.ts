import { CANVAS, LANES } from "../data/constants";
import { project } from "../game/camera";
import type { ThemePaint } from "../ui/theme";

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  cameraZ: number,
  theme: ThemePaint,
  time: number,
): void {
  const steps = 42;
  const dz = 56;
  for (let i = steps; i >= 0; i--) {
    const z0 = i * dz;
    const z1 = (i + 1) * dz;
    const sway = Math.sin((cameraZ + z0) * 0.004 + time * 0.4) * 26;
    const pL0 = project(-2.6 * LANES.width + sway, z0);
    const pR0 = project(2.6 * LANES.width + sway, z0);
    const pL1 = project(-2.6 * LANES.width + sway, z1);
    const pR1 = project(2.6 * LANES.width + sway, z1);
    ctx.beginPath();
    ctx.moveTo(pL0.x, pL0.y);
    ctx.lineTo(pR0.x, pR0.y);
    ctx.lineTo(pR1.x, pR1.y);
    ctx.lineTo(pL1.x, pL1.y);
    ctx.closePath();
    const shade = i % 2 === 0 ? theme.water : theme.waterDeep;
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.strokeStyle = theme.foam;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = theme.rail;
  for (const side of [-2.7, 2.7]) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const z = i * dz;
      const sway = Math.sin((cameraZ + z) * 0.004 + time * 0.4) * 26;
      const p = project(side * LANES.width + sway, z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = 8;
    ctx.strokeStyle = theme.rail;
    ctx.stroke();
  }

  ctx.fillStyle = theme.fog;
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h * 0.28);
}
