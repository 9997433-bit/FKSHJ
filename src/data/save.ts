import { SAVE_KEY } from "./constants";

export type SaveData = {
  hiScore: number;
  hiDistance: number;
  /** 上一局结束时间戳（ms），0 表示还没玩过 */
  lastRunAt: number;
  runs: number;
  totalCoins: number;
};

const empty = (): SaveData => ({
  hiScore: 0,
  hiDistance: 0,
  lastRunAt: 0,
  runs: 0,
  totalCoins: 0,
});

/** 无 localStorage 的环境（SSR / 测试 / 隐私模式）下退化为不存档。 */
function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function loadSave(): SaveData {
  const store = storage();
  if (!store) return empty();
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      hiScore: num(parsed.hiScore),
      hiDistance: num(parsed.hiDistance),
      lastRunAt: num(parsed.lastRunAt),
      runs: num(parsed.runs),
      totalCoins: num(parsed.totalCoins),
    };
  } catch {
    return empty();
  }
}

export function writeSave(next: SaveData): void {
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

export function commitRun(score: number, distance: number, coins = 0): SaveData {
  const prev = loadSave();
  const merged: SaveData = {
    hiScore: Math.max(prev.hiScore, Math.floor(score)),
    hiDistance: Math.max(prev.hiDistance, Math.floor(distance)),
    lastRunAt: Date.now(),
    runs: prev.runs + 1,
    totalCoins: prev.totalCoins + Math.max(0, Math.floor(coins)),
  };
  writeSave(merged);
  return merged;
}
