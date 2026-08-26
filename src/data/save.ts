import { SAVE_KEY } from "./constants";

export type SaveData = {
  hiScore: number;
  hiDistance: number;
};

const empty = (): SaveData => ({ hiScore: 0, hiDistance: 0 });

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      hiScore: Number(parsed.hiScore) || 0,
      hiDistance: Number(parsed.hiDistance) || 0,
    };
  } catch {
    return empty();
  }
}

export function writeSave(next: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(next));
}

export function commitRun(score: number, distance: number): SaveData {
  const prev = loadSave();
  const merged: SaveData = {
    hiScore: Math.max(prev.hiScore, Math.floor(score)),
    hiDistance: Math.max(prev.hiDistance, Math.floor(distance)),
  };
  writeSave(merged);
  return merged;
}
