import { LANES, SPEED } from "../data/constants";
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

/**
 * Chute cross-section, in lane units out from the centre line: where the water floor gives
 * out and where the wall lip sits above it. The sim owns these because the fall rule is
 * geometry; src/world/track.ts paints the same two numbers.
 */
export const CHUTE = { floor: 2.85, wall: 3.3 } as const;

/** Lanes of outward slide a full-tilt bank buys once the raft is out on the rim. */
const SLIP_MAX = 1.05;
/** Bank the flow still holds you through, so only the sharpest part of a bend throws you out. */
const SLIP_HOLD = 0.45;
/** Lane where the flat floor starts handing the raft over to the banked wall. */
const RIM_LANE = 1.4;
/** Approach rate, per second, toward the slide the bank is asking for. */
const SLIP_RATE = 3.4;
/** In the air there is no water underneath to push you further up the wall. */
const AIR_SLIP = 0.2;
/** Seconds off the flow before the raft is gone (GAME_SPEC §4.4). */
export const FALL_TIME = 1.5;
/** Getting back over water pays the timer down faster than it filled. */
const FALL_RECOVER = 1.8;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Move toward `target` at `rate` per second, independent of how the frame was sliced. */
export function approach(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * Math.max(0, dt)));
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
  m.speed = approach(m.speed, cruise, rate, step);
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

/** How far the raft has left the flat floor for the banked rim: 0 down the middle, 1 out in the last lane. */
export function rimGrip(lane: number): number {
  return clamp01((Math.abs(lane) - RIM_LANE) / (LANES.max - RIM_LANE));
}

/**
 * Outward slide, in lanes, that the bend is asking of a raft steering `lane`.
 * Inertia throws you to the outside of a turn, so only the wall you are already leaning
 * on can take you: down the middle of the chute the flow simply holds you.
 */
export function slipPull(lane: number, bank: number, airborne = false): number {
  const side = Math.sign(lane);
  const outward = -bank * side;
  if (side === 0 || outward <= SLIP_HOLD) return 0;
  const bite = clamp01((outward - SLIP_HOLD) / (1 - SLIP_HOLD));
  return side * bite * rimGrip(lane) * SLIP_MAX * (airborne ? AIR_SLIP : 1);
}

/** Ease the current slide toward what the bank is pulling for; the raft has mass, so it lags. */
export function stepSlip(slip: number, pull: number, dt: number): number {
  return approach(slip, pull, SLIP_RATE, dt);
}

/** Lanes past the water's edge: positive means the raft is riding wall instead of flow. */
export function offChuteDepth(lane: number): number {
  return Math.abs(lane) - CHUTE.floor;
}

/** Wipeout countdown (GAME_SPEC §4.4): fills while off the flow, drains once back over water. */
export function stepFall(fallT: number, offChute: boolean, dt: number): number {
  const step = Math.max(0, dt);
  return offChute ? fallT + step : Math.max(0, fallT - step * FALL_RECOVER);
}

export function comboBonus(combo: number): number {
  if (combo < 2) return 0;
  return combo * (combo - 1) * 2;
}
