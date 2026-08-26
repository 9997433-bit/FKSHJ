import { SPEED } from "../data/constants";

export type Motion = {
  speed: number;
  boostLeft: number;
};

export function stepSpeed(m: Motion, dt: number): number {
  m.boostLeft = Math.max(0, m.boostLeft - dt);
  const target = m.boostLeft > 0 ? SPEED.base * SPEED.boostMul : SPEED.base;
  const accel = SPEED.gravity + (target - m.speed) * 0.35;
  m.speed += (accel - SPEED.waterDrag) * dt;
  m.speed = Math.max(90, Math.min(SPEED.max, m.speed));
  return m.speed;
}

export function applyHit(m: Motion): void {
  m.speed *= SPEED.hitMul;
  m.boostLeft = 0;
}

export function applyBoost(m: Motion): void {
  m.boostLeft = SPEED.boostMs / 1000;
}

export function comboBonus(combo: number): number {
  if (combo < 2) return 0;
  return combo * (combo - 1) * 2;
}
