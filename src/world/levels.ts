import { GEN, THEME_ORDER, type ThemeId } from "../data/constants";
import { makeBooster, type Booster } from "../entities/booster";
import { makePickup, type Pickup } from "../entities/collectible";
import { makeHazard, type Hazard, type HazardKind } from "../entities/obstacle";
import { mixThemes, THEME_BLEND, THEMES, themeAt, type ThemePaint } from "../ui/theme";

/**
 * 流式生成游标：`generateAhead` 续生所需的全部状态。
 *
 * 拾取物与障碍各用一条独立的 LCG 流，所以「先生成一大段」与
 * 「分很多小块追加」得到完全相同的世界——追加永远不会挪动已生成的骰子。
 */
export type GenCursor = {
  seed: number;
  /** 两条流的实时 LCG 状态 */
  pickState: number;
  hazState: number;
  /** 下一行拾取物 / 障碍将落在的世界 z */
  pickZ: number;
  hazZ: number;
  /** 该 z 之前的内容都已生成 */
  filledTo: number;
};

export type WorldStuff = {
  pickups: Pickup[];
  hazards: Hazard[];
  boosters: Booster[];
  /** 手工拼装的世界（单测）没有游标，它们只是永远不再生长。 */
  gen?: GenCursor;
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

/** 相机前方始终保持已生成的纵深（世界单位）。 */
export const STREAM_AHEAD = GEN.horizon * 3;

/** 第一枚拾取物 / 第一个障碍的世界 z：开局先给玩家一小段空水道。 */
const FIRST_PICKUP_Z = 220;
const FIRST_HAZARD_Z = 380;

const PICK_SALT = 0x51ed;
const HAZ_SALT = 0x2f9e;

/** 可持久化的 LCG：状态是一个 32 位整数，随游标一起存进世界里。 */
type Rng = { s: number };

function nextRand(r: Rng): number {
  r.s = (r.s * 1664525 + 1013904223) >>> 0;
  return r.s / 0xffffffff;
}

/** 先走一轮 LCG，避免相邻 runId 的两条流从相邻数值起步。 */
function seedStream(seed: number, salt: number): number {
  return ((((seed ^ salt) >>> 0) * 1664525 + 1013904223) >>> 0);
}

/** 一天的毫秒数，`dateDay` 由此换算。 */
const DAY_MS = 86_400_000;

/** Unix 纪元以来的天数 —— GAME_SPEC §5 种子里的 `dateDay`。 */
export function dayNumber(atMs: number = Date.now()): number {
  return Math.floor(atMs / DAY_MS);
}

/**
 * 进程启动时取一次：同一个标签页 / 同一次探针跑批即使跨过午夜，
 * 世界种子的日期基准也保持不变，回放才可复现。
 */
const BOOT_DAY = dayNumber();

/** GAME_SPEC §5：`seed = dateDay ^ runId`。 */
export function seedWorld(runId: number, dateDay: number = BOOT_DAY): number {
  return (Math.trunc(dateDay) ^ Math.trunc(runId)) >>> 0;
}

function clampLane(lane: number, spread: number): number {
  return Math.max(-spread, Math.min(spread, lane));
}

function rollLane(rng: Rng, spread: number): number {
  const span = spread * 2 + 1;
  return Math.floor(nextRand(rng) * span) - spread;
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

function emitPickupRow(out: Pickup[], rng: Rng, z: number, t: SpawnTable): void {
  const lane = rollLane(rng, t.laneSpread);
  const roll = nextRand(rng);
  if (roll < t.gemChance) {
    out.push(makePickup("gem", lane, z));
    return;
  }
  if (roll < t.gemChance + t.ringChance) {
    out.push(makePickup("ring", lane, z + 30));
    return;
  }
  out.push(makePickup("coin", lane, z));
  if (nextRand(rng) < t.arcChance) {
    const dir = nextRand(rng) < 0.5 ? -1 : 1;
    out.push(makePickup("coin", clampLane(lane + dir, t.laneSpread), z + t.pickupGap * 0.34));
    out.push(makePickup("coin", clampLane(lane + dir * 2, t.laneSpread), z + t.pickupGap * 0.68));
  }
}

function emitHazardRow(
  hazards: Hazard[],
  boosters: Booster[],
  rng: Rng,
  z: number,
  t: SpawnTable,
): void {
  const density = Math.min(0.92, t.hazardDensity + Math.min(0.3, z / 9000));
  if (nextRand(rng) > density) return;

  const lane = rollLane(rng, t.laneSpread);
  const kind = rollKind(nextRand(rng), t.mix);
  hazards.push(makeHazard(kind, lane, z));

  // 窄口：对侧再补一个，但永远留出至少一条可过车道
  if (nextRand(rng) < t.pinchChance) {
    const other = clampLane(lane >= 0 ? lane - 2 : lane + 2, t.laneSpread);
    if (other !== lane) hazards.push(makeHazard("tube", other, z + 14));
  }

  if (nextRand(rng) < t.boosterChance) {
    const escape = clampLane(lane + (lane > 0 ? -1 : 1), t.laneSpread);
    const tier = nextRand(rng) < t.longBoostChance ? 2 : 1;
    boosters.push(makeBooster(escape, z + 70, tier));
  }
}

/**
 * 把世界续生到 `toZ`。每帧调用都安全：没有新内容时直接返回。
 *
 * 起点与种子都存在 `world.gen` 里，所以不需要 `fromZ` / `seed` 参数——
 * 少两个参数就少两种把生成器喂成不一致状态的方式。
 */
export function generateAhead(world: WorldStuff, toZ: number): WorldStuff {
  const g = world.gen;
  if (!g || !(toZ > g.filledTo)) return world;

  const pick: Rng = { s: g.pickState };
  while (g.pickZ < toZ) {
    const t = spawnTableAt(g.pickZ);
    emitPickupRow(world.pickups, pick, g.pickZ, t);
    g.pickZ += t.pickupGap;
  }
  g.pickState = pick.s;

  const haz: Rng = { s: g.hazState };
  while (g.hazZ < toZ) {
    const t = spawnTableAt(g.hazZ);
    emitHazardRow(world.hazards, world.boosters, haz, g.hazZ, t);
    g.hazZ += t.hazardGap;
  }
  g.hazState = haz.s;

  g.filledTo = toZ;
  return world;
}

/**
 * 开一个新世界并预生成 `aheadTo` 之前的内容。
 * 同一个 seed 永远得到同一个世界，与之后怎么分块续生无关。
 */
export function generateWorld(seed: number, aheadTo: number = STREAM_AHEAD): WorldStuff {
  const world: WorldStuff = {
    pickups: [],
    hazards: [],
    boosters: [],
    gen: {
      seed: seed >>> 0,
      pickState: seedStream(seed, PICK_SALT),
      hazState: seedStream(seed, HAZ_SALT),
      pickZ: FIRST_PICKUP_Z,
      hazZ: FIRST_HAZARD_Z,
      filledTo: 0,
    },
  };
  return generateAhead(world, aheadTo);
}

/**
 * 距离 → 主题段序号。**循环**取模，跑得再远也会从热带港重新来一轮，
 * 而不是永远卡在霓虹夜（GAME_SPEC §5「流式拼接」）。
 */
export function themeIndex(distance: number): number {
  const seg = Math.floor(Math.max(0, distance) / GEN.segmentLen);
  return seg % THEME_ORDER.length;
}

/** 一整轮四个主题段的长度（世界单位）。 */
export const THEME_CYCLE = GEN.segmentLen * THEME_ORDER.length;

/**
 * 循环版的距离 → 配色。
 *
 * `ui/theme.ts` 的 `themeAt` 没有「圈数」概念，最后一段会一直钳在霓虹夜；
 * 这里把距离折回一圈之内交给它上色，再自己把末段平滑混回热带港，
 * 于是圈与圈之间也是渐变而不是硬切。
 */
export function themeCycleAt(distance: number, blend: number = THEME_BLEND): ThemePaint {
  const local = ((distance % THEME_CYCLE) + THEME_CYCLE) % THEME_CYCLE;
  const cur = themeAt(local, blend);
  if (blend <= 0) return cur;
  const intoLast = local - (THEME_CYCLE - GEN.segmentLen);
  const wrapAt = GEN.segmentLen - blend;
  if (intoLast <= wrapAt) return cur;
  const t = (intoLast - wrapAt) / blend;
  return mixThemes(cur, THEMES[THEME_ORDER[0]], t * t * (3 - 2 * t));
}
