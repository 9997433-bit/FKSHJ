/**
 * 存档 —— localStorage 里的一小块生涯记录。
 *
 * 一局的成绩只有一个数：**撑过了几天**（`elapsed / DAY.lengthS`）。
 * 其余字段是跨局累计，用来给标题页写一行「你最好撑到第 N 天」。
 *
 * 键是 `SAVE_KEY`（`cww_sea_v1`，定义在 data/constants.ts）。
 * 没有 localStorage 的环境（SSR / 单测 / 隐私模式）全部降级为不存档：
 * 读返回空档、写静默失败，游戏照常跑。
 */

import { SAVE_KEY } from "./constants";

export type SeaSave = {
  /** 历史最长存活天数 */
  bestDay: number;
  /** 累计开局数 */
  runs: number;
  /** 上一局结束时间戳（ms），0 表示还没玩过 */
  lastRunAt: number;
  /** 生涯累计捞到的漂浮物件数 */
  totalSalvage: number;
};

/** `commitRun` 的返回：合并后的存档 + 这一局是不是破了纪录。 */
export type SeaRunSummary = SeaSave & { isBest: boolean };

const empty = (): SeaSave => ({ bestDay: 0, runs: 0, lastRunAt: 0, totalSalvage: 0 });

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 存档里的每个字段都必须是有限非负数；坏数据一律归零而不是抛错。 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function loadSave(): SeaSave {
  const store = storage();
  if (!store) return empty();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<SeaSave>;
    return {
      bestDay: num(parsed.bestDay),
      runs: num(parsed.runs),
      lastRunAt: num(parsed.lastRunAt),
      totalSalvage: num(parsed.totalSalvage),
    };
  } catch {
    return empty();
  }
}

export function writeSave(next: SeaSave): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(next));
  } catch {
    // 配额或隐私模式：忽略写入失败，游戏继续
  }
}

export function clearSave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // 同上
  }
}

/** 最长存活天数；标题页直接读它。 */
export function bestDay(): number {
  return loadSave().bestDay;
}

/** 玩过几局。 */
export function runCount(): number {
  return loadSave().runs;
}

/**
 * 结算一局：天数取历史最大，局数与捞取数累加。
 *
 * `isBest` 在写盘**之前**比较，所以同一局被重复结算也不会把
 * 「新纪录」标记吞掉——第二次调用只是又加了一局计数。
 */
export function commitRun(day: number, salvage = 0): SeaRunSummary {
  const prev = loadSave();
  const reached = Math.max(0, Math.floor(day));
  const merged: SeaSave = {
    bestDay: Math.max(prev.bestDay, reached),
    runs: prev.runs + 1,
    lastRunAt: Date.now(),
    totalSalvage: prev.totalSalvage + Math.max(0, Math.floor(salvage)),
  };
  writeSave(merged);
  return { ...merged, isBest: reached > prev.bestDay };
}
