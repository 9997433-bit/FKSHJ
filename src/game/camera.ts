import { CAMERA, CANVAS, GEN } from "../data/constants";

export type Projected = { x: number; y: number; s: number; z: number };

export type ProjectOpts = {
  /** Follow the chute's lateral bend. Off for things pinned to the raw slide axis. */
  bend?: boolean;
  /** Inherit the camera's idle sway and impact shake. */
  sway?: boolean;
};

export const HORIZON_Y = CANVAS.h * CAMERA.horizonFrac;

/** Far clip has no CAMERA field of its own: the view depth is GEN.horizon, one source. */
const FAR = GEN.horizon;

const cam = { z: 0, time: 0, shake: 0, swayX: 0, swayY: 0 };

/**
 * Lateral offset of the chute centre at a world depth, in slide-space pixels.
 * Anchored to world z (not to time) so the bend stays put as you travel through it.
 */
export function chuteBend(worldZ: number): number {
  return (
    Math.sin(worldZ * CAMERA.bendFastFreq) * CAMERA.bendFastAmp +
    Math.sin(worldZ * CAMERA.bendSlowFreq + CAMERA.bendSlowPhase) * CAMERA.bendSlowAmp
  );
}

/** How hard the chute banks at a world depth, signed and normalised to -1..1. */
export function chuteBank(worldZ: number): number {
  const slope =
    Math.cos(worldZ * CAMERA.bendFastFreq) * CAMERA.bendFastAmp * CAMERA.bendFastFreq +
    Math.cos(worldZ * CAMERA.bendSlowFreq + CAMERA.bendSlowPhase) *
      CAMERA.bendSlowAmp *
      CAMERA.bendSlowFreq;
  return Math.max(-1, Math.min(1, slope / CAMERA.bankFull));
}

/** Point the camera at a stretch of slide. The track pass calls this before anything projects. */
export function syncCamera(z: number, time: number): void {
  const dt = Math.max(0, Math.min(0.1, time - cam.time));
  cam.z = z;
  cam.time = time;
  cam.shake = Math.max(0, cam.shake - dt * CAMERA.shakeDecay);

  const kick = cam.shake * cam.shake;
  cam.swayX = Math.sin(time * 0.9) * 3.4 + Math.sin(time * 2.3 + 1.1) * 1.2 + Math.sin(time * 71) * 7 * kick;
  cam.swayY = Math.sin(time * 1.7) * 2.4 + Math.sin(time * 0.53) * 1.6 + Math.cos(time * 63) * 5.5 * kick;
}

/** Punch the camera on impact. Sim code owns the events, so it pushes them here. */
export function kickCamera(power = 1): void {
  cam.shake = Math.min(1, cam.shake + power);
}

/** 2.5D：世界 (laneX, zAhead) → 屏幕 */
export function project(laneX: number, zAhead: number, opts: ProjectOpts = {}): Projected {
  const depth = Math.max(CAMERA.near, zAhead);
  const t = 1 - Math.min(1, depth / FAR);
  const s = CAMERA.scaleMin + t * CAMERA.scaleSpan;
  const bend = opts.bend === false ? 0 : chuteBend(cam.z + depth);
  const nearness = opts.sway === false ? 0 : 0.35 + t * 0.65;
  return {
    x: CANVAS.w * 0.5 + (laneX + bend) * s + cam.swayX * nearness,
    y:
      HORIZON_Y +
      (CANVAS.h - HORIZON_Y - CAMERA.bottomPad) * (1 - Math.pow(1 - t, CAMERA.depthCurve)) +
      cam.swayY * nearness,
    s,
    z: depth,
  };
}
