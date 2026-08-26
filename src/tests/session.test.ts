import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { SCORE } from "../data/constants";
import { loadSave } from "../data/save";
import { makePickup } from "../entities/collectible";
import type { Sfx } from "../fx/audio";
import { Session } from "../session";

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

describe("Session scoring", () => {
  beforeEach(() => localStorage.clear());

  it("scores canned updates and pickups without a DOM", () => {
    const sounds: string[] = [];
    const sfx = {
      boost: () => sounds.push("boost"),
      coin: () => sounds.push("coin"),
      gem: () => sounds.push("gem"),
      ring: () => sounds.push("ring"),
      hit: () => sounds.push("hit"),
      jump: () => sounds.push("jump"),
    } as unknown as Sfx;
    const session = new Session(sfx, 123);
    session.world = {
      pickups: [makePickup("coin", 0, 80), makePickup("gem", 0, 110)],
      hazards: [],
      boosters: [],
    };

    const inputs: Array<[dt: number, steer: -1 | 0 | 1, jump: boolean]> = [
      [0.1, 0, false],
      [0.1, 1, true],
      [0.2, -1, false],
    ];
    for (const input of inputs) session.update(...input);

    const pickupScore = SCORE.coin + SCORE.gem + 24;
    assert.equal(session.coins, 1);
    assert.equal(session.combo, 4);
    assert.deepEqual(sounds, ["coin", "gem", "jump"]);
    assert.ok(Math.abs(session.score - (session.distance * SCORE.distMul + pickupScore)) < 1e-9);

    const result = session.result();
    assert.equal(result.hiScore, Math.floor(session.score));
    assert.equal(result.isNew, true);
    const saved = loadSave();
    assert.equal(saved.hiScore, Math.floor(session.score));
    assert.equal(saved.hiDistance, Math.floor(session.distance));
    assert.equal(saved.totalCoins, session.coins);
    assert.equal(saved.runs, 1);
    assert.ok(saved.lastRunAt > 0);
  });
});
