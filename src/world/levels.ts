import { GEN, THEME_ORDER, type ThemeId } from "../data/constants";
import { makeBooster, type Booster } from "../entities/booster";
import { makePickup, type Pickup } from "../entities/collectible";
import { makeHazard, type Hazard, type HazardKind } from "../entities/obstacle";

export type WorldStuff = {
  pickups: Pickup[];
  hazards: Hazard[];
  boosters: Booster[];
};

/** 每个主题段的生成参数表：密度、车道跨度、障碍配比。 */
export type SpawnTable = {
  id: ThemeId;
  /** 实体只落在 ±laneSpread 车道内，洞穴段用它收窄威胁面 */
  laneSpread: number;
  pickupGap: number;
  hazardGap: number;
  hazardDensity: number;
  gemChance: number;
  ringChance: number;
  /** 金币变成三连斜弧的概率 */
  arcChance: number;
  boosterChance: number;
  /** 长喷流加速带的占比（在已生成的加速带里） */
  longBoostChance: number;
  /** 障碍配比，按 tube / duck / vortex 权重归一 */
  mix: { tube: number; duck: number; vortex: number };
  /** 在同一 z 追加对侧障碍形成窄口的概率 */
  pinchChance: number;
};

export const SPAWN_TABLES: Record<ThemeId, SpawnTable> = {
  tropical: {
    id: "tropical",
    laneSpread: 2,
    pickupGap: GEN.coinGap,
    hazardGap: GEN.obstacleGap,
    hazardDensity: 0.52,
    gemChance: 0.08,
    ringChance: 0.06,
    arcChance: 0.18,
    boosterChance: 0.2,
    longBoostChance: 0,
    mix: { tube: 0.5, duck: 0.35, vortex: 0.15 },
    pinchChance: 0,
  },
  cave: {
    id: "cave",
    laneSpread: 1,
    pickupGap: GEN.coinGap * 0.92,
    hazardGap: GEN.obstacleGap * 0.86,
    hazardDensity: 0.6,
    gemChance: 0.11,
    ringChance: 0.08,
    arcChance: 0.24,
    boosterChance: 0.13,
    longBoostChance: 0,
    mix: { tube: 0.34, duck: 0.2, vortex: 0.46 },
    pinchChance: 0.3,
  },
  volcano: {
    id: "volcano",
    laneSpread: 2,
    pickupGap: GEN.coinGap * 1.06,
    hazardGap: GEN.obstacleGap * 1.02,
    hazardDensity: 0.56,
    gemChance: 0.09,
    ringChance: 0.05,
    arcChance: 0.16,
    boosterChance: 0.38,
    longBoostChance: 0.55,
    mix: { tube: 0.6, duck: 0.28, vortex: 0.12 },
    pinchChance: 0.08,
  },
  neon: {
    id: "neon",
    laneSpread: 2,
    pickupGap: GEN.coinGap * 0.78,
    hazardGap: GEN.obstacleGap * 0.74,
    hazardDensity: 0.7,
    gemChance: 0.12,
    ringChance: 0.09,
    arcChance: 0.3,
    boosterChance: 0.24,
    longBoostChance: 0.2,
    mix: { tube: 0.44, duck: 0.3, vortex: 0.26 },
    pinchChance: 0.16,
  },
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function clampLane(lane: number, spread: number): number {
  return Math.max(-spread, Math.min(spread, lane));
}

function rollLane(rand: () => number, spread: number): number {
  const span = spread * 2 + 1;
  return Math.floor(rand() * span) - spread;
}

function rollKind(roll: number, mix: SpawnTable["mix"]): HazardKind {
  const total = mix.tube + mix.duck + mix.vortex;
  const r = roll * total;
  if (r < mix.tube) return "tube";
  if (r < mix.tube + mix.duck) return "duck";
  return "vortex";
}

/** 按世界 z 取当前主题段的生成表。 */
export function spawnTableAt(z: number): SpawnTable {
  return SPAWN_TABLES[THEME_ORDER[themeIndex(z)] ?? "tropical"];
}

export function generateWorld(runId: number): WorldStuff {
  const rand = rng(0x51ed ^ runId);
  const pickups: Pickup[] = [];
  const hazards: Hazard[] = [];
  const boosters: Booster[] = [];
  const end = GEN.horizon * 3;

  for (let z = 220; z < end; ) {
    const t = spawnTableAt(z);
    const lane = rollLane(rand, t.laneSpread);
    const roll = rand();
    if (roll < t.gemChance) {
      pickups.push(makePickup("gem", lane, z));
    } else if (roll < t.gemChance + t.ringChance) {
      pickups.push(makePickup("ring", lane, z + 30));
    } else {
      pickups.push(makePickup("coin", lane, z));
      if (rand() < t.arcChance) {
        const dir = rand() < 0.5 ? -1 : 1;
        pickups.push(makePickup("coin", clampLane(lane + dir, t.laneSpread), z + t.pickupGap * 0.34));
        pickups.push(
          makePickup("coin", clampLane(lane + dir * 2, t.laneSpread), z + t.pickupGap * 0.68),
        );
      }
    }
    z += t.pickupGap;
  }

  for (let z = 380; z < end; ) {
    const t = spawnTableAt(z);
    const density = Math.min(0.92, t.hazardDensity + Math.min(0.3, z / 9000));
    if (rand() <= density) {
      const lane = rollLane(rand, t.laneSpread);
      const kind = rollKind(rand(), t.mix);
      hazards.push(makeHazard(kind, lane, z));

      // 窄口：对侧再补一个，但永远留出至少一条可过车道
      if (rand() < t.pinchChance) {
        const other = clampLane(lane >= 0 ? lane - 2 : lane + 2, t.laneSpread);
        if (other !== lane) hazards.push(makeHazard("tube", other, z + 14));
      }

      if (rand() < t.boosterChance) {
        const escape = clampLane(lane + (lane > 0 ? -1 : 1), t.laneSpread);
        const tier = rand() < t.longBoostChance ? 2 : 1;
        boosters.push(makeBooster(escape, z + 70, tier));
      }
    }
    z += t.hazardGap;
  }

  return { pickups, hazards, boosters };
}

export function themeIndex(distance: number): number {
  return Math.min(THEME_ORDER.length - 1, Math.floor(distance / GEN.segmentLen));
}
