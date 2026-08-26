import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { SAVE_KEY } from "../data/constants";
import { commitRun, loadSave } from "../data/save";

const values = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return values.size;
  },
  clear() {
    values.clear();
  },
  getItem(key) {
    return values.get(key) ?? null;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  removeItem(key) {
    values.delete(key);
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

describe("save data", () => {
  beforeEach(() => localStorage.clear());

  it("merges each run with the existing personal bests", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ hiScore: 900, hiDistance: 1200 }));

    const first = commitRun(950.9, 1100.8, 4);
    assert.equal(first.hiScore, 950);
    assert.equal(first.hiDistance, 1200);
    assert.equal(first.runs, 1);
    assert.equal(first.totalCoins, 4);
    assert.ok(first.lastRunAt > 0);

    const second = commitRun(800.2, 1300.7, 2);
    assert.equal(second.hiScore, 950);
    assert.equal(second.hiDistance, 1300);
    assert.equal(second.runs, 2);
    assert.equal(second.totalCoins, 6);

    const loaded = loadSave();
    assert.equal(loaded.hiScore, 950);
    assert.equal(loaded.hiDistance, 1300);
    assert.equal(loaded.runs, 2);
    assert.equal(loaded.totalCoins, 6);
  });
});
