/**
 * 存档 —— localStorage 里的一小块生涯记录。
 *
 * 一局的成绩只有一个数：**撑过了几天**（`elapsed / DAY.lengthS`）。
 * 其余字段是跨局累计，用来给标题页写一行「你最好撑到第 N 天」。
 *
 * 键是 `SAVE_KEY`（`cww_sea_v1`，定义在 data/constants.ts）。
 * 没有 localStorage 的环境（SSR / 单测 / 隐私模式）全部降级为不存档：
 * 读返回空档、写静默失败，游戏照常跑。
 *
 * **键不许换。** 字段只能加、不能改语义：`loadSave` 逐字段兜底，
 * 旧档缺了新字段读出来是零值 / 空表；旧版本读到新档也只是忽略多出来的键。
 * 换了 `SAVE_KEY` 就等于把所有人的纪录清零。
 */

import { SAVE_KEY } from "./constants";

/** 图鉴最多记多少件。够一整本目录，又不至于让存档无限长。 */
const SEEN_CAP = 240;

export type SeaSave = {
  /** 历史最长存活天数 */
  bestDay: number;
  /** 累计开局数 */
  runs: number;
  /** 上一局结束时间戳（ms），0 表示还没玩过 */
  lastRunAt: number;
  /** 生涯累计捞到的漂浮物件数 */
  totalSalvage: number;
  /**
   * 图鉴：这台机器上见过的物品 id（去重、排序）。
   *
   * 跨局累计，`data/catalog.ts` 的目录页据此决定哪一格还是「未鉴定」。
   * 旧档没有这个字段，读出来是空表——不是错误，只是还没捞过东西。
   */
  seen: string[];
};

/** `commitRun` 的返回：合并后的存档 + 这一局是不是破了纪录。 */
export type SeaRunSummary = SeaSave & { isBest: boolean };

const empty = (): SeaSave => ({ bestDay: 0, runs: 0, lastRunAt: 0, totalSalvage: 0, seen: [] });

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

/**
 * 物品 id 表的清洗：只留非空字符串、去重、排序、砍到 `SEEN_CAP`。
 *
 * 手改过的存档、旧版本写进去的数字、乱七八糟的 null 都在这里被滤掉——
 * 图鉴宁可少一格，也不能让一条脏数据把整个存档读崩。
 */
function ids(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const id = raw.trim().slice(0, 40);
    if (id) out.add(id);
    if (out.size >= SEEN_CAP) break;
  }
  return [...out].sort();
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
      seen: ids(parsed.seen),
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

/** 图鉴里已解锁的物品 id（去重、排序）。 */
export function seenItems(): string[] {
  return loadSave().seen;
}

/** 这件东西捞到过吗。目录页拿它决定画本体还是画「未鉴定」。 */
export function hasSeen(id: string): boolean {
  return loadSave().seen.includes(id);
}

/**
 * 记一笔「见过了」，返回合并后的存档。
 *
 * 幂等：已经在表里的 id 不会重复写盘（连 `setItem` 都省了），
 * 所以每捞一件就调一次也不会把 localStorage 打爆。
 */
export function markSeen(id: string | Iterable<string>): SeaSave {
  const prev = loadSave();
  const merged = ids([...prev.seen, ...(typeof id === "string" ? [id] : id)]);
  if (merged.length === prev.seen.length && merged.every((v, i) => v === prev.seen[i])) return prev;
  const next: SeaSave = { ...prev, seen: merged };
  writeSave(next);
  return next;
}

/**
 * 结算一局：天数取历史最大，局数与捞取数累加，这一局见过的东西并进图鉴。
 *
 * `isBest` 在写盘**之前**比较，所以同一局被重复结算也不会把
 * 「新纪录」标记吞掉——第二次调用只是又加了一局计数。
 *
 * `seen` 可以不给：老调用点 `commitRun(day, salvage)` 行为一字未变。
 */
export function commitRun(day: number, salvage = 0, seen?: Iterable<string>): SeaRunSummary {
  const prev = loadSave();
  const reached = Math.max(0, Math.floor(day));
  const merged: SeaSave = {
    bestDay: Math.max(prev.bestDay, reached),
    runs: prev.runs + 1,
    lastRunAt: Date.now(),
    totalSalvage: prev.totalSalvage + Math.max(0, Math.floor(salvage)),
    seen: seen ? ids([...prev.seen, ...seen]) : prev.seen,
  };
  writeSave(merged);
  return { ...merged, isBest: reached > prev.bestDay };
}
