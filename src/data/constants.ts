export const CANVAS = { w: 1280, h: 720 } as const;

export const LANES = {
  count: 5,
  min: -2,
  max: 2,
  width: 78,
  switchMs: 150,
} as const;

export const PLAYER = {
  radius: 28,
  maxHp: 3,
  jumpMs: 420,
  jumpCooldownMs: 520,
  mass: 1,
} as const;

export const SPEED = {
  base: 280,
  max: 620,
  gravity: 46,
  waterDrag: 18,
  hitMul: 0.45,
  boostMul: 1.6,
  boostMs: 1200,
  wallPenalty: 0.82,
} as const;

export const SCORE = {
  distMul: 0.2,
  coin: 10,
  gem: 50,
  ring: 100,
  comboTimeoutMs: 1800,
  healEvery: 15,
} as const;

export const GEN = {
  segmentLen: 500,
  coinGap: 90,
  obstacleGap: 160,
  horizon: 2400,
} as const;

export const SAVE_KEY = "cww_hiscore_v1";

export type ThemeId = "tropical" | "cave" | "volcano" | "neon";

export const THEME_ORDER: ThemeId[] = ["tropical", "cave", "volcano", "neon"];
