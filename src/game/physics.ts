import { SPEED } from "../data/constants";
import { kickCamera } from "./camera";

export type Motion = {
  speed: number;
  boostLeft: number;
  /** Length of the running boost, so the ease curve knows where it is. */
  boostSpan?: number;
  /** 0..1 carve across a banked turn; the raft scrubs speed while it holds. */
  bank?: number;
};

/** Approach rates, per second, toward the cruise speed. Climbing feels eager, coasting lazy. */
const RISE = 0.95;
const FALL = 0.62;
/** Original settle rate; keeps the slope-vs-drag equilibrium where the game was tuned. */
const SETTLE_RATE = 0.35;
const BOOST_ATTACK = 0.12;
const BOOST_RELEASE = 0.3;
/** Cruise speed shaved off at a full carve, plus the extra scrub while carving. */
const BANK_LOSS = 70;
const BANK_SCRUB = 0.55;
const MIN_SPEED = 90;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(v: number): number {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

/** Boost strength 0..1: swells over the first moments, then bleeds off instead of snapping away. */
export function boostEase(boostLeft: number, span = SPEED.boostMs / 1000): number {
  if (boostLeft <= 0) return 0;
  const elapsed = Math.max(0, span - boostLeft);
  return smoothstep(Math.min(elapsed / BOOST_ATTACK, boostLeft / BOOST_RELEASE));
}

/** Speed the raft settles at right now, given its boost and how hard it is carving. */
export function cruiseSpeed(boost: number, bank: number): number {
  const nominal = SPEED.base * (1 + (SPEED.boostMul - 1) * clamp01(boost));
  const slopeLift = (SPEED.gravity - SPEED.waterDrag) / SETTLE_RATE;
  return nominal + slopeLift - BANK_LOSS * clamp01(bank);
}

export function stepSpeed(m: Motion, dt: number, bank = m.bank ?? 0): number {
  const step = Math.max(0, Math.min(0.1, dt));
  m.boostLeft = Math.max(0, m.boostLeft - step);
  const carve = clamp01(Math.abs(bank));
  const cruise = cruiseSpeed(boostEase(m.boostLeft, m.boostSpan), carve);
  const rate = (m.speed < cruise ? RISE : FALL) + BANK_SCRUB * carve;
  m.speed += (cruise - m.speed) * (1 - Math.exp(-rate * step));
  m.speed = Math.max(MIN_SPEED, Math.min(SPEED.max, m.speed));
  return m.speed;
}

export function applyHit(m: Motion): void {
  m.speed *= SPEED.hitMul;
  m.boostLeft = 0;
  m.boostSpan = undefined;
  kickCamera(0.9);
}

/** Grinding the chute edge (GAME_SPEC §4.2): scrubs speed and rattles the camera. */
export function applyWallScrape(m: Motion): void {
  m.speed *= SPEED.wallPenalty;
  kickCamera(0.35);
}

export function applyBoost(m: Motion): void {
  m.boostSpan = SPEED.boostMs / 1000;
  m.boostLeft = m.boostSpan;
  kickCamera(0.22);
}

export function comboBonus(combo: number): number {
  if (combo < 2) return 0;
  return combo * (combo - 1) * 2;
}
