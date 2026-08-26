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

export function sameLane(a: number, b: number, tol = 0.35): boolean {
  return Math.abs(a - b) <= tol;
}
