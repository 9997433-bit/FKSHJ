import { LANES } from "../data/constants";

export function circleHit(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const r = ar + br;
  return dx * dx + dz * dz <= r * r;
}

/** Overlap in pixels: positive while the circles intersect, negative is the gap between them. */
export function overlapDepth(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): number {
  const dx = ax - bx;
  const dz = az - bz;
  return ar + br - Math.sqrt(dx * dx + dz * dz);
}

/** Squeaked past: clear of the circles but within `margin` of them. Worth a cheer. */
export function nearMiss(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
  margin = 26,
): boolean {
  const depth = overlapDepth(ax, az, ar, bx, bz, br);
  return depth < 0 && depth >= -margin;
}

export function sameLane(a: number, b: number, tol = 0.35): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Widest lane gap two radii can still touch across. Pass it as the `sameLane` tolerance when
 * the first argument is a continuous lane (mid-switch, or slid up the bank) and the prefilter
 * can never throw away a hit the circle test would have found.
 */
export function laneReach(ra: number, rb: number): number {
  return (ra + rb) / LANES.width;
}
