import { STORM as STORM_TABLE, TURRET as TURRET_TABLE, WAVE as WAVE_TABLE } from "../data/constants";
import { PIRATE, createPirate, damagePirate, stepPirate } from "../entities/pirate";
import type { Pirate } from "../entities/pirate";
import { RAFT_ORIGIN, damageCell, gain, nearestCell, outerCells, tileCenter } from "./rules";
import type { BuildingId, Raft, Resources, Rng, TilePos } from "./rules";

/**
 * 威胁层：风暴打外圈、海盗靠近、炮塔还击。
 *
 * 契约：
 * - 全部随机走传入的 Rng，不碰 Math.random，单测可复现。
 * - 只产生事件，不切场景、不放音效：updateThreats 返回事件数组，
 *   由 session 决定结算、由 fx/audio 决定表现。
 * - 风暴先预警再落雷（STORM.warnS 秒），玩家有时间把船开回来；
 *   目标在预警开始时就选好并抛出去，HUD 才能提前把那几格标红。
 * - 炮塔的射击节奏借用 cell.timer——炮塔不在 PRODUCTION 表里，
 *   economy 不会碰它的 timer，两边互不打架。
 *
 * 数值来源：STORM / WAVE / TURRET 全部 import 自 `data/constants.ts`。
 * constants 没有的调度细节仍写死在本文件：波内人数 min(6, 1 + ⌊波数/2⌋)、
 * 同波方位散布 0.35 rad、出生半径抖动 ±8%。
 */

/** = constants STORM：太平期、预警时长、单格伤害与落点数上限 */
export const STORM = STORM_TABLE;

/** = constants WAVE：首波时间、波间隔衰减、出生半径与同屏上限 */
export const WAVE = WAVE_TABLE;

/** = constants TURRET：射程 5 格、单发 9 伤、0.5s 一发 */
export const TURRET = TURRET_TABLE;

/** 炮塔理论 DPS，HUD/平衡表用 */
export const TURRET_DPS = TURRET.damage / TURRET.shotIntervalS;

export type StormPhase = "calm" | "warn";

export type ThreatState = {
  elapsed: number;
  storm: {
    phase: StormPhase;
    /** 当前阶段的剩余秒数 */
    t: number;
    /** 下一次太平期长度 */
    gap: number;
    /** 预警中已选定的落点 */
    targets: TilePos[];
    /** 已经刮过几场 */
    count: number;
  };
  wave: number;
  waveT: number;
  waveGap: number;
  pirates: Pirate[];
};

export type ThreatEvent =
  | { readonly type: "storm-warn"; readonly targets: readonly TilePos[]; readonly seconds: number }
  | { readonly type: "storm-strike"; readonly targets: readonly TilePos[]; readonly damage: number }
  | {
      readonly type: "cell-lost";
      readonly gx: number;
      readonly gy: number;
      readonly building: BuildingId;
      readonly cause: "storm" | "pirate";
    }
  | { readonly type: "wave"; readonly wave: number; readonly count: number }
  | { readonly type: "turret-fire"; readonly x: number; readonly y: number; readonly tx: number; readonly ty: number }
  | { readonly type: "pirate-killed"; readonly x: number; readonly y: number; readonly wave: number }
  | { readonly type: "core-hit"; readonly damage: number; readonly hp: number }
  | { readonly type: "core-down" };

export function createThreats(): ThreatState {
  return {
    elapsed: 0,
    storm: { phase: "calm", t: STORM.firstS, gap: STORM.gapS, targets: [], count: 0 },
    wave: 0,
    waveT: WAVE.firstS,
    waveGap: WAVE.gapS,
    pirates: [],
  };
}

export function resetThreats(state: ThreatState): void {
  const fresh = createThreats();
  state.elapsed = fresh.elapsed;
  state.storm = fresh.storm;
  state.wave = fresh.wave;
  state.waveT = fresh.waveT;
  state.waveGap = fresh.waveGap;
  state.pirates.length = 0;
}

/** 预警进度 0–1；不在预警期为 0。HUD 拿它做闪电条 */
export function stormWarnRatio(state: ThreatState): number {
  if (state.storm.phase !== "warn") return 0;
  return 1 - Math.max(0, Math.min(1, state.storm.t / STORM.warnS));
}

/** 距离下一场风暴还有几秒（预警期返回预警剩余） */
export function secondsToStorm(state: ThreatState): number {
  return Math.max(0, state.storm.t);
}

function stormTargetCount(elapsed: number): number {
  return Math.min(STORM.maxTargets, 1 + Math.floor(elapsed / STORM.extraEveryS));
}

/** 挑外圈格子当落点；实在只剩指挥中心了才打它 */
function chooseStormTargets(raft: Raft, count: number, rng: Rng): TilePos[] {
  const ring = outerCells(raft);
  const pool = ring.filter((c) => c.id !== "core");
  const usable = pool.length > 0 ? pool : ring;
  const picked: TilePos[] = [];
  const bag = [...usable];
  for (let i = 0; i < count && bag.length > 0; i++) {
    const idx = Math.min(bag.length - 1, Math.floor(rng() * bag.length));
    const [cell] = bag.splice(idx, 1);
    picked.push({ gx: cell.gx, gy: cell.gy });
  }
  return picked;
}

