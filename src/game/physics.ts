import { FEEL, LANES, SPEED } from "../data/constants";

export type Motion = {
  speed: number;
  boostLeft: number;
  /** Length of the running boost, so the ease curve knows where it is. */
  boostSpan?: number;
  /** 0..1 carve across a banked turn; the raft scrubs speed while it holds. */
  bank?: number;
  /** Seconds of impact freeze still owed. Drain it with `takeHitstop` before stepping the world. */
  hitstopLeft?: number;
  /** Accumulated camera punch this frame. Session drains it with `takeKick`. */
  kick?: number;
};

/**
 * Chute cross-section, in lane units: the painted rim (track.ts) and the fall edge
 * (offChuteDepth) both read FEEL so they cannot drift apart.
 */
export const CHUTE = { floor: FEEL.chuteFloor, wall: FEEL.chuteWall } as const;

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
  return smoothstep(Math.min(elapsed / FEEL.boostAttackS, boostLeft / FEEL.boostReleaseS));
}

/** Speed the raft settles at right now, given its boost and how hard it is carving. */
export function cruiseSpeed(boost: number, bank: number): number {
  const nominal = SPEED.base * (1 + (SPEED.boostMul - 1) * clamp01(boost));
  const slopeLift = (SPEED.gravity - SPEED.waterDrag) / FEEL.settleRate;
  return nominal + slopeLift - FEEL.bankLoss * clamp01(bank);
}

export function stepSpeed(m: Motion, dt: number, bank = m.bank ?? 0): number {
  const step = Math.max(0, Math.min(0.1, dt));
  m.boostLeft = Math.max(0, m.boostLeft - step);
  const carve = clamp01(Math.abs(bank));
  const cruise = cruiseSpeed(boostEase(m.boostLeft, m.boostSpan), carve);
  const rate = (m.speed < cruise ? FEEL.approachRise : FEEL.approachFall) + FEEL.bankScrub * carve;
  m.speed = approach(m.speed, cruise, rate, step);
  m.speed = Math.max(FEEL.minSpeed, Math.min(SPEED.max, m.speed));
  return m.speed;
}

function addKick(m: Motion, power: number): void {
  m.kick = (m.kick ?? 0) + power;
}

export function applyHit(m: Motion): void {
  m.speed *= SPEED.hitMul;
  m.boostLeft = 0;
  m.boostSpan = undefined;
  m.hitstopLeft = FEEL.hitstopS;
  addKick(m, FEEL.hitKick);
}

/** Seconds of freeze still owed after a hit; 0 when the world should run at full speed. */
export function getHitstop(m: Motion): number {
  return m.hitstopLeft ?? 0;
}

/**
 * Spend a frame against the impact freeze and hand back the dt the world may actually advance.
 * A hit eats up to `FEEL.hitstopS` of motion so the collision lands before the raft moves on.
 */
export function takeHitstop(m: Motion, dt: number): number {
  const left = m.hitstopLeft ?? 0;
  if (left <= 0) return dt;
  const eaten = Math.min(left, Math.max(0, dt));
  m.hitstopLeft = left - eaten;
  return dt - eaten;
}

/** Drain the camera punch queued this frame. Session forwards the value to kickCamera. */
export function takeKick(m: Motion): number {
  const kick = m.kick ?? 0;
  m.kick = 0;
  return kick;
}

/** Grinding the chute edge (GAME_SPEC §4.2): scrubs speed and queues a camera punch. */
export function applyWallScrape(m: Motion): void {
  m.speed *= SPEED.wallPenalty;
  addKick(m, FEEL.wallKick);
}

export function applyBoost(m: Motion): void {
  m.boostSpan = SPEED.boostMs / 1000;
  m.boostLeft = m.boostSpan;
  addKick(m, FEEL.boostKick);
}

/** How far the raft has left the flat floor for the banked rim: 0 down the middle, 1 out in the last lane. */
export function rimGrip(lane: number): number {
  return clamp01((Math.abs(lane) - FEEL.rimLane) / (LANES.max - FEEL.rimLane));
}

/**
 * Outward slide, in lanes, that the bend is asking of a raft steering `lane`.
 * Inertia throws you to the outside of a turn, so only the wall you are already leaning
 * on can take you: down the middle of the chute the flow simply holds you.
 */
export function slipPull(lane: number, bank: number, airborne = false): number {
  const side = Math.sign(lane);
  const outward = -bank * side;
  if (side === 0 || outward <= FEEL.slipHold) return 0;
  const bite = clamp01((outward - FEEL.slipHold) / (1 - FEEL.slipHold));
  return side * bite * rimGrip(lane) * FEEL.slipMax * (airborne ? FEEL.airSlip : 1);
}

/** Ease the current slide toward what the bank is pulling for; the raft has mass, so it lags. */
export function stepSlip(slip: number, pull: number, dt: number): number {
  return approach(slip, pull, FEEL.slipRate, dt);
}

/** Lanes past the water's edge: positive means the raft is riding wall instead of flow. */
export function offChuteDepth(lane: number): number {
  return Math.abs(lane) - CHUTE.floor;
}

/** Wipeout countdown (GAME_SPEC §4.4): fills while off the flow, drains once back over water. */
export function stepFall(fallT: number, offChute: boolean, dt: number): number {
  const step = Math.max(0, dt);
  return offChute ? fallT + step : Math.max(0, fallT - step * FEEL.fallRecover);
}

export function comboBonus(combo: number): number {
  if (combo < 2) return 0;
  return combo * (combo - 1) * 2;
}
