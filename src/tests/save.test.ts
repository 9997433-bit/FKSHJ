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

    assert.deepEqual(commitRun(950.9, 1100.8), {
      hiScore: 950,
      hiDistance: 1200,
    });
    assert.deepEqual(commitRun(800.2, 1300.7), {
      hiScore: 950,
      hiDistance: 1300,
    });
    assert.deepEqual(loadSave(), {
      hiScore: 950,
      hiDistance: 1300,
    });
  });
});
