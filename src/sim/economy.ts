import {
  CREW as CREW_TABLE,
  PRODUCTION as PRODUCTION_TABLE,
  REPAIR as REPAIR_TABLE,
  STARVE as STARVE_TABLE,
  UPKEEP as UPKEEP_TABLE,
} from "../data/constants";
import { BUILDINGS, RESOURCE_IDS, gain, gainAll, pay, repairCell } from "./rules";
import type { BuildingId, Cell, Cost, Raft, Resources } from "./rules";

/**
 * 产消层：建筑产出、岛民吃喝、断粮计时。
 *
 * 契约：
 * - 每个产出建筑自带 timer，攒满 intervalS 就吐一次货。用「攒够就结算，
 *   余数留下」而不是「每帧加一点」，是为了让 HUD 能显示离下次产出还差多少，
 *   也避免小数资源。
 * - 淡水/食物是连续消耗的，可以吃到 0；吃到 0 且这一帧没吃饱就开始记
 *   断粮时间，喂饱了按两倍速回落。断粮满 STARVE.limitS 结算。
 * - 本文件不判定「游戏结束」，只把 starved 抛出去，由 session 决定切场景。
 *
 * 数值来源：PRODUCTION / CREW / UPKEEP / REPAIR / STARVE 全部 import 自
 * `data/constants.ts`，本文件不再留副本。效率曲线 efficiencyOf（残血
 * 50%–100%）和维修优先级里那个 core 加权 0.25 constants 没有，仍在本地。
 */

export type Production = {
  /** 出货间隔（秒，满血状态下） */
  readonly intervalS: number;
  readonly out: Cost;
};

/** = constants PRODUCTION（collector 5s、purifier / fish 3s 各出一次整数货） */
export const PRODUCTION: Partial<Record<BuildingId, Production>> = PRODUCTION_TABLE;

/**
 * = constants CREW。base 是开局就有的嘴，
 * perBuilding 是每盖一座非地基建筑多来的那个岛民（也多一张嘴）。
 */
export const CREW = CREW_TABLE;

/** 每个岛民每秒的消耗 = constants UPKEEP */
export const UPKEEP = UPKEEP_TABLE;

/**
 * 岛民自己会修房子：定期挑最残的一格，花木板补一点血（= constants REPAIR）。
 * 没有这条，木筏被风暴啃过就只会单调地烂下去，捞木板也失去意义。
 */
export const REPAIR = REPAIR_TABLE;

/** = constants STARVE：断粮上限、喂饱后的回落倍率、HUD 报警阈值 */
export const STARVE = STARVE_TABLE;

export type EconomyState = {
  /** 断粮累计秒数 */
  starve: number;
  /** 维修节拍计时器 */
  repairT: number;
  /** 上一帧是否在挨饿（渲染层用来做红屏抖动） */
  starving: boolean;
  /** 累计存活时长，用于难度曲线与结算 */
  elapsed: number;
  /** 本帧产出，给飘字特效 */
  lastOut: Cost;
};

export type EconomyTick = {
  readonly crew: number;
  readonly out: Cost;
  /** 淡水和食物是否都喂饱了 */
  readonly starving: boolean;
  /** 这一帧刚刚跨过断粮上限（只会为 true 一次） */
  readonly starved: boolean;
  /** 断粮进度 0–1 */
  readonly starveRatio: number;
  /** 本帧修好的格子（给叮叮当当的特效），没修就是 null */
  readonly repaired: Cell | null;
};

export function createEconomy(): EconomyState {
  return { starve: 0, repairT: 0, starving: false, elapsed: 0, lastOut: {} };
}

/** 血量影响效率：残血建筑出货慢，满血正好 1 */
export function efficiencyOf(cell: Cell): number {
  if (cell.hp <= 0) return 0;
  return 0.5 + 0.5 * Math.min(1, cell.hp / cell.maxHp);
}

/** 当前岛民数 = 基础人口 + 干活的建筑 */
export function crewOf(raft: Raft): number {
  let workers = 0;
  for (const c of raft.cells.values()) {
    if (c.id !== "floor" && c.id !== "core" && c.hp > 0) workers++;
  }
  return CREW.base + workers * CREW.perBuilding;
}

/** 满血理论产能（每秒），HUD 画收支用 */
export function supplyRates(raft: Raft): Cost {
  const rates: Cost = {};
  for (const cell of raft.cells.values()) {
    const prod = PRODUCTION[cell.id];
    if (!prod || cell.hp <= 0) continue;
    const eff = efficiencyOf(cell);
    for (const id of RESOURCE_IDS) {
      const n = prod.out[id] ?? 0;
      if (n > 0) rates[id] = (rates[id] ?? 0) + (n / prod.intervalS) * eff;
    }
  }
  return rates;
}