function spawnWave(state: ThreatState, rng: Rng): number {
  state.wave += 1;
  const want = Math.min(6, 1 + Math.floor(state.wave / 2));
  const room = Math.max(0, WAVE.maxAlive - state.pirates.length);
  const count = Math.min(want, room);
  const base = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    // 同一波从相近方位来，玩家能靠一侧炮塔守住；不是均匀铺满一圈
    const a = base + (i - (count - 1) / 2) * 0.35 + (rng() - 0.5) * 0.18;
    const r = WAVE.spawnRadius * (0.92 + rng() * 0.16);
    state.pirates.push(
      createPirate(RAFT_ORIGIN.x + Math.cos(a) * r, RAFT_ORIGIN.y + Math.sin(a) * r, state.wave),
    );
  }
  return count;
}

/**
 * 推进一帧威胁。
 * @param res 海盗被打死会掉金属，所以要能入库
 * @returns 本帧事件（顺序即发生顺序）
 */
export function updateThreats(
  state: ThreatState,
  raft: Raft,
  res: Resources,
  dt: number,
  rng: Rng,
): ThreatEvent[] {
  const events: ThreatEvent[] = [];
  if (dt <= 0) return events;
  state.elapsed += dt;

  // ── 风暴 ──
  const storm = state.storm;
  storm.t -= dt;
  if (storm.t <= 0) {
    if (storm.phase === "calm") {
      storm.targets = chooseStormTargets(raft, stormTargetCount(state.elapsed), rng);
      storm.phase = "warn";
      storm.t = STORM.warnS;
      events.push({ type: "storm-warn", targets: storm.targets, seconds: STORM.warnS });
    } else {
      const hit: TilePos[] = [];
      for (const t of storm.targets) {
        const cell = raft.cells.get(`${t.gx},${t.gy}`);
        if (!cell || cell.hp <= 0) continue; // 预警期间已经被海盗拆了
        hit.push(t);
        const building = cell.id;
        if (damageCell(raft, cell, STORM.damage)) {
          events.push({ type: "cell-lost", gx: t.gx, gy: t.gy, building, cause: "storm" });
          if (building === "core") events.push({ type: "core-down" });
        }
      }
      events.push({ type: "storm-strike", targets: hit, damage: STORM.damage });
      storm.count += 1;
      storm.targets = [];
      storm.phase = "calm";
      storm.gap = Math.max(STORM.gapMinS, storm.gap - STORM.gapDecayS);
      storm.t = storm.gap;
    }
  }

  // ── 海盗来袭 ──
  state.waveT -= dt;
  if (state.waveT <= 0) {
    const count = spawnWave(state, rng);
    state.waveGap = Math.max(WAVE.gapMinS, state.waveGap - WAVE.gapDecayS);
    state.waveT = state.waveGap;
    if (count > 0) events.push({ type: "wave", wave: state.wave, count });
  }

  // ── 海盗行动 ──
  for (const p of state.pirates) {
    if (p.hp <= 0) continue;
    const target = nearestCell(raft, p.x, p.y) ?? raft.core;
    const at = tileCenter(target.gx, target.gy);
    const arrived = stepPirate(p, at, dt);
    if (!arrived || target.hp <= 0) continue;
    const dmg = PIRATE.dps * dt;
    const building = target.id;
    const destroyed = damageCell(raft, target, dmg);
    if (building === "core") {
      events.push({ type: "core-hit", damage: dmg, hp: raft.core.hp });
    }
    if (destroyed) {
      events.push({ type: "cell-lost", gx: target.gx, gy: target.gy, building, cause: "pirate" });
      if (building === "core") events.push({ type: "core-down" });
    }
  }

  // ── 炮塔还击 ──
  let anyAlive = false;
  for (const p of state.pirates) if (p.hp > 0) { anyAlive = true; break; }
  if (anyAlive) {
    for (const cell of raft.cells.values()) {
      if (cell.id !== "turret" || cell.hp <= 0) continue;
      const muzzle = tileCenter(cell.gx, cell.gy);
      cell.timer = Math.min(cell.timer + dt, TURRET.shotIntervalS * 2);
      while (cell.timer >= TURRET.shotIntervalS) {
        const victim = nearestPirate(state.pirates, muzzle.x, muzzle.y, TURRET.range);
        if (!victim) break;
        cell.timer -= TURRET.shotIntervalS;
        events.push({ type: "turret-fire", x: muzzle.x, y: muzzle.y, tx: victim.x, ty: victim.y });
        if (damagePirate(victim, TURRET.damage)) {
          gain(res, "metal", PIRATE.dropMetal);
          events.push({ type: "pirate-killed", x: victim.x, y: victim.y, wave: state.wave });
        }
      }
      // 没目标时别把冷却攒成一梭子，留半发的手感
      if (cell.timer > TURRET.shotIntervalS) cell.timer = TURRET.shotIntervalS;
    }
  }

  if (state.pirates.some((p) => p.hp <= 0)) {
    state.pirates = state.pirates.filter((p) => p.hp > 0);
  }
  return events;
}

/** 半径内最近的活海盗 */
export function nearestPirate(pirates: readonly Pirate[], x: number, y: number, range: number): Pirate | undefined {
  let best: Pirate | undefined;
  let bestD = range * range;
  for (const p of pirates) {
    if (p.hp <= 0) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 小船是否被海盗撞上（撞了只做减速/特效，不掉血——死法只有断粮和拆家） */
export function pirateTouching(pirates: readonly Pirate[], x: number, y: number, radius: number): Pirate | undefined {
  for (const p of pirates) {
    if (p.hp <= 0) continue;
    const r = radius + PIRATE.radius;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) return p;
  }
  return undefined;
}
