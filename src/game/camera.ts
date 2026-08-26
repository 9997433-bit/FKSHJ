import { CANVAS } from "../data/constants";

export type Projected = { x: number; y: number; s: number; z: number };

/** 2.5D：世界 (laneX, zAhead) → 屏幕 */
export function project(laneX: number, zAhead: number): Projected {
  const horizonY = CANVAS.h * 0.18;
  const near = 40;
  const depth = Math.max(near, zAhead);
  const t = 1 - Math.min(1, depth / 2400);
  const s = 0.22 + t * 1.15;
  const y = horizonY + (CANVAS.h - horizonY - 70) * (1 - Math.pow(1 - t, 1.15));
  const x = CANVAS.w * 0.5 + laneX * s;
  return { x, y, s, z: depth };
}