/** 淡水/食物净收支（每秒，可为负），负数就是在坐吃山空 */
export function netRates(raft: Raft): { water: number; food: number } {
  const supply = supplyRates(raft);
  const crew = crewOf(raft);
  return {
    water: (supply.water ?? 0) - crew * UPKEEP.water,
    food: (supply.food ?? 0) - crew * UPKEEP.food,
  };
}

/** 离下一次出货还差多少（0–1），给格子上的小进度环 */
export function progressOf(cell: Cell): number {
  const prod = PRODUCTION[cell.id];
  if (!prod) return 0;
  return Math.max(0, Math.min(1, cell.timer / prod.intervalS));
}

/**
 * 推进一帧产消。
 * 只有 playing 场景该调用；paused 不调用即可自然冻结。
 */
export function updateEconomy(state: EconomyState, raft: Raft, res: Resources, dt: number): EconomyTick {
  const crew = crewOf(raft);
  if (dt <= 0) {
    return {
      crew,
      out: {},
      starving: state.starving,
      starved: false,
      starveRatio: state.starve / STARVE.limitS,
      repaired: null,
    };
  }
  state.elapsed += dt;

  const out: Cost = {};
  // 直接迭代 map：60fps 下别每帧再建一个数组
  for (const cell of raft.cells.values()) {
    const prod = PRODUCTION[cell.id];
    if (!prod || cell.hp <= 0) continue;
    cell.timer += dt * efficiencyOf(cell);
    while (cell.timer >= prod.intervalS) {
      cell.timer -= prod.intervalS;
      for (const id of RESOURCE_IDS) {
        const n = prod.out[id] ?? 0;
        if (n > 0) out[id] = (out[id] ?? 0) + n;
      }
    }
  }
  gainAll(res, out);
  state.lastOut = out;

  let repaired: Cell | null = null;
  state.repairT += dt;
  if (state.repairT >= REPAIR.intervalS) {
    state.repairT -= REPAIR.intervalS;
    const hurt = mostDamaged(raft);
    if (hurt && pay(res, REPAIR.cost)) {
      repairCell(hurt, REPAIR.hp);
      repaired = hurt;
    }
  }

  const wantWater = crew * UPKEEP.water * dt;
  const wantFood = crew * UPKEEP.food * dt;
  const gotWater = Math.min(res.water, wantWater);
  const gotFood = Math.min(res.food, wantFood);
  res.water = Math.max(0, res.water - wantWater);
  res.food = Math.max(0, res.food - wantFood);

  // 差一点点也算断粮：只要没足额供上，计时器就往上走
  const starving = gotWater + 1e-9 < wantWater || gotFood + 1e-9 < wantFood;
  const before = state.starve;
  state.starve = starving
    ? Math.min(STARVE.limitS, before + dt)
    : Math.max(0, before - dt * STARVE.recoverMul);
  state.starving = starving;

  const starved = before < STARVE.limitS && state.starve >= STARVE.limitS;
  return { crew, out, starving, starved, starveRatio: state.starve / STARVE.limitS, repaired };
}

/** 血量比例最低的一格（满血的不算）；指挥中心优先级最高 */
export function mostDamaged(raft: Raft): Cell | undefined {
  let best: Cell | undefined;
  let bestRatio = 1;
  for (const cell of raft.cells.values()) {
    if (cell.hp <= 0 || cell.hp >= cell.maxHp) continue;
    const ratio = cell.hp / cell.maxHp - (cell.id === "core" ? 0.25 : 0);
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = cell;
    }
  }
  return best;
}

/** 捞到一件漂浮物入库，返回实际入库量（仓库满了会小于 amount） */
export function collect(res: Resources, id: keyof Resources, amount: number): number {
  return gain(res, id, amount);
}

/** 拆一座建筑退一半材料（风暴拆房和玩家回收共用） */
export function scrapValue(id: BuildingId, ratio = 0.5): Cost {
  const cost = BUILDINGS[id].cost;
  const back: Cost = {};
  for (const key of RESOURCE_IDS) {
    const n = cost[key] ?? 0;
    if (n > 0) back[key] = Math.floor(n * ratio);
  }
  return back;
}

export function resetEconomy(state: EconomyState): void {
  state.starve = 0;
  state.repairT = 0;
  state.starving = false;
  state.elapsed = 0;
  state.lastOut = {};
}
