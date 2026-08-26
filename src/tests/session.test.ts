import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { SAVE_KEY, SCORE } from "../data/constants";
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

const silentSfx = {
  boost: () => {},
  coin: () => {},
  gem: () => {},
  ring: () => {},
  hit: () => {},
  jump: () => {},
} as unknown as Sfx;

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
    assert.equal(result.fallen, false);
    const saved = loadSave();
    assert.equal(saved.hiScore, Math.floor(session.score));
    assert.equal(saved.hiDistance, Math.floor(session.distance));
    assert.equal(saved.totalCoins, session.coins);
    assert.equal(saved.runs, 1);
    assert.ok(saved.lastRunAt > 0);
  });

  it("marks a new record only when the score beats the previous high score", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ hiScore: 500, hiDistance: 1000, lastRunAt: 1, runs: 2, totalCoins: 7 }),
    );

    for (const score of [499, 500]) {
      const session = new Session(silentSfx, score);
      session.score = score;
      const result = session.result();
      assert.equal(result.isNew, false);
      assert.equal(result.hiScore, 500);
    }

    const winner = new Session(silentSfx, 501);
    winner.score = 501;
    const result = winner.result();
    assert.equal(result.isNew, true);
    assert.equal(result.hiScore, 501);
  });

  it("reports a washout separately from a deflated tube", () => {
    const washed = new Session(silentSfx, 7);
    washed.player.fallen = true;
    washed.player.hp = 0;
    assert.equal(washed.result().fallen, true);

    const popped = new Session(silentSfx, 8);
    popped.player.hp = 0;
    assert.equal(popped.result().fallen, false);
  });
});
